using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Lokad.TikZ;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Text;

internal static partial class ReferenceTool
{
    private static string InteractionRoot = "tests/Reference/NodeInteractions";
    private static string InteractionManifestPath => InteractionRoot + "/cases.json";
    private static string InteractionProfilePath => InteractionRoot + "/oracle-profile.json";
    private const string InteractionWrapperPath = "tools/TikzReference/node-interactions.tex";
    private const string RgbColorSetupPath = "tools/TikzReference/rgb-color-profile.tex";
    private static bool InteractionInkFraming;
    private static readonly string[] InteractionArtifacts = ["metrics.json", "reference.svg", "reference.pdf", "oracle.log",
        "native-positions.log", "pdf-page-1x.png", "pdf-page-4x.png"];

    private static async Task<int> NodeInteractions(string[] args)
    {
        var options = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var i = 1; i < args.Length; i += 2)
            if (i + 1 == args.Length || args[i] is not ("--case" or "--out" or "--profile" or "--framing") || !options.TryAdd(args[i][2..], args[i + 1]))
                throw new InvalidOperationException("Usage: TikzReference <generate-node-interactions|verify-node-interactions|compare-node-interactions|calibrate-node-interaction-pdf|calibrate-node-interaction-framing|calibrate-node-interaction-svg> [--profile native|rgb] [--case id] [--out artifacts/...] [comparison/SVG calibration: --framing driver|ink].");
        if (args[0] == "generate-node-interactions" && options.ContainsKey("out"))
            throw new InvalidOperationException("Generation writes only the explicit trusted baseline locations.");
        InteractionRoot = options.GetValueOrDefault("profile", "native") switch {
            "native" => "tests/Reference/NodeInteractions", "rgb" => "tests/Reference/NodeInteractionsRgb",
            _ => throw new InvalidOperationException("Unknown trusted interaction color profile.") };
        var rgb = InteractionRoot.EndsWith("Rgb", StringComparison.Ordinal);
        if (options.ContainsKey("framing") && args[0] is not ("compare-node-interactions" or "calibrate-node-interaction-svg"))
            throw new InvalidOperationException("Explicit framing is a candidate-comparison or oracle SVG-calibration option only.");
        InteractionInkFraming = options.GetValueOrDefault("framing", "driver") switch {
            "driver" => false, "ink" => true, _ => throw new InvalidOperationException("Unknown interaction framing contract.") };
        Profile = Read<OracleProfile>(At(InteractionProfilePath));
        var manifest = Read<InteractionManifest>(At(InteractionManifestPath));
        if (manifest.SchemaVersion != 1 || Profile.SchemaVersion != 1 || manifest.Profile != Profile.Id
            || !manifest.Cases.Select(c => c.Id).Order().SequenceEqual(rgb ? new[] { "colors", "state-paint", "transforms" } : ["state-paint", "transforms"])
            || manifest.Cases.Any(c => c.Source != $"tests/Fixtures/Nodes/{c.Id}.tikz" || c.Nodes.Length == 0
                || c.Nodes.Distinct().Count() != c.Nodes.Length || c.Nodes.Any(id => !Regex.IsMatch(id, "^[a-z][a-z0-9-]*$"))
                || !double.IsFinite(c.NumericTolerancePixels) || c.NumericTolerancePixels is < 0 or > .02))
            throw new InvalidOperationException("Incompatible trusted node interaction manifest/profile.");
        if (rgb && Read<JsonElement>(At(InteractionProfilePath)).GetProperty("colorProfile").GetString() != "xcolor-rgb-v1")
            throw new InvalidOperationException("Incompatible RGB color profile.");
        var selected = manifest.Cases.Where(c => !options.TryGetValue("case", out var id) || c.Id == id).ToArray();
        if (selected.Length == 0) throw new InvalidOperationException("No matching trusted node interaction fixture.");
        var output = ArtifactDirectory(options.GetValueOrDefault("out", (args[0] switch {
            "compare-node-interactions" => "artifacts/node-interactions",
            "calibrate-node-interaction-pdf" => "artifacts/node-interaction-pdf-calibration",
            "calibrate-node-interaction-framing" => "artifacts/node-interaction-framing-calibration",
            "calibrate-node-interaction-svg" => "artifacts/node-interaction-svg-calibration",
            _ => "artifacts/node-interaction-reference-work" }) + (rgb ? "-rgb" : "") + (InteractionInkFraming ? "-ink" : "")));
        // A failed regeneration must not leave a previous completed snapshot
        // or suite masquerading as the result of this invocation.
        if (args[0] == "calibrate-node-interaction-svg")
        {
            File.Delete(Path.Combine(output, "calibration-evidence.json"));
            File.Delete(Path.Combine(output, "suite.json"));
        }
        var results = new List<object>();
        var exit = 0;
        foreach (var c in selected)
        {
            var result = args[0] switch {
                "compare-node-interactions" => await CompareInteraction(c, Path.Combine(output, c.Id)),
                "calibrate-node-interaction-pdf" => await CalibrateInteractionPdf(c, Path.Combine(output, c.Id)),
                "calibrate-node-interaction-framing" => await CalibrateInteractionFraming(c, Path.Combine(output, c.Id)),
                "calibrate-node-interaction-svg" => await CalibrateInteractionSvg(c, Path.Combine(output, c.Id)),
                _ => await GenerateInteraction(c, Path.Combine(output, c.Id), args[0] == "generate-node-interactions") };
            results.Add(new { caseId = c.Id, exitCode = result });
            exit = Math.Max(exit, result);
        }
        if (args[0] == "calibrate-node-interaction-svg") SaveInteractionSvgEvidence(selected, output);
        Write(Path.Combine(output, "suite.json"), new { schemaVersion = 1, command = args[0], profile = manifest.Profile,
            expectedCases = selected.Select(c => c.Id), executedCases = results, passed = exit == 0 });
        return exit;
    }

    private static async Task<int> GenerateInteraction(InteractionCase c, string work, bool writeBaseline)
    {
        ResetDirectory(work);
        var latex = await Identify("latex", ["--version"], Profile.LatexVersion);
        var pdfLatex = await Identify("pdflatex", ["--version"], Profile.LatexVersion);
        var dvisvgm = await Identify("dvisvgm", ["--version"], Profile.DvisvgmVersion);
        var rasterizer = await Identify("pdftoppm", ["-v"], Profile.PdfRasterizerVersion);
        var declared = Read<JsonElement>(At(InteractionProfilePath)).GetProperty("dviTypeVersion").GetString()
            ?? throw new InvalidOperationException("Missing native DVItype profile.");
        var dviType = await Identify("dvitype", ["--version"], declared);
        var fontProfile = Read<NodeFontProfile>(At("tools/TikzFontData/font-profile.json"));
        if (fontProfile.SchemaVersion != 1 || fontProfile.Id != TextProfile.Id || fontProfile.LatexVersion != Profile.LatexVersion
            || fontProfile.DvisvgmVersion != Profile.DvisvgmVersion)
            throw new InvalidOperationException("Node interaction font profile mismatch.");
        var fontInputs = new List<InputIdentity>();
        foreach (var input in fontProfile.Inputs)
        {
            if (!Regex.IsMatch(input.Name, "^[a-zA-Z0-9-]+\\.[a-zA-Z0-9]+$")) throw new InvalidOperationException("Invalid font input.");
            var located = await Process(ResolveExecutable("kpsewhich"), [input.Name], Root);
            var file = located.Output.Trim();
            if (located.ExitCode != 0 || !File.Exists(file) || HashFile(file) != input.Sha256)
                throw new InvalidOperationException("Pinned interaction font mismatch: " + input.Name);
            fontInputs.Add(new("font-data/" + input.Name, input.Sha256));
        }
        var source = Text(At(c.Source));
        var wrapper = Text(At(InteractionWrapperPath));
        if (InteractionRoot.EndsWith("Rgb", StringComparison.Ordinal))
            wrapper = wrapper.Replace("\\usepackage{tikz}", Text(At(RgbColorSetupPath)) + "\\usepackage{tikz}", StringComparison.Ordinal);
        var probes = new StringBuilder();
        foreach (var id in c.Nodes)
            foreach (var anchor in NodeAnchorNames)
                probes.Append("\\pgfpointanchor{").Append(id).Append("}{").Append(anchor).Append("}\n")
                    .Append("\\typeout{LOKAD-ANCHOR ").Append(id).Append(';').Append(anchor).Append(";\\number\\pgf@x;\\number\\pgf@y}\n");
        foreach (var name in new[] { "start", "end" })
            probes.Append("\\pgfpointanchor{").Append(name).Append("}{center}\n\\typeout{LOKAD-ANCHOR-")
                .Append(name).Append(" x=\\the\\pgf@x; y=\\the\\pgf@y}\n");
        string[] texArgs = ["-disable-write18", "-disable-installer", "-interaction=nonstopmode", "-halt-on-error", "-recorder", "case.tex"];
        foreach (var mode in new[] { "plain", "probed", "pdf" })
        {
            var folder = Path.Combine(work, mode);
            Directory.CreateDirectory(folder);
            File.WriteAllText(Path.Combine(folder, "case.tikz"), source);
            var active = mode == "plain" ? wrapper : wrapper.Replace("\\begin{document}", "\\lokadprobestrue\n\\begin{document}", StringComparison.Ordinal);
            if (mode == "pdf") active = active.Replace("\\def\\pgfsysdriver{pgfsys-dvisvgm.def}\n", "", StringComparison.Ordinal);
            File.WriteAllText(Path.Combine(folder, "case.tex"), active);
            File.WriteAllText(Path.Combine(folder, "probes.tex"), probes.ToString());
            await Require(mode == "pdf" ? pdfLatex.Executable : latex.Executable, texArgs, folder);
            if (mode != "pdf") await Require(dvisvgm.Executable,
                ["--no-fonts", "--exact-bbox", "--bbox=min", "--output=reference.svg", "case.dvi"], folder);
        }
        var plain = Path.Combine(work, "plain"); var probed = Path.Combine(work, "probed"); var pdf = Path.Combine(work, "pdf");
        var log = Text(Path.Combine(probed, "case.log")); var pdfLog = Text(Path.Combine(pdf, "case.log"));
        var svg = Path.Combine(probed, "reference.svg");
        if (Box(Text(Path.Combine(plain, "case.log"))) != Box(log) || Box(pdfLog) != Box(log)
            || CanonicalNodeSvg(Path.Combine(plain, "reference.svg")) != CanonicalNodeSvg(svg))
            throw new InvalidOperationException("Interaction probes changed visible SVG or primary/PDF TeX box.");
        if (!log.Contains("LOKAD-PGF-VERSION " + Profile.PgfVersion + "\n", StringComparison.Ordinal)
            || !pdfLog.Contains("LOKAD-PGF-VERSION " + Profile.PgfVersion + "\n", StringComparison.Ordinal))
            throw new InvalidOperationException("Interaction oracle PGF version mismatch.");
        if (InteractionRoot.EndsWith("Rgb", StringComparison.Ordinal) && (!log.Contains("LOKAD-COLOR-PROFILE xcolor-rgb-v1\n", StringComparison.Ordinal)
            || !pdfLog.Contains("LOKAD-COLOR-PROFILE xcolor-rgb-v1\n", StringComparison.Ordinal)))
            throw new InvalidOperationException("Interaction oracle did not select the declared RGB model.");
        var trace = await Process(dviType.Executable, ["-disable-installer", "-out-mode=4", "case.dvi"], probed);
        if (trace.ExitCode != 0) throw new InvalidOperationException("Native interaction glyph trace failed: " + Sanitize(trace.Output));
        var native = NativeNodes(log, Profile.Id, c.Nodes);
        var pdfNative = NativeNodes(pdfLog, Profile.Id, c.Nodes);
        var frames = InteractionFrames(log, c.Nodes);
        if (JsonSerializer.Serialize(native, Json) != JsonSerializer.Serialize(pdfNative, Json)
            || JsonSerializer.Serialize(frames, Json) != JsonSerializer.Serialize(InteractionFrames(pdfLog, c.Nodes), Json))
            throw new InvalidOperationException("SVG and ordinary PDF have different native node layouts or frames.");
        var glyphs = NativeNodeGlyphs(trace.Output, fontProfile, c.Nodes);
        native = native with { SchemaVersion = 2, Nodes = native.Nodes.Select(n => n with { Glyphs = glyphs[n.Id] }).ToArray() };
        var document = XDocument.Load(svg);
        var geometry = Measurements(log, pdfLog, svg, new(c.Id, c.Source, ["actual-nodes", "interactions"], c.NumericTolerancePixels));
        var painting = InteractionPainting(document, native, out var definitions);
        native = native with { FontDefinitions = definitions };
        var metrics = new InteractionMetrics(1, Profile.Id, geometry, native, frames, painting);
        var generated = Path.Combine(work, "generated"); Directory.CreateDirectory(generated);
        Write(Path.Combine(generated, "metrics.json"), metrics);
        File.Copy(svg, Path.Combine(generated, "reference.svg"));
        File.Copy(Path.Combine(pdf, "case.pdf"), Path.Combine(generated, "reference.pdf"));
        File.WriteAllText(Path.Combine(generated, "oracle.log"), Sanitize(log + "\n--- Ordinary PDF oracle ---\n" + pdfLog));
        File.WriteAllText(Path.Combine(generated, "native-positions.log"), trace.Output.Replace("\r\n", "\n", StringComparison.Ordinal));
        foreach (var scale in Profile.Scales)
        {
            await Require(rasterizer.Executable, ["-r", (96 * scale).ToString(CultureInfo.InvariantCulture), "-png", "-singlefile", "case.pdf", $"pdf-page-{scale}x"], pdf);
            File.Copy(Path.Combine(pdf, $"pdf-page-{scale}x.png"), Path.Combine(generated, $"pdf-page-{scale}x.png"));
        }
        var inputs = RecordedInputs(probed).Concat(RecordedInputs(pdf)).Concat(fontInputs).DistinctBy(i => i.Path).OrderBy(i => i.Path, StringComparer.Ordinal).ToArray();
        var provenance = new NodeProvenance(1, Profile.Id, InteractionHashes(c), DateTimeOffset.UtcNow.ToString("O"),
            [latex.Public, pdfLatex.Public, dvisvgm.Public, dviType.Public, rasterizer.Public], inputs,
            new(HashFile(Path.Combine(plain, "reference.svg")) == HashFile(svg), true, true),
            Directory.GetFiles(generated).ToDictionary(f => Path.GetFileName(f), HashFile),
            ["latex/pdflatex: -disable-write18 -disable-installer -interaction=nonstopmode -halt-on-error -recorder case.tex",
             "dvisvgm: --no-fonts --exact-bbox --bbox=min --output=reference.svg case.dvi",
             "dvitype: -disable-installer -out-mode=4 case.dvi", "pdftoppm: -r 96/384 -png -singlefile"]);
        Write(Path.Combine(generated, "provenance.json"), provenance);
        var baseline = At(InteractionRoot + "/" + c.Id);
        if (writeBaseline)
        {
            Directory.CreateDirectory(baseline);
            foreach (var file in Directory.GetFiles(generated)) File.Copy(file, Path.Combine(baseline, Path.GetFileName(file)), true);
        }
        else
        {
            var cached = CachedInteraction(c);
            var original = Read<NodeProvenance>(Path.Combine(baseline, "provenance.json"));
            if (JsonSerializer.Serialize(cached, Json) != JsonSerializer.Serialize(metrics, Json)
                || CanonicalNodeSvg(Path.Combine(baseline, "reference.svg")) != CanonicalNodeSvg(svg)
                || JsonSerializer.Serialize(original.Tools, Json) != JsonSerializer.Serialize(provenance.Tools, Json)
                || JsonSerializer.Serialize(original.Inputs, Json) != JsonSerializer.Serialize(inputs, Json)
                || Profile.Scales.Any(s => HashFile(Path.Combine(baseline, $"pdf-page-{s}x.png")) != HashFile(Path.Combine(generated, $"pdf-page-{s}x.png"))))
                throw new InvalidOperationException("Fresh interaction oracle differs from cached measurements, drawings, or inputs.");
        }
        Console.WriteLine($"{c.Id}: {(writeBaseline ? "generated" : "verified without overwriting")} {native.Nodes.Length} actual node layouts/frames and ordinary PDF rasters.");
        return 0;
    }

    private static Dictionary<string, NativeFrame> InteractionFrames(string log, string[] ids)
    {
        var result = Regex.Matches(log.Replace("\n", "", StringComparison.Ordinal),
            @"LOKAD-NODE-FRAME ([a-z][a-z0-9-]*);([-\d.]+);([-\d.]+);([-\d.]+);([-\d.]+);(-?\d+);(-?\d+)")
            .ToDictionary(m => m.Groups[1].Value, m => new NativeFrame(Parse(m.Groups[2].Value), Parse(m.Groups[3].Value),
                Parse(m.Groups[4].Value), Parse(m.Groups[5].Value), int.Parse(m.Groups[6].Value, CultureInfo.InvariantCulture), int.Parse(m.Groups[7].Value, CultureInfo.InvariantCulture)));
        if (!result.Keys.SequenceEqual(ids)) throw new InvalidOperationException("Missing, duplicate, or reordered independent node frames.");
        return result;
    }

    private static NativePainting[] InteractionPainting(XDocument document, NodeMetrics nodes, out Dictionary<string, string> definitions)
    {
        var definitionsById = new Dictionary<string, string>(StringComparer.Ordinal);
        var glyphs = nodes.Nodes.SelectMany(n => n.Glyphs.Select((g, i) => (Node: n.Id, Index: i, Glyph: g))).ToArray();
        var clips = document.Descendants().Where(e => e.Name.LocalName == "clipPath").Select(e => e.Attribute("id")!.Value).ToArray();
        var paints = new List<NativePainting>(); var glyphIndex = 0; var pathIndex = 0;
        foreach (var element in document.Descendants().Where(e => e.Name.LocalName is "path" or "use"
            && !e.Ancestors().Any(a => a.Name.LocalName is "defs" or "clipPath")))
        {
            var clipIds = element.AncestorsAndSelf().Reverse().Select(e => e.Attribute("clip-path")?.Value).Where(v => v is not null)
                .Select(v => { var m = Regex.Match(v!, "^url\\(#([a-zA-Z0-9-]+)\\)$"); var id = m.Success ? Array.IndexOf(clips, m.Groups[1].Value) : -1;
                    return id >= 0 ? id : throw new InvalidOperationException("Unexpected oracle clip reference."); }).ToArray();
            if (element.Name.LocalName == "path") { paints.Add(new("path", pathIndex++, "", -1, "", 1, clipIds)); continue; }
            if (glyphIndex >= glyphs.Length) throw new InvalidOperationException("Unexpected painted oracle glyph.");
            var glyph = glyphs[glyphIndex++];
            var reference = element.Attributes().Single(a => a.Name.LocalName == "href").Value.TrimStart('#');
            var parts = reference.Split('-');
            if (parts.Length != 2 || int.Parse(parts[1], CultureInfo.InvariantCulture) != glyph.Glyph.Slot
                || definitionsById.TryGetValue(parts[0], out var font) && font != glyph.Glyph.Font)
                throw new InvalidOperationException("Native and oracle SVG font/slot identities disagree.");
            definitionsById[parts[0]] = glyph.Glyph.Font;
            var paint = ReadPaint(element, [], 0, false, true);
            var opacity = element.AncestorsAndSelf().Select(e => e.Attribute("opacity")?.Value).Where(v => v is not null).Aggregate(paint.FillOpacity, (a, v) => a * Parse(v!));
            paints.Add(new("glyph", -1, glyph.Node, glyph.Index, paint.FillColor, opacity, clipIds));
        }
        if (glyphIndex != glyphs.Length) throw new InvalidOperationException("Missing independently traced glyphs in the SVG.");
        definitions = definitionsById;
        return [.. paints];
    }

    private static Dictionary<string, string> InteractionHashes(InteractionCase c)
    {
        var hashes = new Dictionary<string, string>(StringComparer.Ordinal) {
            [c.Source] = HashText(Text(At(c.Source))), [InteractionManifestPath] = HashText(Text(At(InteractionManifestPath))),
            [InteractionProfilePath] = HashText(Text(At(InteractionProfilePath))), [InteractionWrapperPath] = HashText(Text(At(InteractionWrapperPath))),
            ["tools/TikzFontData/font-profile.json"] = HashText(Text(At("tools/TikzFontData/font-profile.json"))) };
        if (InteractionRoot.EndsWith("Rgb", StringComparison.Ordinal)) hashes[RgbColorSetupPath] = HashText(Text(At(RgbColorSetupPath)));
        return hashes;
    }

    private static InteractionMetrics CachedInteraction(InteractionCase c)
    {
        var baseline = At(InteractionRoot + "/" + c.Id);
        var provenance = Read<NodeProvenance>(Path.Combine(baseline, "provenance.json"));
        if (provenance.SchemaVersion != 1 || provenance.Profile != Profile.Id || !provenance.ProbeVerification.PictureBoxIdentical
            || !provenance.ProbeVerification.SvgIdenticalAfterDefinitionOrderOnly
            || JsonSerializer.Serialize(provenance.SourceHashes, Json) != JsonSerializer.Serialize(InteractionHashes(c), Json)
            || !provenance.Artifacts.Keys.Order().SequenceEqual(InteractionArtifacts.Order()))
            throw new InvalidOperationException("Incompatible interaction baseline provenance.");
        foreach (var (file, hash) in provenance.Artifacts)
            if (HashFile(Path.Combine(baseline, file)) != hash) throw new InvalidOperationException("Modified interaction baseline: " + file);
        var metrics = Read<InteractionMetrics>(Path.Combine(baseline, "metrics.json"));
        if (metrics.SchemaVersion != 1 || metrics.Profile != Profile.Id || metrics.Geometry.SchemaVersion != 2 || metrics.Nodes.SchemaVersion != 2
            || !metrics.Nodes.Nodes.Select(n => n.Id).SequenceEqual(c.Nodes) || !metrics.Frames.Keys.SequenceEqual(c.Nodes))
            throw new InvalidOperationException("Incomplete interaction native measurements.");
        var native = NativeNodeGlyphs(Text(Path.Combine(baseline, "native-positions.log")), Read<NodeFontProfile>(At("tools/TikzFontData/font-profile.json")), c.Nodes);
        foreach (var node in metrics.Nodes.Nodes)
            if (JsonSerializer.Serialize(node.Glyphs, Json) != JsonSerializer.Serialize(native[node.Id], Json))
                throw new InvalidOperationException("Interaction native glyph trace differs from cached positions.");
        return metrics;
    }

    private static async Task<int> CompareInteraction(InteractionCase c, string output)
    {
        ResetDirectory(output);
        try
        {
            var metrics = CachedInteraction(c);
            foreach (var file in InteractionArtifacts.Append("provenance.json"))
                File.Copy(At(InteractionRoot + "/" + c.Id + "/" + file), Path.Combine(output, file));
            if (InteractionInkFraming)
            {
                File.Copy(Path.Combine(output, "reference.svg"), Path.Combine(output, "original-driver.svg"));
                var document = XDocument.Load(Path.Combine(output, "reference.svg"));
                var frame = OracleStrokeFrame(document, metrics);
                ApplyOracleFrame(document, frame, false);
                File.WriteAllText(Path.Combine(output, "reference.svg"), document.ToString(SaveOptions.DisableFormatting));
                Write(Path.Combine(output, "reference-frame.json"), new { schemaVersion = 1, converterInvoked = false,
                    source = "Original driver frame plus independent PGF polygon-stroke line intersections; no fitting", frame,
                    originalSha256 = HashFile(Path.Combine(output, "original-driver.svg")), derivedSha256 = HashFile(Path.Combine(output, "reference.svg")),
                    metricsSha256 = HashFile(Path.Combine(output, "metrics.json")), toolSha256 = HashText(Text(At("tools/TikzReference/OracleStrokeFrame.cs"))) });
            }
            var source = Text(At(c.Source)); File.WriteAllText(Path.Combine(output, "source.tikz"), source);
            GraphicsScene? scene = null;
            var result = TikzConverter.ConvertWithTrace(source, TikzOptions.Default with { IdPrefix = "candidate" }, CancellationToken.None, s => scene = s);
            if (result is TikzFailure failure)
            {
                Write(Path.Combine(output, "report.json"), new { schemaVersion = 1, caseId = c.Id, verdict = "unsupported-or-candidate-error", diagnostics = failure.Diagnostics });
                return 3;
            }
            var success = (TikzSuccess)result;
            File.WriteAllText(Path.Combine(output, "actual.svg"), success.Svg);
            Write(Path.Combine(output, "actual-scene.json"), NodeScene(scene!, success));
            var checks = NumericChecks(metrics.Geometry, scene!, success, c.NumericTolerancePixels);
            checks.AddRange(InteractionChecks(metrics, scene!, c.NumericTolerancePixels, source));
            var git = await Process(ResolveExecutable("git"), ["rev-parse", "HEAD"], Root);
            Write(Path.Combine(output, "candidate-provenance.json"), new { schemaVersion = 1, commit = git.Output.Trim(),
                workingTreeSha256 = await WorkingTreeFingerprint(), configuration = BuildConfiguration, assemblySha256 = HashFile(typeof(TikzConverter).Assembly.Location) });
            Write(Path.Combine(output, "comparison-input.json"), new { schemaVersion = 1, caseId = "node-" + c.Id,
                referenceMode = InteractionInkFraming ? "derived-ink-reference; original-driver.svg retained" : "cached",
                referenceOriginBp = metrics.Geometry.SvgOriginBp,
                exactPrimary = true, actualLabel = "Lokad.TikZ",
                scope = "Node interactions: " + Profile.Id + "; numeric and exact primary experiment; no reviewed raster allowance or PDF conformance policy yet",
                numericTolerancePixels = c.NumericTolerancePixels, numeric = new { passed = checks.All(check => check.Passed), checks } });
            var rendered = await Process(ResolveExecutable("node"), [At("tools/TikzVisual/compare.mjs"), output], Root);
            if (rendered.ExitCode is not (0 or 1) || !File.Exists(Path.Combine(output, "report.json")))
                throw new InvalidOperationException("Interaction visual runner failed: " + rendered.Output);
            Console.WriteLine($"{c.Id}: {(rendered.ExitCode == 0 ? "pass" : "mismatch")}; {Relative(Path.Combine(output, "report.json"))}");
            return rendered.ExitCode;
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            Write(Path.Combine(output, "report.json"), new { schemaVersion = 1, caseId = c.Id, verdict = "harness-failure", diagnostics = new[] { Sanitize(error.Message) } });
            Console.Error.WriteLine(c.Id + ": " + Sanitize(error.Message));
            return 2;
        }
    }

    private static async Task<int> CalibrateInteractionPdf(InteractionCase c, string output)
    {
        ResetDirectory(output);
        var metrics = CachedInteraction(c);
        foreach (var file in InteractionArtifacts.Append("provenance.json"))
            File.Copy(At(InteractionRoot + "/" + c.Id + "/" + file), Path.Combine(output, file));
        File.Copy(At(c.Source), Path.Combine(output, "source.tikz"));
        // Rebase only the oracle's documented wrapper translation. All paths,
        // outlines, native text transforms, paint, and clips remain original.
        // This branch never invokes candidate parsing/layout/font/serialization.
        var original = XDocument.Load(Path.Combine(output, "reference.svg"));
        var origin = NodeSvgOrigin(original);
        var root = original.Root!;
        var frame = root.Attribute("viewBox")!.Value.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(Parse).ToArray();
        if (frame.Length != 4) throw new InvalidOperationException("Unexpected oracle crop.");
        root.SetAttributeValue("viewBox", string.Join(' ', new[] { frame[0] - origin.X, frame[1] - origin.Y, frame[2], frame[3] }
            .Select(v => v.ToString("R", CultureInfo.InvariantCulture))));
        var group = original.Descendants().First(e => e.Name.LocalName == "g" && (e.Attribute("transform")?.Value ?? "").StartsWith("translate(", StringComparison.Ordinal));
        group.SetAttributeValue("transform", Regex.Replace(group.Attribute("transform")!.Value, @"^translate\([^)]*\)", ""));
        File.WriteAllText(Path.Combine(output, "actual.svg"), original.ToString(SaveOptions.DisableFormatting));
        Write(Path.Combine(output, "actual-scene.json"), new { schemaVersion = 1, paths = Array.Empty<object>(), scope = "Rebased original oracle; no candidate scene" });
        Write(Path.Combine(output, "comparison-input.json"), new { schemaVersion = 1, caseId = "node-" + c.Id + "-pdf-oracle",
            referenceMode = "cached", referenceOriginBp = origin, actualUnits = "bp", exactPrimary = true, exactPdf = true,
            actualLabel = "Original oracle at picture origin", scope = "Oracle-only PDF measurement experiment; exact gates, no candidate or approved allowance",
            numericTolerancePixels = c.NumericTolerancePixels, numeric = new { passed = true, checks = Array.Empty<NumericCheck>() },
            pdf = new { originPixels = metrics.Geometry.PdfOriginPixels } });
        var rendered = await Process(ResolveExecutable("node"), [At("tools/TikzVisual/compare.mjs"), output], Root);
        if (rendered.ExitCode is not (0 or 1) || !File.Exists(Path.Combine(output, "report.json")))
            throw new InvalidOperationException("Interaction PDF measurement failed: " + rendered.Output);
        var report = Read<JsonElement>(Path.Combine(output, "report.json"));
        Write(Path.Combine(output, "calibration-evidence.json"), new { schemaVersion = 1, converterInvoked = false,
            scope = "Original mixed node/path SVG driver versus ordinary PDF; known wrapper rebasing only",
            command = "dotnet run --project tools/TikzReference -c Release -- calibrate-node-interaction-pdf",
            provenance = Read<JsonElement>(Path.Combine(output, "provenance.json")),
            toolHashes = new[] { "tools/TikzReference/NodeInteractions.cs", "tools/TikzReference/ReferenceMeasurements.cs",
                "tools/TikzVisual/compare.mjs", "tools/TikzVisual/browser-profile.json" }.ToDictionary(f => f, f => HashText(Text(At(f)))),
            referenceSha256 = HashFile(Path.Combine(output, "reference.svg")), rebasedOracleSha256 = HashFile(Path.Combine(output, "actual.svg")),
            referenceOriginBp = origin, pdfOriginPixels = metrics.Geometry.PdfOriginPixels,
            primary = report.GetProperty("primary"), pdf = report.GetProperty("pdf"), dimensions = report.GetProperty("dimensions"),
            renderer = report.GetProperty("renderer"), artifacts = report.GetProperty("artifacts") });
        Console.WriteLine($"{c.Id}: oracle-only PDF differences recorded; {Relative(Path.Combine(output, "calibration-evidence.json"))}");
        return rendered.ExitCode;
    }

    private static List<NumericCheck> InteractionChecks(InteractionMetrics metrics, GraphicsScene scene, double tolerance, string source)
    {
        var checks = new List<NumericCheck>();
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var query = NodeFontMetrics.Resolve(TextFont.Default, budget, new(source, 0, 0));
        Equal("nodes.count", metrics.Nodes.Nodes.Length, scene.Nodes.Count);
        foreach (var (expected, actual) in metrics.Nodes.Nodes.Zip(scene.Nodes))
        {
            var prefix = expected.Id + "."; var text = actual.Layout.Text; var dim = actual.Layout.Dimensions;
            Equal(prefix + "name", expected.Id, actual.Name);
            var font = NodeFontMetrics.Resolve(actual.NodeFont, budget, actual.Source);
            var quantities = new Dictionary<string, int> { ["width"] = text.WidthSp, ["height"] = text.HeightSp, ["depth"] = text.DepthSp,
                ["quad"] = font.QuadSp, ["xheight"] = font.XHeightSp, ["innerx"] = dim.InnerXSp, ["innery"] = dim.InnerYSp,
                ["outerx"] = dim.OuterXSp, ["outery"] = dim.OuterYSp, ["minimumwidth"] = dim.MinimumWidthSp, ["minimumheight"] = dim.MinimumHeightSp };
            foreach (var (key, value) in quantities) Equal(prefix + key, expected.Values[key], value, "integer TeX sp");
            foreach (var (anchor, point) in expected.Anchors)
            {
                var actualPoint = Lokad.TikZ.Geometry.PgfTransform.Apply(actual.Transform, actual.Layout.Anchor(anchor, query, budget, actual.Source).Bp, budget, actual.Source);
                Physical(prefix + "anchor." + anchor + ".x", point.X, actualPoint.X);
                Physical(prefix + "anchor." + anchor + ".y", point.Y, actualPoint.Y);
            }
            var frame = metrics.Frames[expected.Id];
            Number(prefix + "frame.a", frame.A, actual.Transform.A, "coefficient", 0);
            Number(prefix + "frame.b", frame.B, actual.Transform.B, "coefficient", 0);
            Number(prefix + "frame.c", frame.C, actual.Transform.C, "coefficient", 0);
            Number(prefix + "frame.d", frame.D, actual.Transform.D, "coefficient", 0);
            Physical(prefix + "frame.e", frame.ESp, actual.Transform.E); Physical(prefix + "frame.f", frame.FSp, actual.Transform.F);
            Equal(prefix + "glyphCount", expected.Glyphs.Length, text.Glyphs.Length);
            var run = scene.Drawables.OfType<PaintedGlyphRun>().Single(r => scene.Nodes[r.NodeId] == actual);
            for (var index = 0; index < Math.Min(expected.Glyphs.Length, text.Glyphs.Length); index++)
            {
                var native = expected.Glyphs[index]; var glyph = text.Glyphs[index]; var name = prefix + "glyph." + index;
                Equal(name + ".font", native.Font, glyph.FontId); Equal(name + ".slot", native.Slot, glyph.Slot);
                Equal(name + ".local.x", native.XSp, glyph.XSp, "integer TeX sp"); Equal(name + ".local.y", native.YSp, glyph.YSp, "integer TeX sp");
                Physical(name + ".global.x", frame.ESp + frame.A * native.XSp - frame.C * native.YSp, run.Glyphs[index].Transform.E);
                Physical(name + ".global.y", frame.FSp + frame.B * native.XSp - frame.D * native.YSp, run.Glyphs[index].Transform.F);
            }
        }
        var painting = new List<NativePainting>(); var pathIndex = 0;
        foreach (var drawable in scene.Drawables)
            if (drawable is PaintedPath path) painting.Add(new("path", pathIndex++, "", -1, "", 1, path.Clips));
            else if (drawable is PaintedGlyphRun run)
                for (var i = 0; i < run.Glyphs.Length; i++) painting.Add(new("glyph", -1, scene.Nodes[run.NodeId].Name, i, run.Color.Svg, run.Opacity, run.Clips));
        Equal("painting.count", metrics.Painting.Length, painting.Count);
        for (var i = 0; i < Math.Min(metrics.Painting.Length, painting.Count); i++)
        {
            var expected = metrics.Painting[i]; var actual = painting[i]; var prefix = "painting." + i;
            Equal(prefix + ".kind", expected.Kind, actual.Kind); Equal(prefix + ".path", expected.PathIndex, actual.PathIndex);
            Equal(prefix + ".node", expected.Node, actual.Node); Equal(prefix + ".glyph", expected.GlyphIndex, actual.GlyphIndex);
            Equal(prefix + ".clips", string.Join(',', expected.Clips), string.Join(',', actual.Clips));
            if (expected.Kind == "glyph") { Equal(prefix + ".color", expected.Color, actual.Color); Number(prefix + ".opacity", expected.Opacity, actual.Opacity, "unit interval", .000001); }
        }
        return checks;
        void Equal(string name, object expected, object actual, string units = "value") => checks.Add(new(name, expected, actual, units, null, 0, expected.Equals(actual)));
        void Number(string name, double expected, double actual, string units, double allowed)
            => checks.Add(new(name, expected, actual, units, Math.Abs(expected - actual), allowed, Math.Abs(expected - actual) <= allowed));
        // Native frame/anchor quantities are independent integer-sp records;
        // only binary unit-conversion noise is admitted. Resolved SVG glyph
        // origins additionally use the independently measured coefficients.
        void Physical(string name, double sp, double bp) => Number(name, sp * (96 / (72.27 * 65536)), bp * 4 / 3, "CSS pixels", 1e-9);
    }

    private sealed record InteractionManifest(int SchemaVersion, string Profile, InteractionCase[] Cases);
    private sealed record InteractionCase(string Id, string Source, string[] Nodes, double NumericTolerancePixels);
    private sealed record InteractionMetrics(int SchemaVersion, string Profile, ReferenceMetrics Geometry, NodeMetrics Nodes,
        Dictionary<string, NativeFrame> Frames, NativePainting[] Painting);
    private sealed record NativeFrame(double A, double B, double C, double D, int ESp, int FSp);
    private sealed record NativePainting(string Kind, int PathIndex, string Node, int GlyphIndex, string Color, double Opacity, int[] Clips);
}

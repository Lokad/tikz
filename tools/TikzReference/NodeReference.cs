using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Lokad.TikZ;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Text;

internal static partial class ReferenceTool
{
    private const string NodeManifestPath = "tests/Reference/Nodes/cases.json";
    private const string NodeProfilePath = "tests/Reference/Nodes/oracle-profile.json";
    private const string NodeWrapperPath = "tools/TikzReference/nodes.tex";
    private const string NodeBaseline = "tests/Reference/Nodes/rectangles";
    private const string NodeUnits = "integer TeX sp; y-up; global anchors/background; no fitted origin";
    private static readonly string[] NodeAnchorNames = ["text", "center", "north", "south", "west", "east",
        "north west", "north east", "south west", "south east", "base", "base west", "base east", "mid", "mid west", "mid east"];
    private static readonly string[] NodeQuantities = ["width", "height", "depth", "linewidth", "quad", "xheight",
        "innerx", "innery", "outerx", "outery", "minimumwidth", "minimumheight"];

    private static async Task<int> NodeReferences(string[] args)
    {
        if (args.Length != 1 && !(args[0] is "compare-node-layout" or "compare-node-svg" or "calibrate-node-svg" && args.Length == 3 && args[1] == "--out"))
            throw new InvalidOperationException("Usage: TikzReference <generate-node-reference|verify-node-reference|compare-node-layout|compare-node-svg|calibrate-node-svg> [comparison/calibration only: --out artifacts/...].");
        Profile = Read<OracleProfile>(At(NodeProfilePath));
        var manifest = Read<NodeManifest>(At(NodeManifestPath));
        if (manifest.SchemaVersion != 1 || Profile.SchemaVersion != 1 || manifest.Profile != Profile.Id
            || manifest.Cases.Length == 0 || manifest.Cases.Select(c => c.Id).Distinct().Count() != manifest.Cases.Length
            || manifest.Cases.Any(c => !Regex.IsMatch(c.Id, "^[a-z][a-z0-9-]*$") || !NodeAnchorNames.Contains(c.Anchor))
            || manifest.Source != "tests/Fixtures/Nodes/rectangles.tikz")
            throw new InvalidOperationException("Incompatible trusted node manifest/profile.");
        foreach (var c in manifest.Cases) { _ = NodeFont(c.Font); _ = NodeFont(c.NodeFont); }
        if (args[0] == "compare-node-layout")
            return await CompareNodeLayouts(manifest, args.Length == 3 ? args[2] : "artifacts/node-layout");
        if (args[0] is "compare-node-svg" or "calibrate-node-svg")
            return await NodeSvg(manifest, args[0] == "calibrate-node-svg", args.Length == 3 ? args[2]
                : args[0] == "calibrate-node-svg" ? "artifacts/node-calibration" : "artifacts/node-comparisons");

        // These live commands take no submitted source. They compile only the
        // repository-owned fixture admitted by the dedicated manifest.
        var latex = await Identify("latex", ["--version"], Profile.LatexVersion);
        var dvisvgm = await Identify("dvisvgm", ["--version"], Profile.DvisvgmVersion);
        const string dviTypeVersion = "MiKTeX-DVITYPE 2.9.6300 (MiKTeX 25.4)";
        using (var declared = JsonDocument.Parse(Text(At(NodeProfilePath))))
            if (declared.RootElement.GetProperty("dviTypeVersion").GetString() != dviTypeVersion)
                throw new InvalidOperationException("Node DVItype profile mismatch.");
        var dviType = await Identify("dvitype", ["--version"], dviTypeVersion);
        var fontProfile = Read<NodeFontProfile>(At("tools/TikzFontData/font-profile.json"));
        if (fontProfile.SchemaVersion != 1 || fontProfile.Id != TextProfile.Id
            || fontProfile.LatexVersion != Profile.LatexVersion || fontProfile.DvisvgmVersion != Profile.DvisvgmVersion)
            throw new InvalidOperationException("Node oracle font profile mismatch.");
        var fontInputs = new List<InputIdentity>();
        foreach (var input in fontProfile.Inputs)
        {
            if (!Regex.IsMatch(input.Name, "^[a-zA-Z0-9-]+\\.[a-zA-Z0-9]+$")) throw new InvalidOperationException("Invalid font input.");
            var located = await Process(ResolveExecutable("kpsewhich"), [input.Name], Root);
            var file = located.Output.Trim();
            if (located.ExitCode != 0 || !File.Exists(file) || HashFile(file) != input.Sha256)
                throw new InvalidOperationException("Pinned node font input mismatch: " + input.Name);
            fontInputs.Add(new("font-data/" + input.Name, input.Sha256));
        }
        var work = ArtifactDirectory("artifacts/node-reference-work");
        ResetDirectory(work);
        var wrapper = Text(At(NodeWrapperPath));
        var source = Text(At(manifest.Source));
        var probes = new StringBuilder();
        foreach (var c in manifest.Cases)
            foreach (var anchor in NodeAnchorNames)
                probes.Append("\\pgfpointanchor{").Append(c.Id).Append("}{").Append(anchor).Append("}\n")
                    .Append("\\typeout{LOKAD-ANCHOR ").Append(c.Id).Append(';').Append(anchor)
                    .Append(";\\number\\pgf@x;\\number\\pgf@y}\n");
        foreach (var name in new[] { "plain", "probed" })
        {
            var folder = Path.Combine(work, name);
            Directory.CreateDirectory(folder);
            File.WriteAllText(Path.Combine(folder, "case.tikz"), source);
            File.WriteAllText(Path.Combine(folder, "case.tex"), name == "plain" ? wrapper
                : wrapper.Replace("\\begin{document}", "\\lokadprobestrue\n\\begin{document}", StringComparison.Ordinal));
            File.WriteAllText(Path.Combine(folder, "probes.tex"), probes.ToString());
            await Require(latex.Executable, ["-disable-write18", "-disable-installer", "-interaction=nonstopmode", "-halt-on-error", "-recorder", "case.tex"], folder);
            await Require(dvisvgm.Executable, ["--no-fonts", "--exact-bbox", "--bbox=min", "--output=reference.svg", "case.dvi"], folder);
        }
        var plain = Path.Combine(work, "plain");
        var probed = Path.Combine(work, "probed");
        var log = Text(Path.Combine(probed, "case.log"));
        var plainSvg = Path.Combine(plain, "reference.svg");
        var probedSvg = Path.Combine(probed, "reference.svg");
        var plainBox = Regex.Match(Text(Path.Combine(plain, "case.log")), @"LOKAD-BOX (-?\d+);(-?\d+);(-?\d+)").Value;
        if (plainBox.Length == 0 || plainBox != Regex.Match(log, @"LOKAD-BOX (-?\d+);(-?\d+);(-?\d+)").Value
            || CanonicalNodeSvg(plainSvg) != CanonicalNodeSvg(probedSvg))
            throw new InvalidOperationException("Node probes changed box dimensions or visible SVG.");
        if (!log.Contains("LOKAD-PGF-VERSION " + Profile.PgfVersion + "\n", StringComparison.Ordinal))
            throw new InvalidOperationException("Node oracle PGF version mismatch.");
        var nativeTrace = await Process(dviType.Executable, ["-disable-installer", "-out-mode=4", "case.dvi"], probed);
        if (nativeTrace.ExitCode != 0) throw new InvalidOperationException("Native node DVI trace failed: " + Sanitize(nativeTrace.Output));
        var metrics = NativeNodes(log, manifest) with { SchemaVersion = 2 };
        var nativeGlyphs = NativeNodeGlyphs(nativeTrace.Output, fontProfile, manifest);
        metrics = metrics with { Nodes = metrics.Nodes.Select(node => node with { Glyphs = nativeGlyphs[node.Id] }).ToArray() };
        var svgGlyphs = XDocument.Load(probedSvg).Descendants().Where(e => e.Name.LocalName == "use").ToArray();
        var orderedGlyphs = metrics.Nodes.SelectMany(node => node.Glyphs).ToArray();
        if (svgGlyphs.Length != orderedGlyphs.Length) throw new InvalidOperationException("Native and SVG node glyph counts disagree.");
        var definitions = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var glyphIndex = 0; glyphIndex < svgGlyphs.Length; glyphIndex++)
        {
            var reference = svgGlyphs[glyphIndex].Attributes().Single(a => a.Name.LocalName == "href").Value.TrimStart('#');
            var parts = reference.Split('-');
            if (parts.Length != 2 || int.Parse(parts[1]) != orderedGlyphs[glyphIndex].Slot
                || definitions.TryGetValue(parts[0], out var previous) && previous != orderedGlyphs[glyphIndex].Font)
                throw new InvalidOperationException("Native and SVG font/slot identities disagree.");
            definitions[parts[0]] = orderedGlyphs[glyphIndex].Font;
        }
        metrics = metrics with { FontDefinitions = definitions };
        var inputs = RecordedInputs(probed).Concat(fontInputs).DistinctBy(i => i.Path)
            .OrderBy(i => i.Path, StringComparer.Ordinal).ToArray();
        var generated = Path.Combine(work, "generated");
        Directory.CreateDirectory(generated);
        Write(Path.Combine(generated, "metrics.json"), metrics);
        File.Copy(probedSvg, Path.Combine(generated, "reference.svg"));
        File.WriteAllText(Path.Combine(generated, "oracle.log"), Sanitize(log));
        File.WriteAllText(Path.Combine(generated, "native-positions.log"), nativeTrace.Output.Replace("\r\n", "\n", StringComparison.Ordinal));
        var provenance = new NodeProvenance(1, Profile.Id, NodeHashes(manifest), DateTimeOffset.UtcNow.ToString("O"),
            [latex.Public, dvisvgm.Public, dviType.Public], inputs,
            new NodeProbeVerification(HashFile(plainSvg) == HashFile(probedSvg), true, true),
            Directory.GetFiles(generated).ToDictionary(file => Path.GetFileName(file), HashFile),
            ["latex: -disable-write18 -disable-installer -interaction=nonstopmode -halt-on-error -recorder case.tex",
             "dvisvgm: --no-fonts --exact-bbox --bbox=min --output=reference.svg case.dvi",
             "dvitype: -disable-installer -out-mode=4 case.dvi"]);
        Write(Path.Combine(generated, "provenance.json"), provenance);
        if (args[0] == "generate-node-reference")
        {
            Directory.CreateDirectory(At(NodeBaseline));
            foreach (var file in Directory.GetFiles(generated)) File.Copy(file, Path.Combine(At(NodeBaseline), Path.GetFileName(file)), true);
            Console.WriteLine($"Generated independent rectangle layout for {metrics.Nodes.Length} actual TikZ nodes.");
            return 0;
        }
        var cached = CachedNodes(manifest);
        var original = Read<NodeProvenance>(At(NodeBaseline + "/provenance.json"));
        if (JsonSerializer.Serialize(cached, Json) != JsonSerializer.Serialize(metrics, Json)
            || CanonicalNodeSvg(At(NodeBaseline + "/reference.svg")) != CanonicalNodeSvg(probedSvg)
            || JsonSerializer.Serialize(original.Tools, Json) != JsonSerializer.Serialize(provenance.Tools, Json)
            || JsonSerializer.Serialize(original.Inputs, Json) != JsonSerializer.Serialize(inputs, Json))
            throw new InvalidOperationException("Fresh node oracle differs from cached measurements, drawing, or pinned inputs.");
        Console.WriteLine($"Verified {metrics.Nodes.Length} native rectangle layouts without rewriting baselines.");
        return 0;
    }

    private static string CanonicalNodeSvg(string path)
    {
        var document = XDocument.Load(path);
        foreach (var defs in document.Descendants().Where(e => e.Name.LocalName == "defs"))
        {
            var ids = defs.Elements().Select(e => e.Attribute("id")?.Value).ToArray();
            if (ids.Any(string.IsNullOrEmpty) || ids.Distinct().Count() != ids.Length)
                throw new InvalidOperationException("Oracle definitions need unique IDs before order-only comparison.");
            var children = defs.Elements().OrderBy(e => e.Attribute("id")?.Value, StringComparer.Ordinal).ToArray();
            defs.ReplaceNodes(children);
        }
        return document.ToString(SaveOptions.DisableFormatting);
    }

    private static NodeMetrics NativeNodes(string log, NodeManifest manifest)
    {
        var measuredIds = Regex.Matches(log, @"LOKAD-NODE ([a-z][a-z0-9-]*) width=")
            .Select(m => m.Groups[1].Value).ToArray();
        if (!measuredIds.SequenceEqual(manifest.Cases.Select(c => c.Id)))
            throw new InvalidOperationException("Native node coverage differs from the trusted manifest.");
        var nodes = new List<NativeNode>();
        foreach (var c in manifest.Cases)
        {
            var values = Regex.Matches(log, @"LOKAD-NODE ([a-z][a-z0-9-]*) ([a-z]+)=(-?\d+)")
                .Where(m => m.Groups[1].Value == c.Id).ToDictionary(m => m.Groups[2].Value, m => int.Parse(m.Groups[3].Value));
            var anchors = Regex.Matches(log, @"LOKAD-ANCHOR ([a-z][a-z0-9-]*);([^;\r\n]+);(-?\d+);(-?\d+)")
                .Where(m => m.Groups[1].Value == c.Id).ToDictionary(m => m.Groups[2].Value,
                    m => new NodePoint(int.Parse(m.Groups[3].Value), int.Parse(m.Groups[4].Value)));
            var corners = Regex.Matches(log, @"LOKAD-RECT ([a-z][a-z0-9-]*) (sw|ne)=(-?\d+);(-?\d+)")
                .Where(m => m.Groups[1].Value == c.Id).ToDictionary(m => m.Groups[2].Value,
                    m => new NodePoint(int.Parse(m.Groups[3].Value), int.Parse(m.Groups[4].Value)));
            if (!values.Keys.Order().SequenceEqual(NodeQuantities.Order()) || !anchors.Keys.Order().SequenceEqual(NodeAnchorNames.Order())
                || corners.Count != 2) throw new InvalidOperationException("Incomplete native node measurements: " + c.Id);
            nodes.Add(new(c.Id, values, anchors, corners["sw"], corners["ne"]));
        }
        return new(1, manifest.Profile, NodeUnits, nodes.ToArray());
    }

    private static Dictionary<string, string> NodeHashes(NodeManifest manifest) => new(StringComparer.Ordinal)
    {
        [manifest.Source] = HashText(Text(At(manifest.Source))),
        [NodeManifestPath] = HashText(Text(At(NodeManifestPath))),
        [NodeProfilePath] = HashText(Text(At(NodeProfilePath))),
        [NodeWrapperPath] = HashText(Text(At(NodeWrapperPath))),
        ["tools/TikzFontData/font-profile.json"] = HashText(Text(At("tools/TikzFontData/font-profile.json")))
    };

    private static NodeMetrics CachedNodes(NodeManifest manifest)
    {
        var provenance = Read<NodeProvenance>(At(NodeBaseline + "/provenance.json"));
        if (provenance.SchemaVersion != 1 || provenance.Profile != manifest.Profile
            || !provenance.ProbeVerification.SvgIdenticalAfterDefinitionOrderOnly || !provenance.ProbeVerification.PictureBoxIdentical
            || JsonSerializer.Serialize(provenance.SourceHashes, Json) != JsonSerializer.Serialize(NodeHashes(manifest), Json)
            || !provenance.Artifacts.Keys.Order().SequenceEqual(new[] { "metrics.json", "oracle.log", "reference.svg", "native-positions.log" }.Order()))
            throw new InvalidOperationException("Incompatible cached node provenance.");
        foreach (var artifact in provenance.Artifacts)
            if (HashFile(At(NodeBaseline + "/" + artifact.Key)) != artifact.Value)
                throw new InvalidOperationException("Modified or missing cached node artifact: " + artifact.Key);
        var metrics = Read<NodeMetrics>(At(NodeBaseline + "/metrics.json"));
        if (metrics.SchemaVersion != 2 || metrics.Profile != manifest.Profile || metrics.Units != NodeUnits
            || !metrics.Nodes.Select(n => n.Id).SequenceEqual(manifest.Cases.Select(c => c.Id)))
            throw new InvalidOperationException("Incomplete cached node measurements.");
        var native = NativeNodeGlyphs(Text(At(NodeBaseline + "/native-positions.log")),
            Read<NodeFontProfile>(At("tools/TikzFontData/font-profile.json")), manifest);
        foreach (var node in metrics.Nodes)
            if (JsonSerializer.Serialize(native[node.Id], Json) != JsonSerializer.Serialize(node.Glyphs, Json))
                throw new InvalidOperationException("Cached glyph measurements differ from the independent native trace: " + node.Id);
        return metrics;
    }

    private static async Task<int> CompareNodeLayouts(NodeManifest manifest, string output)
    {
        var directory = ArtifactDirectory(output);
        ResetDirectory(directory);
        try { return await CompareNodeLayoutsCore(manifest, directory); }
        catch (CompileError error)
        {
            Write(Path.Combine(directory, "report.json"), new { schemaVersion = 1, profile = manifest.Profile,
                scope = "internal rectangle layout only", verdict = "unsupported-or-candidate-error", passed = false,
                diagnostics = new[] { error.Diagnostic } });
            Console.Error.WriteLine("Candidate node layout failed; " + Relative(Path.Combine(directory, "report.json")));
            return 3;
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            Write(Path.Combine(directory, "report.json"), new { schemaVersion = 1, profile = manifest.Profile,
                verdict = "harness-failure", passed = false, diagnostics = new[] { Sanitize(error.Message) } });
            Console.Error.WriteLine("Node harness failed; " + Relative(Path.Combine(directory, "report.json")));
            return 2;
        }
    }

    private static async Task<int> CompareNodeLayoutsCore(NodeManifest manifest, string directory)
    {
        var metrics = CachedNodes(manifest);
        foreach (var file in new[] { "metrics.json", "reference.svg", "oracle.log", "provenance.json", "native-positions.log" })
            File.Copy(At(NodeBaseline + "/" + file), Path.Combine(directory, file));
        File.Copy(At(manifest.Source), Path.Combine(directory, "source.tikz"));
        var checks = new List<NumericCheck>();
        var scenes = new List<object>();
        foreach (var (definition, native) in manifest.Cases.Zip(metrics.Nodes))
        {
            var source = new Source(definition.Label, 0, definition.Label.Length);
            var budget = new Budget(TikzLimits.Default, CancellationToken.None);
            var font = NodeFont(definition.Font);
            var nodeFont = NodeFontMetrics.Resolve(NodeFont(definition.NodeFont), budget, source);
            var queryFont = NodeFontMetrics.Resolve(TextFont.Default, budget, source);
            var dimensions = definition.Dimensions ?? NodeDimensions.Default(nodeFont, definition.LineWidthSp);
            var text = new TextLayout().Layout(new LabelParser(source, budget).Parse(), source, font,
                Enum.Parse<TextAlignment>(definition.Alignment, true), budget);
            var layout = RectangleNodeLayout.Resolve(text, dimensions, budget, source);
            var atAnchor = layout.Anchor(definition.Anchor, nodeFont, budget, source);
            var dx = definition.XSp - atAnchor.X;
            var dy = definition.YSp - atAnchor.Y;
            NodePoint Global(NodePoint point) => new(checked(point.X + dx), checked(point.Y + dy));
            var actualValues = new Dictionary<string, int> {
                ["width"] = text.WidthSp, ["height"] = text.HeightSp, ["depth"] = text.DepthSp,
                ["linewidth"] = definition.LineWidthSp, ["quad"] = nodeFont.QuadSp, ["xheight"] = nodeFont.XHeightSp,
                ["innerx"] = dimensions.InnerXSp, ["innery"] = dimensions.InnerYSp, ["outerx"] = dimensions.OuterXSp,
                ["outery"] = dimensions.OuterYSp, ["minimumwidth"] = dimensions.MinimumWidthSp, ["minimumheight"] = dimensions.MinimumHeightSp
            };
            foreach (var quantity in NodeQuantities) Check(quantity, native.Values[quantity], actualValues[quantity]);
            Check("glyphCount", native.Glyphs.Length, text.Glyphs.Length);
            for (var glyphIndex = 0; glyphIndex < Math.Min(native.Glyphs.Length, text.Glyphs.Length); glyphIndex++)
            {
                var expected = native.Glyphs[glyphIndex]; var actual = text.Glyphs[glyphIndex];
                var name = "glyph." + glyphIndex;
                checks.Add(new(definition.Id + "." + name + ".font", expected.Font, actual.FontId,
                    "identity", null, 0, expected.Font == actual.FontId));
                Check(name + ".slot", expected.Slot, actual.Slot);
                Check(name + ".x", expected.XSp, actual.XSp);
                Check(name + ".y", expected.YSp, actual.YSp);
            }
            var actualAnchors = NodeAnchorNames.ToDictionary(name => name, name => Global(layout.Anchor(name, queryFont, budget, source)));
            foreach (var name in NodeAnchorNames) PointCheck("anchor." + name, native.Anchors[name], actualAnchors[name]);
            PointCheck("background.sw", native.BackgroundSouthWest, Global(layout.BackgroundSouthWest));
            PointCheck("background.ne", native.BackgroundNorthEast, Global(layout.BackgroundNorthEast));
            scenes.Add(new { definition.Id, text = new { text.WidthSp, text.HeightSp, text.DepthSp, text.Readable, text.Lines,
                glyphs = text.Glyphs.Select(g => new { g.FontId, g.Slot, g.XSp, g.YSp, sourceSpan = new { g.Source.Offset, g.Source.Length } }) },
                dimensions, anchorsSp = actualAnchors,
                backgroundSouthWestSp = Global(layout.BackgroundSouthWest), backgroundNorthEastSp = Global(layout.BackgroundNorthEast),
                sourceMapping = "label span in trusted manifest; frontend node source mapping pending", work = budget.Work });
            void Check(string name, int expected, int actual) => checks.Add(new(definition.Id + "." + name,
                expected, actual, "sp", Math.Abs((long)expected - actual), 0, expected == actual));
            void PointCheck(string name, NodePoint expected, NodePoint actual) { Check(name + ".x", expected.X, actual.X); Check(name + ".y", expected.Y, actual.Y); }
        }
        Write(Path.Combine(directory, "actual-scene.json"), scenes);
        var git = await Process(ResolveExecutable("git"), ["rev-parse", "HEAD"], Root);
        Write(Path.Combine(directory, "candidate-provenance.json"), new { schemaVersion = 1, commit = git.Output.Trim(),
            workingTreeSha256 = await WorkingTreeFingerprint(), configuration = BuildConfiguration,
            assemblySha256 = HashFile(typeof(TikzConverter).Assembly.Location), referenceMode = "cached" });
        Write(Path.Combine(directory, "report.json"), new { schemaVersion = 1, profile = manifest.Profile,
            scope = "internal rectangle layout and native glyph positions only; public SVG and rendering gates run separately",
            passed = checks.All(c => c.Passed), verdict = checks.All(c => c.Passed) ? "pass" : "numeric-mismatch",
            checks, expectedCases = manifest.Cases.Select(c => c.Id), executedCases = scenes.Count,
            artifacts = Directory.GetFiles(directory).ToDictionary(file => Path.GetFileName(file), HashFile) });
        Console.WriteLine($"Rectangle layout: {checks.Count(c => c.Passed)}/{checks.Count} exact sp checks; {Relative(Path.Combine(directory, "report.json"))}");
        return checks.All(c => c.Passed) ? 0 : 1;
    }

    private static TextFont NodeFont(string id) => id switch
    {
        "regular-10" => TextFont.Default, "bold-10" => new(true, false, 10), "italic-10" => new(false, true, 10),
        "regular-12" => new(false, false, 12), "bold-12" => new(true, false, 12), "italic-12" => new(false, true, 12),
        _ => throw new InvalidOperationException("Unknown node font profile: " + id)
    };

    private sealed record NodeManifest(int SchemaVersion, string Profile, string Source, NodeCase[] Cases);
    private sealed record NodeCase(string Id, string Label, string Font, string NodeFont, string Alignment,
        int XSp, int YSp, string Anchor, int LineWidthSp, NodeDimensions? Dimensions);
    private sealed record NodeMetrics(int SchemaVersion, string Profile, string Units, NativeNode[] Nodes)
    { public Dictionary<string, string> FontDefinitions { get; init; } = new(StringComparer.Ordinal); }
    private sealed record NativeNode(string Id, Dictionary<string, int> Values, Dictionary<string, NodePoint> Anchors,
        NodePoint BackgroundSouthWest, NodePoint BackgroundNorthEast)
    { public NativeNodeGlyph[] Glyphs { get; init; } = []; }
    private sealed record NodeProvenance(int SchemaVersion, string Profile, Dictionary<string, string> SourceHashes, string GeneratedUtc,
        ToolIdentity[] Tools, InputIdentity[] Inputs, NodeProbeVerification ProbeVerification, Dictionary<string, string> Artifacts, string[] Commands);
    private sealed record NodeProbeVerification(bool SvgByteIdentical, bool SvgIdenticalAfterDefinitionOrderOnly, bool PictureBoxIdentical);
    private sealed record NodeFontProfile(int SchemaVersion, string Id, string LatexVersion, string DvisvgmVersion, InputFile[] Inputs, NodeFace[] Fonts);
    private sealed record NodeFace(string Id, string Tfm, int SizePt);
    private sealed record NativeNodeGlyph(string Font, int Slot, int XSp, int YSp);
    private sealed record InputFile(string Name, string Sha256);
}

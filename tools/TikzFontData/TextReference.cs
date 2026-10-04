using System.Globalization;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Lokad.TikZ;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Text;

internal static partial class FontGenerator
{
    private static async Task<int> TextReferences(string root, FontManifest fonts, string mode)
    {
        var manifestPath = Path.Combine(root, "tests/Reference/Text/cases.json");
        var manifest = JsonSerializer.Deserialize<TextManifest>(File.ReadAllText(manifestPath), Json)!;
        if (manifest.SchemaVersion != 1 || manifest.Profile != TextProfile.Id || manifest.DviTypeVersion != "MiKTeX-DVITYPE 2.9.6300 (MiKTeX 25.4)" || manifest.Cases.Length == 0
            || manifest.Cases.Select(c => c.Id).Distinct(StringComparer.Ordinal).Count() != manifest.Cases.Length)
            throw new InvalidOperationException("Invalid trusted text manifest.");
        var wrapperPath = Path.Combine(root, "tools/TikzFontData/text.tex");
        var wrapper = File.ReadAllText(wrapperPath).Replace("\r\n", "\n", StringComparison.Ordinal);
        var fontData = mode is "generate-text-reference" or "verify-text-reference"
            ? fonts.Fonts.ToDictionary(f => f.Id, f => FontData.Load(f.Id), StringComparer.Ordinal) : new Dictionary<string, FontData>(StringComparer.Ordinal);
        var fontManifestHash = Hash(File.ReadAllBytes(Path.Combine(root, "tools/TikzFontData/font-profile.json")));
        var tools = new List<object>();
        string? fontMap = null;
        if (mode is "generate-text-reference" or "verify-text-reference")
        {
            foreach (var input in fonts.Inputs)
            {
                var path = (await RunProcess("kpsewhich", [input.Name], root)).Trim();
                if (!File.Exists(path) || Hash(File.ReadAllBytes(path)) != input.Sha256)
                    throw new InvalidOperationException("Pinned text input mismatch: " + input.Name);
                if (input.Name == "lm.map") fontMap = path;
            }
            foreach (var (name, version) in new[] { ("latex", fonts.LatexVersion), ("dvisvgm", fonts.DvisvgmVersion), ("dvitype", manifest.DviTypeVersion) })
            {
                var executable = ResolveExecutable(name);
                var output = await RunProcess(executable, ["--version"], root);
                if (!output.Split('\n', StringSplitOptions.TrimEntries).Contains(version, StringComparer.Ordinal))
                    throw new InvalidOperationException("Text oracle version mismatch: " + name);
                tools.Add(new { name, version, sha256 = Hash(File.ReadAllBytes(executable)) });
            }
        }
        var reports = new List<object>();
        var failed = false;
        foreach (var c in manifest.Cases)
        {
            if (!Regex.IsMatch(c.Id, "^[a-z][a-z0-9-]*$") || !Regex.IsMatch(c.Source, "^[a-z][a-z0-9-]*$")
                || !fonts.Fonts.Any(font => font.Id == c.Font) || c.Alignment is not ("left" or "center" or "right"))
                throw new InvalidOperationException("Invalid trusted text case.");
            var sourcePath = Path.Combine(root, $"tests/Fixtures/Text/{c.Source}.label");
            var text = File.ReadAllText(sourcePath).Replace("\r\n", "\n", StringComparison.Ordinal);
            var baseline = Path.Combine(root, "tests/Reference/Text", c.Id);
            if (mode is "generate-text-reference" or "verify-text-reference")
            {
                var work = Path.Combine(root, "artifacts/text-reference-work", c.Id);
                var initial = InitialFont(c.Font);
                var font = (initial.SizePt == 10 ? "\\normalsize" : "\\large") + (initial.Bold ? "\\bfseries" : "\\mdseries") + (initial.Italic ? "\\itshape" : "\\upshape");
                var box = text.Contains("\\\\", StringComparison.Ordinal)
                    ? "\\vbox{\\let\\\\=\\cr\\halign{" + (c.Alignment is "center" or "right" ? "\\hfil" : "") + "\\ignorespaces#\\unskip" + (c.Alignment is "left" or "center" ? "\\hfil" : "") + "\\cr\n" + text + "\\cr}}"
                    : "\\hbox{\\ignorespaces " + text + "\\unskip}";
                // Native TeX alignment cells use a local line-break alias. It
                // is not a candidate rewrite of glyphs, metrics, or spacing.
                var unprobed = wrapper.Replace("@@FONT@@", font, StringComparison.Ordinal).Replace("@@BOX@@", box, StringComparison.Ordinal);
                var probed = unprobed.Replace("\\begin{document}", "\\lokadmeasuretrue\n\\begin{document}", StringComparison.Ordinal);
                foreach (var (folderName, tex) in new[] { ("plain", unprobed), ("probed", probed) })
                {
                    var folder = Path.Combine(work, folderName);
                    Directory.CreateDirectory(folder);
                    File.WriteAllText(Path.Combine(folder, "case.tex"), tex, new UTF8Encoding(false));
                    await RunProcess("latex", ["-disable-write18", "-disable-installer", "-interaction=nonstopmode", "-halt-on-error", "-recorder", "case.tex"], folder);
                    await RunProcess("dvisvgm", ["--no-fonts", "--exact-bbox", "--bbox=min", "--precision=6", "--fontmap=" + fontMap, "--cache=none", "--output=reference.svg", "case.dvi"], folder);
                }
                var oracle = XDocument.Load(Path.Combine(work, "probed/reference.svg"));
                var plain = XDocument.Load(Path.Combine(work, "plain/reference.svg"));
                var originMarker = oracle.Descendants(Svg + "g").Single(g => (string?)g.Attribute("id") == "oracle-origin");
                var origin = new TextPoint(double.Parse((string)originMarker.Attribute("data-x")!, Invariant), double.Parse((string)originMarker.Attribute("data-y")!, Invariant));
                originMarker.Remove();
                OrderTextDefinitions(oracle); OrderTextDefinitions(plain);
                if (oracle.ToString(SaveOptions.DisableFormatting) != plain.ToString(SaveOptions.DisableFormatting))
                    throw new InvalidOperationException("Text probes changed oracle output.");
                var originalBox = oracle.Root!.Attribute("viewBox")!.Value.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(s => double.Parse(s, Invariant)).ToArray();
                if (originalBox[0] - origin.X < -3 || originalBox[1] - origin.Y < -54
                    || originalBox[0] + originalBox[2] - origin.X > 447 || originalBox[1] + originalBox[3] - origin.Y > 30)
                    throw new InvalidOperationException("Text oracle ink exceeds the declared physical comparison frame.");
                var log = File.ReadAllText(Path.Combine(work, "probed/case.log")).Replace("\r\n", "\n", StringComparison.Ordinal);
                var measuredBox = Records(log, "TEXT-BOX", 3).Single();
                var plainBox = Records(File.ReadAllText(Path.Combine(work, "plain/case.log")).Replace("\r\n", "\n", StringComparison.Ordinal), "TEXT-BOX", 3).Single();
                if (!plainBox.SequenceEqual(measuredBox)) throw new InvalidOperationException("Text probes changed the TeX box.");
                var sfCodes = Records(log, "SFCODE", 2);
                if (sfCodes.Length != 256 || sfCodes.Any(row => row[1] != TextProfile.SpaceFactorCode(row[0])))
                    throw new InvalidOperationException("Pinned text space-factor codes differ from the profile.");
                var definitions = oracle.Descendants(Svg + "defs").Elements(Svg + "path").ToArray();
                var maps = new Dictionary<string, string>(StringComparer.Ordinal);
                foreach (var group in definitions.GroupBy(p => ((string)p.Attribute("id")!).Split('-')[0]))
                {
                    var matches = fontData.Values.Where(f => group.All(p => f.Glyphs[int.Parse(((string)p.Attribute("id")!).Split('-')[1], Invariant)].PathBp == (string)p.Attribute("d")!)).ToArray();
                    if (matches.Length != 1) throw new InvalidOperationException("Cannot identify the oracle's pinned font from its outlines.");
                    maps.Add(group.Key, matches[0].Id);
                }
                var glyphs = oracle.Descendants(Svg + "use").Select(use => {
                    var id = ((string)use.Attribute(Link + "href")!)[1..].Split('-');
                    return new ReferenceTextGlyph(maps[id[0]], int.Parse(id[1], Invariant),
                        double.Parse((string)use.Attribute("x")!, Invariant) - origin.X,
                        double.Parse((string)use.Attribute("y")!, Invariant) - origin.Y);
                }).ToArray();
                var dviTrace = (await RunProcess("dvitype", ["-disable-installer", "-out-mode=4", "case.dvi"], Path.Combine(work, "probed"))).Replace("\r\n", "\n", StringComparison.Ordinal);
                var native = NativeTextPositions(dviTrace, fonts);
                if (native.Glyphs.Length != glyphs.Length || native.Glyphs.Zip(glyphs).Any(pair => pair.First.Font != pair.Second.Font || pair.First.Slot != pair.Second.Slot))
                    throw new InvalidOperationException("Native DVI glyph sequence disagrees with the outlined SVG.");
                var metrics = new TextMetrics(2, manifest.Profile, measuredBox[0], measuredBox[1], measuredBox[2], origin, glyphs, native.Glyphs, maps);
                oracle.Root!.SetAttributeValue("width", "450pt");
                oracle.Root.SetAttributeValue("height", "84pt");
                oracle.Root.SetAttributeValue("viewBox", $"{(origin.X - 3).ToString("0.######", Invariant)} {(origin.Y - 54).ToString("0.######", Invariant)} 450 84");
                var artifacts = new Dictionary<string, string> {
                    ["oracle.svg"] = File.ReadAllText(Path.Combine(work, "plain/reference.svg")).Replace("\r\n", "\n", StringComparison.Ordinal),
                    ["native-positions.log"] = Regex.Replace(dviTrace, @"(?m)^' TeX output [^\n]*\n", ""),
                    ["reference.svg"] = oracle.ToString(SaveOptions.DisableFormatting) + "\n",
                    ["metrics.json"] = JsonSerializer.Serialize(metrics, Json) + "\n"
                };
                var provenance = new { schemaVersion = 1, profile = manifest.Profile,
                    caseDefinition = c, sourceSha256 = Hash(Encoding.UTF8.GetBytes(text)), wrapperSha256 = Hash(Encoding.UTF8.GetBytes(wrapper)),
                    fontManifestSha256 = fontManifestHash, tools, fontInputs = fonts.Inputs,
                    nativePositionOracle = manifest.DviTypeVersion, nativeOriginSp = new { native.XSp, native.YSp },
                    nativeTraceSha256 = Hash(Encoding.UTF8.GetBytes(dviTrace)),
                    latexInputs = RecordedTextInputs(Path.Combine(work, "probed/case.fls")),
                    probeVerification = "canonical SVG identical after removing empty origin marker and sorting only definitions; plain/probed TeX box integers identical",
                    comparisonFrame = "fixed 450 by 84 bp, baseline-relative origin; original natural crop retained in oracle.svg",
                    artifacts = artifacts.ToDictionary(p => p.Key, p => Hash(Encoding.UTF8.GetBytes(p.Value))) };
                artifacts.Add("provenance.json", JsonSerializer.Serialize(provenance, Json) + "\n");
                foreach (var artifact in artifacts)
                {
                    var path = Path.Combine(baseline, artifact.Key);
                    if (mode == "generate-text-reference") { Directory.CreateDirectory(baseline); File.WriteAllText(path, artifact.Value, new UTF8Encoding(false)); }
                    else if (artifact.Key == "oracle.svg")
                    {
                        var cached = XDocument.Load(path); var regenerated = XDocument.Parse(artifact.Value);
                        OrderTextDefinitions(cached); OrderTextDefinitions(regenerated);
                        if (cached.ToString(SaveOptions.DisableFormatting) != regenerated.ToString(SaveOptions.DisableFormatting))
                            throw new InvalidOperationException("Live original text SVG differs: " + c.Id);
                    }
                    else if (artifact.Key != "provenance.json" && (!File.Exists(path) || File.ReadAllText(path) != artifact.Value))
                        throw new InvalidOperationException("Live text reference differs: " + c.Id + "/" + artifact.Key);
                }
                Console.WriteLine(c.Id + ": independent text reference verified");
            }
            else
            {
                var verdict = await CompareText(root, c, text, baseline, wrapper, fontManifestHash, mode == "calibrate-text-reference");
                failed |= verdict != "pass";
                reports.Add(new { caseId = c.Id, verdict, report = c.Id + "/report.json" });
            }
        }
        if (mode is "compare-text" or "calibrate-text-reference")
        {
            var output = Path.Combine(root, "artifacts", mode == "compare-text" ? "text-comparisons" : "text-calibration");
            File.WriteAllText(Path.Combine(output, "suite.json"), JsonSerializer.Serialize(new { schemaVersion = 1, expectedCases = manifest.Cases.Select(c => c.Id), executedCases = reports, passed = !failed }, Json));
            if (mode == "calibrate-text-reference") SaveTextCalibration(root, manifest, output);
        }
        return failed ? 1 : 0;
    }

    private static TextFont InitialFont(string id) => new(id.StartsWith("bold", StringComparison.Ordinal), id.StartsWith("italic", StringComparison.Ordinal), id.EndsWith("12", StringComparison.Ordinal) ? 12 : 10);

    private static void OrderTextDefinitions(XDocument document)
    {
        foreach (var definitions in document.Descendants(Svg + "defs"))
        {
            if (definitions.Elements().Any(element => element.Name != Svg + "path"))
                throw new InvalidOperationException("Unexpected text oracle definition vocabulary.");
            var paths = definitions.Elements().OrderBy(path => (string?)path.Attribute("id"), StringComparer.Ordinal).ToArray();
            definitions.RemoveNodes(); definitions.Add(paths);
        }
    }

    private static object[] RecordedTextInputs(string recorder)
        => File.ReadLines(recorder).Where(line => line.StartsWith("INPUT ", StringComparison.Ordinal)).Select(line => line[6..])
            .Where(path => Path.IsPathRooted(path) && File.Exists(path)).Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(path => new { name = Path.GetFileName(path), sha256 = Hash(File.ReadAllBytes(path)) }).OrderBy(input => input.name, StringComparer.Ordinal).Cast<object>().ToArray();

    private static async Task<string> CompareText(string root, TextCase c, string text, string baseline, string wrapper, string fontManifestHash, bool calibration)
    {
        using var provenance = JsonDocument.Parse(File.ReadAllText(Path.Combine(baseline, "provenance.json")));
        var p = provenance.RootElement;
        if (p.GetProperty("sourceSha256").GetString() != Hash(Encoding.UTF8.GetBytes(text))
            || p.GetProperty("wrapperSha256").GetString() != Hash(Encoding.UTF8.GetBytes(wrapper))
            || p.GetProperty("fontManifestSha256").GetString() != fontManifestHash
            || p.GetProperty("caseDefinition").Deserialize<TextCase>(Json) != c)
            throw new InvalidOperationException("Cached text profile or input changed; regenerate explicitly.");
        foreach (var artifact in p.GetProperty("artifacts").EnumerateObject())
            if (artifact.Value.GetString() != Hash(File.ReadAllBytes(Path.Combine(baseline, artifact.Name))))
                throw new InvalidOperationException("Cached text artifact changed: " + artifact.Name);
        var metrics = JsonSerializer.Deserialize<TextMetrics>(File.ReadAllText(Path.Combine(baseline, "metrics.json")), Json)!;
        if (metrics.SchemaVersion != 2 || metrics.Profile != TextProfile.Id) throw new InvalidOperationException("Incompatible native text metrics.");
        var origin = new Source(text, 0, text.Length);
        // Calibration consumes native oracle positions and original outlines;
        // it never calls the candidate parser or text-layout implementation.
        MeasuredText measured;
        if (calibration) measured = new(metrics.WidthSp, metrics.HeightSp, metrics.DepthSp, text,
            metrics.NativeGlyphs.Select(g => new PlacedGlyph(g.Font, g.Slot, g.XSp, g.YSp, origin)).ToArray(), []);
        else
        {
            var budget = new Budget(TikzLimits.Default, CancellationToken.None);
            var program = new LabelParser(origin, budget).Parse();
            measured = new TextLayout().Layout(program, origin, InitialFont(c.Font), Enum.Parse<TextAlignment>(c.Alignment, true), budget);
        }
        var checks = new List<object>();
        var passed = true;
        void Check(string name, double expected, double actual, double tolerance, string units)
        {
            var error = Math.Abs(expected - actual); var ok = error <= tolerance;
            passed &= ok; checks.Add(new { name, expected, actual, absoluteError = error, tolerance, units, passed = ok });
        }
        Check("box.width", metrics.WidthSp, measured.WidthSp, 0, "TeX sp");
        Check("box.height", metrics.HeightSp, measured.HeightSp, 0, "TeX sp");
        Check("box.depth", metrics.DepthSp, measured.DepthSp, 0, "TeX sp");
        Check("glyphCount", metrics.NativeGlyphs.Length, measured.Glyphs.Length, 0, "count");
        for (var index = 0; index < Math.Min(metrics.NativeGlyphs.Length, measured.Glyphs.Length); index++)
        {
            var expected = metrics.NativeGlyphs[index]; var actual = measured.Glyphs[index];
            Check($"glyph.{index}.slot", expected.Slot, actual.Slot, 0, "EC slot");
            var sameFont = expected.Font == actual.FontId; passed &= sameFont;
            checks.Add(new { name = $"glyph.{index}.font", expected = expected.Font, actual = actual.FontId, passed = sameFont });
            Check($"glyph.{index}.x", expected.XSp, actual.XSp, 0, "TeX sp");
            Check($"glyph.{index}.y", expected.YSp, actual.YSp, 0, "TeX sp");
        }
        var bundle = Path.Combine(root, "artifacts", calibration ? "text-calibration" : "text-comparisons", c.Id);
        var artifactRoot = Path.GetFullPath(Path.Combine(root, "artifacts")) + Path.DirectorySeparatorChar;
        if (!Path.GetFullPath(bundle).StartsWith(artifactRoot, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal))
            throw new InvalidOperationException("Text artifact directory escapes the owned output root.");
        if (Directory.Exists(bundle)) Directory.Delete(bundle, true);
        Directory.CreateDirectory(bundle);
        File.Copy(Path.Combine(baseline, "reference.svg"), Path.Combine(bundle, "reference.svg"), true);
        File.Copy(Path.Combine(baseline, "oracle.svg"), Path.Combine(bundle, "oracle.svg"), true);
        File.Copy(Path.Combine(baseline, "provenance.json"), Path.Combine(bundle, "provenance.json"), true);
        File.WriteAllText(Path.Combine(bundle, "source.tikz"), text);
        var defs = new XElement(Svg + "defs");
        foreach (var group in calibration ? [] : measured.Glyphs.GroupBy(g => g.FontId))
        {
            var font = FontData.Load(group.Key);
            foreach (var slot in group.Select(g => g.Slot).Distinct())
                defs.Add(new XElement(Svg + "path", new XAttribute("id", $"{group.Key}-{slot}"), new XAttribute("d", font.Glyphs[slot].PathBp)));
        }
        var uses = measured.Glyphs.Select((g, index) => new XElement(Svg + "use",
            new XAttribute("id", "glyph-" + index), new XAttribute("href", $"#{g.FontId}-{g.Slot}"),
            new XAttribute("x", (g.XSp * SpToBp).ToString("0.######", Invariant)),
            new XAttribute("y", (g.YSp * SpToBp).ToString("0.######", Invariant))));
        var actualSvg = new XDocument(new XElement(Svg + "svg", new XAttribute("width", "450pt"),
            new XAttribute("height", "84pt"), new XAttribute("viewBox", "-3 -54 450 84"), defs, new XElement(Svg + "g", uses)));
        if (calibration)
        {
            actualSvg = XDocument.Load(Path.Combine(baseline, "reference.svg"));
            actualSvg.Root!.SetAttributeValue("viewBox", "-3 -54 450 84");
            var oracleUses = actualSvg.Descendants(Svg + "use").ToArray();
            for (var index = 0; index < oracleUses.Length; index++)
            {
                oracleUses[index].SetAttributeValue("id", "glyph-" + index);
                oracleUses[index].SetAttributeValue("x", (metrics.NativeGlyphs[index].XSp * SpToBp).ToString("0.######", Invariant));
                oracleUses[index].SetAttributeValue("y", (metrics.NativeGlyphs[index].YSp * SpToBp).ToString("0.######", Invariant));
            }
        }
        File.WriteAllText(Path.Combine(bundle, "actual.svg"), actualSvg.ToString(SaveOptions.DisableFormatting));
        File.WriteAllText(Path.Combine(bundle, "actual-scene.json"), JsonSerializer.Serialize(new { units = "CSS pixels; y down; last-line baseline origin",
            layout = new { measured.WidthSp, measured.HeightSp, measured.DepthSp, measured.Readable, measured.Lines,
                glyphs = measured.Glyphs.Select(g => new { g.FontId, g.Slot, g.XSp, g.YSp }) },
            paths = measured.Glyphs.Select((g, index) => new { semanticId = "label-glyph-" + index, svgElementId = "glyph-" + index, source = g.Source.Location,
                inkBounds = new { minX = (g.XSp - 4 * 65536) * SpToBp * 4 / 3, maxX = (g.XSp + 16 * 65536) * SpToBp * 4 / 3,
                    minY = (g.YSp - 16 * 65536) * SpToBp * 4 / 3, maxY = (g.YSp + 8 * 65536) * SpToBp * 4 / 3 } }) }, Json));
        File.WriteAllText(Path.Combine(bundle, "comparison-input.json"), JsonSerializer.Serialize(new { schemaVersion = 1, caseId = c.Id, referenceMode = "cached",
            actualLabel = calibration ? "Independent native DVI positions with original oracle outlines" : "Managed text layout prototype",
            rasterProfile = calibration ? null : "text", actualUnits = "bp", referenceOriginBp = metrics.OriginBp,
            numericTolerancePixels = 0, numeric = new { passed, checks } }, Json));
        File.WriteAllText(Path.Combine(bundle, calibration ? "calibration-provenance.json" : "candidate-provenance.json"), JsonSerializer.Serialize(new { schemaVersion = 1,
            generatorAssemblySha256 = Hash(File.ReadAllBytes(typeof(FontGenerator).Assembly.Location)),
            version = typeof(FontGenerator).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion,
            fontProfile = TextProfile.Id, candidateCompilerInvoked = !calibration,
            scope = calibration ? "Original oracle outlines placed at DVItype integer positions; no candidate font data or layout"
                : "Text hbox/alignment layout in bp; node geometry and converter CSS placement remain separate" }, Json));
        var result = await RunProcess("node", [Path.Combine(root, "tools/TikzVisual/compare.mjs"), bundle], root, allowMismatch: true);
        Console.WriteLine(result.Trim());
        using var report = JsonDocument.Parse(File.ReadAllText(Path.Combine(bundle, "report.json")));
        return report.RootElement.GetProperty("verdict").GetString()!;
    }

    private static void SaveTextCalibration(string root, TextManifest manifest, string output)
    {
        var cases = new List<object>();
        foreach (var c in manifest.Cases)
        {
            using var report = JsonDocument.Parse(File.ReadAllText(Path.Combine(output, c.Id, "report.json")));
            using var provenance = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "tests/Reference/Text", c.Id, "provenance.json")));
            var metrics = JsonSerializer.Deserialize<TextMetrics>(File.ReadAllText(Path.Combine(root, "tests/Reference/Text", c.Id, "metrics.json")), Json)!;
            var error = metrics.Glyphs.Zip(metrics.NativeGlyphs).Max(pair => Math.Max(Math.Abs(pair.First.XBp - pair.Second.XSp * SpToBp), Math.Abs(pair.First.YBp - pair.Second.YSp * SpToBp)) * 4 / 3);
            cases.Add(new { caseId = c.Id, maxSvgDriverPositionErrorCssPixels = error,
                sourceSha256 = provenance.RootElement.GetProperty("sourceSha256").GetString(),
                referenceSha256 = report.RootElement.GetProperty("artifacts").GetProperty("reference.svg").GetString(),
                nativePositionSvgSha256 = report.RootElement.GetProperty("artifacts").GetProperty("actual.svg").GetString(),
                metricsSha256 = Hash(File.ReadAllBytes(Path.Combine(root, "tests/Reference/Text", c.Id, "metrics.json"))),
                numeric = report.RootElement.GetProperty("numeric").Clone(), primary = report.RootElement.GetProperty("primary").Clone(),
                renderer = report.RootElement.GetProperty("renderer").Clone() });
        }
        var sources = new[] { "tools/TikzFontData/TextReference.cs", "tools/TikzFontData/NativeTextPositions.cs", "tools/TikzVisual/compare.mjs", "tools/TikzVisual/browser-profile.json", "tools/TikzFontData/text.tex" }
            .ToDictionary(path => path, path => Hash(Encoding.UTF8.GetBytes(File.ReadAllText(Path.Combine(root, path)).Replace("\r\n", "\n", StringComparison.Ordinal))));
        File.WriteAllText(Path.Combine(output, "calibration-evidence.json"), JsonSerializer.Serialize(new { schemaVersion = 1,
            experiment = "Original dvisvgm SVG versus its original outlines at independent DVItype integer glyph positions",
            candidateCompilerInvoked = false, candidateFontOutlinesUsed = false, fontProfile = manifest.Profile, nativePositionOracle = manifest.DviTypeVersion,
            scope = "Fixed baseline-relative bp camera; not converter CSS placement, node layout, or PDF text conformance",
            sourceHashesLfUtf8 = sources, cases }, Json));
    }
}

internal sealed record TextManifest(int SchemaVersion, string Profile, string DviTypeVersion, TextCase[] Cases);
internal sealed record TextCase(string Id, string Source, string Font, string Alignment);
internal sealed record TextPoint(double X, double Y);
internal sealed record ReferenceTextGlyph(string Font, int Slot, double XBp, double YBp);
internal sealed record NativeTextGlyph(string Font, int Slot, int XSp, int YSp);
internal sealed record TextMetrics(int SchemaVersion, string Profile, int WidthSp, int HeightSp, int DepthSp,
    TextPoint OriginBp, ReferenceTextGlyph[] Glyphs, NativeTextGlyph[] NativeGlyphs, Dictionary<string, string> FontDefinitions);

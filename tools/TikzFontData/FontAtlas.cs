using System.Globalization;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using Lokad.TikZ.Text;

internal static partial class FontGenerator
{
    private static readonly XNamespace Svg = "http://www.w3.org/2000/svg";
    private static readonly XNamespace Link = "http://www.w3.org/1999/xlink";
    private const double SpToBp = 72.0 / (72.27 * 65536);

    // Both atlases get the same declared frame; no fitting, origin inference,
    // or baseline adjustment is allowed. This experiment validates glyph
    // reconstruction and atlas baselines, not automatic TikZ picture bounds.
    private static string FramedOracle(XDocument svg)
    {
        var result = new XDocument(svg);
        var root = result.Root!;
        root.SetAttributeValue("width", "390pt");
        root.SetAttributeValue("height", "540pt");
        root.SetAttributeValue("viewBox", "-3 -3 390 540");
        return result.ToString(SaveOptions.DisableFormatting) + "\n";
    }

    private static AtlasPosition[] Positions(FontData font)
    {
        var sizeSp = font.DesignSizeFix / 16;
        var result = new List<AtlasPosition>();
        var topSp = 0;
        for (var row = 0; row < 16; row++)
        {
            var glyphs = font.Glyphs.Skip(row * 16).Take(16).ToArray();
            var height = glyphs.Max(g => Math.Max(0, FontData.ScaleFix(g.HeightFix, sizeSp)));
            var depth = glyphs.Max(g => Math.Max(0, FontData.ScaleFix(g.DepthFix, sizeSp)));
            var baseline = topSp + height;
            for (var column = 0; column < 16; column++)
                result.Add(new(row * 16 + column, column * 24 * 65536, baseline));
            topSp = baseline + depth + 16 * 65536;
        }
        return result.ToArray();
    }

    private static async Task<int> CompareAtlases(string root, FontManifest manifest)
    {
        var suite = new List<object>();
        var failed = false;
        var provenance = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "src/Lokad.TikZ/Resources/Fonts/provenance.json")));
        using (provenance)
        {
            var wrapper = File.ReadAllText(Path.Combine(root, "tools/TikzFontData/atlas.tex")).Replace("\r\n", "\n", StringComparison.Ordinal);
            if (provenance.RootElement.GetProperty("manifestSha256").GetString() != Hash(File.ReadAllBytes(Path.Combine(root, "tools/TikzFontData/font-profile.json")))
                || provenance.RootElement.GetProperty("wrapperSha256").GetString() != Hash(Encoding.UTF8.GetBytes(wrapper)))
                throw new InvalidOperationException("The cached font manifest changed; regenerate explicitly.");
            var records = provenance.RootElement.GetProperty("fonts").EnumerateArray().ToDictionary(r => r.GetProperty("font").GetString()!);
            foreach (var face in manifest.Fonts)
            {
                var font = FontData.Load(face.Id);
                var referenceDir = Path.Combine(root, "tests/Reference/Fonts");
                var referencePath = Path.Combine(referenceDir, face.Id + ".svg");
                var metricPath = Path.Combine(referenceDir, face.Id + ".json");
                var resourcePath = Path.Combine(root, $"src/Lokad.TikZ/Resources/Fonts/LokadTikzText-{face.Id}.json");
                var record = records[face.Id];
                if (Hash(File.ReadAllBytes(resourcePath)) != record.GetProperty("resourceSha256").GetString()
                    || Hash(File.ReadAllBytes(metricPath)) != record.GetProperty("metricsSha256").GetString()
                    || Hash(File.ReadAllBytes(referencePath)) != record.GetProperty("atlasSha256").GetString()
                    || Hash(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(font, CompactJson) + "\n")) != record.GetProperty("resourceSha256").GetString())
                    throw new InvalidOperationException("Cached font data or oracle changed; regenerate explicitly.");
                var reference = XDocument.Load(referencePath);
                var group = reference.Root!.Elements(Svg + "g").Single();
                if (group.Attributes().Any(a => a.Name.LocalName != "id") || group.Elements().Any(e => e.Name != Svg + "use"))
                    throw new InvalidOperationException("Unexpected oracle atlas transform.");
                var uses = group.Elements(Svg + "use").ToArray();
                if (uses.Length != 256) throw new InvalidOperationException("Incomplete oracle glyph atlas.");
                var positions = Positions(font);
                var checks = new List<object>();
                var passed = true;
                void Check(string name, double expected, double actual, double tolerance, string units)
                {
                    var error = Math.Abs(expected - actual);
                    var ok = error <= tolerance;
                    passed &= ok;
                    checks.Add(new { name, expected, actual, absoluteError = error, tolerance, units, passed = ok });
                }
                using var metricsDocument = JsonDocument.Parse(File.ReadAllText(metricPath));
                var sizeSp = font.DesignSizeFix / 16;
                var glyphRecords = metricsDocument.RootElement.GetProperty("glyphs");
                var pairRecords = metricsDocument.RootElement.GetProperty("pairs");
                Check("glyphMetricCount", 256, glyphRecords.GetArrayLength(), 0, "count");
                Check("pairMetricCount", font.Pairs.Length, pairRecords.GetArrayLength(), 0, "count");
                Check("fontParameterCount", font.ParametersFix.Length, metricsDocument.RootElement.GetProperty("parameters").GetArrayLength(), 0, "count");
                foreach (var row in glyphRecords.EnumerateArray())
                {
                    var slot = row[0].GetInt32();
                    var glyph = font.Glyphs[slot];
                    var values = new[] { FontData.ScaleFix(glyph.AdvanceFix, sizeSp), Math.Max(0, FontData.ScaleFix(glyph.HeightFix, sizeSp)),
                        Math.Max(0, FontData.ScaleFix(glyph.DepthFix, sizeSp)), FontData.ScaleFix(glyph.AdvanceFix, sizeSp),
                        FontData.ScaleFix(glyph.HeightFix, sizeSp), FontData.ScaleFix(glyph.DepthFix, sizeSp), FontData.ScaleFix(glyph.ItalicFix, sizeSp) };
                    for (var column = 0; column < values.Length; column++)
                        Check($"glyph.{slot}.metric.{column}", row[column + 1].GetInt32(), values[column], 0, "TeX sp");
                }
                var index = 0;
                foreach (var p in font.Pairs)
                {
                    var row = pairRecords[index++];
                    var left = font.Glyphs[p.Ligature ?? p.Left];
                    var right = p.Ligature.HasValue ? left : font.Glyphs[p.Right];
                    var width = p.Ligature.HasValue ? FontData.ScaleFix(left.AdvanceFix, sizeSp)
                        : FontData.ScaleFix(left.AdvanceFix, sizeSp) + FontData.ScaleFix(right.AdvanceFix, sizeSp) + FontData.ScaleFix(p.KernFix!.Value, sizeSp);
                    var height = Math.Max(0, Math.Max(FontData.ScaleFix(left.HeightFix, sizeSp), FontData.ScaleFix(right.HeightFix, sizeSp)));
                    var depth = Math.Max(0, Math.Max(FontData.ScaleFix(left.DepthFix, sizeSp), FontData.ScaleFix(right.DepthFix, sizeSp)));
                    Check($"pair.{p.Left}.{p.Right}.left", row[0].GetInt32(), p.Left, 0, "slot");
                    Check($"pair.{p.Left}.{p.Right}.right", row[1].GetInt32(), p.Right, 0, "slot");
                    Check($"pair.{p.Left}.{p.Right}.width", row[2].GetInt32(), width, 0, "TeX sp");
                    Check($"pair.{p.Left}.{p.Right}.height", row[3].GetInt32(), height, 0, "TeX sp");
                    Check($"pair.{p.Left}.{p.Right}.depth", row[4].GetInt32(), depth, 0, "TeX sp");
                }
                foreach (var row in metricsDocument.RootElement.GetProperty("parameters").EnumerateArray())
                {
                    var parameter = row[0].GetInt32() - 1;
                    Check($"font.parameter.{parameter + 1}", row[1].GetInt32(), parameter == 0 ? font.ParametersFix[0] >> 4 : FontData.ScaleFix(font.ParametersFix[parameter], sizeSp), 0, "TeX sp");
                }
                var definitions = new XElement(Svg + "defs", font.Glyphs.Select(g => new XElement(Svg + "path",
                    new XAttribute("id", $"font-{g.Slot}"), new XAttribute("d", g.PathBp))));
                var actualGroup = new XElement(Svg + "g");
                foreach (var p in positions)
                {
                    var use = uses[p.Slot];
                    if ((string?)use.Attribute(Link + "href") != $"#g0-{p.Slot}") throw new InvalidOperationException("Oracle atlas ordering changed.");
                    foreach (var (axis, expected, measured) in new[] {
                        ("x", p.XSp * SpToBp, double.Parse((string)use.Attribute("x")!, Invariant)),
                        ("y", p.YSp * SpToBp, double.Parse((string)use.Attribute("y")!, Invariant)) })
                    {
                        Check($"glyph.{p.Slot}.baseline.{axis}", measured * 4 / 3, expected * 4 / 3, 0.000001, "CSS pixels");
                    }
                    actualGroup.Add(new XElement(Svg + "use", new XAttribute("id", $"glyph-{p.Slot}"), new XAttribute("href", $"#font-{p.Slot}"),
                        new XAttribute("x", (p.XSp * SpToBp).ToString("0.######", Invariant)), new XAttribute("y", (p.YSp * SpToBp).ToString("0.######", Invariant))));
                }
                var actual = new XDocument(new XElement(Svg + "svg", new XAttribute("width", "390pt"), new XAttribute("height", "540pt"),
                    new XAttribute("viewBox", "-3 -3 390 540"), definitions, actualGroup));
                var bundle = Path.Combine(root, "artifacts/font-comparisons", face.Id);
                Directory.CreateDirectory(bundle);
                File.Copy(referencePath, Path.Combine(bundle, "reference.svg"), true);
                File.WriteAllText(Path.Combine(bundle, "actual.svg"), actual.ToString(SaveOptions.DisableFormatting));
                File.Copy(Path.Combine(root, "tools/TikzFontData/atlas.tex"), Path.Combine(bundle, "source.tikz"), true);
                File.WriteAllText(Path.Combine(bundle, "actual-scene.json"), JsonSerializer.Serialize(new { units = "CSS pixels; y down; atlas origin (0,0)",
                    paths = positions.Select(p => new { semanticId = "font-slot-" + p.Slot, svgElementId = "glyph-" + p.Slot,
                        source = new { font = face.Id, slot = p.Slot, name = font.Glyphs[p.Slot].Name },
                        inkBounds = new { minX = (p.XSp - 4 * 65536) * SpToBp * 4 / 3, maxX = (p.XSp + 24 * 65536) * SpToBp * 4 / 3,
                            minY = (p.YSp - 16 * 65536) * SpToBp * 4 / 3, maxY = (p.YSp + 8 * 65536) * SpToBp * 4 / 3 } }) }, Json));
                File.WriteAllText(Path.Combine(bundle, "comparison-input.json"), JsonSerializer.Serialize(new { schemaVersion = 1,
                    caseId = "font-atlas-" + face.Id, referenceMode = "cached", actualLabel = "Bundled font atlas prototype",
                    actualUnits = "bp", referenceOriginBp = new { x = 0, y = 0 }, numericTolerancePixels = 0.000001, numeric = new { passed, checks } }, Json));
                File.WriteAllText(Path.Combine(bundle, "font-provenance.json"), record.GetRawText());
                File.WriteAllText(Path.Combine(bundle, "candidate-provenance.json"), JsonSerializer.Serialize(new {
                    schemaVersion = 1, fontDataAssemblySha256 = Hash(File.ReadAllBytes(typeof(FontData).Assembly.Location)),
                    generatorAssemblySha256 = Hash(File.ReadAllBytes(typeof(FontGenerator).Assembly.Location)),
                    fontDataAssemblyVersion = typeof(FontData).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion,
                    generatorSources = new[] { "tools/TikzFontData/Program.cs", "tools/TikzFontData/FontAtlas.cs" }
                        .ToDictionary(p => p, p => Hash(File.ReadAllBytes(Path.Combine(root, p)))),
                    resourceSha256 = record.GetProperty("resourceSha256").GetString(),
                    coordinateUnits = "bp; baseline-relative glyph outlines", frame = "fixed physical atlas; no fitting",
                    validationScope = "font-data reconstruction and atlas baseline placement; no node layout or natural ink bounds" }, Json));
                var output = await RunProcess("node", [Path.Combine(root, "tools/TikzVisual/compare.mjs"), bundle], root, allowMismatch: true);
                Console.WriteLine(output.Trim());
                using var report = JsonDocument.Parse(File.ReadAllText(Path.Combine(bundle, "report.json")));
                var verdict = report.RootElement.GetProperty("verdict").GetString();
                failed |= verdict != "pass";
                suite.Add(new { caseId = "font-atlas-" + face.Id, verdict, report = face.Id + "/report.json" });
            }
        }
        File.WriteAllText(Path.Combine(root, "artifacts/font-comparisons/suite.json"), JsonSerializer.Serialize(new { schemaVersion = 1,
            expectedCases = manifest.Fonts.Select(f => "font-atlas-" + f.Id), executedCases = suite, passed = !failed }, Json));
        return failed ? 1 : 0;
    }

    private sealed record AtlasPosition(int Slot, int XSp, int YSp);
}

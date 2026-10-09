using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using TikzShapeComparison;

// Oracle-only reconstruction. This project neither references nor invokes Lokad.TikZ.
internal static partial class Program
{
    private const string Baseline = "tests/Reference/NodeShapes/native";
    private const double SpToCss = 96 / (72.27 * 65536);
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private static string root = "";
    private sealed record Serialization(string Quantity, double Native, double Serialized, string Unit, double Error, double Limit, bool Passed);

    private static async Task<int> Main(string[] args)
    {
        try
        {
            if ((args.Length != 1 && (args.Length != 3 || args[1] != "--out")) || args[0] is not ("derive-svg" or "derive-math-events"))
                throw new InvalidOperationException("Usage: dotnet run --project tools/TikzShapeCalibration -c Release -- derive-svg|derive-math-events [--out artifacts/...]");
            root = FindRoot();
            var output = (args.Length == 1 ? At(args[0] == "derive-svg" ? "artifacts/node-shape-calibration" : "artifacts/math-label-native-events")
                : Path.GetFullPath(args[2], root)).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            Require(output.StartsWith(At("artifacts") + Path.DirectorySeparatorChar, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal), "Calibration output must be a directory inside artifacts/.");
            for (var current = new DirectoryInfo(output); current is not null && current.FullName != root; current = current.Parent)
                if (current.Exists && (current.Attributes & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException("Calibration output must not cross a symlink or junction.");
            Directory.CreateDirectory(output);
            var artifacts = new List<string>();
            File.Delete(Out("derivation.json"));
            if (args[0] == "derive-math-events")
            {
                DeriveMathEvents(output, artifacts, Copy, Write);
                return 0;
            }
            var configuration = Directory.GetParent(AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar))!.Name;
            var verifierAssembly = At($"tools/TikzShapeReference/bin/{configuration}/net10.0/TikzShapeReference.dll");
            var verifierHash = Hash(verifierAssembly);
            var cachedCheck = await CheckCached(verifierAssembly);
            Require(Hash(verifierAssembly) == verifierHash, "Native cached verifier changed during execution.");
            using var metrics = Read(Baseline + "/metrics.json");
            using var cases = Read("tests/Reference/NodeShapes/cases.json");
            var native = metrics.RootElement;
            Require(native.GetProperty("schemaVersion").GetInt32() == 1 && native.GetProperty("profile").GetString() == "pgf-3.1.11a-circle-ellipse-nodes-sp-v1", "Unknown native shape measurement profile.");
            var nodes = native.GetProperty("nodes").EnumerateArray().ToArray();
            var ids = cases.RootElement.GetProperty("cases").EnumerateArray().Select(n => n.GetProperty("id").GetString()!).ToArray();
            Require(nodes.Length == 28 && nodes.Select(n => n.GetProperty("id").GetString()).SequenceEqual(ids), "Native shape coverage changed.");
            var originalText = File.ReadAllText(At(Baseline + "/reference.svg"));
            using var xml = XmlReader.Create(new StringReader(originalText), new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = 2_000_000 });
            var original = XDocument.Load(xml);
            XNamespace svg = "http://www.w3.org/2000/svg";
            var originalRoot = original.Root ?? throw new InvalidOperationException("Missing original SVG.");
            Require(originalRoot.Name == svg + "svg", "Unknown SVG namespace.");
            var view = originalRoot.Attribute("viewBox")!.Value.Split(' ').Select(Number).ToArray();
            Require(view.Length == 4 && view.All(double.IsFinite) && view[2] > 0 && view[3] > 0, "Invalid original root frame.");
            Require(Number(originalRoot.Attribute("width")!.Value.Replace("pt", "", StringComparison.Ordinal)) == view[2]
                && Number(originalRoot.Attribute("height")!.Value.Replace("pt", "", StringComparison.Ordinal)) == view[3], "Original root size differs from its viewBox.");
            var originMatch = Regex.Match(originalText, @"<g stroke-miterlimit='10' transform='translate\(([-\d.]+),([-\d.]+)\)scale\(0\.996264,-0\.996264\)'>");
            Require(originMatch.Success, "Missing original native driver origin.");
            var originX = Number(originMatch.Groups[1].Value); var originY = Number(originMatch.Groups[2].Value);
            var glyphs = NativeGlyphTrace.Read(File.ReadAllText(At(Baseline + "/native-positions.log")), File.ReadAllText(At("tools/TikzFontData/font-profile.json")), ids, originalText,
                Directory.EnumerateFiles(At("tests/Reference/NodeShapes/fonts"), "*.tfm").ToDictionary(f => Path.GetFileName(f), File.ReadAllBytes, StringComparer.Ordinal));
            var paths = original.Descendants(svg + "path").Where(p => !p.Ancestors(svg + "defs").Any()).ToArray();
            var uses = original.Descendants(svg + "use").ToArray();
            Require(paths.Length == 28 && uses.Length == 70 && glyphs.Nodes.Sum(n => n.Glyphs.Length) == 70, "Original painting coverage changed.");
            // Do not infer order from the candidate or regroup all backgrounds before all labels.
            var expectedOrder = new List<XElement>(); var used = 0;
            for (var i = 0; i < nodes.Length; i++) { expectedOrder.Add(paths[i]); expectedOrder.AddRange(uses.Skip(used).Take(glyphs.Nodes[i].Glyphs.Length)); used += glyphs.Nodes[i].Glyphs.Length; }
            Require(original.Descendants().Where(e => paths.Contains(e) || uses.Contains(e)).SequenceEqual(expectedOrder), "Unexpected native paint order.");
            foreach (var file in new[] { "reference.svg", "plain-reference.svg", "metrics.json", "native-positions.log", "oracle.log", "plain-oracle.log", "probes.tex", "provenance.json" }) Copy(Baseline + "/" + file, file);
            Copy("tests/Reference/NodeShapes/cases.json", "cases.json"); Copy("tests/Reference/NodeShapes/oracle-profile.json", "oracle-profile.json");
            Copy("tools/TikzFontData/font-profile.json", "font-profile.json"); Copy(cases.RootElement.GetProperty("source").GetString()!, "source.tikz");
            foreach (var file in Directory.EnumerateFiles(At("tests/Reference/NodeShapes/fonts"), "*.tfm")) Copy(Path.GetRelativePath(root, file), "fonts/" + Path.GetFileName(file));
            Write("native-glyphs.json", glyphs);
            var variants = new List<object>();
            foreach (var (mode, decimals, deltaSp) in new[] { ("native-css-12", 12, 0), ("native-css-6", 6, 0), ("sp-plus", 6, 4), ("sp-minus", 6, -4) })
            {
                var checks = new List<Serialization>(); var delta = deltaSp * SpToCss; var pad = Math.Abs(delta);
                var derived = new XElement(svg + "svg", new XAttribute("width", Format(view[2] * 4 / 3 + 2 * pad, "frame.width") + "px"),
                    new XAttribute("height", Format(view[3] * 4 / 3 + 2 * pad, "frame.height") + "px"),
                    new XAttribute("viewBox", string.Join(' ', new[] { (view[0] - originX) * 4 / 3 - pad, (view[1] - originY) * 4 / 3 - pad, view[2] * 4 / 3 + 2 * pad, view[3] * 4 / 3 + 2 * pad }.Select((v, i) => Format(v, "frame.viewBox." + i)))));
                var definitions = new XElement(svg + "defs", original.Descendants(svg + "defs").Elements(svg + "path").Select(p => new XElement(p)));
                derived.Add(definitions); var useIndex = 0;
                for (var i = 0; i < nodes.Length; i++)
                {
                    var n = nodes[i]; var id = ids[i]; var tokens = n.GetProperty("path").EnumerateArray().ToArray();
                    Require(tokens.Length == 15 && tokens[0].GetProperty("kind").GetString() == "move" && tokens[13].GetProperty("kind").GetString() == "close" && tokens[14].GetProperty("kind").GetString() == "move", "Unexpected native curved-node path vocabulary.");
                    var data = new StringBuilder();
                    for (var t = 0; t < tokens.Length; t++)
                    {
                        var kind = tokens[t].GetProperty("kind").GetString();
                        if (kind == "close") { data.Append('Z'); continue; }
                        if (kind == "move") data.Append('M');
                        else if (kind == "control1") { Require(t + 2 < tokens.Length && tokens[t + 1].GetProperty("kind").GetString() == "control2" && tokens[t + 2].GetProperty("kind").GetString() == "curve", "Invalid native cubic."); data.Append('C'); }
                        else Require(kind is "control2" or "curve", "Unknown native soft path token.");
                        var p = tokens[t].GetProperty("point");
                        data.Append(Format(p.GetProperty("xSp").GetInt32() * SpToCss + delta, id + ".path." + t + ".x")).Append(' ')
                            .Append(Format(-p.GetProperty("ySp").GetInt32() * SpToCss - delta, id + ".path." + t + ".y")).Append(' ');
                    }
                    Require(Inherited(paths[i], "fill", "black") == "none" && Inherited(paths[i], "stroke", "none") == "#000", "Calibration currently requires the trusted black outline fixture.");
                    derived.Add(new XElement(svg + "path", new XAttribute("id", "native-shape-" + id), new XAttribute("d", data.ToString().TrimEnd()),
                        new XAttribute("fill", "none"), new XAttribute("stroke", "#000"), new XAttribute("stroke-width", Format(n.GetProperty("values").GetProperty("linewidth").GetInt32() * SpToCss, id + ".width")),
                        new XAttribute("stroke-linecap", Inherited(paths[i], "stroke-linecap", "butt")), new XAttribute("stroke-linejoin", Inherited(paths[i], "stroke-linejoin", "miter")), new XAttribute("stroke-miterlimit", Inherited(paths[i], "stroke-miterlimit", "4"))));
                    var frame = n.GetProperty("frame"); var a = frame.GetProperty("a").GetDouble(); var b = frame.GetProperty("b").GetDouble(); var c = frame.GetProperty("c").GetDouble(); var d = frame.GetProperty("d").GetDouble();
                    for (var g = 0; g < glyphs.Nodes[i].Glyphs.Length; g++)
                    {
                        var glyph = glyphs.Nodes[i].Glyphs[g]; var originalUse = uses[useIndex]; var href = originalUse.Attributes().Single(a => a.Name.LocalName == "href").Value;
                        var parts = href.TrimStart('#').Split('-');
                        Require(parts.Length == 2 && int.Parse(parts[1], CultureInfo.InvariantCulture) == glyph.Slot && glyphs.SvgFontDefinitions[parts[0]] == glyph.Font
                            && definitions.Elements().Any(p => p.Attribute("id")?.Value == href[1..]), "Original glyph identity mismatch.");
                        Require(Inherited(originalUse, "fill", "black") == "#000" && Inherited(originalUse, "stroke", "none") == "none", "Unexpected glyph paint.");
                        var x = (frame.GetProperty("eSp").GetInt32() + a * glyph.XSp - c * glyph.YSp) * SpToCss + delta;
                        var y = -(frame.GetProperty("fSp").GetInt32() + b * glyph.XSp - d * glyph.YSp) * SpToCss - delta;
                        var prefix = id + ".glyph." + g;
                        derived.Add(new XElement(svg + "use", new XAttribute("id", "native-glyph-" + useIndex++), new XAttribute("href", href),
                            new XAttribute("transform", "matrix(" + string.Join(' ', new[] { a * 4 / 3, -b * 4 / 3, -c * 4 / 3, d * 4 / 3, x, y }.Select((v, j) => Format(v, prefix + ".matrix." + j, j < 4 ? "coefficient" : "CSS px"))) + ")"), new XAttribute("fill", "#000"), new XAttribute("stroke", "none")));
                    }
                }
                Require(useIndex == 70 && checks.All(c => c.Passed), "Independent reconstruction serialization failed.");
                Save(mode + ".svg", new XDocument(derived).ToString(SaveOptions.DisableFormatting));
                variants.Add(new { mode, decimals, deltaSp, svg = mode + ".svg", serialization = new { passed = true, checks } });
                string Format(double v, string name, string unit = "CSS px")
                {
                    Require(double.IsFinite(v), "Nonfinite native quantity."); var limit = .5 * Math.Pow(10, -decimals) + 2e-13;
                    var text = (Math.Abs(v) < .5 * Math.Pow(10, -decimals) ? 0 : v).ToString("0." + new string('#', decimals), CultureInfo.InvariantCulture);
                    var serialized = Number(text); var error = Math.Abs(v - serialized);
                    checks.Add(new(name, v, serialized, unit, error, limit, error <= limit)); return text;
                }
            }
            // A driver-only unit/camera control retains every original path, outline and transform.
            var driver = new XDocument(original); var driverRoot = driver.Root!;
            driverRoot.SetAttributeValue("width", (view[2] * 4 / 3).ToString("R", CultureInfo.InvariantCulture) + "px");
            driverRoot.SetAttributeValue("height", (view[3] * 4 / 3).ToString("R", CultureInfo.InvariantCulture) + "px");
            driverRoot.SetAttributeValue("viewBox", string.Join(' ', new[] { (view[0] - originX) * 4 / 3, (view[1] - originY) * 4 / 3, view[2] * 4 / 3, view[3] * 4 / 3 }.Select(v => v.ToString("R", CultureInfo.InvariantCulture))));
            var group = new XElement(svg + "g", new XAttribute("transform", $"matrix({(4d / 3).ToString("R", CultureInfo.InvariantCulture)} 0 0 {(4d / 3).ToString("R", CultureInfo.InvariantCulture)} {(-originX * 4 / 3).ToString("R", CultureInfo.InvariantCulture)} {(-originY * 4 / 3).ToString("R", CultureInfo.InvariantCulture)})"));
            group.Add(driverRoot.Nodes().ToArray()); driverRoot.RemoveNodes(); driverRoot.Add(group); Save("driver-css.svg", driver.ToString(SaveOptions.DisableFormatting));
            variants.Insert(0, new { mode = "driver-css", decimals = (int?)null, deltaSp = 0, svg = "driver-css.svg", serialization = new { passed = true, checks = Array.Empty<Serialization>() } });
            var toolFiles = new[] { "tools/TikzShapeCalibration/Program.cs", "tools/TikzShapeCalibration/TikzShapeCalibration.csproj", "tools/TikzShapeCalibration/packages.lock.json", "tools/TikzShapeComparison/NativeGlyphTrace.cs", "tools/TikzShapeReference/Program.cs", "tools/TikzShapeReference/TikzShapeReference.csproj", "Directory.Build.props", "global.json" };
            var derivation = new { schemaVersion = 1, comparisonKind = "oracle-only-shape-reconstruction", completed = true, converterInvoked = false, conformanceClaim = false, approvedImagePolicy = false,
                generatedUtc = DateTimeOffset.UtcNow.ToString("O"), nativeProfile = native.GetProperty("profile"), cachedCheck, configuration, runtime = Environment.Version.ToString(), outputDirectory = Path.GetRelativePath(root, output).Replace('\\', '/'), originBp = new { x = originX, y = originY }, originalViewBoxBp = view,
                scope = "Fixed trusted 28-node fixture. Native integer PGF paths, measured node frames and DVI glyph positions; original outlined glyph definitions and paint. Original driver root frame retained. No candidate data or tolerance admission.",
                counts = new { nodes = 28, pathTokens = 420, glyphs = 70 }, variants,
                evidence = new { artifacts = artifacts.ToDictionary(f => f, f => Hash(Path.Combine(output, f))), toolHashes = toolFiles.ToDictionary(f => f, f => Hash(At(f))),
                    assemblySha256 = Hash(typeof(Program).Assembly.Location), cachedVerifierAssemblySha256 = verifierHash,
                    frameworkReferences = typeof(Program).Assembly.GetReferencedAssemblies().Select(a => a.Name).Order().ToArray() } };
            Write("derivation.json", derivation);
            Console.WriteLine("Independent shape reconstruction: 28 nodes, 420 path tokens, 70 glyphs, five SVG variants; image policy remains pending.");
            return 0;
            void Copy(string input, string file) { var target = Out(file); Directory.CreateDirectory(Path.GetDirectoryName(target)!); File.Copy(At(input), target, true); artifacts.Add(file); }
            void Save(string file, string content) { var target = Out(file); Directory.CreateDirectory(Path.GetDirectoryName(target)!); File.WriteAllText(target, content); artifacts.Add(file); }
            void Write(string file, object value) => Save(file, JsonSerializer.Serialize(value, Json) + "\n");
            string Out(string file)
            {
                var target = Path.GetFullPath(file, output);
                Require(target.StartsWith(output + Path.DirectorySeparatorChar, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal), "Invalid calibration artifact path.");
                for (string? current = target; current is not null && !string.Equals(current, root, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal); current = Path.GetDirectoryName(current))
                {
                    try { Require((File.GetAttributes(current) & FileAttributes.ReparsePoint) == 0, "Calibration artifacts must not cross a symlink or junction."); }
                    catch (FileNotFoundException) { }
                    catch (DirectoryNotFoundException) { }
                }
                return target;
            }
        }
        catch (Exception e) { Console.Error.WriteLine(e.Message); return 2; }
    }

    private static string Inherited(XElement element, string attribute, string fallback) => element.AncestorsAndSelf().Select(e => e.Attribute(attribute)?.Value).FirstOrDefault(v => v is not null) ?? fallback;
    private static void Require(bool value, string message) { if (!value) throw new InvalidOperationException(message); }
    private static double Number(string text) => double.Parse(text, CultureInfo.InvariantCulture);
    private static JsonDocument Read(string path) => JsonDocument.Parse(File.ReadAllText(At(path)));
    private static string At(string path) => Path.Combine(root, path.Replace('/', Path.DirectorySeparatorChar));
    private static string Hash(string file) => Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(file)));
    private static string FindRoot()
    {
        for (var directory = new DirectoryInfo(Directory.GetCurrentDirectory()); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "Lokad.TikZ.slnx"))) return directory.FullName;
        throw new InvalidOperationException("Run from the repository workspace.");
    }
    private static async Task<string> CheckCached(string assembly)
    {
        var start = new ProcessStartInfo("dotnet") { WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        start.ArgumentList.Add(assembly); start.ArgumentList.Add("check-cached");
        using var process = Process.Start(start) ?? throw new InvalidOperationException("Cannot start native cached verifier.");
        try
        {
            var stdout = Capture(process.StandardOutput); var stderr = Capture(process.StandardError);
            await Task.WhenAll(stdout, stderr, process.WaitForExitAsync()).WaitAsync(TimeSpan.FromSeconds(60));
            var result = await stdout + await stderr;
            Require(process.ExitCode == 0, "Native cached evidence failed: " + result); return result.Trim();
        }
        finally { if (!process.HasExited) process.Kill(true); }
        static async Task<string> Capture(StreamReader reader)
        {
            var result = new StringBuilder(); var buffer = new char[4096]; int count;
            while ((count = await reader.ReadAsync(buffer)) > 0) { Require(result.Length + count <= 1_000_000, "Cached verifier output exceeded its limit."); result.Append(buffer, 0, count); }
            return result.ToString();
        }
    }
}

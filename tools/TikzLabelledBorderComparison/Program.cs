using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Lokad.TikZ;
using Lokad.TikZ.Graphics;
using TikzLabelledBorderComparison;
using TikzShapeComparison;

var json = new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true, NewLine = "\n", Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) } };
var root = Directory.GetCurrentDirectory();
while (!File.Exists(Path.Combine(root, "Lokad.TikZ.slnx"))) root = Directory.GetParent(root)?.FullName ?? throw new InvalidOperationException("Repository root missing.");
string At(string file) => Path.GetFullPath(file, root);
string Hash(byte[] b) => Convert.ToHexStringLower(SHA256.HashData(b));
byte[] Canonical(byte[] b) => Encoding.UTF8.GetBytes(Encoding.UTF8.GetString(b).Replace("\r\n", "\n", StringComparison.Ordinal));
string FileHash(string file) => Hash(File.ReadAllBytes(At(file)));
string? output = null; var phase = "arguments"; var artifacts = new Dictionary<string, string>();
void Save(string file, byte[] bytes) { var p = Path.Combine(output!, file); Directory.CreateDirectory(Path.GetDirectoryName(p)!); File.WriteAllBytes(p, bytes); artifacts[file.Replace('\\', '/')] = Hash(bytes); }
void Write(string file, object value) => Save(file, Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value, json) + "\n"));
void Require(bool condition, string message) { if (!condition) throw new InvalidDataException(message); }
try {
    Require(args.Length == 0 || args.Length == 2 && args[0] == "--out", "Usage: TikzLabelledBorderComparison [--out artifacts/...]; fixed trusted corpus only.");
    var requested = At(args.Length == 0 ? "artifacts/labelled-border-numeric/run-" + Guid.NewGuid().ToString("D") : args[1]);
    Require(requested.StartsWith(At("artifacts") + Path.DirectorySeparatorChar, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal), "Output must be inside artifacts/.");
    for (var d = new DirectoryInfo(requested); d is not null && d.FullName != root; d = d.Parent) Require(!d.Exists || (d.Attributes & FileAttributes.ReparsePoint) == 0, "Output cannot cross a symlink or junction.");
    Require(!Directory.Exists(requested) || !Directory.EnumerateFileSystemEntries(requested).Any(), "Output must be a fresh empty directory.");
    output = requested; Directory.CreateDirectory(output);
    phase = "frozen-evidence"; const string reference = "tests/Reference/LabelledBorders/";
    Require(FileHash(reference + "snapshot.json") == "840f35602947c94b50e7e458eba7e20e1af8d3fa35d2b4907b3ce607536977e5", "Frozen native snapshot changed.");
    Require(Hash(Canonical(File.ReadAllBytes(At(reference + "cases.json")))) == "96e6363974b36324a8c44a039a10ccdf7574150052013c913147db0e47ec812b", "Frozen case manifest changed.");
    using var snapshot = JsonDocument.Parse(File.ReadAllText(At(reference + "snapshot.json")));
    foreach (var a in snapshot.RootElement.GetProperty("artifacts").EnumerateObject()) Require(FileHash(reference + a.Name) == a.Value.GetString(), "Changed native artifact: " + a.Name);
    using var manifest = JsonDocument.Parse(File.ReadAllText(At(reference + "cases.json")));
    var cases = manifest.RootElement.GetProperty("cases").EnumerateArray().ToArray(); Require(cases.Select(c => c.GetProperty("id").GetString()).SequenceEqual(["lines", "paths", "transforms"]), "Incomplete trusted corpus.");
    foreach (var c in cases) {
        using var p = JsonDocument.Parse(File.ReadAllText(At(reference + c.GetProperty("id").GetString() + "/provenance.json")));
        foreach (var input in p.RootElement.GetProperty("sourceHashes").EnumerateObject()) Require(Hash(Canonical(File.ReadAllBytes(At(input.Name)))) == input.Value.GetString(), "Changed native input: " + input.Name);
    }
    var tools = new[] { "tools/TikzLabelledBorderComparison/Program.cs", "tools/TikzLabelledBorderComparison/NativeComparison.cs", "tools/TikzLabelledBorderComparison/TikzLabelledBorderComparison.csproj", "tools/TikzLabelledBorderComparison/packages.lock.json", "tools/TikzShapeComparison/NativeGlyphTrace.cs" };
    var toolHashes = new Dictionary<string, string>(); foreach (var file in tools) { var b = Canonical(File.ReadAllBytes(At(file))); toolHashes[file] = Hash(b); Save("tool-sources/" + file, b); }
    var converterSources = new Dictionary<string, string>(); foreach (var file in Directory.GetFiles(At("src/Lokad.TikZ"), "*.cs", SearchOption.AllDirectories).Where(f => !f.Contains(Path.DirectorySeparatorChar + "obj" + Path.DirectorySeparatorChar)).Order(StringComparer.Ordinal)) {
        var relative = Path.GetRelativePath(root, file).Replace('\\', '/'); var b = Canonical(File.ReadAllBytes(file)); converterSources[relative] = Hash(b); Save("tool-sources/" + relative, b);
    }
    var rows = new List<object>(); var allPassed = true; var total = 0;
    foreach (var c in cases) {
        var id = c.GetProperty("id").GetString()!; phase = "native/" + id;
        using var provenance = JsonDocument.Parse(File.ReadAllText(At(reference + id + "/provenance.json")));
        foreach (var input in provenance.RootElement.GetProperty("sourceHashes").EnumerateObject()) Require(Hash(Canonical(File.ReadAllBytes(At(input.Name)))) == input.Value.GetString(), "Changed native input: " + input.Name);
        using var metrics = JsonDocument.Parse(File.ReadAllText(At(reference + id + "/metrics.json"))); var native = metrics.RootElement;
        var nativeSvg = File.ReadAllText(At(reference + id + "/probed-reference.svg"));
        var glyphs = NativeGlyphTrace.Read(File.ReadAllText(At(reference + id + "/native-positions.log")), File.ReadAllText(At("tools/TikzFontData/font-profile.json")),
            native.GetProperty("nodes").EnumerateArray().Select(n => n.GetProperty("id").GetString()!).ToArray(), nativeSvg,
            Directory.GetFiles(At(reference + "fonts"), "*.tfm").ToDictionary(f => Path.GetFileName(f)!, File.ReadAllBytes));
        Write(id + "/native-glyphs.json", glyphs);
        var sourceBytes = Canonical(File.ReadAllBytes(At(c.GetProperty("source").GetString()!))); var source = Encoding.UTF8.GetString(sourceBytes);
        Save(id + "/source.tikz", sourceBytes); phase = "candidate/" + id; GraphicsScene? scene = null;
        var options = TikzOptions.Default with { Libraries = ["shapes.geometric"], IdPrefix = "candidate" };
        var result = TikzConverter.ConvertWithTrace(source, options, CancellationToken.None, s => scene = s);
        if (result is not TikzSuccess success || scene is null) { Write("report.json", new { completed = false, phase, verdict = "candidate-conversion-failure", imageConformanceClaim = false, result.Diagnostics, artifacts }); return 3; }
        Save(id + "/actual.svg", Encoding.UTF8.GetBytes(success.Svg));
        var checks = NativeComparison.Compare(scene, success, native, glyphs); var passed = checks.All(q => q.Passed); total += checks.Length; allPassed &= passed;
        Write(id + "/numeric.json", new { schemaVersion = 1, completed = true, passed, checks });
        var emitted = scene.Drawables.OfType<PaintedGlyphRun>().SelectMany(r => r.Glyphs.Select(g => (Run: r, Glyph: g))).ToArray();
        Write(id + "/actual-scene.json", new { schemaVersion = 1, units = "bp/y-up geometry, integer-sp label layout, CSS-pixel/y-down bounds", success.PictureBounds, success.InkBounds, success.Statistics,
            nodes = scene.Nodes.Select((n, i) => new { semanticId = "node-" + i, svgElementId = "candidate-n" + i, n.Name, source = n.Source.Location, n.Layout.Text.WidthSp, n.Layout.Text.HeightSp, n.Layout.Text.DepthSp, n.Layout.Dimensions, n.Transform, n.Font, n.NodeFont }),
            paths = scene.Paths.Select((p, i) => new { semanticId = "path-" + i, svgElementId = "candidate-p" + i, source = p.Source.Location, p.Paint, p.Clips, segmentsBp = p.Path.Segments, inkBounds = p.InkBounds.Pixels }),
            glyphs = emitted.Select((e, i) => new { semanticId = "glyph-" + i, svgElementId = "candidate-g" + i, source = e.Glyph.Placement.Source.Location, e.Glyph.Placement.FontId, e.Glyph.Placement.Slot, e.Glyph.Placement.XSp, e.Glyph.Placement.YSp, e.Glyph.Transform, e.Run.NodeId, inkBounds = e.Glyph.InkBounds.Pixels }),
            paintOrder = scene.Drawables.Select((d, i) => new { index = i, kind = d is PaintedPath ? "path" : "glyph-run", source = d.Source.Location }) });
        rows.Add(new { caseId = id, sourceSha256 = Hash(sourceBytes), numericPassed = passed, checks = checks.Length, nodes = scene.Nodes.Count, paths = scene.Paths.Count, glyphs = success.Statistics.Glyphs, options });
        Console.WriteLine(id + ": " + checks.Length + " native checks " + (passed ? "passed" : "failed"));
    }
    var assembly = typeof(TikzConverter).Assembly; var converterAssemblyReferences = assembly.GetReferencedAssemblies().Select(n => n.Name!).Order(StringComparer.Ordinal).ToArray();
    Require(converterAssemblyReferences.All(n => n == "System" || n.StartsWith("System.", StringComparison.Ordinal)), "Unexpected converter assembly reference.");
    Write("report.json", new { schemaVersion = 1, comparisonKind = "public-labelled-border-numeric", completed = true, numericPassed = allPassed, checks = total, imageConformanceClaim = false, approvedImagePolicy = false,
        expectedCases = new[] { "lines", "paths", "transforms" }, cases = rows, sourceByteContract = "UTF-8/LF source and tool hashes; original native artifacts retain exact bytes",
        converterAssemblySha256 = Hash(File.ReadAllBytes(assembly.Location)), converterAssemblyReferences, converterSources, toolHashes, artifacts });
    return allPassed ? 0 : 1;
} catch (Exception error) {
    var message = error.Message.Replace(root, "<repo>", StringComparison.OrdinalIgnoreCase);
    if (output is not null && Directory.Exists(output)) Write("report.json", new { schemaVersion = 1, completed = false, phase, verdict = "infrastructure-error", imageConformanceClaim = false, error = message, artifacts });
    Console.Error.WriteLine(message); return 2;
}

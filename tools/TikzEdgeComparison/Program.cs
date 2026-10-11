using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Lokad.TikZ;
using Lokad.TikZ.Graphics;
using TikzEdgeComparison;
using TikzShapeComparison;

var json = new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true, NewLine = "\n", Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) } };
var root = Directory.GetCurrentDirectory();
while (!File.Exists(Path.Combine(root, "Lokad.TikZ.slnx"))) root = Directory.GetParent(root)?.FullName ?? throw new InvalidOperationException("Repository root missing.");
string At(string file) => Path.GetFullPath(file, root);
string Hash(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));
byte[] Canonical(byte[] bytes) => Encoding.UTF8.GetBytes(Encoding.UTF8.GetString(bytes).Replace("\r\n", "\n", StringComparison.Ordinal));
void Require(bool condition, string message) { if (!condition) throw new InvalidDataException(message); }
const string reference = "tests/Reference/Edges/";
string? output = null; var phase = "arguments"; var artifacts = new Dictionary<string, string>();
var converterSources = new Dictionary<string, string>(); var toolHashes = new Dictionary<string, string>(); var inputHashes = new Dictionary<string, string>();
void Save(string file, byte[] bytes) { var p = Path.Combine(output!, file); Directory.CreateDirectory(Path.GetDirectoryName(p)!); File.WriteAllBytes(p, bytes); artifacts[file.Replace('\\', '/')] = Hash(bytes); }
void Write(string file, object value) => Save(file, Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value, json) + "\n"));
void Capture(string file, Dictionary<string, string> hashes) { var bytes = Canonical(File.ReadAllBytes(At(file))); hashes[file] = Hash(bytes); Save("source-captures/" + file, bytes); }
try
{
    Require(args.Length == 0 || args.Length == 2 && args[0] == "--out", "Usage: TikzEdgeComparison [--out artifacts/...]; fixed trusted corpus only.");
    var requested = At(args.Length == 0 ? "artifacts/edge-numeric/run-" + Guid.NewGuid().ToString("D") : args[1]);
    Require(requested.StartsWith(At("artifacts") + Path.DirectorySeparatorChar, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal), "Output must be inside artifacts/.");
    for (var d = new DirectoryInfo(requested); d is not null && d.FullName != root; d = d.Parent) Require(!d.Exists || (d.Attributes & FileAttributes.ReparsePoint) == 0, "Output cannot cross a symlink or junction.");
    Require(!Directory.Exists(requested) || !Directory.EnumerateFileSystemEntries(requested).Any(), "Output must be a fresh empty directory.");
    output = requested; Directory.CreateDirectory(output);
    phase = "frozen-evidence"; var snapshotBytes = File.ReadAllBytes(At(reference + "snapshot.json"));
    Require(Hash(snapshotBytes) == "269a0bdd6eaa7f2e71b8558ba8b2a80b797c101139ad9b52c674d1aec4f0287a", "Frozen edge snapshot changed.");
    Save("input-captures/" + reference + "snapshot.json", snapshotBytes);
    using var snapshot = JsonDocument.Parse(snapshotBytes);
    foreach (var a in snapshot.RootElement.GetProperty("artifacts").EnumerateObject())
    {
        var file = reference + a.Name; var bytes = File.ReadAllBytes(At(file)); Require(Hash(bytes) == a.Value.GetString(), "Changed native artifact: " + file);
        inputHashes[file] = Hash(bytes); Save("input-captures/" + file, bytes);
    }
    var nativeRevisions = NativeSourceRevisions.Read(root);
    Capture(NativeSourceRevisions.FileName, toolHashes);
    foreach (var s in snapshot.RootElement.GetProperty("sourceHashes").EnumerateObject())
    { Capture(s.Name, toolHashes); Require(NativeSourceRevisions.Matches(nativeRevisions, s.Name, s.Value.GetString()!, toolHashes[s.Name]), "Changed native source: " + s.Name); }
    using var manifest = JsonDocument.Parse(File.ReadAllText(At(reference + "cases.json")));
    var cases = manifest.RootElement.GetProperty("cases").EnumerateArray().ToArray(); var ids = new[] { "continuation", "styles", "coordinates", "nodes", "clipping" };
    Require(cases.Select(c => c.GetProperty("id").GetString()).SequenceEqual(ids), "Incomplete trusted corpus.");
    foreach (var file in new[] { "tools/TikzEdgeComparison/Program.cs", "tools/TikzEdgeComparison/NativeComparison.cs", "tools/TikzEdgeComparison/TikzEdgeComparison.csproj", "tools/TikzEdgeComparison/packages.lock.json", "tools/TikzEdgeOracle/NativeSourceRevisions.cs", "tools/TikzShapeComparison/NativeGlyphTrace.cs", "Directory.Build.props", "src/Lokad.TikZ/Lokad.TikZ.csproj", "src/Lokad.TikZ/packages.lock.json" }) Capture(file, toolHashes);
    foreach (var file in Directory.GetFiles(At("src/Lokad.TikZ"), "*.cs", SearchOption.AllDirectories).Where(f => !f.Contains(Path.DirectorySeparatorChar + "obj" + Path.DirectorySeparatorChar)).Order(StringComparer.Ordinal)) Capture(Path.GetRelativePath(root, file).Replace('\\', '/'), converterSources);
    foreach (var file in Directory.GetFiles(At("src/Lokad.TikZ/Resources"), "*.json", SearchOption.AllDirectories).Order(StringComparer.Ordinal)) Capture(Path.GetRelativePath(root, file).Replace('\\', '/'), converterSources);
    var rows = new List<object>(); var passed = true; var total = 0;
    foreach (var c in cases)
    {
        var id = c.GetProperty("id").GetString()!; phase = "candidate/" + id;
        using var metrics = JsonDocument.Parse(File.ReadAllText(At(reference + id + "/metrics.json"))); var native = metrics.RootElement;
        Require(!native.GetProperty("converterInvoked").GetBoolean() && !native.GetProperty("approvedImagePolicy").GetBoolean(), "Unexpected native evidence role.");
        var nodeIds = native.GetProperty("nodes").EnumerateArray().Select(n => n.GetProperty("id").GetString()!).ToArray();
        var glyphs = nodeIds.Length == 0 ? null : NativeGlyphTrace.Read(File.ReadAllText(At(reference + id + "/native-positions.log")),
            File.ReadAllText(At("tools/TikzFontData/font-profile.json")), nodeIds, File.ReadAllText(At(reference + id + "/probed-reference.svg")),
            Directory.GetFiles(At(reference + "fonts"), "*.tfm").ToDictionary(f => Path.GetFileName(f)!, File.ReadAllBytes));
        if (glyphs is not null) Write(id + "/native-glyphs.json", glyphs);
        var sourceBytes = Canonical(File.ReadAllBytes(At(c.GetProperty("source").GetString()!))); Save(id + "/source.tikz", sourceBytes);
        GraphicsScene? scene = null; var options = TikzOptions.Default with { Libraries = ["shapes.geometric"], IdPrefix = "candidate" };
        var result = TikzConverter.ConvertWithTrace(Encoding.UTF8.GetString(sourceBytes), options, CancellationToken.None, s => scene = s);
        if (result is not TikzSuccess success || scene is null) { Write("report.json", new { completed = false, phase, verdict = "candidate-conversion-failure", imageConformanceClaim = false, result.Diagnostics, artifacts }); return 3; }
        Save(id + "/actual.svg", Encoding.UTF8.GetBytes(success.Svg)); var checks = NativeComparison.Compare(scene, success, native, glyphs);
        var numericPassed = checks.All(q => q.Passed); passed &= numericPassed; total += checks.Length;
        Write(id + "/numeric.json", new { schemaVersion = 1, completed = true, passed = numericPassed, checks });
        Write(id + "/actual-scene.json", new {
            schemaVersion = 1, units = "bp/y-up geometry, integer-sp label layout, CSS-pixel/y-down public bounds", success.PictureBounds, success.InkBounds, success.Statistics,
            paths = scene.Paths.Select((p, i) => new { svgElementId = "candidate-p" + i, source = p.Source.Location, p.Paint, p.Clips, segmentsBp = p.Path.Segments, inkBounds = p.InkBounds.Pixels }),
            clips = scene.Clips.Select((p, i) => new { svgElementId = "candidate-c" + i, p.FillRule, segmentsBp = p.Path.Segments }),
            nodes = scene.Nodes.Select((n, i) => new { svgElementId = "candidate-n" + i, n.Name, source = n.Source.Location, n.Layout.Text.WidthSp, n.Layout.Text.HeightSp, n.Layout.Text.DepthSp, n.Layout.Dimensions, n.Transform, n.Font, n.NodeFont }),
            glyphs = scene.Drawables.OfType<PaintedGlyphRun>().SelectMany(r => r.Glyphs.Select(g => new { source = g.Placement.Source.Location, g.Placement.FontId, g.Placement.Slot, g.Placement.XSp, g.Placement.YSp, g.Transform, r.NodeId })),
            paintOrder = scene.Drawables.Select((d, i) => new { index = i, kind = d is PaintedPath ? "path" : "glyph-run", source = d.Source.Location }) });
        rows.Add(new { caseId = id, sourceSha256 = Hash(sourceBytes), numericPassed, checks = checks.Length, nodes = scene.Nodes.Count, paths = scene.Paths.Count, glyphs = success.Statistics.Glyphs, options });
        Console.WriteLine(id + ": " + checks.Length + " native checks " + (numericPassed ? "passed" : "failed"));
    }
    phase = "final-integrity";
    foreach (var s in converterSources.Concat(toolHashes)) Require(Hash(Canonical(File.ReadAllBytes(At(s.Key)))) == s.Value, "Source changed during comparison: " + s.Key);
    foreach (var s in inputHashes) Require(Hash(File.ReadAllBytes(At(s.Key))) == s.Value, "Native input changed during comparison: " + s.Key);
    var assembly = typeof(TikzConverter).Assembly; var references = assembly.GetReferencedAssemblies().Select(n => n.Name!).Order(StringComparer.Ordinal).ToArray();
    Require(references.All(n => n == "System" || n.StartsWith("System.", StringComparison.Ordinal)), "Unexpected converter dependency.");
    Write("report.json", new { schemaVersion = 1, comparisonKind = "public-straight-edge-numeric", completed = true, numericPassed = passed, checks = total,
        converterInvoked = true, approvedImagePolicy = false, imageConformanceClaim = false, overallVerdict = "pending-image-calibration", expectedCases = ids, cases = rows,
        snapshotSha256 = Hash(snapshotBytes), sourceByteContract = "UTF-8/LF sources and tools; native artifacts retain original exact bytes",
        converterAssemblySha256 = Hash(File.ReadAllBytes(assembly.Location)), converterAssemblyReferences = references, converterSources, toolHashes, inputHashes, artifacts });
    Console.WriteLine(Path.GetRelativePath(root, Path.Combine(output, "report.json"))); return passed ? 0 : 1;
}
catch (Exception error)
{
    var message = error.Message.Replace(root, "<repo>", StringComparison.OrdinalIgnoreCase);
    if (output is not null) Write("report.json", new { schemaVersion = 1, completed = false, phase, verdict = "infrastructure-error", imageConformanceClaim = false, error = message, artifacts });
    Console.Error.WriteLine(message); return 2;
}

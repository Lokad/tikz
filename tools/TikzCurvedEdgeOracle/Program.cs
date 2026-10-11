using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using TikzShapeComparison;

// The linked DVI/TFM reader has no converter or production-resource reference.
var root = Directory.GetCurrentDirectory();
while (!File.Exists(Path.Combine(root, "Lokad.TikZ.slnx"))) root = Directory.GetParent(root)?.FullName ?? throw new InvalidOperationException("Repository root missing.");
string At(string file) => Path.GetFullPath(file, root);
string Hash(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));
byte[] Canonical(byte[] bytes) => Encoding.UTF8.GetBytes(Encoding.UTF8.GetString(bytes).Replace("\r\n", "\n", StringComparison.Ordinal));
void Require(bool ok, string message) { if (!ok) throw new InvalidDataException(message); }
var json = new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true, NewLine = "\n" };
var artifacts = new Dictionary<string, string>(); string? output = null; var phase = "arguments";
void Save(string file, byte[] bytes) { var p = Path.Combine(output!, file); Directory.CreateDirectory(Path.GetDirectoryName(p)!); File.WriteAllBytes(p, bytes); artifacts[file] = Hash(bytes); }
void Write(string file, object value) => Save(file, Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value, json) + "\n"));
try
{
    Require(args.Length == 0 || args.Length == 2 && args[0] == "--out", "Usage: TikzCurvedEdgeOracle [--out artifacts/...]; fixed native corpus only.");
    var requested = At(args.Length == 0 ? "artifacts/curved-edge-oracle/run-" + Guid.NewGuid().ToString("D") : args[1]);
    Require(requested.StartsWith(At("artifacts") + Path.DirectorySeparatorChar, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal), "Output must be inside artifacts/.");
    for (var d = new DirectoryInfo(requested); d is not null && d.FullName != root; d = d.Parent) Require(!d.Exists || (d.Attributes & FileAttributes.ReparsePoint) == 0, "Output cannot cross a symlink or junction.");
    Require(!Directory.Exists(requested) || !Directory.EnumerateFileSystemEntries(requested).Any(), "Output must be a fresh empty directory.");
    output = requested; Directory.CreateDirectory(output); phase = "frozen-native-evidence";
    const string reference = "tests/Reference/CurvedEdges/", snapshotHash = "5d5730145e1a848d6f22c964d901be3c151bba3ebf5336c258144ec14076e0b1";
    var snapshotBytes = File.ReadAllBytes(At(reference + "snapshot.json")); Require(Hash(snapshotBytes) == snapshotHash, "Frozen native snapshot changed.");
    Save("native-inputs/" + reference + "snapshot.json", snapshotBytes);
    using var snapshot = JsonDocument.Parse(snapshotBytes); var nativeHashes = new Dictionary<string, string>();
    foreach (var a in snapshot.RootElement.GetProperty("artifacts").EnumerateObject())
    {
        var file = reference + a.Name; var bytes = File.ReadAllBytes(At(file)); Require(Hash(bytes) == a.Value.GetString(), "Changed native artifact: " + file);
        nativeHashes[file] = Hash(bytes); Save("native-inputs/" + file, bytes);
    }
    var sourceHashes = new Dictionary<string, string>();
    var nativeRevisions = NativeSourceRevisions.Read(root);
    foreach (var s in snapshot.RootElement.GetProperty("sourceHashes").EnumerateObject())
    {
        var bytes = Canonical(File.ReadAllBytes(At(s.Name))); Require(NativeSourceRevisions.Matches(nativeRevisions, s.Name, s.Value.GetString()!, Hash(bytes)), "Changed native source: " + s.Name);
        sourceHashes[s.Name] = Hash(bytes); Save("source-captures/" + s.Name, bytes);
    }
    foreach (var file in new[] { NativeSourceRevisions.FileName, "tools/TikzEdgeOracle/NativeSourceRevisions.cs", "tools/TikzCurvedEdgeOracle/Program.cs", "tools/TikzCurvedEdgeOracle/TikzCurvedEdgeOracle.csproj", "tools/TikzCurvedEdgeOracle/packages.lock.json", "tools/TikzShapeComparison/NativeGlyphTrace.cs", "Directory.Build.props", "global.json" })
    { var bytes = Canonical(File.ReadAllBytes(At(file))); sourceHashes[file] = Hash(bytes); Save("source-captures/" + file, bytes); }
    using var manifest = JsonDocument.Parse(File.ReadAllText(At(reference + "cases.json")));
    var cases = manifest.RootElement.GetProperty("cases").EnumerateArray().ToArray();
    Require(cases.Select(c => c.GetProperty("id").GetString()).SequenceEqual(["continuation", "styles", "coordinates", "nodes", "clipping"]), "Incomplete trusted corpus.");
    var rows = new List<object>(); var count = 0;
    foreach (var c in cases)
    {
        var id = c.GetProperty("id").GetString()!; phase = "native-glyphs/" + id;
        using var metrics = JsonDocument.Parse(File.ReadAllText(At(reference + id + "/metrics.json")));
        var ids = metrics.RootElement.GetProperty("nodes").EnumerateArray().Select(n => n.GetProperty("id").GetString()!).ToArray();
        var glyphs = ids.Length == 0 ? new NativeGlyphTrace.Evidence([], new(StringComparer.Ordinal)) : NativeGlyphTrace.Read(
            File.ReadAllText(At(reference + id + "/native-positions.log")), File.ReadAllText(At("tools/TikzFontData/font-profile.json")), ids,
            File.ReadAllText(At(reference + id + "/probed-reference.svg")), Directory.GetFiles(At(reference + "fonts"), "*.tfm").ToDictionary(f => Path.GetFileName(f)!, File.ReadAllBytes));
        Write(id + "/native-glyphs.json", glyphs); var glyphCount = glyphs.Nodes.Sum(n => n.Glyphs.Length); count += glyphCount;
        Require(glyphCount == (id == "nodes" ? 10 : 0) && ids.Length == (id == "nodes" ? 4 : 0), "Incomplete native glyph coverage.");
        rows.Add(new { caseId = id, nodes = ids.Length, glyphs = glyphCount });
    }
    phase = "final-integrity";
    foreach (var s in sourceHashes) Require(Hash(Canonical(File.ReadAllBytes(At(s.Key)))) == s.Value, "Source changed during reading: " + s.Key);
    foreach (var s in nativeHashes) Require(Hash(File.ReadAllBytes(At(s.Key))) == s.Value, "Native artifact changed during reading: " + s.Key);
    var assembly = typeof(NativeGlyphTrace).Assembly; var references = assembly.GetReferencedAssemblies().Select(a => a.Name!).Order(StringComparer.Ordinal).ToArray();
    Require(references.All(n => n == "System" || n.StartsWith("System.", StringComparison.Ordinal)), "Oracle acquired a non-framework dependency.");
    Write("report.json", new { schemaVersion = 1, comparisonKind = "oracle-only-curved-edge-glyphs", completed = true, converterInvoked = false, approvedImagePolicy = false, imageConformanceClaim = false,
        snapshotSha256 = snapshotHash, cases = rows, glyphs = count, sourceHashes, nativeHashes, oracleAssemblySha256 = Hash(File.ReadAllBytes(assembly.Location)), oracleAssemblyReferences = references, artifacts });
    Console.WriteLine("Independent curved-edge DVI/TFM reader: " + count + " glyphs; no converter dependency."); return 0;
}
catch (Exception error)
{
    var message = error.Message.Replace(root, "<repo>", StringComparison.OrdinalIgnoreCase);
    if (output is not null) Write("report.json", new { schemaVersion = 1, completed = false, phase, converterInvoked = false, approvedImagePolicy = false, imageConformanceClaim = false, error = message, artifacts });
    Console.Error.WriteLine(message); return 2;
}

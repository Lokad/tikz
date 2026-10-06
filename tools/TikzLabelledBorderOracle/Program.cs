using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using TikzShapeComparison;

// Independent DVI/TFM reader; this project has no converter reference.
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
try {
    Require(args.Length == 0 || args.Length == 2 && args[0] == "--out", "Usage: TikzLabelledBorderOracle [--out artifacts/...]; fixed native corpus only.");
    var requested = At(args.Length == 0 ? "artifacts/labelled-border-oracle/run-" + Guid.NewGuid().ToString("D") : args[1]);
    Require(requested.StartsWith(At("artifacts") + Path.DirectorySeparatorChar, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal), "Output must be inside artifacts/.");
    for (var d = new DirectoryInfo(requested); d is not null && d.FullName != root; d = d.Parent) Require(!d.Exists || (d.Attributes & FileAttributes.ReparsePoint) == 0, "Output cannot cross a symlink or junction.");
    Require(!Directory.Exists(requested) || !Directory.EnumerateFileSystemEntries(requested).Any(), "Output must be a fresh empty directory.");
    output = requested; Directory.CreateDirectory(output); phase = "frozen-native-evidence";
    const string reference = "tests/Reference/LabelledBorders/";
    const string snapshotHash = "840f35602947c94b50e7e458eba7e20e1af8d3fa35d2b4907b3ce607536977e5";
    Require(Hash(File.ReadAllBytes(At(reference + "snapshot.json"))) == snapshotHash, "Frozen native snapshot changed.");
    Require(Hash(Canonical(File.ReadAllBytes(At(reference + "cases.json")))) == "96e6363974b36324a8c44a039a10ccdf7574150052013c913147db0e47ec812b", "Frozen fixture manifest changed.");
    using var snapshot = JsonDocument.Parse(File.ReadAllText(At(reference + "snapshot.json")));
    foreach (var a in snapshot.RootElement.GetProperty("artifacts").EnumerateObject()) Require(Hash(File.ReadAllBytes(At(reference + a.Name))) == a.Value.GetString(), "Changed native artifact: " + a.Name);
    foreach (var c in snapshot.RootElement.GetProperty("cases").EnumerateArray())
        foreach (var input in c.GetProperty("sourceHashes").EnumerateObject()) Require(Hash(Canonical(File.ReadAllBytes(At(input.Name)))) == input.Value.GetString(), "Changed native source: " + input.Name);
    var sources = new Dictionary<string, string>();
    foreach (var p in new[] { "tools/TikzLabelledBorderOracle/Program.cs", "tools/TikzLabelledBorderOracle/TikzLabelledBorderOracle.csproj", "tools/TikzLabelledBorderOracle/packages.lock.json", "tools/TikzShapeComparison/NativeGlyphTrace.cs" }) {
        var bytes = Canonical(File.ReadAllBytes(At(p))); sources[p] = Hash(bytes); Save("tool-sources/" + p, bytes);
    }
    var rows = new List<object>(); var count = 0;
    foreach (var id in new[] { "lines", "paths", "transforms" }) {
        phase = "native-glyphs/" + id;
        using var metrics = JsonDocument.Parse(File.ReadAllText(At(reference + id + "/metrics.json")));
        var ids = metrics.RootElement.GetProperty("nodes").EnumerateArray().Select(n => n.GetProperty("id").GetString()!).ToArray();
        var glyphs = NativeGlyphTrace.Read(File.ReadAllText(At(reference + id + "/native-positions.log")), File.ReadAllText(At("tools/TikzFontData/font-profile.json")),
            ids, File.ReadAllText(At(reference + id + "/probed-reference.svg")), Directory.GetFiles(At(reference + "fonts"), "*.tfm").ToDictionary(p => Path.GetFileName(p)!, File.ReadAllBytes));
        Write(id + "/native-glyphs.json", glyphs); var glyphCount = glyphs.Nodes.Sum(n => n.Glyphs.Length); count += glyphCount;
        Require(glyphCount == (id == "paths" ? 16 : 12), "Incomplete original glyph coverage."); rows.Add(new { caseId = id, nodes = ids.Length, glyphs = glyphCount });
    }
    var assembly = typeof(NativeGlyphTrace).Assembly;
    var references = assembly.GetReferencedAssemblies().Select(a => a.Name!).Order(StringComparer.Ordinal).ToArray();
    Require(references.All(n => n == "System" || n.StartsWith("System.", StringComparison.Ordinal)), "Oracle reader acquired a non-framework dependency.");
    Write("report.json", new { schemaVersion = 1, comparisonKind = "oracle-only-labelled-border-glyphs", completed = true, converterInvoked = false, approvedImagePolicy = false, imageConformanceClaim = false,
        snapshotSha256 = snapshotHash, cases = rows, glyphs = count, toolHashes = sources, oracleAssemblySha256 = Hash(File.ReadAllBytes(assembly.Location)), oracleAssemblyReferences = references, artifacts });
    Console.WriteLine("Independent labeled-border DVI/TFM reader: " + count + " glyphs; no converter dependency."); return 0;
} catch (Exception error) {
    var message = error.Message.Replace(root, "<repo>", StringComparison.OrdinalIgnoreCase);
    if (output is not null) Write("report.json", new { schemaVersion = 1, completed = false, phase, converterInvoked = false, approvedImagePolicy = false, imageConformanceClaim = false, error = message, artifacts });
    Console.Error.WriteLine(message); return 2;
}

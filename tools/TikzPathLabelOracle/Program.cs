using System.Security.Cryptography;
using System.Text.Json;
using TikzPathLabelComparison;

// Acceptance gap: export independently read native glyphs without loading a converter.
if (args.Length != 1) throw new ArgumentException("Usage: TikzPathLabelOracle <owned-native-report>");
var root = Directory.GetCurrentDirectory();
var reference = Path.GetFullPath(args[0], root);
if (!reference.StartsWith(Path.Combine(root, "artifacts") + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
    throw new ArgumentException("Expected an owned native artifact report.");
using var input = new NativeInput(reference);
var directory = Path.Combine(root, "artifacts/path-label-oracle", "run-" + Guid.NewGuid());
Directory.CreateDirectory(directory);
var json = new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true, NewLine = "\n" };
var artifacts = new SortedDictionary<string, string>(StringComparer.Ordinal);
async Task Save(string name, byte[] bytes)
{
    var file = Path.Combine(directory, name); Directory.CreateDirectory(Path.GetDirectoryName(file)!);
    await File.WriteAllBytesAsync(file, bytes); artifacts[name] = Hash(bytes);
}
await Save("native-glyphs.json", JsonSerializer.SerializeToUtf8Bytes(input.Glyphs, json));
foreach (var file in new[] { "tools/TikzPathLabelOracle/Program.cs", "tools/TikzPathLabelOracle/TikzPathLabelOracle.csproj",
    "tools/TikzPathLabelComparison/NativeInput.cs", "tools/TikzShapeComparison/NativeGlyphTrace.cs", "Directory.Build.props", "Directory.Packages.props" })
    await Save("source-captures/" + file, await File.ReadAllBytesAsync(Path.Combine(root, file)));
var references = typeof(NativeInput).Assembly.GetReferencedAssemblies().Select(a => a.Name!).ToArray();
if (references.Any(n => n != "System" && !n.StartsWith("System.", StringComparison.Ordinal))) throw new InvalidDataException("Oracle has a non-framework reference.");
var bytes = JsonSerializer.SerializeToUtf8Bytes(new { schemaVersion = 1, role = "path-label-native-glyph-oracle", completed = true, phase = "complete",
    converterInvoked = false, nativeToolInvoked = false, approvedImagePolicy = false, imageConformanceClaim = false, imageAdmission = "pending",
    artifacts, fixture = input.Fixture, nodes = input.Ids.Length, glyphs = input.Glyphs.Nodes.Sum(n => n.Glyphs.Length),
    nativeInputSha256 = Hash(await File.ReadAllBytesAsync(reference)), assemblyReferences = references }, json);
await File.WriteAllBytesAsync(Path.Combine(directory, "report.json"), bytes);
Console.WriteLine(JsonSerializer.Serialize(new { completed = true, report = Path.GetRelativePath(root, Path.Combine(directory, "report.json")).Replace('\\', '/'), sha256 = Hash(bytes) }));
static string Hash(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));

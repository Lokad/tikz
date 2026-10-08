using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Lokad.TikZ;
using Lokad.TikZ.Graphics;
using TikzPathLabelComparison;
using TikzShapeComparison;

if (args.Length != 1) throw new ArgumentException("Usage: TikzPathLabelComparison <owned-native-report>; no image qualification claim.");
var root = Directory.GetCurrentDirectory();
var reference = Path.GetFullPath(args[0], root);
if (!reference.StartsWith(Path.Combine(root, "artifacts") + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
    throw new ArgumentException("Expected an owned native artifact report.");
var output = Path.Combine(root, "artifacts/path-label-numeric", "run-" + Guid.NewGuid());
var artifacts = new SortedDictionary<string, string>(StringComparer.Ordinal);
var json = new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true, NewLine = "\n" };
var phase = "native-input";
var converterInvoked = false;
Directory.CreateDirectory(output);
await Publish(false);
try
{
    using var report = JsonDocument.Parse(await File.ReadAllBytesAsync(reference));
    var r = report.RootElement;
    if (r.GetProperty("role").GetString() != "path-label-native-reference" || !r.GetProperty("completed").GetBoolean()
        || r.GetProperty("converterInvoked").GetBoolean() || r.GetProperty("imageConformanceClaim").GetBoolean())
        throw new InvalidDataException("Expected completed independent native observations.");
    var folder = Path.GetDirectoryName(reference)!;
    byte[] Read(string file)
    {
        if (Path.IsPathRooted(file) || file.Split('/', '\\').Any(p => p is ".." or "." or "")) throw new InvalidDataException("Invalid native artifact path.");
        var bytes = File.ReadAllBytes(Path.Combine(folder, file));
        if (bytes.Length > 100000000 || Hash(bytes) != r.GetProperty("artifacts").GetProperty(file).GetString()) throw new InvalidDataException("Native artifact changed: " + file);
        return bytes;
    }
    using var metrics = JsonDocument.Parse(Read("metrics.json"));
    var native = metrics.RootElement;
    var ids = native.GetProperty("nodes").EnumerateArray().Select(n => n.GetProperty("id").GetString()!).ToArray();
    var svg = Encoding.UTF8.GetString(Read("probed-reference.svg"));
    var fontProfile = Encoding.UTF8.GetString(Read("source-captures/tools/TikzFontData/font-profile.json"));
    var fonts = r.GetProperty("artifacts").EnumerateObject().Where(a => a.Name.StartsWith("fonts/", StringComparison.Ordinal))
        .ToDictionary(a => Path.GetFileName(a.Name), a => Read(a.Name), StringComparer.Ordinal);
    var glyphs = NativeGlyphTrace.Read(Encoding.UTF8.GetString(Read("native-positions.log")), fontProfile, ids, svg, fonts);
    const string sourceFile = "tests/Fixtures/PathLabels/placement.tikz";
    var sourceBytes = await File.ReadAllBytesAsync(Path.Combine(root, sourceFile));
    var source = Encoding.UTF8.GetString(sourceBytes);
    if (Hash(Encoding.UTF8.GetBytes(source.Replace("\r\n", "\n"))) != r.GetProperty("sourceHashes").GetProperty(sourceFile).GetString())
        throw new InvalidDataException("Current trusted fixture differs from native input.");
    await Save("source.tikz", sourceBytes);
    await Save("native-report.json", await File.ReadAllBytesAsync(reference));
    await Save("native-glyphs.json", JsonSerializer.SerializeToUtf8Bytes(glyphs, json));
    phase = "current-conversion";
    converterInvoked = true;
    GraphicsScene? trace = null;
    var converted = TikzConverter.ConvertWithTrace(source, TikzOptions.Default, CancellationToken.None, scene => trace = scene);
    if (converted is not TikzSuccess success) throw new InvalidDataException("Trusted fixture conversion failed: " + string.Join(";", converted.Diagnostics.Select(d => d.Message)));
    var publicResult = TikzConverter.Convert(source, TikzOptions.Default, CancellationToken.None);
    if (publicResult is not TikzSuccess publicSuccess || publicSuccess.Svg != success.Svg || publicSuccess.Statistics != success.Statistics)
        throw new InvalidDataException("Public/traced conversion parity failed.");
    await Save("actual.svg", Encoding.UTF8.GetBytes(success.Svg));
    await Save("public.svg", Encoding.UTF8.GetBytes(publicSuccess.Svg));
    var checks = NativeLabels.Compare(trace!, success, native, glyphs, svg);
    await Save("checks.json", JsonSerializer.SerializeToUtf8Bytes(checks, json));
    foreach (var file in Directory.EnumerateFiles(Path.Combine(root, "src/Lokad.TikZ"), "*", SearchOption.AllDirectories)
        .Where(f => !Path.GetRelativePath(root, f).Split(Path.DirectorySeparatorChar).Any(p => p is "bin" or "obj")).Order(StringComparer.Ordinal))
        await Save("source-captures/" + Path.GetRelativePath(root, file).Replace('\\', '/'), await File.ReadAllBytesAsync(file));
    foreach (var file in new[] { "tools/TikzPathLabelComparison/Program.cs", "tools/TikzPathLabelComparison/NativeLabels.cs",
        "tools/TikzPathLabelComparison/TikzPathLabelComparison.csproj", "tools/TikzShapeComparison/NativeGlyphTrace.cs",
        "Directory.Build.props", "Directory.Packages.props" })
        await Save("source-captures/" + file, await File.ReadAllBytesAsync(Path.Combine(root, file)));
    await Publish(true, new { numericPassed = checks.All(c => c.Passed), checks = checks.Length,
        nodes = ids.Length, glyphs = glyphs.Nodes.Sum(n => n.Glyphs.Length), publicTraceParity = true,
        failed = checks.Where(c => !c.Passed).Take(20), nativeInputSha256 = Hash(await File.ReadAllBytesAsync(reference)) });
    return checks.All(c => c.Passed) ? 0 : 1;
}
catch (Exception error)
{
    await Save("failure.log", Encoding.UTF8.GetBytes(error.ToString().Replace(root, "<repo>", StringComparison.OrdinalIgnoreCase)));
    await Publish(false, new { error = error.Message.Replace(root, "<repo>", StringComparison.OrdinalIgnoreCase) });
    return 2;
}
async Task Save(string name, byte[] bytes)
{
    var target = Path.Combine(output, name); Directory.CreateDirectory(Path.GetDirectoryName(target)!);
    await File.WriteAllBytesAsync(target, bytes); artifacts[name] = Hash(bytes);
}
async Task Publish(bool completed, object? result = null)
{
    var bytes = JsonSerializer.SerializeToUtf8Bytes(new { schemaVersion = 1, role = "path-label-current-numeric", completed,
        phase = completed ? "complete" : phase, converterInvoked, nativeToolInvoked = false,
        approvedImagePolicy = false, imageConformanceClaim = false, imageAdmission = "pending", artifacts, result }, json);
    await File.WriteAllBytesAsync(Path.Combine(output, "report.json"), bytes);
    Console.WriteLine(JsonSerializer.Serialize(new { completed, report = Path.GetRelativePath(root, Path.Combine(output, "report.json")).Replace('\\', '/'), sha256 = Hash(bytes) }));
}
static string Hash(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));

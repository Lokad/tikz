using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Lokad.TikZ;
using Lokad.TikZ.Graphics;
using TikzArrowComparison;

var json = new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true, NewLine = "\n",
    Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) } };
var root = Directory.GetCurrentDirectory();
while (!File.Exists(Path.Combine(root, "Lokad.TikZ.slnx")))
    root = Directory.GetParent(root)?.FullName ?? throw new InvalidOperationException("Repository root missing.");
string At(string name) => Path.GetFullPath(name, root);
string Hash(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));
byte[] Canonical(byte[] bytes) => Encoding.UTF8.GetBytes(Encoding.UTF8.GetString(bytes).Replace("\r\n", "\n", StringComparison.Ordinal));
void Require(bool value, string message) { if (!value) throw new InvalidDataException(message); }
const string reference = "tests/Reference/Arrows/";
const string snapshotHash = "5fe87848c37c9669ce72ea08247d5dcd2d2e57130c1c51fabd8ca2fe3ea97e2d";
string? output = null; var phase = "arguments";
var artifacts = new Dictionary<string, string>(); var inputs = new Dictionary<string, string>(); var sources = new Dictionary<string, string>();
void Save(string name, byte[] bytes)
{
    var file = Path.Combine(output!, name); Directory.CreateDirectory(Path.GetDirectoryName(file)!);
    File.WriteAllBytes(file, bytes); artifacts[name] = Hash(bytes);
}
void Write(string name, object value) => Save(name, Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value, json) + "\n"));
try
{
    Require(args.Length == 0 || args.Length == 2 && args[0] == "--out", "Usage: TikzArrowComparison [--out artifacts/...]; fixed trusted corpus only.");
    var requested = At(args.Length == 0 ? "artifacts/arrow-numeric/run-" + Guid.NewGuid().ToString("D") : args[1]);
    Require(requested.StartsWith(At("artifacts") + Path.DirectorySeparatorChar, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal), "Output must be inside artifacts/.");
    for (var directory = new DirectoryInfo(requested); directory is not null && directory.FullName != root; directory = directory.Parent)
        Require(!directory.Exists || (directory.Attributes & FileAttributes.ReparsePoint) == 0, "Output cannot cross a link or junction.");
    Require(!Directory.Exists(requested) || !Directory.EnumerateFileSystemEntries(requested).Any(), "Output must be fresh.");
    output = requested; Directory.CreateDirectory(output);
    phase = "frozen-evidence";
    var snapshotBytes = File.ReadAllBytes(At(reference + "snapshot.json")); Require(Hash(snapshotBytes) == snapshotHash, "Changed native snapshot.");
    Save("input-captures/" + reference + "snapshot.json", snapshotBytes);
    using var snapshot = JsonDocument.Parse(snapshotBytes);
    foreach (var a in snapshot.RootElement.GetProperty("artifacts").EnumerateObject())
    {
        var file = reference + a.Name; var bytes = File.ReadAllBytes(At(file));
        Require(Hash(bytes) == a.Value.GetString(), "Changed native artifact: " + file);
        inputs[file] = Hash(bytes); Save("input-captures/" + file, bytes);
    }
    foreach (var source in snapshot.RootElement.GetProperty("sourceHashes").EnumerateObject())
    {
        var bytes = Canonical(File.ReadAllBytes(At(source.Name)));
        Require(Hash(bytes) == source.Value.GetString(), "Changed native producer source: " + source.Name);
        inputs[source.Name] = Hash(bytes); Save("input-captures/" + source.Name, bytes);
    }
    foreach (var folder in new[] { "src/Lokad.TikZ", "tools/TikzArrowComparison" })
        foreach (var file in Directory.EnumerateFiles(At(folder), "*", SearchOption.AllDirectories)
            .Where(f => !f.Contains(Path.DirectorySeparatorChar + "obj" + Path.DirectorySeparatorChar) && !f.Contains(Path.DirectorySeparatorChar + "bin" + Path.DirectorySeparatorChar))
            .Order(StringComparer.Ordinal))
        {
            var name = Path.GetRelativePath(root, file).Replace(Path.DirectorySeparatorChar, '/');
            var bytes = Canonical(File.ReadAllBytes(file)); sources[name] = Hash(bytes); Save("source-captures/" + name, bytes);
        }
    foreach (var name in new[] { "Directory.Build.props", "Directory.Packages.props", "global.json" })
    {
        var bytes = Canonical(File.ReadAllBytes(At(name))); sources[name] = Hash(bytes); Save("source-captures/" + name, bytes);
    }
    var ids = new[] { "legacy-defaults", "meta-defaults", "dimensions", "transforms", "curves-nodes", "paint-boundaries" };
    using var manifest = JsonDocument.Parse(File.ReadAllBytes(At(reference + "cases.json")));
    Require(manifest.RootElement.GetProperty("cases").EnumerateArray().Select(c => c.GetProperty("id").GetString()).SequenceEqual(ids), "Incomplete fixed corpus.");
    var rows = new List<object>(); var passed = true; var total = 0;
    foreach (var id in ids)
    {
        phase = "candidate/" + id;
        var source = File.ReadAllText(At(reference + id + "/source.tikz"));
        using var document = JsonDocument.Parse(File.ReadAllBytes(At(reference + id + "/metrics.json")));
        var options = TikzOptions.Default with { IdPrefix = "candidate" };
        GraphicsScene? scene = null;
        var traced = TikzConverter.ConvertWithTrace(source, options, CancellationToken.None, s => scene = s);
        var ordinary = TikzConverter.Convert(source, options, CancellationToken.None);
        if (traced is not TikzSuccess success || ordinary is not TikzSuccess publicResult || scene is null)
        {
            passed = false; Write(id + "/conversion.json", new { traced, ordinary });
            rows.Add(new { id, passed = false, converted = false, diagnostics = traced.Diagnostics });
            Console.WriteLine(id + ": conversion failed: " + string.Join("; ", traced.Diagnostics.Select(d => d.Message)));
            continue;
        }
        var parity = publicResult.Svg == success.Svg && publicResult.PictureBounds == success.PictureBounds
            && publicResult.InkBounds == success.InkBounds && publicResult.Statistics == success.Statistics
            && publicResult.Diagnostics.SequenceEqual(success.Diagnostics);
        var checks = NativeArrowComparison.Compare(scene, success, document.RootElement);
        checks.AddRange(NativeArrowComparison.Compare(EmittedArrowSvg.Read(publicResult.Svg, scene), publicResult, document.RootElement)
            .Select(c => c with { Quantity = "public-svg." + c.Quantity }));
        var casePassed = parity && checks.All(c => c.Passed); total += checks.Count; passed &= casePassed;
        Save(id + "/candidate.svg", Encoding.UTF8.GetBytes(publicResult.Svg));
        Write(id + "/checks.json", checks);
        Write(id + "/scene.json", new {
            pictureBounds = scene.PictureBounds, inkBounds = scene.InkBounds,
            paths = scene.Paths.Select((p, i) => new {
                ordinal = i + 1, role = p.Arrow is null ? "shaft" : "tip", p.Transform, p.Paint, p.Clips,
                source = p.Source.Location, segments = p.Path.Segments,
                arrow = p.Arrow is null ? null : new {
                    p.Arrow.Side, p.Arrow.ShorteningSp, p.Arrow.TotalLengthSp, shaftSource = p.Arrow.ShaftSource.Location,
                    p.Arrow.Template.Name, p.Arrow.Template.TipEndSp, p.Arrow.Template.BackEndSp, p.Arrow.Template.LineEndSp,
                    p.Arrow.Template.VisualTipSp, p.Arrow.Template.VisualBackSp, p.Arrow.Template.ConfiguredSizeSp,
                    p.Arrow.Template.FinalSizeSp, p.Arrow.Template.Hull
                }
            }),
            clips = scene.Clips.Select(c => new { c.FillRule, source = c.Source.Location, segments = c.Path.Segments })
        });
        var failed = checks.Where(c => !c.Passed).ToArray();
        rows.Add(new { id, passed = casePassed, converted = true, publicTraceParity = parity, checks = checks.Count, failed = failed.Length,
            statistics = success.Statistics, imageAdmission = "pending" });
        Console.WriteLine(id + ": " + checks.Count + " checks, " + failed.Length + " failures; public parity " + parity);
        foreach (var failure in failed.Take(6)) Console.WriteLine("  " + failure.Quantity + ": expected " + failure.Expected + ", actual " + failure.Actual);
    }
    phase = "complete";
    Write("report.json", new { schemaVersion = 1, completed = true, passed, phase, snapshotSha256 = snapshotHash, checks = total,
        converterInvoked = true, numericConformanceClaim = passed, approvedImagePolicy = false, imageConformanceClaim = false,
        cases = rows, inputs, sources, assemblySha256 = Hash(File.ReadAllBytes(typeof(TikzConverter).Assembly.Location)),
        artifacts = new Dictionary<string, string>(artifacts) });
    Console.WriteLine("Report: " + Path.Combine(output, "report.json"));
    return passed ? 0 : 1;
}
catch (Exception error)
{
    if (output is not null) Write("report.json", new { schemaVersion = 1, completed = false, passed = false, phase, error = error.Message,
        approvedImagePolicy = false, imageConformanceClaim = false, artifacts = new Dictionary<string, string>(artifacts) });
    Console.Error.WriteLine(phase + ": " + error.Message); return 2;
}

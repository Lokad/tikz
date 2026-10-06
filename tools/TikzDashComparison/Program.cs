using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Lokad.TikZ;
using Lokad.TikZ.Graphics;
using TikzDashReference;

var json = new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true, NewLine = "\n" };
var root = Directory.GetCurrentDirectory(); while (!File.Exists(Path.Combine(root, "Lokad.TikZ.slnx"))) root = Directory.GetParent(root)?.FullName ?? throw new InvalidOperationException("Repository root missing.");
var output = Path.GetFullPath(Path.Combine(root, "artifacts/dash-comparisons/run-" + Guid.NewGuid().ToString("D")));
Directory.CreateDirectory(output);
string At(string file) => Path.GetFullPath(Path.Combine(root, file));
string Hash(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));
string FileHash(string file) => Hash(File.ReadAllBytes(file));
void Write(string file, object value) => File.WriteAllText(Path.Combine(output, file), JsonSerializer.Serialize(value, json) + "\n", new UTF8Encoding(false));
void Require(bool value, string message) { if (!value) throw new InvalidDataException(message); }
try
{
    Require(args.Length == 0, "Usage: TikzDashComparison (trusted fixed fixture only)");
    var toolHashes = new Dictionary<string, string>(StringComparer.Ordinal);
    foreach (var file in new[] { "tools/TikzDashComparison/Program.cs", "tools/TikzDashComparison/TikzDashComparison.csproj", "tools/TikzDashComparison/packages.lock.json", "tools/TikzDashReference/DashEvidence.cs" })
    {
        var bytes = File.ReadAllBytes(At(file)); toolHashes[file] = Hash(bytes); var copy = Path.Combine(output, "tool-sources", file);
        Directory.CreateDirectory(Path.GetDirectoryName(copy)!); File.WriteAllBytes(copy, bytes);
    }
    using var process = System.Diagnostics.Process.Start(new ProcessStartInfo("dotnet") { WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true,
        ArgumentList = { "run", "--project", "tools/TikzDashReference", "-c", "Release", "--no-restore", "--", "check-cached" } }) ?? throw new InvalidOperationException("Cached oracle check did not start.");
    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(120));
    try { await process.WaitForExitAsync(timeout.Token); } catch { if (!process.HasExited) process.Kill(true); throw; }
    Require(process.ExitCode == 0, "Required cached oracle validation failed.");
    var snapshotBytes = File.ReadAllBytes(At("tests/Reference/Dashes/snapshot.json")); using var snapshot = JsonDocument.Parse(snapshotBytes);
    var baseline = At("tests/Reference/Dashes/native");
    foreach (var artifact in snapshot.RootElement.GetProperty("artifacts").EnumerateObject()) Require(Path.GetFileName(artifact.Name) == artifact.Name && FileHash(Path.Combine(baseline, artifact.Name)) == artifact.Value.GetString(), "Changed reference artifact.");
    var sourceBytes = File.ReadAllBytes(At("tests/Fixtures/Dashes/dashes.tikz")); var source = Encoding.UTF8.GetString(sourceBytes);
    var native = DashEvidence.Parse(source, File.ReadAllText(Path.Combine(baseline, "svg.log")), false);
    GraphicsScene? scene = null; var result = TikzConverter.ConvertWithTrace(source, TikzOptions.Default with { IdPrefix = "candidate" }, CancellationToken.None, value => scene = value);
    if (result is not TikzSuccess success || scene is null) { Write("report.json", new { completed = false, verdict = "candidate-conversion-failure", result.Diagnostics }); return 3; }
    Require(scene.Paths.Count == 40 && scene.Nodes.Count == 0 && scene.Glyphs() == 0, "Unexpected public scene coverage.");
    File.WriteAllBytes(Path.Combine(output, "source.tikz"), sourceBytes); File.WriteAllText(Path.Combine(output, "actual.svg"), success.Svg, new UTF8Encoding(false));
    File.Copy(Path.Combine(baseline, "reference.svg"), Path.Combine(output, "reference.svg")); File.Copy(Path.Combine(baseline, "metrics.json"), Path.Combine(output, "reference-metrics.json"));
    File.WriteAllBytes(Path.Combine(output, "reference-snapshot.json"), snapshotBytes);
    var checks = new List<Check>();
    void Scalar(string quantity, double expected, double actual, double tolerance, int index)
    { var error = Math.Abs(expected - actual); checks.Add(new(quantity, expected, actual, tolerance, error, double.IsFinite(error) && error <= tolerance, index >= 0 ? scene.Paths[index].Source.Location : null)); }
    const double spToCss = 96d / (72.27 * 65536), ptToCss = 96d / 72.27;
    var svg = XDocument.Parse(success.Svg); var candidatePaths = svg.Descendants().Where(e => e.Name.LocalName == "path").ToArray(); Require(candidatePaths.Length == 40, "Public SVG paint coverage differs.");
    var referenceDocument = XDocument.Load(Path.Combine(baseline, "reference.svg")); var referencePaths = referenceDocument.Descendants().Where(e => e.Name.LocalName == "path").ToArray(); Require(referencePaths.Length == 40, "Reference paint coverage differs.");
    double D(string value) => double.Parse(value, CultureInfo.InvariantCulture);
    string Attribute(XElement element, string name, string fallback) => element.AncestorsAndSelf().Select(e => e.Attribute(name)?.Value).FirstOrDefault(v => v is not null) ?? fallback;
    var exports = new List<object>();
    for (var i = 0; i < 40; i++)
    {
        var expected = native.Records[i]; var path = scene.Paths[i]; var paint = path.Paint;
        Scalar(expected.Id + ".dash.count", expected.LengthsSp.Length, paint.Dash.Length, 0, i);
        for (var j = 0; j < Math.Min(expected.LengthsSp.Length, paint.Dash.Length); j++) Scalar(expected.Id + ".dash." + j, expected.LengthsSp[j] * spToCss, paint.Dash[j] * 4 / 3, 1e-10, i);
        Scalar(expected.Id + ".phase", expected.PhaseSp * spToCss, paint.DashPhase * 4 / 3, 1e-10, i);
        Scalar(expected.Id + ".width.sp", expected.WidthSp, Math.Round(paint.Width * (72.27 * 65536 / 72), MidpointRounding.AwayFromZero), 0, i);
        var dash = (candidatePaths[i].Attribute("stroke-dasharray")?.Value ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(D).ToArray();
        Scalar(expected.Id + ".svg.dash.count", expected.LengthsSp.Length, dash.Length, 0, i);
        for (var j = 0; j < Math.Min(expected.LengthsSp.Length, dash.Length); j++) Scalar(expected.Id + ".svg.dash." + j, expected.LengthsSp[j] * spToCss, dash[j], .000000500001, i);
        if (dash.Length > 0) Scalar(expected.Id + ".svg.phase", expected.PhaseSp * spToCss, D(candidatePaths[i].Attribute("stroke-dashoffset")!.Value), .000000500001, i);
        static int Cap(string? cap) => cap switch { "butt" => 0, "round" => 1, "square" => 2, _ => -1 };
        Scalar(expected.Id + ".svg.cap", Cap(Attribute(referencePaths[i], "stroke-linecap", "butt")), Cap(candidatePaths[i].Attribute("stroke-linecap")?.Value), 0, i);
        // These focused cases have one independently retained horizontal line.
        const string number = @"[+-]?(?:\d+(?:\.\d*)?|\.\d+)";
        var line = Regex.Match(referencePaths[i].Attribute("d")!.Value, "^M(" + number + @")[ ,]*(" + number + ")H(" + number + ")$"); Require(line.Success, "Unexpected trusted native line grammar.");
        Require(path.Path.Segments.Count == 2, "Public line topology differs.");
        Scalar(expected.Id + ".move.x", D(line.Groups[1].Value) * ptToCss, path.Path.Segments[0].End.X * 4 / 3, 1e-9, i);
        Scalar(expected.Id + ".move.y", D(line.Groups[2].Value) * ptToCss, path.Path.Segments[0].End.Y * 4 / 3, 1e-9, i);
        Scalar(expected.Id + ".line.x", D(line.Groups[3].Value) * ptToCss, path.Path.Segments[1].End.X * 4 / 3, 1e-9, i);
        Scalar(expected.Id + ".line.y", D(line.Groups[2].Value) * ptToCss, path.Path.Segments[1].End.Y * 4 / 3, 1e-9, i);
        exports.Add(new { expected.Id, source = path.Source.Location, svgElementId = "candidate-p" + i, paint = new { width = paint.Width * 4 / 3,
            dash = paint.Dash.Select(d => d * 4 / 3), phase = paint.DashPhase * 4 / 3, paint.Cap, paint.Join },
            segments = path.Path.Segments.Select(s => new { kind = s.Kind.ToString(), x = s.End.X * 4 / 3, y = -s.End.Y * 4 / 3 }), ink = path.InkBounds.Pixels });
    }
    // Only the existing ideal/default width's half-sp rounding is permitted;
    // this numeric serialization budget authorizes no image allowance.
    Scalar("picture.minX", native.Bounds.MinX * spToCss, success.PictureBounds.MinX, .5 * spToCss, -1);
    Scalar("picture.minY", -native.Bounds.MaxY * spToCss, success.PictureBounds.MinY, .5 * spToCss, -1);
    Scalar("picture.maxX", native.Bounds.MaxX * spToCss, success.PictureBounds.MaxX, .5 * spToCss, -1);
    Scalar("picture.maxY", -native.Bounds.MinY * spToCss, success.PictureBounds.MaxY, .5 * spToCss, -1);
    var rootElement = svg.Root!; var viewBox = rootElement.Attribute("viewBox")!.Value.Split(' ').Select(D).ToArray();
    Require(viewBox.Length == 4, "Malformed emitted root dimensions.");
    var rootValues = new[] { native.Bounds.MinX * spToCss, -native.Bounds.MaxY * spToCss,
        (native.Bounds.MaxX - native.Bounds.MinX) * spToCss, (native.Bounds.MaxY - native.Bounds.MinY) * spToCss };
    for (var i = 0; i < 4; i++) Scalar("svg.root.viewBox." + i, rootValues[i], viewBox[i], .5 * spToCss + .000000500001, -1);
    Require(Regex.IsMatch(rootElement.Attribute("width")!.Value, @"^[\d.]+px$") && Regex.IsMatch(rootElement.Attribute("height")!.Value, @"^[\d.]+px$"), "Unexpected root physical units.");
    Scalar("svg.root.width", viewBox[2], D(rootElement.Attribute("width")!.Value[..^2]), 0, -1);
    Scalar("svg.root.height", viewBox[3], D(rootElement.Attribute("height")!.Value[..^2]), 0, -1);
    Write("actual-scene.json", new { paths = exports, success.PictureBounds, success.InkBounds });
    var assembly = typeof(TikzConverter).Assembly; var references = assembly.GetReferencedAssemblies().Select(a => a.Name ?? "").Order(StringComparer.Ordinal).ToArray();
    Require(references.All(n => n == "System" || n.StartsWith("System.", StringComparison.Ordinal)), "Production assembly has a nonframework dependency.");
    foreach (var (file, hash) in toolHashes) Require(FileHash(At(file)) == hash, "Comparison tool changed during conversion.");
    var artifacts = Directory.GetFiles(output, "*", SearchOption.AllDirectories).ToDictionary(f => Path.GetRelativePath(output, f).Replace('\\', '/'), FileHash);
    var passed = checks.All(c => c.Passed);
    Write("report.json", new { schemaVersion = 1, comparisonKind = "public-dash-native-numeric", completed = true, verdict = passed ? "numeric-pass" : "numeric-mismatch",
        overallVerdict = "pending", imageConformanceClaim = false, approvedImagePolicy = false, sourceSha256 = Hash(sourceBytes), referenceSnapshotSha256 = Hash(snapshotBytes),
        compiler = new { sha256 = FileHash(assembly.Location), frameworkReferences = references }, toolHashes,
        comparatorAssemblySha256 = FileHash(typeof(SceneCounts).Assembly.Location), expectedCases = 40, executedCases = exports.Count,
        numeric = new { passed, checks }, primary = new { state = "pending" }, pdf = new { state = "pending" }, artifacts });
    File.WriteAllText(At("artifacts/dash-comparisons/latest.json"), JsonSerializer.Serialize(new { report = Path.GetRelativePath(At("artifacts/dash-comparisons"), Path.Combine(output, "report.json")).Replace('\\', '/'), sha256 = FileHash(Path.Combine(output, "report.json")), completed = true }, json) + "\n");
    Console.WriteLine("Public dash comparison: " + checks.Count + " numeric checks; " + (passed ? "pass" : "mismatch") + "; image/PDF admission pending.");
    if (!passed) foreach (var check in checks.Where(c => !c.Passed).Take(8)) Console.WriteLine(JsonSerializer.Serialize(check, json));
    return passed ? 0 : 1;
}
catch (Exception error) { Write("report.json", new { completed = false, verdict = "infrastructure-error", imageConformanceClaim = false, error = error.Message }); Console.Error.WriteLine(error.Message); return 2; }

internal sealed record Check(string Quantity, double Expected, double Actual, double Tolerance, double AbsoluteError, bool Passed, TikzSourceSpan? Source);
internal static class SceneCounts { internal static int Glyphs(this GraphicsScene scene) => scene.Drawables.OfType<PaintedGlyphRun>().Sum(r => r.Glyphs.Length); }

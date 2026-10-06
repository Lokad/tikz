using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using Lokad.TikZ;
using Lokad.TikZ.Graphics;
using TikzDashGeometryReference;

internal static class DashGeometryComparison
{
    internal static async Task<int> Run()
    {
        var root = Directory.GetCurrentDirectory();
        while (!File.Exists(Path.Combine(root, "Lokad.TikZ.slnx"))) root = Directory.GetParent(root)?.FullName ?? throw new InvalidOperationException("Repository root missing.");
        var json = new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true, NewLine = "\n" };
        var output = Path.Combine(root, "artifacts/dash-geometry-comparisons/run-" + Guid.NewGuid().ToString("D")); Directory.CreateDirectory(output);
        string At(string p) => Path.GetFullPath(Path.Combine(root, p));
        string Hash(byte[] b) => Convert.ToHexStringLower(SHA256.HashData(b));
        string FileHash(string p) => Hash(File.ReadAllBytes(p));
        void Save(string p, object value) => File.WriteAllText(Path.Combine(output, p), JsonSerializer.Serialize(value, json) + "\n", new UTF8Encoding(false));
        void Require(bool value, string message) { if (!value) throw new InvalidDataException(message); }
        var toolHashes = new Dictionary<string, string>();
        try
        {
            foreach (var p in new[] { "tools/TikzDashComparison/Program.cs", "tools/TikzDashComparison/DashGeometryComparison.cs", "tools/TikzDashComparison/TikzDashComparison.csproj",
                "tools/TikzDashComparison/packages.lock.json", "tools/TikzDashGeometryReference/DashGeometryEvidence.cs" })
            {
                var bytes = File.ReadAllBytes(At(p)); toolHashes[p] = Hash(bytes); var copy = Path.Combine(output, "tool-sources", p);
                Directory.CreateDirectory(Path.GetDirectoryName(copy)!); File.WriteAllBytes(copy, bytes);
            }
            using var process = Process.Start(new ProcessStartInfo("dotnet") { WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true,
                ArgumentList = { "run", "--project", "tools/TikzDashGeometryReference", "-c", "Release", "--no-restore", "--", "check-cached" } })
                ?? throw new InvalidOperationException("Cached geometry validator failed to start.");
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(120));
            try { await process.WaitForExitAsync(timeout.Token); } catch { if (!process.HasExited) process.Kill(true); throw; }
            Require(process.ExitCode == 0, "Cached geometry evidence rejected.");
            var snapshotBytes = File.ReadAllBytes(At("tests/Reference/DashGeometry/snapshot.json")); using var snapshot = JsonDocument.Parse(snapshotBytes);
            var baseline = At("tests/Reference/DashGeometry/native");
            foreach (var p in snapshot.RootElement.GetProperty("artifacts").EnumerateObject())
                Require(Path.GetFileName(p.Name) == p.Name && FileHash(Path.Combine(baseline, p.Name)) == p.Value.GetString(), "Changed geometry artifact.");
            var sourceBytes = File.ReadAllBytes(At("tests/Fixtures/Dashes/geometry.tikz")); var source = Encoding.UTF8.GetString(sourceBytes);
            var native = DashGeometryEvidence.Parse(source, File.ReadAllText(Path.Combine(baseline, "svg.log")), false);
            GraphicsScene? scene = null;
            var result = TikzConverter.ConvertWithTrace(source, TikzOptions.Default with { IdPrefix = "geometry" }, CancellationToken.None, s => scene = s);
            if (result is not TikzSuccess success || scene is null) { Save("report.json", new { completed = false, verdict = "candidate-conversion-failure", result.Diagnostics, toolHashes }); return 3; }
            var paints = native.Records.Where(p => p.Actions != "clip").ToArray(); var clips = native.Records.Where(p => p.Actions == "clip").ToArray();
            Require(scene.Paths.Count == 16 && scene.Clips.Count == 3 && scene.Nodes.Count == 0, "Candidate geometry coverage differs.");
            var reference = XDocument.Load(Path.Combine(baseline, "reference.svg"));
            var referencePaths = reference.Descendants().Where(e => e.Name.LocalName == "path" && !e.Ancestors().Any(a => a.Name.LocalName is "defs" or "clipPath")).ToArray();
            var referenceClips = reference.Descendants().Where(e => e.Name.LocalName == "clipPath").ToArray();
            Require(referencePaths.Length == 16 && referenceClips.Length == 3, "Oracle paint/clip coverage differs.");
            var clipIds = referenceClips.Select((e, i) => (Id: e.Attribute("id")!.Value, Index: i)).ToDictionary(p => p.Id, p => p.Index);
            const double spPerBp = 72.27 * 65536 / 72, spToCss = 96d / (72.27 * 65536);
            var checks = new List<GeometryCheck>();
            void Scalar(string id, string quantity, double expected, double observed, double tolerance, TikzSourceSpan? span = null)
            {
                var error = Math.Abs(expected - observed); checks.Add(new(id, quantity, expected, observed, tolerance, error, double.IsFinite(error) && error <= tolerance, span));
            }
            NativeSegment[] Segments(GraphicPath path) => DashGeometryEvidence.Normalize(path.Segments.Select(s => new NativeSegment(s.Kind.ToString(),
                new((int)Math.Round(s.End.X * spPerBp), (int)Math.Round(s.End.Y * spPerBp)),
                new((int)Math.Round(s.A.X * spPerBp), (int)Math.Round(s.A.Y * spPerBp)),
                new((int)Math.Round(s.B.X * spPerBp), (int)Math.Round(s.B.Y * spPerBp)))));
            void Geometry(GeometryRecord expected, GraphicPath path, TikzSourceSpan? span)
            {
                var actual = Segments(path); Scalar(expected.Id, "segments.count", expected.Segments.Length, actual.Length, 0, span);
                for (var j = 0; j < Math.Min(actual.Length, expected.Segments.Length); j++)
                {
                    var e = expected.Segments[j]; var a = actual[j];
                    Scalar(expected.Id, j + ".kind", Array.IndexOf(new[] { "Move", "Line", "Cubic", "Close" }, e.Kind), Array.IndexOf(new[] { "Move", "Line", "Cubic", "Close" }, a.Kind), 0, span);
                    void Point(string q, NativePoint ep, NativePoint ap) { Scalar(expected.Id, j + "." + q + ".x", ep.X, ap.X, 0, span); Scalar(expected.Id, j + "." + q + ".y", ep.Y, ap.Y, 0, span); }
                    Point("end", e.End, a.End); if (e.Kind == "Cubic") { Point("a", e.A, a.A); Point("b", e.B, a.B); }
                }
            }
            var exports = new List<object>();
            for (var i = 0; i < 16; i++)
            {
                var expected = paints[i]; var path = scene.Paths[i]; var paint = path.Paint;
                Geometry(expected, path.Path, path.Source.Location);
                Scalar(expected.Id, "dash.count", expected.LengthsSp.Length, paint.Dash.Length, 0, path.Source.Location);
                for (var j = 0; j < Math.Min(paint.Dash.Length, expected.LengthsSp.Length); j++) Scalar(expected.Id, "dash." + j, expected.LengthsSp[j], Math.Round(paint.Dash[j] * spPerBp), 0, path.Source.Location);
                Scalar(expected.Id, "phase", expected.PhaseSp, Math.Round(paint.DashPhase * spPerBp), 0, path.Source.Location);
                Scalar(expected.Id, "width", expected.WidthSp, Math.Round(paint.Width * spPerBp), 0, path.Source.Location);
                var actions = expected.Actions.Split(',');
                Scalar(expected.Id, "stroke", 1, paint.Stroke ? 1 : 0, 0, path.Source.Location);
                Scalar(expected.Id, "fill", actions.Contains("fill") ? 1 : 0, paint.Fill ? 1 : 0, 0, path.Source.Location);
                string Attribute(string name, string fallback) => referencePaths[i].AncestorsAndSelf().Select(e => e.Attribute(name)?.Value).FirstOrDefault(v => v is not null) ?? fallback;
                int Cap(string name) => name switch { "butt" => 0, "round" => 1, "square" => 2, _ => -1 };
                int Join(string name) => name switch { "miter" => 0, "round" => 1, "bevel" => 2, _ => -1 };
                Scalar(expected.Id, "cap", Cap(Attribute("stroke-linecap", "butt")), Cap(paint.Cap), 0, path.Source.Location);
                Scalar(expected.Id, "join", Join(Attribute("stroke-linejoin", "miter")), Join(paint.Join), 0, path.Source.Location);
                Scalar(expected.Id, "stroke.opacity", double.Parse(Attribute("stroke-opacity", "1"), CultureInfo.InvariantCulture), paint.StrokeOpacity, 0, path.Source.Location);
                if (paint.Fill) Scalar(expected.Id, "fill.opacity", double.Parse(Attribute("fill-opacity", "1"), CultureInfo.InvariantCulture), paint.FillOpacity, 0, path.Source.Location);
                var active = referencePaths[i].AncestorsAndSelf().Reverse().Select(e => e.Attribute("clip-path")?.Value).Where(v => v is not null)
                    .Select(v => { Require(v!.StartsWith("url(#", StringComparison.Ordinal) && v.EndsWith(')'), "Unexpected clip reference."); return clipIds[v[5..^1]]; }).ToArray();
                Scalar(expected.Id, "clips.count", active.Length, path.Clips.Length, 0, path.Source.Location);
                for (var j = 0; j < Math.Min(active.Length, path.Clips.Length); j++) Scalar(expected.Id, "clip." + j, active[j], path.Clips[j], 0, path.Source.Location);
                exports.Add(new { expected.Id, source = path.Source.Location, svgElementId = "geometry-p" + i, segments = Segments(path.Path),
                    paint = new { width = paint.Width * 4 / 3, dash = paint.Dash.Select(d => d * 4 / 3), phase = paint.DashPhase * 4 / 3, paint.Cap, paint.Join, paint.FillRule,
                        paint.Stroke, paint.Fill, paint.StrokeColor, paint.FillColor, paint.StrokeOpacity, paint.FillOpacity },
                    clips = path.Clips, ink = path.InkBounds.Pixels });
            }
            for (var i = 0; i < 3; i++) Geometry(clips[i], scene.Clips[i].Path, null);
            Scalar("picture", "minX", native.Bounds.MinX * spToCss, success.PictureBounds.MinX, .5 * spToCss);
            Scalar("picture", "minY", -native.Bounds.MaxY * spToCss, success.PictureBounds.MinY, .5 * spToCss);
            Scalar("picture", "maxX", native.Bounds.MaxX * spToCss, success.PictureBounds.MaxX, .5 * spToCss);
            Scalar("picture", "maxY", -native.Bounds.MinY * spToCss, success.PictureBounds.MaxY, .5 * spToCss);
            File.WriteAllBytes(Path.Combine(output, "source.tikz"), sourceBytes);
            File.WriteAllText(Path.Combine(output, "actual.svg"), success.Svg, new UTF8Encoding(false)); File.Copy(Path.Combine(baseline, "reference.svg"), Path.Combine(output, "reference.svg"));
            File.Copy(Path.Combine(baseline, "metrics.json"), Path.Combine(output, "native-metrics.json")); File.WriteAllBytes(Path.Combine(output, "reference-snapshot.json"), snapshotBytes);
            Save("actual-scene.json", new { paths = exports, clips = scene.Clips.Select(c => new { segments = Segments(c.Path), c.FillRule }), success.PictureBounds, success.InkBounds });
            var assembly = typeof(TikzConverter).Assembly; var refs = assembly.GetReferencedAssemblies().Select(a => a.Name ?? "").Order(StringComparer.Ordinal).ToArray();
            Require(refs.All(n => n == "System" || n.StartsWith("System.", StringComparison.Ordinal)), "Nonframework runtime reference.");
            foreach (var (file, hash) in toolHashes) Require(FileHash(At(file)) == hash, "Comparison source changed.");
            var artifacts = Directory.GetFiles(output, "*", SearchOption.AllDirectories).ToDictionary(p => Path.GetRelativePath(output, p).Replace('\\', '/'), FileHash);
            var passed = checks.All(c => c.Passed);
            Save("report.json", new { schemaVersion = 1, comparisonKind = "public-dash-geometry-native", completed = true, verdict = passed ? "numeric-pass" : "numeric-mismatch",
                overallVerdict = "pending", imageConformanceClaim = false, approvedImagePolicy = false, expectedPaints = 16, expectedClips = 3,
                numeric = new { passed, checks }, primary = new { state = "pending" }, pdf = new { state = "pending" }, sourceSha256 = Hash(sourceBytes),
                referenceSnapshotSha256 = Hash(snapshotBytes), toolHashes, compiler = new { sha256 = FileHash(assembly.Location), frameworkReferences = refs },
                comparatorAssemblySha256 = FileHash(typeof(DashGeometryComparison).Assembly.Location), artifacts });
            var report = Path.Combine(output, "report.json");
            File.WriteAllText(At("artifacts/dash-geometry-comparisons/latest.json"), JsonSerializer.Serialize(new { completed = true,
                report = Path.GetRelativePath(At("artifacts/dash-geometry-comparisons"), report).Replace('\\', '/'), sha256 = FileHash(report) }, json) + "\n");
            Console.WriteLine("Dash geometry: " + checks.Count + " numeric checks; " + (passed ? "pass" : "mismatch") + "; image admission pending.");
            foreach (var c in checks.Where(c => !c.Passed).Take(10)) Console.WriteLine(JsonSerializer.Serialize(c, json));
            return passed ? 0 : 1;
        }
        catch (Exception e) { Save("report.json", new { completed = false, verdict = "infrastructure-error", toolHashes, error = e.Message }); Console.Error.WriteLine(e.Message); return 2; }
    }
    private sealed record GeometryCheck(string Id, string Quantity, double Expected, double Observed, double Tolerance, double Error, bool Passed, TikzSourceSpan? Source);
}

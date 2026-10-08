using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Lokad.TikZ;
using Lokad.TikZ.Graphics;

internal static partial class ReferenceTool
{
    private static async Task<int> ExportCalcCoordinates(string[] args)
    {
        if (args.Length != 1) throw new ArgumentException("Usage: TikzReference export-calc-coordinates; fixed trusted fixture only.");
        var output = ArtifactDirectory($"artifacts/calc-candidate/run-{Guid.NewGuid()}");
        var phase = "trusted-inputs";
        var artifacts = new Dictionary<string, string>(StringComparer.Ordinal);
        void Save(string file, byte[] bytes)
        {
            File.WriteAllBytes(Path.Combine(output, file), bytes);
            artifacts.Add(file, Convert.ToHexStringLower(SHA256.HashData(bytes)));
        }
        void SaveJson(string file, object value) => Save(file, Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value, Json) + "\n"));
        void Report(bool completed, object? details) => Write(Path.Combine(output, "report.json"), new
        {
            schemaVersion = 1, role = "calc-coordinate-candidate-export", completed, phase,
            converterInvoked = phase != "trusted-inputs", nativeToolInvoked = false,
            approvedImagePolicy = false, imageConformanceClaim = false, imageAdmission = "pending", details, artifacts
        });
        Report(false, null);
        try
        {
            var sourceBytes = File.ReadAllBytes(At("tests/Fixtures/calc-coordinates.tikz"));
            var cacheBytes = File.ReadAllBytes(At("tests/Reference/CalcCoordinates/points.json"));
            var referenceBytes = File.ReadAllBytes(At("tests/Reference/CalcCoordinates/reference.svg"));
            using var cache = JsonDocument.Parse(cacheBytes);
            var expected = cache.RootElement;
            if (expected.GetProperty("schemaVersion").GetInt32() != 1
                || expected.GetProperty("role").GetString() != "native-calc-coordinate-reference"
                || expected.GetProperty("sourceSha256").GetString() != Convert.ToHexStringLower(SHA256.HashData(sourceBytes))
                || expected.GetProperty("observerSvgSha256").GetString() != Convert.ToHexStringLower(SHA256.HashData(referenceBytes)))
                throw new InvalidOperationException("Invalid calc fixture/reference binding.");
            Save("source.tikz", sourceBytes);
            Save("native-points.json", cacheBytes);
            Save("reference.svg", referenceBytes);
            var sourceHashes = Directory.EnumerateFiles(At("src/Lokad.TikZ"), "*", SearchOption.AllDirectories)
                .Select(Relative).Where(file => !file.Contains("/bin/", StringComparison.Ordinal) && !file.Contains("/obj/", StringComparison.Ordinal))
                .Order(StringComparer.Ordinal).ToDictionary(file => file, file => HashFile(At(file)), StringComparer.Ordinal);
            foreach (var file in new[] { "tools/TikzReference/CalcCoordinates.cs", "tools/TikzReference/Program.cs", "tools/TikzReference/TikzReference.csproj", "Directory.Build.props", "global.json" })
                sourceHashes.Add(file, HashFile(At(file)));
            SaveJson("candidate-source-hashes.json", sourceHashes);
            phase = "public-conversion-and-parity";
            var source = new UTF8Encoding(false, true).GetString(sourceBytes);
            var options = TikzOptions.Default with { IdPrefix = "candidate" };
            GraphicsScene? scene = null;
            var traced = TikzConverter.ConvertWithTrace(source, options, CancellationToken.None, value => scene = value);
            var ordinary = TikzConverter.Convert(source, options, CancellationToken.None);
            if (traced is not TikzSuccess success || ordinary is not TikzSuccess publicSuccess || scene is null)
                throw new InvalidOperationException("Calc conversion failed: " + JsonSerializer.Serialize(ordinary.Diagnostics, Json));
            if (success.Svg != publicSuccess.Svg || success.PictureBounds != publicSuccess.PictureBounds
                || success.InkBounds != publicSuccess.InkBounds || success.Statistics != publicSuccess.Statistics
                || !success.Diagnostics.SequenceEqual(publicSuccess.Diagnostics))
                throw new InvalidOperationException("Public/traced conversion parity failed.");
            Save("actual.svg", Encoding.UTF8.GetBytes(success.Svg));
            SaveJson("actual-scene.json", Scene(scene, success));
            phase = "native-anchor-agreement";
            var points = expected.GetProperty("points").EnumerateArray().ToArray();
            if (points.Length != 25 || points.Select(p => p.GetProperty("id").GetString()).Distinct().Count() != 25
                || !points.Select(p => p.GetProperty("id").GetString()).Order().SequenceEqual(scene.Coordinates.Keys.Order()))
                throw new InvalidOperationException("Calc anchor coverage differs.");
            var checks = new List<object>();
            foreach (var point in points)
            {
                var id = point.GetProperty("id").GetString()!;
                var actual = scene.Coordinates[id];
                foreach (var (axis, value) in new[] { ("x", actual.X), ("y", actual.Y) })
                {
                    var reference = point.GetProperty(axis + "Sp").GetInt64();
                    var measured = (long)Math.Round(value * 72.27 * 65536 / 72);
                    if (reference != measured) throw new InvalidOperationException($"Native calc anchor differs: {id}.{axis}");
                    checks.Add(new { name = id + "." + axis, reference, actual = measured, delta = measured - reference, units = "TeX sp", limit = 0, passed = true });
                }
            }
            SaveJson("numeric.json", new { schemaVersion = 1, passed = true, publicTraceParity = true, checks });
            var git = await Process(ResolveExecutable("git"), ["rev-parse", "HEAD"], Root);
            if (git.ExitCode != 0) throw new InvalidOperationException("Cannot capture candidate commit identity.");
            SaveJson("candidate-provenance.json", new
            {
                schemaVersion = 1, commit = git.Output.Trim(), workingTreeSha256 = await WorkingTreeFingerprint(),
                configuration = BuildConfiguration, assemblySha256 = HashFile(typeof(TikzConverter).Assembly.Location), options
            });
            foreach (var (file, digest) in artifacts)
                if (HashFile(Path.Combine(output, file)) != digest) throw new InvalidOperationException("Changed export artifact: " + file);
            foreach (var (file, digest) in sourceHashes)
                if (HashFile(At(file)) != digest) throw new InvalidOperationException("Changed candidate source during export: " + file);
            phase = "complete";
            Report(true, new { anchors = points.Length, quantities = checks.Count, publicTraceParity = true, numericPassed = true });
            Console.WriteLine(JsonSerializer.Serialize(new { completed = true, report = Relative(Path.Combine(output, "report.json")), sha256 = HashFile(Path.Combine(output, "report.json")) }, Json));
            return 0;
        }
        catch (Exception error)
        {
            Report(false, new { error = error.Message.Replace(Root, "<repo>", StringComparison.Ordinal) });
            throw;
        }
    }
}

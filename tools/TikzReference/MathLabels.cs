using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Lokad.TikZ;
using Lokad.TikZ.Graphics;

internal static partial class ReferenceTool
{
    private static async Task<int> ExportMathLabels(string[] args)
    {
        if (args.Length != 3 || args[1] != "--out")
            throw new ArgumentException("Usage: TikzReference export-math-labels --out artifacts/...; three fixed trusted fixtures only.");
        var output = ArtifactDirectory(args[2]);
        var artifacts = new Dictionary<string, string>(StringComparer.Ordinal);
        var records = new List<object>();
        var phase = "source-capture";
        void Save(string file, byte[] bytes)
        {
            var destination = Path.Combine(output, file);
            Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
            File.WriteAllBytes(destination, bytes);
            artifacts.Add(file, Convert.ToHexStringLower(SHA256.HashData(bytes)));
        }
        void SaveJson(string file, object value) => Save(file, Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value, Json) + "\n"));
        void Report(bool completed, string? error = null) => Write(Path.Combine(output, "report.json"), new
        {
            schemaVersion = 1, role = "math-label-candidate-export", completed, phase,
            converterInvoked = records.Count > 0, nativeToolInvoked = false,
            approvedImagePolicy = false, imageConformanceClaim = false, imageAdmission = "pending",
            records, artifacts, error
        });
        Report(false);
        try
        {
            // Reuse the ordinary node scene/source trace. Math rules supplement
            // that trace without changing older families' artifact schemas.
            var hashes = Directory.EnumerateFiles(At("src/Lokad.TikZ"), "*", SearchOption.AllDirectories)
                .Select(Relative).Where(f => !f.Contains("/bin/", StringComparison.Ordinal) && !f.Contains("/obj/", StringComparison.Ordinal))
                .Order(StringComparer.Ordinal).ToDictionary(f => f, f => HashFile(At(f)), StringComparer.Ordinal);
            foreach (var file in new[] { "tools/TikzReference/MathLabels.cs", "tools/TikzReference/Program.cs",
                "tools/TikzReference/NodeSvg.cs", "tools/TikzReference/TikzReference.csproj", "Directory.Build.props", "global.json" })
                hashes.Add(file, HashFile(At(file)));
            SaveJson("candidate-source-hashes.json", hashes);
            foreach (var (folder, id) in new[] { ("Diagrams", "network-math-labels"), ("MathLabels", "math-label-contract"), ("MathLabels", "math-atom-contract") })
            {
                phase = id + "/public-conversion-and-parity";
                var bytes = File.ReadAllBytes(At($"tests/Fixtures/{folder}/{id}.tikz"));
                var source = new UTF8Encoding(false, true).GetString(bytes);
                GraphicsScene? scene = null;
                var options = TikzOptions.Default with { IdPrefix = "candidate" };
                var traced = TikzConverter.ConvertWithTrace(source, options, CancellationToken.None, s => scene = s);
                var ordinary = TikzConverter.Convert(source, options, CancellationToken.None);
                if (traced is not TikzSuccess success || ordinary is not TikzSuccess publicSuccess || scene is null)
                    throw new InvalidOperationException("Math conversion failed: " + JsonSerializer.Serialize(ordinary.Diagnostics, Json));
                if (success.Svg != publicSuccess.Svg || success.PictureBounds != publicSuccess.PictureBounds
                    || success.InkBounds != publicSuccess.InkBounds || success.Statistics != publicSuccess.Statistics
                    || !success.Diagnostics.SequenceEqual(publicSuccess.Diagnostics))
                    throw new InvalidOperationException("Math public/traced conversion parity failed.");
                var trace = JsonSerializer.SerializeToNode(NodeScene(scene, success), Json)!.AsObject();
                // Geometry boxes remain local for arrow templates; their
                // placements are required to check them against global ink.
                trace["pathTransforms"] = JsonSerializer.SerializeToNode(scene.Paths.Select(p => p.Transform), Json);
                trace["glyphs"] = JsonSerializer.SerializeToNode(scene.Drawables.OfType<PaintedGlyphRun>()
                    .SelectMany(run => run.Glyphs.Select(g => (run, g))).Select((e, index) => new
                    {
                        e.run.NodeId, svgElementId = "candidate-g" + index, source = e.g.Placement.Source.Location,
                        e.g.Placement.FontId, e.g.Placement.Slot, e.g.Placement.XSp, e.g.Placement.YSp,
                        e.g.Transform, inkBounds = e.g.InkBounds.Pixels
                    }), Json);
                trace["rules"] = JsonSerializer.SerializeToNode(scene.Drawables.OfType<PaintedGlyphRun>()
                    .SelectMany(run => run.Rules.Select((rule, index) => new
                    {
                        run.NodeId, index, svgElementId = "candidate-n" + run.NodeId, source = rule.Placement.Source.Location,
                        rule.Placement.XSp, rule.Placement.YSp, rule.Placement.WidthSp, rule.Placement.HeightSp,
                        rule.Transform, inkBounds = rule.InkBounds.Pixels
                    })), Json);
                Save(id + "/source.tikz", bytes);
                Save(id + "/actual.svg", Encoding.UTF8.GetBytes(success.Svg));
                SaveJson(id + "/actual-scene.json", trace);
                records.Add(new { id, sourceSha256 = Convert.ToHexStringLower(SHA256.HashData(bytes)),
                    svgSha256 = HashFile(Path.Combine(output, id, "actual.svg")), publicTraceParity = true, success.Statistics });
            }
            SaveJson("candidate-provenance.json", new
            {
                schemaVersion = 1, workingTreeSha256 = await WorkingTreeFingerprint(),
                configuration = BuildConfiguration, assemblySha256 = HashFile(typeof(TikzConverter).Assembly.Location),
                options = TikzOptions.Default with { IdPrefix = "candidate" }
            });
            foreach (var (file, digest) in hashes)
                if (HashFile(At(file)) != digest) throw new InvalidOperationException("Changed candidate source during export: " + file);
            foreach (var (file, digest) in artifacts)
                if (HashFile(Path.Combine(output, file)) != digest) throw new InvalidOperationException("Changed export artifact: " + file);
            phase = "complete";
            Report(true);
            Console.WriteLine(JsonSerializer.Serialize(new { completed = true, report = Relative(Path.Combine(output, "report.json")),
                sha256 = HashFile(Path.Combine(output, "report.json")) }, Json));
            return 0;
        }
        catch (Exception error)
        {
            Report(false, error.Message.Replace(Root, "<repo>", StringComparison.Ordinal));
            throw;
        }
    }
}

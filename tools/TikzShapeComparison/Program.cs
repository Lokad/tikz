using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Xml.Linq;
using Lokad.TikZ;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Text;
using TikzShapeComparison;

return await Comparison.Run(args);

internal static class Comparison
{
    private const string Baseline = "tests/Reference/NodeShapes/native";
    private const double BpPerSp = 72 / (72.27 * 65536);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    { WriteIndented = true, NewLine = "\n", Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) } };
    private sealed record Check(string Quantity, object Expected, object Actual, string Unit, double? Delta,
        double Tolerance, bool Passed, string? NodeId, TikzSourceSpan? SourceSpan, string SourceDocument);
    private static string Root = "";

    internal static async Task<int> Run(string[] args)
    {
        string? output = null;
        try
        {
            if (args.Length is not (1 or 3) || args[0] != "compare-numeric" || args.Length == 3 && args[1] != "--out")
                throw new InvalidOperationException("Usage: TikzShapeComparison compare-numeric [--out artifacts/...]; fixed trusted fixture only; no image-conformance claim.");
            Root = FindRoot();
            var requestedOutput = Path.GetFullPath(args.Length == 3 ? args[2] : "artifacts/node-shape-comparisons", Root);
            if (!requestedOutput.StartsWith(At("artifacts") + Path.DirectorySeparatorChar, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal))
                throw new InvalidOperationException("Comparison output must be a subdirectory of artifacts/.");
            for (var folder = new DirectoryInfo(requestedOutput); folder is not null && folder.FullName != Root; folder = folder.Parent)
                if (folder.Exists && (folder.Attributes & FileAttributes.ReparsePoint) != 0)
                    throw new InvalidOperationException("Comparison output cannot traverse a symbolic link or junction.");
            output = requestedOutput;
            Directory.CreateDirectory(output); File.Delete(Path.Combine(output, "report.json"));
            var configuration = Directory.GetParent(AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar))!.Name;
            var oracle = At($"tools/TikzShapeReference/bin/{configuration}/net10.0/TikzShapeReference.dll");
            var oracleCheck = await VerifyCached(oracle);
            using var manifest = Read("tests/Reference/NodeShapes/cases.json");
            using var metrics = Read(Baseline + "/metrics.json");
            var native = metrics.RootElement.GetProperty("nodes").EnumerateArray().ToArray();
            var ids = manifest.RootElement.GetProperty("cases").EnumerateArray().Select(n => n.GetProperty("id").GetString()!).ToArray();
            var referenceSvg = File.ReadAllText(At(Baseline + "/reference.svg"));
            var evidence = NativeGlyphTrace.Read(File.ReadAllText(At(Baseline + "/native-positions.log")),
                File.ReadAllText(At("tools/TikzFontData/font-profile.json")), ids, referenceSvg,
                Directory.EnumerateFiles(At("tests/Reference/NodeShapes/fonts"), "*.tfm").ToDictionary(f => Path.GetFileName(f), File.ReadAllBytes, StringComparer.Ordinal));
            var source = File.ReadAllText(At(manifest.RootElement.GetProperty("source").GetString()!));
            foreach (var artifact in new[] { "reference.svg", "plain-reference.svg", "oracle.log", "plain-oracle.log", "native-positions.log", "probes.tex", "provenance.json" })
                File.Copy(At(Baseline + "/" + artifact), Path.Combine(output, artifact), true);
            File.Copy(At(Baseline + "/metrics.json"), Path.Combine(output, "reference-metrics.json"), true);
            File.Copy(At("tools/TikzFontData/font-profile.json"), Path.Combine(output, "font-profile.json"), true);
            File.Copy(At("tests/Reference/NodeShapes/cases.json"), Path.Combine(output, "cases.json"), true);
            File.Copy(At("tests/Reference/NodeShapes/oracle-profile.json"), Path.Combine(output, "oracle-profile.json"), true);
            Directory.CreateDirectory(Path.Combine(output, "fonts"));
            foreach (var file in Directory.EnumerateFiles(At("tests/Reference/NodeShapes/fonts"), "*.tfm"))
                File.Copy(file, Path.Combine(output, "fonts", Path.GetFileName(file)), true);
            File.WriteAllText(Path.Combine(output, "source.tikz"), source);
            Write(output, "native-glyphs.json", evidence);
            var (success, scene) = Convert(source, "source.tikz");
            File.WriteAllText(Path.Combine(output, "actual.svg"), success.Svg);
            Write(output, "actual-scene.json", Trace(scene, success));
            var checks = new List<Check>();
            var budget = new Budget(TikzLimits.Default, CancellationToken.None);
            var queryFont = NodeFontMetrics.Resolve(TextFont.Default, budget, new(source, 0, 0));
            Count("nodeCount", native.Length, scene.Nodes.Count, null);
            Count("pathCount", native.Length, scene.Paths.Count, null);
            Count("glyphCount", evidence.Nodes.Sum(n => n.Glyphs.Length), success.Statistics.Glyphs, null);
            var queries = new StringBuilder();
            var borders = new List<(string Id, string Direction, JsonElement Point)>();
            for (var i = 0; i < Math.Min(native.Length, scene.Nodes.Count); i++)
            {
                var expected = native[i]; var node = scene.Nodes[i]; var id = expected.GetProperty("id").GetString()!;
                Identity(id + ".name", id, node.Name, node);
                Identity(id + ".shape", expected.GetProperty("shape").GetString()!, node.Layout is CurvedNodeLayout curved ? curved.Shape.ToString().ToLowerInvariant() : "rectangle", node);
                var values = expected.GetProperty("values"); var dimensions = node.Layout.Dimensions;
                var font = NodeFontMetrics.Resolve(node.NodeFont, budget, node.Source);
                var quantities = new Dictionary<string, int> { ["width"] = node.Layout.Text.WidthSp, ["height"] = node.Layout.Text.HeightSp,
                    ["depth"] = node.Layout.Text.DepthSp, ["quad"] = font.QuadSp, ["xheight"] = font.XHeightSp,
                    ["innerx"] = dimensions.InnerXSp, ["innery"] = dimensions.InnerYSp, ["outerx"] = dimensions.OuterXSp,
                    ["outery"] = dimensions.OuterYSp, ["minimumwidth"] = dimensions.MinimumWidthSp, ["minimumheight"] = dimensions.MinimumHeightSp };
                foreach (var q in quantities) Count(id + "." + q.Key, values.GetProperty(q.Key).GetInt32(), q.Value, node, "integer sp");
                var backgrounds = scene.Paths.Where(p => p.Source == node.Source).ToArray();
                Count(id + ".backgroundCount", 1, backgrounds.Length, node);
                if (backgrounds.Length != 1) continue;
                Physical(id + ".lineWidth", values.GetProperty("linewidth").GetInt32(), backgrounds[0].Paint.Width, node);
                foreach (var anchor in expected.GetProperty("anchors").EnumerateObject())
                    Point(id + ".anchor." + anchor.Name, anchor.Value, PgfTransform.Apply(node.Transform, node.Layout.Anchor(anchor.Name, queryFont, budget, node.Source).Bp, budget, node.Source), node);
                var frame = expected.GetProperty("frame");
                Real(id + ".frame.a", frame.GetProperty("a").GetDouble(), node.Transform.A, "coefficient", 0, node);
                Real(id + ".frame.b", frame.GetProperty("b").GetDouble(), node.Transform.B, "coefficient", 0, node);
                Real(id + ".frame.c", frame.GetProperty("c").GetDouble(), node.Transform.C, "coefficient", 0, node);
                Real(id + ".frame.d", frame.GetProperty("d").GetDouble(), node.Transform.D, "coefficient", 0, node);
                Physical(id + ".frame.e", frame.GetProperty("eSp").GetInt32(), node.Transform.E, node);
                Physical(id + ".frame.f", frame.GetProperty("fSp").GetInt32(), node.Transform.F, node);
                var tokens = backgrounds[0].Path.Segments.SelectMany(s => s.Kind switch {
                    SegmentKind.Cubic => new[] { ("control1", s.A), ("control2", s.B), ("curve", s.End) },
                    SegmentKind.Move => new[] { ("move", s.End) }, SegmentKind.Close => new[] { ("close", s.End) },
                    _ => new[] { ("unexpected", s.End) } }).ToArray();
                var nativeTokens = expected.GetProperty("path").EnumerateArray().ToArray();
                Count(id + ".pathTokenCount", nativeTokens.Length, tokens.Length, node);
                for (var j = 0; j < Math.Min(tokens.Length, nativeTokens.Length); j++)
                {
                    Identity(id + ".path." + j + ".kind", nativeTokens[j].GetProperty("kind").GetString()!, tokens[j].Item1, node);
                    Point(id + ".path." + j, nativeTokens[j].GetProperty("point"), tokens[j].Item2, node);
                }
                var glyphs = evidence.Nodes[i].Glyphs; var measured = node.Layout.Text.Glyphs;
                var runs = scene.Drawables.OfType<PaintedGlyphRun>().Where(r => r.NodeId == i).ToArray();
                Count(id + ".glyphRunCount", 1, runs.Length, node);
                var emitted = runs.SelectMany(r => r.Glyphs).ToArray();
                Count(id + ".measuredGlyphCount", glyphs.Length, measured.Length, node);
                Count(id + ".emittedGlyphCount", glyphs.Length, emitted.Length, node);
                for (var j = 0; j < Math.Min(glyphs.Length, Math.Min(measured.Length, emitted.Length)); j++)
                {
                    var e = glyphs[j]; var a = measured[j]; var name = id + ".glyph." + j;
                    Identity(name + ".font", e.Font, a.FontId, node, a.Source);
                    Count(name + ".slot", e.Slot, a.Slot, node, "EC slot", a.Source);
                    Count(name + ".x", e.XSp, a.XSp, node, "integer sp", a.Source);
                    Count(name + ".y", e.YSp, a.YSp, node, "integer sp; local y down", a.Source);
                    var t = emitted[j].Transform;
                    // DVI glyph placement is carried by the driver's floating
                    // affine text frame, without PGF point-register truncation.
                    var x = (frame.GetProperty("eSp").GetInt32() + frame.GetProperty("a").GetDouble() * e.XSp - frame.GetProperty("c").GetDouble() * e.YSp) * BpPerSp;
                    var y = (frame.GetProperty("fSp").GetInt32() + frame.GetProperty("b").GetDouble() * e.XSp - frame.GetProperty("d").GetDouble() * e.YSp) * BpPerSp;
                    Real(name + ".globalX", x, t.E, "bp; native frame and DVI position", 1e-9, node, a.Source);
                    Real(name + ".globalY", y, t.F, "bp; native frame and DVI position", 1e-9, node, a.Source);
                    foreach (var (component, value, actual) in new[] { ("a", frame.GetProperty("a").GetDouble(), t.A), ("b", frame.GetProperty("b").GetDouble(), t.B),
                        ("c", -frame.GetProperty("c").GetDouble(), t.C), ("d", -frame.GetProperty("d").GetDouble(), t.D) })
                        Real(name + ".transform." + component, value, actual, "coefficient", 0, node, a.Source);
                }
                var center = expected.GetProperty("anchors").GetProperty("center");
                foreach (var direction in manifest.RootElement.GetProperty("directions").EnumerateArray())
                {
                    var name = direction.GetProperty("id").GetString()!;
                    var x = checked(center.GetProperty("xSp").GetInt32() + direction.GetProperty("xSp").GetInt32());
                    var y = checked(center.GetProperty("ySp").GetInt32() + direction.GetProperty("ySp").GetInt32());
                    queries.Append(FormattableString.Invariant($"\\draw({x}sp,{y}sp)--({id});\n"));
                    borders.Add((id, name, expected.GetProperty("borders").GetProperty(name)));
                }
            }
            var b = metrics.RootElement.GetProperty("pictureBounds");
            Physical("picture.minX", b.GetProperty("minXSp").GetInt32(), scene.PictureBounds.MinX, null);
            Physical("picture.minY", b.GetProperty("minYSp").GetInt32(), scene.PictureBounds.MinY, null);
            Physical("picture.maxX", b.GetProperty("maxXSp").GetInt32(), scene.PictureBounds.MaxX, null);
            Physical("picture.maxY", b.GetProperty("maxYSp").GetInt32(), scene.PictureBounds.MaxY, null);
            var insertion = source.LastIndexOf("\\end{tikzpicture}", StringComparison.Ordinal);
            if (insertion < 0) throw new InvalidOperationException("Trusted picture has no closing statement.");
            var querySource = source.Insert(insertion, queries.ToString());
            File.WriteAllText(Path.Combine(output, "source-borders.tikz"), querySource);
            var (querySuccess, queryScene) = Convert(querySource, "source-borders.tikz");
            File.WriteAllText(Path.Combine(output, "actual-borders.svg"), querySuccess.Svg);
            Write(output, "actual-border-scene.json", Trace(queryScene, querySuccess));
            Count("borderQueryCount", native.Length * 16, borders.Count, null);
            Count("borderPathCount", scene.Paths.Count + borders.Count, queryScene.Paths.Count, null);
            for (var i = 0; i < Math.Min(borders.Count, queryScene.Paths.Count - scene.Paths.Count); i++)
            {
                var q = borders[i]; var path = queryScene.Paths[scene.Paths.Count + i];
                Point(q.Id + ".border." + q.Direction, q.Point, path.Path.Segments[^1].End, scene.Nodes.Single(n => n.Name == q.Id), path.Source, "source-borders.tikz");
            }
            using var provenance = Read(Baseline + "/provenance.json");
            var owned = new[] { "reference.svg", "plain-reference.svg", "oracle.log", "plain-oracle.log", "native-positions.log", "probes.tex", "provenance.json",
                "reference-metrics.json", "font-profile.json", "cases.json", "oracle-profile.json", "source.tikz", "native-glyphs.json", "actual.svg", "actual-scene.json",
                "source-borders.tikz", "actual-borders.svg", "actual-border-scene.json", "fonts/ec-lmr10.tfm", "fonts/ec-lmri12.tfm" };
            var artifacts = owned.ToDictionary(f => f, f => HashFile(Path.Combine(output, f)));
            Write(output, "candidate-provenance.json", new { schemaVersion = 1, command = "compare-numeric", cachedOracleVerification = oracleCheck,
                converterAssemblySha256 = HashFile(typeof(TikzConverter).Assembly.Location), comparisonAssemblySha256 = HashFile(typeof(Comparison).Assembly.Location),
                toolSources = Directory.EnumerateFiles(At("tools/TikzShapeComparison"), "*", SearchOption.TopDirectoryOnly).Where(f => Path.GetExtension(f) is ".cs" or ".csproj")
                    .Order(StringComparer.Ordinal).ToDictionary(f => Path.GetRelativePath(Root, f).Replace('\\', '/'), HashFile),
                converterSources = Directory.EnumerateFiles(At("src/Lokad.TikZ"), "*", SearchOption.AllDirectories)
                    .Where(f => Path.GetExtension(f) is ".cs" or ".csproj" or ".json"
                        && !Path.GetRelativePath(At("src/Lokad.TikZ"), f).Split(Path.DirectorySeparatorChar).Any(s => s is "bin" or "obj"))
                    .Order(StringComparer.Ordinal).ToDictionary(f => Path.GetRelativePath(Root, f).Replace('\\', '/'), HashFile),
                oracleProvenanceSha256 = HashFile(At(Baseline + "/provenance.json")), oracleSourceHashes = provenance.RootElement.GetProperty("sourceHashes"), artifacts });
            var passed = checks.All(c => c.Passed);
            Write(output, "report.json", new { schemaVersion = 1, comparisonKind = "public-numeric-only", completed = true,
                verdict = passed ? "numeric-pass" : "numeric-mismatch", overallVerdict = passed ? "pending" : "failed", approvedImagePolicy = false, imageConformanceClaim = false,
                profile = metrics.RootElement.GetProperty("profile").GetString(), sourceDocument = "source.tikz", numeric = new { passed, checks },
                primary = new { state = "pending", reason = "This shape family has no independently calibrated image policy." },
                pdf = new { state = "pending", reason = "Ordinary PDF reference and calibration remain required." },
                provenance = "candidate-provenance.json", provenanceSha256 = HashFile(Path.Combine(output, "candidate-provenance.json")) });
            File.WriteAllText(Path.Combine(output, "index.html"), "<!doctype html><meta charset=\"utf-8\"><title>Shape numeric comparison</title><h1>Circle/ellipse numeric comparison: " + (passed ? "pass" : "mismatch")
                + "</h1><p>Image and PDF gates pending.</p><ul><li><a href=\"report.json\">Numeric report</a></li><li><a href=\"actual-scene.json\">Candidate scene and source spans</a></li>"
                + "<li><a href=\"native-glyphs.json\">Independent DVI glyphs</a></li><li><a href=\"reference.svg\">Original native SVG</a></li><li><a href=\"actual.svg\">Candidate SVG</a></li></ul>");
            Console.WriteLine($"Public shape numeric comparison: {(passed ? "pass" : "mismatch")}; {checks.Count} checks; {evidence.Nodes.Sum(n => n.Glyphs.Length)} independently measured glyphs. Image/PDF gates pending.");
            foreach (var check in checks.Where(c => !c.Passed).Take(16)) Console.WriteLine($"  {check.Quantity}: expected {check.Expected}, actual {check.Actual} ({check.Unit})");
            return passed ? 0 : 1;

            void Identity(string quantity, string expected, string actual, ResolvedNode? node, Source? location = null)
                => checks.Add(new(quantity, expected, actual, "identity", null, 0, expected == actual, node?.Name, (location ?? node?.Source)?.Location, "source.tikz"));
            void Count(string quantity, int expected, int actual, ResolvedNode? node, string unit = "count", Source? location = null)
                => checks.Add(new(quantity, expected, actual, unit, Math.Abs((long)expected - actual), 0, expected == actual, node?.Name, (location ?? node?.Source)?.Location, "source.tikz"));
            void Real(string quantity, double expected, double actual, string unit, double tolerance, ResolvedNode? node, Source? location = null, string document = "source.tikz")
            {
                var delta = Math.Abs(expected - actual);
                checks.Add(new(quantity, expected, actual, unit, double.IsFinite(delta) ? delta : null, tolerance, double.IsFinite(delta) && delta <= tolerance, node?.Name, (location ?? node?.Source)?.Location, document));
            }
            void Physical(string quantity, int sp, double actual, ResolvedNode? node, Source? location = null, string document = "source.tikz")
                => Real(quantity, sp * BpPerSp, actual, "bp; native integer sp converted exactly", 1e-9, node, location, document);
            void Point(string quantity, JsonElement expected, Lokad.TikZ.Geometry.Point actual, ResolvedNode? node, Source? location = null, string document = "source.tikz")
            {
                Physical(quantity + ".x", expected.GetProperty("xSp").GetInt32(), actual.X, node, location, document);
                Physical(quantity + ".y", expected.GetProperty("ySp").GetInt32(), actual.Y, node, location, document);
            }
        }
        catch (Exception e)
        {
            var candidateFailure = e is CandidateFailure;
            if (output is not null && Directory.Exists(output)) Write(output, "report.json", new { schemaVersion = 1, comparisonKind = "public-numeric-only", completed = false,
                verdict = candidateFailure ? "candidate-conversion-failure" : "infrastructure-error", imageConformanceClaim = false, error = e.Message });
            Console.Error.WriteLine(e.Message); return candidateFailure ? 3 : 2;
        }
    }

    private sealed class CandidateFailure(string message) : Exception(message);
    private static (TikzSuccess, GraphicsScene) Convert(string source, string document)
    {
        GraphicsScene? scene = null;
        var result = TikzConverter.ConvertWithTrace(source, TikzOptions.Default with { Libraries = ["shapes.geometric"], IdPrefix = "candidate" }, CancellationToken.None, s => scene = s);
        if (result is not TikzSuccess success || scene is null) throw new CandidateFailure(document + ": " + JsonSerializer.Serialize(result.Diagnostics, Json));
        return (success, scene);
    }
    private static object Trace(GraphicsScene scene, TikzSuccess success)
    {
        var glyphs = scene.Drawables.OfType<PaintedGlyphRun>().SelectMany(r => r.Glyphs.Select(g => (Run: r, Glyph: g))).ToArray();
        return new { schemaVersion = 1, units = "geometry/affine in bp, y up; bounds in CSS pixels, y down; measured layout in integer sp", success.PictureBounds, success.InkBounds, success.Statistics,
            nodes = scene.Nodes.Select((n, i) => new { semanticId = "node-" + i, svgElementId = "candidate-n" + i, n.Name, source = n.Source.Location,
                text = new { n.Layout.Text.WidthSp, n.Layout.Text.HeightSp, n.Layout.Text.DepthSp, n.Layout.Text.Readable, n.Layout.Text.Lines }, n.Layout.Dimensions, n.Transform, n.Font, n.NodeFont }),
            paths = scene.Paths.Select((p, i) => new { semanticId = "path-" + i, svgElementId = "candidate-p" + i, source = p.Source.Location,
                geometryBounds = p.Path.Bounds.Pixels, inkBounds = p.InkBounds.Pixels, p.Paint, p.Clips, segmentsBp = p.Path.Segments }),
            glyphs = glyphs.Select((e, i) => new { semanticId = "glyph-" + i, svgElementId = "candidate-g" + i, source = e.Glyph.Placement.Source.Location,
                e.Glyph.Placement.FontId, e.Glyph.Placement.Slot, e.Glyph.Placement.XSp, e.Glyph.Placement.YSp, e.Glyph.Transform,
                inkBounds = e.Glyph.InkBounds.Pixels, e.Run.NodeId, e.Run.Color, e.Run.Opacity }),
            paintOrder = scene.Drawables.Select((d, i) => new { index = i, kind = d is PaintedPath ? "path" : "glyph-run", source = d.Source.Location, d.Clips }) };
    }
    private static async Task<string> VerifyCached(string oracle)
    {
        if (!File.Exists(oracle)) throw new InvalidOperationException("Independent shape oracle build is missing.");
        var info = new ProcessStartInfo("dotnet") { WorkingDirectory = Root, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        info.ArgumentList.Add(oracle); info.ArgumentList.Add("check-cached");
        using var process = Process.Start(info) ?? throw new InvalidOperationException("Cannot start independent cached oracle check.");
        try
        {
            var stdout = Capture(process.StandardOutput); var stderr = Capture(process.StandardError);
            await Task.WhenAll(stdout, stderr, process.WaitForExitAsync()).WaitAsync(TimeSpan.FromSeconds(60));
            var text = await stdout + await stderr;
            if (process.ExitCode != 0) throw new InvalidOperationException("Independent cached evidence check failed: " + text);
            return text.Trim();
        }
        finally { if (!process.HasExited) process.Kill(true); }
        static async Task<string> Capture(StreamReader reader)
        {
            var result = new StringBuilder(); var buffer = new char[4096]; int count;
            while ((count = await reader.ReadAsync(buffer)) > 0)
            {
                if (result.Length + count > 1_000_000) throw new InvalidOperationException("Cached verifier output limit exceeded.");
                result.Append(buffer, 0, count);
            }
            return result.ToString();
        }
    }
    private static string FindRoot()
    {
        for (var folder = new DirectoryInfo(Directory.GetCurrentDirectory()); folder is not null; folder = folder.Parent)
            if (File.Exists(Path.Combine(folder.FullName, "Lokad.TikZ.slnx"))) return folder.FullName;
        throw new InvalidOperationException("Run from the repository workspace.");
    }
    private static string At(string path) => Path.Combine(Root, path.Replace('/', Path.DirectorySeparatorChar));
    private static JsonDocument Read(string path) => JsonDocument.Parse(File.ReadAllText(At(path)));
    private static string HashFile(string path) => System.Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(path)));
    private static void Write(string output, string file, object value) => File.WriteAllText(Path.Combine(output, file), JsonSerializer.Serialize(value, Json) + "\n");
}

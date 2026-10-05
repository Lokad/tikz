using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Xml.Linq;

internal static partial class ReferenceTool
{
    private static async Task<int> CompareBorderFramed(string[] args)
    {
        if (args.Length != 1) throw new InvalidOperationException("Framed border comparison accepts no arguments; its raw and derived routes are both retained.");
        var output = ArtifactDirectory("artifacts/border-framed-candidates");
        ResetDirectory(output);
        var raw = Path.Combine(output, "original");
        var rawExit = await Run(["compare-border-paths", "--out", Relative(raw)]);
        if (rawExit is not (0 or 1)) return rawExit;
        var manifest = Read<CaseManifest>(At("tests/Reference/NodeBorders/path-cases.json"));
        var results = new List<object>();
        var exit = 0;
        foreach (var definition in manifest.Cases)
        {
            var original = Path.Combine(raw, definition.Id);
            var folder = Path.Combine(output, definition.Id);
            foreach (var file in Directory.EnumerateFiles(original, "*", SearchOption.AllDirectories))
            {
                var copied = Path.Combine(folder, Path.GetRelativePath(original, file));
                Directory.CreateDirectory(Path.GetDirectoryName(copied)!);
                File.Copy(file, copied);
            }
            File.Copy(Path.Combine(folder, "reference.svg"), Path.Combine(folder, "original-driver.svg"));
            var document = XDocument.Load(Path.Combine(folder, "reference.svg"));
            var metrics = Read<ReferenceMetrics>(Path.Combine(folder, "reference-metrics.json"));
            var frame = BorderFrame(document, metrics);
            ApplyOracleFrame(document, frame.Camera, false);
            File.WriteAllText(Path.Combine(folder, "reference.svg"), document.ToString(SaveOptions.DisableFormatting));
            Write(Path.Combine(folder, "frame.json"), frame);
            var input = JsonNode.Parse(Text(Path.Combine(folder, "comparison-input.json")))!.AsObject();
            input["referenceMode"] = "derived-native-stroke-frame; original-driver.svg retained";
            input["scope"] = "Provisional border comparison against independently measured stroke envelope; exact primary and unapproved PDF research; no image policy admission";
            input["regionalChecks"] = JsonSerializer.SerializeToNode(BorderRegions(frame), Json);
            File.WriteAllText(Path.Combine(folder, "comparison-input.json"), input.ToJsonString(Json));
            var rendered = await Process(ResolveExecutable("node"), [At("tools/TikzVisual/compare.mjs"), folder], Root);
            if (rendered.ExitCode is not (0 or 1)) throw new InvalidOperationException("Framed candidate runner failed: " + rendered.Output);
            var report = Read<JsonElement>(Path.Combine(folder, "report.json"));
            results.Add(new { caseId = definition.Id, exitCode = rendered.ExitCode, approvedPolicy = false,
                originalReport = "original/" + definition.Id + "/report.json", framedReport = definition.Id + "/report.json",
                numeric = report.GetProperty("numeric").GetProperty("passed"), dimensions = report.GetProperty("dimensions"),
                primary = report.GetProperty("primary").GetProperty("passed"), pdf = report.GetProperty("pdf").GetProperty("passed") });
            exit = Math.Max(exit, rendered.ExitCode);
            Console.WriteLine($"{definition.Id}: framed numeric/dimensions measured; original comparison retained; image admission pending.");
        }
        Write(Path.Combine(output, "suite.json"), new { schemaVersion = 1, completed = results.Count == manifest.Cases.Length, approvedPolicy = false,
            expectedCases = manifest.Cases.Select(c => c.Id), cases = results, passed = exit == 0 });
        var links = string.Join('\n', manifest.Cases.Select(c => $"<li>{c.Id}: <a href=\"{c.Id}/index.html\">independent frame</a> · <a href=\"original/{c.Id}/index.html\">original driver</a></li>"));
        File.WriteAllText(Path.Combine(output, "index.html"), "<!doctype html><meta charset=\"utf-8\"><h1>Border frame research</h1><p>Image policy admission pending. Original and independently framed comparisons are separate.</p><ul>" + links + "</ul><a href=\"suite.json\">suite</a>");
        return exit;
    }

    // Independent native measurements and offset-line intersections. No
    // converter, scene, production stroke helper, or SVG writer is called.
    private static async Task<int> BorderFraming(string[] args)
    {
        if (args.Length != 1) throw new InvalidOperationException("Border framing accepts no arguments; only the trusted three-case manifest is inspected.");
        const string manifestPath = "tests/Reference/NodeBorders/path-cases.json";
        var manifest = Read<CaseManifest>(At(manifestPath));
        string[] ids = ["node-border-lines", "node-border-paths", "node-border-transforms"];
        if (manifest.SchemaVersion != 1 || manifest.Profile != Profile.Id || !manifest.Cases.Select(c => c.Id).SequenceEqual(ids))
            throw new InvalidOperationException("Unexpected trusted border framing corpus.");
        var output = ArtifactDirectory("artifacts/border-native-framing");
        ResetDirectory(output);
        var cases = new List<object>();
        foreach (var definition in manifest.Cases)
        {
            var baseline = At("tests/Reference/" + definition.Id);
            var provenance = Read<Provenance>(Path.Combine(baseline, "provenance.json"));
            if (provenance.SourceSha256 != HashText(Text(At(definition.Source)))
                || provenance.CaseDefinition != JsonSerializer.Serialize(definition, Json)
                || provenance.WrapperSha256 != HashText(Text(At("tests/Reference/wrapper.tex")))
                || provenance.ProfileSha256 != HashFile(At("tests/Reference/oracle-profile.json")))
                throw new InvalidOperationException("Independent border reference provenance differs.");
            foreach (var artifact in provenance.Artifacts)
                if (Path.GetFileName(artifact.Key) != artifact.Key || HashFile(Path.Combine(baseline, artifact.Key)) != artifact.Value)
                    throw new InvalidOperationException("Independent border artifact differs: " + artifact.Key);
            var folder = Path.Combine(output, definition.Id);
            Directory.CreateDirectory(folder);
            foreach (var file in provenance.Artifacts.Keys.Append("provenance.json")) File.Copy(Path.Combine(baseline, file), Path.Combine(folder, file));
            File.Copy(At(definition.Source), Path.Combine(folder, "source.tikz"));
            var metrics = Read<ReferenceMetrics>(Path.Combine(folder, "reference-metrics.json"));
            var document = XDocument.Load(Path.Combine(folder, "reference.svg"));
            if (metrics.SchemaVersion != 2 || metrics.Clips.Length != 0 || document.Descendants().Any(e => e.Name.LocalName is "use" or "clipPath"))
                throw new InvalidOperationException("This native border experiment supports only unclipped, unlabelled paths.");
            var frame = BorderFrame(document, metrics);
            ApplyOracleFrame(document, frame.Camera, true);
            File.WriteAllText(Path.Combine(folder, "actual.svg"), document.ToString(SaveOptions.DisableFormatting));
            Write(Path.Combine(folder, "actual-scene.json"), new { schemaVersion = 1, paths = Array.Empty<object>(), scope = "Native-only stroke/frame experiment; no candidate scene" });
            var regions = BorderRegions(frame);
            Write(Path.Combine(folder, "comparison-input.json"), new { schemaVersion = 1, caseId = definition.Id + "-native-frame",
                referenceMode = "original-driver-versus-independent-stroke-frame", referenceOriginBp = frame.Camera.Origin,
                actualUnits = "bp", actualLabel = "Oracle with independently measured stroke envelope",
                exactPrimary = true, scope = "Oracle-only framing experiment; original crop retained; no approved image policy",
                numericTolerancePixels = definition.NumericTolerancePixels, numeric = new { passed = true, checks = Array.Empty<NumericCheck>() },
                regionalChecks = regions, pdf = new { originPixels = metrics.PdfOriginPixels } });
            Write(Path.Combine(folder, "frame.json"), frame);
            var rendered = await Process(ResolveExecutable("node"), [At("tools/TikzVisual/compare.mjs"), folder], Root);
            if (rendered.ExitCode is not (0 or 1)) throw new InvalidOperationException("Native frame renderer failed: " + rendered.Output);
            var report = Read<JsonElement>(Path.Combine(folder, "report.json"));
            cases.Add(new { caseId = definition.Id, frame, regions,
                sourceSha256 = provenance.SourceSha256, originalProvenance = provenance,
                expandedOracleSha256 = HashFile(Path.Combine(folder, "actual.svg")), frameSha256 = HashFile(Path.Combine(folder, "frame.json")),
                dimensions = report.GetProperty("dimensions"), primary = report.GetProperty("primary"), pdf = report.GetProperty("pdf"),
                renderer = report.GetProperty("renderer"), artifacts = report.GetProperty("artifacts") });
            Console.WriteLine($"{definition.Id}: independent native stroke/frame measurements; {regions.Length} fixed path regions; original crop differences retained.");
        }
        var sources = new[] { manifestPath, "tools/TikzReference/BorderFraming.cs", "tools/TikzReference/OracleStrokeFrame.cs",
            "tools/TikzReference/ReferenceMeasurements.cs", "tools/TikzReference/Program.cs", "tools/TikzVisual/compare.mjs", "tools/TikzVisual/browser-profile.json" };
        Write(Path.Combine(output, "evidence.json"), new { schemaVersion = 1, completed = true, converterInvoked = false, approvedPolicy = false,
            conformanceClaim = false, scope = "Native-only border stroke envelopes, original viewport controls and fixed local regions",
            expectedCases = ids, toolHashes = sources.ToDictionary(file => file, file => HashFile(At(file))), cases });
        return 0;
    }

    private static object[] BorderRegions(BorderNativeFrame frame)
    {
        var limits = new[] { 1, 4 }.SelectMany(scale => new[] { "transparent", "white", "black" }.Select(background => new {
            scale, background, maxChannelError = 0, maxMeanForegroundError = 0, maxEdgeDisplacementPixels = 0, maxComponentDifference = 0
        })).ToArray();
        var paths = frame.Paths.Select(p => (object)new {
            id = "path-" + p.PathIndex, basis = "Independent native path geometry, circular pen envelope and offset-line joins; one CSS pixel padding",
            actualElementId = "candidate-p" + p.PathIndex,
            rectanglePixels = new { x = p.BoundsPt.MinX * PtToPixels - 1, y = -p.BoundsPt.MaxY * PtToPixels - 1,
                width = (p.BoundsPt.MaxX - p.BoundsPt.MinX) * PtToPixels + 2,
                height = (p.BoundsPt.MaxY - p.BoundsPt.MinY) * PtToPixels + 2 }, limits
        }).ToArray();
        var corners = frame.Paths.SelectMany(p => p.MiterPointsPt.Select((point, index) => (object)new {
            id = "path-" + p.PathIndex + "-miter-" + index,
            basis = "Independent native offset-line intersection; fixed one CSS pixel padding around the stroke radius",
            actualElementId = "candidate-p" + p.PathIndex,
            rectanglePixels = new { x = point.X * PtToPixels - p.StrokeRadiusPt * PtToPixels - 1,
                y = -point.Y * PtToPixels - p.StrokeRadiusPt * PtToPixels - 1,
                width = 2 * p.StrokeRadiusPt * PtToPixels + 2, height = 2 * p.StrokeRadiusPt * PtToPixels + 2 }, limits
        })).ToArray();
        return [.. paths, .. corners];
    }

    private static BorderNativeFrame BorderFrame(XDocument document, ReferenceMetrics metrics)
    {
        var root = document.Root!;
        var view = root.Attribute("viewBox")!.Value.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(Parse).ToArray();
        var group = document.Descendants().First(e => e.Name.LocalName == "g" && (e.Attribute("transform")?.Value ?? "").StartsWith("translate(", StringComparison.Ordinal));
        var t = Match(group.Attribute("transform")!.Value, @"^translate\(([-\d.]+),([-\d.]+)\)scale\(([-\d.]+),([-\d.]+)\)$");
        var original = new PhysicalBounds((view[0] - t[0]) / t[2], -(view[1] + view[3] - t[1]) / t[2],
            (view[0] + view[2] - t[0]) / t[2], -(view[1] - t[1]) / t[2]);
        var frame = Union(original, metrics.PictureBoundsPt);
        var elements = document.Descendants().Where(e => e.Name.LocalName == "path" && !e.Ancestors().Any(a => a.Name.LocalName == "defs")).ToArray();
        if (elements.Length != metrics.Paths.Length) throw new InvalidOperationException("Native frame operation counts differ.");
        var paths = new List<BorderPathFrame>();
        for (var index = 0; index < metrics.Paths.Length; index++)
        {
            var path = metrics.Paths[index];
            var limit = Parse(elements[index].AncestorsAndSelf().Select(e => e.Attribute("stroke-miterlimit")?.Value).FirstOrDefault(v => v is not null) ?? "4");
            var envelope = NativeStrokeEnvelope(path, limit);
            frame = Union(frame, envelope.Bounds);
            paths.Add(new(index, envelope.Bounds, envelope.Miters, path.Join, path.Cap, limit, path.WidthPt / 2));
        }
        var expanded = new[] { t[0] + frame.MinX * t[2], t[1] - frame.MaxY * t[2],
            (frame.MaxX - frame.MinX) * t[2], (frame.MaxY - frame.MinY) * t[2] };
        return new(new(view, expanded, new(t[0], t[1]), paths.Select(p => (object)p).ToArray()), frame,
            new PhysicalBounds(original.MinX * PtToPixels, -original.MaxY * PtToPixels, original.MaxX * PtToPixels, -original.MinY * PtToPixels),
            new PhysicalBounds(frame.MinX * PtToPixels, -frame.MaxY * PtToPixels, frame.MaxX * PtToPixels, -frame.MinY * PtToPixels), paths.ToArray());
    }

    private static (PhysicalBounds Bounds, XY[] Miters) NativeStrokeEnvelope(ReferencePath path, double miterLimit)
    {
        var points = new List<XY>(); var miters = new List<XY>(); var edges = new List<NativeBorderEdge>();
        XY current = new(0, 0), start = current;
        foreach (var segment in path.Segments)
        {
            points.Add(segment.End);
            if (segment.Kind == "Move") { Finish(false); current = start = segment.End; continue; }
            if (segment.Kind == "Cubic")
            {
                // Bernstein polynomial extrema, independently evaluated in
                // native TeX pt; no production curve/bounds code is called.
                Extrema(current.X, segment.Control1.X, segment.Control2.X, segment.End.X, true);
                Extrema(current.Y, segment.Control1.Y, segment.Control2.Y, segment.End.Y, false);
                edges.Add(new(current, segment.End, Tangent(current, segment.Control1, segment.Control2, segment.End),
                    Tangent(segment.End, segment.Control2, segment.Control1, current, true)));
            }
            else if (segment.Kind is "Line" or "Close")
            {
                var end = segment.Kind == "Close" ? start : segment.End;
                var direction = new XY(end.X - current.X, end.Y - current.Y);
                if (direction.X != 0 || direction.Y != 0) edges.Add(new(current, end, direction, direction));
            }
            else throw new InvalidOperationException("Unknown native stroke segment.");
            current = segment.End;
            if (segment.Kind == "Close") Finish(true);

            void Extrema(double p0, double p1, double p2, double p3, bool xAxis)
            {
                var a = p3 - 3 * p2 + 3 * p1 - p0; var b = 2 * (p2 - 2 * p1 + p0); var c = p1 - p0;
                var roots = Math.Abs(a) < 1e-14 ? (Math.Abs(b) < 1e-14 ? Array.Empty<double>() : [-c / b])
                    : b * b < 4 * a * c ? [] : new[] { (-b + Math.Sqrt(b * b - 4 * a * c)) / (2 * a), (-b - Math.Sqrt(b * b - 4 * a * c)) / (2 * a) };
                foreach (var u in roots.Where(u => u > 0 && u < 1))
                {
                    var v = 1 - u;
                    var position = new XY(v * v * v * current.X + 3 * v * v * u * segment.Control1.X + 3 * v * u * u * segment.Control2.X + u * u * u * segment.End.X,
                        v * v * v * current.Y + 3 * v * v * u * segment.Control1.Y + 3 * v * u * u * segment.Control2.Y + u * u * u * segment.End.Y);
                    points.Add(position);
                }
            }
        }
        Finish(false);
        if (points.Count == 0) throw new InvalidOperationException("Empty native path envelope.");
        var radius = path.Stroke ? path.WidthPt / 2 * (path.Cap == "square" ? Math.Sqrt(2) : 1) : 0;
        var envelope = new PhysicalBounds(points.Min(p => p.X) - radius, points.Min(p => p.Y) - radius,
            points.Max(p => p.X) + radius, points.Max(p => p.Y) + radius);
        foreach (var p in miters) envelope = Union(envelope, new(p.X, p.Y, p.X, p.Y));
        return (envelope, miters.ToArray());

        void Finish(bool closed)
        {
            if (path.Stroke && path.Join == "miter")
                for (var i = closed ? 0 : 1; i < edges.Count; i++)
                {
                    var left = edges[(i + edges.Count - 1) % edges.Count]; var right = edges[i];
                    var u = left.Outgoing; var v = right.Incoming;
                    var ul = Math.Sqrt(u.X * u.X + u.Y * u.Y); var vl = Math.Sqrt(v.X * v.X + v.Y * v.Y);
                    if (ul == 0 || vl == 0) continue;
                    var r = path.WidthPt / 2;
                    var n = new XY(-u.Y * r / ul, u.X * r / ul); var m = new XY(-v.Y * r / vl, v.X * r / vl);
                    var cross = u.X * v.Y - u.Y * v.X;
                    if (cross == 0) continue;
                    var amount = ((m.X - n.X) * v.Y - (m.Y - n.Y) * v.X) / cross;
                    var dx = n.X + amount * u.X; var dy = n.Y + amount * u.Y;
                    if (dx * dx + dy * dy > r * r * miterLimit * miterLimit) continue;
                    miters.Add(new(right.Start.X + dx, right.Start.Y + dy));
                    miters.Add(new(right.Start.X - dx, right.Start.Y - dy));
                }
            edges.Clear();
        }
        static XY Tangent(XY origin, XY first, XY second, XY last, bool reverse = false)
        {
            var p = first != origin ? first : second != origin ? second : last;
            return reverse ? new(origin.X - p.X, origin.Y - p.Y) : new(p.X - origin.X, p.Y - origin.Y);
        }
    }

    private static PhysicalBounds Union(PhysicalBounds a, PhysicalBounds b)
        => new(Math.Min(a.MinX, b.MinX), Math.Min(a.MinY, b.MinY), Math.Max(a.MaxX, b.MaxX), Math.Max(a.MaxY, b.MaxY));
    private sealed record NativeBorderEdge(XY Start, XY End, XY Incoming, XY Outgoing);
    private sealed record BorderPathFrame(int PathIndex, PhysicalBounds BoundsPt, XY[] MiterPointsPt, string Join, string Cap, double MiterLimit, double StrokeRadiusPt);
    private sealed record BorderNativeFrame(OracleFrame Camera, PhysicalBounds EnvelopePt, PhysicalBounds OriginalPixels,
        PhysicalBounds ExpandedPixels, BorderPathFrame[] Paths);
}

using System.Globalization;
using System.Text.Json;
using Lokad.TikZ;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Semantics;
using TikzShapeComparison;

namespace TikzEdgeComparison;

internal static class NativeComparison
{
    internal const double BpPerSp = 72 / (72.27 * 65536);
    internal sealed record Check(string Quantity, object Expected, object Actual, string Unit, double? Delta, double Limit, bool Passed, TikzSourceSpan? Source);
    private sealed record NativeSegment(SegmentKind Kind, Point End, Point A = default, Point B = default);

    internal static Check[] Compare(GraphicsScene scene, TikzSuccess success, JsonElement native, NativeGlyphTrace.Evidence? glyphs)
    {
        var checks = new List<Check>(); var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var paths = native.GetProperty("paths").EnumerateArray().ToDictionary(p => p.GetProperty("index").GetInt32());
        var paints = native.GetProperty("driverState").GetProperty("paints").EnumerateArray().ToArray();
        var nodes = native.GetProperty("nodes").EnumerateArray().ToArray();
        var clips = native.GetProperty("physicalOrder").GetProperty("allPathCalls").EnumerateArray().Select(p => paths[p.GetInt32()])
            .Where(p => p.GetProperty("modes").EnumerateArray().Any(m => m.GetString() == "clip")).ToArray();
        Number("pathCount", paints.Length, scene.Paths.Count, "count");
        Number("clipCount", clips.Length, scene.Clips.Count, "count");
        Number("nodeCount", nodes.Length, scene.Nodes.Count, "count");
        Number("glyphCount", glyphs?.Nodes.Sum(n => n.Glyphs.Length) ?? 0, success.Statistics.Glyphs, "count");
        Number("paintOperationCount", paints.Length + nodes.Length, scene.Drawables.Count, "count");
        var orderIndex = 0;
        for (var i = 0; i < Math.Min(paints.Length, scene.Paths.Count); i++)
        {
            var expected = paints[i]; var id = expected.GetProperty("pathId").GetInt32(); var path = scene.Paths[i];
            var prefix = "path." + i;
            Number(prefix + ".drawableOrder", 1, orderIndex < scene.Drawables.Count && ReferenceEquals(scene.Drawables[orderIndex], path) ? 1 : 0, "identity", path.Source);
            orderIndex++;
            if (paths[id].GetProperty("owner").GetString()!.StartsWith("node-", StringComparison.Ordinal))
            {
                var nodeId = Array.FindIndex(nodes, n => "node-" + n.GetProperty("id").GetString() == paths[id].GetProperty("owner").GetString());
                Number(prefix + ".glyphOrder", nodeId, orderIndex < scene.Drawables.Count && scene.Drawables[orderIndex] is PaintedGlyphRun run ? run.NodeId : -1, "identity", path.Source);
                orderIndex++;
            }
            ComparePath(prefix, paths[id], path.Path, path.Source);
            var paint = path.Paint;
            Identity(prefix + ".operation", expected.GetProperty("operation").GetString()!, paint.Fill ? paint.Stroke ? "fillstroke" : "fill" : "stroke", path.Source);
            Number(prefix + ".width", expected.GetProperty("widthSp").GetInt32(), paint.Width / BpPerSp, "sp", path.Source, 1e-4);
            Number(prefix + ".cap", expected.GetProperty("cap").GetInt32(), paint.Cap switch { "butt" => 0, "round" => 1, "square" => 2, _ => -1 }, "identity", path.Source);
            Number(prefix + ".join", expected.GetProperty("join").GetInt32(), paint.Join switch { "miter" => 0, "round" => 1, "bevel" => 2, _ => -1 }, "identity", path.Source);
            Number(prefix + ".miter", expected.GetProperty("miter").GetDouble(), paint.Miter, "coefficient", path.Source);
            Number(prefix + ".strokeOpacity", expected.GetProperty("strokeOpacity").GetDouble(), paint.StrokeOpacity, "coefficient", path.Source);
            Number(prefix + ".fillOpacity", expected.GetProperty("fillOpacity").GetDouble(), paint.FillOpacity, "coefficient", path.Source);
            Color(prefix + ".strokeRgb", expected.GetProperty("strokeRgb"), paint.StrokeColor, path.Source);
            Color(prefix + ".fillRgb", expected.GetProperty("fillRgb"), paint.FillColor, path.Source);
            var dash = expected.GetProperty("dashSp").EnumerateArray().Select(v => v.GetInt32()).ToArray();
            Number(prefix + ".dashCount", dash.Length, paint.Dash.Length, "count", path.Source);
            for (var j = 0; j < Math.Min(dash.Length, paint.Dash.Length); j++) Number(prefix + ".dash." + j, dash[j], paint.Dash[j] / BpPerSp, "sp", path.Source, 1e-4);
            Number(prefix + ".dashPhase", expected.GetProperty("dashPhaseSp").GetInt32(), paint.DashPhase / BpPerSp, "sp", path.Source, 1e-4);
            var wantedClips = expected.GetProperty("clips").EnumerateArray().Select(v => v.GetInt32()).ToArray();
            Number(prefix + ".clipCount", wantedClips.Length, path.Clips.Length, "count", path.Source);
            for (var j = 0; j < Math.Min(wantedClips.Length, path.Clips.Length); j++) Number(prefix + ".clip." + j, wantedClips[j], path.Clips[j], "identity", path.Source);
        }
        for (var i = 0; i < Math.Min(clips.Length, scene.Clips.Count); i++) ComparePath("clip." + i, clips[i], scene.Clips[i].Path, null);
        for (var i = 0; i < Math.Min(nodes.Length, scene.Nodes.Count); i++)
        {
            var n = nodes[i]; var actual = scene.Nodes[i]; var id = n.GetProperty("id").GetString()!; var source = actual.Source;
            Identity(id + ".name", id, actual.Name, source);
            var d = actual.Layout.Dimensions; var font = NodeFontMetrics.Resolve(actual.NodeFont, budget, source);
            var values = new Dictionary<string, int> {
                ["width"] = actual.Layout.Text.WidthSp, ["height"] = actual.Layout.Text.HeightSp, ["depth"] = actual.Layout.Text.DepthSp,
                ["quad"] = font.QuadSp, ["xheight"] = font.XHeightSp,
                ["innerx"] = d.InnerXSp, ["innery"] = d.InnerYSp, ["outerx"] = d.OuterXSp, ["outery"] = d.OuterYSp,
                ["minimumwidth"] = d.MinimumWidthSp, ["minimumheight"] = d.MinimumHeightSp
            };
            foreach (var q in values) Number(id + "." + q.Key, n.GetProperty("values").GetProperty(q.Key).GetInt32(), q.Value, "integer sp", source);
            var background = scene.Paths.SingleOrDefault(p => p.Source == source);
            Number(id + ".linewidth", n.GetProperty("values").GetProperty("linewidth").GetInt32(), background is null ? -1 : background.Paint.Width / BpPerSp, "sp", source, 1e-4);
            foreach (var anchor in n.GetProperty("anchors").EnumerateObject()) PhysicalPoint(id + ".anchor." + anchor.Name, ReadPoint(anchor.Value),
                PgfTransform.Apply(actual.Transform, actual.Layout.Anchor(anchor.Name, new(655360, 282165), budget, source).Bp, budget, source), source);
            var frame = n.GetProperty("frame").EnumerateArray().Select(v => v.GetString()!).ToArray();
            double Coefficient(int j) => double.Parse(frame[j], CultureInfo.InvariantCulture);
            double Dimension(int j) => Math.Round(double.Parse(frame[j][..^2], CultureInfo.InvariantCulture) * 65536, MidpointRounding.AwayFromZero);
            var a = Coefficient(0); var b = Coefficient(1); var c = Coefficient(2); var fd = Coefficient(3); var e = Dimension(4); var f = Dimension(5);
            Number(id + ".frame.a", a, actual.Transform.A, "coefficient", source);
            Number(id + ".frame.b", b, actual.Transform.B, "coefficient", source);
            Number(id + ".frame.c", c, actual.Transform.C, "coefficient", source);
            Number(id + ".frame.d", fd, actual.Transform.D, "coefficient", source);
            PhysicalPoint(id + ".frame.origin", new(e, f), new(actual.Transform.E, actual.Transform.F), source);
            var runs = scene.Drawables.OfType<PaintedGlyphRun>().Where(r => r.NodeId == i).ToArray();
            Number(id + ".glyphRunCount", 1, runs.Length, "count", source);
            var wanted = glyphs?.Nodes[i].Glyphs ?? throw new InvalidDataException("Missing independent node glyph evidence."); var got = actual.Layout.Text.Glyphs;
            Number(id + ".layoutGlyphCount", wanted.Length, got.Length, "count", source);
            if (runs.Length != 1) continue;
            var emitted = runs[0].Glyphs; Number(id + ".emittedGlyphCount", wanted.Length, emitted.Length, "count", source);
            for (var j = 0; j < Math.Min(wanted.Length, Math.Min(got.Length, emitted.Length)); j++)
            {
                var prefix = id + ".glyph." + j; var origin = got[j].Source; var t = emitted[j].Transform;
                Identity(prefix + ".font", wanted[j].Font, got[j].FontId, origin); Number(prefix + ".slot", wanted[j].Slot, got[j].Slot, "slot", origin);
                Number(prefix + ".x", wanted[j].XSp, got[j].XSp, "integer sp", origin); Number(prefix + ".y", wanted[j].YSp, got[j].YSp, "integer sp", origin);
                Number(prefix + ".a", a, t.A, "coefficient", origin); Number(prefix + ".b", b, t.B, "coefficient", origin);
                Number(prefix + ".c", -c, t.C, "coefficient", origin); Number(prefix + ".d", -fd, t.D, "coefficient", origin);
                Number(prefix + ".e", (e + a * wanted[j].XSp - c * wanted[j].YSp) * BpPerSp, t.E, "bp", origin, 1e-9);
                Number(prefix + ".f", (f + b * wanted[j].XSp - fd * wanted[j].YSp) * BpPerSp, t.F, "bp", origin, 1e-9);
                Number(prefix + ".source", 1, origin.Offset >= source.Offset && origin.Offset < source.Offset + source.Length && origin.Length > 0 ? 1 : 0, "source containment", origin);
            }
        }
        foreach (var coordinate in native.GetProperty("coordinates").EnumerateArray())
        {
            var name = coordinate.GetProperty("id").GetString()!;
            Number("coordinate." + name + ".exists", 1, scene.Coordinates.ContainsKey(name) ? 1 : 0, "identity");
            if (scene.Coordinates.TryGetValue(name, out var point)) PhysicalPoint("coordinate." + name, ReadPoint(coordinate.GetProperty("center")), point, null);
        }
        var bounds = native.GetProperty("pictureBounds");
        PhysicalPoint("picture.minimum", new(bounds.GetProperty("minXSp").GetInt32(), bounds.GetProperty("minYSp").GetInt32()), new(scene.PictureBounds.MinX, scene.PictureBounds.MinY), null);
        PhysicalPoint("picture.maximum", new(bounds.GetProperty("maxXSp").GetInt32(), bounds.GetProperty("maxYSp").GetInt32()), new(scene.PictureBounds.MaxX, scene.PictureBounds.MaxY), null);
        return checks.ToArray();

        void Number(string quantity, double expected, double actual, string unit, Source? source = null, double limit = 0)
        {
            var delta = Math.Abs(expected - actual);
            checks.Add(new(quantity, expected, actual, unit, delta, limit, double.IsFinite(delta) && delta <= limit, source?.Location));
        }
        void Identity(string quantity, string expected, string actual, Source source) => checks.Add(new(quantity, expected, actual, "identity", null, 0, expected == actual, source.Location));
        void PhysicalPoint(string quantity, Point expected, Point actual, Source? source)
        { Number(quantity + ".x", expected.X, actual.X / BpPerSp, "sp", source, 1e-4); Number(quantity + ".y", expected.Y, actual.Y / BpPerSp, "sp", source, 1e-4); }
        void Color(string quantity, JsonElement expected, Color actual, Source source)
        {
            if (expected.ValueKind == JsonValueKind.Null) return;
            var values = expected.EnumerateArray().Select(v => v.GetDouble()).ToArray();
            Number(quantity + ".r", values[0], actual.R, "coefficient", source); Number(quantity + ".g", values[1], actual.G, "coefficient", source); Number(quantity + ".b", values[2], actual.B, "coefficient", source);
        }
        void ComparePath(string prefix, JsonElement expected, GraphicPath actual, Source? source)
        {
            var wanted = Normalize(ReadPath(expected)); var got = Normalize(actual.Segments.Select(s => new NativeSegment(s.Kind, s.End, s.A, s.B)).ToArray());
            Number(prefix + ".segmentCount", wanted.Length, got.Length, "count", source);
            for (var j = 0; j < Math.Min(wanted.Length, got.Length); j++)
            {
                Number(prefix + "." + j + ".kind", (int)wanted[j].Kind, (int)got[j].Kind, "identity", source);
                PhysicalPoint(prefix + "." + j + ".end", wanted[j].End, got[j].End, source);
                if (wanted[j].Kind == SegmentKind.Cubic) { PhysicalPoint(prefix + "." + j + ".control1", wanted[j].A, got[j].A, source); PhysicalPoint(prefix + "." + j + ".control2", wanted[j].B, got[j].B, source); }
            }
        }
    }
    private static Point ReadPoint(JsonElement point) => new(point.GetProperty("xSp").GetInt32(), point.GetProperty("ySp").GetInt32());
    // PGF may emit repeated moves and a trailing move after a rectangle.
    // This removes only moves without a following drawing segment.
    private static NativeSegment[] Normalize(NativeSegment[] source) => source.Where((s, i) => s.Kind != SegmentKind.Move || i + 1 < source.Length && source[i + 1].Kind != SegmentKind.Move).ToArray();
    private static NativeSegment[] ReadPath(JsonElement path)
    {
        var result = new List<NativeSegment>(); Point start = default, a = default, b = default, corner = default;
        foreach (var token in path.GetProperty("segments").EnumerateArray())
        {
            var p = ReadPoint(token);
            switch (token.GetProperty("kind").GetString())
            {
                case "move": start = p; result.Add(new(SegmentKind.Move, p)); break;
                case "line": result.Add(new(SegmentKind.Line, p)); break;
                case "control1": a = p; break;
                case "control2": b = p; break;
                case "curve": result.Add(new(SegmentKind.Cubic, p, a, b)); break;
                case "close": result.Add(new(SegmentKind.Close, start)); break;
                case "rectcorner": start = corner = p; result.Add(new(SegmentKind.Move, p)); break;
                case "rectsize": result.Add(new(SegmentKind.Line, new(corner.X + p.X, corner.Y))); result.Add(new(SegmentKind.Line, new(corner.X + p.X, corner.Y + p.Y))); result.Add(new(SegmentKind.Line, new(corner.X, corner.Y + p.Y))); result.Add(new(SegmentKind.Close, corner)); break;
                default: throw new InvalidDataException("Unknown native edge path token.");
            }
        }
        return result.ToArray();
    }
}

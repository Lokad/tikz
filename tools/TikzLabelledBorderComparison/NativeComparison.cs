using System.Text.Json;
using Lokad.TikZ;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Semantics;
using TikzShapeComparison;

namespace TikzLabelledBorderComparison;

internal static class NativeComparison
{
    internal const double BpPerSp = 72 / (72.27 * 65536);
    internal sealed record Check(string Quantity, object Expected, object Actual, string Unit, double? Delta, double Limit, bool Passed, TikzSourceSpan? Source);
    internal sealed record NativeSegment(SegmentKind Kind, Point End, Point A = default, Point B = default);

    internal static Check[] Compare(GraphicsScene scene, TikzSuccess success, JsonElement native, NativeGlyphTrace.Evidence glyphs)
    {
        var checks = new List<Check>();
        var nodes = native.GetProperty("nodes").EnumerateArray().ToArray();
        var paths = native.GetProperty("paths").EnumerateArray().ToArray();
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        Number("nodeCount", nodes.Length, scene.Nodes.Count, "count");
        Number("pathCount", paths.Length, scene.Paths.Count, "count");
        Number("clipCount", 0, scene.Clips.Count, "count");
        Number("glyphCount", glyphs.Nodes.Sum(n => n.Glyphs.Length), success.Statistics.Glyphs, "count");
        var expectedPaintOrder = nodes.SelectMany((_, i) => new[] { "path", "glyph-run" }).Concat(Enumerable.Repeat("path", paths.Length - nodes.Length)).ToArray();
        var actualPaintOrder = scene.Drawables.Select(d => d is PaintedPath ? "path" : "glyph-run").ToArray();
        Number("paintOperationCount", expectedPaintOrder.Length, actualPaintOrder.Length, "count");
        for (var i = 0; i < Math.Min(expectedPaintOrder.Length, actualPaintOrder.Length); i++) Identity("paintOrder." + i, expectedPaintOrder[i], actualPaintOrder[i], scene.Drawables[i].Source);
        for (var i = 0; i < Math.Min(nodes.Length, scene.Nodes.Count); i++)
        {
            var n = nodes[i]; var actual = scene.Nodes[i]; var values = n.GetProperty("values"); var id = n.GetProperty("id").GetString()!;
            Identity(id + ".name", id, actual.Name, actual.Source);
            var font = NodeFontMetrics.Resolve(actual.NodeFont, budget, actual.Source); var d = actual.Layout.Dimensions;
            var quantities = new Dictionary<string, int> {
                ["width"] = actual.Layout.Text.WidthSp, ["height"] = actual.Layout.Text.HeightSp, ["depth"] = actual.Layout.Text.DepthSp,
                ["quad"] = font.QuadSp, ["xheight"] = font.XHeightSp, ["innerx"] = d.InnerXSp, ["innery"] = d.InnerYSp,
                ["outerx"] = d.OuterXSp, ["outery"] = d.OuterYSp, ["minimumwidth"] = d.MinimumWidthSp, ["minimumheight"] = d.MinimumHeightSp
            };
            foreach (var q in quantities) Number(id + "." + q.Key, values.GetProperty(q.Key).GetInt32(), q.Value, "integer sp", actual.Source);
            foreach (var anchor in n.GetProperty("anchors").EnumerateObject())
                PhysicalPoint(id + ".anchor." + anchor.Name, ReadPoint(anchor.Value), PgfTransform.Apply(actual.Transform,
                    actual.Layout.Anchor(anchor.Name, new(655360, 282165), budget, actual.Source).Bp, budget, actual.Source), actual.Source);
            var f = n.GetProperty("frame"); var a = f.GetProperty("a").GetDouble(); var b = f.GetProperty("b").GetDouble();
            var c = f.GetProperty("c").GetDouble(); var e = f.GetProperty("eSp").GetInt32(); var y = f.GetProperty("fSp").GetInt32(); var fd = f.GetProperty("d").GetDouble();
            Number(id + ".frame.a", a, actual.Transform.A, "coefficient", actual.Source);
            Number(id + ".frame.b", b, actual.Transform.B, "coefficient", actual.Source);
            Number(id + ".frame.c", c, actual.Transform.C, "coefficient", actual.Source);
            Number(id + ".frame.d", fd, actual.Transform.D, "coefficient", actual.Source);
            PhysicalPoint(id + ".frame.origin", new(e, y), new(actual.Transform.E, actual.Transform.F), actual.Source);
            var runs = scene.Drawables.OfType<PaintedGlyphRun>().Where(r => r.NodeId == i).ToArray();
            Number(id + ".glyphRunCount", 1, runs.Length, "count", actual.Source);
            var wanted = glyphs.Nodes[i].Glyphs; var got = actual.Layout.Text.Glyphs;
            Number(id + ".layoutGlyphCount", wanted.Length, got.Length, "count", actual.Source);
            if (runs.Length != 1) continue;
            var emitted = runs[0].Glyphs; Number(id + ".emittedGlyphCount", wanted.Length, emitted.Length, "count", actual.Source);
            for (var j = 0; j < Math.Min(wanted.Length, Math.Min(got.Length, emitted.Length)); j++)
            {
                var prefix = id + ".glyph." + j; var source = got[j].Source; var t = emitted[j].Transform;
                Identity(prefix + ".font", wanted[j].Font, got[j].FontId, source); Number(prefix + ".slot", wanted[j].Slot, got[j].Slot, "slot", source);
                Number(prefix + ".x", wanted[j].XSp, got[j].XSp, "integer sp", source); Number(prefix + ".y", wanted[j].YSp, got[j].YSp, "integer sp", source);
                Number(prefix + ".a", a, t.A, "coefficient", source); Number(prefix + ".b", b, t.B, "coefficient", source);
                Number(prefix + ".c", -c, t.C, "coefficient", source); Number(prefix + ".d", -fd, t.D, "coefficient", source);
                Number(prefix + ".e", (e + a * wanted[j].XSp - c * wanted[j].YSp) * BpPerSp, t.E, "bp", source, 1e-9);
                Number(prefix + ".f", (y + b * wanted[j].XSp - fd * wanted[j].YSp) * BpPerSp, t.F, "bp", source, 1e-9);
                var inside = source.Offset >= actual.Source.Offset && source.Offset < actual.Source.Offset + actual.Source.Length && source.Length > 0;
                checks.Add(new(prefix + ".source", true, inside, "source containment", null, 0, inside, source.Location));
            }
        }
        for (var i = 0; i < Math.Min(paths.Length, scene.Paths.Count); i++)
        {
            var path = scene.Paths[i]; var expected = Normalize(ReadPath(paths[i]));
            var actual = Normalize(path.Path.Segments.Select(s => new NativeSegment(s.Kind, s.End, s.A, s.B)).ToArray());
            var prefix = "path." + i;
            Number(prefix + ".segmentCount", expected.Length, actual.Length, "count", path.Source);
            Number(prefix + ".lineWidth", paths[i].GetProperty("lineWidthSp").GetInt32(), path.Paint.Width / BpPerSp, "sp", path.Source, 1e-4);
            for (var j = 0; j < Math.Min(expected.Length, actual.Length); j++)
            {
                Identity(prefix + "." + j + ".kind", expected[j].Kind.ToString(), actual[j].Kind.ToString(), path.Source);
                PhysicalPoint(prefix + "." + j + ".end", expected[j].End, actual[j].End, path.Source);
                if (expected[j].Kind == SegmentKind.Cubic) {
                    PhysicalPoint(prefix + "." + j + ".control1", expected[j].A, actual[j].A, path.Source);
                    PhysicalPoint(prefix + "." + j + ".control2", expected[j].B, actual[j].B, path.Source);
                }
            }
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
        {
            Number(quantity + ".x", expected.X, actual.X / BpPerSp, "sp", source, 1e-4);
            Number(quantity + ".y", expected.Y, actual.Y / BpPerSp, "sp", source, 1e-4);
        }
    }

    private static Point ReadPoint(JsonElement point) => new(point.GetProperty("xSp").GetInt32(), point.GetProperty("ySp").GetInt32());
    private static NativeSegment[] Normalize(NativeSegment[] source) => source.Where((s, i) => s.Kind != SegmentKind.Move || (i + 1 < source.Length && source[i + 1].Kind != SegmentKind.Move)).ToArray();
    private static NativeSegment[] ReadPath(JsonElement path)
    {
        var result = new List<NativeSegment>(); Point start = default, a = default, b = default, corner = default;
        foreach (var token in path.GetProperty("segments").EnumerateArray()) {
            var p = ReadPoint(token.GetProperty("point"));
            switch (token.GetProperty("kind").GetString()) {
                case "move": start = p; result.Add(new(SegmentKind.Move, p)); break;
                case "line": result.Add(new(SegmentKind.Line, p)); break;
                case "control1": a = p; break;
                case "control2": b = p; break;
                case "curve": result.Add(new(SegmentKind.Cubic, p, a, b)); break;
                case "close": result.Add(new(SegmentKind.Close, start)); break;
                case "rectcorner": start = corner = p; result.Add(new(SegmentKind.Move, p)); break;
                case "rectsize": result.Add(new(SegmentKind.Line, new(corner.X + p.X, corner.Y))); result.Add(new(SegmentKind.Line, new(corner.X + p.X, corner.Y + p.Y))); result.Add(new(SegmentKind.Line, new(corner.X, corner.Y + p.Y))); result.Add(new(SegmentKind.Close, corner)); break;
                default: throw new InvalidDataException("Unknown independent native path token.");
            }
        }
        return result.ToArray();
    }
}

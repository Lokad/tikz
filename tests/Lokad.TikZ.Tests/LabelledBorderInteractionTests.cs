using System.Security.Cryptography;
using System.Text.Json;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Semantics;
using TikzShapeComparison;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class LabelledBorderInteractionTests
{
    private const double BpPerSp = 72 / (72.27 * 65536);

    [Fact]
    public void Native_snapshot_is_pinned_outside_its_artifact_manifest()
    {
        Assert.Equal("840f35602947c94b50e7e458eba7e20e1af8d3fa35d2b4907b3ce607536977e5", Hash(Reference("snapshot.json")));
    }

    [Theory]
    [InlineData("lines")]
    [InlineData("paths")]
    [InlineData("transforms")]
    public void Public_labelled_border_paths_match_independent_native_records(string caseId)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(Reference(caseId, "metrics.json")));
        using var provenance = JsonDocument.Parse(File.ReadAllText(Reference(caseId, "provenance.json")));
        var native = document.RootElement;
        Assert.False(native.GetProperty("converterInvoked").GetBoolean());
        Assert.False(native.GetProperty("approvedImagePolicy").GetBoolean());
        foreach (var file in new[] { "metrics.json", "probed-reference.svg", "native-positions.log" })
            Assert.Equal(provenance.RootElement.GetProperty("artifacts").GetProperty(caseId + "/" + file).GetString(), Hash(Reference(caseId, file)));
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Nodes", "labelled-border-" + caseId + ".tikz"));
        GraphicsScene? scene = null;
        var success = Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source,
            TikzOptions.Default with { Libraries = ["shapes.geometric"] }, CancellationToken.None, s => scene = s));
        var nodes = native.GetProperty("nodes").EnumerateArray().ToArray();
        var paths = native.GetProperty("paths").EnumerateArray().ToArray();
        Assert.Equal(4, nodes.Length); Assert.Equal(nodes.Length, scene!.Nodes.Count); Assert.Equal(paths.Length, scene.Paths.Count);
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var ids = nodes.Select(n => n.GetProperty("id").GetString()!).ToArray();
        var tfms = Directory.GetFiles(Reference("fonts"), "*.tfm").ToDictionary(f => Path.GetFileName(f)!, File.ReadAllBytes);
        var glyphEvidence = NativeGlyphTrace.Read(File.ReadAllText(Reference(caseId, "native-positions.log")),
            File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "Nodes", "font-profile.json")), ids,
            File.ReadAllText(Reference(caseId, "probed-reference.svg")), tfms!);
        Assert.Equal(glyphEvidence.Nodes.Sum(n => n.Glyphs.Length), success.Statistics.Glyphs);
        for (var i = 0; i < nodes.Length; i++)
        {
            var expected = nodes[i]; var actual = scene.Nodes[i]; var values = expected.GetProperty("values");
            Assert.Equal(ids[i], actual.Name);
            Assert.Equal(values.GetProperty("width").GetInt32(), actual.Layout.Text.WidthSp);
            Assert.Equal(values.GetProperty("height").GetInt32(), actual.Layout.Text.HeightSp);
            Assert.Equal(values.GetProperty("depth").GetInt32(), actual.Layout.Text.DepthSp);
            foreach (var anchor in expected.GetProperty("anchors").EnumerateObject())
                Physical(anchor.Value, PgfTransform.Apply(actual.Transform, actual.Layout.Anchor(anchor.Name,
                    new(655360, 282165), budget, actual.Source).Bp, budget, actual.Source), ids[i] + "." + anchor.Name);
            var emitted = Assert.Single(scene.Drawables.OfType<PaintedGlyphRun>(), r => r.NodeId == i).Glyphs;
            var glyphs = glyphEvidence.Nodes[i].Glyphs; Assert.Equal(glyphs.Length, actual.Layout.Text.Glyphs.Length); Assert.Equal(glyphs.Length, emitted.Length);
            var frame = expected.GetProperty("frame"); var a = frame.GetProperty("a").GetDouble(); var b = frame.GetProperty("b").GetDouble();
            var c = frame.GetProperty("c").GetDouble(); var d = frame.GetProperty("d").GetDouble(); var e = frame.GetProperty("eSp").GetInt32(); var f = frame.GetProperty("fSp").GetInt32();
            for (var j = 0; j < glyphs.Length; j++)
            {
                var wanted = glyphs[j]; var got = actual.Layout.Text.Glyphs[j]; var t = emitted[j].Transform;
                Assert.Equal(wanted.Font, got.FontId); Assert.Equal(wanted.Slot, got.Slot); Assert.Equal(wanted.XSp, got.XSp); Assert.Equal(wanted.YSp, got.YSp);
                Assert.Equal(a, t.A); Assert.Equal(b, t.B); Assert.Equal(-c, t.C); Assert.Equal(-d, t.D);
                Assert.InRange(Math.Abs(t.E - (e + a * wanted.XSp - c * wanted.YSp) * BpPerSp), 0, 1e-9);
                Assert.InRange(Math.Abs(t.F - (f + b * wanted.XSp - d * wanted.YSp) * BpPerSp), 0, 1e-9);
                Assert.InRange(got.Source.Offset, actual.Source.Offset, actual.Source.Offset + actual.Source.Length - 1);
            }
        }
        for (var i = 0; i < paths.Length; i++)
        {
            var expected = Normalize(ReadPath(paths[i]));
            var actual = Normalize(scene.Paths[i].Path.Segments.Select(s => new NativeSegment(s.Kind,
                new(s.End.X / BpPerSp, s.End.Y / BpPerSp), new(s.A.X / BpPerSp, s.A.Y / BpPerSp), new(s.B.X / BpPerSp, s.B.Y / BpPerSp))).ToArray());
            Assert.Equal(expected.Length, actual.Length);
            for (var j = 0; j < expected.Length; j++)
            {
                Assert.Equal(expected[j].Kind, actual[j].Kind);
                Point(expected[j].End, actual[j].End, caseId + ".path." + i + "." + j);
                if (expected[j].Kind == SegmentKind.Cubic) { Point(expected[j].A, actual[j].A, "cubic control1"); Point(expected[j].B, actual[j].B, "cubic control2"); }
            }
            Assert.InRange(Math.Abs(scene.Paths[i].Paint.Width / BpPerSp - paths[i].GetProperty("lineWidthSp").GetInt32()), 0, 1e-4);
        }
        var bounds = native.GetProperty("pictureBounds");
        Point(new(bounds.GetProperty("minXSp").GetInt32(), bounds.GetProperty("minYSp").GetInt32()), new(scene.PictureBounds.MinX / BpPerSp, scene.PictureBounds.MinY / BpPerSp), "picture minimum");
        Point(new(bounds.GetProperty("maxXSp").GetInt32(), bounds.GetProperty("maxYSp").GetInt32()), new(scene.PictureBounds.MaxX / BpPerSp, scene.PictureBounds.MaxY / BpPerSp), "picture maximum");
    }

    private sealed record NativeSegment(SegmentKind Kind, Point End, Point A = default, Point B = default);
    private static NativeSegment[] ReadPath(JsonElement path)
    {
        var result = new List<NativeSegment>(); Point start = default, control1 = default, control2 = default, corner = default;
        foreach (var token in path.GetProperty("segments").EnumerateArray())
        {
            var q = token.GetProperty("point"); var point = new Point(q.GetProperty("xSp").GetInt32(), q.GetProperty("ySp").GetInt32());
            switch (token.GetProperty("kind").GetString())
            {
                case "move": start = point; result.Add(new(SegmentKind.Move, point)); break;
                case "line": result.Add(new(SegmentKind.Line, point)); break;
                case "control1": control1 = point; break;
                case "control2": control2 = point; break;
                case "curve": result.Add(new(SegmentKind.Cubic, point, control1, control2)); break;
                case "close": result.Add(new(SegmentKind.Close, start)); break;
                case "rectcorner": corner = start = point; result.Add(new(SegmentKind.Move, point)); break;
                case "rectsize": result.Add(new(SegmentKind.Line, new(corner.X + point.X, corner.Y))); result.Add(new(SegmentKind.Line, new(corner.X + point.X, corner.Y + point.Y))); result.Add(new(SegmentKind.Line, new(corner.X, corner.Y + point.Y))); result.Add(new(SegmentKind.Close, corner)); break;
                default: throw new InvalidDataException("Unrecognized independent soft-path token.");
            }
        }
        return result.ToArray();
    }
    private static NativeSegment[] Normalize(NativeSegment[] source) => source.Where((s, i) => s.Kind != SegmentKind.Move || (i + 1 < source.Length && source[i + 1].Kind != SegmentKind.Move)).ToArray();
    private static void Physical(JsonElement wanted, Point actual, string quantity) => Point(new(wanted.GetProperty("xSp").GetInt32(), wanted.GetProperty("ySp").GetInt32()), new(actual.X / BpPerSp, actual.Y / BpPerSp), quantity);
    private static void Point(Point expected, Point actual, string quantity) => Assert.True(Math.Abs(expected.X - actual.X) <= 1e-4 && Math.Abs(expected.Y - actual.Y) <= 1e-4,
        $"{quantity}: expected native sp {expected}, actual sp {actual}");
    private static string Reference(params string[] parts) => Path.Combine([AppContext.BaseDirectory, "Reference", "LabelledBorders", .. parts]);
    private static string Hash(string file) => Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(file)));
}

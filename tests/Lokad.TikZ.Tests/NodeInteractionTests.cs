using System.Text.Json;
using System.Xml.Linq;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Text;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class NodeInteractionTests
{
    [Theory]
    [InlineData("state-paint")]
    [InlineData("transforms")]
    public void Native_interaction_boxes_glyphs_anchors_and_background_paths_match(string id)
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Nodes", id + ".tikz"));
        using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "NodeInteractions", id, "metrics.json")));
        var (result, scene) = Convert(source);
        var native = document.RootElement.GetProperty("nodes").GetProperty("nodes").EnumerateArray().ToArray();
        Assert.Equal(native.Length, scene.Nodes.Count);
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var query = NodeFontMetrics.Resolve(TextFont.Default, budget, new(source, 0, 0));
        for (var index = 0; index < native.Length; index++)
        {
            var expected = native[index]; var actual = scene.Nodes[index]; var values = expected.GetProperty("values");
            Assert.Equal(expected.GetProperty("id").GetString(), actual.Name);
            Assert.Equal(values.GetProperty("width").GetInt32(), actual.Layout.Text.WidthSp);
            Assert.Equal(values.GetProperty("height").GetInt32(), actual.Layout.Text.HeightSp);
            Assert.Equal(values.GetProperty("depth").GetInt32(), actual.Layout.Text.DepthSp);
            var glyphs = expected.GetProperty("glyphs").EnumerateArray().ToArray();
            Assert.Equal(glyphs.Length, actual.Layout.Text.Glyphs.Length);
            for (var glyphIndex = 0; glyphIndex < glyphs.Length; glyphIndex++)
            {
                var glyph = actual.Layout.Text.Glyphs[glyphIndex]; var e = glyphs[glyphIndex];
                Assert.Equal(e.GetProperty("font").GetString(), glyph.FontId);
                Assert.Equal(e.GetProperty("slot").GetInt32(), glyph.Slot);
                Assert.Equal(e.GetProperty("xSp").GetInt32(), glyph.XSp);
                Assert.Equal(e.GetProperty("ySp").GetInt32(), glyph.YSp);
            }
            foreach (var anchor in expected.GetProperty("anchors").EnumerateObject())
            {
                var point = actual.Transform.Apply(actual.Layout.Anchor(anchor.Name, query, budget, actual.Source).Bp);
                Coordinate(anchor.Value.GetProperty("x").GetInt32() / 65536.0, point.X);
                Coordinate(anchor.Value.GetProperty("y").GetInt32() / 65536.0, point.Y);
            }
        }
        var paths = document.RootElement.GetProperty("geometry").GetProperty("paths").EnumerateArray().ToArray();
        Assert.Equal(paths.Length, scene.Paths.Count);
        for (var pathIndex = 0; pathIndex < paths.Length; pathIndex++)
        {
            var segments = paths[pathIndex].GetProperty("segments").EnumerateArray().ToArray();
            // Probe normalization drops moves that never begin painted ink.
            var actual = new List<Segment>();
            foreach (var segment in scene.Paths[pathIndex].Path.Segments)
            {
                if (segment.Kind == SegmentKind.Move && actual.Count > 0 && actual[^1].Kind == SegmentKind.Move) actual.RemoveAt(actual.Count - 1);
                actual.Add(segment);
            }
            if (actual.Count > 0 && actual[^1].Kind == SegmentKind.Move) actual.RemoveAt(actual.Count - 1);
            Assert.Equal(segments.Length, actual.Count);
            for (var index = 0; index < segments.Length; index++)
            {
                Assert.Equal(segments[index].GetProperty("kind").GetString(), actual[index].Kind.ToString());
                Coordinate(segments[index].GetProperty("end").GetProperty("x").GetDouble(), actual[index].End.X);
                Coordinate(segments[index].GetProperty("end").GetProperty("y").GetDouble(), actual[index].End.Y);
            }
        }
        Assert.Equal(scene.Drawables.Sum(d => d is PaintedGlyphRun run ? run.Glyphs.Length : 0), result.Statistics.Glyphs);
        static void Coordinate(double pt, double bp) => Assert.InRange(Math.Abs(pt * (96 / 72.27) - bp * 4 / 3), 0, .02);
    }

    [Fact]
    public void State_paint_order_opacity_and_clips_match_independent_driver_records()
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Nodes", "state-paint.tikz"));
        using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "NodeInteractions", "state-paint", "metrics.json")));
        var (_, scene) = Convert(source);
        var expected = document.RootElement.GetProperty("painting").EnumerateArray().ToArray();
        var position = 0; var pathIndex = 0;
        foreach (var drawable in scene.Drawables)
        {
            if (drawable is PaintedPath path)
            {
                var e = expected[position++];
                Assert.Equal("path", e.GetProperty("kind").GetString());
                Assert.Equal(pathIndex++, e.GetProperty("pathIndex").GetInt32());
                Assert.Equal(e.GetProperty("clips").EnumerateArray().Select(c => c.GetInt32()), path.Clips);
            }
            else if (drawable is PaintedGlyphRun run)
                for (var index = 0; index < run.Glyphs.Length; index++)
                {
                    var e = expected[position++];
                    Assert.Equal("glyph", e.GetProperty("kind").GetString());
                    Assert.Equal(scene.Nodes[run.NodeId].Name, e.GetProperty("node").GetString());
                    Assert.Equal(index, e.GetProperty("glyphIndex").GetInt32());
                    Assert.Equal(e.GetProperty("opacity").GetDouble(), run.Opacity);
                    Assert.Equal(e.GetProperty("clips").EnumerateArray().Select(c => c.GetInt32()), run.Clips);
                }
        }
        Assert.Equal(expected.Length, position);
        // CMYK text color differs between the SVG driver's path and DVI-special
        // routes. The full comparator retains this unresolved color failure.
    }

    [Theory]
    [InlineData("miter", 10, 2.414213562373095)]
    [InlineData("miter", 1, 1.7071067811865475)]
    [InlineData("bevel", 10, 1.7071067811865475)]
    [InlineData("round", 10, 2)]
    public void Diamond_stroke_bounds_include_outer_tips_and_respect_the_miter_limit(string join, double limit, double extent)
    {
        var bounds = PolygonStrokeBounds.Calculate([new(0, 1), new(1, 0), new(0, -1), new(-1, 0)],
            new() { Stroke = true, Width = 2, Join = join, Miter = limit }, new(TikzLimits.Default, CancellationToken.None), new("", 0, 0));
        Assert.Equal(-extent, bounds.MinX, 12); Assert.Equal(extent, bounds.MaxX, 12);
        Assert.Equal(-extent, bounds.MinY, 12); Assert.Equal(extent, bounds.MaxY, 12);
    }

    [Fact]
    public void Public_rotated_node_keeps_miter_ink_in_its_native_canvas()
    {
        const string source = @"\begin{tikzpicture}\node[draw,rotate=45,line width=2pt,inner sep=5pt]{};\end{tikzpicture}";
        var (result, scene) = Convert(source);
        var path = Assert.Single(scene.Paths);
        Assert.True(path.InkBounds.MaxX > path.Path.Bounds.MaxX + path.Paint.Width / 2);
        Assert.Equal(path.InkBounds.Pixels, result.InkBounds);
        var values = XDocument.Parse(result.Svg).Root!.Attribute("viewBox")!.Value.Split(' ').Select(v => double.Parse(v, System.Globalization.CultureInfo.InvariantCulture)).ToArray();
        Assert.InRange(Math.Abs(values[2] - result.InkBounds.Width), 0, .000001);
        Assert.InRange(Math.Abs(values[3] - result.InkBounds.Height), 0, .000001);
    }

    private static (TikzSuccess Result, GraphicsScene Scene) Convert(string source)
    {
        GraphicsScene? scene = null;
        var result = Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source, TikzOptions.Default,
            CancellationToken.None, value => scene = value));
        return (result, scene!);
    }
}

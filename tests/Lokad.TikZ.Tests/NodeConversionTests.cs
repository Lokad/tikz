using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Text;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class NodeConversionTests
{
    [Theory]
    [InlineData(@"\begin{tikzpicture}[draw,fill]\node{A};\path[draw,fill](0,0)--(1,0);\end{tikzpicture}")]
    [InlineData(@"\begin{tikzpicture}\begin{scope}[draw,fill]\node{A};\path[draw,fill](0,0)--(1,0);\end{scope}\end{tikzpicture}")]
    public void Nodes_clear_inherited_path_modes_and_explicit_path_modes_still_apply(string source)
    {
        var (_, scene) = Convert(source);
        var path = Assert.Single(scene.Paths);
        Assert.StartsWith(@"\path", path.Source.Value);
        Assert.True(path.Paint.Stroke);
        Assert.True(path.Paint.Fill);
        Assert.Single(scene.Drawables.OfType<PaintedGlyphRun>());
    }

    [Theory]
    [InlineData("draw", true, false)]
    [InlineData("fill", false, true)]
    [InlineData("draw,fill", true, true)]
    public void Node_styles_reenable_modes_and_retain_the_inherited_pen(string modes, bool stroke, bool fill)
    {
        var source = @"\begin{tikzpicture}[draw=red,fill=blue,line width=2pt,draw opacity=.4,fill opacity=.6,every node/.style={"
            + modes + @"}]\node{A};\end{tikzpicture}";
        var (_, scene) = Convert(source);
        var paint = Assert.Single(scene.Paths).Paint;
        Assert.Equal(stroke, paint.Stroke);
        Assert.Equal(fill, paint.Fill);
        Assert.Equal(new Color(1, 0, 0), paint.StrokeColor);
        Assert.Equal(new Color(0, 0, 1), paint.FillColor);
        Assert.Equal(2 * 72 / 72.27, paint.Width, 10);
        Assert.Equal(.4, paint.StrokeOpacity);
        Assert.Equal(.6, paint.FillOpacity);
    }

    [Fact]
    public void Local_node_modes_apply_after_the_reset_and_every_node_style()
    {
        const string source = @"\begin{tikzpicture}[draw=red,fill=blue,every node/.style={draw}]\node[draw=none,fill]{A};\end{tikzpicture}";
        var (_, scene) = Convert(source);
        var paint = Assert.Single(scene.Paths).Paint;
        Assert.False(paint.Stroke);
        Assert.True(paint.Fill);
        Assert.Equal(new Color(0, 0, 1), paint.FillColor);
    }

    [Fact]
    public void Actual_rectangle_fixture_runs_through_public_conversion_with_native_boxes_and_anchors()
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Nodes", "rectangles.tikz"));
        var (result, scene) = Convert(source);
        using var metrics = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "Nodes", "rectangles", "metrics.json")));
        var native = metrics.RootElement.GetProperty("nodes").EnumerateArray().ToArray();
        Assert.Equal(native.Length, scene.Nodes.Count);
        Assert.Equal(22, result.Statistics.Nodes);
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var queryFont = NodeFontMetrics.Resolve(TextFont.Default, budget, new(source, 0, 0));
        for (var index = 0; index < native.Length; index++)
        {
            var expected = native[index]; var actual = scene.Nodes[index];
            Assert.Equal(expected.GetProperty("id").GetString(), actual.Name);
            Assert.Equal(expected.GetProperty("values").GetProperty("width").GetInt32(), actual.Layout.Text.WidthSp);
            Assert.Equal(expected.GetProperty("values").GetProperty("height").GetInt32(), actual.Layout.Text.HeightSp);
            Assert.Equal(expected.GetProperty("values").GetProperty("depth").GetInt32(), actual.Layout.Text.DepthSp);
            var painted = scene.Paths.Single(p => p.Source == actual.Source);
            var nativeWidthBp = expected.GetProperty("values").GetProperty("linewidth").GetInt32() * (72 / (72.27 * 65536));
            Assert.InRange(Math.Abs(nativeWidthBp - painted.Paint.Width), 0, 1e-12);
            var sw = expected.GetProperty("backgroundSouthWest"); var ne = expected.GetProperty("backgroundNorthEast");
            AssertPoint(sw.GetProperty("x").GetInt32(), sw.GetProperty("y").GetInt32(), painted.Path.Segments[0].End);
            AssertPoint(ne.GetProperty("x").GetInt32(), ne.GetProperty("y").GetInt32(), painted.Path.Segments[2].End);
            var glyphs = expected.GetProperty("glyphs").EnumerateArray().ToArray();
            Assert.Equal(glyphs.Length, actual.Layout.Text.Glyphs.Length);
            for (var glyphIndex = 0; glyphIndex < glyphs.Length; glyphIndex++)
            {
                var glyph = actual.Layout.Text.Glyphs[glyphIndex]; var expectedGlyph = glyphs[glyphIndex];
                Assert.Equal(expectedGlyph.GetProperty("font").GetString(), glyph.FontId);
                Assert.Equal(expectedGlyph.GetProperty("slot").GetInt32(), glyph.Slot);
                Assert.Equal(expectedGlyph.GetProperty("xSp").GetInt32(), glyph.XSp);
                Assert.Equal(expectedGlyph.GetProperty("ySp").GetInt32(), glyph.YSp);
                var emitted = scene.Drawables.OfType<PaintedGlyphRun>().Single(run => run.NodeId == index).Glyphs[glyphIndex];
                var nativeBaseline = expected.GetProperty("anchors").GetProperty("text");
                AssertPoint(nativeBaseline.GetProperty("x").GetInt32() + glyph.XSp,
                    nativeBaseline.GetProperty("y").GetInt32() - glyph.YSp, new(emitted.Transform.E, emitted.Transform.F));
            }
            foreach (var anchor in expected.GetProperty("anchors").EnumerateObject())
            {
                var point = actual.Transform.Apply(actual.Layout.Anchor(anchor.Name, queryFont, budget, actual.Source).Bp);
                Assert.Equal(anchor.Value.GetProperty("x").GetInt32(), Sp(point.X));
                Assert.Equal(anchor.Value.GetProperty("y").GetInt32(), Sp(point.Y));
            }
            Assert.InRange(actual.Source.Offset, 0, source.Length - 1);
            Assert.StartsWith("\\node", actual.Source.Value);
            foreach (var glyph in actual.Layout.Text.Glyphs)
            {
                Assert.InRange(glyph.Source.Offset, actual.Source.Offset, actual.Source.Offset + actual.Source.Length - 1);
                Assert.InRange(glyph.Source.Length, 1, actual.Source.Offset + actual.Source.Length - glyph.Source.Offset);
            }
        }
        var svg = XDocument.Parse(result.Svg);
        var uses = svg.Descendants().Where(e => e.Name.LocalName == "use").ToArray();
        Assert.Equal(result.Statistics.Glyphs, uses.Length);
        Assert.Equal(scene.Outlines.Count, svg.Descendants().Single(e => e.Name.LocalName == "defs").Elements().Count());
        Assert.True(scene.Outlines.Count < uses.Length);
        Assert.All(uses, use => Assert.StartsWith("#candidate-f", use.Attribute("href")!.Value));
        Assert.DoesNotContain(svg.Descendants(), e => e.Name.LocalName == "text");
        Assert.Equal(22, svg.Descendants().Count(e => e.Name.LocalName == "title"));
        static void AssertPoint(int xSp, int ySp, Point point)
        {
            Assert.InRange(Math.Abs(xSp * (72 / (72.27 * 65536)) - point.X), 0, 1e-9);
            Assert.InRange(Math.Abs(ySp * (72 / (72.27 * 65536)) - point.Y), 0, 1e-9);
        }
    }

    [Fact]
    public void Node_outline_output_counts_UTF8_bytes_and_escapes_readable_text()
    {
        const string source = @"\begin{tikzpicture}\node{é <&>};\end{tikzpicture}";
        // Ampersand is a TeX syntax character, so use its declared escape.
        var valid = source.Replace("<&>", @"<\&>", StringComparison.Ordinal);
        var (result, _) = Convert(valid);
        var byteCount = Encoding.UTF8.GetByteCount(result.Svg);
        Assert.Equal(byteCount, result.Statistics.OutputBytes);
        Assert.True(byteCount > result.Svg.Length);
        Assert.Equal("é <&>", XDocument.Parse(result.Svg).Descendants().Single(e => e.Name.LocalName == "title").Value);
        var options = TikzOptions.Default with { IdPrefix = "candidate", Limits = TikzLimits.Default with { MaxOutputBytes = byteCount } };
        Assert.IsType<TikzSuccess>(TikzConverter.Convert(valid, options, CancellationToken.None));
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(valid, options with { Limits = options.Limits with { MaxOutputBytes = byteCount - 1 } }, CancellationToken.None));
        Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
    }

    [Fact]
    public void Node_glyph_and_generated_outline_limits_share_the_conversion_budget()
    {
        const string source = @"\node{ffi ffi};";
        var options = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody };
        var result = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, options, CancellationToken.None));
        Assert.Equal(2, result.Statistics.Glyphs);
        foreach (var limits in new[] { TikzLimits.Default with { MaxNodes = 0 }, TikzLimits.Default with { MaxGlyphs = 1 },
            TikzLimits.Default with { MaxSegments = 5 }, TikzLimits.Default with { MaxWork = 100 } })
        {
            var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, options with { Limits = limits }, CancellationToken.None));
            Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
        }
    }

    [Theory]
    [InlineData(@"\node{$x$};", "TIKZ002")]
    [InlineData(@"\node[text width=2cm]{x};", "TIKZ002")]
    [InlineData(@"\node[diamond]{x};", "TIKZ002")]
    [InlineData(@"\node[outer sep=auto]{x};", "TIKZ002")]
    [InlineData(@"\node[font=\tiny]{x};", "TIKZ002")]
    [InlineData(@"\node[font=\textbf{x}]{x};", "TIKZ002")]
    [InlineData(@"\node{a\\b};", "TIKZ002")]
    [InlineData(@"\node[anchor=unknown]{x};", "TIKZ002")]
    [InlineData(@"\node (n){x};\draw(n.unknown)--(1,0);", "TIKZ002")]
    [InlineData(@"\node (a.b){x};", "TIKZ002")]
    [InlineData(@"\node at(0,0) at(1,0){x};", "TIKZ001")]
    [InlineData(@"\node (n)(m){x};", "TIKZ001")]
    [InlineData(@"\node;", "TIKZ001")]
    public void Unsupported_node_forms_fail_explicitly(string source, string code)
    {
        var options = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody };
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, options, CancellationToken.None));
        Assert.Equal(code, Assert.Single(failure.Diagnostics).Code);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    private static (TikzSuccess Result, GraphicsScene Scene) Convert(string source)
    {
        GraphicsScene? scene = null;
        var result = Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source,
            TikzOptions.Default with { IdPrefix = "candidate" }, CancellationToken.None, value => scene = value));
        return (result, scene!);
    }
    private static int Sp(double bp) => (int)Math.Round(bp * (72.27 * 65536 / 72), MidpointRounding.AwayFromZero);
}

using System.Text.Json;
using System.Text;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Semantics;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class CurvedNodeTests
{
    [Fact]
    public void Shape_libraries_are_ordered_global_within_a_conversion_and_do_not_leak()
    {
        var options = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody };
        const string ellipse = @"\node[ellipse,draw]{x};";
        Assert.IsType<TikzSuccess>(TikzConverter.Convert(ellipse, options with { Libraries = ["shapes.geometric"] }, CancellationToken.None));
        var missing = Assert.IsType<TikzFailure>(TikzConverter.Convert(ellipse, options, CancellationToken.None));
        Assert.Equal("TIKZ002", Assert.Single(missing.Diagnostics).Code);
        Assert.Contains("shapes.geometric", missing.Diagnostics[0].Message);
        Assert.IsType<TikzSuccess>(TikzConverter.Convert(@"\begin{scope}\usetikzlibrary{shapes.geometric}\end{scope}" + ellipse, options, CancellationToken.None));
        Assert.IsType<TikzFailure>(TikzConverter.Convert(ellipse + @"\usetikzlibrary{shapes.geometric}", options, CancellationToken.None));
        Assert.IsType<TikzFailure>(TikzConverter.Convert(@"\usetikzlibrary{shapes.geometric}\node[diamond]{x};", options, CancellationToken.None));
        Assert.IsType<TikzFailure>(TikzConverter.Convert(@"\usetikzlibrary{unknown}", options, CancellationToken.None));
        Assert.IsType<TikzSuccess>(TikzConverter.Convert(@"\node[circle]{x};", options, CancellationToken.None));
    }

    [Theory]
    [InlineData("circle")]
    [InlineData("ellipse")]
    public void Curved_nodes_share_cancellation_node_work_coordinate_segment_and_output_limits(string shape)
    {
        var source = "\\node[" + shape + ",draw]{};";
        var options = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody, Libraries = ["shapes.geometric"] };
        foreach (var limits in new[] { TikzLimits.Default with { MaxNodes = 0 }, TikzLimits.Default with { MaxWork = 1 },
            TikzLimits.Default with { MaxCoordinatePixels = 1 }, TikzLimits.Default with { MaxSegments = 6 }, TikzLimits.Default with { MaxOutputBytes = 1 } })
        {
            var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, options with { Limits = limits }, CancellationToken.None));
            Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
            Assert.Equal(0, failure.Statistics.OutputBytes);
        }
        using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        Assert.Throws<OperationCanceledException>(() => TikzConverter.Convert(source, options, cancelled.Token));
        var overflow = Assert.IsType<TikzFailure>(TikzConverter.Convert("\\node[" + shape + ",minimum width=20000pt]{};", options, CancellationToken.None));
        Assert.Equal("TIKZ004", Assert.Single(overflow.Diagnostics).Code);
        Assert.Equal(0, overflow.Statistics.OutputBytes);
    }

    [Fact]
    public void Degenerate_ellipse_border_queries_fail_at_the_source_coordinate()
    {
        const string source = @"\node[ellipse,inner sep=0pt,outer sep=0pt,minimum width=1sp,minimum height=3sp](n){};\draw(1pt,2pt)--(n);";
        var options = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody, Libraries = ["shapes.geometric"] };
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, options, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ004", diagnostic.Code);
        Assert.Equal("(n)", source.Substring(diagnostic.Span.Offset, diagnostic.Span.Length));
        Assert.Equal(0, failure.Statistics.OutputBytes);
        Assert.IsType<TikzSuccess>(TikzConverter.Convert(source.Replace("--(n)", "--(n.north)", StringComparison.Ordinal), options, CancellationToken.None));
    }

    [Fact]
    public void Public_shape_conversion_matches_native_layout_paths_bounds_and_border_queries()
    {
        using var metrics = JsonDocument.Parse(File.ReadAllText(Reference("native", "metrics.json")));
        using var manifest = JsonDocument.Parse(File.ReadAllText(Reference("cases.json")));
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Nodes", "shapes.tikz"));
        var options = TikzOptions.Default with { Libraries = ["shapes.geometric"] };
        var original = Convert(source);
        var nodes = metrics.RootElement.GetProperty("nodes").EnumerateArray().ToArray();
        Assert.Equal(28, original.Nodes.Count);
        Assert.Equal(28, original.Paths.Count);
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var queries = new StringBuilder();
        var expectedBorders = new List<(string Name, NodePoint Point)>();
        for (var i = 0; i < nodes.Length; i++)
        {
            var native = nodes[i]; var actual = original.Nodes[i];
            var id = native.GetProperty("id").GetString()!;
            Assert.Equal(id, actual.Name);
            var values = native.GetProperty("values");
            Assert.Equal(values.GetProperty("width").GetInt32(), actual.Layout.Text.WidthSp);
            Assert.Equal(values.GetProperty("height").GetInt32(), actual.Layout.Text.HeightSp);
            Assert.Equal(values.GetProperty("depth").GetInt32(), actual.Layout.Text.DepthSp);
            foreach (var anchor in native.GetProperty("anchors").EnumerateObject())
                AssertPoint(Point(anchor.Value), PgfTransform.Apply(actual.Transform, actual.Layout.Anchor(anchor.Name, new(655360, 282165), budget, actual.Source).Bp, budget, actual.Source), id + "." + anchor.Name);
            var tokens = original.Paths[i].Path.Segments.SelectMany(s => s.Kind == SegmentKind.Cubic ? new[] { s.A, s.B, s.End } : new[] { s.End }).ToArray();
            var expected = native.GetProperty("path").EnumerateArray().Select(s => Point(s.GetProperty("point"))).ToArray();
            Assert.Equal(expected.Length, tokens.Length);
            for (var j = 0; j < tokens.Length; j++) AssertPoint(expected[j], tokens[j], id + " public path " + j);
            var center = Point(native.GetProperty("anchors").GetProperty("center"));
            foreach (var direction in manifest.RootElement.GetProperty("directions").EnumerateArray())
            {
                var name = direction.GetProperty("id").GetString()!;
                var vector = Point(direction);
                queries.Append(FormattableString.Invariant($"\\draw({center.X + vector.X}sp,{center.Y + vector.Y}sp)--({id});\n"));
                expectedBorders.Add((id + " " + name, Point(native.GetProperty("borders").GetProperty(name))));
            }
        }
        var bounds = metrics.RootElement.GetProperty("pictureBounds");
        AssertPoint(new(bounds.GetProperty("minXSp").GetInt32(), bounds.GetProperty("minYSp").GetInt32()), new(original.PictureBounds.MinX, original.PictureBounds.MinY), "picture minimum");
        AssertPoint(new(bounds.GetProperty("maxXSp").GetInt32(), bounds.GetProperty("maxYSp").GetInt32()), new(original.PictureBounds.MaxX, original.PictureBounds.MaxY), "picture maximum");
        var extended = Convert(source.Replace("\\end{tikzpicture}", queries + "\\end{tikzpicture}", StringComparison.Ordinal));
        Assert.Equal(448, expectedBorders.Count);
        Assert.Equal(28 + expectedBorders.Count, extended.Paths.Count);
        for (var i = 0; i < expectedBorders.Count; i++)
            AssertPoint(expectedBorders[i].Point, extended.Paths[28 + i].Path.Segments[^1].End, expectedBorders[i].Name);

        GraphicsScene Convert(string input)
        {
            GraphicsScene? scene = null;
            Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(input, options, CancellationToken.None, value => scene = value));
            return scene!;
        }
    }

    [Fact]
    public void Curved_layouts_match_all_native_background_axes_anchors_and_soft_paths()
    {
        using var metrics = JsonDocument.Parse(File.ReadAllText(Reference("native", "metrics.json")));
        var nodes = metrics.RootElement.GetProperty("nodes").EnumerateArray().ToArray();
        Assert.Equal(28, nodes.Length);
        foreach (var native in nodes)
        {
            var sourceText = native.GetProperty("id").GetString()!;
            var source = new Source(sourceText, 0, sourceText.Length);
            var budget = new Budget(TikzLimits.Default, CancellationToken.None);
            var values = native.GetProperty("values");
            int V(string name) => values.GetProperty(name).GetInt32();
            var layout = CurvedNodeLayout.Resolve(Enum.Parse<NodeShape>(native.GetProperty("shape").GetString()!, true),
                new(V("width"), V("height"), V("depth"), "", [], []),
                new(V("innerx"), V("innery"), V("outerx"), V("outery"), V("minimumwidth"), V("minimumheight")), budget, source);
            Assert.Equal(Point(native.GetProperty("background").GetProperty("center")), layout.Center);
            Assert.Equal(Point(native.GetProperty("background").GetProperty("xaxis")).X, layout.BackgroundRadius.X);
            Assert.Equal(Point(native.GetProperty("background").GetProperty("yaxis")).Y, layout.BackgroundRadius.Y);
            var frame = native.GetProperty("frame");
            var transform = new Affine(frame.GetProperty("a").GetDouble(), frame.GetProperty("b").GetDouble(), frame.GetProperty("c").GetDouble(), frame.GetProperty("d").GetDouble(),
                new NodePoint(frame.GetProperty("eSp").GetInt32(), 0).Bp.X, new NodePoint(0, frame.GetProperty("fSp").GetInt32()).Bp.Y);
            foreach (var anchor in native.GetProperty("anchors").EnumerateObject())
            {
                var actual = PgfTransform.Apply(transform, layout.Anchor(anchor.Name, new(655360, 282165), budget, source).Bp, budget, source);
                AssertPoint(Point(anchor.Value), actual, sourceText + "." + anchor.Name);
            }
            var path = layout.Background(transform, budget, source);
            var actualTokens = path.Segments.SelectMany(s => s.Kind == SegmentKind.Cubic ? new[] { s.A, s.B, s.End } : new[] { s.End }).ToArray();
            var expectedTokens = native.GetProperty("path").EnumerateArray().Select(s => Point(s.GetProperty("point"))).ToArray();
            Assert.Equal(expectedTokens.Length, actualTokens.Length);
            for (var i = 0; i < actualTokens.Length; i++) AssertPoint(expectedTokens[i], actualTokens[i], sourceText + " path " + i);
        }
    }

    [Fact]
    public void Normalized_directions_match_independent_native_integer_measurements()
    {
        using var manifest = JsonDocument.Parse(File.ReadAllText(Reference("cases.json")));
        using var metrics = JsonDocument.Parse(File.ReadAllText(Reference("native", "metrics.json")));
        var directions = manifest.RootElement.GetProperty("directions").EnumerateArray().ToArray();
        Assert.Equal(16, directions.Length);
        Assert.Equal(16, metrics.RootElement.GetProperty("normalized").EnumerateObject().Count());
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var source = new Source("native direction", 0, 16);
        foreach (var direction in directions)
        {
            var id = direction.GetProperty("id").GetString()!;
            var actual = PgfDirection.Normalize(Point(direction), budget, source);
            var expected = Point(metrics.RootElement.GetProperty("normalized").GetProperty(id));
            Assert.True(expected == actual, $"{id}: expected {expected}, actual {actual}");
        }
    }

    private static NodePoint Point(JsonElement value) => new(value.GetProperty("xSp").GetInt32(), value.GetProperty("ySp").GetInt32());
    private static void AssertPoint(NodePoint expected, Point actual, string name)
    {
        Assert.True(Math.Abs(expected.Bp.X - actual.X) < 1e-9 && Math.Abs(expected.Bp.Y - actual.Y) < 1e-9,
            $"{name}: expected {expected}, actual sp ({actual.X * (72.27 * 65536 / 72)}, {actual.Y * (72.27 * 65536 / 72)})");
    }
    private static string Reference(params string[] parts) => Path.Combine([AppContext.BaseDirectory, "Reference", "NodeShapes", .. parts]);
}

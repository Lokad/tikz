using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Svg;
using Lokad.TikZ.Text;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class PathLabelTests
{
    [Theory]
    [InlineData("flowchart-basic", 3)]
    [InlineData("network-bent", 3)]
    [InlineData("flowchart-transformed", 2)]
    [InlineData("flowchart-paint", 5)]
    public void Complete_diagrams_parse_their_original_attached_labels(string id, int count)
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures/Diagrams/" + id + ".tikz"));
        var program = new Parser(new(source, 0, source.Length), new Budget(TikzLimits.Default, CancellationToken.None)).Parse(TikzInputKind.Picture);
        var labels = Labels(program).ToArray();
        Assert.Equal(count, labels.Length);
        Assert.All(labels, label => Assert.StartsWith("node", label.Source.Value.TrimStart()));
        static IEnumerable<NodeStatement> Labels(List<Statement> statements)
            => statements.SelectMany(statement => statement switch
            {
                ScopeStatement scope => Labels(scope.Body),
                PathStatement path => path.Operations.SelectMany(operation => operation.Labels),
                _ => []
            });
    }

    [Fact]
    public void Focused_placements_match_independent_native_text_boxes_frames_and_anchors()
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures/PathLabels/placement.tikz"));
        using var reference = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference/PathLabels/placement.json")));
        var root = reference.RootElement;
        Assert.Equal(root.GetProperty("source").GetProperty("sha256").GetString(),
            Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(source.Replace("\r\n", "\n")))));
        GraphicsScene? trace = null;
        var result = Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source, TikzOptions.Default,
            CancellationToken.None, scene => trace = scene));
        var scene = trace!;
        var nodes = root.GetProperty("nodes").EnumerateArray().ToArray();
        Assert.Equal(nodes.Length, scene.Nodes.Count);
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var origin = new Source(source, 0, source.Length);
        var metrics = NodeFontMetrics.Resolve(TextFont.Default, budget, origin);
        foreach (var expected in nodes)
        {
            var name = expected.GetProperty("name").GetString();
            var node = Assert.Single(scene.Nodes, node => node.Name == name);
            Assert.Equal(expected.GetProperty("widthSp").GetInt32(), node.Layout.Text.WidthSp);
            Assert.Equal(expected.GetProperty("heightSp").GetInt32(), node.Layout.Text.HeightSp);
            Assert.Equal(expected.GetProperty("depthSp").GetInt32(), node.Layout.Text.DepthSp);
            var matrix = expected.GetProperty("matrix").EnumerateArray().Select(v => v.GetDouble()).ToArray();
            Assert.Equal(matrix, new[] { node.Transform.A, node.Transform.B, node.Transform.C, node.Transform.D });
            foreach (var anchor in expected.GetProperty("anchors").EnumerateObject())
            {
                var point = PgfTransform.Apply(node.Transform, node.Layout.Anchor(anchor.Name, metrics, budget, node.Source).Bp, budget, node.Source);
                Assert.True(anchor.Value.GetProperty("xSp").GetInt32() == Sp(point.X), $"{name}.{anchor.Name}.x: expected {anchor.Value.GetProperty("xSp")}, got {Sp(point.X)}");
                Assert.True(anchor.Value.GetProperty("ySp").GetInt32() == Sp(point.Y), $"{name}.{anchor.Name}.y: expected {anchor.Value.GetProperty("ySp")}, got {Sp(point.Y)}");
            }
            Assert.All(node.Layout.Text.Glyphs, glyph => Assert.InRange(glyph.Source.Offset, node.Source.Offset, node.Source.Offset + node.Source.Length - 1));
        }
        Assert.Equal(13, result.Statistics.Nodes);
    }

    [Theory]
    [InlineData("-|", "0", 0, 0, 1, 0)]
    [InlineData("-|", ".25", 4, 0, 1, 0)]
    [InlineData("-|", ".5", 8, 0, 0, 1)]
    [InlineData("-|", ".75", 8, 1, 0, 1)]
    [InlineData("-|", "1", 8, 2, 0, 1)]
    [InlineData("|-", "0", 0, 0, 0, 1)]
    [InlineData("|-", ".25", 0, 1, 0, 1)]
    [InlineData("|-", ".5", 0, 2, 1, 0)]
    [InlineData("|-", ".75", 4, 2, 1, 0)]
    [InlineData("|-", "1", 8, 2, 1, 0)]
    public void Orthogonal_labels_split_the_timer_between_unequal_legs_and_use_the_selected_slope(
        string operation, string time, int xPt, int yPt, int a, int b)
    {
        var source = @"\draw[x=1pt,y=1pt](0,0) " + operation + " node[pos=" + time +
            @",sloped,anchor=center](label){} (8,2);";
        GraphicsScene? scene = null;
        Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source, TikzOptions.Default with { InputKind = TikzInputKind.PictureBody },
            CancellationToken.None, value => scene = value));
        var node = Assert.Single(scene!.Nodes);
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var metrics = NodeFontMetrics.Resolve(TextFont.Default, budget, node.Source);
        var center = PgfTransform.Apply(node.Transform, node.Layout.Anchor("center", metrics, budget, node.Source).Bp, budget, node.Source);
        Assert.Equal((xPt * 65536, yPt * 65536), (Sp(center.X), Sp(center.Y)));
        Assert.Equal((a, b, -b, a), (node.Transform.A, node.Transform.B, node.Transform.C, node.Transform.D));
        Assert.StartsWith("node", node.Source.Value.TrimStart());
    }

    [Fact]
    public void Labels_paint_after_the_path_without_drawing_an_inherited_node_border()
    {
        const string source = @"\draw (0,0) -- node[fill=white] (label) {a} node[above] {b} (2,0) -- (3,0);\draw(label.center)--(3,1);";
        GraphicsScene? scene = null;
        Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source, TikzOptions.Default with { InputKind = TikzInputKind.PictureBody },
            CancellationToken.None, value => scene = value));
        Assert.Collection(scene!.Drawables,
            d => Assert.IsType<PaintedPath>(d),
            d => { var p = Assert.IsType<PaintedPath>(d); Assert.True(p.Paint.Fill); Assert.False(p.Paint.Stroke); },
            d => Assert.IsType<PaintedGlyphRun>(d),
            d => Assert.IsType<PaintedGlyphRun>(d),
            d => Assert.IsType<PaintedPath>(d));
    }

    [Theory]
    [InlineData(@"\draw(0,0)--node[pos=1.1]{a}(1,0);", "pos=1.1")]
    [InlineData(@"\draw(0,0)--node[pos=1pt]{a}(1,0);", "1pt")]
    [InlineData(@"\draw(0,0)--node[sloped=maybe]{a}(1,0);", "sloped=maybe")]
    [InlineData(@"\draw(0,0)--node[above=2mm]{a}(1,0);", "above=2mm")]
    [InlineData(@"\draw(0,0)--node at(1,0){a}(1,0);", "(")]
    [InlineData(@"\draw(0,0)--node{a}(1,0) node{b};", "n")]
    [InlineData(@"\clip(0,0)--node{a}(1,0);", "node")]
    [InlineData(@"\draw(0,0)--node{a}(1,0) edge(2,0);", "node")]
    public void Unsupported_or_invalid_label_forms_identify_the_source(string source, string selected)
    {
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, TikzOptions.Default with { InputKind = TikzInputKind.PictureBody }, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Contains(selected, source.Substring(diagnostic.Span.Offset, diagnostic.Span.Length));
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Fact]
    public void Labels_share_the_node_glyph_work_and_output_limits()
    {
        const string source = @"\draw(0,0)--node{ab}(1,0);";
        foreach (var limits in new[] { TikzLimits.Default with { MaxNodes = 0 }, TikzLimits.Default with { MaxGlyphs = 1 },
            TikzLimits.Default with { MaxWork = 100 }, TikzLimits.Default with { MaxOutputBytes = 16 } })
        {
            var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, TikzOptions.Default with { InputKind = TikzInputKind.PictureBody, Limits = limits }, CancellationToken.None));
            Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
            Assert.Equal(0, failure.Statistics.OutputBytes);
        }
    }

    private static int Sp(double bp) => (int)Math.Round(bp * (72.27 * 65536 / 72), MidpointRounding.AwayFromZero);

    [Fact]
    public void Continuation_styles_and_nested_existing_clips_convert_through_the_public_API()
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures/PathLabels/interactions.tikz"));
        GraphicsScene? scene = null;
        var result = Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source, TikzOptions.Default,
            CancellationToken.None, value => scene = value));
        Assert.Equal(8, result.Statistics.Nodes);
        Assert.Equal(2, scene!.Clips.Count);
        Assert.Equal(result.Svg, Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, TikzOptions.Default, CancellationToken.None)).Svg);
        foreach (var (name, clips) in new[] { ("clipped", new[] { 0 }), ("continued", new[] { 0 }), ("nested", new[] { 0, 1 }), ("escaped", Array.Empty<int>()) })
        {
            var id = scene.Nodes.FindIndex(n => n.Name == name);
            var run = Assert.Single(scene.Drawables.OfType<PaintedGlyphRun>(), r => r.NodeId == id);
            Assert.Equal(clips, run.Clips);
        }
        using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        var error = Assert.Throws<OperationCanceledException>(() => TikzConverter.Convert(source, TikzOptions.Default, cancelled.Token));
        Assert.Equal(cancelled.Token, error.CancellationToken);
    }

    [Theory]
    [InlineData("resolve")]
    [InlineData("svg")]
    public void Label_interactions_preserve_the_shared_token_at_each_phase_boundary(string phase)
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures/PathLabels/interactions.tikz"));
        using var cancellation = new CancellationTokenSource();
        var budget = new Budget(TikzLimits.Default, cancellation.Token);
        var program = new Parser(new(source, 0, source.Length), budget).Parse(TikzInputKind.Picture);
        GraphicsScene? scene = phase == "svg" ? new Evaluator(budget).Evaluate(program, TikzOptions.Default) : null;
        cancellation.Cancel();
        var error = Assert.Throws<OperationCanceledException>(() =>
        {
            if (scene is null) new Evaluator(budget).Evaluate(program, TikzOptions.Default);
            else SvgWriter.Write(scene, source, TikzOptions.Default, budget);
        });
        Assert.Equal(cancellation.Token, error.CancellationToken);
    }
}

using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Text;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class PathLabelTests
{
    [Theory]
    [InlineData("flowchart-basic", 3)]
    [InlineData("network-bent", 3)]
    [InlineData("flowchart-transformed", 2)]
    public void Complete_diagrams_parse_their_original_attached_labels(string id, int count)
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures/Diagrams/" + id + ".tikz"));
        var program = new Parser(new(source, 0, source.Length), new Budget(TikzLimits.Default, CancellationToken.None)).Parse(TikzInputKind.Picture);
        var labels = Labels(program).ToArray();
        Assert.Equal(count, labels.Length);
        Assert.All(labels, label => Assert.StartsWith("node", label.Source.Value));
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
}

using System.Globalization;
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

public sealed class PositioningTests
{
    [Theory]
    [InlineData("flowchart-basic", 4)]
    [InlineData("network-bent", 3)]
    [InlineData("flowchart-transformed", 2)]
    public void Complete_diagram_node_placements_match_independent_native_measurements(string id, int count)
        => CompareNative("Diagrams", "Diagrams", id, count);

    [Theory]
    [InlineData("contract", 24)]
    [InlineData("registration", 4)]
    public void Declared_positioning_contract_matches_independent_native_measurements(string id, int count)
        => CompareNative("Positioning", "Focused", id, count);

    private static void CompareNative(string fixtureFolder, string referenceFolder, string id, int count)
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures/" + fixtureFolder + "/" + id + ".tikz"));
        using var reference = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference/Positioning/" + referenceFolder + "/" + id + ".json")));
        var expected = reference.RootElement;
        Assert.Equal(expected.GetProperty("sourceSha256").GetString(),
            Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(source.Replace("\r\n", "\n")))));
        GraphicsScene? trace = null;
        var converted = TikzConverter.ConvertWithTrace(source, TikzOptions.Default,
            CancellationToken.None, scene => trace = scene);
        Assert.True(converted is TikzSuccess, string.Join("; ", converted.Diagnostics.Select(d => d.Code + ": " + d.Message)));
        var result = Assert.IsType<TikzSuccess>(converted);
        var publicResult = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, TikzOptions.Default, CancellationToken.None));
        Assert.Equal(result.Svg, publicResult.Svg);
        Assert.Equal(result.Statistics, publicResult.Statistics);
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var metrics = NodeFontMetrics.Resolve(TextFont.Default, budget, new Source(source, 0, source.Length));
        var nodes = expected.GetProperty("nodes").EnumerateArray().ToArray();
        Assert.Equal(count, nodes.Length);
        Assert.Equal(count * 16, expected.GetProperty("anchors").GetArrayLength());
        foreach (var item in nodes)
        {
            var name = item.GetProperty("name").GetString();
            var node = Assert.Single(trace!.Nodes, node => node.Name == name);
            Assert.Equal(item.GetProperty("widthSp").GetInt32(), node.Layout.Text.WidthSp);
            Assert.Equal(item.GetProperty("heightSp").GetInt32(), node.Layout.Text.HeightSp);
            Assert.Equal(item.GetProperty("depthSp").GetInt32(), node.Layout.Text.DepthSp);
            var linear = item.GetProperty("frame").EnumerateArray().Take(4)
                .Select(value => double.Parse(value.GetString()!, CultureInfo.InvariantCulture)).ToArray();
            Assert.Equal(linear, new[] { node.Transform.A, node.Transform.B, node.Transform.C, node.Transform.D });
        }
        foreach (var item in expected.GetProperty("anchors").EnumerateArray())
        {
            var name = item.GetProperty("name").GetString();
            var anchor = item.GetProperty("anchor").GetString()!;
            var node = Assert.Single(trace!.Nodes, node => node.Name == name);
            var point = PgfTransform.Apply(node.Transform, node.Layout.Anchor(anchor, metrics, budget, node.Source).Bp, budget, node.Source);
            Assert.True(item.GetProperty("xSp").GetInt32() == Sp(point.X), $"{id}: {name}.{anchor}.x expected {item.GetProperty("xSp")}, got {Sp(point.X)}");
            Assert.True(item.GetProperty("ySp").GetInt32() == Sp(point.Y), $"{id}: {name}.{anchor}.y expected {item.GetProperty("ySp")}, got {Sp(point.Y)}");
        }
    }

    private static int Sp(double bp) => checked((int)Math.Round(bp * (72.27 * 65536 / 72), MidpointRounding.AwayFromZero));

    [Theory]
    [InlineData("scoped-unavailable")]
    [InlineData("scoped-reloaded")]
    public void Scoped_positioning_definitions_do_not_leak_or_reappear_on_reload(string id)
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures/Positioning/" + id + ".tikz"));
        var result = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, TikzOptions.Default, CancellationToken.None));
        var diagnostic = Assert.Single(result.Diagnostics);
        Assert.Equal("TIKZ002", diagnostic.Code);
        Assert.Equal(0, result.Statistics.OutputBytes);
    }

    private static readonly TikzOptions Body = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody, Libraries = ["positioning"], IdPrefix = "position" };

    [Theory]
    [InlineData(@"\node(a){A};\node[right=3mm of a](b){B};", @"\node(a){A};\node[anchor=west,xshift=3mm](b)at(a.east){B};")]
    [InlineData(@"\node(a){A};\node[right=3mm of a,scale=2](b){B};", @"\node(a){A};\node[anchor=west,xshift=3mm,scale=2](b)at(a.east){B};")]
    [InlineData("\\node(a){A};\\node[right=3mm of % (comment)\na](b){B};", @"\node(a){A};\node[right=3mm of a](b){B};")]
    [InlineData(@"\coordinate(a)at(1,2);\node[right=3mm of a](b){B};", @"\coordinate(a)at(1,2);\node[anchor=west,xshift=3mm](b)at(a){B};")]
    [InlineData(@"\node(a){A};\node[right=3mm of a.north](b){B};", @"\node(a){A};\node[anchor=west,xshift=3mm](b)at(a.north){B};")]
    [InlineData(@"\node(a){A};\node[anchor=south,right=3mm of a,anchor=center](b){B};", @"\node(a){A};\node[anchor=center,xshift=3mm](b)at(a.east){B};")]
    [InlineData(@"\tikzset{node distance=9mm}\node(a){A};\begin{scope}[node distance=3mm]\node[right=of a](b){B};\end{scope}\node[right=of b](c){C};", @"\node(a){A};\node[right=3mm of a](b){B};\node[right=9mm of b](c){C};")]
    [InlineData(@"\tikzset{node distance=9mm}\node(a){A};\node[right=of a,node distance=3mm](b){B};", @"\node(a){A};\node[right=9mm of a](b){B};")]
    [InlineData(@"\tikzset{x=4pt,y=2pt}\node(a){A};\node[below right=2 and 3 of a](b){B};", @"\tikzset{x=4pt,y=2pt}\node(a){A};\node[below right=4pt and 12pt of a](b){B};")]
    public void Positioning_preserves_explicit_anchor_equivalents_and_scoped_distances(string positioned, string equivalent)
    {
        var a = Assert.IsType<TikzSuccess>(TikzConverter.Convert(positioned, Body, CancellationToken.None));
        var b = Assert.IsType<TikzSuccess>(TikzConverter.Convert(equivalent, Body, CancellationToken.None));
        Assert.Equal(b.Svg, a.Svg);
        Assert.Equal(b.PictureBounds, a.PictureBounds);
        Assert.Equal(b.InkBounds, a.InkBounds);
    }

    [Theory]
    [InlineData("right=1cm", "TIKZ002")]
    [InlineData("right=of (a)", "TIKZ002")]
    [InlineData("right=of a,below=of a", "TIKZ002")]
    [InlineData("on grid", "TIKZ002")]
    [InlineData("base right=of a", "TIKZ002")]
    [InlineData("right=of missing", "TIKZ003")]
    [InlineData("right=of a.unsupported", "TIKZ002")]
    public void Undeclared_forms_and_targets_fail_explicitly(string placement, string code)
    {
        var source = @"\node(a){A};\node[" + placement + "](b){B};";
        var result = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(result.Diagnostics);
        Assert.Equal(code, diagnostic.Code);
        Assert.InRange(diagnostic.Span.Offset, source.IndexOf(placement, StringComparison.Ordinal), source.Length - 1);
        Assert.Equal(0, result.Statistics.OutputBytes);
    }

    [Fact]
    public void Valued_positioning_requires_its_library_and_does_not_reinterpret_path_labels()
    {
        const string source = @"\node(a){A};\node[right=of a](b){B};";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body with { Libraries = [] }, CancellationToken.None));
        Assert.Equal("TIKZ002", Assert.Single(failure.Diagnostics).Code);
        var label = Assert.IsType<TikzFailure>(TikzConverter.Convert(@"\node(a){A};\draw(0,0)--node[right=of a]{B}(1,0);", Body, CancellationToken.None));
        Assert.Equal("TIKZ002", Assert.Single(label.Diagnostics).Code);
    }

    [Fact]
    public void Positioned_diagrams_share_work_limits_and_cancellation()
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures/Diagrams/flowchart-transformed.tikz"));
        var limits = TikzLimits.Default with { MaxWork = 100 };
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, TikzOptions.Default with { Limits = limits }, CancellationToken.None));
        Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
        Assert.Equal(0, failure.Statistics.OutputBytes);
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        Assert.Throws<OperationCanceledException>(() => TikzConverter.Convert(source, TikzOptions.Default, cancellation.Token));
    }

    [Fact]
    public void Explicit_at_and_positioning_are_rejected_until_their_order_is_supported()
    {
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(@"\node(a){A};\node[right=of a]at(2,3){B};", Body, CancellationToken.None));
        Assert.Equal("TIKZ002", Assert.Single(failure.Diagnostics).Code);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }
}

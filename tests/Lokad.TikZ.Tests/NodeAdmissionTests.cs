using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class NodeAdmissionTests
{
    private static readonly TikzOptions Body = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody };

    [Theory]
    [InlineData("", false)]
    [InlineData("circle", false)]
    [InlineData("ellipse", false)]
    [InlineData("", true)]
    [InlineData("circle", true)]
    [InlineData("ellipse", true)]
    public void Exhausted_capacity_rejects_before_ordinary_or_attached_label_layout(string shape, bool attached)
    {
        var label = string.Join(@"\\", Enumerable.Repeat(new string('i', 1000), 20));
        var node = $"node[{shape},align=left]{{{label}}}";
        var source = @"\usetikzlibrary{shapes.geometric}" + (attached ? @"\node{};\draw(0,0)-- " + node + " (1,0);" : "\\" + node + ";");
        var result = Assert.IsType<TikzFailure>(TikzConverter.Convert(source,
            Body with { Limits = Body.Limits with { MaxNodes = attached ? 1 : 0 } }, CancellationToken.None));
        Assert.Equal("The nodes limit was exceeded.", Assert.Single(result.Diagnostics).Message);
        Assert.Equal(attached ? 1 : 0, result.Statistics.Nodes);
        Assert.Equal(0, result.Statistics.Glyphs);
        Assert.Equal(0, result.Statistics.OutputBytes);
    }

    [Fact]
    public void A_later_node_cannot_spend_glyph_capacity_after_the_first_node_exhausts_capacity()
    {
        var result = Assert.IsType<TikzFailure>(TikzConverter.Convert(@"\node{x};\draw(0,0)--node{another label}(1,0);",
            Body with { Limits = Body.Limits with { MaxNodes = 1 } }, CancellationToken.None));
        Assert.Equal("The nodes limit was exceeded.", Assert.Single(result.Diagnostics).Message);
        Assert.Equal(1, result.Statistics.Nodes);
        Assert.Equal(1, result.Statistics.Glyphs);
    }
}

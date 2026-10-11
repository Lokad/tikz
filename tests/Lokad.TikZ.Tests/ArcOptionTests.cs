using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class ArcOptionTests
{
    [Theory]
    [InlineData("radius=4mm,x radius=8mm,y radius=5mm", "8mm", "5mm")]
    [InlineData("x radius=8mm,y radius=5mm,radius=4mm", "4mm", "4mm")]
    [InlineData("x radius=1/0,y radius=0/0,radius=4mm", "4mm", "4mm")]
    [InlineData("radius=2mm,radius=5mm", "5mm", "5mm")]
    [InlineData("radius=2mm,x radius=8mm,radius=4mm,y radius=7mm,x radius=6mm", "6mm", "7mm")]
    [InlineData("radius=.4,x radius=.8,y radius=.6", ".8", ".6")]
    public void Ordered_radii_match_the_final_independently_assigned_axes(string ordered, string x, string y)
    {
        var options = TikzOptions.Default with { IdPrefix = "arc-order" };
        var expected = Assert.IsType<TikzSuccess>(TikzConverter.Convert(Source($"x radius={x},y radius={y}"), options, CancellationToken.None));
        var actual = Assert.IsType<TikzSuccess>(TikzConverter.Convert(Source(ordered), options, CancellationToken.None));
        Assert.Equal(expected.Svg, actual.Svg);
        Assert.Equal(expected.PictureBounds, actual.PictureBounds);
        Assert.Equal(expected.InkBounds, actual.InkBounds);
    }

    [Theory]
    [InlineData("radius=1/0,radius=4mm", "TIKZ004")]
    [InlineData("radius=4mm,y radius=1", "TIKZ001")]
    [InlineData("radius=4mm,unknown=2,x radius=8mm,y radius=5mm", "TIKZ002")]
    public void Ordered_radii_preserve_eager_validation_and_explicit_rejection(string values, string code)
    {
        var source = Source(values);
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, TikzOptions.Default, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal(code, diagnostic.Code);
        Assert.Equal(0, failure.Statistics.OutputBytes);
        if (code == "TIKZ004")
        {
            Assert.Equal(source.IndexOf("1/0", StringComparison.Ordinal) + 1, diagnostic.Span.Offset);
            Assert.Equal(1, diagnostic.Span.Length);
        }
    }

    private static string Source(string values)
        => $@"\begin{{tikzpicture}}[x=10mm,y=6mm]\draw (0,0) arc[start angle=0,end angle=90,{values}];\end{{tikzpicture}}";
}

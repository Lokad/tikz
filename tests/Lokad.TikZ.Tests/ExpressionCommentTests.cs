using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class ExpressionCommentTests
{
    private static readonly TikzOptions Body = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody, IdPrefix = "comments" };

    [Theory]
    [InlineData("\\draw (1% ignored\n,0)--(2,0);", @"\draw (1,0)--(2,0);")]
    [InlineData("\\draw (1cm% ignored\n,0)--(2,0);", @"\draw (1cm,0)--(2,0);")]
    [InlineData("\\draw (1% ignored\n+2,0)--(3,0);", @"\draw (1+2,0)--(3,0);")]
    [InlineData("\\draw (sin% ignored\n(30),0)--(1,0);", @"\draw (sin(30),0)--(1,0);")]
    [InlineData("\\draw (pi% ignored\n,0)--(1,0);", @"\draw (pi,0)--(1,0);")]
    [InlineData("\\draw[line width=1% ignored\npt] (0,0)--(1,0);", @"\draw[line width=1pt] (0,0)--(1,0);")]
    [InlineData("\\draw (1% ignored\n2,0)--(13,0);", @"\draw (12,0)--(13,0);")]
    [InlineData("\\draw (1c% ignored\nm,0)--(2,0);", @"\draw (1cm,0)--(2,0);")]
    [InlineData("\\draw plot[samples at={0,1}] (\\x,{1% ignored\n+\\x});", @"\draw plot[samples at={0,1}] (\x,{1+\x});")]
    [InlineData("\\tikzset{wide/.style={line width=#1}}\\draw[wide={1% ignored\r\npt}](0,0)--(1,0);", @"\tikzset{wide/.style={line width=#1}}\draw[wide=1pt](0,0)--(1,0);")]
    public void Commented_tokens_keep_the_comment_free_geometry_and_svg(string source, string equivalent)
    {
        var actual = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var expected = Assert.IsType<TikzSuccess>(TikzConverter.Convert(equivalent, Body, CancellationToken.None));
        Assert.Equal(expected.Svg, actual.Svg);
        Assert.Equal(expected.PictureBounds, actual.PictureBounds);
        Assert.Equal(expected.InkBounds, actual.InkBounds);
    }

    [Fact]
    public void Later_errors_retain_original_utf16_locations_and_style_provenance()
    {
        const string source = "% \U0001f600\r\n\\tikzset{wide/.style={line width=#1}}\r\n\\draw[wide={1% ignored\r\n+\\missing}](0,0)--(1,0);";
        var result = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var error = Assert.Single(result.Diagnostics);
        Assert.Equal("TIKZ003", error.Code);
        Assert.Equal(new TikzSourceSpan(source.IndexOf("\\missing", StringComparison.Ordinal), 1, 4, 2), error.Span);
        Assert.Contains(error.RelatedLocations, span => span.Line == 2);
        Assert.Equal(0, result.Statistics.OutputBytes);
    }

    [Fact]
    public void Comment_filtering_obeys_shared_work_and_generated_source_limits()
    {
        const string source = "\\draw(1% ignored\n+2,0)--(3,0);";
        var success = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, Body, CancellationToken.None));
        foreach (var limits in new[] { Body.Limits with { MaxExpandedTokens = 0 }, Body.Limits with { MaxWork = success.Statistics.Work - 1 } })
        {
            var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body with { Limits = limits }, CancellationToken.None));
            Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
            Assert.Equal(0, failure.Statistics.OutputBytes);
        }
    }
}

using System.Globalization;
using System.Xml.Linq;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class ConversionTests
{
    [Fact]
    public void CentimetreLineHasPhysicalUnitsAndUnscaledStroke()
    {
        var result = Success(@"\begin{tikzpicture}[scale=2]\draw[line width=2pt] (0,0)--(1,0);\end{tikzpicture}");
        var path = XDocument.Parse(result.Svg).Descendants().Single(e => e.Name.LocalName == "path");
        Assert.Equal("M0 0 L75.590551 0", path.Attribute("d")?.Value);
        Assert.Equal("2.656704", path.Attribute("stroke-width")?.Value);
        Assert.InRange(result.PictureBounds.Width, 78.24, 78.26);
    }
    [Theory]
    [InlineData(@"\input{a}", "TIKZ002")]
    [InlineData(@"\begin{tikzpicture}\draw[unknown] (0,0)--(1,0);\end{tikzpicture}", "TIKZ002")]
    [InlineData(@"\begin{tikzpicture}\draw (0,0)--(1/0,0);\end{tikzpicture}", "TIKZ004")]
    [InlineData(@"\begin{tikzpicture}\draw (0,0)--(1,0)\end{tikzpicture}", "TIKZ002")]
    [InlineData(@"\begin{tikzpicture}\draw (0,0) ellipse[x radius=1cm,y radius=1];\end{tikzpicture}", "TIKZ001")]
    [InlineData(@"\begin{tikzpicture}\draw (0,0) arc[start angle=0,end angle=90,x radius=1,y radius=1cm];\end{tikzpicture}", "TIKZ001")]
    [InlineData(@"\begin{tikzpicture}\draw (0,0) arc[start angle=0,end angle=100000000,radius=1];\end{tikzpicture}", "TIKZ005")]
    [InlineData(@"\begin{tikzpicture}[scale=0]\coordinate (p) at (1,0);\draw (p)--(0,0);\end{tikzpicture}", "TIKZ004")]
    public void UnsupportedOrInvalidInputHasNoSuccessArtifact(string source, string code)
    {
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, TikzOptions.Default, CancellationToken.None));
        Assert.Equal(code, Assert.Single(failure.Diagnostics).Code);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }
    [Fact]
    public void WorkOutputAndSegmentLimitsAreNormalFailures()
    {
        const string source = @"\draw (0,0)--(1,0);";
        foreach (var limits in new[] { TikzLimits.Default with { MaxWork = 1 }, TikzLimits.Default with { MaxOutputBytes = 10 }, TikzLimits.Default with { MaxSegments = 1 } })
        {
            var options = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody, Limits = limits };
            var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, options, CancellationToken.None));
            Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
        }
    }
    [Fact]
    public void CancellationPreservesCallerToken()
    {
        using var source = new CancellationTokenSource(); source.Cancel();
        var error = Assert.Throws<OperationCanceledException>(() => TikzConverter.Convert("", TikzOptions.Default, source.Token));
        Assert.Equal(source.Token, error.CancellationToken);
    }
    [Fact]
    public void GeneratedShapeSegmentsShareTheConversionBudget()
    {
        var options = TikzOptions.Default with
        {
            InputKind = TikzInputKind.PictureBody,
            Limits = TikzLimits.Default with { MaxSegments = 10 }
        };
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(@"\draw (0,0) circle (1) (2,0) circle (1);", options, CancellationToken.None));
        Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }
    [Fact]
    public void LongFlatArithmeticIsBoundedBeforeEvaluation()
    {
        var input = "\\draw (0,0)--(" + string.Join('+', Enumerable.Repeat("1", 10000)) + ",0);";
        var options = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody };
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(input, options, CancellationToken.None));
        Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
    }
    [Fact]
    public void OutputIsInvariantAndConversionStateDoesNotLeak()
    {
        const string source = @"\begin{tikzpicture}\draw (0,0)--(1.5,0);\end{tikzpicture}";
        var original = CultureInfo.CurrentCulture;
        try
        {
            var expected = Success(source).Svg;
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("fr-FR");
            Assert.Equal(expected, Success(source).Svg);
            Parallel.For(0, 20, _ => Assert.Equal(expected, Success(source).Svg));
        }
        finally { CultureInfo.CurrentCulture = original; }
    }
    private static TikzSuccess Success(string source) => Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, TikzOptions.Default, CancellationToken.None));
}

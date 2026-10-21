using System.Text;
using System.Xml.Linq;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class MathMetadataTests
{
    private static readonly TikzOptions Body = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody, IdPrefix = "math" };

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(11)]
    [InlineData(97)]
    [InlineData(0xd800)]
    [InlineData(0xdc00)]
    public void Ignored_comment_code_units_cannot_reach_svg_metadata(int unit)
    {
        var source = "\\node {$a%" + (char)unit + " ignored <& comment\r\n$};";
        var result = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var plain = Assert.IsType<TikzSuccess>(TikzConverter.Convert("\\node {$a$};", Body, CancellationToken.None));
        Assert.Equal(plain.PictureBounds, result.PictureBounds);
        Assert.Equal(plain.InkBounds, result.InkBounds);
        Assert.Equal(plain.Statistics.Glyphs, result.Statistics.Glyphs);
        Assert.Equal("$a\n$", Assert.Single(XDocument.Parse(result.Svg).Descendants(), e => e.Name.LocalName == "title").Value);
        Assert.Equal(Encoding.UTF8.GetByteCount(result.Svg), result.Statistics.OutputBytes);
        var exact = Body with { Limits = Body.Limits with { MaxOutputBytes = result.Statistics.OutputBytes } };
        Assert.Equal(result.Svg, Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, exact, CancellationToken.None)).Svg);
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source,
            exact with { Limits = exact.Limits with { MaxOutputBytes = result.Statistics.OutputBytes - 1 } }, CancellationToken.None));
        Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Fact]
    public void Comment_removal_does_not_rebase_later_math_diagnostics()
    {
        const string source = "\\node {$a%\u0000 ignored\n\\unknown$};";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ002", diagnostic.Code);
        Assert.Equal(new TikzSourceSpan(source.IndexOf("\\unknown", StringComparison.Ordinal), 8, 2, 1), diagnostic.Span);
    }
}

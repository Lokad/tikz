using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class ExpandedLabelLimitTests
{
    [Theory]
    [InlineData(TikzInputKind.PictureBody, false)]
    [InlineData(TikzInputKind.PictureBody, true)]
    [InlineData(TikzInputKind.Picture, false)]
    [InlineData(TikzInputKind.Picture, true)]
    public void Caller_length_is_admitted_once_while_generated_labels_share_other_limits(TikzInputKind kind, bool math)
    {
        var source = @"\def\a{XXXXXXXXXX}\node{" + (math ? "$" : "") + string.Concat(Enumerable.Repeat(@"\a", 10)) + (math ? "$" : "") + "};";
        if (kind == TikzInputKind.Picture) source = @"\begin{tikzpicture}" + source + @"\end{tikzpicture}";
        var options = TikzOptions.Default with { InputKind = kind, IdPrefix = "expanded" };
        var expected = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, options, CancellationToken.None));
        var admitted = options with { Limits = TikzLimits.Default with { MaxSourceCharacters = source.Length } };
        var actual = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, admitted, CancellationToken.None));
        Assert.Equal(100, actual.Statistics.Glyphs);
        Assert.Equal(expected, actual);

        var tooLong = Assert.IsType<TikzFailure>(TikzConverter.Convert(source,
            admitted with { Limits = admitted.Limits with { MaxSourceCharacters = source.Length - 1 } }, CancellationToken.None));
        Assert.Contains("source characters", Assert.Single(tooLong.Diagnostics).Message);
        Assert.Equal(0, tooLong.Diagnostics[0].Span.Offset);
        Assert.Equal(0, tooLong.Diagnostics[0].Span.Length);
        foreach (var (limits, resource) in new[] {
            (admitted.Limits with { MaxExpandedTokens = 99 }, "expanded tokens"),
            (admitted.Limits with { MaxGlyphs = 99 }, "glyphs"),
            (admitted.Limits with { MaxWork = actual.Statistics.Work - 1 }, "work")
        })
        {
            var failed = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, options with { Limits = limits }, CancellationToken.None));
            Assert.Equal("TIKZ005", Assert.Single(failed.Diagnostics).Code);
            Assert.Contains(resource, failed.Diagnostics[0].Message);
            Assert.InRange(failed.Diagnostics[0].Span.Offset, 0, source.Length);
            Assert.InRange(failed.Diagnostics[0].Span.Length, 0, source.Length - failed.Diagnostics[0].Span.Offset);
            Assert.Equal(0, failed.Statistics.OutputBytes);
        }
        using var cancel = new CancellationTokenSource(); cancel.Cancel();
        Assert.Equal(cancel.Token, Assert.Throws<OperationCanceledException>(() => TikzConverter.Convert(source, admitted, cancel.Token)).CancellationToken);
    }
}

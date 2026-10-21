using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class ColorDiagnosticTests
{
    private static readonly TikzOptions Body = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody };

    [Theory]
    [InlineData("red!oops!blue", "TIKZ001")]
    [InlineData("/tikz/red!oops!blue", "TIKZ001")]
    [InlineData("/pgf/red!oops!blue", "TIKZ001")]
    [InlineData("red!25!unknown", "TIKZ002")]
    public void Bare_mixture_errors_keep_original_utf16_key_spans(string key, string code)
    {
        var source = "% \U0001f600\r\n  \\draw[" + key + "] (0,0)--(1,0);";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal(code, diagnostic.Code);
        Assert.Equal(new TikzSourceSpan(source.IndexOf(key, StringComparison.Ordinal), key.Length, 2, 9), diagnostic.Span);
    }

    [Theory]
    [InlineData("\\tikzset{s/.style={red!oops!blue}}\n\\draw[s] (0,0)--(1,0);", "s]")]
    [InlineData("\\def\\bad{red!oops!blue}\n\\draw[\\bad] (0,0)--(1,0);", "\\bad]")]
    public void Expanded_mixture_errors_keep_definition_and_invocation(string body, string invocation)
    {
        var source = "% \U0001f600\r\n" + body;
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ001", diagnostic.Code);
        Assert.Equal(source.IndexOf("red!oops!blue", StringComparison.Ordinal), diagnostic.Span.Offset);
        Assert.Equal("red!oops!blue".Length, diagnostic.Span.Length);
        Assert.Equal(2, diagnostic.Span.Line);
        Assert.Contains(diagnostic.RelatedLocations, span => span.Offset == source.LastIndexOf(invocation, StringComparison.Ordinal));
    }
}

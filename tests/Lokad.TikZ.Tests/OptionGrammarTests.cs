using Lokad.TikZ.Frontend;
using Lokad.TikZ.Semantics;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class OptionGrammarTests
{
    [Theory]
    [InlineData("", "")]
    [InlineData("\t \r\n", "")]
    [InlineData(" very thick ", "very thick")]
    [InlineData("a\u00a0\u2003b\tc\r\nd", "a b c d")]
    [InlineData("very % [,= ignored\r\n thick", "very thick")]
    [InlineData("ab% ignored\ncd", "abcd")]
    [InlineData("% only a comment", "")]
    public void Normalized_keywords_preserve_comment_and_unicode_whitespace_rules(string text, string expected)
        => Assert.Equal(expected, Options.Clean(new(text, 0, text.Length)));

    [Theory]
    [InlineData("name={a=b,[c],(d)},draw", "a=b,[c],(d)")]
    [InlineData("name=a\\,b,draw", "a\\,b")]
    [InlineData("name={a]b)c},draw", "a]b)c")]
    [InlineData("name={a% },= ignored\nb},draw", "a% },= ignored\nb")]
    public void Option_values_preserve_grouped_and_escaped_delimiters(string text, string expected)
    {
        var options = Options.Read(new(text, 0, text.Length), new(TikzLimits.Default, CancellationToken.None));
        Assert.Equal(2, options.Count);
        Assert.Equal("name", options[0].Key);
        Assert.Equal(expected, options[0].Value.Value);
        Assert.Equal("draw", options[1].Key);
        Assert.Equal(0, options[1].Value.Length);
    }

    [Theory]
    [InlineData("name=a=b", 0, 8, "A value containing '=' must be grouped.")]
    [InlineData("name=(a]", 7, 1, "Unbalanced value.")]
    [InlineData("name=(a", 0, 7, "Unbalanced value.")]
    public void Invalid_values_preserve_failure_order_and_source(string text, int offset, int length, string message)
    {
        var error = Assert.Throws<CompileError>(() => Options.Read(new(text, 0, text.Length), new(TikzLimits.Default, CancellationToken.None)));
        Assert.Equal("TIKZ001", error.Diagnostic.Code);
        Assert.Equal(message, error.Diagnostic.Message);
        Assert.Equal(new TikzSourceSpan(offset, length, 1, offset + 1), error.Diagnostic.Span);
    }

    [Theory]
    [InlineData("/tikz/unknown")]
    [InlineData("/pgf/unknown")]
    public void Unsupported_prefixed_keys_retain_the_original_key_in_diagnostics(string key)
    {
        var text = @"\draw[" + key + @"] (0,0)--(1,0);";
        var result = Assert.IsType<TikzFailure>(TikzConverter.Convert(text,
            TikzOptions.Default with { InputKind = TikzInputKind.PictureBody }, CancellationToken.None));
        var error = Assert.Single(result.Diagnostics);
        Assert.Equal("TIKZ002", error.Code);
        Assert.Equal($"Unsupported option '{key}'.", error.Message);
        Assert.Equal(new TikzSourceSpan(6, key.Length, 1, 7), error.Span);
    }
}

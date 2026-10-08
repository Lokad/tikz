using System.Globalization;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class DiagnosticPositionTests
{
    public static IEnumerable<object[]> Cases()
    {
        // Literal positions are counted in the original UTF-16 input, before
        // scanning, comment removal, label parsing or newline normalization.
        (string Name, string Source, int Offset, int Length, int Line, int Column)[] cases =
        [
            ("command-start", "\\unsupported", 0, 12, 1, 1),
            ("crlf-indentation", "\r\n  \\unsupported", 4, 12, 2, 3),
            ("lf-empty-line-tab", "\n\n\t\\unsupported", 3, 12, 3, 2),
            ("supplementary-comment", "% \U0001F600\n  \\unsupported", 7, 12, 2, 3),
            ("crlf-comment-tab", "\r\n%comment\r\n\t\\unsupported", 13, 12, 3, 2),
            ("glyph-supplementary", "  \\node {\U0001F600};", 9, 2, 1, 10),
            ("glyph-unpaired-high", "\r\n\\node {a\uD800};", 10, 1, 2, 9),
            ("glyph-unpaired-low", "\r\n\\node {a\uDC00};", 10, 1, 2, 9),
            ("command-after-node", "\\node {Hello};\n   \\unsupported", 18, 12, 2, 4),
            ("unsupported-label-control", "\\node {a\\unknown};", 8, 8, 1, 9)
        ];
        foreach (var culture in new[] { "en-US", "fr-FR", "tr-TR", "ar-SA" })
        foreach (var item in cases)
            yield return [item.Name, culture, item.Source, item.Offset, item.Length, item.Line, item.Column];
    }

    [Theory]
    [MemberData(nameof(Cases))]
    public void Unsupported_input_preserves_original_utf16_positions(
        string name, string culture, string source, int offset, int length, int line, int column)
    {
        var previousCulture = CultureInfo.CurrentCulture;
        var previousUiCulture = CultureInfo.CurrentUICulture;
        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo(culture);
            CultureInfo.CurrentUICulture = CultureInfo.GetCultureInfo(culture);
            var options = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody };
            var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, options, CancellationToken.None));
            var diagnostic = Assert.Single(failure.Diagnostics);
            Assert.Equal("TIKZ002", diagnostic.Code);
            Assert.False(string.IsNullOrWhiteSpace(diagnostic.Message), $"Missing diagnostic message for {name}.");
            Assert.Equal(new TikzSourceSpan(offset, length, line, column), diagnostic.Span);
            Assert.Equal(0, failure.Statistics.OutputBytes);
        }
        finally
        {
            CultureInfo.CurrentCulture = previousCulture;
            CultureInfo.CurrentUICulture = previousUiCulture;
        }
    }
}

using System.Text;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Svg;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class SvgByteCountingTests
{
    [Fact]
    public void UTF8_count_preserves_split_surrogates_empty_writes_and_all_text_overloads()
    {
        using var writer = Writer(TikzLimits.Default);
        writer.Write('a');
        writer.Write("é");
        writer.Write(new[] { 'x', '€', 'x' }, 1, 1);
        writer.Write('\ud83d');
        writer.Write((string?)null);
        writer.Write(ReadOnlySpan<char>.Empty);
        writer.Write('\ude00');
        var text = writer.ToString();
        Assert.Equal("aé€\U0001f600", text);
        Assert.Equal(10, writer.ByteCount);
        Assert.Equal(Encoding.UTF8.GetByteCount(text), writer.ByteCount);
        Assert.Equal(text, writer.ToString());
    }

    [Theory]
    [InlineData(0xdc00)]
    [InlineData(0xd800)]
    [InlineData(0xd800, 0xd800)]
    [InlineData(0xd800, 0x61)]
    public void Invalid_UTF16_is_rejected_even_across_write_boundaries(params int[] units)
    {
        using var writer = Writer(TikzLimits.Default);
        Assert.Throws<EncoderFallbackException>(() =>
        {
            // Attribute/test transport can replace malformed strings. Preserve
            // the exact code units as integers until inside the test process.
            foreach (var unit in units) writer.Write((char)unit);
            writer.ToString();
        });
    }

    [Fact]
    public void Split_scalar_obeys_the_exact_output_limit()
    {
        using var exact = Writer(TikzLimits.Default with { MaxOutputBytes = 4 });
        exact.Write('\ud83d'); exact.Write('\ude00');
        Assert.Equal("\U0001f600", exact.ToString());
        Assert.Equal(4, exact.ByteCount);
        using var shortWriter = Writer(TikzLimits.Default with { MaxOutputBytes = 3 });
        shortWriter.Write('\ud83d');
        var error = Assert.Throws<CompileError>(() => shortWriter.Write('\ude00'));
        Assert.Equal("TIKZ005", error.Diagnostic.Code);
    }

    private static SvgWriter.LimitedWriter Writer(TikzLimits limits)
        => new(new(limits, CancellationToken.None), new Source("", 0, 0));
}

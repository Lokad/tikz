using System.Globalization;
using System.Text.Json;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Text;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class TextLayoutTests
{
    private static readonly string[] RequiredCases = [
        "words-regular-10", "words-bold-10", "words-italic-10", "words-regular-12", "words-bold-12", "words-italic-12",
        "group-boundaries", "sentence-spacing", "accented-text", "escaped-symbols", "font-declarations", "text-font-commands",
        "lines-left", "lines-center", "lines-right", "large-line-skip"
    ];

    public static IEnumerable<object[]> ReferenceCases => RequiredCases.Select(id => new object[] { id });

    [Theory]
    [MemberData(nameof(ReferenceCases))]
    public void Labels_match_independent_TeX_boxes_and_every_glyph_placement(string id)
    {
        using var manifest = JsonDocument.Parse(File.ReadAllText(Reference("cases.json")));
        var definition = manifest.RootElement.GetProperty("cases").EnumerateArray().Single(c => c.GetProperty("id").GetString() == id);
        Assert.Equal(TextProfile.Id, manifest.RootElement.GetProperty("profile").GetString());
        Assert.Equal(RequiredCases.Order(), manifest.RootElement.GetProperty("cases").EnumerateArray().Select(c => c.GetProperty("id").GetString()).Order());
        var text = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Text", definition.GetProperty("source").GetString() + ".label")).Replace("\r\n", "\n", StringComparison.Ordinal);
        var face = definition.GetProperty("font").GetString()!;
        var initial = new TextFont(face.StartsWith("bold", StringComparison.Ordinal), face.StartsWith("italic", StringComparison.Ordinal), face.EndsWith("12", StringComparison.Ordinal) ? 12 : 10);
        var actual = Measure(text, initial: initial, alignment: Enum.Parse<TextAlignment>(definition.GetProperty("alignment").GetString()!, true));
        using var oracle = JsonDocument.Parse(File.ReadAllText(Reference(id, "metrics.json")));
        var expected = oracle.RootElement;
        Assert.Equal(TextProfile.Id, expected.GetProperty("profile").GetString());
        Assert.Equal(expected.GetProperty("widthSp").GetInt32(), actual.WidthSp);
        Assert.Equal(expected.GetProperty("heightSp").GetInt32(), actual.HeightSp);
        Assert.Equal(expected.GetProperty("depthSp").GetInt32(), actual.DepthSp);
        Assert.Equal(2, expected.GetProperty("schemaVersion").GetInt32());
        var glyphs = expected.GetProperty("nativeGlyphs").EnumerateArray().ToArray();
        Assert.Equal(glyphs.Length, actual.Glyphs.Length);
        for (var index = 0; index < glyphs.Length; index++)
        {
            var glyph = actual.Glyphs[index]; var record = glyphs[index];
            Assert.Equal(record.GetProperty("font").GetString(), glyph.FontId);
            Assert.Equal(record.GetProperty("slot").GetInt32(), glyph.Slot);
            Assert.Equal(record.GetProperty("xSp").GetInt32(), glyph.XSp);
            Assert.Equal(record.GetProperty("ySp").GetInt32(), glyph.YSp);
            Assert.InRange(glyph.Source.Offset, 0, text.Length - 1);
            Assert.InRange(glyph.Source.Length, 1, text.Length - glyph.Source.Offset);
        }
    }

    [Theory]
    [InlineData("😀", "TIKZ002", 0)]
    [InlineData("e\u0301", "TIKZ002", 1)]
    [InlineData("\ud800", "TIKZ002", 0)]
    [InlineData("$$x$$", "TIKZ002", 0)]
    [InlineData(@"\tiny x", "TIKZ002", 0)]
    [InlineData(@"\input{x}", "TIKZ002", 0)]
    [InlineData(@"\textbf{\textit{x}}", "TIKZ002", 8)]
    [InlineData(@"{x\\y}", "TIKZ002", 2)]
    [InlineData(@"x\\[3pt]y", "TIKZ002", 3)]
    [InlineData(@"x\\ *y", "TIKZ002", 4)]
    [InlineData("a\n\nb", "TIKZ002", 2)]
    [InlineData("{x", "TIKZ001", 2)]
    [InlineData("x}", "TIKZ001", 1)]
    [InlineData("x\\", "TIKZ001", 1)]
    public void Unsupported_and_malformed_labels_fail_at_the_source(string text, string code, int offset)
    {
        var error = Assert.Throws<CompileError>(() => Measure(text));
        Assert.Equal(code, error.Diagnostic.Code);
        Assert.Equal(offset, error.Diagnostic.Span.Offset);
    }

    [Fact]
    public void Glyph_work_dimensions_and_nesting_are_bounded()
    {
        Assert.Single(Measure("ffi", TikzLimits.Default with { MaxGlyphs = 1 }).Glyphs);
        foreach (var (text, limits) in new[] {
            ("ffi ffi", TikzLimits.Default with { MaxGlyphs = 1 }),
            ("x", TikzLimits.Default with { MaxWork = 100 }),
            ("{{x}}", TikzLimits.Default with { MaxNesting = 1 }),
            ("Wide", TikzLimits.Default with { MaxCoordinatePixels = 1.0 })
        }) Assert.Equal("TIKZ005", Assert.Throws<CompileError>(() => Measure(text, limits)).Diagnostic.Code);
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        var error = Assert.Throws<OperationCanceledException>(() => Measure("x", cancellation: cancellation.Token));
        Assert.Equal(cancellation.Token, error.CancellationToken);
        var tall = string.Concat(Enumerable.Repeat(@"\\", 1400));
        Assert.Equal("TIKZ005", Assert.Throws<CompileError>(() => Measure(tall)).Diagnostic.Code);
    }

    [Fact]
    public void Font_argument_comments_and_newline_forms_preserve_layout()
    {
        var expected = Measure(@"\textbf{office} x");
        var actual = Measure("\\textbf% argument comment\r\n  {office} x");
        Assert.Equal(expected.WidthSp, actual.WidthSp);
        Assert.Equal(expected.Glyphs.Select(g => (g.FontId, g.Slot, g.XSp, g.YSp)), actual.Glyphs.Select(g => (g.FontId, g.Slot, g.XSp, g.YSp)));
        Assert.Equal("office x", actual.Readable);
        Assert.Throws<CompileError>(() => Measure("\\textbf\n\n{x}"));
    }

    [Fact]
    public void Concurrent_layout_has_no_state_leaks_or_culture_dependent_resources()
    {
        const string text = @"AV {\itshape office} end";
        var expected = Measure(text);
        Parallel.For(0, 24, index => {
            var previous = CultureInfo.CurrentCulture;
            try
            {
                CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo(index % 2 == 0 ? "fr-FR" : "ar-SA");
                var actual = Measure(text);
                Assert.Equal(expected.WidthSp, actual.WidthSp);
                Assert.Equal(expected.Glyphs, actual.Glyphs);
            }
            finally { CultureInfo.CurrentCulture = previous; }
        });
    }

    private static MeasuredText Measure(string text, TikzLimits? limits = null, TextFont? initial = null,
        TextAlignment alignment = TextAlignment.Left, CancellationToken cancellation = default)
    {
        var source = new Source(text, 0, text.Length);
        var budget = new Budget(limits ?? TikzLimits.Default, cancellation);
        return TextLayout.Layout(new LabelParser(source, budget).Parse(), source, initial ?? TextFont.Default, alignment, budget);
    }

    private static string Reference(params string[] paths) => Path.Combine([AppContext.BaseDirectory, "Reference", "Text", .. paths]);
}

using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class NumericExpansionContextTests
{
    private static readonly TikzOptions Body = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody, IdPrefix = "numeric-context" };
    private static readonly string[] Declarations = ["", @"\def\unused{}", @"\def\unused{}\pgfmathsetmacro\unused{1}", @"{\def\unused{}}"];
    private static readonly string[] DirectUses = [@"\node{\number};", @"\node(stage\number){X};", @"\foreach\i in{\number}{\node{\i};}"];

    [Theory]
    [InlineData(TikzInputKind.PictureBody)]
    [InlineData(TikzInputKind.Picture)]
    public void Direct_text_name_and_list_uses_reject_independently_of_unused_or_restored_definitions(TikzInputKind kind)
    {
        var options = Body with { InputKind = kind };
        foreach (var declaration in Declarations)
        foreach (var use in DirectUses)
        {
            var body = declaration + @"\pgfmathsetmacro\number{2}" + use;
            var source = "% 😀\r\n" + (kind == TikzInputKind.Picture ? @"\begin{tikzpicture}" + body + @"\end{tikzpicture}" : body);
            var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, options, CancellationToken.None));
            var diagnostic = Assert.Single(failure.Diagnostics);
            Assert.Equal("TIKZ002", diagnostic.Code);
            Assert.Contains(@"\number", source.Substring(diagnostic.Span.Offset, diagnostic.Span.Length));
            Assert.Equal(2, diagnostic.Span.Line);
            Assert.Equal(0, failure.Statistics.OutputBytes);
        }
    }

    [Fact]
    public void Nested_foreach_does_not_enable_direct_numeric_text_name_or_list_expansion()
    {
        foreach (var declaration in Declarations)
        foreach (var use in DirectUses)
        {
            var source = declaration + @"\pgfmathsetmacro\number{2}\foreach\outer in{1}{\foreach\inner in{1}{" + use + "}}";
            var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
            Assert.Equal("TIKZ002", Assert.Single(failure.Diagnostics).Code);
            Assert.Equal(0, failure.Statistics.OutputBytes);
        }
    }

    [Theory]
    [InlineData(@"\draw(\number^2,0)--(0,0);", @"\draw(4,0)--(0,0);")]
    [InlineData(@"\draw[xscale=\number^2](0,0)--(1,0);", @"\draw[xscale=4](0,0)--(1,0);")]
    public void Unrelated_definitions_preserve_variable_arithmetic_in_numeric_contexts(string use, string expected)
    {
        foreach (var declaration in Declarations)
            Equivalent(declaration + @"\pgfmathsetmacro\number{-2}" + use, expected);
    }

    [Theory]
    [InlineData(@"\def\caption{\number}\node{\caption};", @"\node{2};")]
    [InlineData(@"\def\items{\number,3}\foreach\i in{\items}{\node at(\i,0){\i};}", @"\node at(2,0){2};\node at(3,0){3};")]
    [InlineData(@"\def\place{\node(stage\number){\number};}\place", @"\node(stage2){2};")]
    [InlineData(@"\def\place{\foreach\i in{1}{\begin{scope}\node(stage\number){\number};\end{scope}}}\place", @"\node(stage2){2};")]
    [InlineData(@"\def\place{\pgfmathsetmacro\place{2}\tikzset{2/.style={draw}}\node[\place](n\place){\place};}\place", @"\node[draw](n2){2};")]
    public void Invoked_token_aliases_and_statement_bodies_keep_intentional_numeric_substitution(string use, string expected)
        => Equivalent(@"\pgfmathsetmacro\number{2}" + use, expected);

    [Fact]
    public void Numeric_template_context_ends_when_the_statement_call_returns()
    {
        const string source = @"\pgfmathsetmacro\number{2}\def\place{\node{\number};}\place\node{\number};";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ002", diagnostic.Code);
        Assert.Equal(source.LastIndexOf(@"\number", StringComparison.Ordinal), diagnostic.Span.Offset);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Fact]
    public void Expanded_numeric_glyphs_retain_original_provenance_and_shared_glyph_admission()
    {
        const string source = "% 😀\r\n\\pgfmathsetmacro\\number{2}\r\n\\def\\place{\\node{\\number};}\\place";
        var options = Body with { Limits = Body.Limits with { MaxGlyphs = 0 } };
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, options, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ005", diagnostic.Code);
        Assert.Equal(source.IndexOf("2}", StringComparison.Ordinal), diagnostic.Span.Offset);
        Assert.Equal(2, diagnostic.Span.Line);
        Assert.Contains(diagnostic.RelatedLocations, s => s.Offset == source.LastIndexOf(@"\place", StringComparison.Ordinal));
        Assert.Equal(0, failure.Statistics.Glyphs);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    private static void Equivalent(string source, string expected)
    {
        var actual = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var control = Assert.IsType<TikzSuccess>(TikzConverter.Convert(expected, Body, CancellationToken.None));
        Assert.Equal(control.Svg, actual.Svg);
        Assert.Equal(control.PictureBounds, actual.PictureBounds);
        Assert.Equal(control.InkBounds, actual.InkBounds);
        Assert.Equal(control.Statistics.Nodes, actual.Statistics.Nodes);
        Assert.Equal(control.Statistics.Glyphs, actual.Statistics.Glyphs);
        Assert.Equal(control.Statistics.Segments, actual.Statistics.Segments);
    }
}

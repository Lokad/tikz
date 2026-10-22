using Lokad.TikZ.Frontend;
using Lokad.TikZ.Semantics;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class OptionTriviaTests
{
    private static TikzOptions Options(TikzInputKind kind) => TikzOptions.Default with
    { InputKind = kind, IdPrefix = "trivia", Libraries = ["arrows.meta", "calc"] };

    private static string Input(string body, TikzInputKind kind)
        => kind == TikzInputKind.PictureBody ? body : @"\begin{tikzpicture}" + body + @"\end{tikzpicture}";

    [Theory]
    [InlineData(TikzInputKind.PictureBody, "x", "(1cm,2pt)")]
    [InlineData(TikzInputKind.PictureBody, "y", "(2pt,1cm)")]
    [InlineData(TikzInputKind.Picture, "x", "(1cm,2pt)")]
    [InlineData(TikzInputKind.Picture, "y", "(2pt,1cm)")]
    public void Basis_vectors_ignore_leading_trivia_in_direct_styles_and_expanded_values(TikzInputKind kind, string axis, string vector)
    {
        var expected = Convert($@"\draw[{axis}={{{vector}}}] (0,0)--(1,1);", kind);
        foreach (var trivia in new[] { " ", "\t", "\n", "\r\n", "% [ ignored ] 😀\r\n " })
        foreach (var declaration in new[] { "", @"\def\unused{}" })
        {
            var value = trivia + vector + " \t";
            foreach (var body in new[] {
                $@"\draw[{axis}={{{value}}}] (0,0)--(1,1);",
                $@"\tikzset{{basis/.style={{{axis}={{{value}}}}}}}\draw[basis] (0,0)--(1,1);",
                $@"\tikzset{{basis/.style={{{axis}=#1}}}}\draw[basis={{{value}}}] (0,0)--(1,1);",
                $@"\def\vector{{{value}}}\draw[{axis}=\vector] (0,0)--(1,1);"
            }) Same(expected, Convert(declaration + body, kind));
        }
    }

    [Theory]
    [InlineData(TikzInputKind.PictureBody)]
    [InlineData(TikzInputKind.Picture)]
    public void Basis_options_preserve_order_units_and_named_or_calc_vectors(TikzInputKind kind)
    {
        Same(Convert(@"\draw[x=2cm,y=3cm,x={(1cm,2pt)},y={(2pt,1cm)}] (0,0)--(1,1);", kind),
            Convert("\\draw[x=2cm,y=3cm,x={% vector\n (1cm,2pt)},y={ \t(2pt,1cm)}] (0,0)--(1,1);", kind));
        Same(Convert(@"\draw[x={(1cm,2pt)},x=2cm] (0,0)--(1,1);", kind),
            Convert("\\draw[x={% vector\n (1cm,2pt)},x={% scalar\n 2cm}] (0,0)--(1,1);", kind));
        foreach (var vector in new[] { "v", "$(v)+(1pt,0)$" })
            Same(Convert($@"\coordinate(v) at(1cm,2pt);\draw[x=({vector})] (0,0)--(1,1);", kind),
                Convert($"\\coordinate(v) at(1cm,2pt);\\draw[x={{% vector\n ({vector})}}] (0,0)--(1,1);", kind));
    }

    [Theory]
    [InlineData(TikzInputKind.PictureBody)]
    [InlineData(TikzInputKind.Picture)]
    public void Arrow_comments_do_not_create_tips_or_dimension_brackets(TikzInputKind kind)
    {
        foreach (var (actual, expected) in new[] {
            ("arrows={% start [\n -To}", "arrows={-To}"),
            ("arrows={To-% end [\n}", "arrows={To-}"),
            ("arrows={% start [\n -% end ]\n}", "arrows={-}"),
            ("arrows={-To% [ ignored\n}", "arrows={-To}"),
            ("arrows={-To% [ ignored\n[length=3pt]}", "arrows={-To[length=3pt]}"),
            ("arrows={-% [ ignored\n{Stealth[length=4pt,width=3pt]}}", "arrows={-{Stealth[length=4pt,width=3pt]}}"),
            ("{Latex% [ ignored\n}-{Stealth% ] ignored\n[length=4pt]}", "{Latex}-{Stealth[length=4pt]}"),
            (">={% [ ignored\n Latex},->", ">=Latex,->"),
            ("arrows={-% [ ignored\n<}", "arrows={-<}")
        })
        {
            Same(Convert($@"\draw[{expected}] (0,0)--(1,0);", kind), Convert($@"\draw[{actual}] (0,0)--(1,0);", kind));
            Same(Convert($@"\draw[{expected}] (0,0)--(1,0);", kind),
                Convert($@"\tikzset{{tip/.style={{{actual}}}}}\draw[tip] (0,0)--(1,0);", kind));
        }
        Same(Convert(@"\draw[arrows={-To}] (0,0)--(1,0);", kind),
            Convert("\\def\\tip{-% [ ignored\nTo}\\draw[arrows=\\tip] (0,0)--(1,0);", kind));
    }

    [Theory]
    [InlineData("x={% [ ignored\n(1pt,\\missing)}", "TIKZ003", "\\")]
    [InlineData("y={% ignored\n(1pt,2pt,3pt)}", "TIKZ001", "1pt,2pt,3pt")]
    [InlineData("arrows={-To% [ ignored\n[length=0pt]}", "TIKZ001", "0pt")]
    [InlineData("arrows={-% [ ignored\nTriangle}", "TIKZ002", "Triangle")]
    [InlineData("arrows={-Stealth% [ ignored\n[round]}", "TIKZ002", "round")]
    [InlineData("arrows={-Stealth% [ ignored\n[length=3pt}", "TIKZ001", "[")]
    public void Invalid_values_keep_original_source_diagnostics(string option, string code, string text)
    {
        var source = "% 😀\r\n\\draw[" + option + "] (0,0)--(1,0);";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Options(TikzInputKind.PictureBody), CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal(code, diagnostic.Code);
        Assert.Contains(text, source.Substring(diagnostic.Span.Offset, diagnostic.Span.Length), StringComparison.Ordinal);
        Assert.Equal(1 + source[..diagnostic.Span.Offset].Count(c => c == '\n'), diagnostic.Span.Line);
        Assert.Equal(diagnostic.Span.Offset - source.LastIndexOf('\n', diagnostic.Span.Offset - 1), diagnostic.Span.Column);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Fact]
    public void Expanded_invalid_values_retain_invocation_and_definition_provenance()
    {
        foreach (var (body, text, invocation) in new[] {
            ("\\def\\vector{% ignored\n(1pt,\\missing)}\\draw[x=\\vector](0,0)--(1,1);", @"\missing", @"\vector]"),
            ("\\def\\tip{-To% [ ignored\n[length=0pt]}\\draw[arrows=\\tip](0,0)--(1,0);", "0pt", @"\tip]")
        })
        {
            var source = "% 😀\r\n" + body;
            var failed = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Options(TikzInputKind.PictureBody), CancellationToken.None));
            var error = Assert.Single(failed.Diagnostics);
            Assert.Equal(source.IndexOf(text, StringComparison.Ordinal), error.Span.Offset);
            Assert.Contains(error.RelatedLocations, span => span.Offset == source.IndexOf(invocation, StringComparison.Ordinal));
        }
    }

    [Fact]
    public void Commented_modern_tips_still_require_their_library()
    {
        const string source = "\\draw[arrows={-% [ ignored\nStealth}](0,0)--(1,0);";
        var failed = Assert.IsType<TikzFailure>(TikzConverter.Convert(source,
            Options(TikzInputKind.PictureBody) with { Libraries = [] }, CancellationToken.None));
        Assert.Equal("TIKZ002", Assert.Single(failed.Diagnostics).Code);
        Assert.Contains("requires arrows.meta", failed.Diagnostics[0].Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("x", "(1pt,2pt)")]
    [InlineData("arrows", "-To")]
    public void Trivia_uses_the_shared_work_budget_and_cancellation(string key, string value)
    {
        var source = new Source("%" + new string('[', 1000) + "\n" + value, 0, 1002 + value.Length);
        var option = new Option(key, source, source);
        var state = new EvaluationState();
        var budget = new Budget(TikzLimits.Default with { MaxWork = 10 }, CancellationToken.None);
        var error = Assert.Throws<CompileError>(() => KeyRegistry.Apply([option], state, budget));
        Assert.Equal("TIKZ005", error.Diagnostic.Code);
        using var cancel = new CancellationTokenSource(); cancel.Cancel();
        Assert.Throws<OperationCanceledException>(() => KeyRegistry.Apply([option], state,
            new(TikzLimits.Default, cancel.Token)));
    }

    [Theory]
    [InlineData("arrows={-To% [ ignored\n}")]
    [InlineData("x={% [ ignored\n(1pt,2pt)}")]
    public void Public_limits_still_admit_or_reject_one_shared_conversion(string option)
    {
        var source = $@"\draw[{option}] (0,0)--(1,0);";
        var options = Options(TikzInputKind.PictureBody);
        var successful = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, options, CancellationToken.None));
        var limited = Assert.IsType<TikzFailure>(TikzConverter.Convert(source,
            options with { Limits = options.Limits with { MaxWork = successful.Statistics.Work - 1 } }, CancellationToken.None));
        Assert.Equal("TIKZ005", Assert.Single(limited.Diagnostics).Code);
        Assert.Equal(0, limited.Statistics.OutputBytes);
    }

    private static TikzSuccess Convert(string body, TikzInputKind kind)
        => Assert.IsType<TikzSuccess>(TikzConverter.Convert(Input(body, kind), Options(kind), CancellationToken.None));

    private static void Same(TikzSuccess expected, TikzSuccess actual)
    {
        Assert.Equal(expected.Svg, actual.Svg);
        Assert.Equal(expected.PictureBounds, actual.PictureBounds);
        Assert.Equal(expected.InkBounds, actual.InkBounds);
    }
}

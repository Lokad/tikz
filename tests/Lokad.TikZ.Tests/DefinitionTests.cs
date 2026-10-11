using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class DefinitionTests
{
    private static readonly TikzOptions Body = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody, IdPrefix = "definition-test" };
    private static TikzSuccess Success(string source, TikzOptions? options = null)
        => Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, options ?? Body, CancellationToken.None));
    private static void Equivalent(string template, string expanded)
    {
        var actual = Success(template);
        var expected = Success(expanded);
        Assert.Equal(expected.Svg, actual.Svg);
        Assert.Equal(expected.PictureBounds, actual.PictureBounds);
        Assert.Equal(expected.InkBounds, actual.InkBounds);
        Assert.Equal(expected.Statistics.Nodes, actual.Statistics.Nodes);
        Assert.Equal(expected.Statistics.Glyphs, actual.Statistics.Glyphs);
        Assert.Equal(expected.Statistics.Segments, actual.Statistics.Segments);
    }

    [Fact]
    public void Token_templates_cover_coordinates_labels_option_values_and_statement_calls()
        => Equivalent(@"\def\point{(1cm,0)}\def\tone{blue}\def\captiontext{Box}
            \def\place{\node[draw=\tone] (box) at \point {\captiontext};}\place
            \draw (0,0)--\point;",
            @"\node[draw=blue] (box) at (1cm,0) {Box};\draw (0,0)--(1cm,0);");

    [Fact]
    public void Aliases_are_lazy_scoped_and_styles_resolve_the_current_definition()
        => Equivalent(@"\def\widthalias{\basewidth}\def\basewidth{8mm}\def\tone{red}
            \tikzset{box/.style={draw=\tone,minimum width=\widthalias}}
            \node[box] (first) {A};\def\basewidth{12mm}\def\tone{blue}
            {\def\tone{green}\node[box] (local) at (1cm,0) {B};}
            \node[box] (last) at (2cm,0) {C};",
            @"\node[draw=red,minimum width=8mm] (first) {A};
            {\node[draw=green,minimum width=12mm] (local) at (1cm,0) {B};}
            \node[draw=blue,minimum width=12mm] (last) at (2cm,0) {C};");

    [Fact]
    public void Statement_templates_observe_definitions_in_order_without_adding_a_group()
        => Equivalent(@"\def\captiontext{Old}\def\place{
            \node at (0,0) {\captiontext};\def\captiontext{New}\node at (1cm,0) {\captiontext};}
            \place\node at (2cm,0) {\captiontext};",
            @"\node at (0,0) {Old};\node at (1cm,0) {New};\node at (2cm,0) {New};");

    [Fact]
    public void Redefining_an_active_control_with_a_different_body_is_not_a_cycle()
        => Equivalent(@"\def\place{\def\place{\draw (0,0)--(1,0);}\place}\place", @"\draw (0,0)--(1,0);");

    [Fact]
    public void Scope_options_and_single_key_aliases_use_current_definitions()
        => Equivalent(@"\def\offset{1cm}\def\keyname{draw}\def\tip{Stealth}
            \begin{scope}[xshift=\offset]\node[\keyname] {X};\end{scope}
            \usetikzlibrary{arrows.meta}\draw[-{\tip}] (0,0)--(1,0);",
            @"\begin{scope}[xshift=1cm]\node[draw] {X};\end{scope}
            \usetikzlibrary{arrows.meta}\draw[-{Stealth}] (0,0)--(1,0);");

    [Theory]
    [InlineData(@"\def\word{A}\node{\word B};", @"\node{AB};")]
    [InlineData(@"\def\word{\bfseries}\node{\word X};", @"\node{\bfseries X};")]
    [InlineData(@"\def\empty{}\node{\bfseries\empty X};", @"\node{\bfseries X};")]
    [InlineData(@"\def\word{\alpha}\node{$\word x$};", @"\node{$\alpha x$};")]
    [InlineData(@"\def\word{\%}\node{\word X};", @"\node{\%X};")]
    [InlineData("\\def\\word{A% ignored \\unknown\nB}\\node{\\word};", @"\node{AB};")]
    [InlineData("\\def\\word{A}\\node{\\word% ignored\nB};", @"\node{AB};")]
    public void Expansion_preserves_control_tokens_and_consumes_only_delimiter_blanks(string source, string expected)
        => Equivalent(source, expected);

    [Fact]
    public void Unused_recursive_or_unsupported_templates_are_not_executed()
        => Equivalent(@"\def\loop{\loop}\def\unused{\input{file}}\draw (0,0)--(1,0);", @"\draw (0,0)--(1,0);");

    [Fact]
    public void Definitions_and_numeric_assignments_share_the_scoped_control_name()
        => Equivalent(@"\def\number{1}\pgfmathsetmacro\number{2}
            \def\point{(\number,0)}\draw (0,0)--\point;
            \def\number{3}\draw (0,0)--(\number,0);",
            @"\draw (0,0)--(2,0);\draw (0,0)--(3,0);");

    [Fact]
    public void Statement_templates_bind_each_foreach_iteration_and_restore_definitions()
        => Equivalent(@"\def\captiontext{Outer}\def\place{\node (row\i) at (\i,0) {\captiontext\i};}
            \foreach \i in {1,2} {\def\captiontext{Inner}\place}
            \node at (0,1) {\captiontext};",
            @"\node (row1) at (1,0) {Inner1};\node (row2) at (2,0) {Inner2};\node at (0,1) {Outer};");

    [Theory]
    [InlineData(@"\def\loop{\loop}\loop")]
    [InlineData(@"\def\first{\second}\def\second{\first}\first")]
    [InlineData(@"\def\loop{\loop}\node{\loop};")]
    [InlineData(@"\def\first{\second}\def\second{\first}\draw (0,0)--(\first,0);")]
    public void Invoked_statement_and_value_cycles_fail_explicitly(string source)
    {
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        Assert.Equal("TIKZ003", Assert.Single(failure.Diagnostics).Code);
        Assert.Contains("Recursive token definition", failure.Diagnostics[0].Message);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Theory]
    [InlineData(@"\def\name#1{#1}")]
    [InlineData(@"\def\name{#1}")]
    [InlineData(@"\def\draw{anything}")]
    [InlineData(@"\def\pgfname{anything}")]
    [InlineData(@"\def\name{\input{file}}\name")]
    [InlineData(@"\foreach\i in{1}{\def\i{2}}")]
    [InlineData(@"\def\unused{}\unknown{argument}")]
    public void Parameters_reserved_names_and_unsupported_invoked_constructs_fail(string source)
    {
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        Assert.Equal("TIKZ002", Assert.Single(failure.Diagnostics).Code);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Fact]
    public void Errors_keep_the_definition_token_and_invocation_in_original_utf16_source()
    {
        const string source = "% 😀\r\n\\def\\bad{\\unsupported}\r\n\\bad";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal(source.IndexOf(@"\unsupported", StringComparison.Ordinal), diagnostic.Span.Offset);
        Assert.Equal(2, diagnostic.Span.Line);
        Assert.Contains(diagnostic.RelatedLocations, span => span.Offset == source.IndexOf(@"\bad", StringComparison.Ordinal));
        Assert.Contains(diagnostic.RelatedLocations, span => span.Offset == source.LastIndexOf(@"\bad", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Definitions_are_isolated_between_sequential_and_concurrent_conversions()
    {
        Equivalent(@"\def\place{\draw (0,0)--(1,0);}\place", @"\draw (0,0)--(1,0);");
        var undeclared = Assert.IsType<TikzFailure>(TikzConverter.Convert(@"\place", Body, CancellationToken.None));
        Assert.Equal("TIKZ002", Assert.Single(undeclared.Diagnostics).Code);
        Assert.Equal(0, undeclared.Statistics.OutputBytes);

        await Task.WhenAll(Enumerable.Range(1, 8).Select(value => Task.Run(() =>
            Equivalent($@"\def\width{{{value}}}\draw (0,0)--(\width,0);", $@"\draw (0,0)--({value},0);"))));
    }

    [Fact]
    public void Expansion_has_shared_work_token_depth_and_cancellation_limits()
    {
        const string source = @"\def\a{\b}\def\b{\c}\def\c{X}\node{\a};";
        foreach (var limits in new[] { TikzLimits.Default with { MaxExpansionDepth = 2 },
            TikzLimits.Default with { MaxExpandedTokens = 0 }, TikzLimits.Default with { MaxWork = 1 } })
        {
            var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body with { Limits = limits }, CancellationToken.None));
            Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
            Assert.Equal(0, failure.Statistics.OutputBytes);
        }
        using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        Assert.Throws<OperationCanceledException>(() => TikzConverter.Convert(source, Body, cancelled.Token));
    }

    [Fact]
    public async Task Ongoing_token_expansion_observes_cancellation_after_charged_work()
    {
        using var cancellation = new CancellationTokenSource();
        var budget = new Lokad.TikZ.Semantics.Budget(TikzLimits.Default with
            { MaxWork = 500_000_000, MaxExpandedTokens = 100_000_000 }, cancellation.Token);
        var state = new Lokad.TikZ.Semantics.EvaluationState();
        for (var i = 0; i < 24; i++)
        {
            var name = "\\" + new string('a', i + 1);
            var body = i == 0 ? "X" : "\\" + new string('a', i) + " \\" + new string('a', i);
            var variable = new Lokad.TikZ.Frontend.Source(name, 0, name.Length);
            var content = new Lokad.TikZ.Frontend.Source(body, 0, body.Length);
            state.Definitions[name] = new(variable, content, variable);
        }
        var invocation = "\\" + new string('a', 24);
        var task = Task.Run(() => new Lokad.TikZ.Frontend.TokenExpansion(state, budget)
            .Expand(new(invocation, 0, invocation.Length)));
        var deadline = System.Diagnostics.Stopwatch.StartNew();
        while (budget.Work < 50_000 && !task.IsCompleted && deadline.Elapsed < TimeSpan.FromSeconds(5)) await Task.Delay(1);
        cancellation.Cancel();
        var error = await Assert.ThrowsAnyAsync<OperationCanceledException>(async () => await task);
        Assert.Equal(cancellation.Token, error.CancellationToken);
        Assert.True(budget.Work >= 50_000, "Cancellation must interrupt ongoing expansion, not merely a pre-cancelled call.");
    }

    [Fact]
    public void Definitions_before_the_explicit_picture_are_available_inside_it()
        => Assert.IsType<TikzSuccess>(TikzConverter.Convert(@"\def\point{(1,0)}\begin{tikzpicture}\draw (0,0)--\point;\end{tikzpicture}",
            TikzOptions.Default, CancellationToken.None));
}

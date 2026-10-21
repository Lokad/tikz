using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class ParameterizedStyleTests
{
    private static readonly TikzOptions Body = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody, IdPrefix = "style" };

    [Fact]
    public void Appending_an_unused_growing_style_consumes_the_copy_work_budget()
    {
        var source = @"\tikzset{s/.style={}}" + string.Concat(Enumerable.Repeat(@"\tikzset{s/.append style={draw}}", 1000));
        var options = Body with { Limits = Body.Limits with { MaxWork = 250_000 } };
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, options, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ005", diagnostic.Code);
        Assert.Contains("work", diagnostic.Message);
        Assert.Equal("s/.append style={draw}", source.Substring(diagnostic.Span.Offset, diagnostic.Span.Length));
        Assert.InRange(failure.Statistics.Work, 1, options.Limits.MaxWork);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Fact]
    public void Complete_parameterized_flowchart_matches_native_node_geometry()
        => PositioningTests.CompareNative("Diagrams", "Diagrams", "flowchart-parameterized", 4);

    [Fact]
    public void Forwarding_append_order_and_scopes_match_native_measurements()
        => PositioningTests.CompareNative("Styles", "Styles", "style-contract", 7);

    [Theory]
    [InlineData(@"\tikzset{s/.style={draw,minimum width=#1}}\node[s=14mm]{A};", @"\node[draw,minimum width=14mm]{A};")]
    [InlineData(@"\tikzset{s/.style={draw,minimum width=#1},s/.append style={minimum height=#1}}\node[s={14mm}]{A};", @"\node[draw,minimum width=14mm,minimum height=14mm]{A};")]
    [InlineData(@"\tikzset{s/.style={draw,minimum width=#1},t/.style={s=#1}}\node[t=14mm,minimum width=18mm]{A};", @"\node[draw,minimum width=18mm]{A};")]
    [InlineData(@"\tikzset{s/.style={draw}}\node[s=ignored]{A};", @"\node[draw]{A};")]
    [InlineData(@"\tikzset{/tikz/s/.style={draw,/pgf/minimum width=#1}}\node[/tikz/s=14mm]{A};", @"\node[draw,minimum width=14mm]{A};")]
    [InlineData(@"\tikzset{s/.style={draw,fill=#1}}\node[s={red!25!blue}]{A};", @"\node[draw,fill={red!25!blue}]{A};")]
    [InlineData(@"\tikzset{s/.style={draw,anchor=#1}}\node[s=west]at(2,1){A};", @"\node[draw,anchor=west]at(2,1){A};")]
    [InlineData(@"\tikzset{s/.style={draw,font=#1}}\node[s={\large\bfseries}]{A};", @"\node[draw,font={\large\bfseries}]{A};")]
    [InlineData(@"\tikzset{s/.style={draw=#1}}\draw[s=blue](0,0)--(1,0);", @"\draw[draw=blue](0,0)--(1,0);")]
    [InlineData("\\tikzset{s/.style={draw,minimum width=#1 % #2 is a comment\n}}\\node[s={14mm}]{A};", @"\node[draw,minimum width=14mm]{A};")]
    [InlineData(@"\tikzset{s/.style={draw,minimum width=#1}}\begin{scope}[s/.append style={minimum height=#1}]\node[s=14mm]{A};\end{scope}\node[s=14mm]at(30mm,0){B};", @"\node[draw,minimum width=14mm,minimum height=14mm]{A};\node[draw,minimum width=14mm]at(30mm,0){B};")]
    public void Whole_value_arguments_preserve_explicit_option_equivalents(string styled, string equivalent)
    {
        var a = Assert.IsType<TikzSuccess>(TikzConverter.Convert(styled, Body, CancellationToken.None));
        var b = Assert.IsType<TikzSuccess>(TikzConverter.Convert(equivalent, Body, CancellationToken.None));
        Assert.Equal(b.Svg, a.Svg);
        Assert.Equal(b.PictureBounds, a.PictureBounds);
        Assert.Equal(b.InkBounds, a.InkBounds);
    }

    [Theory]
    [InlineData("minimum width=#2")]
    [InlineData("minimum width=2*#1")]
    [InlineData("shift={(#1,0)}")]
    [InlineData("#1=14mm")]
    [InlineData("minimum width=##1")]
    public void Undeclared_parameter_forms_reject_at_the_original_definition(string definition)
    {
        var source = @"\tikzset{s/.style={" + definition + @"}}\node{A};";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ002", diagnostic.Code);
        Assert.Equal(source.IndexOf('#'), diagnostic.Span.Offset);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Theory]
    [InlineData("s")]
    [InlineData("s={}")]
    [InlineData("s={ % comment\n}")]
    public void Parameter_use_requires_a_nonempty_explicit_argument(string invocation)
    {
        var source = @"\tikzset{s/.style={draw,minimum width=#1}}\node[" + invocation + "]{A};";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ002", diagnostic.Code);
        Assert.Equal(source.LastIndexOf(invocation, StringComparison.Ordinal), diagnostic.Span.Offset);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Fact]
    public void Invalid_forwarded_argument_keeps_original_utf16_span_and_definitions()
    {
        const string source = "% \U0001F600\r\n\\tikzset{s/.style={minimum width=#1},t/.style={s=#1}}\r\n  \\node[t={unknownValue}]{A};";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ003", diagnostic.Code);
        Assert.Equal(new TikzSourceSpan(source.IndexOf("unknownValue", StringComparison.Ordinal), 1, 3, 12), diagnostic.Span);
        Assert.Contains(diagnostic.RelatedLocations, span => span.Offset == source.IndexOf("#1", StringComparison.Ordinal));
        Assert.Contains(diagnostic.RelatedLocations, span => span.Offset == source.LastIndexOf("#1", StringComparison.Ordinal));
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Fact]
    public void Invalid_template_key_keeps_definition_and_original_call_site()
    {
        const string source = @"\tikzset{s/.style={unsupported=#1}}\node[s=14mm]{A};";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ002", diagnostic.Code);
        Assert.Equal(source.IndexOf("unsupported", StringComparison.Ordinal), diagnostic.Span.Offset);
        Assert.Contains(diagnostic.RelatedLocations, span => span.Offset == source.IndexOf("s=14mm", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("style-missing-argument")]
    [InlineData("style-second-parameter")]
    public void Declared_unsupported_native_forms_have_no_output(string id)
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures/Styles/" + id + ".tikz"));
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, TikzOptions.Default, CancellationToken.None));
        Assert.Equal("TIKZ002", Assert.Single(failure.Diagnostics).Code);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Theory]
    [InlineData(@"\tikzset{every node/.style={minimum width=#1}}\node{A};")]
    [InlineData(@"\tikzset{every path/.style={line width=#1}}\draw(0,0)--(1,0);")]
    [InlineData(@"\tikzset{every edge/.style={line width=#1}}\path(0,0)edge(1,0);")]
    public void Automatic_style_use_reports_the_required_argument_explicitly(string source)
    {
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ002", diagnostic.Code);
        Assert.Contains("nonempty explicit argument", diagnostic.Message);
        Assert.Contains(diagnostic.RelatedLocations, span => span.Offset == source.IndexOf("#1", StringComparison.Ordinal));
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Fact]
    public void Expanded_token_limit_accumulates_across_invocations()
    {
        const string source = @"\tikzset{s/.style={minimum width=#1}}\node[s=1pt]{A};\node[s=2pt]{B};";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source,
            Body with { Limits = TikzLimits.Default with { MaxExpandedTokens = 17 } }, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ005", diagnostic.Code);
        Assert.Contains("expanded tokens", diagnostic.Message);
        Assert.Equal(source.IndexOf("s=2pt", StringComparison.Ordinal), diagnostic.Span.Offset);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Fact]
    public void Recursive_and_broad_expansion_share_depth_work_and_token_limits()
    {
        const string recursive = @"\tikzset{s/.style={s=#1}}\node[s=14mm]{A};";
        var depth = Assert.IsType<TikzFailure>(TikzConverter.Convert(recursive,
            Body with { Limits = TikzLimits.Default with { MaxExpansionDepth = 3 } }, CancellationToken.None));
        Assert.Equal("TIKZ005", Assert.Single(depth.Diagnostics).Code);
        const string source = @"\tikzset{s/.style={draw,minimum width=#1}}\node[s=14mm]{A};";
        var tokens = Assert.IsType<TikzFailure>(TikzConverter.Convert(source,
            Body with { Limits = TikzLimits.Default with { MaxExpandedTokens = 5 } }, CancellationToken.None));
        var tokenDiagnostic = Assert.Single(tokens.Diagnostics);
        Assert.Equal("TIKZ005", tokenDiagnostic.Code);
        Assert.Contains("expanded tokens", tokenDiagnostic.Message);
        var work = Assert.IsType<TikzFailure>(TikzConverter.Convert(source,
            Body with { Limits = TikzLimits.Default with { MaxWork = 100 } }, CancellationToken.None));
        Assert.Equal("TIKZ005", Assert.Single(work.Diagnostics).Code);
        Assert.Equal(0, tokens.Statistics.OutputBytes);
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        var error = Assert.Throws<OperationCanceledException>(() => TikzConverter.Convert(source, Body, cancellation.Token));
        Assert.Equal(cancellation.Token, error.CancellationToken);
    }
}

using Lokad.TikZ.Frontend;
using Lokad.TikZ.Semantics;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class ForeachTests
{
    private static readonly TikzOptions Body = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody, IdPrefix = "loop" };

    [Fact]
    public void Complete_loop_flowchart_matches_native_named_node_geometry()
        => PositioningTests.CompareNative("Diagrams", "Diagrams", "flowchart-foreach", 5);

    [Fact]
    public void Lists_ranges_shadowing_and_iteration_scopes_match_native_geometry()
        => PositioningTests.CompareNative("Foreach", "Foreach", "foreach-contract", 29);

    [Theory]
    [InlineData(@"\foreach \i in {1,2,3}{\node(n\i)at(\i,0){A\i};}", @"{\node(n1)at(1,0){A1};}{\node(n2)at(2,0){A2};}{\node(n3)at(3,0){A3};}", 3)]
    [InlineData(@"\foreach \i in {3,...,1}{\node(n\i)at(\i,0){\i};}", @"{\node(n3)at(3,0){3};}{\node(n2)at(2,0){2};}{\node(n1)at(1,0){1};}", 3)]
    [InlineData(@"\foreach \i in {-1,-3,...,-6}{\node(n\i)at(\i,0){\i};}", @"{\node(n-1)at(-1,0){-1};}{\node(n-3)at(-3,0){-3};}{\node(n-5)at(-5,0){-5};}", 3)]
    [InlineData(@"\foreach \i in {1,3,...,0}{\node(n\i)at(\i,0){\i};}", @"{\node(n1)at(1,0){1};}{\node(n3)at(3,0){3};}", 2)]
    [InlineData(@"\foreach \i in {2,...,2}{\node{\i};}", @"{\node{2};}", 1)]
    [InlineData(@"\foreach \word in {{Stage one}}{\node{\word};}", @"{\node{Stage one};}", 1)]
    [InlineData(@"\foreach \word in {One}{\node{\word two};}", @"{\node{Onetwo};}", 1)]
    [InlineData(@"\foreach \word in {One}{\node{\word{} two};}", @"{\node{One{} two};}", 1)]
    [InlineData("\\foreach \\i in {1,% \\i ignored\n 2}{\\node(n\\i)at(\\i,0){\\i % \\i ignored\n};}", @"{\node(n1)at(1,0){1};}{\node(n2)at(2,0){2};}", 2)]
    [InlineData(@"\foreach \width in {8mm,12mm}{\node[draw,minimum width=\width]{A};}", @"{\node[draw,minimum width=8mm]{A};}{\node[draw,minimum width=12mm]{A};}", 2)]
    [InlineData(@"\foreach \i in {1}{\node{\i};\foreach \i in {2}{\node{\i};}\node{\i};}", @"{\node{1};{\node{2};}\node{1};}", 2)]
    [InlineData(@"\foreach \i in {1,2}{\foreach \j in {\i}{\node(n\i-\j)at(\i,\j){\j};}}", @"{{\node(n1-1)at(1,1){1};}}{{\node(n2-2)at(2,2){2};}}", 4)]
    [InlineData(@"\foreach \i in {1,2}{\begin{scope}[xshift=\i mm]\node(n\i){\i};\end{scope}}", @"{\begin{scope}[xshift=1mm]\node(n1){1};\end{scope}}{\begin{scope}[xshift=2mm]\node(n2){2};\end{scope}}", 2)]
    [InlineData(@"\foreach \i in {1,2}{\node(a\i){A};\tikzset{minimum width=18mm}\node(b\i){A};}\node(c){A};", @"{\node(a1){A};\tikzset{minimum width=18mm}\node(b1){A};}{\node(a2){A};\tikzset{minimum width=18mm}\node(b2){A};}\node(c){A};", 2)]
    [InlineData(@"\foreach \i in {1,2}{\coordinate(c\i)at(\i,0);}\draw(c1)--(c2);", @"{\coordinate(c1)at(1,0);}{\coordinate(c2)at(2,0);}\draw(c1)--(c2);", 2)]
    [InlineData(@"\foreach \i in {}{\unsupported}\node{A};", @"\node{A};", 0)]
    public void Scoped_literal_expansion_preserves_explicit_diagram_equivalents(string loop, string explicitSource, int iterations)
    {
        var actual = Assert.IsType<TikzSuccess>(TikzConverter.Convert(loop, Body, CancellationToken.None));
        var expected = Assert.IsType<TikzSuccess>(TikzConverter.Convert(explicitSource, Body, CancellationToken.None));
        Assert.Equal(expected.Svg, actual.Svg);
        Assert.Equal(expected.PictureBounds, actual.PictureBounds);
        Assert.Equal(expected.InkBounds, actual.InkBounds);
        Assert.Equal(iterations, actual.Statistics.LoopIterations);
    }

    [Theory]
    [InlineData(@"\foreach \i/\j in {1/2}{\node{A};}")]
    [InlineData(@"\foreach \i [count=\j] in {1}{\node{A};}")]
    [InlineData(@"\foreach \i in \items {\node{A};}")]
    [InlineData(@"\foreach \i in {1}\node{A};")]
    [InlineData(@"\foreach \draw in {1}{\node{A};}")]
    [InlineData(@"\foreach \pgfvalue in {1}{\node{A};}")]
    [InlineData(@"\foreach \i in {0,0,...,3}{\node{A};}")]
    [InlineData(@"\foreach \i in {0,0.5,...,3}{\node{A};}")]
    [InlineData(@"\foreach \i in {A,...,D}{\node{A};}")]
    [InlineData(@"\foreach \i in {x1,x...,x3}{\node{A};}")]
    [InlineData(@"\foreach \i in {16384,...,16385}{\node{A};}")]
    [InlineData(@"\foreach \i in {-16383,16383,...,16383}{\node{A};}")]
    [InlineData(@"\foreach \i in {1,...,3,5}{\node{A};}")]
    [InlineData(@"\foreach \i in {1,,3}{\node{A};}")]
    [InlineData(@"\foreach \i in {{}}{\node{A};}")]
    [InlineData(@"\foreach \i in {\unknown}{\node{A};}")]
    [InlineData(@"\foreach \i in {{draw,rectangle}}{\node{A};}")]
    [InlineData("\\foreach \\i in {é}{\\node{A};}")]
    [InlineData("\\foreach \\i in {\u00a0A}{\\node{A};}")]
    [InlineData(@"\draw(0,0)\foreach \i in {1}{--(\i,0)};")]
    public void Undeclared_loop_forms_fail_without_output(string source)
    {
        var result = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(result.Diagnostics);
        Assert.Equal("TIKZ002", diagnostic.Code);
        Assert.InRange(diagnostic.Span.Offset, 0, source.Length - 1);
        Assert.Equal(0, result.Statistics.OutputBytes);
    }

    [Fact]
    public void Bound_control_words_do_not_match_longer_words_or_leak_outside_iterations()
    {
        const string source = @"\foreach \width in {2pt}{\node[minimum width=\widthsuffix]{A};}";
        var result = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(result.Diagnostics);
        Assert.Equal("TIKZ003", diagnostic.Code);
        Assert.Equal(source.IndexOf(@"\widthsuffix", StringComparison.Ordinal), diagnostic.Span.Offset);
        var outside = Assert.IsType<TikzFailure>(TikzConverter.Convert(@"\foreach \width in {2pt}{}\node[minimum width=\width]{A};", Body, CancellationToken.None));
        Assert.Equal("TIKZ003", Assert.Single(outside.Diagnostics).Code);
    }

    [Theory]
    [InlineData("foreach-overflow-positive")]
    [InlineData("foreach-overflow-negative")]
    public void Native_continuation_overflow_is_not_hidden_by_endpoint_checks(string id)
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures/Foreach/" + id + ".tikz"));
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, TikzOptions.Default, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ004", diagnostic.Code);
        Assert.Equal(source.IndexOf("...", StringComparison.Ordinal), diagnostic.Span.Offset);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Fact]
    public void Invalid_substitution_retains_original_utf16_item_and_body_use()
    {
        const string source = "% \U0001F600\r\n\\foreach \\width in {unknownValue}\r\n{\\node[minimum width=\\width]{A};}";
        var result = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(result.Diagnostics);
        Assert.Equal("TIKZ003", diagnostic.Code);
        Assert.Equal(new TikzSourceSpan(source.IndexOf("unknownValue", StringComparison.Ordinal), 1, 2, 21), diagnostic.Span);
        Assert.Contains(diagnostic.RelatedLocations, span => span.Offset == source.LastIndexOf(@"\width", StringComparison.Ordinal));
        Assert.Contains(diagnostic.RelatedLocations, span => span.Offset == source.IndexOf(@"\width", StringComparison.Ordinal));
        Assert.All(diagnostic.RelatedLocations, span => Assert.InRange(span.Offset + span.Length, 0, source.Length));
    }

    [Fact]
    public void Literal_body_failure_after_substitution_retains_original_offset()
    {
        const string source = @"\foreach \i in {123}{\draw(\i,0)--(missing);}";
        var result = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(result.Diagnostics);
        Assert.Equal("TIKZ003", diagnostic.Code);
        Assert.Equal(source.IndexOf("(missing)", StringComparison.Ordinal), diagnostic.Span.Offset);
    }

    [Fact]
    public void Nested_loops_share_iteration_node_glyph_work_and_expansion_limits()
    {
        const string source = @"\foreach \i in {1,2}{\foreach \j in {3,4}{\node{A};}}";
        foreach (var limits in new[] {
            TikzLimits.Default with { MaxLoopIterations = 2 },
            TikzLimits.Default with { MaxNodes = 1 },
            TikzLimits.Default with { MaxGlyphs = 1 },
            TikzLimits.Default with { MaxWork = 100 },
            TikzLimits.Default with { MaxExpandedTokens = 12 },
            TikzLimits.Default with { MaxExpansionDepth = 1 },
            TikzLimits.Default with { MaxNesting = 1 } })
        {
            var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body with { Limits = limits }, CancellationToken.None));
            Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
            Assert.Equal(0, failure.Statistics.OutputBytes);
        }
        var iterations = Assert.IsType<TikzFailure>(TikzConverter.Convert(source,
            Body with { Limits = TikzLimits.Default with { MaxLoopIterations = 2 } }, CancellationToken.None));
        Assert.Equal(2, iterations.Statistics.LoopIterations);
    }

    [Fact]
    public void Long_empty_ranges_are_lazy_and_capped_before_materialization()
    {
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(@"\foreach \i in {-16383,...,16383}{}",
            Body with { Limits = TikzLimits.Default with { MaxLoopIterations = 3 } }, CancellationToken.None));
        Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
        Assert.Equal(3, failure.Statistics.LoopIterations);
        Assert.InRange(failure.Statistics.Work, 0, 2000);
        Assert.Equal(0, failure.Statistics.Nodes);
    }

    [Theory]
    [InlineData("1,...,1000")]
    [InlineData("1,3,...,1000")]
    public void Lazy_range_generation_observes_cancellation_between_items(string list)
    {
        using var cancellation = new CancellationTokenSource();
        var budget = new Budget(TikzLimits.Default, cancellation.Token);
        using var iterator = ForeachValues.Read(new Source(list, 0, list.Length), null, budget).GetEnumerator();
        Assert.True(iterator.MoveNext());
        cancellation.Cancel();
        var error = Assert.Throws<OperationCanceledException>(() => iterator.MoveNext());
        Assert.Equal(cancellation.Token, error.CancellationToken);
    }

    [Fact]
    public void Shared_mapped_provenance_does_not_unfold_exponentially_in_diagnostics()
    {
        const string original = "ab";
        var definition = new Source(original, 0, 1);
        var value = new Source(original, 1, 1);
        for (var i = 0; i < 30; i++)
            value = new Source("b", 0, 1)
            {
                Mapping = new(value, [new(0, 1, value, true)]),
                RelatedSources = [value, definition]
            };
        var diagnostic = new CompileError("TIKZ003", "Invalid forwarded value.", value).Diagnostic;
        Assert.Equal(new TikzSourceSpan(1, 1, 1, 2), diagnostic.Span);
        Assert.Equal(new TikzSourceSpan(0, 1, 1, 1), Assert.Single(diagnostic.RelatedLocations));
    }
}

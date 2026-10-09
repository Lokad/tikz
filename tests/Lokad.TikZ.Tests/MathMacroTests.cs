using System.Text.Json;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Semantics;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class MathMacroTests
{
    private static readonly TikzOptions Body = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody, IdPrefix = "math" };

    [Theory]
    [InlineData("Diagrams", "Diagrams", "flowchart-math-macros", 5)]
    [InlineData("MathMacros", "", "math-macro-contract", 25)]
    [InlineData("MathMacros", "", "math-scalar-boundaries", 1)]
    public void Assignments_and_all_node_anchors_match_independent_native_observations(string fixtures, string references, string id, int nodes)
    {
        var scene = PositioningTests.CompareNative(fixtures, references, id, nodes, "MathMacros");
        using var expected = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference/MathMacros/" + references + "/" + id + ".json")));
        var calls = expected.RootElement.GetProperty("scalarCalls").EnumerateArray().ToArray();
        Assert.Equal(calls.Length, scene.NumericAssignments.Count);
        for (var i = 0; i < calls.Length; i++)
        {
            Assert.Equal(calls[i].GetProperty("name").GetString(), scene.NumericAssignments[i].Name);
            Assert.Equal(calls[i].GetProperty("printed").GetString(), scene.NumericAssignments[i].Printed);
        }
    }

    [Theory]
    [InlineData(@"\pgfmathsetmacro\gap{(3+1)/2}\node[minimum width=\gap*1cm]at(\gap,0){A};", @"\node[minimum width=2*1cm]at(2,0){A};")]
    [InlineData(@"\pgfmathsetmacro\gap{1.5}\begin{scope}\pgfmathsetmacro\gap{\gap*2}\coordinate(a)at(\gap,0);\end{scope}\coordinate(b)at(\gap,0);\draw(a)--(b);", @"\coordinate(a)at(3,0);\coordinate(b)at(1.5,0);\draw(a)--(b);")]
    [InlineData(@"\pgfmathsetmacro\gap{.5}{\pgfmathsetmacro\gap{\gap+1}\coordinate(a)at(\gap,0);}\coordinate(b)at(\gap,0);\draw(a)--(b);", @"\coordinate(a)at(1.5,0);\coordinate(b)at(.5,0);\draw(a)--(b);")]
    [InlineData(@"\pgfmathsetmacro\gap{2}\foreach \i in {1,2}{\pgfmathsetmacro\gap{\gap+\i}\coordinate(c\i)at(\gap,0);}\draw(c1)--(c2)--(\gap,0);", @"\coordinate(c1)at(3,0);\coordinate(c2)at(4,0);\draw(c1)--(c2)--(2,0);")]
    [InlineData("\\pgfmathsetmacro\\gap{1 % ignored\n+1}\\draw(0,0)--(\\gap,0);", @"\draw(0,0)--(2,0);")]
    public void Sequential_and_scoped_values_preserve_explicit_diagram_equivalents(string source, string equivalent)
    {
        var actual = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var expected = Assert.IsType<TikzSuccess>(TikzConverter.Convert(equivalent, Body, CancellationToken.None));
        Assert.Equal(expected.Svg, actual.Svg);
        Assert.Equal(expected.PictureBounds, actual.PictureBounds);
        Assert.Equal(expected.InkBounds, actual.InkBounds);
    }

    [Fact]
    public void Definitions_before_the_picture_are_available_in_picture_options()
    {
        const string source = @"\pgfmathsetmacro\scale{1+1}\begin{tikzpicture}[scale=\scale]\draw(0,0)--(1,0);\end{tikzpicture}";
        const string equivalent = @"\begin{tikzpicture}[scale=2]\draw(0,0)--(1,0);\end{tikzpicture}";
        var options = TikzOptions.Default with { IdPrefix = "math" };
        var actual = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, options, CancellationToken.None));
        var expected = Assert.IsType<TikzSuccess>(TikzConverter.Convert(equivalent, options, CancellationToken.None));
        Assert.Equal(expected.Svg, actual.Svg);
    }

    [Fact]
    public void Grouped_positioning_distance_remains_a_part_of_its_value()
    {
        const string grouped = @"\node(a){A};\node[right={1cm} of a](b){B};";
        const string equivalent = @"\node(a){A};\node[right=1cm of a](b){B};";
        var options = Body with { Libraries = ["positioning"] };
        var actual = Assert.IsType<TikzSuccess>(TikzConverter.Convert(grouped, options, CancellationToken.None));
        var expected = Assert.IsType<TikzSuccess>(TikzConverter.Convert(equivalent, options, CancellationToken.None));
        Assert.Equal(expected.Svg, actual.Svg);
        Assert.Equal(expected.PictureBounds, actual.PictureBounds);
    }

    [Theory]
    [InlineData(@"\pgfmathsetmacro{\a}{1}")]
    [InlineData(@"\pgfmathsetmacro\α{1}")]
    [InlineData(@"\pgfmathsetmacro\draw{1}")]
    [InlineData(@"\pgfmathsetmacro\tikzvalue{1}")]
    [InlineData(@"\pgfmathsetmacro\a{1cm}")]
    [InlineData(@"\pgfmathsetmacro\a{1em}")]
    [InlineData(@"\pgfmathsetmacro\a{2^3}")]
    [InlineData(@"\pgfmathsetmacro\a{sin(30)}")]
    [InlineData(@"\pgfmathsetmacro\a{pi}")]
    [InlineData(@"\pgfmathsetmacro\a{1e-3}")]
    [InlineData(@"\foreach \i in {1}{\pgfmathsetmacro\i{2}}")]
    [InlineData(@"\pgfmathsetmacro\a{1}\node{\a};")]
    [InlineData(@"\pgfmathsetmacro\a{1}\node(n\a){A};")]
    [InlineData(@"\pgfmathsetmacro\a{1}\foreach \i in {\a}{\node{A};}")]
    public void Undeclared_numeric_and_textual_macro_forms_fail_explicitly(string source)
    {
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        Assert.Equal("TIKZ002", Assert.Single(failure.Diagnostics).Code);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Theory]
    [InlineData(@"\pgfmathsetmacro\a{1/0}")]
    [InlineData(@"\pgfmathsetmacro\a{16383+1}")]
    [InlineData(@"\pgfmathsetmacro\a{16383*2}")]
    [InlineData(@"\pgfmathsetmacro\a{1/0.000001}")]
    [InlineData(@"\pgfmathsetmacro\a{0/0.00002}")]
    public void Undefined_and_register_overflow_results_fail_without_partial_output(string source)
    {
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        Assert.Equal("TIKZ004", Assert.Single(failure.Diagnostics).Code);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Fact]
    public void Arithmetic_errors_retain_original_use_and_declaration_spans()
    {
        const string source = "% \U0001F600\r\n\\pgfmathsetmacro\\zero{0}\r\n\\pgfmathsetmacro\\a{1/\\zero}";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ004", diagnostic.Code);
        Assert.Equal(source.IndexOf("1/", StringComparison.Ordinal) + 1, diagnostic.Span.Offset);
        Assert.Contains(diagnostic.RelatedLocations, s => s.Offset == source.IndexOf(@"\zero", StringComparison.Ordinal));
        Assert.Contains(diagnostic.RelatedLocations, s => s.Offset == source.LastIndexOf(@"\zero", StringComparison.Ordinal));
        Assert.All(diagnostic.RelatedLocations, s => Assert.InRange(s.Offset + s.Length, 0, source.Length));
    }

    [Fact]
    public void Coordinate_failure_and_graphics_keep_numeric_definition_provenance()
    {
        const string source = @"\pgfmathsetmacro\zero{0}\draw(1/\zero,0)--(1,0);";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ004", diagnostic.Code);
        Assert.Equal(source.IndexOf("1/", StringComparison.Ordinal) + 1, diagnostic.Span.Offset);
        Assert.Contains(diagnostic.RelatedLocations, s => s.Offset == source.IndexOf(@"\zero", StringComparison.Ordinal));
        const string valid = @"\pgfmathsetmacro\a{2}\node(n)at(\a,0){A};\draw(0,0)--(\a,1);";
        GraphicsScene? trace = null;
        Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(valid, Body, CancellationToken.None, scene => trace = scene));
        Assert.Contains(Assert.Single(trace!.Nodes).Source.RelatedLocations(), s => s.Offset == valid.IndexOf(@"\a", StringComparison.Ordinal));
        Assert.All(trace.Paths, p => Assert.Contains(p.Source.RelatedLocations(), s => s.Offset == valid.IndexOf(@"\a", StringComparison.Ordinal)));
    }

    [Fact]
    public void Forward_references_and_values_outside_their_scope_are_unknown()
    {
        foreach (var source in new[] { @"\pgfmathsetmacro\a{\later+1}\pgfmathsetmacro\later{2}", @"{\pgfmathsetmacro\a{1}}\draw(\a,0)--(0,0);" })
        {
            var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
            Assert.Equal("TIKZ003", Assert.Single(failure.Diagnostics).Code);
        }
    }

    [Fact]
    public void Coordinate_limits_and_functions_retain_numeric_definition_provenance()
    {
        const string source = @"\pgfmathsetmacro\a{2}\draw(\a,0)--(0,0);";
        var limited = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body with { Limits = TikzLimits.Default with { MaxCoordinatePixels = 1 } }, CancellationToken.None));
        var diagnostic = Assert.Single(limited.Diagnostics);
        Assert.Equal("TIKZ005", diagnostic.Code);
        Assert.Contains(diagnostic.RelatedLocations, s => s.Offset == source.IndexOf(@"\a", StringComparison.Ordinal));
        const string function = @"\pgfmathsetmacro\zero{0}\draw(ln(\zero),0)--(1,0);";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(function, Body, CancellationToken.None));
        diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ004", diagnostic.Code);
        Assert.Contains(diagnostic.RelatedLocations, s => s.Offset == function.IndexOf(@"\zero", StringComparison.Ordinal));
    }

    [Fact]
    public void Definitions_and_loops_share_work_expansion_depth_and_iteration_limits()
    {
        const string source = @"\pgfmathsetmacro\a{1}\foreach \i in {1,2,3}{\pgfmathsetmacro\a{\a+\i}\node at(\a,0){A};}";
        foreach (var limits in new[] { TikzLimits.Default with { MaxWork = 80 }, TikzLimits.Default with { MaxExpandedTokens = 8 }, TikzLimits.Default with { MaxLoopIterations = 1 } })
        {
            var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body with { Limits = limits }, CancellationToken.None));
            Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
            Assert.Equal(0, failure.Statistics.OutputBytes);
        }
        const string nested = @"\pgfmathsetmacro\a{1+(2+(3+4))}";
        var depth = Assert.IsType<TikzFailure>(TikzConverter.Convert(nested, Body with { Limits = TikzLimits.Default with { MaxExpressionDepth = 2 } }, CancellationToken.None));
        Assert.Equal("TIKZ005", Assert.Single(depth.Diagnostics).Code);
    }

    [Fact]
    public void Assignment_evaluation_observes_cancellation_and_division_work_limits()
    {
        const string expression = "123.456/1.2345";
        var input = new Source(expression, 0, expression.Length);
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        PgfScalarArithmetic.Evaluate(input, budget);
        Assert.Throws<CompileError>(() => PgfScalarArithmetic.Evaluate(input, new Budget(TikzLimits.Default with { MaxWork = budget.Work - 1 }, CancellationToken.None)));
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        Assert.Throws<OperationCanceledException>(() => PgfScalarArithmetic.Evaluate(input, new Budget(TikzLimits.Default, cancellation.Token)));
    }
}

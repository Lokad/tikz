using System.Text.Json;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Semantics;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class MathFunctionTests
{
    private static readonly TikzOptions Body = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody, IdPrefix = "functions" };

    [Theory]
    [InlineData("Diagrams", "Diagrams", "network-math-functions", 5)]
    [InlineData("MathFunctions", "", "math-functions-contract", 37)]
    [InlineData("MathFunctions", "", "math-function-boundaries", 1)]
    public void Functions_and_all_node_anchors_match_independent_native_observations(string fixtures, string references, string id, int nodes)
    {
        var scene = PositioningTests.CompareNative(fixtures, references, id, nodes, "MathFunctions");
        using var expected = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference/MathFunctions/" + references + "/" + id + ".json")));
        var calls = expected.RootElement.GetProperty("scalarCalls").EnumerateArray().ToArray();
        Assert.Equal(calls.Length, scene.NumericAssignments.Count);
        for (var i = 0; i < calls.Length; i++)
        {
            Assert.Equal(calls[i].GetProperty("name").GetString(), scene.NumericAssignments[i].Name);
            Assert.Equal(calls[i].GetProperty("printed").GetString(), scene.NumericAssignments[i].Printed);
        }
    }

    [Theory]
    [InlineData("sin()", "TIKZ001")]
    [InlineData("sin(30,60)", "TIKZ001")]
    [InlineData("cos()", "TIKZ001")]
    [InlineData("abs(1,2)", "TIKZ001")]
    [InlineData("min(1)", "TIKZ001")]
    [InlineData("max(1,2,3)", "TIKZ001")]
    [InlineData("tan(30)", "TIKZ002")]
    [InlineData("sqrt(4)", "TIKZ002")]
    [InlineData("Sin(30)", "TIKZ002")]
    [InlineData("cos(1cm)", "TIKZ002")]
    [InlineData("abs(1em)", "TIKZ002")]
    [InlineData("min(1,2^3)", "TIKZ002")]
    [InlineData("sin(pi)", "TIKZ002")]
    [InlineData("cos(1e-3)", "TIKZ002")]
    [InlineData("cos(16384)", "TIKZ004")]
    [InlineData("sin(-16384)", "TIKZ004")]
    [InlineData("abs(16383+1)", "TIKZ004")]
    [InlineData("min(1,1/0)", "TIKZ004")]
    public void Undeclared_calls_arity_and_invalid_operands_fail_without_partial_output(string expression, string code)
    {
        var source = "\\pgfmathsetmacro\\value{" + expression + "}\\node{A};";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal(code, diagnostic.Code);
        Assert.InRange(diagnostic.Span.Offset, source.IndexOf(expression, StringComparison.Ordinal), source.IndexOf(expression, StringComparison.Ordinal) + expression.Length - 1);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Theory]
    [InlineData("min(\\seed)", "TIKZ001", "min(")]
    [InlineData("sqrt(\\seed)", "TIKZ002", "sqrt(")]
    [InlineData("cos(1/\\seed)", "TIKZ004", "/")]
    public void Calls_retain_original_argument_use_and_definition_locations(string expression, string code, string location)
    {
        var source = "% \U0001F600\r\n\\pgfmathsetmacro\\seed{0}\r\n\\pgfmathsetmacro\\value{" + expression + "}";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal(code, diagnostic.Code);
        Assert.Equal(source.LastIndexOf(location, StringComparison.Ordinal), diagnostic.Span.Offset);
        Assert.Contains(diagnostic.RelatedLocations, s => s.Offset == source.IndexOf(@"\seed", StringComparison.Ordinal));
        Assert.Contains(diagnostic.RelatedLocations, s => s.Offset == source.LastIndexOf(@"\seed", StringComparison.Ordinal));
        Assert.All(diagnostic.RelatedLocations, s => Assert.InRange(s.Offset + s.Length, 0, source.Length));
    }

    [Fact]
    public void Function_results_keep_definition_provenance_in_graphics()
    {
        const string source = @"\pgfmathsetmacro\angle{30}\pgfmathsetmacro\dx{cos(\angle)}\node(n)at(\dx,0){A};\draw(0,0)--(\dx,1);";
        GraphicsScene? trace = null;
        Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source, Body, CancellationToken.None, scene => trace = scene));
        var locations = Assert.Single(trace!.Nodes).Source.RelatedLocations().ToArray();
        Assert.Contains(locations, s => s.Offset == source.IndexOf(@"\angle", StringComparison.Ordinal));
        Assert.Contains(locations, s => s.Offset == source.IndexOf(@"\dx", StringComparison.Ordinal));
        Assert.All(trace.Paths, p => Assert.Contains(p.Source.RelatedLocations(), s => s.Offset == source.IndexOf(@"\angle", StringComparison.Ordinal)));
    }

    [Fact]
    public void Nested_calls_and_loop_uses_share_work_expansion_and_depth_limits()
    {
        const string source = @"\pgfmathsetmacro\angle{30}\foreach \i in {1,2,3}{\pgfmathsetmacro\value{max(abs(sin(\angle)),cos(\i*30))}\node at(\value,0){A};}";
        Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, Body, CancellationToken.None));
        foreach (var limits in new[] { TikzLimits.Default with { MaxWork = 150 }, TikzLimits.Default with { MaxExpandedTokens = 8 }, TikzLimits.Default with { MaxLoopIterations = 1 } })
        {
            var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body with { Limits = limits }, CancellationToken.None));
            Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
            Assert.Equal(0, failure.Statistics.OutputBytes);
        }
        const string nested = @"\pgfmathsetmacro\value{cos(abs(sin(30)))}";
        var depth = Assert.IsType<TikzFailure>(TikzConverter.Convert(nested, Body with { Limits = TikzLimits.Default with { MaxExpressionDepth = 2 } }, CancellationToken.None));
        Assert.Equal("TIKZ005", Assert.Single(depth.Diagnostics).Code);
    }

    [Theory]
    [InlineData("cos(0.5)")]
    [InlineData("max(abs(sin(30)),cos(-0.5))")]
    public void Function_arithmetic_observes_cancellation_and_cumulative_work(string expression)
    {
        var source = new Source(expression, 0, expression.Length);
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        PgfScalarArithmetic.Evaluate(source, budget);
        var failure = Assert.Throws<CompileError>(() => PgfScalarArithmetic.Evaluate(source, new Budget(TikzLimits.Default with { MaxWork = budget.Work - 1 }, CancellationToken.None)));
        Assert.Equal("TIKZ005", failure.Diagnostic.Code);
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        Assert.Throws<OperationCanceledException>(() => PgfScalarArithmetic.Evaluate(source, new Budget(TikzLimits.Default, cancellation.Token)));
    }
}

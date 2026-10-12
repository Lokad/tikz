using Lokad.TikZ.Frontend;
using Lokad.TikZ.Semantics;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class ExpressionFunctionOrderTests
{
    [Fact]
    public void Argument_arithmetic_fails_before_provenance_budget_and_arity_checks()
    {
        const string text = "sin(1,1/0)";
        var seed = new Source("seed", 0, 4);
        var origin = new Source(text, 0, 3) { RelatedSources = Enumerable.Repeat(seed, 8).ToArray() };
        var expression = new Function("sin", [
            new Literal(new Number(1, false) { Origin = seed }, new(text, 4, 1)),
            new Binary('/', new Literal(new(1, false), new(text, 6, 1)),
                new Literal(new(0, false), new(text, 8, 1)), new(text, 7, 1))
        ], origin);
        var budget = new Budget(TikzLimits.Default with { MaxWork = 8 }, CancellationToken.None);
        var error = Assert.Throws<CompileError>(() => expression.Evaluate(new Dictionary<string, Number>(), budget));
        Assert.Equal("TIKZ004", error.Diagnostic.Code);
        Assert.Equal(new TikzSourceSpan(7, 1, 1, 8), error.Diagnostic.Span);
    }

    [Fact]
    public void Second_argument_contributes_units_and_definition_provenance()
    {
        var seed = new Source("seed", 0, 4);
        var origin = new Source("max", 0, 3);
        var expression = new Function("max", [new Literal(new(1, false), origin),
            new Literal(new Number(2, true) { Origin = seed }, origin)], origin);
        var result = expression.Evaluate(new Dictionary<string, Number>(), new(TikzLimits.Default, CancellationToken.None));
        Assert.Equal(2, result.Value);
        Assert.True(result.HasUnit);
        Assert.NotNull(result.Origin);
        Assert.Contains(seed.Location, result.Origin.Value.RelatedLocations());
    }
}

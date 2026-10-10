using Lokad.TikZ.Frontend;

namespace Lokad.TikZ.Semantics;

internal sealed partial class Evaluator
{
    private IEnumerable<Coordinate> PlotCoordinates(PlotOperation plot, EvaluationState state)
    {
        if (plot.FunctionPoint is not { } point)
        {
            foreach (var coordinate in plot.Points) { budget.Charge(coordinate.Source); yield return coordinate; }
            yield break;
        }
        state.Plot = state.Plot.AtOrigin(point.Source, budget);
        PgfScalarArithmetic.ValidatePlot(point.X!, state.Variables, state.Plot.Variable.Value, budget);
        PgfScalarArithmetic.ValidatePlot(point.Y!, state.Variables, state.Plot.Variable.Value, budget);
        budget.Charge(point.Source, state.NumericBindings.Count + 1);
        var bindings = new Dictionary<string, Source>(state.NumericBindings, StringComparer.Ordinal);
        foreach (var sample in PlotSamples.Read(state.Plot, state, point.Source, budget))
        {
            // TikZ expands a sample control sequence as text before parsing
            // arithmetic: with a negative sample, \x^2 becomes -2^2, whereas
            // (\x)^2 groups the negative operand. Reuse the bounded source map.
            bindings[state.Plot.Variable.Value] = sample with { RelatedSources = [.. sample.RelatedSources ?? [], state.Plot.Variable] };
            var expanded = SourceExpansion.Bind(point.Source, bindings, budget, removeComments: true);
            var reader = new Cursor(expanded, budget);
            var bound = CoordinateReader.Read(reader, budget);
            reader.Complete();
            var x = PgfScalarArithmetic.EvaluatePlot(bound.X!, state.Variables, budget);
            var y = PgfScalarArithmetic.EvaluatePlot(bound.Y!, state.Variables, budget);
            var source = y.Relate(x.Relate(bound.Source, budget), budget);
            yield return bound with { X = new Literal(x, bound.X!.Source), Y = new Literal(y, bound.Y!.Source), Source = source };
        }
    }
}

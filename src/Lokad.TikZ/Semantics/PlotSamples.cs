using Lokad.TikZ.Frontend;

namespace Lokad.TikZ.Semantics;

// Plot ranges use finite decimal registers without widening the separately
// declared integer-only foreach grammar.
internal static class PlotSamples
{
    internal static IEnumerable<Source> Read(PlotSettings settings, EvaluationState state, Source origin, Budget budget)
    {
        var list = SourceExpansion.Bind(settings.Values, state.NumericBindings, budget, removeComments: true);
        var values = Options.Split(list, ',', budget);
        if (values.Count == 1 && values[0].Length == 0) yield break;
        var dots = values.FindIndex(s => s.Value == "...");
        if (dots < 0)
        {
            foreach (var value in values) { Literal(value, budget); budget.Iteration(origin); yield return value; }
            yield break;
        }
        if (values.Count is not (3 or 4) || dots != values.Count - 2)
            throw new CompileError("TIKZ002", "Plot sample ranges require start,...,end or start,next,...,end.", values[dots]);
        var first = Literal(values[0], budget);
        var last = Literal(values[^1], budget);
        var second = dots == 2 ? Literal(values[1], budget) : first;
        var step = dots == 2 ? second - first : last > first ? 65536 : -65536;
        if (step == 0) throw new CompileError("TIKZ002", "Plot sample range step must be nonzero.", values[dots]);
        budget.Iteration(origin); yield return values[0];
        if (dots == 2) { budget.Iteration(origin); yield return values[1]; }
        var current = dots == 2 ? second : first;
        while (true)
        {
            budget.Charge(values[dots]);
            current += step;
            // Native overflow occurs before the endpoint comparison.
            var printed = PgfScalarArithmetic.PlotPrint(current, values[dots], budget);
            if (step > 0 ? current > last : current < last) break;
            budget.Iteration(origin);
            yield return SourceExpansion.Generated(printed, origin, [values[0], values[^1], .. dots == 2 ? new[] { values[1] } : []], budget);
        }
    }

    private static long Literal(Source source, Budget budget)
    {
        var span = source.Span;
        if (span.Length == 0) throw new CompileError("TIKZ002", "Empty plot sample values are unsupported; an empty list is allowed.", source);
        if (span[0] is '+' or '-') span = span[1..];
        if (span.Length == 0 || span.ContainsAnyExcept("0123456789.") || span.Count('.') > 1 || !span.ContainsAny("0123456789"))
            throw new CompileError("TIKZ002", "Plot samples at requires ordinary decimal literals or decimal ranges.", source);
        return PgfScalarArithmetic.PlotRegister(source, budget);
    }
}

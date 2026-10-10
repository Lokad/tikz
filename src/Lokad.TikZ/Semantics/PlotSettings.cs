using System.Globalization;
using Lokad.TikZ.Frontend;

namespace Lokad.TikZ.Semantics;

internal sealed record PlotSettings(Source Start, Source End, Source Samples, Source Values, Source Variable)
{
    internal static PlotSettings Default { get; } = new(
        Text("-5"), Text("5"), Text("25"),
        Text("-5,-4.5833333,...,5"), Text("\\x"));

    private static Source Text(string text) => new(text, 0, text.Length);

    internal PlotSettings AtOrigin(Source origin, Budget budget)
    {
        Source Map(Source source, Source initial) => source == initial
            ? SourceExpansion.Generated(source.Value, origin, [], budget) : source;
        return this with { Start = Map(Start, Default.Start), End = Map(End, Default.End),
            Samples = Map(Samples, Default.Samples), Values = Map(Values, Default.Values), Variable = Map(Variable, Default.Variable) };
    }

    internal PlotSettings Domain(Source source, EvaluationState state, Budget budget)
    {
        var parts = Options.Split(source, ':', budget);
        if (parts.Count != 2) throw new CompileError("TIKZ001", "Plot domain requires start:end.", source);
        return (AtOrigin(source, budget) with { Start = Scalar(parts[0], state, budget), End = Scalar(parts[1], state, budget) }).Recalculate(source, state, budget);
    }

    internal PlotSettings Count(Source source, EvaluationState state, Budget budget)
    {
        var value = Scalar(source, state, budget);
        if (PgfScalarArithmetic.PlotRegister(value, budget) < 2 * 65536)
            value = SourceExpansion.Generated("2", source, [value], budget);
        return (AtOrigin(source, budget) with { Samples = value }).Recalculate(source, state, budget);
    }

    internal PlotSettings SetVariable(Source source, Budget budget)
    {
        var reader = new Cursor(source, budget);
        if (reader.Peek != '\\') throw new CompileError("TIKZ002", "Plot variable requires an ASCII-letter control sequence.", source);
        var variable = reader.Command();
        reader.Complete();
        if (variable.Length < 2 || variable.Span[1..].ContainsAnyExcept("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"))
            throw new CompileError("TIKZ002", "Plot variable requires an ASCII-letter control sequence.", source);
        return this with { Variable = variable };
    }

    private PlotSettings Recalculate(Source source, EvaluationState state, Budget budget)
    {
        var expression = SourceExpansion.Generated("((" + End.Value + ")-(" + Start.Value + "))/((" + Samples.Value + ")-1)", source, [Start, End, Samples], budget);
        var step = Scalar(expression, state, budget);
        var register = PgfScalarArithmetic.PlotRegister(step, budget);
        // TeX reads 0.0001pt as seven scaled points.
        var text = Start.Value + "," + End.Value;
        if (Math.Abs(register) >= 7)
        {
            var nextExpression = SourceExpansion.Generated("(" + Start.Value + ")+(" + step.Value + ")", source, [Start, step], budget);
            var next = Scalar(nextExpression, state, budget);
            text = Start.Value + "," + next.Value + ",...," + End.Value;
        }
        return this with { Values = SourceExpansion.Generated(text, source, [Start, End, Samples, step], budget) };
    }

    private static Source Scalar(Source source, EvaluationState state, Budget budget)
    {
        var expanded = SourceExpansion.Bind(source, state.NumericBindings, budget, removeComments: true);
        var value = PgfScalarArithmetic.EvaluatePlot(Expression.Parse(expanded, budget), state.Variables, budget);
        var origin = value.Relate(source, budget);
        if (value.HasUnit) throw new CompileError("TIKZ002", "Plot domain and samples require dimensionless expressions.", origin);
        return SourceExpansion.Generated(value.Value.ToString("0.#################", CultureInfo.InvariantCulture), source, [origin], budget);
    }
}

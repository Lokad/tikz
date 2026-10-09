using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Frontend;

internal static class CoordinateReader
{
    internal static Coordinate Read(Cursor reader, Budget budget, int depth = 0)
    {
        reader.Skip();
        var origin = reader.Here;
        budget.Depth(origin, depth, budget.Limits.MaxExpressionDepth);
        var relative = reader.Take("++") ? 2 : reader.Take("+") ? 1 : 0;
        var group = reader.Group('(', ')');
        origin = origin with { Length = reader.Source.Offset + reader.Position - origin.Offset };
        var calculationReader = new Cursor(group, budget);
        if (calculationReader.Take("$"))
            return new(null, null, "", false, relative, origin)
            {
                Calculation = new CalculationReader(calculationReader, budget, depth + 1).Read()
            };
        if (Options.Clean(group).Contains(" cs:", StringComparison.Ordinal))
            throw new CompileError("TIKZ002", "Explicit coordinate systems are outside the supported coordinate profile.", group);
        var cartesian = Options.Split(group, ',', budget);
        if (cartesian.Count == 2)
            return new(Expression.Parse(cartesian[0], budget), Expression.Parse(cartesian[1], budget), "", false, relative, origin);
        if (cartesian.Count != 1) throw new CompileError("TIKZ001", "Expected a two-dimensional coordinate.", group);
        var polar = Options.Split(group, ':', budget);
        if (polar.Count == 2)
            return new(Expression.Parse(polar[0], budget), Expression.Parse(polar[1], budget), "", true, relative, origin);
        if (polar.Count != 1) throw new CompileError("TIKZ001", "Invalid polar coordinate.", group);
        return new(null, null, Options.Clean(group), false, relative, origin);
    }
}

internal sealed class CalculationReader(Cursor reader, Budget budget, int depth)
{
    private int _operations;

    internal CoordinateCalculation Read()
    {
        var terms = new List<CalculationTerm>();
        while (true)
        {
            reader.Skip();
            var start = reader.Position;
            var origin = reader.Here;
            Step(origin);
            var sign = reader.Take("-") ? -1 : reader.Take("+") ? 1
                : terms.Count == 0 ? 1 : throw new CompileError("TIKZ001", "Expected '+' or '-' between calc terms.", origin);
            Expression? factor = null;
            if (reader.Peek != '(')
            {
                factor = Expression.Parse(Factor(), budget);
            }
            var point = CoordinateReader.Read(reader, budget, depth);
            var modifiers = new List<CalculationModifier>();
            while (reader.Take("!"))
            {
                var modifierOrigin = reader.Here;
                Step(modifierOrigin);
                Coordinate? projected = null;
                Expression? amount = null;
                if (reader.Peek == '(') projected = CoordinateReader.Read(reader, budget, depth);
                else amount = Expression.Parse(Until('!'), budget);
                reader.Require("!");
                Expression? angle = null;
                if (reader.Peek != '(')
                {
                    angle = Expression.Parse(Until(':'), budget);
                    reader.Require(":");
                }
                var target = CoordinateReader.Read(reader, budget, depth);
                var span = modifierOrigin with { Length = reader.Source.Offset + reader.Position - modifierOrigin.Offset };
                modifiers.Add(projected is null ? new InterpolationModifier(amount!, target, angle, span)
                    : new ProjectionModifier(projected, target, angle, span));
            }
            terms.Add(new(sign, factor, point, modifiers, reader.Source.Slice(start, reader.Position - start)));
            if (reader.Take("$")) break;
            if (reader.End) throw new CompileError("TIKZ001", "Expected closing '$' in calc coordinate.", reader.Here);
        }
        reader.Complete();
        return new(terms, reader.Source);
    }

    private void Step(Source origin) => budget.Depth(origin, depth + ++_operations, budget.Limits.MaxExpressionDepth);

    private Source Factor()
    {
        reader.Skip();
        var start = reader.Position;
        while (!reader.End)
        {
            if (reader.Peek == '*')
            {
                var separator = reader.Position;
                reader.Advance();
                reader.Skip();
                if (reader.Peek == '(') return reader.Source.Slice(start, separator - start).Trim();
                continue;
            }
            if (reader.Peek is '$' or '!') break;
            AdvanceBalanced();
        }
        throw new CompileError("TIKZ001", "A calc factor must be followed by '*(' and a coordinate.", reader.Source.Slice(start, reader.Position - start));
    }

    private Source Until(char delimiter)
    {
        reader.Skip();
        var start = reader.Position;
        while (!reader.End && reader.Peek != delimiter)
        {
            if (reader.Peek == '$') break;
            AdvanceBalanced();
        }
        if (reader.Peek != delimiter)
            throw new CompileError("TIKZ001", $"Expected '{delimiter}' in calc modifier.", reader.Here);
        return reader.Source.Slice(start, reader.Position - start).Trim();
    }

    private void AdvanceBalanced()
    {
        if (reader.Peek == '{') reader.Group('{', '}');
        else if (reader.Peek == '(') reader.Group('(', ')');
        else reader.Advance();
    }
}

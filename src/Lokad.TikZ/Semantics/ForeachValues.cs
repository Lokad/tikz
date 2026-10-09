using System.Globalization;
using Lokad.TikZ.Frontend;

namespace Lokad.TikZ.Semantics;

internal static class ForeachValues
{
    private static readonly IReadOnlyDictionary<string, Source> Empty = new Dictionary<string, Source>();

    internal static IEnumerable<Source> Read(Source list, IReadOnlyDictionary<string, Source>? bindings, Budget budget)
    {
        list = SourceExpansion.Bind(list, bindings ?? Empty, budget, removeComments: true);
        for (var i = 0; i < list.Length; i++)
        {
            budget.Charge(list.Slice(i, 1));
            if (!char.IsAscii(list.Span[i]))
                throw new CompileError("TIKZ002", "Foreach literal lists require ASCII characters.", list.Slice(i, 1));
        }
        var values = Options.Split(list, ',', budget);
        if (values.Count == 1 && values[0].Length == 0) yield break;
        var dots = values.FindIndex(s => s.Value == "...");
        if (dots >= 0)
        {
            if (values.Count is not (3 or 4) || dots != values.Count - 2)
                throw new CompileError("TIKZ002", "Foreach ranges require {start,...,end} or {start,next,...,end}.", values[dots]);
            var first = Integer(values[0], budget);
            var last = Integer(values[^1], budget);
            var second = dots == 2 ? Integer(values[1], budget) : first;
            var step = dots == 2 ? second - first : last > first ? 1 : -1;
            if (step == 0 || Math.Abs(step) > 16383)
                throw new CompileError("TIKZ002", "Foreach integer range steps must be nonzero and at most 16383 in magnitude.", values[dots]);
            yield return values[0];
            if (dots == 2) { budget.Charge(values[1]); yield return values[1]; }
            var current = dots == 2 ? second : first;
            while (true)
            {
                budget.Charge(values[dots]);
                current += step;
                // PGF performs this advance before its endpoint comparison.
                // A crossed endpoint cannot conceal native dimension overflow.
                if (Math.Abs(current) > 16383)
                    throw new CompileError("TIKZ004", "Foreach range continuation exceeds native integer dimension precision.", values[dots]);
                if (step > 0 ? current > last : current < last) break;
                yield return SourceExpansion.Integer(current, values[dots], [values[0], values[^1], .. dots == 2 ? new[] { values[1] } : []], budget);
            }
            yield break;
        }
        foreach (var item in values)
        {
            var value = Options.Ungroup(item, budget);
            if (value.Length == 0) throw new CompileError("TIKZ002", "Empty foreach values are unsupported; an empty list is allowed.", item);
            foreach (var ch in value.Span)
            {
                budget.Charge(value);
                if (!char.IsAsciiLetterOrDigit(ch) && ch is not (' ' or '\t' or '\r' or '\n' or '+' or '-' or '.'))
                    throw new CompileError("TIKZ002", "Foreach values require literal letters, digits, spaces, signs or decimal points.", value);
            }
            if (value.Span.Contains("...", StringComparison.Ordinal))
                throw new CompileError("TIKZ002", "Contextual foreach ellipses are unsupported.", value);
            yield return value;
        }
    }

    private static int Integer(Source source, Budget budget)
    {
        budget.Charge(source, source.Length);
        if (!int.TryParse(source.Span, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var value) || Math.Abs((long)value) > 16383)
            throw new CompileError("TIKZ002", "Foreach range endpoints require signed integers between -16383 and 16383.", source);
        return value;
    }
}

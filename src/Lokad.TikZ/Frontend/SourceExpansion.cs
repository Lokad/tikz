using System.Text;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Frontend;

internal sealed record SourcePiece(int Start, int Length, Source Origin, bool Exact);

// Generated text is only a parser input. Diagnostics and graphics retain spans
// in the original body/list through this bounded piece map.
internal sealed class SourceMapping(Source fallback, SourcePiece[] pieces)
{
    private int Find(int offset)
    {
        var lo = 0;
        var hi = pieces.Length - 1;
        while (lo < hi)
        {
            var mid = (lo + hi + 1) / 2;
            if (pieces[mid].Start <= offset) lo = mid; else hi = mid - 1;
        }
        return lo;
    }
    public Source Origin(int offset, int length)
    {
        if (pieces.Length == 0) return fallback.Slice(fallback.Length, 0);
        var piece = pieces[Find(offset)];
        if (!piece.Exact) return piece.Origin;
        var start = Math.Clamp(offset - piece.Start, 0, piece.Length);
        return piece.Origin.Slice(start, Math.Min(length, piece.Length - start));
    }
    public IEnumerable<Source> Origins(int offset, int length)
    {
        if (pieces.Length == 0) { yield return fallback; yield break; }
        var first = Find(offset);
        for (var i = first; i < pieces.Length && (i == first || pieces[i].Start < offset + length); i++)
            yield return pieces[i].Origin;
    }
}

internal static class SourceExpansion
{
    internal static Source Bind(Source source, IReadOnlyDictionary<string, Source> bindings, Budget budget, bool removeComments = false)
    {
        var text = new StringBuilder();
        var pieces = new List<SourcePiece>();
        var start = 0;
        var position = 0;
        void Append(Source value, Source origin, bool exact)
        {
            if (value.Length == 0) return;
            // Charge before allocating or copying. UTF-16 units conservatively
            // bound expanded tokens, including unchanged template text.
            budget.Expand(origin, value.Length);
            pieces.Add(new(text.Length, value.Length, origin, exact));
            text.Append(value.Span);
        }
        while (position < source.Length)
        {
            budget.Charge(source.Slice(position, 1));
            var ch = source.Span[position];
            if (ch == '%')
            {
                if (removeComments) Append(source.Slice(start, position - start), source.Slice(start, position - start), true);
                while (position < source.Length && source.Span[position] != '\n') { budget.Charge(source); position++; }
                if (removeComments) { if (position < source.Length) position++; start = position; }
                continue;
            }
            if (ch != '\\') { position++; continue; }
            var commandStart = position++;
            if (position == source.Length) break;
            if (!char.IsAsciiLetter(source.Span[position])) { position++; continue; }
            while (position < source.Length && char.IsAsciiLetter(source.Span[position])) { budget.Charge(source); position++; }
            var use = source.Slice(commandStart, position - commandStart);
            if (!bindings.TryGetValue(use.Value, out var value)) continue;
            Append(source.Slice(start, commandStart - start), source.Slice(start, commandStart - start), true);
            budget.Charge(use, (value.RelatedSources?.Length ?? 0) + 1);
            var origin = value with { RelatedSources = [.. value.RelatedSources ?? [], use] };
            Append(value, origin, true);
            // The delimiter blanks following a TeX control word are not tokens.
            while (position < source.Length)
            {
                if (source.Span[position] is ' ' or '\t' or '\r' or '\n') { budget.Charge(use); position++; continue; }
                if (source.Span[position] != '%') break;
                while (position < source.Length && source.Span[position] != '\n') { budget.Charge(use); position++; }
            }
            start = position;
        }
        Append(source.Slice(start, source.Length - start), source.Slice(start, source.Length - start), true);
        budget.Charge(source, text.Length);
        return new(text.ToString(), 0, text.Length) { Mapping = new(source, pieces.ToArray()), RelatedSources = source.RelatedSources };
    }

    internal static Source Integer(int value, Source marker, Source[] related, Budget budget)
    {
        var text = value.ToString(System.Globalization.CultureInfo.InvariantCulture);
        budget.Expand(marker, text.Length);
        return new(text, 0, text.Length) { Mapping = new(marker, [new(0, text.Length, marker, false)]), RelatedSources = related };
    }
}

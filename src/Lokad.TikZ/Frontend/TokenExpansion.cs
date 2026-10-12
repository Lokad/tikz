using System.Text;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Frontend;

// Expand one statement/value at its point of use. The original program and
// definition bodies remain source slices; styles retain their lazy contents.
internal sealed class TokenExpansion(EvaluationState state, Budget budget)
{
    internal Source Expand(Source source, bool protectOptions = false, bool protectGroups = false)
    {
        if (SourceExpansion.Literal(source, budget)) return source;
        var text = new StringBuilder();
        var pieces = new List<SourcePiece>();
        var active = new HashSet<(string Name, int Offset)>();
        var braces = 0;
        var brackets = 0;
        var endsWord = false;
        void Append(Source value, bool controlWord = false)
        {
            if (value.Length == 0) return;
            if (endsWord && char.IsLetter(value.Span[0]))
            {
                budget.Expand(value, 1);
                pieces.Add(new(text.Length, 1, value, false));
                text.Append(' ');
            }
            budget.Expand(value, value.Length);
            pieces.Add(new(text.Length, value.Length, value, true));
            text.Append(value.Span);
            endsWord = controlWord;
        }
        void Visit(Source value, int depth)
        {
            var position = 0;
            var start = 0;
            void Flush(int end) { Append(value.Slice(start, end - start)); start = end; }
            while (position < value.Length)
            {
                budget.Charge(value.Slice(position, 1));
                var ch = value.Span[position];
                if (ch == '%')
                {
                    while (position < value.Length && value.Span[position] != '\n') { budget.Charge(value); position++; }
                    continue;
                }
                if (ch != '\\')
                {
                    if (ch == '{') braces++;
                    if (ch == '}') braces--;
                    if (protectOptions && braces == 0)
                    {
                        if (ch == '[') brackets++;
                        if (ch == ']') brackets--;
                    }
                    position++;
                    continue;
                }
                var begin = position++;
                if (position == value.Length) break;
                if (!char.IsLetter(value.Span[position])) { position++; continue; }
                while (position < value.Length && char.IsLetter(value.Span[position])) { budget.Charge(value); position++; }
                var use = value.Slice(begin, position - begin);
                Flush(begin);
                var name = use.Value;
                Source replacement = default;
                DefinitionStatement? definition = null;
                var found = !(protectGroups && braces > 0 || protectOptions && brackets > 0);
                if (found)
                {
                    if (state.TemplateBindings?.TryGetValue(name, out replacement) == true) { }
                    else if (state.Definitions.TryGetValue(name, out definition)) replacement = definition.Body;
                    else if (!state.NumericBindings.TryGetValue(name, out replacement)) found = false;
                }
                if (!found) { Append(use, true); start = position; continue; }
                budget.Depth(use, depth + 1, budget.Limits.MaxExpansionDepth);
                var identity = definition is null ? (name, -1) : Identity(definition, budget);
                if (!active.Add(identity)) throw new CompileError("TIKZ003", $"Recursive token definition '{name}'.", use);
                try
                {
                    budget.Charge(use, (replacement.RelatedSources?.Length ?? 0) + 2);
                    replacement = replacement with { RelatedSources = [.. replacement.RelatedSources ?? [], use, definition?.Variable ?? use] };
                    Visit(replacement, depth + 1);
                }
                finally { active.Remove(identity); }
                // Delimiter blanks after a control word are not TeX tokens.
                while (position < value.Length)
                {
                    if (value.Span[position] is ' ' or '\t' or '\r' or '\n') { budget.Charge(use); position++; continue; }
                    if (value.Span[position] != '%') break;
                    while (position < value.Length && value.Span[position] != '\n') { budget.Charge(use); position++; }
                }
                start = position;
            }
            Flush(value.Length);
        }
        Visit(source, 0);
        budget.Charge(source, text.Length + pieces.Count);
        return new(text.ToString(), 0, text.Length) { Mapping = new(source, pieces.ToArray()), RelatedSources = source.RelatedSources };
    }

    internal static (string Name, int Offset) Identity(DefinitionStatement definition, Budget budget)
    {
        var origin = definition.Variable;
        while (origin.Mapping is not null) { budget.Charge(origin); origin = origin.Mapping.Origin(origin.Offset, origin.Length); }
        return (definition.Variable.Value, origin.Offset);
    }
}

using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Frontend;

internal sealed record Option(string Key, Source Value, Source Source);

internal static class Options
{
    public static List<Source> Split(Source source, char delimiter, Budget budget)
    {
        var parts = new List<Source>();
        var start = 0;
        var stack = new Stack<char>();
        var inComment = false;
        for (var i = 0; i < source.Length; i++)
        {
            budget.Charge(source);
            var ch = source.Span[i];
            if (inComment) { if (ch == '\n') inComment = false; continue; }
            if (ch == '%') { inComment = true; continue; }
            if (ch == '\\') { i++; continue; }
            if (stack.Count == 0 && ch == delimiter) { parts.Add(source.Slice(start, i - start).Trim()); start = i + 1; continue; }
            if (stack.Count > 0 && stack.Peek() == '{')
            {
                if (ch == '{') stack.Push(ch);
                if (ch == '}') stack.Pop();
                budget.Depth(source, stack.Count, budget.Limits.MaxNesting);
                continue;
            }
            if (ch is '{' or '[' or '(') stack.Push(ch);
            else if (ch is '}' or ']' or ')')
            {
                if (stack.Count == 0 || (ch, stack.Pop()) is not (('}', '{') or (']', '[') or (')', '(')))
                    throw new CompileError("TIKZ001", "Unbalanced value.", source.Slice(i, 1));
            }
            budget.Depth(source, stack.Count, budget.Limits.MaxNesting);
        }
        if (stack.Count != 0) throw new CompileError("TIKZ001", "Unbalanced value.", source);
        parts.Add(source.Slice(start, source.Length - start).Trim());
        return parts;
    }
    public static List<Option> Read(Source source, Budget budget)
    {
        var options = new List<Option>();
        foreach (var part in Split(source, ',', budget))
        {
            if (part.Length == 0) continue;
            var pair = Split(part, '=', budget);
            if (pair.Count > 2) throw new CompileError("TIKZ001", "A value containing '=' must be grouped.", part);
            var key = Clean(pair[0]);
            var value = pair.Count == 2 ? pair[1] : part.Slice(part.Length, 0);
            options.Add(new(key, Ungroup(value, budget), part));
        }
        return options;
    }
    public static Source Ungroup(Source source, Budget budget)
    {
        source = source.Trim();
        if (source.Length == 0 || source.Span[0] != '{') return source;
        var reader = new Cursor(source, budget);
        var group = reader.Group('{', '}');
        // A leading group may be one part of a positioning value, such as
        // '{distance} of target'. Strip braces only around the entire value.
        return reader.End ? group : source;
    }
    public static string Clean(Source source)
    {
        var text = new System.Text.StringBuilder();
        var comment = false;
        foreach (var ch in source.Span)
        {
            if (comment) { if (ch == '\n') comment = false; continue; }
            if (ch == '%') { comment = true; continue; }
            text.Append(ch);
        }
        return string.Join(' ', text.ToString().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }
}

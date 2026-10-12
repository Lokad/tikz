using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Frontend;

internal sealed record Option(string Key, Source Value, Source Source);

internal static class Options
{
    public static List<Source> Split(Source source, char delimiter, Budget budget)
    {
        var parts = new List<Source>();
        Scan(source, delimiter, budget, parts, out _);
        return parts;
    }
    private static int Scan(Source source, char delimiter, Budget budget, List<Source>? parts, out int delimiters)
    {
        var start = 0;
        var first = -1;
        delimiters = 0;
        Stack<char>? stack = null;
        var inComment = false;
        for (var i = 0; i < source.Length; i++)
        {
            budget.Charge(source);
            var ch = source.Span[i];
            if (inComment) { if (ch == '\n') inComment = false; continue; }
            if (ch == '%') { inComment = true; continue; }
            if (ch == '\\') { i++; continue; }
            if ((stack?.Count ?? 0) == 0 && ch == delimiter)
            {
                parts?.Add(source.Slice(start, i - start).Trim()); start = i + 1;
                if (first < 0) first = i;
                delimiters++;
                continue;
            }
            if (stack is { Count: > 0 } && stack.Peek() == '{')
            {
                if (ch == '{') stack.Push(ch);
                if (ch == '}') stack.Pop();
                budget.Depth(source, stack.Count, budget.Limits.MaxNesting);
                continue;
            }
            if (ch is '{' or '[' or '(') (stack ??= new()).Push(ch);
            else if (ch is '}' or ']' or ')')
            {
                if (stack is not { Count: > 0 } || (ch, stack.Pop()) is not (('}', '{') or (']', '[') or (')', '(')))
                    throw new CompileError("TIKZ001", "Unbalanced value.", source.Slice(i, 1));
            }
            budget.Depth(source, stack?.Count ?? 0, budget.Limits.MaxNesting);
        }
        if (stack is { Count: > 0 }) throw new CompileError("TIKZ001", "Unbalanced value.", source);
        parts?.Add(source.Slice(start, source.Length - start).Trim());
        return first;
    }
    public static List<Option> Read(Source source, Budget budget)
    {
        var options = new List<Option>();
        foreach (var part in Split(source, ',', budget))
        {
            if (part.Length == 0) continue;
            var separator = Scan(part, '=', budget, null, out var delimiters);
            if (delimiters > 1) throw new CompileError("TIKZ001", "A value containing '=' must be grouped.", part);
            var key = Clean(separator < 0 ? part : part.Slice(0, separator).Trim());
            var value = separator < 0 ? part.Slice(part.Length, 0) : part.Slice(separator + 1, part.Length - separator - 1).Trim();
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
        source = source.Trim();
        if (source.Length == 0) return string.Empty;
        var span = source.Span;
        var normalized = true;
        for (var i = 0; i < span.Length; i++)
            if (span[i] == '%' || char.IsWhiteSpace(span[i]) && (span[i] != ' ' || i > 0 && span[i - 1] == ' '))
            { normalized = false; break; }
        if (normalized) return source.Value;
        var text = new System.Text.StringBuilder();
        var comment = false;
        var space = false;
        foreach (var ch in span)
        {
            if (comment) { if (ch == '\n') comment = false; continue; }
            if (ch == '%') { comment = true; continue; }
            if (char.IsWhiteSpace(ch)) { space = text.Length > 0; continue; }
            if (space) { text.Append(' '); space = false; }
            text.Append(ch);
        }
        return text.ToString();
    }
}

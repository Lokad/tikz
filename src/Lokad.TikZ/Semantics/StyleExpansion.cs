using Lokad.TikZ.Frontend;

namespace Lokad.TikZ.Semantics;

internal static class StyleExpansion
{
    public static List<Option> Read(Source definition, Budget budget)
    {
        var options = Options.Read(definition, budget);
        foreach (var option in options)
        {
            var parameter = Parameter(option.Source, budget);
            if (parameter is { } marker && (marker.Offset < option.Value.Offset || Options.Clean(option.Value) != "#1"))
                throw new CompileError("TIKZ002", "Style parameters support only #1 as an entire option value.", marker);
        }
        return options;
    }

    public static IEnumerable<Option> Instantiate(List<Option> style, Option invocation, Budget budget)
    {
        foreach (var option in style)
        {
            var value = option.Value;
            if (Options.Clean(value) == "#1")
            {
                if (Options.Clean(invocation.Value).Length == 0)
                    throw new CompileError("TIKZ002", "A parameterized style requires a nonempty explicit argument.", Related(invocation.Source, value, budget));
                value = Related(invocation.Value, value, budget);
            }
            else value = Related(value, invocation.Source, budget);
            var source = Related(option.Source, invocation.Source, budget);
            budget.Expand(invocation.Source, option.Key.Length + value.Length + 1);
            yield return option with { Value = value, Source = source };
        }
    }

    private static Source? Parameter(Source source, Budget budget)
    {
        var comment = false;
        for (var i = 0; i < source.Length; i++)
        {
            budget.Charge(source);
            var ch = source.Span[i];
            if (comment) { if (ch == '\n') comment = false; continue; }
            if (ch == '%') { comment = true; continue; }
            if (ch == '\\') { i++; continue; }
            if (ch == '#') return source.Slice(i, Math.Min(2, source.Length - i));
        }
        return null;
    }

    private static Source Related(Source source, Source context, Budget budget)
    {
        // Retain offsets until an actual diagnostic needs line/column locations.
        // Flatten and charge provenance so nested forwarding cannot grow a graph.
        var related = new List<Source>();
        foreach (var item in source.RelatedSources ?? []) Add(item);
        foreach (var item in context.RelatedSources ?? []) Add(item);
        Add(context);
        return source with { RelatedSources = related.ToArray() };

        void Add(Source item)
        {
            budget.Charge(source, related.Count + 1);
            if (Same(item, source)) return;
            foreach (var existing in related)
                if (Same(existing, item)) return;
            related.Add(item with { RelatedSources = null });
        }
    }

    private static bool Same(Source a, Source b)
        => ReferenceEquals(a.Text, b.Text) && a.Offset == b.Offset && a.Length == b.Length;
}

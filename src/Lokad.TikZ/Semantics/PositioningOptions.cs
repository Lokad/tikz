using Lokad.TikZ.Frontend;
using Lokad.TikZ.Nodes;

namespace Lokad.TikZ.Semantics;

internal static class PositioningOptions
{
    internal static void Apply(Option option, EvaluationState state, Budget budget)
    {
        var (x, y, anchor, target) = option.Key switch
        {
            "right" => (1, 0, "west", "east"), "left" => (-1, 0, "east", "west"),
            "above" => (0, 1, "south", "north"), "below" => (0, -1, "north", "south"),
            "above left" => (-1, 1, "south east", "north west"), "above right" => (1, 1, "south west", "north east"),
            "below left" => (-1, -1, "north east", "south west"), "below right" => (1, -1, "north west", "south east"),
            _ => throw new InvalidOperationException("Unknown positioning direction.")
        };
        state.Node = state.Node with { Anchor = anchor, AnchorSource = option.Source };
        if (Options.Clean(option.Value).Length == 0) return;
        var separator = Word(option.Value, "of", budget);
        if (separator < 0 || state.Node.Positioning is not null)
            throw new CompileError("TIKZ002", "Positioning requires one bounded 'distance of name' placement per node.", option.Source);
        var name = option.Value.Slice(separator + 2, option.Value.Length - separator - 2).Trim();
        var distance = option.Value.Slice(0, separator).Trim();
        var targetText = Options.Clean(name);
        if (targetText.Length == 0 || targetText.AsSpan().IndexOfAny("(){}") >= 0)
            throw new CompileError("TIKZ002", "Positioning requires a named node, anchor or coordinate.", name);
        state.Node = state.Node with { Positioning = new(name, distance.Length == 0 ? state.NodeDistance : distance, x, y, target) };
    }

    internal static int Word(Source source, string word, Budget budget)
    {
        var depth = 0;
        var comment = false;
        for (var i = 0; i < source.Length; i++)
        {
            budget.Charge(source.Slice(i, 1));
            var ch = source.Span[i];
            if (comment) { if (ch == '\n') comment = false; continue; }
            if (ch == '%') { comment = true; continue; }
            if (ch is '(' or '{' or '[') { depth++; budget.Depth(source, depth, budget.Limits.MaxNesting); }
            if (ch is ')' or '}' or ']') depth--;
            if (depth == 0 && source.Span[i..].StartsWith(word, StringComparison.Ordinal)
                && (i == 0 || char.IsWhiteSpace(source.Span[i - 1]))
                && (i + word.Length == source.Length || char.IsWhiteSpace(source.Span[i + word.Length]))) return i;
        }
        return -1;
    }
}

using Lokad.TikZ.Frontend;
using Lokad.TikZ.Nodes;

namespace Lokad.TikZ.Semantics;

internal enum ArrowTipKind { Default, To, LegacyTo, ComputerModern, Stealth, Latex }
internal sealed record ArrowSpec(ArrowTipKind Kind, Source Source,
    long? LengthSp = null, long? WidthSp = null, long? InsetSp = null);
internal sealed record ArrowSettings
{
    public ArrowSpec? Start { get; init; }
    public ArrowSpec? End { get; init; }
    public ArrowSpec? DefaultTip { get; init; }
    public long ShortenStartSp { get; init; }
    public long ShortenEndSp { get; init; }
    public bool Active => Start is not null || End is not null || ShortenStartSp != 0 || ShortenEndSp != 0;
}

// Only the explicitly supported arrow grammar is accepted. Tip dimensions are
// physical and their defaults are resolved against the final shaft pen width.
internal static class ArrowOptions
{
    public static bool Apply(Option option, EvaluationState state, Budget budget)
    {
        var key = option.Key;
        if (key is "shorten >" or "shorten <")
        {
            var distance = Dimension(option.Value, state, budget);
            state.Arrows = key == "shorten >" ? state.Arrows with { ShortenEndSp = distance }
                : state.Arrows with { ShortenStartSp = distance };
            return true;
        }
        if (key == ">")
        {
            state.Arrows = state.Arrows with { DefaultTip = Tip(option.Value, state, budget) };
            return true;
        }
        if (key != "arrows" && (!key.Contains('-') || !(key.StartsWith('-') || key.StartsWith('<') || key.StartsWith('{')
            || key.StartsWith("Stealth", StringComparison.Ordinal) || key.StartsWith("Latex", StringComparison.Ordinal)
            || key.StartsWith("To", StringComparison.Ordinal) || key.StartsWith("to", StringComparison.Ordinal)
            || key.StartsWith("Computer Modern Rightarrow", StringComparison.Ordinal)))) return false;
        var source = key == "arrows" ? option.Value : option.Source;
        if (key != "arrows")
        {
            source = source.Trim();
            if (source.Span.StartsWith("/tikz/")) source = source.Slice(6, source.Length - 6);
            if (source.Span.StartsWith("/pgf/")) source = source.Slice(5, source.Length - 5);
        }
        if (key != "arrows" && option.Value.Length != 0) return false;
        var sides = Options.Split(source, '-', budget);
        if (sides.Count != 2) throw Unsupported(source, "Exactly one tip per side is supported.");
        state.Arrows = state.Arrows with { Start = Tip(sides[0], state, budget), End = Tip(sides[1], state, budget) };
        return true;
    }

    private static ArrowSpec? Tip(Source source, EvaluationState state, Budget budget)
    {
        source = Options.Ungroup(source, budget).Trim();
        if (source.Length == 0) return null;
        var bracket = source.Span.IndexOf('[');
        var nameSource = bracket < 0 ? source : source.Slice(0, bracket).Trim();
        var name = Options.Clean(nameSource);
        var kind = name switch
        {
            ">" or "<" => ArrowTipKind.Default,
            "To" => ArrowTipKind.To,
            "to" => ArrowTipKind.LegacyTo,
            "Computer Modern Rightarrow" => ArrowTipKind.ComputerModern,
            "Stealth" => ArrowTipKind.Stealth,
            "Latex" => ArrowTipKind.Latex,
            _ => throw Unsupported(nameSource, $"Unsupported arrow tip '{name}'.")
        };
        if (kind is ArrowTipKind.ComputerModern or ArrowTipKind.Stealth or ArrowTipKind.Latex
            && !state.Libraries.Contains("arrows.meta"))
            throw Unsupported(nameSource, $"Arrow tip '{name}' requires arrows.meta.");
        long? length = null, width = null, inset = null;
        if (bracket >= 0)
        {
            if (kind is ArrowTipKind.Default or ArrowTipKind.LegacyTo)
                throw Unsupported(source, "This arrow alias does not accept dimension options.");
            var reader = new Cursor(source.Slice(bracket, source.Length - bracket), budget);
            var options = reader.Group('[', ']'); reader.Complete();
            foreach (var option in Options.Read(options, budget))
            {
                var dimension = option.Key switch
                {
                    "length" or "width" => Dimension(option.Value, state, budget),
                    "inset" when kind == ArrowTipKind.Stealth => Dimension(option.Value, state, budget),
                    _ => throw Unsupported(option.Source, $"Unsupported arrow option '{option.Key}'.")
                };
                if (dimension < 0 || dimension == 0 && option.Key != "inset")
                    throw new CompileError("TIKZ001", "Arrow dimensions must be positive; inset can be zero.", option.Value);
                switch (option.Key) { case "length": length = dimension; break; case "width": width = dimension; break; case "inset": inset = dimension; break; }
            }
        }
        return new(kind, source, length, width, inset);
    }

    private static long Dimension(Source source, EvaluationState state, Budget budget)
        => PgfDirection.Checked((long)Math.Round(state.Dimension(source, budget) * (65536 * 72.27 / 72), MidpointRounding.AwayFromZero), source);
    private static CompileError Unsupported(Source source, string message) => new("TIKZ002", message, source);
}

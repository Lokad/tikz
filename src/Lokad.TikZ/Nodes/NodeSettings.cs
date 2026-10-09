using Lokad.TikZ.Frontend;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Text;

namespace Lokad.TikZ.Nodes;

internal sealed record NodeSettings
{
    internal NodeShape Shape { get; init; } = NodeShape.Rectangle;
    internal Source? Font { get; init; }
    internal Source? NodeFont { get; init; }
    internal Source? InnerX { get; init; }
    internal Source? InnerY { get; init; }
    internal Source? OuterX { get; init; }
    internal Source? OuterY { get; init; }
    internal Source? MinimumWidth { get; init; }
    internal Source? MinimumHeight { get; init; }
    internal string Anchor { get; init; } = "center";
    internal Source? AnchorSource { get; init; }
    internal TextAlignment? Alignment { get; init; }
    internal bool TransformShape { get; init; }
    internal NodePositioning? Positioning { get; init; }
    internal double PathTime { get; init; } = .5;
    internal bool Sloped { get; init; }
    internal bool AllowUpsideDown { get; init; }
    internal Color TextColor { get; init; } = new(0, 0, 0);
    internal double? TextOpacity { get; init; }

    internal static TextFont ApplyFont(Source? declarations, TextFont initial, Budget budget)
    {
        if (declarations is not { } source) return initial;
        var font = initial;
        foreach (var item in new LabelParser(source, budget).Parse())
        {
            if (item is LabelFont change) font = font.Apply(change.Change, change.Source);
            else if (item is not LabelSpace)
                throw new CompileError("TIKZ002", "Font options require supported font declarations only.", item.Source);
        }
        return font;
    }
}

internal sealed record NodePositioning(Source Target, Source Distance, int XSign, int YSign, string TargetAnchor);

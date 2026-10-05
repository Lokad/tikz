using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Text;

namespace Lokad.TikZ.Nodes;

// This finite scaled-point arithmetic models PGF shape layout, not TeX
// execution. Labels have already been measured when the shape is resolved.
internal readonly record struct NodePoint(int X, int Y)
{
    internal Point Bp => new(X * (72 / (72.27 * 65536)), Y * (72 / (72.27 * 65536)));
}

internal readonly record struct NodeFontMetrics(int QuadSp, int XHeightSp)
{
    internal static NodeFontMetrics Resolve(TextFont font, Budget budget, Source source)
    {
        budget.Charge(source, 256 + (font.Bold ? 2492 : font.Italic ? 3731 : 2499));
        var data = TextLayout.Font(font);
        return new(FontData.ScaleFix(data.ParametersFix[5], font.SizePt * 65536),
            FontData.ScaleFix(data.ParametersFix[4], font.SizePt * 65536));
    }
}

internal sealed record NodeDimensions(int InnerXSp, int InnerYSp, int OuterXSp,
    int OuterYSp, int MinimumWidthSp, int MinimumHeightSp)
{
    internal static NodeDimensions Default(NodeFontMetrics font, int lineWidthSp)
    {
        // TeX reads .3333 as 21843/65536 before multiplying the font's quad.
        var inner = checked((int)(21843L * font.QuadSp / 65536));
        return new(inner, inner, lineWidthSp / 2, lineWidthSp / 2, 65536, 65536);
    }
}

internal sealed record RectangleNodeLayout(MeasuredText Text, NodeDimensions Dimensions,
    NodePoint SouthWest, NodePoint NorthEast, NodePoint Center,
    NodePoint BackgroundSouthWest, NodePoint BackgroundNorthEast) : INodeLayout
{
    internal static RectangleNodeLayout Resolve(MeasuredText text, NodeDimensions dimensions,
        Budget budget, Source source)
    {
        budget.Node(source);
        foreach (var dimension in new[] { dimensions.InnerXSp, dimensions.InnerYSp,
            dimensions.OuterXSp, dimensions.OuterYSp, dimensions.MinimumWidthSp, dimensions.MinimumHeightSp })
            Dimension(dimension);
        var width = Dimension((long)text.WidthSp + 2L * dimensions.InnerXSp);
        var height = Dimension((long)text.HeightSp + text.DepthSp + 2L * dimensions.InnerYSp);
        width = Dimension(Math.Max(width, dimensions.MinimumWidthSp));
        height = Dimension(Math.Max(height, dimensions.MinimumHeightSp));
        // PGF halves each operand independently, truncating toward zero.
        var halfWidth = width / 2;
        var halfHeight = height / 2;
        var textX = text.WidthSp / 2;
        var textY = text.HeightSp / 2 - text.DepthSp / 2;
        var sw = Point((long)textX - halfWidth - dimensions.OuterXSp,
            (long)textY - halfHeight - dimensions.OuterYSp);
        var ne = Point((long)textX + halfWidth + dimensions.OuterXSp,
            (long)textY + halfHeight + dimensions.OuterYSp);
        var center = Point((long)sw.X / 2 + ne.X / 2, (long)sw.Y / 2 + ne.Y / 2);
        var backgroundSw = Point((long)sw.X + dimensions.OuterXSp, (long)sw.Y + dimensions.OuterYSp);
        var backgroundNe = Point((long)ne.X - dimensions.OuterXSp, (long)ne.Y - dimensions.OuterYSp);
        return new(text, dimensions, sw, ne, center, backgroundSw, backgroundNe);

        int Dimension(long value)
        {
            budget.Charge(source);
            if (value is < -1073741823 or > 1073741823) Budget.Fail(source, "node dimension");
            budget.Check(value * (72 / (72.27 * 65536)), source);
            return (int)value;
        }
        NodePoint Point(long x, long y) => new(Dimension(x), Dimension(y));
    }

    // Mid anchors evaluate .5ex in the querying font's context. They are not
    // frozen to the label font (or even to the font that sized the node).
    public NodePoint Anchor(string name, NodeFontMetrics context, Budget budget, Source source)
    {
        budget.Charge(source);
        return name switch
        {
            "text" => default,
            "center" => Center,
            "north" => new(Center.X, NorthEast.Y),
            "south" => new(Center.X, SouthWest.Y),
            "west" => new(SouthWest.X, Center.Y),
            "east" => new(NorthEast.X, Center.Y),
            "north west" => new(SouthWest.X, NorthEast.Y),
            "north east" => NorthEast,
            "south west" => SouthWest,
            "south east" => new(NorthEast.X, SouthWest.Y),
            "base" => new(Center.X, 0),
            "base west" => new(SouthWest.X, 0),
            "base east" => new(NorthEast.X, 0),
            "mid" => new(Center.X, context.XHeightSp / 2),
            "mid west" => new(SouthWest.X, context.XHeightSp / 2),
            "mid east" => new(NorthEast.X, context.XHeightSp / 2),
            _ => throw new CompileError("TIKZ002", $"Unsupported rectangle anchor '{name}'.", source)
        };
    }

    public GraphicPath Background(Affine transform, Budget budget, Source source)
    {
        var path = new GraphicPath(budget, source);
        // PGF's identity-linear-frame fast path paints SW → SE → NE → NW.
        // Its general rectangle construction starts at NE and reverses that
        // traversal. The start and direction remain observable with dashes.
        var sw = PgfTransform.Apply(transform, BackgroundSouthWest.Bp, budget, source);
        var se = PgfTransform.Apply(transform, new NodePoint(BackgroundNorthEast.X, BackgroundSouthWest.Y).Bp, budget, source);
        var ne = PgfTransform.Apply(transform, BackgroundNorthEast.Bp, budget, source);
        var nw = PgfTransform.Apply(transform, new NodePoint(BackgroundSouthWest.X, BackgroundNorthEast.Y).Bp, budget, source);
        if (transform.A == 1 && transform.B == 0 && transform.C == 0 && transform.D == 1)
        {
            path.Move(sw); path.Line(se); path.Line(ne); path.Line(nw);
        }
        else
        {
            path.Move(ne); path.Line(nw); path.Line(sw); path.Line(se);
        }
        path.Close();
        return path;
    }

    public NodePoint Border(NodePoint direction, Budget budget, Source source)
    {
        // The rectangle's border routine derives its center from SW + half
        // the full size; the separately declared center halves SW/NE first.
        var half = new NodePoint((int)(((long)NorthEast.X - SouthWest.X) / 2),
            (int)(((long)NorthEast.Y - SouthWest.Y) / 2));
        var hit = RectangleBorder.Intersect(direction, half, budget, source);
        return new(Dimension((long)SouthWest.X + half.X + hit.X), Dimension((long)SouthWest.Y + half.Y + hit.Y));
        int Dimension(long value)
        {
            if (value is < -1073741823 or > 1073741823)
                throw new CompileError("TIKZ004", "The node border exceeds PGF scaled-point precision.", source);
            return (int)value;
        }
    }
}

using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Text;

namespace Lokad.TikZ.Nodes;

internal sealed record CurvedNodeLayout(NodeShape Shape, MeasuredText Text, NodeDimensions Dimensions,
    NodePoint Center, NodePoint Radius, NodePoint BackgroundRadius) : INodeLayout
{
    public NodePoint BackgroundSouthWest => new(Center.X - Math.Abs(BackgroundRadius.X), Center.Y - Math.Abs(BackgroundRadius.Y));
    public NodePoint BackgroundNorthEast => new(Center.X + Math.Abs(BackgroundRadius.X), Center.Y + Math.Abs(BackgroundRadius.Y));

    internal static CurvedNodeLayout Resolve(NodeShape shape, MeasuredText text, NodeDimensions dimensions, Budget budget, Source source)
    {
        if (shape is not (NodeShape.Circle or NodeShape.Ellipse)) throw new ArgumentOutOfRangeException(nameof(shape));
        budget.Node(source);
        foreach (var value in new[] { dimensions.InnerXSp, dimensions.InnerYSp, dimensions.OuterXSp,
            dimensions.OuterYSp, dimensions.MinimumWidthSp, dimensions.MinimumHeightSp }) Dimension(value);
        var center = new NodePoint(Dimension(text.WidthSp / 2), Dimension((long)text.HeightSp / 2 - text.DepthSp / 2));
        var x = Dimension((long)text.WidthSp / 2 + dimensions.InnerXSp);
        var y = Dimension((long)text.HeightSp / 2 + text.DepthSp / 2 + dimensions.InnerYSp);
        NodePoint radius, background;
        if (shape == NodeShape.Circle)
        {
            var direction = PgfDirection.Normalize(new(x, y), budget, source);
            var major = direction.X > direction.Y;
            var component = major ? direction.X : direction.Y;
            var size = x;
            if (component != 0)
            {
                var divisor = component / 255;
                if (divisor == 0) throw new CompileError("TIKZ004", "The circle radius is undefined at PGF scaled-point precision.", source);
                size = PgfDirection.Checked(16L * (major ? x : y), source) / divisor;
                size = PgfDirection.Checked(16L * size, source);
            }
            size = Dimension(Math.Max(size, Math.Max(dimensions.MinimumWidthSp / 2, dimensions.MinimumHeightSp / 2)));
            var separated = Dimension((long)size + Math.Max(dimensions.OuterXSp, dimensions.OuterYSp));
            radius = new(separated, separated); background = new(size, size);
        }
        else
        {
            x = Dimension(Math.Max(PgfDirection.Product(92682, x, source), dimensions.MinimumWidthSp / 2));
            y = Dimension(Math.Max(PgfDirection.Product(92682, y, source), dimensions.MinimumHeightSp / 2));
            background = new(x, y);
            radius = new(Dimension((long)x + dimensions.OuterXSp), Dimension((long)y + dimensions.OuterYSp));
        }
        // Bound every generated anchor/background coordinate, not just its radius.
        foreach (var size in new[] { radius, background })
        {
            Dimension((long)center.X - Math.Abs((long)size.X)); Dimension((long)center.X + Math.Abs((long)size.X));
            Dimension((long)center.Y - Math.Abs((long)size.Y)); Dimension((long)center.Y + Math.Abs((long)size.Y));
        }
        return new(shape, text, dimensions, center, radius, background);

        int Dimension(long value)
        {
            budget.Charge(source);
            if (value is < -1073741823 or > 1073741823) Budget.Fail(source, "node dimension");
            var result = (int)value;
            budget.Check(new NodePoint(result, 0).Bp.X, source);
            return result;
        }
    }

    public NodePoint Anchor(string name, NodeFontMetrics context, Budget budget, Source source)
    {
        budget.Charge(source);
        var dx = (int)PgfDirection.Product(46341, Radius.X, source);
        var dy = (int)PgfDirection.Product(46341, Radius.Y, source);
        var point = name switch
        {
            "text" => default,
            "center" => Center,
            "north" => new(Center.X, Center.Y + Radius.Y),
            "south" => new(Center.X, Center.Y - Radius.Y),
            "west" => new(Center.X - Radius.X, Center.Y),
            "east" => new(Center.X + Radius.X, Center.Y),
            "north west" => new(Center.X - dx, Center.Y + dy),
            "north east" => new(Center.X + dx, Center.Y + dy),
            "south west" => new(Center.X - dx, Center.Y - dy),
            "south east" => new(Center.X + dx, Center.Y - dy),
            "base" => new(Center.X, 0),
            "base west" => new(Center.X - Radius.X, 0),
            "base east" => new(Center.X + Radius.X, 0),
            "mid" => new(Center.X, context.XHeightSp / 2),
            "mid west" => new(Center.X - Radius.X, context.XHeightSp / 2),
            "mid east" => new(Center.X + Radius.X, context.XHeightSp / 2),
            _ => throw new CompileError("TIKZ002", $"Unsupported {Shape.ToString().ToLowerInvariant()} anchor '{name}'.", source)
        };
        budget.Check(point.Bp.X, source); budget.Check(point.Bp.Y, source);
        return point;
    }

    public NodePoint Border(NodePoint direction, Budget budget, Source source)
    {
        var hit = EllipseBorder.Intersect(direction, Radius, budget, source);
        var point = new NodePoint(PgfDirection.Checked((long)Center.X + hit.X, source),
            PgfDirection.Checked((long)Center.Y + hit.Y, source));
        budget.Check(point.Bp.X, source); budget.Check(point.Bp.Y, source);
        return point;
    }

    public GraphicPath Background(Affine transform, Budget budget, Source source)
    {
        var path = new GraphicPath(budget, source);
        var center = Global(Center);
        var linear = transform with { E = 0, F = 0 };
        var a = Vector(new(BackgroundRadius.X, 0)); var b = Vector(new(0, BackgroundRadius.Y));
        NodePoint[] axes = [a, b, new(-a.X, -a.Y), new(-b.X, -b.Y)];
        path.Move(Add(center, a).Bp);
        for (var i = 0; i < 4; i++)
        {
            var from = axes[i]; var to = axes[(i + 1) % 4];
            path.Cubic(Add(center, Add(from, Control(to))).Bp, Add(center, Add(to, Control(from))).Bp, Add(center, to).Bp);
        }
        path.Close(); path.Move(center.Bp);
        return path;

        NodePoint Global(NodePoint point) => Sp(PgfTransform.Apply(transform, point.Bp, budget, source));
        NodePoint Vector(NodePoint point) => Sp(PgfTransform.Apply(linear, point.Bp, budget, source));
        NodePoint Sp(Point point) => new(PgfDirection.Checked((long)Math.Round(point.X * (72.27 * 65536 / 72), MidpointRounding.AwayFromZero), source),
            PgfDirection.Checked((long)Math.Round(point.Y * (72.27 * 65536 / 72), MidpointRounding.AwayFromZero), source));
        NodePoint Control(NodePoint point) => new((int)PgfDirection.Product(36195, point.X, source), (int)PgfDirection.Product(36195, point.Y, source));
        NodePoint Add(NodePoint left, NodePoint right) => new(PgfDirection.Checked((long)left.X + right.X, source), PgfDirection.Checked((long)left.Y + right.Y, source));
    }
}

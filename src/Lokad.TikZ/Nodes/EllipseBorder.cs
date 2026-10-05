using Lokad.TikZ.Frontend;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Nodes;

internal static class EllipseBorder
{
    internal static NodePoint Intersect(NodePoint direction, NodePoint radius, Budget budget, Source source)
    {
        budget.Charge(source, 16);
        var query = direction;
        if (radius.X != radius.Y)
        {
            // Native ellipse intersection first rescales the direction through
            // an integer-pt quotient and an eighth-sized reciprocal register.
            var vertical = radius.X < radius.Y;
            var count = (vertical ? radius.Y : radius.X) / PgfDirection.Unity;
            if (count == 0) throw Undefined();
            var smaller = (vertical ? radius.X : radius.Y) / count;
            var larger = (vertical ? radius.Y : radius.X) / count / 8;
            if (larger == 0) throw Undefined();
            var reciprocal = 8192 * PgfDirection.Unity / larger;
            var component = vertical ? direction.Y : direction.X;
            // The two native branches multiply these factors in opposite
            // orders. Each truncates separately; short directions expose it.
            var scaled = vertical ? Product(smaller, Product(reciprocal, component))
                : Product(reciprocal, Product(smaller, component));
            query = vertical ? new(direction.X, scaled) : new(scaled, direction.Y);
        }
        var unit = PgfDirection.Normalize(query, budget, source);
        var hit = new NodePoint(Product(radius.X, unit.X), Product(radius.Y, unit.Y));
        budget.Check(hit.Bp.X, source); budget.Check(hit.Bp.Y, source);
        return hit;

        int Product(long factor, long dimension) => (int)PgfDirection.Product(factor, dimension, source);
        CompileError Undefined() => new("TIKZ004", "This ellipse border is undefined at PGF scaled-point precision.", source);
    }
}

using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Nodes;

// PGF's finite rectangle intersection is deliberately not the exact analytic
// ray/rectangle intersection. It divides an eighth-sized direction register,
// then multiplies printed TeX dimensions twice, truncating each product.
internal static class RectangleBorder
{
    internal static NodePoint Intersect(NodePoint direction, NodePoint halfSize, Budget budget, Source source)
    {
        budget.Charge(source, 24);
        var x = Math.Abs((long)direction.X); var y = Math.Abs((long)direction.Y);
        var countX = x / 8; var countY = y / 8;
        if (countY < countX)
        {
            if (countX < 255) { x = 0; y = halfSize.Y; }
            else
            {
                y = Product(halfSize.X, Product(8192L * 65536 / countX, y));
                if (y < halfSize.Y) x = halfSize.X;
                else if (countY < 255) { x = halfSize.X; y = 0; }
                else { x = Product(halfSize.Y, Product(8192L * 65536 / countY, x)); y = halfSize.Y; }
            }
        }
        else
        {
            if (countY < 255) { x = halfSize.X; y = 0; }
            else
            {
                x = Product(halfSize.Y, Product(8192L * 65536 / countY, x));
                if (x < halfSize.X) y = halfSize.Y;
                else if (countX < 255) { x = 0; y = halfSize.Y; }
                else { y = Product(halfSize.X, Product(8192L * 65536 / countX, y)); x = halfSize.X; }
            }
        }
        if (direction.X < 0) x = -x;
        if (direction.Y < 0) y = -y;
        if (x is < -1073741823 or > 1073741823 || y is < -1073741823 or > 1073741823)
            throw new CompileError("TIKZ004", "The node border exceeds PGF scaled-point precision.", source);
        var result = new NodePoint((int)x, (int)y);
        budget.Check(result.Bp.X, source); budget.Check(result.Bp.Y, source);
        return result;
    }

    private static long Product(long factor, long dimension)
    {
        var scalar = (long)Math.Round(PgfTransform.Printed(factor) * 65536, MidpointRounding.AwayFromZero);
        return scalar * dimension / 65536;
    }
}

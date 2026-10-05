using Lokad.TikZ.Frontend;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Geometry;

// Finite PGF affine operations. Coordinates live in TeX scaled points while
// each linear coefficient is passed through a printed TeX dimension. SVG glyph
// outlines subsequently use the resolved matrix continuously, without this
// coordinate quantization at every outline vertex.
internal static class PgfTransform
{
    private const long Unity = 65536;
    private const long Maximum = 1073741823;
    private const double SpPerBp = 72.27 * Unity / 72;

    internal static Affine Then(Affine left, Affine right, Budget budget, Source source)
    {
        budget.Charge(source, 16);
        var a = Scalar(left.A); var b = Scalar(left.B); var c = Scalar(left.C); var d = Scalar(left.D);
        var ra = Scalar(right.A); var rb = Scalar(right.B); var rc = Scalar(right.C); var rd = Scalar(right.D);
        var x = Dimension(right.E); var y = Dimension(right.F);
        return new(Coefficient(Product(a, ra) + Product(c, rb)), Coefficient(Product(b, ra) + Product(d, rb)),
            Coefficient(Product(a, rc) + Product(c, rd)), Coefficient(Product(b, rc) + Product(d, rd)),
            Coordinate(Product(a, x) + Product(c, y) + Dimension(left.E)),
            Coordinate(Product(b, x) + Product(d, y) + Dimension(left.F)));

        long Scalar(double value) => Scaled(value * Unity, source);
        long Dimension(double bp) => Scaled(bp * SpPerBp, source);
        double Coefficient(long value) => Printed(Checked(value, source));
        double Coordinate(long value)
        {
            var result = Checked(value, source) / SpPerBp;
            budget.Check(result, source);
            return result;
        }
    }

    internal static Point Apply(Affine frame, Point point, Budget budget, Source source)
    {
        budget.Charge(source, 8);
        var x = Scaled(point.X * SpPerBp, source); var y = Scaled(point.Y * SpPerBp, source);
        var result = new Point(
            Checked(Product(Scaled(frame.A * Unity, source), x) + Product(Scaled(frame.C * Unity, source), y)
                + Scaled(frame.E * SpPerBp, source), source) / SpPerBp,
            Checked(Product(Scaled(frame.B * Unity, source), x) + Product(Scaled(frame.D * Unity, source), y)
                + Scaled(frame.F * SpPerBp, source), source) / SpPerBp);
        budget.Check(result.X, source); budget.Check(result.Y, source);
        return result;
    }

    internal static Point Scale(Point point, double factor, Budget budget, Source source)
    {
        budget.Charge(source, 4);
        var scalar = Scaled(factor * Unity, source);
        var result = new Point(Checked(Product(scalar, Scaled(point.X * SpPerBp, source)), source) / SpPerBp,
            Checked(Product(scalar, Scaled(point.Y * SpPerBp, source)), source) / SpPerBp);
        budget.Check(result.X, source); budget.Check(result.Y, source);
        return result;
    }

    internal static Affine Rotation(double degrees, Budget budget, Source source)
    {
        budget.Charge(source, 16);
        // PGF interpolates its five-decimal, whole-degree cosine table in
        // scaled points. Calculate those mathematical constants independently.
        var angle = Scaled(degrees * Unity, source);
        var cos = Cosine(angle); var sin = Cosine(angle - 90 * Unity);
        return new(cos, sin, -sin, cos, 0, 0);

        double Cosine(long value)
        {
            value = Math.Abs(value % (360 * Unity));
            if (value >= 180 * Unity) value = 360 * Unity - value;
            var whole = (int)(value / Unity); var fraction = value % Unity;
            var first = Table(whole);
            var result = fraction == 0 ? first : Product(first, Unity - fraction) + Product(Table(whole + 1), fraction);
            return Printed(result);
        }
        long Table(int degree) => Scaled(Math.Round(Math.Cos(degree * Math.PI / 180), 5, MidpointRounding.AwayFromZero) * Unity, source);
    }

    private static long Product(long factor, long dimension) => factor * dimension / Unity;
    internal static double Printed(long value)
    {
        // TeX chooses a short decimal that reads back to the same scaled point,
        // rather than rounding every dimension to five decimal places. For
        // example 26214 sp prints as .4, not .39999.
        for (var precision = 0; precision < 5; precision++)
        {
            var candidate = Math.Round(value / (double)Unity, precision, MidpointRounding.AwayFromZero);
            if (Math.Round(candidate * Unity, MidpointRounding.AwayFromZero) == value) return candidate;
        }
        return Math.Round(value / (double)Unity, 5, MidpointRounding.AwayFromZero);
    }
    private static long Scaled(double value, Source source)
    {
        var scaled = Math.Round(value, MidpointRounding.AwayFromZero);
        if (!double.IsFinite(scaled) || Math.Abs(scaled) > Maximum)
            throw new CompileError("TIKZ004", "The transform exceeds PGF scaled-point precision.", source);
        return (long)scaled;
    }
    private static long Checked(long value, Source source)
    {
        if (Math.Abs(value) > Maximum)
            throw new CompileError("TIKZ004", "The transform exceeds PGF scaled-point precision.", source);
        return value;
    }
}

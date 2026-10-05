using Lokad.TikZ.Frontend;

namespace Lokad.TikZ.Geometry;

// Named PGF anchors are converted into the current local frame, then back into
// picture coordinates when the path is constructed. The reciprocal and scaled
// point operations in that round trip have observable finite-precision effects.
internal static class PgfCoordinates
{
    private const double SpPerPt = 65536;
    private const double PtPerBp = 72.27 / 72;

    public static Point RoundTrip(Point global, Affine frame, Source source)
    {
        var local = Local(global, frame, source);
        var restored = Apply(Fixed(frame.A), Fixed(frame.B), Fixed(frame.C), Fixed(frame.D), local)
            + new Point(Fixed(frame.E * PtPerBp), Fixed(frame.F * PtPerBp));
        return restored * (1 / PtPerBp);
    }

    internal static Point ToLocal(Point global, Affine frame, Source source)
        => Local(global, frame, source) * (1 / PtPerBp);

    private static Point Local(Point global, Affine frame, Source source)
    {
        var a = Fixed(frame.A); var b = Fixed(frame.B);
        var c = Fixed(frame.C); var d = Fixed(frame.D);
        double ia, ib, ic, id;
        if (b == 0 && c == 0)
        {
            ia = Reciprocal(a, source); id = Reciprocal(d, source); ib = ic = 0;
        }
        else
        {
            var determinant = Multiply(a, d) - Multiply(b, c);
            var reciprocal = Reciprocal(determinant, source);
            ia = Multiply(d, reciprocal); id = Multiply(a, reciprocal);
            ib = Multiply(-b, reciprocal); ic = Multiply(-c, reciprocal);
        }
        var point = new Point(Fixed(global.X * PtPerBp), Fixed(global.Y * PtPerBp));
        var shift = new Point(Fixed(frame.E * PtPerBp), Fixed(frame.F * PtPerBp));
        return Apply(ia, ib, ic, id, point) + Apply(ia, ib, ic, id, shift * -1);
    }

    private static Point Apply(double a, double b, double c, double d, Point point)
        => new(Multiply(a, point.X) + Multiply(c, point.Y), Multiply(b, point.X) + Multiply(d, point.Y));

    private static double Fixed(double value) => Math.Round(value * SpPerPt, MidpointRounding.AwayFromZero) / SpPerPt;
    private static double Multiply(double a, double b) => Math.Truncate(a * b * SpPerPt) / SpPerPt;

    private static double Reciprocal(double value, Source source)
    {
        if (!double.IsFinite(value) || value == 0 || Math.Abs(value) > 16384 - 1 / SpPerPt)
            throw new CompileError("TIKZ004", "Cannot invert this coordinate frame at PGF numeric precision.", source);
        // PGF reads the printed TeX dimension's decimal digits. Integer
        // reciprocals use scaled-point integer division; fractional reciprocals
        // use decimal integer division followed by four scaled-point .1 steps.
        var printed = PgfTransform.Printed((long)Math.Round(value * SpPerPt, MidpointRounding.AwayFromZero));
        var integer = Math.Truncate(printed);
        var fraction = Math.Round((Math.Abs(printed) - Math.Abs(integer)) * 100000, MidpointRounding.AwayFromZero);
        if (fraction == 0)
        {
            if (integer == 0) throw new CompileError("TIKZ004", "Cannot invert this coordinate frame at PGF numeric precision.", source);
            return Math.Truncate(SpPerPt / integer) / SpPerPt;
        }
        var large = integer > 100;
        var denominator = large ? integer * 1000 + Math.Truncate(fraction / 100)
            : integer * 100000 + Math.CopySign(fraction, value);
        var quotient = Math.Truncate(1000000000 / denominator);
        var whole = Math.Truncate(quotient / 10000);
        var remainder = quotient - whole * 10000;
        if (large) remainder = Math.Truncate(remainder * SpPerPt / 1000000) / SpPerPt;
        else for (var i = 0; i < 4; i++) remainder = Multiply(remainder, Fixed(.1));
        return whole + remainder;
    }
}

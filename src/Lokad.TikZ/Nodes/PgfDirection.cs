using System.Globalization;
using System.Text;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Nodes;

// Native normalization follows a finite angle calculation, not a Euclidean
// division by length. Decimal division and interpolated mathematical constants
// are observable in node radii and border queries, including tiny directions.
internal static class PgfDirection
{
    internal const long Unity = 65536;

    internal static NodePoint Normalize(NodePoint direction, Budget budget, Source source)
    {
        var angle = Angle(direction, budget, source);
        var rotation = PgfTransform.Rotation(angle / (double)Unity, budget, source);
        return new(Checked((long)Math.Round(rotation.A * Unity, MidpointRounding.AwayFromZero), source),
            Checked((long)Math.Round(rotation.B * Unity, MidpointRounding.AwayFromZero), source));
    }

    internal static long Angle(NodePoint direction, Budget budget, Source source)
    {
        budget.Charge(source, 16);
        var x = (long)Checked(direction.X, source); var y = (long)Checked(direction.Y, source);
        long angle;
        if (Math.Abs(y) < 66)
            angle = x < 0 ? 180 * Unity : x > 0 ? 0 : y < 0 ? -90 * Unity : 90 * Unity;
        else
        {
            angle = Math.Abs(y) > Math.Abs(x)
                ? 90 * Unity - Atan(Divide(x, Math.Abs(y), budget, source))
                : Atan(Divide(Math.Abs(y), x, budget, source)) + (x < 0 ? 180 * Unity : 0);
            if (y < 0) angle = -angle;
        }
        return angle;

        long Atan(long ratio)
        {
            var magnitude = Math.Abs(ratio);
            var inverse = magnitude > Unity;
            if (inverse) magnitude = Reciprocal(magnitude, source);
            // PGF multiplies the printed dimension by 1000 before looking up
            // the 0.001-spaced atan table. Generate these constants from math.
            var index = Scalar(PgfTransform.Printed(magnitude) * 1000);
            var whole = (int)(index / Unity); var fraction = index % Unity;
            var first = Table(whole);
            var value = first + (fraction == 0 ? 0 : Product(Table(whole + 1) - first, fraction, source));
            if (inverse) value = 90 * Unity - value;
            return ratio < 0 ? -value : value;
        }
        long Table(int index) => index switch
        {
            0 => 0,
            1000 => 45 * Unity,
            _ => Scalar(Math.Truncate(Math.Atan(index / 1000.0) * (180 / Math.PI) * 100000) / 100000)
        };
        int Scalar(double value) => Checked((long)Math.Round(value * Unity, MidpointRounding.AwayFromZero), source);
    }

    internal static long Divide(long numerator, long denominator, Budget budget, Source source)
    {
        budget.Charge(source, 4);
        if (denominator == 0) throw Precision(source);
        if (denominator % Unity == 0) return numerator / (denominator / Unity);
        var negative = (numerator < 0) != (denominator < 0);
        var remainder = Math.Abs(numerator); var divisor = Math.Abs(denominator);
        if (divisor < Unity)
            return (negative ? -1 : 1) * Product(Reciprocal(divisor, source), remainder, source);
        var digits = new StringBuilder("0"); var fractional = false;
        var steps = 0;
        while (remainder > 1 && divisor > 1)
        {
            budget.Charge(source, 4);
            if (++steps > 64 || digits.Length > 64) throw Precision(source);
            if (divisor > remainder)
            {
                if (!fractional) { digits.Append('.'); fractional = true; }
                divisor = Scalar(PgfTransform.Printed(divisor) / 10);
                if (divisor > remainder) digits.Append('0');
            }
            else
            {
                var digit = remainder / divisor;
                remainder -= digit * divisor;
                if (fractional && digit > 9)
                {
                    var text = digits.ToString();
                    var places = Math.Min(text.Length - text.IndexOf('.') - 1, 5);
                    var carried = Read(text) + Scalar(Math.Pow(10, -places));
                    var printed = PgfTransform.Printed(carried).ToString("0.#####", CultureInfo.InvariantCulture);
                    digits.Clear().Append(printed);
                    if (!printed.Contains('.')) digits.Append('.');
                    digit -= 10;
                    if (digit == 0) continue;
                }
                digits.Append(digit.ToString(CultureInfo.InvariantCulture));
            }
        }
        return (negative ? -1 : 1) * Read(digits.ToString());
        int Scalar(double value) => Checked((long)Math.Round(value * Unity, MidpointRounding.AwayFromZero), source);
        int Read(string text) => Scalar(double.Parse(text, CultureInfo.InvariantCulture));
    }

    internal static long Product(long factor, long dimension, Source source)
        => Checked(factor * dimension / Unity, source);

    internal static int Checked(long value, Source source)
        => value is < -1073741823 or > 1073741823 ? throw Precision(source) : (int)value;

    internal static long Reciprocal(long dimension, Source source)
    {
        if (dimension <= 0) throw Precision(source);
        var printed = PgfTransform.Printed(dimension);
        var integer = (long)Math.Truncate(printed);
        var fraction = (long)Math.Round((printed - integer) * 100000, MidpointRounding.AwayFromZero);
        if (fraction == 0) return Unity / integer;
        var large = integer > 100;
        var denominator = large ? integer * 1000 + fraction / 100 : integer * 100000 + fraction;
        var quotient = 1000000000 / denominator;
        var whole = quotient / 10000;
        var remainder = (quotient % 10000) * Unity;
        if (large) remainder /= 1000000;
        else for (var i = 0; i < 4; i++) remainder = Product(6554, remainder, source);
        return Checked(whole * Unity + remainder, source);
    }

    private static CompileError Precision(Source source)
        => new("TIKZ004", "The node calculation exceeds PGF scaled-point precision.", source);
}

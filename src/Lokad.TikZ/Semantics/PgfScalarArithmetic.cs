using System.Globalization;
using System.Text;
using Lokad.TikZ.Frontend;

namespace Lokad.TikZ.Semantics;

// Assignment arithmetic is finite PGF scalar arithmetic. Existing coordinate
// expressions retain their own semantics. Printed values feed each next stage.
internal static class PgfScalarArithmetic
{
    private const long Unity = 65536;
    private const long Maximum = 1073741823;

    internal static string Evaluate(Source source, Budget budget)
        => Evaluate(Expression.Parse(source, budget), budget, 0).Printed;

    internal static double MultiplyDimensions(double a, double b, Source source, Budget budget)
    {
        var x = ReadDimension(a.ToString("0.#################", CultureInfo.InvariantCulture), source, budget);
        var y = ReadDimension(b.ToString("0.#################", CultureInfo.InvariantCulture), source, budget);
        return Product(x, y, source) / (double)Unity;
    }

    private readonly record struct Scalar(string Printed, Source Source);

    private static Scalar Evaluate(Expression expression, Budget budget, int depth)
    {
        budget.Depth(expression.Source, depth, budget.Limits.MaxExpressionDepth);
        switch (expression)
        {
            case Literal literal:
                var text = literal.Source.Trim().Value;
                if (text.Length == 0 || text.AsSpan().ContainsAnyExcept("0123456789."))
                    throw new CompileError("TIKZ002", "Numeric assignments require ordinary decimal literals.", literal.Source);
                ReadDimension(text, literal.Source, budget);
                return new(text, literal.Source);
            case Unary unary:
                var operand = Evaluate(unary.Operand, budget, depth + 1);
                var unarySource = Related(unary.Source, operand.Source, budget);
                return unary.Operator == '+' ? operand
                    : new(Print(-ReadDimension(operand.Printed, unarySource, budget), unarySource, budget), unarySource);
            case Binary binary when binary.Operator is '+' or '-' or '*' or '/':
                var a = Evaluate(binary.Left, budget, depth + 1);
                var b = Evaluate(binary.Right, budget, depth + 1);
                var origin = Related(Related(binary.Source, a.Source, budget), b.Source, budget);
                var x = ReadDimension(a.Printed, origin, budget);
                var y = ReadDimension(b.Printed, origin, budget);
                var value = binary.Operator switch
                {
                    '+' => Checked(x + y, origin), '-' => Checked(x - y, origin),
                    '*' => Product(x, y, origin), '/' => Divide(x, y, origin, budget),
                    _ => throw new InvalidOperationException()
                };
                return new(Print(value, origin, budget), origin);
            case Variable variable when variable.Name.StartsWith('\\'):
                throw new CompileError("TIKZ003", $"Unknown numeric variable '{variable.Name}'.", variable.Source);
            default:
                throw new CompileError("TIKZ002", "Unsupported numeric assignment expression; only decimal literals and '+', '-', '*', '/' are supported.", expression.Source);
        }
    }

    private static Source Related(Source use, Source dependency, Budget budget)
    {
        budget.Charge(use, (use.RelatedSources?.Length ?? 0) + 1);
        return use with { RelatedSources = [.. use.RelatedSources ?? [], dependency] };
    }

    private static long Checked(long value, Source source)
    {
        if (value is < -Maximum or > Maximum)
            throw new CompileError("TIKZ004", "Numeric assignment arithmetic exceeds TeX scaled-point precision.", source);
        return value;
    }

    private static long Product(long a, long b, Source source) => Checked(a * b / Unity, source);

    // TeX reads a decimal fraction from at most its first seventeen digits.
    // Integer arithmetic avoids a binary floating-point tie at a scaled point.
    private static long ReadDimension(string text, Source source, Budget budget)
    {
        var position = 0;
        var negative = text.StartsWith('-');
        if (negative || text.StartsWith('+')) position++;
        long whole = 0;
        while (position < text.Length && text[position] != '.')
        {
            budget.Charge(source);
            var digit = text[position++] - '0';
            if (digit is < 0 or > 9) throw new CompileError("TIKZ002", "Unsupported numeric literal.", source);
            whole = whole * 10 + digit;
            if (whole >= 16384) Checked(whole * Unity, source);
        }
        Span<int> digits = stackalloc int[17];
        var count = 0;
        if (position < text.Length) position++;
        while (position < text.Length)
        {
            budget.Charge(source);
            var digit = text[position++] - '0';
            if (digit is < 0 or > 9) throw new CompileError("TIKZ002", "Unsupported numeric literal.", source);
            if (count < digits.Length) digits[count++] = digit;
        }
        long fraction = 0;
        for (var i = count - 1; i >= 0; i--) { budget.Charge(source); fraction = (fraction + digits[i] * 2 * Unity) / 10; }
        var scaled = Checked(whole * Unity + (fraction + 1) / 2, source);
        return negative ? -scaled : scaled;
    }

    // A TeX dimension prints the shortest decimal selected by its finite
    // digit loop, including '.0' for an integer. That decimal reads back exactly.
    private static string Print(long value, Source source, Budget budget)
    {
        Checked(value, source);
        var text = new StringBuilder();
        if (value < 0) { text.Append('-'); value = -value; }
        text.Append((value / Unity).ToString(CultureInfo.InvariantCulture)).Append('.');
        var remainder = 10 * (value % Unity) + 5;
        long delta = 10;
        do
        {
            budget.Charge(source);
            if (delta > Unity) remainder += Unity / 2 - 50000;
            text.Append((char)('0' + remainder / Unity));
            remainder = 10 * (remainder % Unity);
            delta *= 10;
        } while (remainder > delta);
        return text.ToString();
    }

    private static long Divide(long numerator, long denominator, Source source, Budget budget)
    {
        budget.Charge(source);
        if (denominator == 0) throw new CompileError("TIKZ004", "Numeric assignment division by zero.", source);
        if (denominator % Unity == 0) return numerator / (denominator / Unity);
        var negative = (numerator < 0) != (denominator < 0);
        var x = Math.Abs(numerator);
        var y = Math.Abs(denominator);
        long result;
        if (y < Unity)
        {
            // Sub-unit divisors use a decimal reciprocal with four finite
            // multiplications by .1, then multiply the original numerator.
            var printed = Print(y, source, budget);
            var fraction = printed[(printed.IndexOf('.') + 1)..].PadRight(5, '0');
            var coefficient = int.Parse(fraction.AsSpan(0, 5), CultureInfo.InvariantCulture);
            var reciprocal = 1000000000L / coefficient;
            var whole = Checked((reciprocal / 10000) * Unity, source);
            var tail = Checked((reciprocal % 10000) * Unity, source);
            for (var i = 0; i < 4; i++) { budget.Charge(source); tail = Product(tail, 6554, source); }
            result = Product(x, Checked(whole + tail, source), source);
        }
        else
        {
            // The divisor shrinks through printed decimal dimensions; the
            // numerator stays in its register. Retain the finite carry rule
            // and one-scaled-point small-remainder stopping condition.
            var text = "0";
            var beforePoint = true;
            while (x > 1 && y > 1)
            {
                budget.Charge(source);
                if (y > x)
                {
                    if (beforePoint) { text += "."; beforePoint = false; }
                    var printed = Print(y, source, budget);
                    var dot = printed.IndexOf('.');
                    y = ReadDimension((dot == 1 ? "0" : printed[..(dot - 1)]) + "." + printed[dot - 1] + printed[(dot + 1)..], source, budget);
                    if (y > x) text += "0";
                }
                else
                {
                    var digit = x / y;
                    x -= digit * y;
                    if (!beforePoint && digit > 9)
                    {
                        var places = Math.Min(text.Length - text.IndexOf('.') - 1, 5);
                        var step = places == 0 ? Unity : ReadDimension("0." + new string('0', places - 1) + "1", source, budget);
                        text = Print(Checked(ReadDimension(text, source, budget) + step, source), source, budget);
                        if (text.EndsWith(".0", StringComparison.Ordinal)) text = text[..^1];
                        digit -= 10;
                        if (digit == 0) continue;
                    }
                    text += digit.ToString(CultureInfo.InvariantCulture);
                }
            }
            result = ReadDimension(text, source, budget);
        }
        return negative ? -result : result;
    }
}

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

    internal static Number EvaluatePlot(Expression expression, IReadOnlyDictionary<string, Number> variables, Budget budget)
    {
        var value = Evaluate(expression, budget, 0, variables);
        return new(double.Parse(value.Printed, CultureInfo.InvariantCulture), value.HasUnit) { Origin = value.Source };
    }

    internal static long PlotRegister(Source source, Budget budget) => ReadDimension(source.Trim().Value, source, budget);
    internal static string PlotPrint(long register, Source source, Budget budget) => Print(register, source, budget);

    internal static void ValidatePlot(Expression expression, IReadOnlyDictionary<string, Number> variables, string sample, Budget budget, int depth = 0)
    {
        budget.Depth(expression.Source, depth, budget.Limits.MaxExpressionDepth);
        switch (expression)
        {
            case Literal literal when literal.Source.Trim().Span.ContainsAnyExcept("0123456789."):
                throw new CompileError("TIKZ002", "Function plots require ordinary decimal literals.", literal.Source);
            case Literal or PhysicalLiteral: break;
            case Variable variable:
                if (variable.Name != sample && !variables.ContainsKey(variable.Name))
                    throw new CompileError("TIKZ003", $"Unknown numeric variable '{variable.Name}'.", variable.Source);
                break;
            case Unary unary: ValidatePlot(unary.Operand, variables, sample, budget, depth + 1); break;
            case Binary binary:
                ValidatePlot(binary.Left, variables, sample, budget, depth + 1);
                ValidatePlot(binary.Right, variables, sample, budget, depth + 1);
                break;
            case Function function:
                var arity = Arity(function.Name, true);
                if (arity == 0) throw new CompileError("TIKZ002", $"Unsupported function plot function '{function.Name}'.", function.Source);
                if (function.Arguments.Count != arity) throw new CompileError("TIKZ001", $"'{function.Name}' requires {arity} argument(s).", function.Source);
                foreach (var argument in function.Arguments) ValidatePlot(argument, variables, sample, budget, depth + 1);
                break;
            default: throw new CompileError("TIKZ002", "Unsupported function plot expression.", expression.Source);
        }
    }

    private static int Arity(string name, bool powers)
        => name switch { "abs" or "sin" or "cos" => 1, "min" or "max" => 2, "pow" when powers => 2, _ => 0 };

    internal static double MultiplyDimensions(double a, double b, Source source, Budget budget)
    {
        var x = ReadDimension(a.ToString("0.#################", CultureInfo.InvariantCulture), source, budget);
        var y = ReadDimension(b.ToString("0.#################", CultureInfo.InvariantCulture), source, budget);
        return Product(x, y, source) / (double)Unity;
    }

    private readonly record struct Scalar(string Printed, Source Source, bool HasUnit = false);

    private static Scalar Evaluate(Expression expression, Budget budget, int depth, IReadOnlyDictionary<string, Number>? variables = null)
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
                var operand = Evaluate(unary.Operand, budget, depth + 1, variables);
                var unarySource = Related(unary.Source, operand.Source, budget);
                return unary.Operator == '+' ? operand
                    : new(Print(-ReadDimension(operand.Printed, unarySource, budget), unarySource, budget), unarySource, operand.HasUnit);
            case Binary binary when binary.Operator is '+' or '-' or '*' or '/' || variables is not null && binary.Operator == '^':
                var a = Evaluate(binary.Left, budget, depth + 1, variables);
                var b = Evaluate(binary.Right, budget, depth + 1, variables);
                var origin = Related(Related(binary.Source, a.Source, budget), b.Source, budget);
                var x = ReadDimension(a.Printed, origin, budget);
                var y = ReadDimension(b.Printed, origin, budget);
                var value = binary.Operator switch
                {
                    '+' => Checked(x + y, origin), '-' => Checked(x - y, origin),
                    '*' => Product(x, y, origin), '/' => Divide(x, y, origin, budget),
                    '^' => Power(x, y, origin, budget),
                    _ => throw new InvalidOperationException()
                };
                return new(Print(value, origin, budget), origin, a.HasUnit || b.HasUnit);
            case PhysicalLiteral physical when variables is not null:
                var dimension = physical.Evaluate(variables, budget);
                var register = ReadDimension(dimension.Value.ToString("0.#################", CultureInfo.InvariantCulture), physical.Source, budget);
                return new(Print(register, physical.Source, budget), physical.Source, true);
            case Variable variable when variables is not null:
                if (!variables.TryGetValue(variable.Name, out var bound))
                    throw new CompileError("TIKZ003", $"Unknown numeric variable '{variable.Name}'.", variable.Source);
                var boundSource = bound.Relate(variable.Source, budget);
                var boundRegister = ReadDimension(bound.Value.ToString("0.#################", CultureInfo.InvariantCulture), boundSource, budget);
                return new(Print(boundRegister, boundSource, budget), boundSource, bound.HasUnit);
            case Function function:
                return EvaluateFunction(function, budget, depth, variables);
            case Variable variable when variable.Name.StartsWith('\\'):
                throw new CompileError("TIKZ003", $"Unknown numeric variable '{variable.Name}'.", variable.Source);
            default:
                throw new CompileError("TIKZ002", "Unsupported numeric assignment expression; expected decimal arithmetic or a declared scalar function.", expression.Source);
        }
    }

    private static Scalar EvaluateFunction(Function function, Budget budget, int depth, IReadOnlyDictionary<string, Number>? variables)
    {
        var source = function.Source;
        foreach (var argument in function.Arguments) source = Related(source, argument.Source, budget);
        var arity = Arity(function.Name, variables is not null);
        if (arity == 0) throw new CompileError("TIKZ002", $"Unsupported numeric assignment function '{function.Name}'.", source);
        if (function.Arguments.Count != arity)
            throw new CompileError("TIKZ001", $"'{function.Name}' requires {arity} argument(s).", source);
        var first = Evaluate(function.Arguments[0], budget, depth + 1, variables);
        source = Related(source, first.Source, budget);
        var x = ReadDimension(first.Printed, source, budget);
        long y = 0;
        var hasUnit = first.HasUnit;
        if (arity == 2)
        {
            var second = Evaluate(function.Arguments[1], budget, depth + 1, variables);
            source = Related(source, second.Source, budget);
            y = ReadDimension(second.Printed, source, budget);
            hasUnit |= second.HasUnit;
        }
        budget.Charge(source);
        var value = function.Name switch
        {
            "abs" => Math.Abs(x),
            // PGF's extrema start from these finite registers, even when both
            // arguments lie beyond them but still fit a dimension literal.
            "min" => Math.Min(16383 * Unity, Math.Min(x, y)),
            "max" => Math.Max(-16383 * Unity, Math.Max(x, y)),
            "cos" => Cosine(x, source, budget),
            // The temporary angle shift can exceed the literal-input bound;
            // normalization brings it back before any table product or result.
            "sin" => Cosine(x - 90 * Unity, source, budget),
            "pow" => Power(x, y, source, budget),
            _ => throw new InvalidOperationException()
        };
        return new(Print(value, source, budget), source, hasUnit);
    }

    private static long Power(long value, long exponent, Source source, Budget budget)
    {
        if (exponent % Unity != 0)
            throw new CompileError("TIKZ002", "Function plots require whole-number power exponents.", source);
        if (value == 0) return exponent == 0 ? Unity : 0;
        var count = exponent / Unity;
        if (count < 0) { value = Reciprocal(value, source, budget); count = -count; }
        var result = Unity;
        while (count > 0)
        {
            budget.Charge(source);
            if (count % 2 != 0) result = Product(result, value, source);
            if (count > 1) value = Product(value, value, source);
            count /= 2;
        }
        return result;
    }

    private static long Reciprocal(long value, Source source, Budget budget)
    {
        // PGF's reciprocal uses different decimal registers from division.
        var text = Print(value, source, budget);
        var dot = text.IndexOf('.');
        var whole = long.Parse(text.AsSpan(0, dot), CultureInfo.InvariantCulture);
        var fraction = text[(dot + 1)..].PadRight(5, '0');
        if (fraction.AsSpan(0, 5).ContainsAnyExcept('0') == false) return Unity / whole;
        var large = whole > 100;
        var digits = large ? 3 : 5;
        var coefficient = long.Parse(text[..dot] + fraction[..digits], CultureInfo.InvariantCulture);
        var reciprocal = 1000000000L / coefficient;
        var result = Checked(reciprocal / 10000 * Unity, source);
        var tail = Checked(reciprocal % 10000 * Unity, source);
        if (large) tail /= 1000000;
        else for (var i = 0; i < 4; i++) { budget.Charge(source); tail = Product(tail, 6554, source); }
        return Checked(result + tail, source);
    }

    private static long Cosine(long angle, Source source, Budget budget)
    {
        budget.Charge(source, 8);
        angle = Math.Abs(angle % (360 * Unity));
        if (angle > 180 * Unity) angle = 360 * Unity - angle;
        var whole = (int)(angle / Unity);
        var fraction = angle % Unity;
        var first = Table(whole);
        return fraction == 0 ? first
            : Checked(Product(first, Unity - fraction, source) + Product(Table(whole + 1), fraction, source), source);

        long Table(int degree)
        {
            budget.Charge(source);
            // Derive the five-decimal whole-degree constants independently.
            var value = Math.Round(Math.Cos(degree * Math.PI / 180), 5, MidpointRounding.AwayFromZero);
            return ReadDimension(value.ToString("0.00000", CultureInfo.InvariantCulture), source, budget);
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

using System.Globalization;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Frontend;

internal readonly record struct Number(double Value, bool HasUnit)
{
    public double Bp => HasUnit ? Value * 72 / 72.27 : Value;
}

internal abstract record Expression(Source Source)
{
    public abstract Number Evaluate(IReadOnlyDictionary<string, Number> variables, Budget budget);
    public static Expression Parse(Source source, Budget budget) => new ExpressionReader(source, budget).Read();
}
internal sealed record Literal(Number Number, Source Origin) : Expression(Origin)
{
    public override Number Evaluate(IReadOnlyDictionary<string, Number> variables, Budget budget) { budget.Charge(Source); return Number; }
}
internal sealed record FontRelativeLiteral(double Factor, string Unit, Source Origin) : Expression(Origin)
{
    internal const string EmVariable = "\0font-em-sp";
    internal const string ExVariable = "\0font-ex-sp";
    public override Number Evaluate(IReadOnlyDictionary<string, Number> variables, Budget budget)
    {
        budget.Charge(Source);
        if (!variables.TryGetValue(Unit == "em" ? EmVariable : ExVariable, out var metric))
            return new(Factor * (Unit == "em" ? 10 : 4.30554), true);
        var coefficient = Math.Round(Factor * 65536, MidpointRounding.AwayFromZero);
        if (!double.IsFinite(coefficient) || Math.Abs(coefficient) > 1073741823) Budget.Fail(Source, "font-relative dimension");
        var value = (long)coefficient * (long)metric.Value / 65536;
        if (value is < -1073741823 or > 1073741823) Budget.Fail(Source, "font-relative dimension");
        return new(value / 65536.0, true);
    }
}
internal sealed record Variable(string Name, Source Origin) : Expression(Origin)
{
    public override Number Evaluate(IReadOnlyDictionary<string, Number> variables, Budget budget)
    {
        budget.Charge(Source);
        if (variables.TryGetValue(Name, out var value)) return value;
        throw new CompileError("TIKZ003", $"Unknown numeric variable '{Name}'.", Source);
    }
}
internal sealed record Unary(char Operator, Expression Operand, Source Origin) : Expression(Origin)
{
    public override Number Evaluate(IReadOnlyDictionary<string, Number> variables, Budget budget)
    {
        budget.Charge(Source);
        var value = Operand.Evaluate(variables, budget);
        return value with { Value = Operator == '-' ? -value.Value : value.Value };
    }
}
internal sealed record Binary(char Operator, Expression Left, Expression Right, Source Origin) : Expression(Origin)
{
    public override Number Evaluate(IReadOnlyDictionary<string, Number> variables, Budget budget)
    {
        budget.Charge(Source);
        var a = Left.Evaluate(variables, budget);
        var b = Right.Evaluate(variables, budget);
        var value = Operator switch
        {
            '+' => a.Value + b.Value, '-' => a.Value - b.Value, '*' => a.Value * b.Value,
            '/' => a.Value / b.Value, '^' => Math.Pow(a.Value, b.Value),
            _ => throw new InvalidOperationException()
        };
        if (!double.IsFinite(value)) throw new CompileError("TIKZ004", "Undefined or non-finite arithmetic.", Source);
        return new(value, a.HasUnit || b.HasUnit);
    }
}
internal sealed record Function(string Name, IReadOnlyList<Expression> Arguments, Source Origin) : Expression(Origin)
{
    public override Number Evaluate(IReadOnlyDictionary<string, Number> variables, Budget budget)
    {
        budget.Charge(Source);
        var values = Arguments.Select(a => a.Evaluate(variables, budget)).ToArray();
        var expected = Name is "min" or "max" or "pow" or "mod" or "atan2" or "veclen" ? 2 : 1;
        if (values.Length != expected) throw new CompileError("TIKZ001", $"'{Name}' requires {expected} argument(s).", Source);
        var a = values[0].Value;
        var b = values.Length > 1 ? values[1].Value : 0;
        var value = Name switch
        {
            "sin" => Math.Sin(a * Math.PI / 180), "cos" => Math.Cos(a * Math.PI / 180),
            "tan" => Math.Tan(a * Math.PI / 180), "asin" => Math.Asin(a) * 180 / Math.PI,
            "acos" => Math.Acos(a) * 180 / Math.PI, "atan" => Math.Atan(a) * 180 / Math.PI,
            "atan2" => Math.Atan2(a, b) * 180 / Math.PI, "sqrt" => Math.Sqrt(a), "abs" => Math.Abs(a),
            "min" => Math.Min(a, b), "max" => Math.Max(a, b), "pow" => Math.Pow(a, b),
            "exp" => Math.Exp(a), "ln" => Math.Log(a), "log10" => Math.Log10(a),
            "floor" => Math.Floor(a), "ceil" => Math.Ceiling(a), "round" => Math.Round(a, MidpointRounding.AwayFromZero),
            "mod" => a - Math.Floor(a / b) * b, "veclen" => Math.Sqrt(a * a + b * b),
            "deg" => a * 180 / Math.PI, "rad" => a * Math.PI / 180,
            _ => throw new CompileError("TIKZ002", $"Unsupported math function '{Name}'.", Source)
        };
        if (!double.IsFinite(value)) throw new CompileError("TIKZ004", "Undefined or non-finite arithmetic.", Source);
        return new(value, values.Any(v => v.HasUnit));
    }
}

internal sealed class ExpressionReader(Source source, Budget budget)
{
    private readonly Cursor _reader = new(source, budget);
    private int _operators;
    public Expression Read()
    {
        var expression = ReadBinary(0, 0);
        _reader.Complete();
        return expression;
    }
    private Expression ReadBinary(int precedence, int depth)
    {
        budget.Depth(_reader.Here, depth, budget.Limits.MaxExpressionDepth);
        var left = ReadPrimary(depth + 1);
        while (true)
        {
            var op = _reader.Peek;
            var p = op switch { '+' or '-' => 1, '*' or '/' => 2, '^' => 3, _ => -1 };
            if (p < precedence) return left;
            var origin = _reader.Here;
            budget.Depth(origin, ++_operators, budget.Limits.MaxExpressionDepth);
            _reader.Advance();
            var right = ReadBinary(op == '^' ? p : p + 1, depth + 1);
            left = new Binary(op, left, right, origin);
        }
    }
    private Expression ReadPrimary(int depth)
    {
        budget.Depth(_reader.Here, depth, budget.Limits.MaxExpressionDepth);
        var origin = _reader.Here;
        var ch = _reader.Peek;
        if (ch is '+' or '-') { _reader.Advance(); return new Unary(ch, ReadBinary(3, depth + 1), origin); }
        if (ch is '{' or '(')
        {
            _reader.Advance();
            var result = ReadBinary(0, depth + 1);
            _reader.Require(ch == '{' ? "}" : ")");
            return result;
        }
        if (char.IsDigit(ch) || ch == '.')
        {
            var start = _reader.Position;
            while (char.IsDigit(_reader.Peek) || _reader.Peek == '.') _reader.Advance();
            if (_reader.Peek is 'e' or 'E')
            {
                var rest = source.Span[_reader.Position..];
                if (rest.Length > 1 && (char.IsDigit(rest[1]) || rest[1] is '+' or '-'))
                {
                    _reader.Advance();
                    if (_reader.Peek is '+' or '-') _reader.Advance();
                    while (char.IsDigit(_reader.Peek)) _reader.Advance();
                }
            }
            var text = source.Slice(start, _reader.Position - start);
            if (!double.TryParse(text.Span, NumberStyles.Float, CultureInfo.InvariantCulture, out var value) || !double.IsFinite(value))
                throw new CompileError("TIKZ001", "Invalid number.", text);
            var unitStart = _reader.Position;
            while (char.IsLetter(_reader.Peek)) _reader.Advance();
            var unit = source.Slice(unitStart, _reader.Position - unitStart).Value.Trim();
            if (unit is "em" or "ex") return new FontRelativeLiteral(value, unit, text);
            var factor = unit switch
            {
                "" => 1, "pt" => 1, "bp" => 72.27 / 72, "cm" => 72.27 / 2.54, "mm" => 72.27 / 25.4,
                "in" => 72.27, "sp" => 1.0 / 65536, "px" => 72.27 / 96,
                _ => throw new CompileError("TIKZ002", $"Unsupported unit '{unit}'.", text)
            };
            return new Literal(new(value * factor, unit.Length != 0), text);
        }
        string name;
        if (ch == '\\') name = _reader.Command().Value;
        else
        {
            var start = _reader.Position;
            while (char.IsLetter(_reader.Peek)) _reader.Advance();
            name = source.Slice(start, _reader.Position - start).Value.Trim();
        }
        if (name.Length == 0) throw new CompileError("TIKZ001", "Expected an arithmetic expression.", origin);
        if (_reader.Take("("))
        {
            var args = new List<Expression>();
            if (!_reader.Take(")"))
            {
                do { args.Add(ReadBinary(0, depth + 1)); } while (_reader.Take(","));
                _reader.Require(")");
            }
            return new Function(name, args, origin);
        }
        return name switch { "pi" => new Literal(new(Math.PI, false), origin), "e" => new Literal(new(Math.E, false), origin), _ => new Variable(name, origin) };
    }
}

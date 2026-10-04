using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Frontend;

internal sealed class Parser(Source source, Budget budget)
{
    private readonly Cursor _reader = new(source, budget);
    public List<Statement> Parse(TikzInputKind kind)
    {
        if (kind == TikzInputKind.PictureBody) return Statements("", 0);
        var result = new List<Statement>();
        while (!_reader.End)
        {
            var command = _reader.Command();
            switch (command.Value)
            {
                case "\\usetikzlibrary": result.Add(new LibraryStatement(_reader.Group('{', '}'), command)); break;
                case "\\tikzset": result.Add(new SetStatement(Options.Read(_reader.Group('{', '}'), budget), command)); break;
                case "\\begin":
                    var environment = Options.Clean(_reader.Group('{', '}'));
                    if (environment != "tikzpicture") throw new CompileError("TIKZ002", "Expected a tikzpicture environment.", command);
                    result.Add(new ScopeStatement(ReadOptions(), Statements("tikzpicture", 1), command));
                    _reader.Complete();
                    return result;
                default: throw new CompileError("TIKZ002", $"Unsupported command '{command.Value}' before the picture.", command);
            }
        }
        throw new CompileError("TIKZ001", "Expected a tikzpicture environment.", source.Slice(source.Length, 0));
    }
    private List<Statement> Statements(string environment, int depth)
    {
        budget.Depth(_reader.Here, depth, budget.Limits.MaxNesting);
        var result = new List<Statement>();
        while (!_reader.End)
        {
            if (_reader.Peek == '{')
            {
                var group = _reader.Group('{', '}');
                result.Add(new ScopeStatement([], new Parser(group, budget).Statements("", depth + 1), group));
                continue;
            }
            var command = _reader.Command();
            switch (command.Value)
            {
                case "\\end":
                    var end = Options.Clean(_reader.Group('{', '}'));
                    if (environment != end) throw new CompileError("TIKZ001", $"Unexpected end of '{end}'.", command);
                    return result;
                case "\\begin":
                    var begin = Options.Clean(_reader.Group('{', '}'));
                    if (begin != "scope") throw new CompileError("TIKZ002", $"Unsupported environment '{begin}'.", command);
                    result.Add(new ScopeStatement(ReadOptions(), Statements("scope", depth + 1), command));
                    break;
                case "\\tikzset": result.Add(new SetStatement(Options.Read(_reader.Group('{', '}'), budget), command)); break;
                case "\\usetikzlibrary": result.Add(new LibraryStatement(_reader.Group('{', '}'), command)); break;
                case "\\coordinate":
                    var name = Options.Clean(_reader.Group('(', ')'));
                    if (!_reader.Word("at")) throw new CompileError("TIKZ001", "Expected 'at'.", _reader.Here);
                    var point = ReadCoordinate();
                    _reader.Require(";");
                    result.Add(new CoordinateStatement(name, point, command));
                    break;
                case "\\path" or "\\draw" or "\\fill" or "\\filldraw" or "\\clip":
                    result.Add(ReadPath(command));
                    break;
                default: throw new CompileError("TIKZ002", $"Unsupported command '{command.Value}'.", command);
            }
        }
        if (environment.Length > 0) throw new CompileError("TIKZ001", $"Missing end of '{environment}'.", source.Slice(source.Length, 0));
        return result;
    }
    private List<Option> ReadOptions() => _reader.Peek == '[' ? Options.Read(_reader.Group('[', ']'), budget) : [];
    private PathStatement ReadPath(Source command)
    {
        var options = ReadOptions();
        var operations = new List<PathOperation>();
        while (!_reader.Take(";"))
        {
            var origin = _reader.Here;
            budget.Charge(origin);
            if (_reader.End) throw new CompileError("TIKZ001", "Unterminated path; expected ';'.", origin);
            if (_reader.Peek is '(' or '+') operations.Add(new MoveOperation(ReadCoordinate(), origin));
            else if (_reader.Take("--")) operations.Add(_reader.Word("cycle") ? new CloseOperation(origin) : new LineOperation(ReadCoordinate(), "line", origin));
            else if (_reader.Take("|-")) operations.Add(new LineOperation(ReadCoordinate(), "vh", origin));
            else if (_reader.Take("-|")) operations.Add(new LineOperation(ReadCoordinate(), "hv", origin));
            else if (_reader.Take(".."))
            {
                if (!_reader.Word("controls")) throw new CompileError("TIKZ001", "Expected 'controls'.", _reader.Here);
                var a = ReadCoordinate();
                var b = _reader.Word("and") ? ReadCoordinate() : a;
                _reader.Require("..");
                operations.Add(new CurveOperation(a, b, ReadCoordinate(), origin));
            }
            else if (_reader.Word("cycle")) operations.Add(new CloseOperation(origin));
            else if (_reader.Word("rectangle")) operations.Add(new RectangleOperation(ReadCoordinate(), origin));
            else if (_reader.Word("circle"))
            {
                var radius = _reader.Peek == '[' ? ShapeOptions("radius") : ReadDimensionGroup();
                var r = Expression.Parse(radius, budget);
                operations.Add(new EllipseOperation(r, r, origin));
            }
            else if (_reader.Word("ellipse"))
            {
                Source x;
                Source y;
                if (_reader.Peek == '[')
                {
                    var values = ReadOptions();
                    x = RequiredValue(values, "x radius", origin);
                    y = RequiredValue(values, "y radius", origin);
                    CheckShapeKeys(values, "x radius", "y radius");
                }
                else
                {
                    var group = _reader.Group('(', ')');
                    var index = group.Span.IndexOf(" and ", StringComparison.Ordinal);
                    if (index < 0) throw new CompileError("TIKZ001", "Expected 'x radius and y radius'.", group);
                    x = group.Slice(0, index); y = group.Slice(index + 5, group.Length - index - 5);
                }
                operations.Add(new EllipseOperation(Expression.Parse(x, budget), Expression.Parse(y, budget), origin));
            }
            else if (_reader.Word("arc"))
            {
                Source start;
                Source end;
                Source x;
                Source y;
                if (_reader.Peek == '[')
                {
                    var values = ReadOptions();
                    start = RequiredValue(values, "start angle", origin);
                    end = RequiredValue(values, "end angle", origin);
                    var radius = values.FirstOrDefault(v => v.Key == "radius");
                    x = radius is null ? RequiredValue(values, "x radius", origin) : radius.Value;
                    y = radius is null ? RequiredValue(values, "y radius", origin) : radius.Value;
                    CheckShapeKeys(values, "start angle", "end angle", "radius", "x radius", "y radius");
                }
                else
                {
                    var parts = Options.Split(_reader.Group('(', ')'), ':', budget);
                    if (parts.Count != 3) throw new CompileError("TIKZ001", "Expected arc(start:end:radius).", origin);
                    start = parts[0]; end = parts[1]; x = parts[2]; y = x;
                }
                operations.Add(new ArcOperation(Expression.Parse(start, budget), Expression.Parse(end, budget), Expression.Parse(x, budget), Expression.Parse(y, budget), origin));
            }
            else if (_reader.Peek == '[') operations.Add(new PathOptionsOperation(ReadOptions(), origin));
            else throw new CompileError("TIKZ002", "Unsupported path operation.", origin);
            if (operations.Count > budget.Limits.MaxSegments) Budget.Fail(origin, "path operations");
        }
        return new(command.Value, options, operations, new Source(command.Text, command.Offset, source.Offset + _reader.Position - command.Offset));
    }
    private Source ShapeOptions(string key)
    {
        var options = ReadOptions();
        CheckShapeKeys(options, key);
        return RequiredValue(options, key, _reader.Here);
    }
    private static void CheckShapeKeys(List<Option> options, params string[] keys)
    {
        foreach (var option in options) if (!keys.Contains(option.Key)) throw new CompileError("TIKZ002", $"Unsupported shape option '{option.Key}'.", option.Source);
    }
    private static Source RequiredValue(List<Option> options, string key, Source origin)
        => options.LastOrDefault(o => o.Key == key)?.Value ?? throw new CompileError("TIKZ001", $"Missing '{key}'.", origin);
    private Source ReadDimensionGroup() => _reader.Group('(', ')');
    private Coordinate ReadCoordinate()
    {
        var origin = _reader.Here;
        var relative = _reader.Take("++") ? 2 : _reader.Take("+") ? 1 : 0;
        var group = _reader.Group('(', ')');
        var cartesian = Options.Split(group, ',', budget);
        if (cartesian.Count == 2) return new(Expression.Parse(cartesian[0], budget), Expression.Parse(cartesian[1], budget), "", false, relative, origin);
        if (cartesian.Count != 1) throw new CompileError("TIKZ001", "Expected a two-dimensional coordinate.", group);
        var polar = Options.Split(group, ':', budget);
        if (polar.Count == 2) return new(Expression.Parse(polar[0], budget), Expression.Parse(polar[1], budget), "", true, relative, origin);
        if (polar.Count != 1) throw new CompileError("TIKZ001", "Invalid polar coordinate.", group);
        return new(null, null, Options.Clean(group), false, relative, origin);
    }
}

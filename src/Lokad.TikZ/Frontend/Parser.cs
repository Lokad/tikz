using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Frontend;

internal sealed class Parser(Source source, Budget budget, IReadOnlyDictionary<string, Source>? bindings = null)
{
    private readonly Cursor _reader = new(source, budget);
    internal List<Statement> Body(int depth) => Statements("", depth);
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
                result.Add(new ScopeStatement([], new Parser(group, budget, bindings).Statements("", depth + 1), group));
                continue;
            }
            var command = _reader.Command();
            if (bindings is not null && command.Value is "\\node" or "\\coordinate" or "\\path" or "\\draw" or "\\fill" or "\\filldraw" or "\\clip")
            {
                // Parse one bound statement at a time. Nested foreach headers and
                // bodies remain templates until their own scoped binding exists.
                while (!_reader.Take(";"))
                {
                    if (_reader.End) throw new CompileError("TIKZ001", "Unterminated loop statement; expected ';'.", command);
                    if (_reader.Peek is '{' or '[' or '(')
                    {
                        var open = _reader.Peek;
                        _reader.Group(open, open == '{' ? '}' : open == '[' ? ']' : ')');
                    }
                    else _reader.Advance();
                }
                var template = command with { Length = source.Offset + _reader.Position - command.Offset };
                result.AddRange(new Parser(Bind(template), budget).Body(depth));
                continue;
            }
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
                case "\\tikzset": result.Add(new SetStatement(Options.Read(Bind(_reader.Group('{', '}')), budget), command)); break;
                case "\\usetikzlibrary": result.Add(new LibraryStatement(Bind(_reader.Group('{', '}')), command)); break;
                case "\\foreach": result.Add(ReadForeach(command)); break;
                case "\\node": result.Add(ReadNode(command)); break;
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
    private Source Bind(Source value) => bindings is null ? value : SourceExpansion.Bind(value, bindings, budget);
    private List<Option> ReadOptions() => _reader.Peek == '[' ? Options.Read(Bind(_reader.Group('[', ']')), budget) : [];
    private ForeachStatement ReadForeach(Source command)
    {
        var variable = _reader.Command();
        if (variable.Length < 2 || variable.Span[1..].ContainsAnyExcept("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"))
            throw new CompileError("TIKZ002", "Foreach requires one ASCII-letter control-sequence variable.", variable);
        if (variable.Value is "\\begin" or "\\end" or "\\foreach" or "\\tikzset" or "\\usetikzlibrary" or "\\node" or "\\coordinate"
            or "\\path" or "\\draw" or "\\fill" or "\\filldraw" or "\\clip" or "\\shade"
            || variable.Span[1..].StartsWith("pgf", StringComparison.Ordinal) || variable.Span[1..].StartsWith("tikz", StringComparison.Ordinal))
            throw new CompileError("TIKZ002", "Foreach cannot bind a reserved TikZ control sequence.", variable);
        if (_reader.Peek is '[' or '/' or '\\') throw new CompileError("TIKZ002", "Foreach options and multiple variables are unsupported.", _reader.Here);
        if (!_reader.Word("in")) throw new CompileError("TIKZ001", "Expected 'in' after the foreach variable.", _reader.Here);
        if (_reader.Peek != '{') throw new CompileError("TIKZ002", "Foreach requires a literal braced list.", _reader.Here);
        var values = _reader.Group('{', '}');
        if (_reader.Peek != '{') throw new CompileError("TIKZ002", "Foreach requires a braced statement body.", _reader.Here);
        var body = _reader.Group('{', '}');
        return new(variable, values, body, command with { Length = source.Offset + _reader.Position - command.Offset });
    }
    private NodeStatement ReadNode(Source command, bool pathLabel = false)
    {
        var options = new List<Option>();
        var name = "";
        Coordinate? at = null;
        while (_reader.Peek != '{')
        {
            if (_reader.End || _reader.Peek == ';') throw new CompileError("TIKZ001", "Expected a grouped node label.", _reader.Here);
            if (_reader.Peek == '[') options.AddRange(ReadOptions());
            else if (_reader.Peek == '(')
            {
                var group = _reader.Group('(', ')');
                if (name.Length > 0) throw new CompileError("TIKZ001", "Duplicate node name.", group);
                name = Options.Clean(group);
                if (name.Length == 0) throw new CompileError("TIKZ001", "Expected a node name.", group);
                foreach (var ch in name)
                {
                    budget.Charge(group);
                    if (!char.IsAsciiLetterOrDigit(ch) && ch is not ('_' or '-'))
                        throw new CompileError("TIKZ002", "Node names require ASCII letters, digits, '_' or '-'.", group);
                }
            }
            else if (_reader.Word("at"))
            {
                if (pathLabel) throw new CompileError("TIKZ002", "Path labels use segment placement; explicit 'at' is unsupported.", _reader.Here);
                if (at is not null) throw new CompileError("TIKZ001", "Duplicate node position.", _reader.Here);
                at = ReadCoordinate();
            }
            else throw new CompileError("TIKZ002", "Unsupported node syntax.", _reader.Here);
        }
        var label = _reader.Group('{', '}');
        if (!pathLabel) _reader.Require(";");
        return new(name, at, options, label, command with { Length = source.Offset + _reader.Position - command.Offset });
    }
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
            else if (_reader.Take("--"))
            {
                if (_reader.Word("cycle")) operations.Add(new CloseOperation(origin));
                else
                {
                    var labels = ReadPathLabels();
                    operations.Add(new LineOperation(ReadCoordinate(), "line", origin) { Labels = labels });
                }
            }
            else if (_reader.Take("|-")) operations.Add(new LineOperation(ReadCoordinate(), "vh", origin));
            else if (_reader.Take("-|")) operations.Add(new LineOperation(ReadCoordinate(), "hv", origin));
            else if (_reader.Word("to")) operations.Add(ReadConnection(origin, false));
            else if (_reader.Word("edge")) operations.Add(ReadConnection(origin, true));
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
        return new(command.Value, options, operations, command with { Length = source.Offset + _reader.Position - command.Offset });
    }
    private Source ShapeOptions(string key)
    {
        var options = ReadOptions();
        CheckShapeKeys(options, key);
        return RequiredValue(options, key, _reader.Here);
    }
    private PathOperation ReadConnection(Source origin, bool separate)
    {
        var options = new List<Option>();
        while (_reader.Peek == '[') options.AddRange(ReadOptions());
        var labels = ReadPathLabels();
        if (separate && labels.Count > 0) throw new CompileError("TIKZ002", "Labels on separate edges are unsupported.", labels[0].Source.Slice(0, 1));
        if (_reader.Peek is not ('(' or '+'))
            throw new CompileError("TIKZ002", "To/edge requires a coordinate target; custom to paths are unsupported.", _reader.Here);
        var target = ReadCoordinate();
        var span = origin with { Length = source.Offset + _reader.Position - origin.Offset };
        return separate ? new EdgeOperation(target, options, span) { Labels = labels } : new ToOperation(target, options, span) { Labels = labels };
    }
    private List<NodeStatement> ReadPathLabels()
    {
        var labels = new List<NodeStatement>();
        while (true)
        {
            var origin = _reader.Here;
            if (!_reader.Word("node")) return labels;
            budget.Charge(origin);
            labels.Add(ReadNode(origin, true));
            if (labels.Count > budget.Limits.MaxNodes) Budget.Fail(origin, "path labels");
        }
    }
    private static void CheckShapeKeys(List<Option> options, params string[] keys)
    {
        foreach (var option in options) if (!keys.Contains(option.Key)) throw new CompileError("TIKZ002", $"Unsupported shape option '{option.Key}'.", option.Source);
    }
    private static Source RequiredValue(List<Option> options, string key, Source origin)
        => options.LastOrDefault(o => o.Key == key)?.Value ?? throw new CompileError("TIKZ001", $"Missing '{key}'.", origin);
    private Source ReadDimensionGroup() => _reader.Group('(', ')');
    private Coordinate ReadCoordinate() => CoordinateReader.Read(_reader, budget);
}

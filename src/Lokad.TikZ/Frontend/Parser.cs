using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Frontend;

internal sealed class Parser(Source source, Budget budget, IReadOnlyDictionary<string, Source>? bindings = null, bool deferTemplates = false,
    IReadOnlyCollection<string>? definitionNames = null)
{
    private readonly Cursor _reader = new(source, budget);
    private bool _templates = deferTemplates;
    private HashSet<string> _definitions = definitionNames is null ? [] : CopyNames(definitionNames, source, budget);
    private static HashSet<string> CopyNames(IReadOnlyCollection<string> names, Source origin, Budget budget)
    {
        budget.Charge(origin, names.Count);
        return new(names, StringComparer.Ordinal);
    }
    internal List<Statement> Body(int depth)
    {
        var result = Statements(null, depth);
        _reader.Complete();
        return result;
    }
    public List<Statement> Parse(TikzInputKind kind)
    {
        if (kind == TikzInputKind.PictureBody) return Body(0);
        var result = new List<Statement>();
        while (!_reader.End)
        {
            var command = _reader.Command();
            var commandName = command.Value;
            switch (commandName)
            {
                case "\\usetikzlibrary": result.Add(new LibraryStatement(_reader.Group('{', '}'), command)); break;
                case "\\tikzset": result.Add(ReadSet(command)); break;
                case "\\def": result.Add(ReadDefinition(command)); break;
                case "\\pgfmathsetmacro": result.Add(ReadMathAssignment(command)); break;
                case "\\begin":
                    var environment = Options.Clean(_reader.Group('{', '}'));
                    if (environment != "tikzpicture") throw new CompileError("TIKZ002", "Expected a tikzpicture environment.", command);
                    result.Add(ReadScope(command, "tikzpicture", 1));
                    _reader.Complete();
                    return result;
                default: throw new CompileError("TIKZ002", $"Unsupported command '{commandName}' before the picture.", command);
            }
        }
        throw new CompileError("TIKZ001", "Expected a tikzpicture environment.", source.Slice(source.Length, 0));
    }
    private List<Statement> Statements(string? environment, int depth)
    {
        budget.Depth(_reader.Here, depth, budget.Limits.MaxNesting);
        var result = new List<Statement>();
        while (!_reader.End)
        {
            if (_reader.Peek == '{')
            {
                var group = _reader.Group('{', '}');
                result.Add(new ScopeStatement([], new Parser(group, budget, bindings, _templates, _definitions).Body(depth + 1), group));
                continue;
            }
            var command = _reader.Command();
            var commandName = command.Value;
            if (_templates && commandName is "\\node" or "\\coordinate" or "\\path" or "\\draw" or "\\fill" or "\\filldraw" or "\\clip")
            {
                result.Add(new TemplateStatement(ReadStatementTemplate(command)));
                continue;
            }
            if (bindings is not null && commandName is "\\node" or "\\coordinate" or "\\path" or "\\draw" or "\\fill" or "\\filldraw" or "\\clip")
            {
                // Parse one bound statement at a time. Nested foreach headers and
                // bodies remain templates until their own scoped binding exists.
                var template = ReadStatementTemplate(command);
                result.AddRange(new Parser(Bind(template), budget).Body(depth));
                continue;
            }
            switch (commandName)
            {
                case "\\end":
                    var end = Options.Clean(_reader.Group('{', '}'));
                    if (environment is null || environment != end) throw new CompileError("TIKZ001", $"Unexpected end of '{end}'.", command);
                    return result;
                case "\\begin":
                    var begin = Options.Clean(_reader.Group('{', '}'));
                    if (begin != "scope") throw new CompileError("TIKZ002", $"Unsupported environment '{begin}'.", command);
                    result.Add(ReadScope(command, "scope", depth + 1));
                    break;
                case "\\tikzset": result.Add(ReadSet(command)); break;
                case "\\def": result.Add(ReadDefinition(command)); break;
                case "\\usetikzlibrary": result.Add(new LibraryStatement(Bind(_reader.Group('{', '}')), command)); break;
                case "\\foreach": result.Add(ReadForeach(command)); break;
                case "\\pgfmathsetmacro": result.Add(ReadMathAssignment(command)); break;
                case "\\node": result.Add(ReadNode(command)); break;
                case "\\coordinate":
                    var name = Options.Clean(_reader.Group('(', ')'));
                    if (!_reader.Word("at")) throw new CompileError("TIKZ001", "Expected 'at'.", _reader.Here);
                    var point = ReadCoordinate();
                    _reader.Require(";");
                    result.Add(new CoordinateStatement(name, point, command));
                    break;
                case "\\path" or "\\draw" or "\\fill" or "\\filldraw" or "\\clip":
                    result.Add(ReadPath(command, commandName));
                    break;
                default:
                    if (_templates && _definitions.Contains(commandName)) result.Add(new DefinitionCallStatement(command));
                    else throw new CompileError("TIKZ002", $"Unsupported command '{commandName}'.", command);
                    break;
            }
        }
        if (environment is not null) throw new CompileError("TIKZ001", $"Missing end of '{environment}'.", source.Slice(source.Length, 0));
        return result;
    }
    private Source Bind(Source value) => bindings is null ? value : SourceExpansion.Bind(value, bindings, budget);
    private Source ReadStatementTemplate(Source command)
    {
        while (!_reader.Take(";"))
        {
            if (_reader.End) throw new CompileError("TIKZ001", "Unterminated statement; expected ';'.", command);
            if (_reader.Peek is '{' or '[' or '(')
            {
                var open = _reader.Peek;
                _reader.Group(open, open == '{' ? '}' : open == '[' ? ']' : ')');
            }
            else _reader.Advance();
        }
        return command with { Length = source.Offset + _reader.Position - command.Offset };
    }
    private ScopeStatement ReadScope(Source command, string environment, int depth)
    {
        var outer = _templates;
        var names = _definitions.Count == 0 ? null : CopyNames(_definitions, command, budget);
        Source? template = null;
        List<Option> options;
        if (_templates && _reader.Peek == '[') { template = _reader.Group('[', ']'); options = []; }
        else options = ReadOptions();
        var body = Statements(environment, depth);
        _templates = outer;
        if (names is null) _definitions.Clear(); else _definitions = names;
        return new(options, body, command) { OptionsTemplate = template };
    }
    private SetStatement ReadSet(Source command)
    {
        var group = _reader.Group('{', '}');
        if (!_templates) group = Bind(group);
        return _templates ? new([], command) { OptionsTemplate = group } : new(Options.Read(group, budget), command);
    }
    private DefinitionStatement ReadDefinition(Source command)
    {
        if (_reader.Peek != '\\') throw new CompileError("TIKZ002", "Token definitions require one unbraced control-sequence target.", _reader.Here);
        var variable = ReadVariable("Token definition");
        if (_reader.Peek != '{') throw new CompileError("TIKZ002", "Token definitions support zero arguments and a braced body.", _reader.Here);
        var body = _reader.Group('{', '}');
        for (var position = 0; position < body.Length; position++)
        {
            budget.Charge(body.Slice(position, 1));
            if (body.Span[position] == '%') { while (position < body.Length && body.Span[position] != '\n') { budget.Charge(body); position++; } continue; }
            if (body.Span[position] == '\\') { position++; continue; }
            if (body.Span[position] == '#') throw new CompileError("TIKZ002", "Token-definition parameters are unsupported.", body.Slice(position, 1));
        }
        _templates = true;
        _definitions.Add(variable.Value);
        return new(variable, body, command with { Length = source.Offset + _reader.Position - command.Offset });
    }
    private List<Option> ReadOptions() => _reader.Peek == '[' ? Options.Read(Bind(_reader.Group('[', ']')), budget) : [];
    private ForeachStatement ReadForeach(Source command)
    {
        var variable = ReadVariable("Foreach");
        if (_reader.Peek is '[' or '/' or '\\') throw new CompileError("TIKZ002", "Foreach options and multiple variables are unsupported.", _reader.Here);
        if (!_reader.Word("in")) throw new CompileError("TIKZ001", "Expected 'in' after the foreach variable.", _reader.Here);
        if (_reader.Peek != '{') throw new CompileError("TIKZ002", "Foreach requires a literal braced list.", _reader.Here);
        var values = _reader.Group('{', '}');
        if (_reader.Peek != '{') throw new CompileError("TIKZ002", "Foreach requires a braced statement body.", _reader.Here);
        var body = _reader.Group('{', '}');
        return new(variable, values, body, command with { Length = source.Offset + _reader.Position - command.Offset });
    }
    private MathAssignmentStatement ReadMathAssignment(Source command)
    {
        if (_reader.Peek != '\\') throw new CompileError("TIKZ002", "Numeric assignments require one unbraced control-sequence target.", _reader.Here);
        var variable = ReadVariable("Numeric assignment");
        if (_reader.Peek != '{') throw new CompileError("TIKZ001", "Expected a braced numeric expression.", _reader.Here);
        var expression = Bind(_reader.Group('{', '}'));
        _definitions.Remove(variable.Value);
        return new(variable, expression, command with { Length = source.Offset + _reader.Position - command.Offset });
    }
    private Source ReadVariable(string feature)
    {
        var variable = _reader.Command();
        if (variable.Length < 2 || variable.Span[1..].ContainsAnyExcept("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"))
            throw new CompileError("TIKZ002", $"{feature} requires one ASCII-letter control-sequence variable.", variable);
        if (variable.Value is "\\begin" or "\\end" or "\\foreach" or "\\def" or "\\tikzset" or "\\usetikzlibrary" or "\\node" or "\\coordinate"
            or "\\path" or "\\draw" or "\\fill" or "\\filldraw" or "\\clip" or "\\shade"
            || variable.Span[1..].StartsWith("pgf", StringComparison.Ordinal) || variable.Span[1..].StartsWith("tikz", StringComparison.Ordinal))
            throw new CompileError("TIKZ002", $"{feature} cannot bind a reserved TikZ control sequence.", variable);
        return variable;
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
    private PathStatement ReadPath(Source command, string commandName)
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
                else if (_reader.Word("plot")) operations.Add(ReadPlot(origin, true));
                else operations.Add(ReadLabelledLine(origin, "line"));
            }
            else if (_reader.Word("plot")) operations.Add(ReadPlot(origin, false));
            else if (_reader.Take("|-")) operations.Add(ReadLabelledLine(origin, "vh"));
            else if (_reader.Take("-|")) operations.Add(ReadLabelledLine(origin, "hv"));
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
                Expression x;
                Expression y;
                List<Expression> radiusAssignments = [];
                if (_reader.Peek == '[')
                {
                    var values = ReadOptions();
                    start = RequiredValue(values, "start angle", origin);
                    end = RequiredValue(values, "end angle", origin);
                    CheckShapeKeys(values, "start angle", "end angle", "radius", "x radius", "y radius");
                    foreach (var option in values)
                        if (option.Key == "radius") radiusAssignments.Add(Expression.Parse(option.Value, budget));
                    x = Axis("x radius");
                    y = Axis("y radius");

                    Expression Axis(string key)
                    {
                        var option = values.LastOrDefault(v => v.Key == key || v.Key == "radius")
                            ?? throw new CompileError("TIKZ001", $"Missing '{key}'.", origin);
                        return option.Key == "radius" ? radiusAssignments[^1] : Expression.Parse(option.Value, budget);
                    }
                }
                else
                {
                    var parts = Options.Split(_reader.Group('(', ')'), ':', budget);
                    if (parts.Count != 3) throw new CompileError("TIKZ001", "Expected arc(start:end:radius).", origin);
                    start = parts[0]; end = parts[1]; x = Expression.Parse(parts[2], budget); y = Expression.Parse(parts[2], budget);
                }
                operations.Add(new ArcOperation(Expression.Parse(start, budget), Expression.Parse(end, budget), x, y, origin)
                    { RadiusAssignments = radiusAssignments });
            }
            else if (_reader.Peek == '[') operations.Add(new PathOptionsOperation(ReadOptions(), origin));
            else throw new CompileError("TIKZ002", "Unsupported path operation.", origin);
            if (operations.Count > budget.Limits.MaxSegments) Budget.Fail(origin, "path operations");
        }
        return new(commandName, options, operations, command with { Length = source.Offset + _reader.Position - command.Offset });
    }
    private Source ShapeOptions(string key)
    {
        var options = ReadOptions();
        CheckShapeKeys(options, key);
        return RequiredValue(options, key, _reader.Here);
    }
    private PlotOperation ReadPlot(Source origin, bool connect)
    {
        var options = ReadOptions();
        if (_reader.Peek == '(')
        {
            var point = ReadCoordinate();
            if (point.X is null || point.Y is null || point.Calculation is not null)
                throw new CompileError("TIKZ002", "Function plots require explicit Cartesian or polar expressions.", point.Source);
            return new([], options, connect, origin with { Length = source.Offset + _reader.Position - origin.Offset }) { FunctionPoint = point };
        }
        if (!_reader.Word("coordinates"))
            throw new CompileError("TIKZ002", "Only coordinate lists and in-process function plot expressions are supported.", _reader.Here);
        var reader = new Cursor(_reader.Group('{', '}'), budget);
        var points = new List<Coordinate>();
        while (!reader.End)
        {
            budget.Charge(reader.Here);
            if (reader.Peek is not ('(' or '+'))
                throw new CompileError("TIKZ001", "Expected a plot coordinate.", reader.Here);
            if (points.Count >= budget.Limits.MaxSegments) Budget.Fail(reader.Here, "plot points");
            points.Add(CoordinateReader.Read(reader, budget));
        }
        return new(points, options, connect, origin with { Length = source.Offset + _reader.Position - origin.Offset });
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
    private LineOperation ReadLabelledLine(Source origin, string kind)
    {
        var labels = ReadPathLabels();
        return new(ReadCoordinate(), kind, origin) { Labels = labels };
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

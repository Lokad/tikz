using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;

namespace Lokad.TikZ.Semantics;

internal sealed partial class Evaluator(Budget budget)
{
    private readonly HashSet<(string Name, int Offset)> _definitionCalls = [];
    private readonly GraphicsScene _scene = new();
    private Dictionary<string, Point> _coordinates => _scene.Coordinates;
    public GraphicsScene Evaluate(List<Statement> statements, TikzOptions options)
    {
        var state = new EvaluationState
        {
            CoordinateValue = (coordinate, current) => PathCoordinate(coordinate, current, default, out _)
        };
        var origin = statements.FirstOrDefault()?.Source ?? new Source("", 0, 0);
        state.Styles["every edge"] = [new("draw", origin.Slice(0, 0), origin)];
        foreach (var library in options.Libraries) LoadLibrary(library, state, statements.FirstOrDefault()?.Source ?? new Source("", 0, 0));
        Statements(statements, state, 0);
        return _scene;
    }
    private void LoadLibrary(string name, EvaluationState state, Source source)
    {
        budget.Charge(source);
        if (name is not ("shapes.geometric" or "arrows.meta" or "calc" or "positioning")) throw new CompileError("TIKZ002", $"Unsupported TikZ library '{name}'.", source);
        if (state.Libraries.Add(name) && name == "positioning")
        {
            state.PositioningAvailable = true;
            state.NodeDistance = new("1cm and 1cm", 0, 11);
        }
    }
    private void Statements(List<Statement> statements, EvaluationState state, int depth,
        IReadOnlyDictionary<string, Source>? bindings = null, int loopDepth = 0)
    {
        foreach (var statement in statements)
        {
            budget.Depth(statement.Source, depth, budget.Limits.MaxNesting);
            switch (statement)
            {
                case ScopeStatement scope:
                    var child = state.Clone(budget, scope.Source);
                    KeyRegistry.Apply(scope.OptionsTemplate is { } scopeTemplate ? Options.Read(scopeTemplate, budget) : scope.Options, child, budget);
                    DashPattern.Resolve(child, budget);
                    Statements(scope.Body, child, depth + 1, bindings, loopDepth);
                    break;
                case SetStatement set: KeyRegistry.Apply(set.OptionsTemplate is { } setTemplate ? Options.Read(setTemplate, budget) : set.Options, state, budget); break;
                case DefinitionStatement definition:
                    if (bindings?.ContainsKey(definition.Variable.Value) == true)
                        throw new CompileError("TIKZ002", "Token definition of an active foreach variable is unsupported.", definition.Variable);
                    budget.Charge(definition.Source);
                    state.Definitions[definition.Variable.Value] = definition;
                    state.NumericBindings.Remove(definition.Variable.Value);
                    state.Variables.Remove(definition.Variable.Value);
                    break;
                case DefinitionCallStatement invocation:
                    if (!state.Definitions.TryGetValue(invocation.Source.Value, out var called))
                        throw new CompileError("TIKZ002", $"Unsupported command '{invocation.Source.Value}'.", invocation.Source);
                    budget.Depth(invocation.Source, _definitionCalls.Count + 1, budget.Limits.MaxExpansionDepth);
                    var identity = TokenExpansion.Identity(called, budget);
                    if (!_definitionCalls.Add(identity)) throw new CompileError("TIKZ003", $"Recursive token definition '{called.Variable.Value}'.", invocation.Source);
                    try
                    {
                        budget.Charge(called.Source, (called.Body.RelatedSources?.Length ?? 0) + 2);
                        var calledBody = called.Body with { RelatedSources = [.. called.Body.RelatedSources ?? [], called.Variable, invocation.Source] };
                        var expandedBody = new Parser(calledBody, budget, deferTemplates: true, definitionNames: state.Definitions.Keys).Body(depth);
                        Statements(expandedBody, state, depth, bindings, loopDepth);
                    }
                    finally { _definitionCalls.Remove(identity); }
                    break;
                case TemplateStatement templateStatement:
                    var expanded = new TokenExpansion(state, budget).Expand(templateStatement.Source, protectOptions: true);
                    Statements(new Parser(expanded, budget).Body(depth), state, depth, bindings, loopDepth);
                    break;
                case MathAssignmentStatement assignment:
                    if (bindings?.ContainsKey(assignment.Variable.Value) == true)
                        throw new CompileError("TIKZ002", "Numeric assignment to an active foreach variable is unsupported.", assignment.Variable);
                    var assignmentSource = state.Definitions.Count == 0 ? assignment.Expression : new TokenExpansion(state, budget).Expand(assignment.Expression);
                    var expression = SourceExpansion.Bind(assignmentSource, state.NumericBindings, budget, removeComments: true);
                    var printed = PgfScalarArithmetic.Evaluate(expression, budget);
                    var assigned = SourceExpansion.Generated(printed, assignment.Expression, [assignment.Variable, expression], budget);
                    state.NumericBindings[assignment.Variable.Value] = assigned;
                    state.Definitions.Remove(assignment.Variable.Value);
                    state.Variables[assignment.Variable.Value] = new(double.Parse(printed, System.Globalization.CultureInfo.InvariantCulture), false) { Origin = assigned };
                    budget.Charge(assignment.Source);
                    _scene.NumericAssignments.Add(new(assignment.Variable.Value, printed, assigned));
                    break;
                case LibraryStatement libraries:
                    var libraryNames = state.Definitions.Count == 0 ? libraries.Names : new TokenExpansion(state, budget).Expand(libraries.Names);
                    foreach (var name in Options.Split(libraryNames, ',', budget)) LoadLibrary(Options.Clean(name), state, name);
                    break;
                case ForeachStatement loop:
                    budget.Depth(loop.Source, loopDepth + 1, budget.Limits.MaxExpansionDepth);
                    budget.Charge(loop.Source, (bindings?.Count ?? 0) + 1);
                    var local = bindings is null ? new Dictionary<string, Source>(StringComparer.Ordinal)
                        : bindings.ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal);
                    var loopValues = state.Definitions.Count == 0 ? loop.Values : new TokenExpansion(state, budget).Expand(loop.Values);
                    foreach (var value in ForeachValues.Read(loopValues, bindings, budget))
                    {
                        budget.Iteration(value);
                        budget.Charge(value, (value.RelatedSources?.Length ?? 0) + 1);
                        local[loop.Variable.Value] = value with { RelatedSources = [.. value.RelatedSources ?? [], loop.Variable] };
                        var iterationState = state.Clone(budget, loop.Source);
                        iterationState.TemplateBindings = local;
                        var body = new Parser(loop.Body, budget, local, state.Definitions.Count != 0,
                            state.Definitions.Count == 0 ? null : state.Definitions.Keys).Body(depth + 1);
                        Statements(body, iterationState, depth + 1, local, loopDepth + 1);
                    }
                    break;
                case CoordinateStatement coordinate:
                    budget.Node(coordinate.Source);
                    var point = Resolve(coordinate.Point, state, default, out _);
                    _nodes.Remove(coordinate.Name);
                    _coordinates[coordinate.Name] = point;
                    break;
                case NodeStatement node: Node(node with { Source = state.Relate(node.Source, budget) }, state); break;
                case PathStatement path: Path(path with { Source = state.Relate(path.Source, budget) }, state); break;
                default: throw new InvalidOperationException("Unknown semantic statement.");
            }
        }
    }
    private Point Resolve(Coordinate coordinate, EvaluationState state, Point reference, out bool updateReference)
    {
        coordinate = coordinate with { Source = state.Relate(coordinate.Source, budget) };
        budget.Charge(coordinate.Source);
        updateReference = coordinate.Relative != 1;
        Point point;
        if (coordinate.Calculation is not null)
        {
            point = PgfTransform.Apply(state.Transform, Calculate(coordinate.Calculation, state), budget, coordinate.Source);
            if (coordinate.Relative != 0) point -= PgfTransform.Apply(state.Transform, default, budget, coordinate.Source);
        }
        else if (coordinate.X is null || coordinate.Y is null)
        {
            if (!_coordinates.TryGetValue(coordinate.Name, out point)) point = NodeAnchor(coordinate.Name, coordinate.Source);
            point = PgfCoordinates.RoundTrip(point, state.Transform, coordinate.Source);
        }
        else
        {
            var x = coordinate.X.Evaluate(state.Variables, budget);
            var y = coordinate.Y.Evaluate(state.Variables, budget);
            if (coordinate.Polar)
            {
                point = Polar(x.Value, y, state, coordinate.Source);
            }
            else point = (x.HasUnit ? new Point(x.Bp, 0) : PgfTransform.Scale(state.XBasis, x.Value, budget, coordinate.Source))
                + (y.HasUnit ? new Point(0, y.Bp) : PgfTransform.Scale(state.YBasis, y.Value, budget, coordinate.Source));
            point = coordinate.Relative == 0 ? PgfTransform.Apply(state.Transform, point, budget, coordinate.Source)
                : PgfTransform.Apply(state.Transform, point, budget, coordinate.Source) - PgfTransform.Apply(state.Transform, default, budget, coordinate.Source);
        }
        if (coordinate.Relative != 0) point += reference;
        budget.Check(point.X, coordinate.Source); budget.Check(point.Y, coordinate.Source);
        return point;
    }

    private Point PathCoordinate(Coordinate coordinate, EvaluationState state, Point reference, out bool updateReference)
    {
        coordinate = coordinate with { Source = state.Relate(coordinate.Source, budget) };
        budget.Charge(coordinate.Source);
        updateReference = coordinate.Relative != 1;
        Point point;
        if (coordinate.Calculation is not null) point = Calculate(coordinate.Calculation, state);
        else if (coordinate.X is null || coordinate.Y is null)
        {
            if (!_coordinates.TryGetValue(coordinate.Name, out point)) point = NodeAnchor(coordinate.Name, coordinate.Source);
            point = PgfCoordinates.ToLocal(point, state.Transform, coordinate.Source);
        }
        else
        {
            var x = coordinate.X.Evaluate(state.Variables, budget);
            var y = coordinate.Y.Evaluate(state.Variables, budget);
            if (coordinate.Polar)
            {
                point = Polar(x.Value, y, state, coordinate.Source);
            }
            else point = (x.HasUnit ? new Point(x.Bp, 0) : PgfTransform.Scale(state.XBasis, x.Value, budget, coordinate.Source))
                + (y.HasUnit ? new Point(0, y.Bp) : PgfTransform.Scale(state.YBasis, y.Value, budget, coordinate.Source));
        }
        if (coordinate.Relative != 0) point += reference;
        budget.Check(point.X, coordinate.Source); budget.Check(point.Y, coordinate.Source);
        return point;
    }
    private Point Polar(double degrees, Number radius, EvaluationState state, Source source)
    {
        var rotation = PgfTransform.Rotation(degrees, budget, source);
        if (radius.HasUnit)
            return PgfTransform.Scale(new(radius.Bp, 0), rotation.A, budget, source) + PgfTransform.Scale(new(0, radius.Bp), rotation.B, budget, source);
        // pgfpointpolarxy first multiplies the radius as a TeX pt register,
        // then prints that finite result before multiplying the basis vectors.
        var register = new Point(radius.Value * 72 / 72.27, 0);
        var x = PgfTransform.Scale(register, rotation.A, budget, source).X;
        var y = PgfTransform.Scale(register, rotation.B, budget, source).X;
        const double spPerBp = 72.27 * 65536 / 72;
        return PgfTransform.Scale(state.XBasis, PgfTransform.Printed((long)Math.Round(x * spPerBp)), budget, source)
            + PgfTransform.Scale(state.YBasis, PgfTransform.Printed((long)Math.Round(y * spPerBp)), budget, source);
    }
    private void Path(PathStatement statement, EvaluationState parent)
    {
        var state = parent.Clone(budget, statement.Source);
        state.Paint = state.Paint with
        {
            Stroke = state.Paint.Stroke || statement.Command is "\\draw" or "\\filldraw",
            Fill = state.Paint.Fill || statement.Command is "\\fill" or "\\filldraw"
        };
        KeyRegistry.ApplyStyle("every path", state, budget, statement.Source, clipping: statement.Command == "\\clip");
        KeyRegistry.Apply(statement.Options, state, budget, clipping: statement.Command == "\\clip");
        var firstLabel = statement.Operations.SelectMany(operation => operation.Labels).FirstOrDefault();
        if (firstLabel is not null && (statement.Command == "\\clip" || statement.Operations.Any(operation => operation is EdgeOperation)))
            throw new CompileError("TIKZ002", "Path labels combined with a new clip or separate edges are unsupported.", firstLabel.Source);
        var path = new GraphicPath(budget, statement.Source);
        var edges = new List<(GraphicPath Path, EvaluationState State, Source Source)>();
        var labels = new List<Action>();
        var reference = default(Point);
        var position = default(Point);
        ResolvedNode? pending = null;
        Source pendingSource = statement.Source;
        foreach (var operation in statement.Operations)
        {
            budget.Charge(operation.Source);
            switch (operation)
            {
                case MoveOperation move:
                    position = Point(move.Point);
                    pending = ImplicitNode(move.Point); pendingSource = move.Point.Source;
                    if (pending is null) path.Move(Global(position));
                    break;
                case LineOperation line:
                    var end = Point(line.Point);
                    var targetNode = ImplicitNode(line.Point);
                    if (line.Kind is "vh" or "hv")
                    {
                        var orthogonalCorner = Corner(position, end, line.Kind == "hv");
                        var startPoint = FlushToward(orthogonalCorner);
                        // Correcting the initial border also changes the leg
                        // perpendicular to the incoming target's border.
                        orthogonalCorner = Corner(startPoint, end, line.Kind == "hv");
                        var border = targetNode is null ? end : NodeBorder(targetNode, orthogonalCorner, state.Transform, line.Point.Source);
                        orthogonalCorner = Corner(startPoint, border, line.Kind == "hv");
                        path.Line(Global(orthogonalCorner)); path.Line(Global(border));
                        // TikZ's orthogonal timer starts at the logical source,
                        // before its border is flushed, and ends at the target border.
                        PathLabels(line, new(position, default, default, border), false, state, labels,
                            Corner(position, border, line.Kind == "hv"));
                    }
                    else
                    {
                        var border = targetNode is null ? end : NodeBorder(targetNode, position, state.Transform, line.Point.Source);
                        var labelStart = FlushToward(border);
                        path.Line(Global(border));
                        PathLabels(line, new(labelStart, default, default, border), false, state, labels);
                    }
                    position = end;
                    pending = targetNode; pendingSource = line.Point.Source;
                    break;
                case CurveOperation curve:
                    var before = position;
                    var a = PathCoordinate(curve.A, state, before, out _);
                    var target = Point(curve.End);
                    var b = PathCoordinate(curve.B, state, curve.B.Relative == 0 ? before : target, out _);
                    FlushToward(a);
                    var curveNode = ImplicitNode(curve.End);
                    path.Cubic(Global(a), Global(b), Global(curveNode is null ? target : NodeBorder(curveNode, b, state.Transform, curve.End.Source)));
                    position = target;
                    pending = curveNode; pendingSource = curve.End.Source;
                    break;
                case PlotOperation plot:
                    // PGF groups every-plot/local options while retaining the
                    // enclosing path's paint. The plot scanner updates TikZ's
                    // last position even when the handler starts a new subpath.
                    Flush();
                    var plotState = state.Clone(budget, plot.Source);
                    KeyRegistry.ApplyStyle("every plot", plotState, budget, plot.Source);
                    KeyRegistry.Apply(plot.Options, plotState, budget);
                    position = LowerPlot(plot, plotState, path, reference);
                    reference = position;
                    pending = null;
                    break;
                case ToOperation to:
                    // TikZ prescans +/++ in the enclosing coordinate system,
                    // before applying grouped every-to and local options.
                    var scanned = to.Target.Relative == 0 ? (Point?)null : PathCoordinate(to.Target, state, reference, out _);
                    var enclosing = state;
                    state = ConnectionState(to.Options, "every to", to.Source, false);
                    CurveStyle(state);
                    var toEnd = scanned ?? PathCoordinate(to.Target, state, reference, out _);
                    if (to.Target.Relative != 1) reference = toEnd;
                    var toNode = scanned.HasValue ? null : ImplicitNode(to.Target);
                    var nextPosition = toEnd;
                    if (state.Connection.Curved)
                    {
                        var startPoint = pending is null ? position : PgfCoordinates.ToLocal(NodeAnchor(pending.Name, to.Source), state.Transform, to.Source);
                        var curveTo = Curve(startPoint, toEnd, pending, toNode, state, to.Source);
                        if (pending is not null) { path.Move(Global(curveTo.Start)); pending = null; }
                        path.Cubic(Global(curveTo.A), Global(curveTo.B), Global(curveTo.End));
                        PathLabels(to, curveTo, true, state, labels);
                        if (state.Connection.Relative)
                        {
                            // Relative curves expand their node borders to explicit
                            // coordinates. Continuation starts at that coordinate.
                            nextPosition = curveTo.End; toNode = null;
                        }
                    }
                    else
                    {
                        var toBorder = toNode is null ? toEnd : NodeBorder(toNode, position, state.Transform, to.Target.Source);
                        var labelStart = FlushToward(toBorder); path.Line(Global(toBorder));
                        PathLabels(to, new(labelStart, default, default, toBorder), false, state, labels);
                    }
                    position = nextPosition; pending = toNode; pendingSource = to.Target.Source;
                    DashPattern.Resolve(state, budget);
                    state = enclosing;
                    break;
                case EdgeOperation edge:
                    var scannedEdge = edge.Target.Relative == 0 ? (Point?)null : PathCoordinate(edge.Target, state, reference, out _);
                    var edgeState = ConnectionState(edge.Options, "every edge", edge.Source, true);
                    var edgeStartTransform = edgeState.Transform;
                    CurveStyle(edgeState);
                    var edgeEnd = scannedEdge ?? PathCoordinate(edge.Target, edgeState, reference, out _);
                    var edgeStart = pending is null ? position : PgfCoordinates.ToLocal(NodeAnchor(pending.Name, edge.Source), edgeState.Transform, edge.Source);
                    var edgeNode = scannedEdge.HasValue ? null : ImplicitNode(edge.Target);
                    var edgePath = new GraphicPath(budget, edge.Source);
                    if (edgeState.Connection.Curved)
                    {
                        var curvedEdge = Curve(edgeStart, edgeEnd, pending, edgeNode, edgeState, edge.Source);
                        // An explicit edge start is moved before every-curve
                        // options run; an implicit node start waits for its border.
                        edgePath.Move(PgfTransform.Apply(pending is null ? edgeStartTransform : edgeState.Transform, curvedEdge.Start, budget, edge.Source));
                        edgePath.Cubic(PgfTransform.Apply(edgeState.Transform, curvedEdge.A, budget, edge.Source),
                            PgfTransform.Apply(edgeState.Transform, curvedEdge.B, budget, edge.Source), PgfTransform.Apply(edgeState.Transform, curvedEdge.End, budget, edge.Source));
                    }
                    else
                    {
                        var edgeBorder = edgeNode is null ? edgeEnd : NodeBorder(edgeNode, edgeStart, edgeState.Transform, edge.Target.Source);
                        var edgeFrom = pending is null ? edgeStart : NodeBorder(pending, edgeBorder, edgeState.Transform, edge.Source);
                        edgePath.Move(PgfTransform.Apply(edgeState.Transform, edgeFrom, budget, edge.Source));
                        edgePath.Line(PgfTransform.Apply(edgeState.Transform, edgeBorder, budget, edge.Source));
                    }
                    DashPattern.Resolve(edgeState, budget);
                    edges.Add((edgePath, edgeState, edge.Source));
                    break;
                case RectangleOperation rectangle:
                    Flush();
                    var origin = position;
                    var corner = Point(rectangle.End);
                    path.Move(Global(origin)); path.Line(Global(Corner(origin, corner, false)));
                    path.Line(Global(corner)); path.Line(Global(Corner(origin, corner, true))); path.Close(); path.Move(Global(corner));
                    position = corner;
                    break;
                case EllipseOperation ellipse:
                    Flush();
                    var center = path.Current;
                    var ellipseAxes = Axes(ellipse.X, ellipse.Y, state);
                    ShapePaths.Ellipse(path, center, ellipseAxes.X, ellipseAxes.Y, budget, ellipse.Source);
                    break;
                case ArcOperation arc:
                    Flush();
                    // TikZ's shared radius key evaluates eagerly, including values
                    // later overwritten by other radius keys. Axis keys store values.
                    Number radiusValue = default;
                    foreach (var assignment in arc.RadiusAssignments)
                        radiusValue = assignment.Evaluate(state.Variables, budget);
                    var arcAxes = Axes(arc.X, arc.Y, state, arc.RadiusAssignments.LastOrDefault(), radiusValue);
                    var start = arc.Start.Evaluate(state.Variables, budget).Value;
                    var finish = arc.End.Evaluate(state.Variables, budget).Value;
                    ShapePaths.Arc(path, arcAxes.X, arcAxes.Y, start, finish, budget, arc.Source);
                    reference = PgfCoordinates.ToLocal(path.Current, state.Transform, arc.Source);
                    position = reference;
                    break;
                case CloseOperation close:
                    Flush(); path.Close(); position = PgfCoordinates.ToLocal(path.Current, state.Transform, close.Source); reference = position;
                    break;
                case PathOptionsOperation options: KeyRegistry.Apply(options.Options, state, budget, clipping: statement.Command == "\\clip"); break;
                default: throw new InvalidOperationException("Unknown path operation.");
            }
        }
        DashPattern.Resolve(state, budget);
        Bounds? bounds = statement.Command == "\\clip" ? path.Bounds : null;
        if (state.RelevantForPictureSize)
        {
            var picture = path.ControlBounds;
            _scene.PictureBounds = _scene.PictureBounds.Union(state.Paint.Stroke ? picture.Inflate(PictureStrokeRadius(state.Paint.Width)) : picture);
        }
        if (statement.Command == "\\clip")
        {
            var id = _scene.Clips.Count;
            _scene.Clips.Add(new(path, state.Paint.FillRule, statement.Source, bounds!.Value));
            parent.Clips.Add(id);
            parent.RelevantForPictureSize = false;
        }
        if (path.Segments.Count != 0 && (state.Paint.Fill || state.Paint.Stroke))
        {
            PaintResolvedPath(path, state, statement.Source, statement.Command != "\\clip", bounds);
        }
        foreach (var edge in edges)
        {
            budget.Charge(edge.Source);
            edge.State.Paint = EdgePaint.Resolve(edge.State, state.Paint);
            edge.State.Clips = [.. state.Clips];
            if (statement.Command == "\\clip")
            {
                edge.State.Clips.Add(_scene.Clips.Count - 1);
                edge.State.RelevantForPictureSize = false;
            }
            PaintEdge(edge.Path, edge.State, edge.Source);
        }
        foreach (var paintLabel in labels) paintLabel();
        EvaluationState ConnectionState(List<Option> options, string style, Source origin, bool separate)
        {
            var child = state.Clone(budget, origin);
            if (separate)
            {
                child.Paint = child.Paint with { Stroke = false, Fill = false };
                child.PaintChanges = PaintChanges.None;
                child.PendingDash = null;
                KeyRegistry.ApplyStyle("every path", child, budget, origin);
            }
            KeyRegistry.ApplyStyle(style, child, budget, origin);
            KeyRegistry.Apply(options, child, budget);
            return child;
        }
        void CurveStyle(EvaluationState child)
        {
            if (child.Connection.Curved) KeyRegistry.ApplyStyle("every curve to", child, budget, statement.Source);
        }
        Point Point(Coordinate coordinate)
        {
            var point = PathCoordinate(coordinate, state, reference, out var update);
            if (update) reference = point;
            return point;
        }
        void Flush()
        {
            if (pending is not null) { path.Move(Global(position)); pending = null; }
        }
        Point FlushToward(Point toward)
        {
            var startPoint = position;
            if (pending is not null)
            {
                startPoint = NodeBorder(pending, toward, state.Transform, pendingSource);
                path.Move(Global(startPoint));
                pending = null;
            }
            return startPoint;
        }
        Point Global(Point local) => PgfTransform.Apply(state.Transform, local, budget, statement.Source);
        static Point Corner(Point start, Point end, bool horizontalFirst)
            => horizontalFirst ? new(end.X, start.Y) : new(start.X, end.Y);
    }
    private void PaintEdge(GraphicPath path, EvaluationState state, Source source)
    {
        if (state.RelevantForPictureSize)
        {
            var picture = path.ControlBounds;
            _scene.PictureBounds = _scene.PictureBounds.Union(state.Paint.Stroke ? picture.Inflate(PictureStrokeRadius(state.Paint.Width)) : picture);
        }
        if (!state.Paint.Fill && !state.Paint.Stroke) return;
        PaintResolvedPath(path, state, source, true);
    }
    private void PaintResolvedPath(GraphicPath original, EvaluationState state, Source source, bool arrows, Bounds? originalBounds = null)
    {
        var lowering = arrows ? ArrowGeometry.Lower(original, state, budget, source) : new ArrowLowering(original, []);
        var path = lowering.Shaft;
        var ink = state.Paint.Stroke ? PathStrokeBounds.Calculate(path, state.Paint, budget, source,
                ReferenceEquals(path, original) ? originalBounds : null)
            : ReferenceEquals(path, original) && originalBounds is { } existingBounds ? existingBounds : path.Bounds;
        foreach (var clip in state.Clips) ink = ink.Intersect(_scene.Clips[clip].Bounds);
        _scene.InkBounds = _scene.InkBounds.Union(ink);
        _scene.Add(new(path, state.Paint, [.. state.Clips], source, ink));
        foreach (var tip in lowering.Tips)
        {
            budget.Charge(tip.Source);
            if (state.RelevantForPictureSize)
                foreach (var point in tip.Template.Hull)
                    _scene.PictureBounds = _scene.PictureBounds.Add(PgfTransform.Apply(tip.Transform, point.Bp, budget, tip.Source));
            var tipInk = ArrowGeometry.InkBounds(tip, budget);
            foreach (var clip in state.Clips) tipInk = tipInk.Intersect(_scene.Clips[clip].Bounds);
            _scene.InkBounds = _scene.InkBounds.Union(tipInk);
            _scene.Add(new(tip.Template.Path, tip.Template.Paint, [.. state.Clips], tip.Source, tipInk) { Transform = tip.Transform, Arrow = tip });
        }
    }
    private static double PictureStrokeRadius(double width)
    {
        const double spPerBp = 72.27 * 65536 / 72;
        return (long)Math.Round(width * spPerBp, MidpointRounding.AwayFromZero) / 2 / spPerBp;
    }
    private (Point X, Point Y) Axes(Expression xRadius, Expression yRadius, EvaluationState state,
        Expression? resolvedRadius = null, Number resolvedValue = default)
    {
        var x = ReferenceEquals(xRadius, resolvedRadius) ? resolvedValue : xRadius.Evaluate(state.Variables, budget);
        var y = ReferenceEquals(yRadius, resolvedRadius) ? resolvedValue : yRadius.Evaluate(state.Variables, budget);
        if (x.HasUnit != y.HasUnit) throw new CompileError("TIKZ001", "Cannot mix physical and dimensionless radii.", yRadius.Source);
        var xAxis = Vector(x.HasUnit ? new(x.Bp, 0) : PgfTransform.Scale(state.XBasis, x.Value, budget, xRadius.Source), xRadius.Source);
        var yAxis = Vector(y.HasUnit ? new(0, y.Bp) : PgfTransform.Scale(state.YBasis, y.Value, budget, yRadius.Source), yRadius.Source);
        budget.Check(xAxis.X, xRadius.Source); budget.Check(xAxis.Y, xRadius.Source);
        budget.Check(yAxis.X, yRadius.Source); budget.Check(yAxis.Y, yRadius.Source);
        return (xAxis, yAxis);
        Point Vector(Point value, Source source) => PgfTransform.Apply(state.Transform with { E = 0, F = 0 }, value, budget, source);
    }
}

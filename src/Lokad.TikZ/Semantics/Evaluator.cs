using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;

namespace Lokad.TikZ.Semantics;

internal sealed partial class Evaluator(Budget budget)
{
    private readonly GraphicsScene _scene = new();
    private readonly Dictionary<string, Point> _coordinates = new(StringComparer.Ordinal);
    public GraphicsScene Evaluate(List<Statement> statements, TikzOptions options)
    {
        var state = new EvaluationState();
        var origin = statements.FirstOrDefault()?.Source ?? new Source("", 0, 0);
        state.Styles["every edge"] = [new("draw", origin.Slice(0, 0), origin)];
        foreach (var library in options.Libraries) LoadLibrary(library, state, statements.FirstOrDefault()?.Source ?? new Source("", 0, 0));
        Statements(statements, state, 0);
        return _scene;
    }
    private void LoadLibrary(string name, EvaluationState state, Source source)
    {
        budget.Charge(source);
        if (name is not ("shapes.geometric" or "arrows.meta" or "calc")) throw new CompileError("TIKZ002", $"Unsupported TikZ library '{name}'.", source);
        state.Libraries.Add(name);
    }
    private void Statements(List<Statement> statements, EvaluationState state, int depth)
    {
        foreach (var statement in statements)
        {
            budget.Depth(statement.Source, depth, budget.Limits.MaxNesting);
            switch (statement)
            {
                case ScopeStatement scope:
                    var child = state.Clone(budget, scope.Source);
                    KeyRegistry.Apply(scope.Options, child, budget);
                    DashPattern.Resolve(child, budget);
                    Statements(scope.Body, child, depth + 1);
                    break;
                case SetStatement set: KeyRegistry.Apply(set.Options, state, budget); break;
                case LibraryStatement libraries:
                    foreach (var name in Options.Split(libraries.Names, ',', budget)) LoadLibrary(Options.Clean(name), state, name);
                    break;
                case CoordinateStatement coordinate:
                    budget.Node(coordinate.Source);
                    var point = Resolve(coordinate.Point, state, default, out _);
                    _nodes.Remove(coordinate.Name);
                    _coordinates[coordinate.Name] = point;
                    _scene.Coordinates[coordinate.Name] = point;
                    break;
                case NodeStatement node: Node(node, state); break;
                case PathStatement path: Path(path, state); break;
                default: throw new InvalidOperationException("Unknown semantic statement.");
            }
        }
    }
    private Point Resolve(Coordinate coordinate, EvaluationState state, Point reference, out bool updateReference)
    {
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
        if (state.Styles.TryGetValue("every path", out var every)) KeyRegistry.Apply(every, state, budget);
        KeyRegistry.Apply(statement.Options, state, budget);
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
                    var arcAxes = Axes(arc.X, arc.Y, state);
                    var start = arc.Start.Evaluate(state.Variables, budget).Value;
                    var finish = arc.End.Evaluate(state.Variables, budget).Value;
                    ShapePaths.Arc(path, arcAxes.X, arcAxes.Y, start, finish, budget, arc.Source);
                    reference = PgfCoordinates.ToLocal(path.Current, state.Transform, arc.Source);
                    position = reference;
                    break;
                case CloseOperation close:
                    Flush(); path.Close(); position = PgfCoordinates.ToLocal(path.Current, state.Transform, close.Source); reference = position;
                    break;
                case PathOptionsOperation options: KeyRegistry.Apply(options.Options, state, budget); break;
                default: throw new InvalidOperationException("Unknown path operation.");
            }
        }
        DashPattern.Resolve(state, budget);
        var bounds = path.Bounds;
        if (state.RelevantForPictureSize)
        {
            var picture = path.ControlBounds;
            _scene.PictureBounds = _scene.PictureBounds.Union(state.Paint.Stroke ? picture.Inflate(PictureStrokeRadius(state.Paint.Width)) : picture);
        }
        if (statement.Command == "\\clip")
        {
            var id = _scene.Clips.Count;
            _scene.Clips.Add(new(path, state.Paint.FillRule, statement.Source));
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
                if (child.Styles.TryGetValue("every path", out var everyPath)) KeyRegistry.Apply(everyPath, child, budget);
            }
            if (child.Styles.TryGetValue(style, out var everyConnection)) KeyRegistry.Apply(everyConnection, child, budget);
            KeyRegistry.Apply(options, child, budget);
            return child;
        }
        void CurveStyle(EvaluationState child)
        {
            if (child.Connection.Curved && child.Styles.TryGetValue("every curve to", out var everyCurve))
                KeyRegistry.Apply(everyCurve, child, budget);
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
        var ink = state.Paint.Stroke ? PathStrokeBounds.Calculate(path, state.Paint, budget, source)
            : ReferenceEquals(path, original) && originalBounds is { } existingBounds ? existingBounds : path.Bounds;
        foreach (var clip in state.Clips) ink = ink.Intersect(_scene.Clips[clip].Path.Bounds);
        _scene.InkBounds = _scene.InkBounds.Union(ink);
        _scene.Add(new(path, state.Paint, [.. state.Clips], source, ink));
        foreach (var tip in lowering.Tips)
        {
            budget.Charge(tip.Source);
            if (state.RelevantForPictureSize)
                foreach (var point in tip.Template.Hull)
                    _scene.PictureBounds = _scene.PictureBounds.Add(PgfTransform.Apply(tip.Transform, point.Bp, budget, tip.Source));
            var tipInk = ArrowGeometry.InkBounds(tip, budget);
            foreach (var clip in state.Clips) tipInk = tipInk.Intersect(_scene.Clips[clip].Path.Bounds);
            _scene.InkBounds = _scene.InkBounds.Union(tipInk);
            _scene.Add(new(tip.Template.Path, tip.Template.Paint, [.. state.Clips], tip.Source, tipInk) { Transform = tip.Transform, Arrow = tip });
        }
    }
    private static double PictureStrokeRadius(double width)
    {
        const double spPerBp = 72.27 * 65536 / 72;
        return (long)Math.Round(width * spPerBp, MidpointRounding.AwayFromZero) / 2 / spPerBp;
    }
    private (Point X, Point Y) Axes(Expression xRadius, Expression yRadius, EvaluationState state)
    {
        var x = xRadius.Evaluate(state.Variables, budget);
        var y = yRadius.Evaluate(state.Variables, budget);
        if (x.HasUnit != y.HasUnit) throw new CompileError("TIKZ001", "Cannot mix physical and dimensionless radii.", yRadius.Source);
        var xAxis = Vector(x.HasUnit ? new(x.Bp, 0) : PgfTransform.Scale(state.XBasis, x.Value, budget, xRadius.Source), xRadius.Source);
        var yAxis = Vector(y.HasUnit ? new(0, y.Bp) : PgfTransform.Scale(state.YBasis, y.Value, budget, yRadius.Source), yRadius.Source);
        budget.Check(xAxis.X, xRadius.Source); budget.Check(xAxis.Y, xRadius.Source);
        budget.Check(yAxis.X, yRadius.Source); budget.Check(yAxis.Y, yRadius.Source);
        return (xAxis, yAxis);
        Point Vector(Point value, Source source) => PgfTransform.Apply(state.Transform with { E = 0, F = 0 }, value, budget, source);
    }
}

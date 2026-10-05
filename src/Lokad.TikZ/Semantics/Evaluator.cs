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
        foreach (var library in options.Libraries) LoadLibrary(library, state, statements.FirstOrDefault()?.Source ?? new Source("", 0, 0));
        Statements(statements, state, 0);
        return _scene;
    }
    private void LoadLibrary(string name, EvaluationState state, Source source)
    {
        budget.Charge(source);
        if (name != "shapes.geometric") throw new CompileError("TIKZ002", $"Unsupported TikZ library '{name}'.", source);
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
        if (coordinate.X is null || coordinate.Y is null)
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
                var angle = x.Value * Math.PI / 180;
                point = y.HasUnit ? new(Math.Cos(angle) * y.Bp, Math.Sin(angle) * y.Bp)
                    : state.XBasis * (Math.Cos(angle) * y.Value) + state.YBasis * (Math.Sin(angle) * y.Value);
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
        if (coordinate.X is null || coordinate.Y is null)
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
                var angle = x.Value * Math.PI / 180;
                point = y.HasUnit ? new(Math.Cos(angle) * y.Bp, Math.Sin(angle) * y.Bp)
                    : state.XBasis * (Math.Cos(angle) * y.Value) + state.YBasis * (Math.Sin(angle) * y.Value);
            }
            else point = (x.HasUnit ? new Point(x.Bp, 0) : PgfTransform.Scale(state.XBasis, x.Value, budget, coordinate.Source))
                + (y.HasUnit ? new Point(0, y.Bp) : PgfTransform.Scale(state.YBasis, y.Value, budget, coordinate.Source));
        }
        if (coordinate.Relative != 0) point += reference;
        budget.Check(point.X, coordinate.Source); budget.Check(point.Y, coordinate.Source);
        return point;
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
        var path = new GraphicPath(budget, statement.Source);
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
                        FlushToward(border);
                        path.Line(Global(border));
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
                    ShapePaths.Ellipse(path, center, ellipseAxes.X, ellipseAxes.Y);
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
        var bounds = path.Bounds;
        if (state.RelevantForPictureSize)
        {
            var picture = path.ControlBounds;
            _scene.PictureBounds = _scene.PictureBounds.Union(state.Paint.Stroke ? picture.Inflate(state.Paint.Width / 2) : picture);
        }
        if (statement.Command == "\\clip")
        {
            var id = _scene.Clips.Count;
            _scene.Clips.Add(new(path, state.Paint.FillRule));
            parent.Clips.Add(id);
            parent.RelevantForPictureSize = false;
        }
        if (state.Paint.Fill || state.Paint.Stroke)
        {
            var ink = state.Paint.Stroke ? PathStrokeBounds.Calculate(path, state.Paint, budget, statement.Source) : bounds;
            foreach (var clip in state.Clips) ink = ink.Intersect(_scene.Clips[clip].Path.Bounds);
            _scene.InkBounds = _scene.InkBounds.Union(ink);
            _scene.Add(new(path, state.Paint, [.. state.Clips], statement.Source, ink));
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

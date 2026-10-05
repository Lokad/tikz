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
        foreach (var library in options.Libraries) LoadLibrary(library, statements.FirstOrDefault()?.Source ?? new Source("", 0, 0));
        Statements(statements, state, 0);
        return _scene;
    }
    private static void LoadLibrary(string name, Source source) => throw new CompileError("TIKZ002", $"Unsupported TikZ library '{name}'.", source);
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
                    foreach (var name in Options.Split(libraries.Names, ',', budget)) LoadLibrary(Options.Clean(name), name);
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
    private Point Resolve(Coordinate coordinate, EvaluationState state, Point reference, out bool updateReference, bool nodeCenter = true)
    {
        budget.Charge(coordinate.Source);
        updateReference = coordinate.Relative != 1;
        Point point;
        if (coordinate.X is null || coordinate.Y is null)
        {
            if (!_coordinates.TryGetValue(coordinate.Name, out point)) point = NodeAnchor(coordinate.Name, coordinate.Source, nodeCenter);
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
            else point = (x.HasUnit ? new Point(x.Bp, 0) : state.XBasis * x.Value) + (y.HasUnit ? new Point(0, y.Bp) : state.YBasis * y.Value);
            point = coordinate.Relative == 0 ? state.Transform.Apply(point)
                : state.Transform.Apply(point) - state.Transform.Apply(default);
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
        foreach (var operation in statement.Operations)
        {
            budget.Charge(operation.Source);
            switch (operation)
            {
                case MoveOperation move: path.Move(Point(move.Point)); break;
                case LineOperation line:
                    var end = Point(line.Point);
                    if (line.Kind is "vh" or "hv") path.Line(FrameCorner(path.Current, end, state, line.Kind == "hv", line.Source));
                    path.Line(end);
                    break;
                case CurveOperation curve:
                    var before = reference;
                    var a = Resolve(curve.A, state, before, out _);
                    var target = Point(curve.End);
                    var b = Resolve(curve.B, state, curve.B.Relative == 0 ? before : target, out _);
                    path.Cubic(a, b, target);
                    break;
                case RectangleOperation rectangle:
                    var origin = path.Current;
                    var corner = Point(rectangle.End);
                    path.Move(origin); path.Line(FrameCorner(origin, corner, state, false, rectangle.Source));
                    path.Line(corner); path.Line(FrameCorner(origin, corner, state, true, rectangle.Source)); path.Close(); path.Move(corner);
                    break;
                case EllipseOperation ellipse:
                    var center = path.Current;
                    var ellipseAxes = Axes(ellipse.X, ellipse.Y, state);
                    ShapePaths.Ellipse(path, center, ellipseAxes.X, ellipseAxes.Y);
                    break;
                case ArcOperation arc:
                    var arcAxes = Axes(arc.X, arc.Y, state);
                    var start = arc.Start.Evaluate(state.Variables, budget).Value;
                    var finish = arc.End.Evaluate(state.Variables, budget).Value;
                    ShapePaths.Arc(path, arcAxes.X, arcAxes.Y, start, finish, budget, arc.Source);
                    reference = path.Current;
                    break;
                case CloseOperation: path.Close(); break;
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
            var ink = state.Paint.Stroke ? bounds.Inflate(state.Paint.Width / 2 * (state.Paint.Cap == "square" ? Math.Sqrt(2) : 1)) : bounds;
            foreach (var clip in state.Clips) ink = ink.Intersect(_scene.Clips[clip].Path.Bounds);
            _scene.InkBounds = _scene.InkBounds.Union(ink);
            _scene.Add(new(path, state.Paint, [.. state.Clips], statement.Source, ink));
        }
        Point Point(Coordinate coordinate)
        {
            var point = Resolve(coordinate, state, reference, out var update, nodeCenter: false);
            if (update) reference = point;
            return point;
        }
    }
    private (Point X, Point Y) Axes(Expression xRadius, Expression yRadius, EvaluationState state)
    {
        var x = xRadius.Evaluate(state.Variables, budget);
        var y = yRadius.Evaluate(state.Variables, budget);
        if (x.HasUnit != y.HasUnit) throw new CompileError("TIKZ001", "Cannot mix physical and dimensionless radii.", yRadius.Source);
        var xAxis = TransformVector(state, x.HasUnit ? new(x.Bp, 0) : state.XBasis * x.Value);
        var yAxis = TransformVector(state, y.HasUnit ? new(0, y.Bp) : state.YBasis * y.Value);
        budget.Check(xAxis.X, xRadius.Source); budget.Check(xAxis.Y, xRadius.Source);
        budget.Check(yAxis.X, yRadius.Source); budget.Check(yAxis.Y, yRadius.Source);
        return (xAxis, yAxis);
    }
    private static Point TransformVector(EvaluationState state, Point point) => state.Transform.Apply(point) - state.Transform.Apply(default);
    private static Point FrameCorner(Point start, Point end, EvaluationState state, bool horizontalFirst, Source source)
    {
        var t = state.Transform;
        var delta = end - start;
        var determinant = t.A * t.D - t.B * t.C;
        Point xLeg;
        if (delta.X == 0 && delta.Y == 0) xLeg = default;
        else if (determinant != 0)
        {
            var x = (t.D * delta.X - t.C * delta.Y) / determinant;
            xLeg = new(t.A * x, t.B * x);
        }
        else if (t.A == 0 && t.B == 0) xLeg = default;
        else if (t.C == 0 && t.D == 0) xLeg = delta;
        else throw new CompileError("TIKZ004", "Cannot resolve orthogonal corners under this singular transform.", source);
        return horizontalFirst ? start + xLeg : end - xLeg;
    }
}

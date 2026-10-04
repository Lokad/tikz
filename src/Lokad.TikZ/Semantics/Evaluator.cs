using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;

namespace Lokad.TikZ.Semantics;

internal sealed class Evaluator(Budget budget)
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
                    var point = Resolve(coordinate.Point, state, default, out _);
                    _coordinates[coordinate.Name] = point;
                    _scene.Coordinates[coordinate.Name] = point;
                    break;
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
            if (!_coordinates.TryGetValue(coordinate.Name, out point)) throw new CompileError("TIKZ003", $"Unknown coordinate '{coordinate.Name}'.", coordinate.Source);
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
                    if (line.Kind == "vh") path.Line(new(path.Current.X, end.Y));
                    if (line.Kind == "hv") path.Line(new(end.X, path.Current.Y));
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
                    path.Move(origin); path.Line(new(corner.X, origin.Y)); path.Line(corner); path.Line(new(origin.X, corner.Y)); path.Close();
                    break;
                case EllipseOperation ellipse:
                    var center = path.Current;
                    var rx = Radius(ellipse.X, state);
                    var ry = Radius(ellipse.Y, state);
                    DrawArc(path, center, rx, ry, 0, 360, state, true, ellipse.Source);
                    break;
                case ArcOperation arc:
                    var xRadius = Radius(arc.X, state);
                    var yRadius = Radius(arc.Y, state);
                    var start = arc.Start.Evaluate(state.Variables, budget).Value;
                    var finish = arc.End.Evaluate(state.Variables, budget).Value;
                    var vector = TransformVector(state, new(xRadius * Math.Cos(start * Math.PI / 180), yRadius * Math.Sin(start * Math.PI / 180)));
                    DrawArc(path, path.Current - vector, xRadius, yRadius, start, finish, state, false, arc.Source);
                    break;
                case CloseOperation: path.Close(); break;
                case PathOptionsOperation options: KeyRegistry.Apply(options.Options, state, budget); break;
                default: throw new InvalidOperationException("Unknown path operation.");
            }
        }
        var bounds = path.Bounds;
        _scene.PictureBounds = _scene.PictureBounds.Union(state.Paint.Stroke ? bounds.Inflate(state.Paint.Width / 2) : bounds);
        if (statement.Command == "\\clip")
        {
            var id = _scene.Clips.Count;
            _scene.Clips.Add(new(path, state.Paint.FillRule));
            parent.Clips.Add(id);
        }
        if (state.Paint.Fill || state.Paint.Stroke)
        {
            var ink = state.Paint.Stroke ? bounds.Inflate(state.Paint.Width / 2 * (state.Paint.Cap == "square" ? Math.Sqrt(2) : 1)) : bounds;
            foreach (var clip in state.Clips) ink = ink.Intersect(_scene.Clips[clip].Path.Bounds);
            _scene.InkBounds = _scene.InkBounds.Union(ink);
            _scene.Paths.Add(new(path, state.Paint, [.. state.Clips], statement.Source));
        }
        Point Point(Coordinate coordinate)
        {
            var point = Resolve(coordinate, state, reference, out var update);
            if (update) reference = point;
            return point;
        }
    }
    private double Radius(Expression expression, EvaluationState state)
    {
        var number = expression.Evaluate(state.Variables, budget);
        var radius = number.HasUnit ? number.Bp : number.Value * 72 / 2.54;
        if (radius < 0) throw new CompileError("TIKZ001", "Negative radius.", expression.Source);
        budget.Check(radius, expression.Source);
        return radius;
    }
    private static Point TransformVector(EvaluationState state, Point point) => state.Transform.Apply(point) - state.Transform.Apply(default);
    private void DrawArc(GraphicPath path, Point center, double rx, double ry, double start, double end, EvaluationState state, bool closed, Source source)
    {
        if (!double.IsFinite(start) || !double.IsFinite(end)) throw new CompileError("TIKZ004", "Non-finite angle.", source);
        var sweep = end - start;
        var countDouble = Math.Max(1, Math.Ceiling(Math.Abs(sweep) / 45));
        if (countDouble > budget.Limits.MaxSegments) Budget.Fail(source, "arc segments");
        var count = (int)countDouble;
        if (closed) path.Move(At(start));
        for (var i = 0; i < count; i++)
        {
            budget.Charge(source);
            var a = (start + sweep * i / count) * Math.PI / 180;
            var b = (start + sweep * (i + 1) / count) * Math.PI / 180;
            var k = 4.0 / 3 * Math.Tan((b - a) / 4);
            var p0 = new Point(rx * Math.Cos(a), ry * Math.Sin(a));
            var p1 = p0 + new Point(-rx * Math.Sin(a), ry * Math.Cos(a)) * k;
            var p3 = new Point(rx * Math.Cos(b), ry * Math.Sin(b));
            var p2 = p3 - new Point(-rx * Math.Sin(b), ry * Math.Cos(b)) * k;
            path.Cubic(center + TransformVector(state, p1), center + TransformVector(state, p2), center + TransformVector(state, p3));
        }
        if (closed) path.Close();
        Point At(double degrees) => center + TransformVector(state, new(rx * Math.Cos(degrees * Math.PI / 180), ry * Math.Sin(degrees * Math.PI / 180)));
    }
}

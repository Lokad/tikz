using System.Globalization;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;

namespace Lokad.TikZ.Semantics;

internal sealed partial class Evaluator
{
    private readonly record struct PlotPoint(Point Value, Source Source);

    private Point LowerPlot(PlotOperation plot, EvaluationState state, GraphicPath path, Point reference)
    {
        state.Plot = state.Plot.AtOrigin(plot.Source, budget);
        var last = new Point();
        IEnumerable<PlotPoint> Points()
        {
            foreach (var coordinate in PlotCoordinates(plot, state))
            {
                // Both + and ++ use the fixed entry reference; only completion
                // updates TikZ's last position, independently of path closure.
                last = PathCoordinate(coordinate, state, reference, out _);
                yield return new(last, coordinate.Source);
            }
        }
        Point World(PlotPoint point) => PgfTransform.Apply(state.Transform, point.Value, budget, point.Source);
        void First(PlotPoint point) { if (plot.Connect) path.Line(World(point)); else path.Move(World(point)); }
        void Curve(PlotPoint a, PlotPoint b, PlotPoint end) => path.Cubic(World(a), World(b), World(end));
        using var points = Points().GetEnumerator();
        if (!points.MoveNext()) return default;
        var first = points.Current;
        if (state.Plot.Handler == PlotHandler.Sharp)
        {
            First(first);
            while (points.MoveNext()) path.Line(World(points.Current));
            return last;
        }
        var tension = double.Parse(state.Plot.Tension.Value, CultureInfo.InvariantCulture);
        PlotPoint Offset(PlotPoint middle, PlotPoint before, PlotPoint after, bool subtract)
        {
            var origin = middle.Source with { RelatedSources = [.. middle.Source.RelatedSources ?? [], before.Source, after.Source, state.Plot.Tension] };
            var delta = PgfTransform.Scale(after.Value - before.Value, tension, budget, origin);
            return new(middle.Value + delta * (subtract ? -1 : 1), origin);
        }
        if (state.Plot.Handler == PlotHandler.Smooth)
        {
            First(first);
            if (!points.MoveNext()) return last;
            var second = points.Current;
            var support = first;
            while (points.MoveNext())
            {
                var next = points.Current;
                Curve(support, Offset(second, first, next, true), second);
                support = Offset(second, first, next, false);
                first = second; second = next;
            }
            Curve(support, second, second);
            return last;
        }
        // PGF's closed handler ignores the configured first action and delays
        // its move until the second point, preserving this physical paint order.
        if (!points.MoveNext()) return last;
        var initial = first; var initialSecond = points.Current;
        path.Move(World(initialSecond));
        if (!points.MoveNext()) return last;
        var current = points.Current;
        var presupport = Offset(initialSecond, initial, current, true);
        var outgoing = Offset(initialSecond, initial, current, false);
        var previous = initialSecond;
        while (points.MoveNext())
        {
            var next = points.Current;
            Curve(outgoing, Offset(current, previous, next, true), current);
            outgoing = Offset(current, previous, next, false);
            previous = current; current = next;
        }
        Curve(outgoing, Offset(current, previous, initial, true), current);
        Curve(Offset(current, previous, initial, false), Offset(initial, current, initialSecond, true), initial);
        Curve(Offset(initial, current, initialSecond, false), presupport, initialSecond);
        path.Close();
        return last;
    }
}

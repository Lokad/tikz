using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Nodes;

namespace Lokad.TikZ.Semantics;

internal sealed partial class Evaluator
{
    private ConnectionCurve Curve(Point start, Point end, ResolvedNode? from, ResolvedNode? to, EvaluationState state, Source source)
    {
        var settings = state.Connection;
        var first = start; var second = end;
        if (settings.Relative)
        {
            if (from is not null) first = NodeBorder(from, ConnectionCurve.RotateAbout(end, start, settings.Out, 0, budget, source), state.Transform, source);
            if (to is not null) second = NodeBorder(to, ConnectionCurve.RotateAbout(start, end, 180, settings.In, budget, source), state.Transform, source);
        }
        else
        {
            if (from is not null) first = AngleAnchor(from, settings.Out);
            if (to is not null) second = AngleAnchor(to, settings.In);
        }
        var curve = ConnectionCurve.Resolve(first, second, settings, budget, source);
        if (!settings.Relative) curve = curve with
        {
            Start = from is null ? start : NodeBorder(from, curve.A, state.Transform, source),
            End = to is null ? end : NodeBorder(to, curve.B, state.Transform, source)
        };
        return curve;

        Point AngleAnchor(ResolvedNode node, double angle)
        {
            var direction = ConnectionCurve.Polar(angle, 72 / 72.27, budget, source);
            var point = node.Layout.Border(new(ToSp(direction.X, source), ToSp(direction.Y, source)), budget, source);
            return PgfCoordinates.ToLocal(PgfTransform.Apply(node.Transform, point.Bp, budget, source), state.Transform, source);
        }
    }
}

using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Nodes;

namespace Lokad.TikZ.Semantics;

internal sealed partial class Evaluator
{
    private Point PositionedAt(NodePositioning placement, EvaluationState parent)
    {
        var name = Options.Clean(placement.Target);
        Point point;
        if (_nodes.ContainsKey(name)) point = NodeAnchor(name + "." + placement.TargetAnchor, placement.Target);
        else if (!_coordinates.TryGetValue(name, out point)) point = NodeAnchor(name, placement.Target);
        return PgfCoordinates.RoundTrip(point, parent.Transform, placement.Target);
    }

    private Point PositioningShift(NodePositioning placement, EvaluationState state)
    {
        var source = placement.Distance;
        var separator = PositioningOptions.Word(source, "and", budget);
        var vertical = separator < 0 ? source : source.Slice(0, separator).Trim();
        var horizontal = separator < 0 ? source : source.Slice(separator + 3, source.Length - separator - 3).Trim();
        var x = state.Number(horizontal, budget);
        var y = state.Number(vertical, budget);
        var gap = (x.HasUnit ? new Point(x.Bp, 0) : PgfTransform.Scale(state.XBasis, x.Value, budget, horizontal))
            + (y.HasUnit ? new Point(0, y.Bp) : PgfTransform.Scale(state.YBasis, y.Value, budget, vertical));
        if (separator < 0 && placement.XSign != 0 && placement.YSign != 0)
            gap = PgfTransform.Scale(gap, .707106781, budget, source);
        gap = new(placement.XSign * gap.X, placement.YSign * gap.Y);
        budget.Check(gap.X, source); budget.Check(gap.Y, source);
        return gap;
    }
}

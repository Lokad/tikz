using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Nodes;

namespace Lokad.TikZ.Semantics;

internal sealed partial class Evaluator
{
    private void PathLabels(PathOperation operation, ConnectionCurve segment, bool curved, EvaluationState parent, List<Action> deferred, Point? corner = null)
    {
        foreach (var label in operation.Labels)
        {
            budget.Charge(label.Source);
            Node(label, parent, settings =>
            {
                var time = settings.PathTime;
                Point at, tangent;
                if (curved)
                {
                    // PGF's finite de Casteljau interpolation multiplies each
                    // term separately; it does not use a continuous polynomial.
                    var complement = PgfTransform.Printed((long)Math.Round((1 - time) * 65536, MidpointRounding.AwayFromZero));
                    var a = Mix(segment.Start, segment.A);
                    var b = Mix(segment.A, segment.B);
                    var c = Mix(segment.B, segment.End);
                    var first = Mix(a, b); var second = Mix(b, c);
                    at = Mix(first, second); tangent = second - first;
                    Point Mix(Point x, Point y) => PgfTransform.Scale(x, complement, budget, label.Source)
                        + PgfTransform.Scale(y, time, budget, label.Source);
                }
                else
                {
                    var start = segment.Start; var end = segment.End;
                    if (corner is Point bend)
                    {
                        // Each leg receives half the timer, independent of its
                        // length. The corner belongs to the second leg at pos=.5.
                        var timeSp = (long)Math.Round(time * 65536, MidpointRounding.AwayFromZero);
                        if (timeSp < 32768) end = bend;
                        else start = bend;
                        time = PgfTransform.Printed(2 * timeSp - (timeSp < 32768 ? 0 : 65536));
                    }
                    tangent = end - start;
                    at = start + PgfTransform.Scale(tangent, time, budget, label.Source);
                }
                var frame = PgfTransform.Then(parent.Transform, Affine.Translation(at.X, at.Y), budget, label.Source);
                if (!settings.TransformShape) frame = Affine.Translation(frame.E, frame.F);
                if (settings.Sloped)
                {
                    if (!settings.AllowUpsideDown && tangent.X < 0) tangent = new(-tangent.X, -tangent.Y);
                    var direction = PgfDirection.Normalize(new(ToSp(tangent.X, label.Source), ToSp(tangent.Y, label.Source)), budget, label.Source);
                    var x = PgfTransform.Printed(direction.X); var y = PgfTransform.Printed(direction.Y);
                    frame = PgfTransform.Then(frame, new(x, y, -y, x, 0, 0), budget, label.Source);
                }
                return frame;
            }, deferred);
        }
    }
}

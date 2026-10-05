using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Graphics;

// A conservative circular-pen envelope plus the actual extensions of miter
// joins. Simple inflation misses acute corners, including the closing join.
// Each move/close resets the subpath: implicit node edges must not acquire
// joins across the gaps between their independently resolved border points.
internal static class PathStrokeBounds
{
    internal static Bounds Calculate(GraphicPath path, Paint paint, Budget budget, Source source)
    {
        var radius = paint.Width / 2;
        var bounds = path.Bounds.Inflate(radius * (paint.Cap == "square" ? Math.Sqrt(2) : 1));
        if (radius == 0 || paint.Join != "miter") return bounds;
        Point current = default, first = default, previous = default;
        var hasEdge = false;
        foreach (var segment in path.Segments)
        {
            budget.Charge(source, 8);
            if (segment.Kind == SegmentKind.Move)
            {
                current = segment.End; hasEdge = false;
                continue;
            }
            var incoming = segment.Kind == SegmentKind.Cubic
                ? Direction(current, segment.A, segment.B, segment.End) : Unit(segment.End - current);
            var outgoing = segment.Kind == SegmentKind.Cubic
                ? Direction(segment.End, segment.B, segment.A, current) * -1 : incoming;
            if (incoming != default || outgoing != default)
            {
                if (hasEdge) Join(current, previous, incoming);
                else { first = incoming; hasEdge = true; }
                previous = outgoing;
            }
            current = segment.End;
            if (segment.Kind == SegmentKind.Close)
            {
                if (hasEdge) Join(current, previous, first);
                hasEdge = false;
            }
        }
        return bounds;

        void Join(Point point, Point left, Point right)
        {
            budget.Charge(source, 8);
            if (left == default || right == default) return;
            var a = new Point(-left.Y, left.X); var b = new Point(-right.Y, right.X);
            var divisor = 1 + a.X * b.X + a.Y * b.Y;
            if (divisor <= 0) return;
            var extension = (a + b) * (radius / divisor);
            if (extension.X * extension.X + extension.Y * extension.Y > radius * radius * paint.Miter * paint.Miter) return;
            var positive = point + extension; var negative = point - extension;
            budget.Check(positive.X, source); budget.Check(positive.Y, source);
            budget.Check(negative.X, source); budget.Check(negative.Y, source);
            bounds = bounds.Add(positive).Add(negative);
        }
        static Point Direction(Point origin, Point a, Point b, Point c)
            => Unit((a != origin ? a : b != origin ? b : c) - origin);
        static Point Unit(Point vector)
        {
            var length = Math.Sqrt(vector.X * vector.X + vector.Y * vector.Y);
            return length == 0 ? default : vector * (1 / length);
        }
    }
}

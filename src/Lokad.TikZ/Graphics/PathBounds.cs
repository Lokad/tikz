using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Graphics;

internal static class PathBounds
{
    internal static Bounds Calculate(IEnumerable<Segment> segments, Budget budget, Source source)
    {
        var bounds = Bounds.Empty;
        var previous = default(Point);
        foreach (var segment in segments)
        {
            budget.Charge(source);
            bounds = bounds.Add(segment.End);
            if (segment.Kind == SegmentKind.Cubic)
            {
                AddExtrema(previous.X, segment.A.X, segment.B.X, segment.End.X);
                AddExtrema(previous.Y, segment.A.Y, segment.B.Y, segment.End.Y);
            }
            previous = segment.End;
            void AddExtrema(double p0, double p1, double p2, double p3)
            {
                var a = -p0 + 3 * p1 - 3 * p2 + p3;
                var b = 2 * (p0 - 2 * p1 + p2);
                var c = p1 - p0;
                if (Math.Abs(a) < 1e-14) { if (Math.Abs(b) > 1e-14) Include(-c / b); return; }
                var d = b * b - 4 * a * c;
                if (d < 0) return;
                Include((-b + Math.Sqrt(d)) / (2 * a));
                Include((-b - Math.Sqrt(d)) / (2 * a));
            }
            void Include(double t)
            {
                if (t <= 0 || t >= 1) return;
                var u = 1 - t;
                bounds = bounds.Add(previous * (u * u * u) + segment.A * (3 * u * u * t)
                    + segment.B * (3 * u * t * t) + segment.End * (t * t * t));
            }
        }
        return bounds;
    }
}

using Lokad.TikZ.Frontend;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Geometry;

// Bounds of a closed convex polygon under an untransformed circular pen.
// Node rectangles can become oblique polygons; inflating their axis-aligned
// geometry box misses the outer miter tips. Picture bounds remain PGF's
// separate layout quantity, while these bounds keep visible ink in the SVG.
internal static class PolygonStrokeBounds
{
    internal static Bounds Calculate(Point[] vertices, Paint paint, Budget budget, Source source)
    {
        var geometry = Bounds.Empty;
        foreach (var point in vertices) { budget.Charge(source); geometry = geometry.Add(point); }
        var radius = paint.Width / 2;
        if (radius == 0) return geometry;
        if (paint.Join == "round") return geometry.Inflate(radius);
        var result = geometry;
        for (var i = 0; i < vertices.Length; i++)
        {
            budget.Charge(source);
            var point = vertices[i];
            var incoming = point - vertices[(i + vertices.Length - 1) % vertices.Length];
            var outgoing = vertices[(i + 1) % vertices.Length] - point;
            var length1 = Math.Sqrt(incoming.X * incoming.X + incoming.Y * incoming.Y);
            var length2 = Math.Sqrt(outgoing.X * outgoing.X + outgoing.Y * outgoing.Y);
            // Collapsed polygons need a conservative circular-pen bound.
            if (length1 == 0 || length2 == 0) return geometry.Inflate(radius);
            var normal1 = new Point(-incoming.Y / length1, incoming.X / length1);
            var normal2 = new Point(-outgoing.Y / length2, outgoing.X / length2);
            result = result.Add(point + normal1 * radius).Add(point - normal1 * radius)
                .Add(point + normal2 * radius).Add(point - normal2 * radius);
            if (paint.Join != "miter") continue;
            var divisor = 1 + normal1.X * normal2.X + normal1.Y * normal2.Y;
            if (divisor <= 0) continue;
            var miter = (normal1 + normal2) * (radius / divisor);
            var ratioSquared = (miter.X * miter.X + miter.Y * miter.Y) / (radius * radius);
            if (ratioSquared > paint.Miter * paint.Miter) continue;
            var positive = point + miter; var negative = point - miter;
            budget.Check(positive.X, source); budget.Check(positive.Y, source);
            budget.Check(negative.X, source); budget.Check(negative.Y, source);
            result = result.Add(positive).Add(negative);
        }
        return result;
    }
}

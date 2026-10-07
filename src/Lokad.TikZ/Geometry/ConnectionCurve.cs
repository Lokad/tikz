using Lokad.TikZ.Frontend;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Geometry;

internal readonly record struct ConnectionCurve(Point Start, Point A, Point B, Point End)
{
    private const double SpPerBp = 72.27 * 65536 / 72;

    internal static Point Polar(double angle, double distance, Budget budget, Source source)
    {
        var rotation = PgfTransform.Rotation(angle, budget, source);
        return PgfTransform.Scale(new(distance, 0), rotation.A, budget, source)
            + PgfTransform.Scale(new(0, distance), rotation.B, budget, source);
    }

    internal static Point RotateAbout(Point point, Point center, double firstAngle, double secondAngle, Budget budget, Source source)
    {
        var frame = Affine.Translation(center.X, center.Y);
        frame = PgfTransform.Then(frame, PgfTransform.Rotation(firstAngle, budget, source), budget, source);
        frame = PgfTransform.Then(frame, PgfTransform.Rotation(secondAngle, budget, source), budget, source);
        frame = PgfTransform.Then(frame, Affine.Translation(-center.X, -center.Y), budget, source);
        return PgfTransform.Apply(frame, point, budget, source);
    }

    internal static ConnectionCurve Resolve(Point start, Point end, ConnectionSettings settings, Budget budget, Source source)
    {
        var delta = end - start;
        var dx = Math.Abs(Scaled(delta.X)); var dy = Math.Abs(Scaled(delta.Y));
        var normalized = PgfDirection.Normalize(new(dx, dy), budget, source);
        var horizontal = normalized.X > normalized.Y;
        var component = horizontal ? normalized.X : normalized.Y;
        var dimension = horizontal ? dx : dy;
        var divisor = component / 255;
        // TikZ's distance estimate uses integer dimension arithmetic, not hypot.
        if (divisor != 0) dimension = PgfDirection.Checked(16L * dimension, source) / divisor * 16;
        var estimated = PgfDirection.Checked(dimension, source) / SpPerBp;
        var baseDistance = PgfTransform.Scale(new(estimated, 0), .3915, budget, source).X;
        var outDistance = Distance(settings.OutLooseness, settings.OutMin, settings.OutMax);
        var inDistance = Distance(settings.InLooseness, settings.InMin, settings.InMax);
        var a = Polar(settings.Out, outDistance, budget, source);
        var b = Polar(settings.In, inDistance, budget, source);
        if (settings.Relative)
        {
            var direction = PgfDirection.Normalize(new(Scaled(delta.X), Scaled(delta.Y)), budget, source);
            var x = PgfTransform.Printed(direction.X); var y = PgfTransform.Printed(direction.Y);
            a = PgfTransform.Apply(new(x, y, -y, x, start.X, start.Y), a, budget, source);
            b = PgfTransform.Apply(new(x, y, -y, x, end.X, end.Y), b, budget, source);
        }
        else { a += start; b += end; }
        return new(start, a, b, end);

        int Scaled(double bp) => PgfDirection.Checked((long)Math.Round(bp * SpPerBp, MidpointRounding.AwayFromZero), source);
        double Distance(double looseness, double minimum, double maximum)
        {
            var value = PgfTransform.Scale(new(baseDistance, 0), looseness, budget, source).X;
            // PGF clamps to the minimum first and maximum second, even if inverted.
            return Math.Min(Math.Max(value, minimum), maximum);
        }
    }
}

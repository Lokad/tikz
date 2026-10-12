using Lokad.TikZ.Frontend;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Geometry;

internal static class ShapePaths
{
    // PGF's quarter-circle approximation, also used for arbitrary ellipse axes.
    private const double QuarterControl = 36195d / 65536;

    public static void Ellipse(GraphicPath path, Point center, Point xAxis, Point yAxis, Budget budget, Source source)
    {
        ReadOnlySpan<Point> axes = [xAxis, yAxis, xAxis * -1, yAxis * -1];
        Span<Point> controls = stackalloc Point[4];
        for (var i = 0; i < axes.Length; i++) controls[i] = PgfTransform.Scale(axes[i], QuarterControl, budget, source);
        path.Move(center + xAxis);
        for (var i = 0; i < axes.Length; i++)
        {
            var from = axes[i];
            var to = axes[(i + 1) % axes.Length];
            path.Cubic(center + from + controls[(i + 1) % axes.Length], center + to + controls[i], center + to);
        }
        path.Close();
        path.Move(center);
    }

    public static void Arc(GraphicPath path, Point xAxis, Point yAxis, double start, double end, Budget budget, Source source)
    {
        var sweep = end - start;
        if (!double.IsFinite(start) || !double.IsFinite(end) || !double.IsFinite(sweep))
            throw new CompileError("TIKZ004", "Non-finite arc angle or sweep.", source);
        if (Math.Ceiling(Math.Abs(sweep) / 90) > budget.Limits.MaxSegments) Budget.Fail(source, "arc segments");
        var angle = start;
        while (Math.Abs(end - angle) > 90)
        {
            // PGF keeps the final segment sufficiently wide for later arrow work.
            var step = Math.Abs(end - angle) > 115 ? 90 : 60;
            var next = angle + Math.CopySign(step, sweep);
            if (next == angle) throw new CompileError("TIKZ004", "Arc angle exceeds supported numeric precision.", source);
            Segment(angle, next);
            angle = next;
        }
        Segment(angle, end);

        void Segment(double a, double b)
        {
            budget.Charge(source);
            var delta = b - a;
            var control = Math.Abs(delta) == 90 ? QuarterControl : 4.0 / 3 * Math.Tan(Math.Abs(delta) * Math.PI / 720);
            control = Math.CopySign(control, delta);
            var origin = path.Current;
            var (sinB, cosB) = Math.SinCos(b % 360 * Math.PI / 180);
            var (sinA, cosA) = Math.SinCos(a % 360 * Math.PI / 180);
            var target = origin + (xAxis * cosB + yAxis * sinB) - (xAxis * cosA + yAxis * sinA);
            path.Cubic(origin + PgfTransform.Scale(xAxis * -sinA + yAxis * cosA, control, budget, source),
                target - PgfTransform.Scale(xAxis * -sinB + yAxis * cosB, control, budget, source), target);
        }
    }
}

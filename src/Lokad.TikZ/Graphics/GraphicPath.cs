using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Graphics;

internal enum SegmentKind { Move, Line, Cubic, Close }
internal readonly record struct Segment(SegmentKind Kind, Point End, Point A, Point B);
internal sealed class GraphicPath(Budget budget, Source source)
{
    public List<Segment> Segments { get; } = [];
    public Point Current { get; private set; }
    private Point _start;
    private bool _hasMove;
    public void Add(Segment segment)
    {
        budget.Segment(source);
        Check(segment.End);
        if (segment.Kind == SegmentKind.Cubic) { Check(segment.A); Check(segment.B); }
        Segments.Add(segment);
        if (segment.Kind == SegmentKind.Move) { _start = segment.End; _hasMove = true; }
        Current = segment.End;
    }
    private void Check(Point p) { budget.Check(p.X, source); budget.Check(p.Y, source); }
    public void Move(Point p) => Add(new(SegmentKind.Move, p, default, default));
    public void Line(Point p) { RequireMove(); Add(new(SegmentKind.Line, p, default, default)); }
    public void Cubic(Point a, Point b, Point p) { RequireMove(); Add(new(SegmentKind.Cubic, p, a, b)); }
    public void Close() { RequireMove(); Add(new(SegmentKind.Close, _start, default, default)); }
    private void RequireMove() { if (!_hasMove) Move(default); }
    // PGF picture sizes include control points, independently of the tighter
    // painted-curve extrema used for ink and clipping calculations.
    public Bounds ControlBounds
    {
        get
        {
            var bounds = Bounds.Empty;
            foreach (var segment in Segments)
            {
                budget.Charge(source);
                bounds = bounds.Add(segment.End);
                if (segment.Kind == SegmentKind.Cubic) bounds = bounds.Add(segment.A).Add(segment.B);
            }
            return bounds;
        }
    }
    public Bounds Bounds => PathBounds.Calculate(Segments, budget, source);
}

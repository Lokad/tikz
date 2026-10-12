using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Graphics;

internal enum SegmentKind { Move, Line, Cubic, Close }
internal readonly record struct Segment(SegmentKind Kind, Point End, Point A, Point B);
internal sealed class GraphicPath
{
    private readonly Budget _budget;
    private readonly Source _source;
    public List<Segment> Segments { get; }
    public Point Current { get; private set; }
    private Point _start;
    private bool _hasMove;
    public GraphicPath(Budget budget, Source source)
    {
        _budget = budget; _source = source; Segments = [];
    }
    private GraphicPath(List<Segment> segments, Budget budget, Source source)
    {
        _budget = budget; _source = source; Segments = segments;
        foreach (var segment in segments) Record(segment);
    }
    // The caller relinquishes this list after its final endpoint edits.
    internal static GraphicPath FromOwnedSegments(List<Segment> segments, Budget budget, Source source)
        => new(segments, budget, source);
    public void Add(Segment segment)
    {
        Record(segment);
        Segments.Add(segment);
    }
    private void Record(Segment segment)
    {
        _budget.Segment(_source);
        Check(segment.End);
        if (segment.Kind == SegmentKind.Cubic) { Check(segment.A); Check(segment.B); }
        if (segment.Kind == SegmentKind.Move) { _start = segment.End; _hasMove = true; }
        Current = segment.End;
    }
    private void Check(Point p) { _budget.Check(p.X, _source); _budget.Check(p.Y, _source); }
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
                _budget.Charge(_source);
                bounds = bounds.Add(segment.End);
                if (segment.Kind == SegmentKind.Cubic) bounds = bounds.Add(segment.A).Add(segment.B);
            }
            return bounds;
        }
    }
    public Bounds Bounds => PathBounds.Calculate(Segments, _budget, _source);
}

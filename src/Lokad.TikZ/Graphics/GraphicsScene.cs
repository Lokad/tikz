using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Graphics;

internal sealed record PaintedPath(GraphicPath Path, Paint Paint, int[] Clips, Source Source);
internal sealed record ClipPath(GraphicPath Path, string FillRule);
internal sealed class GraphicsScene
{
    public List<PaintedPath> Paths { get; } = [];
    public List<ClipPath> Clips { get; } = [];
    public Dictionary<string, Point> Coordinates { get; } = new(StringComparer.Ordinal);
    public Bounds PictureBounds { get; set; } = Bounds.Empty;
    public Bounds InkBounds { get; set; } = Bounds.Empty;
}

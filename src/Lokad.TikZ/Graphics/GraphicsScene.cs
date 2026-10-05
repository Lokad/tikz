using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Text;

namespace Lokad.TikZ.Graphics;

internal abstract record Drawable(int[] Clips, Source Source);
internal sealed record PaintedPath(GraphicPath Path, Paint Paint, int[] ClipIds, Source Origin, Bounds InkBounds) : Drawable(ClipIds, Origin);
internal sealed record ResolvedGlyph(int Outline, PlacedGlyph Placement, Affine Transform, Bounds InkBounds);
internal sealed record PaintedGlyphRun(ResolvedGlyph[] Glyphs, string Readable, Color Color, double Opacity,
    int[] ClipIds, Source Origin, int NodeId) : Drawable(ClipIds, Origin);
internal sealed record ResolvedNode(string Name, INodeLayout Layout, Affine Transform,
    TextFont Font, TextFont NodeFont, Source Source);
internal sealed record ClipPath(GraphicPath Path, string FillRule);
internal sealed class GraphicsScene
{
    public List<PaintedPath> Paths { get; } = [];
    public List<Drawable> Drawables { get; } = [];
    public List<GlyphOutline> Outlines { get; } = [];
    public List<ResolvedNode> Nodes { get; } = [];
    public List<ClipPath> Clips { get; } = [];
    public Dictionary<string, Point> Coordinates { get; } = new(StringComparer.Ordinal);
    public Bounds PictureBounds { get; set; } = Bounds.Empty;
    public Bounds InkBounds { get; set; } = Bounds.Empty;
    public void Add(PaintedPath path) { Paths.Add(path); Drawables.Add(path); }
}

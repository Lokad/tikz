namespace Lokad.TikZ.Geometry;

internal readonly record struct Bounds(double MinX, double MinY, double MaxX, double MaxY, bool IsEmpty)
{
    public static Bounds Empty => new(0, 0, 0, 0, true);
    public Bounds Add(Point p) => IsEmpty ? new(p.X, p.Y, p.X, p.Y, false)
        : new(Math.Min(MinX, p.X), Math.Min(MinY, p.Y), Math.Max(MaxX, p.X), Math.Max(MaxY, p.Y), false);
    public Bounds Union(Bounds b) => b.IsEmpty ? this : Add(new(b.MinX, b.MinY)).Add(new(b.MaxX, b.MaxY));
    public Bounds Inflate(double value) => IsEmpty ? this : new(MinX - value, MinY - value, MaxX + value, MaxY + value, false);
    public Bounds Intersect(Bounds b)
    {
        if (IsEmpty || b.IsEmpty) return Empty;
        var minX = Math.Max(MinX, b.MinX); var maxX = Math.Min(MaxX, b.MaxX);
        var minY = Math.Max(MinY, b.MinY); var maxY = Math.Min(MaxY, b.MaxY);
        return minX > maxX || minY > maxY ? Empty : new(minX, minY, maxX, maxY, false);
    }
    public TikzBounds Pixels => IsEmpty ? new(0, 0, 0, 0, true) : new(MinX * 4 / 3, -MaxY * 4 / 3, MaxX * 4 / 3, -MinY * 4 / 3, false);
}

namespace Lokad.TikZ.Geometry;

internal readonly record struct Affine(double A, double B, double C, double D, double E, double F)
{
    public static Affine Identity => new(1, 0, 0, 1, 0, 0);
    public Point Apply(Point p) => new(A * p.X + C * p.Y + E, B * p.X + D * p.Y + F);
    public Affine Then(Affine r) => new(
        A * r.A + C * r.B, B * r.A + D * r.B,
        A * r.C + C * r.D, B * r.C + D * r.D,
        A * r.E + C * r.F + E, B * r.E + D * r.F + F);
    public static Affine Translation(double x, double y) => new(1, 0, 0, 1, x, y);
    public static Affine Scale(double x, double y) => new(x, 0, 0, y, 0, 0);
}

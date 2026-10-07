namespace Lokad.TikZ.Semantics;

// Curve parameters are construction state, separate from the final path paint.
internal sealed record ConnectionSettings
{
    public bool Curved { get; init; }
    public bool Relative { get; init; }
    public double Bend { get; init; } = 30;
    public double Out { get; init; } = 45;
    public double In { get; init; } = 135;
    public double OutLooseness { get; init; } = 1;
    public double InLooseness { get; init; } = 1;
    public double OutMin { get; init; }
    public double InMin { get; init; }
    public double OutMax { get; init; } = 10000 * 72 / 72.27;
    public double InMax { get; init; } = 10000 * 72 / 72.27;
}

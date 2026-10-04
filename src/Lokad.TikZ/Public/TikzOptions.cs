namespace Lokad.TikZ;

public enum TikzInputKind { Picture, PictureBody }

public sealed record TikzLimits
{
    public int MaxSourceCharacters { get; init; } = 1_048_576;
    public int MaxNesting { get; init; } = 128;
    public int MaxExpressionDepth { get; init; } = 64;
    public int MaxExpansionDepth { get; init; } = 64;
    public int MaxExpandedTokens { get; init; } = 1_000_000;
    public int MaxLoopIterations { get; init; } = 100_000;
    public int MaxNodes { get; init; } = 10_000;
    public int MaxSegments { get; init; } = 100_000;
    public int MaxGlyphs { get; init; } = 100_000;
    public long MaxWork { get; init; } = 10_000_000;
    public int MaxOutputBytes { get; init; } = 16 * 1024 * 1024;
    public int MaxDiagnostics { get; init; } = 100;
    public double MaxCoordinatePixels { get; init; } = 10_000_000;
    public static TikzLimits Default { get; } = new();
}

public sealed record TikzOptions
{
    public TikzInputKind InputKind { get; init; } = TikzInputKind.Picture;
    public TikzLimits Limits { get; init; } = TikzLimits.Default;
    public double PaddingPixels { get; init; } = 0;
    public string IdPrefix { get; init; } = "";
    public IReadOnlyList<string> Libraries { get; init; } = Array.Empty<string>();
    public static TikzOptions Default { get; } = new();
}

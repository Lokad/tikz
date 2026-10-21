namespace Lokad.TikZ;

/// <summary>Selects whether source includes a single TikZ picture wrapper.</summary>
public enum TikzInputKind
{
    /// <summary>A single tikzpicture environment with supported preceding statements.</summary>
    Picture,
    /// <summary>Supported TikZ statements without a picture environment wrapper.</summary>
    PictureBody
}

/// <summary>Resource ceilings shared by all phases of one conversion.</summary>
/// <remarks>
/// Source, expansion, loop, node, segment, glyph and work caps may be zero.
/// Depth and output caps must be positive; the coordinate ceiling
/// must also be finite. Exceeded resources produce TIKZ005, while invalid caller
/// limits throw before parsing. These caps do not guarantee latency or process memory.
/// </remarks>
public sealed record TikzLimits
{
    /// <summary>Maximum caller-source length in UTF-16 code units. Default: 1,048,576.</summary>
    public int MaxSourceCharacters { get; init; } = 1_048_576;
    /// <summary>Maximum supported syntax/evaluation nesting. Default: 128.</summary>
    public int MaxNesting { get; init; } = 128;
    /// <summary>Maximum expression depth and bounded operator-chain size. Default: 64.</summary>
    public int MaxExpressionDepth { get; init; } = 64;
    /// <summary>Maximum bounded expansion depth. Default: 64.</summary>
    public int MaxExpansionDepth { get; init; } = 64;
    /// <summary>Maximum charged generated/replayed source-character units. Default: 1,000,000.</summary>
    /// <remarks>The historical name does not denote lexical TeX tokens.</remarks>
    public int MaxExpandedTokens { get; init; } = 1_000_000;
    /// <summary>Maximum executed loop/sample iterations. Default: 100,000.</summary>
    public int MaxLoopIterations { get; init; } = 100_000;
    /// <summary>Maximum charged nodes/coordinates, including attached labels. Default: 10,000.</summary>
    public int MaxNodes { get; init; } = 10_000;
    /// <summary>Maximum charged path/generated geometry segments. Default: 100,000.</summary>
    public int MaxSegments { get; init; } = 100_000;
    /// <summary>Maximum glyph consumption during label layout. Default: 100,000.</summary>
    public int MaxGlyphs { get; init; } = 100_000;
    /// <summary>Maximum charged work across parsing, evaluation, serialization and related diagnostics. Default: 10,000,000.</summary>
    public long MaxWork { get; init; } = 10_000_000;
    /// <summary>Maximum UTF-8 SVG output bytes. Default: 16,777,216.</summary>
    public int MaxOutputBytes { get; init; } = 16 * 1024 * 1024;
    /// <summary>Finite coordinate/dimension ceiling in CSS pixels. Default: 10,000,000.</summary>
    public double MaxCoordinatePixels { get; init; } = 10_000_000;
    /// <summary>Gets the default resource ceilings.</summary>
    public static TikzLimits Default { get; } = new();
}

/// <summary>Explicit input, resource and SVG settings for one conversion.</summary>
/// <remarks>
/// Keep options, limits and any caller-owned library collection stable throughout
/// a call and concurrent calls sharing them. A read-only collection interface
/// does not make its underlying collection immutable.
/// </remarks>
public sealed record TikzOptions
{
    /// <summary>Input wrapper mode. Default: <see cref="TikzInputKind.Picture"/>.</summary>
    public TikzInputKind InputKind { get; init; } = TikzInputKind.Picture;
    /// <summary>Shared resource ceilings. Default: <see cref="TikzLimits.Default"/>.</summary>
    public TikzLimits Limits { get; init; } = TikzLimits.Default;
    /// <summary>Finite, nonnegative viewport padding in CSS pixels. Default: zero.</summary>
    public double PaddingPixels { get; init; } = 0;
    /// <summary>SVG definition-ID prefix, or empty to derive it from the source. Default: empty.</summary>
    /// <remarks>
    /// At most 64 ASCII characters: first a letter, then letters, digits, underscore,
    /// hyphen or period. Use distinct prefixes when combining repeated SVGs in one document.
    /// </remarks>
    public string IdPrefix { get; init; } = "";
    /// <summary>Library subsets to load before source evaluation. Default: an empty list.</summary>
    /// <remarks>
    /// Names must be nonblank. Supported subsets are calc, positioning, arrows.meta
    /// and shapes.geometric; other names produce TIKZ002. Libraries are local to a call.
    /// </remarks>
    public IReadOnlyList<string> Libraries { get; init; } = Array.Empty<string>();
    /// <summary>Gets picture input with default limits, zero padding and no preloaded libraries or explicit prefix.</summary>
    public static TikzOptions Default { get; } = new();
}

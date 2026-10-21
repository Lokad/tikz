namespace Lokad.TikZ;

/// <summary>A location in the caller's original source string.</summary>
/// <param name="Offset">Zero-based UTF-16 code-unit offset.</param>
/// <param name="Length">UTF-16 code-unit length; zero may mark an insertion point.</param>
/// <param name="Line">One-based line number; line advancement follows LF characters.</param>
/// <param name="Column">One-based UTF-16 code-unit column, without expanding tabs.</param>
public readonly record struct TikzSourceSpan(int Offset, int Length, int Line, int Column);
/// <summary>An explicit conversion diagnostic with original-source attribution.</summary>
/// <param name="Code">Stable TIKZ001–TIKZ005 category for syntax, unsupported input, unresolved names, arithmetic or resources.</param>
/// <param name="Message">Description of the diagnosed construct or failure.</param>
/// <param name="Span">Primary original-source location.</param>
public sealed record TikzDiagnostic(string Code, string Message, TikzSourceSpan Span)
{
    /// <summary>Additional original definition/invocation locations collected within the remaining work budget.</summary>
    public IReadOnlyList<TikzSourceSpan> RelatedLocations { get; init; } = Array.Empty<TikzSourceSpan>();
}
/// <summary>Axis-aligned bounds in CSS-pixel SVG coordinates, with positive Y downward.</summary>
/// <param name="MinX">Minimum X coordinate.</param>
/// <param name="MinY">Minimum Y coordinate.</param>
/// <param name="MaxX">Maximum X coordinate.</param>
/// <param name="MaxY">Maximum Y coordinate.</param>
/// <param name="IsEmpty">Whether no geometry contributed to the bound.</param>
public readonly record struct TikzBounds(double MinX, double MinY, double MaxX, double MaxY, bool IsEmpty)
{
    /// <summary>Width in CSS pixels, or zero when empty.</summary>
    public double Width => IsEmpty ? 0 : MaxX - MinX;
    /// <summary>Height in CSS pixels, or zero when empty.</summary>
    public double Height => IsEmpty ? 0 : MaxY - MinY;
}
/// <summary>Charged work counters for a completed or failed conversion.</summary>
/// <param name="Work">Work charged across all compiler phases.</param>
/// <param name="Segments">Charged path/generated geometry segments, rather than only visible primitives.</param>
/// <param name="Nodes">Charged node/coordinate declarations, including attached labels.</param>
/// <param name="Glyphs">Glyph consumption during layout.</param>
/// <param name="LoopIterations">Executed loop/sample iterations.</param>
/// <param name="OutputBytes">Successful SVG UTF-8 byte count, or zero on failure.</param>
public sealed record TikzStatistics(long Work, int Segments, int Nodes, int Glyphs, int LoopIterations, int OutputBytes);
/// <summary>Common diagnostics/statistics of success or explicit source failure.</summary>
/// <param name="Diagnostics">Conversion diagnostics; current successes have none and failures stop at the first.</param>
/// <param name="Statistics">Charged counters, which may be partial on failure.</param>
public abstract record TikzConversionResult(IReadOnlyList<TikzDiagnostic> Diagnostics, TikzStatistics Statistics);
/// <summary>A successful conversion with self-contained SVG and separate layout/ink bounds.</summary>
/// <param name="Svg">Returned SVG XML using paths, local clips and embedded glyph-outline references.</param>
/// <param name="PictureBounds">Picture geometry bounds in CSS-pixel SVG coordinates.</param>
/// <param name="InkBounds">Painted-ink bounds in CSS-pixel SVG coordinates.</param>
/// <param name="Diagnostics">Conversion diagnostics; currently empty on success.</param>
/// <param name="Statistics">Charged counters and successful UTF-8 output bytes.</param>
public sealed record TikzSuccess(string Svg, TikzBounds PictureBounds, TikzBounds InkBounds,
    IReadOnlyList<TikzDiagnostic> Diagnostics, TikzStatistics Statistics) : TikzConversionResult(Diagnostics, Statistics);
/// <summary>An explicit source/resource failure, with no SVG artifact.</summary>
/// <param name="Diagnostics">Current conversion's first explicit failure diagnostic.</param>
/// <param name="Statistics">Partial charged counters with zero output bytes.</param>
/// <remarks>Caller argument errors and cancellation throw instead of returning this result.</remarks>
public sealed record TikzFailure(IReadOnlyList<TikzDiagnostic> Diagnostics, TikzStatistics Statistics)
    : TikzConversionResult(Diagnostics, Statistics);

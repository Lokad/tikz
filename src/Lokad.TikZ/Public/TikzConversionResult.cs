namespace Lokad.TikZ;

public readonly record struct TikzSourceSpan(int Offset, int Length, int Line, int Column);
public sealed record TikzDiagnostic(string Code, string Message, TikzSourceSpan Span)
{
    public string Feature { get; init; } = "";
    public IReadOnlyList<TikzSourceSpan> RelatedLocations { get; init; } = Array.Empty<TikzSourceSpan>();
}
public readonly record struct TikzBounds(double MinX, double MinY, double MaxX, double MaxY, bool IsEmpty)
{
    public double Width => IsEmpty ? 0 : MaxX - MinX;
    public double Height => IsEmpty ? 0 : MaxY - MinY;
}
public sealed record TikzStatistics(long Work, int Segments, int Nodes, int Glyphs, int LoopIterations, int OutputBytes);
public abstract record TikzConversionResult(IReadOnlyList<TikzDiagnostic> Diagnostics, TikzStatistics Statistics);
public sealed record TikzSuccess(string Svg, TikzBounds PictureBounds, TikzBounds InkBounds,
    IReadOnlyList<TikzDiagnostic> Diagnostics, TikzStatistics Statistics) : TikzConversionResult(Diagnostics, Statistics);
public sealed record TikzFailure(IReadOnlyList<TikzDiagnostic> Diagnostics, TikzStatistics Statistics)
    : TikzConversionResult(Diagnostics, Statistics);

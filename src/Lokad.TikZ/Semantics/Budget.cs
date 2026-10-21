using Lokad.TikZ.Frontend;

namespace Lokad.TikZ.Semantics;

internal sealed class Budget(TikzLimits limits, CancellationToken cancellationToken)
{
    public TikzLimits Limits { get; } = limits;
    public long Work { get; private set; }
    public int Segments { get; private set; }
    public int Nodes { get; private set; }
    public int Glyphs { get; private set; }
    public int Iterations { get; private set; }
    private int _expandedTokens;
    public void Charge(Source source, long amount = 1)
    {
        if (!TryCharge(amount)) Fail(source, "work");
    }
    // Diagnostic collection stops when the remaining work is unavailable. It
    // must not recursively diagnose exhaustion while reporting another error.
    internal bool TryCharge(long amount)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (amount < 0 || amount > Limits.MaxWork - Work) return false;
        Work += amount;
        return true;
    }
    public void Segment(Source source)
    {
        Charge(source);
        if (Segments >= Limits.MaxSegments) Fail(source, "path segments");
        Segments++;
    }
    public void Node(Source source)
    {
        Charge(source);
        if (Nodes >= Limits.MaxNodes) Fail(source, "nodes");
        Nodes++;
    }
    public void Glyph(Source source)
    {
        Charge(source);
        if (Glyphs >= Limits.MaxGlyphs) Fail(source, "glyphs");
        Glyphs++;
    }
    public void Iteration(Source source)
    {
        Charge(source);
        if (Iterations >= Limits.MaxLoopIterations) Fail(source, "loop iterations");
        Iterations++;
    }
    public void Expand(Source source, int amount)
    {
        Charge(source, amount);
        if (amount < 0 || amount > Limits.MaxExpandedTokens - _expandedTokens) Fail(source, "expanded tokens");
        _expandedTokens += amount;
    }
    public void Depth(Source source, int depth, int limit)
    {
        Charge(source);
        if (depth > limit) Fail(source, "nesting");
    }
    public void Check(double value, Source source)
    {
        Charge(source);
        if (!double.IsFinite(value)) throw new CompileError("TIKZ004", "The calculation is not finite.", source);
        if (Math.Abs(value) * 96 / 72 > Limits.MaxCoordinatePixels) Fail(source, "coordinate magnitude");
    }
    public static void Fail(Source source, string resource)
        => throw new CompileError("TIKZ005", $"The {resource} limit was exceeded.", source);
    public TikzStatistics Statistics(int outputBytes) => new(Work, Segments, Nodes, Glyphs, Iterations, outputBytes);
}

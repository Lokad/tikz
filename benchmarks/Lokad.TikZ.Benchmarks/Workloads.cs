namespace Lokad.TikZ.Benchmarks;

internal sealed record Workload(string Source, TikzOptions Options, string Expected)
{
    private static readonly CancellationToken Cancelled = new(true);

    public TikzConversionResult? Convert()
    {
        try { return TikzConverter.Convert(Source, Options, Expected == "cancelled" ? Cancelled : CancellationToken.None); }
        catch (OperationCanceledException error) when (Expected == "cancelled" && error.CancellationToken == Cancelled)
        { return null; }
    }

    public void Check(TikzConversionResult? result)
    {
        if (Expected == "cancelled" && result is null) return;
        if (Expected == "success" && result is TikzSuccess { Diagnostics.Count: 0 }) return;
        if (result is TikzFailure failure && failure.Diagnostics.Count == 1
            && failure.Diagnostics[0].Code == Expected && failure.Statistics.OutputBytes == 0) return;
        throw new InvalidOperationException($"Unexpected result for {Expected}: {string.Join("; ", result?.Diagnostics.Select(d => d.Code + ": " + d.Message) ?? [])}");
    }
}

internal static class Workloads
{
    public static readonly string[] Ids = [
        "flowchart-draw-color", "flowchart-styled-labels", "network-math-labels", "network-smooth-plot",
        "small-primitives", "dense-network", "long-path", "expression-plot", "repeated-glyphs", "nested-styles",
        "reject-unsupported", "reject-work", "reject-glyphs", "cancelled-before-call"
    ];

    public static Workload Load(string id)
    {
        if (!Ids.Contains(id, StringComparer.Ordinal)) throw new ArgumentException("Unknown workload.", nameof(id));
        if (id == "reject-unsupported")
            return new(@"\input{not-read}", TikzOptions.Default with { InputKind = TikzInputKind.PictureBody }, "TIKZ002");
        var fixture = id switch
        {
            "reject-work" or "cancelled-before-call" => "network-math-labels",
            "reject-glyphs" => "repeated-glyphs",
            _ => id
        };
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", fixture + ".tikz"));
        var limits = id switch
        {
            "reject-work" => TikzLimits.Default with { MaxWork = 100 },
            "reject-glyphs" => TikzLimits.Default with { MaxGlyphs = 32 },
            _ => TikzLimits.Default
        };
        return new(source, TikzOptions.Default with { Limits = limits },
            id == "cancelled-before-call" ? "cancelled" : id.StartsWith("reject-", StringComparison.Ordinal) ? "TIKZ005" : "success");
    }
}

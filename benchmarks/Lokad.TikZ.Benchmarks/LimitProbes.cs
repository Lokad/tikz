namespace Lokad.TikZ.Benchmarks;

internal static class LimitProbes
{
    internal static object Check()
    {
        var records = new List<object>();
        foreach (var id in Workloads.Ids.Take(10))
        {
            var workload = Workloads.Load(id);
            var expected = workload.Convert() as TikzSuccess ?? throw new InvalidOperationException("Limit source is not admitted.");
            var generated = Pipeline.Observe(workload).ExpandedCharacters;
            var stats = expected.Statistics;
            var checks = new List<object>();
            Exact("sourceCharacters", workload.Source.Length, (l, n) => l with { MaxSourceCharacters = checked((int)n) });
            Exact("work", stats.Work, (l, n) => l with { MaxWork = n });
            Exact("nodes", stats.Nodes, (l, n) => l with { MaxNodes = checked((int)n) });
            Exact("segments", stats.Segments, (l, n) => l with { MaxSegments = checked((int)n) });
            Exact("glyphs", stats.Glyphs, (l, n) => l with { MaxGlyphs = checked((int)n) });
            Exact("loopIterations", stats.LoopIterations, (l, n) => l with { MaxLoopIterations = checked((int)n) });
            Exact("generatedCharacters", generated, (l, n) => l with { MaxExpandedTokens = checked((int)n) });
            Exact("outputBytes", stats.OutputBytes, (l, n) => l with { MaxOutputBytes = checked((int)n) });
            Minimum("nesting", TikzLimits.Default.MaxNesting, (l, n) => l with { MaxNesting = checked((int)n) });
            Minimum("expressionDepth", TikzLimits.Default.MaxExpressionDepth, (l, n) => l with { MaxExpressionDepth = checked((int)n) });
            Minimum("expansionDepth", TikzLimits.Default.MaxExpansionDepth, (l, n) => l with { MaxExpansionDepth = checked((int)n) });
            Minimum("coordinatePixelsIntegerCeiling", checked((int)TikzLimits.Default.MaxCoordinatePixels), (l, n) => l with { MaxCoordinatePixels = n });
            records.Add(new { id, sourceSha256 = PerformanceProbes.Hash(workload.Source), statistics = stats, generatedCharacters = generated, checks });

            void Exact(string name, long required, Func<TikzLimits, long, TikzLimits> set)
            {
                if (required == 0) { Success(set(workload.Options.Limits, 0)); checks.Add(new { name, required, below = "not-applicable-zero" }); return; }
                Success(set(workload.Options.Limits, required));
                Failure(set(workload.Options.Limits, required - 1));
                checks.Add(new { name, required, below = "TIKZ005", atBoundary = "same-svg" });
            }
            void Minimum(string name, int maximum, Func<TikzLimits, long, TikzLimits> set)
            {
                var low = 1;
                var high = maximum;
                while (low < high)
                {
                    var middle = low + (high - low) / 2;
                    var result = Convert(set(workload.Options.Limits, middle));
                    if (result is TikzSuccess success) { Equal(success); high = middle; }
                    else { Rejected(result); low = middle + 1; }
                }
                Success(set(workload.Options.Limits, low));
                if (low > 1) Failure(set(workload.Options.Limits, low - 1));
                checks.Add(new { name, required = low, below = low > 1 ? "TIKZ005" : "invalid-options-zero", atBoundary = "same-svg" });
            }
            TikzConversionResult Convert(TikzLimits limits) => TikzConverter.Convert(workload.Source, workload.Options with { Limits = limits }, CancellationToken.None);
            void Success(TikzLimits limits) { if (Convert(limits) is not TikzSuccess success) throw new InvalidOperationException("Measured limit did not admit: " + id); Equal(success); }
            void Failure(TikzLimits limits) => Rejected(Convert(limits));
            void Equal(TikzSuccess success) { if (success.Svg != expected.Svg || success.Statistics != expected.Statistics) throw new InvalidOperationException("Limit changed successful output/counters: " + id); }
            void Rejected(TikzConversionResult result)
            {
                if (result is not TikzFailure { Diagnostics.Count: 1, Statistics.OutputBytes: 0 } failure || failure.Diagnostics[0].Code != "TIKZ005")
                    throw new InvalidOperationException("Limit failed to reject with TIKZ005: " + id);
            }
        }
        return new { completed = true, role = "performance-limit-calibration", workloads = 10, records,
            defaults = TikzLimits.Default, scope = "Counter limits checked exactly at/below usage. Depth limits and coordinate magnitude find minimum successful positive integer. Conversion stops on the first error; related diagnostics consume remaining work." };
    }
}

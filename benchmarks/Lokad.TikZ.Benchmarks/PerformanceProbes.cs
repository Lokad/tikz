using System.Collections;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Svg;
using Lokad.TikZ.Text;

namespace Lokad.TikZ.Benchmarks;

internal static class PerformanceProbes
{
    private sealed record CallObservation(double Seconds, long AllocatedBytes, TikzStatistics? Statistics,
        string Outcome, string? SvgSha256, IReadOnlyList<TikzDiagnostic>? Diagnostics);

    internal static object CheckPhases()
    {
        var records = Workloads.Ids.Where(id => id != "cancelled-before-call").Select(id =>
        {
            var workload = Workloads.Load(id);
            var expected = workload.Convert();
            workload.Check(expected);
            var observed = Pipeline.Observe(workload);
            if (expected is null || expected.GetType() != observed.Result.GetType()
                || JsonSerializer.Serialize(expected, expected.GetType()) != JsonSerializer.Serialize(observed.Result, observed.Result.GetType()))
                throw new InvalidOperationException("Shared-budget/public mismatch: " + id);
            if (observed.Phases.Sum(p => p.Counters.Work) != observed.Result.Statistics.Work)
                throw new InvalidOperationException("Phase work counters differ: " + id);
            if (workload.Expected == "success")
            {
                var benchmark = new PhaseBenchmarks { Workload = id };
                benchmark.Setup();
            }
            return new { id, sourceSha256 = Hash(workload.Source), sourceCharacters = workload.Source.Length,
                expected = workload.Expected, svgSha256 = observed.Result is TikzSuccess success ? Hash(success.Svg) : null, observed };
        }).ToArray();
        foreach (var label in LabelBenchmarks.Sources.Keys) new LabelBenchmarks { Label = label }.Setup();
        return new { completed = true, role = "performance-phase-admission", records,
            successfulPhaseWorkloads = 10, labelWorkloads = 3, warmBenchmarkCases = 50,
            definition = "Phase counters partition shared-budget work. Isolated BDN phases use fresh budgets; evaluator includes labels." };
    }

    internal static object FirstAndWarm(string id, int repeats)
    {
        if (repeats < 3 || repeats > 1000) throw new ArgumentOutOfRangeException(nameof(repeats));
        var workload = Workloads.Load(id); // No conversion or font census before first timing.
        using var process = Process.GetCurrentProcess();
        process.Refresh();
        var initialWorkingSet = process.WorkingSet64;
        var initialPeakWorkingSet = process.PeakWorkingSet64;
        var first = ConvertOnce();
        var firstFonts = Fonts();
        var warm = Enumerable.Range(0, repeats).Select(_ => ConvertOnce()).ToArray();
        static string Outcome(CallObservation call) => JsonSerializer.Serialize(new { call.Statistics, call.Outcome, call.SvgSha256, call.Diagnostics });
        if (warm.Any(call => Outcome(call) != Outcome(first)))
            throw new InvalidOperationException("First/warm output or counters differ.");
        var warmFonts = Fonts();
        if (JsonSerializer.Serialize(firstFonts) != JsonSerializer.Serialize(warmFonts))
            throw new InvalidOperationException("Repeated same-input conversion loaded additional font faces.");
        process.Refresh();
        var workingSet = process.WorkingSet64;
        var peakWorkingSet = process.PeakWorkingSet64;
        var pipeline = workload.Expected == "cancelled" ? null : Pipeline.Observe(workload);
        return new { completed = true, role = "performance-first-warm-probe", id, sourceSha256 = Hash(workload.Source),
            sourceCharacters = workload.Source.Length, workload.Expected, first, warm, firstFonts, warmFonts,
            initialWorkingSet, initialPeakWorkingSet, workingSet, peakWorkingSet,
            counters = pipeline is null ? null : new { pipeline.ParsedStatements, pipeline.ParsedPathOperations,
                pipeline.ExpandedCharacters, pipeline.Drawables, pipeline.Coordinates, pipeline.UniqueOutlines,
                pipeline.PlacedGlyphs, pipeline.PlacedRules }, identity = Identity(),
            scope = "First converter call includes its JIT/font first use, excluding process launch and fixture IO. Process memory includes harness/runtime and untimed checking; font census precedes warm calls. Outline cache is per conversion." };

        CallObservation ConvertOnce()
        {
            var allocated = GC.GetAllocatedBytesForCurrentThread();
            var start = Stopwatch.GetTimestamp();
            var result = workload.Convert();
            var seconds = Stopwatch.GetElapsedTime(start).TotalSeconds;
            var bytes = GC.GetAllocatedBytesForCurrentThread() - allocated;
            workload.Check(result);
            return new(seconds, bytes, result?.Statistics,
                result is TikzSuccess ? "success" : result is TikzFailure ? "failure" : "cancelled",
                result is TikzSuccess success ? Hash(success.Svg) : null, result?.Diagnostics);
        }
    }

    internal static object CancelOngoing(int repeats)
    {
        if (repeats < 3 || repeats > 100) throw new ArgumentOutOfRangeException(nameof(repeats));
        const string text = @"\foreach \i in {1,...,10000} {\draw (0,0)--(1,0);}";
        var source = new Source(text, 0, text.Length);
        var options = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody };
        if (TikzConverter.Convert(text, options, CancellationToken.None) is not TikzSuccess)
            throw new InvalidOperationException("Ongoing cancellation source is not a supported successful workload.");
        var records = Enumerable.Range(0, repeats).Select(_ =>
        {
            using var cancellation = new CancellationTokenSource();
            var budget = new Budget(options.Limits, cancellation.Token);
            var phase = "parse";
            var worker = Task.Factory.StartNew(() =>
            {
                try
                {
                    var program = new Parser(source, budget).Parse(options.InputKind);
                    Volatile.Write(ref phase, "evaluate");
                    var scene = new Evaluator(budget).Evaluate(program, options);
                    Volatile.Write(ref phase, "svg");
                    SvgWriter.Write(scene, text, options, budget);
                    throw new InvalidOperationException("Ongoing probe completed before cancellation.");
                }
                catch (OperationCanceledException error) when (error.CancellationToken == cancellation.Token)
                {
                    return Stopwatch.GetTimestamp();
                }
            }, CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);
            if (!SpinWait.SpinUntil(() => { Thread.MemoryBarrier(); return budget.Work >= 10_000 || worker.IsCompleted; }, TimeSpan.FromSeconds(10)))
                throw new InvalidOperationException("Ongoing probe did not make charged progress.");
            var workBeforeRequest = budget.Work;
            var phaseAtRequest = Volatile.Read(ref phase);
            if (worker.IsCompleted) worker.GetAwaiter().GetResult();
            if (workBeforeRequest < 10_000)
                throw new InvalidOperationException("Cancellation was not requested during ongoing work.");
            var requested = Stopwatch.GetTimestamp();
            cancellation.Cancel();
            var observed = worker.GetAwaiter().GetResult();
            var seconds = (observed - requested) / (double)Stopwatch.Frequency;
            if (seconds < 0) throw new InvalidOperationException("Invalid cancellation timing.");
            return new { seconds, phaseAtRequest, workBeforeRequest, finalCounters = budget.Statistics(0), suppliedTokenObserved = true };
        }).ToArray();
        return new { completed = true, role = "performance-ongoing-cancellation-probe", sourceSha256 = Hash(text), records,
            identity = Identity(), scope = "Actual internal parser/evaluator/SVG pipeline with shared caller budget/token. Request follows at least 10,000 observed charged units; latency ends when worker catches supplied-token cancellation. Public pre-call cancellation is benchmarked separately." };
    }

    private static object Fonts() => new { text = CreatedFaces(typeof(TextLayout)), math = CreatedFaces(typeof(MathLayout)) };
    private static string[] CreatedFaces(Type type)
    {
        var faces = (IEnumerable)(type.GetField("Faces", BindingFlags.Static | BindingFlags.NonPublic)?.GetValue(null)
            ?? throw new InvalidOperationException("Font cache census is unavailable."));
        var result = new List<string>();
        foreach (var item in faces)
        {
            var key = (string)item.GetType().GetProperty("Key")!.GetValue(item)!;
            var lazy = item.GetType().GetProperty("Value")!.GetValue(item)!;
            if ((bool)lazy.GetType().GetProperty("IsValueCreated")!.GetValue(lazy)!) result.Add(key);
        }
        return result.Order(StringComparer.Ordinal).ToArray();
    }

    internal static string Hash(string text) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)));
    private static object Identity() => new { runtime = RuntimeInformation.FrameworkDescription,
        os = RuntimeInformation.OSDescription, architecture = RuntimeInformation.ProcessArchitecture.ToString(),
        processors = Environment.ProcessorCount, stopwatchFrequency = Stopwatch.Frequency,
        productionAssemblySha256 = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(typeof(TikzConverter).Assembly.Location))) };
}

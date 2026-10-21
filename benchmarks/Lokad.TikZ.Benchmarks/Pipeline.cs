using System.Diagnostics;
using System.Reflection;
using System.Text;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Svg;

namespace Lokad.TikZ.Benchmarks;

internal sealed record PhaseObservation(string Phase, double Seconds, long AllocatedBytes, TikzStatistics Counters);
internal sealed record PipelineObservation(TikzConversionResult Result, PhaseObservation[] Phases,
    int ParsedStatements, int ParsedPathOperations, int ExpandedCharacters, int Drawables, int Coordinates,
    int UniqueOutlines, int PlacedGlyphs, int PlacedRules);

internal static class Pipeline
{
    // Existing counter, inspected outside measured operations; no production hook.
    private static readonly FieldInfo Expanded = typeof(Budget).GetField("_expandedTokens", BindingFlags.Instance | BindingFlags.NonPublic)
        ?? throw new InvalidOperationException("Generated-character counter is unavailable.");

    internal static PipelineObservation Observe(Workload workload)
    {
        var source = new Source(workload.Source, 0, workload.Source.Length);
        var budget = new Budget(workload.Options.Limits, CancellationToken.None);
        List<Statement>? program = null;
        GraphicsScene? scene = null;
        var phases = new List<PhaseObservation>();
        TikzConversionResult result;
        try
        {
            if (source.Length > budget.Limits.MaxSourceCharacters) Budget.Fail(source.Slice(0, 0), "source characters");
            program = Measure("parse", () => new Parser(source, budget).Parse(workload.Options.InputKind));
            scene = Measure("evaluate-including-labels", () => new Evaluator(budget).Evaluate(program, workload.Options));
            var svg = Measure("svg", () => SvgWriter.Write(scene, workload.Source, workload.Options, budget));
            result = new TikzSuccess(svg, scene.PictureBounds.Pixels, scene.InkBounds.Pixels,
                Array.Empty<TikzDiagnostic>(), budget.Statistics(Encoding.UTF8.GetByteCount(svg)));
        }
        catch (CompileError error)
        {
            var diagnostic = Measure("diagnostics", () => error.CreateDiagnostic(budget));
            result = new TikzFailure(Array.AsReadOnly(new[] { diagnostic }), budget.Statistics(0));
        }
        var statements = program is null ? [] : Statements(program).ToArray();
        var runs = scene?.Drawables.OfType<PaintedGlyphRun>().ToArray() ?? [];
        return new(result, phases.ToArray(), statements.Length,
            statements.OfType<PathStatement>().Sum(p => p.Operations.Count), (int)Expanded.GetValue(budget)!,
            scene?.Drawables.Count ?? 0, scene?.Coordinates.Count ?? 0, scene?.Outlines.Count ?? 0,
            runs.Sum(r => r.Glyphs.Length), runs.Sum(r => r.Rules.Length));

        T Measure<T>(string phase, Func<T> action)
        {
            var startCounters = budget.Statistics(0);
            var allocated = GC.GetAllocatedBytesForCurrentThread();
            var start = Stopwatch.GetTimestamp();
            try { return action(); }
            finally
            {
                var seconds = Stopwatch.GetElapsedTime(start).TotalSeconds;
                var bytes = GC.GetAllocatedBytesForCurrentThread() - allocated;
                var end = budget.Statistics(0);
                phases.Add(new(phase, seconds, bytes, new(end.Work - startCounters.Work,
                    end.Segments - startCounters.Segments, end.Nodes - startCounters.Nodes,
                    end.Glyphs - startCounters.Glyphs, end.LoopIterations - startCounters.LoopIterations, 0)));
            }
        }
    }

    private static IEnumerable<Statement> Statements(List<Statement> program)
    {
        foreach (var statement in program)
        {
            yield return statement;
            if (statement is ScopeStatement scope)
                foreach (var nested in Statements(scope.Body)) yield return nested;
        }
        // Foreach bodies are source templates, parsed during evaluation.
    }
}

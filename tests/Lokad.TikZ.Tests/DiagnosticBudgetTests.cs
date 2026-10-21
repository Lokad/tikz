using Lokad.TikZ.Frontend;
using Lokad.TikZ.Semantics;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class DiagnosticBudgetTests
{
    [Fact]
    public void Exhaustion_still_reports_the_original_primary_location()
    {
        const string text = "% \U0001f600\r\n\n  broken";
        var origin = new Source(text, text.IndexOf("broken", StringComparison.Ordinal), 6)
        {
            RelatedSources = [new(text, 0, 1)]
        };
        var budget = new Budget(TikzLimits.Default with { MaxWork = 0 }, CancellationToken.None);
        var diagnostic = new CompileError("TIKZ004", "original failure", origin).CreateDiagnostic(budget);
        Assert.Equal("TIKZ004", diagnostic.Code);
        Assert.Equal("original failure", diagnostic.Message);
        Assert.Equal(new TikzSourceSpan(origin.Offset, 6, 3, 3), diagnostic.Span);
        Assert.Empty(diagnostic.RelatedLocations);
        Assert.Equal(0, budget.Work);
    }

    [Fact]
    public void Related_provenance_is_bounded_by_remaining_work_without_losing_the_error()
    {
        var origin = Chain(4000);
        var budget = new Budget(TikzLimits.Default with { MaxWork = 10_000 }, CancellationToken.None);
        var diagnostic = new CompileError("TIKZ003", "unknown", origin).CreateDiagnostic(budget);
        Assert.Equal("TIKZ003", diagnostic.Code);
        Assert.Equal(origin.Location, diagnostic.Span);
        Assert.InRange(diagnostic.RelatedLocations.Count, 1, 3998);
        Assert.InRange(budget.Work, 1, budget.Limits.MaxWork);
        Assert.Equal(diagnostic.RelatedLocations.Count, diagnostic.RelatedLocations.Distinct().Count());
    }

    [Fact]
    public void Long_public_assignment_chains_keep_definition_locations_and_charge_formatting()
    {
        var source = "\\pgfmathsetmacro\\a{0}" + string.Concat(Enumerable.Repeat("\\pgfmathsetmacro\\a{\\a+1}\n", 1024))
            + "\\draw (0,0)--(\\a/0,0);";
        var options = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody };
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, options, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ004", diagnostic.Code);
        Assert.Equal(1025, diagnostic.Span.Line);
        Assert.Contains(diagnostic.RelatedLocations, span => span.Line == 1);
        Assert.Contains(diagnostic.RelatedLocations, span => span.Line == 1024);
        Assert.InRange(failure.Statistics.Work, source.Length * 4L, options.Limits.MaxWork);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Fact]
    public void Cancellation_interrupts_ongoing_diagnostic_materialization()
    {
        var origin = Chain(100_000);
        var error = new CompileError("TIKZ004", "original failure", origin);
        using var cancellation = new CancellationTokenSource();
        var budget = new Budget(TikzLimits.Default, cancellation.Token);
        using var ready = new ManualResetEventSlim();
        var finished = false;
        // A thread-pool continuation can be delayed until formatting has
        // finished on a small CI runner. Keep the observer independently runnable.
        var observer = new Thread(() =>
        {
            ready.Set();
            SpinWait.SpinUntil(() => budget.Work >= 10_000 || Volatile.Read(ref finished));
            if (!Volatile.Read(ref finished)) cancellation.Cancel();
        }) { IsBackground = true };
        observer.Start();
        ready.Wait();
        try
        {
            var cancelled = Assert.ThrowsAny<OperationCanceledException>(() => error.CreateDiagnostic(budget));
            Assert.Equal(cancellation.Token, cancelled.CancellationToken);
            Assert.True(budget.Work >= 10_000);
        }
        finally
        {
            Volatile.Write(ref finished, true);
            observer.Join();
        }
    }

    private static Source Chain(int count)
    {
        var text = string.Concat(Enumerable.Repeat("a\n", count));
        var source = new Source(text, 0, 1);
        for (var i = 1; i < count; i++) source = new(text, i * 2, 1) { RelatedSources = [source] };
        return source;
    }
}

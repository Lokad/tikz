using Lokad.TikZ.Frontend;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Text;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class OutlineAdmissionTests
{
    [Fact]
    public void Cached_outline_limits_use_the_current_source_and_do_not_poison_later_calls()
    {
        var first = new Source("first", 0, 5);
        var rejected = Assert.Throws<CompileError>(() => GlyphOutline.Get("regular-12", 65,
            new(TikzLimits.Default with { MaxSegments = 0 }, CancellationToken.None), first));
        Assert.Equal("TIKZ005", rejected.Diagnostic.Code);
        Assert.Equal(first.Location, rejected.Diagnostic.Span);
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var outline = GlyphOutline.Get("regular-12", 65, budget, first);
        var second = new Source("  second", 2, 6);
        var limited = new Budget(TikzLimits.Default with { MaxSegments = outline.Segments.Length - 1 }, CancellationToken.None);
        var current = Assert.Throws<CompileError>(() => GlyphOutline.Get("regular-12", 65, limited, second));
        Assert.Equal("TIKZ005", current.Diagnostic.Code);
        Assert.Equal(second.Location, current.Diagnostic.Span);
        var warm = new Budget(TikzLimits.Default, CancellationToken.None);
        var repeated = GlyphOutline.Get("regular-12", 65, warm, second);
        Assert.Equal(outline.PathBp, repeated.PathBp);
        Assert.Equal(outline.Segments, repeated.Segments);
        Assert.Equal(budget.Statistics(0), warm.Statistics(0));
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        var error = Assert.Throws<OperationCanceledException>(() => GlyphOutline.Get("regular-12", 65,
            new(TikzLimits.Default, cancellation.Token), second));
        Assert.Equal(cancellation.Token, error.CancellationToken);
    }
}

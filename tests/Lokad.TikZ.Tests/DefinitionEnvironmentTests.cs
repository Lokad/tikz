using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class DefinitionEnvironmentTests
{
    private static string Input(string body, TikzInputKind kind)
        => kind == TikzInputKind.PictureBody ? body : @"\begin{tikzpicture}" + body + @"\end{tikzpicture}";

    private static TikzOptions Options(TikzInputKind kind) => TikzOptions.Default with { InputKind = kind, IdPrefix = "environment" };

    [Theory]
    [InlineData(TikzInputKind.PictureBody)]
    [InlineData(TikzInputKind.Picture)]
    public void Subsequent_calls_use_definitions_created_by_executed_templates(TikzInputKind kind)
    {
        foreach (var body in new[] {
            @"\def\setup{\def\place{\draw (0,0)--(1,0);}}\setup\place",
            @"\def\setup{\def\place{\alias}\def\alias{\draw (0,0)--(1,0);}}\setup\place",
            @"\def\setup{\def\place{\draw (0,0)--(1,0);}}\begin{scope}\setup\place\end{scope}",
            @"\def\setup{\def\place{\draw (0,0)--(1,0);}}{\setup\place}",
            @"\def\setup{\def\place{\draw (0,0)--(1,0);}}\setup{\place}",
            @"\pgfmathsetmacro\place{1}\def\setup{\def\place{\draw (0,0)--(1,0);}}\setup\place"
        }) Equivalent(body, @"\draw (0,0)--(1,0);", kind);
    }

    [Theory]
    [InlineData(TikzInputKind.PictureBody)]
    [InlineData(TikzInputKind.Picture)]
    public void Calls_and_new_definitions_preserve_scope_and_iteration_restoration(TikzInputKind kind)
    {
        Equivalent(@"\def\place{\node{Outer};}\def\setup{\def\place{\node{Inner};}}
            \begin{scope}\setup\place\end{scope}\place", @"\node{Inner};\node{Outer};", kind);
        Equivalent(@"\def\place{\node{Outer};}\def\setup{\def\place{\node at(\i,0){Inner};}}
            \foreach\i in{1,2}{\setup\place}\place", @"\node at(1,0){Inner};\node at(2,0){Inner};\node{Outer};", kind);
        Equivalent(@"\def\setup{\def\place{\node at(\i,0){Inner};}}
            \foreach\i in{1,2}{\setup\place}", @"\node at(1,0){Inner};\node at(2,0){Inner};", kind);
    }

    [Theory]
    [InlineData(TikzInputKind.PictureBody)]
    [InlineData(TikzInputKind.Picture)]
    public void Missing_or_expired_calls_fail_at_the_current_invocation(TikzInputKind kind)
    {
        foreach (var body in new[] {
            @"\def\setup{\def\place{\draw(0,0)--(1,0);}}\place\setup",
            @"\def\setup{\def\place{\draw(0,0)--(1,0);}}{\setup}\place",
            @"\def\setup{\def\place{\draw(0,0)--(1,0);}}\begin{scope}\setup\end{scope}\place",
            @"\def\setup{\def\place{\draw(0,0)--(1,0);}}\foreach\i in{1}{\setup}\place",
            @"\def\setup{\def\place{\draw(0,0)--(1,0);}}\setup\pgfmathsetmacro\place{1}\place"
        })
        {
            var source = Input("% 😀\r\n" + body, kind);
            var failed = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Options(kind), CancellationToken.None));
            var diagnostic = Assert.Single(failed.Diagnostics);
            Assert.Equal("TIKZ002", diagnostic.Code);
            Assert.Equal(@"\place", source.Substring(diagnostic.Span.Offset, diagnostic.Span.Length));
            var expected = body.EndsWith(@"\place", StringComparison.Ordinal) ? source.LastIndexOf(@"\place", StringComparison.Ordinal)
                : source.IndexOf(@"\place\setup", StringComparison.Ordinal);
            Assert.Equal(expected, diagnostic.Span.Offset);
            Assert.Equal(0, failed.Statistics.OutputBytes);
        }
    }

    [Theory]
    [InlineData(TikzInputKind.PictureBody)]
    [InlineData(TikzInputKind.Picture)]
    public void Newly_introduced_calls_keep_recursion_provenance_and_shared_limits(TikzInputKind kind)
    {
        var source = Input("% 😀\r\n" + @"\def\setup{\def\place{\place}}\setup\place", kind);
        var failed = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Options(kind), CancellationToken.None));
        var diagnostic = Assert.Single(failed.Diagnostics);
        Assert.Equal("TIKZ003", diagnostic.Code);
        Assert.Equal(source.IndexOf(@"\place}", StringComparison.Ordinal), diagnostic.Span.Offset);
        Assert.Contains(diagnostic.RelatedLocations, s => s.Offset == source.LastIndexOf(@"\place", StringComparison.Ordinal));
        Assert.Equal(0, failed.Statistics.OutputBytes);

        source = Input(@"\def\setup{\def\first{\second}\def\second{\third}\def\third{\node{X};}}\setup\first", kind);
        var successful = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, Options(kind), CancellationToken.None));
        foreach (var limits in new[] {
            TikzLimits.Default with { MaxExpansionDepth = 2 },
            TikzLimits.Default with { MaxExpandedTokens = 0 },
            TikzLimits.Default with { MaxWork = successful.Statistics.Work - 1 }
        })
        {
            var limited = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Options(kind) with { Limits = limits }, CancellationToken.None));
            Assert.Equal("TIKZ005", Assert.Single(limited.Diagnostics).Code);
            Assert.Equal(0, limited.Statistics.OutputBytes);
        }
        using var cancel = new CancellationTokenSource(); cancel.Cancel();
        Assert.Equal(cancel.Token, Assert.Throws<OperationCanceledException>(() => TikzConverter.Convert(source, Options(kind), cancel.Token)).CancellationToken);
    }

    [Theory]
    [InlineData(@"\def\setup{\def\draw{bad}}\setup")]
    [InlineData(@"\def\setup{\def\i{2}}\foreach\i in{1}{\setup}")]
    [InlineData(@"\def\setup{\input{file}}\setup")]
    [InlineData(@"\def\unused{}\unknown{argument}")]
    public void Deferred_calls_preserve_reserved_binding_and_unsupported_failures(string source)
    {
        var failed = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Options(TikzInputKind.PictureBody), CancellationToken.None));
        Assert.Equal("TIKZ002", Assert.Single(failed.Diagnostics).Code);
        Assert.Equal(0, failed.Statistics.OutputBytes);
    }

    private static void Equivalent(string body, string expanded, TikzInputKind kind)
    {
        var actual = Assert.IsType<TikzSuccess>(TikzConverter.Convert(Input(body, kind), Options(kind), CancellationToken.None));
        var expected = Assert.IsType<TikzSuccess>(TikzConverter.Convert(Input(expanded, kind), Options(kind), CancellationToken.None));
        Assert.Equal(expected.Svg, actual.Svg);
        Assert.Equal(expected.PictureBounds, actual.PictureBounds);
        Assert.Equal(expected.InkBounds, actual.InkBounds);
        Assert.Equal(expected.Statistics.Glyphs, actual.Statistics.Glyphs);
        Assert.Equal(expected.Statistics.Nodes, actual.Statistics.Nodes);
        Assert.Equal(expected.Statistics.Segments, actual.Statistics.Segments);
    }
}

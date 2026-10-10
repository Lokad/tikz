using Lokad.TikZ.Graphics;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Semantics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using TikzArrowComparison;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class PlotTests
{
    private static readonly TikzOptions Body = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody };

    [Fact]
    public void Complete_network_combines_smoothing_cycles_and_existing_diagram_features()
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures/Diagrams/network-smooth-plot.tikz"));
        var converted = TikzConverter.Convert(source, TikzOptions.Default, CancellationToken.None);
        Assert.True(converted is TikzSuccess, string.Join("; ", converted.Diagnostics.Select(d => d.Code + ": " + d.Message + " at " + d.Span.Offset)));
    }

    [Theory]
    [InlineData("smooth", "", "Move,Line", 1, 0)]
    [InlineData("smooth", "(1,1)", "Move,Move,Line", 2, 1)]
    [InlineData("smooth", "(0,0)(2,2)", "Move,Move,Cubic,Line", 3, 2)]
    [InlineData("smooth cycle", "", "Move,Line", 1, 0)]
    [InlineData("smooth cycle", "(1,1)", "Move,Line", 2, 1)]
    [InlineData("smooth cycle", "(0,0)(2,2)", "Move,Move,Line", 3, 2)]
    [InlineData("smooth cycle", "(0,0)(1,2)(3,1)", "Move,Move,Cubic,Cubic,Cubic,Close,Line", 4, 1)]
    public void Smooth_short_streams_and_closed_continuation_preserve_native_last_position(string handler, string coordinates, string kinds, int x, int y)
    {
        var scene = Scene(@"\draw[x=1pt,y=1pt](9,9)plot[" + handler + "]coordinates{" + coordinates + "}--++(1,0);");
        var segments = Assert.Single(scene.Paths).Path.Segments;
        Assert.Equal(kinds, string.Join(',', segments.Select(s => s.Kind)));
        Assert.Equal((x, y), (Pt(segments[^1].End.X), Pt(segments[^1].End.Y)));
    }

    [Theory]
    [InlineData("tension=1/2", "TIKZ002")]
    [InlineData("tension=0.5cm", "TIKZ002")]
    [InlineData("tension=16384", "TIKZ004")]
    [InlineData("tension=nan", "TIKZ002")]
    [InlineData("sharp cycle", "TIKZ002")]
    public void Undeclared_smoothing_options_fail_with_input_spans(string option, string code)
    {
        var source = @"\draw plot[smooth," + option + "]coordinates{(0,0)(1,2)(3,1)};";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal(code, diagnostic.Code);
        Assert.InRange(diagnostic.Span.Offset, 18, source.Length);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Fact]
    public void Smooth_controls_share_segment_coordinate_and_work_limits()
    {
        const string source = @"\draw plot[smooth cycle]coordinates{(0,0)(1,2)(3,1)(2,0)};";
        foreach (var limits in new[] { TikzLimits.Default with { MaxSegments = 3 }, TikzLimits.Default with { MaxWork = 50 }, TikzLimits.Default with { MaxCoordinatePixels = 1 } })
        {
            var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body with { Limits = limits }, CancellationToken.None));
            Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
            Assert.Equal(0, failure.Statistics.OutputBytes);
        }
    }

    [Fact]
    public void Complete_network_combines_function_sampling_and_existing_diagram_features()
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures/Diagrams/network-function-plot.tikz"));
        var converted = TikzConverter.Convert(source, TikzOptions.Default, CancellationToken.None);
        Assert.True(converted is TikzSuccess, string.Join("; ", converted.Diagnostics.Select(d => d.Code + ": " + d.Message + " at " + d.Span.Offset)));
    }

    [Theory]
    [InlineData("", 24)]
    [InlineData("domain=-5:5", 25)]
    [InlineData("domain=0:1,samples=4", 4)]
    [InlineData("domain=1:0,samples=4", 4)]
    [InlineData("domain=2:2,samples=7", 2)]
    [InlineData("domain=0:0.00005,samples=9", 2)]
    [InlineData("domain=0:1,samples=0", 2)]
    [InlineData("domain=0:1,samples=3.5", 3)]
    [InlineData("samples at={0,0.25,...,1}", 5)]
    [InlineData("samples at={1,0.75,...,0}", 5)]
    [InlineData("samples at={}", 0)]
    public void Function_sampling_uses_finite_native_range_counts(string options, int count)
    {
        var scene = Scene(@"\draw[" + options + @"]plot(\x,0);");
        Assert.Equal(count, scene.Paths.Sum(p => p.Path.Segments.Count));
    }

    [Theory]
    [InlineData("domain=0:1,samples=3,samples at={2,3}", 2)]
    [InlineData("samples at={2,3},domain=0:1,samples=3", 3)]
    public void Later_domain_and_samples_options_replace_explicit_lists(string options, int count)
        => Assert.Equal(count, Assert.Single(Scene(@"\draw[" + options + @"]plot(\x,0);").Paths).Path.Segments.Count);

    [Fact]
    public void Function_variable_shadowing_restores_numeric_bindings()
    {
        var scene = Scene(@"\pgfmathsetmacro\x{7}\draw[x=1pt,y=1pt,domain=0:1,samples=3]plot(\x,\x);\draw[x=1pt,y=1pt](\x,0)--(8,0);");
        Assert.Equal(new[] { 0, 32768, 65536 }, scene.Paths[0].Path.Segments.Select(s => (int)Math.Round(s.End.X * 72.27 / 72 * 65536)));
        Assert.Equal(7, Pt(scene.Paths[1].Path.Segments[0].End.X));
        Assert.Single(scene.NumericAssignments);
    }

    [Theory]
    [InlineData("\\x^2", -4)]
    [InlineData("(\\x)^2", 4)]
    [InlineData("pow(\\x,2)", 4)]
    public void Negative_samples_preserve_text_expansion_and_power_grouping(string expression, int y)
    {
        var scene = Scene(@"\draw[x=1pt,y=1pt,samples at={-2}]plot(\x,{" + expression + "});");
        Assert.Equal(y, Pt(Assert.Single(scene.Paths).Path.Segments[0].End.Y));
    }

    [Theory]
    [InlineData("domain=0", "(\\x,0)", "TIKZ001")]
    [InlineData("domain=0:1:2", "(\\x,0)", "TIKZ001")]
    [InlineData("domain=0:1cm", "(\\x,0)", "TIKZ002")]
    [InlineData("variable=x", "(\\x,0)", "TIKZ002")]
    [InlineData("variable=\\%", "(\\x,0)", "TIKZ002")]
    [InlineData("samples=1/0", "(\\x,0)", "TIKZ004")]
    [InlineData("samples=16384", "(\\x,0)", "TIKZ004")]
    [InlineData("samples at={0,0,...,1}", "(\\x,0)", "TIKZ002")]
    [InlineData("samples at={0,,1}", "(\\x,0)", "TIKZ002")]
    [InlineData("samples at={0,1e-3}", "(\\x,0)", "TIKZ002")]
    [InlineData("samples at={0,1,2,...,3}", "(\\x,0)", "TIKZ002")]
    [InlineData("samples at={0,1}", "(\\x,{\\x^0.5})", "TIKZ002")]
    [InlineData("samples at={0,1}", "(\\x,{tan(\\x)})", "TIKZ002")]
    [InlineData("samples at={0,1}", "(\\x,{1/\\x})", "TIKZ004")]
    [InlineData("samples at={0,1}", "(\\x,{pow(128,2)})", "TIKZ004")]
    [InlineData("samples at={0,1}", "(\\unknown,0)", "TIKZ003")]
    [InlineData("samples at={}", "(\\x,{sqrt(\\x)})", "TIKZ002")]
    [InlineData("samples at={}", "(\\x,{sin()})", "TIKZ001")]
    public void Undeclared_function_sampling_fails_explicitly(string options, string point, string code)
    {
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(@"\draw[" + options + "]plot" + point + ";", Body, CancellationToken.None));
        Assert.Equal(code, Assert.Single(failure.Diagnostics).Code);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Fact]
    public void Function_samples_share_loop_segment_expansion_and_work_limits()
    {
        const string source = @"\draw[domain=0:1,samples=100]plot(\x,{sin(90*\x)});";
        foreach (var limits in new[] { TikzLimits.Default with { MaxLoopIterations = 3 }, TikzLimits.Default with { MaxSegments = 3 }, TikzLimits.Default with { MaxExpandedTokens = 50 }, TikzLimits.Default with { MaxWork = 300 } })
        {
            var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body with { Limits = limits }, CancellationToken.None));
            Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
            Assert.Equal(0, failure.Statistics.OutputBytes);
        }
    }

    [Theory]
    [InlineData("Diagrams", "network-coordinate-plot", "4283ad96c06887488e4625436398350664931e13a5a9409470425bca7fa6dcc1", "e9a125c0f0d31a8b7ca25d67775571cc2f2a5c662bbb0d2d1daa9637b3942608", 34)]
    [InlineData("Plotting", "coordinate-plot-contract", "555ddf964ab1ebc2ca18719f9f3e8b5f04044741db610d4cd4773d799c5b4de4", "c78e00e16e0c3105ef6f290d10e792b5ae1a914587328c6e8a394b0d5d14415f", 5)]
    [InlineData("Diagrams", "network-function-plot", "92a7a7ebfd39bb8e735a3c52f6972acaec607e4de2df5549e5cfcbe6acf88fdc", "411731d2af235c6b6163d615fcb4e14df80a6d75d82ddea872859439e4f7871a", 35)]
    [InlineData("Plotting", "function-plot-contract", "bd15f0fa3345ea0df4f5c5a0acd8c1ed48457b5c9429f70ffdded448198c2f11", "2c5340e74a7b7509524b33d4b2e997f141112ec8dcc7797a45e10a334386e02e", 14)]
    [InlineData("Diagrams", "network-smooth-plot", "10029c10cbbf08c4a13579659138f0a2b7be155c93b866cdb4096c0b5555faee", "f940fe339ea2536e2c08e3dfd9b24493e08d58ee2ce7d951a79aef2770fd1e05", 35)]
    [InlineData("Plotting", "smooth-plot-contract", "d2f3415578d92be358eed7d2d2927720d10cee97d56417885d88b82f3b219985", "d0d90eeed43d854a27ec5026bc257c3e42631e7f27b530d7fc4996e4fe302a9c", 6)]
    public void Samples_continuation_paint_arrows_and_bounds_match_frozen_native_geometry(string folder, string id, string sourceHash, string nativeHash, int glyphs)
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", folder, id + ".tikz"));
        Assert.Equal(sourceHash, Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(source.Replace("\r\n", "\n")))));
        var nativeBytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Reference/Plotting", id + ".json"));
        Assert.Equal(nativeHash, Convert.ToHexStringLower(SHA256.HashData(nativeBytes)));
        using var native = JsonDocument.Parse(nativeBytes);
        GraphicsScene? scene = null;
        var converted = TikzConverter.ConvertWithTrace(source, TikzOptions.Default, CancellationToken.None, value => scene = value);
        var success = Assert.IsType<TikzSuccess>(converted);
        var checks = NativeArrowComparison.Compare(scene!, success, native.RootElement, glyphs, ignoreTrailingMoves: true);
        var failures = checks.Where(c => !c.Passed).ToArray();
        Assert.True(failures.Length == 0, string.Join(Environment.NewLine, failures.Select(c => c.Quantity + ": expected " + c.Expected + ", actual " + c.Actual)));
    }

    [Fact]
    public void Complete_network_combines_plots_labels_positioning_arrows_and_calc()
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures/Diagrams/network-coordinate-plot.tikz"));
        GraphicsScene? trace = null;
        var converted = TikzConverter.ConvertWithTrace(source, TikzOptions.Default,
            CancellationToken.None, scene => trace = scene);
        Assert.True(converted is TikzSuccess, string.Join("; ", converted.Diagnostics.Select(d => d.Code + ": " + d.Message + " at " + d.Span.Offset)));
        var publicResult = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, TikzOptions.Default, CancellationToken.None));
        Assert.Equal(publicResult.Svg, Assert.IsType<TikzSuccess>(converted).Svg);
        Assert.Equal(6, trace!.Nodes.Count);
        Assert.Equal(4, trace.Paths.Count(p => p.Arrow is not null));
        Assert.Contains(trace.Coordinates, p => p.Key == "return");
    }

    [Theory]
    [InlineData("plot", "Move,Move,Line,Line")]
    [InlineData("-- plot", "Move,Line,Line,Line")]
    public void Sharp_plots_preserve_subpaths_and_continue_from_the_last_sample(string operation, string kinds)
    {
        var scene = Scene(@"\draw[x=1pt,y=1pt](9,9) " + operation + @" coordinates{(1,2)(3,4)}--++(1,0);");
        var segments = Assert.Single(scene.Paths).Path.Segments;
        Assert.Equal(kinds, string.Join(',', segments.Select(s => s.Kind)));
        Assert.Equal(new[] { (9, 9), (1, 2), (3, 4), (4, 4) }, segments.Select(s => (Pt(s.End.X), Pt(s.End.Y))));
    }

    [Fact]
    public void Relative_samples_use_entry_reference_then_restore_local_plot_options()
    {
        var scene = Scene(@"\tikzset{every plot/.style={xshift=1pt}}\draw[x=1pt,y=1pt](1,1)--plot[xshift=2pt,red]coordinates{+(1,0)++(2,0)+(1,0)}--++(1,0);");
        var path = Assert.Single(scene.Paths);
        Assert.Equal(new[] { (1, 1), (5, 1), (6, 1), (5, 1), (3, 1) },
            path.Path.Segments.Select(s => (Pt(s.End.X), Pt(s.End.Y))));
        Assert.Equal(new Paint().StrokeColor, path.Paint.StrokeColor);
    }

    [Theory]
    [InlineData("", "Move,Line", 1, 1)]
    [InlineData("(3,4)", "Move,Move,Line", 4, 5)]
    public void Empty_and_single_point_streams_have_defined_continuation(string points, string kinds, int x, int y)
    {
        var scene = Scene(@"\draw[x=1pt,y=1pt](8,9)plot coordinates{" + points + @"}--++(1,1);");
        var segments = Assert.Single(scene.Paths).Path.Segments;
        Assert.Equal(kinds, string.Join(',', segments.Select(s => s.Kind)));
        Assert.Equal((x, y), (Pt(segments[^1].End.X), Pt(segments[^1].End.Y)));
    }

    [Fact]
    public void Parsed_samples_retain_source_spans_and_macro_provenance()
    {
        const string source = @"\draw plot[sharp plot]coordinates{(1pt,2pt)(3pt,4pt)};";
        var program = new Parser(new(source, 0, source.Length), new Budget(TikzLimits.Default, CancellationToken.None)).Parse(TikzInputKind.PictureBody);
        var plot = Assert.IsType<PlotOperation>(Assert.Single(Assert.IsType<PathStatement>(Assert.Single(program)).Operations));
        Assert.StartsWith("plot", plot.Source.Value);
        Assert.Equal(new[] { "(1pt,2pt)", "(3pt,4pt)" }, plot.Points.Select(p => p.Source.Value));
        const string assigned = @"\pgfmathsetmacro\height{1/2}\draw plot coordinates{(0,\height)(1,\height)};";
        var scene = Scene(assigned);
        Assert.Contains(Assert.Single(scene.Paths).Source.RelatedLocations(), s => s.Offset == assigned.IndexOf(@"\height", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("plot file {secret.dat}", "TIKZ002")]
    [InlineData("plot function {x*x}", "TIKZ002")]
    [InlineData("plot (\\x,{sqrt(\\x)})", "TIKZ002")]
    [InlineData("plot[const plot]coordinates{(0,0)(1,1)}", "TIKZ002")]
    [InlineData("plot[mark=*]coordinates{(0,0)(1,1)}", "TIKZ002")]
    [InlineData("plot coordinates{garbage}", "TIKZ001")]
    [InlineData("plot coordinates{(0,0)(1,)}", "TIKZ001")]
    [InlineData("plot coordinates{(0,0)", "TIKZ001")]
    public void Undeclared_or_malformed_data_fails_without_output(string plot, string code)
    {
        var source = @"\draw " + plot + ";";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal(code, diagnostic.Code);
        Assert.InRange(diagnostic.Span.Offset, 6, source.Length);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Fact]
    public void Plot_scanning_and_lowering_share_limits_and_cancellation()
    {
        const string source = @"\draw plot coordinates{(0,0)(1,1)(2,0)(3,1)};";
        foreach (var limits in new[] { TikzLimits.Default with { MaxSegments = 3 }, TikzLimits.Default with { MaxWork = 40 }, TikzLimits.Default with { MaxCoordinatePixels = 10 } })
        {
            var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body with { Limits = limits }, CancellationToken.None));
            Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
            Assert.Equal(0, failure.Statistics.OutputBytes);
        }
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        Assert.Throws<OperationCanceledException>(() => TikzConverter.Convert(source, Body, cancellation.Token));
    }

    private static GraphicsScene Scene(string source)
    {
        GraphicsScene? scene = null;
        var result = TikzConverter.ConvertWithTrace(source, Body, CancellationToken.None, value => scene = value);
        Assert.True(result is TikzSuccess, string.Join("; ", result.Diagnostics.Select(d => d.Message)));
        return scene!;
    }
    private static int Pt(double bp) => (int)Math.Round(bp * 72.27 / 72);
}

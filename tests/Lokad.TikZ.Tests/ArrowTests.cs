using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using TikzArrowComparison;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class ArrowTests
{
    [Theory]
    [InlineData("legacy-defaults")]
    [InlineData("meta-defaults")]
    [InlineData("dimensions")]
    [InlineData("transforms")]
    [InlineData("curves-nodes")]
    [InlineData("paint-boundaries")]
    public void Public_arrows_match_frozen_native_geometry_placement_paint_and_shortening(string id)
    {
        var (scene, success, native, source) = Read(id);
        AssertChecks(scene, success, native);
        AssertChecks(EmittedArrowSvg.Read(success.Svg, scene), success, native);
        var ordinary = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, Options, CancellationToken.None));
        Assert.Equal(ordinary, success);
        Assert.Equal(ordinary.Svg, success.Svg);
        Assert.Equal(ordinary.Statistics, success.Statistics);
        Assert.DoesNotContain("<marker", ordinary.Svg, StringComparison.Ordinal);
        foreach (var path in scene.Paths.Where(p => p.Arrow is not null))
        {
            Assert.Equal(source, path.Source.Text);
            Assert.True(path.Source.Length > 0);
            Assert.True(path.Arrow!.ShaftSource.Length > path.Source.Length);
            Assert.Empty(path.Paint.Dash);
        }
    }

    [Theory]
    [InlineData("coordinate")]
    [InlineData("matrix")]
    [InlineData("tip-dash")]
    [InlineData("order")]
    [InlineData("omission")]
    public void Native_checker_rejects_arrow_defects(string defect)
    {
        var (scene, success, native, _) = Read("meta-defaults");
        AssertChecks(scene, success, native);
        var index = scene.Paths.FindIndex(p => p.Arrow is not null);
        var tip = scene.Paths[index];
        switch (defect)
        {
            case "coordinate":
                tip.Path.Segments[0] = tip.Path.Segments[0] with { End = tip.Path.Segments[0].End + new Point(1 / NativeArrowComparison.SpPerBp, 0) }; break;
            case "matrix": scene.Paths[index] = tip with { Transform = tip.Transform with { E = tip.Transform.E + 1 / NativeArrowComparison.SpPerBp } }; break;
            case "tip-dash": scene.Paths[index] = tip with { Paint = tip.Paint with { Dash = [1] } }; break;
            case "order": (scene.Paths[index - 1], scene.Paths[index]) = (scene.Paths[index], scene.Paths[index - 1]); break;
            case "omission": scene.Paths.RemoveAt(index); break;
        }
        Assert.Contains(NativeArrowComparison.Compare(scene, success, native), c => !c.Passed);
    }

    [Theory]
    [InlineData("tip-coordinate")]
    [InlineData("tip-matrix")]
    [InlineData("tip-dash")]
    [InlineData("clip")]
    [InlineData("omission")]
    [InlineData("root-width")]
    [InlineData("root-view")]
    public void Returned_SVG_reader_rejects_defects_without_altering_candidate_trace(string defect)
    {
        var (scene, success, native, _) = Read("paint-boundaries");
        var document = XDocument.Parse(success.Svg);
        var tip = document.Descendants().Single(e => e.Attribute("id")?.Value == "candidate-p1");
        switch (defect)
        {
            case "tip-coordinate": tip.SetAttributeValue("d", "M1 0 L0 1 L0 -1 Z"); break;
            case "tip-matrix": tip.SetAttributeValue("transform", "scale(1.32835201328352 -1.32835201328352) matrix(1 0 0 1 20 0)"); break;
            case "tip-dash": tip.SetAttributeValue("stroke-dasharray", "1"); break;
            case "clip": foreach (var g in document.Descendants().Where(e => e.Attribute("clip-path") is not null)) g.Attribute("clip-path")!.Remove(); break;
            case "omission": tip.Remove(); break;
            case "root-width": document.Root!.SetAttributeValue("width", "1px"); break;
            case "root-view": document.Root!.SetAttributeValue("viewBox", "0 0 1 1"); break;
        }
        if (defect is "omission" or "root-width" or "root-view") Assert.Throws<InvalidDataException>(() => EmittedArrowSvg.Read(document.ToString(), scene));
        else Assert.Contains(NativeArrowComparison.Compare(EmittedArrowSvg.Read(document.ToString(), scene), success, native), c => !c.Passed);
        AssertChecks(scene, success, native);
    }

    [Theory]
    [InlineData(@"\draw[-{Stealth}] (0,0)--(1,0);", "TIKZ002", "Stealth")]
    [InlineData(@"\draw[-{Latex}] (0,0)--(1,0);", "TIKZ002", "Latex")]
    [InlineData(@"\draw[-{Triangle}] (0,0)--(1,0);", "TIKZ002", "Triangle")]
    [InlineData(@"\draw[-{Stealth[round]}] (0,0)--(1,0);", "TIKZ002", "round")]
    [InlineData(@"\draw[-{Stealth[length=0pt]}] (0,0)--(1,0);", "TIKZ001", "0pt")]
    [InlineData(@"\draw[-{Stealth[length=2pt,inset=3pt]}] (0,0)--(1,0);", "TIKZ001", "Stealth")]
    [InlineData(@"\draw[-{Stealth Stealth}] (0,0)--(1,0);", "TIKZ002", "Stealth Stealth")]
    public void Unsupported_or_invalid_arrows_have_source_diagnostics(string source, string code, string spanText)
    {
        var options = spanText is "Stealth" or "Latex" && source.Contains("inset", StringComparison.Ordinal) == false
            ? Options with { InputKind = TikzInputKind.PictureBody }
            : Options with { InputKind = TikzInputKind.PictureBody, Libraries = ["arrows.meta"] };
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, options, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics); Assert.Equal(code, diagnostic.Code);
        Assert.Contains(spanText, source.Substring(diagnostic.Span.Offset, diagnostic.Span.Length), StringComparison.Ordinal);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Fact]
    public void Tip_segments_share_limits_and_cancellation()
    {
        const string source = @"\draw[-{Stealth}] (0,0)--(1,0);";
        var options = Options with { InputKind = TikzInputKind.PictureBody, Libraries = ["arrows.meta"],
            Limits = TikzLimits.Default with { MaxSegments = 6 } };
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, options, CancellationToken.None));
        Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
        Assert.Equal(0, failure.Statistics.OutputBytes);
        using var cancel = new CancellationTokenSource(); cancel.Cancel();
        Assert.Throws<OperationCanceledException>(() => TikzConverter.Convert(source, options, cancel.Token));
    }

    [Fact]
    public void Library_and_arrow_options_do_not_leak_between_conversions()
    {
        const string source = @"\draw[->] (0,0)--(1,0);";
        var body = Options with { InputKind = TikzInputKind.PictureBody };
        var before = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, body, CancellationToken.None));
        var modern = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, body with { Libraries = ["arrows.meta"] }, CancellationToken.None));
        var after = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, body, CancellationToken.None));
        Assert.NotEqual(before.Svg, modern.Svg); Assert.Equal(before.Svg, after.Svg);
        Assert.Equal(before.Statistics, after.Statistics);
    }

    [Fact]
    public void Scoped_styles_and_qualified_arrow_keys_restore_tip_state()
    {
        const string source = @"\begin{tikzpicture}
\draw[->] (0,0)--(1,0);
\begin{scope}[t/.style={/tikz/-{Stealth}},t]
\draw (0,1)--(1,1);
\end{scope}
\draw (0,2)--(1,2);
\end{tikzpicture}";
        GraphicsScene? scene = null;
        Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source, Options with { Libraries = ["arrows.meta"] }, CancellationToken.None, s => scene = s));
        Assert.Equal(new[] { "Computer Modern Rightarrow", "Stealth" }, scene!.Paths.Where(p => p.Arrow is not null).Select(p => p.Arrow!.Template.Name));
        Assert.Equal(5, scene.Paths.Count);
    }

    private static TikzOptions Options => TikzOptions.Default with { IdPrefix = "candidate" };
    private static void AssertChecks(GraphicsScene scene, TikzSuccess success, JsonElement native)
    {
        var failures = NativeArrowComparison.Compare(scene, success, native).Where(c => !c.Passed).ToArray();
        Assert.True(failures.Length == 0, string.Join(Environment.NewLine, failures.Select(c => c.Quantity + ": expected " + c.Expected + ", actual " + c.Actual)));
    }
    private static (GraphicsScene Scene, TikzSuccess Success, JsonElement Native, string Source) Read(string id)
    {
        var folder = Path.Combine(AppContext.BaseDirectory, "Reference", "Arrows");
        var snapshotBytes = File.ReadAllBytes(Path.Combine(folder, "snapshot.json"));
        Assert.Equal("5fe87848c37c9669ce72ea08247d5dcd2d2e57130c1c51fabd8ca2fe3ea97e2d", Hash(snapshotBytes));
        using var snapshot = JsonDocument.Parse(snapshotBytes);
        var metricsBytes = File.ReadAllBytes(Path.Combine(folder, id, "metrics.json"));
        Assert.Equal(snapshot.RootElement.GetProperty("artifacts").GetProperty(id + "/metrics.json").GetString(), Hash(metricsBytes));
        var source = File.ReadAllText(Path.Combine(folder, id, "source.tikz"));
        Assert.Equal(snapshot.RootElement.GetProperty("sourceHashes").GetProperty("tests/Reference/Arrows/" + id + "/source.tikz").GetString(),
            Hash(Encoding.UTF8.GetBytes(source.Replace("\r\n", "\n", StringComparison.Ordinal))));
        using var document = JsonDocument.Parse(metricsBytes); var native = document.RootElement.Clone();
        GraphicsScene? scene = null;
        var result = TikzConverter.ConvertWithTrace(source, Options, CancellationToken.None, s => scene = s);
        return (scene!, Assert.IsType<TikzSuccess>(result), native, source);
    }
    private static string Hash(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));
}

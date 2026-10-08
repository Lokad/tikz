using System.Text.Json;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Semantics;
using TikzPathLabelComparison;
using TikzShapeComparison;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class PathLabelNativeTests
{
    [Fact]
    public void Current_labels_match_original_native_glyphs_paint_and_physical_order()
    {
        using var fixture = Read();
        var checks = fixture.Compare();
        Assert.Equal(1056, checks.Length);
        Assert.All(checks, check => Assert.True(check.Passed, check.Quantity + ": " + check.Expected + " != " + check.Actual));
    }

    [Theory]
    [InlineData("shift", ".glyph.0.x")]
    [InlineData("missing-glyph", ".glyphCount")]
    [InlineData("slot", ".glyph.0.slot")]
    [InlineData("color", ".glyph.0.color")]
    [InlineData("opacity", ".glyph.0.opacity")]
    [InlineData("missing-run", ".glyphCount")]
    [InlineData("order", "physicalPaintOrder")]
    [InlineData("path-paint", "paint.0.operation")]
    public void Independent_observations_detect_candidate_corruption(string mutation, string quantity)
    {
        using var fixture = Read();
        var scene = fixture.Scene;
        var index = scene.Drawables.FindIndex(d => d is PaintedGlyphRun);
        var run = (PaintedGlyphRun)scene.Drawables[index];
        var glyphs = run.Glyphs.ToArray();
        switch (mutation)
        {
            case "shift":
                glyphs[0] = glyphs[0] with { Transform = glyphs[0].Transform with { E = glyphs[0].Transform.E + NativeLabels.BpPerSp } };
                scene.Drawables[index] = run with { Glyphs = glyphs };
                break;
            case "missing-glyph": scene.Drawables[index] = run with { Glyphs = glyphs[1..] }; break;
            case "slot":
                glyphs[0] = glyphs[0] with { Placement = glyphs[0].Placement with { Slot = glyphs[0].Placement.Slot + 1 } };
                scene.Drawables[index] = run with { Glyphs = glyphs };
                break;
            case "color": scene.Drawables[index] = run with { Color = new Color(1, 0, 0) }; break;
            case "opacity": scene.Drawables[index] = run with { Opacity = .5 }; break;
            case "missing-run": scene.Drawables.RemoveAt(index); break;
            case "order": (scene.Drawables[0], scene.Drawables[index]) = (scene.Drawables[index], scene.Drawables[0]); break;
            case "path-paint": scene.Paths[0] = scene.Paths[0] with { Paint = scene.Paths[0].Paint with { Fill = true } }; break;
            default: throw new ArgumentException(mutation);
        }
        Assert.Contains(fixture.Compare(), c => !c.Passed && c.Quantity.EndsWith(quantity, StringComparison.Ordinal));
    }

    private sealed record Fixture(GraphicsScene Scene, TikzSuccess Result, JsonDocument Native,
        NativeGlyphTrace.Evidence Glyphs, string Svg) : IDisposable
    {
        internal NativeLabels.Check[] Compare() => NativeLabels.Compare(Scene, Result, Native.RootElement, Glyphs, Svg);
        public void Dispose() => Native.Dispose();
    }

    private static Fixture Read()
    {
        var folder = Path.Combine(AppContext.BaseDirectory, "Reference/PathLabels/native");
        var native = JsonDocument.Parse(File.ReadAllText(Path.Combine(folder, "metrics.json")));
        var ids = native.RootElement.GetProperty("nodes").EnumerateArray().Select(n => n.GetProperty("id").GetString()!).ToArray();
        var svg = File.ReadAllText(Path.Combine(folder, "probed-reference.svg"));
        var glyphs = NativeGlyphTrace.Read(File.ReadAllText(Path.Combine(folder, "native-positions.log")),
            File.ReadAllText(Path.Combine(folder, "source-captures/tools/TikzFontData/font-profile.json")), ids, svg,
            Directory.GetFiles(Path.Combine(folder, "fonts"), "*.tfm").ToDictionary(f => Path.GetFileName(f), File.ReadAllBytes));
        GraphicsScene? scene = null;
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures/PathLabels/placement.tikz"));
        var result = Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source, TikzOptions.Default,
            CancellationToken.None, value => scene = value));
        return new(scene!, result, native, glyphs, svg);
    }
}

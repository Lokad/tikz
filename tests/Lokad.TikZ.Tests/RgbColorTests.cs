using System.Text.Json;
using System.Xml.Linq;
using Lokad.TikZ.Graphics;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class RgbColorTests
{
    [Theory]
    [InlineData("state-paint")]
    [InlineData("colors")]
    public void Emitted_path_and_glyph_colors_match_the_independent_RGB_oracle(string id)
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Nodes", id + ".tikz"));
        using var native = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "NodeInteractionsRgb", id, "metrics.json")));
        GraphicsScene? scene = null;
        var success = Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source, TikzOptions.Default,
            CancellationToken.None, value => scene = value));
        var svg = XDocument.Parse(success.Svg);
        var paths = svg.Descendants().Where(e => e.Name.LocalName == "path" && !e.Ancestors().Any(p => p.Name.LocalName is "defs" or "clipPath")).ToArray();
        var expectedPaths = native.RootElement.GetProperty("geometry").GetProperty("paths").EnumerateArray().ToArray();
        Assert.Equal(expectedPaths.Length, paths.Length);
        for (var index = 0; index < paths.Length; index++)
        {
            var expected = expectedPaths[index];
            Assert.Equal(expected.GetProperty("stroke").GetBoolean() ? expected.GetProperty("strokeColor").GetString() : "none", paths[index].Attribute("stroke")!.Value);
            Assert.Equal(expected.GetProperty("fill").GetBoolean() ? expected.GetProperty("fillColor").GetString() : "none", paths[index].Attribute("fill")!.Value);
        }
        var uses = svg.Descendants().Where(e => e.Name.LocalName == "use").ToArray();
        var expectedGlyphs = native.RootElement.GetProperty("painting").EnumerateArray().Where(p => p.GetProperty("kind").GetString() == "glyph").ToArray();
        Assert.Equal(expectedGlyphs.Length, uses.Length);
        for (var index = 0; index < uses.Length; index++)
            Assert.Equal(expectedGlyphs[index].GetProperty("color").GetString(), uses[index].AncestorsAndSelf()
                .Select(e => e.Attribute("fill")?.Value).First(v => v is not null));
        Assert.Equal(expectedGlyphs.Length, scene!.Drawables.OfType<PaintedGlyphRun>().Sum(r => r.Glyphs.Length));
        if (id == "colors") Assert.Equal(25, scene.Nodes.Count);
    }

    [Theory]
    [InlineData("state-paint")]
    [InlineData("transforms")]
    public void Selecting_RGB_preserves_the_native_layout_and_glyph_measurements(string id)
    {
        using var native = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "NodeInteractions", id, "metrics.json")));
        using var rgb = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "NodeInteractionsRgb", id, "metrics.json")));
        // Profiles and paint are intentionally different. Native node boxes,
        // anchors, defaults, fonts/slots/positions, and text frames must agree.
        Assert.Equal(native.RootElement.GetProperty("nodes").GetProperty("nodes").GetRawText(), rgb.RootElement.GetProperty("nodes").GetProperty("nodes").GetRawText());
        Assert.Equal(native.RootElement.GetProperty("frames").GetRawText(), rgb.RootElement.GetProperty("frames").GetRawText());
    }

    [Theory]
    [InlineData("NaN")]
    [InlineData("Infinity")]
    [InlineData("-Infinity")]
    public void Nonfinite_color_mixtures_fail_without_emitting_SVG(string percent)
    {
        var result = Assert.IsType<TikzFailure>(TikzConverter.Convert(@"\begin{tikzpicture}\draw[red!" + percent + @"](0,0)--(1,0);\end{tikzpicture}",
            TikzOptions.Default, CancellationToken.None));
        Assert.Equal("TIKZ001", Assert.Single(result.Diagnostics).Code);
        Assert.Equal(0, result.Statistics.OutputBytes);
    }
}

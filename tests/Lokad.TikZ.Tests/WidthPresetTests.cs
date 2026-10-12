using System.Text.Json;
using System.Xml.Linq;
using Lokad.TikZ.Graphics;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class WidthPresetTests
{
    [Fact]
    public void Presets_ordered_overrides_styles_and_scope_restoration_match_exact_native_widths_and_bounds()
    {
        var source = Source();
        foreach (var preset in new[] { "ultra thin", "very thin", "thin", "semithick", "thick", "very thick", "ultra thick" })
            Assert.Contains(@"\draw[" + preset + "]", source);
        var (scene, svg) = Convert(source);
        using var reference = Reference();
        var expected = reference.RootElement.GetProperty("paths");
        Assert.Equal(14, expected.GetArrayLength());
        Assert.Equal(14, scene.Paths.Count);
        var emitted = Paths(svg); Assert.Equal(14, emitted.Length);
        for (var index = 0; index < 14; index++)
        {
            Assert.Equal(NativeWidth(reference, index), SceneWidth(scene.Paths[index]));
            Assert.Equal(NativeWidth(reference, index), EmittedSvgEvidence.Read(emitted[index]).WidthSp);
        }
        var bounds = reference.RootElement.GetProperty("pictureBoundsPt");
        Assert.Equal(Sp(bounds.GetProperty("minX").GetDouble()), Sp(scene.PictureBounds.MinX * 72.27 / 72));
        Assert.Equal(Sp(bounds.GetProperty("minY").GetDouble()), Sp(scene.PictureBounds.MinY * 72.27 / 72));
        Assert.Equal(Sp(bounds.GetProperty("maxX").GetDouble()), Sp(scene.PictureBounds.MaxX * 72.27 / 72));
        Assert.Equal(Sp(bounds.GetProperty("maxY").GetDouble()), Sp(scene.PictureBounds.MaxY * 72.27 / 72));
    }

    private static string Source() => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "width-presets.tikz"));
    private static JsonDocument Reference() => JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "width-presets", "reference-metrics.json")));
    private static int Sp(double points) => checked((int)Math.Round(points * 65536, MidpointRounding.AwayFromZero));
    private static int NativeWidth(JsonDocument reference, int index) => Sp(reference.RootElement.GetProperty("paths")[index].GetProperty("widthPt").GetDouble());
    private static int SceneWidth(PaintedPath path) => Sp(path.Paint.Width * 72.27 / 72);
    private static XElement[] Paths(string svg) => XDocument.Parse(svg).Descendants().Where(e => e.Name.LocalName == "path" && !e.Ancestors().Any(a => a.Name.LocalName is "defs" or "clipPath")).ToArray();
    private static (GraphicsScene Scene, string Svg) Convert(string source)
    {
        GraphicsScene? scene = null;
        var success = Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source, TikzOptions.Default, CancellationToken.None, value => scene = value));
        return (Assert.IsType<GraphicsScene>(scene), success.Svg);
    }
}

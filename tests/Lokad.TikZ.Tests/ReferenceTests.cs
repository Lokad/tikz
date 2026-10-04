using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Lokad.TikZ.Graphics;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class ReferenceTests
{
    [Fact]
    public void TrustedLineMatchesIndependentPgfMeasurementsWithoutTexOrBrowser()
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "line-units.tikz")).Replace("\r\n", "\n", StringComparison.Ordinal);
        var directory = Path.Combine(AppContext.BaseDirectory, "Reference", "line-units");
        using var provenance = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, "provenance.json")));
        Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(source))), provenance.RootElement.GetProperty("sourceSha256").GetString());
        Assert.True(provenance.RootElement.GetProperty("probeVerification").GetProperty("svgByteIdentical").GetBoolean());
        Assert.True(provenance.RootElement.GetProperty("probeVerification").GetProperty("pictureBoxIdentical").GetBoolean());
        foreach (var file in new[] { "reference.svg", "reference-metrics.json" })
            Assert.Equal(provenance.RootElement.GetProperty("artifacts").GetProperty(file).GetString(),
                Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(Path.Combine(directory, file)))));

        using var metrics = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, "reference-metrics.json")));
        using var manifest = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "cases.json")));
        var definition = Assert.Single(manifest.RootElement.GetProperty("cases").EnumerateArray(), c => c.GetProperty("id").GetString() == "line-units");
        var tolerance = definition.GetProperty("numericTolerancePixels").GetDouble();
        const double ptToPixels = 96 / 72.27;
        GraphicsScene? scene = null;
        var conversion = TikzConverter.ConvertWithTrace(source, TikzOptions.Default, CancellationToken.None, value => scene = value);
        var success = Assert.IsType<TikzSuccess>(conversion);
        Assert.NotNull(scene);
        var expected = metrics.RootElement.GetProperty("pictureBoundsPt");
        Near(expected.GetProperty("minX").GetDouble() * ptToPixels, success.PictureBounds.MinX);
        Near(-expected.GetProperty("maxY").GetDouble() * ptToPixels, success.PictureBounds.MinY);
        Near(expected.GetProperty("maxX").GetDouble() * ptToPixels, success.PictureBounds.MaxX);
        Near(-expected.GetProperty("minY").GetDouble() * ptToPixels, success.PictureBounds.MaxY);
        foreach (var anchor in metrics.RootElement.GetProperty("anchorsPt").EnumerateObject())
        {
            var actual = scene.Coordinates[anchor.Name];
            Near(anchor.Value.GetProperty("x").GetDouble() * ptToPixels, actual.X * 4 / 3);
            Near(anchor.Value.GetProperty("y").GetDouble() * ptToPixels, actual.Y * 4 / 3);
        }
        var path = Assert.Single(scene.Paths);
        var stroke = metrics.RootElement.GetProperty("stroke");
        Near(stroke.GetProperty("widthPt").GetDouble() * ptToPixels, path.Paint.Width * 4 / 3);
        Assert.Equal(stroke.GetProperty("color").GetString(), path.Paint.StrokeColor.Svg);
        Assert.Equal(stroke.GetProperty("opacity").GetDouble(), path.Paint.StrokeOpacity);
        void Near(double expectedValue, double actualValue) => Assert.InRange(Math.Abs(expectedValue - actualValue), 0, tolerance);
    }
}

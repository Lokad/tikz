using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Lokad.TikZ.Graphics;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class ReferenceTests
{
    public static TheoryData<string> RequiredCases
    {
        get
        {
            using var manifest = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "cases.json")));
            var data = new TheoryData<string>();
            foreach (var c in manifest.RootElement.GetProperty("cases").EnumerateArray()) data.Add(c.GetProperty("id").GetString()!);
            return data;
        }
    }

    [Theory]
    [MemberData(nameof(RequiredCases))]
    [MemberData(nameof(BorderCases))]
    public void TrustedFixturesMatchIndependentPgfMeasurementsWithoutTexOrBrowser(string caseId)
    {
        using var manifest = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "cases.json")));
        using var borderManifest = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "NodeBorders", "path-cases.json")));
        var definition = Assert.Single(manifest.RootElement.GetProperty("cases").EnumerateArray()
            .Concat(borderManifest.RootElement.GetProperty("cases").EnumerateArray()), c => c.GetProperty("id").GetString() == caseId);
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", Path.GetFileName(definition.GetProperty("source").GetString()!))).Replace("\r\n", "\n", StringComparison.Ordinal);
        var directory = Path.Combine(AppContext.BaseDirectory, "Reference", caseId);
        using var provenance = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, "provenance.json")));
        Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(source))), provenance.RootElement.GetProperty("sourceSha256").GetString());
        Assert.True(provenance.RootElement.GetProperty("probeVerification").GetProperty("svgByteIdentical").GetBoolean());
        Assert.True(provenance.RootElement.GetProperty("probeVerification").GetProperty("pictureBoxIdentical").GetBoolean());
        foreach (var file in new[] { "reference.svg", "reference-metrics.json" })
            Assert.Equal(provenance.RootElement.GetProperty("artifacts").GetProperty(file).GetString(),
                Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(Path.Combine(directory, file)))));

        using var metrics = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, "reference-metrics.json")));
        Assert.Equal(2, metrics.RootElement.GetProperty("schemaVersion").GetInt32());
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
        var paths = metrics.RootElement.GetProperty("paths").EnumerateArray().ToArray();
        Assert.Equal(paths.Length, scene.Paths.Count);
        for (var i = 0; i < paths.Length; i++)
        {
            var path = scene.Paths[i]; var reference = paths[i];
            Segments(reference.GetProperty("segments"), path.Path);
            Assert.Equal(reference.GetProperty("stroke").GetBoolean(), path.Paint.Stroke);
            Assert.Equal(reference.GetProperty("fill").GetBoolean(), path.Paint.Fill);
            if (path.Paint.Stroke)
            {
                Near(reference.GetProperty("widthPt").GetDouble() * ptToPixels, path.Paint.Width * 4 / 3);
                Assert.Equal(reference.GetProperty("strokeColor").GetString(), path.Paint.StrokeColor.PgfSvg);
                Assert.Equal(reference.GetProperty("strokeOpacity").GetDouble(), path.Paint.StrokeOpacity);
                Assert.Equal(reference.GetProperty("cap").GetString(), path.Paint.Cap);
                Assert.Equal(reference.GetProperty("join").GetString(), path.Paint.Join);
                var dash = reference.GetProperty("dashPt").EnumerateArray().Select(v => v.GetDouble()).ToArray();
                Assert.Equal(dash.Length, path.Paint.Dash.Length);
                for (var d = 0; d < dash.Length; d++) Near(dash[d] * ptToPixels, path.Paint.Dash[d] * 4 / 3);
            }
            if (path.Paint.Fill)
            {
                Assert.Equal(reference.GetProperty("fillColor").GetString(), path.Paint.FillColor.PgfSvg);
                Assert.Equal(reference.GetProperty("fillOpacity").GetDouble(), path.Paint.FillOpacity);
                Assert.Equal(reference.GetProperty("fillRule").GetString(), path.Paint.FillRule);
            }
        }
        var clips = metrics.RootElement.GetProperty("clips").EnumerateArray().ToArray();
        Assert.Equal(clips.Length, scene.Clips.Count);
        for (var i = 0; i < clips.Length; i++) Segments(clips[i].GetProperty("segments"), scene.Clips[i].Path);
        void Near(double expectedValue, double actualValue) => Assert.True(Math.Abs(expectedValue - actualValue) <= tolerance,
            $"{caseId}: expected {expectedValue:R}, got {actualValue:R}, tolerance {tolerance:R} CSS pixels.");
        void Segments(JsonElement expectedSegments, GraphicPath path)
        {
            var actual = new List<Segment>();
            foreach (var s in path.Segments)
            {
                if (s.Kind == SegmentKind.Move && actual.Count > 0 && actual[^1].Kind == SegmentKind.Move) actual.RemoveAt(actual.Count - 1);
                actual.Add(s);
            }
            if (actual.Count > 0 && actual[^1].Kind == SegmentKind.Move) actual.RemoveAt(actual.Count - 1);
            var expectedSegmentsArray = expectedSegments.EnumerateArray().ToArray();
            Assert.Equal(expectedSegmentsArray.Length, actual.Count);
            for (var i = 0; i < actual.Count; i++)
            {
                Assert.Equal(expectedSegmentsArray[i].GetProperty("kind").GetString(), actual[i].Kind.ToString());
                Point(expectedSegmentsArray[i].GetProperty("end"), actual[i].End);
                if (actual[i].Kind == SegmentKind.Cubic)
                {
                    Point(expectedSegmentsArray[i].GetProperty("control1"), actual[i].A);
                    Point(expectedSegmentsArray[i].GetProperty("control2"), actual[i].B);
                }
            }
            void Point(JsonElement expectedPoint, Geometry.Point actualPoint)
            {
                Near(expectedPoint.GetProperty("x").GetDouble() * ptToPixels, actualPoint.X * 4 / 3);
                Near(expectedPoint.GetProperty("y").GetDouble() * ptToPixels, actualPoint.Y * 4 / 3);
            }
        }
    }

    public static TheoryData<string> BorderCases
    {
        get
        {
            using var manifest = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "NodeBorders", "path-cases.json")));
            var data = new TheoryData<string>();
            foreach (var c in manifest.RootElement.GetProperty("cases").EnumerateArray()) data.Add(c.GetProperty("id").GetString()!);
            return data;
        }
    }
}

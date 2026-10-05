using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using Lokad.TikZ.Graphics;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class NativeStrokeBoundsTests
{
    [Theory]
    [MemberData(nameof(ReferenceTests.BorderCases), MemberType = typeof(ReferenceTests))]
    public void Border_path_ink_and_natural_frame_match_independent_native_envelopes(string caseId)
    {
        var root = Path.Combine(AppContext.BaseDirectory, "Reference");
        using var evidence = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "NodeBorders", "framing.json")));
        Assert.True(evidence.RootElement.GetProperty("completed").GetBoolean());
        Assert.False(evidence.RootElement.GetProperty("converterInvoked").GetBoolean());
        Assert.False(evidence.RootElement.GetProperty("approvedPolicy").GetBoolean());
        var item = Assert.Single(evidence.RootElement.GetProperty("cases").EnumerateArray(), c => c.GetProperty("caseId").GetString() == caseId);
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", caseId + ".tikz")).Replace("\r\n", "\n", StringComparison.Ordinal);
        Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(source))), item.GetProperty("sourceSha256").GetString());
        var artifacts = item.GetProperty("originalProvenance").GetProperty("artifacts");
        foreach (var file in new[] { "reference.svg", "reference-metrics.json" })
            Assert.Equal(artifacts.GetProperty(file).GetString(), Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(Path.Combine(root, caseId, file)))));
        GraphicsScene? scene = null;
        var result = Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source, TikzOptions.Default, CancellationToken.None, value => scene = value));
        var paths = item.GetProperty("frame").GetProperty("paths").EnumerateArray().ToArray();
        Assert.Equal(paths.Length, scene!.Paths.Count);
        for (var index = 0; index < paths.Length; index++)
        {
            Assert.Equal(index, paths[index].GetProperty("pathIndex").GetInt32());
            var expected = paths[index].GetProperty("boundsPt"); var actual = scene.Paths[index].InkBounds.Pixels;
            Near(Get(expected, "minX") * 96 / 72.27, actual.MinX, "path minX");
            Near(-Get(expected, "maxY") * 96 / 72.27, actual.MinY, "path minY");
            Near(Get(expected, "maxX") * 96 / 72.27, actual.MaxX, "path maxX");
            Near(-Get(expected, "minY") * 96 / 72.27, actual.MaxY, "path maxY");
        }
        var view = XDocument.Parse(result.Svg).Root!.Attribute("viewBox")!.Value.Split(' ').Select(v => double.Parse(v, CultureInfo.InvariantCulture)).ToArray();
        var box = item.GetProperty("frame").GetProperty("expandedPixels");
        Near(Get(box, "minX"), view[0], "frame minX"); Near(Get(box, "minY"), view[1], "frame minY");
        Near(Get(box, "maxX"), view[0] + view[2], "frame maxX"); Near(Get(box, "maxY"), view[1] + view[3], "frame maxY");
        static double Get(JsonElement value, string key) => value.GetProperty(key).GetDouble();
        void Near(double expected, double actual, string quantity) => Assert.True(Math.Abs(expected - actual) <= 0.00004,
            $"{caseId}: {quantity} expected {expected:R}, got {actual:R} CSS px.");
    }
}

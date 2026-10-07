using System.Text.Json;
using System.Security.Cryptography;
using System.Text;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using TikzEdgeComparison;
using TikzShapeComparison;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class CurvedEdgeTests
{
    [Theory]
    [InlineData("continuation")]
    [InlineData("styles")]
    [InlineData("coordinates")]
    [InlineData("nodes")]
    [InlineData("clipping")]
    public void Curved_connections_match_independent_native_controls_state_and_continuation(string id)
    {
        var (scene, success, native, glyphs) = Read(id);
        var checks = NativeComparison.Compare(scene, success, native, glyphs);
        Assert.True(checks.All(c => c.Passed), string.Join(Environment.NewLine, checks.Where(c => !c.Passed)
            .Select(c => $"{c.Quantity}: expected {c.Expected}, actual {c.Actual}, delta {c.Delta} {c.Unit}, limit {c.Limit}")));
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "CurvedEdges", id + ".tikz"));
        var ordinary = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, Options, CancellationToken.None));
        Assert.Equal(ordinary.Svg, success.Svg);
        Assert.Equal(ordinary.PictureBounds, success.PictureBounds);
        Assert.Equal(ordinary.InkBounds, success.InkBounds);
        Assert.Equal(ordinary.Diagnostics, success.Diagnostics);
        Assert.Equal(ordinary.Statistics, success.Statistics);
    }

    [Theory]
    [InlineData("continuation", 0)]
    [InlineData("styles", 0)]
    [InlineData("coordinates", 0)]
    [InlineData("nodes", 4)]
    [InlineData("clipping", 1)]
    public void One_scaled_point_control_error_is_rejected(string id, int pathIndex)
    {
        var (scene, success, native, glyphs) = Read(id);
        Assert.All(NativeComparison.Compare(scene, success, native, glyphs), c => Assert.True(c.Passed));
        var segments = scene.Paths[pathIndex].Path.Segments;
        var index = segments.FindIndex(s => s.Kind == SegmentKind.Cubic);
        Assert.True(index >= 0);
        segments[index] = segments[index] with { A = segments[index].A + new Point(NativeComparison.BpPerSp, 0) };
        Assert.Contains(NativeComparison.Compare(scene, success, native, glyphs), c => c.Quantity.Contains("control1.x", StringComparison.Ordinal) && !c.Passed);
    }

    [Fact]
    public void Curved_edge_segments_share_the_budget_and_source_span()
    {
        const string source = @"\draw (0,0) edge[bend left] (1,0);";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, TikzOptions.Default with
        { InputKind = TikzInputKind.PictureBody, Limits = TikzLimits.Default with { MaxSegments = 2 } }, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ005", diagnostic.Code);
        Assert.Equal("edge[bend left] (1,0)", source.Substring(diagnostic.Span.Offset, diagnostic.Span.Length));
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    private static TikzOptions Options => TikzOptions.Default with { Libraries = ["shapes.geometric"], IdPrefix = "candidate" };

    private static (GraphicsScene Scene, TikzSuccess Success, JsonElement Native, NativeGlyphTrace.Evidence? Glyphs) Read(string id)
    {
        var folder = Path.Combine(AppContext.BaseDirectory, "Reference", "CurvedEdges");
        var snapshotBytes = File.ReadAllBytes(Path.Combine(folder, "snapshot.json"));
        Assert.Equal("5d5730145e1a848d6f22c964d901be3c151bba3ebf5336c258144ec14076e0b1", Hash(snapshotBytes));
        using var snapshot = JsonDocument.Parse(snapshotBytes);
        foreach (var file in new[] { "metrics.json", "probed-reference.svg", "native-positions.log" })
            Assert.Equal(snapshot.RootElement.GetProperty("artifacts").GetProperty(id + "/" + file).GetString(), Hash(File.ReadAllBytes(Path.Combine(folder, id, file))));
        using var metrics = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(folder, id, "metrics.json")));
        var native = metrics.RootElement.Clone();
        var nodes = native.GetProperty("nodes").EnumerateArray().Select(n => n.GetProperty("id").GetString()!).ToArray();
        var glyphs = nodes.Length == 0 ? null : NativeGlyphTrace.Read(File.ReadAllText(Path.Combine(folder, id, "native-positions.log")),
            File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "Nodes", "font-profile.json")), nodes,
            File.ReadAllText(Path.Combine(folder, id, "probed-reference.svg")),
            Directory.GetFiles(Path.Combine(folder, "fonts"), "*.tfm").ToDictionary(f => Path.GetFileName(f)!, File.ReadAllBytes));
        GraphicsScene? scene = null;
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "CurvedEdges", id + ".tikz"));
        Assert.Equal(snapshot.RootElement.GetProperty("sourceHashes").GetProperty("tests/Fixtures/CurvedEdges/" + id + ".tikz").GetString(),
            Hash(Encoding.UTF8.GetBytes(source.Replace("\r\n", "\n", StringComparison.Ordinal))));
        var success = Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source, Options, CancellationToken.None, s => scene = s));
        Assert.NotNull(scene);
        return (scene, success, native, glyphs);
    }
    private static string Hash(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));
}

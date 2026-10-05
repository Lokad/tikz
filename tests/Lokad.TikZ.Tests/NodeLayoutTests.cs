using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Text;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class NodeLayoutTests
{
    private static readonly string[] RequiredCases = ["regular", "empty", "period", "descenders", "italic", "large-text",
        "large-node", "thick", "minimum", "separation", "north", "base", "negative", "lines-center", "lines-right",
        "lines-left", "sp-halves", "mid-large", "bold-node", "italic-node", "large-bold-node", "large-italic-node"];
    public static IEnumerable<object[]> Cases => RequiredCases.Select(id => new object[] { id });

    [Theory]
    [MemberData(nameof(Cases))]
    public void Rectangle_boxes_separation_anchors_and_background_match_native_PGF_scaled_points(string id)
    {
        using var manifest = JsonDocument.Parse(File.ReadAllText(Reference("cases.json")));
        var cases = manifest.RootElement.GetProperty("cases").EnumerateArray().ToArray();
        Assert.Equal(RequiredCases, cases.Select(c => c.GetProperty("id").GetString()));
        var definition = cases.Single(c => c.GetProperty("id").GetString() == id);
        using var metrics = JsonDocument.Parse(File.ReadAllText(Reference("rectangles", "metrics.json")));
        Assert.Equal(manifest.RootElement.GetProperty("profile").GetString(), metrics.RootElement.GetProperty("profile").GetString());
        var nodes = metrics.RootElement.GetProperty("nodes").EnumerateArray().ToArray();
        Assert.Equal(RequiredCases, nodes.Select(n => n.GetProperty("id").GetString()));
        var expected = nodes.Single(n => n.GetProperty("id").GetString() == id);
        var label = definition.GetProperty("label").GetString()!;
        var source = new Source(label, 0, label.Length);
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var textFont = Font(definition.GetProperty("font").GetString()!);
        var nodeFont = NodeFontMetrics.Resolve(Font(definition.GetProperty("nodeFont").GetString()!), budget, source);
        var queryFont = NodeFontMetrics.Resolve(TextFont.Default, budget, source);
        var width = definition.GetProperty("lineWidthSp").GetInt32();
        var dimensions = definition.TryGetProperty("dimensions", out var explicitDimensions)
            ? JsonSerializer.Deserialize<NodeDimensions>(explicitDimensions.GetRawText(), new JsonSerializerOptions(JsonSerializerDefaults.Web))!
            : NodeDimensions.Default(nodeFont, width);
        var text = new TextLayout().Layout(new LabelParser(source, budget).Parse(), source, textFont,
            Enum.Parse<TextAlignment>(definition.GetProperty("alignment").GetString()!, true), budget);
        var shape = RectangleNodeLayout.Resolve(text, dimensions, budget, source);
        var values = expected.GetProperty("values");
        Check("width", text.WidthSp); Check("height", text.HeightSp); Check("depth", text.DepthSp);
        Check("linewidth", width); Check("quad", nodeFont.QuadSp); Check("xheight", nodeFont.XHeightSp);
        Check("innerx", dimensions.InnerXSp); Check("innery", dimensions.InnerYSp);
        Check("outerx", dimensions.OuterXSp); Check("outery", dimensions.OuterYSp);
        Check("minimumwidth", dimensions.MinimumWidthSp); Check("minimumheight", dimensions.MinimumHeightSp);
        var atAnchor = shape.Anchor(definition.GetProperty("anchor").GetString()!, nodeFont, budget, source);
        var dx = definition.GetProperty("xSp").GetInt32() - atAnchor.X;
        var dy = definition.GetProperty("ySp").GetInt32() - atAnchor.Y;
        NodePoint Global(NodePoint p) => new(p.X + dx, p.Y + dy);
        Assert.Equal(16, expected.GetProperty("anchors").EnumerateObject().Count());
        foreach (var anchor in expected.GetProperty("anchors").EnumerateObject())
            Assert.Equal(Point(anchor.Value), Global(shape.Anchor(anchor.Name, queryFont, budget, source)));
        var sw = Point(expected.GetProperty("backgroundSouthWest"));
        var ne = Point(expected.GetProperty("backgroundNorthEast"));
        Assert.Equal(sw, Global(shape.BackgroundSouthWest));
        Assert.Equal(ne, Global(shape.BackgroundNorthEast));
        var path = shape.Background(Affine.Translation(new NodePoint(dx, dy).Bp.X, new NodePoint(dx, dy).Bp.Y), budget, source);
        Assert.Equal(5, path.Segments.Count);
        var corners = new[] { sw, new NodePoint(ne.X, sw.Y), ne, new NodePoint(sw.X, ne.Y), sw };
        for (var index = 0; index < corners.Length; index++)
        {
            Assert.InRange(Math.Abs(path.Segments[index].End.X - corners[index].Bp.X), 0, 1e-9);
            Assert.InRange(Math.Abs(path.Segments[index].End.Y - corners[index].Bp.Y), 0, 1e-9);
        }
        void Check(string name, int actual) => Assert.Equal(values.GetProperty(name).GetInt32(), actual);
    }

    [Fact]
    public void Native_node_artifacts_and_inputs_match_their_provenance()
    {
        using var provenance = JsonDocument.Parse(File.ReadAllText(Reference("rectangles", "provenance.json")));
        Assert.Equal(1, provenance.RootElement.GetProperty("schemaVersion").GetInt32());
        foreach (var artifact in provenance.RootElement.GetProperty("artifacts").EnumerateObject())
            Assert.Equal(artifact.Value.GetString(), Hash(File.ReadAllBytes(Reference("rectangles", artifact.Name))));
        foreach (var input in provenance.RootElement.GetProperty("sourceHashes").EnumerateObject())
        {
            var path = input.Name switch {
                "tests/Fixtures/Nodes/rectangles.tikz" => Path.Combine(AppContext.BaseDirectory, "Fixtures", "Nodes", "rectangles.tikz"),
                "tests/Reference/Nodes/cases.json" => Reference("cases.json"),
                "tests/Reference/Nodes/oracle-profile.json" => Reference("oracle-profile.json"),
                "tools/TikzReference/nodes.tex" => Reference("wrapper.tex"),
                "tools/TikzFontData/font-profile.json" => Reference("font-profile.json"),
                _ => throw new InvalidOperationException("Unexpected node oracle input.")
            };
            Assert.Equal(input.Value.GetString(), Hash(Encoding.UTF8.GetBytes(File.ReadAllText(path).Replace("\r\n", "\n", StringComparison.Ordinal))));
        }
        var probe = provenance.RootElement.GetProperty("probeVerification");
        Assert.True(probe.GetProperty("pictureBoxIdentical").GetBoolean());
        Assert.True(probe.GetProperty("svgIdenticalAfterDefinitionOrderOnly").GetBoolean());
    }

    [Fact]
    public void Rectangle_layout_uses_shared_node_work_dimension_and_segment_limits()
    {
        var source = new Source("", 0, 0);
        var text = new MeasuredText(0, 0, 0, "", [], []);
        var dimensions = NodeDimensions.Default(new(655360, 282165), 26214);
        foreach (var limits in new[] { TikzLimits.Default with { MaxNodes = 0 }, TikzLimits.Default with { MaxWork = 1 },
            TikzLimits.Default with { MaxCoordinatePixels = 1 } })
        {
            var error = Assert.Throws<CompileError>(() => RectangleNodeLayout.Resolve(text, dimensions, new(limits, CancellationToken.None), source));
            Assert.Equal("TIKZ005", error.Diagnostic.Code);
        }
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var overflow = Assert.Throws<CompileError>(() => RectangleNodeLayout.Resolve(text,
            dimensions with { MinimumWidthSp = int.MaxValue }, budget, source));
        Assert.Equal("TIKZ005", overflow.Diagnostic.Code);
        var shape = RectangleNodeLayout.Resolve(text, dimensions, budget, source);
        var segments = Assert.Throws<CompileError>(() => shape.Background(Affine.Identity,
            new(TikzLimits.Default with { MaxSegments = 4 }, CancellationToken.None), source));
        Assert.Equal("TIKZ005", segments.Diagnostic.Code);
        using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        var cancellation = Assert.Throws<OperationCanceledException>(() => RectangleNodeLayout.Resolve(text, dimensions,
            new(TikzLimits.Default, cancelled.Token), source));
        Assert.Equal(cancelled.Token, cancellation.CancellationToken);
    }

    [Fact]
    public void Unknown_anchors_fail_instead_of_becoming_centers()
    {
        var source = new Source("unknown", 0, 7);
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var shape = RectangleNodeLayout.Resolve(new(0, 0, 0, "", [], []),
            NodeDimensions.Default(new(655360, 282165), 26214), budget, source);
        var error = Assert.Throws<CompileError>(() => shape.Anchor("unknown", new(655360, 282165), budget, source));
        Assert.Equal("TIKZ002", error.Diagnostic.Code);
        Assert.Equal(0, error.Diagnostic.Span.Offset);
        Assert.Equal(7, error.Diagnostic.Span.Length);
    }

    private static TextFont Font(string id) => new(id.StartsWith("bold", StringComparison.Ordinal), id.StartsWith("italic", StringComparison.Ordinal), id.EndsWith("12", StringComparison.Ordinal) ? 12 : 10);
    private static NodePoint Point(JsonElement value) => new(value.GetProperty("x").GetInt32(), value.GetProperty("y").GetInt32());
    private static string Reference(params string[] parts) => Path.Combine([AppContext.BaseDirectory, "Reference", "Nodes", .. parts]);
    private static string Hash(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));
}

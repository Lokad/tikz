using System.Security.Cryptography;
using System.Text.Json;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Geometry;
using TikzEdgeComparison;
using TikzShapeComparison;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class EdgeTests
{
    [Fact]
    public void Native_snapshot_is_pinned_outside_its_manifest() => Assert.Equal("269a0bdd6eaa7f2e71b8558ba8b2a80b797c101139ad9b52c674d1aec4f0287a", Hash(Reference("snapshot.json")));

    [Theory]
    [InlineData("continuation", 441)]
    [InlineData("styles", 462)]
    [InlineData("coordinates", 435)]
    [InlineData("nodes", 957)]
    [InlineData("clipping", 290)]
    public void Public_straight_connections_match_native_geometry_paint_order_and_state(string caseId, int expectedChecks)
    {
        var (scene, success, native, glyphs) = Read(caseId);
        var checks = NativeComparison.Compare(scene, success, native, glyphs);
        Assert.Equal(expectedChecks, checks.Length);
        var failures = checks.Where(c => !c.Passed).Select(c => $"{c.Quantity}: expected {c.Expected}, actual {c.Actual}, delta {c.Delta} {c.Unit}, limit {c.Limit}");
        Assert.True(checks.All(c => c.Passed), string.Join(Environment.NewLine, failures));
    }

    [Theory]
    [InlineData("continuation")]
    [InlineData("styles")]
    [InlineData("coordinates")]
    [InlineData("nodes")]
    [InlineData("clipping")]
    public void Tracing_preserves_the_public_conversion_result(string caseId)
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Edges", caseId + ".tikz"));
        var options = TikzOptions.Default with { Libraries = ["shapes.geometric"], IdPrefix = "candidate" };
        var ordinary = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, options, CancellationToken.None));
        GraphicsScene? scene = null;
        var traced = Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source, options, CancellationToken.None, s => scene = s));
        Assert.NotNull(scene);
        Assert.Equal(ordinary.Svg, traced.Svg);
        Assert.Equal(ordinary.PictureBounds, traced.PictureBounds);
        Assert.Equal(ordinary.InkBounds, traced.InkBounds);
        Assert.Equal(ordinary.Diagnostics, traced.Diagnostics);
        Assert.Equal(ordinary.Statistics, traced.Statistics);
    }

    [Theory]
    [InlineData("continuation", "geometry", "path.1.1.end.x")]
    [InlineData("continuation", "paint-order", "path.1.drawableOrder")]
    [InlineData("continuation", "missing-edge", "pathCount")]
    [InlineData("styles", "width", "path.2.width")]
    [InlineData("styles", "color", "path.2.strokeRgb.r")]
    [InlineData("styles", "opacity", "path.6.strokeOpacity")]
    [InlineData("styles", "dash", "path.12.dashCount")]
    [InlineData("clipping", "cap", "path.9.cap")]
    [InlineData("clipping", "clip", "path.1.clipCount")]
    [InlineData("clipping", "clip-geometry", "clip.0.1.end.x")]
    [InlineData("clipping", "picture-bounds", "picture.maximum.x")]
    [InlineData("nodes", "glyph-position", "input.glyph.0.e")]
    [InlineData("nodes", "glyph-order", "path.0.glyphOrder")]
    [InlineData("nodes", "node-frame", "input.frame.origin.x")]
    public void Numeric_gate_rejects_changed_candidate_quantities(string caseId, string defect, string failedQuantity)
    {
        var (scene, success, native, glyphs) = Read(caseId);
        void Paint(int i, Func<Semantics.Paint, Semantics.Paint> change) => scene.Paths[i] = scene.Paths[i] with { Paint = change(scene.Paths[i].Paint) };
        switch (defect)
        {
            case "geometry": var segment = scene.Paths[1].Path.Segments[1]; scene.Paths[1].Path.Segments[1] = segment with { End = segment.End + new Point(NativeComparison.BpPerSp, 0) }; break;
            case "paint-order": (scene.Drawables[1], scene.Drawables[2]) = (scene.Drawables[2], scene.Drawables[1]); break;
            case "missing-edge": scene.Paths.RemoveAt(2); break;
            case "width": Paint(2, p => p with { Width = p.Width + NativeComparison.BpPerSp }); break;
            case "color": Paint(2, p => p with { StrokeColor = new(1, 0, 0) }); break;
            case "opacity": Paint(6, p => p with { StrokeOpacity = .5 }); break;
            case "dash": Paint(12, p => p with { Dash = [] }); break;
            case "cap": Paint(9, p => p with { Cap = "butt" }); break;
            case "clip": scene.Paths[1] = scene.Paths[1] with { Clips = [] }; break;
            case "clip-geometry": var clip = scene.Clips[0].Path.Segments[2]; scene.Clips[0].Path.Segments[2] = clip with { End = clip.End + new Point(NativeComparison.BpPerSp, 0) }; break;
            case "picture-bounds": scene.PictureBounds = scene.PictureBounds with { MaxX = scene.PictureBounds.MaxX + NativeComparison.BpPerSp }; break;
            case "node-frame": scene.Nodes[0] = scene.Nodes[0] with { Transform = scene.Nodes[0].Transform with { E = scene.Nodes[0].Transform.E + NativeComparison.BpPerSp } }; break;
            case "glyph-order": (scene.Drawables[1], scene.Drawables[3]) = (scene.Drawables[3], scene.Drawables[1]); break;
            case "glyph-position": var run = (PaintedGlyphRun)scene.Drawables[1]; var changed = run.Glyphs.ToArray(); changed[0] = changed[0] with { Transform = changed[0].Transform with { E = changed[0].Transform.E + NativeComparison.BpPerSp } }; scene.Drawables[1] = run with { Glyphs = changed }; break;
            default: throw new ArgumentException("Unknown defect.");
        }
        Assert.Contains(NativeComparison.Compare(scene, success, native, glyphs), c => c.Quantity == failedQuantity && !c.Passed);
    }

    [Theory]
    [InlineData(@"\draw (0,0) to[bend left] (1,0);", "bend left", "TIKZ002")]
    [InlineData(@"\draw (0,0) edge[in=20,out=30] (1,0);", "in=20", "TIKZ002")]
    [InlineData(@"\draw (0,0) to[to path={-- (1,0)}] (1,0);", "to path", "TIKZ002")]
    [InlineData(@"\draw (0,0) edge node {label} (1,0);", "n", "TIKZ002")]
    [InlineData(@"\draw (0,0) to (1,0) node {label};", "n", "TIKZ002")]
    [InlineData(@"\draw (0,0) edge[dash pattern=on 0pt off 0pt] (1,0);", "dash pattern", "TIKZ001")]
    [InlineData(@"\draw (0,0) to (missing);", "missing", "TIKZ003")]
    public void Unsupported_or_invalid_connections_fail_at_their_source(string source, string selected, string code)
    {
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, TikzOptions.Default with { InputKind = TikzInputKind.PictureBody }, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics); Assert.Equal(code, diagnostic.Code);
        Assert.Contains(selected, source.Substring(diagnostic.Span.Offset, diagnostic.Span.Length));
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Fact]
    public void Generated_edge_segments_share_the_budget_and_attribute_the_complete_edge()
    {
        const string source = @"\draw (0,0) edge[blue] ++(1,0);";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, TikzOptions.Default with
        { InputKind = TikzInputKind.PictureBody, Limits = TikzLimits.Default with { MaxSegments = 2 } }, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics); Assert.Equal("TIKZ005", diagnostic.Code);
        Assert.Equal("edge[blue] ++(1,0)", source.Substring(diagnostic.Span.Offset, diagnostic.Span.Length));
    }

    [Fact]
    public void Appending_every_edge_preserves_the_builtin_draw_mode()
    {
        GraphicsScene? scene = null;
        Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(@"\begin{tikzpicture}[every edge/.append style={blue}]\path (0,0) edge (1,0);\end{tikzpicture}",
            TikzOptions.Default, CancellationToken.None, s => scene = s));
        Assert.NotNull(scene); var path = Assert.Single(scene.Paths); Assert.True(path.Paint.Stroke); Assert.False(path.Paint.Fill);
        Assert.Equal(new Semantics.Color(0, 0, 1), path.Paint.StrokeColor);
        Assert.StartsWith("edge", path.Source.Value);
    }

    private static (GraphicsScene Scene, TikzSuccess Success, JsonElement Native, NativeGlyphTrace.Evidence? Glyphs) Read(string caseId)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(Reference(caseId, "metrics.json")));
        using var snapshot = JsonDocument.Parse(File.ReadAllText(Reference("snapshot.json")));
        var native = document.RootElement.Clone();
        Assert.False(native.GetProperty("converterInvoked").GetBoolean()); Assert.False(native.GetProperty("approvedImagePolicy").GetBoolean());
        foreach (var file in new[] { "metrics.json", "probed-reference.svg", "native-positions.log" })
            Assert.Equal(snapshot.RootElement.GetProperty("artifacts").GetProperty(caseId + "/" + file).GetString(), Hash(Reference(caseId, file)));
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Edges", caseId + ".tikz"));
        Assert.Equal(snapshot.RootElement.GetProperty("sourceHashes").GetProperty("tests/Fixtures/Edges/" + caseId + ".tikz").GetString(),
            Convert.ToHexStringLower(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(source.Replace("\r\n", "\n", StringComparison.Ordinal)))));
        var ids = native.GetProperty("nodes").EnumerateArray().Select(n => n.GetProperty("id").GetString()!).ToArray();
        NativeGlyphTrace.Evidence? evidence = ids.Length == 0 ? null : NativeGlyphTrace.Read(File.ReadAllText(Reference(caseId, "native-positions.log")),
            File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "Nodes", "font-profile.json")), ids,
            File.ReadAllText(Reference(caseId, "probed-reference.svg")), Directory.GetFiles(Reference("fonts"), "*.tfm").ToDictionary(f => Path.GetFileName(f)!, File.ReadAllBytes));
        GraphicsScene? scene = null;
        var success = Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source,
            TikzOptions.Default with { Libraries = ["shapes.geometric"] }, CancellationToken.None, s => scene = s));
        Assert.NotNull(scene); return (scene, success, native, evidence);
    }
    private static string Reference(params string[] parts) => Path.Combine([AppContext.BaseDirectory, "Reference", "Edges", .. parts]);
    private static string Hash(string file) => Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(file)));
}

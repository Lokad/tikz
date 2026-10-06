using System.Security.Cryptography;
using System.Text.Json;
using Lokad.TikZ.Graphics;
using TikzLabelledBorderComparison;
using TikzShapeComparison;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class LabelledBorderInteractionTests
{
    [Fact]
    public void Native_snapshot_is_pinned_outside_its_artifact_manifest()
    {
        Assert.Equal("840f35602947c94b50e7e458eba7e20e1af8d3fa35d2b4907b3ce607536977e5", Hash(Reference("snapshot.json")));
    }

    [Theory]
    [InlineData("lines", 512)]
    [InlineData("paths", 578)]
    [InlineData("transforms", 534)]
    public void Public_labelled_border_paths_match_independent_native_records(string caseId, int expectedChecks)
    {
        var (scene, success, native, glyphs) = Read(caseId);
        var checks = NativeComparison.Compare(scene, success, native, glyphs);
        Assert.Equal(expectedChecks, checks.Length);
        Assert.All(checks, c => Assert.True(c.Passed, $"{c.Quantity}: expected {c.Expected}, actual {c.Actual}, delta {c.Delta} {c.Unit}, limit {c.Limit}"));
    }

    [Theory]
    [InlineData("stroke-width", "path.0.lineWidth")]
    [InlineData("glyph-position", "r-input.glyph.0.e")]
    [InlineData("missing-glyph", "r-input.emittedGlyphCount")]
    [InlineData("node-frame", "r-input.frame.origin.x")]
    [InlineData("paint-order", "paintOrder.0")]
    public void Native_numeric_gate_rejects_changed_candidate_quantities(string defect, string failedQuantity)
    {
        var (scene, success, native, glyphs) = Read("lines");
        switch (defect)
        {
            case "stroke-width": scene.Paths[0] = scene.Paths[0] with { Paint = scene.Paths[0].Paint with { Width = scene.Paths[0].Paint.Width + NativeComparison.BpPerSp } }; break;
            case "node-frame": scene.Nodes[0] = scene.Nodes[0] with { Transform = scene.Nodes[0].Transform with { E = scene.Nodes[0].Transform.E + .125 } }; break;
            case "paint-order": (scene.Drawables[0], scene.Drawables[1]) = (scene.Drawables[1], scene.Drawables[0]); break;
            default:
                var runIndex = scene.Drawables.FindIndex(d => d is PaintedGlyphRun);
                var run = (PaintedGlyphRun)scene.Drawables[runIndex]; var changed = run.Glyphs.ToArray();
                if (defect == "glyph-position") changed[0] = changed[0] with { Transform = changed[0].Transform with { E = changed[0].Transform.E + .125 } };
                else changed = changed[1..];
                scene.Drawables[runIndex] = run with { Glyphs = changed }; break;
        }
        Assert.Contains(NativeComparison.Compare(scene, success, native, glyphs), c => c.Quantity == failedQuantity && !c.Passed);
    }

    private static (GraphicsScene Scene, TikzSuccess Success, JsonElement Native, NativeGlyphTrace.Evidence Glyphs) Read(string caseId)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(Reference(caseId, "metrics.json")));
        using var provenance = JsonDocument.Parse(File.ReadAllText(Reference(caseId, "provenance.json")));
        var native = document.RootElement.Clone();
        Assert.False(native.GetProperty("converterInvoked").GetBoolean()); Assert.False(native.GetProperty("approvedImagePolicy").GetBoolean());
        foreach (var file in new[] { "metrics.json", "probed-reference.svg", "native-positions.log" })
            Assert.Equal(provenance.RootElement.GetProperty("artifacts").GetProperty(caseId + "/" + file).GetString(), Hash(Reference(caseId, file)));
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Nodes", "labelled-border-" + caseId + ".tikz"));
        var ids = native.GetProperty("nodes").EnumerateArray().Select(n => n.GetProperty("id").GetString()!).ToArray();
        var tfms = Directory.GetFiles(Reference("fonts"), "*.tfm").ToDictionary(f => Path.GetFileName(f)!, File.ReadAllBytes);
        var evidence = NativeGlyphTrace.Read(File.ReadAllText(Reference(caseId, "native-positions.log")),
            File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "Nodes", "font-profile.json")), ids,
            File.ReadAllText(Reference(caseId, "probed-reference.svg")), tfms);
        GraphicsScene? scene = null;
        var success = Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source,
            TikzOptions.Default with { Libraries = ["shapes.geometric"] }, CancellationToken.None, s => scene = s));
        Assert.NotNull(scene); return (scene, success, native, evidence);
    }
    private static string Reference(params string[] parts) => Path.Combine([AppContext.BaseDirectory, "Reference", "LabelledBorders", .. parts]);
    private static string Hash(string file) => Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(file)));
}

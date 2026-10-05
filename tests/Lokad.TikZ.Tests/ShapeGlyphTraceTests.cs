using System.Text.Json;
using System.Xml.Linq;
using Lokad.TikZ.Graphics;
using TikzShapeComparison;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class ShapeGlyphTraceTests
{
    [Fact]
    public void Native_shape_glyphs_ground_public_layout_and_emitted_affine_placement()
    {
        var input = Inputs();
        var evidence = NativeGlyphTrace.Read(input.Trace, input.Fonts, input.Ids, input.Svg, input.Tfms);
        Assert.Equal(28, evidence.Nodes.Length);
        Assert.Equal(70, evidence.Nodes.Sum(n => n.Glyphs.Length));
        Assert.Equal(new[] { "italic-12", "regular-10" }, evidence.SvgFontDefinitions.Values.Order());
        Assert.Empty(evidence.Nodes.Single(n => n.Id == "c-empty").Glyphs);
        var regular = evidence.Nodes.Single(n => n.Id == "c-regular").Glyphs;
        Assert.Equal(new[] { 65, 86, 84, 111, 30 }, regular.Select(g => g.Slot));
        Assert.Equal(new[] { 0, 418701, 1128674, 1547361, 2093494 }, regular.Select(g => g.XSp));
        Assert.Equal(0.25, regular[3].DriverXSp - regular[3].AbsoluteXSp);
        Assert.Equal(new[] { -786432, 0 }, evidence.Nodes.Single(n => n.Id == "c-lines").Glyphs.Select(g => g.YSp).Distinct().Order());
        using var metrics = JsonDocument.Parse(File.ReadAllText(Reference("native", "metrics.json")));
        var native = metrics.RootElement.GetProperty("nodes").EnumerateArray().ToArray();
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Nodes", "shapes.tikz"));
        GraphicsScene? scene = null;
        var success = Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source,
            TikzOptions.Default with { Libraries = ["shapes.geometric"] }, CancellationToken.None, s => scene = s));
        Assert.Equal(70, success.Statistics.Glyphs);
        const double bpPerSp = 72 / (72.27 * 65536);
        for (var i = 0; i < evidence.Nodes.Length; i++)
        {
            var expected = evidence.Nodes[i]; var node = scene!.Nodes[i];
            Assert.Equal(expected.Id, node.Name);
            var glyphs = node.Layout.Text.Glyphs;
            var emitted = Assert.Single(scene.Drawables.OfType<PaintedGlyphRun>(), r => r.NodeId == i).Glyphs;
            Assert.Equal(expected.Glyphs.Length, glyphs.Length); Assert.Equal(expected.Glyphs.Length, emitted.Length);
            var frame = native[i].GetProperty("frame");
            var a = frame.GetProperty("a").GetDouble(); var b = frame.GetProperty("b").GetDouble();
            var c = frame.GetProperty("c").GetDouble(); var d = frame.GetProperty("d").GetDouble();
            var e = frame.GetProperty("eSp").GetInt32(); var f = frame.GetProperty("fSp").GetInt32();
            for (var j = 0; j < expected.Glyphs.Length; j++)
            {
                var n = expected.Glyphs[j]; var g = glyphs[j]; var t = emitted[j].Transform;
                Assert.Equal(n.Font, g.FontId); Assert.Equal(n.Slot, g.Slot); Assert.Equal(n.XSp, g.XSp); Assert.Equal(n.YSp, g.YSp);
                Assert.Equal(a, t.A); Assert.Equal(b, t.B); Assert.Equal(-c, t.C); Assert.Equal(-d, t.D);
                Assert.InRange(Math.Abs((e + a * n.XSp - c * n.YSp) * bpPerSp - t.E), 0, 1e-9);
                Assert.InRange(Math.Abs((f + b * n.XSp - d * n.YSp) * bpPerSp - t.F), 0, 1e-9);
                Assert.InRange(g.Source.Offset, node.Source.Offset, node.Source.Offset + node.Source.Length - 1);
                Assert.InRange(g.Source.Length, 1, node.Source.Offset + node.Source.Length - g.Source.Offset);
            }
        }
    }

    [Theory]
    [InlineData("missing-origin")]
    [InlineData("duplicate-origin")]
    [InlineData("reordered-nodes")]
    [InlineData("wrong-font-size")]
    [InlineData("unknown-font-selection")]
    [InlineData("outside-encoding")]
    [InlineData("changed-glyph-position")]
    [InlineData("inconsistent-movement")]
    [InlineData("unsupported-character-record")]
    [InlineData("changed-stack-state")]
    [InlineData("wrong-page-count")]
    [InlineData("changed-svg-position")]
    [InlineData("changed-svg-slot")]
    [InlineData("missing-svg-glyph")]
    [InlineData("changed-svg-origin")]
    [InlineData("changed-tfm")]
    [InlineData("missing-tfm")]
    [InlineData("glyph-outside-origin")]
    public void Native_reader_rejects_inconsistent_or_incomplete_evidence(string defect)
    {
        var input = Inputs(); var trace = input.Trace; var svg = input.Svg; var ids = input.Ids; var tfms = input.Tfms;
        switch (defect)
        {
            case "missing-origin": trace = trace.Replace("lokad-node-origin c-empty", "missing-node-origin c-empty", StringComparison.Ordinal); break;
            case "duplicate-origin": trace = trace.Replace("lokad-node-origin c-empty", "lokad-node-origin c-regular", StringComparison.Ordinal); break;
            case "reordered-nodes": ids = ids.Reverse().ToArray(); break;
            case "wrong-font-size": trace = trace.Replace("ec-lmr10---loaded at size 655360", "ec-lmr10---loaded at size 655361", StringComparison.Ordinal); break;
            case "unknown-font-selection": trace = trace.Replace("fntnum41 current font", "fntnum99 current font", StringComparison.Ordinal); break;
            case "outside-encoding": trace = trace.Replace("setchar65 h:=", "setchar256 h:=", StringComparison.Ordinal); break;
            case "changed-glyph-position": trace = trace.Replace("setchar65 h:=23606391+491520=24097911", "setchar65 h:=23606392+491520=24097912", StringComparison.Ordinal); break;
            case "inconsistent-movement": trace = trace.Replace("h:=24097911-72819=24025092", "h:=24097911-72819=24025093", StringComparison.Ordinal); break;
            case "unsupported-character-record": trace = trace.Replace("setchar65 h:=", "put1 65 h:=", StringComparison.Ordinal); break;
            case "changed-stack-state": trace = trace.Replace("level 0:(h=0,v=0,", "level 0:(h=1,v=0,", StringComparison.Ordinal); break;
            case "wrong-page-count": trace = trace.Replace("totalpages=1", "totalpages=2", StringComparison.Ordinal); break;
            case "changed-svg-position": svg = svg.Replace("x='382.381868'", "x='382.381883'", StringComparison.Ordinal); break;
            case "changed-svg-slot": svg = svg.Replace("href='#g1-65'", "href='#g1-86'", StringComparison.Ordinal); break;
            case "missing-svg-glyph":
                var document = XDocument.Parse(svg); document.Descendants().First(e => e.Name.LocalName == "use").Remove(); svg = document.ToString(); break;
            case "changed-svg-origin": svg = svg.Replace("scale(-1.00375,1.00375)translate(358.859219", "scale(-1.00375,1.00375)translate(358.859234", StringComparison.Ordinal); break;
            case "changed-tfm": tfms["ec-lmr10.tfm"][0] ^= 1; break;
            case "missing-tfm": tfms.Remove("ec-lmr10.tfm"); break;
            case "glyph-outside-origin": trace += "\n99999: setchar65 h:=0+491520=491520, hh:=0\n"; break;
            default: throw new InvalidOperationException(defect);
        }
        Assert.True(trace != input.Trace || svg != input.Svg || !ids.SequenceEqual(input.Ids) || defect is "changed-tfm" or "missing-tfm", "Defect did not change an input.");
        Assert.Throws<InvalidDataException>(() => NativeGlyphTrace.Read(trace, input.Fonts, ids, svg, tfms));
    }

    private static (string Trace, string Fonts, string[] Ids, string Svg, Dictionary<string, byte[]> Tfms) Inputs()
    {
        using var manifest = JsonDocument.Parse(File.ReadAllText(Reference("cases.json")));
        return (File.ReadAllText(Reference("native", "native-positions.log")),
            File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "Nodes", "font-profile.json")),
            manifest.RootElement.GetProperty("cases").EnumerateArray().Select(c => c.GetProperty("id").GetString()!).ToArray(),
            File.ReadAllText(Reference("native", "reference.svg")),
            Directory.EnumerateFiles(Reference("fonts"), "*.tfm").ToDictionary(f => Path.GetFileName(f), File.ReadAllBytes, StringComparer.Ordinal));
    }
    private static string Reference(params string[] parts) => Path.Combine([AppContext.BaseDirectory, "Reference", "NodeShapes", .. parts]);
}

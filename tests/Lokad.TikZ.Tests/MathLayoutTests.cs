using System.Text.Json;
using System.Text.RegularExpressions;
using System.Globalization;
using System.Security.Cryptography;
using System.Xml.Linq;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Text;
using TikzShapeComparison;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class MathLayoutTests
{
    private static readonly TikzOptions Body = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody };

    [Theory]
    [InlineData("MathLabels", "", "math-label-contract", 26)]
    [InlineData("MathLabels", "", "math-atom-contract", 28)]
    [InlineData("Diagrams", "Diagrams", "network-math-labels", 10)]
    [InlineData("Diagrams", "Diagrams", "flowchart-styled-labels", 9)]
    public void Complete_math_corpus_measured_boxes_match_frozen_native_scaled_points(string fixtures, string references, string id, int count)
    {
        var sourceBytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Fixtures", fixtures, id + ".tikz"));
        var source = System.Text.Encoding.UTF8.GetString(sourceBytes);
        using var reference = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "MathLabels", references, id + ".json")));
        Assert.Equal(reference.RootElement.GetProperty("sourceSha256").GetString(), Convert.ToHexStringLower(SHA256.HashData(sourceBytes)));
        GraphicsScene? scene = null;
        var result = TikzConverter.ConvertWithTrace(source, TikzOptions.Default, CancellationToken.None, s => scene = s);
        Assert.True(result is TikzSuccess, string.Join(';', result.Diagnostics.Select(d => d.Code + ": " + d.Message)));
        var native = reference.RootElement.GetProperty("nodes").EnumerateArray().ToArray();
        Assert.Equal(count, native.Length); Assert.Equal(count, scene!.Nodes.Count);
        Assert.Equal(count * 16, reference.RootElement.GetProperty("anchors").GetArrayLength());
        foreach (var name in native.Select(n => n.GetProperty("name").GetString()))
            Assert.Equal(16, reference.RootElement.GetProperty("anchors").EnumerateArray().Where(a => a.GetProperty("name").GetString() == name)
                .Select(a => a.GetProperty("anchor").GetString()).Distinct().Count());
        var trace = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "MathLabels", "native-layout", id, "native-positions.log"));
        using var observations = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "MathLabels", "native-layout", id, "font-observations.json")));
        var faces = NativeFaces(observations.RootElement);
        if (id == "flowchart-styled-labels")
        {
            Assert.Equal(new[] { "bold-10", "bold-12", "italic-10", "italic-12", "regular-10", "regular-12" },
                faces.Where(f => !f.Id.StartsWith("math-", StringComparison.Ordinal)).Select(f => f.Id).Order(StringComparer.Ordinal));
            Assert.Equal(75, observations.RootElement.GetProperty("glyphs").GetInt32());
            Assert.Equal(2, observations.RootElement.GetProperty("rules").GetInt32());
        }
        var events = NativeMathLabelTrace.Read(trace, faces, native.Select(n => n.GetProperty("name").GetString()!).ToArray());
        Assert.Equal(observations.RootElement.GetProperty("glyphs").GetInt32(), events.Sum(e => e.Glyphs.Length));
        Assert.Equal(observations.RootElement.GetProperty("rules").GetInt32(), events.Sum(e => e.Rules.Length));
        var bound = NativeMathSvg.Read(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "MathLabels", "native-layout", id, "oracle.svg")), events);
        Assert.Equal(events.Sum(e => e.PaintOrder.Length), bound.Marks.Length);
        Assert.Equal(events.Length * 2 + events.Sum(e => e.Glyphs.Length * 2 + e.Rules.Length * 4), bound.Checks.Length);
        Assert.All(bound.Checks, q => Assert.InRange(q.ErrorBp, 0, .00000051));
        var failures = new List<string>();
        for (var i = 0; i < native.Length; i++)
        {
            var n = native[i]; var box = scene.Nodes[i].Layout.Text;
            foreach (var (name, actual) in new[] { ("widthSp", box.WidthSp), ("heightSp", box.HeightSp), ("depthSp", box.DepthSp) })
                if (n.GetProperty(name).GetInt32() != actual) failures.Add($"{n.GetProperty("name").GetString()}.{name}: native {n.GetProperty(name)}, actual {actual}");
            var e = events[i];
            Assert.Equal(e.Glyphs.Length, box.Glyphs.Length); Assert.Equal(e.Rules.Length, box.Rules.Length);
            Assert.Equal(e.PaintOrder, box.PaintOrder);
            for (var j = 0; j < e.Glyphs.Length; j++)
            {
                var a = box.Glyphs[j]; var b = e.Glyphs[j];
                if ((a.FontId, a.Slot, a.XSp, a.YSp) != (b.Font, b.Slot, b.XSp, b.YSp))
                    failures.Add($"{e.Id}.glyph[{j}]: native {b}, actual {a.FontId}/{a.Slot}@({a.XSp},{a.YSp}), source {a.Source.Location.Offset}");
            }
            for (var j = 0; j < e.Rules.Length; j++)
            {
                var a = box.Rules[j]; var b = e.Rules[j];
                if ((a.XSp, a.YSp, a.WidthSp, a.HeightSp) != (b.XSp, b.YSp, b.WidthSp, b.HeightSp))
                    failures.Add($"{e.Id}.rule[{j}]: native {b}, actual ({a.XSp},{a.YSp},{a.WidthSp},{a.HeightSp}), source {a.Source.Location.Offset}");
            }
        }
        var indices = native.Select((n, i) => (name: n.GetProperty("name").GetString()!, i)).ToDictionary(n => n.name, n => n.i);
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var origin = new Source(source, 0, source.Length);
        foreach (var anchor in reference.RootElement.GetProperty("anchors").EnumerateArray())
        {
            var name = anchor.GetProperty("name").GetString()!; var node = scene.Nodes[indices[name]];
            // The frozen probes query after the picture, in the surrounding
            // default font. PGF's mid anchor uses the querying font's ex.
            var metrics = NodeFontMetrics.Resolve(TextFont.Default, budget, origin);
            var p = PgfTransform.Apply(node.Transform, node.Layout.Anchor(anchor.GetProperty("anchor").GetString()!, metrics, budget, origin).Bp, budget, origin);
            foreach (var (dimension, actual) in new[] { ("xSp", p.X), ("ySp", p.Y) })
            {
                var sp = (int)Math.Round(actual * (72.27 * 65536 / 72), MidpointRounding.AwayFromZero);
                if (sp != anchor.GetProperty(dimension).GetInt32()) failures.Add($"{name}.{anchor.GetProperty("anchor").GetString()}.{dimension}: native {anchor.GetProperty(dimension)}, actual {sp}");
            }
        }
        Assert.True(failures.Count == 0, string.Join('\n', failures));
    }

    [Fact]
    public void Math_rules_and_glyphs_share_limits_provenance_and_deterministic_cache_charges()
    {
        const string source = @"\node{$\sqrt{\frac{x^{y_i}}{z}}$};";
        GraphicsScene? scene = null;
        var result = Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source, Body, CancellationToken.None, s => scene = s));
        var run = Assert.Single(scene!.Drawables.OfType<PaintedGlyphRun>());
        Assert.Equal(2, run.Rules.Length);
        Assert.Equal(run.Glyphs.Length + run.Rules.Length, run.PaintOrder.Length);
        Assert.All(run.Glyphs, g => Assert.InRange(g.Placement.Source.Location.Offset, 7, source.Length - 2));
        Assert.All(run.Rules, r => {
            Assert.StartsWith("\\", r.Placement.Source.Value);
            Assert.Contains(r.Placement.Source.Value, source, StringComparison.Ordinal);
            Assert.True(r.InkBounds.MaxX > r.InkBounds.MinX && r.InkBounds.MaxY > r.InkBounds.MinY);
        });
        Assert.Equal(result.Statistics, TikzConverter.Convert(source, Body, CancellationToken.None).Statistics);
        foreach (var limits in new[] {
            TikzLimits.Default with { MaxGlyphs = result.Statistics.Glyphs - 1 },
            TikzLimits.Default with { MaxSegments = result.Statistics.Segments - 1 },
            TikzLimits.Default with { MaxWork = result.Statistics.Work - 1 },
            TikzLimits.Default with { MaxOutputBytes = result.Statistics.OutputBytes - 1 },
            TikzLimits.Default with { MaxCoordinatePixels = 1 }
        })
        {
            var failed = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body with { Limits = limits }, CancellationToken.None));
            Assert.Equal("TIKZ005", Assert.Single(failed.Diagnostics).Code);
            Assert.InRange(failed.Diagnostics[0].Span.Offset, 0, source.Length);
            Assert.Equal(0, failed.Statistics.OutputBytes);
        }
        using var cancellation = new CancellationTokenSource();
        const string math = @"$\sqrt{\frac{x}{y}}$";
        var mathSource = new Source(math, 0, math.Length);
        var program = Assert.IsType<LabelMath>(Assert.Single(new LabelParser(mathSource, new(TikzLimits.Default, CancellationToken.None)).Parse()));
        cancellation.Cancel();
        var error = Assert.Throws<OperationCanceledException>(() => new MathLayout(new(TikzLimits.Default, cancellation.Token)).Layout(program, 10, 0));
        Assert.Equal(cancellation.Token, error.CancellationToken);
    }

    [Fact]
    public void Rules_follow_math_paint_order_transform_color_opacity_and_clipping()
    {
        const string source = @"\clip(-1,-1)rectangle(2,2);\node[rotate=30,text=red,text opacity=.4]{$\frac{a}{b}+\sqrt{x}$};";
        GraphicsScene? scene = null;
        var result = Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source, Body with { IdPrefix = "math" }, CancellationToken.None, s => scene = s));
        var run = Assert.Single(scene!.Drawables.OfType<PaintedGlyphRun>());
        Assert.Equal("#ff0000", run.Color.Svg); Assert.Equal(.4, run.Opacity); Assert.Single(run.Clips);
        Assert.Equal(2, run.Rules.Length);
        Assert.All(run.Rules, r => { Assert.NotEqual(0, r.Transform.B); Assert.NotEqual(0, r.Transform.C); });
        var svg = System.Xml.Linq.XDocument.Parse(result.Svg);
        System.Xml.Linq.XNamespace ns = "http://www.w3.org/2000/svg";
        var group = Assert.Single(svg.Descendants(ns + "g"), g => (string?)g.Attribute("id") == "math-n0");
        Assert.Equal(run.PaintOrder.Select(i => i < 0 ? "rect" : "use"), group.Elements().Where(e => e.Name.LocalName != "title").Select(e => e.Name.LocalName));
        Assert.Equal("0.4", (string?)group.Attribute("fill-opacity"));
        Assert.Contains(group.Ancestors(), g => g.Attribute("clip-path") is not null);
        foreach (var r in group.Elements(ns + "rect")) Assert.StartsWith("matrix(", (string?)r.Attribute("transform"));
        var invisible = Assert.IsType<TikzSuccess>(TikzConverter.Convert(@"\node[text opacity=0]{$\frac{a}{b}$};", Body, CancellationToken.None));
        Assert.True(invisible.InkBounds.IsEmpty);
    }

    [Fact]
    public void Long_upright_ligature_runs_preserve_atoms_without_repeated_array_shifting()
    {
        const int count = 1000;
        var label = @"$\mathrm{" + string.Concat(Enumerable.Repeat("ffi", count)) + "}$";
        var source = new Source(label, 0, label.Length);
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var program = new LabelParser(source, budget).Parse();
        var glyphs = TextLayout.Layout(program, source, TextFont.Default, TextAlignment.Center, budget).Glyphs;
        Assert.Equal(count, glyphs.Length);
        Assert.All(glyphs, g => { Assert.Equal("math-roman-10", g.FontId); Assert.Equal("ffi", g.Source.Value); });
        Assert.Single(glyphs.Select(g => g.Slot).Distinct());
        Assert.Equal(count, budget.Glyphs);
        Assert.True(budget.Work < count * 200L);
    }

    [Fact]
    public void Concurrent_math_layout_does_not_leak_size_style_culture_or_paint()
    {
        var sources = new[] { @"\node{$\frac{x_i^2}{\sqrt{y}}$};", @"\node{\large $x^{\alpha_i}_{\mathrm{ffi}}$};" };
        var expected = sources.Select(s => Assert.IsType<TikzSuccess>(TikzConverter.Convert(s, Body, CancellationToken.None))).ToArray();
        Parallel.For(0, 24, i => {
            var previous = CultureInfo.CurrentCulture;
            try {
                CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo(i % 2 == 0 ? "fr-FR" : "en-US");
                var actual = Assert.IsType<TikzSuccess>(TikzConverter.Convert(sources[i % 2], Body, CancellationToken.None));
                Assert.Equal(expected[i % 2].Svg, actual.Svg); Assert.Equal(expected[i % 2].Statistics, actual.Statistics);
            } finally { CultureInfo.CurrentCulture = previous; }
        });
    }

    [Fact]
    public void Independent_math_trace_rejects_corrupted_native_units_fonts_origins_movements_and_rules()
    {
        const string id = "math-label-contract";
        var directory = Path.Combine(AppContext.BaseDirectory, "Reference", "MathLabels");
        var trace = File.ReadAllText(Path.Combine(directory, "native-layout", id, "native-positions.log"));
        using var observations = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, "native-layout", id, "font-observations.json")));
        using var reference = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, id + ".json")));
        var ids = reference.RootElement.GetProperty("nodes").EnumerateArray().Select(n => n.GetProperty("name").GetString()!).ToArray();
        var faces = NativeFaces(observations.RootElement);
        Assert.Equal(ids.Length, NativeMathLabelTrace.Read(trace, faces, ids).Length);
        var corruptions = new[] {
            trace.Replace("25400000/473628672", "25400000/473628673", StringComparison.Ordinal),
            trace.Replace("magnification=1000;", "magnification=1001;", StringComparison.Ordinal),
            trace.Replace("totalpages=1", "totalpages=2", StringComparison.Ordinal),
            trace.Replace("lmsy8---", "unknown8---", StringComparison.Ordinal),
            trace.Replace("lokad-node-origin identifier", "lokad-node-origin number", StringComparison.Ordinal),
            Regex.Replace(trace, @"height 26213, width", "height -26213, width"),
            Regex.Replace(trace, @"height 26213, width", "height bad, width"),
            new Regex(@" h:=(-?\d+)([+-])(\d+)=(-?\d+),").Replace(trace, m => m.Value.Replace("=" + m.Groups[4].Value + ",", "=" + (int.Parse(m.Groups[4].Value, CultureInfo.InvariantCulture) + 1) + ",", StringComparison.Ordinal), 1),
            trace + "\n999999: pop\n"
        };
        foreach (var corrupt in corruptions)
        {
            Assert.NotEqual(trace, corrupt);
            Assert.Throws<InvalidDataException>(() => NativeMathLabelTrace.Read(corrupt, faces, ids));
        }
    }

    private static NativeMathLabelTrace.Face[] NativeFaces(JsonElement observations)
        => NativeMathFaces.Read(
            File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "MathLabels", "font-profile.json")),
            File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "Nodes", "font-profile.json")), observations,
            (id, math) => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", math ? "MathFonts" : "Fonts", id + ".json")),
            tfm => File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Reference", "MathLabels", "fonts", tfm)));

    [Fact]
    public void Native_math_svg_binding_rejects_changed_coordinates_paint_order_rules_slots_and_aliases()
    {
        var directory = Path.Combine(AppContext.BaseDirectory, "Reference", "MathLabels");
        const string id = "math-atom-contract";
        using var observations = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, "native-layout", id, "font-observations.json")));
        using var measurements = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, id + ".json")));
        var ids = measurements.RootElement.GetProperty("nodes").EnumerateArray().Select(n => n.GetProperty("name").GetString()!).ToArray();
        var nodes = NativeMathLabelTrace.Read(File.ReadAllText(Path.Combine(directory, "native-layout", id, "native-positions.log")), NativeFaces(observations.RootElement), ids);
        var original = File.ReadAllText(Path.Combine(directory, "native-layout", id, "oracle.svg"));
        Assert.Equal(326, NativeMathSvg.Read(original, nodes).Marks.Length);
        XNamespace ns = "http://www.w3.org/2000/svg";
        var mutations = new Action<XDocument>[] {
            d => Painted(d).First().SetAttributeValue("x", "0"),
            d => Painted(d).First().SetAttributeValue("fill", "white"),
            d => Painted(d).First().SetAttributeValue("opacity", "0"),
            d => Painted(d).First().Remove(),
            d => Painted(d).First().SetAttributeValue(XName.Get("href", "http://www.w3.org/1999/xlink"), "#g1-255"),
            d => d.Descendants(ns + "rect").First().SetAttributeValue("width", "1"),
            d => d.Descendants(ns + "rect").First().SetAttributeValue("height", "-1"),
            d => d.Descendants(ns + "rect").First().Name = ns + "use",
            d => d.Descendants(ns + "defs").Single().Add(new XElement(d.Descendants(ns + "defs").Single().Elements().First())),
            d => d.Descendants(ns + "defs").Single().Elements(ns + "use").First().SetAttributeValue("transform", "scale(3)"),
            d => d.Descendants(ns + "defs").Single().Elements(ns + "path").First().SetAttributeValue("fill", "none"),
            d => d.Descendants(ns + "defs").Single().Elements(ns + "use").First().SetAttributeValue("opacity", "0"),
            d => { var alias = d.Descendants(ns + "defs").Single().Elements(ns + "use").First();
                alias.SetAttributeValue(XName.Get("href", "http://www.w3.org/1999/xlink"), "#" + alias.Attribute("id")!.Value); },
            d => Painted(d).First().SetAttributeValue("transform", "translate(1 0)"),
            d => d.Descendants(ns + "g").First(g => (g.Attribute("transform")?.Value ?? "").StartsWith("scale(-1.00375", StringComparison.Ordinal))
                .SetAttributeValue("transform", "scale(-1.00375,1.00375)translate(0,0)scale(-1,-1)")
        };
        foreach (var mutate in mutations)
        {
            var altered = XDocument.Parse(original); mutate(altered);
            var text = altered.ToString(SaveOptions.DisableFormatting); Assert.NotEqual(original, text);
            Assert.Throws<InvalidDataException>(() => NativeMathSvg.Read(text, nodes));
        }
        IEnumerable<XElement> Painted(XDocument doc) => doc.Descendants(ns + "use").Where(e => !e.Ancestors(ns + "defs").Any());
    }

    [Fact]
    public void Fractional_native_driver_positions_preserve_integer_measurements_and_require_original_TFM_bytes()
    {
        var directory = Path.Combine(AppContext.BaseDirectory, "Reference");
        using var observations = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, "MathLabels", "native-layout", "math-label-contract", "font-observations.json")));
        using var measurements = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, "MathLabels", "math-label-contract.json")));
        var ids = measurements.RootElement.GetProperty("nodes").EnumerateArray().Select(n => n.GetProperty("name").GetString()!).ToArray();
        var faces = NativeFaces(observations.RootElement);
        var trace = File.ReadAllText(Path.Combine(directory, "MathLabels", "native-layout", "math-label-contract", "native-positions.log"));
        var driver = NativeMathLabelTrace.Read(trace, faces, ids);
        var integer = NativeMathLabelTrace.Read(trace, faces.Select(f => f with { DriverWidths = null }).ToArray(), ids);
        for (var i = 0; i < driver.Length; i++)
        {
            Assert.Equal(integer[i].PaintOrder, driver[i].PaintOrder);
            Assert.Equal(integer[i].Glyphs.Select(g => (g.Font, g.Slot, g.XSp, g.YSp)), driver[i].Glyphs.Select(g => (g.Font, g.Slot, g.XSp, g.YSp)));
            Assert.Equal(integer[i].Rules.Select(r => (r.XSp, r.YSp, r.WidthSp, r.HeightSp)), driver[i].Rules.Select(r => (r.XSp, r.YSp, r.WidthSp, r.HeightSp)));
        }
        Assert.Contains(driver.SelectMany(n => n.Glyphs), g => Math.Abs(g.DriverXSp - Math.Round(g.DriverXSp)) > .01);
        Assert.Throws<InvalidDataException>(() => NativeMathFaces.Read(
            File.ReadAllText(Path.Combine(directory, "MathLabels", "font-profile.json")), File.ReadAllText(Path.Combine(directory, "Nodes", "font-profile.json")),
            observations.RootElement, (id, math) => File.ReadAllText(Path.Combine(directory, math ? "MathFonts" : "Fonts", id + ".json")),
            tfm => { var bytes = File.ReadAllBytes(Path.Combine(directory, "MathLabels", "fonts", tfm)); bytes[^1] ^= 1; return bytes; }));
    }
}

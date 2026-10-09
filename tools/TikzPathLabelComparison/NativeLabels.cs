using System.Text.Json;
using System.Xml.Linq;
using Lokad.TikZ;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Text;
using TikzShapeComparison;

namespace TikzPathLabelComparison;

internal static class NativeLabels
{
    internal sealed record Check(string Quantity, object Expected, object Actual, bool Passed, TikzSourceSpan? Source);
    internal const double BpPerSp = 72 / (72.27 * 65536);

    internal static Check[] Compare(GraphicsScene scene, TikzSuccess result, JsonElement native, NativeGlyphTrace.Evidence glyphs, string originalSvg)
    {
        var checks = new List<Check>();
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var nodes = native.GetProperty("nodes").EnumerateArray().ToArray();
        var paints = native.GetProperty("driverState").GetProperty("paints").EnumerateArray().ToArray();
        var doc = XDocument.Parse(originalSvg);
        var nativeUses = doc.Descendants().Where(e => e.Name.LocalName == "use").ToArray();
        var nativeClips = doc.Descendants().Where(e => e.Name.LocalName == "clipPath").Select(e => e.Attribute("id")!.Value).ToArray();
        var firstGlyph = 0;
        var diagram = native.GetProperty("profile").GetString() == "pgf-3.1.11a-complete-diagrams-v1";
        Equal("nodes", nodes.Length, scene.Nodes.Count);
        Equal("glyphs", glyphs.Nodes.Sum(n => n.Glyphs.Length), result.Statistics.Glyphs);
        Equal("paintedPaths", paints.Length, scene.Paths.Count);
        Equal("clipPaths", nativeClips.Length, scene.Clips.Count);
        for (var i = 0; i < Math.Min(nodes.Length, scene.Nodes.Count); i++)
        {
            var actual = scene.Nodes[i]; var n = nodes[i]; var id = n.GetProperty("id").GetString()!;
            var origin = actual.Source; var metrics = NodeFontMetrics.Resolve(actual.NodeFont, budget, origin);
            Equal(id + ".name", n.TryGetProperty("sourceName", out var sourceName) ? sourceName.GetString()! : id, actual.Name, origin.Location);
            var values = n.GetProperty("values");
            Equal(id + ".width", values.GetProperty("width").GetInt32(), actual.Layout.Text.WidthSp, origin.Location);
            Equal(id + ".height", values.GetProperty("height").GetInt32(), actual.Layout.Text.HeightSp, origin.Location);
            Equal(id + ".depth", values.GetProperty("depth").GetInt32(), actual.Layout.Text.DepthSp, origin.Location);
            foreach (var anchor in n.GetProperty("anchors").EnumerateObject())
            {
                var point = PgfTransform.Apply(actual.Transform, actual.Layout.Anchor(anchor.Name, metrics, budget, origin).Bp, budget, origin);
                Equal(id + "." + anchor.Name + ".x", anchor.Value.GetProperty("xSp").GetInt32(), Sp(point.X), origin.Location);
                Equal(id + "." + anchor.Name + ".y", anchor.Value.GetProperty("ySp").GetInt32(), Sp(point.Y), origin.Location);
            }
            var frame = n.GetProperty("frame").EnumerateArray().Take(4).Select(v => double.Parse(v.GetString()!, System.Globalization.CultureInfo.InvariantCulture)).ToArray();
            var baseline = n.GetProperty("anchors").GetProperty("text");
            var run = scene.Drawables.OfType<PaintedGlyphRun>().SingleOrDefault(r => r.NodeId == i);
            var expectedGlyphs = glyphs.Nodes[i].Glyphs;
            Equal(id + ".glyphCount", expectedGlyphs.Length, run?.Glyphs.Length ?? -1, origin.Location);
            var nodeFirstGlyph = firstGlyph;
            firstGlyph += expectedGlyphs.Length;
            if (run is null) continue;
            var expectedClips = nativeUses[nodeFirstGlyph].AncestorsAndSelf().Reverse()
                .Select(e => e.Attribute("clip-path")?.Value).Where(value => value is not null)
                .Select(value => Array.IndexOf(nativeClips, value![5..^1])).ToArray();
            if (expectedClips.Any(id => id < 0)) throw new InvalidDataException("Unowned native glyph clip.");
            Equal(id + ".glyphClips", string.Join(",", expectedClips), string.Join(",", run.Clips), origin.Location);
            for (var j = 0; j < Math.Min(run.Glyphs.Length, expectedGlyphs.Length); j++)
            {
                var g = run.Glyphs[j]; var wanted = expectedGlyphs[j]; var prefix = id + ".glyph." + j;
                var use = nativeUses[nodeFirstGlyph + j];
                var nativeColor = use.AncestorsAndSelf().Select(e => e.Attribute("fill")?.Value).FirstOrDefault(v => v is not null) ?? "#000";
                if (nativeColor.Length == 4) nativeColor = "#" + string.Concat(nativeColor[1..].Select(c => new string(c, 2)));
                Equal(prefix + ".color", nativeColor.ToLowerInvariant(), run.Color.Svg, g.Placement.Source.Location);
                var alpha = use.AncestorsAndSelf().Select(e => e.Attribute("fill-opacity")?.Value).FirstOrDefault(v => v is not null) ?? "1";
                Near(prefix + ".opacity", double.Parse(alpha, System.Globalization.CultureInfo.InvariantCulture), run.Opacity, g.Placement.Source.Location);
                Equal(prefix + ".font", wanted.Font, g.Placement.FontId, g.Placement.Source.Location);
                Equal(prefix + ".slot", wanted.Slot, g.Placement.Slot, g.Placement.Source.Location);
                Equal(prefix + ".localX", wanted.XSp, g.Placement.XSp, g.Placement.Source.Location);
                Equal(prefix + ".localY", wanted.YSp, g.Placement.YSp, g.Placement.Source.Location);
                var x = baseline.GetProperty("xSp").GetInt32() * BpPerSp + (frame[0] * wanted.XSp - frame[2] * wanted.YSp) * BpPerSp;
                var y = baseline.GetProperty("ySp").GetInt32() * BpPerSp + (frame[1] * wanted.XSp - frame[3] * wanted.YSp) * BpPerSp;
                Near(prefix + ".x", x, g.Transform.E, g.Placement.Source.Location);
                Near(prefix + ".y", y, g.Transform.F, g.Placement.Source.Location);
                Near(prefix + ".a", frame[0], g.Transform.A, g.Placement.Source.Location);
                Near(prefix + ".b", frame[1], g.Transform.B, g.Placement.Source.Location);
                Near(prefix + ".c", -frame[2], g.Transform.C, g.Placement.Source.Location);
                Near(prefix + ".d", -frame[3], g.Transform.D, g.Placement.Source.Location);
            }
        }
        for (var i = 0; i < Math.Min(paints.Length, scene.Paths.Count); i++)
        {
            var p = scene.Paths[i]; var expected = paints[i]; var prefix = "paint." + i;
            var operation = expected.GetProperty("operation").GetString();
            Equal(prefix + ".operation", operation!, p.Paint.Fill ? p.Paint.Stroke ? "fillstroke" : "fill" : "stroke", p.Source.Location);
            if (p.Paint.Stroke && operation is "stroke" or "fillstroke")
            {
                Near(prefix + ".width", expected.GetProperty("widthSp").GetInt32() * BpPerSp, p.Paint.Width, p.Source.Location);
                Equal(prefix + ".stroke", Rgb(expected.GetProperty("strokeRgb")), p.Paint.StrokeColor.PgfSvg, p.Source.Location);
                Near(prefix + ".strokeOpacity", expected.GetProperty("strokeOpacity").GetDouble(), p.Paint.StrokeOpacity, p.Source.Location);
            }
            if (p.Paint.Fill && operation is "fill" or "fillstroke")
            {
                Equal(prefix + ".fill", Rgb(expected.GetProperty("fillRgb")), p.Paint.FillColor.PgfSvg, p.Source.Location);
                Near(prefix + ".fillOpacity", expected.GetProperty("fillOpacity").GetDouble(), p.Paint.FillOpacity, p.Source.Location);
            }
            var clips = expected.GetProperty("clips").EnumerateArray().Select(v => v.GetInt32()).ToArray();
            Equal(prefix + ".clips", string.Join(",", clips), string.Join(",", p.Clips), p.Source.Location);
            if (diagram && p.Paint.Stroke)
            {
                Equal(prefix + ".cap", expected.GetProperty("cap").GetInt32(), p.Paint.Cap switch { "butt" => 0, "round" => 1, "square" => 2, _ => -1 }, p.Source.Location);
                Equal(prefix + ".join", expected.GetProperty("join").GetInt32(), p.Paint.Join switch { "miter" => 0, "round" => 1, "bevel" => 2, _ => -1 }, p.Source.Location);
                Near(prefix + ".miter", expected.GetProperty("miter").GetDouble(), p.Paint.Miter, p.Source.Location);
            }
        }
        var expectedOrder = new List<string>();
        var nodeIndex = 0; var glyphIndex = 0;
        foreach (var element in doc.Descendants().Where(e => !e.Ancestors().Any(a => a.Name.LocalName is "defs" or "clipPath")))
        {
            if (element.Name.LocalName == "path") expectedOrder.Add("path");
            if (element.Name.LocalName != "use") continue;
            if (nodeIndex >= glyphs.Nodes.Length) throw new InvalidDataException("Native SVG has an unowned glyph.");
            if (glyphIndex == 0) expectedOrder.Add("node:" + glyphs.Nodes[nodeIndex].Id);
            if (++glyphIndex == glyphs.Nodes[nodeIndex].Glyphs.Length) { glyphIndex = 0; nodeIndex++; }
        }
        if (nodeIndex != glyphs.Nodes.Length || glyphIndex != 0) throw new InvalidDataException("Native SVG glyph coverage differs.");
        var actualOrder = scene.Drawables.Select(d => d is PaintedGlyphRun r ? "node:" + nodes[r.NodeId].GetProperty("id").GetString() : "path");
        Equal("physicalPaintOrder", string.Join("|", expectedOrder), string.Join("|", actualOrder));
        if (native.TryGetProperty("coordinates", out var coordinates))
            foreach (var coordinate in coordinates.EnumerateArray())
            {
                var id = coordinate.GetProperty("id").GetString()!;
                Equal(id + ".present", true, scene.Coordinates.ContainsKey(id));
                if (!scene.Coordinates.TryGetValue(id, out var point)) continue;
                Equal(id + ".x", coordinate.GetProperty("center").GetProperty("xSp").GetInt32(), Sp(point.X));
                Equal(id + ".y", coordinate.GetProperty("center").GetProperty("ySp").GetInt32(), Sp(point.Y));
            }
        if (diagram)
        {
            var bounds = native.GetProperty("pictureBounds");
            foreach (var (key, actual) in new[] { ("minXSp", scene.PictureBounds.MinX), ("minYSp", scene.PictureBounds.MinY),
                ("maxXSp", scene.PictureBounds.MaxX), ("maxYSp", scene.PictureBounds.MaxY) })
                Equal("pictureBounds." + key, bounds.GetProperty(key).GetInt32(), Sp(actual));
        }
        return [.. checks];

        void Equal(string key, object wanted, object actual, TikzSourceSpan? source = null)
            => checks.Add(new(key, wanted, actual, Equals(wanted, actual), source));
        void Near(string key, double wanted, double actual, TikzSourceSpan? source = null)
            => checks.Add(new(key, wanted, actual, Math.Abs(wanted - actual) <= 1e-8, source));
        static int Sp(double bp) => (int)Math.Round(bp / BpPerSp, MidpointRounding.AwayFromZero);
        static string Rgb(JsonElement rgb) => "#" + string.Concat(rgb.EnumerateArray().Select(c => ((int)Math.Round(c.GetDouble() * 255)).ToString("x2")));
    }
}

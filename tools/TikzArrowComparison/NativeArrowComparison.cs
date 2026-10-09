using System.Text.Json;
using Lokad.TikZ;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Semantics;

namespace TikzArrowComparison;

// Expected values come exclusively from the frozen independent native records.
// No converter evaluator, arrow formulas or SVG writer supplies expectations.
internal static class NativeArrowComparison
{
    public const double SpPerBp = 65536 * 72.27 / 72;
    public sealed record Check(string Quantity, object Expected, object Actual, double? Delta, double Limit, string Unit, bool Passed);
    public static List<Check> Compare(GraphicsScene scene, TikzSuccess success, JsonElement native, int expectedGlyphs = 0, bool ignoreTrailingMoves = false)
    {
        var checks = new List<Check>();
        var paints = native.GetProperty("driverState").GetProperty("paints").EnumerateArray().ToArray();
        var paths = native.GetProperty("paths").EnumerateArray().ToDictionary(p => p.GetProperty("id").GetInt32());
        var placements = native.GetProperty("placements").EnumerateArray().ToDictionary(p => p.GetProperty("id").GetInt32());
        var templates = native.GetProperty("templates").EnumerateArray().ToDictionary(p => p.GetProperty("id").GetInt32());
        var clips = native.GetProperty("clips").EnumerateArray().Select(p => p.GetInt32()).ToArray();
        Equal("paint.count", paints.Length, scene.Paths.Count);
        Equal("glyph.count", expectedGlyphs, scene.Drawables.OfType<PaintedGlyphRun>().Sum(g => g.Glyphs.Length));
        Equal("tip.count", placements.Count, scene.Paths.Count(p => p.Arrow is not null));
        Equal("clip.count", clips.Length, scene.Clips.Count);
        for (var i = 0; i < Math.Min(paints.Length, scene.Paths.Count); i++)
        {
            var expected = paints[i]; var actual = scene.Paths[i]; var name = "paint-" + (i + 1);
            var role = expected.GetProperty("role").GetString()!;
            Equal(name + ".role", role, actual.Arrow is null ? "shaft" : "tip");
            Path(name, paths[expected.GetProperty("pathId").GetInt32()].GetProperty("segments"), actual.Path);
            Paint(name, expected, actual.Paint);
            var expectedClips = expected.GetProperty("clips").EnumerateArray().Select(c => c.GetInt32()).ToArray();
            Equal(name + ".clips", string.Join(',', expectedClips), string.Join(',', actual.Clips));
            if (role == "shaft") Matrix(name + ".matrix", Affine.Identity, actual.Transform);
            else if (actual.Arrow is { } tip)
            {
                var placement = placements[expected.GetProperty("placementId").GetInt32()];
                var template = templates[placement.GetProperty("templateId").GetInt32()];
                var matrix = placement.GetProperty("matrix").EnumerateArray().Select(p => p.GetDouble()).ToArray();
                Matrix(name + ".matrix", new(matrix[0], matrix[1], matrix[2], matrix[3],
                    placement.GetProperty("xSp").GetInt64() / SpPerBp, placement.GetProperty("ySp").GetInt64() / SpPerBp), actual.Transform);
                Equal(name + ".side", placement.GetProperty("side").GetString()!, tip.Side);
                Equal(name + ".tip-name", template.GetProperty("name").GetString()!, tip.Template.Name);
                var ends = template.GetProperty("ends"); var visual = template.GetProperty("visualEnds");
                Number(name + ".tip-end", ends.GetProperty("tipSp").GetInt64(), tip.Template.TipEndSp);
                Number(name + ".back-end", ends.GetProperty("backSp").GetInt64(), tip.Template.BackEndSp);
                Number(name + ".line-end", ends.GetProperty("lineSp").GetInt64(), tip.Template.LineEndSp);
                Number(name + ".visual-tip", visual.GetProperty("tipSp").GetInt64(), tip.Template.VisualTipSp);
                Number(name + ".visual-back", visual.GetProperty("backSp").GetInt64(), tip.Template.VisualBackSp);
                Sizes(name + ".configured", template.GetProperty("configuredSizeSp"), tip.Template.ConfiguredSizeSp);
                Sizes(name + ".final", template.GetProperty("finalSizeSp"), tip.Template.FinalSizeSp);
                var hull = template.GetProperty("hull").EnumerateArray().ToArray();
                Equal(name + ".hull.count", hull.Length, tip.Template.Hull.Length);
                for (var h = 0; h < Math.Min(hull.Length, tip.Template.Hull.Length); h++)
                { Number(name + $".hull.{h}.x", hull[h].GetProperty("xSp").GetInt64(), tip.Template.Hull[h].X); Number(name + $".hull.{h}.y", hull[h].GetProperty("ySp").GetInt64(), tip.Template.Hull[h].Y); }
                var shortening = native.GetProperty("shortening").EnumerateArray().Single(s => s.GetProperty("inputId").GetInt32() == placement.GetProperty("inputId").GetInt32() && s.GetProperty("side").GetString() == tip.Side);
                Number(name + ".shortening", shortening.GetProperty("distanceSp").GetInt64(), tip.ShorteningSp);
                Number(name + ".total-length", shortening.GetProperty("totalLengthSp").GetInt64(), tip.TotalLengthSp);
                Equal(name + ".shaft-source", true, tip.ShaftSource.Length > 0 && tip.ShaftSource.Text == actual.Source.Text);
            }
        }
        for (var i = 0; i < Math.Min(clips.Length, scene.Clips.Count); i++) Path("clip-" + i, paths[clips[i]].GetProperty("segments"), scene.Clips[i].Path);
        var picture = native.GetProperty("pictureBounds");
        Number("picture.minX", picture.GetProperty("minXSp").GetInt64(), scene.PictureBounds.MinX * SpPerBp, .000001);
        Number("picture.minY", picture.GetProperty("minYSp").GetInt64(), scene.PictureBounds.MinY * SpPerBp, .000001);
        Number("picture.maxX", picture.GetProperty("maxXSp").GetInt64(), scene.PictureBounds.MaxX * SpPerBp, .000001);
        Number("picture.maxY", picture.GetProperty("maxYSp").GetInt64(), scene.PictureBounds.MaxY * SpPerBp, .000001);
        Equal("public.picture", scene.PictureBounds.Pixels, success.PictureBounds);
        Equal("public.ink", scene.InkBounds.Pixels, success.InkBounds);
        return checks;

        void Equal(string q, object expected, object actual) => checks.Add(new(q, expected, actual, null, 0, "identity", Equals(expected, actual)));
        void Number(string q, double expected, double actual, double limit = 0, string unit = "sp")
        { var delta = Math.Abs(expected - actual); checks.Add(new(q, expected, actual, delta, limit, unit, double.IsFinite(actual) && delta <= limit)); }
        void Sizes(string name, JsonElement expected, long[]? actual)
        {
            Equal(name + ".present", expected.ValueKind != JsonValueKind.Null, actual is not null);
            if (expected.ValueKind == JsonValueKind.Null || actual is null) return;
            var sizes = expected.EnumerateArray().ToArray(); Equal(name + ".count", sizes.Length, actual.Length);
            for (var i = 0; i < Math.Min(sizes.Length, actual.Length); i++) Number(name + "." + i, sizes[i].GetInt64(), actual[i]);
        }
        void Matrix(string name, Affine expected, Affine actual)
        {
            var e = new[] { expected.A, expected.B, expected.C, expected.D }; var a = new[] { actual.A, actual.B, actual.C, actual.D };
            for (var i = 0; i < 4; i++) Number(name + "." + i, e[i], a[i], 1e-10, "coefficient");
            Number(name + ".x", expected.E * SpPerBp, actual.E * SpPerBp, .000001);
            Number(name + ".y", expected.F * SpPerBp, actual.F * SpPerBp, .000001);
        }
        void Paint(string name, JsonElement expected, Paint actual)
        {
            var operation = expected.GetProperty("operation").GetString();
            Equal(name + ".stroke", operation is "stroke" or "fillstroke", actual.Stroke);
            Equal(name + ".fill", operation is "fill" or "fillstroke", actual.Fill);
            Number(name + ".width", expected.GetProperty("widthSp").GetInt64(), actual.Width * SpPerBp, .000001);
            Equal(name + ".cap", expected.GetProperty("cap").GetInt32(), actual.Cap switch { "butt" => 0, "round" => 1, "square" => 2, _ => -1 });
            Equal(name + ".join", expected.GetProperty("join").GetInt32(), actual.Join switch { "miter" => 0, "round" => 1, "bevel" => 2, _ => -1 });
            Number(name + ".miter", expected.GetProperty("miter").GetDouble(), actual.Miter, 0, "scalar");
            Number(name + ".stroke-opacity", expected.GetProperty("strokeOpacity").GetDouble(), actual.StrokeOpacity, 0, "scalar");
            Number(name + ".fill-opacity", expected.GetProperty("fillOpacity").GetDouble(), actual.FillOpacity, 0, "scalar");
            var dash = expected.GetProperty("dashSp").EnumerateArray().ToArray(); Equal(name + ".dash.count", dash.Length, actual.Dash.Length);
            for (var i = 0; i < Math.Min(dash.Length, actual.Dash.Length); i++) Number(name + ".dash." + i, dash[i].GetDouble(), actual.Dash[i] * SpPerBp, .000001);
            Number(name + ".phase", expected.GetProperty("phaseSp").GetDouble(), actual.DashPhase * SpPerBp, .000001);
            Rgb("strokeRgb", actual.StrokeColor); Rgb("fillRgb", actual.FillColor);
            void Rgb(string key, Color color)
            {
                if (expected.GetProperty(key).ValueKind == JsonValueKind.Null) return;
                var channels = expected.GetProperty(key).EnumerateArray().ToArray(); var a = new[] { color.R, color.G, color.B };
                // Native SVG encodes finite 8-bit colors; its independently
                // checked driver records have a one-channel-quantum bound.
                for (var i = 0; i < 3; i++) Number(name + "." + key + "." + i, channels[i].GetDouble(), a[i], 1 / 255.0, "channel");
            }
        }
        void Path(string name, JsonElement expected, GraphicPath actual)
        {
            var e = Segments(expected, ignoreTrailingMoves); var a = Normalize(actual.Segments, ignoreTrailingMoves);
            Equal(name + ".segment.count", e.Count, a.Count);
            for (var i = 0; i < Math.Min(e.Count, a.Count); i++)
            {
                Equal(name + $".{i}.kind", e[i].Kind, a[i].Kind);
                Position("end", e[i].End, a[i].End);
                if (e[i].Kind == SegmentKind.Cubic) { Position("control1", e[i].A, a[i].A); Position("control2", e[i].B, a[i].B); }
                void Position(string point, Point ep, Point ap)
                { Number(name + $".{i}.{point}.x", ep.X * SpPerBp, ap.X * SpPerBp, .000001); Number(name + $".{i}.{point}.y", ep.Y * SpPerBp, ap.Y * SpPerBp, .000001); }
            }
        }
    }

    private static List<Segment> Segments(JsonElement expected, bool ignoreTrailingMoves)
    {
        var segments = new List<Segment>(); Point a = default, b = default, rectangle = default;
        foreach (var p in expected.EnumerateArray())
        {
            var point = new Point(p.GetProperty("xSp").GetInt64() / SpPerBp, p.GetProperty("ySp").GetInt64() / SpPerBp);
            switch (p.GetProperty("kind").GetString())
            {
                case "control1": a = point; break;
                case "control2": b = point; break;
                case "curve": segments.Add(new(SegmentKind.Cubic, point, a, b)); break;
                case "move": segments.Add(new(SegmentKind.Move, point, default, default)); break;
                case "line": segments.Add(new(SegmentKind.Line, point, default, default)); break;
                case "close": segments.Add(new(SegmentKind.Close, point, default, default)); break;
                case "rectcorner": rectangle = point; break;
                case "rectsize":
                    segments.Add(new(SegmentKind.Move, rectangle, default, default));
                    segments.Add(new(SegmentKind.Line, rectangle + new Point(point.X, 0), default, default));
                    segments.Add(new(SegmentKind.Line, rectangle + point, default, default));
                    segments.Add(new(SegmentKind.Line, rectangle + new Point(0, point.Y), default, default));
                    segments.Add(new(SegmentKind.Close, rectangle, default, default)); break;
                default: throw new InvalidDataException("Unknown native path token.");
            }
        }
        return Normalize(segments, ignoreTrailingMoves);
    }
    private static List<Segment> Normalize(IEnumerable<Segment> segments, bool ignoreTrailingMoves)
    {
        var result = new List<Segment>();
        foreach (var segment in segments)
        {
            if (segment.Kind == SegmentKind.Move && result.Count > 0 && result[^1].Kind == SegmentKind.Move) result[^1] = segment;
            else result.Add(segment);
        }
        // Consecutive moves and a final move without a drawing segment paint
        // nothing. PGF adds the latter after transformed rectangle backgrounds.
        // Keep the legacy fixture's strict recorded-move coverage unchanged;
        // the mixed diagram contract admits this explicit paint equivalence.
        return ignoreTrailingMoves ? result.Where((s, i) => s.Kind != SegmentKind.Move || i + 1 < result.Count).ToList() : result;
    }
}

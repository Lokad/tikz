using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Xml;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Svg;

internal static class SvgWriter
{
    private const string Namespace = "http://www.w3.org/2000/svg";
    // Preserve TeX path units through rasterization: flattening geometry and
    // dash dimensions into CSS pixels can change a dash crossing a corner.
    private const double BpToPt = 72.27 / 72;
    private const string PathTransform = "scale(1.32835201328352 -1.32835201328352)";
    public static string Number(double value)
        => (Math.Abs(value) < .0000005 ? 0 : value).ToString("0.######", CultureInfo.InvariantCulture);
    private static string PathNumber(double value, Budget budget, Source source)
    {
        // A shorter decimal can recover the exact native dimension even when
        // it differs from its ideal real value. Keep precision for values
        // between scaled points, such as analytic curve coordinates.
        var scaled = value * 65536;
        var integer = Math.Round(scaled, MidpointRounding.AwayFromZero);
        if (Math.Abs(scaled - integer) <= 0.000001)
        {
            for (var places = 0; places <= 5; places++)
            {
                budget.Charge(source);
                var candidate = Math.Round(value, places, MidpointRounding.AwayFromZero);
                if (Math.Round(candidate * 65536, MidpointRounding.AwayFromZero) == integer)
                    return candidate.ToString("0.#####", CultureInfo.InvariantCulture);
            }
        }
        return (Math.Abs(value) < .0000000000005 ? 0 : value).ToString("0.############", CultureInfo.InvariantCulture);
    }
    public static string PathData(GraphicPath path, Budget budget, Source source)
    {
        var data = new StringBuilder();
        foreach (var segment in path.Segments)
        {
            budget.Charge(source);
            switch (segment.Kind)
            {
                case SegmentKind.Move: data.Append('M'); Point(segment.End); break;
                case SegmentKind.Line: data.Append('L'); Point(segment.End); break;
                case SegmentKind.Cubic: data.Append('C'); Point(segment.A); Point(segment.B); Point(segment.End); break;
                case SegmentKind.Close: data.Append('Z'); break;
                default: throw new InvalidOperationException();
            }
        }
        return data.ToString().TrimEnd();
        void Point(Geometry.Point point)
        {
            budget.Check(point.X, source); budget.Check(point.Y, source);
            data.Append(PathNumber(point.X * BpToPt, budget, source)).Append(' ').Append(PathNumber(point.Y * BpToPt, budget, source)).Append(' ');
            if (data.Length > budget.Limits.MaxOutputBytes) Budget.Fail(source, "SVG bytes");
        }
    }
    public static string Write(GraphicsScene scene, string sourceText, TikzOptions options, Budget budget)
    {
        var source = new Source(sourceText, 0, 0);
        var prefix = options.IdPrefix.Length > 0 ? options.IdPrefix
            : "t" + Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(sourceText)))[..16];
        var box = scene.PictureBounds.Union(scene.InkBounds).Pixels;
        var minX = box.IsEmpty ? 0 : box.MinX - options.PaddingPixels;
        var minY = box.IsEmpty ? 0 : box.MinY - options.PaddingPixels;
        var width = Math.Max(.000001, box.Width + options.PaddingPixels * 2);
        var height = Math.Max(.000001, box.Height + options.PaddingPixels * 2);
        if (box.IsEmpty) { width = 1; height = 1; }
        budget.Check(width * 3 / 4, source); budget.Check(height * 3 / 4, source);
        using var output = new LimitedWriter(budget, source);
        using (var writer = XmlWriter.Create(output, new() { OmitXmlDeclaration = true, Indent = false, CloseOutput = false }))
        {
            writer.WriteStartElement("svg", Namespace);
            writer.WriteAttributeString("width", Number(width) + "px");
            writer.WriteAttributeString("height", Number(height) + "px");
            writer.WriteAttributeString("viewBox", $"{Number(minX)} {Number(minY)} {Number(width)} {Number(height)}");
            if (scene.Clips.Count > 0 || scene.Outlines.Count > 0)
            {
                writer.WriteStartElement("defs");
                for (var i = 0; i < scene.Clips.Count; i++)
                {
                    var clip = scene.Clips[i];
                    writer.WriteStartElement("clipPath");
                    writer.WriteAttributeString("id", $"{prefix}-c{i}");
                    writer.WriteAttributeString("clipPathUnits", "userSpaceOnUse");
                    writer.WriteStartElement("path");
                    writer.WriteAttributeString("transform", PathTransform);
                    writer.WriteAttributeString("d", PathData(clip.Path, budget, source));
                    writer.WriteAttributeString("clip-rule", clip.FillRule);
                    writer.WriteEndElement(); writer.WriteEndElement();
                }
                for (var i = 0; i < scene.Outlines.Count; i++)
                {
                    var outline = scene.Outlines[i];
                    writer.WriteStartElement("path");
                    writer.WriteAttributeString("id", $"{prefix}-f{i}");
                    writer.WriteAttributeString("d", outline.PathBp);
                    writer.WriteEndElement();
                }
                writer.WriteEndElement();
            }
            var pathIndex = 0;
            var glyphIndex = 0;
            foreach (var drawable in scene.Drawables)
            {
                budget.Charge(drawable.Source);
                foreach (var clip in drawable.Clips)
                {
                    if (clip < 0 || clip >= scene.Clips.Count) throw new InvalidOperationException("Invalid scene clip reference.");
                    writer.WriteStartElement("g"); writer.WriteAttributeString("clip-path", $"url(#{prefix}-c{clip})");
                }
                if (drawable is PaintedGlyphRun run)
                {
                    writer.WriteStartElement("g");
                    writer.WriteAttributeString("id", $"{prefix}-n{run.NodeId}");
                    writer.WriteAttributeString("fill", run.Color.Svg);
                    writer.WriteAttributeString("fill-opacity", Number(run.Opacity));
                    writer.WriteAttributeString("stroke", "none");
                    writer.WriteStartElement("title"); writer.WriteString(run.Readable); writer.WriteEndElement();
                    foreach (var glyph in run.Glyphs)
                    {
                        budget.Charge(glyph.Placement.Source);
                        var t = glyph.Transform;
                        writer.WriteStartElement("use");
                        writer.WriteAttributeString("id", $"{prefix}-g{glyphIndex++}");
                        writer.WriteAttributeString("href", $"#{prefix}-f{glyph.Outline}");
                        writer.WriteAttributeString("transform", $"matrix({Number(t.A * 4 / 3)} {Number(-t.B * 4 / 3)} {Number(t.C * 4 / 3)} {Number(-t.D * 4 / 3)} {Number(t.E * 4 / 3)} {Number(-t.F * 4 / 3)})");
                        writer.WriteEndElement();
                    }
                    writer.WriteEndElement();
                    foreach (var _ in drawable.Clips) writer.WriteEndElement();
                    continue;
                }
                var path = (PaintedPath)drawable;
                writer.WriteStartElement("path");
                writer.WriteAttributeString("id", $"{prefix}-p{pathIndex++}");
                writer.WriteAttributeString("transform", PathTransform);
                writer.WriteAttributeString("d", PathData(path.Path, budget, path.Source));
                var paint = path.Paint;
                writer.WriteAttributeString("fill", paint.Fill ? paint.FillColor.PgfSvg : "none");
                writer.WriteAttributeString("stroke", paint.Stroke ? paint.StrokeColor.PgfSvg : "none");
                if (paint.Fill) { writer.WriteAttributeString("fill-rule", paint.FillRule); writer.WriteAttributeString("fill-opacity", Number(paint.FillOpacity)); }
                if (paint.Stroke)
                {
                    writer.WriteAttributeString("stroke-width", PathNumber(paint.Width * BpToPt, budget, path.Source));
                    writer.WriteAttributeString("stroke-opacity", Number(paint.StrokeOpacity));
                    writer.WriteAttributeString("stroke-linecap", paint.Cap);
                    writer.WriteAttributeString("stroke-linejoin", paint.Join);
                    writer.WriteAttributeString("stroke-miterlimit", Number(paint.Miter));
                    if (paint.Dash.Length > 0)
                    {
                        writer.WriteAttributeString("stroke-dasharray", string.Join(' ', paint.Dash.Select(d => PathNumber(d * BpToPt, budget, path.Source))));
                        writer.WriteAttributeString("stroke-dashoffset", PathNumber(paint.DashPhase * BpToPt, budget, path.Source));
                    }
                }
                writer.WriteEndElement();
                foreach (var _ in path.Clips) writer.WriteEndElement();
            }
            writer.WriteEndElement();
        }
        return output.ToString();
    }

    private sealed class LimitedWriter(Budget budget, Source source) : TextWriter
    {
        private readonly StringBuilder _text = new();
        private readonly Encoder _encoder = new UTF8Encoding(false, true).GetEncoder();
        private long _bytes;
        public override Encoding Encoding => Encoding.UTF8;
        public override void Write(char value) => Write(value.ToString());
        public override void Write(char[] buffer, int index, int count) => Write(buffer.AsSpan(index, count));
        public override void Write(string? value) { if (value is not null) Write(value.AsSpan()); }
        public override void Write(ReadOnlySpan<char> buffer)
        {
            budget.Charge(source, buffer.Length);
            Span<byte> encoded = stackalloc byte[1024];
            var remaining = buffer;
            while (!remaining.IsEmpty)
            {
                _encoder.Convert(remaining, encoded, false, out var chars, out var bytes, out _);
                Count(bytes);
                remaining = remaining[chars..];
            }
            _text.Append(buffer);
        }
        private void Count(int bytes)
        {
            if (bytes > budget.Limits.MaxOutputBytes - _bytes) Budget.Fail(source, "SVG bytes");
            _bytes += bytes;
        }
        public override string ToString()
        {
            Span<byte> final = stackalloc byte[4];
            _encoder.Convert(ReadOnlySpan<char>.Empty, final, true, out _, out var bytes, out _);
            Count(bytes);
            return _text.ToString();
        }
    }
}

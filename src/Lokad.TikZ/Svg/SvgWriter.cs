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
    public static string Number(double value)
        => (Math.Abs(value) < .0000005 ? 0 : value).ToString("0.######", CultureInfo.InvariantCulture);
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
            data.Append(Number(point.X * 4 / 3)).Append(' ').Append(Number(-point.Y * 4 / 3)).Append(' ');
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
            if (scene.Clips.Count > 0)
            {
                writer.WriteStartElement("defs");
                for (var i = 0; i < scene.Clips.Count; i++)
                {
                    var clip = scene.Clips[i];
                    writer.WriteStartElement("clipPath");
                    writer.WriteAttributeString("id", $"{prefix}-c{i}");
                    writer.WriteAttributeString("clipPathUnits", "userSpaceOnUse");
                    writer.WriteStartElement("path");
                    writer.WriteAttributeString("d", PathData(clip.Path, budget, source));
                    writer.WriteAttributeString("clip-rule", clip.FillRule);
                    writer.WriteEndElement(); writer.WriteEndElement();
                }
                writer.WriteEndElement();
            }
            for (var i = 0; i < scene.Paths.Count; i++)
            {
                var path = scene.Paths[i];
                budget.Charge(path.Source);
                foreach (var clip in path.Clips)
                {
                    if (clip < 0 || clip >= scene.Clips.Count) throw new InvalidOperationException("Invalid scene clip reference.");
                    writer.WriteStartElement("g"); writer.WriteAttributeString("clip-path", $"url(#{prefix}-c{clip})");
                }
                writer.WriteStartElement("path");
                writer.WriteAttributeString("id", $"{prefix}-p{i}");
                writer.WriteAttributeString("d", PathData(path.Path, budget, path.Source));
                var paint = path.Paint;
                writer.WriteAttributeString("fill", paint.Fill ? paint.FillColor.Svg : "none");
                writer.WriteAttributeString("stroke", paint.Stroke ? paint.StrokeColor.Svg : "none");
                if (paint.Fill) { writer.WriteAttributeString("fill-rule", paint.FillRule); writer.WriteAttributeString("fill-opacity", Number(paint.FillOpacity)); }
                if (paint.Stroke)
                {
                    writer.WriteAttributeString("stroke-width", Number(paint.Width * 4 / 3));
                    writer.WriteAttributeString("stroke-opacity", Number(paint.StrokeOpacity));
                    writer.WriteAttributeString("stroke-linecap", paint.Cap);
                    writer.WriteAttributeString("stroke-linejoin", paint.Join);
                    writer.WriteAttributeString("stroke-miterlimit", Number(paint.Miter));
                    if (paint.Dash.Length > 0)
                    {
                        writer.WriteAttributeString("stroke-dasharray", string.Join(' ', paint.Dash.Select(d => Number(d * 4 / 3))));
                        writer.WriteAttributeString("stroke-dashoffset", Number(paint.DashPhase * 4 / 3));
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
        public override Encoding Encoding => Encoding.UTF8;
        public override void Write(char value) => Write(value.ToString());
        public override void Write(char[] buffer, int index, int count) => Write(buffer.AsSpan(index, count));
        public override void Write(string? value) { if (value is not null) Write(value.AsSpan()); }
        public override void Write(ReadOnlySpan<char> buffer)
        {
            budget.Charge(source, buffer.Length);
            if (buffer.Length > budget.Limits.MaxOutputBytes - _text.Length) Budget.Fail(source, "SVG bytes");
            _text.Append(buffer);
        }
        public override string ToString() => _text.ToString();
    }
}

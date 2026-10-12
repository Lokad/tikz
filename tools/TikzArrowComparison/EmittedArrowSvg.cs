using System.Globalization;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using Lokad.TikZ;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Semantics;

namespace TikzArrowComparison;

// Decode the actually returned XML independently of the production SVG writer.
// The trace supplies provenance and nonserialized tip setup records only.
internal static class EmittedArrowSvg
{
    private const string Number = @"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?";
    public static GraphicsScene Read(string svg, GraphicsScene trace)
    {
        using var reader = XmlReader.Create(new StringReader(svg), new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = 1000000 });
        var document = XDocument.Load(reader);
        var root = document.Root ?? throw new InvalidDataException("Missing SVG root.");
        var box = trace.PictureBounds.Union(trace.InkBounds).Pixels;
        var view = (root.Attribute("viewBox")?.Value ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(D).ToArray();
        var expected = new[] { box.MinX, box.MinY, Math.Max(.000001, box.Width), Math.Max(.000001, box.Height) };
        if (root.Name.LocalName != "svg" || view.Length != 4 || view.Where((v, i) => Math.Abs(v - expected[i]) > .000000500001).Any()
            || root.Attribute("width")?.Value is not { } width || !width.EndsWith("px", StringComparison.Ordinal)
            || root.Attribute("height")?.Value is not { } height || !height.EndsWith("px", StringComparison.Ordinal)
            || Math.Abs(D(width[..^2]) - expected[2]) > .000000500001 || Math.Abs(D(height[..^2]) - expected[3]) > .000000500001)
            throw new InvalidDataException("Public root dimensions disagree with returned picture/ink bounds.");
        var allPaths = document.Descendants().Where(p => p.Name.LocalName == "path" && !p.Ancestors().Any(a => a.Name.LocalName == "defs")).ToArray();
        if (allPaths.Length != trace.Paths.Count) throw new InvalidDataException("Returned SVG paint count differs from its trace.");
        var scene = new GraphicsScene { PictureBounds = trace.PictureBounds, InkBounds = trace.InkBounds };
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        for (var i = 0; i < allPaths.Length; i++)
        {
            var element = allPaths[i]; var original = trace.Paths[i]; var source = original.Source;
            var transformText = element.Attribute("transform")?.Value ?? "";
            var match = Regex.Match(transformText, "^scale\\((" + Number + ") (" + Number + ")\\)(?: matrix\\((" + Number + ") (" + Number + ") (" + Number + ") (" + Number + ") (" + Number + ") (" + Number + ")\\))?$");
            if (!match.Success || Math.Abs(D(match.Groups[1].Value) - 96 / 72.27) > 1e-14 || Math.Abs(D(match.Groups[2].Value) + 96 / 72.27) > 1e-14)
                throw new InvalidDataException("Invalid public path unit transform.");
            var transform = match.Groups[3].Success ? new Affine(D(match.Groups[3].Value), D(match.Groups[4].Value),
                D(match.Groups[5].Value), D(match.Groups[6].Value), Bp(match.Groups[7].Value), Bp(match.Groups[8].Value)) : Affine.Identity;
            var path = Path(element, budget, source);
            var paint = original.Paint with { Stroke = Attr("stroke") != "none", Fill = Attr("fill") != "none",
                Dash = [], DashPhase = 0 };
            if (paint.Stroke) paint = paint with {
                Width = Bp(Attr("stroke-width")), StrokeColor = Rgb(Attr("stroke")), StrokeOpacity = D(Attr("stroke-opacity")),
                Cap = Attr("stroke-linecap"), Join = Attr("stroke-linejoin"), Miter = D(Attr("stroke-miterlimit")),
                Dash = element.Attribute("stroke-dasharray")?.Value.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(Bp).ToArray() ?? [],
                DashPhase = Bp(element.Attribute("stroke-dashoffset")?.Value ?? "0")
            };
            if (paint.Fill) paint = paint with { FillColor = Rgb(Attr("fill")), FillOpacity = D(Attr("fill-opacity")), FillRule = Attr("fill-rule") };
            var clips = element.Ancestors().Where(a => a.Attribute("clip-path") is not null).Reverse()
                .Select(a => a.Attribute("clip-path")!.Value).Select(c => {
                    var m = Regex.Match(c, @"^url\(#candidate-c(\d+)\)$");
                    return m.Success ? int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture) : throw new InvalidDataException("Invalid public clip reference.");
                }).ToArray();
            scene.Add(new PaintedPath(path, paint, clips, original.Source, original.InkBounds) { Transform = transform,
                Arrow = original.Arrow is null ? null : original.Arrow with { Transform = transform, Template = original.Arrow.Template with { Path = path, Paint = paint } } });
            string Attr(string name) => element.Attribute(name)?.Value ?? throw new InvalidDataException("Missing public attribute: " + name);
        }
        var clipPaths = document.Descendants().Where(p => p.Name.LocalName == "clipPath").ToArray();
        if (clipPaths.Length != trace.Clips.Count) throw new InvalidDataException("Invalid public clip count.");
        for (var i = 0; i < clipPaths.Length; i++)
        {
            var path = clipPaths[i].Elements().Single(p => p.Name.LocalName == "path");
            if (path.Attribute("transform")?.Value != "scale(1.32835201328352 -1.32835201328352)")
                throw new InvalidDataException("Invalid public clip units.");
            var geometry = Path(path, budget, trace.Clips[i].Source);
            scene.Clips.Add(new(geometry, path.Attribute("clip-rule")?.Value ?? "", trace.Clips[i].Source, geometry.Bounds));
        }
        return scene;
    }

    private static GraphicPath Path(XElement element, Budget budget, Source source)
    {
        var data = element.Attribute("d")?.Value ?? throw new InvalidDataException("Missing public path.");
        var tokens = Regex.Matches(data, "[MLCZ]|" + Number).Select(m => m.Value).ToArray();
        if (string.Concat(tokens) != Regex.Replace(data, @"[\s,]+", "")) throw new InvalidDataException("Unsupported public path syntax.");
        var path = new GraphicPath(budget, source); var index = 0;
        Point Point()
        {
            if (index + 1 >= tokens.Length) throw new InvalidDataException("Incomplete public point.");
            return new(Bp(tokens[index++]), Bp(tokens[index++]));
        }
        while (index < tokens.Length)
            switch (tokens[index++])
            {
                case "M": path.Move(Point()); break;
                case "L": path.Line(Point()); break;
                case "C": var a = Point(); var b = Point(); path.Cubic(a, b, Point()); break;
                case "Z": path.Close(); break;
                default: throw new InvalidDataException("Unsupported public path command.");
            }
        return path;
    }
    private static double D(string text)
    {
        var value = double.Parse(text, CultureInfo.InvariantCulture);
        return double.IsFinite(value) ? value : throw new InvalidDataException("Non-finite public SVG value.");
    }
    // Recover the native integer grid from the public decimal operands.
    // Raw SVG bytes and independent pixel qualification remain separate.
    private static double Bp(string text)
        => Math.Round(D(text) * 65536, MidpointRounding.AwayFromZero) / NativeArrowComparison.SpPerBp;
    private static Color Rgb(string value)
    {
        if (!Regex.IsMatch(value, "^#[0-9a-fA-F]{6}$")) throw new InvalidDataException("Unsupported public SVG color.");
        var n = int.Parse(value.AsSpan(1), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
        return new((n >> 16) / 255.0, ((n >> 8) & 255) / 255.0, (n & 255) / 255.0);
    }
}

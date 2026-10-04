using System.Text.RegularExpressions;
using System.Xml.Linq;

internal static partial class ReferenceTool
{
    private static ReferenceMetrics Measurements(string log, string pdfLog, string svgFile, ReferenceCase definition)
    {
        var bounds = Match(log, @"LOKAD-BOUNDS minx=([-\d.]+)pt; miny=([-\d.]+)pt; maxx=([-\d.]+)pt; maxy=([-\d.]+)pt");
        var anchors = Regex.Matches(log, @"LOKAD-ANCHOR-([a-z0-9-]+) x=([-\d.]+)pt; y=([-\d.]+)pt")
            .ToDictionary(m => m.Groups[1].Value, m => new XY(Parse(m.Groups[2].Value), Parse(m.Groups[3].Value)));
        if (!anchors.Keys.Order(StringComparer.Ordinal).SequenceEqual(definition.AnchorNames.Order(StringComparer.Ordinal)))
            throw new InvalidOperationException("Incomplete independent anchor measurements.");
        var svg = XDocument.Load(svgFile);
        var originGroup = svg.Descendants().FirstOrDefault(e => e.Name.LocalName == "g" && (e.Attribute("transform")?.Value ?? "").StartsWith("translate(", StringComparison.Ordinal))
            ?? throw new InvalidOperationException("Primary SVG driver origin transform missing.");
        var origin = Match(originGroup.Attribute("transform")!.Value, @"^translate\(([-\d.]+),([-\d.]+)\)scale\(([-\d.]+),([-\d.]+)\)$");
        if (Math.Abs(origin[2] - 72 / 72.27) > 0.000001 || Math.Abs(origin[3] + 72 / 72.27) > 0.000001)
            throw new InvalidOperationException("Unexpected primary driver physical transform.");
        var paints = svg.Descendants().Where(e => e.Name.LocalName == "path" && !e.Ancestors().Any(a => a.Name.LocalName is "defs" or "clipPath")).ToArray();
        var clipElements = svg.Descendants().Where(e => e.Name.LocalName == "clipPath").Select(e => e.Descendants().Single(p => p.Name.LocalName == "path")).ToArray();
        var paths = new List<ReferencePath>();
        var clips = new List<ReferencePath>();
        foreach (Match record in Regex.Matches(log, @"LOKAD-PATH-BEGIN(.*?)LOKAD-PATH-END", RegexOptions.Singleline))
        {
            var text = Regex.Replace(record.Groups[1].Value, @"\s+", "");
            var header = Regex.Match(text, @"^actions=([^;]*);width=([-\d.]+)ptLOKAD-SOFTPATHmacro:->(.*)$");
            if (!header.Success) throw new InvalidOperationException("Invalid independent soft-path probe record.");
            var actions = header.Groups[1].Value.Split(',', StringSplitOptions.RemoveEmptyEntries);
            var stroke = actions.Contains("draw") || actions.Contains("stroke");
            var fill = actions.Contains("fill");
            var clip = actions.Contains("clip");
            if (!stroke && !fill && !clip) continue;
            var segments = SoftPath(header.Groups[3].Value);
            var element = stroke || fill ? paints.ElementAtOrDefault(paths.Count) : clipElements.ElementAtOrDefault(clips.Count);
            if (element is null) throw new InvalidOperationException("Independent path probe and SVG operation counts disagree.");
            var paint = ReadPaint(element, segments, Parse(header.Groups[2].Value), stroke, fill);
            if (stroke || fill) paths.Add(paint);
            if (clip) clips.Add(paint);
        }
        if (paints.Length != paths.Count || clipElements.Length != clips.Count || paths.Count == 0)
            throw new InvalidOperationException("Independent soft-path measurements are incomplete.");
        var page = Match(pdfLog, @"LOKAD-PAGE-ORIGIN xsp=(\d+); ysp=(\d+); pageheight=([-\d.]+)pt");
        var box = Box(log);
        var first = paths.FirstOrDefault(p => p.Stroke) ?? paths[0];
        return new(2, "Independent PGF bounds, anchors, soft-path coordinates and widths in TeX pt; paint from the pinned SVG driver; SVG translation in bp; PDF registration from shipped-out positions",
            new(bounds[0], bounds[1], bounds[2], bounds[3]), box, anchors, new(origin[0], origin[1]),
            new((page[0] / 65536 - bounds[0]) * PtToPixels, (page[2] - page[1] / 65536 + bounds[1] + box.Depth) * PtToPixels),
            new(first.WidthPt, first.StrokeColor, first.StrokeOpacity), [.. paths], [.. clips]);
    }

    private static ReferencePath ReadPaint(XElement element, ReferenceSegment[] segments, double width, bool stroke, bool fill)
    {
        string Attribute(string name, string fallback) => element.AncestorsAndSelf().Select(e => e.Attribute(name)?.Value).FirstOrDefault(v => v is not null) ?? fallback;
        string Color(string name)
        {
            var value = Attribute(name, "#000");
            if (value == "none") return "none";
            if (Regex.IsMatch(value, "^#[0-9a-fA-F]{3}$")) value = "#" + string.Concat(value[1..].Select(c => new string(c, 2)));
            if (!Regex.IsMatch(value, "^#[0-9a-fA-F]{6}$")) throw new InvalidOperationException("Unsupported reference color syntax.");
            return value.ToLowerInvariant();
        }
        var dashes = Attribute("stroke-dasharray", "none");
        return new(segments, stroke, fill, width, Color("stroke"), Color("fill"), Parse(Attribute("stroke-opacity", "1")), Parse(Attribute("fill-opacity", "1")),
            Attribute("stroke-linecap", "butt"), Attribute("stroke-linejoin", "miter"), Attribute("fill-rule", Attribute("clip-rule", "nonzero")),
            dashes == "none" ? [] : dashes.Split([',', ' '], StringSplitOptions.RemoveEmptyEntries).Select(Parse).ToArray(), Parse(Attribute("stroke-dashoffset", "0")));
    }

    private static ReferenceSegment[] SoftPath(string text)
    {
        var result = new List<ReferenceSegment>();
        var zero = new XY(0, 0);
        var start = zero;
        var control1 = zero;
        var control2 = zero;
        var rectangle = zero;
        var matches = Regex.Matches(text, @"\\pgfsyssoftpath@([a-z]+)token\{([-\d.]+)pt\}\{([-\d.]+)pt\}");
        if (string.Concat(matches.Select(m => m.Value)) != text) throw new InvalidOperationException("Unsupported independent soft-path vocabulary: " + text);
        foreach (Match match in matches)
        {
            var point = new XY(Parse(match.Groups[2].Value), Parse(match.Groups[3].Value));
            switch (match.Groups[1].Value)
            {
                case "moveto": start = point; result.Add(new("Move", point, zero, zero)); break;
                case "lineto": result.Add(new("Line", point, zero, zero)); break;
                case "curvetosupporta": control1 = point; break;
                case "curvetosupportb": control2 = point; break;
                case "curveto": result.Add(new("Cubic", point, control1, control2)); break;
                case "closepath": result.Add(new("Close", start, zero, zero)); break;
                case "rectcorner": rectangle = point; start = point; result.Add(new("Move", point, zero, zero)); break;
                case "rectsize":
                    result.Add(new("Line", new(rectangle.X + point.X, rectangle.Y), zero, zero));
                    result.Add(new("Line", new(rectangle.X + point.X, rectangle.Y + point.Y), zero, zero));
                    result.Add(new("Line", new(rectangle.X, rectangle.Y + point.Y), zero, zero));
                    result.Add(new("Close", rectangle, zero, zero));
                    break;
                default: throw new InvalidOperationException("Unknown independent soft-path token.");
            }
        }
        return NormalizeSegments(result);
    }

    // PGF can leave redundant moves around shapes. They do not paint anything;
    // retain every line/curve/close and the move that begins each painted subpath.
    private static ReferenceSegment[] NormalizeSegments(IEnumerable<ReferenceSegment> segments)
    {
        var result = new List<ReferenceSegment>();
        foreach (var segment in segments)
        {
            if (segment.Kind == "Move" && result.Count > 0 && result[^1].Kind == "Move") result.RemoveAt(result.Count - 1);
            result.Add(segment);
        }
        if (result.Count > 0 && result[^1].Kind == "Move") result.RemoveAt(result.Count - 1);
        return [.. result];
    }
}

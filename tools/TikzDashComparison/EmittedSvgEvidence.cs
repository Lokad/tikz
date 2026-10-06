using System.Globalization;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using TikzDashGeometryReference;

internal sealed record EmittedSvgEvidence(NativeSegment[] Segments, int WidthSp, int[] DashSp, int PhaseSp, double ScaleX, double ScaleY)
{
    internal static EmittedSvgEvidence Read(XElement path)
    {
        if (path.Name.LocalName != "path" || path.Ancestors().Any(p => p.Attribute("transform") is not null))
            throw new InvalidDataException("Unexpected emitted path hierarchy.");
        const string number = @"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?";
        static double D(string value)
        {
            var n = double.Parse(value, CultureInfo.InvariantCulture);
            return double.IsFinite(n) ? n : throw new InvalidDataException("Non-finite SVG quantity.");
        }
        static int Sp(string value)
        {
            var n = Math.Round(D(value) * 65536, MidpointRounding.AwayFromZero);
            return n is >= int.MinValue and <= int.MaxValue ? (int)n : throw new InvalidDataException("SVG dimension exceeds the native grid.");
        }
        var transform = Regex.Match(path.Attribute("transform")?.Value ?? "", "^scale\\((" + number + ") (" + number + ")\\)$");
        if (!transform.Success) throw new InvalidDataException("Missing or unsupported emitted path transform.");
        var data = path.Attribute("d")?.Value ?? throw new InvalidDataException("Missing emitted path data.");
        var tokens = Regex.Matches(data, "[MLCZ]|" + number).Select(m => m.Value).ToArray();
        if (string.Concat(tokens) != Regex.Replace(data, @"[\s,]+", "") || tokens.Length == 0)
            throw new InvalidDataException("Unsupported emitted path vocabulary.");
        var segments = new List<NativeSegment>(); var cursor = 0; var start = new NativePoint(); var moved = false;
        NativePoint Point()
        {
            if (cursor + 1 >= tokens.Length || char.IsAsciiLetter(tokens[cursor][0]) || char.IsAsciiLetter(tokens[cursor + 1][0]))
                throw new InvalidDataException("Incomplete emitted point.");
            return new(Sp(tokens[cursor++]), Sp(tokens[cursor++]));
        }
        while (cursor < tokens.Length)
        {
            var command = tokens[cursor++];
            if (command != "M" && !moved) throw new InvalidDataException("Emitted path lacks an initial move.");
            switch (command)
            {
                case "M": start = Point(); moved = true; segments.Add(new("Move", start, default, default)); break;
                case "L": segments.Add(new("Line", Point(), default, default)); break;
                case "C": var a = Point(); var b = Point(); segments.Add(new("Cubic", Point(), a, b)); break;
                case "Z": segments.Add(new("Close", start, default, default)); break;
                default: throw new InvalidDataException("Unsupported emitted command.");
            }
        }
        var dash = path.Attribute("stroke-dasharray")?.Value;
        var items = dash is null ? [] : dash.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(Sp).ToArray();
        if (items.Any(n => n < 0) || dash is not null && (items.Length == 0 || items.All(n => n == 0)))
            throw new InvalidDataException("Invalid emitted dash pattern.");
        var width = path.Attribute("stroke-width")?.Value;
        if (path.Attribute("stroke")?.Value is { } stroke && stroke != "none" && width is null)
            throw new InvalidDataException("Missing emitted stroke width.");
        var widthSp = width is null ? 0 : Sp(width);
        if (widthSp < 0) throw new InvalidDataException("Negative emitted width.");
        return new(DashGeometryEvidence.Normalize(segments), widthSp, items, Sp(path.Attribute("stroke-dashoffset")?.Value ?? "0"),
            D(transform.Groups[1].Value), D(transform.Groups[2].Value));
    }
}

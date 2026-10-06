using System.Globalization;
using Lokad.TikZ.Frontend;

namespace Lokad.TikZ.Semantics;

internal readonly record struct Color(double R, double G, double B)
{
    public string Svg => $"#{Byte(R):x2}{Byte(G):x2}{Byte(B):x2}";
    // PGF's SVG path backend reads each component into a 65536-sp dimension,
    // then divides the integer by 256. Text color specials use conventional
    // 8-bit RGB rounding instead. Preserve that measured distinction.
    public string PgfSvg => $"#{PgfByte(R):x2}{PgfByte(G):x2}{PgfByte(B):x2}";
    private static int Byte(double value) => (int)Math.Round(Math.Clamp(value, 0, 1) * 255, MidpointRounding.AwayFromZero);
    private static int PgfByte(double value) => Math.Min(255, (int)Math.Round(Math.Clamp(value, 0, 1) * 65536, MidpointRounding.AwayFromZero) / 256);
    public static Color Parse(Source source, Budget budget)
    {
        budget.Charge(source, source.Length);
        var parts = Options.Clean(source).Split('!');
        var color = Named(parts[0], source);
        for (var i = 1; i < parts.Length; i += 2)
        {
            if (!double.TryParse(parts[i], NumberStyles.Float, CultureInfo.InvariantCulture, out var percent) || !double.IsFinite(percent) || percent is < 0 or > 100)
                throw new CompileError("TIKZ001", "Expected a color percentage from 0 to 100.", source);
            var other = i + 1 < parts.Length ? Named(parts[i + 1], source) : new Color(1, 1, 1);
            var t = percent / 100;
            color = new(color.R * t + other.R * (1 - t), color.G * t + other.G * (1 - t), color.B * t + other.B * (1 - t));
        }
        return color;
    }
    public static bool IsName(string name) => name is "black" or "white" or "red" or "green" or "blue" or "cyan" or "magenta" or "yellow" or "gray" or "darkgray" or "lightgray" or "orange" or "violet" or "purple" or "brown" or "pink" or "lime" or "olive" or "teal";
    private static Color Named(string name, Source source) => name switch
    {
        "black" => new(0, 0, 0), "white" => new(1, 1, 1), "red" => new(1, 0, 0), "green" => new(0, 1, 0),
        "blue" => new(0, 0, 1), "cyan" => new(0, 1, 1), "magenta" => new(1, 0, 1), "yellow" => new(1, 1, 0),
        "gray" => new(.5, .5, .5), "darkgray" => new(.25, .25, .25), "lightgray" => new(.75, .75, .75),
        "orange" => new(1, .5, 0), "violet" => new(.5, 0, .5), "purple" => new(.75, 0, .25),
        "brown" => new(.75, .5, .25), "pink" => new(1, .75, .75), "lime" => new(.75, 1, 0),
        "olive" => new(.5, .5, 0), "teal" => new(0, .5, .5),
        _ => throw new CompileError("TIKZ002", $"Unsupported color '{name}'.", source)
    };
}

internal sealed record Paint
{
    public bool Stroke { get; init; }
    public bool Fill { get; init; }
    public Color StrokeColor { get; init; } = new(0, 0, 0);
    public Color FillColor { get; init; } = new(0, 0, 0);
    // PGF's default .4pt is stored in a TeX dimension register as 26214 sp.
    public double Width { get; init; } = 26214 * (72 / (72.27 * 65536));
    public double StrokeOpacity { get; init; } = 1;
    public double FillOpacity { get; init; } = 1;
    public string Cap { get; init; } = "butt";
    public string Join { get; init; } = "miter";
    public double Miter { get; init; } = 10;
    public double[] Dash { get; init; } = [];
    public double DashPhase { get; init; }
    public string FillRule { get; init; } = "nonzero";
}

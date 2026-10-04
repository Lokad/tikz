using System.Reflection;
using System.Text.Json;

namespace Lokad.TikZ.Text;

// Generated data, not an installed font. No font discovery or native shaper is used.
internal sealed record FontData(int SchemaVersion, string Id, string License,
    int DesignSizeFix, uint Checksum, int[] ParametersFix, FontGlyph[] Glyphs, FontPair[] Pairs)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    internal static FontData Load(string id)
    {
        if (id is not ("regular-10" or "bold-10" or "italic-10" or "regular-12" or "bold-12" or "italic-12"))
            throw new ArgumentException("Unknown bundled font face.", nameof(id));
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(
            $"Lokad.TikZ.Resources.Fonts.LokadTikzText-{id}.json")
            ?? throw new InvalidOperationException("Missing bundled font data.");
        var data = JsonSerializer.Deserialize<FontData>(stream, Json)
            ?? throw new InvalidOperationException("Invalid bundled font data.");
        if (data.SchemaVersion != 1 || data.Id != id || data.ParametersFix.Length < 7
            || data.Glyphs.Length != 256 || data.Glyphs.Where((g, i) => g.Slot != i).Any())
            throw new InvalidOperationException("Incompatible bundled font data.");
        return data;
    }

    // TFM loading truncates its byte products in a specified order. Multiplying a
    // floating-point em value and rounding differs from TeX by a scaled point.
    internal static int ScaleFix(int value, int sizeSp)
    {
        if (sizeSp is < 1 or >= 134217728) throw new ArgumentOutOfRangeException(nameof(sizeSp));
        var z = sizeSp;
        var alpha = 16;
        while (z >= 8388608) { z /= 2; alpha *= 2; }
        var beta = 256 / alpha;
        var bits = unchecked((uint)value);
        var sign = bits >> 24;
        if (sign is not (0 or 255)) throw new ArgumentOutOfRangeException(nameof(value));
        var b = (bits >> 16) & 255;
        var c = (bits >> 8) & 255;
        var d = bits & 255;
        var positive = (((long)d * z / 256 + c * z) / 256 + b * z) / beta;
        return checked((int)(positive - (sign == 255 ? (long)alpha * z : 0)));
    }
}

// Outlines use y-down bp coordinates at the font's design size, relative to the
// glyph baseline. Metrics remain signed TFM 12.20 values in em units.
internal sealed record FontGlyph(int Slot, string Name, int AdvanceFix, int HeightFix,
    int DepthFix, int ItalicFix, string PathBp);
internal sealed record FontPair(int Left, int Right, int? Ligature, int? KernFix);

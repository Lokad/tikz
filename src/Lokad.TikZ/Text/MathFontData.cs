using System.Reflection;
using System.Text.Json;

namespace Lokad.TikZ.Text;

// Generated outlines use the selected size, which can differ from TFM design size.
// The data are embedded; production never reads TFM or discovers installed fonts.
internal sealed record MathFontData(int SchemaVersion, string Id, string License,
    int SizeSp, int DesignSizeFix, uint Checksum, int LastSlot, int[] ParametersFix,
    FontGlyph[] Glyphs, FontPair[] Pairs, MathLargerGlyph[] LargerGlyphs,
    MathExtension[] Extensions, MathRecipe[] Recipes)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    internal static MathFontData Load(string id)
    {
        var fields = id.Split('-');
        if (fields.Length != 3 || fields[0] != "math" || !int.TryParse(fields[2],
                System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var size)
            || size is not (5 or 6 or 7 or 8 or 10 or 12)
            || fields[1] is not ("roman" or "italic" or "symbol" or "extension")
            || fields[1] == "extension" && size != 10 || fields[2] != size.ToString(System.Globalization.CultureInfo.InvariantCulture))
            throw new ArgumentException("Unknown bundled math font face.", nameof(id));
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(
            $"Lokad.TikZ.Resources.Fonts.LokadTikzMath-{id}.json")
            ?? throw new InvalidOperationException("Missing bundled math font data.");
        var data = JsonSerializer.Deserialize<MathFontData>(stream, Json)
            ?? throw new InvalidOperationException("Invalid bundled math font data.");
        var designSize = fields[1] == "symbol" && size == 12 ? 10 : size;
        var expectedGlyphs = fields[1] switch { "roman" => 256, "symbol" => 130, _ => 128 };
        var expectedParameters = fields[1] switch { "roman" => 21, "italic" => 6, "symbol" => 22, _ => 13 };
        if (data.SchemaVersion != 1 || data.Id != id || data.SizeSp != size * 65536
            || data.DesignSizeFix != designSize * 1048576 || data.ParametersFix.Length != expectedParameters
            || data.Glyphs.Length != expectedGlyphs || data.LastSlot is < 127 or > 255
            || !data.Glyphs.Select(g => g.Slot).SequenceEqual(data.Glyphs.Select(g => g.Slot).Distinct().Order())
            || data.Glyphs.Any(g => g.Slot < 0 || g.Slot > data.LastSlot || string.IsNullOrEmpty(g.PathBp)))
            throw new InvalidOperationException("Incompatible bundled math font data.");
        return data;
    }
}

internal sealed record MathLargerGlyph(int Slot, int Next);
internal sealed record MathExtension(int Slot, int Recipe);
internal sealed record MathRecipe(int Top, int Middle, int Bottom, int Repeat);

using System.Security.Cryptography;
using System.Text.Json;

namespace TikzShapeComparison;

// Native-only bridge between selected DVI faces, retained TFM bytes and the
// independent integer-width observations. Shared by tests and calibration.
internal static class NativeMathFaces
{
    internal static NativeMathLabelTrace.Face[] Read(string mathProfile, string textProfile, JsonElement observations,
        Func<string, bool, string> metrics, Func<string, byte[]> tfmBytes)
    {
        var observed = observations.GetProperty("fonts").EnumerateArray()
            .Select(f => (Name: f.GetProperty("name").GetString()!, Size: f.GetProperty("sizeSp").GetInt32())).ToHashSet();
        if (observed.Count is 0 or > 25) throw Invalid("Unexpected selected face count.");
        var result = new List<NativeMathLabelTrace.Face>();
        foreach (var (text, math, expected) in new[] {
            (mathProfile, true, "latin-modern-math-10-12-v1"), (textProfile, false, "latin-modern-ec-10-12-v1") })
        {
            using var profile = JsonDocument.Parse(text);
            if (profile.RootElement.GetProperty("schemaVersion").GetInt32() != 1 || profile.RootElement.GetProperty("id").GetString() != expected)
                throw Invalid("Unexpected font profile.");
            var inputs = profile.RootElement.GetProperty("inputs").EnumerateArray()
                .ToDictionary(i => i.GetProperty("name").GetString()!, i => i.GetProperty("sha256").GetString()!, StringComparer.Ordinal);
            foreach (var f in profile.RootElement.GetProperty("fonts").EnumerateArray())
            {
                var id = f.GetProperty("id").GetString()!;
                var tfm = f.GetProperty("tfm").GetString()!;
                var name = Path.GetFileNameWithoutExtension(tfm);
                var size = checked(f.GetProperty("sizePt").GetInt32() * 65536);
                if (!observed.Contains((name, size))) continue;
                if (Path.GetFileName(tfm) != tfm || !inputs.TryGetValue(tfm, out var hash)
                    || !observations.GetProperty("nativeFiles").TryGetProperty(tfm, out var retained) || retained.GetString() != hash)
                    throw Invalid("Missing or changed native TFM identity: " + tfm);
                var bytes = tfmBytes(tfm);
                if (Convert.ToHexStringLower(SHA256.HashData(bytes)) != hash) throw Invalid("Changed native TFM bytes: " + tfm);
                var driver = NativeGlyphTrace.Widths(bytes, size);
                using var measured = JsonDocument.Parse(metrics(id, math));
                if (measured.RootElement.GetProperty("schemaVersion").GetInt32() != 1
                    || measured.RootElement.GetProperty("font").GetString() != id || measured.RootElement.GetProperty("profile").GetString() != expected)
                    throw Invalid("Unexpected native integer-width observations.");
                var widths = measured.RootElement.GetProperty("glyphs").EnumerateArray()
                    .Select(g => g.EnumerateArray().Select(v => v.GetInt32()).ToArray())
                    .Where(row => row.Skip(1).Any(v => v != 0)).ToDictionary(row => row[0], row => row[1]);
                if (widths.Count is 0 or > 256 || widths.Keys.Any(s => s is < 0 or > 255)) throw Invalid("Invalid native glyph widths.");
                result.Add(new(id, name, size, widths) { DriverWidths = widths.Keys.ToDictionary(s => s, s => driver[s]) });
            }
        }
        if (!result.Select(f => (f.NativeName, f.SizeSp)).ToHashSet().SetEquals(observed)
            || result.Select(f => (f.NativeName, f.SizeSp)).Distinct().Count() != result.Count)
            throw Invalid("Native selected faces do not match pinned profiles.");
        return result.ToArray();
    }
    private static InvalidDataException Invalid(string message) => new("Native math faces: " + message);
}

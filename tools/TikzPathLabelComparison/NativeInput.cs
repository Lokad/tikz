using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using TikzShapeComparison;

namespace TikzPathLabelComparison;

// Shared native transport only: this file has no converter dependency.
internal sealed class NativeInput : IDisposable
{
    internal JsonDocument Report { get; }
    internal JsonDocument Metrics { get; }
    internal string Svg { get; }
    internal string Fixture { get; }
    internal string[] Ids { get; }
    internal NativeGlyphTrace.Evidence Glyphs { get; }
    private readonly string folder;

    internal NativeInput(string reference)
    {
        folder = Path.GetDirectoryName(reference)!;
        var bytes = File.ReadAllBytes(reference);
        if (bytes.Length > 16000000) throw new InvalidDataException("Native report exceeds its bound.");
        Report = JsonDocument.Parse(bytes);
        var r = Report.RootElement;
        if (r.GetProperty("role").GetString() != "path-label-native-reference" || !r.GetProperty("completed").GetBoolean()
            || r.GetProperty("converterInvoked").GetBoolean() || r.GetProperty("imageConformanceClaim").GetBoolean())
            throw new InvalidDataException("Expected completed independent native observations.");
        Fixture = r.GetProperty("definition").GetProperty("id").GetString()!;
        if (Fixture is not ("placement" or "interactions")) throw new InvalidDataException("Only fixed trusted fixtures are accepted.");
        Metrics = JsonDocument.Parse(Read("metrics.json"));
        Ids = Metrics.RootElement.GetProperty("nodes").EnumerateArray().Select(n => n.GetProperty("id").GetString()!).ToArray();
        Svg = Encoding.UTF8.GetString(Read("probed-reference.svg"));
        var fonts = r.GetProperty("artifacts").EnumerateObject().Where(a => a.Name.StartsWith("fonts/", StringComparison.Ordinal))
            .ToDictionary(a => Path.GetFileName(a.Name), a => Read(a.Name), StringComparer.Ordinal);
        Glyphs = NativeGlyphTrace.Read(Encoding.UTF8.GetString(Read("native-positions.log")),
            Encoding.UTF8.GetString(Read("source-captures/tools/TikzFontData/font-profile.json")), Ids, Svg, fonts);
    }

    private byte[] Read(string file)
    {
        if (Path.IsPathRooted(file) || file.Split('/', '\\').Any(p => p is ".." or "." or "")) throw new InvalidDataException("Invalid native artifact path.");
        var bytes = File.ReadAllBytes(Path.Combine(folder, file));
        if (bytes.Length > 100000000 || Convert.ToHexStringLower(SHA256.HashData(bytes)) != Report.RootElement.GetProperty("artifacts").GetProperty(file).GetString())
            throw new InvalidDataException("Native artifact changed: " + file);
        return bytes;
    }
    public void Dispose() { Metrics.Dispose(); Report.Dispose(); }
}

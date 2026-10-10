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
    internal JsonDocument? Arrows { get; }
    internal string Svg { get; }
    internal string Fixture { get; }
    internal bool IsDiagram { get; }
    internal string SourceFile => "tests/Fixtures/" + (Fixture == "coordinate-plot-contract" ? "Plotting" : Fixture == "style-contract" ? "Styles" : Fixture == "foreach-contract" ? "Foreach" : Fixture == "math-macro-contract" ? "MathMacros" : Fixture == "math-functions-contract" ? "MathFunctions" : IsDiagram ? "Diagrams" : "PathLabels") + "/" + Fixture + ".tikz";
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
        IsDiagram = r.GetProperty("role").GetString() is "diagram-native-reference" or "diagram-arrow-native-reference";
        if (r.GetProperty("role").GetString() is not ("path-label-native-reference" or "diagram-native-reference" or "diagram-arrow-native-reference") || !r.GetProperty("completed").GetBoolean()
            || r.GetProperty("converterInvoked").GetBoolean() || r.GetProperty("imageConformanceClaim").GetBoolean())
            throw new InvalidDataException("Expected completed independent native observations.");
        Fixture = r.GetProperty("definition").GetProperty("id").GetString()!;
        if (IsDiagram ? Fixture is not ("network-coordinate-plot" or "coordinate-plot-contract" or "flowchart-basic" or "network-bent" or "flowchart-transformed" or "flowchart-parameterized" or "flowchart-foreach" or "foreach-contract" or "style-contract" or "flowchart-math-macros" or "math-macro-contract" or "network-math-functions" or "math-functions-contract") : Fixture is not ("placement" or "interactions"))
            throw new InvalidDataException("Only fixed trusted fixtures are accepted.");
        Metrics = JsonDocument.Parse(Read("metrics.json"));
        if (r.GetProperty("role").GetString() == "diagram-arrow-native-reference") Arrows = JsonDocument.Parse(Read("arrow-metrics.json"));
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
    public void Dispose() { Arrows?.Dispose(); Metrics.Dispose(); Report.Dispose(); }
}

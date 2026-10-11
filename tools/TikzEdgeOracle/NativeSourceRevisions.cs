using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

// The frozen snapshot keeps its original provenance. Only these reviewed tool
// revisions may differ; fixtures, wrappers and native assets still match exactly.
internal static class NativeSourceRevisions
{
    internal const string FileName = "tools/TikzVisual/edge-native-source-revisions.json";
    private const string Digest = "db55ed1a5bb36c6ffac59d7da51c01e88b00b5515bf2ee278b6c0ced9e9db972";

    internal static Dictionary<string, (string Historical, string Current)> Read(string root)
    {
        var bytes = File.ReadAllBytes(Path.Combine(root, FileName));
        if (bytes.Length > 8192) throw new InvalidDataException("Native source revisions exceed their bound.");
        bytes = Encoding.UTF8.GetBytes(Encoding.UTF8.GetString(bytes).Replace("\r\n", "\n", StringComparison.Ordinal));
        if (Convert.ToHexStringLower(SHA256.HashData(bytes)) != Digest)
            throw new InvalidDataException("Unreviewed native source revisions.");
        using var document = JsonDocument.Parse(bytes);
        return document.RootElement.GetProperty("sources").EnumerateObject().ToDictionary(
            p => p.Name, p => (p.Value.GetProperty("historical").GetString()!, p.Value.GetProperty("current").GetString()!), StringComparer.Ordinal);
    }

    internal static bool Matches(IReadOnlyDictionary<string, (string Historical, string Current)> revisions,
        string file, string historical, string current) => revisions.TryGetValue(file, out var revision)
            ? historical == revision.Historical && current == revision.Current
            : historical == current;
}

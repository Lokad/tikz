using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using Lokad.TikZ;

namespace TikzAdversarial;

internal static class Checks
{
    public static readonly TikzOptions Options = TikzOptions.Default with
    {
        InputKind = TikzInputKind.PictureBody,
        Limits = TikzLimits.Default with
        {
            MaxSourceCharacters = 8192, MaxNesting = 32, MaxExpressionDepth = 32,
            MaxNodes = 64, MaxSegments = 512, MaxGlyphs = 256,
            MaxWork = 100_000, MaxOutputBytes = 131_072
        }
    };

    public static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }

    public static string Hash(byte[] bytes) => System.Convert.ToHexStringLower(SHA256.HashData(bytes));
    public static string HashCodeUnits(string text)
    {
        var bytes = new byte[text.Length * 2];
        for (int i = 0; i < text.Length; i++) { bytes[i * 2] = (byte)text[i]; bytes[i * 2 + 1] = (byte)(text[i] >> 8); }
        return Hash(bytes);
    }

    public static Observation Convert(InputCase item, bool requireSuccess = false, bool requireLimit = false)
    {
        var result = TikzConverter.Convert(item.Source, Options, CancellationToken.None);
        Require(result.Statistics.Work >= 0 && result.Statistics.OutputBytes >= 0, "Negative statistics");
        if (requireSuccess) Require(result is TikzSuccess, "A declared valid seed did not convert");
        if (requireLimit) Require(result is TikzFailure && result.Diagnostics.Any(d => d.Code == "TIKZ005"), "Stress probe did not reject with a resource diagnostic");
        if (result is TikzSuccess success)
        {
            Require(Encoding.UTF8.GetByteCount(success.Svg) == success.Statistics.OutputBytes, "Wrong UTF-8 output count");
            Require(success.Statistics.OutputBytes <= Options.Limits.MaxOutputBytes, "Output quota exceeded");
            Require(success.Statistics.Work <= Options.Limits.MaxWork, "Work quota exceeded on success");
            Require(XDocument.Parse(success.Svg).Root?.Name == XName.Get("svg", "http://www.w3.org/2000/svg"), "Invalid SVG root");
            foreach (var bounds in new[] { success.PictureBounds, success.InkBounds })
                Require(bounds.IsEmpty || new[] { bounds.MinX, bounds.MinY, bounds.MaxX, bounds.MaxY }.All(double.IsFinite), "Nonfinite bounds");
        }
        else
        {
            Require(result is TikzFailure && result.Diagnostics.Count > 0, "Failure lacks diagnostics");
            Require(result.Statistics.OutputBytes == 0, "Failure reports output");
        }
        foreach (var diagnostic in result.Diagnostics)
        {
            Require(!string.IsNullOrWhiteSpace(diagnostic.Code) && !string.IsNullOrWhiteSpace(diagnostic.Message), "Empty diagnostic");
            foreach (var span in diagnostic.RelatedLocations.Prepend(diagnostic.Span))
                Require(span.Offset >= 0 && span.Length >= 0 && span.Offset <= item.Source.Length
                    && span.Length <= item.Source.Length - span.Offset && span.Line >= 1 && span.Column >= 1, "Diagnostic span escapes input");
        }
        var snapshot = JsonSerializer.SerializeToUtf8Bytes(result, result.GetType());
        return new Observation(item.Id, HashCodeUnits(item.Source), Hash(snapshot), result is TikzSuccess);
    }
}

internal sealed record Observation(string Id, string sourceUtf16LESha256, string resultSha256, bool success);

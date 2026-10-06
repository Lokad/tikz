using System.Buffers.Binary;
using System.Globalization;
using System.Text.RegularExpressions;

namespace TikzShapePdfReference;

// Pure native log/page reader. No converter, layout helper or font resource.
internal static class PdfEvidence
{
    internal const double SpToCss = 96 / (72.27 * 65536);
    private static readonly Dictionary<string, int> ExpectedCounts = new(StringComparer.Ordinal)
    { ["SHAPE"] = 28, ["VALUE"] = 336, ["POINT"] = 84, ["FRAME"] = 28, ["SEG"] = 420,
      ["ANCHOR"] = 448, ["BORDER"] = 448, ["NORMAL"] = 16, ["BOUNDS"] = 1, ["BOX"] = 1 };
    internal sealed record PictureBox(int WidthSp, int HeightSp, int DepthSp);
    internal sealed record Bounds(int MinXSp, int MinYSp, int MaxXSp, int MaxYSp);
    internal sealed record Page(int BoxXSp, int BoxBaselineYSp, int WidthSp, int HeightSp);
    internal sealed record Point(double X, double Y);
    internal sealed record PixelSize(int Width, int Height);
    internal sealed record Measurement(string[] NativeRecords, Dictionary<string, int> Counts, PictureBox PictureBox,
        Bounds PictureBounds, Page Page, Point PdfOriginPixels);

    internal static string[] NativeRecords(string log)
    {
        var flat = Flat(log);
        var records = Regex.Matches(flat, @"LOKAD-([A-Z]+) (.*?)\|END").ToArray();
        Require(records.Length == 1810, "Incomplete or extra native shape records.");
        var counts = records.GroupBy(m => m.Groups[1].Value).ToDictionary(g => g.Key, g => g.Count(), StringComparer.Ordinal);
        Require(counts.Count == ExpectedCounts.Count && ExpectedCounts.All(p => counts.GetValueOrDefault(p.Key) == p.Value), "Native shape record vocabulary/coverage differs.");
        return records.Select(m => m.Value).ToArray();
    }
    internal static Measurement Read(string primaryLog, string pdfLog, string plainPdfLog)
    {
        var expected = NativeRecords(primaryLog);
        var actual = NativeRecords(pdfLog);
        Require(expected.SequenceEqual(actual, StringComparer.Ordinal), "Ordinary PDF native measurements differ from the independent SVG route.");
        foreach (var log in new[] { pdfLog, plainPdfLog })
        {
            Require(Single(log, @"LOKAD-PDF-PGF-VERSION ([^|]*)\|END").Groups[1].Value == "3.1.11a", "Incompatible PGF version.");
            Require(Single(log, @"LOKAD-PDF-DRIVER ([^|]*)\|END").Groups[1].Value == "pgfsys-pdftex.def", "Ordinary PDF driver was not selected.");
        }
        var box = Box(pdfLog); Require(box == Box(plainPdfLog), "PDF probes changed the picture box.");
        Require(box.DepthSp == 0, "The current trusted PDF fixture requires zero picture depth.");
        var boundsMatch = Single(pdfLog, @"LOKAD-BOUNDS (-?\d+)\|(-?\d+)\|(-?\d+)\|(-?\d+)\|END");
        var bounds = new Bounds(Int(boundsMatch, 1), Int(boundsMatch, 2), Int(boundsMatch, 3), Int(boundsMatch, 4));
        Require(bounds.MaxXSp > bounds.MinXSp && bounds.MaxYSp > bounds.MinYSp
            && (long)bounds.MaxXSp - bounds.MinXSp == box.WidthSp
            && (long)bounds.MaxYSp - bounds.MinYSp == box.HeightSp, "Native picture bounds and box disagree.");
        var page = ReadPage(pdfLog); Require(page == ReadPage(plainPdfLog), "PDF probes changed the shipped-out page position.");
        Require(page.WidthSp == 600 * 65536 && page.HeightSp == 800 * 65536, "PDF page differs from the declared physical profile.");
        var xSp = (long)page.BoxXSp - bounds.MinXSp;
        var ySp = (long)page.HeightSp - page.BoxBaselineYSp + bounds.MinYSp + box.DepthSp;
        Require(xSp + bounds.MinXSp >= 0 && xSp + bounds.MaxXSp <= page.WidthSp
            && ySp - bounds.MaxYSp >= 0 && ySp - bounds.MinYSp <= page.HeightSp, "Native picture extends outside the physical PDF page.");
        return new(actual, new(ExpectedCounts, StringComparer.Ordinal), box, bounds, page, new(xSp * SpToCss, ySp * SpToCss));
    }
    internal static PictureBox Box(string log)
    {
        var m = Single(log, @"LOKAD-BOX (-?\d+)\|(-?\d+)\|(-?\d+)\|END");
        return new(Int(m, 1), Int(m, 2), Int(m, 3));
    }
    internal static Page ReadPage(string log)
    {
        var m = Single(log, @"LOKAD-PDF-PAGE (-?\d+)\|(-?\d+)\|(-?\d+)\|(-?\d+)\|END");
        var page = new Page(Int(m, 1), Int(m, 2), Int(m, 3), Int(m, 4));
        Require(page.WidthSp > 0 && page.HeightSp > 0 && page.BoxXSp >= 0 && page.BoxXSp <= page.WidthSp
            && page.BoxBaselineYSp >= 0 && page.BoxBaselineYSp <= page.HeightSp, "Invalid native PDF saved position.");
        return page;
    }
    internal static PixelSize PngSize(ReadOnlySpan<byte> bytes)
    {
        Require(bytes.Length >= 33 && bytes[..8].SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })
            && BinaryPrimitives.ReadUInt32BigEndian(bytes[8..12]) == 13 && bytes[12..16].SequenceEqual("IHDR"u8), "Invalid PDF raster PNG header.");
        var width = BinaryPrimitives.ReadUInt32BigEndian(bytes[16..20]);
        var height = BinaryPrimitives.ReadUInt32BigEndian(bytes[20..24]);
        Require(width > 0 && height > 0 && (long)width * height <= 20000000 && bytes[24] == 8 && bytes[25] is 2 or 6
            && bytes[26] == 0 && bytes[27] == 0 && bytes[28] == 0, "Unsupported or excessive PDF raster.");
        return new(checked((int)width), checked((int)height));
    }
    internal static PixelSize ExpectedRaster(Page page, int scale)
    {
        Require(scale is 1 or 4, "Unknown PDF raster scale.");
        return new(checked((int)Math.Ceiling(page.WidthSp * SpToCss * scale)), checked((int)Math.Ceiling(page.HeightSp * SpToCss * scale)));
    }
    private static Match Single(string log, string pattern)
    {
        var matches = Regex.Matches(Flat(log), pattern); Require(matches.Count == 1, "Missing or duplicate native PDF measurement."); return matches[0];
    }
    private static string Flat(string log) { Require(log.Length <= 2000000, "Native log exceeds its bound."); return log.Replace("\r", "", StringComparison.Ordinal).Replace("\n", "", StringComparison.Ordinal); }
    private static int Int(Match m, int index) => int.Parse(m.Groups[index].Value, CultureInfo.InvariantCulture);
    private static void Require(bool condition, string message) { if (!condition) throw new InvalidOperationException(message); }
}

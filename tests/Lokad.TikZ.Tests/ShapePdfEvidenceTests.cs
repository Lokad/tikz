using System.Buffers.Binary;
using System.Text.RegularExpressions;
using TikzShapePdfReference;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class ShapePdfEvidenceTests
{
    [Fact]
    public void Ordinary_pdf_agrees_with_all_native_records_and_has_independent_page_registration()
    {
        var (native, pdf, plain) = Logs();
        var result = PdfEvidence.Read(native, pdf, plain);
        Assert.Equal(1810, result.NativeRecords.Length);
        Assert.Equal(448, result.Counts["ANCHOR"]);
        Assert.Equal(448, result.Counts["BORDER"]);
        Assert.Equal(420, result.Counts["SEG"]);
        Assert.Equal(new PdfEvidence.PictureBox(26319176, 38588378, 0), result.PictureBox);
        Assert.Equal(new PdfEvidence.Page(8799518, 5630728, 39321600, 52428800), result.Page);
        Assert.Equal(28342677 * PdfEvidence.SpToCss, result.PdfOriginPixels.X);
        Assert.Equal(9823553 * PdfEvidence.SpToCss, result.PdfOriginPixels.Y);
        foreach (var scale in new[] { 1, 4 })
            Assert.Equal(PdfEvidence.ExpectedRaster(result.Page, scale), PdfEvidence.PngSize(File.ReadAllBytes(At("pdf", "pdf-page-" + scale + "x.png"))));
        Assert.Equal(new PdfEvidence.PixelSize(798, 1063), PdfEvidence.ExpectedRaster(result.Page, 1));
        Assert.Equal(new PdfEvidence.PixelSize(3189, 4251), PdfEvidence.ExpectedRaster(result.Page, 4));
    }

    [Fact]
    public void Engine_line_wrapping_does_not_change_native_measurement_meaning()
    {
        var (native, pdf, plain) = Logs();
        static string Wrap(string value) => string.Join('\n', value.Chunk(31).Select(chars => new string(chars)));
        var expected = PdfEvidence.Read(native, pdf, plain);
        var actual = PdfEvidence.Read(Wrap(native.Replace("\n", "")), Wrap(pdf.Replace("\n", "")), Wrap(plain.Replace("\n", "")));
        Assert.Equal(expected.NativeRecords, actual.NativeRecords);
        Assert.Equal(expected.Page, actual.Page);
        Assert.Equal(expected.PdfOriginPixels, actual.PdfOriginPixels);
    }

    [Theory]
    [InlineData("native-value")]
    [InlineData("missing-record")]
    [InlineData("duplicate-record")]
    [InlineData("duplicate-page")]
    [InlineData("missing-page")]
    [InlineData("wrong-pgf")]
    [InlineData("wrong-driver")]
    [InlineData("changed-plain-box")]
    [InlineData("changed-plain-position")]
    [InlineData("wrong-physical-page")]
    [InlineData("off-page-picture")]
    [InlineData("negative-saved-position")]
    [InlineData("excessive-log")]
    public void Damaged_or_inconsistent_native_evidence_is_rejected(string mutation)
    {
        var (native, pdf, plain) = Logs();
        var page = "LOKAD-PDF-PAGE 8799518|5630728|39321600|52428800|END";
        switch (mutation)
        {
            case "native-value": pdf = pdf.Replace("LOKAD-VALUE c-regular|width|", "LOKAD-VALUE c-regular|wrong|"); break;
            case "missing-record": pdf = Regex.Replace(pdf, @"LOKAD-NORMAL [^|]+\|[^|]+\|[^|]+\|END", "", RegexOptions.None, TimeSpan.FromSeconds(1)); break;
            case "duplicate-record": pdf += "\nLOKAD-NORMAL duplicate|1|2|END"; break;
            case "duplicate-page": pdf += "\n" + page; break;
            case "missing-page": pdf = pdf.Replace(page, ""); break;
            case "wrong-pgf": pdf = pdf.Replace("LOKAD-PDF-PGF-VERSION 3.1.11a|END", "LOKAD-PDF-PGF-VERSION wrong|END"); break;
            case "wrong-driver": plain = plain.Replace("pgfsys-pdftex.def|END", "pgfsys-dvisvgm.def|END"); break;
            case "changed-plain-box": plain = plain.Replace("LOKAD-BOX 26319176|", "LOKAD-BOX 26319177|"); break;
            case "changed-plain-position": plain = plain.Replace(page, page.Replace("8799518", "8799519")); break;
            case "wrong-physical-page":
                pdf = pdf.Replace(page, page.Replace("39321600", "39321601")); plain = plain.Replace(page, page.Replace("39321600", "39321601")); break;
            case "off-page-picture":
                pdf = pdf.Replace(page, page.Replace("8799518", "39321600")); plain = plain.Replace(page, page.Replace("8799518", "39321600")); break;
            case "negative-saved-position": pdf = pdf.Replace(page, page.Replace("8799518", "-1")); break;
            case "excessive-log": pdf = new string('x', 2000001); break;
            default: throw new InvalidOperationException();
        }
        Assert.Throws<InvalidOperationException>(() => PdfEvidence.Read(native, pdf, plain));
    }

    [Theory]
    [InlineData("truncated")]
    [InlineData("signature")]
    [InlineData("zero-width")]
    [InlineData("excessive-pixels")]
    [InlineData("bit-depth")]
    [InlineData("color-type")]
    [InlineData("interlace")]
    public void Invalid_or_excessive_raster_headers_are_rejected(string mutation)
    {
        var data = File.ReadAllBytes(At("pdf", "pdf-page-1x.png"));
        switch (mutation)
        {
            case "truncated": data = data[..32]; break;
            case "signature": data[0] ^= 1; break;
            case "zero-width": BinaryPrimitives.WriteUInt32BigEndian(data.AsSpan(16, 4), 0); break;
            case "excessive-pixels": BinaryPrimitives.WriteUInt32BigEndian(data.AsSpan(16, 4), 20000001); break;
            case "bit-depth": data[24] = 16; break;
            case "color-type": data[25] = 3; break;
            case "interlace": data[28] = 1; break;
        }
        Assert.Throws<InvalidOperationException>(() => PdfEvidence.PngSize(data));
    }

    private static (string Native, string Pdf, string Plain) Logs() => (File.ReadAllText(At("native", "oracle.log")),
        File.ReadAllText(At("pdf", "pdf.log")), File.ReadAllText(At("pdf", "plain-pdf.log")));
    private static string At(string directory, string name) => Path.Combine(AppContext.BaseDirectory, "Reference", "NodeShapes", directory, name);
}

using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Lokad.TikZ.Graphics;
using TikzDashReference;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class DashTests
{
    private static string Source => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures/Dashes/dashes.tikz")).Replace("\r\n", "\n", StringComparison.Ordinal);
    private static string Native(string file) => Path.Combine(AppContext.BaseDirectory, "Reference/Dashes/native", file);
    public static TheoryData<int> Cases => new(Enumerable.Range(0, 40).ToArray());

    [Theory]
    [MemberData(nameof(Cases))]
    public void DashStateMatchesIndependentIntegerPgfRecords(int index)
    {
        var source = Source; var expected = DashEvidence.Parse(source, File.ReadAllText(Native("svg.log")), false).Records[index];
        GraphicsScene? scene = null;
        var result = TikzConverter.ConvertWithTrace(source, TikzOptions.Default, CancellationToken.None, value => scene = value);
        Assert.IsType<TikzSuccess>(result); Assert.NotNull(scene); Assert.Equal(40, scene.Paths.Count);
        var actual = scene.Paths[index]; const double spToBp = 72d / (72.27 * 65536);
        Assert.Equal(expected.LengthsSp.Length, actual.Paint.Dash.Length);
        for (var i = 0; i < expected.LengthsSp.Length; i++) Assert.Equal(expected.LengthsSp[i] * spToBp, actual.Paint.Dash[i], 12);
        Assert.Equal(expected.PhaseSp * spToBp, actual.Paint.DashPhase, 12);
        Assert.Equal(expected.WidthSp, (int)Math.Round(actual.Paint.Width / spToBp, MidpointRounding.AwayFromZero));
        Assert.StartsWith("\\draw", source.Substring(actual.Source.Offset, actual.Source.Length));
        var marker = Regex.Matches(source[..actual.Source.Offset], @"% DASH-CASE ([a-z0-9-]+)")[^1].Groups[1].Value;
        Assert.Equal(expected.Id, marker);
    }

    [Fact]
    public void NativeCacheIsPinnedOutsideItsArtifactFolder()
    {
        using var snapshot = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference/Dashes/snapshot.json")));
        using var metrics = JsonDocument.Parse(File.ReadAllText(Native("metrics.json")));
        foreach (var item in snapshot.RootElement.GetProperty("artifacts").EnumerateObject())
            Assert.Equal(item.Value.GetString(), Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(Native(item.Name)))));
        Assert.Equal(metrics.RootElement.GetProperty("sourceSha256").GetString(), Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(Source))));
        Assert.False(metrics.RootElement.GetProperty("converterInvoked").GetBoolean()); Assert.False(metrics.RootElement.GetProperty("approvedImagePolicy").GetBoolean());
        var dvi = DashEvidence.Parse(Source, File.ReadAllText(Native("svg.log")), false);
        var pdf = DashEvidence.Parse(Source, File.ReadAllText(Native("pdf.log")), true);
        Assert.Equal(dvi.Bounds, pdf.Bounds); Assert.Equal(dvi.Box, pdf.Box); Assert.NotNull(pdf.Page);
        for (var i = 0; i < 40; i++) { Assert.Equal(dvi.Records[i].Id, pdf.Records[i].Id); Assert.Equal(dvi.Records[i].LengthsSp, pdf.Records[i].LengthsSp); Assert.Equal(dvi.Records[i].PhaseSp, pdf.Records[i].PhaseSp); }
    }

    [Theory]
    [InlineData("missing-header")]
    [InlineData("duplicate-header")]
    [InlineData("missing-phase")]
    [InlineData("wrong-order")]
    [InlineData("unexpected-item")]
    [InlineData("negative-length")]
    [InlineData("zero-pattern")]
    [InlineData("wrong-box")]
    [InlineData("wrong-page")]
    public void MalformedNativeEvidenceCannotBecomeAReference(string mutation)
    {
        var log = File.ReadAllText(Native("pdf.log"));
        log = mutation switch
        {
            "missing-header" => log.Replace("LOKAD-DASH 1|", "REMOVED 1|", StringComparison.Ordinal),
            "duplicate-header" => log + "\nLOKAD-DASH 41|width=26214|",
            "missing-phase" => log.Replace("LOKAD-DASH-PHASE 1|", "REMOVED 1|", StringComparison.Ordinal),
            "wrong-order" => log.Replace("LOKAD-DASH 1|", "LOKAD-DASH 0|", StringComparison.Ordinal),
            "unexpected-item" => log + "\nLOKAD-DASH-ITEM 41|65536|END",
            "negative-length" => log.Replace("LOKAD-DASH-ITEM 2|196608|", "LOKAD-DASH-ITEM 2|-1|", StringComparison.Ordinal),
            "zero-pattern" => log.Replace("LOKAD-DASH-ITEM 2|196608|", "LOKAD-DASH-ITEM 2|0|", StringComparison.Ordinal),
            "wrong-box" => Regex.Replace(log, @"LOKAD-BOX width=\d+;", "LOKAD-BOX width=1;"),
            "wrong-page" => log.Replace("width=39321600;height=52428800|END", "width=39321601;height=52428800|END", StringComparison.Ordinal),
            _ => throw new InvalidOperationException()
        };
        Assert.Throws<InvalidDataException>(() => DashEvidence.Parse(Source, log, true));
    }

    [Theory]
    [InlineData("on -1pt off 2pt")]
    [InlineData("on 0pt off 0pt")]
    [InlineData("off 2pt on 1pt")]
    [InlineData("on 1pt off")]
    [InlineData("on \\unknown off 2pt")]
    public void UnsupportedOrInvalidDashLengthsHaveSourceDiagnostics(string pattern)
    {
        var source = "\\begin{tikzpicture}\\draw[dash pattern={" + pattern + "}] (0,0)--(1,0);\\end{tikzpicture}";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, TikzOptions.Default, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics); Assert.InRange(diagnostic.Span.Offset, 0, source.Length); Assert.True(diagnostic.Span.Length > 0);
    }

    [Fact]
    public void LargeDashPatternsUseTheConversionBudget()
    {
        var source = "\\begin{tikzpicture}\\draw[dash pattern={" + string.Join(' ', Enumerable.Repeat("on 1pt off 2pt", 1000)) + "}] (0,0)--(1,0);\\end{tikzpicture}";
        var options = TikzOptions.Default with { Limits = TikzLimits.Default with { MaxWork = 1000 } };
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, options, CancellationToken.None));
        Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
    }
}

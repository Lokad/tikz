using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Lokad.TikZ.Graphics;
using TikzDashGeometryReference;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class DashGeometryTests
{
    private static string Source => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures/Dashes/geometry.tikz")).Replace("\r\n", "\n", StringComparison.Ordinal);
    private static string At(string p) => Path.Combine(AppContext.BaseDirectory, "Reference/DashGeometry", p);
    private static GeometryMeasurement Native => DashGeometryEvidence.Parse(Source, File.ReadAllText(At("native/svg.log")), false);
    public static TheoryData<int> Cases => new(Enumerable.Range(0, 16).ToArray());
    private static NativeSegment[] Segments(GraphicPath path)
    {
        const double ratio = 72.27 * 65536 / 72;
        int Sp(double n) => (int)Math.Round(n * ratio, MidpointRounding.AwayFromZero);
        return DashGeometryEvidence.Normalize(path.Segments.Select(s => new NativeSegment(s.Kind.ToString(),
            new(Sp(s.End.X), Sp(s.End.Y)), new(Sp(s.A.X), Sp(s.A.Y)), new(Sp(s.B.X), Sp(s.B.Y)))));
    }
    private static GraphicsScene Convert()
    {
        GraphicsScene? scene = null;
        Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(Source, TikzOptions.Default, CancellationToken.None, s => scene = s));
        Assert.NotNull(scene); Assert.Equal(16, scene.Paths.Count); Assert.Equal(3, scene.Clips.Count); return scene;
    }
    [Theory]
    [MemberData(nameof(Cases))]
    public void CurvedAndCompoundDashPathsMatchNativeIntegers(int index)
    {
        var expected = Native.Records.Where(p => p.Actions != "clip").ElementAt(index); var actual = Convert().Paths[index];
        Assert.Equal(expected.Segments, Segments(actual.Path));
        const double ratio = 72.27 * 65536 / 72;
        Assert.Equal(expected.WidthSp, (int)Math.Round(actual.Paint.Width * ratio));
        Assert.Equal(expected.PhaseSp, (int)Math.Round(actual.Paint.DashPhase * ratio));
        Assert.Equal(expected.LengthsSp, actual.Paint.Dash.Select(d => (int)Math.Round(d * ratio)));
        var clips = index switch { 12 => new[] { 0 }, 13 => new[] { 1, 2 }, _ => [] };
        Assert.Equal(clips, actual.Clips);
        var marker = Regex.Matches(Source[..actual.Source.Offset], @"% DASH-GEOMETRY ([a-z0-9-]+)")[^1].Groups[1].Value;
        Assert.Equal(expected.Id, marker);
    }
    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public void NativeClipPathsHaveMatchingGeometry(int index)
    {
        var expected = Native.Records.Where(p => p.Actions == "clip").ElementAt(index);
        Assert.Equal(expected.Segments, Segments(Convert().Clips[index].Path));
    }
    [Fact]
    public void GeometryOracleIsPinnedAndBothDriversAgree()
    {
        using var snapshot = JsonDocument.Parse(File.ReadAllBytes(At("snapshot.json")));
        foreach (var p in snapshot.RootElement.GetProperty("artifacts").EnumerateObject())
            Assert.Equal(p.Value.GetString(), System.Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(At("native/" + p.Name)))));
        var a = Native; var b = DashGeometryEvidence.Parse(Source, File.ReadAllText(At("native/pdf.log")), true);
        Assert.Equal(a.Bounds, b.Bounds); Assert.Equal(a.Box, b.Box); Assert.NotNull(b.Page);
        for (var i = 0; i < 19; i++)
        {
            Assert.Equal(a.Records[i].Id, b.Records[i].Id); Assert.Equal(a.Records[i].Segments, b.Records[i].Segments);
            Assert.Equal(a.Records[i].LengthsSp, b.Records[i].LengthsSp); Assert.Equal(a.Records[i].PhaseSp, b.Records[i].PhaseSp);
        }
    }
    [Theory]
    [InlineData("missing-header")]
    [InlineData("missing-phase")]
    [InlineData("foreign-segment")]
    [InlineData("missing-first-control")]
    [InlineData("missing-second-control")]
    [InlineData("missing-move")]
    [InlineData("orphan-rectangle-size")]
    [InlineData("unknown-token")]
    public void IncompleteNativeGeometryIsRejected(string mutation)
    {
        var original = File.ReadAllText(At("native/svg.log")).Replace("\r", "", StringComparison.Ordinal).Replace("\n", "", StringComparison.Ordinal);
        var log = original;
        log = mutation switch
        {
            "missing-header" => log.Replace("LOKAD-DASH 1|", "REMOVED 1|", StringComparison.Ordinal),
            "missing-phase" => log.Replace("LOKAD-DASH-PHASE 1|", "REMOVED 1|", StringComparison.Ordinal),
            "foreign-segment" => log + "LOKAD-SEG 20|moveto|0|0|END",
            "missing-first-control" => Regex.Replace(log, @"LOKAD-SEG 1\|curvetosupporta\|-?\d+\|-?\d+\|END", ""),
            "missing-second-control" => Regex.Replace(log, @"LOKAD-SEG 1\|curvetosupportb\|-?\d+\|-?\d+\|END", ""),
            "missing-move" => Regex.Replace(log, @"LOKAD-SEG 1\|moveto\|-?\d+\|-?\d+\|END", ""),
            "orphan-rectangle-size" => log + "LOKAD-SEG 13|rectsize|65536|65536|END",
            "unknown-token" => log.Replace("LOKAD-SEG 1|moveto|", "LOKAD-SEG 1|unknown|", StringComparison.Ordinal),
            _ => throw new InvalidOperationException()
        };
        Assert.NotEqual(original, log);
        Assert.Throws<InvalidDataException>(() => DashGeometryEvidence.Parse(Source, log, false));
    }
}

using System.Text.Json;
using Lokad.TikZ.Graphics;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class TransformPrecisionTests
{
    private static string FileName(string name) => Path.Combine(AppContext.BaseDirectory, "Reference", "Transforms", name);
    public static IEnumerable<object[]> TransformCases()
    {
        using var cases = JsonDocument.Parse(File.ReadAllText(FileName("cases.json")));
        foreach (var c in cases.RootElement.GetProperty("transforms").EnumerateArray())
            yield return [c.GetProperty("id").GetString()!, c.GetProperty("options").GetString()!];
    }
    public static IEnumerable<object[]> DimensionCases()
    {
        using var cases = JsonDocument.Parse(File.ReadAllText(FileName("cases.json")));
        foreach (var c in cases.RootElement.GetProperty("dimensions").EnumerateArray())
            yield return [c.GetProperty("id").GetString()!, c.GetProperty("value").GetString()!];
    }

    [Theory]
    [MemberData(nameof(TransformCases))]
    public void Public_affine_frames_and_points_match_native_PGF(string id, string options)
    {
        using var native = JsonDocument.Parse(File.ReadAllText(FileName("measurements.json")));
        var expected = native.RootElement.GetProperty("frames").GetProperty(id);
        var point = native.RootElement.GetProperty("points").GetProperty(id);
        var scene = Convert(@"\begin{tikzpicture}[" + options + @"]
\node[transform shape,anchor=text] (measured) at (0pt,0pt) {};
\coordinate (probe) at (7.12345pt,-3.54321pt);
\draw (0pt,0pt)--(1pt,1pt);
\end{tikzpicture}");
        var actual = Assert.Single(scene.Nodes).Transform;
        Assert.Equal(expected.GetProperty("a").GetDouble(), actual.A);
        Assert.Equal(expected.GetProperty("b").GetDouble(), actual.B);
        Assert.Equal(expected.GetProperty("c").GetDouble(), actual.C);
        Assert.Equal(expected.GetProperty("d").GetDouble(), actual.D);
        Coordinate(expected.GetProperty("eSp").GetInt32(), actual.E);
        Coordinate(expected.GetProperty("fSp").GetInt32(), actual.F);
        Coordinate(point.GetProperty("xSp").GetInt32(), scene.Coordinates["probe"].X);
        Coordinate(point.GetProperty("ySp").GetInt32(), scene.Coordinates["probe"].Y);
    }

    [Theory]
    [MemberData(nameof(DimensionCases))]
    public void Public_physical_dimensions_match_native_TeX(string id, string value)
    {
        using var native = JsonDocument.Parse(File.ReadAllText(FileName("measurements.json")));
        var scene = Convert(@"\begin{tikzpicture}\coordinate (probe) at (" + value + @",0pt);\draw (0pt,0pt)--(1pt,0pt);\end{tikzpicture}");
        Coordinate(native.RootElement.GetProperty("dimensions").GetProperty(id).GetInt32(), scene.Coordinates["probe"].X);
        Coordinate(0, scene.Coordinates["probe"].Y);
    }

    [Theory]
    [InlineData(@"\begin{tikzpicture}[scale=16384]\draw(0,0)--(0,0);\end{tikzpicture}")]
    [InlineData(@"\begin{tikzpicture}[scale=1000,scale=1000]\draw(0,0)--(0,0);\end{tikzpicture}")]
    [InlineData(@"\begin{tikzpicture}[rotate=16384]\draw(0,0)--(0,0);\end{tikzpicture}")]
    [InlineData(@"\begin{tikzpicture}\draw(0,0)--(1e30pt,0pt);\end{tikzpicture}")]
    public void PGF_precision_overflow_is_a_source_diagnostic(string source)
    {
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, TikzOptions.Default, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ004", diagnostic.Code); Assert.True(diagnostic.Span.Length > 0);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    private static GraphicsScene Convert(string source)
    {
        GraphicsScene? scene = null;
        Assert.IsType<TikzSuccess>(TikzConverter.ConvertWithTrace(source, TikzOptions.Default, CancellationToken.None, value => scene = value));
        return scene!;
    }
    private static void Coordinate(int sp, double bp)
    {
        Assert.Equal(sp, (int)Math.Round(bp * (72.27 * 65536 / 72), MidpointRounding.AwayFromZero));
        Assert.InRange(Math.Abs(sp * (72 / (72.27 * 65536)) - bp), 0, 1e-9);
    }
}

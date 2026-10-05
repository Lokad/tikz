using System.Security.Cryptography;
using System.Text.Json;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Semantics;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class RectangleBorderTests
{
    [Theory]
    [InlineData(@"\node[xscale=0] (n) {}; \draw (n) -- (1pt,0pt);")]
    [InlineData(@"\node[xscale=0] (n) {}; \draw (1pt,0pt) -- (n);")]
    [InlineData(@"\node[xscale=0] (n) {}; \draw (n) .. controls (1pt,0pt) and (2pt,0pt) .. (3pt,0pt);")]
    public void Singular_node_border_queries_fail_at_the_node_reference(string source)
    {
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source,
            TikzOptions.Default with { InputKind = TikzInputKind.PictureBody }, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ004", diagnostic.Code);
        Assert.Equal("(n)", source.Substring(diagnostic.Span.Offset, diagnostic.Span.Length));
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Fact]
    public void Rectangle_intersections_match_independent_PGF_integer_measurements()
    {
        var root = Path.Combine(AppContext.BaseDirectory, "Reference", "NodeBorders");
        using var manifest = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "cases.json")));
        using var native = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "measurements.json")));
        using var provenance = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "provenance.json")));
        Assert.Equal(Hash("cases.json"), provenance.RootElement.GetProperty("manifestSha256").GetString());
        Assert.Equal(Hash("measurements.json"), provenance.RootElement.GetProperty("measurementsSha256").GetString());
        Assert.Equal(manifest.RootElement.GetProperty("profile").GetString(), native.RootElement.GetProperty("profile").GetString());
        var cases = manifest.RootElement.GetProperty("cases").EnumerateArray().ToArray();
        Assert.Equal(cases.Select(c => c.GetProperty("id").GetString()), native.RootElement.GetProperty("points").EnumerateObject().Select(p => p.Name));
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        foreach (var entry in cases)
        {
            var id = entry.GetProperty("id").GetString()!;
            var expected = native.RootElement.GetProperty("points").GetProperty(id);
            var actual = RectangleBorder.Intersect(new(Get("xSp"), Get("ySp")), new(Get("halfWidthSp"), Get("halfHeightSp")), budget, new(id, 0, id.Length));
            Assert.True(expected.GetProperty("xSp").GetInt32() == actual.X && expected.GetProperty("ySp").GetInt32() == actual.Y,
                $"{id}: expected ({expected.GetProperty("xSp")}, {expected.GetProperty("ySp")}), got ({actual.X}, {actual.Y}).");
            int Get(string key) => entry.GetProperty(key).GetInt32();
        }
        string Hash(string file) => Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(Path.Combine(root, file))));
    }
}

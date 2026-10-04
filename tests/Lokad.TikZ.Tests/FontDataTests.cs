using System.Text.Json;
using Lokad.TikZ.Text;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class FontDataTests
{
    [Theory]
    [InlineData("regular-10", 10)]
    [InlineData("bold-10", 10)]
    [InlineData("italic-10", 10)]
    [InlineData("regular-12", 12)]
    [InlineData("bold-12", 12)]
    [InlineData("italic-12", 12)]
    public void Bundled_metrics_match_every_independent_TeX_box(string id, int size)
    {
        var font = FontData.Load(id);
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "Fonts", id + ".json")));
        var sizeSp = size * 65536;
        Assert.Equal(size * 1048576, font.DesignSizeFix);
        Assert.Equal(256, json.RootElement.GetProperty("glyphs").GetArrayLength());
        foreach (var values in json.RootElement.GetProperty("glyphs").EnumerateArray())
        {
            var row = values.EnumerateArray().Select(v => v.GetInt32()).ToArray();
            var glyph = font.Glyphs[row[0]];
            Assert.Equal(row[1], FontData.ScaleFix(glyph.AdvanceFix, sizeSp));
            Assert.Equal(row[2], Math.Max(0, FontData.ScaleFix(glyph.HeightFix, sizeSp)));
            Assert.Equal(row[3], Math.Max(0, FontData.ScaleFix(glyph.DepthFix, sizeSp)));
            Assert.Equal(row[4], FontData.ScaleFix(glyph.AdvanceFix, sizeSp));
            Assert.Equal(row[5], FontData.ScaleFix(glyph.HeightFix, sizeSp));
            Assert.Equal(row[6], FontData.ScaleFix(glyph.DepthFix, sizeSp));
            Assert.Equal(row[7], FontData.ScaleFix(glyph.ItalicFix, sizeSp));
        }
        Assert.Equal(font.Pairs.Length, json.RootElement.GetProperty("pairs").GetArrayLength());
        foreach (var (row, rule) in json.RootElement.GetProperty("pairs").EnumerateArray().Zip(font.Pairs))
        {
            Assert.Equal(rule.Left, row[0].GetInt32());
            Assert.Equal(rule.Right, row[1].GetInt32());
            var left = font.Glyphs[rule.Ligature ?? rule.Left];
            var right = rule.Ligature.HasValue ? left : font.Glyphs[rule.Right];
            var width = rule.Ligature.HasValue ? FontData.ScaleFix(left.AdvanceFix, sizeSp)
                : FontData.ScaleFix(left.AdvanceFix, sizeSp) + FontData.ScaleFix(right.AdvanceFix, sizeSp) + FontData.ScaleFix(rule.KernFix!.Value, sizeSp);
            Assert.Equal(row[2].GetInt32(), width);
            Assert.Equal(row[3].GetInt32(), Math.Max(0, Math.Max(FontData.ScaleFix(left.HeightFix, sizeSp), FontData.ScaleFix(right.HeightFix, sizeSp))));
            Assert.Equal(row[4].GetInt32(), Math.Max(0, Math.Max(FontData.ScaleFix(left.DepthFix, sizeSp), FontData.ScaleFix(right.DepthFix, sizeSp))));
        }
        foreach (var row in json.RootElement.GetProperty("parameters").EnumerateArray())
        {
            var index = row[0].GetInt32() - 1;
            Assert.Equal(row[1].GetInt32(), index == 0 ? font.ParametersFix[0] >> 4 : FontData.ScaleFix(font.ParametersFix[index], sizeSp));
        }
    }

    [Fact]
    public void Font_profile_preserves_spaces_overhangs_and_typographic_ligatures()
    {
        var regular = FontData.Load("regular-10");
        Assert.Equal("uni2423", regular.Glyphs[32].Name);
        Assert.NotEmpty(regular.Glyphs[32].PathBp);
        Assert.NotEqual(FontData.ScaleFix(regular.ParametersFix[1], 655360), FontData.ScaleFix(regular.Glyphs[32].AdvanceFix, 655360));
        Assert.Empty(regular.Glyphs[23].PathBp);
        Assert.Equal("cwm", regular.Glyphs[23].Name);
        Assert.Contains(regular.Pairs, p => p.Left == 'A' && p.Right == 'V' && p.KernFix < 0);
        Assert.Contains(regular.Pairs, p => p.Left == 'f' && p.Right == 'f' && p.Ligature == 27);
        Assert.Contains(regular.Pairs, p => p.Left == 27 && p.Right == 'i' && p.Ligature == 30);
        Assert.Contains(regular.Pairs, p => p.Left == '-' && p.Right == '-' && p.Ligature == 21);
        Assert.Contains(regular.Pairs, p => p.Left == 21 && p.Right == '-' && p.Ligature == 22);
        Assert.True(FontData.Load("italic-10").Glyphs['f'].ItalicFix > 0);
        Assert.Contains(regular.Glyphs, g => g.Name == "eacute" && g.PathBp.Length > 0);
        Assert.Throws<ArgumentException>(() => FontData.Load("ambient-font"));
        Assert.Throws<ArgumentOutOfRangeException>(() => FontData.ScaleFix(1048576, 0));
    }
}

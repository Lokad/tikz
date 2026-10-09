using System.Text.Json;
using Lokad.TikZ.Text;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class MathFontDataTests
{
    public static IEnumerable<object[]> Faces() => new[] { "roman", "italic", "symbol" }
        .SelectMany(k => new[] { 5, 6, 7, 8, 10, 12 }.Select(s => new object[] { $"math-{k}-{s}" }))
        .Append(new object[] { "math-extension-10" });

    [Theory]
    [MemberData(nameof(Faces))]
    public void Embedded_math_metrics_match_independent_native_boxes(string id)
    {
        var data = MathFontData.Load(id);
        using var native = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "MathFonts", id + ".json")));
        var glyphs = data.Glyphs.ToDictionary(g => g.Slot);
        var rows = native.RootElement.GetProperty("glyphs");
        Assert.Equal(data.LastSlot + 1, rows.GetArrayLength());
        foreach (var row in rows.EnumerateArray())
        {
            var slot = row[0].GetInt32();
            var expected = row.EnumerateArray().Skip(1).Select(x => x.GetInt32()).ToArray();
            if (!glyphs.TryGetValue(slot, out var g)) { Assert.All(expected, n => Assert.Equal(0, n)); continue; }
            var width = FontData.ScaleFix(g.AdvanceFix, data.SizeSp);
            var height = FontData.ScaleFix(g.HeightFix, data.SizeSp);
            var depth = FontData.ScaleFix(g.DepthFix, data.SizeSp);
            Assert.Equal(expected, new[] { width, Math.Max(0, height), Math.Max(0, depth), width, height, depth, FontData.ScaleFix(g.ItalicFix, data.SizeSp) });
        }
        var parameters = native.RootElement.GetProperty("parameters");
        Assert.Equal(data.ParametersFix.Length, parameters.GetArrayLength());
        foreach (var row in parameters.EnumerateArray())
        {
            var i = row[0].GetInt32() - 1;
            Assert.Equal(row[1].GetInt32(), i == 0 ? data.ParametersFix[i] >> 4 : FontData.ScaleFix(data.ParametersFix[i], data.SizeSp));
        }
        var pairs = native.RootElement.GetProperty("pairs");
        Assert.Equal(data.Pairs.Length, pairs.GetArrayLength());
        for (var i = 0; i < data.Pairs.Length; i++)
        {
            var p = data.Pairs[i]; var left = glyphs[p.Ligature ?? p.Left]; var right = p.Ligature.HasValue ? left : glyphs[p.Right];
            var width = p.Ligature.HasValue ? FontData.ScaleFix(left.AdvanceFix, data.SizeSp)
                : FontData.ScaleFix(left.AdvanceFix, data.SizeSp) + FontData.ScaleFix(right.AdvanceFix, data.SizeSp) + FontData.ScaleFix(p.KernFix!.Value, data.SizeSp);
            Assert.Equal(pairs[i].EnumerateArray().Select(x => x.GetInt32()).ToArray(), new[] { p.Left, p.Right, width,
                Math.Max(0, Math.Max(FontData.ScaleFix(left.HeightFix, data.SizeSp), FontData.ScaleFix(right.HeightFix, data.SizeSp))),
                Math.Max(0, Math.Max(FontData.ScaleFix(left.DepthFix, data.SizeSp), FontData.ScaleFix(right.DepthFix, data.SizeSp))) });
        }
    }

    [Fact]
    public void Selected_symbol_size_and_fixed_extension_size_are_preserved()
    {
        var symbols = MathFontData.Load("math-symbol-12");
        Assert.Equal(12 * 65536, symbols.SizeSp); Assert.Equal(10 * 1048576, symbols.DesignSizeFix);
        var extension = MathFontData.Load("math-extension-10");
        Assert.Equal(10 * 65536, extension.SizeSp); Assert.Equal(74, extension.LargerGlyphs.Length);
        Assert.Equal(28, extension.Extensions.Length); Assert.Equal(28, extension.Recipes.Length);
    }

    [Theory]
    [InlineData("math-symbol-012")]
    [InlineData("math-roman-9")]
    [InlineData("math-extension-12")]
    [InlineData("math-bold-10")]
    public void Unsupported_math_font_ids_are_explicit(string id) => Assert.Throws<ArgumentException>(() => MathFontData.Load(id));

    [Fact]
    public void Native_radicals_ground_style_sizes_larger_glyphs_and_assembly_pieces()
    {
        using var native = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "MathFonts", "radicals.json")));
        var cases = native.RootElement.GetProperty("cases"); Assert.Equal(66, cases.GetArrayLength());
        var extension = MathFontData.Load("math-extension-10");
        var chain = extension.LargerGlyphs.ToDictionary(g => g.Slot, g => g.Next);
        Assert.Equal(113, chain[112]); Assert.Equal(114, chain[113]); Assert.Equal(115, chain[114]); Assert.Equal(116, chain[115]);
        var recipe = extension.Recipes[Assert.Single(extension.Extensions, e => e.Slot == 116).Recipe];
        var seen = new HashSet<int>(); var assemblies = 0;
        foreach (var c in cases.EnumerateArray())
        {
            var outer = c.GetProperty("surroundingSizePt").GetInt32();
            var selected = c.GetProperty("style").GetString() switch { "text" => outer, "script" => outer == 10 ? 7 : 8, _ => outer == 10 ? 5 : 6 };
            var glyphs = c.GetProperty("glyphs").EnumerateArray().ToArray();
            var x = Assert.Single(glyphs, g => g.GetProperty("slot").GetInt32() == 120 && g.GetProperty("font").GetString()!.StartsWith("lmmi", StringComparison.Ordinal));
            Assert.Equal("lmmi" + selected, x.GetProperty("font").GetString()); Assert.Equal(selected * 65536, x.GetProperty("sizeSp").GetInt32());
            var parts = glyphs.Where(g => g.GetProperty("font").GetString() == "lmex10").ToArray();
            Assert.All(parts, p => Assert.Equal(10 * 65536, p.GetProperty("sizeSp").GetInt32()));
            if (parts.Length == 1) seen.Add(parts[0].GetProperty("slot").GetInt32());
            if (parts.Length > 1)
            {
                assemblies++; var slots = parts.Select(p => p.GetProperty("slot").GetInt32()).ToArray();
                Assert.Equal(recipe.Top, slots[0]); Assert.Equal(recipe.Bottom, slots[^1]);
                Assert.All(slots.Skip(1).SkipLast(1), s => Assert.Equal(recipe.Repeat, s));
            }
            var rule = Assert.Single(c.GetProperty("rules").EnumerateArray());
            Assert.True(rule.GetProperty("heightSp").GetInt32() > 0); Assert.True(rule.GetProperty("widthSp").GetInt32() > 0);
        }
        Assert.True(new[] { 112, 113, 114, 115 }.All(seen.Contains)); Assert.True(assemblies > 0);
    }
}

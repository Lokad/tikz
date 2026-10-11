using System.Xml.Linq;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class FillRuleTests
{
    [Theory]
    [InlineData("", "nonzero")]
    [InlineData("nonzero rule", "nonzero")]
    [InlineData("even odd rule", "evenodd")]
    [InlineData("even odd rule,nonzero rule", "nonzero")]
    [InlineData("nonzero rule,even odd rule", "evenodd")]
    public void Compound_fill_uses_the_default_or_last_selected_rule(string keys, string expected)
    {
        var svg = Convert($@"\fill[{keys}] (0,0) rectangle (2,2) (.5,.5) rectangle (1.5,1.5);");
        var path = Assert.Single(PaintedPaths(svg));
        Assert.Equal(expected, path.Attribute("fill-rule")?.Value);
    }

    [Fact]
    public void Scoped_rule_selection_restores_the_parent_and_default_rules()
    {
        var svg = Convert(@"
            \begin{scope}[even odd rule]
              \fill (0,0) rectangle (1,1);
              \begin{scope}[nonzero rule]\fill (2,0) rectangle (3,1);\end{scope}
              \fill (4,0) rectangle (5,1);
            \end{scope}
            \fill (6,0) rectangle (7,1);");
        Assert.Equal(new[] { "evenodd", "nonzero", "evenodd", "nonzero" },
            PaintedPaths(svg).Select(p => p.Attribute("fill-rule")?.Value));
    }

    [Fact]
    public void Clip_captures_its_local_rule_independently_of_later_paint_and_scope()
    {
        var svg = Convert(@"
            \begin{scope}[even odd rule]
              \clip (0,0) rectangle (2,2) (.5,.5) rectangle (1.5,1.5);
              \fill[nonzero rule] (-1,-1) rectangle (3,3);
            \end{scope}
            \fill (4,0) rectangle (5,1);");
        var clip = Assert.Single(svg.Descendants(), e => e.Name.LocalName == "clipPath");
        Assert.Equal("userSpaceOnUse", clip.Attribute("clipPathUnits")?.Value);
        Assert.Equal("evenodd", Assert.Single(clip.Elements()).Attribute("clip-rule")?.Value);
        var paths = PaintedPaths(svg);
        Assert.Equal(2, paths.Length);
        Assert.Equal("nonzero", paths[0].Attribute("fill-rule")?.Value);
        Assert.Contains(paths[0].Ancestors(), e => e.Attribute("clip-path")?.Value == $"url(#{clip.Attribute("id")!.Value})");
        Assert.DoesNotContain(paths[1].Ancestors(), e => e.Attribute("clip-path") is not null);
    }

    [Theory]
    [InlineData(@"\clip[even odd rule] (0,0) rectangle (2,2);", "")]
    [InlineData(@"\clip[nonzero rule] (0,0) rectangle (2,2);", "")]
    [InlineData(@"\clip[mask] (0,0) rectangle (2,2);", "mask/.style={even odd rule}")]
    [InlineData(@"\clip (0,0) [even odd rule] rectangle (2,2);", "")]
    [InlineData(@"\clip (0,0) rectangle (2,2);", "every path/.style={even odd rule}")]
    public void Rule_options_on_clip_paths_fail_explicitly_instead_of_accepting_invalid_TikZ(string body, string keys)
    {
        var source = $@"\begin{{tikzpicture}}[{keys}]{body}\end{{tikzpicture}}";
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, TikzOptions.Default, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ002", diagnostic.Code);
        Assert.Contains("scope", diagnostic.Message);
        Assert.True(diagnostic.Span.Length > 0);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    private static XDocument Convert(string body)
    {
        var success = Assert.IsType<TikzSuccess>(TikzConverter.Convert(
            @"\begin{tikzpicture}" + body + @"\end{tikzpicture}", TikzOptions.Default, CancellationToken.None));
        return XDocument.Parse(success.Svg);
    }

    private static XElement[] PaintedPaths(XDocument svg)
        => svg.Descendants().Where(e => e.Name.LocalName == "path" &&
            !e.Ancestors().Any(a => a.Name.LocalName is "defs" or "clipPath")).ToArray();
}

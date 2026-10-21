using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class InkOpacityTests
{
    private static readonly TikzOptions Body = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody };
    private static TikzSuccess Convert(string source) => Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, Body, CancellationToken.None));

    [Theory]
    [InlineData(@"\draw[opacity=0] (0,0)--(1,0);")]
    [InlineData(@"\fill[opacity=0] (0,0) rectangle (1,1);")]
    [InlineData(@"\node[draw,fill,opacity=0] {$\frac{a}{b}$};")]
    [InlineData(@"\draw[opacity=0,->] (0,0)--(1,0);")]
    [InlineData(@"\usetikzlibrary{arrows.meta}\draw[opacity=0,-{Stealth}] (0,0)--(1,0);")]
    [InlineData(@"\usetikzlibrary{arrows.meta}\draw[opacity=0,-{Latex}] (0,0)--(1,0);")]
    [InlineData(@"\begin{scope}[opacity=0]\node[draw] {x};\end{scope}")]
    [InlineData(@"\clip (0,0) rectangle (2,2);\draw[opacity=0] (0,1)--(1,1);")]
    [InlineData(@"\draw[line width=0pt] (0,0)--(1,0);")]
    public void Invisible_paint_has_no_ink_but_retains_picture_geometry(string source)
    {
        var result = Convert(source);
        Assert.True(result.InkBounds.IsEmpty);
        Assert.Equal(0, result.InkBounds.Width);
        Assert.Equal(0, result.InkBounds.Height);
        Assert.False(result.PictureBounds.IsEmpty);
        Assert.NotEmpty(result.Svg);
    }

    [Theory]
    [InlineData(@"\filldraw[draw opacity=0,line width=8pt] (0,0) rectangle (1,1);", @"\fill[line width=8pt] (0,0) rectangle (1,1);")]
    [InlineData(@"\filldraw[fill opacity=0,line width=8pt] (0,0) rectangle (1,1);", @"\draw[line width=8pt] (0,0) rectangle (1,1);")]
    [InlineData(@"\node[draw,fill,draw opacity=0,line width=8pt,minimum size=10pt]{};", @"\node[fill,line width=8pt,minimum size=10pt]{};")]
    [InlineData(@"\node[draw,opacity=0,text opacity=1]{x};", @"\node{x};")]
    public void Only_visible_channels_contribute_to_ink(string mixed, string visible)
        => Assert.Equal(Convert(visible).InkBounds, Convert(mixed).InkBounds);

    [Fact]
    public void Arrow_tip_fill_remains_visible_when_only_shaft_stroke_is_transparent()
    {
        var result = Convert(@"\usetikzlibrary{arrows.meta}\draw[-{Stealth},draw opacity=0] (0,0)--(1,0);");
        Assert.False(result.InkBounds.IsEmpty);
        Assert.True(result.InkBounds.MinX > result.PictureBounds.MinX);
    }
}

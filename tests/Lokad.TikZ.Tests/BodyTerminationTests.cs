using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class BodyTerminationTests
{
    public static IEnumerable<object[]> UnexpectedEnds()
    {
        string[] contexts = ["{0}", "{{{0}}}", @"\foreach\i in{{1}}{{{0}}}", @"\def\place{{{0}}}\place"];
        foreach (var kind in new[] { TikzInputKind.PictureBody, TikzInputKind.Picture })
        foreach (var context in contexts)
        foreach (var tail in new[] { @"\unsupported", @"\draw (0,0)--(1,0);" })
        {
            var body = string.Format(context, "\\end{% ignored\r\n}" + tail);
            var source = "% 😀\r\n" + (kind == TikzInputKind.Picture ? @"\begin{tikzpicture}" + body + @"\end{tikzpicture}" : body);
            yield return [source, kind];
        }
        yield return [@"\end{}\draw (0,0)--(1,0);", TikzInputKind.PictureBody];
        yield return [@"\draw (0,0)--(1,0);\end{scope}", TikzInputKind.PictureBody];
    }

    [Theory]
    [MemberData(nameof(UnexpectedEnds))]
    public void Unexpected_ends_reject_without_discarding_a_body_tail(string source, TikzInputKind kind)
    {
        var options = TikzOptions.Default with { InputKind = kind };
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, options, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ001", diagnostic.Code);
        Assert.Equal(source.IndexOf(@"\end", StringComparison.Ordinal), diagnostic.Span.Offset);
        Assert.Equal(4, diagnostic.Span.Length);
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Theory]
    [InlineData(TikzInputKind.Picture)]
    [InlineData(TikzInputKind.PictureBody)]
    public void Nested_groups_and_environments_consume_their_bodies_and_preserve_following_statements(TikzInputKind kind)
    {
        const string body = @"{\begin{scope}\draw(0,0)--(1,0);{\draw(0,0)--(0,1);}\end{scope}}\draw(1,0)--(0,1);";
        const string flat = @"\draw(0,0)--(1,0);\draw(0,0)--(0,1);\draw(1,0)--(0,1);";
        var options = TikzOptions.Default with { InputKind = kind, IdPrefix = "bodies" };
        string Input(string value) => kind == TikzInputKind.Picture ? @"\begin{tikzpicture}" + value + @"\end{tikzpicture}" : value;
        var actual = Assert.IsType<TikzSuccess>(TikzConverter.Convert(Input(body), options, CancellationToken.None));
        var expected = Assert.IsType<TikzSuccess>(TikzConverter.Convert(Input(flat), options, CancellationToken.None));
        Assert.Equal(expected.Svg, actual.Svg);
        Assert.Equal(expected.PictureBounds, actual.PictureBounds);
        Assert.Equal(expected.InkBounds, actual.InkBounds);
    }
}

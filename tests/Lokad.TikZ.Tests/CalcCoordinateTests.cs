using System.Security.Cryptography;
using System.Text.Json;
using System.Globalization;
using Lokad.TikZ.Graphics;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class CalcCoordinateTests
{
    [Fact]
    public void Calculated_coordinates_match_native_integer_sp_anchors()
    {
        var sourceBytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Fixtures", "calc-coordinates.tikz"));
        using var native = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Reference", "CalcCoordinates", "points.json")));
        Assert.Equal(native.RootElement.GetProperty("sourceSha256").GetString(), Convert.ToHexStringLower(SHA256.HashData(sourceBytes)));
        var source = System.Text.Encoding.UTF8.GetString(sourceBytes);
        GraphicsScene? scene = null;
        var conversion = TikzConverter.ConvertWithTrace(source, TikzOptions.Default, CancellationToken.None, value => scene = value);
        Assert.True(conversion is TikzSuccess, string.Join(Environment.NewLine, conversion.Diagnostics.Select(d => $"{d.Code}: {d.Message}; {d.Span}")));
        var success = Assert.IsType<TikzSuccess>(conversion);
        Assert.Equal(Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, TikzOptions.Default, CancellationToken.None)).Svg, success.Svg);
        Assert.NotNull(scene);
        var expected = native.RootElement.GetProperty("points").EnumerateArray().ToArray();
        Assert.Equal(25, expected.Length);
        Assert.Equal(expected.Select(p => p.GetProperty("id").GetString()).Order(), scene.Coordinates.Keys.Order());
        var failures = new List<string>();
        foreach (var point in expected)
        {
            var id = point.GetProperty("id").GetString()!;
            var actual = scene.Coordinates[id];
            var x = (long)Math.Round(actual.X * 72.27 * 65536 / 72);
            var y = (long)Math.Round(actual.Y * 72.27 * 65536 / 72);
            var ex = point.GetProperty("xSp").GetInt64();
            var ey = point.GetProperty("ySp").GetInt64();
            if (x != ex || y != ey) failures.Add($"{id}: expected ({ex},{ey}) sp, actual ({x},{y}) sp");
        }
        Assert.True(failures.Count == 0, string.Join(Environment.NewLine, failures));
    }

    private static readonly TikzOptions Body = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody };
    private static readonly TikzOptions Calculations = Body with { Libraries = ["calc"] };

    [Theory]
    [InlineData("\\draw ($2*% factor comment\n(1,1)$)--(0,0);", @"\draw (2,2)--(0,0);")]
    [InlineData(@"\draw (1,1)--+($(1,0)+(1,0)$)--++($(0,1)+(0,1)$)--+($(1,0)$);", @"\draw (1,1)--(3,1)--(1,3)--(2,3);")]
    public void Factor_comments_and_relative_reference_updates_preserve_the_declared_path(string source, string absolute)
    {
        var options = Calculations with { IdPrefix = "calc-test" };
        var expected = Assert.IsType<TikzSuccess>(TikzConverter.Convert(absolute, options, CancellationToken.None));
        var actual = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, options, CancellationToken.None));
        Assert.Equal(expected.Svg, actual.Svg);
        Assert.Equal(expected.PictureBounds, actual.PictureBounds);
        Assert.Equal(expected.InkBounds, actual.InkBounds);
    }

    [Theory]
    [InlineData(@"\draw ($(0,0)+(1,0)$ -- (0,0);", "TIKZ001")]
    [InlineData(@"\draw ($(0,0)+(1,0))--(0,0);", "TIKZ001")]
    [InlineData(@"\draw ($2(0,0)$)--(1,0);", "TIKZ001")]
    [InlineData(@"\draw ($(0,0)!.5(1,1)$)--(1,0);", "TIKZ001")]
    [InlineData(@"\draw ($(0,0)!!(1,1)$)--(1,0);", "TIKZ001")]
    [InlineData(@"\draw ($(0,0)!.5!30pt:(1,1)$)--(1,0);", "TIKZ001")]
    [InlineData(@"\draw ($5pt*(1,0)$)--(1,0);", "TIKZ001")]
    [InlineData(@"\draw ($(missing)+(1,0)$)--(1,0);", "TIKZ003")]
    [InlineData(@"\draw ($unknown*(1,0)$)--(1,0);", "TIKZ003")]
    [InlineData(@"\draw (${1/0}*(1,0)$)--(1,0);", "TIKZ004")]
    [InlineData(@"\draw let \p1=(0,0) in (0,0)--(1,0);", "TIKZ002")]
    [InlineData(@"\draw (tangent cs:node=n,point={(0,0)})--(1,0);", "TIKZ002")]
    public void Invalid_or_deferred_forms_fail_with_original_source_spans(string source, string code)
    {
        var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Calculations, CancellationToken.None));
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal(code, diagnostic.Code);
        Assert.InRange(diagnostic.Span.Offset, 0, source.Length);
        Assert.InRange(diagnostic.Span.Length, 0, source.Length - diagnostic.Span.Offset);
        Assert.False(string.IsNullOrWhiteSpace(diagnostic.Message));
        Assert.Equal(0, failure.Statistics.OutputBytes);
    }

    [Fact]
    public void Library_loading_is_sequential_and_does_not_leak_between_conversions()
    {
        const string source = @"\draw ($(1,0)+(0,1)$)--(0,0);";
        Failure(source);
        Failure(source + @"\usetikzlibrary{calc}");
        Assert.IsType<TikzSuccess>(TikzConverter.Convert(@"\begin{scope}\usetikzlibrary{calc}\end{scope}" + source, Body, CancellationToken.None));
        Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, Calculations, CancellationToken.None));
        Failure(source);

        static void Failure(string value)
        {
            var result = Assert.IsType<TikzFailure>(TikzConverter.Convert(value, Body, CancellationToken.None));
            Assert.Equal("TIKZ002", Assert.Single(result.Diagnostics).Code);
        }
    }

    [Fact]
    public void Nested_calculations_and_flat_modifier_chains_share_limits_and_cancellation()
    {
        var expression = "(1,1)";
        for (var i = 0; i < 24; i++) expression = "($" + expression + "+(1,0)$)";
        var deep = "\\draw " + expression + "--(0,0);";
        var flat = "\\draw ($(1,1)" + string.Concat(Enumerable.Repeat("!.5!(2,2)", 24)) + "$)--(0,0);";
        foreach (var source in new[] { deep, flat })
        {
            var options = Calculations with { Limits = Calculations.Limits with { MaxExpressionDepth = 8 } };
            var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, options, CancellationToken.None));
            Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
            Assert.Equal(0, failure.Statistics.OutputBytes);
        }
        foreach (var limits in new[] { Calculations.Limits with { MaxWork = 1 }, Calculations.Limits with { MaxOutputBytes = 1 } })
        {
            var failure = Assert.IsType<TikzFailure>(TikzConverter.Convert(@"\draw ($(1,1)+(2,2)$)--(0,0);", Calculations with { Limits = limits }, CancellationToken.None));
            Assert.Equal("TIKZ005", Assert.Single(failure.Diagnostics).Code);
        }
        using var cancel = new CancellationTokenSource(); cancel.Cancel();
        var error = Assert.Throws<OperationCanceledException>(() => TikzConverter.Convert(deep, Calculations, cancel.Token));
        Assert.Equal(cancel.Token, error.CancellationToken);
    }

    [Fact]
    public void Calculation_results_are_invariant_across_cultures_and_concurrent_calls()
    {
        const string source = @"\coordinate (a) at (1.25,-.5);\coordinate (b) at (3,2);\draw ($(a)!.25!(b)$)--($2*(a)-(b)$);";
        var expected = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, Calculations, CancellationToken.None));
        Parallel.For(0, 16, new ParallelOptions { MaxDegreeOfParallelism = 4 }, index =>
        {
            var previous = CultureInfo.CurrentCulture;
            var previousUi = CultureInfo.CurrentUICulture;
            try
            {
                var culture = CultureInfo.GetCultureInfo(new[] { "en-US", "fr-FR", "tr-TR", "ar-SA" }[index % 4]);
                CultureInfo.CurrentCulture = culture;
                CultureInfo.CurrentUICulture = culture;
                var actual = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, Calculations, CancellationToken.None));
                Assert.Equal(expected.Svg, actual.Svg);
                Assert.Equal(expected.PictureBounds, actual.PictureBounds);
                Assert.Equal(expected.InkBounds, actual.InkBounds);
                Assert.Equal(expected.Statistics, actual.Statistics);
            }
            finally
            {
                CultureInfo.CurrentCulture = previous;
                CultureInfo.CurrentUICulture = previousUi;
            }
        });
    }
}

using System.Globalization;
using System.Text;
using System.Xml.Linq;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class CompleteDiagramCallTests
{
    [Fact]
    public void Mixed_complete_diagram_calls_keep_results_limits_and_cancellation_local()
    {
        string[] fixtures = ["flowchart-draw-color", "flowchart-styled-labels", "network-math-labels", "network-smooth-plot"];
        string[] cultures = ["en-US", "fr-FR", "tr-TR", "ar-SA"];
        string[] prefixes = ["probe-a", "probe-b"];
        var calls = new List<Action>();
        var successes = new List<Action>();
        var cancellations = new List<CancellationTokenSource>();
        try
        {
            for (var fixtureIndex = 0; fixtureIndex < fixtures.Length; fixtureIndex++)
            {
                var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Diagrams", fixtures[fixtureIndex] + ".tikz"));
                var options = prefixes.Select(prefix => TikzOptions.Default with { IdPrefix = prefix }).ToArray();
                var expected = options.Select(option => Assert.IsType<TikzSuccess>(Convert(source, option, cultures[0]))).ToArray();
                foreach (var (success, option) in expected.Zip(options))
                {
                    Assert.Empty(success.Diagnostics);
                    Assert.Equal(Encoding.UTF8.GetByteCount(success.Svg), success.Statistics.OutputBytes);
                    AssertOwnedReferences(success.Svg, option.IdPrefix);
                }
                Assert.NotEqual(expected[0].Svg, expected[1].Svg);

                var counts = expected[0].Statistics;
                TikzLimits[] limits = [
                    TikzLimits.Default with { MaxNodes = counts.Nodes - 1 },
                    TikzLimits.Default with { MaxSegments = counts.Segments - 1 },
                    TikzLimits.Default with { MaxGlyphs = counts.Glyphs - 1 },
                    TikzLimits.Default with { MaxWork = counts.Work - 1 },
                    TikzLimits.Default with { MaxOutputBytes = counts.OutputBytes - 1 }
                ];
                var failures = limits.Select((limit, index) =>
                {
                    var limited = options[0] with { Limits = limit };
                    var culture = cultures[index % cultures.Length];
                    var failure = Assert.IsType<TikzFailure>(Convert(source, limited, culture));
                    AssertBoundedFailure(source, limited.Limits, failure);
                    return (Action)(() =>
                    {
                        var actual = Assert.IsType<TikzFailure>(Convert(source, limited, culture));
                        AssertBoundedFailure(source, limited.Limits, actual);
                        AssertDiagnosticsAndStatistics(failure, actual);
                    });
                }).ToArray();

                var cancellation = new CancellationTokenSource();
                cancellations.Add(cancellation);
                cancellation.Cancel();
                var cancellationCulture = cultures[fixtureIndex];
                Action cancelledCall = () => InCulture(cancellationCulture, () =>
                {
                    var error = Assert.Throws<OperationCanceledException>(() =>
                        TikzConverter.Convert(source, options[0], cancellation.Token));
                    Assert.Equal(cancellation.Token, error.CancellationToken);
                    return 0;
                });

                for (var index = 0; index < cultures.Length * prefixes.Length; index++)
                {
                    var culture = cultures[index / prefixes.Length];
                    var prefixIndex = index % prefixes.Length;
                    Action successCall = () => AssertSuccess(expected[prefixIndex],
                        Assert.IsType<TikzSuccess>(Convert(source, options[prefixIndex], culture)));
                    successes.Add(successCall);
                    calls.Add(successCall);
                    if (index < failures.Length) calls.Add(failures[index]);
                    if (index == failures.Length) calls.Add(cancelledCall);
                }
            }
            Assert.Equal(32, successes.Count);
            Assert.Equal(56, calls.Count);
            foreach (var call in calls) call();
            Parallel.For(0, calls.Count * 2, new ParallelOptions { MaxDegreeOfParallelism = 4 },
                index => calls[index % calls.Count]());
            foreach (var success in successes) success();
        }
        finally
        {
            foreach (var cancellation in cancellations) cancellation.Dispose();
        }
    }

    private static TikzConversionResult Convert(string source, TikzOptions options, string culture)
        => InCulture(culture, () => TikzConverter.Convert(source, options, CancellationToken.None));

    private static T InCulture<T>(string name, Func<T> operation)
    {
        var previous = CultureInfo.CurrentCulture;
        var previousUi = CultureInfo.CurrentUICulture;
        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo(name);
            CultureInfo.CurrentUICulture = CultureInfo.GetCultureInfo(name);
            var result = operation();
            Assert.Equal(name, CultureInfo.CurrentCulture.Name);
            Assert.Equal(name, CultureInfo.CurrentUICulture.Name);
            return result;
        }
        finally
        {
            CultureInfo.CurrentCulture = previous;
            CultureInfo.CurrentUICulture = previousUi;
        }
    }

    private static void AssertSuccess(TikzSuccess expected, TikzSuccess actual)
    {
        Assert.Equal(expected.Svg, actual.Svg);
        Assert.Equal(expected.PictureBounds, actual.PictureBounds);
        Assert.Equal(expected.InkBounds, actual.InkBounds);
        AssertDiagnosticsAndStatistics(expected, actual);
    }

    private static void AssertDiagnosticsAndStatistics(TikzConversionResult expected, TikzConversionResult actual)
    {
        Assert.Equal(expected.Statistics, actual.Statistics);
        Assert.Equal(expected.Diagnostics.Count, actual.Diagnostics.Count);
        for (var index = 0; index < expected.Diagnostics.Count; index++)
        {
            var first = expected.Diagnostics[index];
            var second = actual.Diagnostics[index];
            Assert.Equal(first.Code, second.Code);
            Assert.Equal(first.Message, second.Message);
            Assert.Equal(first.Span, second.Span);
            Assert.Equal(first.Feature, second.Feature);
            Assert.Equal(first.RelatedLocations.ToArray(), second.RelatedLocations.ToArray());
        }
    }

    private static void AssertBoundedFailure(string source, TikzLimits limits, TikzFailure failure)
    {
        var diagnostic = Assert.Single(failure.Diagnostics);
        Assert.Equal("TIKZ005", diagnostic.Code);
        Assert.InRange(diagnostic.Span.Offset, 0, source.Length);
        Assert.InRange(diagnostic.Span.Length, 0, source.Length - diagnostic.Span.Offset);
        Assert.True(diagnostic.Span.Line > 0 && diagnostic.Span.Column > 0);
        Assert.Equal(0, failure.Statistics.OutputBytes);
        Assert.InRange(failure.Statistics.Nodes, 0, limits.MaxNodes);
        Assert.InRange(failure.Statistics.Segments, 0, limits.MaxSegments);
        Assert.InRange(failure.Statistics.Glyphs, 0, limits.MaxGlyphs);
        Assert.InRange(failure.Statistics.Work, 0L, limits.MaxWork);
    }

    private static void AssertOwnedReferences(string svg, string prefix)
    {
        var elements = XDocument.Parse(svg).Root!.DescendantsAndSelf().ToArray();
        var names = elements.Attributes("id").Select(attribute => attribute.Value).ToArray();
        Assert.NotEmpty(names);
        var ids = names.ToHashSet(StringComparer.Ordinal);
        Assert.Equal(names.Length, ids.Count);
        Assert.All(ids, id => Assert.StartsWith(prefix, id, StringComparison.Ordinal));
        foreach (var attribute in elements.Attributes().Where(attribute => attribute.Name.LocalName is "href" or "clip-path"))
        {
            var value = attribute.Value;
            if (attribute.Name.LocalName == "href")
            {
                Assert.StartsWith("#", value);
                Assert.Contains(value[1..], ids);
            }
            else
            {
                Assert.StartsWith("url(#", value);
                Assert.EndsWith(")", value);
                Assert.Contains(value[5..^1], ids);
            }
        }
    }
}

using System.Globalization;
using System.Text.Json;
using Lokad.TikZ;
using TikzAdversarial;
using static TikzAdversarial.Checks;

Require(args.Length == 2 && args[0] is "generate" or "replay", "Usage: TikzAdversarial generate|replay <run-directory>");
string folder = Path.GetFullPath(args[1]);
Directory.CreateDirectory(folder);
CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;
CultureInfo.CurrentUICulture = CultureInfo.InvariantCulture;
var cases = Corpus.Create();
Require(cases.Count == Corpus.Count && cases.Select(c => c.Id).Distinct().Count() == cases.Count, "Corpus identity changed");
string phase = "start", currentCase = "";
try
{
    if (args[0] == "replay")
    {
        phase = "saved-code-unit-replay";
        using var saved = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(folder, "cases.json")));
        var inputs = saved.RootElement.EnumerateArray().ToArray();
        var expected = JsonSerializer.Deserialize<Observation[]>(File.ReadAllBytes(Path.Combine(folder, "results.json")))!;
        Require(inputs.Length == cases.Count && expected.Length == cases.Count, "Lost or extra saved inputs/results");
        int nonScalarSources = 0;
        for (int index = 0; index < cases.Count; index++)
        {
            var item = inputs[index]; currentCase = cases[index].Id;
            Require(item.GetProperty("Id").GetString() == currentCase, "Reordered saved input");
            var units = item.GetProperty("SourceUtf16CodeUnits").EnumerateArray().Select(x => x.GetInt32()).ToArray();
            Require(units.Length <= 20_000 && units.All(x => x is >= 0 and <= ushort.MaxValue), "Invalid saved UTF-16 units");
            string source = new(units.Select(x => (char)x).ToArray());
            Require(source == cases[index].Source, "Saved source differs from the deterministic corpus");
            if (source != item.GetProperty("Source").GetString()) nonScalarSources++;
            var observed = Checks.Convert(new InputCase(currentCase, source), index < Corpus.ValidSeeds, index >= cases.Count - Corpus.StressProbes);
            Require(observed == expected[index], "Saved conversion result differs");
        }
        Require(nonScalarSources > 0, "Corpus lost non-scalar UTF-16 coverage");
        Save("replay.json", new { completed = true, phase = "complete", reproduced = cases.Count, nonScalarSources,
            assemblySha256 = Hash(File.ReadAllBytes(typeof(TikzConverter).Assembly.Location)) });
        Console.WriteLine(JsonSerializer.Serialize(new { completed = true, reproduced = cases.Count, nonScalarSources }));
        return 0;
    }

    Save("cases.json", cases);
    var observations = new Observation?[cases.Count];
    var failures = new List<object>();
    int unexpected = 0, cultureChecks = 0, parallelChecks = 0, cancellationChecks = 0;
    phase = "all-generated-inputs";
    for (int index = 0; index < cases.Count; index++)
    {
        currentCase = cases[index].Id;
        try { observations[index] = Checks.Convert(cases[index], index < Corpus.ValidSeeds, index >= cases.Count - Corpus.StressProbes); }
        catch (Exception error) { Failure("invariant-or-unexpected-exception", cases[index], error); unexpected++; }
    }
    var selected = Enumerable.Range(0, cases.Count).Where(i => observations[i] is not null)
        .OrderBy(i => i < Corpus.ValidSeeds ? 0 : observations[i]!.success ? 1 : 2)
        .ThenBy(i => unchecked((uint)i * 2654435761U)).Take(512).ToArray();
    phase = "culture";
    foreach (var culture in new[] { "fr-FR", "tr-TR", "ar-SA", "en-US" })
    {
        CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo(culture);
        CultureInfo.CurrentUICulture = CultureInfo.GetCultureInfo(culture);
        foreach (int index in selected)
        {
            currentCase = cases[index].Id;
            try { Require(Checks.Convert(cases[index]) == observations[index], "Culture-dependent result: " + culture); cultureChecks++; }
            catch (Exception error) { Failure("culture", cases[index], error); }
        }
    }
    CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;
    CultureInfo.CurrentUICulture = CultureInfo.InvariantCulture;
    phase = "concurrency";
    Parallel.ForEach(selected, new ParallelOptions { MaxDegreeOfParallelism = 4 }, index =>
    {
        try { Require(Checks.Convert(cases[index]) == observations[index], "Concurrent result differs"); Interlocked.Increment(ref parallelChecks); }
        catch (Exception error) { lock (failures) Failure("concurrency", cases[index], error); }
    });
    phase = "caller-cancellation";
    foreach (int index in selected.Take(64))
    {
        currentCase = cases[index].Id;
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        try
        {
            TikzConverter.Convert(cases[index].Source, Options, cancellation.Token);
            Failure("cancellation", cases[index], new InvalidOperationException("Did not throw"));
        }
        catch (OperationCanceledException error)
        {
            Require(error.CancellationToken == cancellation.Token, "Cancellation token changed"); cancellationChecks++;
        }
    }
    Save("results.json", observations);
    Save("selection.json", selected.Select(i => cases[i].Id).ToArray());
    int successes = observations.Count(o => o?.success == true);
    Save("worker.json", new
    {
        completed = failures.Count == 0, phase = "complete", seed = Corpus.Seed, cases = cases.Count,
        successes, diagnosticFailures = observations.Count(o => o?.success == false), unexpected,
        cultureChecks, parallelChecks, cancellationChecks, failures, options = Options,
        assemblySha256 = Hash(File.ReadAllBytes(typeof(TikzConverter).Assembly.Location))
    });
    Console.WriteLine(JsonSerializer.Serialize(new { completed = failures.Count == 0, cases = cases.Count, successes, unexpected, failures = failures.Count }));
    return failures.Count == 0 ? 0 : 1;

    void Failure(string category, InputCase item, Exception error)
    {
        if (failures.Count < 16) failures.Add(new { item.Id, category, type = error.GetType().FullName, error.Message, source = item });
    }
}
catch (Exception error)
{
    Save("failure.json", new { completed = false, phase, currentCase, type = error.GetType().FullName, error.Message });
    Console.Error.WriteLine(JsonSerializer.Serialize(new { completed = false, phase, currentCase, error.Message }));
    return 1;
}

void Save(string file, object value) => File.WriteAllBytes(Path.Combine(folder, file), JsonSerializer.SerializeToUtf8Bytes(value, value.GetType()));

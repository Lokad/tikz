using System.Text.Json;

internal static partial class ReferenceTool
{
    private static async Task<int> NodeInteractionPdf(string[] args)
    {
        var options = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var i = 1; i < args.Length; i += 2)
            if (i + 1 == args.Length || args[i] is not ("--case" or "--out") || !options.TryAdd(args[i][2..], args[i + 1]))
                throw new InvalidOperationException("Usage: TikzReference compare-node-interaction-pdf [--case id] [--out artifacts/...]. The reviewed profile combines RGB/ink primary and white-paper PDF gates.");
        var output = ArtifactDirectory(options.GetValueOrDefault("out", "artifacts/node-interaction-pdf"));
        Directory.CreateDirectory(output);
        File.Delete(Path.Combine(output, "suite.json")); File.Delete(Path.Combine(output, "index.html"));
        var primaryArguments = new List<string> { "compare-node-interaction-primary", "--out", Relative(output) };
        if (options.TryGetValue("case", out var id)) primaryArguments.AddRange(["--case", id]);
        var primaryExit = await NodeInteractionPrimary(primaryArguments.ToArray());
        var primarySuite = Read<JsonElement>(Path.Combine(output, "suite.json"));
        File.Move(Path.Combine(output, "suite.json"), Path.Combine(output, "primary-suite.json"), true);
        var cases = primarySuite.GetProperty("expectedCases").EnumerateArray().Select(c => c.GetString()!).ToArray();
        var results = new List<object>();
        var exit = primaryExit > 1 ? primaryExit : 0;
        if (primaryExit <= 1 && primarySuite.GetProperty("completed").GetBoolean())
            foreach (var c in cases)
            {
                var folder = Path.Combine(output, c);
                var compared = await Process(ResolveExecutable("node"), [At("tools/TikzVisual/compare-interaction-pdf.mjs"), folder], Root);
                if (compared.ExitCode is not (0 or 1) || !File.Exists(Path.Combine(folder, "report.json")))
                    throw new InvalidOperationException("Reviewed interaction PDF runner failed: " + compared.Output);
                var report = Read<JsonElement>(Path.Combine(folder, "report.json"));
                if (!report.TryGetProperty("completed", out var completed) || !completed.GetBoolean()
                    || !report.TryGetProperty("pdfPolicy", out var policy)
                    || policy.GetProperty("id").GetString() != "chromium-153-node-interactions-rgb-ink-pdf-page-v1"
                    || !policy.GetProperty("approvedPdfPolicy").GetBoolean()
                    || (report.GetProperty("verdict").GetString() == "pass") != (compared.ExitCode == 0))
                    throw new InvalidOperationException("Incomplete or incompatible combined interaction PDF report.");
                results.Add(new { caseId = c, exitCode = compared.ExitCode, report = c + "/report.json" });
                exit = Math.Max(exit, compared.ExitCode); Console.WriteLine(compared.Output.Trim());
            }
        var passed = exit == 0 && results.Count == cases.Length;
        Write(Path.Combine(output, "suite.json"), new { schemaVersion = 1, completed = results.Count == cases.Length,
            command = args[0], scope = "Reviewed RGB/ink primary plus independently calibrated white-paper ordinary PDF gates",
            expectedCases = cases, executedCases = results, passed });
        var links = string.Join("\n", cases.Select(c => $"<li><a href=\"{c}/index.html\">{c}</a> · <a href=\"{c}/report.json\">combined report</a></li>"));
        File.WriteAllText(Path.Combine(output, "index.html"), $"<!doctype html><meta charset=\"utf-8\"><title>TikZ interaction PDF</title><h1>Combined interaction PDF: {(passed ? "pass" : "failure")}</h1><p>Native numeric, natural dimensions, primary SVG, and original/candidate SVG versus ordinary PDF must all pass.</p><ul>{links}</ul><a href=\"suite.json\">suite</a>");
        return passed ? 0 : Math.Max(1, exit);
    }
}

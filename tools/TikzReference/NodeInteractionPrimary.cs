using System.Text.Json;

internal static partial class ReferenceTool
{
    private static async Task<int> NodeInteractionPrimary(string[] args)
    {
        var options = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var i = 1; i < args.Length; i += 2)
            if (i + 1 == args.Length || args[i] is not ("--case" or "--out") || !options.TryAdd(args[i][2..], args[i + 1]))
                throw new InvalidOperationException("Usage: TikzReference compare-node-interaction-primary [--case id] [--out artifacts/...]. The reviewed profile is RGB with independent ink framing, primary SVG only.");
        var output = ArtifactDirectory(options.GetValueOrDefault("out", "artifacts/node-interaction-primary"));
        Directory.CreateDirectory(output);
        File.Delete(Path.Combine(output, "suite.json")); File.Delete(Path.Combine(output, "index.html"));
        // Reuse the complete cached-reference/public-converter/numeric path.
        // Preserve its exact comparison before applying the reviewed policy.
        var rawArguments = new List<string> { "compare-node-interactions", "--profile", "rgb", "--framing", "ink", "--out", Relative(output) };
        if (options.TryGetValue("case", out var id)) rawArguments.AddRange(["--case", id]);
        var rawExit = await NodeInteractions(rawArguments.ToArray());
        var exactSuite = Read<JsonElement>(Path.Combine(output, "suite.json"));
        File.Move(Path.Combine(output, "suite.json"), Path.Combine(output, "exact-suite.json"), true);
        var cases = exactSuite.GetProperty("expectedCases").EnumerateArray().Select(c => c.GetString()!).ToArray();
        var results = new List<object>();
        var exit = rawExit > 1 ? rawExit : 0;
        if (rawExit <= 1)
            foreach (var c in cases)
            {
                var folder = Path.Combine(output, c);
                File.Copy(Path.Combine(folder, "report.json"), Path.Combine(folder, "exact-report.json"), true);
                var compared = await Process(ResolveExecutable("node"), [At("tools/TikzVisual/compare-interaction-primary.mjs"), folder], Root);
                if (compared.ExitCode is not (0 or 1) || !File.Exists(Path.Combine(folder, "report.json")))
                    throw new InvalidOperationException("Reviewed interaction runner failed: " + compared.Output);
                results.Add(new { caseId = c, exitCode = compared.ExitCode, report = c + "/report.json" });
                exit = Math.Max(exit, compared.ExitCode);
                Console.WriteLine(compared.Output.Trim());
            }
        Write(Path.Combine(output, "suite.json"), new { schemaVersion = 1, completed = results.Count == cases.Length,
            command = args[0], scope = "Reviewed RGB/stroke-ink primary interaction profile; ordinary PDF conformance pending",
            expectedCases = cases, executedCases = results, passed = exit == 0 && results.Count == cases.Length });
        var links = string.Join("\n", cases.Select(c => $"<li><a href=\"{c}/index.html\">{c}</a> · <a href=\"{c}/report.json\">report</a> · <a href=\"{c}/exact-report.json\">raw exact report</a></li>"));
        File.WriteAllText(Path.Combine(output, "index.html"), $"<!doctype html><meta charset=\"utf-8\"><title>TikZ interaction primary</title><h1>Interaction primary: {(exit == 0 ? "pass" : "failure")}</h1><p>RGB with independent stroke-ink framing. Numeric, global and all regional gates are required. Ordinary PDF conformance is pending.</p><ul>{links}</ul><a href=\"suite.json\">suite</a>");
        return exit;
    }
}

using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using TikzShapePdfReference;

internal static class Program
{
    private const string ProfilePath = "tests/Reference/NodeShapes/pdf-oracle-profile.json";
    private const string Baseline = "tests/Reference/NodeShapes/pdf";
    private const string SnapshotPath = "tests/Reference/NodeShapes/pdf-snapshot.json";
    private const string Native = "tests/Reference/NodeShapes/native";
    private const string Source = "tests/Fixtures/Nodes/shapes.tikz";
    private const string Wrapper = "tools/TikzShapeReference/shapes.tex";
    private const string Id = "pgf-3.1.11a-circle-ellipse-pdf-page-sp-v1";
    private static readonly string[] Artifacts = ["reference.pdf", "plain-reference.pdf", "pdf-page-1x.png", "pdf-page-4x.png", "plain-pdf-page-1x.png", "plain-pdf-page-4x.png",
        "pdf.log", "plain-pdf.log", "wrapper.tex", "probes.tex", "metrics.json", "pdf-info.txt", "pdf-fonts.txt"];
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true, NewLine = "\n" };
    private static string root = "";
    private static Profile profile = null!;
    private sealed record Profile(int SchemaVersion, string Id, string PdfLatexVersion, string PdfRasterizerVersion,
        string PdfInfoVersion, string PdfFontsVersion, string KpseVersion, string PgfVersion, string Driver, int PageWidthSp, int PageHeightSp, int[] Scales,
        int MaxPagePixels, int ProcessTimeoutSeconds, int MaxCapturedCharacters);
    private sealed record Tool(string Executable, string Name, string Version, string Sha256);
    private sealed record Input(string Path, string Sha256);

    private static async Task<int> Main(string[] args)
    {
        try
        {
            if (args.Length != 1 && !(args.Length == 3 && args[0] == "check-cached" && args[1] == "--baseline")) throw new InvalidOperationException("Usage: TikzShapePdfReference <generate|verify|check-cached> [check-cached --baseline artifacts/...].");
            if (args[0] is not ("generate" or "verify" or "check-cached")) throw new InvalidOperationException("Unknown PDF oracle command.");
            root = FindRoot(); profile = Read<Profile>(At(ProfilePath));
            Require(profile.SchemaVersion == 1 && profile.Id == Id && profile.Driver == "pgfsys-pdftex.def" && profile.PgfVersion == "3.1.11a"
                && profile.PageWidthSp == 600 * 65536 && profile.PageHeightSp == 800 * 65536 && profile.Scales.SequenceEqual(new[] { 1, 4 })
                && profile.MaxPagePixels == 20000000 && profile.ProcessTimeoutSeconds is > 0 and <= 60 && profile.MaxCapturedCharacters is > 0 and <= 1000000, "Incompatible PDF oracle profile.");
            var configuration = Directory.GetParent(AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar))!.Name;
            var verifier = At($"tools/TikzShapeReference/bin/{configuration}/net10.0/TikzShapeReference.dll");
            await Run(Resolve("dotnet"), [verifier, "check-cached"], root);
            if (args[0] == "check-cached")
            {
                var baseline = args.Length == 1 ? At(Baseline) : Path.GetFullPath(args[2], root);
                if (args.Length != 1) Require(baseline.StartsWith(At("artifacts") + Path.DirectorySeparatorChar, PathComparison), "Cached control baseline must be inside artifacts/.");
                Guard(baseline, args.Length == 1 ? At("tests/Reference/NodeShapes") : At("artifacts"));
                Cached(baseline);
                Console.WriteLine("Cached ordinary shape PDF: 1,810 native records, independent page position, plain/probed PDF and raster invariance. No candidate or tolerance claim.");
                return 0;
            }
            var tools = new[] { await Identify("pdflatex", ["--version"], profile.PdfLatexVersion), await Identify("pdftoppm", ["-v"], profile.PdfRasterizerVersion),
                await Identify("pdfinfo", ["-v"], profile.PdfInfoVersion), await Identify("pdffonts", ["-v"], profile.PdfFontsVersion), await Identify("kpsewhich", ["--version"], profile.KpseVersion) };
            var lookup = tools.Single(t => t.Name == "kpsewhich");
            using (var fonts = JsonDocument.Parse(Text(At("tools/TikzFontData/font-profile.json"))))
                foreach (var input in fonts.RootElement.GetProperty("inputs").EnumerateArray())
                {
                    var name = input.GetProperty("name").GetString()!;
                    var location = (await Run(lookup.Executable, [name], root)).Trim();
                    Require(File.Exists(location) && Hash(location) == input.GetProperty("sha256").GetString(), "Changed or missing pinned font input: " + name);
                }
            var work = At("artifacts/node-shape-pdf-reference/run-" + Guid.NewGuid().ToString("N")); Guard(work, At("artifacts")); Directory.CreateDirectory(work);
            var wrapper = BuildWrapper(); var probes = Text(At(Native + "/probes.tex"));
            foreach (var mode in new[] { "plain", "probed" })
            {
                var folder = Path.Combine(work, mode); Directory.CreateDirectory(folder);
                File.WriteAllText(Path.Combine(folder, "case.tex"), (mode == "probed" ? "\\AtBeginDocument{\\lokadprobestrue}\n" : "") + wrapper);
                File.WriteAllText(Path.Combine(folder, "case.tikz"), Text(At(Source))); File.WriteAllText(Path.Combine(folder, "probes.tex"), probes);
                await Run(tools[0].Executable, ["-disable-write18", "-disable-installer", "-interaction=nonstopmode", "-halt-on-error", "-recorder", "case.tex"], folder);
                foreach (var scale in profile.Scales) await Run(tools[1].Executable, ["-r", (96 * scale).ToString(CultureInfo.InvariantCulture), "-png", "-singlefile", "case.pdf", "page-" + scale + "x"], folder);
            }
            var plain = Path.Combine(work, "plain"); var probed = Path.Combine(work, "probed");
            var plainLog = Text(Path.Combine(plain, "case.log")); var log = Text(Path.Combine(probed, "case.log"));
            var measurement = PdfEvidence.Read(Text(At(Native + "/oracle.log")), log, plainLog);
            Require(Hash(Path.Combine(plain, "case.pdf")) == Hash(Path.Combine(probed, "case.pdf")), "PDF probes changed ordinary document bytes.");
            var sizes = new Dictionary<string, PdfEvidence.PixelSize>();
            foreach (var scale in profile.Scales)
            {
                var file = "page-" + scale + "x.png";
                Require(Hash(Path.Combine(plain, file)) == Hash(Path.Combine(probed, file)), "PDF probes changed raster pixels.");
                var size = PdfEvidence.PngSize(File.ReadAllBytes(Path.Combine(probed, file)));
                Require(size == PdfEvidence.ExpectedRaster(measurement.Page, scale), "PDF raster dimensions differ from native page dimensions."); sizes.Add(scale + "x", size);
            }
            var info = await Run(tools[2].Executable, ["case.pdf"], probed); var fontInfo = await Run(tools[3].Executable, ["case.pdf"], probed);
            ValidateInfo(info, fontInfo, measurement.Page);
            var generated = Path.Combine(work, "generated"); Directory.CreateDirectory(generated);
            Copy(probed, "case.pdf", "reference.pdf"); Copy(plain, "case.pdf", "plain-reference.pdf");
            foreach (var scale in profile.Scales) { Copy(probed, "page-" + scale + "x.png", "pdf-page-" + scale + "x.png"); Copy(plain, "page-" + scale + "x.png", "plain-pdf-page-" + scale + "x.png"); }
            Save("pdf.log", Sanitize(log)); Save("plain-pdf.log", Sanitize(plainLog)); Save("wrapper.tex", wrapper); Save("probes.tex", probes);
            Save("pdf-info.txt", Sanitize(info).TrimEnd('\n') + "\n"); Save("pdf-fonts.txt", Sanitize(fontInfo).TrimEnd('\n') + "\n");
            Write(Path.Combine(generated, "metrics.json"), new { schemaVersion = 1, profile = Id, comparisonKind = "independent-ordinary-shape-pdf", converterInvoked = false,
                conformanceClaim = false, approvedImagePolicy = false, measurement, rasterSizes = sizes, nativeRecordCount = 1810 });
            var inputs = RecordedInputs(plain).Concat(RecordedInputs(probed)).Distinct().OrderBy(i => i.Path, StringComparer.Ordinal).ToArray();
            Require(inputs.GroupBy(i => i.Path).All(g => g.Select(i => i.Sha256).Distinct().Count() == 1), "Recorded PDF inputs have ambiguous names.");
            Require(inputs.Any(i => i.Path == "tex/pgfsys-pdftex.def") && !inputs.Any(i => i.Path == "tex/pgfsys-dvisvgm.def"), "Ordinary PDF driver input was not recorded.");
            var hashes = Artifacts.ToDictionary(file => file, file => Hash(Path.Combine(generated, file)), StringComparer.Ordinal);
            var toolIdentities = tools.Select(t => new { t.Name, t.Version, t.Sha256 }).ToArray();
            var assemblySha256 = Hash(typeof(Program).Assembly.Location);
            var frameworkReferences = typeof(Program).Assembly.GetReferencedAssemblies().Select(a => a.Name).Order().ToArray();
            var snapshot = new { schemaVersion = 1, profile = Id, scope = "Fixed ordinary PDF artifacts from the trusted 28-node fixture. Original native SVG baseline is unchanged. No image/PDF tolerance or candidate admission.", artifacts = hashes,
                tools = toolIdentities, inputs, assemblySha256, frameworkReferences };
            var snapshotText = Serialize(snapshot);
            var sources = SourceHashes(); sources[SnapshotPath] = HashText(snapshotText);
            var provenance = new { schemaVersion = 1, profile = Id, converterInvoked = false, conformanceClaim = false, approvedImagePolicy = false,
                sourceHashes = sources, tools = toolIdentities, inputs, artifacts = hashes,
                probeInvariance = new { pdfByteIdentical = true, rasterByteIdentical = true, pictureBoxIdentical = true, savedPagePositionIdentical = true },
                nativeAgreement = new { recordCount = 1810, nativeSvgSha256 = Hash(At(Native + "/reference.svg")), nativeMetricsSha256 = Hash(At(Native + "/metrics.json")), nativeLogSha256 = Hash(At(Native + "/oracle.log")) },
                assemblySha256, frameworkReferences,
                configuration, runtime = Environment.Version.ToString(),
                commands = new[] { "pdflatex -disable-write18 -disable-installer -interaction=nonstopmode -halt-on-error -recorder case.tex (plain/probed)", "pdftoppm -r 96/384 -png -singlefile case.pdf page-1x/4x (plain/probed)", "pdfinfo case.pdf", "pdffonts case.pdf" } };
            Write(Path.Combine(generated, "provenance.json"), provenance);
            if (args[0] == "generate")
            {
                Guard(At(Baseline), At("tests/Reference/NodeShapes")); Directory.CreateDirectory(At(Baseline));
                foreach (var file in Artifacts.Append("provenance.json")) { var target = At(Baseline + "/" + file); Guard(target, At("tests/Reference/NodeShapes")); File.Copy(Path.Combine(generated, file), target, true); }
                Guard(At(SnapshotPath), At("tests/Reference/NodeShapes")); File.WriteAllText(At(SnapshotPath), snapshotText);
            }
            else
            {
                Cached(At(Baseline));
                using var expected = JsonDocument.Parse(Text(At(SnapshotPath)));
                // Original cached logs remain immutable; live logs have engine timestamps and statistics.
                // Their complete native records, page position and probe invariance were checked above.
                foreach (var file in Artifacts.Except(new[] { "pdf.log", "plain-pdf.log" }))
                    Require(expected.RootElement.GetProperty("artifacts").GetProperty(file).GetString() == hashes[file],
                        "Fresh ordinary PDF artifact differs from cached evidence: " + file + "; baseline unchanged.");
                using var old = JsonDocument.Parse(Text(At(Baseline + "/provenance.json"))); using var current = JsonDocument.Parse(Serialize(provenance));
                foreach (var property in new[] { "tools", "inputs" }) Require(SameJson(old.RootElement.GetProperty(property), current.RootElement.GetProperty(property)), "Fresh PDF tool/input identities differ.");
            }
            Console.WriteLine(args[0] + ": ordinary PDF, 1,810 matching native records, exact plain/probed PDF and 1x/4x PNG bytes, measured shipped-out origin, two embedded fonts; image/PDF admission pending.");
            return 0;
            void Copy(string directory, string file, string target) => File.Copy(Path.Combine(directory, file), Path.Combine(generated, target), true);
            void Save(string file, string text) => File.WriteAllText(Path.Combine(generated, file), text);
        }
        catch (Exception error) when (error is not OutOfMemoryException) { Console.Error.WriteLine("Shape PDF oracle failure: " + Sanitize(error.Message)); return 2; }
    }

    private static void Cached(string baseline)
    {
        using var snapshot = JsonDocument.Parse(Text(At(SnapshotPath))); using var provenance = JsonDocument.Parse(Text(Path.Combine(baseline, "provenance.json")));
        var s = snapshot.RootElement; var p = provenance.RootElement;
        Require(s.GetProperty("schemaVersion").GetInt32() == 1 && p.GetProperty("schemaVersion").GetInt32() == 1
            && s.GetProperty("profile").GetString() == Id && p.GetProperty("profile").GetString() == Id
            && !p.GetProperty("converterInvoked").GetBoolean() && !p.GetProperty("conformanceClaim").GetBoolean() && !p.GetProperty("approvedImagePolicy").GetBoolean(), "Incompatible cached PDF identity.");
        Require(s.GetProperty("artifacts").EnumerateObject().Select(x => x.Name).Order().SequenceEqual(Artifacts.Order()), "Incomplete cached PDF artifacts.");
        Require(SameJson(p.GetProperty("artifacts"), s.GetProperty("artifacts")), "PDF provenance differs from the external immutable artifact snapshot.");
        foreach (var property in new[] { "tools", "inputs", "assemblySha256", "frameworkReferences" })
            Require(SameJson(p.GetProperty(property), s.GetProperty(property)), "PDF " + property + " differ from the external immutable snapshot.");
        var toolNames = p.GetProperty("tools").EnumerateArray().Select(t => t.GetProperty("name").GetString()).ToArray();
        Require(toolNames.SequenceEqual(new[] { "pdflatex", "pdftoppm", "pdfinfo", "pdffonts", "kpsewhich" }), "Incomplete PDF tool identities.");
        foreach (var property in new[] { "pdfByteIdentical", "rasterByteIdentical", "pictureBoxIdentical", "savedPagePositionIdentical" })
            Require(p.GetProperty("probeInvariance").GetProperty(property).GetBoolean(), "False cached PDF probe invariance.");
        var agreement = p.GetProperty("nativeAgreement");
        Require(agreement.GetProperty("recordCount").GetInt32() == 1810
            && agreement.GetProperty("nativeSvgSha256").GetString() == Hash(At(Native + "/reference.svg"))
            && agreement.GetProperty("nativeMetricsSha256").GetString() == Hash(At(Native + "/metrics.json"))
            && agreement.GetProperty("nativeLogSha256").GetString() == Hash(At(Native + "/oracle.log")), "Changed native SVG/PDF agreement.");
        foreach (var item in s.GetProperty("artifacts").EnumerateObject()) { var file = Path.Combine(baseline, item.Name); Guard(file, baseline); Require(Hash(file) == item.Value.GetString(), "Cached PDF artifact changed: " + item.Name); }
        var sources = SourceHashes(); sources[SnapshotPath] = Hash(At(SnapshotPath));
        Require(Serialize(sources).Trim() == JsonSerializer.Serialize(p.GetProperty("sourceHashes"), Json).Trim(), "Cached PDF sources changed.");
        var measurement = PdfEvidence.Read(Text(At(Native + "/oracle.log")), Text(Path.Combine(baseline, "pdf.log")), Text(Path.Combine(baseline, "plain-pdf.log")));
        using var metrics = JsonDocument.Parse(Text(Path.Combine(baseline, "metrics.json")));
        var m = metrics.RootElement;
        Require(m.GetProperty("schemaVersion").GetInt32() == 1 && m.GetProperty("profile").GetString() == Id
            && m.GetProperty("comparisonKind").GetString() == "independent-ordinary-shape-pdf"
            && !m.GetProperty("converterInvoked").GetBoolean() && !m.GetProperty("conformanceClaim").GetBoolean()
            && !m.GetProperty("approvedImagePolicy").GetBoolean() && m.GetProperty("nativeRecordCount").GetInt32() == 1810,
            "Incompatible cached PDF measurement identity.");
        Require(JsonSerializer.Serialize(measurement, Json) == JsonSerializer.Serialize(metrics.RootElement.GetProperty("measurement"), Json), "Cached native/page measurements changed.");
        Require(Text(Path.Combine(baseline, "wrapper.tex")) == BuildWrapper() && Text(Path.Combine(baseline, "probes.tex")) == Text(At(Native + "/probes.tex")), "Cached PDF wrapper/probes changed.");
        Require(Hash(Path.Combine(baseline, "reference.pdf")) == Hash(Path.Combine(baseline, "plain-reference.pdf")), "Cached PDF probe invariance failed.");
        foreach (var scale in profile.Scales)
        {
            var file = "pdf-page-" + scale + "x.png"; Require(Hash(Path.Combine(baseline, file)) == Hash(Path.Combine(baseline, "plain-" + file)), "Cached raster invariance failed.");
            var size = PdfEvidence.PngSize(File.ReadAllBytes(Path.Combine(baseline, file)));
            Require(size == PdfEvidence.ExpectedRaster(measurement.Page, scale)
                && JsonSerializer.Serialize(size, Json) == JsonSerializer.Serialize(m.GetProperty("rasterSizes").GetProperty(scale + "x"), Json), "Cached PDF raster dimensions changed.");
        }
        ValidateInfo(Text(Path.Combine(baseline, "pdf-info.txt")), Text(Path.Combine(baseline, "pdf-fonts.txt")), measurement.Page);
        Require(p.GetProperty("frameworkReferences").EnumerateArray().All(a => a.GetString() is { } n && (n == "System" || n.StartsWith("System.", StringComparison.Ordinal))), "Unexpected PDF generator dependency.");
    }
    private static string BuildWrapper()
    {
        var text = Text(At(Wrapper));
        Require(text.Split("\\def\\pgfsysdriver{pgfsys-dvisvgm.def}", StringSplitOptions.None).Length == 2, "Original SVG wrapper driver changed.");
        text = text.Replace("\\def\\pgfsysdriver{pgfsys-dvisvgm.def}\n", "", StringComparison.Ordinal)
            .Replace("\\paperwidth=800pt \\paperheight=950pt", "\\paperwidth=600pt \\paperheight=800pt\n\\pdfpagewidth=\\paperwidth \\pdfpageheight=\\paperheight", StringComparison.Ordinal)
            .Replace("\\textwidth=600pt \\textheight=750pt", "\\textwidth=500pt \\textheight=680pt", StringComparison.Ordinal)
            .Replace("\\typeout{LOKAD-PGF-VERSION \\pgfversion}", "\\typeout{LOKAD-PGF-VERSION \\pgfversion}\n\\typeout{LOKAD-PDF-PGF-VERSION \\pgfversion|END}\n\\typeout{LOKAD-PDF-DRIVER \\pgfsysdriver|END}", StringComparison.Ordinal)
            .Replace("      \\setbox\\pgfnodeparttextbox=\\hbox{\\special{lokad-node-origin #3}\\box\\pgfnodeparttextbox}%\n", "", StringComparison.Ordinal)
            .Replace("\\hbox{\\box\\lokadpicture}", "\\hbox{%\n  \\pdfsavepos\n  \\write16{LOKAD-PDF-PAGE \\number\\pdflastxpos|\\number\\pdflastypos|\\number\\pdfpagewidth|\\number\\pdfpageheight|END}%\n  \\box\\lokadpicture\n}", StringComparison.Ordinal);
        Require(!text.Contains("pgfsys-dvisvgm", StringComparison.Ordinal) && !text.Contains("\\special", StringComparison.Ordinal) && text.Contains("\\pdfsavepos", StringComparison.Ordinal), "PDF wrapper derivation incomplete.");
        return "\\pdfinfoomitdate=1\n\\pdftrailerid{}\n\\pdfsuppressptexinfo=15\n" + text;
    }
    private static void ValidateInfo(string info, string fonts, PdfEvidence.Page page)
    {
        Require(Regex.IsMatch(info, @"(?m)^Pages:\s+1\s*$"), "Trusted ordinary PDF must occupy one page.");
        var m = Regex.Match(info, @"(?m)^Page size:\s+([\d.]+) x ([\d.]+) pts"); Require(m.Success, "Missing independent PDF media size.");
        Require(Math.Abs(double.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture) - page.WidthSp * 72.0 / (72.27 * 65536)) <= .000500001
            && Math.Abs(double.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture) - page.HeightSp * 72.0 / (72.27 * 65536)) <= .000500001, "PDF media size differs from native page measurements.");
        var rows = fonts.Split('\n', StringSplitOptions.RemoveEmptyEntries).Skip(2).ToArray();
        var records = Regex.Matches(fonts, @"(?m)^\S+\s+Type 1\s+\S+\s+yes\s+yes\s+(?:yes|no)\s+\d+\s+\d+\s*$").ToArray();
        Require(rows.Length == 2 && records.Length == 2 && records.Any(r => r.Value.Contains("LMRoman10-Regular", StringComparison.Ordinal))
            && records.Any(r => r.Value.Contains("LMRoman12-Italic", StringComparison.Ordinal)), "Ordinary PDF fonts must be the two embedded/subset pinned faces.");
    }
    private static Dictionary<string, string> SourceHashes() => new[] { ProfilePath, Source, Wrapper, "tests/Reference/NodeShapes/cases.json", "tests/Reference/NodeShapes/oracle-profile.json",
        Native + "/provenance.json", "tools/TikzFontData/font-profile.json", "tools/TikzShapePdfReference/Program.cs", "tools/TikzShapePdfReference/PdfEvidence.cs",
        "tools/TikzShapePdfReference/TikzShapePdfReference.csproj", "tools/TikzShapePdfReference/packages.lock.json", "Directory.Build.props", "global.json" }.ToDictionary(f => f, f => Hash(At(f)), StringComparer.Ordinal);
    private static IEnumerable<Input> RecordedInputs(string folder)
    {
        foreach (var line in Text(Path.Combine(folder, "case.fls")).Split('\n').Where(l => l.StartsWith("INPUT ", StringComparison.Ordinal)))
        {
            var file = Path.GetFullPath(line[6..].Trim(), folder); if (!File.Exists(file) || Path.GetDirectoryName(file) == folder) continue;
            yield return new("tex/" + Path.GetFileName(file), Hash(file));
        }
    }
    private static async Task<Tool> Identify(string name, string[] args, string expected)
    { var executable = Resolve(name); var output = await Run(executable, args, root); Require(output.Contains(expected, StringComparison.Ordinal), "Incompatible PDF oracle tool: " + name); return new(executable, name, expected, Hash(executable)); }
    private static string Resolve(string name) => (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator)
        .Select(p => Path.Combine(p.Trim('"'), name + (OperatingSystem.IsWindows() ? ".exe" : ""))).FirstOrDefault(File.Exists) ?? throw new InvalidOperationException("Missing oracle tool: " + name);
    private static async Task<string> Run(string executable, string[] arguments, string directory)
    {
        using var process = new Process { StartInfo = new(executable) { WorkingDirectory = directory, CreateNoWindow = true, UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true } };
        foreach (var argument in arguments) process.StartInfo.ArgumentList.Add(argument);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(profile.ProcessTimeoutSeconds)); process.Start(); var captured = 0;
        async Task<string> Capture(StreamReader reader)
        {
            var result = new StringBuilder(); var buffer = new char[4096];
            while (true) { var count = await reader.ReadAsync(buffer.AsMemory(), timeout.Token); if (count == 0) return result.ToString();
                if (Interlocked.Add(ref captured, count) > profile.MaxCapturedCharacters) { process.Kill(true); throw new InvalidOperationException("PDF oracle process output exceeds its bound."); } result.Append(buffer, 0, count); }
        }
        var stdout = Capture(process.StandardOutput); var stderr = Capture(process.StandardError);
        try { await process.WaitForExitAsync(timeout.Token); var output = string.Join('\n', await Task.WhenAll(stdout, stderr)); Require(process.ExitCode == 0, Path.GetFileName(executable) + " failed: " + output); return output; }
        catch { if (!process.HasExited) process.Kill(true); try { await Task.WhenAll(stdout, stderr); } catch { } throw; }
    }
    private static StringComparison PathComparison => OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
    private static void Guard(string file, string owner)
    {
        file = Path.GetFullPath(file); owner = Path.GetFullPath(owner); Require(file == owner || file.StartsWith(owner + Path.DirectorySeparatorChar, PathComparison), "Oracle path escapes its owned directory.");
        for (string? current = file; current is not null && !string.Equals(current, root, PathComparison); current = Path.GetDirectoryName(current))
            try { Require((File.GetAttributes(current) & FileAttributes.ReparsePoint) == 0, "Oracle paths must not cross symlinks or junctions."); } catch (FileNotFoundException) { } catch (DirectoryNotFoundException) { }
    }
    private static string FindRoot() { for (var d = new DirectoryInfo(Directory.GetCurrentDirectory()); d is not null; d = d.Parent) if (File.Exists(Path.Combine(d.FullName, "Lokad.TikZ.slnx"))) return d.FullName; throw new InvalidOperationException("Run inside the repository."); }
    private static string At(string path) => Path.Combine(root, path.Replace('/', Path.DirectorySeparatorChar));
    private static string Text(string file) => File.ReadAllText(file).Replace("\r\n", "\n", StringComparison.Ordinal);
    private static string Hash(string file) => Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(file)));
    private static string HashText(string text) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)));
    private static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Json) + "\n";
    private static bool SameJson(JsonElement left, JsonElement right) => JsonSerializer.Serialize(left, Json) == JsonSerializer.Serialize(right, Json);
    private static void Write<T>(string file, T value) => File.WriteAllText(file, Serialize(value));
    private static T Read<T>(string file) => JsonSerializer.Deserialize<T>(Text(file), Json) ?? throw new InvalidOperationException("Missing PDF artifact.");
    private static void Require(bool condition, string message) { if (!condition) throw new InvalidOperationException(message); }
    private static string Sanitize(string text)
    {
        foreach (var directory in new[] { root, Environment.GetFolderPath(Environment.SpecialFolder.UserProfile) }.Where(s => s.Length > 0).OrderByDescending(s => s.Length))
            foreach (var spelling in new[] { directory, directory.Replace('\\', '/') }.Distinct())
                text = Regex.Replace(text, string.Join(@"(?:\r?\n)?", spelling.Select(c => Regex.Escape(c.ToString()))), "<local>", RegexOptions.IgnoreCase);
        return text.Replace("\r\n", "\n", StringComparison.Ordinal);
    }
}

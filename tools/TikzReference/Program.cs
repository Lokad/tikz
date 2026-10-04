using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Lokad.TikZ;
using Lokad.TikZ.Graphics;

return await ReferenceTool.Run(args);

internal static class ReferenceTool
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true, NewLine = "\n" };
    private const double PtToPixels = 96 / 72.27;
    private static string Root = "";
    private static OracleProfile Profile = null!;

    internal static async Task<int> Run(string[] args)
    {
        try
        {
            Root = FindRoot();
            Profile = Read<OracleProfile>(At("tests/Reference/oracle-profile.json"));
            var options = Arguments(args);
            var manifest = Read<CaseManifest>(At("tests/Reference/cases.json"));
            if (manifest.SchemaVersion != 1 || Profile.SchemaVersion != 1 || manifest.Profile != Profile.Id)
                throw new InvalidOperationException("Incompatible reference manifest/profile.");
            var selected = manifest.Cases.Where(c => !options.TryGetValue("case", out var id) || c.Id == id).ToArray();
            if (selected.Length == 0) throw new InvalidOperationException("No matching trusted reference fixture.");
            if (selected.Select(c => c.Id).Distinct().Count() != selected.Length)
                throw new InvalidOperationException("Duplicate case identifiers.");
            foreach (var c in selected)
                if (!Regex.IsMatch(c.Id, "^[a-z][a-z0-9-]*$") || !File.Exists(At(c.Source)))
                    throw new InvalidOperationException("Invalid trusted fixture manifest.");
            var exitCode = 0;
            var reports = new List<object>();
            foreach (var c in selected)
            {
                if (args[0] == "generate-reference")
                {
                    await Generate(c);
                    Console.WriteLine($"{c.Id}: reference generated explicitly");
                    continue;
                }
                var referenceMode = options.GetValueOrDefault("reference", "cached");
                if (referenceMode != "cached") throw new InvalidOperationException("Use generate-reference explicitly, then compare --reference cached.");
                var output = options.GetValueOrDefault("out", "artifacts/comparisons");
                if (selected.Length > 1 || !options.ContainsKey("case")) output = Path.Combine(output, c.Id);
                var result = await Compare(c, ArtifactDirectory(output));
                reports.Add(new { caseId = c.Id, exitCode = result, report = Relative(Path.Combine(output, "report.json")) });
                exitCode = Math.Max(exitCode, result);
            }
            if (args[0] == "compare" && !options.ContainsKey("case"))
            {
                var suiteDirectory = ArtifactDirectory(options.GetValueOrDefault("out", "artifacts/comparisons"));
                Write(Path.Combine(suiteDirectory, "suite.json"), new { schemaVersion = 1, expectedCases = selected.Select(c => c.Id), executedCases = reports, passed = exitCode == 0 });
                var rows = string.Join("\n", selected.Zip(reports).Select(pair => $"<li><a href=\"{pair.First.Id}/index.html\">{pair.First.Id} inspection</a> · <a href=\"{pair.First.Id}/report.json\">report</a></li>"));
                File.WriteAllText(Path.Combine(suiteDirectory, "index.html"), $"<!doctype html><meta charset=\"utf-8\"><title>TikZ conformance</title><h1>TikZ conformance: {(exitCode == 0 ? "pass" : "failure")}</h1><p>Every listed case is required. See suite.json for individual exit categories.</p><ul>{rows}</ul><a href=\"suite.json\">Suite report</a>");
            }
            return exitCode;
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            Console.Error.WriteLine($"Harness failure: {Sanitize(e.Message)}");
            return 2;
        }
    }

    private static Dictionary<string, string> Arguments(string[] args)
    {
        if (args.Length == 0 || args[0] is not ("compare" or "generate-reference"))
            throw new InvalidOperationException("Usage: TikzReference <generate-reference|compare> [--case id] [--reference cached] [--out artifacts/...]");
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var i = 1; i < args.Length; i += 2)
        {
            if (i + 1 == args.Length || args[i] is not ("--case" or "--reference" or "--out") || !result.TryAdd(args[i][2..], args[i + 1]))
                throw new InvalidOperationException("Invalid or duplicate command option.");
        }
        if (args[0] == "generate-reference" && result.Keys.Any(k => k != "case"))
            throw new InvalidOperationException("Reference generation accepts only --case; baseline writes are explicit.");
        return result;
    }

    private static async Task Generate(ReferenceCase c)
    {
        var work = ArtifactDirectory($"artifacts/reference-work/{c.Id}/generated");
        ResetDirectory(work);
        var source = Text(At(c.Source));
        var wrapper = Text(At("tests/Reference/wrapper.tex"));
        if (!source.Contains("\\end{tikzpicture}", StringComparison.Ordinal)) throw new InvalidOperationException("Trusted fixture needs a complete picture.");
        var latex = await Identify("latex", ["--version"], Profile.LatexVersion);
        var pdfLatex = await Identify("pdflatex", ["--version"], Profile.LatexVersion);
        var dvisvgm = await Identify("dvisvgm", ["--version"], Profile.DvisvgmVersion);
        var rasterizer = await Identify("pdftoppm", ["-v"], Profile.PdfRasterizerVersion);
        string[] texArgs = ["-disable-write18", "-disable-installer", "-interaction=nonstopmode", "-halt-on-error", "-recorder"];
        var unprobed = Path.Combine(work, "plain");
        var probed = Path.Combine(work, "probed");
        var pdf = Path.Combine(work, "pdf");
        foreach (var folder in new[] { unprobed, probed, pdf }) Directory.CreateDirectory(folder);
        File.WriteAllText(Path.Combine(unprobed, "case.tikz"), source);
        File.WriteAllText(Path.Combine(unprobed, "case.tex"), wrapper);
        var instrumentation = source.Replace("\\end{tikzpicture}", "\\lokadmeasure\\end{tikzpicture}", StringComparison.Ordinal);
        File.WriteAllText(Path.Combine(probed, "case.tikz"), instrumentation);
        File.WriteAllText(Path.Combine(probed, "case.tex"), wrapper);
        File.WriteAllText(Path.Combine(pdf, "case.tikz"), instrumentation);
        File.WriteAllText(Path.Combine(pdf, "case.tex"), wrapper.Replace("\\def\\pgfsysdriver{pgfsys-dvisvgm.def}\n", "", StringComparison.Ordinal));
        foreach (var folder in new[] { unprobed, probed })
        {
            await Require(latex.Executable, [.. texArgs, "case.tex"], folder);
            await Require(dvisvgm.Executable, ["--no-fonts", "--exact-bbox", "--bbox=min", "--output=reference.svg", "case.dvi"], folder);
        }
        if (HashFile(Path.Combine(unprobed, "reference.svg")) != HashFile(Path.Combine(probed, "reference.svg")))
            throw new InvalidOperationException("Measurement probes changed the SVG. Reference generation refused.");
        var log = Text(Path.Combine(probed, "case.log"));
        if (!log.Contains("LOKAD-PGF-VERSION " + Profile.PgfVersion + "\n", StringComparison.Ordinal))
            throw new InvalidOperationException("PGF version does not match the pinned profile.");
        var plainBox = Box(Text(Path.Combine(unprobed, "case.log")));
        var measuredBox = Box(log);
        if (plainBox != measuredBox) throw new InvalidOperationException("Measurement probes changed the TeX picture box.");
        await Require(pdfLatex.Executable, [.. texArgs, "case.tex"], pdf);
        var pdfLog = Text(Path.Combine(pdf, "case.log"));
        var pdfBox = Box(pdfLog);
        if (pdfBox != measuredBox) throw new InvalidOperationException("Primary SVG and ordinary PDF routes have different TeX boxes.");
        var metrics = Measurements(log, pdfLog, Path.Combine(probed, "reference.svg"));
        var generated = Path.Combine(work, "baseline");
        Directory.CreateDirectory(generated);
        File.Copy(Path.Combine(probed, "reference.svg"), Path.Combine(generated, "reference.svg"));
        File.Copy(Path.Combine(pdf, "case.pdf"), Path.Combine(generated, "reference.pdf"));
        Write(Path.Combine(generated, "reference-metrics.json"), metrics);
        File.WriteAllText(Path.Combine(generated, "oracle.log"), Sanitize(log + "\n--- Ordinary PDF oracle ---\n" + pdfLog));
        foreach (var scale in Profile.Scales)
        {
            await Require(rasterizer.Executable, ["-r", (96 * scale).ToString(CultureInfo.InvariantCulture), "-png", "-singlefile", "case.pdf", $"pdf-page-{scale}x"], pdf);
            File.Copy(Path.Combine(pdf, $"pdf-page-{scale}x.png"), Path.Combine(generated, $"pdf-page-{scale}x.png"));
        }
        var inputs = new[] { probed, pdf }.SelectMany(RecordedInputs).DistinctBy(i => i.Path).OrderBy(i => i.Path, StringComparer.Ordinal).ToArray();
        var provenance = new Provenance(1, Profile.Id, HashText(source), HashText(wrapper), HashFile(At("tests/Reference/oracle-profile.json")),
            JsonSerializer.Serialize(c, Json), DateTimeOffset.UtcNow.ToString("O"),
            [latex.Public, pdfLatex.Public, dvisvgm.Public, rasterizer.Public], inputs,
            new(true, true, HashFile(Path.Combine(unprobed, "reference.svg"))),
            Directory.GetFiles(generated).ToDictionary(f => Path.GetFileName(f), HashFile, StringComparer.Ordinal),
            ["latex: -disable-write18 -disable-installer -interaction=nonstopmode -halt-on-error -recorder case.tex",
             "dvisvgm: --no-fonts --exact-bbox --bbox=min --output=reference.svg case.dvi",
             "pdflatex: same engine flags, ordinary PDF driver", "pdftoppm: -r 96/384 -png -singlefile case.pdf pdf-page-1x/4x"]);
        Write(Path.Combine(generated, "provenance.json"), provenance);
        var baseline = At($"tests/Reference/{c.Id}");
        Directory.CreateDirectory(baseline);
        foreach (var f in Directory.GetFiles(generated)) File.Copy(f, Path.Combine(baseline, Path.GetFileName(f)), true);
    }

    private static async Task<int> Compare(ReferenceCase c, string output)
    {
        ResetDirectory(output);
        try { return await CompareCore(c, output); }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            Write(Path.Combine(output, "report.json"), new { schemaVersion = 1, caseId = c.Id, verdict = "harness-failure", diagnostics = new[] { Sanitize(e.Message) } });
            Console.Error.WriteLine($"{c.Id}: harness failure; {Relative(Path.Combine(output, "report.json"))}: {Sanitize(e.Message)}");
            return 2;
        }
    }

    private static async Task<int> CompareCore(ReferenceCase c, string output)
    {
        var baseline = At($"tests/Reference/{c.Id}");
        var provenance = Read<Provenance>(Path.Combine(baseline, "provenance.json"));
        var source = Text(At(c.Source));
        if (provenance.SchemaVersion != 1 || provenance.Profile != Profile.Id || provenance.SourceSha256 != HashText(source)
            || provenance.WrapperSha256 != HashText(Text(At("tests/Reference/wrapper.tex")))
            || provenance.ProfileSha256 != HashFile(At("tests/Reference/oracle-profile.json"))
            || provenance.CaseDefinition != JsonSerializer.Serialize(c, Json))
            throw new InvalidOperationException("Cached baseline manifest is incompatible; do not regenerate it to hide a candidate mismatch.");
        foreach (var (file, hash) in provenance.Artifacts)
        {
            if (Path.GetFileName(file) != file || HashFile(Path.Combine(baseline, file)) != hash)
                throw new InvalidOperationException("Missing or modified cached reference artifact: " + file);
        }
        string[] required = ["reference.svg", "reference.pdf", "reference-metrics.json", "oracle.log", "pdf-page-1x.png", "pdf-page-4x.png"];
        if (required.Any(f => !provenance.Artifacts.ContainsKey(f))) throw new InvalidOperationException("Reference artifact manifest is incomplete.");
        foreach (var f in required.Append("provenance.json")) File.Copy(Path.Combine(baseline, f), Path.Combine(output, f));
        File.WriteAllText(Path.Combine(output, "source.tikz"), source);
        GraphicsScene? scene = null;
        var conversionOptions = new TikzOptions { IdPrefix = "candidate" };
        var conversion = TikzConverter.ConvertWithTrace(source, conversionOptions, CancellationToken.None, value => scene = value);
        if (conversion is TikzFailure failure)
        {
            Write(Path.Combine(output, "report.json"), new { schemaVersion = 1, caseId = c.Id, verdict = "unsupported-or-candidate-error", diagnostics = failure.Diagnostics });
            Console.WriteLine($"{c.Id}: candidate failed; see {Relative(Path.Combine(output, "report.json"))}");
            return 3;
        }
        var success = (TikzSuccess)conversion;
        File.WriteAllText(Path.Combine(output, "actual.svg"), success.Svg);
        Write(Path.Combine(output, "actual-scene.json"), Scene(scene!, success));
        var reference = Read<ReferenceMetrics>(Path.Combine(baseline, "reference-metrics.json"));
        var checks = NumericChecks(reference, scene!, success, c.NumericTolerancePixels);
        var git = await Process(ResolveExecutable("git"), ["rev-parse", "HEAD"], Root);
        var fingerprint = await WorkingTreeFingerprint();
        Write(Path.Combine(output, "candidate-provenance.json"), new { schemaVersion = 1, commit = git.Output.Trim(), workingTreeSha256 = fingerprint,
            configuration = BuildConfiguration, assemblySha256 = HashFile(typeof(TikzConverter).Assembly.Location), options = conversionOptions });
        Write(Path.Combine(output, "comparison-input.json"), new { schemaVersion = 1, caseId = c.Id, referenceMode = "cached", referenceOriginBp = reference.SvgOriginBp,
            numericTolerancePixels = c.NumericTolerancePixels, numeric = new { passed = checks.All(x => x.Passed), checks }, pdf = new { originPixels = reference.PdfOriginPixels } });
        var render = await Process(ResolveExecutable("node"), [At("tools/TikzVisual/compare.mjs"), output], Root);
        if (render.ExitCode is not (0 or 1) || !File.Exists(Path.Combine(output, "report.json")))
            throw new InvalidOperationException("Visual runner failed: " + render.Output);
        Console.WriteLine($"{c.Id}: {(render.ExitCode == 0 ? "pass" : "mismatch")}; {Relative(Path.Combine(output, "report.json"))}");
        return render.ExitCode;
    }

    private static object Scene(GraphicsScene scene, TikzSuccess success) => new
    {
        schemaVersion = 1, units = "CSS pixels; y down; picture origin (0,0)", pictureBounds = success.PictureBounds, inkBounds = success.InkBounds,
        coordinates = scene.Coordinates.ToDictionary(p => p.Key, p => new XY(p.Value.X * 4 / 3, -p.Value.Y * 4 / 3)),
        paths = scene.Paths.Select((p, i) => new { semanticId = $"path-{i}", svgElementId = $"candidate-p{i}", source = p.Source.Location,
            geometryBounds = p.Path.Bounds.Pixels, inkBounds = p.Path.Bounds.Inflate(p.Paint.Stroke ? p.Paint.Width / 2 : 0).Pixels,
            paint = new { stroke = p.Paint.Stroke, fill = p.Paint.Fill, strokeColor = p.Paint.StrokeColor.Svg, fillColor = p.Paint.FillColor.Svg,
                strokeWidthPixels = p.Paint.Width * 4 / 3, p.Paint.StrokeOpacity, p.Paint.FillOpacity, p.Paint.Cap, p.Paint.Join }, clips = p.Clips,
            segments = p.Path.Segments.Select(s => new { kind = s.Kind.ToString(), end = new XY(s.End.X * 4 / 3, -s.End.Y * 4 / 3),
                control1 = new XY(s.A.X * 4 / 3, -s.A.Y * 4 / 3), control2 = new XY(s.B.X * 4 / 3, -s.B.Y * 4 / 3) }) }), statistics = success.Statistics
    };

    private static List<NumericCheck> NumericChecks(ReferenceMetrics reference, GraphicsScene scene, TikzSuccess success, double tolerance)
    {
        var checks = new List<NumericCheck>();
        void Number(string name, double expected, double actual, string units = "CSS pixels", double? allowed = null)
            => checks.Add(new(name, expected, actual, units, Math.Abs(expected - actual), allowed ?? tolerance, Math.Abs(expected - actual) <= (allowed ?? tolerance)));
        var b = reference.PictureBoundsPt;
        Number("picture.minX", b.MinX * PtToPixels, success.PictureBounds.MinX);
        Number("picture.minY", -b.MaxY * PtToPixels, success.PictureBounds.MinY);
        Number("picture.maxX", b.MaxX * PtToPixels, success.PictureBounds.MaxX);
        Number("picture.maxY", -b.MinY * PtToPixels, success.PictureBounds.MaxY);
        Number("box.width", reference.BoxPt.Width * PtToPixels, success.PictureBounds.Width);
        Number("box.height+depth", (reference.BoxPt.Height + reference.BoxPt.Depth) * PtToPixels, success.PictureBounds.Height);
        foreach (var (name, point) in reference.AnchorsPt)
        {
            if (!scene.Coordinates.TryGetValue(name, out var actual))
            {
                checks.Add(new($"anchor.{name}", "present", "missing", "coordinate", null, 0, false));
                continue;
            }
            Number($"anchor.{name}.x", point.X * PtToPixels, actual.X * 4 / 3);
            Number($"anchor.{name}.y", -point.Y * PtToPixels, -actual.Y * 4 / 3);
        }
        Number("paintedPathCount", 1, scene.Paths.Count, "count", 0);
        if (scene.Paths.Count != 1) return checks;
        Number("stroke.width", reference.Stroke.WidthPt * PtToPixels, scene.Paths[0].Paint.Width * 4 / 3);
        Number("stroke.opacity", reference.Stroke.Opacity, scene.Paths[0].Paint.StrokeOpacity, "unit interval", 0.000001);
        var actualColor = scene.Paths[0].Paint.StrokeColor.Svg;
        checks.Add(new("stroke.color", reference.Stroke.Color, actualColor, "sRGB hex", null, 0, reference.Stroke.Color == actualColor));
        return checks;
    }

    private static ReferenceMetrics Measurements(string log, string pdfLog, string svgFile)
    {
        var bounds = Match(log, @"LOKAD-BOUNDS minx=([-\d.]+)pt; miny=([-\d.]+)pt; maxx=([-\d.]+)pt; maxy=([-\d.]+)pt");
        var anchors = Regex.Matches(log, @"LOKAD-ANCHOR-([a-z]+) x=([-\d.]+)pt; y=([-\d.]+)pt")
            .ToDictionary(m => m.Groups[1].Value, m => new XY(Parse(m.Groups[2].Value), Parse(m.Groups[3].Value)));
        if (anchors.Count != 2 || !anchors.ContainsKey("start") || !anchors.ContainsKey("end")) throw new InvalidOperationException("Incomplete independent anchor measurements.");
        var svg = XDocument.Load(svgFile);
        var originGroup = svg.Descendants().FirstOrDefault(e => e.Name.LocalName == "g" && (e.Attribute("transform")?.Value ?? "").StartsWith("translate(", StringComparison.Ordinal))
            ?? throw new InvalidOperationException("Primary SVG driver origin transform missing.");
        var origin = Match(originGroup.Attribute("transform")!.Value, @"^translate\(([-\d.]+),([-\d.]+)\)scale\(([-\d.]+),([-\d.]+)\)$");
        if (Math.Abs(origin[2] - 72 / 72.27) > 0.000001 || Math.Abs(origin[3] + 72 / 72.27) > 0.000001)
            throw new InvalidOperationException("Unexpected primary driver physical transform.");
        var path = svg.Descendants().Single(e => e.Name.LocalName == "path");
        string Attribute(string name) => path.AncestorsAndSelf().Select(e => e.Attribute(name)?.Value).FirstOrDefault(v => v is not null)
            ?? throw new InvalidOperationException("Required reference paint property missing: " + name);
        var color = Attribute("stroke");
        if (Regex.IsMatch(color, "^#[0-9a-fA-F]{3}$")) color = "#" + string.Concat(color[1..].Select(c => new string(c, 2)));
        if (!Regex.IsMatch(color, "^#[0-9a-fA-F]{6}$")) throw new InvalidOperationException("Unsupported reference color syntax.");
        var page = Match(pdfLog, @"LOKAD-PAGE-ORIGIN xsp=(\d+); ysp=(\d+); pageheight=([-\d.]+)pt");
        return new(1, "Independent PGF measurements in TeX pt; SVG driver translation in bp; PDF registration from shipped-out positions",
            new(bounds[0], bounds[1], bounds[2], bounds[3]), Box(log), anchors, new(origin[0], origin[1]),
            new((page[0] / 65536 - bounds[0]) * PtToPixels, (page[2] - page[1] / 65536 + bounds[1]) * PtToPixels),
            new(Parse(Attribute("stroke-width")), color.ToLowerInvariant(), Parse(Attribute("stroke-opacity"))));
    }

    private static BoxDimensions Box(string log)
    {
        var box = Match(log, @"LOKAD-BOX width=([-\d.]+)pt; height=([-\d.]+)pt; depth=([-\d.]+)pt");
        return new(box[0], box[1], box[2]);
    }

    private static double[] Match(string text, string regex)
    {
        var match = Regex.Match(text, regex, RegexOptions.CultureInvariant);
        if (!match.Success) throw new InvalidOperationException("Required independent measurement missing: " + regex);
        return match.Groups.Cast<Group>().Skip(1).Select(g => Parse(g.Value)).ToArray();
    }
    private static double Parse(string text) => double.Parse(text, CultureInfo.InvariantCulture);

    private static IEnumerable<InputIdentity> RecordedInputs(string directory)
    {
        foreach (var line in File.ReadLines(Path.Combine(directory, "case.fls")).Where(l => l.StartsWith("INPUT ", StringComparison.Ordinal)))
        {
            var file = Path.GetFullPath(line[6..], directory);
            if (!File.Exists(file) || Path.GetDirectoryName(file) == directory) continue;
            var normalized = file.Replace('\\', '/');
            var marker = normalized.LastIndexOf("/tex/", StringComparison.OrdinalIgnoreCase);
            var name = marker >= 0 ? normalized[(marker + 1)..] : "engine-data/" + Path.GetFileName(file);
            yield return new(name, HashFile(file));
        }
    }

    private static async Task<string> WorkingTreeFingerprint()
    {
        var result = await Process(ResolveExecutable("git"), ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], Root);
        if (result.ExitCode != 0) throw new InvalidOperationException("Cannot fingerprint the candidate working tree.");
        var content = new StringBuilder();
        foreach (var file in result.Output.Split('\0', StringSplitOptions.RemoveEmptyEntries).Order(StringComparer.Ordinal))
            content.Append(file).Append('\0').Append(File.Exists(At(file)) ? HashFile(At(file)) : "deleted").Append('\n');
        return HashText(content.ToString());
    }

    private static async Task<IdentifiedTool> Identify(string name, string[] args, string expectedVersion)
    {
        var executable = ResolveExecutable(name);
        var result = await Process(executable, args, Root);
        if (result.ExitCode != 0 || !result.Output.Split('\n', StringSplitOptions.TrimEntries).Contains(expectedVersion))
            throw new InvalidOperationException($"{name} does not match the pinned version {expectedVersion}.");
        return new(executable, new(name, expectedVersion, HashFile(executable)));
    }

    private static string ResolveExecutable(string name)
    {
        foreach (var folder in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
        {
            var candidate = Path.Combine(folder, name + (OperatingSystem.IsWindows() ? ".exe" : ""));
            if (File.Exists(candidate)) return Path.GetFullPath(candidate);
        }
        throw new InvalidOperationException("Required executable missing: " + name);
    }

    private static async Task Require(string executable, string[] args, string directory)
    {
        var result = await Process(executable, args, directory);
        if (result.ExitCode != 0) throw new InvalidOperationException($"{Path.GetFileName(executable)} failed ({result.ExitCode}): {result.Output}");
    }

    private static async Task<ProcessResult> Process(string executable, string[] args, string directory)
    {
        using var process = new System.Diagnostics.Process { StartInfo = new(executable) { WorkingDirectory = directory, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true } };
        foreach (var arg in args) process.StartInfo.ArgumentList.Add(arg);
        process.Start();
        var stdout = Capture(process.StandardOutput);
        var stderr = Capture(process.StandardError);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(Profile.ProcessTimeoutSeconds));
        try { await process.WaitForExitAsync(timeout.Token); }
        catch (OperationCanceledException) { process.Kill(true); await process.WaitForExitAsync(); throw new InvalidOperationException("Timed out: " + Path.GetFileName(executable)); }
        return new(process.ExitCode, await stdout + await stderr);
    }

    private static async Task<string> Capture(StreamReader reader)
    {
        var result = new StringBuilder();
        var buffer = new char[4096];
        var truncated = false;
        int count;
        while ((count = await reader.ReadAsync(buffer)) > 0)
        {
            var available = Profile.MaxCapturedCharacters - result.Length;
            if (available < count) truncated = true;
            result.Append(buffer, 0, Math.Min(count, Math.Max(0, available)));
        }
        if (truncated) throw new InvalidOperationException("Process output exceeded the harness limit.");
        return result.ToString();
    }

    private static string FindRoot()
    {
        for (var directory = new DirectoryInfo(Environment.CurrentDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "Lokad.TikZ.slnx"))) return directory.FullName;
        throw new InvalidOperationException("Run the tool inside the repository.");
    }
    private static string At(string path)
    {
        var full = Path.GetFullPath(path, Root);
        if (!full.StartsWith(Root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Path escapes repository.");
        return full;
    }
    private static string ArtifactDirectory(string path)
    {
        var full = At(path);
        var artifactRoot = At("artifacts") + Path.DirectorySeparatorChar;
        if (!full.StartsWith(artifactRoot, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Output must be a subdirectory of artifacts/.");
        return full;
    }
    private static void ResetDirectory(string directory)
    {
        _ = ArtifactDirectory(directory);
        if (Directory.Exists(directory)) Directory.Delete(directory, true);
        Directory.CreateDirectory(directory);
    }
    private static string Relative(string path) => Path.GetRelativePath(Root, Path.GetFullPath(path, Root)).Replace('\\', '/');
    private static string Sanitize(string text)
    {
        foreach (var value in new[] { Root, Environment.GetFolderPath(Environment.SpecialFolder.UserProfile) }.Where(v => v.Length > 0).OrderByDescending(v => v.Length))
            text = text.Replace(value, "<local>", StringComparison.OrdinalIgnoreCase).Replace(value.Replace('\\', '/'), "<local>", StringComparison.OrdinalIgnoreCase);
        return text;
    }
    private static string Text(string file) => File.ReadAllText(file).Replace("\r\n", "\n", StringComparison.Ordinal);
    private static T Read<T>(string file) => JsonSerializer.Deserialize<T>(Text(file), Json) ?? throw new InvalidOperationException("Empty JSON artifact: " + Relative(file));
    private static void Write<T>(string file, T value) { Directory.CreateDirectory(Path.GetDirectoryName(file)!); File.WriteAllText(file, JsonSerializer.Serialize(value, Json) + "\n"); }
    private static string HashFile(string file) => Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(file)));
    private static string HashText(string text) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)));
#if DEBUG
    private const string BuildConfiguration = "Debug";
#else
    private const string BuildConfiguration = "Release";
#endif

    private sealed record OracleProfile(int SchemaVersion, string Id, string LatexVersion, string DvisvgmVersion, string PdfRasterizerVersion, string PgfVersion, string FontProfile, int[] Scales, int ProcessTimeoutSeconds, int MaxCapturedCharacters);
    private sealed record CaseManifest(int SchemaVersion, string Profile, ReferenceCase[] Cases);
    private sealed record ReferenceCase(string Id, string Source, string[] Features, double NumericTolerancePixels);
    private sealed record XY(double X, double Y);
    private sealed record PhysicalBounds(double MinX, double MinY, double MaxX, double MaxY);
    private sealed record BoxDimensions(double Width, double Height, double Depth);
    private sealed record ReferenceStroke(double WidthPt, string Color, double Opacity);
    private sealed record ReferenceMetrics(int SchemaVersion, string Units, PhysicalBounds PictureBoundsPt, BoxDimensions BoxPt, Dictionary<string, XY> AnchorsPt, XY SvgOriginBp, XY PdfOriginPixels, ReferenceStroke Stroke);
    private sealed record NumericCheck(string Name, object Expected, object Actual, string Units, double? AbsoluteError, double Tolerance, bool Passed);
    private sealed record ProcessResult(int ExitCode, string Output);
    private sealed record ToolIdentity(string Name, string Version, string Sha256);
    private sealed record IdentifiedTool(string Executable, ToolIdentity Public);
    private sealed record InputIdentity(string Path, string Sha256);
    private sealed record ProbeVerification(bool SvgByteIdentical, bool PictureBoxIdentical, string PlainSvgSha256);
    private sealed record Provenance(int SchemaVersion, string Profile, string SourceSha256, string WrapperSha256, string ProfileSha256, string CaseDefinition, string GeneratedUtc,
        ToolIdentity[] Tools, InputIdentity[] Inputs, ProbeVerification ProbeVerification, Dictionary<string, string> Artifacts, string[] Commands);
}

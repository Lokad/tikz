using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using TikzDashReference;

var json = new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true, NewLine = "\n" };
var root = Directory.GetCurrentDirectory();
while (!File.Exists(Path.Combine(root, "Lokad.TikZ.slnx"))) root = Directory.GetParent(root)?.FullName ?? throw new InvalidOperationException("Repository root missing.");
var baseline = Path.Combine(root, "tests/Reference/Dashes/native");
var snapshotFile = Path.Combine(root, "tests/Reference/Dashes/snapshot.json");
const string fixture = "tests/Fixtures/Dashes/dashes.tikz", wrapper = "tools/TikzDashReference/dashes.tex";
var sourceFiles = new[] { fixture, wrapper, "tools/TikzDashReference/Program.cs", "tools/TikzDashReference/DashEvidence.cs", "tools/TikzDashReference/TikzDashReference.csproj", "tools/TikzDashReference/packages.lock.json", "Directory.Build.props", "global.json" };
string At(string file) => Path.GetFullPath(Path.Combine(root, file));
string Text(string file) => File.ReadAllText(file).Replace("\r\n", "\n", StringComparison.Ordinal);
string Hash(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));
string FileHash(string file) => Hash(File.ReadAllBytes(file));
void Write(string file, object data) { Directory.CreateDirectory(Path.GetDirectoryName(file)!); File.WriteAllText(file, JsonSerializer.Serialize(data, json) + "\n", new UTF8Encoding(false)); }
T Read<T>(string file) => JsonSerializer.Deserialize<T>(File.ReadAllBytes(file), json) ?? throw new InvalidDataException("Missing JSON.");
void Require(bool condition, string message) { if (!condition) throw new InvalidDataException(message); }
string Sanitize(string text)
{
    var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
    return text.Replace(home, "<local>", StringComparison.OrdinalIgnoreCase).Replace(home.Replace('\\', '/'), "<local>", StringComparison.OrdinalIgnoreCase)
        .Replace(root, "<repo>", StringComparison.OrdinalIgnoreCase).Replace(root.Replace('\\', '/'), "<repo>", StringComparison.OrdinalIgnoreCase).Replace("\r\n", "\n", StringComparison.Ordinal);
}
async Task<string> Process(string executable, string[] arguments, string working)
{
    using var process = new Process { StartInfo = new(executable) { WorkingDirectory = working, UseShellExecute = false,
        CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true } };
    foreach (var value in arguments) process.StartInfo.ArgumentList.Add(value);
    process.StartInfo.Environment["MIKTEX_ENABLE_INSTALLER"] = "0";
    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(60));
    process.Start(); var captured = 0;
    async Task<string> Capture(StreamReader reader)
    {
        var result = new StringBuilder(); var buffer = new char[4096];
        while (true)
        {
            var count = await reader.ReadAsync(buffer.AsMemory(), timeout.Token); if (count == 0) return result.ToString();
            if (Interlocked.Add(ref captured, count) > 1_000_000) { process.Kill(true); throw new InvalidOperationException("Dash oracle output limit exceeded."); }
            result.Append(buffer, 0, count);
        }
    }
    var stdout = Capture(process.StandardOutput); var stderr = Capture(process.StandardError);
    try
    {
        await process.WaitForExitAsync(timeout.Token); var result = await Task.WhenAll(stdout, stderr);
        Require(process.ExitCode == 0, Path.GetFileName(executable) + " failed: " + Sanitize(string.Join('\n', result)));
        return string.Join('\n', result).Replace("\r\n", "\n", StringComparison.Ordinal);
    }
    catch { if (!process.HasExited) process.Kill(true); try { await Task.WhenAll(stdout, stderr); } catch { } throw; }
}
var tools = new Dictionary<string, (string Path, Tool Identity)>(StringComparer.Ordinal);
async Task Identify()
{
    foreach (var (name, version) in new[] { ("latex", "MiKTeX-pdfTeX 4.21 (MiKTeX 25.4)"), ("pdflatex", "MiKTeX-pdfTeX 4.21 (MiKTeX 25.4)"), ("dvisvgm", "dvisvgm 3.4.3"), ("pdftoppm", "pdftoppm version 24.04.0"), ("kpsewhich", "MiKTeX") })
    {
        var exe = (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator).Select(p => Path.Combine(p.Trim('"'), name + (OperatingSystem.IsWindows() ? ".exe" : ""))).FirstOrDefault(File.Exists)
            ?? throw new InvalidDataException("Required oracle executable missing: " + name);
        var actual = await Process(exe, [name == "pdftoppm" ? "-v" : "--version"], root); Require(actual.Contains(version, StringComparison.Ordinal), "Incompatible oracle tool: " + name);
        tools.Add(name, (exe, new(name, actual.Split('\n', StringSplitOptions.RemoveEmptyEntries)[0], FileHash(exe))));
    }
}
string NormalizeLog(string log) => Sanitize(log);
string[] FrameRecords(string log) => Regex.Matches(log.Replace("\r", "", StringComparison.Ordinal).Replace("\n", "", StringComparison.Ordinal), @"LOKAD-(?:BOX|BOUNDS|PAGE) [^|]*?(?:\|[^|]*?)*?\|END")
    .Select(m => m.Value).ToArray();
async Task<Run> GenerateRun(string folder, bool pdf, bool probes)
{
    Directory.CreateDirectory(folder); File.Copy(At(fixture), Path.Combine(folder, "source.tikz")); File.Copy(At(wrapper), Path.Combine(folder, "wrapper.tex"));
    File.WriteAllText(Path.Combine(folder, "case.tex"), (pdf ? "\\def\\lokadpdf{1}" : "") + (probes ? "\\def\\lokadprobeenable{1}" : "") + "\\input{wrapper.tex}\n", new UTF8Encoding(false));
    var engine = pdf ? "pdflatex" : "latex";
    await Process(tools[engine].Path, ["-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", "-disable-installer", "-recorder", "case.tex"], folder);
    var log = Text(Path.Combine(folder, "case.log")); Require(log.Contains("LOKAD-PGF-VERSION 3.1.11a", StringComparison.Ordinal), "Unexpected PGF version.");
    Require(log.Contains("LOKAD-DRIVER " + (pdf ? "pgfsys-pdftex.def" : "pgfsys-dvisvgm.def"), StringComparison.Ordinal), "Unexpected PGF driver.");
    if (pdf)
        foreach (var scale in new[] { 1, 4 }) await Process(tools["pdftoppm"].Path, ["-png", "-r", (96 * scale).ToString(CultureInfo.InvariantCulture), "-f", "1", "-singlefile", "case.pdf", "page-" + scale + "x"], folder);
    else await Process(tools["dvisvgm"].Path, ["--no-fonts", "--exact-bbox", "--bbox=min", "--page=1", "--output=reference.svg", "case.dvi"], folder);
    var inputs = new SortedDictionary<string, string>(StringComparer.Ordinal);
    foreach (var line in Text(Path.Combine(folder, "case.fls")).Split('\n').Where(l => l.StartsWith("INPUT ", StringComparison.Ordinal)))
    {
        var input = Path.GetFullPath(line[6..], folder); var name = Path.GetFileName(input);
        if (!File.Exists(input) || input.StartsWith(folder + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || Path.GetExtension(input) == ".fmt") continue;
        var hash = FileHash(input); if (inputs.TryGetValue(name, out var existing)) Require(existing == hash, "Ambiguous recorded input: " + name);
        inputs[name] = hash;
    }
    Require(inputs.ContainsKey("tikz.code.tex") && inputs.ContainsKey("pgfcoregraphicstate.code.tex"), "Missing recorded PGF sources.");
    return new(folder, log, inputs);
}

void Cached(string directory)
{
    var snapshot = Read<Snapshot>(snapshotFile); var provenance = Read<Provenance>(Path.Combine(directory, "provenance.json"));
    Require(snapshot.SchemaVersion == 1 && snapshot.Id == "pgf-3.1.11a-native-dash-v1", "Unexpected dash snapshot.");
    Require(provenance.SchemaVersion == 1 && !provenance.ConverterInvoked && !provenance.ApprovedImagePolicy, "False oracle/admission claim.");
    Require(snapshot.SourceHashes.Count == sourceFiles.Length && sourceFiles.All(f => snapshot.SourceHashes.GetValueOrDefault(f) == FileHash(At(f))), "Changed trusted source/tool.");
    Require(provenance.SourceHashes.OrderBy(p => p.Key).SequenceEqual(snapshot.SourceHashes.OrderBy(p => p.Key)), "Changed source identities.");
    Require(provenance.Artifacts.OrderBy(p => p.Key).SequenceEqual(snapshot.Artifacts.OrderBy(p => p.Key)), "Changed external artifact map.");
    Require(provenance.Inputs.OrderBy(p => p.Key).SequenceEqual(snapshot.Inputs.OrderBy(p => p.Key)), "Changed recorded inputs.");
    Require(provenance.Tools.SequenceEqual(snapshot.Tools), "Changed tool identities.");
    foreach (var (file, hash) in snapshot.Artifacts)
    {
        Require(Path.GetFileName(file) == file && FileHash(Path.Combine(directory, file)) == hash, "Changed cached artifact: " + file);
    }
    var source = Text(At(fixture)); var dvi = DashEvidence.Parse(source, Text(Path.Combine(directory, "svg.log")), false);
    var pdf = DashEvidence.Parse(source, Text(Path.Combine(directory, "pdf.log")), true);
    Require(FrameRecords(Text(Path.Combine(directory, "svg-plain.log"))).SequenceEqual(FrameRecords(Text(Path.Combine(directory, "svg.log"))))
        && FrameRecords(Text(Path.Combine(directory, "pdf-plain.log"))).SequenceEqual(FrameRecords(Text(Path.Combine(directory, "pdf.log")))), "Probe changed native frame/page.");
    Require(JsonSerializer.Serialize(dvi.Records, json) == JsonSerializer.Serialize(pdf.Records, json), "DVI/PDF native dash state differs.");
    var metrics = Read<Metrics>(Path.Combine(directory, "metrics.json"));
    Require(JsonSerializer.Serialize(metrics.Svg, json) == JsonSerializer.Serialize(dvi, json) && JsonSerializer.Serialize(metrics.Pdf, json) == JsonSerializer.Serialize(pdf, json), "Falsified native metrics.");
    Require(metrics.SourceSha256 == FileHash(At(fixture)) && !metrics.ConverterInvoked && !metrics.ApprovedImagePolicy && metrics.PlainProbedSvgIdentical && metrics.PlainProbedPdfIdentical, "Falsified invariance/source claim.");
    Require(FileHash(Path.Combine(directory, "reference.svg")) == FileHash(Path.Combine(directory, "plain-reference.svg")), "Probe changed SVG.");
    Require(FileHash(Path.Combine(directory, "reference.pdf")) == FileHash(Path.Combine(directory, "plain-reference.pdf")), "Probe changed PDF.");
    foreach (var scale in new[] { 1, 4 }) Require(FileHash(Path.Combine(directory, "pdf-page-" + scale + "x.png")) == FileHash(Path.Combine(directory, "plain-pdf-page-" + scale + "x.png")), "Probe changed PDF raster.");
    var references = typeof(DashEvidence).Assembly.GetReferencedAssemblies().Select(a => a.Name ?? "").Order(StringComparer.Ordinal).ToArray();
    Require(references.All(n => n == "System" || n.StartsWith("System.", StringComparison.Ordinal)), "Oracle references nonframework code.");
    Require(snapshot.FrameworkReferences.SequenceEqual(references), "Changed generator framework references.");
    Console.WriteLine("Cached dash oracle: 40 native states, plain/probed SVG/PDF invariance, independent page frame. Image policy pending.");
}

try
{
    Require(args.Length == 1 && args[0] is "generate" or "verify" or "check-cached", "Usage: TikzDashReference <generate|verify|check-cached>");
    if (args[0] == "check-cached") { Cached(baseline); return 0; }
    await Identify(); var work = At("artifacts/dash-reference/run-" + Guid.NewGuid().ToString("D")); Directory.CreateDirectory(work);
    Console.WriteLine("Fresh trusted dash reference: " + Path.GetRelativePath(root, work).Replace('\\', '/'));
    var plainSvg = await GenerateRun(Path.Combine(work, "svg-plain"), false, false);
    var probedSvg = await GenerateRun(Path.Combine(work, "svg-probed"), false, true);
    var plainPdf = await GenerateRun(Path.Combine(work, "pdf-plain"), true, false);
    var probedPdf = await GenerateRun(Path.Combine(work, "pdf-probed"), true, true);
    var source = Text(At(fixture)); var svg = DashEvidence.Parse(source, probedSvg.Log, false); var pdf = DashEvidence.Parse(source, probedPdf.Log, true);
    Require(JsonSerializer.Serialize(svg.Records, json) == JsonSerializer.Serialize(pdf.Records, json), "Native SVG/PDF dash records differ.");
    Require(svg.Bounds == pdf.Bounds && svg.Box == pdf.Box, "Native picture/box differs between drivers.");
    Require(FileHash(Path.Combine(plainSvg.Folder, "reference.svg")) == FileHash(Path.Combine(probedSvg.Folder, "reference.svg")), "SVG probes interfere.");
    Require(FileHash(Path.Combine(plainPdf.Folder, "case.pdf")) == FileHash(Path.Combine(probedPdf.Folder, "case.pdf")), "PDF probes interfere.");
    Require(FrameRecords(plainSvg.Log).Length == 2 && FrameRecords(plainPdf.Log).Length == 3
        && FrameRecords(plainSvg.Log).SequenceEqual(FrameRecords(probedSvg.Log)) && FrameRecords(plainPdf.Log).SequenceEqual(FrameRecords(probedPdf.Log)), "Native plain/probed frame/page differs.");
    var dest = Path.Combine(work, "baseline"); Directory.CreateDirectory(dest);
    var files = new[] { (probedSvg.Folder, "reference.svg", "reference.svg"), (plainSvg.Folder, "reference.svg", "plain-reference.svg"),
        (probedPdf.Folder, "case.pdf", "reference.pdf"), (plainPdf.Folder, "case.pdf", "plain-reference.pdf") };
    foreach (var (folder, file, target) in files) File.Copy(Path.Combine(folder, file), Path.Combine(dest, target));
    foreach (var scale in new[] { 1, 4 })
    {
        var file = "page-" + scale + "x.png"; Require(FileHash(Path.Combine(plainPdf.Folder, file)) == FileHash(Path.Combine(probedPdf.Folder, file)), "Raster probes interfere.");
        File.Copy(Path.Combine(probedPdf.Folder, file), Path.Combine(dest, "pdf-" + file)); File.Copy(Path.Combine(plainPdf.Folder, file), Path.Combine(dest, "plain-pdf-" + file));
        var bytes = File.ReadAllBytes(Path.Combine(dest, "pdf-" + file));
        Require(bytes.Length >= 24 && BitConverter.ToString(bytes, 0, 8) == "89-50-4E-47-0D-0A-1A-0A", "Malformed native raster.");
        var w = System.Buffers.Binary.BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(16, 4)); var h = System.Buffers.Binary.BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(20, 4));
        Require(w == Math.Ceiling(pdf.Page!.Width * (96d / (72.27 * 65536)) * scale) && h == Math.Ceiling(pdf.Page.Height * (96d / (72.27 * 65536)) * scale) && (long)w * h <= 20_000_000, "Native raster/page dimensions differ.");
    }
    File.WriteAllText(Path.Combine(dest, "svg.log"), NormalizeLog(probedSvg.Log), new UTF8Encoding(false)); File.WriteAllText(Path.Combine(dest, "pdf.log"), NormalizeLog(probedPdf.Log), new UTF8Encoding(false));
    File.WriteAllText(Path.Combine(dest, "svg-plain.log"), NormalizeLog(plainSvg.Log), new UTF8Encoding(false)); File.WriteAllText(Path.Combine(dest, "pdf-plain.log"), NormalizeLog(plainPdf.Log), new UTF8Encoding(false));
    var document = XDocument.Load(Path.Combine(dest, "reference.svg"));
    var drawing = document.Descendants().Where(e => e.Name.LocalName == "path" && !e.Ancestors().Any(a => a.Name.LocalName is "defs" or "clipPath")).ToArray(); Require(drawing.Length == 40, "Native SVG paint coverage differs.");
    var originGroup = document.Descendants().Single(e => (e.Attribute("transform")?.Value ?? "").StartsWith("translate(", StringComparison.Ordinal));
    var origin = Regex.Match(originGroup.Attribute("transform")!.Value, @"^translate\(([-\d.]+),([-\d.]+)\)scale\(([-\d.]+),([-\d.]+)\)$"); Require(origin.Success, "Native driver origin missing.");
    double D(string text) => double.Parse(text, CultureInfo.InvariantCulture);
    var driverOrigin = new { x = D(origin.Groups[1].Value), y = D(origin.Groups[2].Value) };
    Require(Math.Abs(D(origin.Groups[3].Value) - 72 / 72.27) <= 0.000001 && Math.Abs(D(origin.Groups[4].Value) + 72 / 72.27) <= 0.000001, "Unexpected SVG driver scale.");
    var page = pdf.Page!; const double spToCss = 96d / (72.27 * 65536);
    Write(Path.Combine(dest, "metrics.json"), new Metrics(1, FileHash(At(fixture)), false, false, true, true, svg, pdf,
        JsonSerializer.SerializeToElement(driverOrigin, json), JsonSerializer.SerializeToElement(new { x = (page.X - pdf.Bounds.MinX) * spToCss,
            y = (page.Height - page.BaselineY + pdf.Bounds.MinY) * spToCss }, json)));
    var artifacts = Directory.GetFiles(dest).ToDictionary(f => Path.GetFileName(f)!, FileHash, StringComparer.Ordinal);
    var sourceHashes = sourceFiles.ToDictionary(f => f, f => FileHash(At(f)), StringComparer.Ordinal);
    var inputs = new SortedDictionary<string, string>(StringComparer.Ordinal);
    foreach (var run in new[] { plainSvg, probedSvg, plainPdf, probedPdf }) foreach (var (name, hash) in run.Inputs)
    { if (inputs.TryGetValue(name, out var previous)) Require(previous == hash, "Ambiguous cross-driver input: " + name); inputs[name] = hash; }
    var identities = tools.Values.Select(t => t.Identity).OrderBy(t => t.Name, StringComparer.Ordinal).ToArray();
    var references = typeof(DashEvidence).Assembly.GetReferencedAssemblies().Select(a => a.Name ?? "").Order(StringComparer.Ordinal).ToArray();
    Require(references.All(n => n == "System" || n.StartsWith("System.", StringComparison.Ordinal)), "Generator references nonframework code.");
    var provenance = new Provenance(1, false, false, sourceHashes, artifacts!, inputs, identities);
    Write(Path.Combine(dest, "provenance.json"), provenance);
    var snapshot = new Snapshot(1, "pgf-3.1.11a-native-dash-v1", sourceHashes, artifacts!, inputs, identities, references);
    if (args[0] == "generate")
    {
        Directory.CreateDirectory(baseline); foreach (var file in Directory.GetFiles(dest)) File.Copy(file, Path.Combine(baseline, Path.GetFileName(file)), true);
        Write(snapshotFile, snapshot); Cached(baseline); Console.WriteLine("Dash reference generated explicitly. No converter or image policy.");
    }
    else
    {
        Cached(baseline); var expected = Read<Snapshot>(snapshotFile);
        Require(expected.SourceHashes.OrderBy(p => p.Key).SequenceEqual(sourceHashes.OrderBy(p => p.Key)) && expected.Inputs.OrderBy(p => p.Key).SequenceEqual(inputs.OrderBy(p => p.Key)) && expected.Tools.SequenceEqual(identities), "Live oracle identity changed.");
        foreach (var (file, hash) in expected.Artifacts) if (!file.EndsWith(".log", StringComparison.Ordinal)) Require(FileHash(Path.Combine(dest, file)) == hash, "Deterministic live artifact differs: " + file);
        Console.WriteLine("Fresh nonoverwriting native dash verification passes.");
    }
    return 0;
}
catch (Exception error) { Console.Error.WriteLine(Sanitize(error.Message)); return 2; }

internal sealed record Run(string Folder, string Log, SortedDictionary<string, string> Inputs);
internal sealed record Tool(string Name, string Version, string Sha256);
internal sealed record Metrics(int SchemaVersion, string SourceSha256, bool ConverterInvoked, bool ApprovedImagePolicy, bool PlainProbedSvgIdentical, bool PlainProbedPdfIdentical,
    DashMeasurement Svg, DashMeasurement Pdf, JsonElement DriverOriginBp, JsonElement PdfOriginCss);
internal sealed record Provenance(int SchemaVersion, bool ConverterInvoked, bool ApprovedImagePolicy, Dictionary<string, string> SourceHashes, Dictionary<string, string> Artifacts, SortedDictionary<string, string> Inputs, Tool[] Tools);
internal sealed record Snapshot(int SchemaVersion, string Id, Dictionary<string, string> SourceHashes, Dictionary<string, string> Artifacts, SortedDictionary<string, string> Inputs, Tool[] Tools, string[] FrameworkReferences);

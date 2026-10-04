using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Lokad.TikZ.Text;
using TikzFontData;

return await FontGenerator.Run(args);

internal static partial class FontGenerator
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true, NewLine = "\n" };
    private static readonly JsonSerializerOptions CompactJson = new(JsonSerializerDefaults.Web);
    private static readonly CultureInfo Invariant = CultureInfo.InvariantCulture;

    internal static async Task<int> Run(string[] args)
    {
        try
        {
            if (args.Length != 1 || args[0] is not ("generate" or "verify" or "compare" or "generate-text-reference" or "verify-text-reference" or "compare-text" or "calibrate-text-reference"))
                throw new InvalidOperationException("Usage: TikzFontData <generate|verify|compare|generate-text-reference|verify-text-reference|compare-text|calibrate-text-reference>. Only explicit generation commands update baselines.");
            var root = FindRoot();
            var manifestPath = Path.Combine(root, "tools/TikzFontData/font-profile.json");
            var manifest = JsonSerializer.Deserialize<FontManifest>(File.ReadAllText(manifestPath), Json)!;
            if (manifest.SchemaVersion != 1 || manifest.Id != "latin-modern-ec-10-12-v1" || manifest.Fonts.Length != 6)
                throw new InvalidOperationException("Incompatible pinned font profile.");
            string[] expectedFaces = ["regular-10", "bold-10", "italic-10", "regular-12", "bold-12", "italic-12"];
            if (!manifest.Fonts.Select(f => f.Id).Order(StringComparer.Ordinal).SequenceEqual(expectedFaces.Order(StringComparer.Ordinal)))
                throw new InvalidOperationException("Missing or duplicated font-profile face.");
            if (args[0] is "generate-text-reference" or "verify-text-reference" or "compare-text" or "calibrate-text-reference")
                return await TextReferences(root, manifest, args[0]);
            if (args[0] == "compare") return await CompareAtlases(root, manifest);
            var tools = new List<object>();
            foreach (var (name, version) in new[] { ("latex", manifest.LatexVersion), ("dvisvgm", manifest.DvisvgmVersion) })
            {
                var executable = ResolveExecutable(name);
                var result = await RunProcess(executable, ["--version"], root);
                if (!result.Split('\n', StringSplitOptions.TrimEntries).Contains(version, StringComparer.Ordinal))
                    throw new InvalidOperationException($"{name} version does not match the font profile.");
                tools.Add(new { name, version, sha256 = Hash(File.ReadAllBytes(executable)) });
            }
            var inputs = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var input in manifest.Inputs)
            {
                if (!Regex.IsMatch(input.Name, "^[a-zA-Z0-9-]+\\.[a-zA-Z0-9]+$")) throw new InvalidOperationException("Invalid font input name.");
                var located = (await RunProcess("kpsewhich", [input.Name], root)).Trim();
                if (!File.Exists(located) || Hash(File.ReadAllBytes(located)) != input.Sha256)
                    throw new InvalidOperationException($"Pinned font input mismatch: {input.Name}.");
                inputs.Add(input.Name, located);
            }
            var encoding = File.ReadAllText(inputs["lm-ec.enc"]);
            var encodingStart = encoding.IndexOf("/enclmec[", StringComparison.Ordinal);
            if (encodingStart < 0) throw new InvalidOperationException("Missing pinned font encoding array.");
            var array = encoding[(encodingStart + "/enclmec[".Length)..];
            var names = Regex.Matches(array[..array.IndexOf(']')], "/([A-Za-z0-9.]+)").Select(m => m.Groups[1].Value).ToArray();
            if (names.Length != 256) throw new InvalidOperationException("Invalid pinned font encoding.");
            var wrapper = File.ReadAllText(Path.Combine(root, "tools/TikzFontData/atlas.tex")).Replace("\r\n", "\n", StringComparison.Ordinal);
            var aggregate = new List<object>();
            foreach (var font in manifest.Fonts)
            {
                if (!Regex.IsMatch(font.Id, "^(regular|bold|italic)-(10|12)$") || font.SizePt is not (10 or 12)
                    || !inputs.ContainsKey(font.Tfm) || !inputs.ContainsKey(font.Pfb))
                    throw new InvalidOperationException("Invalid pinned font face.");
                var tfm = new TfmReader(File.ReadAllBytes(inputs[font.Tfm]), names);
                if (tfm.DesignSizeFix != font.SizePt * 1048576) throw new InvalidOperationException("Incorrect font design size.");
                var sizeSp = font.SizePt * 65536;
                var work = Path.Combine(root, "artifacts/font-data", font.Id);
                Directory.CreateDirectory(work);
                var pairs = new StringBuilder();
                foreach (var pair in tfm.Pairs)
                    pairs.Append(CultureInfo.InvariantCulture, $"\\setbox0=\\hbox{{\\char{pair.Left}\\char{pair.Right}}}\\typeout{{LOKAD-PAIR {pair.Left};{pair.Right};\\number\\wd0;\\number\\ht0;\\number\\dp0}}\n");
                var source = wrapper.Replace("@@FONT@@", Path.GetFileNameWithoutExtension(font.Tfm), StringComparison.Ordinal)
                    .Replace("@@SIZE@@", font.SizePt.ToString(Invariant), StringComparison.Ordinal)
                    .Replace("@@PARAMETERS@@", (tfm.ParametersFix.Length + 1).ToString(Invariant), StringComparison.Ordinal)
                    .Replace("@@PAIRS@@", pairs.ToString(), StringComparison.Ordinal);
                File.WriteAllText(Path.Combine(work, "atlas.tex"), source, new UTF8Encoding(false));
                await RunProcess("latex", ["-disable-write18", "-disable-installer", "-interaction=nonstopmode", "-halt-on-error", "-recorder", "atlas.tex"], work);
                await RunProcess("dvisvgm", ["--no-fonts", "--exact-bbox", "--bbox=min", "--precision=6", "--fontmap=" + inputs["lm.map"], "--cache=none", "--output=atlas.svg", "atlas.dvi"], work);
                var log = File.ReadAllText(Path.Combine(work, "atlas.log")).Replace("\r\n", "\n", StringComparison.Ordinal);
                // TeX wraps long typeout lines at its log limit. The next record
                // starts with LOKAD-, so unwrap only each numeric record.
                var glyphBoxes = Records(log, "GLYPH", 8);
                var parameterValues = Records(log, "PARAM", 2);
                var pairBoxes = Records(log, "PAIR", 5);
                if (glyphBoxes.Length != 256 || parameterValues.Length != tfm.ParametersFix.Length || pairBoxes.Length != tfm.Pairs.Length)
                    throw new InvalidOperationException("Incomplete independent font measurements.");
                for (var slot = 0; slot < 256; slot++)
                {
                    var g = tfm.Glyphs[slot];
                    var expected = new[] { slot, FontData.ScaleFix(g.AdvanceFix, sizeSp), Math.Max(0, FontData.ScaleFix(g.HeightFix, sizeSp)),
                        Math.Max(0, FontData.ScaleFix(g.DepthFix, sizeSp)), FontData.ScaleFix(g.AdvanceFix, sizeSp),
                        FontData.ScaleFix(g.HeightFix, sizeSp), FontData.ScaleFix(g.DepthFix, sizeSp), FontData.ScaleFix(g.ItalicFix, sizeSp) };
                    if (!expected.SequenceEqual(glyphBoxes[slot])) throw new InvalidOperationException($"Independent glyph metric mismatch: {font.Id}, slot {slot}.");
                }
                for (var index = 0; index < tfm.ParametersFix.Length; index++)
                {
                    var expected = index == 0 ? tfm.ParametersFix[index] >> 4 : FontData.ScaleFix(tfm.ParametersFix[index], sizeSp);
                    if (!parameterValues[index].SequenceEqual(new[] { index + 1, expected }))
                        throw new InvalidOperationException($"Independent font parameter mismatch: {font.Id}, parameter {index + 1}.");
                }
                for (var index = 0; index < tfm.Pairs.Length; index++)
                {
                    var p = tfm.Pairs[index];
                    var left = tfm.Glyphs[p.Ligature ?? p.Left];
                    var right = p.Ligature.HasValue ? left : tfm.Glyphs[p.Right];
                    var width = p.Ligature.HasValue ? FontData.ScaleFix(left.AdvanceFix, sizeSp)
                        : FontData.ScaleFix(left.AdvanceFix, sizeSp) + FontData.ScaleFix(right.AdvanceFix, sizeSp) + FontData.ScaleFix(p.KernFix!.Value, sizeSp);
                    var height = Math.Max(0, Math.Max(FontData.ScaleFix(left.HeightFix, sizeSp), FontData.ScaleFix(right.HeightFix, sizeSp)));
                    var depth = Math.Max(0, Math.Max(FontData.ScaleFix(left.DepthFix, sizeSp), FontData.ScaleFix(right.DepthFix, sizeSp)));
                    if (!pairBoxes[index].SequenceEqual(new[] { p.Left, p.Right, width, height, depth }))
                        throw new InvalidOperationException($"Independent kerning/ligature mismatch: {font.Id}, slots {p.Left}/{p.Right}.");
                }
                var svg = XDocument.Load(Path.Combine(work, "atlas.svg"));
                XNamespace ns = "http://www.w3.org/2000/svg";
                var definitions = svg.Descendants(ns + "defs").Single().Elements(ns + "path").ToArray();
                if (definitions.Length != 256 || definitions.Any(p => p.Attributes().Any(a => a.Name.LocalName is not ("id" or "d"))))
                    throw new InvalidOperationException("Unexpected glyph outline vocabulary.");
                var outlines = definitions.ToDictionary(p => (string)p.Attribute("id")!, p => (string)p.Attribute("d")!);
                var glyphs = tfm.Glyphs.Select(g => g with { PathBp = outlines[$"g0-{g.Slot}"] }).ToArray();
                var data = new FontData(1, font.Id, "GUST Font License 1.0 / LPPL-1.3c-or-later", tfm.DesignSizeFix, tfm.Checksum, tfm.ParametersFix, glyphs, tfm.Pairs);
                var resource = JsonSerializer.Serialize(data, CompactJson) + "\n";
                var metrics = JsonSerializer.Serialize(new { schemaVersion = 1, profile = manifest.Id, font = font.Id, units = "integer TeX scaled points (sp)",
                    glyphColumns = new[] { "slot", "boxWidth", "boxHeight", "boxDepth", "advance", "height", "depth", "italicCorrection" }, glyphs = glyphBoxes,
                    parameters = parameterValues, pairColumns = new[] { "left", "right", "width", "height", "depth" }, pairs = pairBoxes }, CompactJson) + "\n";
                var resourcePath = Path.Combine(root, $"src/Lokad.TikZ/Resources/Fonts/LokadTikzText-{font.Id}.json");
                var metricsPath = Path.Combine(root, $"tests/Reference/Fonts/{font.Id}.json");
                var atlasPath = Path.Combine(root, $"tests/Reference/Fonts/{font.Id}.svg");
                var atlas = FramedOracle(svg);
                foreach (var (file, text) in new[] { (resourcePath, resource), (metricsPath, metrics), (atlasPath, atlas) })
                {
                    if (args[0] == "generate") { Directory.CreateDirectory(Path.GetDirectoryName(file)!); File.WriteAllText(file, text, new UTF8Encoding(false)); }
                    else if (!File.Exists(file) || File.ReadAllText(file) != text) throw new InvalidOperationException($"Generated data differs: {Path.GetFileName(file)}.");
                }
                aggregate.Add(new { font = font.Id, glyphs = 256, pairs = tfm.Pairs.Length, ligatures = tfm.Pairs.Count(p => p.Ligature.HasValue),
                    exactIndependentMetrics = true, resourceBytes = Encoding.UTF8.GetByteCount(resource), resourceSha256 = Hash(Encoding.UTF8.GetBytes(resource)),
                    metricsSha256 = Hash(Encoding.UTF8.GetBytes(metrics)), atlasSha256 = Hash(Encoding.UTF8.GetBytes(atlas)), wrapperSha256 = Hash(Encoding.UTF8.GetBytes(source)) });
                Console.WriteLine($"{font.Id}: 256 glyphs and {tfm.Pairs.Length} pair rules match independent TeX metrics exactly");
            }
            var evidence = new { schemaVersion = 1, profile = manifest.Id, manifestSha256 = Hash(File.ReadAllBytes(manifestPath)),
                wrapperSha256 = Hash(Encoding.UTF8.GetBytes(wrapper)), tools, inputs = manifest.Inputs, fonts = aggregate,
                arguments = new[] { "latex -disable-write18 -disable-installer -interaction=nonstopmode -halt-on-error -recorder atlas.tex",
                    "dvisvgm --no-fonts --exact-bbox --bbox=min --precision=6 --fontmap=<pinned lm.map> --cache=none --output=atlas.svg atlas.dvi" } };
            File.WriteAllText(Path.Combine(root, "artifacts/font-data/evidence.json"), JsonSerializer.Serialize(evidence, Json) + "\n");
            if (args[0] == "generate")
                File.WriteAllText(Path.Combine(root, "src/Lokad.TikZ/Resources/Fonts/provenance.json"), JsonSerializer.Serialize(evidence, Json) + "\n");
            return 0;
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            // Exceptions may contain installed-font or executable paths. Keep
            // process logs local; report only our own bounded error messages.
            Console.Error.WriteLine(e is InvalidOperationException or InvalidDataException ? e.Message : e.GetType().Name);
            return 2;
        }
    }

    private static int[][] Records(string log, string kind, int columns)
    {
        var matches = Regex.Matches(log, $"LOKAD-{kind} ([0-9;\\-\\r\\n]+)");
        var result = matches.Select(m => m.Groups[1].Value.Replace("\n", "", StringComparison.Ordinal).Replace("\r", "", StringComparison.Ordinal)
            .TrimEnd(';').Split(';').Select(s => int.Parse(s, Invariant)).ToArray()).ToArray();
        if (result.Any(r => r.Length != columns)) throw new InvalidOperationException("Malformed independent font record.");
        return result;
    }

    private static string Hash(byte[] data) => Convert.ToHexStringLower(SHA256.HashData(data));
    private static string FindRoot()
    {
        for (var directory = new DirectoryInfo(Environment.CurrentDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "Lokad.TikZ.slnx"))) return directory.FullName;
        throw new InvalidOperationException("Run the font generator within the repository.");
    }

    private static string ResolveExecutable(string name)
    {
        foreach (var folder in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
        {
            var candidate = Path.Combine(folder, name + (OperatingSystem.IsWindows() ? ".exe" : ""));
            if (File.Exists(candidate)) return Path.GetFullPath(candidate);
        }
        throw new InvalidOperationException("Required font-tool executable is missing: " + name);
    }

    private static async Task<string> RunProcess(string executable, string[] arguments, string directory, bool allowMismatch = false)
    {
        using var process = new Process { StartInfo = new(executable) { WorkingDirectory = directory, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true } };
        foreach (var argument in arguments) process.StartInfo.ArgumentList.Add(argument);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        process.Start();
        async Task<string> Capture(StreamReader reader)
        {
            var buffer = new char[4096];
            var output = new StringBuilder();
            for (var n = await reader.ReadAsync(buffer, timeout.Token); n > 0; n = await reader.ReadAsync(buffer, timeout.Token))
            {
                if (output.Length + n > 8_000_000) throw new InvalidOperationException("Font tool output exceeds the harness limit.");
                output.Append(buffer, 0, n);
            }
            return output.ToString();
        }
        var stdout = Capture(process.StandardOutput);
        var stderr = Capture(process.StandardError);
        try
        {
            await process.WaitForExitAsync(timeout.Token);
            var outputs = await Task.WhenAll(stdout, stderr);
            if (process.ExitCode != 0 && !(allowMismatch && process.ExitCode == 1))
                throw new InvalidOperationException($"Font tool {Path.GetFileName(executable)} failed; inspect artifacts/font-data or font-comparisons logs.");
            return outputs[0] + outputs[1];
        }
        finally { if (!process.HasExited) process.Kill(true); }
    }
}

internal sealed record FontManifest(int SchemaVersion, string Id, string LatexVersion, string DvisvgmVersion, FontInput[] Inputs, FontFace[] Fonts);
internal sealed record FontInput(string Name, string Sha256);
internal sealed record FontFace(string Id, int SizePt, string Tfm, string Pfb);

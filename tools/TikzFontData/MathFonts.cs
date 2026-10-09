using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Lokad.TikZ.Text;
using TikzFontData;

internal static partial class FontGenerator
{
    // Text and math use the same independent raw-font measurements. Math layout
    // and its eventual image policies remain a separate qualification boundary.
    private static string PairSource(TfmReader tfm)
    {
        var result = new StringBuilder();
        foreach (var p in tfm.Pairs)
            result.Append(Invariant, $"\\setbox0=\\hbox{{\\char{p.Left}\\char{p.Right}}}\\typeout{{LOKAD-PAIR {p.Left};{p.Right};\\number\\wd0;\\number\\ht0;\\number\\dp0}}\n");
        return result.ToString();
    }

    private static void ValidateFontMetrics(TfmReader tfm, int sizeSp, string id,
        int[][] glyphBoxes, int[][] parameters, int[][] pairs)
    {
        if (glyphBoxes.Length != tfm.LastSlot + 1 || parameters.Length != tfm.ParametersFix.Length || pairs.Length != tfm.Pairs.Length)
            throw new InvalidOperationException("Incomplete independent font measurements.");
        var glyphs = tfm.Glyphs.ToDictionary(g => g.Slot);
        for (var slot = 0; slot <= tfm.LastSlot; slot++)
        {
            var expected = glyphs.TryGetValue(slot, out var g)
                ? new[] { slot, FontData.ScaleFix(g.AdvanceFix, sizeSp), Math.Max(0, FontData.ScaleFix(g.HeightFix, sizeSp)),
                    Math.Max(0, FontData.ScaleFix(g.DepthFix, sizeSp)), FontData.ScaleFix(g.AdvanceFix, sizeSp),
                    FontData.ScaleFix(g.HeightFix, sizeSp), FontData.ScaleFix(g.DepthFix, sizeSp), FontData.ScaleFix(g.ItalicFix, sizeSp) }
                : new[] { slot, 0, 0, 0, 0, 0, 0, 0 };
            if (!expected.SequenceEqual(glyphBoxes[slot])) throw new InvalidOperationException($"Independent glyph metric mismatch: {id}, slot {slot}.");
        }
        for (var index = 0; index < tfm.ParametersFix.Length; index++)
        {
            var expected = index == 0 ? tfm.ParametersFix[index] >> 4 : FontData.ScaleFix(tfm.ParametersFix[index], sizeSp);
            if (!parameters[index].SequenceEqual(new[] { index + 1, expected }))
                throw new InvalidOperationException($"Independent font parameter mismatch: {id}, parameter {index + 1}.");
        }
        for (var index = 0; index < tfm.Pairs.Length; index++)
        {
            var p = tfm.Pairs[index];
            var left = glyphs[p.Ligature ?? p.Left];
            var right = p.Ligature.HasValue ? left : glyphs[p.Right];
            var width = p.Ligature.HasValue ? FontData.ScaleFix(left.AdvanceFix, sizeSp)
                : FontData.ScaleFix(left.AdvanceFix, sizeSp) + FontData.ScaleFix(right.AdvanceFix, sizeSp) + FontData.ScaleFix(p.KernFix!.Value, sizeSp);
            var height = Math.Max(0, Math.Max(FontData.ScaleFix(left.HeightFix, sizeSp), FontData.ScaleFix(right.HeightFix, sizeSp)));
            var depth = Math.Max(0, Math.Max(FontData.ScaleFix(left.DepthFix, sizeSp), FontData.ScaleFix(right.DepthFix, sizeSp)));
            if (!pairs[index].SequenceEqual(new[] { p.Left, p.Right, width, height, depth }))
                throw new InvalidOperationException($"Independent kerning/ligature mismatch: {id}, slots {p.Left}/{p.Right}.");
        }
    }

    private static async Task<int> MathFonts(string root, string command, bool radicalsOnly = false)
    {
        var manifestPath = Path.Combine(root, "tools/TikzFontData/math-font-profile.json");
        var manifest = JsonSerializer.Deserialize<MathFontManifest>(File.ReadAllText(manifestPath), Json)!;
        if (manifest.SchemaVersion != 1 || manifest.Id != "latin-modern-math-10-12-v1" || manifest.Fonts.Length != 19)
            throw new InvalidOperationException("Incompatible pinned math font profile.");
        var expected = new[] { "roman", "italic", "symbol" }.SelectMany(k => new[] { 5, 6, 7, 8, 10, 12 }.Select(s => $"math-{k}-{s}"))
            .Append("math-extension-10").Order(StringComparer.Ordinal);
        if (!manifest.Fonts.Select(f => f.Id).Order(StringComparer.Ordinal).SequenceEqual(expected))
            throw new InvalidOperationException("Missing or duplicated math font/size combination.");
        if (command == "compare-math")
            return await CompareAtlases(root, new FontManifest(1, manifest.Id, manifest.LatexVersion, manifest.DvisvgmVersion,
                manifest.Inputs, manifest.Fonts.Select(f => new FontFace(f.Id, f.SizePt, f.Tfm, f.Pfb)).ToArray()), math: true);
        var tools = new List<object>();
        foreach (var (name, version) in new[] { ("latex", manifest.LatexVersion), ("dvisvgm", manifest.DvisvgmVersion),
            ("dvitype", manifest.DviTypeVersion), ("kpsewhich", manifest.KpseVersion) })
        {
            var executable = ResolveExecutable(name);
            var digest = Hash(File.ReadAllBytes(executable));
            var result = await RunProcess(executable, ["--version"], root);
            if (!result.Split('\n', StringSplitOptions.TrimEntries).Contains(version, StringComparer.Ordinal)
                || !manifest.ToolHashes.TryGetValue(name, out var pinned) || digest != pinned)
                throw new InvalidOperationException("Changed pinned math font tool: " + name);
            tools.Add(new { name, version, sha256 = digest });
        }
        var inputs = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var input in manifest.Inputs)
        {
            if (!Regex.IsMatch(input.Name, "^[a-zA-Z0-9-]+\\.[a-zA-Z0-9]+$")) throw new InvalidOperationException("Invalid math font input name.");
            var location = (await RunProcess("kpsewhich", [input.Name], root)).Trim();
            if (!File.Exists(location) || Hash(File.ReadAllBytes(location)) != input.Sha256)
                throw new InvalidOperationException("Pinned math font input mismatch: " + input.Name);
            if (!inputs.TryAdd(input.Name, location)) throw new InvalidOperationException("Duplicated math font input.");
        }
        var wrapper = File.ReadAllText(Path.Combine(root, "tools/TikzFontData/atlas.tex")).Replace("\r\n", "\n", StringComparison.Ordinal);
        var aggregate = new List<object>();
        if (radicalsOnly)
        {
            using var previous = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "src/Lokad.TikZ/Resources/Fonts/math-provenance.json")));
            if (previous.RootElement.GetProperty("manifestSha256").GetString() != Hash(File.ReadAllBytes(manifestPath))
                || previous.RootElement.GetProperty("wrapperSha256").GetString() != Hash(Encoding.UTF8.GetBytes(wrapper))
                || JsonSerializer.Serialize(previous.RootElement.GetProperty("tools"), CompactJson) != JsonSerializer.Serialize(tools, CompactJson)
                || JsonSerializer.Serialize(previous.RootElement.GetProperty("inputs"), CompactJson) != JsonSerializer.Serialize(manifest.Inputs, CompactJson))
                throw new InvalidOperationException("Changed math font inputs require full generation.");
            var records = previous.RootElement.GetProperty("fonts").EnumerateArray().ToDictionary(r => r.GetProperty("font").GetString()!);
            if (records.Count != manifest.Fonts.Length) throw new InvalidOperationException("Incomplete preserved math font measurements.");
            foreach (var f in manifest.Fonts)
            {
                var r = records[f.Id];
                foreach (var (file, key) in new[] { ($"src/Lokad.TikZ/Resources/Fonts/LokadTikzMath-{f.Id}.json", "resourceSha256"),
                    ($"tests/Reference/MathFonts/{f.Id}.json", "metricsSha256"), ($"tests/Reference/MathFonts/{f.Id}.svg", "atlasSha256") })
                    if (Hash(File.ReadAllBytes(Path.Combine(root, file))) != r.GetProperty(key).GetString())
                        throw new InvalidOperationException("Changed math font data require full generation.");
                aggregate.Add(r.Clone());
            }
        }
        var run = Path.Combine(root, "artifacts/math-font-data", "run-" + Guid.NewGuid());
        Directory.CreateDirectory(run);
        foreach (var font in radicalsOnly ? Array.Empty<MathFontFace>() : manifest.Fonts)
        {
            if (!inputs.ContainsKey(font.Tfm) || !inputs.ContainsKey(font.Pfb) || !inputs.ContainsKey(font.Encoding)
                || font.SizePt is not (5 or 6 or 7 or 8 or 10 or 12))
                throw new InvalidOperationException("Invalid pinned math font face.");
            var encoding = File.ReadAllText(inputs[font.Encoding]);
            var start = encoding.IndexOf('[');
            var names = Regex.Matches(encoding[(start + 1)..encoding.IndexOf(']', start)], "/([A-Za-z0-9.]+)")
                .Select(m => m.Groups[1].Value).ToArray();
            var tfm = new TfmReader(File.ReadAllBytes(inputs[font.Tfm]), names, math: true);
            if (tfm.DesignSizeFix != font.DesignSizePt * 1048576 || tfm.Glyphs.Length != font.ExpectedGlyphs
                || tfm.LastSlot != font.ExpectedLastSlot || tfm.ParametersFix.Length != font.ExpectedParameters)
                throw new InvalidOperationException("Changed pinned math font table contract.");
            var work = Path.Combine(run, font.Id);
            Directory.CreateDirectory(work);
            var source = wrapper.Replace("@@FONT@@", Path.GetFileNameWithoutExtension(font.Tfm), StringComparison.Ordinal)
                .Replace("@@SIZE@@", font.SizePt.ToString(Invariant), StringComparison.Ordinal)
                .Replace("@@PARAMETERS@@", (tfm.ParametersFix.Length + 1).ToString(Invariant), StringComparison.Ordinal)
                .Replace("@@PAIRS@@", PairSource(tfm), StringComparison.Ordinal)
                .Replace("lokadslot<256", "lokadslot<" + (tfm.LastSlot + 1).ToString(Invariant), StringComparison.Ordinal)
                .Replace("lokadrow<16", "lokadrow<" + ((tfm.LastSlot + 16) / 16).ToString(Invariant), StringComparison.Ordinal);
            File.WriteAllText(Path.Combine(work, "atlas.tex"), source, new UTF8Encoding(false));
            File.WriteAllText(Path.Combine(work, "latex-process.log"), await RunProcess("latex",
                ["-disable-write18", "-disable-installer", "-interaction=nonstopmode", "-halt-on-error", "-recorder", "atlas.tex"], work));
            File.WriteAllText(Path.Combine(work, "dvisvgm-process.log"), await RunProcess("dvisvgm",
                ["--no-fonts", "--exact-bbox", "--bbox=min", "--precision=6", "--fontmap=" + inputs["lm.map"], "--cache=none", "--output=atlas.svg", "atlas.dvi"], work));
            var log = File.ReadAllText(Path.Combine(work, "atlas.log")).Replace("\r\n", "\n", StringComparison.Ordinal);
            var glyphBoxes = Records(log, "GLYPH", 8);
            var parameters = Records(log, "PARAM", 2);
            var pairs = Records(log, "PAIR", 5);
            ValidateFontMetrics(tfm, font.SizePt * 65536, font.Id, glyphBoxes, parameters, pairs);
            var svg = XDocument.Load(Path.Combine(work, "atlas.svg"));
            var definitions = svg.Descendants(Svg + "defs").Single().Elements(Svg + "path").ToArray();
            if (definitions.Length != tfm.Glyphs.Length || definitions.Any(p => p.Attributes().Any(a => a.Name.LocalName is not ("id" or "d"))))
                throw new InvalidOperationException("Unexpected math glyph outline vocabulary: " + font.Id);
            var outlines = definitions.ToDictionary(p => (string)p.Attribute("id")!, p => (string)p.Attribute("d")!);
            var glyphs = tfm.Glyphs.Select(g => g with { PathBp = outlines[$"g0-{g.Slot}"] }).ToArray();
            var data = new MathFontData(1, font.Id, "GUST Font License 1.0 / LPPL-1.3c-or-later", font.SizePt * 65536,
                tfm.DesignSizeFix, tfm.Checksum, tfm.LastSlot, tfm.ParametersFix, glyphs, tfm.Pairs, tfm.LargerGlyphs, tfm.Extensions, tfm.Recipes);
            var resource = JsonSerializer.Serialize(data, CompactJson) + "\n";
            var metrics = JsonSerializer.Serialize(new { schemaVersion = 1, profile = manifest.Id, font = font.Id, units = "integer TeX scaled points (sp)",
                glyphColumns = new[] { "slot", "boxWidth", "boxHeight", "boxDepth", "advance", "height", "depth", "italicCorrection" }, glyphs = glyphBoxes,
                parameters, pairColumns = new[] { "left", "right", "width", "height", "depth" }, pairs }, CompactJson) + "\n";
            var atlas = FramedOracle(svg, math: true);
            foreach (var (file, text) in new[] { ($"src/Lokad.TikZ/Resources/Fonts/LokadTikzMath-{font.Id}.json", resource),
                ($"tests/Reference/MathFonts/{font.Id}.json", metrics), ($"tests/Reference/MathFonts/{font.Id}.svg", atlas) })
            {
                var target = Path.Combine(root, file);
                if (command == "generate-math") { Directory.CreateDirectory(Path.GetDirectoryName(target)!); File.WriteAllText(target, text, new UTF8Encoding(false)); }
                else if (!File.Exists(target) || File.ReadAllText(target) != text) throw new InvalidOperationException("Generated math font data differs: " + Path.GetFileName(target));
            }
            var nativeInputs = new SortedDictionary<string, string>(StringComparer.Ordinal);
            foreach (var line in File.ReadLines(Path.Combine(work, "atlas.fls")).Where(l => l.StartsWith("INPUT ", StringComparison.Ordinal)))
            {
                var file = Path.GetFullPath(line[6..], work);
                if (file.StartsWith(work + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) continue;
                var name = Path.GetFileName(file); var hash = Hash(File.ReadAllBytes(file));
                if (nativeInputs.TryGetValue(name, out var old) && old != hash) throw new InvalidOperationException("Ambiguous native font input basename.");
                nativeInputs[name] = hash;
            }
            aggregate.Add(new { font = font.Id, selectedSizeSp = data.SizeSp, designSizeFix = tfm.DesignSizeFix, glyphs = glyphs.Length,
                missingSlots = tfm.LastSlot + 1 - glyphs.Length, parameters = parameters.Length, pairs = pairs.Length,
                largerGlyphs = tfm.LargerGlyphs.Length, extensions = tfm.Extensions.Length, recipes = tfm.Recipes.Length,
                exactIndependentMetrics = true, resourceSha256 = Hash(Encoding.UTF8.GetBytes(resource)), metricsSha256 = Hash(Encoding.UTF8.GetBytes(metrics)),
                atlasSha256 = Hash(Encoding.UTF8.GetBytes(atlas)), wrapperSha256 = Hash(Encoding.UTF8.GetBytes(source)), nativeInputs });
            Console.WriteLine($"{font.Id}: {glyphs.Length} glyphs, {parameters.Length} dimensions and {pairs.Length} pairs match native integer metrics");
        }
        var radicals = await MathRadicals(root, run, inputs, command == "generate-math");
        var evidence = new { schemaVersion = 1, profile = manifest.Id, manifestSha256 = Hash(File.ReadAllBytes(manifestPath)),
            wrapperSha256 = Hash(Encoding.UTF8.GetBytes(wrapper)), tools, inputs = manifest.Inputs, fonts = aggregate, radicals };
        var evidenceText = JsonSerializer.Serialize(evidence, Json) + "\n";
        File.WriteAllText(Path.Combine(run, "evidence.json"), evidenceText, new UTF8Encoding(false));
        var provenance = Path.Combine(root, "src/Lokad.TikZ/Resources/Fonts/math-provenance.json");
        if (command == "generate-math") File.WriteAllText(provenance, evidenceText, new UTF8Encoding(false));
        else if (File.ReadAllText(provenance) != evidenceText) throw new InvalidOperationException("Math font provenance changed.");
        Console.WriteLine("Native math font receipt: " + Path.GetRelativePath(root, Path.Combine(run, "evidence.json")));
        return 0;
    }
}

internal sealed record MathFontManifest(int SchemaVersion, string Id, string LatexVersion, string DvisvgmVersion,
    string DviTypeVersion, string KpseVersion, Dictionary<string, string> ToolHashes, FontInput[] Inputs, MathFontFace[] Fonts);
internal sealed record MathFontFace(string Id, int SizePt, int DesignSizePt, string Tfm, string Pfb, string Encoding,
    int ExpectedGlyphs, int ExpectedLastSlot, int ExpectedParameters);

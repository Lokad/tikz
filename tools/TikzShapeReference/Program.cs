using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;

return await ShapeReference.Run(args);

// Independent development oracle. Deliberately no reference to Lokad.TikZ or
// the existing oracle executable: admitted policies pin that executable's source.
internal static class ShapeReference
{
    private const string ManifestPath = "tests/Reference/NodeShapes/cases.json";
    private const string WrapperPath = "tools/TikzShapeReference/shapes.tex";
    private const string BaselinePath = "tests/Reference/NodeShapes/native";
    private const string ProfileId = "pgf-3.1.11a-circle-ellipse-nodes-sp-v1";
    private const string Units = "integer TeX sp; y-up; global anchors/borders/soft paths; local background and measured affine frame";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true, NewLine = "\n" };
    private static readonly string[] Quantities = ["width", "height", "depth", "linewidth", "quad", "xheight",
        "innerx", "innery", "outerx", "outery", "minimumwidth", "minimumheight"];
    private static readonly string[] Artifacts = ["metrics.json", "reference.svg", "plain-reference.svg", "oracle.log",
        "plain-oracle.log", "native-positions.log", "probes.tex"];
    private static string Root = "";
    private static OracleProfile Profile = null!;

    internal static async Task<int> Run(string[] args)
    {
        try
        {
            if (args.Length != 1 || args[0] is not ("generate" or "verify" or "check-cached"))
                throw new InvalidOperationException("Usage: TikzShapeReference <generate|verify|check-cached>; only the fixed trusted manifest is accepted.");
            Root = FindRoot();
            Profile = Read<OracleProfile>(At("tests/Reference/NodeShapes/oracle-profile.json"));
            if (Profile.SchemaVersion != 1 || Profile.Id != ProfileId || Profile.ProcessTimeoutSeconds is < 1 or > 60
                || Profile.MaxCapturedCharacters is < 1 or > 1000000)
                throw new InvalidOperationException("Incompatible shape oracle profile.");
            var manifest = Read<Manifest>(At(ManifestPath));
            ValidateManifest(manifest);
            if (args[0] == "check-cached")
            {
                var cached = Cached(manifest);
                Console.WriteLine($"Cached native shape evidence: {cached.Nodes.Length} nodes, {manifest.Anchors.Length} anchors and {manifest.Directions.Length} borders per node. No candidate or image conformance claim.");
                return 0;
            }
            var latex = await Identify("latex", Profile.LatexVersion);
            var svgTool = await Identify("dvisvgm", Profile.DvisvgmVersion);
            var dviType = await Identify("dvitype", Profile.DviTypeVersion);
            var kpse = await Identify("kpsewhich", Profile.KpseVersion);
            var fontProfile = Read<FontProfile>(At("tools/TikzFontData/font-profile.json"));
            var fonts = new List<Input>();
            foreach (var item in fontProfile.Inputs)
            {
                var location = (await Require(kpse.Executable, [item.Name], Root)).Trim();
                if (!File.Exists(location) || HashFile(location) != item.Sha256)
                    throw new InvalidOperationException("Changed or missing pinned font input: " + item.Name);
                fonts.Add(new("font/" + item.Name, item.Sha256));
            }
            var work = At("artifacts/node-shape-reference");
            ResetWork(work);
            var wrapper = Text(At(WrapperPath));
            var probes = Probes(manifest);
            string[] texArgs = ["-disable-write18", "-disable-installer", "-interaction=nonstopmode", "-halt-on-error", "-recorder", "case.tex"];
            foreach (var mode in new[] { "plain", "probed" })
            {
                var folder = Path.Combine(work, mode);
                Directory.CreateDirectory(folder);
                File.Copy(At(manifest.Source), Path.Combine(folder, "case.tikz"));
                File.WriteAllText(Path.Combine(folder, "case.tex"), (mode == "probed" ? "\\AtBeginDocument{\\lokadprobestrue}\n" : "") + wrapper);
                File.WriteAllText(Path.Combine(folder, "probes.tex"), probes);
                await Require(latex.Executable, texArgs, folder);
                await Require(svgTool.Executable, ["--no-fonts", "--exact-bbox", "--bbox=min", "--page=1", "--output=reference.svg", "case.dvi"], folder);
                ValidateDrawing(Path.Combine(folder, "reference.svg"), manifest);
            }
            var plain = Path.Combine(work, "plain");
            var probed = Path.Combine(work, "probed");
            var plainLog = Text(Path.Combine(plain, "case.log"));
            var log = Text(Path.Combine(probed, "case.log"));
            if (Box(plainLog) != Box(log) || CanonicalSvg(Path.Combine(plain, "reference.svg")) != CanonicalSvg(Path.Combine(probed, "reference.svg")))
                throw new InvalidOperationException("Shape probes changed the picture box or visible SVG.");
            var metrics = Measure(log, manifest);
            var trace = await Require(dviType.Executable, ["-disable-installer", "-out-mode=4", "case.dvi"], probed);
            ValidateTrace(trace, manifest);
            var generated = Path.Combine(work, "generated");
            Directory.CreateDirectory(generated);
            Write(Path.Combine(generated, "metrics.json"), metrics);
            File.Copy(Path.Combine(probed, "reference.svg"), Path.Combine(generated, "reference.svg"));
            File.Copy(Path.Combine(plain, "reference.svg"), Path.Combine(generated, "plain-reference.svg"));
            File.WriteAllText(Path.Combine(generated, "oracle.log"), Sanitize(log));
            File.WriteAllText(Path.Combine(generated, "plain-oracle.log"), Sanitize(plainLog));
            File.WriteAllText(Path.Combine(generated, "native-positions.log"), Sanitize(trace));
            File.WriteAllText(Path.Combine(generated, "probes.tex"), probes);
            var inputs = RecordedInputs(probed).Concat(fonts).Distinct().OrderBy(i => i.Path, StringComparer.Ordinal).ToArray();
            if (inputs.GroupBy(i => i.Path).Any(g => g.Select(i => i.Sha256).Distinct().Count() != 1))
                throw new InvalidOperationException("Recorded input names are ambiguous.");
            var provenance = new Provenance(1, ProfileId, SourceHashes(manifest), [latex.Public, svgTool.Public, dviType.Public, kpse.Public],
                inputs, new(HashFile(Path.Combine(plain, "reference.svg")) == HashFile(Path.Combine(probed, "reference.svg")), true, true),
                Artifacts.ToDictionary(file => file, file => HashFile(Path.Combine(generated, file))),
                ["latex: -disable-write18 -disable-installer -interaction=nonstopmode -halt-on-error -recorder case.tex (plain and probed)",
                 "dvisvgm: --no-fonts --exact-bbox --bbox=min --page=1 --output=reference.svg case.dvi (plain and probed)",
                 "dvitype: -disable-installer -out-mode=4 case.dvi (probed)"],
                "Independent native circle/ellipse shape measurements; converter not invoked; no approved raster policy or candidate conformance claim.");
            Write(Path.Combine(generated, "provenance.json"), provenance);
            if (args[0] == "generate")
            {
                Directory.CreateDirectory(At(BaselinePath));
                foreach (var file in Artifacts.Append("provenance.json"))
                    File.Copy(Path.Combine(generated, file), At(BaselinePath + "/" + file), true);
            }
            else
            {
                var cached = Cached(manifest);
                var original = Read<Provenance>(At(BaselinePath + "/provenance.json"));
                if (Serialize(cached) != Serialize(metrics) || Serialize(original.Tools) != Serialize(provenance.Tools)
                    || Serialize(original.Inputs) != Serialize(inputs)
                    || CanonicalSvg(At(BaselinePath + "/reference.svg")) != CanonicalSvg(Path.Combine(probed, "reference.svg"))
                    || CanonicalTrace(Text(At(BaselinePath + "/native-positions.log"))) != CanonicalTrace(Sanitize(trace)))
                    throw new InvalidOperationException("Fresh native shape evidence differs; cached artifacts were not overwritten.");
            }
            Console.WriteLine($"{args[0]}: {metrics.Nodes.Length} native node layouts, {metrics.Nodes.Sum(n => n.Anchors.Count)} anchors, {metrics.Nodes.Sum(n => n.Borders.Count)} border queries, {metrics.Nodes.Sum(n => n.Path.Length)} soft-path tokens, {metrics.Normalized.Count} normalized vectors. Converter not invoked.");
            return 0;
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            Console.Error.WriteLine("Shape oracle failure: " + Sanitize(error.Message));
            return 2;
        }
    }

    private static void ValidateManifest(Manifest manifest)
    {
        if (manifest.SchemaVersion != 1 || manifest.Profile != ProfileId || manifest.Source != "tests/Fixtures/Nodes/shapes.tikz"
            || manifest.Cases.Length != 28 || manifest.Anchors.Length != 16 || manifest.Directions.Length != 16
            || manifest.Cases.Any(c => !Id(c.Id) || c.Shape is not ("circle" or "ellipse"))
            || manifest.Cases.Select(c => c.Id).Distinct().Count() != manifest.Cases.Length
            || manifest.Anchors.Distinct().Count() != manifest.Anchors.Length
            || manifest.Anchors.Any(a => !Regex.IsMatch(a, "^[a-z]+(?: [a-z]+)?$"))
            || manifest.Directions.Select(d => d.Id).Distinct().Count() != manifest.Directions.Length
            || manifest.Directions.Any(d => !Id(d.Id) || Math.Abs((long)d.XSp) > 1073741823 || Math.Abs((long)d.YSp) > 1073741823))
            throw new InvalidOperationException("Invalid trusted shape manifest.");
        var nodeIds = Regex.Matches(Text(At(manifest.Source)), @"\\node\[[^\]]*\]\s*\(([^)]+)\)").Select(m => m.Groups[1].Value);
        if (!nodeIds.SequenceEqual(manifest.Cases.Select(c => c.Id)))
            throw new InvalidOperationException("Trusted source node order differs from the manifest.");
        static bool Id(string id) => Regex.IsMatch(id, "^[a-z][a-z0-9-]*$");
    }

    private static string Probes(Manifest manifest)
    {
        var lines = new List<string>();
        foreach (var node in manifest.Cases)
        {
            foreach (var anchor in manifest.Anchors) lines.Add($"\\lokadanchor{{{node.Id}}}{{{anchor}}}");
            foreach (var direction in manifest.Directions)
                lines.Add(FormattableString.Invariant($"\\lokadborder{{{node.Id}}}{{{direction.Id}}}{{{direction.XSp}}}{{{direction.YSp}}}"));
        }
        foreach (var direction in manifest.Directions)
            lines.Add(FormattableString.Invariant($"\\lokadnormal{{{direction.Id}}}{{{direction.XSp}}}{{{direction.YSp}}}"));
        return string.Join('\n', lines) + "\n";
    }

    private static Measurements Measure(string log, Manifest manifest)
    {
        if (!log.Contains("LOKAD-PGF-VERSION " + Profile.PgfVersion, StringComparison.Ordinal))
            throw new InvalidOperationException("Unexpected native PGF version.");
        var flat = log.Replace("\n", "", StringComparison.Ordinal);
        var shapes = Matches(@"LOKAD-SHAPE ([a-z0-9-]+)\|(circle|ellipse)\|END");
        if (!shapes.Select(m => (m.Groups[1].Value, m.Groups[2].Value)).SequenceEqual(manifest.Cases.Select(c => (c.Id, c.Shape))))
            throw new InvalidOperationException("Native shape coverage differs from the manifest.");
        var nodes = new List<Node>();
        foreach (var node in manifest.Cases)
        {
            Match[] NodeMatches(string pattern) => Matches(pattern).Where(m => m.Groups[1].Value == node.Id).ToArray();
            var values = NodeMatches(@"LOKAD-VALUE ([a-z0-9-]+)\|([a-z]+)\|(-?\d+)\|END")
                .ToDictionary(m => m.Groups[2].Value, m => Integer(m.Groups[3].Value));
            Dictionary<string, Point> Points(string kind) => NodeMatches($@"LOKAD-{kind} ([a-z0-9-]+)\|([a-z -]+)\|(-?\d+)\|(-?\d+)\|END")
                .ToDictionary(m => m.Groups[2].Value, m => new Point(Integer(m.Groups[3].Value), Integer(m.Groups[4].Value)));
            var anchors = Points("ANCHOR"); var borders = Points("BORDER"); var background = Points("POINT");
            var path = NodeMatches(@"LOKAD-SEG ([a-z0-9-]+)\|([a-z0-9]+)\|(-?\d+)\|(-?\d+)\|END")
                .Select(m => new Segment(m.Groups[2].Value, new(Integer(m.Groups[3].Value), Integer(m.Groups[4].Value)))).ToArray();
            var frame = NodeMatches(@"LOKAD-FRAME ([a-z0-9-]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|END").Single();
            var affine = new Frame(Number(2), Number(3), Number(4), Number(5), TexDimension(6), TexDimension(7));
            if (!values.Keys.Order().SequenceEqual(Quantities.Order()) || !anchors.Keys.SequenceEqual(manifest.Anchors)
                || !borders.Keys.SequenceEqual(manifest.Directions.Select(d => d.Id))
                || !background.Keys.SequenceEqual(new[] { "center", "xaxis", "yaxis" })
                || !path.Select(s => s.Kind).SequenceEqual(new[] { "move", "control1", "control2", "curve", "control1", "control2", "curve",
                    "control1", "control2", "curve", "control1", "control2", "curve", "close", "move" }))
                throw new InvalidOperationException("Incomplete shape measurements: " + node.Id);
            nodes.Add(new(node.Id, node.Shape, values, anchors, borders, background, affine, path));
            double Number(int index) => double.Parse(frame.Groups[index].Value, CultureInfo.InvariantCulture);
            int TexDimension(int index)
            {
                var value = frame.Groups[index].Value;
                if (!value.EndsWith("pt", StringComparison.Ordinal)) throw new InvalidOperationException("Unexpected native affine translation unit.");
                return checked((int)Math.Round(double.Parse(value[..^2], CultureInfo.InvariantCulture) * 65536, MidpointRounding.AwayFromZero));
            }
        }
        var normalized = Matches(@"LOKAD-NORMAL ([a-z0-9-]+)\|(-?\d+)\|(-?\d+)\|END")
            .ToDictionary(m => m.Groups[1].Value, m => new Point(Integer(m.Groups[2].Value), Integer(m.Groups[3].Value)));
        if (!normalized.Keys.SequenceEqual(manifest.Directions.Select(d => d.Id)))
            throw new InvalidOperationException("Incomplete native normalization coverage.");
        var bounds = Matches(@"LOKAD-BOUNDS (-?\d+)\|(-?\d+)\|(-?\d+)\|(-?\d+)\|END").Single();
        var pictureBounds = new PictureBounds(Integer(bounds.Groups[1].Value), Integer(bounds.Groups[2].Value),
            Integer(bounds.Groups[3].Value), Integer(bounds.Groups[4].Value));
        return new(1, ProfileId, Units, Box(log), pictureBounds, nodes.ToArray(), normalized);
        Match[] Matches(string pattern) => Regex.Matches(flat, pattern).ToArray();
    }

    private static PictureBox Box(string log)
    {
        var m = Regex.Matches(log.Replace("\n", "", StringComparison.Ordinal), @"LOKAD-BOX (-?\d+)\|(-?\d+)\|(-?\d+)\|END").Single();
        return new(Integer(m.Groups[1].Value), Integer(m.Groups[2].Value), Integer(m.Groups[3].Value));
    }
    private static void ValidateTrace(string trace, Manifest manifest)
    {
        if (!Regex.IsMatch(trace, @"totalpages=1(?:\s|$)") || Regex.Matches(trace, @"(?m)^\d+: beginning of page ").Count != 1)
            throw new InvalidOperationException("The trusted shape fixture must occupy exactly one native page.");
        var ids = Regex.Matches(trace, @"lokad-node-origin ([a-z0-9-]+)").Select(m => m.Groups[1].Value);
        if (!ids.SequenceEqual(manifest.Cases.Select(c => c.Id)))
            throw new InvalidOperationException("Native label-origin trace coverage differs from the manifest.");
        var allowed = Read<FontProfile>(At("tools/TikzFontData/font-profile.json")).Fonts.Select(f => Path.GetFileNameWithoutExtension(f.Tfm)).ToArray();
        var fontNames = Regex.Matches(trace, @"Font \d+: ([a-z0-9-]+?)(?: scaled \d+)?---loaded at size \d+ DVI units")
            .Select(m => m.Groups[1].Value).ToArray();
        if (fontNames.Length == 0 || fontNames.Any(font => !allowed.Contains(font)))
            throw new InvalidOperationException("Shape labels used a font outside the declared six-face profile.");
    }
    private static string CanonicalTrace(string trace)
    {
        const string pattern = @"(?m)^' TeX output \d{4}\.\d{2}\.\d{2}:\d{4}' ?$";
        if (Regex.Matches(trace, pattern).Count != 1)
            throw new InvalidOperationException("Unexpected native DVI timestamp header.");
        return Regex.Replace(trace, pattern, "' TeX output <timestamp>'");
    }
    private static Measurements Cached(Manifest manifest)
    {
        var provenance = Read<Provenance>(At(BaselinePath + "/provenance.json"));
        if (provenance.SchemaVersion != 1 || provenance.Profile != ProfileId
            || Serialize(provenance.SourceHashes) != Serialize(SourceHashes(manifest))
            || !provenance.ProbeVerification.PictureBoxIdentical || !provenance.ProbeVerification.SvgIdenticalAfterDefinitionOrderOnly
            || !provenance.Artifacts.Keys.SequenceEqual(Artifacts))
            throw new InvalidOperationException("Incompatible cached shape provenance.");
        var expectedVersions = new[] { Profile.LatexVersion, Profile.DvisvgmVersion, Profile.DviTypeVersion, Profile.KpseVersion };
        if (!provenance.Tools.Select(t => t.Name).SequenceEqual(new[] { "latex", "dvisvgm", "dvitype", "kpsewhich" })
            || provenance.Tools.Where((t, i) => !t.Version.Contains(expectedVersions[i], StringComparison.Ordinal) || !IsHash(t.Sha256)).Any())
            throw new InvalidOperationException("Incomplete cached oracle tool identities.");
        var fontProfile = Read<FontProfile>(At("tools/TikzFontData/font-profile.json"));
        if (provenance.Inputs.Length == 0 || provenance.Inputs.Any(i => !IsHash(i.Sha256))
            || provenance.Inputs.Select(i => i.Path).Distinct().Count() != provenance.Inputs.Length
            || fontProfile.Inputs.Any(f => !provenance.Inputs.Contains(new("font/" + f.Name, f.Sha256)))
            || new[] { "pgfmoduleshapes.code.tex", "pgflibraryshapes.geometric.code.tex", "pgfcorepoints.code.tex", "pgfmathfunctions.trigonometric.code.tex" }
                .Any(name => !provenance.Inputs.Any(i => i.Path == "tex/" + name)))
            throw new InvalidOperationException("Incomplete cached oracle input identities.");
        foreach (var artifact in provenance.Artifacts)
            if (HashFile(At(BaselinePath + "/" + artifact.Key)) != artifact.Value)
                throw new InvalidOperationException("Changed cached shape artifact: " + artifact.Key);
        if (provenance.ProbeVerification.SvgByteIdentical != (provenance.Artifacts["reference.svg"] == provenance.Artifacts["plain-reference.svg"]))
            throw new InvalidOperationException("Incorrect byte-invariance claim.");
        var log = Text(At(BaselinePath + "/oracle.log"));
        var cached = Read<Measurements>(At(BaselinePath + "/metrics.json"));
        if (Serialize(cached) != Serialize(Measure(log, manifest))
            || Box(Text(At(BaselinePath + "/plain-oracle.log"))) != cached.PictureBox
            || CanonicalSvg(At(BaselinePath + "/plain-reference.svg")) != CanonicalSvg(At(BaselinePath + "/reference.svg"))
            || Text(At(BaselinePath + "/probes.tex")) != Probes(manifest))
            throw new InvalidOperationException("Cached shape measurements disagree with independent retained evidence.");
        ValidateTrace(Text(At(BaselinePath + "/native-positions.log")), manifest);
        ValidateDrawing(At(BaselinePath + "/reference.svg"), manifest);
        return cached;
        static bool IsHash(string value) => Regex.IsMatch(value, "^[0-9a-f]{64}$");
    }
    private static Dictionary<string, string> SourceHashes(Manifest manifest) => new[] {
        ManifestPath, manifest.Source, WrapperPath, "tools/TikzShapeReference/Program.cs", "tools/TikzShapeReference/TikzShapeReference.csproj",
        "tests/Reference/NodeShapes/oracle-profile.json", "tools/TikzFontData/font-profile.json"
    }.ToDictionary(path => path, path => HashFile(At(path)));
    private static string CanonicalSvg(string file)
    {
        var svg = XDocument.Load(file);
        foreach (var definitions in svg.Descendants().Where(e => e.Name.LocalName == "defs"))
        {
            var elements = definitions.Elements().ToArray();
            if (elements.Any(e => string.IsNullOrEmpty(e.Attribute("id")?.Value))
                || elements.Select(e => e.Attribute("id")!.Value).Distinct().Count() != elements.Length)
                throw new InvalidOperationException("Ambiguous SVG definitions.");
            definitions.ReplaceNodes(elements.OrderBy(e => e.Attribute("id")!.Value, StringComparer.Ordinal));
        }
        return svg.ToString(SaveOptions.DisableFormatting);
    }
    private static void ValidateDrawing(string file, Manifest manifest)
    {
        var document = XDocument.Load(file);
        var paths = document.Descendants().Where(e => e.Name.LocalName == "path" && !e.Ancestors().Any(a => a.Name.LocalName == "defs"));
        if (paths.Count() != manifest.Cases.Length)
            throw new InvalidOperationException("Reference page does not contain every native node background.");
    }

    private static IEnumerable<Input> RecordedInputs(string folder)
    {
        foreach (var entry in Text(Path.Combine(folder, "case.fls")).Split('\n').Where(l => l.StartsWith("INPUT ", StringComparison.Ordinal)))
        {
            var file = Path.GetFullPath(entry[6..].Trim(), folder);
            if (File.Exists(file)) yield return new((file.StartsWith(folder + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
                ? "generated/" : "tex/") + Path.GetFileName(file), HashFile(file));
        }
    }
    private static async Task<Tool> Identify(string name, string expected)
    {
        var executable = Environment.GetEnvironmentVariable("PATH")!.Split(Path.PathSeparator)
            .Select(p => Path.Combine(p.Trim('"'), name + (OperatingSystem.IsWindows() ? ".exe" : ""))).FirstOrDefault(File.Exists)
            ?? throw new InvalidOperationException("Missing required oracle executable: " + name);
        var output = await Require(executable, ["--version"], Root);
        if (!output.Contains(expected, StringComparison.Ordinal)) throw new InvalidOperationException("Incompatible oracle executable: " + name);
        var version = output.Split('\n')[0].Trim();
        if (!version.Contains(expected, StringComparison.Ordinal)) version += "; " + expected;
        return new(executable, new(name, version, HashFile(executable)));
    }
    private static async Task<string> Require(string executable, string[] arguments, string folder)
    {
        using var process = new Process { StartInfo = new(executable) { WorkingDirectory = folder, UseShellExecute = false,
            CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true } };
        foreach (var argument in arguments) process.StartInfo.ArgumentList.Add(argument);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(Profile.ProcessTimeoutSeconds));
        process.Start();
        var captured = 0;
        async Task<string> Capture(StreamReader reader)
        {
            var result = new StringBuilder(); var buffer = new char[4096];
            while (true)
            {
                var count = await reader.ReadAsync(buffer.AsMemory(), timeout.Token);
                if (count == 0) return result.ToString();
                if (Interlocked.Add(ref captured, count) > Profile.MaxCapturedCharacters)
                {
                    process.Kill(true);
                    throw new InvalidOperationException("Oracle process exceeded its captured-output limit.");
                }
                result.Append(buffer, 0, count);
            }
        }
        var stdout = Capture(process.StandardOutput); var stderr = Capture(process.StandardError);
        try
        {
            await process.WaitForExitAsync(timeout.Token);
            var outputs = await Task.WhenAll(stdout, stderr);
            var output = string.Join('\n', outputs).Replace("\r\n", "\n", StringComparison.Ordinal);
            if (process.ExitCode != 0) throw new InvalidOperationException(Path.GetFileName(executable) + " failed: " + output);
            return output;
        }
        catch
        {
            if (!process.HasExited) process.Kill(true);
            try { await Task.WhenAll(stdout, stderr); } catch { /* Drain the bounded capture tasks before disposing. */ }
            throw;
        }
    }

    private static string FindRoot()
    {
        for (var folder = new DirectoryInfo(Environment.CurrentDirectory); folder is not null; folder = folder.Parent)
            if (File.Exists(Path.Combine(folder.FullName, "Lokad.TikZ.slnx"))) return folder.FullName;
        throw new InvalidOperationException("Run inside the repository.");
    }
    private static string At(string relative)
    {
        var full = Path.GetFullPath(relative, Root);
        if (!full.StartsWith(Root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Oracle path escapes the repository.");
        return full;
    }
    private static void ResetWork(string folder)
    {
        if (!Path.GetFullPath(folder).StartsWith(At("artifacts") + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Working directory must be contained in artifacts/.");
        if (Directory.Exists(folder)) Directory.Delete(folder, true);
        Directory.CreateDirectory(folder);
    }
    private static string Sanitize(string text)
    {
        foreach (var root in new[] { Root, Environment.GetFolderPath(Environment.SpecialFolder.UserProfile) }.Where(s => s.Length > 0).OrderByDescending(s => s.Length))
            foreach (var spelling in new[] { root, root.Replace('\\', '/') }.Distinct())
                text = Regex.Replace(text, string.Join(@"(?:\r?\n)?", spelling.Select(c => Regex.Escape(c.ToString()))), "<local>", RegexOptions.IgnoreCase);
        return text;
    }
    private static int Integer(string value) => int.Parse(value, CultureInfo.InvariantCulture);
    private static string Text(string file) => File.ReadAllText(file).Replace("\r\n", "\n", StringComparison.Ordinal);
    private static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Json);
    private static T Read<T>(string file) => JsonSerializer.Deserialize<T>(Text(file), Json) ?? throw new InvalidOperationException("Empty artifact.");
    private static void Write<T>(string file, T value) => File.WriteAllText(file, Serialize(value) + "\n");
    private static string HashFile(string file) => Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(file)));

    private sealed record OracleProfile(int SchemaVersion, string Id, string LatexVersion, string DvisvgmVersion,
        string DviTypeVersion, string KpseVersion, string PgfVersion, int ProcessTimeoutSeconds, int MaxCapturedCharacters);
    private sealed record Manifest(int SchemaVersion, string Profile, string Source, Case[] Cases, string[] Anchors, Direction[] Directions);
    private sealed record Case(string Id, string Shape);
    private sealed record Direction(string Id, int XSp, int YSp);
    private sealed record Point(int XSp, int YSp);
    private sealed record Frame(double A, double B, double C, double D, int ESp, int FSp);
    private sealed record Segment(string Kind, Point Point);
    private sealed record PictureBox(int WidthSp, int HeightSp, int DepthSp);
    private sealed record PictureBounds(int MinXSp, int MinYSp, int MaxXSp, int MaxYSp);
    private sealed record Node(string Id, string Shape, Dictionary<string, int> Values, Dictionary<string, Point> Anchors,
        Dictionary<string, Point> Borders, Dictionary<string, Point> Background, Frame Frame, Segment[] Path);
    private sealed record Measurements(int SchemaVersion, string Profile, string Units, PictureBox PictureBox, PictureBounds PictureBounds,
        Node[] Nodes, Dictionary<string, Point> Normalized);
    private sealed record ToolIdentity(string Name, string Version, string Sha256);
    private sealed record Tool(string Executable, ToolIdentity Public);
    private sealed record Input(string Path, string Sha256);
    private sealed record FontProfile(InputName[] Inputs, FontName[] Fonts);
    private sealed record FontName(string Tfm);
    private sealed record InputName(string Name, string Sha256);
    private sealed record ProbeVerification(bool SvgByteIdentical, bool SvgIdenticalAfterDefinitionOrderOnly, bool PictureBoxIdentical);
    private sealed record Provenance(int SchemaVersion, string Profile, Dictionary<string, string> SourceHashes, ToolIdentity[] Tools,
        Input[] Inputs, ProbeVerification ProbeVerification, Dictionary<string, string> Artifacts, string[] Commands, string Scope);
}

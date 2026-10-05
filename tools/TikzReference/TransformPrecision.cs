using System.Globalization;
using System.Text.RegularExpressions;
using System.Text.Json;

internal static partial class ReferenceTool
{
    private static async Task<int> TransformPrecision(string[] args)
    {
        if (args.Length != 1) throw new InvalidOperationException("Transform precision commands accept no arguments; only the trusted manifest is compiled.");
        var manifest = Read<TransformManifest>(At("tests/Reference/Transforms/cases.json"));
        if (manifest.SchemaVersion != 1 || manifest.Profile != "pgf-3.1.11a-affine-sp-v1" || manifest.Point != "7.12345pt,-3.54321pt"
            || manifest.Transforms.Length != 16 || manifest.Dimensions.Length != 10
            || manifest.Transforms.Select(c => c.Id).Concat(manifest.Dimensions.Select(c => c.Id)).Distinct().Count() != 26)
            throw new InvalidOperationException("Invalid transform precision manifest.");
        var work = ArtifactDirectory("artifacts/transform-precision");
        ResetDirectory(work);
        var wrapper = Text(At("tools/TikzReference/transform-precision.tex"));
        var calls = manifest.Transforms.Select(c => $"\\transformprobe{{{c.Id}}}{{{c.Options}}}")
            .Concat(manifest.Dimensions.Select(c => $"\\dimensionprobe{{{c.Id}}}{{{c.Value}}}"));
        var source = wrapper.Replace("% TRUSTED-PROBES", string.Join('\n', calls), StringComparison.Ordinal);
        File.WriteAllText(Path.Combine(work, "case.tex"), source);
        var latex = await Identify("latex", ["--version"], Profile.LatexVersion);
        await Require(latex.Executable, ["-disable-write18", "-disable-installer", "-interaction=nonstopmode", "-halt-on-error", "-recorder", "case.tex"], work);
        var log = Text(Path.Combine(work, "case.log"));
        if (!log.Contains("LOKAD-PGF-VERSION " + Profile.PgfVersion, StringComparison.Ordinal))
            throw new InvalidOperationException("Unexpected PGF transform version.");
        var joined = log.Replace("\n", "", StringComparison.Ordinal);
        var frames = Regex.Matches(joined, @"LOKAD-AFFINE ([a-z0-9-]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|(-?\d+)\|(-?\d+)\|END")
            .ToDictionary(m => m.Groups[1].Value, m => new NativeFrame(Parse(m.Groups[2].Value), Parse(m.Groups[3].Value),
                Parse(m.Groups[4].Value), Parse(m.Groups[5].Value), Integer(m.Groups[6].Value), Integer(m.Groups[7].Value)));
        var points = Regex.Matches(joined, @"LOKAD-POINT ([a-z0-9-]+)\|(-?\d+)\|(-?\d+)\|END")
            .ToDictionary(m => m.Groups[1].Value, m => new TransformPoint(Integer(m.Groups[2].Value), Integer(m.Groups[3].Value)));
        var dimensions = Regex.Matches(joined, @"LOKAD-DIMENSION ([a-z0-9-]+)\|(-?\d+)\|END")
            .ToDictionary(m => m.Groups[1].Value, m => Integer(m.Groups[2].Value));
        if (!frames.Keys.SequenceEqual(manifest.Transforms.Select(c => c.Id)) || !points.Keys.SequenceEqual(frames.Keys)
            || !dimensions.Keys.SequenceEqual(manifest.Dimensions.Select(c => c.Id))) throw new InvalidOperationException("Missing or reordered native transform measurements.");
        var measurements = new TransformMeasurements(1, manifest.Profile, frames, points, dimensions);
        Write(Path.Combine(work, "measurements.json"), measurements);
        File.WriteAllText(Path.Combine(work, "oracle.log"), Sanitize(log));
        var inputs = RecordedInputs(work).DistinctBy(i => i.Path).OrderBy(i => i.Path, StringComparer.Ordinal).ToArray();
        var provenance = new TransformProvenance(1, manifest.Profile, HashFile(At("tests/Reference/Transforms/cases.json")),
            HashText(wrapper), HashText(source), HashFile(At("tests/Reference/oracle-profile.json")), latex.Public, inputs,
            HashFile(Path.Combine(work, "measurements.json")), "Trusted TikZ/TeX numeric experiment; converter not invoked; no raster conformance claim");
        Write(Path.Combine(work, "provenance.json"), provenance);
        if (args[0] == "generate-transform-precision")
        {
            foreach (var file in new[] { "measurements.json", "oracle.log", "provenance.json" })
                File.Copy(Path.Combine(work, file), At("tests/Reference/Transforms/" + file), true);
        }
        else
        {
            var cached = Read<TransformMeasurements>(At("tests/Reference/Transforms/measurements.json"));
            var original = Read<TransformProvenance>(At("tests/Reference/Transforms/provenance.json"));
            if (JsonSerializer.Serialize(cached, Json) != JsonSerializer.Serialize(measurements, Json)
                || JsonSerializer.Serialize(original, Json) != JsonSerializer.Serialize(provenance, Json))
                throw new InvalidOperationException("Fresh transform measurements or provenance differ; no baseline overwritten.");
        }
        Console.WriteLine($"{args[0]}: {frames.Count} affine frames/native points and {dimensions.Count} physical dimensions; converter not invoked.");
        return 0;
        static int Integer(string value) => int.Parse(value, CultureInfo.InvariantCulture);
    }

    private sealed record TransformCase(string Id, string Options);
    private sealed record TransformDimension(string Id, string Value);
    private sealed record TransformManifest(int SchemaVersion, string Profile, string Point, TransformCase[] Transforms, TransformDimension[] Dimensions);
    private sealed record TransformMeasurements(int SchemaVersion, string Profile, Dictionary<string, NativeFrame> Frames,
        Dictionary<string, TransformPoint> Points, Dictionary<string, int> Dimensions);
    private sealed record TransformPoint(int XSp, int YSp);
    private sealed record TransformProvenance(int SchemaVersion, string Profile, string ManifestSha256, string WrapperSha256,
        string SourceSha256, string ProfileSha256, ToolIdentity Engine, InputIdentity[] Inputs, string MeasurementsSha256, string Scope);
}

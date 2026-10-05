using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

internal static partial class ReferenceTool
{
    private static async Task<int> RectangleBorders(string[] args)
    {
        if (args.Length != 1) throw new InvalidOperationException("Rectangle border commands accept no arguments; only trusted manifest entries are compiled.");
        const string manifestPath = "tests/Reference/NodeBorders/cases.json";
        var manifest = Read<RectangleBorderManifest>(At(manifestPath));
        if (manifest.SchemaVersion != 1 || manifest.Profile != "pgf-3.1.11a-rectangle-border-sp-v1" || manifest.Cases.Length < 20
            || manifest.Cases.Select(c => c.Id).Distinct().Count() != manifest.Cases.Length
            || manifest.Cases.Any(c => !Regex.IsMatch(c.Id, "^[a-z][a-z0-9-]*$")
                || new[] { c.XSp, c.YSp, c.HalfWidthSp, c.HalfHeightSp }.Any(d => Math.Abs((long)d) > 1073741823)))
            throw new InvalidOperationException("Invalid trusted rectangle border manifest.");
        var work = ArtifactDirectory("artifacts/rectangle-border-reference");
        ResetDirectory(work);
        var wrapper = Text(At("tools/TikzReference/rectangle-borders.tex"));
        var calls = manifest.Cases.Select(c => $"\\rectangleprobe{{{c.Id}}}{{{c.XSp}}}{{{c.YSp}}}{{{c.HalfWidthSp}}}{{{c.HalfHeightSp}}}");
        var source = wrapper.Replace("% TRUSTED-PROBES", string.Join('\n', calls), StringComparison.Ordinal);
        File.WriteAllText(Path.Combine(work, "case.tex"), source);
        var latex = await Identify("latex", ["--version"], Profile.LatexVersion);
        await Require(latex.Executable, ["-disable-write18", "-disable-installer", "-interaction=nonstopmode", "-halt-on-error", "-recorder", "case.tex"], work);
        var log = Text(Path.Combine(work, "case.log"));
        if (!log.Contains("LOKAD-PGF-VERSION " + Profile.PgfVersion, StringComparison.Ordinal)) throw new InvalidOperationException("Unexpected PGF border version.");
        var points = Regex.Matches(log.Replace("\n", "", StringComparison.Ordinal), @"LOKAD-RECTANGLE-BORDER ([a-z0-9-]+)\|(-?\d+)\|(-?\d+)\|END")
            .ToDictionary(m => m.Groups[1].Value, m => new BorderPoint(int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture), int.Parse(m.Groups[3].Value, CultureInfo.InvariantCulture)));
        if (!points.Keys.SequenceEqual(manifest.Cases.Select(c => c.Id))) throw new InvalidOperationException("Missing or reordered native border measurements.");
        var measurements = new RectangleBorderMeasurements(1, manifest.Profile, points);
        Write(Path.Combine(work, "measurements.json"), measurements);
        File.WriteAllText(Path.Combine(work, "oracle.log"), Sanitize(log));
        var inputs = RecordedInputs(work).DistinctBy(i => i.Path).OrderBy(i => i.Path, StringComparer.Ordinal).ToArray();
        var provenance = new RectangleBorderProvenance(1, manifest.Profile, HashFile(At(manifestPath)), HashText(wrapper), HashText(source),
            HashFile(At("tests/Reference/oracle-profile.json")), latex.Public, inputs, HashFile(Path.Combine(work, "measurements.json")),
            "Independent PGF rectangle ray/border numeric probe; converter not invoked; no image or path-endpoint conformance claim");
        Write(Path.Combine(work, "provenance.json"), provenance);
        var baseline = At("tests/Reference/NodeBorders");
        foreach (var file in new[] { "measurements.json", "oracle.log", "provenance.json" })
        {
            if (args[0] == "generate-rectangle-borders") File.Copy(Path.Combine(work, file), Path.Combine(baseline, file), true);
            else if (file != "oracle.log" && Text(Path.Combine(work, file)) != Text(Path.Combine(baseline, file)))
                throw new InvalidOperationException("Fresh native border evidence differs; no baseline overwritten.");
        }
        Console.WriteLine($"{args[0]}: {points.Count} independent integer-sp rectangle intersections; converter not invoked.");
        return 0;
    }

    private sealed record RectangleBorderCase(string Id, int XSp, int YSp, int HalfWidthSp, int HalfHeightSp);
    private sealed record RectangleBorderManifest(int SchemaVersion, string Profile, RectangleBorderCase[] Cases);
    private sealed record BorderPoint(int XSp, int YSp);
    private sealed record RectangleBorderMeasurements(int SchemaVersion, string Profile, Dictionary<string, BorderPoint> Points);
    private sealed record RectangleBorderProvenance(int SchemaVersion, string Profile, string ManifestSha256, string WrapperSha256,
        string SourceSha256, string ProfileSha256, ToolIdentity Engine, InputIdentity[] Inputs, string MeasurementsSha256, string Scope);
}

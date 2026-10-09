using System.Text.Json;
using TikzShapeComparison;

internal static partial class Program
{
    // Same bounded artifacts and CLI as shape calibration, distinct native math
    // semantics. This route consumes frozen inputs only and never launches TeX.
    private static void DeriveMathEvents(string output, List<string> artifacts, Action<string, string> copy, Action<string, object> write)
    {
        const string baseline = "tests/Reference/MathLabels";
        var records = new List<object>();
        foreach (var id in new[] { "network-math-labels", "math-label-contract", "math-atom-contract" })
        {
            var diagram = id == "network-math-labels";
            var fixture = "tests/Fixtures/" + (diagram ? "Diagrams/" : "MathLabels/") + id + ".tikz";
            var measuredFile = baseline + "/" + (diagram ? "Diagrams/" : "") + id + ".json";
            using var measured = Read(measuredFile);
            Require(measured.RootElement.GetProperty("sourceSha256").GetString() == Hash(At(fixture)), "Changed trusted math fixture: " + id);
            var nativeDirectory = baseline + "/native-layout/" + id + "/";
            using var observations = Read(nativeDirectory + "font-observations.json");
            var faces = NativeMathFaces.Read(File.ReadAllText(At("tools/TikzFontData/math-font-profile.json")), File.ReadAllText(At("tools/TikzFontData/font-profile.json")),
                observations.RootElement, (font, math) => File.ReadAllText(At("tests/Reference/" + (math ? "MathFonts/" : "Fonts/") + font + ".json")),
                tfm => File.ReadAllBytes(At(baseline + "/fonts/" + tfm)));
            var ids = measured.RootElement.GetProperty("nodes").EnumerateArray().Select(n => n.GetProperty("name").GetString()!).ToArray();
            var nodes = NativeMathLabelTrace.Read(File.ReadAllText(At(nativeDirectory + "native-positions.log")), faces, ids);
            var bound = NativeMathSvg.Read(File.ReadAllText(At(nativeDirectory + "oracle.svg")), nodes);
            Require(nodes.Sum(n => n.Glyphs.Length) == observations.RootElement.GetProperty("glyphs").GetInt32()
                && nodes.Sum(n => n.Rules.Length) == observations.RootElement.GetProperty("rules").GetInt32(), "Changed native math event coverage.");
            copy(fixture, id + "/source.tikz"); copy(measuredFile, id + "/measurements.json");
            foreach (var file in new[] { "font-observations.json", "native-positions.log", "oracle.svg" }) copy(nativeDirectory + file, id + "/" + file);
            write(id + "/events.json", new { nodes, marks = bound.Marks, checks = bound.Checks, svgFaces = bound.SvgFaces });
            foreach (var face in faces)
            {
                var math = face.Id.StartsWith("math-", StringComparison.Ordinal);
                var directory = "tests/Reference/" + (math ? "MathFonts/" : "Fonts/");
                foreach (var suffix in new[] { ".json", ".svg" }) copy(directory + face.Id + suffix, id + "/fonts/" + face.Id + suffix);
            }
            records.Add(new { id, nodes = nodes.Length, glyphs = nodes.Sum(n => n.Glyphs.Length), rules = nodes.Sum(n => n.Rules.Length), driverChecks = bound.Checks.Length });
        }
        foreach (var file in Directory.EnumerateFiles(At(baseline + "/fonts"), "*.tfm")) copy(Path.GetRelativePath(root, file), "fonts/" + Path.GetFileName(file));
        copy("tools/TikzFontData/math-font-profile.json", "math-font-profile.json"); copy("tools/TikzFontData/font-profile.json", "font-profile.json");
        var sourceFiles = new[] { "tools/TikzShapeCalibration/Program.cs", "tools/TikzShapeCalibration/MathEvents.cs", "tools/TikzShapeCalibration/TikzShapeCalibration.csproj",
            "tools/TikzShapeCalibration/packages.lock.json", "tools/TikzShapeComparison/NativeGlyphTrace.cs", "tools/TikzShapeComparison/NativeMathLabelTrace.cs",
            "tools/TikzShapeComparison/NativeMathFaces.cs", "tools/TikzShapeComparison/NativeMathSvg.cs", "Directory.Build.props", "global.json" };
        write("derivation.json", new { schemaVersion = 1, comparisonKind = "oracle-only-math-events", completed = true, converterInvoked = false,
            nativeToolInvoked = false, conformanceClaim = false, approvedImagePolicy = false, imageConformanceClaim = false, imageAdmission = "pending",
            outputDirectory = Path.GetRelativePath(root, output).Replace('\\', '/'), cases = records,
            evidence = new { artifacts = artifacts.ToDictionary(f => f, f => Hash(Path.Combine(output, f))),
                toolHashes = sourceFiles.ToDictionary(f => f, f => Hash(At(f))), assemblySha256 = Hash(typeof(Program).Assembly.Location),
                frameworkReferences = typeof(Program).Assembly.GetReferencedAssemblies().Select(a => a.Name).Order().ToArray() } });
        Console.WriteLine("Independent math SVG binding: 64 labels, 459 glyphs, 37 rules; frozen inputs only; image policy remains pending.");
    }
}

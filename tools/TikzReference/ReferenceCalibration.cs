using System.Globalization;
using System.Text;
using System.Xml.Linq;

internal static partial class ReferenceTool
{
    // This route never calls the converter. Re-express the oracle's own measured
    // soft paths in CSS pixels with flattened transforms and six decimal places.
    // Keep paint, clipping, and physical registration; precision variants make
    // the explicitly recorded bounded coordinate/frame perturbations below.
    private static async Task<int> Calibrate(ReferenceCase c, string output)
    {
        var exitCode = 0;
        var results = new List<object>();
        foreach (var (mode, delta) in new[] { ("flattened", 0.0), ("precision-plus", 4.0 / 65536), ("precision-minus", -4.0 / 65536) })
        {
            var folder = Path.Combine(output, mode);
            Directory.CreateDirectory(folder);
            foreach (var file in new[] { "reference.svg", "reference-metrics.json", "reference.pdf", "provenance.json", "oracle.log", "source.tikz", "pdf-page-1x.png", "pdf-page-4x.png" })
                File.Copy(Path.Combine(output, file), Path.Combine(folder, file));
            var result = await CalibrateMode(c, folder, delta);
            exitCode = Math.Max(exitCode, result);
            results.Add(new { mode, perturbationPt = delta, exitCode = result, report = mode + "/report.json" });
        }
        Write(Path.Combine(output, "calibration-suite.json"), new { schemaVersion = 1, caseId = c.Id, converterInvoked = false, passed = exitCode == 0, variants = results });
        return exitCode;
    }

    private static async Task<int> CalibrateMode(ReferenceCase c, string output, double delta)
    {
        var metrics = Read<ReferenceMetrics>(Path.Combine(output, "reference-metrics.json"));
        var anchorError = 0.0;
        foreach (var binding in c.AnchorBindings ?? [])
        {
            var segment = metrics.Paths[binding.Path].Segments[binding.Segment];
            var anchor = metrics.AnchorsPt[binding.Anchor];
            anchorError = Math.Max(anchorError, Math.Sqrt(Math.Pow(segment.End.X - anchor.X, 2) + Math.Pow(segment.End.Y - anchor.Y, 2)) * PtToPixels);
            metrics.Paths[binding.Path].Segments[binding.Segment] = segment with { End = anchor };
        }
        var document = XDocument.Load(Path.Combine(output, "reference.svg"));
        var root = document.Root!;
        var outer = document.Descendants().Single(e => e.Attribute("transform") is not null);
        var transform = Match(outer.Attribute("transform")!.Value, @"^translate\(([-\d.]+),([-\d.]+)\)scale\(([-\d.]+),([-\d.]+)\)$");
        var factor = transform[2] * 4 / 3;
        var roundingError = 0.0;
        var framePadding = Math.Abs(delta) * factor;
        var box = root.Attribute("viewBox")!.Value.Split(' ').Select(Parse).ToArray();
        root.SetAttributeValue("viewBox", string.Join(' ', new[] { (box[0] - transform[0]) * 4 / 3 - framePadding, (box[1] - transform[1]) * 4 / 3 - framePadding, box[2] * 4 / 3 + 2 * framePadding, box[3] * 4 / 3 + 2 * framePadding }.Select(Number)));
        root.SetAttributeValue("width", Number(Match(root.Attribute("width")!.Value, @"^([-\d.]+)pt$")[0] * 4 / 3 + 2 * framePadding) + "px");
        root.SetAttributeValue("height", Number(Match(root.Attribute("height")!.Value, @"^([-\d.]+)pt$")[0] * 4 / 3 + 2 * framePadding) + "px");
        outer.Attribute("transform")!.Remove();
        foreach (var element in document.Descendants())
        {
            foreach (var attribute in element.Attributes().ToArray())
            {
                if (attribute.Name.LocalName is "stroke-width" or "stroke-dashoffset") attribute.Value = Number(Parse(attribute.Value) * factor);
                if (attribute.Name.LocalName == "stroke-dasharray" && attribute.Value != "none")
                    attribute.Value = string.Join(' ', attribute.Value.Split([',', ' '], StringSplitOptions.RemoveEmptyEntries).Select(v => Number(Parse(v) * factor)));
            }
        }
        var paths = document.Descendants().Where(e => e.Name.LocalName == "path" && !e.Ancestors().Any(a => a.Name.LocalName is "clipPath" or "defs")).ToArray();
        var clips = document.Descendants().Where(e => e.Name.LocalName == "clipPath").Select(e => e.Descendants().Single(p => p.Name.LocalName == "path")).ToArray();
        if (paths.Length != metrics.Paths.Length || clips.Length != metrics.Clips.Length) throw new InvalidOperationException("Calibration operation counts disagree.");
        for (var i = 0; i < paths.Length; i++) paths[i].SetAttributeValue("d", Data(metrics.Paths[i].Segments));
        for (var i = 0; i < clips.Length; i++) clips[i].SetAttributeValue("d", Data(metrics.Clips[i].Segments));
        File.WriteAllText(Path.Combine(output, "actual.svg"), document.ToString(SaveOptions.DisableFormatting));
        Write(Path.Combine(output, "actual-scene.json"), new { schemaVersion = 1, paths = Array.Empty<object>(), units = "Oracle-only equivalent representation; no candidate compiler" });
        var perturbation = anchorError + Math.Sqrt(2) * Math.Abs(delta) * factor;
        var checks = new[] { new NumericCheck("equivalent-representation.rounding", 0, roundingError, "CSS pixels", roundingError, 0.000001, roundingError <= 0.000001),
            new NumericCheck("oracle-coordinate-precision", 0, perturbation, "CSS pixels", perturbation, c.NumericTolerancePixels, perturbation <= c.NumericTolerancePixels),
            new NumericCheck("oracle-frame-precision", 0, 2 * framePadding, "CSS pixels", 2 * framePadding, c.NumericTolerancePixels, 2 * framePadding <= c.NumericTolerancePixels) };
        Write(Path.Combine(output, "comparison-input.json"), new { schemaVersion = 1, caseId = c.Id, referenceMode = "oracle-representation-calibration", actualLabel = "Equivalent oracle SVG",
            toleranceProfile = c.Id, referenceOriginBp = metrics.SvgOriginBp, numericTolerancePixels = c.NumericTolerancePixels, numeric = new { passed = checks.All(v => v.Passed), checks }, pdf = new { originPixels = metrics.PdfOriginPixels } });
        Write(Path.Combine(output, "calibration-provenance.json"), new { schemaVersion = 1, source = "Independent PGF soft-path and SVG measurements", converterInvoked = false,
            operation = "Flatten physical transforms; preserve paint and clips; serialize coordinates at six decimals; use measured named anchors where declared; perturb within four TeX sp and expand the native frame by that fixed amount",
            maxRoundingErrorPixels = roundingError, namedAnchorRoundTripErrorPixels = anchorError, perturbationPt = delta, maxCoordinatePerturbationPixels = perturbation, frameExpansionPixels = 2 * framePadding });
        var result = await Process(ResolveExecutable("node"), [At("tools/TikzVisual/compare.mjs"), output], Root);
        if (result.ExitCode is not (0 or 1)) throw new InvalidOperationException("Calibration visual runner failed: " + result.Output);
        Console.WriteLine($"{c.Id}: oracle calibration {(result.ExitCode == 0 ? "pass" : "mismatch")}; {Relative(Path.Combine(output, "report.json"))}");
        return result.ExitCode;

        string Number(double value)
        {
            var formatted = (Math.Abs(value) < 0.0000005 ? 0 : value).ToString("0.######", CultureInfo.InvariantCulture);
            roundingError = Math.Max(roundingError, Math.Abs(value - Parse(formatted)));
            return formatted;
        }
        string Data(ReferenceSegment[] segments)
        {
            var result = new StringBuilder();
            foreach (var segment in segments)
            {
                switch (segment.Kind)
                {
                    case "Move": result.Append('M'); Point(segment.End); break;
                    case "Line": result.Append('L'); Point(segment.End); break;
                    case "Cubic": result.Append('C'); Point(segment.Control1); Point(segment.Control2); Point(segment.End); break;
                    case "Close": result.Append('Z'); break;
                    default: throw new InvalidOperationException("Unknown calibration segment.");
                }
            }
            return result.ToString().TrimEnd();
            void Point(XY point) => result.Append(Number((point.X + delta) * factor)).Append(' ').Append(Number(-(point.Y + delta) * factor)).Append(' ');
        }
    }
}

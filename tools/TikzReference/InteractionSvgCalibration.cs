using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;

internal static partial class ReferenceTool
{
    // Oracle data only: PGF soft paths, native DVI glyphs and node frames,
    // original outline definitions and paint. No candidate parser, scene,
    // font resource, layout, geometry helper, or SVG writer is used.
    private static async Task<int> CalibrateInteractionSvg(InteractionCase c, string output)
    {
        ResetDirectory(output);
        var metrics = CachedInteraction(c);
        var variants = new List<object>();
        var exit = 0;
        foreach (var (mode, deltaSp) in new[] { ("native-css", 0), ("sp-plus", 4), ("sp-minus", -4) })
        {
            var folder = Path.Combine(output, mode);
            Directory.CreateDirectory(folder);
            foreach (var file in InteractionArtifacts.Append("provenance.json"))
                File.Copy(At(InteractionRoot + "/" + c.Id + "/" + file), Path.Combine(folder, file));
            File.Copy(At(c.Source), Path.Combine(folder, "source.tikz"));
            var original = XDocument.Load(Path.Combine(folder, "reference.svg"));
            var frame = OracleStrokeFrame(original, metrics);
            if (InteractionInkFraming)
            {
                File.Copy(Path.Combine(folder, "reference.svg"), Path.Combine(folder, "original-driver.svg"));
                var reference = new XDocument(original);
                ApplyOracleFrame(reference, frame, false);
                File.WriteAllText(Path.Combine(folder, "reference.svg"), reference.ToString(SaveOptions.DisableFormatting));
            }
            var checks = new List<NumericCheck>();
            var actual = NativeInteractionSvg(original, metrics, frame, deltaSp, checks);
            File.WriteAllText(Path.Combine(folder, "actual.svg"), actual.ToString(SaveOptions.DisableFormatting));
            var crop = await Process(ResolveExecutable("node"), [At("tools/TikzVisual/interaction-crop-check.mjs"), folder], Root);
            if (crop.ExitCode != 0) throw new InvalidOperationException("Independent interaction glyph containment failed: " + crop.Output);
            var containment = Read<JsonElement>(Path.Combine(folder, "oracle-crop-check.json"));
            checks.Add(new("oracle.outlineContainment", true, containment.GetProperty("passed").GetBoolean(),
                "visible original outlines within independent frame", null, 0, containment.GetProperty("passed").GetBoolean()));
            Write(Path.Combine(folder, "actual-scene.json"), new { schemaVersion = 1, paths = Array.Empty<object>(),
                scope = "Independent native PGF/DVI reconstruction in CSS units; no candidate scene" });
            Write(Path.Combine(folder, "comparison-input.json"), new { schemaVersion = 1, caseId = "node-" + c.Id + "-" + mode,
                referenceMode = InteractionInkFraming ? "derived-ink-oracle; original-driver.svg retained" : "cached original driver",
                referenceOriginBp = frame.Origin, exactPrimary = true, exactPdf = true,
                actualLabel = "Native oracle in CSS units (" + mode + ")",
                scope = "Oracle-only native positions, transforms, paths, paint, clips and CSS serialization; no approved allowance",
                numericTolerancePixels = c.NumericTolerancePixels, numeric = new { passed = checks.All(check => check.Passed), checks },
                pdf = new { originPixels = metrics.Geometry.PdfOriginPixels } });
            var rendered = await Process(ResolveExecutable("node"), [At("tools/TikzVisual/compare.mjs"), folder], Root);
            if (rendered.ExitCode is not (0 or 1) || !File.Exists(Path.Combine(folder, "report.json")))
                throw new InvalidOperationException("Interaction CSS calibration failed: " + rendered.Output);
            var report = Read<JsonElement>(Path.Combine(folder, "report.json"));
            if (!report.GetProperty("numeric").GetProperty("passed").GetBoolean()
                || !report.GetProperty("dimensions").GetProperty("passed").GetBoolean())
                throw new InvalidOperationException("Independent interaction representation exceeds its serialization/frame contract.");
            Write(Path.Combine(folder, "calibration-evidence.json"), new { schemaVersion = 1,
                generatedUtc = DateTimeOffset.UtcNow.ToString("O"), caseId = c.Id, Profile.Id, mode, deltaSp,
                converterInvoked = false, framing = InteractionInkFraming ? "independent stroke ink" : "original driver",
                scope = "Independent PGF paths and node frames; native DVI positions; original outlines, paint, order and clips; six decimal CSS serialization",
                frame, originalProvenance = Read<JsonElement>(Path.Combine(folder, "provenance.json")),
                referenceSha256 = HashFile(Path.Combine(folder, "reference.svg")), derivedSha256 = HashFile(Path.Combine(folder, "actual.svg")),
                metricsSha256 = HashFile(Path.Combine(folder, "metrics.json")), nativePositionsSha256 = HashFile(Path.Combine(folder, "native-positions.log")),
                toolHashes = new[] { "tools/TikzReference/InteractionSvgCalibration.cs", "tools/TikzReference/OracleStrokeFrame.cs",
                    "tools/TikzReference/NodeInteractions.cs", "tools/TikzReference/NativeNodeGlyphs.cs",
                    "tools/TikzVisual/interaction-crop-check.mjs", "tools/TikzVisual/compare.mjs" }
                    .ToDictionary(f => f, f => HashText(Text(At(f)))),
                numeric = report.GetProperty("numeric"), dimensions = report.GetProperty("dimensions"),
                primary = report.GetProperty("primary"), pdf = report.GetProperty("pdf"),
                outlineContainment = containment,
                renderer = report.GetProperty("renderer"), artifacts = report.GetProperty("artifacts") });
            variants.Add(new { mode, deltaSp, exitCode = rendered.ExitCode, evidence = mode + "/calibration-evidence.json" });
            exit = Math.Max(exit, rendered.ExitCode);
            Console.WriteLine($"{c.Id}/{mode}: independent CSS measurements; {Relative(Path.Combine(folder, "report.json"))}");
        }
        Write(Path.Combine(output, "calibration-suite.json"), new { schemaVersion = 1, caseId = c.Id,
            converterInvoked = false, framing = InteractionInkFraming ? "independent stroke ink" : "original driver", variants });
        return exit;
    }

    private static void SaveInteractionSvgEvidence(InteractionCase[] selected, string output)
    {
        JsonElement renderer = default;
        JsonElement tools = default;
        var cases = new List<object>();
        foreach (var c in selected)
        {
            var variants = new List<object>();
            foreach (var mode in new[] { "native-css", "sp-plus", "sp-minus" })
            {
                var file = Path.Combine(output, c.Id, mode, "calibration-evidence.json");
                var evidence = Read<JsonElement>(file);
                var numeric = evidence.GetProperty("numeric");
                if (evidence.GetProperty("converterInvoked").GetBoolean() || evidence.GetProperty("caseId").GetString() != c.Id
                    || evidence.GetProperty("id").GetString() != Profile.Id || evidence.GetProperty("mode").GetString() != mode
                    || evidence.GetProperty("deltaSp").GetInt32() != (mode == "native-css" ? 0 : mode == "sp-plus" ? 4 : -4)
                    || !numeric.GetProperty("passed").GetBoolean() || !evidence.GetProperty("dimensions").GetProperty("passed").GetBoolean()
                    || !evidence.GetProperty("outlineContainment").GetProperty("passed").GetBoolean())
                    throw new InvalidOperationException("Incomplete independent interaction calibration evidence.");
                var identity = evidence.GetProperty("renderer");
                if (renderer.ValueKind != JsonValueKind.Undefined && renderer.GetRawText() != identity.GetRawText())
                    throw new InvalidOperationException("Interaction calibration renderer changed within the experiment.");
                renderer = identity;
                var identities = evidence.GetProperty("toolHashes");
                if (tools.ValueKind != JsonValueKind.Undefined && tools.GetRawText() != identities.GetRawText())
                    throw new InvalidOperationException("Interaction calibration tool sources changed within the experiment.");
                tools = identities;
                variants.Add(new { mode, deltaSp = evidence.GetProperty("deltaSp"),
                    referenceSha256 = evidence.GetProperty("referenceSha256"), derivedSha256 = evidence.GetProperty("derivedSha256"),
                    metricsSha256 = evidence.GetProperty("metricsSha256"), nativePositionsSha256 = evidence.GetProperty("nativePositionsSha256"),
                    frame = evidence.GetProperty("frame"), toolHashes = evidence.GetProperty("toolHashes"),
                    numeric = new { passed = true, checkCount = numeric.GetProperty("checks").GetArrayLength(),
                        maxSerializationError = numeric.GetProperty("checks").EnumerateArray()
                            .Where(check => check.GetProperty("name").GetString()!.StartsWith("oracle.serialization.", StringComparison.Ordinal))
                            .Max(check => check.GetProperty("absoluteError").GetDouble()) },
                    dimensions = evidence.GetProperty("dimensions"), primary = evidence.GetProperty("primary"),
                    pdf = evidence.GetProperty("pdf"), outlineContainment = evidence.GetProperty("outlineContainment") });
            }
            var native = Read<JsonElement>(Path.Combine(output, c.Id, "native-css", "calibration-evidence.json"));
            cases.Add(new { caseId = c.Id, originalProvenance = native.GetProperty("originalProvenance"), variants });
        }
        Write(Path.Combine(output, "calibration-evidence.json"), new { schemaVersion = 1,
            id = Profile.Id + "-css-calibration-v1", generatedUtc = DateTimeOffset.UtcNow.ToString("O"),
            completed = true, converterInvoked = false, conformanceClaim = false,
            framing = InteractionInkFraming ? "independent stroke ink; original driver retained" : "original driver",
            operation = "Independent PGF paths, native DVI glyph positions and node frames, original paint/order/outlines/clips; six decimal CSS serialization; fixed ±4 TeX sp translation and frame padding",
            expectedCases = selected.Select(c => c.Id), renderer, cases });
        Console.WriteLine("Interaction calibration snapshot: " + Relative(Path.Combine(output, "calibration-evidence.json")));
    }

    private static XDocument NativeInteractionSvg(XDocument original, InteractionMetrics metrics, OracleFrame frame,
        int deltaSp, List<NumericCheck> checks)
    {
        XNamespace svg = "http://www.w3.org/2000/svg";
        var view = InteractionInkFraming ? frame.Expanded : frame.Original;
        var delta = deltaSp * PtToPixels / 65536;
        var padding = Math.Abs(delta);
        var root = new XElement(svg + "svg",
            new XAttribute("width", Number(view[2] * 4 / 3 + 2 * padding, "frame.width") + "px"),
            new XAttribute("height", Number(view[3] * 4 / 3 + 2 * padding, "frame.height") + "px"),
            new XAttribute("viewBox", string.Join(' ', new[] { (view[0] - frame.Origin.X) * 4 / 3 - padding,
                (view[1] - frame.Origin.Y) * 4 / 3 - padding, view[2] * 4 / 3 + 2 * padding, view[3] * 4 / 3 + 2 * padding }
                .Select((value, index) => Number(value, "frame.viewBox." + index)))));
        var definitions = new XElement(svg + "defs");
        foreach (var outline in original.Descendants(svg + "defs").Elements(svg + "path")) definitions.Add(new XElement(outline));
        for (var index = 0; index < metrics.Geometry.Clips.Length; index++)
        {
            var clip = metrics.Geometry.Clips[index];
            var points = clip.Segments.Take(4).Select(s => s.End).ToArray();
            if (clip.Segments.Length != 5 || clip.Segments[0].Kind != "Move" || clip.Segments[4].Kind != "Close"
                || clip.Segments.Skip(1).Take(3).Any(s => s.Kind != "Line") || points.Select(p => p.X).Distinct().Count() != 2
                || points.Select(p => p.Y).Distinct().Count() != 2
                || Enumerable.Range(0, 4).Any(i => points[i].X != points[(i + 1) % 4].X && points[i].Y != points[(i + 1) % 4].Y))
                throw new InvalidOperationException("Independent glyph containment currently requires an axis-aligned rectangle clip.");
            definitions.Add(new XElement(svg + "clipPath", new XAttribute("id", "oracle-clip-" + index),
                new XAttribute("clipPathUnits", "userSpaceOnUse"), new XElement(svg + "path",
                    new XAttribute("d", Data(clip.Segments, "clip." + index)), new XAttribute("clip-rule", clip.FillRule))));
        }
        root.Add(definitions);
        var originalPaths = original.Descendants(svg + "path").Where(p => !p.Ancestors().Any(a => a.Name.LocalName is "defs" or "clipPath")).ToArray();
        var originalGlyphs = original.Descendants(svg + "use").ToArray();
        var glyphIndex = 0;
        if (originalPaths.Length != metrics.Geometry.Paths.Length
            || originalGlyphs.Length != metrics.Painting.Count(p => p.Kind == "glyph"))
            throw new InvalidOperationException("Independent painting counts disagree.");
        foreach (var operation in metrics.Painting)
        {
            var parent = root;
            foreach (var clip in operation.Clips)
            {
                if (clip < 0 || clip >= metrics.Geometry.Clips.Length) throw new InvalidOperationException("Missing independent clip.");
                var group = new XElement(svg + "g", new XAttribute("clip-path", $"url(#oracle-clip-{clip})"));
                parent.Add(group); parent = group;
            }
            if (operation.Kind == "path")
            {
                var index = operation.PathIndex; var path = metrics.Geometry.Paths[index]; var prefix = "path." + index;
                var element = new XElement(svg + "path", new XAttribute("d", Data(path.Segments, prefix)),
                    new XAttribute("fill", path.Fill ? path.FillColor : "none"), new XAttribute("stroke", path.Stroke ? path.StrokeColor : "none"));
                if (path.Fill) { element.SetAttributeValue("fill-rule", path.FillRule); element.SetAttributeValue("fill-opacity", Number(path.FillOpacity, prefix + ".fillOpacity", "fraction")); }
                if (path.Stroke)
                {
                    element.SetAttributeValue("stroke-width", Number(path.WidthPt * PtToPixels, prefix + ".width"));
                    element.SetAttributeValue("stroke-opacity", Number(path.StrokeOpacity, prefix + ".strokeOpacity", "fraction"));
                    element.SetAttributeValue("stroke-linecap", path.Cap); element.SetAttributeValue("stroke-linejoin", path.Join);
                    var limit = originalPaths[index].AncestorsAndSelf().Select(e => e.Attribute("stroke-miterlimit")?.Value).FirstOrDefault(v => v is not null) ?? "4";
                    element.SetAttributeValue("stroke-miterlimit", limit);
                    if (path.DashPt.Length > 0)
                    {
                        element.SetAttributeValue("stroke-dasharray", string.Join(' ', path.DashPt.Select((d, i) => Number(d * PtToPixels, prefix + ".dash." + i))));
                        element.SetAttributeValue("stroke-dashoffset", Number(path.DashPhasePt * PtToPixels, prefix + ".dashPhase"));
                    }
                }
                parent.Add(element);
                continue;
            }
            if (operation.Kind != "glyph") throw new InvalidOperationException("Unknown independently measured painting operation.");
            var node = metrics.Nodes.Nodes.Single(n => n.Id == operation.Node);
            var glyph = node.Glyphs[operation.GlyphIndex]; var native = metrics.Frames[node.Id];
            var x = (native.ESp + native.A * glyph.XSp - native.C * glyph.YSp) * PtToPixels / 65536 + delta;
            var y = -(native.FSp + native.B * glyph.XSp - native.D * glyph.YSp) * PtToPixels / 65536 - delta;
            var name = node.Id + ".glyph." + operation.GlyphIndex;
            var outline = originalGlyphs[glyphIndex++].Attributes().Single(a => a.Name.LocalName == "href").Value;
            var parts = outline.TrimStart('#').Split('-');
            if (parts.Length != 2 || int.Parse(parts[1], CultureInfo.InvariantCulture) != glyph.Slot
                || metrics.Nodes.FontDefinitions[parts[0]] != glyph.Font || !definitions.Elements(svg + "path").Any(p => p.Attribute("id")?.Value == outline[1..]))
                throw new InvalidOperationException("Native glyph identity differs from independent oracle outline.");
            var coefficients = new[] { native.A * 4 / 3, -native.B * 4 / 3, -native.C * 4 / 3, native.D * 4 / 3 };
            parent.Add(new XElement(svg + "use", new XAttribute("href", outline),
                new XAttribute("transform", "matrix(" + string.Join(' ', coefficients.Select((v, i) => Number(v, name + ".coefficient." + i, "coefficient")))
                    + " " + Number(x, name + ".x") + " " + Number(y, name + ".y") + ")"),
                new XAttribute("fill", operation.Color), new XAttribute("fill-opacity", Number(operation.Opacity, name + ".opacity", "fraction")),
                new XAttribute("stroke", "none")));
        }
        var displacement = Math.Sqrt(2) * padding;
        checks.Add(new("oracle.fixedPerturbation", 0, displacement, "CSS px", displacement, .0002, displacement <= .0002));
        return new(root);

        string Number(double value, string name, string units = "CSS px")
        {
            var text = (Math.Abs(value) < .0000005 ? 0 : value).ToString("0.######", CultureInfo.InvariantCulture);
            var parsed = double.Parse(text, CultureInfo.InvariantCulture); var error = Math.Abs(parsed - value);
            checks.Add(new("oracle.serialization." + name, value, parsed, units, error, .000000500001, error <= .000000500001));
            return text;
        }
        string Data(ReferenceSegment[] segments, string name)
        {
            var data = new StringBuilder();
            for (var index = 0; index < segments.Length; index++)
            {
                var segment = segments[index]; var prefix = name + ".segment." + index;
                switch (segment.Kind)
                {
                    case "Move": data.Append('M'); Point(segment.End, prefix); break;
                    case "Line": data.Append('L'); Point(segment.End, prefix); break;
                    case "Cubic": data.Append('C'); Point(segment.Control1, prefix + ".a"); Point(segment.Control2, prefix + ".b"); Point(segment.End, prefix); break;
                    case "Close": data.Append('Z'); break;
                    default: throw new InvalidOperationException("Unknown independent soft-path segment.");
                }
            }
            return data.ToString().TrimEnd();
            void Point(XY point, string prefix) => data.Append(Number(point.X * PtToPixels + delta, prefix + ".x"))
                .Append(' ').Append(Number(-point.Y * PtToPixels - delta, prefix + ".y")).Append(' ');
        }
    }
}

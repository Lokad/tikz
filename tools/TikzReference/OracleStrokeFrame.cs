using System.Globalization;
using System.Text.Json;
using System.Xml.Linq;

internal static partial class ReferenceTool
{
    // Independent oracle geometry only. No candidate IR, stroke-bounds helper,
    // text metrics, bundled outline, or SVG serializer participates here.
    private static OracleFrame OracleStrokeFrame(XDocument document, InteractionMetrics metrics)
    {
        var view = document.Root!.Attribute("viewBox")!.Value.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(Parse).ToArray();
        if (view.Length != 4) throw new InvalidOperationException("Unexpected driver frame.");
        var origin = NodeSvgOrigin(document);
        var transform = document.Descendants().First(e => e.Name.LocalName == "g" && (e.Attribute("transform")?.Value ?? "").StartsWith("translate(", StringComparison.Ordinal));
        var coefficients = Match(transform.Attribute("transform")!.Value, @"^translate\(([-\d.]+),([-\d.]+)\)scale\(([-\d.]+),([-\d.]+)\)$");
        var factor = coefficients[2];
        var paths = document.Descendants().Where(e => e.Name.LocalName == "path" && !e.Ancestors().Any(a => a.Name.LocalName is "defs" or "clipPath")).ToArray();
        if (paths.Length != metrics.Geometry.Paths.Length) throw new InvalidOperationException("Incomplete independent frame painting measurements.");
        var minX = view[0]; var minY = view[1]; var maxX = minX + view[2]; var maxY = minY + view[3];
        var contributions = new List<object>();
        for (var index = 0; index < paths.Length; index++)
        {
            var path = metrics.Geometry.Paths[index];
            if (!path.Stroke) continue;
            // These trusted fixtures contain closed rectangle borders and
            // ordinary butt-capped lines. The latter already fit the driver.
            if (path.Segments.Length == 2 && path.Segments[0].Kind == "Move" && path.Segments[1].Kind == "Line") continue;
            if (path.Segments.Length != 5 || path.Segments[0].Kind != "Move" || path.Segments[4].Kind != "Close"
                || path.Segments.Skip(1).Take(3).Any(s => s.Kind != "Line"))
                throw new InvalidOperationException("Oracle ink framing needs a measured polygon construction for this path.");
            var vertices = path.Segments.Take(4).Select(s => s.End).ToArray();
            var radius = path.WidthPt / 2;
            var points = new List<XY>(vertices);
            var limit = Parse(paths[index].AncestorsAndSelf().Select(e => e.Attribute("stroke-miterlimit")?.Value).FirstOrDefault(v => v is not null) ?? "4");
            for (var corner = 0; corner < vertices.Length; corner++)
            {
                var p = vertices[corner]; var previous = vertices[(corner + vertices.Length - 1) % vertices.Length]; var next = vertices[(corner + 1) % vertices.Length];
                var ux = p.X - previous.X; var uy = p.Y - previous.Y;
                var vx = next.X - p.X; var vy = next.Y - p.Y;
                var uLength = Math.Sqrt(ux * ux + uy * uy); var vLength = Math.Sqrt(vx * vx + vy * vy);
                if (uLength == 0 || vLength == 0) throw new InvalidOperationException("Degenerate independent stroke polygon.");
                var nx = -uy * radius / uLength; var ny = ux * radius / uLength;
                var mx = -vy * radius / vLength; var my = vx * radius / vLength;
                points.Add(new(p.X + nx, p.Y + ny)); points.Add(new(p.X - nx, p.Y - ny));
                points.Add(new(p.X + mx, p.Y + my)); points.Add(new(p.X - mx, p.Y - my));
                if (path.Join == "round")
                {
                    points.Add(new(p.X - radius, p.Y - radius)); points.Add(new(p.X + radius, p.Y + radius));
                    continue;
                }
                if (path.Join != "miter") continue;
                // Intersect the two offset edge lines; this does not call the
                // production normal-bisector implementation.
                var determinant = ux * vy - uy * vx;
                if (determinant == 0) continue;
                var parameter = ((mx - nx) * vy - (my - ny) * vx) / determinant;
                var dx = nx + parameter * ux; var dy = ny + parameter * uy;
                if (dx * dx + dy * dy <= radius * radius * limit * limit)
                { points.Add(new(p.X + dx, p.Y + dy)); points.Add(new(p.X - dx, p.Y - dy)); }
            }
            var strokeMinX = points.Min(p => p.X); var strokeMaxX = points.Max(p => p.X);
            var strokeMinY = points.Min(p => p.Y); var strokeMaxY = points.Max(p => p.Y);
            foreach (var clipId in metrics.Painting.Single(p => p.Kind == "path" && p.PathIndex == index).Clips)
            {
                var clip = metrics.Geometry.Clips[clipId].Segments.Select(s => s.End).ToArray();
                strokeMinX = Math.Max(strokeMinX, clip.Min(p => p.X)); strokeMaxX = Math.Min(strokeMaxX, clip.Max(p => p.X));
                strokeMinY = Math.Max(strokeMinY, clip.Min(p => p.Y)); strokeMaxY = Math.Min(strokeMaxY, clip.Max(p => p.Y));
            }
            if (strokeMinX > strokeMaxX || strokeMinY > strokeMaxY) continue;
            var x1 = origin.X + strokeMinX * factor; var x2 = origin.X + strokeMaxX * factor;
            var y1 = origin.Y - strokeMaxY * factor; var y2 = origin.Y - strokeMinY * factor;
            minX = Math.Min(minX, x1); maxX = Math.Max(maxX, x2); minY = Math.Min(minY, y1); maxY = Math.Max(maxY, y2);
            contributions.Add(new { pathIndex = index, units = "bp in original driver frame", minX = x1, minY = y1, maxX = x2, maxY = y2, path.Join, miterLimit = limit });
        }
        return new(view, [minX, minY, maxX - minX, maxY - minY], origin, contributions.ToArray());
    }

    private static void ApplyOracleFrame(XDocument document, OracleFrame frame, bool rebase)
    {
        var root = document.Root!; var view = frame.Expanded;
        root.SetAttributeValue("viewBox", string.Join(' ', new[] { view[0] - (rebase ? frame.Origin.X : 0),
            view[1] - (rebase ? frame.Origin.Y : 0), view[2], view[3] }.Select(v => v.ToString("R", CultureInfo.InvariantCulture))));
        root.SetAttributeValue("width", view[2].ToString("R", CultureInfo.InvariantCulture) + "pt");
        root.SetAttributeValue("height", view[3].ToString("R", CultureInfo.InvariantCulture) + "pt");
        if (rebase)
        {
            var group = document.Descendants().First(e => e.Name.LocalName == "g" && (e.Attribute("transform")?.Value ?? "").StartsWith("translate(", StringComparison.Ordinal));
            group.SetAttributeValue("transform", System.Text.RegularExpressions.Regex.Replace(group.Attribute("transform")!.Value, @"^translate\([^)]*\)", ""));
        }
    }

    private static async Task<int> CalibrateInteractionFraming(InteractionCase c, string output)
    {
        ResetDirectory(output);
        var metrics = CachedInteraction(c);
        foreach (var file in InteractionArtifacts.Append("provenance.json"))
            File.Copy(At(InteractionRoot + "/" + c.Id + "/" + file), Path.Combine(output, file));
        File.Copy(At(c.Source), Path.Combine(output, "source.tikz"));
        var document = XDocument.Load(Path.Combine(output, "reference.svg"));
        var frame = OracleStrokeFrame(document, metrics);
        ApplyOracleFrame(document, frame, true);
        File.WriteAllText(Path.Combine(output, "actual.svg"), document.ToString(SaveOptions.DisableFormatting));
        Write(Path.Combine(output, "actual-scene.json"), new { schemaVersion = 1, paths = Array.Empty<object>(), scope = "Independent oracle ink frame; no candidate scene" });
        Write(Path.Combine(output, "comparison-input.json"), new { schemaVersion = 1, caseId = "node-" + c.Id + "-ink-frame-oracle",
            referenceMode = "cached original driver", referenceOriginBp = frame.Origin, actualUnits = "bp", exactPrimary = true, exactPdf = true,
            actualLabel = "Oracle with measured stroke ink frame", scope = "Oracle-only viewport/ink experiment; original driver crop retained; no approved policy",
            numericTolerancePixels = c.NumericTolerancePixels, numeric = new { passed = true, checks = Array.Empty<NumericCheck>() }, pdf = new { originPixels = metrics.Geometry.PdfOriginPixels } });
        var rendered = await Process(ResolveExecutable("node"), [At("tools/TikzVisual/compare.mjs"), output], Root);
        if (rendered.ExitCode is not (0 or 1) || !File.Exists(Path.Combine(output, "report.json")))
            throw new InvalidOperationException("Oracle framing comparison failed: " + rendered.Output);
        var report = Read<JsonElement>(Path.Combine(output, "report.json"));
        Write(Path.Combine(output, "calibration-evidence.json"), new { schemaVersion = 1, converterInvoked = false,
            scope = "Original driver crop versus independently measured polygon stroke ink; SVG and ordinary PDF", frame,
            referenceSha256 = HashFile(Path.Combine(output, "reference.svg")), expandedOracleSha256 = HashFile(Path.Combine(output, "actual.svg")),
            metricsSha256 = HashFile(Path.Combine(output, "metrics.json")),
            toolHashes = new[] { "tools/TikzReference/OracleStrokeFrame.cs", "tools/TikzReference/NodeInteractions.cs", "tools/TikzVisual/compare.mjs" }
                .ToDictionary(f => f, f => HashText(Text(At(f)))),
            originalProvenance = Read<JsonElement>(Path.Combine(output, "provenance.json")), dimensions = report.GetProperty("dimensions"),
            primary = report.GetProperty("primary"), pdf = report.GetProperty("pdf"), renderer = report.GetProperty("renderer"), artifacts = report.GetProperty("artifacts") });
        Console.WriteLine($"{c.Id}: independent ink framing evidence; {Relative(Path.Combine(output, "calibration-evidence.json"))}");
        return rendered.ExitCode;
    }

    private sealed record OracleFrame(double[] Original, double[] Expanded, XY Origin, object[] StrokeContributions);
}

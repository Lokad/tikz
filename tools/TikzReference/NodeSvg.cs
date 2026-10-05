using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using Lokad.TikZ;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Text;

internal static partial class ReferenceTool
{
    private static async Task<int> NodeSvg(NodeManifest manifest, bool calibration, string output)
    {
        var directory = ArtifactDirectory(output);
        ResetDirectory(directory);
        try
        {
            var metrics = CachedNodes(manifest);
            foreach (var file in new[] { "metrics.json", "reference.svg", "oracle.log", "provenance.json", "native-positions.log" })
                File.Copy(At(NodeBaseline + "/" + file), Path.Combine(directory, file));
            var source = Text(At(manifest.Source));
            File.WriteAllText(Path.Combine(directory, "source.tikz"), source);
            var reference = XDocument.Load(Path.Combine(directory, "reference.svg"));
            var origin = NodeSvgOrigin(reference);
            var checks = new List<NumericCheck>();
            if (calibration)
            {
                // This branch never invokes the converter, layout, serializer,
                // or bundled font resources. All outlines come from the oracle.
                var actual = NativeNodeSvg(reference, metrics, origin, checks);
                File.WriteAllText(Path.Combine(directory, "actual.svg"), actual.ToString(SaveOptions.DisableFormatting));
                Write(Path.Combine(directory, "actual-scene.json"), new { schemaVersion = 1, paths = Array.Empty<object>(),
                    scope = "original oracle outlines and paint at native integer positions; independent CSS serialization" });
                Write(Path.Combine(directory, "calibration-provenance.json"), new {
                    schemaVersion = 1, scope = "oracle-only primary experiment; no candidate code or font data",
                    converterInvoked = false, nativeFrame = "union of native stroked rectangle borders and native text layout boxes; original outline containment checked separately",
                    hashes = new[] { "reference.svg", "actual.svg", "metrics.json", "native-positions.log" }.ToDictionary(f => f, f => HashFile(Path.Combine(directory, f))),
                    tools = new[] { "tools/TikzReference/NodeSvg.cs", "tools/TikzReference/NativeNodeGlyphs.cs", "tools/TikzReference/NodeReference.cs",
                        "tools/TikzVisual/node-crop-check.mjs", "tools/TikzVisual/compare.mjs", "tools/TikzVisual/browser-profile.json" }
                        .ToDictionary(f => f, f => HashText(Text(At(f))))
                });
                var crop = await Process(ResolveExecutable("node"), [At("tools/TikzVisual/node-crop-check.mjs"), directory], Root);
                if (crop.ExitCode != 0) throw new InvalidOperationException("Independent node crop check failed: " + crop.Output);
                using var containment = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, "oracle-crop-check.json")));
                checks.Add(new("oracle.outlineContainment", true, containment.RootElement.GetProperty("passed").GetBoolean(),
                    "native frame contains original oracle outlines", null, 0, containment.RootElement.GetProperty("passed").GetBoolean()));
            }
            else
            {
                GraphicsScene? scene = null;
                var converted = TikzConverter.ConvertWithTrace(source, TikzOptions.Default with { IdPrefix = "candidate" }, CancellationToken.None, value => scene = value);
                if (converted is TikzFailure failure)
                {
                    Write(Path.Combine(directory, "report.json"), new { schemaVersion = 1, verdict = "unsupported-or-candidate-error", diagnostics = failure.Diagnostics });
                    return 3;
                }
                var success = (TikzSuccess)converted;
                File.WriteAllText(Path.Combine(directory, "actual.svg"), success.Svg);
                checks = PublicNodeChecks(scene!, metrics, source);
                Write(Path.Combine(directory, "actual-scene.json"), NodeScene(scene!, success));
                var git = await Process(ResolveExecutable("git"), ["rev-parse", "HEAD"], Root);
                Write(Path.Combine(directory, "candidate-provenance.json"), new { schemaVersion = 1, commit = git.Output.Trim(),
                    workingTreeSha256 = await WorkingTreeFingerprint(), configuration = BuildConfiguration,
                    assemblySha256 = HashFile(typeof(TikzConverter).Assembly.Location) });
            }
            Write(Path.Combine(directory, "comparison-input.json"), new { schemaVersion = 1, caseId = "rectangles",
                referenceMode = "cached", referenceOriginBp = origin, rasterProfile = "node", toleranceProfile = "rectangles",
                actualLabel = calibration ? "Native oracle in CSS units" : "Lokad.TikZ",
                exactPrimary = calibration,
                scope = calibration ? "Oracle-only native rectangle CSS representation; primary only"
                    : "Public rectangle fixture: numeric and primary SVG gates only; PDF and node interaction coverage pending",
                numericTolerancePixels = 0.02, numeric = new { passed = checks.All(c => c.Passed), checks } });
            var rendered = await Process(ResolveExecutable("node"), [At("tools/TikzVisual/compare.mjs"), directory], Root);
            if (rendered.ExitCode is not (0 or 1) || !File.Exists(Path.Combine(directory, "report.json")))
                throw new InvalidOperationException("Node visual runner failed: " + rendered.Output);
            if (calibration)
            {
                var report = Read<JsonElement>(Path.Combine(directory, "report.json"));
                if (!report.GetProperty("numeric").GetProperty("passed").GetBoolean()
                    || !report.GetProperty("dimensions").GetProperty("passed").GetBoolean())
                    throw new InvalidOperationException("Oracle node representation exceeds its declared numeric contract.");
                Write(Path.Combine(directory, "calibration-evidence.json"), new { schemaVersion = 1,
                    id = "chromium-153-node-css-v1-oracle-calibration", generatedUtc = DateTimeOffset.UtcNow.ToString("O"),
                    converterInvoked = false, scope = "22 rectangle nodes; native glyph positions, CSS serialization, native frame; primary only",
                    command = "dotnet run --project tools/TikzReference -c Release -- calibrate-node-svg",
                    provenance = Read<JsonElement>(Path.Combine(directory, "calibration-provenance.json")),
                    oracle = Read<JsonElement>(Path.Combine(directory, "provenance.json")),
                    outlineContainment = Read<JsonElement>(Path.Combine(directory, "oracle-crop-check.json")),
                    numeric = report.GetProperty("numeric"), dimensions = report.GetProperty("dimensions"),
                    primary = report.GetProperty("primary"), renderer = report.GetProperty("renderer"),
                    browserProfile = Read<JsonElement>(At("tools/TikzVisual/browser-profile.json")),
                    artifacts = report.GetProperty("artifacts") });
            }
            Console.WriteLine($"{(calibration ? "Oracle-only node calibration" : "Public node SVG")}: {(rendered.ExitCode == 0 ? "pass" : "mismatch")}; {Relative(Path.Combine(directory, "report.json"))}");
            return rendered.ExitCode;
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            Write(Path.Combine(directory, "report.json"), new { schemaVersion = 1, verdict = "harness-failure", diagnostics = new[] { Sanitize(error.Message) } });
            Console.Error.WriteLine("Node SVG harness failure: " + Sanitize(error.Message));
            return 2;
        }
    }

    private static XY NodeSvgOrigin(XDocument document)
    {
        var group = document.Descendants().First(e => e.Name.LocalName == "g" && (e.Attribute("transform")?.Value ?? "").StartsWith("translate(", StringComparison.Ordinal));
        var values = Match(group.Attribute("transform")!.Value, @"^translate\(([-\d.]+),([-\d.]+)\)scale\(([-\d.]+),([-\d.]+)\)$");
        if (Math.Abs(values[2] - 72 / 72.27) > 0.000001 || Math.Abs(values[3] + 72 / 72.27) > 0.000001)
            throw new InvalidOperationException("Unexpected node driver physical transform.");
        return new(values[0], values[1]);
    }

    private static XDocument NativeNodeSvg(XDocument original, NodeMetrics metrics, XY origin, List<NumericCheck> checks)
    {
        XNamespace svg = "http://www.w3.org/2000/svg";
        // The natural frame follows independent native shape/stroke/text-box
        // measurements, rather than copying the driver's rounded SVG crop.
        // A separate browser check proves original outline ink fits this frame.
        var minX = double.PositiveInfinity; var minY = double.PositiveInfinity;
        var maxX = double.NegativeInfinity; var maxY = double.NegativeInfinity;
        foreach (var node in metrics.Nodes)
        {
            var halfStroke = node.Values["linewidth"] / 2.0;
            Include(node.BackgroundSouthWest.X - halfStroke, node.BackgroundSouthWest.Y - halfStroke);
            Include(node.BackgroundNorthEast.X + halfStroke, node.BackgroundNorthEast.Y + halfStroke);
            var baseline = node.Anchors["text"];
            Include(baseline.X, baseline.Y - node.Values["depth"]);
            Include(baseline.X + node.Values["width"], baseline.Y + node.Values["height"]);
        }
        var frame = new[] { minX, minY, maxX - minX, maxY - minY };
        var root = new XElement(svg + "svg", new XAttribute("width", Serialize(frame[2], "frame.width") + "px"),
            new XAttribute("height", Serialize(frame[3], "frame.height") + "px"), new XAttribute("viewBox",
                $"{Serialize(frame[0], "frame.x")} {Serialize(frame[1], "frame.y")} {Serialize(frame[2], "frame.viewBoxWidth")} {Serialize(frame[3], "frame.viewBoxHeight")}"));
        foreach (var defs in original.Descendants(svg + "defs")) root.Add(new XElement(defs));
        var painted = original.Descendants(svg + "path").Where(e => !e.Ancestors(svg + "defs").Any()).ToArray();
        if (painted.Length != metrics.Nodes.Length) throw new InvalidOperationException("Node background painting count differs from native measurements.");
        for (var index = 0; index < metrics.Nodes.Length; index++)
        {
            var node = metrics.Nodes[index]; var path = painted[index];
            var sw = node.BackgroundSouthWest; var ne = node.BackgroundNorthEast;
            var prefix = node.Id + ".";
            root.Add(new XElement(svg + "path", new XAttribute("d", $"M{X(sw.X, prefix + "sw.x")} {Y(sw.Y, prefix + "sw.y")} L{X(ne.X, prefix + "se.x")} {Y(sw.Y, prefix + "se.y")} L{X(ne.X, prefix + "ne.x")} {Y(ne.Y, prefix + "ne.y")} L{X(sw.X, prefix + "nw.x")} {Y(ne.Y, prefix + "nw.y")}Z"),
                new XAttribute("fill", Inherited(path, "fill", "none")), new XAttribute("stroke", Inherited(path, "stroke", "#000")),
                new XAttribute("stroke-width", X(node.Values["linewidth"], prefix + "linewidth")),
                new XAttribute("stroke-linejoin", Inherited(path, "stroke-linejoin", "miter"))));
            var baseline = node.Anchors["text"];
            for (var glyphIndex = 0; glyphIndex < node.Glyphs.Length; glyphIndex++)
            {
                var glyph = node.Glyphs[glyphIndex];
                var definition = metrics.FontDefinitions.Single(p => p.Value == glyph.Font).Key;
                var name = prefix + "glyph." + glyphIndex;
                root.Add(new XElement(svg + "use", new XAttribute("href", "#" + definition + "-" + glyph.Slot),
                    new XAttribute("transform", $"matrix({Serialize(4.0 / 3, name + ".scaleX")} 0 0 {Serialize(4.0 / 3, name + ".scaleY")} {X(baseline.X + glyph.XSp, name + ".x")} {Y(baseline.Y - glyph.YSp, name + ".y")})"),
                    new XAttribute("fill", "#000"), new XAttribute("stroke", "none")));
            }
        }
        return new(root);
        void Include(double xSp, double ySp)
        {
            var x = xSp * (96 / (72.27 * 65536)); var y = -ySp * (96 / (72.27 * 65536));
            minX = Math.Min(minX, x); minY = Math.Min(minY, y);
            maxX = Math.Max(maxX, x); maxY = Math.Max(maxY, y);
        }
        string Serialize(double value, string name)
        {
            var result = Format(value);
            var actual = double.Parse(result, CultureInfo.InvariantCulture);
            var error = Math.Abs(actual - value);
            checks.Add(new("oracle.serialization." + name, value, actual, "CSS px", error, .000000500001, error <= .000000500001));
            return result;
        }
        string X(int sp, string name) => Serialize(sp * (96 / (72.27 * 65536)), name);
        string Y(int sp, string name) => X(-sp, name);
        static string Format(double value) => (Math.Abs(value) < .0000005 ? 0 : value).ToString("0.######", CultureInfo.InvariantCulture);
        static string Inherited(XElement element, string name, string fallback) => element.AncestorsAndSelf().Select(e => e.Attribute(name)?.Value).FirstOrDefault(v => v is not null) ?? fallback;
    }

    private static List<NumericCheck> PublicNodeChecks(GraphicsScene scene, NodeMetrics metrics, string source)
    {
        var checks = new List<NumericCheck>();
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var query = NodeFontMetrics.Resolve(TextFont.Default, budget, new(source, 0, 0));
        Integer("nodeCount", metrics.Nodes.Length, scene.Nodes.Count);
        for (var index = 0; index < Math.Min(scene.Nodes.Count, metrics.Nodes.Length); index++)
        {
            var expected = metrics.Nodes[index]; var actual = scene.Nodes[index]; var prefix = expected.Id + ".";
            Equal(prefix + "name", expected.Id, actual.Name);
            Integer(prefix + "width", expected.Values["width"], actual.Layout.Text.WidthSp);
            Integer(prefix + "height", expected.Values["height"], actual.Layout.Text.HeightSp);
            Integer(prefix + "depth", expected.Values["depth"], actual.Layout.Text.DepthSp);
            var dimensions = actual.Layout.Dimensions;
            var font = NodeFontMetrics.Resolve(actual.NodeFont, budget, actual.Source);
            Integer(prefix + "quad", expected.Values["quad"], font.QuadSp);
            Integer(prefix + "xheight", expected.Values["xheight"], font.XHeightSp);
            Integer(prefix + "innerx", expected.Values["innerx"], dimensions.InnerXSp);
            Integer(prefix + "innery", expected.Values["innery"], dimensions.InnerYSp);
            Integer(prefix + "outerx", expected.Values["outerx"], dimensions.OuterXSp);
            Integer(prefix + "outery", expected.Values["outery"], dimensions.OuterYSp);
            Integer(prefix + "minimumwidth", expected.Values["minimumwidth"], dimensions.MinimumWidthSp);
            Integer(prefix + "minimumheight", expected.Values["minimumheight"], dimensions.MinimumHeightSp);
            var background = scene.Paths.Single(p => p.Source == actual.Source);
            Physical(prefix + "linewidth", expected.Values["linewidth"], background.Paint.Width);
            var corners = new[] { expected.BackgroundSouthWest, new NodePoint(expected.BackgroundNorthEast.X, expected.BackgroundSouthWest.Y),
                expected.BackgroundNorthEast, new NodePoint(expected.BackgroundSouthWest.X, expected.BackgroundNorthEast.Y), expected.BackgroundSouthWest };
            Integer(prefix + "backgroundSegments", corners.Length, background.Path.Segments.Count);
            for (var cornerIndex = 0; cornerIndex < Math.Min(corners.Length, background.Path.Segments.Count); cornerIndex++)
            {
                Physical(prefix + "background." + cornerIndex + ".x", corners[cornerIndex].X, background.Path.Segments[cornerIndex].End.X);
                Physical(prefix + "background." + cornerIndex + ".y", corners[cornerIndex].Y, background.Path.Segments[cornerIndex].End.Y);
            }
            foreach (var anchor in expected.Anchors)
            {
                var point = actual.Transform.Apply(actual.Layout.Anchor(anchor.Key, query, budget, actual.Source).Bp);
                Integer(prefix + "anchor." + anchor.Key + ".x", anchor.Value.X, Sp(point.X));
                Integer(prefix + "anchor." + anchor.Key + ".y", anchor.Value.Y, Sp(point.Y));
                Physical(prefix + "anchorPhysical." + anchor.Key + ".x", anchor.Value.X, point.X);
                Physical(prefix + "anchorPhysical." + anchor.Key + ".y", anchor.Value.Y, point.Y);
            }
            var glyphs = actual.Layout.Text.Glyphs;
            var emitted = scene.Drawables.OfType<PaintedGlyphRun>().Single(run => run.NodeId == index).Glyphs;
            Integer(prefix + "glyphCount", expected.Glyphs.Length, glyphs.Length);
            Integer(prefix + "emittedGlyphCount", expected.Glyphs.Length, emitted.Length);
            for (var glyphIndex = 0; glyphIndex < Math.Min(glyphs.Length, expected.Glyphs.Length); glyphIndex++)
            {
                var e = expected.Glyphs[glyphIndex]; var a = glyphs[glyphIndex]; var name = prefix + "glyph." + glyphIndex;
                Equal(name + ".font", e.Font, a.FontId); Integer(name + ".slot", e.Slot, a.Slot);
                Integer(name + ".x", e.XSp, a.XSp); Integer(name + ".y", e.YSp, a.YSp);
                if (glyphIndex < emitted.Length)
                {
                    var placement = emitted[glyphIndex];
                    Physical(name + ".globalX", expected.Anchors["text"].X + e.XSp, placement.Transform.E);
                    Physical(name + ".globalY", expected.Anchors["text"].Y - e.YSp, placement.Transform.F);
                }
            }
        }
        return checks;
        void Integer(string name, int e, int a) => checks.Add(new(name, e, a, "sp or count", Math.Abs((long)e - a), 0, e == a));
        void Equal(string name, string e, string a) => checks.Add(new(name, e, a, "identity", null, 0, e == a));
        void Physical(string name, int e, double a)
        {
            var expected = e * (72 / (72.27 * 65536));
            var error = Math.Abs(expected - a);
            checks.Add(new(name, expected, a, "bp; native integer sp converted exactly", error, 1e-9, error <= 1e-9));
        }
        static int Sp(double bp) => (int)Math.Round(bp * (72.27 * 65536 / 72), MidpointRounding.AwayFromZero);
    }

    private static object NodeScene(GraphicsScene scene, TikzSuccess success)
    {
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var query = NodeFontMetrics.Resolve(TextFont.Default, budget, new("", 0, 0));
        var glyphs = scene.Drawables.OfType<PaintedGlyphRun>().SelectMany(run => run.Glyphs.Select(g => (Run: run, Glyph: g))).ToArray();
        var pathTrace = scene.Paths.Select((p, index) => (object)new { semanticId = "path-" + index, svgElementId = "candidate-p" + index,
            source = p.Source.Location, geometryBounds = p.Path.Bounds.Pixels, inkBounds = p.InkBounds.Pixels,
            p.Paint, p.Clips, segmentsBp = p.Path.Segments });
        var glyphTrace = glyphs.Select((entry, index) => (object)new { semanticId = "glyph-" + index, svgElementId = "candidate-g" + index,
            source = entry.Glyph.Placement.Source.Location, geometryBounds = entry.Glyph.InkBounds.Pixels, inkBounds = entry.Glyph.InkBounds.Pixels });
        return new { schemaVersion = 1, units = "CSS pixels; y down; measured node layout in sp", success.PictureBounds, success.InkBounds,
            paths = pathTrace.Concat(glyphTrace), nodes = scene.Nodes.Select((n, index) => new { semanticId = "node-" + index, n.Name,
                source = n.Source.Location, text = new { n.Layout.Text.WidthSp, n.Layout.Text.HeightSp, n.Layout.Text.DepthSp, n.Layout.Text.Readable, n.Layout.Text.Lines },
                n.Layout.Dimensions, n.Transform, n.Font, n.NodeFont,
                anchorsBp = NodeAnchorNames.ToDictionary(name => name, name => n.Transform.Apply(n.Layout.Anchor(name, query, budget, n.Source).Bp)),
                backgroundSouthWestBp = n.Transform.Apply(n.Layout.BackgroundSouthWest.Bp),
                backgroundNorthEastBp = n.Transform.Apply(n.Layout.BackgroundNorthEast.Bp) }),
            paintOrder = scene.Drawables.Select((d, index) => new { index, kind = d is PaintedPath ? "path" : "glyph-run",
                svgElementId = d is PaintedPath p ? "candidate-p" + scene.Paths.IndexOf(p) : "candidate-n" + ((PaintedGlyphRun)d).NodeId,
                source = d.Source.Location, d.Clips }),
            clips = scene.Clips.Select((c, index) => new { svgElementId = "candidate-c" + index, c.FillRule, segmentsBp = c.Path.Segments }),
            glyphs = glyphs.Select((entry, index) => new { svgElementId = "candidate-g" + index,
                    entry.Glyph.Placement.FontId, entry.Glyph.Placement.Slot, entry.Glyph.Placement.XSp, entry.Glyph.Placement.YSp,
                    entry.Glyph.Transform, inkBounds = entry.Glyph.InkBounds.Pixels, entry.Run.NodeId, entry.Run.Color, entry.Run.Opacity }) };
    }
}

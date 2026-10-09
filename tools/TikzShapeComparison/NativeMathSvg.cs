using System.Globalization;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;

namespace TikzShapeComparison;

// Bind the fixed original driver SVG to native events, before deriving images.
// Outline geometry is checked separately against the native font atlases.
internal static class NativeMathSvg
{
    private const double BpPerSp = 72 / (72.27 * 65536);
    private const double DriverPrecisionBp = .00000051;
    private const string BridgePattern = @"^scale\(-1\.00375,1\.00375\)translate\(([-\d.]+),([-\d.]+)\)scale\(-1,-1\)$";
    internal sealed record Quantity(string Name, double NativeBp, double SvgBp, double ErrorBp);
    internal sealed record Mark(string Node, string Kind, int Index, string? Font, int? Slot, string? Definition,
        double XSp, int YSp, int? WidthSp, int? HeightSp);
    internal sealed record Evidence(XDocument Document, Mark[] Marks, Quantity[] Checks, Dictionary<string, string> SvgFaces);

    internal static Evidence Read(string text, NativeMathLabelTrace.Node[] nodes)
    {
        using var reader = XmlReader.Create(new StringReader(text), new XmlReaderSettings {
            DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = 2_000_000 });
        var document = XDocument.Load(reader);
        XNamespace ns = "http://www.w3.org/2000/svg";
        if (document.Root?.Name != ns + "svg") throw Invalid("Unexpected root.");
        var elements = document.Root.DescendantsAndSelf().ToArray();
        if (elements.Any(e => e.Name.Namespace != ns || e.Name.LocalName is not ("svg" or "defs" or "g" or "path" or "use" or "rect")
            || e.Attributes().Any(a => a.Name.LocalName.StartsWith("on", StringComparison.Ordinal) || a.Name.LocalName == "style"
                || a.Name.LocalName == "href" && !Regex.IsMatch(a.Value, @"^#g\d+-\d+$"))))
            throw Invalid("Unexpected fixed native SVG vocabulary.");
        var ids = elements.Where(e => e.Attribute("id") is not null).ToArray();
        if (ids.Select(e => e.Attribute("id")!.Value).Distinct(StringComparer.Ordinal).Count() != ids.Length) throw Invalid("Repeated SVG identity.");
        var definitions = document.Root.Elements(ns + "defs").Single().Elements()
            .ToDictionary(e => e.Attribute("id")?.Value ?? throw Invalid("Unnamed definition."), StringComparer.Ordinal);
        var bridges = elements.Where(e => e.Name == ns + "g" && Regex.IsMatch(e.Attribute("transform")?.Value ?? "", BridgePattern)).ToArray();
        if (bridges.Length != nodes.Length) throw Invalid("Native label-origin coverage differs.");
        var seen = new HashSet<XElement>(); var marks = new List<Mark>(); var checks = new List<Quantity>();
        var faces = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var i = 0; i < nodes.Length; i++)
        {
            var node = nodes[i]; var bridge = Regex.Match(bridges[i].Attribute("transform")!.Value, BridgePattern);
            Physical(bridge.Groups[1].Value, node.DriverOriginXSp, node.Id + ".origin.x");
            Physical(bridge.Groups[2].Value, node.OriginYSp, node.Id + ".origin.y");
            var paint = bridges[i].Descendants().Where(e => e.Name == ns + "use" || e.Name == ns + "rect").ToArray();
            if (paint.Length != node.PaintOrder.Length) throw Invalid("Native glyph/rule coverage differs for " + node.Id);
            for (var j = 0; j < paint.Length; j++)
            {
                var e = paint[j]; seen.Add(e);
                if (Inherited(e, "fill", "#000") is not ("black" or "#000") || Inherited(e, "stroke", "none") != "none"
                    || e.AncestorsAndSelf().Attributes().Any(a => a.Name.LocalName is "clip-path" or "mask" or "filter"
                        || a.Name.LocalName is "opacity" or "fill-opacity" && a.Value != "1"))
                    throw Invalid("Unexpected native label paint.");
                if (e.Attribute("transform") is not null) throw Invalid("Unexpected painted glyph/rule transform.");
                var prefix = node.Id + ".paint." + j;
                var index = node.PaintOrder[j];
                if (index >= 0)
                {
                    if (e.Name != ns + "use") throw Invalid("Native glyph/rule paint order differs.");
                    var g = node.Glyphs[index]; var href = e.Attributes().SingleOrDefault(a => a.Name.LocalName == "href")?.Value ?? "";
                    var identity = Regex.Match(href, @"^#(g\d+)-(\d+)$");
                    if (!identity.Success || Integer(identity.Groups[2].Value) != g.Slot || !definitions.ContainsKey(href[1..])) throw Invalid("Native glyph identity differs.");
                    var face = identity.Groups[1].Value;
                    if (faces.TryGetValue(face, out var previous) && previous != g.Font) throw Invalid("Inconsistent native SVG face.");
                    faces[face] = g.Font;
                    ValidateDefinition(href[1..], g.Slot, new HashSet<string>(StringComparer.Ordinal), 0);
                    Physical(e.Attribute("x")?.Value ?? "", g.DriverXSp, prefix + ".x");
                    Physical(e.Attribute("y")?.Value ?? "", g.AbsoluteYSp, prefix + ".y");
                    marks.Add(new(node.Id, "glyph", index, g.Font, g.Slot, href[1..], g.DriverXSp, g.AbsoluteYSp, null, null));
                }
                else
                {
                    if (e.Name != ns + "rect") throw Invalid("Native glyph/rule paint order differs.");
                    var r = node.Rules[-index - 1];
                    Physical(e.Attribute("x")?.Value ?? "", r.DriverXSp, prefix + ".x");
                    Physical(e.Attribute("y")?.Value ?? "", r.AbsoluteYSp, prefix + ".y");
                    Physical(e.Attribute("width")?.Value ?? "", r.WidthSp, prefix + ".width");
                    Physical(e.Attribute("height")?.Value ?? "", r.HeightSp, prefix + ".height");
                    marks.Add(new(node.Id, "rule", -index - 1, null, null, null, r.DriverXSp, r.AbsoluteYSp, r.WidthSp, r.HeightSp));
                }
            }
        }
        if (elements.Any(e => (e.Name == ns + "use" || e.Name == ns + "rect") && !e.Ancestors(ns + "defs").Any() && !seen.Contains(e)))
            throw Invalid("Painted glyph/rule outside native labels.");
        return new(document, marks.ToArray(), checks.ToArray(), faces);

        void Physical(string value, double sp, string quantity)
        {
            var expected = sp * BpPerSp;
            if (!double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var actual) || !double.IsFinite(actual)
                || Math.Abs(actual - expected) > DriverPrecisionBp) throw Invalid("Original driver quantity differs: " + quantity);
            checks.Add(new(quantity, expected, actual, Math.Abs(actual - expected)));
        }
        void ValidateDefinition(string id, int slot, HashSet<string> chain, int depth)
        {
            if (depth > 4 || !chain.Add(id) || !definitions.TryGetValue(id, out var e)) throw Invalid("Missing or cyclic glyph alias.");
            if (e.Name == ns + "path")
            {
                if (string.IsNullOrWhiteSpace(e.Attribute("d")?.Value) || e.Attributes().Any(a => a.Name.LocalName is not ("id" or "d")))
                    throw Invalid("Empty or repainted glyph outline.");
                return;
            }
            var href = e.Attributes().SingleOrDefault(a => a.Name.LocalName == "href")?.Value ?? "";
            var identity = Regex.Match(href, @"^#g\d+-(\d+)$");
            var scale = Regex.Match(e.Attribute("transform")?.Value ?? "", @"^scale\(([\d.]+)\)$");
            if (e.Name != ns + "use" || e.Attributes().Any(a => a.Name.LocalName is not ("id" or "href" or "transform"))
                || !identity.Success || Integer(identity.Groups[1].Value) != slot || !scale.Success
                || !double.TryParse(scale.Groups[1].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var factor) || factor is <= 0 or > 2)
                throw Invalid("Unexpected scaled native glyph alias.");
            ValidateDefinition(href[1..], slot, chain, depth + 1);
        }
    }
    private static string Inherited(XElement e, string key, string fallback) => e.AncestorsAndSelf().Select(p => p.Attribute(key)?.Value).FirstOrDefault(v => v is not null) ?? fallback;
    private static int Integer(string text) => int.Parse(text, CultureInfo.InvariantCulture);
    private static InvalidDataException Invalid(string message) => new("Native math SVG: " + message);
}

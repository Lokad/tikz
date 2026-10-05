using System.Buffers.Binary;
using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace TikzShapeComparison;

// This reader uses only retained native artifacts and the declared font profile.
// It has no dependency on the converter, its font resources, or its arithmetic.
internal static class NativeGlyphTrace
{
    internal sealed record Glyph(string Font, int Slot, int XSp, int YSp, int AbsoluteXSp, int AbsoluteYSp, double DriverXSp, double DriverYSp);
    internal sealed record Node(string Id, int OriginXSp, int OriginYSp, double DriverOriginXSp, double DriverOriginYSp, Glyph[] Glyphs);
    internal sealed record Evidence(Node[] Nodes, Dictionary<string, string> SvgFontDefinitions);
    private sealed record Face(string Id, string Tfm, double SizePt);
    private const double BpPerSp = 72 / (72.27 * 65536);
    private const double DriverPrecisionBp = 0.00000051;

    internal static Evidence Read(string trace, string fontProfile, string[] ids, string svg, IReadOnlyDictionary<string, byte[]> tfms)
    {
        if (trace.Length > 4_000_000 || ids.Length is 0 or > 1024 || ids.Distinct(StringComparer.Ordinal).Count() != ids.Length
            || !trace.Contains("numerator/denominator=25400000/473628672", StringComparison.Ordinal)
            || !trace.Contains("magnification=1000;", StringComparison.Ordinal)
            || !Regex.IsMatch(trace, @"totalpages=1(?:\s|$)")
            || Regex.Matches(trace, @"(?m)^\d+: beginning of page ").Count != 1)
            throw Invalid("Unexpected trace size, units, page count, or node identities.");
        using var profile = JsonDocument.Parse(fontProfile);
        if (profile.RootElement.GetProperty("schemaVersion").GetInt32() != 1 || profile.RootElement.GetProperty("id").GetString() != "latin-modern-ec-10-12-v1") throw Invalid("Unexpected font profile.");
        var faces = profile.RootElement.GetProperty("fonts").EnumerateArray().Select(f => new Face(
            f.GetProperty("id").GetString()!, f.GetProperty("tfm").GetString()!, f.GetProperty("sizePt").GetDouble())).ToArray();
        var fonts = new Dictionary<int, string>();
        var widths = new Dictionary<string, double[]>(StringComparer.Ordinal);
        foreach (Match m in Regex.Matches(trace, @"(?m)^Font (\d+): ([A-Za-z0-9-]+)---loaded at size (\d+) DVI units"))
        {
            var face = faces.SingleOrDefault(f => Path.GetFileNameWithoutExtension(f.Tfm) == m.Groups[2].Value && f.SizePt * 65536 == Integer(m.Groups[3].Value))
                ?? throw Invalid("Unpinned native font or size.");
            if (!fonts.TryAdd(Integer(m.Groups[1].Value), face.Id)) throw Invalid("Repeated native font definition.");
            if (!widths.ContainsKey(face.Id))
            {
                var file = Path.GetFileName(face.Tfm);
                var hash = profile.RootElement.GetProperty("inputs").EnumerateArray().Single(p => p.GetProperty("name").GetString() == file).GetProperty("sha256").GetString();
                if (!tfms.TryGetValue(file, out var bytes) || Convert.ToHexStringLower(SHA256.HashData(bytes)) != hash) throw Invalid("Missing or changed original TFM input: " + file);
                widths.Add(face.Id, Widths(bytes, Integer(m.Groups[3].Value)));
            }
        }
        if (fonts.Count == 0) throw Invalid("Missing native font definitions.");
        var lists = ids.ToDictionary(id => id, _ => new List<Glyph>(), StringComparer.Ordinal);
        var origins = new Dictionary<string, (int X, int Y, double DriverX, double DriverY)>(StringComparer.Ordinal);
        var order = new List<string>();
        string? active = null, font = null;
        var h = 0; var v = 0; var level = -1; var originLevel = -1; var popped = false;
        double driverH = 0, driverV = 0;
        var stack = new Stack<(int H, int V, double DriverH, double DriverV)>();
        foreach (var line in trace.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n'))
        {
            if (Regex.IsMatch(line, @"^\d+: push(?:\s|$)")) stack.Push((h, v, driverH, driverV));
            if (Regex.IsMatch(line, @"^\d+: pop(?:\s|$)"))
            {
                if (!stack.TryPop(out var saved)) throw Invalid("Unbalanced native state stack.");
                (h, v, driverH, driverV) = saved; popped = true;
            }
            var state = Regex.Match(line, @"^level (\d+):\(h=(-?\d+),v=(-?\d+),");
            if (state.Success)
            {
                level = Integer(state.Groups[1].Value);
                if (h != Integer(state.Groups[2].Value) || v != Integer(state.Groups[3].Value)) throw Invalid("Native state disagrees with recorded movements.");
                if (popped && level <= originLevel) active = null;
                popped = false;
            }
            var selection = Regex.Match(line, @"^\d+: (?:fntnum(\d+)|fnt[1-4] (\d+)) current font is ");
            if (selection.Success && !fonts.TryGetValue(Integer(selection.Groups[1].Success ? selection.Groups[1].Value : selection.Groups[2].Value), out font))
                throw Invalid("Selection of an undeclared native font.");
            var marker = Regex.Match(line, @"^\d+: xxx 'lokad-node-origin ([a-z][a-z0-9-]*)'");
            if (marker.Success)
            {
                active = marker.Groups[1].Value;
                if (level < 0 || !lists.ContainsKey(active) || !origins.TryAdd(active, (h, v, driverH, driverV))) throw Invalid("Unexpected or repeated node origin.");
                originLevel = level; order.Add(active);
            }
            var character = Regex.Match(line, @"^\d+: (?:setchar|set[1-4] )(\d+) h:=(-?\d+)[+-]\d+=(-?\d+),");
            if (character.Success)
            {
                if (active is null || font is null) throw Invalid("Glyph outside a marked node or without a font.");
                var slot = Integer(character.Groups[1].Value); var x = Integer(character.Groups[2].Value);
                if (slot is < 0 or > 255) throw Invalid("Glyph outside EC encoding.");
                var origin = origins[active];
                if (x != h) throw Invalid("Glyph's native position disagrees with preceding movements.");
                lists[active].Add(new(font, slot, checked(x - origin.X), checked(v - origin.Y), x, v, driverH, driverV));
                // The SVG driver advances through unrounded TFM fractions.
                // Native DVItype advances remain authoritative for TeX layout.
                driverH += widths[font][slot];
            }
            else if (Regex.IsMatch(line, @"^\d+: (?:setchar|set[1-4] |put[1-4] )")) throw Invalid("Unsupported native character record.");
            var horizontal = Regex.Match(line, @" h:=(-?\d+)([+-])(\d+)=(-?\d+),");
            if (horizontal.Success)
            {
                var delta = Movement(horizontal, h); h = Integer(horizontal.Groups[4].Value);
                if (!character.Success) driverH += delta;
            }
            var vertical = Regex.Match(line, @" v:=(-?\d+)([+-])(\d+)=(-?\d+),");
            if (vertical.Success) { driverV += Movement(vertical, v); v = Integer(vertical.Groups[4].Value); }
        }
        if (stack.Count != 0 || !order.SequenceEqual(ids)) throw Invalid("Unbalanced native stack or node-origin coverage/order differs from the manifest.");
        var nodes = ids.Select(id => new Node(id, origins[id].X, origins[id].Y, origins[id].DriverX, origins[id].DriverY, lists[id].ToArray())).ToArray();
        var document = XDocument.Parse(svg);
        if (document.Root?.Name != XName.Get("svg", "http://www.w3.org/2000/svg") || document.DocumentType is not null)
            throw Invalid("Invalid native SVG.");
        const string bridgePattern = @"^scale\(-1\.00375,1\.00375\)translate\(([-\d.]+),([-\d.]+)\)scale\(-1,-1\)$";
        var bridges = document.Descendants().Where(e => e.Name.LocalName == "g" && Regex.IsMatch(e.Attribute("transform")?.Value ?? "", bridgePattern)).ToArray();
        if (bridges.Length != nodes.Length) throw Invalid("SVG label-origin coverage differs from the native trace.");
        var definitions = new Dictionary<string, string>(StringComparer.Ordinal);
        var seenUses = new HashSet<XElement>();
        for (var i = 0; i < nodes.Length; i++)
        {
            var node = nodes[i]; var bridge = Regex.Match(bridges[i].Attribute("transform")!.Value, bridgePattern);
            Physical(bridge.Groups[1].Value, node.DriverOriginXSp, node.Id + ".origin.x"); Physical(bridge.Groups[2].Value, node.DriverOriginYSp, node.Id + ".origin.y");
            var uses = bridges[i].Descendants().Where(e => e.Name.LocalName == "use").ToArray();
            if (uses.Length != node.Glyphs.Length) throw Invalid("SVG/native glyph counts differ for " + node.Id);
            for (var j = 0; j < uses.Length; j++)
            {
                var use = uses[j]; var glyph = node.Glyphs[j]; seenUses.Add(use);
                var href = use.Attributes().SingleOrDefault(a => a.Name.LocalName == "href")?.Value ?? "";
                var identity = Regex.Match(href, @"^#(g\d+)-(\d+)$");
                if (!identity.Success || Integer(identity.Groups[2].Value) != glyph.Slot || document.Descendants().Count(e => e.Attribute("id")?.Value == href[1..]) != 1)
                    throw Invalid("Missing or mismatched original SVG glyph definition.");
                var prefix = identity.Groups[1].Value;
                if (definitions.TryGetValue(prefix, out var previous) && previous != glyph.Font) throw Invalid("Inconsistent SVG font identity.");
                definitions[prefix] = glyph.Font;
                Physical(use.Attribute("x")?.Value ?? "", glyph.DriverXSp, node.Id + ".glyph." + j + ".x"); Physical(use.Attribute("y")?.Value ?? "", glyph.DriverYSp, node.Id + ".glyph." + j + ".y");
            }
        }
        if (document.Descendants().Count(e => e.Name.LocalName == "use") != seenUses.Count) throw Invalid("SVG glyphs outside marked labels.");
        return new(nodes, definitions);

        static void Physical(string text, double sp, string quantity)
        {
            if (!double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var value) || !double.IsFinite(value)
                || Math.Abs(value - sp * BpPerSp) > DriverPrecisionBp) throw Invalid(FormattableString.Invariant($"Original SVG and DVI coordinates differ for {quantity}: SVG {text}bp, DVI {sp}sp ({sp * BpPerSp:R}bp)."));
        }
    }
    private static long Movement(Match movement, int before)
    {
        var delta = long.Parse(movement.Groups[3].Value, CultureInfo.InvariantCulture) * (movement.Groups[2].Value == "-" ? -1 : 1);
        if (before != Integer(movement.Groups[1].Value) || before + delta != Integer(movement.Groups[4].Value)) throw Invalid("Inconsistent native movement arithmetic.");
        return delta;
    }
    private static double[] Widths(byte[] bytes, int sizeSp)
    {
        if (bytes.Length < 24) throw Invalid("Truncated TFM header.");
        int Half(int offset) => BinaryPrimitives.ReadUInt16BigEndian(bytes.AsSpan(offset, 2));
        var words = Half(0); var header = Half(2); var first = Half(4); var last = Half(6); var count = Half(8);
        if (words * 4 != bytes.Length || header < 2 || first > last || last > 255 || count < 1) throw Invalid("Invalid TFM table header.");
        var characters = 24 + header * 4; var table = characters + (last - first + 1) * 4;
        if (table + count * 4 > bytes.Length) throw Invalid("Truncated TFM width table.");
        var widths = new double[256];
        for (var slot = first; slot <= last; slot++)
        {
            var index = bytes[characters + (slot - first) * 4];
            if (index >= count) throw Invalid("Invalid TFM width index.");
            var fix = BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(table + index * 4, 4));
            widths[slot] = fix * (sizeSp / 1048576.0);
        }
        return widths;
    }
    private static int Integer(string text) => int.Parse(text, CultureInfo.InvariantCulture);
    private static InvalidDataException Invalid(string message) => new("Native shape glyph trace: " + message);
}

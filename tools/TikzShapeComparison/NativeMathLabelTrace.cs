using System.Globalization;
using System.Text.RegularExpressions;

namespace TikzShapeComparison;

// Math labels contain several encodings and real DVI rules. Keep these semantics
// separate from the EC reader; reuse its checked integer movement arithmetic.
// Callers supply pinned native faces and independently measured native widths,
// never converter fonts or layout results. No process or reference regeneration.
internal static class NativeMathLabelTrace
{
    internal sealed record Face(string Id, string NativeName, int SizeSp, IReadOnlyDictionary<int, int> Widths);
    internal sealed record Glyph(string Font, int Slot, int XSp, int YSp);
    internal sealed record Rule(int XSp, int YSp, int WidthSp, int HeightSp);
    internal sealed record Node(string Id, Glyph[] Glyphs, Rule[] Rules, int[] PaintOrder);

    internal static Node[] Read(string trace, Face[] faces, string[] ids)
    {
        if (trace.Length > 4_000_000 || ids.Length is 0 or > 1024 || ids.Distinct(StringComparer.Ordinal).Count() != ids.Length
            || faces.Length is 0 or > 25 || faces.Select(f => (f.NativeName, f.SizeSp)).Distinct().Count() != faces.Length
            || faces.Any(f => f.SizeSp is < 327680 or > 786432 || f.Widths.Count is 0 or > 256 || f.Widths.Keys.Any(s => s is < 0 or > 255))
            || !trace.Contains("numerator/denominator=25400000/473628672", StringComparison.Ordinal)
            || !trace.Contains("magnification=1000;", StringComparison.Ordinal)
            || !Regex.IsMatch(trace, @"totalpages=1(?:\s|$)")
            || Regex.Matches(trace, @"(?m)^\d+: beginning of page ").Count != 1)
            throw Invalid("Unexpected native units, page count, faces or node identities.");
        var definitions = new Dictionary<int, Face>();
        foreach (Match m in Regex.Matches(trace, @"(?m)^Font (\d+): ([A-Za-z0-9-]+)(?: scaled \d+)?---loaded at size (\d+) DVI units"))
        {
            var face = faces.SingleOrDefault(f => f.NativeName == m.Groups[2].Value && f.SizeSp == Integer(m.Groups[3].Value));
            if (face is null || !definitions.TryAdd(Integer(m.Groups[1].Value), face)) throw Invalid("Unpinned or repeated native font definition.");
        }
        if (definitions.Count == 0) throw Invalid("Missing native font definitions.");
        var glyphs = ids.ToDictionary(id => id, _ => new List<Glyph>(), StringComparer.Ordinal);
        var rules = ids.ToDictionary(id => id, _ => new List<Rule>(), StringComparer.Ordinal);
        var paint = ids.ToDictionary(id => id, _ => new List<int>(), StringComparer.Ordinal);
        var origins = new Dictionary<string, (int X, int Y)>(StringComparer.Ordinal);
        var order = new List<string>();
        var stack = new Stack<(int H, int V)>();
        var h = 0; var v = 0; var level = -1; var originLevel = -1; var popped = false;
        string? active = null; Face? font = null;
        foreach (var line in trace.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n'))
        {
            if (Regex.IsMatch(line, @"^\d+: push(?:\s|$)")) stack.Push((h, v));
            if (Regex.IsMatch(line, @"^\d+: pop(?:\s|$)"))
            {
                if (!stack.TryPop(out var saved)) throw Invalid("Unbalanced native stack.");
                (h, v) = saved; popped = true;
            }
            var state = Regex.Match(line, @"^level (\d+):\(h=(-?\d+),v=(-?\d+),");
            if (state.Success)
            {
                level = Integer(state.Groups[1].Value);
                if (h != Integer(state.Groups[2].Value) || v != Integer(state.Groups[3].Value)) throw Invalid("Native state differs from recorded movements.");
                if (popped && level <= originLevel) active = null;
                popped = false;
            }
            var selection = Regex.Match(line, @"^\d+: (?:fntnum(\d+)|fnt[1-4] (\d+)) current font is ");
            if (selection.Success && !definitions.TryGetValue(Integer(selection.Groups[1].Success ? selection.Groups[1].Value : selection.Groups[2].Value), out font))
                throw Invalid("Undeclared native font selection.");
            var marker = Regex.Match(line, @"^\d+: xxx 'lokad-node-origin ([A-Za-z0-9_-]+)'");
            if (marker.Success)
            {
                active = marker.Groups[1].Value;
                if (level < 0 || !glyphs.ContainsKey(active) || !origins.TryAdd(active, (h, v))) throw Invalid("Unexpected or repeated native origin.");
                originLevel = level; order.Add(active);
            }
            var character = Regex.Match(line, @"^\d+: (?:setchar|set[1-4] )(\d+) h:=(-?\d+)[+-]\d+=(-?\d+),");
            if (character.Success)
            {
                if (active is null || font is null) throw Invalid("Glyph outside a native label or without a font.");
                var slot = Integer(character.Groups[1].Value);
                if (!font.Widths.TryGetValue(slot, out var advance) || h != Integer(character.Groups[2].Value)
                    || (long)h + advance != Integer(character.Groups[3].Value)) throw Invalid("Native glyph identity, position or advance differs from independent font measurements.");
                var origin = origins[active];
                paint[active].Add(glyphs[active].Count);
                glyphs[active].Add(new(font.Id, slot, checked(h - origin.X), checked(v - origin.Y)));
            }
            else if (Regex.IsMatch(line, @"^\d+: (?:setchar|set[1-4] |put[1-4] )")) throw Invalid("Unsupported native character record.");
            var rule = Regex.Match(line, @"^\d+: (?:putrule|setrule) height (-?\d+), width (-?\d+)");
            if (rule.Success)
            {
                if (active is null) throw Invalid("Rule outside a native label.");
                var height = Integer(rule.Groups[1].Value); var width = Integer(rule.Groups[2].Value); var origin = origins[active];
                if (height <= 0 || width <= 0) throw Invalid("Nonvisible DVI rule in the native event stream.");
                paint[active].Add(-rules[active].Count - 1);
                rules[active].Add(new(checked(h - origin.X), checked(v - origin.Y - height), width, height));
            }
            else if (Regex.IsMatch(line, @"^\d+: (?:putrule|setrule) ")) throw Invalid("Unsupported native rule record.");
            var horizontal = Regex.Match(line, @" h:=(-?\d+)([+-])(\d+)=(-?\d+),");
            if (horizontal.Success) { NativeGlyphTrace.Movement(horizontal, h); h = Integer(horizontal.Groups[4].Value); }
            var vertical = Regex.Match(line, @" v:=(-?\d+)([+-])(\d+)=(-?\d+),");
            if (vertical.Success) { NativeGlyphTrace.Movement(vertical, v); v = Integer(vertical.Groups[4].Value); }
        }
        if (stack.Count != 0 || !order.SequenceEqual(ids)) throw Invalid("Native stack or origin coverage/order differs.");
        return ids.Select(id => new Node(id, glyphs[id].ToArray(), rules[id].ToArray(), paint[id].ToArray())).ToArray();
    }
    private static int Integer(string value) => int.Parse(value, CultureInfo.InvariantCulture);
    private static InvalidDataException Invalid(string message) => new("Native math label trace: " + message);
}

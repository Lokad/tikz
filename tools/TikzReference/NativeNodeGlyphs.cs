using System.Globalization;
using System.Text.RegularExpressions;

internal static partial class ReferenceTool
{
    // Consume native integer DVItype movements. No candidate font metrics,
    // text layout, or arithmetic for DVI character advances is used here.
    private static Dictionary<string, NativeNodeGlyph[]> NativeNodeGlyphs(string trace, NodeFontProfile profile, NodeManifest manifest)
    {
        if (!trace.Contains("numerator/denominator=25400000/473628672", StringComparison.Ordinal)
            || !trace.Contains("magnification=1000;", StringComparison.Ordinal) || !trace.Contains("totalpages=1", StringComparison.Ordinal))
            throw new InvalidOperationException("Unexpected native node trace units or page count.");
        var fonts = new Dictionary<int, string>();
        foreach (Match match in Regex.Matches(trace, @"(?m)^Font (\d+): ([A-Za-z0-9-]+)---loaded at size (\d+) DVI units"))
        {
            var face = profile.Fonts.SingleOrDefault(font => Path.GetFileNameWithoutExtension(font.Tfm) == match.Groups[2].Value
                && font.SizePt * 65536 == Integer(match.Groups[3].Value))
                ?? throw new InvalidOperationException("Native node trace selected an unpinned font or size.");
            fonts.Add(Integer(match.Groups[1].Value), face.Id);
        }
        var result = manifest.Cases.ToDictionary(c => c.Id, _ => new List<NativeNodeGlyph>(), StringComparer.Ordinal);
        var marked = new HashSet<string>(StringComparer.Ordinal);
        string? node = null, fontId = null;
        int h = 0, v = 0, originX = 0, originY = 0;
        foreach (var line in trace.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n'))
        {
            var state = Regex.Match(line, @"^level \d+:\(h=(-?\d+),v=(-?\d+),");
            if (state.Success) { h = Integer(state.Groups[1].Value); v = Integer(state.Groups[2].Value); }
            var selection = Regex.Match(line, @"^\d+: (?:fntnum(\d+)|fnt[1-4] (\d+)) current font is ");
            if (selection.Success) fontId = fonts[Integer(selection.Groups[1].Success ? selection.Groups[1].Value : selection.Groups[2].Value)];
            var marker = Regex.Match(line, @"xxx 'lokad-node-origin ([a-z][a-z0-9-]*)'");
            if (marker.Success)
            {
                node = marker.Groups[1].Value;
                if (!result.ContainsKey(node) || !marked.Add(node)) throw new InvalidOperationException("Unexpected or repeated native node baseline marker.");
                originX = h; originY = v;
            }
            var character = Regex.Match(line, @"^\d+: (?:setchar|set[1-4] )(\d+) h:=(-?\d+)[+-]\d+=(-?\d+),");
            if (character.Success)
            {
                if (node is null || fontId is null) throw new InvalidOperationException("Native glyph lacks a node origin or font.");
                var slot = Integer(character.Groups[1].Value);
                if (slot is < 0 or > 255) throw new InvalidOperationException("Native node glyph lies outside EC encoding.");
                result[node].Add(new(fontId, slot, checked(Integer(character.Groups[2].Value) - originX), checked(v - originY)));
                h = Integer(character.Groups[3].Value);
            }
            var horizontal = Regex.Match(line, @" h:=-?\d+[+-]\d+=(-?\d+),");
            if (horizontal.Success) h = Integer(horizontal.Groups[1].Value);
            var vertical = Regex.Match(line, @" v:=-?\d+[+-]\d+=(-?\d+),");
            if (vertical.Success) v = Integer(vertical.Groups[1].Value);
        }
        if (marked.Count != result.Count) throw new InvalidOperationException("Missing native node baseline markers.");
        return result.ToDictionary(pair => pair.Key, pair => pair.Value.ToArray(), StringComparer.Ordinal);
        static int Integer(string value) => int.Parse(value, CultureInfo.InvariantCulture);
    }
}

using System.Text.RegularExpressions;

internal static partial class FontGenerator
{
    private sealed record NativePositionTrace(int XSp, int YSp, NativeTextGlyph[] Glyphs);

    // Interpret the pinned DVItype diagnostic trace, not DVI font arithmetic.
    // Its native integer movements and character advances are independent of
    // both the candidate layout and dvisvgm's fractional TFM advances.
    private static NativePositionTrace NativeTextPositions(string trace, FontManifest profile)
    {
        if (!trace.Contains("numerator/denominator=25400000/473628672", StringComparison.Ordinal)
            || !trace.Contains("magnification=1000;", StringComparison.Ordinal)
            || !trace.Contains("totalpages=1", StringComparison.Ordinal))
            throw new InvalidOperationException("Native text trace has unexpected physical units or page count.");
        var fonts = new Dictionary<int, string>();
        foreach (Match match in Regex.Matches(trace, @"(?m)^Font (\d+): ([A-Za-z0-9-]+)---loaded at size (\d+) DVI units"))
        {
            var face = profile.Fonts.SingleOrDefault(f => Path.GetFileNameWithoutExtension(f.Tfm) == match.Groups[2].Value
                && f.SizePt * 65536 == int.Parse(match.Groups[3].Value, Invariant))
                ?? throw new InvalidOperationException("Native trace selected an unpinned font or size.");
            fonts.Add(int.Parse(match.Groups[1].Value, Invariant), face.Id);
        }
        int h = 0, v = 0;
        string? font = null;
        (int X, int Y)? origin = null;
        var glyphs = new List<NativeTextGlyph>();
        foreach (var line in trace.Split('\n'))
        {
            var state = Regex.Match(line, @"^level \d+:\(h=(-?\d+),v=(-?\d+),");
            if (state.Success) { h = int.Parse(state.Groups[1].Value, Invariant); v = int.Parse(state.Groups[2].Value, Invariant); }
            var selection = Regex.Match(line, @"^\d+: (?:fntnum(\d+)|fnt[1-4] (\d+)) current font is ");
            if (selection.Success) font = fonts[int.Parse(selection.Groups[1].Success ? selection.Groups[1].Value : selection.Groups[2].Value, Invariant)];
            if (line.Contains("xxx 'dvisvgm:raw <g id=\"oracle-origin\"", StringComparison.Ordinal))
            {
                if (origin.HasValue || glyphs.Count != 0) throw new InvalidOperationException("Ambiguous native text baseline origin.");
                origin = (h, v);
            }
            var character = Regex.Match(line, @"^\d+: (?:setchar|set[1-4] )(\d+) h:=(-?\d+)[+-]\d+=(-?\d+),");
            if (character.Success)
            {
                if (font is null || !origin.HasValue) throw new InvalidOperationException("Native glyph lacks a font or baseline origin.");
                var slot = int.Parse(character.Groups[1].Value, Invariant);
                if (slot is < 0 or > 255) throw new InvalidOperationException("Native glyph is outside the EC encoding.");
                glyphs.Add(new(font, slot, checked(int.Parse(character.Groups[2].Value, Invariant) - origin.Value.X), checked(v - origin.Value.Y)));
                h = int.Parse(character.Groups[3].Value, Invariant);
            }
            var horizontal = Regex.Match(line, @" h:=-?\d+[+-]\d+=(-?\d+),");
            if (horizontal.Success) h = int.Parse(horizontal.Groups[1].Value, Invariant);
            var vertical = Regex.Match(line, @" v:=-?\d+[+-]\d+=(-?\d+),");
            if (vertical.Success) v = int.Parse(vertical.Groups[1].Value, Invariant);
        }
        if (!origin.HasValue) throw new InvalidOperationException("Missing native text baseline marker.");
        return new(origin.Value.X, origin.Value.Y, glyphs.ToArray());
    }
}

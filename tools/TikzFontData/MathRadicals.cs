using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

internal static partial class FontGenerator
{
    // Raw native math events deliberately do not use the EC-only glyph policy.
    private static async Task<object> MathRadicals(string root, string run, Dictionary<string, string> inputs, bool generate)
    {
        var declarations = new List<(string Id, int Size, string Style, int Height)>();
        foreach (var size in new[] { 10, 12 })
            foreach (var style in new[] { "text", "script", "scriptscript" })
                foreach (var height in new[] { 0, 4, 6, 8, 10, 12, 18, 24, 32, 48, 80 })
                    declarations.Add(($"root-{size}-{style}-{height}", size, style, height));
        var template = File.ReadAllText(Path.Combine(root, "tools/TikzFontData/math-radicals.tex")).Replace("\r\n", "\n", StringComparison.Ordinal);
        var blocks = new StringBuilder();
        for (var i = 0; i < declarations.Count; i++)
        {
            var c = declarations[i];
            blocks.Append(Invariant, $"\\setbox\\mathrootbox=\\hbox{{\\fontsize{{{c.Size}}}{{14}}\\selectfont\\special{{lokad-math-radical {c.Id}}}${'\\'}{c.Style}style\\sqrt{{\\vphantom{{\\rule{{1pt}}{{{c.Height}pt}}}}x}}$\\special{{lokad-math-radical end}}}}\n");
            blocks.Append(Invariant, $"\\typeout{{LOKAD-RADICAL {i};\\number\\wd\\mathrootbox;\\number\\ht\\mathrootbox;\\number\\dp\\mathrootbox}}\n\\box\\mathrootbox\\kern8pt\n");
        }
        var source = template.Replace("@@CASES@@", blocks.ToString(), StringComparison.Ordinal);
        var work = Path.Combine(run, "radicals"); Directory.CreateDirectory(work);
        File.WriteAllText(Path.Combine(work, "radicals.tex"), source, new UTF8Encoding(false));
        File.WriteAllText(Path.Combine(work, "latex-process.log"), await RunProcess("latex",
            ["-disable-write18", "-disable-installer", "-interaction=nonstopmode", "-halt-on-error", "-recorder", "radicals.tex"], work));
        var trace = (await RunProcess("dvitype", ["-disable-installer", "-out-mode=4", "radicals.dvi"], work)).Replace("\r\n", "\n", StringComparison.Ordinal);
        trace = Regex.Replace(trace, @"(?m)^' TeX output [^\n]*\n", "");
        File.WriteAllText(Path.Combine(work, "native-positions.log"), trace, new UTF8Encoding(false));
        File.WriteAllText(Path.Combine(work, "dvisvgm-process.log"), await RunProcess("dvisvgm", ["--no-fonts", "--exact-bbox", "--fontmap=" + inputs["lm.map"], "--cache=none", "--output=radicals.svg", "radicals.dvi"], work));
        var fonts = Regex.Matches(trace, @"(?m)^Font (\d+): ([A-Za-z0-9-]+)(?: scaled \d+)?---loaded at size (\d+) DVI units")
            .ToDictionary(m => int.Parse(m.Groups[1].Value, Invariant), m => new { name = m.Groups[2].Value, sizeSp = int.Parse(m.Groups[3].Value, Invariant) });
        var measured = Records(File.ReadAllText(Path.Combine(work, "radicals.log")), "RADICAL", 4);
        if (measured.Length != declarations.Count) throw new InvalidOperationException("Incomplete native radical boxes.");
        var cases = new List<object>(); var active = -1; var currentFont = -1;
        var glyphs = new List<RootGlyph>(); var rules = new List<RootRule>();
        foreach (var line in trace.Split('\n'))
        {
            var marker = Regex.Match(line, @"xxx 'lokad-math-radical ([a-z0-9-]+)'");
            if (marker.Success)
            {
                var id = marker.Groups[1].Value;
                if (id != "end")
                {
                    if (active != -1 || cases.Count >= declarations.Count || id != declarations[cases.Count].Id)
                        throw new InvalidOperationException("Changed native radical origin order.");
                    active = cases.Count; glyphs.Clear(); rules.Clear(); continue;
                }
                if (active < 0 || measured[active][0] != active || glyphs.Count == 0 || rules.Count != 1)
                    throw new InvalidOperationException("Incomplete native radical glyph/rule observations.");
                var c = declarations[active]; var box = measured[active];
                cases.Add(new { id = c.Id, surroundingSizePt = c.Size, style = c.Style, phantomHeightPt = c.Height,
                    widthSp = box[1], heightSp = box[2], depthSp = box[3], glyphs = glyphs.ToArray(), rules = rules.ToArray() });
                active = -1; continue;
            }
            var f = Regex.Match(line, @": (?:fntnum(\d+)|fnt[1-4] (\d+)) current font is ");
            if (f.Success) { currentFont = int.Parse(f.Groups[1].Success ? f.Groups[1].Value : f.Groups[2].Value, Invariant); continue; }
            if (active < 0) continue;
            var g = Regex.Match(line, @": (?:setchar(\d+)|set[1-4] (\d+)) ");
            if (g.Success)
            {
                if (!fonts.TryGetValue(currentFont, out var font)) throw new InvalidOperationException("Unknown native radical font.");
                glyphs.Add(new(font.name, font.sizeSp, int.Parse(g.Groups[1].Success ? g.Groups[1].Value : g.Groups[2].Value, Invariant)));
            }
            var rule = Regex.Match(line, @": (?:putrule|setrule) height (-?\d+), width (-?\d+)");
            if (rule.Success) rules.Add(new(int.Parse(rule.Groups[1].Value, Invariant), int.Parse(rule.Groups[2].Value, Invariant)));
        }
        if (active != -1 || cases.Count != declarations.Count) throw new InvalidOperationException("Incomplete native radical cases.");
        var metrics = JsonSerializer.Serialize(new { schemaVersion = 1, sourceSha256 = Hash(Encoding.UTF8.GetBytes(source)), fonts, cases }, Json) + "\n";
        foreach (var (name, text) in new[] { ("radicals.json", metrics), ("native-radicals.log", trace) })
        {
            var target = Path.Combine(root, "tests/Reference/MathFonts", name);
            if (generate) File.WriteAllText(target, text, new UTF8Encoding(false));
            else if (File.ReadAllText(target) != text) throw new InvalidOperationException("Changed native radical reference: " + name);
        }
        return new { cases = declarations.Count, templateSha256 = Hash(Encoding.UTF8.GetBytes(template)),
            sourceSha256 = Hash(Encoding.UTF8.GetBytes(source)), metricsSha256 = Hash(Encoding.UTF8.GetBytes(metrics)), traceSha256 = Hash(Encoding.UTF8.GetBytes(trace)) };
    }
    private sealed record RootGlyph(string Font, int SizeSp, int Slot);
    private sealed record RootRule(int HeightSp, int WidthSp);
}

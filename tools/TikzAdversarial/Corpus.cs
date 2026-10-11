using System.Text;

namespace TikzAdversarial;

// Keep the original corpus stable; add targeted mechanisms separately when a
// supported feature or demonstrated failure needs them.
internal static class Corpus
{
    public const uint Seed = 0x54_49_4b_5a;
    public const int ValidSeeds = 8;
    public const int StressProbes = 5;
    public const int Count = 5746;

    public static List<InputCase> Create()
    {
        uint random = Seed;
        int Next(int maximum) { random ^= random << 13; random ^= random >> 17; random ^= random << 5; return (int)(random % (uint)maximum); }
        string[] valid = [
            @"\draw (0,0)--(1.5,0);",
            @"\draw[red,line width=1pt] (0,0)..controls (1,2) and (2,-1)..(3,0);",
            @"\draw[dashed] (0,0) rectangle (2,1);",
            @"\begin{scope}[rotate=30]\clip (0,0) rectangle (2,2);\draw (-1,1)--(3,1);\end{scope}",
            @"\node[draw] (a) at (0,0) {Hello};\node[draw] (b) at (2,0) {World};\draw (a) to (b);",
            @"\usetikzlibrary{arrows.meta}\draw[-{Stealth[length=5pt,width=4pt]}] (0,0)--(2,1);",
            @"\draw (0,0)--+(1,0)--++(0,1)--(0,0) cycle;",
            @"\coordinate (p) at (1,2);\draw[blue,opacity=.5] (p) circle (2pt);"
        ];
        string[] tokens = ["\\", "{", "}", "[", "]", "(", ")", ";", ",", "%", "\n", "\r\n", "\0", "\uD800", "\uDC00", "😀", "é", "İ", "١", "1e9999", "NaN", "Infinity", "1/0", "-9999999999999999999999999999999", "\\input{x}", "unknown=1", "--", "..", "cycle", "\\node", "\\draw"];
        var cases = valid.Select((source, index) => new InputCase("valid-" + index, source)).ToList();
        foreach (var (source, index) in valid.Select((s, i) => (s, i)))
            for (int cut = 0; cut < source.Length; cut++) cases.Add(new InputCase($"truncated-{index}-{cut}", source[..cut]));
        for (int index = 0; index < 5000; index++)
        {
            string source = valid[Next(valid.Length)];
            for (int mutation = 0, count = 1 + Next(4); mutation < count; mutation++)
            {
                int at = Next(source.Length + 1);
                if (Next(3) == 0 && at < source.Length) source = source.Remove(at, 1 + Next(Math.Min(12, source.Length - at)));
                else source = source.Insert(at, tokens[Next(tokens.Length)]);
            }
            cases.Add(new InputCase("mutated-" + index, source));
        }
        for (int index = 0; index < 256; index++)
        {
            var source = new StringBuilder();
            for (int count = 1 + Next(80); count > 0; count--) source.Append(tokens[Next(tokens.Length)]);
            cases.Add(new InputCase("tokens-" + index, source.ToString()));
        }
        cases.Add(new InputCase("deep-parentheses", "\\draw (" + new string('(', 200) + "1" + new string(')', 200) + ",0)--(1,1);"));
        cases.Add(new InputCase("long-flat-expression", "\\draw (0,0)--(" + string.Join('+', Enumerable.Repeat("1", 5000)) + ",0);"));
        cases.Add(new InputCase("many-segments", "\\draw (0,0)" + string.Concat(Enumerable.Repeat("--(1,1)", 1000)) + ";"));
        cases.Add(new InputCase("deep-scopes", string.Concat(Enumerable.Repeat(@"\begin{scope}", 100)) + @"\draw (0,0)--(1,1);" + string.Concat(Enumerable.Repeat(@"\end{scope}", 100))));
        cases.Add(new InputCase("huge-arc", @"\draw (0,0) arc[start angle=0,end angle=100000000,radius=1];"));
        return cases;
    }
}

internal sealed record InputCase(string Id, string Source)
{
    public int[] SourceUtf16CodeUnits => Source.Select(c => (int)c).ToArray();
}

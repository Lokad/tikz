using BenchmarkDotNet.Attributes;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Text;

namespace Lokad.TikZ.Benchmarks;

[MemoryDiagnoser]
public class LabelBenchmarks
{
    [ParamsSource(nameof(Ids))]
    public string Label { get; set; } = "";
    public IEnumerable<string> Ids => Sources.Keys;
    internal static readonly IReadOnlyDictionary<string, string> Sources = new Dictionary<string, string>
    {
        ["prose"] = "office AV repeated office ffi fi.",
        ["styled-multiline"] = @"{\bfseries Bold AV}\\{\itshape office} $x_i^2$",
        ["math-rules"] = @"$\frac{\sqrt{1+x^2}}{y_i}+\frac{a}{b}$"
    };
    private Source _source;
    private List<LabelItem> _program = null!;

    [GlobalSetup]
    public void Setup()
    {
        var text = Sources[Label];
        _source = new(text, 0, text.Length);
        _program = (List<LabelItem>)Parse();
        var measured = (MeasuredText)Layout();
        GraphicsScene? scene = null;
        var result = TikzConverter.ConvertWithTrace(@"\node[align=left]{" + text + "};",
            TikzOptions.Default with { InputKind = TikzInputKind.PictureBody }, CancellationToken.None, value => scene = value);
        if (result is not TikzSuccess || measured.Glyphs.Length == 0 || scene is null)
            throw new InvalidOperationException("Label workload is not admitted.");
        var expected = scene.Nodes.Single().Layout.Text;
        Check(measured);
        Check((MeasuredText)Layout());

        void Check(MeasuredText measured)
        {
        if ((measured.WidthSp, measured.HeightSp, measured.DepthSp, measured.Readable)
                != (expected.WidthSp, expected.HeightSp, expected.DepthSp, expected.Readable)
            || !measured.Lines.SequenceEqual(expected.Lines)
            || !measured.Glyphs.Select(g => (g.FontId, g.Slot, g.XSp, g.YSp))
                .SequenceEqual(expected.Glyphs.Select(g => (g.FontId, g.Slot, g.XSp, g.YSp)))
            || !measured.Rules.Select(r => (r.XSp, r.YSp, r.WidthSp, r.HeightSp))
                .SequenceEqual(expected.Rules.Select(r => (r.XSp, r.YSp, r.WidthSp, r.HeightSp))))
            throw new InvalidOperationException("Standalone label metrics differ from public node layout.");
        }
    }

    [Benchmark]
    public object Parse() => new LabelParser(_source, FreshBudget()).Parse();

    // Includes text/math measurement and placed marks, with warmed font data.
    // Excludes label parsing, outline decoding, node geometry and SVG writing.
    [Benchmark]
    public object Layout() => TextLayout.Layout(_program, _source, TextFont.Default,
        TextAlignment.Left, FreshBudget());

    private static Budget FreshBudget() => new(TikzLimits.Default, CancellationToken.None);
}

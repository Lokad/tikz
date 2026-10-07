using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Nodes;

namespace Lokad.TikZ.Semantics;

internal sealed class EvaluationState
{
    public Affine Transform { get; set; } = Affine.Identity;
    // TikZ initializes each basis with TeX's native 1cm dimension.
    public Point XBasis { get; set; } = new NodePoint(1864679, 0).Bp;
    public Point YBasis { get; set; } = new NodePoint(0, 1864679).Bp;
    public Paint Paint { get; set; } = new();
    public ConnectionSettings Connection { get; set; } = new();
    public ArrowSettings Arrows { get; set; } = new();
    public PaintChanges PaintChanges { get; set; }
    public DashLength[] ConfiguredDash { get; set; } = [];
    public DashLength ConfiguredDashPhase { get; set; }
    public PendingDash? PendingDash { get; set; }
    public NodeSettings Node { get; set; } = new();
    // TeX library definitions are global within this conversion, including
    // declarations inside a scope. Clones share this per-conversion registry.
    public HashSet<string> Libraries { get; set; } = new(StringComparer.Ordinal);
    public bool IsNodeContext { get; set; }
    public List<Option> NodeTransforms { get; } = [];
    public Source? NodeLineWidth { get; set; }
    public List<int> Clips { get; set; } = [];
    public bool RelevantForPictureSize { get; set; } = true;
    public Dictionary<string, List<Option>> Styles { get; set; } = new(StringComparer.Ordinal);
    public Dictionary<string, Number> Variables { get; set; } = new(StringComparer.Ordinal);
    public EvaluationState Clone(Budget budget, Source source)
    {
        budget.Charge(source, Styles.Count + Variables.Count + Clips.Count + 1);
        return new()
        {
            Transform = Transform, XBasis = XBasis, YBasis = YBasis, Paint = Paint, Connection = Connection, Arrows = Arrows, Node = Node, Libraries = Libraries, RelevantForPictureSize = RelevantForPictureSize,
            ConfiguredDash = ConfiguredDash, ConfiguredDashPhase = ConfiguredDashPhase, PendingDash = PendingDash,
            Clips = [.. Clips], Styles = new(Styles, StringComparer.Ordinal), Variables = new(Variables, StringComparer.Ordinal)
        };
    }
    public Number Number(Source source, Budget budget) => Expression.Parse(source, budget).Evaluate(Variables, budget);
    public double Scalar(Source source, Budget budget)
    {
        var number = Number(source, budget);
        if (number.HasUnit) throw new CompileError("TIKZ001", "Expected a dimensionless value.", source);
        if (!double.IsFinite(number.Value)) throw new CompileError("TIKZ004", "Non-finite value.", source);
        return number.Value;
    }
    public double Dimension(Source source, Budget budget)
    {
        var number = Number(source, budget);
        var value = number.HasUnit ? number.Bp : number.Value * 72 / 72.27;
        budget.Check(value, source);
        return value;
    }
}

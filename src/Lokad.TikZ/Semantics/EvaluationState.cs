using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Nodes;

namespace Lokad.TikZ.Semantics;

internal sealed class EvaluationState
{
    public Affine Transform { get; set; } = Affine.Identity;
    public Point XBasis { get; set; } = new(72 / 2.54, 0);
    public Point YBasis { get; set; } = new(0, 72 / 2.54);
    public Paint Paint { get; set; } = new();
    public NodeSettings Node { get; set; } = new();
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
            Transform = Transform, XBasis = XBasis, YBasis = YBasis, Paint = Paint, Node = Node, RelevantForPictureSize = RelevantForPictureSize,
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

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
    public Paint Paint { get; set; }
    public ConnectionSettings Connection { get; set; }
    public ArrowSettings Arrows { get; set; }
    public PlotSettings Plot { get; set; } = PlotSettings.Default;
    public PaintChanges PaintChanges { get; set; }
    public DashLength[] ConfiguredDash { get; set; } = [];
    public DashLength ConfiguredDashPhase { get; set; }
    public PendingDash? PendingDash { get; set; }
    public NodeSettings Node { get; set; }
    public Source NodeDistance { get; set; } = new("1cm", 0, 3);
    // Load registration is per conversion. Positioning key definitions are
    // local to their loading scope, even though the library remains registered.
    public HashSet<string> Libraries { get; set; }
    public bool PositioningAvailable { get; set; }
    public bool IsNodeContext { get; set; }
    public bool IsPathLabel { get; set; }
    public List<Option> NodeTransforms { get; } = [];
    public Source? NodeLineWidth { get; set; }
    public List<int> Clips { get; set; }
    public bool RelevantForPictureSize { get; set; } = true;
    public Dictionary<string, List<Option>> Styles { get; set; }
    public Dictionary<string, Number> Variables { get; set; }
    public Dictionary<string, Source> NumericBindings { get; set; }
    public Dictionary<string, DefinitionStatement> Definitions { get; set; }
    public IReadOnlyDictionary<string, Source>? TemplateBindings { get; set; }
    public Func<Coordinate, EvaluationState, Point>? CoordinateValue { get; set; }

    public EvaluationState()
    {
        Paint = new(); Connection = new(); Arrows = new(); Node = new();
        Libraries = new(StringComparer.Ordinal); Clips = [];
        Styles = new(StringComparer.Ordinal); Variables = new(StringComparer.Ordinal);
        NumericBindings = new(StringComparer.Ordinal); Definitions = new(StringComparer.Ordinal);
    }

    private EvaluationState(EvaluationState state)
    {
        Transform = state.Transform; XBasis = state.XBasis; YBasis = state.YBasis;
        Paint = state.Paint; Connection = state.Connection; Arrows = state.Arrows;
        Plot = state.Plot; Node = state.Node; NodeDistance = state.NodeDistance;
        Libraries = state.Libraries; PositioningAvailable = state.PositioningAvailable;
        RelevantForPictureSize = state.RelevantForPictureSize;
        ConfiguredDash = state.ConfiguredDash; ConfiguredDashPhase = state.ConfiguredDashPhase;
        PendingDash = state.PendingDash;
        Clips = [.. state.Clips]; Styles = new(state.Styles, StringComparer.Ordinal);
        Variables = new(state.Variables, StringComparer.Ordinal);
        NumericBindings = new(state.NumericBindings, StringComparer.Ordinal);
        Definitions = new(state.Definitions, StringComparer.Ordinal);
        TemplateBindings = state.TemplateBindings; CoordinateValue = state.CoordinateValue;
        // Node context/options and paint-change flags intentionally start fresh.
    }

    public EvaluationState Clone(Budget budget, Source source)
    {
        budget.Charge(source, Styles.Count + Variables.Count + NumericBindings.Count + Definitions.Count + Clips.Count + 1);
        return new(this);
    }
    public Number Number(Source source, Budget budget) => Expression.Parse(source, budget).Evaluate(Variables, budget);
    public double Scalar(Source source, Budget budget)
    {
        var number = Number(source, budget);
        source = number.Relate(source, budget);
        if (number.HasUnit) throw new CompileError("TIKZ001", "Expected a dimensionless value.", source);
        if (!double.IsFinite(number.Value)) throw new CompileError("TIKZ004", "Non-finite value.", source);
        return number.Value;
    }
    public double Dimension(Source source, Budget budget)
    {
        var number = Number(source, budget);
        source = number.Relate(source, budget);
        var value = number.HasUnit ? number.Bp : number.Value * 72 / 72.27;
        budget.Check(value, source);
        return value;
    }

    internal Source Relate(Source source, Budget budget)
    {
        if (NumericBindings.Count == 0) return source;
        var related = new List<Source>();
        var names = new HashSet<string>(StringComparer.Ordinal);
        var text = source.Span;
        for (var position = 0; position < text.Length; position++)
        {
            budget.Charge(source);
            if (text[position] == '%')
            {
                while (position < text.Length && text[position] != '\n') { budget.Charge(source); position++; }
                continue;
            }
            if (text[position] != '\\') continue;
            var start = position++;
            if (position >= text.Length) break;
            if (!char.IsAsciiLetter(text[position])) continue;
            while (position < text.Length && char.IsAsciiLetter(text[position])) { budget.Charge(source); position++; }
            var name = text[start..position].ToString();
            if (names.Add(name) && NumericBindings.TryGetValue(name, out var definition)) related.Add(definition);
            position--;
        }
        if (related.Count == 0) return source;
        budget.Charge(source, related.Count + (source.RelatedSources?.Length ?? 0));
        return source with { RelatedSources = [.. source.RelatedSources ?? [], .. related] };
    }
}

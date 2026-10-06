namespace Lokad.TikZ.Semantics;

[Flags]
internal enum PaintChanges
{
    None = 0, StrokeColor = 1, FillColor = 2, StrokeOpacity = 4, FillOpacity = 8,
    Cap = 16, Join = 32, Miter = 64, Dash = 128
}

internal static class EdgePaint
{
    // PGF width and fill rule are construction registers. Backend colors,
    // alpha, dash and cap/join commands inherit the painted parent state unless
    // the edge explicitly sets them, including settings equal to defaults.
    internal static Paint Resolve(EvaluationState edge, Paint parent)
    {
        var paint = edge.Paint; var changes = edge.PaintChanges;
        return paint with
        {
            StrokeColor = Has(PaintChanges.StrokeColor) ? paint.StrokeColor : parent.StrokeColor,
            FillColor = Has(PaintChanges.FillColor) ? paint.FillColor : parent.FillColor,
            StrokeOpacity = Has(PaintChanges.StrokeOpacity) ? paint.StrokeOpacity : parent.StrokeOpacity,
            FillOpacity = Has(PaintChanges.FillOpacity) ? paint.FillOpacity : parent.FillOpacity,
            Cap = Has(PaintChanges.Cap) ? paint.Cap : parent.Cap,
            Join = Has(PaintChanges.Join) ? paint.Join : parent.Join,
            Miter = Has(PaintChanges.Miter) ? paint.Miter : parent.Miter,
            Dash = Has(PaintChanges.Dash) ? paint.Dash : parent.Dash,
            DashPhase = Has(PaintChanges.Dash) ? paint.DashPhase : parent.DashPhase
        };
        bool Has(PaintChanges flag) => (changes & flag) != 0;
    }
}

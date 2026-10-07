using Lokad.TikZ.Frontend;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Geometry;

internal sealed record ArrowTemplate(string Name, GraphicPath Path, Paint Paint,
    long TipEndSp, long BackEndSp, long LineEndSp, long VisualTipSp, long VisualBackSp,
    long[]? ConfiguredSizeSp, long[]? FinalSizeSp, NodePoint[] Hull);

// Finite scaled-point templates. SVG consumes the local path and its resolved
// canvas matrix; it does not quantize every transformed tip vertex again.
internal static class ArrowTemplates
{
    internal const double SpPerBp = 65536 * 72.27 / 72;

    public static ArrowTemplate Create(ArrowSpec spec, EvaluationState state, Budget budget)
    {
        var source = spec.Source;
        budget.Charge(source, 32);
        var kind = spec.Kind;
        if (kind == ArrowTipKind.Default)
        {
            var replacement = state.Arrows.DefaultTip;
            spec = replacement is null ? spec with { Kind = ArrowTipKind.To }
                : replacement.Kind == ArrowTipKind.Default ? throw new CompileError("TIKZ002", "Recursive default arrow alias.", replacement.Source) : replacement;
            kind = spec.Kind;
        }
        if (kind == ArrowTipKind.To) kind = state.Libraries.Contains("arrows.meta") ? ArrowTipKind.ComputerModern : ArrowTipKind.LegacyTo;
        if (kind == ArrowTipKind.LegacyTo && (spec.LengthSp is not null || spec.WidthSp is not null || spec.InsetSp is not null))
            throw new CompileError("TIKZ002", "Legacy To does not accept dimension options.", source);
        var shaft = Scaled(state.Paint.Width * SpPerBp);
        var path = new GraphicPath(budget, source);
        var paint = state.Paint with { Dash = [], DashPhase = 0, Fill = false, Stroke = true, FillColor = state.Paint.StrokeColor };
        if (kind == ArrowTipKind.LegacyTo)
        {
            var unit = Scalar(.28) + Mul(shaft, .3);
            var tip = Scalar(.21) + Mul(shaft, .625);
            var back = -Scalar(.84) - Mul(shaft, 1.3);
            paint = paint with { Width = Mul(shaft, .8) / SpPerBp, Cap = "round", Join = "round" };
            path.Move(P(-3 * unit, 4 * unit));
            path.Cubic(P(Mul(unit, -2.75), Mul(unit, 2.5)), P(0, Mul(unit, .25)), P(Mul(unit, .75), 0));
            path.Cubic(P(0, Mul(unit, -.25)), P(Mul(unit, -2.75), Mul(unit, -2.5)), P(-3 * unit, -4 * unit));
            return new("to", path, paint, tip, back, 0, tip, back, null, null, []);
        }
        var length = spec.LengthSp ?? (kind == ArrowTipKind.ComputerModern ? Scalar(1.6) + Mul(shaft, 2.2) : 3 * 65536 + Mul(shaft, 4.5));
        var width = spec.WidthSp ?? Mul(length, kind == ArrowTipKind.ComputerModern ? 2.096774 : .75);
        var inset = kind == ArrowTipKind.Stealth ? spec.InsetSp ?? Mul(length, .325) : 0;
        if (inset >= length) throw new CompileError("TIKZ001", "Arrow inset must be less than its length.", source);
        var configured = new[] { length, width, inset, shaft };
        if (kind == ArrowTipKind.ComputerModern)
        {
            var innerLength = length - shaft; var innerWidth = width - shaft;
            if (innerLength <= 0 || innerWidth <= 0) throw new CompileError("TIKZ001", "To dimensions must exceed its pen width.", source);
            var halfPen = shaft / 2; var halfWidth = innerWidth / 2;
            path.Move(P(-innerLength, halfWidth));
            path.Cubic(P(Mul(innerLength, -.81731), Mul(innerWidth, .2)), P(Mul(innerLength, -.41019), Mul(innerWidth, .05833333)), P(0, 0));
            path.Cubic(P(Mul(innerLength, -.41019), Mul(innerWidth, -.05833333)), P(Mul(innerLength, -.81731), Mul(innerWidth, -.2)), P(-innerLength, -halfWidth));
            paint = paint with { Cap = "round", Join = "round" };
            return new("Computer Modern Rightarrow", path, paint, halfPen, -innerLength - halfPen, -halfPen,
                halfPen, halfPen, configured, [length, width, inset, shaft],
                [H(halfPen, halfPen), H(halfPen, -halfPen), H(-innerLength + halfPen, halfWidth + halfPen),
                 H(-innerLength + halfPen, -halfWidth - halfPen), H(-innerLength - halfPen, halfWidth + halfPen), H(-innerLength - halfPen, -halfWidth - halfPen)]);
        }
        var pen = Math.Min(shaft, kind == ArrowTipKind.Stealth ? Mul(length - inset, .25) : Mul(length, .2));
        paint = paint with { Width = pen / SpPerBp, Join = "miter", Fill = true, Stroke = pen > 0 };
        var quotient = PgfDirection.Divide(length, width, budget, source);
        var front = Product(Sqrt((kind == ArrowTipKind.Stealth ? 4 : 9) * Product(quotient, quotient) + 65536), pen);
        if (kind == ArrowTipKind.Latex)
        {
            var innerLength = length - front / 2 - pen / 2;
            var normal = PgfDirection.Normalize(H(Mul(length, .3), Mul(width, .2333333)), budget, source);
            var slope = PgfDirection.Divide(normal.Y + 65536, normal.X, budget, source);
            var halfWidth = width / 2 - Product(slope, pen) / 2;
            path.Move(P(innerLength, 0));
            path.Cubic(P(Mul(innerLength, .877192), Mul(halfWidth, .077922)), P(Mul(innerLength, .337381), Mul(halfWidth, .519480)), P(0, halfWidth));
            path.Line(P(0, -halfWidth));
            path.Cubic(P(Mul(innerLength, .337381), Mul(halfWidth, -.519480)), P(Mul(innerLength, .877192), Mul(halfWidth, -.077922)), P(innerLength, 0));
            path.Close();
            return new("Latex", path, paint, length - pen / 2, -pen / 2, 0, length - pen / 2, -pen / 2,
                configured, [length, width, inset, pen], [H(length - pen / 2, 0), H(-pen / 2, width / 2), H(-pen / 2, -width / 2)]);
        }
        front /= 2;
        var angleA = PgfDirection.Angle(H(width / 2, length), budget, source);
        var angleB = PgfDirection.Angle(H(width / 2, inset), budget, source);
        var halfAngle = (angleA - angleB) / 2;
        var halfRotation = PgfTransform.Rotation(PgfTransform.Printed(halfAngle), budget, source);
        var tangent = Product(PgfDirection.Reciprocal(Scalar(halfRotation.A), source), Scalar(halfRotation.B));
        var backMiter = Product(PgfDirection.Reciprocal(tangent, source), pen) / 2;
        var rotation = PgfTransform.Rotation(PgfTransform.Printed(angleB + halfAngle), budget, source);
        var backX = inset == 0 ? pen / 2 : Product(Scalar(rotation.B), backMiter);
        var topY = Product(Scalar(rotation.A), backMiter);
        var insetQuotient = PgfDirection.Divide(inset, width, budget, source);
        var insetMiter = Product(Sqrt(4 * Product(insetQuotient, insetQuotient) + 65536), pen) / 2;
        var inner = length - front - backX; var halfHeight = width / 2 - topY;
        path.Move(P(inner + backX, 0)); path.Line(P(backX, halfHeight));
        path.Line(P(inset + insetMiter, 0)); path.Line(P(backX, -halfHeight)); path.Close();
        return new("Stealth", path, paint, length, 0, inset + insetMiter - Mul(pen, .25), length, inset,
            configured, [length, width, inset + insetMiter, pen], [H(length, 0), H(0, width / 2), H(0, -width / 2), H(inset, 0)]);

        long Scaled(double value) => PgfDirection.Checked((long)Math.Round(value, MidpointRounding.AwayFromZero), source);
        long Scalar(double value) => Scaled(value * 65536);
        long Mul(long dimension, double factor) => Product(Scalar(factor), dimension);
        long Product(long factor, long dimension) { budget.Charge(source); return PgfDirection.Product(factor, dimension, source); }
        long Sqrt(long value)
        {
            PgfDirection.Checked(value, source); budget.Charge(source, 8);
            return Scalar(Math.Truncate(Math.Sqrt(PgfTransform.Printed(value)) * 100000) / 100000);
        }
        Point P(long x, long y) => H(x, y).Bp;
        NodePoint H(long x, long y) => new(PgfDirection.Checked(x, source), PgfDirection.Checked(y, source));
    }
}

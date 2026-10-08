using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Nodes;

namespace Lokad.TikZ.Semantics;

internal sealed partial class Evaluator
{
    private Point Calculate(CoordinateCalculation calculation, EvaluationState state)
    {
        budget.Charge(calculation.Source);
        if (!state.Libraries.Contains("calc"))
            throw new CompileError("TIKZ002", "Calculated coordinates require the calc library.", calculation.Source);
        var result = default(Point);
        foreach (var term in calculation.Terms)
        {
            budget.Charge(term.Source);
            var point = PathCoordinate(term.Point, state, default, out _);
            foreach (var modifier in term.Modifiers)
            {
                budget.Charge(modifier.Source);
                var target = PathCoordinate(modifier.Target, state, default, out _);
                if (modifier.Angle is not null)
                {
                    var angle = modifier.Angle.Evaluate(state.Variables, budget);
                    if (angle.HasUnit) throw new CompileError("TIKZ001", "A calc rotation angle must be dimensionless.", modifier.Angle.Source);
                    // Construct the finite rotation around the base point,
                    // retaining separately rounded translations and products.
                    var frame = PgfTransform.Then(new(1, 0, 0, 1, point.X, point.Y),
                        PgfTransform.Rotation(angle.Value, budget, modifier.Angle.Source), budget, modifier.Source);
                    frame = PgfTransform.Then(frame, new(1, 0, 0, 1, -point.X, -point.Y), budget, modifier.Source);
                    target = PgfTransform.Apply(frame, target, budget, modifier.Source);
                }
                switch (modifier)
                {
                    case InterpolationModifier interpolation:
                        var amount = interpolation.Amount.Evaluate(state.Variables, budget);
                        if (amount.HasUnit)
                        {
                            var direction = Direction(target - point, modifier.Source);
                            point += PgfTransform.Scale(direction.Bp, amount.Value, budget, interpolation.Amount.Source);
                        }
                        else
                            point = PgfTransform.Scale(point, 1 - amount.Value, budget, interpolation.Amount.Source)
                                + PgfTransform.Scale(target, amount.Value, budget, interpolation.Amount.Source);
                        break;
                    case ProjectionModifier projection:
                        var projected = PathCoordinate(projection.Projected, state, default, out _) - point;
                        var normal = Direction(target - point, projection.Source);
                        var distance = PgfDirection.Product(normal.X, ToSp(projected.X, projection.Source), projection.Source)
                            + PgfDirection.Product(normal.Y, ToSp(projected.Y, projection.Source), projection.Source);
                        point += new NodePoint(PgfDirection.Checked(PgfDirection.Product(normal.X, distance, projection.Source), projection.Source),
                            PgfDirection.Checked(PgfDirection.Product(normal.Y, distance, projection.Source), projection.Source)).Bp;
                        break;
                    default: throw new InvalidOperationException("Unknown calc modifier.");
                }
                point = PgfTransform.Apply(Affine.Identity, point, budget, modifier.Source);
            }
            var factor = term.Factor?.Evaluate(state.Variables, budget) ?? new Number(1, false);
            if (factor.HasUnit) throw new CompileError("TIKZ001", "A calc factor must be dimensionless.", term.Factor!.Source);
            result += PgfTransform.Scale(point, term.Sign * factor.Value, budget, term.Source);
            result = PgfTransform.Apply(Affine.Identity, result, budget, term.Source);
        }
        return result;

        NodePoint Direction(Point delta, Source source)
            => PgfDirection.Normalize(new(ToSp(delta.X, source), ToSp(delta.Y, source)), budget, source);
    }
}

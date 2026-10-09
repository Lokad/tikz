namespace Lokad.TikZ.Frontend;

internal abstract record Statement(Source Source);
internal sealed record ScopeStatement(List<Option> Options, List<Statement> Body, Source Origin) : Statement(Origin);
internal sealed record SetStatement(List<Option> Options, Source Origin) : Statement(Origin);
internal sealed record LibraryStatement(Source Names, Source Origin) : Statement(Origin);
internal sealed record ForeachStatement(Source Variable, Source Values, Source Body, Source Origin) : Statement(Origin);
internal sealed record CoordinateStatement(string Name, Coordinate Point, Source Origin) : Statement(Origin);
internal sealed record NodeStatement(string Name, Coordinate? At, List<Option> Options, Source Label, Source Origin) : Statement(Origin);
internal sealed record PathStatement(string Command, List<Option> Options, List<PathOperation> Operations, Source Origin) : Statement(Origin);
internal abstract record PathOperation(Source Source)
{
    internal List<NodeStatement> Labels { get; init; } = [];
}
internal sealed record MoveOperation(Coordinate Point, Source Origin) : PathOperation(Origin);
internal sealed record LineOperation(Coordinate Point, string Kind, Source Origin) : PathOperation(Origin);
internal sealed record ToOperation(Coordinate Target, List<Option> Options, Source Origin) : PathOperation(Origin);
internal sealed record EdgeOperation(Coordinate Target, List<Option> Options, Source Origin) : PathOperation(Origin);
internal sealed record CurveOperation(Coordinate A, Coordinate B, Coordinate End, Source Origin) : PathOperation(Origin);
internal sealed record RectangleOperation(Coordinate End, Source Origin) : PathOperation(Origin);
internal sealed record EllipseOperation(Expression X, Expression Y, Source Origin) : PathOperation(Origin);
internal sealed record ArcOperation(Expression Start, Expression End, Expression X, Expression Y, Source Origin) : PathOperation(Origin);
internal sealed record CloseOperation(Source Origin) : PathOperation(Origin);
internal sealed record PathOptionsOperation(List<Option> Options, Source Origin) : PathOperation(Origin);
internal sealed record Coordinate(Expression? X, Expression? Y, string Name, bool Polar, int Relative, Source Source)
{
    public CoordinateCalculation? Calculation { get; init; }
}
internal sealed record CoordinateCalculation(List<CalculationTerm> Terms, Source Source);
internal sealed record CalculationTerm(int Sign, Expression? Factor, Coordinate Point, List<CalculationModifier> Modifiers, Source Source);
internal abstract record CalculationModifier(Coordinate Target, Expression? Angle, Source Source);
internal sealed record InterpolationModifier(Expression Amount, Coordinate End, Expression? Rotation, Source Origin)
    : CalculationModifier(End, Rotation, Origin);
internal sealed record ProjectionModifier(Coordinate Projected, Coordinate End, Expression? Rotation, Source Origin)
    : CalculationModifier(End, Rotation, Origin);

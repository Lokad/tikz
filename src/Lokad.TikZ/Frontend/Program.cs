namespace Lokad.TikZ.Frontend;

internal abstract record Statement(Source Source);
internal sealed record ScopeStatement(List<Option> Options, List<Statement> Body, Source Origin) : Statement(Origin);
internal sealed record SetStatement(List<Option> Options, Source Origin) : Statement(Origin);
internal sealed record LibraryStatement(Source Names, Source Origin) : Statement(Origin);
internal sealed record CoordinateStatement(string Name, Coordinate Point, Source Origin) : Statement(Origin);
internal sealed record PathStatement(string Command, List<Option> Options, List<PathOperation> Operations, Source Origin) : Statement(Origin);
internal abstract record PathOperation(Source Source);
internal sealed record MoveOperation(Coordinate Point, Source Origin) : PathOperation(Origin);
internal sealed record LineOperation(Coordinate Point, string Kind, Source Origin) : PathOperation(Origin);
internal sealed record CurveOperation(Coordinate A, Coordinate B, Coordinate End, Source Origin) : PathOperation(Origin);
internal sealed record RectangleOperation(Coordinate End, Source Origin) : PathOperation(Origin);
internal sealed record EllipseOperation(Expression X, Expression Y, Source Origin) : PathOperation(Origin);
internal sealed record ArcOperation(Expression Start, Expression End, Expression X, Expression Y, Source Origin) : PathOperation(Origin);
internal sealed record CloseOperation(Source Origin) : PathOperation(Origin);
internal sealed record PathOptionsOperation(List<Option> Options, Source Origin) : PathOperation(Origin);
internal sealed record Coordinate(Expression? X, Expression? Y, string Name, bool Polar, int Relative, Source Source);

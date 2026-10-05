using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Text;

namespace Lokad.TikZ.Semantics;

internal static class KeyRegistry
{
    public static void Apply(IEnumerable<Option> options, EvaluationState state, Budget budget, int depth = 0)
    {
        foreach (var option in options)
        {
            budget.Depth(option.Source, depth, budget.Limits.MaxExpansionDepth);
            var key = option.Key;
            if (key.StartsWith("/tikz/", StringComparison.Ordinal)) key = key[6..];
            if (key.StartsWith("/pgf/", StringComparison.Ordinal)) key = key[5..];
            if (key.EndsWith("/.style", StringComparison.Ordinal)) { state.Styles[key[..^7]] = Options.Read(option.Value, budget); continue; }
            if (key.EndsWith("/.append style", StringComparison.Ordinal))
            {
                var name = key[..^14];
                var additions = Options.Read(option.Value, budget);
                state.Styles[name] = state.Styles.TryGetValue(name, out var old) ? [.. old, .. additions] : additions;
                continue;
            }
            if (state.Styles.TryGetValue(key, out var style))
            {
                if (option.Value.Length != 0) throw new CompileError("TIKZ002", "Parameterized styles are not supported yet.", option.Source);
                Apply(style, state, budget, depth + 1);
                continue;
            }
            var value = Options.Clean(option.Value);
            var paint = state.Paint;
            if (state.IsNodeContext)
            {
                if (key is "scale" or "xscale" or "yscale" or "rotate" or "shift" or "xshift" or "yshift" or "cm")
                { state.NodeTransforms.Add(option with { Key = key }); continue; }
                if (key is "x" or "y") throw Unsupported(option);
                if (key == "line width") { state.NodeLineWidth = option.Value; continue; }
            }
            switch (key)
            {
                case "": continue;
                case "draw": state.Paint = paint with { Stroke = value is not ("none" or "false"), StrokeColor = value.Length == 0 || value is "none" or "false" or "true" ? paint.StrokeColor : Color.Parse(option.Value, budget) }; break;
                case "fill": state.Paint = paint with { Fill = value is not ("none" or "false"), FillColor = value.Length == 0 || value is "none" or "false" or "true" ? paint.FillColor : Color.Parse(option.Value, budget) }; break;
                case "color": var color = Color.Parse(option.Value, budget); state.Paint = paint with { StrokeColor = color, FillColor = color }; state.Node = state.Node with { TextColor = color }; break;
                case "rectangle": break;
                case "shape": if (value != "rectangle") throw Unsupported(option); break;
                case "font": state.Node = state.Node with { Font = option.Value }; break;
                case "node font": state.Node = state.Node with { NodeFont = option.Value }; break;
                case "text": state.Node = state.Node with { TextColor = Color.Parse(option.Value, budget) }; break;
                case "text opacity": state.Node = state.Node with { TextOpacity = Alpha() }; break;
                case "anchor": state.Node = state.Node with { Anchor = value, AnchorSource = option.Value }; break;
                case "align": state.Node = state.Node with { Alignment = value switch { "left" => TextAlignment.Left, "center" => TextAlignment.Center, "right" => TextAlignment.Right, _ => throw Unsupported(option) } }; break;
                case "inner sep": state.Node = state.Node with { InnerX = option.Value, InnerY = option.Value }; break;
                case "inner xsep": state.Node = state.Node with { InnerX = option.Value }; break;
                case "inner ysep": state.Node = state.Node with { InnerY = option.Value }; break;
                case "outer sep": if (value == "auto") throw Unsupported(option); state.Node = state.Node with { OuterX = option.Value, OuterY = option.Value }; break;
                case "outer xsep": state.Node = state.Node with { OuterX = option.Value }; break;
                case "outer ysep": state.Node = state.Node with { OuterY = option.Value }; break;
                case "minimum size": state.Node = state.Node with { MinimumWidth = option.Value, MinimumHeight = option.Value }; break;
                case "minimum width": state.Node = state.Node with { MinimumWidth = option.Value }; break;
                case "minimum height": state.Node = state.Node with { MinimumHeight = option.Value }; break;
                case "transform shape": state.Node = state.Node with { TransformShape = value switch { "" or "true" => true, "false" => false, _ => throw Unsupported(option) } }; break;
                case "line width": var width = state.Dimension(option.Value, budget); if (width < 0) Invalid(option); state.Paint = paint with { Width = width }; break;
                case "ultra thin": Width(.1); break;
                case "very thin": Width(.2); break;
                case "thin": Width(.4); break;
                case "semithick": Width(.6); break;
                case "thick": Width(.8); break;
                case "very thick": Width(1.2); break;
                case "ultra thick": Width(1.6); break;
                case "opacity": var alpha = Alpha(); state.Paint = paint with { StrokeOpacity = alpha, FillOpacity = alpha }; break;
                case "draw opacity": state.Paint = paint with { StrokeOpacity = Alpha() }; break;
                case "fill opacity": state.Paint = paint with { FillOpacity = Alpha() }; break;
                case "line cap": state.Paint = paint with { Cap = value switch { "butt" or "round" => value, "rect" => "square", _ => throw Unsupported(option) } }; break;
                case "line join": state.Paint = paint with { Join = value switch { "miter" or "round" or "bevel" => value, _ => throw Unsupported(option) } }; break;
                case "miter limit": var miter = state.Scalar(option.Value, budget); if (miter < 1 || miter > 1000) Invalid(option); state.Paint = paint with { Miter = miter }; break;
                case "nonzero rule": state.Paint = paint with { FillRule = "nonzero" }; break;
                case "even odd rule": state.Paint = paint with { FillRule = "evenodd" }; break;
                case "solid": state.Paint = paint with { Dash = [], DashPhase = 0 }; break;
                case "dashed": Dash(3, 3); break;
                case "densely dashed": Dash(3, 2); break;
                case "loosely dashed": Dash(3, 6); break;
                case "dotted": state.Paint = paint with { Dash = [paint.Width, 2 * 72 / 72.27] }; break;
                case "dash phase": state.Paint = paint with { DashPhase = state.Dimension(option.Value, budget) }; break;
                case "dash pattern": state.Paint = paint with { Dash = ParseDash(option.Value, state, budget) }; break;
                case "scale": var scale = state.Scalar(option.Value, budget); state.Transform = state.Transform.Then(Affine.Scale(scale, scale)); break;
                case "xscale": state.Transform = state.Transform.Then(Affine.Scale(state.Scalar(option.Value, budget), 1)); break;
                case "yscale": state.Transform = state.Transform.Then(Affine.Scale(1, state.Scalar(option.Value, budget))); break;
                case "rotate": state.Transform = state.Transform.Then(Affine.Rotation(state.Scalar(option.Value, budget))); break;
                case "xshift": state.Transform = state.Transform.Then(Affine.Translation(state.Dimension(option.Value, budget), 0)); break;
                case "yshift": state.Transform = state.Transform.Then(Affine.Translation(0, state.Dimension(option.Value, budget))); break;
                case "shift": var shift = PointValue(option.Value, state, budget); state.Transform = state.Transform.Then(Affine.Translation(shift.X, shift.Y)); break;
                case "x": state.XBasis = option.Value.Span.StartsWith("(") ? PointValue(option.Value, state, budget) : new(state.Dimension(option.Value, budget), 0); break;
                case "y": state.YBasis = option.Value.Span.StartsWith("(") ? PointValue(option.Value, state, budget) : new(0, state.Dimension(option.Value, budget)); break;
                case "cm":
                    var parts = Options.Split(option.Value, ',', budget);
                    if (parts.Count != 5) throw new CompileError("TIKZ001", "Expected cm={a,b,c,d,(x,y)}.", option.Source);
                    var offset = PointValue(parts[4], state, budget);
                    state.Transform = state.Transform.Then(new(state.Scalar(parts[0], budget), state.Scalar(parts[1], budget), state.Scalar(parts[2], budget), state.Scalar(parts[3], budget), offset.X, offset.Y));
                    break;
                default:
                    if (Color.IsName(key) || key.Contains('!')) { var c = Color.Parse(new Source(key, 0, key.Length), budget); state.Paint = paint with { StrokeColor = c, FillColor = c }; state.Node = state.Node with { TextColor = c }; }
                    else throw Unsupported(option);
                    break;
            }
            void Width(double points) { state.NodeLineWidth = null; state.Paint = paint with { Width = points * 72 / 72.27 }; }
            void Dash(double a, double b) => state.Paint = paint with { Dash = [a * 72 / 72.27, b * 72 / 72.27] };
            double Alpha() { var result = state.Scalar(option.Value, budget); if (result is < 0 or > 1) Invalid(option); return result; }
        }
    }
    private static CompileError Unsupported(Option option) => new("TIKZ002", $"Unsupported option '{option.Key}'.", option.Source);
    private static void Invalid(Option option) => throw new CompileError("TIKZ001", $"Invalid value for '{option.Key}'.", option.Source);
    private static double[] ParseDash(Source source, EvaluationState state, Budget budget)
    {
        var reader = new Cursor(source, budget);
        var lengths = new List<double>();
        while (!reader.End)
        {
            if (!(lengths.Count % 2 == 0 ? reader.Word("on") : reader.Word("off"))) throw new CompileError("TIKZ001", "Expected alternating 'on' and 'off' dash lengths.", reader.Here);
            var start = reader.Position;
            while (!reader.End)
            {
                if (reader.Source.Span[reader.Position..].StartsWith("on", StringComparison.Ordinal) || reader.Source.Span[reader.Position..].StartsWith("off", StringComparison.Ordinal)) break;
                reader.Advance();
            }
            var value = state.Dimension(source.Slice(start, reader.Position - start), budget);
            if (value < 0) throw new CompileError("TIKZ001", "Negative dash length.", source);
            lengths.Add(value);
        }
        if (lengths.Count == 0 || lengths.Count % 2 != 0 || lengths.All(v => v == 0)) throw new CompileError("TIKZ001", "Invalid dash pattern.", source);
        return [.. lengths];
    }
    private static Point PointValue(Source source, EvaluationState state, Budget budget)
    {
        var reader = new Cursor(source, budget);
        var group = reader.Group('(', ')'); reader.Complete();
        var parts = Options.Split(group, ',', budget);
        if (parts.Count != 2) throw new CompileError("TIKZ001", "Expected (x,y).", source);
        var x = state.Number(parts[0], budget); var y = state.Number(parts[1], budget);
        return (x.HasUnit ? new Point(x.Bp, 0) : state.XBasis * x.Value) + (y.HasUnit ? new Point(0, y.Bp) : state.YBasis * y.Value);
    }
}

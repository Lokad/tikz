using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Text;

namespace Lokad.TikZ.Semantics;

internal static class KeyRegistry
{
    public static void ApplyStyle(string name, EvaluationState state, Budget budget, Source source, bool clipping = false)
    {
        if (state.Styles.TryGetValue(name, out var style))
            Apply(StyleExpansion.Instantiate(style, new(name, source.Slice(0, 0), source), budget), state, budget, 1, clipping);
    }
    public static void Apply(IEnumerable<Option> options, EvaluationState state, Budget budget, int depth = 0, bool clipping = false)
    {
        foreach (var original in options)
        {
            var option = original;
            budget.Depth(option.Source, depth, budget.Limits.MaxExpansionDepth);
            var key = option.Key;
            if (state.Definitions.Count != 0 && key.Contains('\\'))
            {
                var keySource = Options.Split(option.Source, '=', budget)[0];
                var expandedKey = new TokenExpansion(state, budget).Expand(keySource);
                if (Options.Split(expandedKey, ',', budget).Count != 1 || Options.Split(expandedKey, '=', budget).Count != 1)
                    throw new CompileError("TIKZ002", "A token definition in a key must produce one supported key.", expandedKey);
                key = Options.Clean(expandedKey);
                option = option with { Key = key, Source = expandedKey };
            }
            if (key.StartsWith("/tikz/", StringComparison.Ordinal)) key = key[6..];
            if (key.StartsWith("/pgf/", StringComparison.Ordinal)) key = key[5..];
            if (key.EndsWith("/.style", StringComparison.Ordinal)) { state.Styles[key[..^7]] = StyleExpansion.Read(option.Value, budget); continue; }
            if (key.EndsWith("/.append style", StringComparison.Ordinal))
            {
                var name = key[..^14];
                var additions = StyleExpansion.Read(option.Value, budget);
                state.Styles[name] = state.Styles.TryGetValue(name, out var old) ? [.. old, .. additions] : additions;
                continue;
            }
            if (state.Definitions.Count != 0 && option.Value.Length > 0)
            {
                var expandedValue = new TokenExpansion(state, budget).Expand(option.Value);
                option = option with { Value = Options.Ungroup(expandedValue, budget) };
            }
            if (state.Styles.TryGetValue(key, out var style))
            {
                Apply(StyleExpansion.Instantiate(style, option, budget), state, budget, depth + 1, clipping);
                continue;
            }
            var value = Options.Clean(option.Value);
            if (ArrowOptions.Apply(option with { Key = key }, state, budget)) continue;
            var paint = state.Paint;
            // A deferred edge overrides only commands it actually issues.
            // Equality with the inherited value does not mean an option is absent.
            state.PaintChanges |= key switch
            {
                "draw" when value.Length > 0 && value is not ("none" or "false" or "true") => PaintChanges.StrokeColor,
                "fill" when value.Length > 0 && value is not ("none" or "false" or "true") => PaintChanges.FillColor,
                "color" => PaintChanges.StrokeColor | PaintChanges.FillColor,
                "opacity" => PaintChanges.StrokeOpacity | PaintChanges.FillOpacity,
                "draw opacity" => PaintChanges.StrokeOpacity,
                "fill opacity" => PaintChanges.FillOpacity,
                "line cap" => PaintChanges.Cap,
                "line join" => PaintChanges.Join,
                "miter limit" => PaintChanges.Miter,
                "solid" or "dashed" or "densely dashed" or "loosely dashed" or "dotted" or "densely dotted" or "loosely dotted"
                    or "dashdotted" or "dash dot" or "densely dashdotted" or "densely dash dot" or "loosely dashdotted" or "loosely dash dot"
                    or "dashdotdotted" or "dash dot dot" or "densely dashdotdotted" or "densely dash dot dot" or "loosely dashdotdotted" or "loosely dash dot dot"
                    or "dash phase" or "dash pattern" => PaintChanges.Dash,
                _ when Color.IsName(key) || key.Contains('!') => PaintChanges.StrokeColor | PaintChanges.FillColor,
                _ => PaintChanges.None
            };
            if (state.IsNodeContext)
            {
                if (key is "scale" or "xscale" or "yscale" or "xslant" or "yslant" or "rotate" or "shift" or "xshift" or "yshift" or "cm")
                { state.NodeTransforms.Add(option with { Key = key }); continue; }
                if (key is "x" or "y") throw Unsupported(option);
                if (key == "line width") { state.NodeLineWidth = option.Value; continue; }
                if (key is "above" or "below" or "left" or "right" or "above left" or "above right" or "below left" or "below right")
                {
                    if (value.Length == 0 && (key is "above" or "below" or "left" or "right"))
                        state.Node = state.Node with { Anchor = key switch { "above" => "south", "below" => "north", "left" => "east", _ => "west" }, AnchorSource = option.Source };
                    else if (!state.IsPathLabel && state.PositioningAvailable) PositioningOptions.Apply(option with { Key = key }, state, budget);
                    else throw Unsupported(option);
                    continue;
                }
                if (key is "pos" or "midway")
                {
                    if (!state.IsPathLabel) throw Unsupported(option);
                    var time = key == "midway" ? .5 : state.Scalar(option.Value, budget);
                    if (time is < 0 or > 1) throw new CompileError("TIKZ002", "Path label pos must be between zero and one.", option.Source);
                    state.Node = state.Node with { PathTime = time }; continue;
                }
                if (key is "sloped" or "allow upside down")
                {
                    if (!state.IsPathLabel) throw Unsupported(option);
                    var enabled = value switch { "" or "true" => true, "false" => false, _ => throw Unsupported(option) };
                    state.Node = key == "sloped" ? state.Node with { Sloped = enabled } : state.Node with { AllowUpsideDown = enabled }; continue;
                }
            }
            switch (key)
            {
                case "": continue;
                case "sharp plot": state.Plot = state.Plot with { Handler = PlotHandler.Sharp }; break;
                case "smooth": state.Plot = state.Plot with { Handler = PlotHandler.Smooth }; break;
                case "smooth cycle": state.Plot = state.Plot with { Handler = PlotHandler.SmoothCycle }; break;
                case "tension": state.Plot = state.Plot.WithTension(option.Value, state, budget); break;
                case "domain": state.Plot = state.Plot.Domain(option.Value, state, budget); break;
                case "samples": state.Plot = state.Plot.Count(option.Value, state, budget); break;
                case "samples at": state.Plot = state.Plot with { Values = option.Value }; break;
                case "variable": state.Plot = state.Plot.SetVariable(option.Value, budget); break;
                case "draw": state.Paint = paint with { Stroke = value is not ("none" or "false"), StrokeColor = value.Length == 0 || value is "none" or "false" or "true" ? paint.StrokeColor : Color.Parse(option.Value, budget) }; break;
                case "fill": state.Paint = paint with { Fill = value is not ("none" or "false"), FillColor = value.Length == 0 || value is "none" or "false" or "true" ? paint.FillColor : Color.Parse(option.Value, budget) }; break;
                case "color": var color = Color.Parse(option.Value, budget); state.Paint = paint with { StrokeColor = color, FillColor = color }; state.Node = state.Node with { TextColor = color }; break;
                case "rectangle" or "circle" or "ellipse": Shape(key); break;
                case "shape": Shape(value); break;
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
                case "node distance":
                    if (!state.PositioningAvailable) throw Unsupported(option);
                    state.NodeDistance = option.Value; break;
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
                case "bend angle": state.Connection = state.Connection with { Bend = state.Scalar(option.Value, budget) }; break;
                case "bend left" or "bend right":
                    var bend = value.Length == 0 ? state.Connection.Bend : state.Scalar(option.Value, budget);
                    var outgoing = key == "bend left" ? bend : -bend;
                    state.Connection = state.Connection with { Curved = true, Relative = true, Bend = bend, Out = outgoing, In = 180 - outgoing }; break;
                case "in": state.Connection = state.Connection with { Curved = true, In = state.Scalar(option.Value, budget) }; break;
                case "out": state.Connection = state.Connection with { Curved = true, Out = state.Scalar(option.Value, budget) }; break;
                case "relative": state.Connection = state.Connection with { Relative = value switch { "" or "true" => true, "false" => false, _ => throw Unsupported(option) } }; break;
                case "looseness": var looseness = state.Scalar(option.Value, budget); state.Connection = state.Connection with { Curved = true, InLooseness = looseness, OutLooseness = looseness }; break;
                case "in looseness": state.Connection = state.Connection with { Curved = true, InLooseness = state.Scalar(option.Value, budget) }; break;
                case "out looseness": state.Connection = state.Connection with { Curved = true, OutLooseness = state.Scalar(option.Value, budget) }; break;
                case "in min distance": state.Connection = state.Connection with { Curved = true, InMin = state.Dimension(option.Value, budget) }; break;
                case "in max distance": state.Connection = state.Connection with { Curved = true, InMax = state.Dimension(option.Value, budget) }; break;
                case "out min distance": state.Connection = state.Connection with { Curved = true, OutMin = state.Dimension(option.Value, budget) }; break;
                case "out max distance": state.Connection = state.Connection with { Curved = true, OutMax = state.Dimension(option.Value, budget) }; break;
                case "in distance": var inDistance = state.Dimension(option.Value, budget); state.Connection = state.Connection with { Curved = true, InMin = inDistance, InMax = inDistance }; break;
                case "out distance": var outDistance = state.Dimension(option.Value, budget); state.Connection = state.Connection with { Curved = true, OutMin = outDistance, OutMax = outDistance }; break;
                case "min distance": var minDistance = state.Dimension(option.Value, budget); state.Connection = state.Connection with { Curved = true, InMin = minDistance, OutMin = minDistance }; break;
                case "max distance": var maxDistance = state.Dimension(option.Value, budget); state.Connection = state.Connection with { Curved = true, InMax = maxDistance, OutMax = maxDistance }; break;
                case "distance": var distance = state.Dimension(option.Value, budget); state.Connection = state.Connection with { Curved = true, InMin = distance, InMax = distance, OutMin = distance, OutMax = distance }; break;
                case "nonzero rule": Rule("nonzero"); break;
                case "even odd rule": Rule("evenodd"); break;
                case "solid": DashPattern.Set(state, [], option.Source, budget); break;
                case "dashed": Dash(3, 3); break;
                case "densely dashed": Dash(3, 2); break;
                case "loosely dashed": Dash(3, 6); break;
                case "dotted": Dots(2, 0); break;
                case "densely dotted": Dots(1, 0); break;
                case "loosely dotted": Dots(4, 0); break;
                case "dashdotted" or "dash dot": Dots(2, 1); break;
                case "densely dashdotted" or "densely dash dot": Dots(1, 1); break;
                case "loosely dashdotted" or "loosely dash dot": Dots(4, 1); break;
                case "dashdotdotted" or "dash dot dot": Dots(2, 2); break;
                case "densely dashdotdotted" or "densely dash dot dot": Dots(1, 2); break;
                case "loosely dashdotdotted" or "loosely dash dot dot": Dots(4, 2); break;
                case "dash phase": state.ConfiguredDashPhase = DashPattern.ReadLength(option.Value, state, budget); DashPattern.Schedule(state, false, option.Source, budget); break;
                case "dash pattern": DashPattern.Set(state, DashPattern.Read(option.Value, state, budget), option.Source, budget); break;
                case "scale": var scale = state.Scalar(option.Value, budget); Transform(Affine.Scale(scale, scale)); break;
                case "xscale": Transform(Affine.Scale(state.Scalar(option.Value, budget), 1)); break;
                case "yscale": Transform(Affine.Scale(1, state.Scalar(option.Value, budget))); break;
                case "xslant": Transform(new(1, 0, state.Scalar(option.Value, budget), 1, 0, 0)); break;
                case "yslant": Transform(new(1, state.Scalar(option.Value, budget), 0, 1, 0, 0)); break;
                case "rotate": Transform(PgfTransform.Rotation(state.Scalar(option.Value, budget), budget, option.Source)); break;
                case "xshift": Transform(Affine.Translation(state.Dimension(option.Value, budget), 0)); break;
                case "yshift": Transform(Affine.Translation(0, state.Dimension(option.Value, budget))); break;
                case "shift": var shift = PointValue(option.Value, state, budget); Transform(Affine.Translation(shift.X, shift.Y)); break;
                case "x": state.XBasis = option.Value.Span.StartsWith("(") ? PointValue(option.Value, state, budget) : new(state.Dimension(option.Value, budget), 0); break;
                case "y": state.YBasis = option.Value.Span.StartsWith("(") ? PointValue(option.Value, state, budget) : new(0, state.Dimension(option.Value, budget)); break;
                case "cm":
                    var parts = Options.Split(option.Value, ',', budget);
                    if (parts.Count != 5) throw new CompileError("TIKZ001", "Expected cm={a,b,c,d,(x,y)}.", option.Source);
                    var offset = PointValue(parts[4], state, budget);
                    Transform(new(state.Scalar(parts[0], budget), state.Scalar(parts[1], budget), state.Scalar(parts[2], budget), state.Scalar(parts[3], budget), offset.X, offset.Y));
                    break;
                default:
                    if (Color.IsName(key) || key.Contains('!')) { var c = Color.Parse(new Source(key, 0, key.Length), budget); state.Paint = paint with { StrokeColor = c, FillColor = c }; state.Node = state.Node with { TextColor = c }; }
                    else throw Unsupported(option);
                    break;
            }
            void Rule(string rule)
            {
                if (clipping)
                    throw new CompileError("TIKZ002", "Select clipping fill rules on a surrounding scope.", option.Source);
                state.Paint = paint with { FillRule = rule };
            }
            void Width(double points)
            {
                state.NodeLineWidth = null;
                state.Paint = paint with { Width = new PhysicalLiteral(points, "pt", option.Source).Evaluate(state.Variables, budget).Bp };
            }
            void Shape(string name)
            {
                var shape = name switch { "rectangle" => NodeShape.Rectangle, "circle" => NodeShape.Circle, "ellipse" => NodeShape.Ellipse, _ => throw Unsupported(option) };
                if (shape == NodeShape.Ellipse && !state.Libraries.Contains("shapes.geometric"))
                    throw new CompileError("TIKZ002", "Ellipse nodes require the shapes.geometric library.", option.Source);
                state.Node = state.Node with { Shape = shape };
            }
            void Transform(Affine value) => state.Transform = PgfTransform.Then(state.Transform, value, budget, option.Source);
            DashLength Fixed(double points) => new(points * 72 / 72.27, DashLengthKind.Fixed, option.Source);
            void Dash(double a, double b) => DashPattern.Set(state, [Fixed(a), Fixed(b)], option.Source, budget);
            void Dots(double gap, int count)
            {
                var lengths = new List<DashLength>();
                if (count > 0) { lengths.Add(Fixed(3)); lengths.Add(Fixed(gap)); }
                for (var i = 0; i < Math.Max(1, count); i++)
                {
                    lengths.Add(new(0, count == 0 ? DashLengthKind.LiveWidth : DashLengthKind.CapturedWidth, option.Source));
                    lengths.Add(Fixed(gap));
                }
                DashPattern.Set(state, [.. lengths], option.Source, budget);
            }
            double Alpha() { var result = state.Scalar(option.Value, budget); if (result is < 0 or > 1) Invalid(option); return result; }
        }
    }
    private static CompileError Unsupported(Option option) => new("TIKZ002", $"Unsupported option '{option.Key}'.", option.Source);
    private static void Invalid(Option option) => throw new CompileError("TIKZ001", $"Invalid value for '{option.Key}'.", option.Source);
    private static Point PointValue(Source source, EvaluationState state, Budget budget)
    {
        var reader = new Cursor(source, budget);
        var group = reader.Group('(', ')'); reader.Complete();
        var parts = Options.Split(group, ',', budget);
        if (parts.Count != 2)
        {
            // Named/calc coordinates need the evaluator's source-aware symbol
            // table. Keep the existing explicit (x,y) arithmetic unchanged.
            if (state.CoordinateValue is null) throw new CompileError("TIKZ001", "Expected (x,y).", source);
            var coordinateReader = new Cursor(source, budget);
            var coordinate = CoordinateReader.Read(coordinateReader, budget);
            coordinateReader.Complete();
            return state.CoordinateValue(coordinate, state);
        }
        var x = state.Number(parts[0], budget); var y = state.Number(parts[1], budget);
        return (x.HasUnit ? new Point(x.Bp, 0) : PgfTransform.Scale(state.XBasis, x.Value, budget, source))
            + (y.HasUnit ? new Point(0, y.Bp) : PgfTransform.Scale(state.YBasis, y.Value, budget, source));
    }
}

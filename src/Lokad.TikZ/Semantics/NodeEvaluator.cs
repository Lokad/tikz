using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Text;

namespace Lokad.TikZ.Semantics;

internal sealed partial class Evaluator
{
    private readonly Dictionary<string, ResolvedNode> _nodes = new(StringComparer.Ordinal);
    private readonly Dictionary<TextFont, NodeFontMetrics> _nodeMetrics = [];
    private readonly Dictionary<(string, int), int> _outlines = [];

    private NodeFontMetrics Metrics(TextFont font, Source source)
    {
        if (_nodeMetrics.TryGetValue(font, out var metrics)) { budget.Charge(source); return metrics; }
        metrics = NodeFontMetrics.Resolve(font, budget, source);
        _nodeMetrics.Add(font, metrics);
        return metrics;
    }

    private Point NodeAnchor(string reference, Source source)
    {
        var separator = reference.IndexOf('.');
        var name = separator < 0 ? reference : reference[..separator];
        var anchor = separator < 0 ? "center" : reference[(separator + 1)..];
        if (_nodes.TryGetValue(name, out var node))
        {
            return PgfTransform.Apply(node.Transform, node.Layout.Anchor(anchor, Metrics(TextFont.Default, source), budget, source).Bp, budget, source);
        }
        if (separator >= 0 && anchor == "center" && _coordinates.TryGetValue(name, out var coordinate)) return coordinate;
        throw new CompileError("TIKZ003", $"Unknown coordinate '{reference}'.", source);
    }

    private ResolvedNode? ImplicitNode(Coordinate coordinate)
        => coordinate.Calculation is null && coordinate.X is null && !coordinate.Name.Contains('.') && _nodes.TryGetValue(coordinate.Name, out var node) ? node : null;

    private Point NodeBorder(ResolvedNode node, Point toward, Affine queryFrame, Source source)
    {
        budget.Charge(source, 24);
        var local = PgfCoordinates.ToLocal(PgfTransform.Apply(queryFrame, toward, budget, source), node.Transform, source);
        var direction = new NodePoint(ToSp(local.X - node.Layout.Center.Bp.X, source), ToSp(local.Y - node.Layout.Center.Bp.Y, source));
        var x = Math.Abs((long)direction.X) < 65536 ? 10L * direction.X : 655360;
        var y = Math.Abs((long)direction.Y) < 65536 ? 10L * direction.Y : 655360;
        // pgfpointshapeborder returns the center when its squared scaled
        // direction is less than .04pt (roughly a .02pt radius).
        var hit = x * x / 65536 + y * y / 65536 < 2621 ? node.Layout.Center : node.Layout.Border(direction, budget, source);
        var global = PgfTransform.Apply(node.Transform, hit.Bp, budget, source);
        return PgfCoordinates.ToLocal(global, queryFrame, source);
    }

    private void Node(NodeStatement statement, EvaluationState parent, Func<NodeSettings, Affine>? placement = null, List<Action>? deferred = null)
    {
        budget.CheckNodeCapacity(statement.Source);
        var at = statement.At is null ? PgfTransform.Apply(parent.Transform, default, budget, statement.Source) : Resolve(statement.At, parent, default, out _);
        var state = parent.Clone(budget, statement.Source);
        state.Transform = Affine.Identity;
        state.IsNodeContext = true;
        state.IsPathLabel = placement is not null;
        // TikZ clears path modes before every node, retaining the inherited pen.
        state.Paint = state.Paint with { Stroke = false, Fill = false };
        KeyRegistry.ApplyStyle("every node", state, budget, statement.Source);
        KeyRegistry.Apply(statement.Options, state, budget);
        KeyRegistry.ApplyStyle("every " + state.Node.Shape.ToString().ToLowerInvariant() + " node", state, budget, statement.Source);
        var nodeFont = NodeSettings.ApplyFont(state.Node.NodeFont, TextFont.Default, budget);
        var textFont = NodeSettings.ApplyFont(state.Node.Font, nodeFont, budget);
        var metrics = Metrics(nodeFont, statement.Source);
        state.Variables[FontRelativeLiteral.EmVariable] = new(metrics.QuadSp, false);
        state.Variables[FontRelativeLiteral.ExVariable] = new(metrics.XHeightSp, false);
        state.IsNodeContext = false;
        KeyRegistry.Apply(state.NodeTransforms, state, budget);
        if (state.NodeLineWidth is { } lineWidth)
        {
            var width = state.Dimension(lineWidth, budget);
            if (width < 0) throw new CompileError("TIKZ001", "Line width cannot be negative.", lineWidth);
            state.Paint = state.Paint with { Width = width };
        }
        // PGF stores the stroke dimension in a TeX register. Use that same
        // integer width for both shape defaults and emitted paint/bounds.
        var lineWidthSp = ToSp(state.Paint.Width, statement.Source);
        state.Paint = state.Paint with { Width = new NodePoint(lineWidthSp, 0).Bp.X };
        DashPattern.Resolve(state, budget);
        var dimensions = NodeDimensions.Default(metrics, lineWidthSp);
        dimensions = dimensions with {
            InnerXSp = Dimension(state.Node.InnerX, dimensions.InnerXSp), InnerYSp = Dimension(state.Node.InnerY, dimensions.InnerYSp),
            OuterXSp = Dimension(state.Node.OuterX, dimensions.OuterXSp), OuterYSp = Dimension(state.Node.OuterY, dimensions.OuterYSp),
            MinimumWidthSp = Dimension(state.Node.MinimumWidth, dimensions.MinimumWidthSp), MinimumHeightSp = Dimension(state.Node.MinimumHeight, dimensions.MinimumHeightSp)
        };
        var label = new LabelParser(statement.Label, budget).Parse();
        if (state.Node.Alignment is null && label.Any(item => item is LabelBreak))
            throw new CompileError("TIKZ002", "Explicit node line breaks require align=left, center or right.", statement.Label);
        var text = TextLayout.Layout(label, statement.Label, textFont, state.Node.Alignment ?? TextAlignment.Left, budget);
        INodeLayout layout = state.Node.Shape == NodeShape.Rectangle
            ? RectangleNodeLayout.Resolve(text, dimensions, budget, statement.Source)
            : CurvedNodeLayout.Resolve(state.Node.Shape, text, dimensions, budget, statement.Source);
        if (state.Node.Positioning is { } positioned)
        {
            if (statement.At is not null)
                throw new CompileError("TIKZ002", "Combining positioned nodes with explicit at coordinates is not supported.", statement.At.Source);
            at = PositionedAt(positioned, parent);
        }
        var anchor = layout.Anchor(state.Node.Anchor, metrics, budget, state.Node.AnchorSource ?? statement.Source).Bp;
        var frame = placement is not null ? placement(state.Node) : state.Node.TransformShape
            ? new Affine(parent.Transform.A, parent.Transform.B, parent.Transform.C, parent.Transform.D, at.X, at.Y)
            : Affine.Translation(at.X, at.Y);
        if (state.Node.Positioning is { } placementSettings)
        {
            // PGF's saved positioning shift precedes local node transforms,
            // after the ordinary transform-shape/reset policy has been applied.
            var gap = PositioningShift(placementSettings, state);
            frame = PgfTransform.Then(frame, Affine.Translation(gap.X, gap.Y), budget, placementSettings.Distance);
        }
        frame = PgfTransform.Then(frame, state.Transform, budget, statement.Source);
        frame = PgfTransform.Then(frame, Affine.Translation(-anchor.X, -anchor.Y), budget, statement.Source);
        var node = new ResolvedNode(statement.Name, layout, frame, textFont, nodeFont, statement.Source);
        var id = _scene.Nodes.Count;
        _scene.Nodes.Add(node);
        if (statement.Name.Length > 0) { _coordinates.Remove(statement.Name); _nodes[statement.Name] = node; }
        var background = layout.Background(frame, budget, statement.Source);
        var drawables = new List<Drawable>();
        if (state.RelevantForPictureSize)
        {
            var box = Bounds.Empty;
            ReadOnlySpan<NodePoint> corners = [new(0, -text.DepthSp), new(text.WidthSp, -text.DepthSp),
                new(0, text.HeightSp), new(text.WidthSp, text.HeightSp)];
            foreach (var point in corners)
                box = box.Add(PgfTransform.Apply(frame, point.Bp, budget, statement.Source));
            var shapeBounds = state.Paint.Stroke ? background.ControlBounds.Inflate(state.Paint.Width / 2) : background.ControlBounds;
            _scene.PictureBounds = _scene.PictureBounds.Union(box).Union(shapeBounds);
        }
        if (state.Paint.Fill || state.Paint.Stroke)
        {
            var ink = state.Paint.VisibleStroke
                ? layout is RectangleNodeLayout
                    ? PolygonStrokeBounds.Calculate([background.Segments[0].End, background.Segments[1].End,
                        background.Segments[2].End, background.Segments[3].End], state.Paint, budget, statement.Source)
                    : PathStrokeBounds.Calculate(background, state.Paint, budget, statement.Source)
                : state.Paint.VisibleFill ? background.Bounds : Bounds.Empty;
            ink = Clipped(ink);
            _scene.InkBounds = _scene.InkBounds.Union(ink);
            drawables.Add(new PaintedPath(background, state.Paint, [.. state.Clips], statement.Source, ink));
        }
        var glyphs = text.Glyphs.Length == 0 ? [] : new ResolvedGlyph[text.Glyphs.Length];
        var opacity = state.Node.TextOpacity ?? state.Paint.FillOpacity;
        for (var index = 0; index < text.Glyphs.Length; index++)
        {
            var glyph = text.Glyphs[index];
            budget.Charge(glyph.Source);
            if (!_outlines.TryGetValue((glyph.FontId, glyph.Slot), out var outline))
            {
                outline = _scene.Outlines.Count;
                _scene.Outlines.Add(GlyphOutline.Get(glyph.FontId, glyph.Slot, budget, glyph.Source));
                _outlines.Add((glyph.FontId, glyph.Slot), outline);
            }
            var local = new NodePoint(glyph.XSp, -glyph.YSp).Bp;
            var transform = frame.Then(Affine.Translation(local.X, local.Y)).Then(Affine.Scale(1, -1));
            var ink = Clipped(_scene.Outlines[outline].Ink(transform, budget, glyph.Source));
            glyphs[index] = new(outline, glyph, transform, ink);
            if (opacity > 0) _scene.InkBounds = _scene.InkBounds.Union(ink);
        }
        var rules = text.Rules.Length == 0 ? [] : new ResolvedRule[text.Rules.Length];
        for (var index = 0; index < text.Rules.Length; index++)
        {
            var rule = text.Rules[index];
            budget.Charge(rule.Source);
            var local = new NodePoint(rule.XSp, -rule.YSp).Bp;
            var transform = frame.Then(Affine.Translation(local.X, local.Y)).Then(Affine.Scale(1, -1));
            var ink = Bounds.Empty;
            if (rule.WidthSp > 0 && rule.HeightSp > 0)
            {
                var width = new NodePoint(rule.WidthSp, rule.HeightSp).Bp;
                ReadOnlySpan<Point> corners = [default, new(width.X, 0), width, new(0, width.Y)];
                foreach (var corner in corners)
                {
                    budget.Segment(rule.Source);
                    ink = ink.Add(PgfTransform.Apply(transform, corner, budget, rule.Source));
                }
                ink = Clipped(ink);
                if (opacity > 0) _scene.InkBounds = _scene.InkBounds.Union(ink);
            }
            rules[index] = new(rule, transform, ink);
        }
        drawables.Add(new PaintedGlyphRun(glyphs, text.Readable, state.Node.TextColor, opacity,
            [.. state.Clips], statement.Label, id) { Rules = rules, PaintOrder = text.PaintOrder });
        if (deferred is null) PaintNode(); else deferred.Add(PaintNode);

        void PaintNode()
        {
            foreach (var drawable in drawables)
            {
                budget.Charge(drawable.Source);
                if (drawable is PaintedPath painted) _scene.Add(painted); else _scene.Drawables.Add(drawable);
            }
        }

        int Dimension(Source? source, int fallback) => source is { } value ? ToSp(state.Dimension(value, budget), value) : fallback;
        Bounds Clipped(Bounds ink)
        {
            foreach (var clip in state.Clips) { budget.Charge(statement.Source); ink = ink.Intersect(_scene.Clips[clip].Bounds); }
            return ink;
        }
    }

    private int ToSp(double bp, Source source)
    {
        budget.Check(bp, source);
        var sp = Math.Round(bp * (72.27 * 65536 / 72), MidpointRounding.AwayFromZero);
        if (!double.IsFinite(sp) || sp is < -1073741823 or > 1073741823) Budget.Fail(source, "node dimension");
        return (int)sp;
    }
}

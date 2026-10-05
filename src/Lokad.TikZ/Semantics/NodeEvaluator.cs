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
        => coordinate.X is null && !coordinate.Name.Contains('.') && _nodes.TryGetValue(coordinate.Name, out var node) ? node : null;

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

    private void Node(NodeStatement statement, EvaluationState parent)
    {
        var at = statement.At is null ? PgfTransform.Apply(parent.Transform, default, budget, statement.Source) : Resolve(statement.At, parent, default, out _);
        var state = parent.Clone(budget, statement.Source);
        state.Transform = Affine.Identity;
        state.IsNodeContext = true;
        if (state.Styles.TryGetValue("every node", out var every)) KeyRegistry.Apply(every, state, budget);
        KeyRegistry.Apply(statement.Options, state, budget);
        if (state.Styles.TryGetValue("every " + state.Node.Shape.ToString().ToLowerInvariant() + " node", out var shapeStyle)) KeyRegistry.Apply(shapeStyle, state, budget);
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
        var dimensions = NodeDimensions.Default(metrics, lineWidthSp);
        dimensions = dimensions with {
            InnerXSp = Dimension(state.Node.InnerX, dimensions.InnerXSp), InnerYSp = Dimension(state.Node.InnerY, dimensions.InnerYSp),
            OuterXSp = Dimension(state.Node.OuterX, dimensions.OuterXSp), OuterYSp = Dimension(state.Node.OuterY, dimensions.OuterYSp),
            MinimumWidthSp = Dimension(state.Node.MinimumWidth, dimensions.MinimumWidthSp), MinimumHeightSp = Dimension(state.Node.MinimumHeight, dimensions.MinimumHeightSp)
        };
        var label = new LabelParser(statement.Label, budget).Parse();
        if (state.Node.Alignment is null && label.Any(item => item is LabelBreak))
            throw new CompileError("TIKZ002", "Explicit node line breaks require align=left, center or right.", statement.Label);
        var text = new TextLayout().Layout(label, statement.Label, textFont, state.Node.Alignment ?? TextAlignment.Left, budget);
        INodeLayout layout = state.Node.Shape == NodeShape.Rectangle
            ? RectangleNodeLayout.Resolve(text, dimensions, budget, statement.Source)
            : CurvedNodeLayout.Resolve(state.Node.Shape, text, dimensions, budget, statement.Source);
        var anchor = layout.Anchor(state.Node.Anchor, metrics, budget, state.Node.AnchorSource ?? statement.Source).Bp;
        var frame = state.Node.TransformShape
            ? new Affine(parent.Transform.A, parent.Transform.B, parent.Transform.C, parent.Transform.D, at.X, at.Y)
            : Affine.Translation(at.X, at.Y);
        frame = PgfTransform.Then(frame, state.Transform, budget, statement.Source);
        frame = PgfTransform.Then(frame, Affine.Translation(-anchor.X, -anchor.Y), budget, statement.Source);
        var node = new ResolvedNode(statement.Name, layout, frame, textFont, nodeFont, statement.Source);
        var id = _scene.Nodes.Count;
        _scene.Nodes.Add(node);
        if (statement.Name.Length > 0) { _coordinates.Remove(statement.Name); _scene.Coordinates.Remove(statement.Name); _nodes[statement.Name] = node; }
        var background = layout.Background(frame, budget, statement.Source);
        if (state.RelevantForPictureSize)
        {
            var box = Bounds.Empty;
            foreach (var point in new[] { new NodePoint(0, -text.DepthSp), new NodePoint(text.WidthSp, -text.DepthSp),
                new NodePoint(0, text.HeightSp), new NodePoint(text.WidthSp, text.HeightSp) })
                box = box.Add(PgfTransform.Apply(frame, point.Bp, budget, statement.Source));
            var shapeBounds = state.Paint.Stroke ? background.ControlBounds.Inflate(state.Paint.Width / 2) : background.ControlBounds;
            _scene.PictureBounds = _scene.PictureBounds.Union(box).Union(shapeBounds);
        }
        if (state.Paint.Fill || state.Paint.Stroke)
        {
            var ink = state.Paint.Stroke
                ? layout is RectangleNodeLayout
                    ? PolygonStrokeBounds.Calculate(background.Segments.Take(4).Select(segment => segment.End).ToArray(), state.Paint, budget, statement.Source)
                    : PathStrokeBounds.Calculate(background, state.Paint, budget, statement.Source)
                : background.Bounds;
            ink = Clipped(ink);
            _scene.InkBounds = _scene.InkBounds.Union(ink);
            _scene.Add(new(background, state.Paint, [.. state.Clips], statement.Source, ink));
        }
        var glyphs = new List<ResolvedGlyph>();
        var opacity = state.Node.TextOpacity ?? state.Paint.FillOpacity;
        foreach (var glyph in text.Glyphs)
        {
            budget.Charge(glyph.Source);
            if (!_outlines.TryGetValue((glyph.FontId, glyph.Slot), out var outline))
            {
                var resource = TextLayout.Font(glyph.FontId).Glyphs[glyph.Slot];
                outline = _scene.Outlines.Count;
                _scene.Outlines.Add(GlyphOutline.Parse(glyph.FontId, glyph.Slot, resource.PathBp, budget, glyph.Source));
                _outlines.Add((glyph.FontId, glyph.Slot), outline);
            }
            var local = new NodePoint(glyph.XSp, -glyph.YSp).Bp;
            var transform = frame.Then(Affine.Translation(local.X, local.Y)).Then(Affine.Scale(1, -1));
            var ink = Clipped(_scene.Outlines[outline].Ink(transform, budget, glyph.Source));
            glyphs.Add(new(outline, glyph, transform, ink));
            if (opacity > 0) _scene.InkBounds = _scene.InkBounds.Union(ink);
        }
        _scene.Drawables.Add(new PaintedGlyphRun([.. glyphs], text.Readable, state.Node.TextColor, opacity,
            [.. state.Clips], statement.Label, id));

        int Dimension(Source? source, int fallback) => source is { } value ? ToSp(state.Dimension(value, budget), value) : fallback;
        Bounds Clipped(Bounds ink)
        {
            foreach (var clip in state.Clips) { budget.Charge(statement.Source); ink = ink.Intersect(_scene.Clips[clip].Path.Bounds); }
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

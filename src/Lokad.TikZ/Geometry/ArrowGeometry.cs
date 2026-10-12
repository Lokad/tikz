using Lokad.TikZ.Frontend;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Geometry;

internal sealed record ArrowPlacement(string Side, ArrowTemplate Template, Affine Transform,
    long ShorteningSp, long TotalLengthSp, Source Source, Source ShaftSource);
internal sealed record ArrowLowering(GraphicPath Shaft, ArrowPlacement[] Tips);

internal static class ArrowGeometry
{
    public static ArrowLowering Lower(GraphicPath path, EvaluationState state, Budget budget, Source source)
    {
        if (!state.Arrows.Active || !state.Paint.Stroke || path.Segments.Count == 0) return new(path, []);
        foreach (var segment in path.Segments)
        {
            budget.Charge(source);
            // PGF suppresses normal path tips and shortening when any subpath
            // is closed, including a closed part of a compound path.
            if (segment.Kind == SegmentKind.Close) return new(path, []);
        }
        budget.Charge(source, path.Segments.Count);
        var segments = new List<Segment>(path.Segments);
        var first = segments.FindLastIndex(s => s.Kind == SegmentKind.Move);
        if (first < 0) throw new InvalidOperationException("Arrow path has no move.");
        ArrowPlacement? end = Prepare("end", state.Arrows.End, state.Arrows.ShortenEndSp);
        ArrowPlacement? start = Prepare("start", state.Arrows.Start, state.Arrows.ShortenStartSp);
        var shaft = GraphicPath.FromOwnedSegments(segments, budget, source);
        return new(shaft, start is null ? end is null ? [] : [end] : end is null ? [start] : [start, end]);

        ArrowPlacement? Prepare(string side, ArrowSpec? spec, long additional)
        {
            if (spec is null && additional == 0) return null;
            budget.Charge(spec?.Source ?? source, 8);
            var template = spec is null ? null : ArrowTemplates.Create(spec, state, budget);
            var distance = PgfDirection.Checked((template is null ? 0 : template.TipEndSp - template.LineEndSp) + additional, source);
            var total = PgfDirection.Checked((template is null ? 0 : template.TipEndSp - template.BackEndSp) + additional, source);
            var index = side == "end" ? segments.Count - 1 : first;
            var endpoint = segments[index].End;
            var reference = endpoint;
            if (first != segments.Count - 1)
            {
                if (side == "end")
                {
                    var last = segments[^1]; reference = segments[^2].End;
                    if (last.Kind == SegmentKind.Cubic)
                        reference = last.B != endpoint ? last.B : last.A != endpoint ? last.A : reference;
                }
                else
                {
                    var next = segments[first + 1]; reference = next.End;
                    if (next.Kind == SegmentKind.Cubic)
                        reference = next.A != endpoint ? next.A : next.B != endpoint ? next.B : reference;
                }
                if (distance != 0)
                {
                    // Quick curve shortening changes the endpoint only. In
                    // particular, zero-length and over-shortened paths are
                    // preserved with PGF's normalization, without clamping.
                    var direction = PgfDirection.Normalize(Sp(reference - endpoint), budget, source);
                    var shortened = endpoint + PgfTransform.Scale(direction.Bp, distance / 65536.0, budget, source);
                    segments[index] = segments[index] with { End = shortened };
                }
            }
            if (template is null) return null;
            var outward = PgfDirection.Normalize(Sp(endpoint - reference), budget, source);
            var a = PgfTransform.Printed(outward.X); var b = PgfTransform.Printed(outward.Y);
            var matrix = new Affine(a, b, -b, a, endpoint.X, endpoint.Y);
            // Two native shifts are observable after finite multiplication;
            // combining them into one real-valued tip-end shift loses sp.
            matrix = PgfTransform.Then(matrix, Affine.Translation(-total / ArrowTemplates.SpPerBp, 0), budget, source);
            matrix = PgfTransform.Then(matrix, Affine.Translation(-template.BackEndSp / ArrowTemplates.SpPerBp, 0), budget, source);
            return new(side, template, matrix, distance, total, spec!.Source, source);
        }
        NodePoint Sp(Point point) => new(
            PgfDirection.Checked((long)Math.Round(point.X * ArrowTemplates.SpPerBp, MidpointRounding.AwayFromZero), source),
            PgfDirection.Checked((long)Math.Round(point.Y * ArrowTemplates.SpPerBp, MidpointRounding.AwayFromZero), source));
    }

    public static Bounds InkBounds(ArrowPlacement tip, Budget budget)
    {
        var transformed = new GraphicPath(budget, tip.Source);
        foreach (var segment in tip.Template.Path.Segments)
        {
            budget.Charge(tip.Source);
            transformed.Add(segment with { End = tip.Transform.Apply(segment.End),
                A = tip.Transform.Apply(segment.A), B = tip.Transform.Apply(segment.B) });
        }
        var scale = Math.Sqrt(tip.Transform.A * tip.Transform.A + tip.Transform.B * tip.Transform.B);
        return tip.Template.Paint.Stroke ? PathStrokeBounds.Calculate(transformed, tip.Template.Paint with { Width = tip.Template.Paint.Width * scale }, budget, tip.Source)
            : transformed.Bounds;
    }
}

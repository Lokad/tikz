using System.Globalization;
using System.Collections.Concurrent;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Text;

// A per-conversion catalogue bounds work and deduplicates emitted definitions.
// Outlines are trusted embedded data, never submitted SVG or installed fonts.
internal sealed record GlyphOutline(string FontId, int Slot, string PathBp, Segment[] Segments)
{
    private static readonly ConcurrentDictionary<(string FontId, int Slot), GlyphOutline> Embedded = new();

    internal static GlyphOutline Get(string fontId, int slot, Budget budget, Source source)
    {
        // Validate against the finite bundled catalogue before touching the
        // cache. Retained entries contain font geometry, never caller sources.
        var glyph = fontId.StartsWith("math-", StringComparison.Ordinal) ? MathLayout.Glyph(fontId, slot)
            : TextLayout.Font(fontId).Glyphs[slot];
        var key = (fontId, slot);
        if (Embedded.TryGetValue(key, out var outline))
        {
            // Admit the same logical outline on every conversion, regardless
            // of cache warmth. Source-aware failures/cancellation stay local.
            budget.Charge(source, glyph.PathBp.Length);
            foreach (var _ in outline.Segments) budget.Segment(source);
            return outline;
        }
        var parsed = Parse(fontId, slot, glyph.PathBp, budget, source);
        // Interrupted/limited parsing never populates or poisons an entry.
        return Embedded.GetOrAdd(key, parsed);
    }

    internal Bounds Ink(Affine transform, Budget budget, Source source)
        => PathBounds.Calculate(TransformSegments(transform, budget, source), budget, source);
    private IEnumerable<Segment> TransformSegments(Affine transform, Budget budget, Source source)
    {
        foreach (var segment in Segments)
        {
            budget.Charge(source);
            var end = Point(segment.End);
            yield return segment.Kind == SegmentKind.Cubic ? new(segment.Kind, end, Point(segment.A), Point(segment.B))
                : new(segment.Kind, end, default, default);
        }
        Point Point(Point point)
        {
            var result = transform.Apply(point);
            budget.Check(result.X, source); budget.Check(result.Y, source);
            return result;
        }
    }

    internal static GlyphOutline Parse(string fontId, int slot, string path, Budget budget, Source source)
    {
        var reader = new OutlineReader(path, budget, source);
        return new(fontId, slot, path, reader.Read());
    }

    private sealed class OutlineReader(string path, Budget budget, Source source)
    {
        private int _position;
        private Point _current, _start, _control;
        private char _previous;
        private readonly List<Segment> _segments = [];
        internal Segment[] Read()
        {
            budget.Charge(source, path.Length);
            var command = '\0';
            while (Skip())
            {
                if (char.IsAsciiLetter(path[_position])) command = path[_position++];
                switch (command)
                {
                    case 'M': _current = Point(); _start = _current; Add(SegmentKind.Move); command = 'L'; break;
                    case 'L': _current = Point(); Add(SegmentKind.Line); break;
                    case 'H': _current = _current with { X = Number() }; Add(SegmentKind.Line); break;
                    case 'V': _current = _current with { Y = Number() }; Add(SegmentKind.Line); break;
                    case 'C': var a = Point(); var b = Point(); _current = Point(); Add(SegmentKind.Cubic, a, b); _control = b; break;
                    case 'S': var reflected = _previous is 'C' or 'S' ? _current * 2 - _control : _current;
                        var control = Point(); _current = Point(); Add(SegmentKind.Cubic, reflected, control); _control = control; break;
                    case 'Z': _current = _start; Add(SegmentKind.Close); command = '\0'; break;
                    default: throw new InvalidOperationException("Unsupported bundled outline command.");
                }
                _previous = command == 'L' && _segments[^1].Kind == SegmentKind.Move ? 'M' : command;
            }
            return [.. _segments];
        }
        private void Add(SegmentKind kind, Point a = default, Point b = default)
        {
            budget.Segment(source);
            _segments.Add(new(kind, _current, a, b));
        }
        private Point Point() => new(Number(), Number());
        private bool Skip()
        {
            while (_position < path.Length && path[_position] is ' ' or ',' or '\r' or '\n') _position++;
            return _position < path.Length;
        }
        private double Number()
        {
            Skip();
            var start = _position;
            if (_position < path.Length && path[_position] is '+' or '-') _position++;
            while (_position < path.Length && (char.IsAsciiDigit(path[_position]) || path[_position] == '.')) _position++;
            if (_position < path.Length && path[_position] is 'e' or 'E')
            {
                _position++;
                if (_position < path.Length && path[_position] is '+' or '-') _position++;
                while (_position < path.Length && char.IsAsciiDigit(path[_position])) _position++;
            }
            if (!double.TryParse(path.AsSpan(start, _position - start), NumberStyles.Float, CultureInfo.InvariantCulture, out var value)
                || !double.IsFinite(value)) throw new InvalidOperationException("Invalid bundled outline number.");
            return value;
        }
    }
}

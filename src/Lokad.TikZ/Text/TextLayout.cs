using System.Buffers;
using System.Collections.Frozen;
using System.Text;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Text;

internal abstract record TextMark(Source Source);
internal sealed record PlacedGlyph(string FontId, int Slot, int XSp, int YSp, Source Source) : TextMark(Source);
internal sealed record PlacedRule(int XSp, int YSp, int WidthSp, int HeightSp, Source Source) : TextMark(Source);
internal sealed record TextLine(int WidthSp, int HeightSp, int DepthSp, int BaselineSp);
internal sealed record MeasuredText(int WidthSp, int HeightSp, int DepthSp, string Readable,
    PlacedGlyph[] Glyphs, TextLine[] Lines)
{
    internal PlacedRule[] Rules { get; init; } = [];
    // Nonnegative entries index glyphs; negative entries encode -ruleIndex-1.
    internal int[] PaintOrder { get; init; } = [];
}

internal interface ITextLayout
{
    MeasuredText Layout(List<LabelItem> program, Source source, TextFont initialFont,
        TextAlignment alignment, Budget budget);
}

internal sealed class TextLayout : ITextLayout
{
    private sealed record Face(FontData Data, FrozenDictionary<int, FontPair> Pairs);
    private static readonly FrozenDictionary<string, Lazy<Face>> Faces = new[] {
        "regular-10", "bold-10", "italic-10", "regular-12", "bold-12", "italic-12"
    }.ToFrozenDictionary(id => id, id => new Lazy<Face>(() => {
        var data = FontData.Load(id);
        return new(data, data.Pairs.ToFrozenDictionary(p => p.Left * 256 + p.Right));
    }), StringComparer.Ordinal);

    // Node defaults use the surrounding node font, which can differ from the
    // font selected inside the label. Share the bounded six-face resource cache.
    internal static FontData Font(TextFont font) => Faces[font.Id].Value.Data;
    internal static FontData Font(string id) => Faces.TryGetValue(id, out var face)
        ? face.Value.Data : throw new ArgumentException("Unknown bundled font face.", nameof(id));

    public MeasuredText Layout(List<LabelItem> program, Source source, TextFont initialFont,
        TextAlignment alignment, Budget budget)
        => new Builder(source, initialFont, alignment, budget).Build(program);

    private sealed class Builder(Source source, TextFont initialFont, TextAlignment alignment, Budget budget)
    {
        private enum PieceKind { Glyph, Glue, Kern, Math }
        private sealed record Piece(PieceKind Kind, int Amount, Face? Face, int Slot, Source Source);
        private sealed record Pending(Face Face, int Slot, Source Source);
        private sealed record Line(List<TextMark> Paint, int Width, int Height, int Depth);
        private readonly Dictionary<string, Face> _faces = new(StringComparer.Ordinal);
        private readonly List<Piece> _pieces = [];
        private readonly List<TextMark> _paint = [];
        private readonly List<Line> _lines = [];
        private readonly StringBuilder _readable = new();
        private readonly TextFont _initialFont = initialFont;
        private TextFont _font = initialFont;
        private Pending? _pending;
        private MathLayout? _math;
        private int _width, _height, _depth;
        private int _spaceFactor = 1000;
        private bool _ignoreLeading = true;

        internal MeasuredText Build(List<LabelItem> program)
        {
            if (_initialFont.SizePt is not (10 or 12) || _initialFont.Bold && _initialFont.Italic || !Enum.IsDefined(alignment))
                throw new ArgumentException("Invalid bundled text-layout profile.");
            Walk(program, 0);
            FinishLine();
            var width = _lines.Max(l => l.Width);
            var baselines = new int[_lines.Count];
            var baselineSkip = (_initialFont.SizePt == 10 ? 12 : 14) * 65536;
            for (var index = 1; index < _lines.Count; index++)
            {
                budget.Charge(source);
                var natural = _lines[index - 1].Depth + _lines[index].Height;
                baselines[index] = Dimension((long)baselines[index - 1] + (natural > baselineSkip ? natural + 65536 : baselineSkip));
            }
            var lastBaseline = baselines[^1];
            var glyphs = new List<PlacedGlyph>();
            var rules = new List<PlacedRule>();
            var order = new List<int>();
            var lines = new List<TextLine>();
            for (var index = 0; index < _lines.Count; index++)
            {
                var line = _lines[index];
                var offset = alignment switch
                {
                    TextAlignment.Left => 0,
                    TextAlignment.Center => (width - line.Width + 1) / 2,
                    TextAlignment.Right => width - line.Width,
                    _ => throw new InvalidOperationException()
                };
                foreach (var mark in line.Paint)
                {
                    budget.Charge(mark.Source);
                    var baseline = baselines[index] - lastBaseline;
                    if (mark is PlacedGlyph glyph)
                    {
                        order.Add(glyphs.Count);
                        glyphs.Add(glyph with { XSp = Dimension((long)glyph.XSp + offset), YSp = Dimension((long)glyph.YSp + baseline) });
                    }
                    else if (mark is PlacedRule rule)
                    {
                        order.Add(-rules.Count - 1);
                        rules.Add(rule with { XSp = Dimension((long)rule.XSp + offset), YSp = Dimension((long)rule.YSp + baseline) });
                    }
                    else throw new InvalidOperationException();
                }
                lines.Add(new(line.Width, line.Height, line.Depth, baselines[index] - lastBaseline));
            }
            var height = Dimension((long)_lines[0].Height + lastBaseline);
            CheckDimension(width); CheckDimension(height); CheckDimension(_lines[^1].Depth);
            return new(width, height, _lines[^1].Depth, _readable.ToString(), glyphs.ToArray(), lines.ToArray())
                { Rules = rules.ToArray(), PaintOrder = order.ToArray() };
        }

        private Face GetFace(Source origin)
        {
            if (_faces.TryGetValue(_font.Id, out var face)) return face;
            // Charge deterministic setup work even when another conversion has
            // warmed the process-wide, bounded six-face cache.
            budget.Charge(origin, 256 + (_font.Bold ? 2492 : _font.Italic ? 3731 : 2499));
            face = Faces[_font.Id].Value;
            budget.Charge(origin);
            _faces.Add(_font.Id, face);
            return face;
        }

        private void Walk(List<LabelItem> items, int depth)
        {
            foreach (var (item, index) in items.Select((item, index) => (item, index)))
            {
                budget.Depth(item.Source, depth, budget.Limits.MaxNesting);
                if (_ignoreLeading && item is LabelSpace { Normal: true }) continue;
                _ignoreLeading = false;
                switch (item)
                {
                    case LabelLiteral literal:
                        var offset = 0;
                        while (offset < literal.Source.Length)
                        {
                            if (Rune.DecodeFromUtf16(literal.Source.Span[offset..], out var rune, out var consumed) != OperationStatus.Done)
                                throw new CompileError("TIKZ002", "Invalid Unicode scalar in text.", literal.Source.Slice(offset, 1));
                            var origin = literal.Source.Slice(offset, consumed);
                            budget.Charge(origin);
                            if (rune.Value == 0x00a0) Space(new(false, "\u00a0", origin));
                            else Append(TextProfile.Slot(rune.Value, origin), origin);
                            _readable.Append(rune.ToString());
                            offset += consumed;
                        }
                        break;
                    case LabelSymbol symbol:
                        Append(symbol.Slot, symbol.Source); _readable.Append(symbol.Readable); break;
                    case LabelSpace space:
                        Space(space); _readable.Append(space.Readable); break;
                    case LabelCorrection correction:
                        Flush(); Correction(correction.Source, false); break;
                    case LabelFont font:
                        Flush(); _font = _font.Apply(font.Change, font.Source); break;
                    case LabelGroup group:
                        Flush();
                        var previous = _font;
                        if (group.Change.HasValue) _font = _font.Apply(group.Change.Value, group.Source);
                        var correct = group.AutoCorrection && group.Items.Count != 0 && group.Items is not [LabelSpace];
                        if (correct && !StartsWithPunctuation(group.Items.FirstOrDefault())) Correction(group.Source, true);
                        Walk(group.Items, depth + 1);
                        Flush(); _font = previous;
                        if (correct && !StartsWithPunctuation(items.ElementAtOrDefault(index + 1))) Correction(group.Source, true);
                        break;
                    case LabelMath math:
                        Flush();
                        var box = (_math ??= new MathLayout(budget)).Layout(math, _font.SizePt, depth);
                        foreach (var mark in box.Paint)
                        {
                            budget.Charge(mark.Source);
                            _paint.Add(mark switch {
                                PlacedGlyph g => g with { XSp = Dimension((long)_width + g.XSp) },
                                PlacedRule r => r with { XSp = Dimension((long)_width + r.XSp) },
                                _ => throw new InvalidOperationException()
                            });
                        }
                        _height = Math.Max(_height, box.Height); _depth = Math.Max(_depth, box.Depth);
                        AddPiece(new(PieceKind.Math, box.Width, null, 0, math.Source));
                        _spaceFactor = 1000; _readable.Append(math.Source.Value);
                        break;
                    case LabelBreak lineBreak:
                        Flush(); FinishLine(); _readable.Append('\n');
                        _font = _initialFont; _spaceFactor = 1000; _ignoreLeading = true;
                        budget.Charge(lineBreak.Source); break;
                    default: throw new InvalidOperationException("Unknown label item.");
                }
            }
        }

        private static bool StartsWithPunctuation(LabelItem? item)
            => item is LabelLiteral literal && literal.Source.Length > 0 && literal.Source.Span[0] is ',' or '.';

        private void Append(int slot, Source origin)
        {
            var face = GetFace(origin);
            var code = TextProfile.SpaceFactorCode(slot);
            if (code == 1000) _spaceFactor = 1000;
            else if (code < 1000) { if (code != 0) _spaceFactor = code; }
            else _spaceFactor = _spaceFactor < 1000 ? 1000 : code;
            if (_pending is not null)
            {
                if (_pending.Face == face && face.Pairs.TryGetValue(_pending.Slot * 256 + slot, out var pair))
                {
                    budget.Charge(origin);
                    if (pair.Ligature.HasValue)
                    {
                        var left = _pending.Source;
                        _pending = new(face, pair.Ligature.Value, left with { Length = origin.Offset + origin.Length - left.Offset });
                        return;
                    }
                    Flush();
                    AddPiece(new(PieceKind.Kern, FontData.ScaleFix(pair.KernFix!.Value, _font.SizePt * 65536), null, 0, origin));
                }
                else Flush();
            }
            _pending = new(face, slot, origin);
        }

        private void Flush()
        {
            if (_pending is null) return;
            var pending = _pending; _pending = null;
            var glyph = pending.Face.Data.Glyphs[pending.Slot];
            var sizeSp = pending.Face.Data.DesignSizeFix / 16;
            budget.Glyph(pending.Source);
            _paint.Add(new PlacedGlyph(pending.Face.Data.Id, pending.Slot, _width, 0, pending.Source));
            _height = Math.Max(_height, FontData.ScaleFix(glyph.HeightFix, sizeSp));
            _depth = Math.Max(_depth, FontData.ScaleFix(glyph.DepthFix, sizeSp));
            AddPiece(new(PieceKind.Glyph, FontData.ScaleFix(glyph.AdvanceFix, sizeSp), pending.Face, pending.Slot, pending.Source));
        }

        private void Space(LabelSpace space)
        {
            Flush();
            var face = GetFace(space.Source);
            var size = _font.SizePt * 65536;
            var amount = FontData.ScaleFix(face.Data.ParametersFix[1], size);
            if (space.Normal && _spaceFactor >= 2000) amount += FontData.ScaleFix(face.Data.ParametersFix[6], size);
            AddPiece(new(PieceKind.Glue, amount, null, 0, space.Source));
        }

        private void Correction(Source origin, bool automatic)
        {
            if (automatic && GetFace(origin).Data.ParametersFix[0] > 0) return;
            Piece? glue = null;
            if (automatic && _pieces.Count > 0 && _pieces[^1].Kind == PieceKind.Glue && _pieces[^1].Amount != 0)
            {
                glue = _pieces[^1]; _pieces.RemoveAt(_pieces.Count - 1); _width -= glue.Amount;
            }
            if (_pieces.Count > 0 && _pieces[^1] is { Kind: PieceKind.Glyph, Face: { } face } last)
            {
                var amount = FontData.ScaleFix(face.Data.Glyphs[last.Slot].ItalicFix, face.Data.DesignSizeFix / 16);
                AddPiece(new(PieceKind.Kern, amount, null, 0, origin));
            }
            if (glue is not null) AddPiece(glue);
        }

        private void AddPiece(Piece piece)
        {
            budget.Charge(piece.Source);
            var next = (long)_width + piece.Amount;
            if (next is < -1073741823 or > 1073741823) Budget.Fail(piece.Source, "text dimensions");
            _width = (int)next;
            CheckDimension(_width);
            _pieces.Add(piece);
        }

        private void FinishLine()
        {
            Flush();
            // TikZ ignores leading space tokens and removes the final glue
            // node, including explicit space glue left by a nested group.
            if (_pieces.Count > 0 && _pieces[^1].Kind == PieceKind.Glue)
            {
                _width -= _pieces[^1].Amount;
                if (_readable.Length > 0 && _readable[^1] is ' ' or '\u00a0') _readable.Length--;
            }
            _lines.Add(new([.. _paint], _width, _height, _depth));
            _pieces.Clear(); _paint.Clear(); _width = _height = _depth = 0;
        }

        private void CheckDimension(int sp) => budget.Check(sp * 72.0 / (72.27 * 65536), source);

        private int Dimension(long sp)
        {
            if (sp is < -1073741823 or > 1073741823) Budget.Fail(source, "text dimensions");
            CheckDimension((int)sp);
            return (int)sp;
        }
    }
}

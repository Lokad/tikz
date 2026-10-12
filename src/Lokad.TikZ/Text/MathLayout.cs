using System.Collections.Frozen;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Text;

// Integer math boxes consume accepted selected-size metrics. Text and math use
// separate alphabets, but share the measured-label and resolved-paint boundaries.
internal sealed class MathLayout(Budget budget)
{
    private sealed record Face(MathFontData Data, FrozenDictionary<int, FontGlyph> Glyphs,
        FrozenDictionary<int, FontPair> Pairs);
    private static readonly FrozenDictionary<string, Lazy<Face>> Faces =
        new[] { "roman", "italic", "symbol" }.SelectMany(f => new[] { 5, 6, 7, 8, 10, 12 }.Select(s => $"math-{f}-{s}"))
        .Append("math-extension-10").ToFrozenDictionary(id => id, id => new Lazy<Face>(() => {
            var data = MathFontData.Load(id);
            return new(data, data.Glyphs.ToFrozenDictionary(g => g.Slot), data.Pairs.ToFrozenDictionary(p => p.Left * 256 + p.Right));
        }), StringComparer.Ordinal);
    private readonly HashSet<string> _loaded = new(StringComparer.Ordinal);
    private int _surrounding;
    private readonly record struct Style(int Level, bool Cramped)
    {
        internal Style Smaller => new(Math.Min(2, Level + 1), Cramped);
        internal Style Cramp => this with { Cramped = true };
    }
    internal sealed class Box
    {
        internal int Width, Height, Depth;
        internal List<TextMark> Paint { get; } = [];
    }
    private sealed record Entry(MathItem Item, MathClass Class);

    internal static FontGlyph Glyph(string id, int slot) => Faces.TryGetValue(id, out var face)
        && face.Value.Glyphs.TryGetValue(slot, out var glyph) ? glyph
        : throw new ArgumentException("Unknown bundled math glyph.");

    internal Box Layout(LabelMath math, int surroundingSize, int depth)
    {
        if (surroundingSize is not (10 or 12)) throw new ArgumentException("Invalid math font size.");
        _surrounding = surroundingSize;
        return List(math.Body, new(0, false), MathAlphabet.Inherit, depth + 1);
    }
    private int Size(Style style) => (_surrounding, style.Level) switch { (10, 0) => 10, (10, 1) => 7, (10, _) => 5,
        (12, 0) => 12, (12, 1) => 8, (12, _) => 6, _ => throw new InvalidOperationException() };
    private Face Get(string family, Style style, Source source)
    {
        var size = family == "extension" ? 10 : Size(style);
        var id = FaceId(family, size);
        if (_loaded.Add(id))
        {
            budget.Charge(source, family switch { "roman" => 256 + 2455 + 21, "italic" => 128 + 164 + 6,
                "symbol" => 130 + 26 + 22, "extension" => 128 + 74 + 28 + 13, _ => throw new InvalidOperationException() });
        }
        budget.Charge(source);
        return Faces[id].Value;
    }
    private static string FaceId(string family, int size) => (family, size) switch
    {
        ("roman", 5) => "math-roman-5", ("roman", 6) => "math-roman-6",
        ("roman", 7) => "math-roman-7", ("roman", 8) => "math-roman-8",
        ("roman", 10) => "math-roman-10", ("roman", 12) => "math-roman-12",
        ("italic", 5) => "math-italic-5", ("italic", 6) => "math-italic-6",
        ("italic", 7) => "math-italic-7", ("italic", 8) => "math-italic-8",
        ("italic", 10) => "math-italic-10", ("italic", 12) => "math-italic-12",
        ("symbol", 5) => "math-symbol-5", ("symbol", 6) => "math-symbol-6",
        ("symbol", 7) => "math-symbol-7", ("symbol", 8) => "math-symbol-8",
        ("symbol", 10) => "math-symbol-10", ("symbol", 12) => "math-symbol-12",
        ("extension", 10) => "math-extension-10",
        _ => throw new InvalidOperationException("Invalid bundled math face.")
    };
    private Face Get(MathFamily family, Style style, Source source) => Get(family switch
        { MathFamily.Roman => "roman", MathFamily.Italic => "italic", MathFamily.Symbol => "symbol", _ => throw new InvalidOperationException() }, style, source);
    private int Parameter(string family, int number, Style style, Source source)
    {
        var face = Get(family, style, source);
        return FontData.ScaleFix(face.Data.ParametersFix[number - 1], face.Data.SizeSp);
    }
    private int Symbol(int number, Style style, Source source) => Parameter("symbol", number, style, source);
    private int Thickness(Style style, Source source) => Parameter("extension", 8, style, source);
    private int Mu(int units, Style style, Source source) => Dim((long)(Symbol(6, style, source) / 18) * units, source);
    private static int Half(int n) => n >= 0 ? (n + 1) / 2 : n / 2;
    private int Dim(long sp, Source source)
    {
        if (sp is < -1073741823 or > 1073741823) Budget.Fail(source, "math dimensions");
        budget.Check(sp * 72.0 / (72.27 * 65536), source);
        return (int)sp;
    }
    private void Append(Box target, Box child, int x, int y, Source source)
    {
        foreach (var mark in child.Paint)
        {
            budget.Charge(mark.Source);
            target.Paint.Add(mark switch {
                PlacedGlyph g => g with { XSp = Dim((long)x + g.XSp, g.Source), YSp = Dim((long)y + g.YSp, g.Source) },
                PlacedRule r => r with { XSp = Dim((long)x + r.XSp, r.Source), YSp = Dim((long)y + r.YSp, r.Source) },
                _ => throw new InvalidOperationException()
            });
        }
        target.Height = Math.Max(target.Height, Dim((long)child.Height - y, source));
        target.Depth = Math.Max(target.Depth, Dim((long)child.Depth + y, source));
    }
    private Box Character(Face face, int slot, Source source, bool italic, bool signed = false)
    {
        if (!face.Glyphs.TryGetValue(slot, out var glyph)) throw new CompileError("TIKZ002", "Missing bundled math glyph.", source);
        budget.Glyph(source);
        var box = new Box { Width = Dim((long)Metric(glyph.AdvanceFix) + (italic ? Metric(glyph.ItalicFix) : 0), source),
            Height = Metric(glyph.HeightFix), Depth = Metric(glyph.DepthFix) };
        if (!signed) { box.Height = Math.Max(0, box.Height); box.Depth = Math.Max(0, box.Depth); }
        box.Paint.Add(new PlacedGlyph(face.Data.Id, slot, 0, 0, source));
        return box;
        int Metric(int fix) => FontData.ScaleFix(fix, face.Data.SizeSp);
    }
    private MathGlyph? Simple(MathAtom atom, MathAlphabet alphabet)
    {
        budget.Charge(atom.Source);
        if (atom is MathGroup { Body.Items: [MathAtom { Class: MathClass.Ordinary } single] } group)
            return Simple(single, group.Alphabet == MathAlphabet.Inherit ? alphabet : group.Alphabet);
        return atom is MathGlyph g ? alphabet == MathAlphabet.Roman && g.Alphabetic && g.Family != MathFamily.Roman
            ? g with { Family = MathFamily.Roman } : g : null;
    }
    private Box List(MathList list, Style style, MathAlphabet alphabet, int depth)
    {
        budget.Depth(list.Source, depth, budget.Limits.MaxNesting);
        var entries = list.Items.Select(item => new Entry(item, item is MathAtom a ? a.Class : MathClass.Ordinary)).ToList();
        // Explicit mu glue does not change the preceding noad used for binary correction.
        var previous = MathClass.Operator;
        var last = -1;
        for (var i = 0; i < entries.Count; i++)
        {
            budget.Charge(entries[i].Item.Source);
            if (entries[i].Item is not MathAtom) continue;
            var cls = entries[i].Class;
            if (cls == MathClass.Binary && previous is MathClass.Binary or MathClass.Operator or MathClass.Relation or MathClass.Open or MathClass.Punctuation)
                entries[i] = entries[i] with { Class = MathClass.Ordinary };
            if (cls is MathClass.Relation or MathClass.Close or MathClass.Punctuation && last >= 0 && entries[last].Class == MathClass.Binary)
                entries[last] = entries[last] with { Class = MathClass.Ordinary };
            last = i; previous = entries[i].Class;
        }
        if (last >= 0 && entries[last].Class == MathClass.Binary) entries[last] = entries[last] with { Class = MathClass.Ordinary };
        // Keep remaining neighbors by index: removing a ligature's right atom
        // from an array-backed list would repeatedly shift a long upright word.
        var next = Enumerable.Range(1, entries.Count).ToArray();
        var result = new Box();
        MathClass? prior = null;
        for (var i = 0; i < entries.Count;)
        {
            var entry = entries[i]; var item = entry.Item;
            budget.Charge(item.Source);
            if (item is MathSpace space) { result.Width = Dim((long)result.Width + Mu(space.Mu, style, space.Source), space.Source); i = next[i]; continue; }
            var atom = (MathAtom)item;
            var direct = Simple(atom, alphabet);
            var neighbor = next[i];
            var nextAtom = neighbor < entries.Count ? entries[neighbor].Item as MathAtom : null;
            var nextDirect = nextAtom is MathScripts script ? Simple(script.Nucleus, alphabet) : nextAtom is null ? null : Simple(nextAtom, alphabet);
            var sameFamily = entry.Class == MathClass.Ordinary && direct is not null && nextDirect is not null
                && direct.Family == nextDirect.Family && entries[neighbor].Class != MathClass.Inner;
            var kern = 0;
            var suppressItalic = false;
            if (sameFamily)
            {
                var face = Get(direct!.Family, style, direct.Source);
                suppressItalic = face.Data.ParametersFix[1] != 0;
                if (face.Pairs.TryGetValue(direct.Slot * 256 + nextDirect!.Slot, out var pair))
                {
                    budget.Charge(item.Source);
                    if (pair.Ligature is { } ligature)
                    {
                        var origin = direct.Source with { Length = nextAtom!.Source.Offset + nextAtom.Source.Length - direct.Source.Offset };
                        var joined = direct with { Slot = ligature, Origin = origin, Source = origin };
                        MathAtom replacement = nextAtom is MathScripts scripts ? scripts with { Nucleus = joined, Origin = origin, Source = origin } : joined;
                        entries[i] = new(replacement, MathClass.Ordinary); next[i] = next[neighbor];
                        continue;
                    }
                    kern = FontData.ScaleFix(pair.KernFix!.Value, face.Data.SizeSp);
                }
            }
            if (prior.HasValue) result.Width = Dim((long)result.Width + Spacing(prior.Value, entry.Class, style, item.Source), item.Source);
            var box = direct is not null ? Character(Get(direct.Family, style, direct.Source), direct.Slot, direct.Source, !suppressItalic)
                : Atom(atom, style, alphabet, depth);
            Append(result, box, result.Width, 0, item.Source);
            result.Width = Dim((long)result.Width + box.Width + kern, item.Source);
            prior = entry.Class;
            i = next[i];
        }
        return result;
    }
    private int Spacing(MathClass left, MathClass right, Style style, Source source)
    {
        if (right == MathClass.Operator && left is MathClass.Ordinary or MathClass.Operator or MathClass.Close or MathClass.Inner) return Mu(3, style, source);
        if (left == MathClass.Operator && right == MathClass.Ordinary) return Mu(3, style, source);
        if (style.Level > 0) return 0;
        var units = (left, right) switch {
            (MathClass.Ordinary or MathClass.Close or MathClass.Inner, MathClass.Binary) => 4,
            (MathClass.Binary, MathClass.Ordinary or MathClass.Operator or MathClass.Open or MathClass.Inner) => 4,
            (MathClass.Ordinary or MathClass.Operator or MathClass.Close or MathClass.Inner, MathClass.Relation) => 5,
            (MathClass.Relation, MathClass.Ordinary or MathClass.Operator or MathClass.Open or MathClass.Inner) => 5,
            (MathClass.Ordinary or MathClass.Operator or MathClass.Close, MathClass.Inner) => 3,
            (MathClass.Punctuation, _) => 3,
            (MathClass.Inner, MathClass.Ordinary or MathClass.Open or MathClass.Punctuation or MathClass.Inner) => 3,
            _ => 0
        };
        return units == 0 ? 0 : Mu(units, style, source);
    }
    private Box Atom(MathAtom atom, Style style, MathAlphabet alphabet, int depth)
    {
        budget.Depth(atom.Source, depth, budget.Limits.MaxNesting);
        return atom switch {
            MathGlyph g => Character(Get(alphabet == MathAlphabet.Roman && g.Alphabetic ? MathFamily.Roman : g.Family, style, g.Source), g.Slot, g.Source, true),
            MathGroup g => List(g.Body, style, g.Alphabet == MathAlphabet.Inherit ? alphabet : g.Alphabet, depth + 1),
            MathScripts s => Scripts(s, style, alphabet, depth),
            MathFraction f => Fraction(f, style, alphabet, depth),
            MathRadical r => Radical(r, style, alphabet, depth),
            MathNegatedEquality n => Negation(n, style),
            _ => throw new InvalidOperationException("Unknown math atom.")
        };
    }
    private Box Scripts(MathScripts scripts, Style style, MathAlphabet alphabet, int depth)
    {
        var source = scripts.Source;
        var direct = Simple(scripts.Nucleus, alphabet);
        var nucleus = direct is null ? Atom(scripts.Nucleus, style, alphabet, depth)
            : Character(Get(direct.Family, style, direct.Source), direct.Slot, direct.Source, scripts.Subscript is null);
        var italic = direct is null ? 0 : FontData.ScaleFix(Get(direct.Family, style, direct.Source).Glyphs[direct.Slot].ItalicFix,
            Get(direct.Family, style, direct.Source).Data.SizeSp);
        var childStyle = style.Smaller;
        var up = direct is not null ? 0 : Dim((long)nucleus.Height - Symbol(18, childStyle, source), source);
        var down = direct is not null ? 0 : Dim((long)nucleus.Depth + Symbol(19, childStyle, source), source);
        var xheight = Math.Abs(Symbol(5, style, source));
        var sup = scripts.Superscript is null ? null : List(scripts.Superscript, childStyle, alphabet, depth + 1);
        var sub = scripts.Subscript is null ? null : List(scripts.Subscript, childStyle.Cramp, alphabet, depth + 1);
        if (sup is not null)
            up = Math.Max(up, Math.Max(Symbol(style.Cramped ? 15 : 14, style, source), Dim((long)sup.Depth + xheight / 4, source)));
        if (sub is not null)
        {
            down = Math.Max(down, Symbol(sup is null ? 16 : 17, style, source));
            if (sup is null) down = Math.Max(down, Dim((long)sub.Height - xheight * 4L / 5, source));
            else
            {
                var clearance = Dim(4L * Thickness(style, source) - ((long)up - sup.Depth - sub.Height + down), source);
                if (clearance > 0)
                {
                    down = Dim((long)down + clearance, source);
                    var adjust = Dim(xheight * 4L / 5 - ((long)up - sup.Depth), source);
                    if (adjust > 0) { up = Dim((long)up + adjust, source); down = Dim((long)down - adjust, source); }
                }
            }
        }
        var result = new Box(); Append(result, nucleus, 0, 0, source);
        var scriptWidth = 0;
        if (sup is not null)
        {
            var offset = sub is null ? 0 : italic;
            Append(result, sup, Dim((long)nucleus.Width + offset, source), -up, source);
            scriptWidth = Dim((long)sup.Width + 32768 + offset, source);
        }
        if (sub is not null)
        {
            Append(result, sub, nucleus.Width, down, source);
            scriptWidth = Math.Max(scriptWidth, Dim((long)sub.Width + 32768, source));
        }
        result.Width = Dim((long)nucleus.Width + scriptWidth, source);
        return result;
    }
    private Box Fraction(MathFraction fraction, Style style, MathAlphabet alphabet, int depth)
    {
        var source = fraction.Source;
        var num = List(fraction.Numerator, style.Smaller, alphabet, depth + 1);
        var den = List(fraction.Denominator, style.Smaller.Cramp, alphabet, depth + 1);
        var width = Math.Max(num.Width, den.Width);
        var thickness = Thickness(style, source);
        var axis = Symbol(22, style, source); var half = Half(thickness);
        var up = Math.Max(Symbol(9, style, source), Dim((long)num.Depth + axis + half + thickness, source));
        var down = Math.Max(Symbol(12, style, source), Dim((long)den.Height - axis + half + thickness, source));
        var box = new Box { Width = Dim((long)width + 2 * 78643, source), Height = Dim((long)up + num.Height, source), Depth = Dim((long)down + den.Depth, source) };
        Append(box, num, 78643 + Half(width - num.Width), -up, source);
        box.Paint.Add(new PlacedRule(78643, -axis - half, width, thickness, source));
        // The two clearance kerns use rounded half-thickness. For an odd rule,
        // their sum puts the denominator one sp above the declared box depth.
        Append(box, den, 78643 + Half(width - den.Width), Dim((long)down + thickness - 2 * half, source), source);
        return box;
    }
    private Box Radical(MathRadical radical, Style style, MathAlphabet alphabet, int depth)
    {
        var source = radical.Source;
        var body = List(radical.Radicand, style.Cramp, alphabet, depth + 1);
        var thickness = Thickness(style, source);
        var clearance = Dim((long)thickness + Math.Abs(thickness) / 4, source);
        var delimiter = RadicalDelimiter(style, Dim((long)body.Height + body.Depth + clearance + thickness, source), source);
        var excess = Dim((long)delimiter.Depth - body.Height - body.Depth - clearance, source);
        if (excess > 0) clearance = Dim((long)clearance + Half(excess), source);
        var shift = Dim((long)body.Height + clearance, source);
        var box = new Box { Width = Dim((long)delimiter.Width + body.Width, source), Height = Dim((long)shift + 2 * delimiter.Height, source), Depth = body.Depth };
        Append(box, delimiter, 0, -shift, source);
        box.Paint.Add(new PlacedRule(delimiter.Width, Dim(-(long)shift - delimiter.Height, source), body.Width, delimiter.Height, source));
        Append(box, body, delimiter.Width, 0, source);
        return box;
    }
    private Box RadicalDelimiter(Style style, int required, Source source)
    {
        Face? best = null; var bestSlot = 0; var bestHeight = 0;
        // A smaller-style radical may use the next larger symbol face before
        // crossing to the fixed-size OMX chain.
        for (var level = style.Level; level >= 0; level--)
        {
            var face = Get("symbol", new(level, style.Cramped), source);
            var g = face.Glyphs[112]; var extent = FontData.ScaleFix(g.HeightFix, face.Data.SizeSp) + FontData.ScaleFix(g.DepthFix, face.Data.SizeSp);
            if (extent > bestHeight) { best = face; bestSlot = 112; bestHeight = extent; }
            if (extent >= required) return Character(face, 112, source, true, signed: true);
        }
        var extension = Get("extension", style, source); var slot = 112;
        while (true)
        {
            budget.Charge(source);
            var recipe = extension.Data.Extensions.SingleOrDefault(e => e.Slot == slot);
            if (recipe is not null) return Extend(extension, extension.Data.Recipes[recipe.Recipe], required, source);
            var g = extension.Glyphs[slot]; var extent = FontData.ScaleFix(g.HeightFix, extension.Data.SizeSp) + FontData.ScaleFix(g.DepthFix, extension.Data.SizeSp);
            if (extent > bestHeight) { best = extension; bestSlot = slot; bestHeight = extent; }
            if (extent >= required) return Character(extension, slot, source, true, signed: true);
            var next = extension.Data.LargerGlyphs.SingleOrDefault(l => l.Slot == slot);
            if (next is null) break;
            slot = next.Next;
        }
        return Character(best!, bestSlot, source, true, signed: true);
    }
    private Box Extend(Face face, MathRecipe recipe, int required, Source source)
    {
        int Extent(int slot) => slot == 0 ? 0 : Dim((long)FontData.ScaleFix(face.Glyphs[slot].HeightFix, face.Data.SizeSp)
            + FontData.ScaleFix(face.Glyphs[slot].DepthFix, face.Data.SizeSp), source);
        var total = Dim((long)Extent(recipe.Top) + Extent(recipe.Middle) + Extent(recipe.Bottom), source);
        var repeat = Extent(recipe.Repeat); var count = 0;
        if (repeat <= 0) throw new InvalidOperationException("Invalid bundled radical extension.");
        while (total < required) { budget.Charge(source); total = Dim((long)total + repeat * (recipe.Middle == 0 ? 1L : 2L), source); count++; }
        var slots = new List<int>();
        if (recipe.Top != 0) slots.Add(recipe.Top);
        for (var i = 0; i < count; i++) { budget.Charge(source); slots.Add(recipe.Repeat); }
        if (recipe.Middle != 0)
        {
            slots.Add(recipe.Middle);
            for (var i = 0; i < count; i++) { budget.Charge(source); slots.Add(recipe.Repeat); }
        }
        if (recipe.Bottom != 0) slots.Add(recipe.Bottom);
        var box = new Box(); var cursor = 0; var top = 0;
        for (var i = 0; i < slots.Count; i++)
        {
            var piece = Character(face, slots[i], source, true, signed: true);
            if (i == 0) top = piece.Height;
            var y = Dim((long)cursor + piece.Height - top, source);
            Append(box, piece, 0, y, source); cursor = Dim((long)cursor + piece.Height + piece.Depth, source);
        }
        box.Height = top; box.Depth = Dim((long)total - top, source);
        var glyph = face.Glyphs[recipe.Repeat];
        box.Width = Dim((long)FontData.ScaleFix(glyph.AdvanceFix, face.Data.SizeSp) + FontData.ScaleFix(glyph.ItalicFix, face.Data.SizeSp), source);
        return box;
    }
    private Box Negation(MathNegatedEquality negation, Style style)
    {
        var slash = Character(Get("symbol", style, negation.Source), 54, negation.Source, true);
        var equal = Character(Get("roman", style, negation.Source), 61, negation.Source, true);
        var box = new Box { Width = Dim((long)slash.Width + equal.Width, negation.Source) };
        Append(box, slash, 0, 0, negation.Source); Append(box, equal, slash.Width, 0, negation.Source);
        return box;
    }
}

using Lokad.TikZ.Frontend;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Text;

// This is a bounded math-list parser, not a TeX expansion engine. It shares the
// label's source and work budget, including foreach/style provenance mappings.
internal sealed class MathParser(Source source, Budget budget, int start, int depth)
{
    private int _position = start;
    private char Current => source.Span[_position];
    private Source Here => source.Slice(_position, _position < source.Length ? 1 : 0);
    private void Advance() { budget.Charge(Here); _position++; }

    internal LabelMath Parse(out int end)
    {
        if (_position >= source.Length || Current != '$') throw new ArgumentException("Expected an inline math delimiter.");
        var begin = _position;
        Advance();
        if (_position < source.Length && Current == '$')
            throw new CompileError("TIKZ002", "Display math is outside the bounded math profile.", source.Slice(begin, 2));
        var body = List(depth + 1, '$');
        end = _position;
        return new(body, source.Slice(begin, _position - begin));
    }

    private MathList List(int nesting, char terminator)
    {
        budget.Depth(Here, nesting, budget.Limits.MaxNesting);
        var begin = _position;
        var items = new List<MathItem>();
        while (true)
        {
            Trivia();
            if (_position == source.Length)
                throw new CompileError("TIKZ001", terminator == '$' ? "Unclosed inline math." : "Unclosed math group.", Here);
            if (Current == terminator)
            {
                var origin = source.Slice(begin, _position - begin);
                Advance();
                return new(items.ToArray(), origin);
            }
            if (Current is '$' or '}')
                throw new CompileError("TIKZ001", "Unexpected delimiter in math.", Here);
            if (Current is '^' or '_')
                throw new CompileError("TIKZ001", "A math script requires a preceding atom.", Here);
            var beginAtom = _position;
            var item = Item(nesting);
            if (item is MathAtom atom) item = Scripts(atom, beginAtom, nesting);
            items.Add(item);
        }
    }

    private MathItem Item(int nesting)
    {
        budget.Depth(Here, nesting, budget.Limits.MaxNesting);
        var begin = _position;
        var ch = Current;
        if (ch == '{')
        {
            Advance();
            return new MathGroup(List(nesting + 1, '}'), MathAlphabet.Inherit, source.Slice(begin, _position - begin));
        }
        if (ch == '\\') return Command(nesting);
        Advance();
        var origin = source.Slice(begin, 1);
        if (char.IsAsciiLetter(ch)) return new MathGlyph(MathFamily.Italic, ch, true, MathClass.Ordinary, origin);
        if (char.IsAsciiDigit(ch)) return new MathGlyph(MathFamily.Roman, ch, true, MathClass.Ordinary, origin);
        var glyph = ch switch
        {
            '+' => (MathFamily.Roman, 43, MathClass.Binary),
            '-' => (MathFamily.Symbol, 0, MathClass.Binary),
            '=' => (MathFamily.Roman, 61, MathClass.Relation),
            '<' => (MathFamily.Italic, 60, MathClass.Relation),
            '>' => (MathFamily.Italic, 62, MathClass.Relation),
            ':' => (MathFamily.Roman, 58, MathClass.Relation),
            '/' => (MathFamily.Italic, 61, MathClass.Ordinary),
            '.' => (MathFamily.Italic, 58, MathClass.Ordinary),
            '|' => (MathFamily.Symbol, 106, MathClass.Ordinary),
            '(' => (MathFamily.Roman, 40, MathClass.Open),
            ')' => (MathFamily.Roman, 41, MathClass.Close),
            '[' => (MathFamily.Roman, 91, MathClass.Open),
            ']' => (MathFamily.Roman, 93, MathClass.Close),
            ',' => (MathFamily.Italic, 59, MathClass.Punctuation),
            _ => throw new CompileError("TIKZ002", $"Unsupported math character U+{(int)ch:X4}.", origin)
        };
        return new MathGlyph(glyph.Item1, glyph.Item2, false, glyph.Item3, origin);
    }

    private MathItem Command(int nesting)
    {
        var begin = _position;
        Advance();
        if (_position == source.Length) throw new CompileError("TIKZ001", "Incomplete math control sequence.", source.Slice(begin, 1));
        if (!char.IsAsciiLetter(Current))
        {
            var symbol = Current; Advance();
            var origin = source.Slice(begin, _position - begin);
            return symbol switch
            {
                ',' => new MathSpace(3, origin), '!' => new MathSpace(-3, origin), ';' => new MathSpace(5, origin),
                _ => throw new CompileError("TIKZ002", $"Unsupported math control symbol '\\{symbol}'.", origin)
            };
        }
        var wordStart = _position;
        while (_position < source.Length && char.IsAsciiLetter(Current)) Advance();
        var name = source.Slice(wordStart, _position - wordStart).Value;
        var command = source.Slice(begin, _position - begin);
        if (name == "frac")
        {
            var numerator = Argument(nesting);
            var denominator = Argument(nesting);
            return new MathFraction(numerator, denominator, source.Slice(begin, _position - begin));
        }
        if (name == "sqrt")
        {
            Trivia();
            if (_position < source.Length && Current == '[')
                throw new CompileError("TIKZ002", "Indexed roots are outside the bounded math profile.", Here);
            var body = Argument(nesting);
            return new MathRadical(body, source.Slice(begin, _position - begin));
        }
        if (name == "mathrm")
        {
            var body = Argument(nesting);
            return new MathGroup(body, MathAlphabet.Roman, source.Slice(begin, _position - begin));
        }
        if (name is "ne" or "neq") return new MathNegatedEquality(command);
        // Native OT1/OML/OMS slots and classes; alphabetic marks TeX's variable
        // family selection. Greek mathord atoms retain OML inside \mathrm.
        var glyph = name switch
        {
            "alpha" => (MathFamily.Italic, 11, MathClass.Ordinary, false),
            "beta" => (MathFamily.Italic, 12, MathClass.Ordinary, false),
            "gamma" => (MathFamily.Italic, 13, MathClass.Ordinary, false),
            "delta" => (MathFamily.Italic, 14, MathClass.Ordinary, false),
            "epsilon" => (MathFamily.Italic, 15, MathClass.Ordinary, false),
            "zeta" => (MathFamily.Italic, 16, MathClass.Ordinary, false),
            "eta" => (MathFamily.Italic, 17, MathClass.Ordinary, false),
            "theta" => (MathFamily.Italic, 18, MathClass.Ordinary, false),
            "iota" => (MathFamily.Italic, 19, MathClass.Ordinary, false),
            "kappa" => (MathFamily.Italic, 20, MathClass.Ordinary, false),
            "lambda" => (MathFamily.Italic, 21, MathClass.Ordinary, false),
            "mu" => (MathFamily.Italic, 22, MathClass.Ordinary, false),
            "nu" => (MathFamily.Italic, 23, MathClass.Ordinary, false),
            "xi" => (MathFamily.Italic, 24, MathClass.Ordinary, false),
            "pi" => (MathFamily.Italic, 25, MathClass.Ordinary, false),
            "rho" => (MathFamily.Italic, 26, MathClass.Ordinary, false),
            "sigma" => (MathFamily.Italic, 27, MathClass.Ordinary, false),
            "tau" => (MathFamily.Italic, 28, MathClass.Ordinary, false),
            "upsilon" => (MathFamily.Italic, 29, MathClass.Ordinary, false),
            "phi" => (MathFamily.Italic, 30, MathClass.Ordinary, false),
            "chi" => (MathFamily.Italic, 31, MathClass.Ordinary, false),
            "psi" => (MathFamily.Italic, 32, MathClass.Ordinary, false),
            "omega" => (MathFamily.Italic, 33, MathClass.Ordinary, false),
            "varepsilon" => (MathFamily.Italic, 34, MathClass.Ordinary, false),
            "vartheta" => (MathFamily.Italic, 35, MathClass.Ordinary, false),
            "varpi" => (MathFamily.Italic, 36, MathClass.Ordinary, false),
            "varrho" => (MathFamily.Italic, 37, MathClass.Ordinary, false),
            "varsigma" => (MathFamily.Italic, 38, MathClass.Ordinary, false),
            "varphi" => (MathFamily.Italic, 39, MathClass.Ordinary, false),
            "Gamma" => (MathFamily.Roman, 0, MathClass.Ordinary, true),
            "Delta" => (MathFamily.Roman, 1, MathClass.Ordinary, true),
            "Theta" => (MathFamily.Roman, 2, MathClass.Ordinary, true),
            "Lambda" => (MathFamily.Roman, 3, MathClass.Ordinary, true),
            "Xi" => (MathFamily.Roman, 4, MathClass.Ordinary, true),
            "Pi" => (MathFamily.Roman, 5, MathClass.Ordinary, true),
            "Sigma" => (MathFamily.Roman, 6, MathClass.Ordinary, true),
            "Upsilon" => (MathFamily.Roman, 7, MathClass.Ordinary, true),
            "Phi" => (MathFamily.Roman, 8, MathClass.Ordinary, true),
            "Psi" => (MathFamily.Roman, 9, MathClass.Ordinary, true),
            "Omega" => (MathFamily.Roman, 10, MathClass.Ordinary, true),
            "infty" => (MathFamily.Symbol, 49, MathClass.Ordinary, false),
            "cdot" => (MathFamily.Symbol, 1, MathClass.Binary, false),
            "times" => (MathFamily.Symbol, 2, MathClass.Binary, false),
            "pm" => (MathFamily.Symbol, 6, MathClass.Binary, false),
            "mp" => (MathFamily.Symbol, 7, MathClass.Binary, false),
            "le" or "leq" => (MathFamily.Symbol, 20, MathClass.Relation, false),
            "ge" or "geq" => (MathFamily.Symbol, 21, MathClass.Relation, false),
            "to" or "rightarrow" => (MathFamily.Symbol, 33, MathClass.Relation, false),
            "leftarrow" => (MathFamily.Symbol, 32, MathClass.Relation, false),
            "leftrightarrow" => (MathFamily.Symbol, 36, MathClass.Relation, false),
            _ => throw new CompileError("TIKZ002", $"Unsupported math command '\\{name}'.", command)
        };
        return new MathGlyph(glyph.Item1, glyph.Item2, glyph.Item4, glyph.Item3, command);
    }

    private MathList Argument(int nesting)
    {
        Trivia();
        if (_position == source.Length || Current != '{')
            throw new CompileError("TIKZ001", "Expected a braced math argument.", Here);
        Advance();
        return List(nesting + 1, '}');
    }

    private MathAtom Scripts(MathAtom atom, int begin, int nesting)
    {
        MathList? superscript = null, subscript = null;
        Source? superscriptMarker = null, subscriptMarker = null;
        var end = _position;
        while (true)
        {
            Trivia();
            if (_position == source.Length || Current is not ('^' or '_')) break;
            var super = Current == '^';
            var marker = Here;
            if (super ? superscript is not null : subscript is not null)
                throw new CompileError("TIKZ001", "Duplicate math script on the same base.", marker);
            Advance(); Trivia();
            if (_position == source.Length || Current is '$' or '}' or '^' or '_')
                throw new CompileError("TIKZ001", "Expected a math script argument.", Here);
            MathList argument;
            if (Current == '{') argument = Argument(nesting);
            else
            {
                var item = Item(nesting + 1);
                if (item is not MathAtom)
                    throw new CompileError("TIKZ001", "Math spacing cannot be a script argument.", item.Source);
                argument = new([item], item.Source);
            }
            if (super) { superscript = argument; superscriptMarker = marker; }
            else { subscript = argument; subscriptMarker = marker; }
            end = _position;
        }
        return superscript is null && subscript is null ? atom
            : new MathScripts(atom, superscript, subscript, superscriptMarker, subscriptMarker, source.Slice(begin, end - begin));
    }

    private void Trivia()
    {
        while (_position < source.Length)
        {
            if (Current is ' ' or '\t' or '\r' or '\n') { Advance(); continue; }
            if (Current != '%') return;
            do { Advance(); } while (_position < source.Length && Current is not ('\r' or '\n'));
        }
    }
}

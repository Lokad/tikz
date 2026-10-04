using Lokad.TikZ.Frontend;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Text;

// Text needs TeX's line/space states rather than the path cursor's trivia skip.
internal sealed class LabelParser(Source source, Budget budget)
{
    private int _position;
    private LexicalState _state = LexicalState.MidLine;
    private enum LexicalState { MidLine, SkipBlanks, NewLine }
    private char Current => source.Span[_position];
    private Source Here => source.Slice(_position, _position < source.Length ? 1 : 0);
    private void Advance() { budget.Charge(Here); _position++; }

    internal List<LabelItem> Parse()
    {
        if (source.Length > budget.Limits.MaxSourceCharacters) Budget.Fail(source, "source characters");
        return Items(0, false);
    }

    private List<LabelItem> Items(int depth, bool grouped)
    {
        budget.Depth(Here, depth, budget.Limits.MaxNesting);
        var result = new List<LabelItem>();
        while (_position < source.Length)
        {
            var start = _position;
            var ch = Current;
            if (ch == '%')
            {
                while (_position < source.Length && Current is not ('\r' or '\n')) Advance();
                if (_position < source.Length) EndLine();
                _state = LexicalState.NewLine;
                continue;
            }
            if (ch is ' ' or '\t')
            {
                Advance();
                if (_state == LexicalState.MidLine) result.Add(new LabelSpace(true, " ", source.Slice(start, 1)));
                if (_state != LexicalState.NewLine) _state = LexicalState.SkipBlanks;
                continue;
            }
            if (ch is '\r' or '\n')
            {
                EndLine();
                if (_state == LexicalState.NewLine) throw new CompileError("TIKZ002", "Paragraphs are outside the text profile; use an explicit line break.", source.Slice(start, _position - start));
                if (_state == LexicalState.MidLine) result.Add(new LabelSpace(true, " ", source.Slice(start, _position - start)));
                _state = LexicalState.NewLine;
                continue;
            }
            if (ch == '}')
            {
                if (!grouped) throw new CompileError("TIKZ001", "Unexpected closing brace in text.", Here);
                Advance(); _state = LexicalState.MidLine;
                return result;
            }
            if (ch == '{')
            {
                Advance(); _state = LexicalState.MidLine;
                var body = Items(depth + 1, true);
                result.Add(new LabelGroup(body, null, false, source.Slice(start, _position - start)));
                continue;
            }
            if (ch == '\\') { result.Add(Command(depth)); continue; }
            if (ch == '~')
            {
                Advance(); _state = LexicalState.MidLine;
                result.Add(new LabelSpace(false, "\u00a0", source.Slice(start, 1)));
                continue;
            }
            if (ch is '$' or '^' or '_' or '#' or '&')
                throw new CompileError("TIKZ002", ch == '$' ? "Math labels are not implemented in this text profile." : $"Escape '{ch}' in text.", Here);
            while (_position < source.Length && Current is not (' ' or '\t' or '\r' or '\n' or '%' or '{' or '}' or '\\' or '~' or '$' or '^' or '_' or '#' or '&')) Advance();
            _state = LexicalState.MidLine;
            result.Add(new LabelLiteral(source.Slice(start, _position - start)));
        }
        if (grouped) throw new CompileError("TIKZ001", "Unclosed text group.", Here);
        return result;
    }

    private void EndLine()
    {
        var cr = Current == '\r'; Advance();
        if (cr && _position < source.Length && Current == '\n') Advance();
    }

    private LabelItem Command(int depth)
    {
        var start = _position;
        Advance();
        if (_position == source.Length) throw new CompileError("TIKZ001", "Incomplete text control sequence.", source.Slice(start, 1));
        if (!char.IsAsciiLetter(Current))
        {
            var symbol = Current; Advance(); _state = LexicalState.MidLine;
            var origin = source.Slice(start, _position - start);
            return symbol switch
            {
                '%' or '#' or '$' or '&' or '_' or '{' or '}' => new LabelSymbol(symbol, symbol.ToString(), origin),
                ' ' => new LabelSpace(false, " ", origin),
                '/' => new LabelCorrection(origin),
                '\\' when depth == 0 => LineBreak(origin),
                '\\' => throw new CompileError("TIKZ002", "A line break must be outside nested text groups.", origin),
                _ => throw new CompileError("TIKZ002", $"Unsupported text control symbol '\\{symbol}'.", origin)
            };
        }
        var wordStart = _position;
        while (_position < source.Length && char.IsAsciiLetter(Current)) Advance();
        var name = source.Slice(wordStart, _position - wordStart).Value;
        var command = source.Slice(start, _position - start);
        _state = LexicalState.SkipBlanks;
        var declaration = name switch
        {
            "bfseries" => FontChange.Bold, "mdseries" => FontChange.Medium, "itshape" => FontChange.Italic,
            "upshape" => FontChange.Upright, "normalfont" => FontChange.Normal, "rmfamily" => FontChange.RegularFamily,
            "normalsize" => FontChange.NormalSize, "large" => FontChange.Large, _ => (FontChange?)null
        };
        if (declaration.HasValue) return new LabelFont(declaration.Value, command);
        var textCommand = name switch
        {
            "textbf" => FontChange.Bold, "textmd" => FontChange.Medium, "textit" => FontChange.Italic,
            "textup" => FontChange.Upright, "textnormal" => FontChange.Normal, "textrm" => FontChange.RegularFamily,
            _ => (FontChange?)null
        };
        if (textCommand.HasValue)
        {
            ArgumentTrivia();
            if (_position == source.Length || Current != '{') throw new CompileError("TIKZ001", "Expected a grouped text-command argument.", Here);
            Advance(); _state = LexicalState.MidLine;
            var body = Items(depth + 1, true);
            return new LabelGroup(body, textCommand.Value, true, source.Slice(start, _position - start));
        }
        var glyph = name switch
        {
            "textbackslash" => (92, "\\"), "textasciicircum" => (94, "^"), "textasciitilde" => (126, "~"),
            "textquotedbl" => (34, "\""), "textquotedblleft" => (16, "“"), "textquotedblright" => (17, "”"),
            "textsterling" => (191, "£"), "textsection" => (159, "§"), "textunderscore" => (95, "_"),
            "ae" => (230, "æ"), "AE" => (198, "Æ"), "oe" => (247, "œ"), "OE" => (215, "Œ"),
            "o" => (248, "ø"), "O" => (216, "Ø"), "ss" => (255, "ß"), "i" => (25, "ı"), "j" => (26, "ȷ"),
            _ => (-1, "")
        };
        if (glyph.Item1 >= 0) return new LabelSymbol(glyph.Item1, glyph.Item2, command);
        throw new CompileError("TIKZ002", $"Unsupported text command '\\{name}'.", command);
    }

    private void ArgumentTrivia()
    {
        while (_position < source.Length)
        {
            if (Current is ' ' or '\t') { Advance(); continue; }
            if (Current == '%')
            {
                while (_position < source.Length && Current is not ('\r' or '\n')) Advance();
                if (_position < source.Length) EndLine();
                _state = LexicalState.NewLine;
                continue;
            }
            if (Current is '\r' or '\n')
            {
                var origin = Here;
                EndLine();
                if (_state == LexicalState.NewLine)
                    throw new CompileError("TIKZ002", "Paragraphs are outside the text profile.", origin);
                _state = LexicalState.NewLine;
                continue;
            }
            break;
        }
    }

    private LabelBreak LineBreak(Source origin)
    {
        var lookahead = _position;
        while (lookahead < source.Length)
        {
            var ch = source.Span[lookahead];
            if (ch is ' ' or '\t' or '\r' or '\n')
            {
                budget.Charge(source.Slice(lookahead++, 1));
                continue;
            }
            if (ch == '%')
            {
                do { budget.Charge(source.Slice(lookahead++, 1)); }
                while (lookahead < source.Length && source.Span[lookahead] is not ('\r' or '\n'));
                continue;
            }
            if (ch is '[' or '*')
                throw new CompileError("TIKZ002", "Optional or starred line breaks are outside the text profile.", source.Slice(lookahead, 1));
            break;
        }
        return new LabelBreak(origin);
    }
}

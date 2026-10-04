using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Frontend;

internal sealed class Cursor(Source source, Budget budget)
{
    public Source Source { get; } = source;
    public Budget Budget { get; } = budget;
    public int Position { get; private set; }
    public bool End { get { Skip(); return Position >= Source.Length; } }
    public Source Here => Source.Slice(Position, Position < Source.Length ? 1 : 0);
    public char Peek { get { Skip(); return Position < Source.Length ? Source.Text[Source.Offset + Position] : '\0'; } }
    public void Skip()
    {
        while (Position < Source.Length)
        {
            var ch = Source.Text[Source.Offset + Position];
            if (char.IsWhiteSpace(ch)) { Advance(); continue; }
            if (ch == '%') { while (Position < Source.Length && Source.Text[Source.Offset + Position] != '\n') Advance(); continue; }
            break;
        }
    }
    public void Advance()
    {
        Budget.Charge(Here);
        Position++;
    }
    public bool Take(string text)
    {
        Skip();
        if (!Source.Span[Position..].StartsWith(text, StringComparison.Ordinal)) return false;
        for (var i = 0; i < text.Length; i++) Advance();
        return true;
    }
    public bool Word(string word)
    {
        Skip();
        var rest = Source.Span[Position..];
        if (!rest.StartsWith(word, StringComparison.Ordinal)) return false;
        if (rest.Length > word.Length && char.IsLetter(rest[word.Length])) return false;
        return Take(word);
    }
    public void Require(string text)
    {
        if (!Take(text)) throw new CompileError("TIKZ001", $"Expected '{text}'.", Here);
    }
    public Source Command()
    {
        Skip();
        var start = Position;
        Require("\\");
        if (Position >= Source.Length) throw new CompileError("TIKZ001", "Incomplete control sequence.", Here);
        if (char.IsLetter(Source.Text[Source.Offset + Position]))
            while (Position < Source.Length && char.IsLetter(Source.Text[Source.Offset + Position])) Advance();
        else Advance();
        var command = Source.Slice(start, Position - start);
        Skip();
        return command;
    }
    public Source Group(char open, char close)
    {
        Require(open.ToString());
        var start = Position;
        var depth = 1;
        var braces = 0;
        while (Position < Source.Length)
        {
            var ch = Source.Text[Source.Offset + Position];
            if (ch == '\\') { Advance(); if (Position < Source.Length) Advance(); continue; }
            if (ch == '%') { while (Position < Source.Length && Source.Text[Source.Offset + Position] != '\n') Advance(); continue; }
            if (open != '{')
            {
                if (ch == '{') braces++;
                if (ch == '}') braces--;
                if (braces < 0) throw new CompileError("TIKZ001", "Unbalanced group.", Here);
            }
            if (braces == 0)
            {
                if (ch == open) depth++;
                if (ch == close) depth--;
            }
            Budget.Depth(Here, depth + braces, Budget.Limits.MaxNesting);
            if (depth == 0) { var result = Source.Slice(start, Position - start); Advance(); return result; }
            Advance();
        }
        throw new CompileError("TIKZ001", $"Unclosed '{open}' group.", Source.Slice(start - 1, 1));
    }
    public Source Until(params char[] delimiters)
    {
        Skip();
        var start = Position;
        while (Position < Source.Length && !delimiters.Contains(Source.Text[Source.Offset + Position])) Advance();
        return Source.Slice(start, Position - start).Trim();
    }
    public void Complete()
    {
        if (!End) throw new CompileError("TIKZ001", "Unexpected input.", Here);
    }
}

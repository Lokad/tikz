namespace Lokad.TikZ.Frontend;

internal readonly record struct Source(string Text, int Offset, int Length)
{
    public Source[]? RelatedSources { get; init; }
    public ReadOnlySpan<char> Span => Text.AsSpan(Offset, Length);
    public string Value => Text.Substring(Offset, Length);
    public Source Slice(int start, int length) => this with { Offset = Offset + start, Length = length };
    public Source Trim()
    {
        var start = 0;
        var end = Length;
        while (start < end && char.IsWhiteSpace(Text[Offset + start])) start++;
        while (end > start && char.IsWhiteSpace(Text[Offset + end - 1])) end--;
        return Slice(start, end - start);
    }
    public TikzSourceSpan Location
    {
        get
        {
            var line = 1;
            var column = 1;
            for (var i = 0; i < Offset; i++)
            {
                if (Text[i] == '\n') { line++; column = 1; }
                else column++;
            }
            return new(Offset, Length, line, column);
        }
    }
}

internal sealed class CompileError : Exception
{
    public TikzDiagnostic Diagnostic { get; }
    public CompileError(string code, string message, Source source) : base(message)
        => Diagnostic = new(code, message, source.Location)
        {
            RelatedLocations = Array.AsReadOnly((source.RelatedSources ?? []).Select(s => s.Location).ToArray())
        };
}

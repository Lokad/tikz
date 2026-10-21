using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Frontend;

internal readonly record struct Source(string Text, int Offset, int Length)
{
    public Source[]? RelatedSources { get; init; }
    public SourceMapping? Mapping { get; init; }
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
            if (Mapping is not null) return Mapping.Origin(Offset, Length).Location;
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
    internal IEnumerable<TikzSourceSpan> RelatedLocations()
        => new DiagnosticBuilder(new Budget(TikzLimits.Default, CancellationToken.None)).Build("", "", this).RelatedLocations;
}

internal sealed class CompileError : Exception
{
    private readonly string _code;
    private readonly Source _origin;
    public TikzDiagnostic Diagnostic => CreateDiagnostic(new Budget(TikzLimits.Default, CancellationToken.None));
    public CompileError(string code, string message, Source source) : base(message)
    {
        _code = code;
        _origin = source;
    }
    internal TikzDiagnostic CreateDiagnostic(Budget budget) => new DiagnosticBuilder(budget).Build(_code, Message, _origin);
}

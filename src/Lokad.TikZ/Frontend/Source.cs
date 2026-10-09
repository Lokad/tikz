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
    {
        // Forwarded range values may share their seeds. Visit each retained
        // provenance node once rather than unfolding the same graph repeatedly.
        var seen = new HashSet<Source>();
        var pending = new Stack<Source>();
        pending.Push(this);
        while (pending.TryPop(out var current))
        {
            if (!seen.Add(current)) continue;
            if (current != this) yield return current.Location;
            if (current.Mapping is not null)
                foreach (var origin in current.Mapping.Origins(current.Offset, current.Length)) pending.Push(origin);
            foreach (var origin in current.RelatedSources ?? []) pending.Push(origin);
        }
    }
}

internal sealed class CompileError : Exception
{
    public TikzDiagnostic Diagnostic { get; }
    public CompileError(string code, string message, Source source) : base(message)
    {
        var primary = source.Location;
        Diagnostic = new(code, message, primary)
        {
            RelatedLocations = Array.AsReadOnly(source.RelatedLocations().Where(s => s != primary).Distinct().ToArray())
        };
    }
}

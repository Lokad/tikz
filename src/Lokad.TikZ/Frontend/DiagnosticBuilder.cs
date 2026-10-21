using System.Runtime.CompilerServices;
using Lokad.TikZ.Semantics;

namespace Lokad.TikZ.Frontend;

// Failure-local indexes avoid rescanning the caller's text for each related
// span. Conversion success retains no index or diagnostic traversal state.
internal sealed class DiagnosticBuilder(Budget budget)
{
    private sealed class Positions
    {
        internal readonly List<int> Lines = [0];
        internal int Scanned;
    }
    private readonly Dictionary<string, Positions> _positions = new(ReferenceEqualityComparer.Instance);

    internal TikzDiagnostic Build(string code, string message, Source origin)
    {
        TryLocation(origin, true, out var primary);
        var related = new List<TikzSourceSpan>();
        var locations = new HashSet<TikzSourceSpan> { primary };
        var visited = new HashSet<Source>(SourceIdentity.Instance);
        var pending = new Stack<Source>();
        pending.Push(origin);
        while (pending.TryPop(out var current))
        {
            if (!budget.TryCharge(1)) break;
            if (!visited.Add(current)) continue;
            if (!SourceIdentity.Instance.Equals(current, origin))
            {
                if (!TryLocation(current, false, out var location)) break;
                if (locations.Add(location)) related.Add(location);
            }
            var complete = true;
            if (current.Mapping is not null)
                foreach (var source in current.Mapping.Origins(current.Offset, current.Length))
                    if (!Push(source)) { complete = false; break; }
            if (!complete) break;
            foreach (var source in current.RelatedSources ?? [])
                if (!Push(source)) { complete = false; break; }
            if (!complete) break;
        }
        return new(code, message, primary)
        {
            RelatedLocations = related.Count == 0 ? Array.Empty<TikzSourceSpan>() : related.AsReadOnly()
        };

        bool Push(Source source)
        {
            if (!budget.TryCharge(1)) return false;
            pending.Push(source);
            return true;
        }
    }

    private bool Admit(long amount, bool primary)
    {
        if (budget.TryCharge(amount)) return true;
        if (!primary) return false;
        // A primary location is still required after exhaustion. Observe the
        // caller token on every bounded scan chunk and never exceed MaxWork.
        return budget.TryCharge(budget.Limits.MaxWork - budget.Work);
    }

    private bool TryLocation(Source source, bool primary, out TikzSourceSpan location)
    {
        location = default;
        while (source.Mapping is not null)
        {
            if (!Admit(1, primary)) return false;
            source = source.Mapping.Origin(source.Offset, source.Length);
        }
        if (!_positions.TryGetValue(source.Text, out var positions))
        {
            positions = new();
            _positions.Add(source.Text, positions);
        }
        while (positions.Scanned < source.Offset)
        {
            var end = Math.Min(source.Offset, positions.Scanned + 1024);
            if (!Admit(end - positions.Scanned, primary)) return false;
            for (var i = positions.Scanned; i < end; i++)
                if (source.Text[i] == '\n') positions.Lines.Add(i + 1);
            positions.Scanned = end;
        }
        var line = positions.Lines.BinarySearch(source.Offset);
        if (line < 0) line = ~line - 1;
        location = new(source.Offset, source.Length, line + 1, source.Offset - positions.Lines[line] + 1);
        return true;
    }

    // Source's value equality hashes entire text strings. Graph identity uses
    // their references, plus the mapping/related arrays, without traversing or
    // repeatedly hashing caller text. Public locations are deduplicated above.
    private sealed class SourceIdentity : IEqualityComparer<Source>
    {
        internal static readonly SourceIdentity Instance = new();
        public bool Equals(Source x, Source y) => ReferenceEquals(x.Text, y.Text)
            && x.Offset == y.Offset && x.Length == y.Length
            && ReferenceEquals(x.Mapping, y.Mapping) && ReferenceEquals(x.RelatedSources, y.RelatedSources);
        public int GetHashCode(Source source) => HashCode.Combine(RuntimeHelpers.GetHashCode(source.Text),
            source.Offset, source.Length, source.Mapping is null ? 0 : RuntimeHelpers.GetHashCode(source.Mapping),
            source.RelatedSources is null ? 0 : RuntimeHelpers.GetHashCode(source.RelatedSources));
    }
}

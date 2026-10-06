using System.Globalization;
using System.Text.RegularExpressions;

namespace TikzDashGeometryReference;

internal readonly record struct NativePoint(int X, int Y);
internal sealed record NativeSegment(string Kind, NativePoint End, NativePoint A, NativePoint B);
internal sealed record GeometryRecord(string Id, string Actions, int WidthSp, int PhaseSp, int[] LengthsSp, NativeSegment[] Segments);
internal sealed record NativeBounds(int MinX, int MinY, int MaxX, int MaxY);
internal sealed record NativeBox(int Width, int Height, int Depth);
internal sealed record NativePage(int X, int BaselineY, int Width, int Height);
internal sealed record GeometryMeasurement(GeometryRecord[] Records, NativeBounds Bounds, NativeBox Box, NativePage? Page);

internal static class DashGeometryEvidence
{
    internal static string[] CaseIds(string source)
    {
        var ids = Regex.Matches(source, @"(?m)^% DASH-GEOMETRY ([a-z][a-z0-9-]*)$").Select(m => m.Groups[1].Value).ToArray();
        if (ids.Length != 16 || ids.Distinct(StringComparer.Ordinal).Count() != 16
            || Regex.Matches(source, @"\\(?:draw|filldraw)\b").Count != 16 || Regex.Matches(source, @"\\clip\b").Count != 3)
            throw new InvalidDataException("Incomplete trusted geometry case coverage.");
        return ids;
    }
    internal static GeometryMeasurement Parse(string source, string log, bool pdf)
    {
        static int Int(string value) => int.Parse(value, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture);
        log = log.Replace("\r", "", StringComparison.Ordinal).Replace("\n", "", StringComparison.Ordinal);
        var ids = CaseIds(source);
        var headers = Regex.Matches(log, @"LOKAD-DASH (\d+)\|width=(\d+)\|phase=[^|]*\|pattern=[^|]*\|actions=([^|]*)\|END");
        var phases = Regex.Matches(log, @"LOKAD-DASH-PHASE (\d+)\|(-?\d+)\|END");
        var items = Regex.Matches(log, @"LOKAD-DASH-ITEM (\d+)\|(-?\d+)\|END");
        var points = Regex.Matches(log, @"LOKAD-SEG (\d+)\|([a-z]+)\|(-?\d+)\|(-?\d+)\|END");
        if (headers.Count != 19 || phases.Count != 19) throw new InvalidDataException("Incomplete native geometry records.");
        if (items.Cast<Match>().Concat(points.Cast<Match>()).Any(m => Int(m.Groups[1].Value) is < 1 or > 19))
            throw new InvalidDataException("Unexpected native record identity.");
        var records = new List<GeometryRecord>(); var paintIndex = 0; var clipIndex = 0;
        for (var i = 0; i < 19; i++)
        {
            if (Int(headers[i].Groups[1].Value) != i + 1 || Int(phases[i].Groups[1].Value) != i + 1) throw new InvalidDataException("Wrong native record order.");
            var actions = headers[i].Groups[3].Value.TrimEnd(',');
            var names = actions.Split(',', StringSplitOptions.RemoveEmptyEntries);
            if (names.Any(n => n is not ("stroke" or "draw" or "fill" or "clip")) || names.Length == 0
                || names.Distinct().Count() != names.Length || names.Contains("clip") && names.Length != 1)
                throw new InvalidDataException("Unsupported trusted native action.");
            var id = actions == "clip" ? "clip-" + clipIndex++ : paintIndex < ids.Length ? ids[paintIndex++] : throw new InvalidDataException("Extra native paint.");
            var lengths = items.Where(m => Int(m.Groups[1].Value) == i + 1).Select(m => Int(m.Groups[2].Value)).ToArray();
            if (lengths.Any(n => n < 0) || lengths.Length > 0 && lengths.All(n => n == 0)) throw new InvalidDataException("Invalid native pattern.");
            var segments = new List<NativeSegment>(); NativePoint start = default, rect = default, a = default, b = default;
            var pending = 0; var hasMove = false; var pendingRectangle = false;
            foreach (var p in points.Where(m => Int(m.Groups[1].Value) == i + 1))
            {
                var point = new NativePoint(Int(p.Groups[3].Value), Int(p.Groups[4].Value));
                var kind = p.Groups[2].Value;
                if (pending != 0 && kind != (pending == 1 ? "curvetosupportb" : "curveto")) throw new InvalidDataException("Incomplete curve controls.");
                if (pendingRectangle && kind != "rectsize") throw new InvalidDataException("Incomplete rectangle.");
                if (!hasMove && kind is not ("moveto" or "rectcorner")) throw new InvalidDataException("Missing initial native move.");
                switch (kind)
                {
                    case "moveto": hasMove = true; start = point; segments.Add(new("Move", point, default, default)); break;
                    case "lineto": segments.Add(new("Line", point, default, default)); break;
                    case "curvetosupporta": a = point; pending = 1; break;
                    case "curvetosupportb": if (pending != 1) throw new InvalidDataException("Missing first curve control."); b = point; pending = 2; break;
                    case "curveto": if (pending != 2) throw new InvalidDataException("Missing curve controls."); segments.Add(new("Cubic", point, a, b)); pending = 0; break;
                    case "closepath": segments.Add(new("Close", start, default, default)); break;
                    case "rectcorner": hasMove = true; pendingRectangle = true; start = rect = point; segments.Add(new("Move", point, default, default)); break;
                    case "rectsize":
                        if (!pendingRectangle) throw new InvalidDataException("Missing rectangle corner.");
                        segments.Add(new("Line", new(rect.X + point.X, rect.Y), default, default));
                        segments.Add(new("Line", new(rect.X + point.X, rect.Y + point.Y), default, default));
                        segments.Add(new("Line", new(rect.X, rect.Y + point.Y), default, default));
                        segments.Add(new("Close", rect, default, default)); pendingRectangle = false; break;
                    default: throw new InvalidDataException("Unknown native soft-path token.");
                }
            }
            if (pending != 0 || pendingRectangle || segments.Count == 0) throw new InvalidDataException("Incomplete native path.");
            records.Add(new(id, actions, Int(headers[i].Groups[2].Value), Int(phases[i].Groups[2].Value), lengths, Normalize(segments)));
        }
        if (paintIndex != 16 || clipIndex != 3) throw new InvalidDataException("Incomplete native paint/clip coverage.");
        Match One(string pattern) { var found = Regex.Matches(log, pattern); if (found.Count != 1) throw new InvalidDataException("Missing/duplicate native frame."); return found[0]; }
        var boundsMatch = One(@"LOKAD-BOUNDS (-?\d+)\|(-?\d+)\|(-?\d+)\|(-?\d+)\|END");
        var bounds = new NativeBounds(Int(boundsMatch.Groups[1].Value), Int(boundsMatch.Groups[2].Value), Int(boundsMatch.Groups[3].Value), Int(boundsMatch.Groups[4].Value));
        var boxMatch = One(@"LOKAD-BOX width=(\d+);height=(\d+);depth=(\d+)\|END");
        var box = new NativeBox(Int(boxMatch.Groups[1].Value), Int(boxMatch.Groups[2].Value), Int(boxMatch.Groups[3].Value));
        if (box.Width != bounds.MaxX - bounds.MinX || box.Height != bounds.MaxY - bounds.MinY || box.Depth != 0 || box.Width <= 0 || box.Height <= 0)
            throw new InvalidDataException("Native box/frame disagreement.");
        NativePage? page = null;
        if (pdf)
        {
            var p = One(@"LOKAD-PAGE x=(\d+);y=(\d+);width=(\d+);height=(\d+)\|END");
            page = new(Int(p.Groups[1].Value), Int(p.Groups[2].Value), Int(p.Groups[3].Value), Int(p.Groups[4].Value));
            if (page.Width != 600 * 65536 || page.Height != 800 * 65536 || page.X + box.Width > page.Width || page.BaselineY + box.Height > page.Height)
                throw new InvalidDataException("Native geometry escapes fixed page.");
        }
        return new([.. records], bounds, box, page);
    }
    internal static NativeSegment[] Normalize(IEnumerable<NativeSegment> input)
    {
        var result = new List<NativeSegment>();
        foreach (var s in input) { if (s.Kind == "Move" && result.Count > 0 && result[^1].Kind == "Move") result.RemoveAt(result.Count - 1); result.Add(s); }
        if (result.Count > 0 && result[^1].Kind == "Move") result.RemoveAt(result.Count - 1);
        return [.. result];
    }
}

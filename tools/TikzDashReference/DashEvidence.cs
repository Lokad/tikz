using System.Globalization;
using System.Text.RegularExpressions;

namespace TikzDashReference;

internal sealed record DashRecord(string Id, int WidthSp, int PhaseSp, int[] LengthsSp);
internal sealed record NativeBounds(int MinX, int MinY, int MaxX, int MaxY);
internal sealed record NativeBox(int Width, int Height, int Depth);
internal sealed record NativePage(int X, int BaselineY, int Width, int Height);
internal sealed record DashMeasurement(DashRecord[] Records, NativeBounds Bounds, NativeBox Box, NativePage? Page);

internal static class DashEvidence
{
    internal static string[] CaseIds(string source)
    {
        var ids = Regex.Matches(source, @"(?m)^% DASH-CASE ([a-z][a-z0-9-]*)$").Select(m => m.Groups[1].Value).ToArray();
        if (ids.Length != 40 || ids.Distinct(StringComparer.Ordinal).Count() != ids.Length) throw new InvalidDataException("Incomplete/duplicate trusted dash cases.");
        if (Regex.Matches(source, @"\\draw\b").Count != ids.Length) throw new InvalidDataException("Source case and draw coverage differ.");
        return ids;
    }

    internal static DashMeasurement Parse(string source, string log, bool pdf)
    {
        static int Int(string value) => int.Parse(value, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture);
        var ids = CaseIds(source);
        var headers = Regex.Matches(log, @"LOKAD-DASH (\d+)\|width=(\d+)\|");
        var phases = Regex.Matches(log, @"LOKAD-DASH-PHASE (\d+)\|(-?\d+)\|END");
        var items = Regex.Matches(log, @"LOKAD-DASH-ITEM (\d+)\|(-?\d+)\|END");
        if (headers.Count != ids.Length || phases.Count != ids.Length) throw new InvalidDataException("Incomplete native dash records.");
        var records = new List<DashRecord>();
        for (var i = 0; i < ids.Length; i++)
        {
            if (Int(headers[i].Groups[1].Value) != i + 1 || Int(phases[i].Groups[1].Value) != i + 1) throw new InvalidDataException("Native dash order/identity differs.");
            var lengths = items.Where(m => Int(m.Groups[1].Value) == i + 1).Select(m => Int(m.Groups[2].Value)).ToArray();
            if (lengths.Any(n => n < 0) || lengths.Length > 0 && lengths.All(n => n == 0)) throw new InvalidDataException("Invalid native dash lengths.");
            records.Add(new(ids[i], Int(headers[i].Groups[2].Value), Int(phases[i].Groups[2].Value), lengths));
        }
        if (items.Any(m => Int(m.Groups[1].Value) < 1 || Int(m.Groups[1].Value) > ids.Length)) throw new InvalidDataException("Unexpected native dash item.");
        Match One(string pattern) { var matches = Regex.Matches(log, pattern); if (matches.Count != 1) throw new InvalidDataException("Missing/duplicate native page/frame record."); return matches[0]; }
        var b = One(@"LOKAD-BOUNDS (-?\d+)\|(-?\d+)\|(-?\d+)\|(-?\d+)\|END");
        var bounds = new NativeBounds(Int(b.Groups[1].Value), Int(b.Groups[2].Value), Int(b.Groups[3].Value), Int(b.Groups[4].Value));
        var x = One(@"LOKAD-BOX width=(\d+);height=(\d+);depth=(\d+)\|END");
        var box = new NativeBox(Int(x.Groups[1].Value), Int(x.Groups[2].Value), Int(x.Groups[3].Value));
        if (bounds.MaxX <= bounds.MinX || bounds.MaxY <= bounds.MinY || box.Width != bounds.MaxX - bounds.MinX || box.Height != bounds.MaxY - bounds.MinY || box.Depth != 0)
            throw new InvalidDataException("Native box and picture frame disagree.");
        NativePage? page = null;
        if (pdf)
        {
            var p = One(@"LOKAD-PAGE x=(\d+);y=(\d+);width=(\d+);height=(\d+)\|END");
            page = new(Int(p.Groups[1].Value), Int(p.Groups[2].Value), Int(p.Groups[3].Value), Int(p.Groups[4].Value));
            if (page.Width != 600 * 65536 || page.Height != 800 * 65536 || page.X + box.Width > page.Width || page.BaselineY < 0 || page.BaselineY + box.Height > page.Height)
                throw new InvalidDataException("Native picture escapes the fixed PDF page.");
        }
        return new([.. records], bounds, box, page);
    }
}

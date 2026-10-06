using Lokad.TikZ.Frontend;

namespace Lokad.TikZ.Semantics;

// TikZ keeps the configured pattern and phase separately from the last dash
// command sent to the graphics driver. Each dash/phase option snapshots
// captured widths; unexpanded width registers stay live until options finish.
internal enum DashLengthKind { Fixed, LiveWidth, CapturedWidth }
internal readonly record struct DashLength(double Value, DashLengthKind Kind, Source Source, Source? NodeWidth = null)
{
    internal double Resolve(EvaluationState state, Budget budget)
    {
        budget.Charge(Source);
        var value = Kind == DashLengthKind.LiveWidth ? state.Paint.Width
            : NodeWidth is { } width ? state.Dimension(width, budget) : Value;
        var sp = Math.Round(value * (72.27 * 65536 / 72), MidpointRounding.AwayFromZero);
        if (!double.IsFinite(sp) || sp is < -1073741823 or > 1073741823) Budget.Fail(Source, "dash dimension");
        return sp * (72 / (72.27 * 65536));
    }
}
internal sealed record PendingDash(DashLength[] Lengths, bool ResetPhase, Source Source);

internal static class DashPattern
{
    internal static DashLength[] Read(Source source, EvaluationState state, Budget budget)
    {
        var reader = new Cursor(source, budget); var values = new List<DashLength>();
        while (!reader.End)
        {
            var operatorStart = reader.Position;
            if (!(values.Count % 2 == 0 ? reader.Word("on") : reader.Word("off")))
                throw new CompileError("TIKZ001", "Expected alternating 'on' and 'off' dash lengths.", reader.Here);
            var start = reader.Position;
            while (!reader.End)
            {
                var remaining = reader.Source.Span[reader.Position..];
                if ((remaining.StartsWith("on", StringComparison.Ordinal) && (remaining.Length == 2 || !char.IsLetter(remaining[2])))
                    || (remaining.StartsWith("off", StringComparison.Ordinal) && (remaining.Length == 3 || !char.IsLetter(remaining[3])))) break;
                reader.Advance();
            }
            var lengthSource = source.Slice(start, reader.Position - start).Trim();
            if (lengthSource.Length == 0) throw new CompileError("TIKZ001", "Expected a dash length after 'on' or 'off'.", source.Slice(operatorStart, reader.Position - operatorStart));
            var value = ReadLength(lengthSource, state, budget);
            if (value.Kind == DashLengthKind.Fixed && value.Value < 0) throw new CompileError("TIKZ001", "Negative dash length.", value.Source);
            values.Add(value);
        }
        // Empty patterns mean solid; odd patterns repeat with reversed on/off
        // parity in SVG/PDF. Zero on-lengths with positive gaps are valid.
        return [.. values];
    }

    internal static DashLength ReadLength(Source source, EvaluationState state, Budget budget)
    {
        var value = Options.Clean(source);
        if (value == "\\pgflinewidth") return new(0, DashLengthKind.LiveWidth, source);
        if (value == "\\the\\pgflinewidth" || value == "\\the \\pgflinewidth") return new(0, DashLengthKind.CapturedWidth, source);
        return new(state.Dimension(source, budget), DashLengthKind.Fixed, source);
    }

    internal static void Set(EvaluationState state, DashLength[] lengths, Source source, Budget budget)
    {
        state.ConfiguredDash = lengths;
        Schedule(state, lengths.Length == 0, source, budget);
    }

    internal static void Schedule(EvaluationState state, bool resetPhase, Source source, Budget budget)
    {
        var lengths = new DashLength[state.ConfiguredDash.Length];
        for (var i = 0; i < lengths.Length; i++)
        {
            budget.Charge(source); var item = state.ConfiguredDash[i];
            lengths[i] = item.Kind == DashLengthKind.CapturedWidth
                ? new(state.Paint.Width, DashLengthKind.Fixed, item.Source, state.NodeLineWidth) : item;
        }
        state.PendingDash = new(lengths, resetPhase, source);
    }

    internal static void Resolve(EvaluationState state, Budget budget)
    {
        if (state.PendingDash is not { } pending) return;
        var values = new double[pending.Lengths.Length];
        for (var i = 0; i < values.Length; i++)
        {
            values[i] = pending.Lengths[i].Resolve(state, budget);
            if (values[i] < 0) throw new CompileError("TIKZ001", "Negative dash length.", pending.Lengths[i].Source);
        }
        if (values.Length > 0 && values.All(v => v == 0)) throw new CompileError("TIKZ001", "Dash pattern must contain a positive length.", pending.Source);
        // Phase is a deferred macro in TikZ, including a written '\\the'.
        var phase = state.ConfiguredDashPhase;
        if (phase.Source.Text is null) phase = phase with { Source = pending.Source };
        if (phase.Kind == DashLengthKind.CapturedWidth) phase = phase with { Kind = DashLengthKind.LiveWidth };
        state.Paint = state.Paint with { Dash = values, DashPhase = pending.ResetPhase ? 0 : phase.Resolve(state, budget) };
        state.PendingDash = null;
    }
}

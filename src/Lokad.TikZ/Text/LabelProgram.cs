using Lokad.TikZ.Frontend;

namespace Lokad.TikZ.Text;

internal abstract record LabelItem(Source Source);
internal sealed record LabelLiteral(Source Origin) : LabelItem(Origin);
internal sealed record LabelSymbol(int Slot, string Readable, Source Origin) : LabelItem(Origin);
internal sealed record LabelSpace(bool Normal, string Readable, Source Origin) : LabelItem(Origin);
internal sealed record LabelBreak(Source Origin) : LabelItem(Origin);
internal sealed record LabelCorrection(Source Origin) : LabelItem(Origin);
internal sealed record LabelFont(FontChange Change, Source Origin) : LabelItem(Origin);
internal sealed record LabelGroup(List<LabelItem> Items, FontChange? Change, bool AutoCorrection, Source Origin) : LabelItem(Origin);
internal sealed record LabelMath(MathList Body, Source Origin) : LabelItem(Origin);
internal enum FontChange { Bold, Medium, Italic, Upright, Normal, RegularFamily, NormalSize, Large }
internal enum TextAlignment { Left, Center, Right }

internal readonly record struct TextFont(bool Bold, bool Italic, int SizePt)
{
    internal static TextFont Default => new(false, false, 10);
    internal string Id => (Bold, Italic, SizePt) switch
    {
        (false, false, 10) => "regular-10", (true, false, 10) => "bold-10", (false, true, 10) => "italic-10",
        (false, false, 12) => "regular-12", (true, false, 12) => "bold-12", (false, true, 12) => "italic-12",
        _ => throw new ArgumentException("Invalid bundled text font.")
    };
    internal TextFont Apply(FontChange change, Source source)
    {
        var result = change switch
        {
            FontChange.Bold => this with { Bold = true },
            FontChange.Medium => this with { Bold = false },
            FontChange.Italic => this with { Italic = true },
            FontChange.Upright => this with { Italic = false },
            FontChange.Normal => this with { Bold = false, Italic = false },
            FontChange.RegularFamily => this,
            FontChange.NormalSize => this with { SizePt = 10 },
            FontChange.Large => this with { SizePt = 12 },
            _ => throw new InvalidOperationException()
        };
        if (result.Bold && result.Italic)
            throw new CompileError("TIKZ002", "Combined bold italic is outside the bundled text profile.", source);
        return result;
    }
}

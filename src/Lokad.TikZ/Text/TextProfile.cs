using Lokad.TikZ.Frontend;

namespace Lokad.TikZ.Text;

internal static class TextProfile
{
    internal const string Id = "latin-modern-ec-10-12-v1";
    internal static int Slot(int scalar, Source source)
    {
        if (scalar is >= 33 and <= 126) return scalar;
        if (scalar is >= 192 and <= 214 or >= 216 and <= 222 or >= 224 and <= 246 or >= 248 and <= 254) return scalar;
        return scalar switch
        {
            0x00a1 => 189, 0x00a3 => 191, 0x00a7 => 159, 0x00ab => 19, 0x00bb => 20, 0x00bf => 190,
            0x00df => 255, 0x00ff => 184, 0x0152 => 215, 0x0153 => 247, 0x0131 => 25, 0x0237 => 26,
            0x1e9e => 223, 0x2013 => 21, 0x2014 => 22, 0x2018 => 96, 0x2019 => 39, 0x201c => 16, 0x201d => 17,
            _ => throw new CompileError("TIKZ002", $"Unsupported text character U+{scalar:X4} in the bundled profile.", source)
        };
    }

    // LaTeX's EC/Cork sfcode initialization, with ordinary sentence spacing.
    internal static int SpaceFactorCode(int slot) => slot switch
    {
        >= 65 and <= 90 or >= 128 and <= 156 or >= 192 and <= 223 => 999,
        46 or 63 or 33 => 3000, 58 => 2000, 59 => 1500, 44 => 1250,
        41 or 39 or 93 => 0, _ => 1000
    };
}

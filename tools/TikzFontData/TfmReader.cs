using System.Buffers.Binary;
using Lokad.TikZ.Text;

namespace TikzFontData;

// Development-only reader for the pinned text fonts. The format is documented
// in tex.web, sections 539–545. This is not a general TeX font interpreter.
internal sealed class TfmReader
{
    internal int DesignSizeFix { get; }
    internal uint Checksum { get; }
    internal int[] ParametersFix { get; }
    internal FontGlyph[] Glyphs { get; }
    internal FontPair[] Pairs { get; }

    internal TfmReader(byte[] data, string[] names)
    {
        if (data.Length < 24 || data.Length > 262140 || names.Length != 256)
            throw new InvalidDataException("Invalid TFM input size or encoding.");
        var lengths = Enumerable.Range(0, 12).Select(i => (int)BinaryPrimitives.ReadUInt16BigEndian(data.AsSpan(i * 2, 2))).ToArray();
        var (lf, lh, bc, ec) = (lengths[0], lengths[1], lengths[2], lengths[3]);
        var (nw, nh, nd, ni, nl, nk, ne, np) = (lengths[4], lengths[5], lengths[6], lengths[7], lengths[8], lengths[9], lengths[10], lengths[11]);
        if (lf * 4 != data.Length || lh < 2 || bc != 0 || ec != 255 || ne != 0 || np < 7
            || nw is < 1 or > 256 || nh is < 1 or > 16 || nd is < 1 or > 16 || ni is < 1 or > 64
            || lf != 6 + lh + 256 + nw + nh + nd + ni + nl + nk + ne + np)
            throw new InvalidDataException("TFM tables do not match the pinned text-font format.");
        int Word(int index) => BinaryPrimitives.ReadInt32BigEndian(data.AsSpan(index * 4, 4));
        int[] Table(int start, int count) => Enumerable.Range(start, count).Select(Word).ToArray();
        Checksum = unchecked((uint)Word(6));
        DesignSizeFix = Word(7);
        var chars = 6 + lh;
        var widths = chars + 256;
        var heights = widths + nw;
        var depths = heights + nh;
        var italics = depths + nd;
        var programs = italics + ni;
        var kerns = programs + nl;
        var parameters = kerns + nk;
        ParametersFix = Table(parameters, np);
        if (Word(widths) != 0 || Word(heights) != 0 || Word(depths) != 0 || Word(italics) != 0)
            throw new InvalidDataException("Nonzero TFM zero metric.");
        Glyphs = new FontGlyph[256];
        var rules = new List<FontPair>();
        for (var slot = 0; slot < 256; slot++)
        {
            var info = data.AsSpan((chars + slot) * 4, 4);
            var (w, h, d, i, tag, start) = (info[0], info[1] >> 4, info[1] & 15, info[2] >> 2, info[2] & 3, (int)info[3]);
            if (w == 0 || w >= nw || h >= nh || d >= nd || i >= ni || tag is not (0 or 1))
                throw new InvalidDataException("Unsupported or invalid TFM character record.");
            Glyphs[slot] = new(slot, names[slot], Word(widths + w), Word(heights + h), Word(depths + d), Word(italics + i), "");
            if (tag == 0) continue;
            if (start >= nl) throw new InvalidDataException("Invalid TFM ligature entry.");
            var first = data.AsSpan((programs + start) * 4, 4);
            if (first[0] > 128) start = 256 * first[2] + first[3];
            var matched = new HashSet<int>();
            for (var step = start; ;)
            {
                if (step >= nl) throw new InvalidDataException("Invalid TFM ligature program.");
                var instruction = data.AsSpan((programs + step) * 4, 4);
                var (skip, right, operation, remainder) = (instruction[0], (int)instruction[1], instruction[2], instruction[3]);
                if (skip > 128) break;
                if (matched.Add(right))
                {
                    if (operation >= 128)
                    {
                        var index = 256 * (operation - 128) + remainder;
                        if (index >= nk) throw new InvalidDataException("Invalid TFM kerning index.");
                        rules.Add(new(slot, right, null, Word(kerns + index)));
                    }
                    else if (operation == 0) rules.Add(new(slot, right, remainder, null));
                    else throw new InvalidDataException("Pinned font requires an unsupported ligature operation.");
                }
                if (skip == 128) break;
                step += skip + 1;
            }
        }
        if (nl > 0 && (data[programs * 4] == 255 || data[(programs + nl - 1) * 4] == 255))
            throw new InvalidDataException("Pinned font requires boundary-character shaping.");
        Pairs = rules.OrderBy(p => p.Left).ThenBy(p => p.Right).ToArray();
    }
}

# Native math font observations

This profile grounds font data for the pending
[bounded math-label target](../../../docs/MATH-LABELS.md). Math labels remain
unsupported by the public converter. Font measurements and atlas images are
a separate boundary from actual label layout and diagram qualification.

Nineteen fixed font/size combinations use eighteen native TFM files: six OT1
roman, six OML italic, six OMS symbol combinations and fixed 10pt OMX extension.
The scaled 12pt symbols use `lmsy10`; script styles select the declared optical
faces. Native integer measurements cover 3,212 present glyphs, 264 missing
slots, 307 font dimensions and 15,870 pair rules. The extension resource retains
74 larger-glyph links and 28 recipes. Missing characters remain unavailable.

Each face's JSON records independent TeX box/character dimensions, italic
corrections, font parameters and pair boxes. Its SVG records independently
outlined glyphs in a declared 430x500bp frame. The candidate atlas must derive
positions from embedded metrics and reproduce the raw exact primary pixels;
it may not fit, shift or substitute the reference glyph positions.

`radicals.json` and `native-radicals.log` retain independent native observations
for 66 fixed cases: 10/12pt surrounding text, text/script/scriptscript styles,
and eleven radicand heights from zero to 80pt. These observe the small symbol
radical, every required larger radical glyph, extensible top/repeat/bottom
pieces and overbar rules. The ordinary suite checks selected style sizes,
fixed extension size and assembly pieces against the embedded data. This
grounds font selection and pieces, not a converter radical-layout algorithm.

Generation, non-writing verification, exact atlas comparison and generic
corruption controls reuse the existing font tool and renderer. See the
[commands and inspection artifacts](../../../tools/TikzFontData/README.md#math-font-data).
Input/resource hashes and licensing are in `math-font-profile.json`,
`math-provenance.json` and the [font notices](../../../THIRD-PARTY-NOTICES.md).
Full math-label glyph/rule placement, numeric/image policies and final fresh
converter qualification remain separate required work.

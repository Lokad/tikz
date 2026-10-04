# Bundled font data prototype

This development tool pins six Latin Modern EC/Cork fonts: regular, bold,
and italic, each at its own 10pt or 12pt design size. It reads TFM metrics
with managed code and extracts Type 1 outlines with dvisvgm. Production
uses embedded JSON and needs only .NET. Normal builds do not run this tool.

```text
dotnet run --project tools/TikzFontData -c Release -- generate
dotnet run --project tools/TikzFontData -c Release -- verify
dotnet run --project tools/TikzFontData -c Release -- compare
```

`generate` explicitly writes the six resources, independent TeX metric
baselines, framed reference atlases, and provenance. `verify` runs the live
oracle again and requires the generated resources and baselines to agree
byte for byte; it never writes them. Both require the pinned MiKTeX and
dvisvgm versions and exact input hashes. Font mapping is explicitly pinned
to `lm.map`, dvisvgm caching is disabled, and shell escape and package
installation are disabled. Only this trusted repository wrapper runs in
TeX. Tool time and captured output are bounded.

`compare` needs the pinned Playwright/browser installation, but no TeX or
installed font. It loads the assembly's embedded data, validates cached
hashes, and reconstructs each atlas using managed metrics and outlines.
It produces the usual PNGs, differences, crops, numeric reports, and HTML
viewer under `artifacts/font-comparisons/<face>/`. A suite manifest requires
all six faces. Exit codes are 0 for pass, 1 for mismatch, and 2 for harness
failure. Artifact data is ignored by Git.

All 256 glyphs per font have independent integer-sp measurements for
advance, height, depth, italic correction, and the actual TeX box. Every
kerning and ligature pair is checked through an independent TeX box:
17,444 pairs across the six fonts. Font dimensions include ordinary space,
stretch/shrink, extra space, x-height, and em. Character 32 is a visible
blank glyph and is not ordinary space glue. The reader rejects fonts that
need other ligature operations or boundary-character programs rather than
discarding their semantics. TFM fixed-point scaling matches TeX's specified
integer truncation, including negative kerns.

The atlas uses a fixed 24pt cell width with 16pt between row boxes. Managed
baselines must match the independently positioned TeX glyphs within one
millionth of a CSS pixel. Both SVGs retain bp coordinates and use a declared
390bp by 540bp frame; the comparison runner explicitly converts that unit
for origin registration. No alignment or fitting is performed. All six
atlases have exact primary pixels at 1x and 4x over transparent, white, and
black backgrounds on the pinned renderer.

```text
npm run test:fonts --prefix tools/TikzVisual
```

Six atlas comparator checks include a repeated unchanged reconstruction,
missing period/ligature/accent glyphs, a quarter-CSS-pixel baseline shift,
and an incorrect glyph substitution. Each intended defect must fail and
its image crop must identify the corresponding font glyph slot. They never
submit mutated source to TeX or update expected output.

This validates the resource extraction and atlas reconstruction. It does
not establish node layout, word shaping, automatic ink bounds, Unicode
mapping, or math typesetting. The TikZ converter still rejects labels.
Text integrated into the converter's CSS-coordinate scene needs its own
oracle-only rendering calibration: moving a bp root transform into a CSS
group transform produced small raster differences even with the same
outlines and glyph positions. No text tolerance has been established by
this atlas experiment. The secondary PDF text route is also pending.

Initial node text will explicitly select the 10pt or 12pt optical face;
arbitrary optical-size selection and combined bold italic are not implied.
All EC glyph slots are bundled so reference pair rules remain complete.
The frontend's accepted Unicode repertoire must be enumerated separately
before labels are advertised; availability in these resources is not a
claim that every corresponding input command or character is supported.

Input and output hashes are in `font-profile.json` and the resource
`provenance.json`. The upstream README and manifest carry different version
labels; exact file hashes, not those labels, identify the inputs. Font data
retains the GUST Font License / LPPL 1.3c or later. See
[the notices](../../THIRD-PARTY-NOTICES.md) and included license files.

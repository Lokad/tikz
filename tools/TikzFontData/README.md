# Bundled font data

## Math font data

The separate `latin-modern-math-10-12-v1` profile pins nineteen font/size
combinations: OT1 roman, OML italic and OMS symbols at 5/6/7/8/10/12pt, plus
fixed 10pt OMX extension. The 12pt symbols use the 10pt design scaled to 12pt.
These resources support the [bounded math-label profile](../../docs/MATH-LABELS.md);
font extraction alone does not implement or qualify math labels.

```text
dotnet run --project tools/TikzFontData -c Release -- generate-math
dotnet run --project tools/TikzFontData -c Release -- verify-math
dotnet run --project tools/TikzFontData -c Release -- compare-math
node tools/TikzVisual/font-self-test.mjs --math
```

Generation explicitly writes embedded data, independent metrics/atlases,
radical observations and provenance. Verification recomputes them without
writing expected files. Both check exact tool/input hashes and use the existing
bounded process runner, disabled shell escape/installation, pinned font map
and disabled outline cache. Only fixed repository-authored wrappers enter TeX.
Every present glyph and missing slot, all font dimensions and accepted pair
rules have native integer measurements. Larger-glyph chains and extensible
recipes remain in the generated data, with the required radical size chain
and assembly pieces checked against actual native math glyph/rule observations.

When only the trusted radical probe changes, use `generate-math --radicals-only`
for iteration. It verifies the unchanged profile/tools/inputs and every cached
font resource/metric/atlas hash before preserving those measurements. Full
non-writing verification is required for final font-unit acceptance.

Comparison uses the existing browser/atlas machinery and exact primary policy.
Math has a fixed 430x500bp frame; native ink must fit that frame. Outputs under
`artifacts/math-font-comparisons/<face>/` include paired PNGs, raw/amplified
differences, source/slot attribution and the HTML inspection viewer. The six
generic font controls are reused with missing relation/operator/radical,
baseline-shift and substitution probes for the scaled symbol face. Text
resources, frames and policies retain their separate profile.

The [native reference](../../tests/Reference/MathFonts/README.md) describes
3,212 glyphs, 307 font dimensions, 15,870 pairs, 74 larger-glyph links,
28 recipes and 66 radical cases. Production loads renamed embedded JSON with
only .NET; the source/font tools and native files are development dependencies.

## Text font data

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

The atlas validates resource extraction and reconstruction. It does not by
itself establish node layout, word shaping, ink bounds, Unicode mapping or
math typesetting. Public label support and its separate calibration scopes
are defined by the [text](../../docs/TEXT.md), [node](../../docs/NODES.md) and
[math-label](../../docs/MATH-LABELS.md) contracts. Moving a bp root transform
into a CSS group produced measured raster differences even with identical
outlines and positions; the atlas policy is not a general text tolerance.

Node text explicitly selects the 10pt or 12pt optical face;
arbitrary optical-size selection and combined bold italic are not implied.
All EC glyph slots are bundled so reference pair rules remain complete.
The frontend's accepted Unicode repertoire is defined separately in the
text contract; bundled slots do not imply support for every corresponding
input command or character.

## Native whole-label references

The [text frontend](../../docs/TEXT.md) has a separate sixteen-case
word/box experiment. `generate-text-reference` explicitly creates its baselines;
`verify-text-reference` live-checks them without writing; `compare-text` consumes
them with only the pinned browser. MiKTeX's pinned DVItype supplies exact native
integer glyph positions, while dvisvgm supplies independently outlined images.
Run the cached comparison and its image controls with:

```text
dotnet run --project tools/TikzFontData -c Release -- compare-text
npm run test:text --prefix tools/TikzVisual
```

Reports retain numeric deltas, glyph traces, paired PNGs and inspection images
under `artifacts/text-comparisons/`. See the [testing guide](../../docs/TESTING.md)
for renderer setup and the distinction between iteration and qualification.

`calibrate-text-reference` uses the original oracle outlines and DVItype
positions, never the candidate parser, layout, or glyph resources. Its raw
exact-policy mismatches measure the SVG driver's fractional-advance difference.
It saves aggregate evidence under `artifacts/text-calibration/`; a reviewed
snapshot grounds the separate [text raster policy](../TikzVisual/TEXT-CALIBRATION.md).
Node layout, converter CSS placement and secondary PDF fidelity have their own
scopes in the linked contracts. Atlas and label evidence observe different boundaries.

Input and output hashes are in `font-profile.json` and the resource
`provenance.json`. The upstream README and manifest carry different version
labels; exact file hashes, not those labels, identify the inputs. Font data
retains the GUST Font License / LPPL 1.3c or later. See
[the notices](../../THIRD-PARTY-NOTICES.md) and included license files.

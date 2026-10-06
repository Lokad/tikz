# Labeled-border PDF rasterizers and isolated instructions

This explicit local development experiment compares the unchanged ordinary
`LabelledBorders` PDFs through pinned Poppler/Splash and Poppler/Cairo 24.04.0.
It retains the earlier instruction/registration evidence, checks fresh page
renders and isolates selected painted operations without moving them. It invokes
no converter and grants no image allowance or conformance admission.

The fixture [PDF investigation](LABELLED-BORDER-PDF.md) must complete first.
The following command additionally needs the local `pdftoppm` and `pdftocairo`
executables with the declared binary hashes, and inspected sources from the
pinned [Poppler release archive](https://poppler.freedesktop.org/poppler-24.04.0.tar.xz)
under ignored `external/poppler-24.04.0/`:

```text
node tools/TikzVisual/inspect-labelled-border-pdf-rasterizers.mjs
node tools/TikzVisual/labelled-border-pdf-rasterizer-self-test.mjs
```

The second command validates the completed bundle without invoking a PDF engine,
using Node, cached native evidence and the pinned browser. It verifies all input,
tool and artifact hashes, the fixed prerequisite report and browser identity,
reconstructs diagnostic PDFs and SVG selections, and independently recomputes
every stored whole/local metric from the saved PNGs. Its 39 controls reject
changed roles, coverage, native records, engines, commands, repeats, wrappers,
regions, crop lattices and artifact links.

A separate portable command needs only Node and repository evidence:

```text
node tools/TikzVisual/labelled-border-pdf-diagnostics-self-test.mjs
```

Its 72 controls validate resource preservation, original operands, visible
painting order, invisible text cursor retention, unsupported render modes,
changed origins/resources and input bounds. Prepared ordinary Windows/Linux CI
runs this command and uploads its bundle. Live PDF-engine execution remains
explicit and local; hosted execution is unverified.

## Independent engine and wrapper controls

The Splash binary SHA-256 is
`339a5bbff0b0a1427253268043ab48bca3f677acc040f32435d171b6cefd8949`;
Cairo is `35e9a069589d52ad9e2b2ce3eb28b00dee2555c4ee72c1335242a4842f9b10e5`.
The release archive SHA-256 is
`1e804ec565acf7126eb2e9bb3b56422ab2039f7e05863a5dfabdd1ffd1bb77a7`.
The checker separately pins six extracted source files. Executable paths,
versions, arguments, logs, original files and source copies are retained.

The inspected `CairoFontEngine.cc:189` uses `FT_LOAD_NO_HINTING` for its FreeType
font face; `SplashFTFont.cc:157–184` supports configurable hinting, including
light Type 1 hinting. This source evidence describes different font-loading
paths. It does not attribute every observed pixel difference to hinting; the
engines also have different graphics rasterization code.

All 60 page renders have exact repeated PNGs at the native 96/384-dpi lattice.
The six fresh unchanged Splash pages equal their frozen PNGs byte for byte.
Twelve resource-preserving diagnostic PDFs retain every original object except
the content stream; embedded fonts, encodings, widths, page dimensions and
resources remain byte-identical. Rebuilding the complete original instructions
must render exactly like the unchanged PDF in both engines and scales. All
twelve wrapper controls pass.

## Isolating effects without fitting

Each case has complete paths-only and glyphs-only documents, plus a wrapper
with all original instructions. Additional diagnostics isolate `lines:glyph-1`
(V), `lines:glyph-11` (italic period) and `transforms:path-6` (orthogonal path).
State and operands preserve their original values and sequence.

Single-glyph diagnostics retain every original byte, font width, kerning
adjustment and text cursor. PDF text mode 3 hides other glyphs; mode 0 paints the
selected glyph. The verifier independently checks the retained glyph matrices
and visible painting order. No glyph is repositioned or advanced using a fitted
offset. SVG diagnostics keep the original printed-PDF representation's root,
definitions and selected elements with unchanged attributes. Their cameras and
all local windows remain those derived from native evidence.

At 4x the isolated V has one component in both images and an edge discrepancy
of 0.25 CSS px in both engines. The isolated period has one component, with
0.354 CSS px for Splash and 0.25 for Cairo. Isolated path-6 has one component,
zero thresholded edge discrepancy for Splash and 0.25 CSS px for Cairo; its raw
changed-pixel counts remain 224 and 1,256. Edge identity is not pixel identity.

The earlier full Splash windows had 7.353 CSS px for glyph-1, 2.5 for glyph-11
and 2.75 for transformed endpoint windows, each including neighboring ink.
Isolation substantially reduces those values without changing original
operands. The full windows remain required evidence. A later image policy must
demonstrate sensitivity in the combined drawing as well as isolated diagnostics.

## Raw comparisons and agent inspection

Thirty-six fresh Cairo comparisons cover original SVG, independent native ink
and printed PDF instructions, natural/expanded frames and 1x/4x on white.
Thirty-six additional comparisons cover diagnostic layers and selected
operations through both engines. Their 3,852 local observations and 72 whole
metrics remain separate from the imported 36 Splash views and 1,944 locals.
The cached checker recomputes all 5,904 whole/local metrics from their PNG pairs.
No reference/candidate alignment or tolerance fitting occurs.

Expanded native-ink versus unchanged Cairo PDF currently shows:

| Case | Changed pixels, 1x | Changed pixels, 4x | Whole edge discrepancy, 4x | Maximum local edge discrepancy, 4x |
| --- | ---: | ---: | ---: | ---: |
| lines | 2,400 | 10,736 | 0.354 CSS px | 2.693 CSS px |
| paths | 3,394 | 15,509 | 0.5 CSS px | 0.5 CSS px |
| transforms | 3,010 | 13,714 | 0.5 CSS px | 0.5 CSS px |

Some lines/transforms local windows still differ in component count. Neither
engine is uniformly closer under every metric. These raw observations qualify
repeatability, resource-preserving wrappers and the diagnostic method, without
approving PDF image limits.

Read `artifacts/labelled-border-pdf-rasterizers/latest.json`, its digest-checked
report and `index.html`. New observations link full registered pages, whole
PDF/SVG/raw/amplified/overlay PNGs, complete region measurements and paired
crops. Lines views retain the V and both period crops; transforms retain the
orthogonal endpoint. Isolated documents retain their target crop. Original
SVG/PDF/native/font/tool evidence and earlier observations are copied under
`prerequisite/`; imported artifact links use that prefix. Node IDs, glyph/path
indices and the original fixture identify each operation. Candidate source
spans remain available from the separate public inspector.

All attempts retain fresh GUID bundles. The next step derives a separately
frozen PDF policy from unchanged independent evidence, then tests image-only
defects in the full diagrams at both scales. Both original-SVG-versus-PDF and
fresh-public-SVG-versus-PDF must pass alongside numeric, ink/root and primary
gates before immutable combined admission. This family inherits no earlier
shape, border or dash image allowance.

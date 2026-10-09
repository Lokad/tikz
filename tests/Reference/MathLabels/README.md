# Native math-label grounding

These repository-authored fixtures ground the
[bounded math-label profile](../../../docs/MATH-LABELS.md). The public converter
now renders all three sources and matches their measured geometry exactly.
The nineteen math font/size resources are now bundled and independently checked
through the [font tooling](../../../tools/TikzFontData/README.md). The internal
source-aware parser and integer math layout preserve selected optical styles,
glyph/rule provenance and paint order. Label image qualification remains pending.

| Fixed source | Measured labels | Anchors | DVI glyphs | DVI rules | User scalar results |
| --- | --- | --- | --- | --- | --- |
| `network-math-labels` | 10 | 160 | 44 | 2 | 9 |
| `math-label-contract` | 26 | 416 | 109 | 15 | 0 |
| `math-atom-contract` | 28 | 448 | 306 | 20 | 0 |

The small network combines five node labels and five path labels with
positioning, calculated coordinates, degree functions, loops, styles and six
arrows. The focused corpus exercises atom spacing, paired scripts in either
order, grouped/nested scripts, fractions and roots with nesting, mixed prose,
and 10/12pt math. The large nested cases also observe the 6pt script style.
The additive atom corpus covers every declared named and ASCII atom, both
negated-equality aliases, binary spacing contexts, upright font selection and
ligatures, script spacing, multiline labels, signed glue and actual assembled
radicals around tall nested fractions.

The measurement JSON files retain source digests, text-box dimensions,
frames and sixteen anchors per label. Each `native-layout/<id>/` directory
retains the plain outlined SVG, sanitized DVItype trace and font observations.
The latter records selected native font names/sizes, ordered node-origin
markers, raw glyph/rule counts and hashes of the native TFM/encoding/Type 1
inputs. The ordinary tests compare these independently of production math
arithmetic and font resources: native widths come from separate TFM observations;
DVI movements, units, origins, font selections, glyph advances and rules are
validated before comparing every box, anchor, glyph and rule. Native corruption
controls exercise this reader. An approved math image policy remains separate.

The `fonts/` directory retains sixteen original TFM inputs from the existing
native runs. Their bytes must match both the selected font profiles and the
observations above. The shared native width decoder also recovers fractional
driver advances, while the integer math measurements remain unchanged. The
original SVG is bound to 1,194 origin/glyph/rule quantities, including rule
dimensions, paint order, selected slots and local scaled-outline aliases.
Native atlas contours and global label registration are checked separately.
Corruption controls reject changed outlines, aliases, rule paint and placement.

Native-only image experiments reuse the existing artifact handling, process
runner, renderer, pixel decoder and saved-report reader:

```sh
node tools/TikzVisual/math-label-native-images.mjs
node tools/TikzVisual/check-math-label-native-images.mjs <exact-report-path>
node tools/TikzVisual/math-label-native-self-test.mjs <owned-event-directory> --out artifacts/math-native-controls
```

These commands consume frozen references without running MiKTeX or the
converter. Eight fixed SVG encodings isolate root-unit conversion, flattening,
fractional versus integer advances, native selected-size atlases and 6/12-digit
matrices. They preserve the original path/paint order and physical registration.
The bundle contains 144 paired views, PNG differences, overlays, crops and
HTML viewers. An independent reader checks raw sample metrics in all 48
transparent pairs; its eight-neighbor topology remains separate from the
legacy renderer's four-neighbor observations. Native event label identities
are retained in `native-frame.json`; these native-only crops do not assert
converter source spans. These experiments explain encoding differences and
leave primary/PDF policies and final feature qualification pending.

The additive `native-layout/<id>/framing.json` records bind four PGF picture
bounds, observed native linewidths and the original SVG's ordered path/pen
state. Supplemental observations preserve the frozen drawing, label boxes,
anchors and fonts. The additive `paths.json` supplements reuse the arrow hooks
and bounded path reader to bind shipped integer PGF paths, pens and tip
placements to the original SVG's ordered paint. The two contracts without
arrows explicitly opt into that observation; older arrow reader defaults remain.
Natural roots combine exact PGF picture bounds with integer native path ink
and selected native outlines at integer DVI positions;
they stay separate from padded inspection cameras. Browser boxes check analytic
geometry with a magnitude-derived binary32 bound, without choosing a raster
allowance. All 64 labels, 459 glyphs, 37 rules and 71 paths have fixed inspection
regions, including the empty spacing label and assembled radicals.

Fresh public exports and affected framing/image diagnostics reuse the existing
source trace, process/artifact handling, renderer and independent PNG reader:

```sh
dotnet run --project tools/TikzReference -c Release -- export-math-labels --out artifacts/math-public
node tools/TikzVisual/math-label-framing-images.mjs <owned-native-image-report> artifacts/math-public/report.json --out artifacts/math-framing
node tools/TikzVisual/check-math-label-framing.mjs artifacts/math-framing/report.json
node tools/TikzVisual/math-label-framing-self-test.mjs artifacts/math-framing/report.json --out artifacts/math-framing-controls
node tools/TikzVisual/math-label-native-paths-self-test.mjs artifacts/math-framing/report.json --out artifacts/math-path-controls
```

This iteration bundle keeps 24 affected pairs, 5,048 fixed-region checks,
source-attributed numeric differences, paired inspection sheets and individual
mark crops. The independent decoder identifies shared and distinct changed
pixels between the original driver, native integer encoding and fresh converter.
Natural-root serialization and conservative path metadata are checked separately:
metadata must contain native ink and remain within cap/miter-limited native pen
envelopes. Local arrow geometry carries its placement transform in the export.
Raw exact-box differences remain diagnostics; these checks do not admit a primary or
PDF policy. Math rectangles and scaled outline aliases explicitly opt into the
existing comparison routine; older path/glyph/clip semantics stay separate.

The existing node/scalar observer admits only fixed source hashes. It checks
pinned MiKTeX/dvisvgm/DVItype versions and PGF 3.1.11a, retains executable and
native input hashes, selects `lm.map` explicitly with caching disabled for
these math cases, and requires identical plain/probed SVG drawing.
Definition order is normalized for uniquely named paths and scaled local glyph
aliases; all definition contents and painted drawing remain exact. Full raw
SVG/DVI, process receipts and captured font inputs remain in ignored artifacts.
Existing non-math native routes and calibration are preserved.

The primary workflow observes two native atlas matrix encodings through the
existing intrinsic-image and explicit-viewport routes in natural/expanded,
1x/4x and transparent/white/black views. It derives limits per exact view and
region from native measurements, then checks representative missing/displaced
script, fraction, radical and path-label marks with numeric gates bypassed.
The empty label has an added-ink control. Every mark has policy coverage;
representative faults do not establish sensitivity to every possible mark fault.
Owned artifacts, PNG decoding, policy maxima and generic report-corruption
controls reuse the existing machinery. Math rule rectangles explicitly opt
into vector capture; default source handling stays unchanged.

```sh
node tools/TikzVisual/calibrate-math-label-primary.mjs <accepted-native-image-report>
node tools/TikzVisual/check-math-label-primary.mjs <exact-primary-report> <accepted-native-image-report>
node tools/TikzVisual/math-label-primary-self-test.mjs <exact-primary-report>
node tools/TikzVisual/math-label-primary-images.mjs <accepted-native-image-report> <exact-primary-report> <current-public-export-report>
```

The primary checker independently decodes whole and local pixels, rederives
native framing, encodings and policies, and recaptures each native/controlled
source. The current-output matrix verifies public source hashes, decodes all
72 view pairs and recaptures the public SVGs. Retain unchanged calibration
between iterations; PDF and final feature qualification are separate gates.

Ordinary math PDF references reuse the accepted native path run's owned
wrappers for these three fixed sources. The PDF route switches the native
driver, records the shipped box position on a fixed physical page, binds font
inputs to the frozen native files, and requires identical plain/probed PDF and
1x/4x raster bytes. Library declarations can leave measured leading wrapper
spaces; registration uses that observed width separately from picture geometry.
The independent checker replays the six compilations and twelve rasters,
checks all native label/anchor/box/pen measurements, and reuses the existing
page/crop arithmetic for every whole-picture and individual inspection region.

```sh
node tools/TikzVisual/math-label-pdf-reference.mjs <accepted-native-path-report>
node tools/TikzVisual/check-math-label-pdf-native.mjs <exact-native-pdf-report> <accepted-native-path-report> <exact-primary-report> <exact-primary-check-report>
node tools/TikzVisual/math-label-pdf-native-self-test.mjs <exact-native-pdf-report> <accepted-native-path-report> <exact-primary-report> <exact-native-pdf-check-report>
```

These references and source/page/font/crop checks preserve existing SVG/DVI
calibration. Both original-SVG/PDF and converter-SVG/PDF image policies and
current feature conformance remain separate requirements.

Regeneration is a separate development operation on these trusted inputs:

```sh
node tools/TikzVisual/diagram-positioning-reference.mjs network-math-labels math-label-contract math-atom-contract
node tools/TikzVisual/diagram-positioning-reference.mjs --framing network-math-labels math-label-contract math-atom-contract
node tools/TikzVisual/diagram-positioning-reference.mjs --paths network-math-labels math-label-contract math-atom-contract
```

All 734 ordinary tests pass at this implementation stage. The eleven earlier
public diagram/contract SVGs remain byte-identical. Frozen-native image
diagnostics use the existing pinned renderer, physical registration, paired
images, overlay/blink viewer and source-attributed crops. Raw pixel differences,
math-specific PDF qualification and final clean-source acceptance remain open;
the existing EC text policy cannot stand in for math font or rule semantics.

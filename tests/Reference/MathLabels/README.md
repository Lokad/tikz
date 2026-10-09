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
leave primary/PDF policies, framing and final feature qualification pending.

The existing node/scalar observer admits only fixed source hashes. It checks
pinned MiKTeX/dvisvgm/DVItype versions and PGF 3.1.11a, retains executable and
native input hashes, selects `lm.map` explicitly with caching disabled for
these math cases, and requires identical plain/probed SVG drawing.
Definition order is normalized for uniquely named paths and scaled local glyph
aliases; all definition contents and painted drawing remain exact. Full raw
SVG/DVI, process receipts and captured font inputs remain in ignored artifacts.
Existing non-math native routes and calibration are preserved.

Regeneration is a separate development operation on these trusted inputs:

```sh
node tools/TikzVisual/diagram-positioning-reference.mjs network-math-labels math-label-contract math-atom-contract
```

All 732 ordinary tests pass at this implementation stage. The eleven earlier
public diagram/contract SVGs remain byte-identical. Frozen-native image
diagnostics use the existing pinned renderer, physical registration, paired
images, overlay/blink viewer and source-attributed crops. Raw pixel differences,
math-specific image/PDF qualification and final clean-source acceptance remain
open; the existing EC text policy cannot stand in for math font or rule semantics.

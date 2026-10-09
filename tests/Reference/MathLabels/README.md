# Native math-label grounding

These repository-authored fixtures ground the
[bounded math-label target](../../../docs/MATH-LABELS.md). The public converter
currently rejects both at their opening `$` with TIKZ002 and emits no SVG.
Production math fonts, layout and image qualification remain pending.

| Fixed source | Measured labels | Anchors | DVI glyphs | DVI rules | User scalar results |
| --- | --- | --- | --- | --- | --- |
| `network-math-labels` | 10 | 160 | 44 | 2 | 9 |
| `math-label-contract` | 26 | 416 | 109 | 15 | 0 |

The small network combines five node labels and five path labels with
positioning, calculated coordinates, degree functions, loops, styles and six
arrows. The focused corpus exercises atom spacing, paired scripts in either
order, grouped/nested scripts, fractions and roots with nesting, mixed prose,
and 10/12pt math. The large nested cases also observe the 6pt script style.

The two measurement JSON files retain source digests, text-box dimensions,
frames and sixteen anchors per label. Each `native-layout/<id>/` directory
retains the plain outlined SVG, sanitized DVItype trace and font observations.
The latter records selected native font names/sizes, ordered node-origin
markers, raw glyph/rule counts and hashes of the native TFM/encoding/Type 1
inputs. These are raw observations; they do not constitute an independent
math-layout checker or an approved image policy.

The existing node/scalar observer admits only fixed source hashes. It checks
pinned MiKTeX/dvisvgm/DVItype versions and PGF 3.1.11a, retains executable and
native input hashes, selects `lm.map` explicitly with caching disabled for
these math cases, and requires identical plain/probed SVG drawing. Full raw
SVG/DVI, process receipts and captured font inputs remain in ignored artifacts.
Existing non-math native routes and calibration are preserved.

Regeneration is a separate development operation on these trusted inputs:

```sh
node tools/TikzVisual/diagram-positioning-reference.mjs network-math-labels math-label-contract
```

All 651 ordinary tests and the eleven earlier public diagram/contract probes
pass at this grounding stage. The new complete diagram and focused corpus
still demonstrate the missing math-label requirement. Future qualification
must check every declared symbol/style, measured layout and fresh converter
output, including fraction/radical rules; the existing EC text profile cannot
stand in for math font or rule semantics.

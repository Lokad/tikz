# Rectangle border combined conformance

The `chromium-153-rectangle-borders-ink-pdf-v1` policy covers only the three
unlabelled rectangle-border fixtures: `node-border-lines`, `node-border-paths`,
and `node-border-transforms`. It combines independently grounded native
geometry, stroke bounds, primary SVG, and ordinary PDF checks. Its reference
viewport comes from the independently measured stroke envelope. Original driver
comparisons and their failed exact pixels/crops remain separately reproducible.

```text
node tools/TikzVisual/compare-border-conformance.mjs
npm run test:borders --prefix tools/TikzVisual
```

The first command creates fresh public conversions through `TikzReference`
and consumes checked-in references. Neither command needs TeX or Poppler;
.NET and the pinned Node/Playwright/Chromium installation are required. The
complete original comparisons are under `artifacts/border-conformance/original/`.
The derived cases are under `artifacts/border-conformance/<case>/` and retain
SVGs, source/scene traces, measurements, provenance, PNGs, crops, and viewers.
Root `suite.json` and `index.html` link both routes.

Every case requires all applicable gates:

| Gate | Required coverage |
| --- | --- |
| Native scene | 835 checks across the corpus, recomputed from original PGF measurements and exported public-conversion scenes |
| Ink and frame | 144 independently measured path-bound checks and twelve natural `viewBox` checks |
| Primary SVG | Eighteen whole-picture and 840 regional checks at 1x/4x over transparent/white/black backgrounds |
| Ordinary PDF | 286 region/scale checks on each SVG side, including three whole-picture regions; measured native page, white paper, integer crops |

Geometry and natural frames use the unchanged 0.00004 CSS px contract. Counts,
paint modes/colors, and discrete properties use their exact native contracts;
opacity has its separately declared numeric tolerance. Missing/duplicated
quantities, forged expected values, weaker tolerances, and inconsistent flags
are rejected. Numeric agreement cannot excuse missing pixels and passing images
cannot excuse incorrect native geometry or physical dimensions.

The [policy](border-profile.json) pins the original
[frame](../../tests/Reference/NodeBorders/framing.json),
[primary calibration](../../tests/Reference/NodeBorders/primary-regions.json),
[PDF calibration](../../tests/Reference/NodeBorders/pdf-regions.json), and both
independent defect trials. The loader checks every fixture/input/artifact/tool
hash, measured PDF origin, native SVG/PDF path agreement, renderer distribution,
variant/region/scale/background coverage, repeat controls, and targeted defect
rejection. It recomputes every allowance from unchanged independent raw
measurements. Calibrated matches retain their raw differences and never receive
an exact-pixel label. See the [experiments](BORDER-REGIONS.md) for their provenance.

Caller-provided regions, profiles, cameras, PDF settings, or numeric-bypass flags
cannot weaken the route. Explicit test-facing image-only calls bypass all
semantic/ink/frame numeric gates and mark both policy approval and conformance
claims false. The checks still assert primary and PDF defect sensitivity
independently. Missing evidence or renderer errors remove stale/partial passes.

All three cached cases and eighty policy/comparator checks pass locally.
The self-test covers repeated unchanged images, all twenty image defects,
correct images with a genuine native numeric failure, natural dimensions,
missing/tampered/consistently rehashed evidence, widened budgets/limits, incomplete
coverage, caller overrides, and modified source/reference/PDF artifacts.
Results are saved under `artifacts/border-policy-tests/`. The commands are
required visual CI steps; hosted execution remains to be verified.

This admits the declared fixture/profile combinations. Labeled-node border
interactions, other shapes, `to`/`edge`, bends, path labels, arrows, and broader
TikZ compatibility remain separate work. The 22-node text fixture's PDF profile
and the existing geometry/node-interaction policies retain their own scope.

# Circle/ellipse primary policy trial

```text
node tools/TikzVisual/shape-policy-self-test.mjs
node tools/TikzVisual/trial-shape-primary.mjs
```

This is an unapproved policy trial for the fixed trusted 28-node fixture. It
does not admit a general circle/ellipse profile or any PDF claim. The command
first generates fresh [semantic-frame calibration](SEMANTIC-FRAME.md), verifies
its complete source/input/artifact chain, reconstructs all 98 region rectangles
from independent tight bounds, and derives prospective limits before invoking
the candidate.

Every region/view/background gets its own measured limits. Raw and
premultiplied changed-pixel counts, channel maxima, Euclidean edge displacement
and component difference retain their independent observed values. The only
rounding allowance is upward rounding of the measured foreground mean to
1e-9 channel units. Limits do not pool different glyphs, shapes, backgrounds or
views, and no candidate error sets a limit. The generated
`prospective-policy.json` retains `approvedImagePolicy:false`.

The independent reconstruction is replayed through the trial's pair renderer
at all twelve required views. Every global and regional metric must reproduce
the calibration exactly. This verifies the renderer's physical registration
and metric conventions before candidate comparison. Each decoded unchanged
pair must also remain exact.

The fresh public conversion then requires all 4,461 native numeric assertions
and 406 independent ink/frame checks. It compares the original SVG with the
candidate at 1x/4x, on transparent/white/black, in natural and expanded views.
All global gates and every independently fixed local gate are required. Source
spans and semantic/SVG IDs come from the verified unmutated public scene;
overlapping raster regions retain their spatial attribution caveat.

The executed trial passes all fourteen expected outcomes:

| Pair or control | Tested views | Expected result |
| --- | --- | --- |
| Independent reconstruction replay | All twelve | Every measured limit passes |
| Fresh public candidate | All twelve | Numeric, frame, global and regional trial gates pass |
| Synthetic faint unchanged pair | White natural 1x/4x | Its own independent limits pass |
| Missing period, missing changed-font glyph, missing border, doubled border, moved glyph, half opacity, quarter-pixel shift, height crop, extra ink | White natural 1x/4x each | Every defect is rejected with numeric gates bypassed |
| Missing 1%-opacity period and missing short faint stroke | White natural 1x/4x each | Both defects are rejected with numeric gates bypassed |

The forty-eight image comparisons retain 4,758 whole/region gate records, with
all raw measurements and per-metric limits. Candidate canvas PNGs match the
independently reconstructed native representation in all twelve views. This
is separate from original-oracle equality: the original SVG still has the
raw representation differences recorded in the calibration. The trial retains
the original-reference pairs and makes no exact-original-pixel claim.

Faint controls are explicitly synthetic artifact experiments. The same native
period is given 1% opacity on both independent SVG representations, and an
authored four-CSS-pixel stroke is added with the corresponding fixed physical
registration. Their own two-view measurements and 99 fixed regions are
established before candidate invocation. They test comparator sensitivity;
they are not new TikZ references and do not establish interaction compatibility.
Mutated artifacts and malformed comparator inputs never enter TeX.

Twenty-three policy self-tests additionally exercise exact/independent positive
controls, a faint loss that passes global metrics but fails its local gate,
absent edges, independent edge rejection, incomplete/duplicate coverage,
candidate-defined regions, incompatible mask settings, invalid measurements,
and correct pixels with failed numeric/frame evidence. Empty or contradictory
image summaries cannot pass the combined trial. The synthetic global-dilution
example is distinct from the native fixture's defect results.

The bundle under `artifacts/node-shape-primary-trial/` retains 784 PNGs, original
and mutated SVG pairs, prospective limits, independent faint calibration,
source and scene trace, numeric/frame reports, candidate provenance and hashes.
`index.html` links the contact sheets. Region records link separate identical
integer crops, white presentation and declared enlargement. Defect crops
prioritize the known mutation region so unrelated calibration noise cannot
hide the feature being tested. The JSON agent entry point gives local source,
trace, report links and focused/control rerun commands.

Exit 0 means all expected trial outcomes passed, 1 an unexpected comparison or
control outcome, 2 an infrastructure failure, and 3 a candidate conversion
failure. Reports always retain overall admission as pending and make no
approved image or PDF claim. Immutable reviewed limits, additional provenance
and coverage mutations, focused/interaction references, independently
registered ordinary PDF checks, and combined admission remain required.
Existing rectangle/path allowances do not apply. Prepared CI steps are
distinct from verified hosted execution.

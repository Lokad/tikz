# Combined node interaction PDF policy

The `chromium-153-node-interactions-rgb-ink-pdf-page-v1` policy covers the three
trusted `state-paint`, `transforms`, and `colors` fixtures: 41 rectangle nodes
with outlined Latin Modern labels, the declared RGB profile, and independent
stroke-ink framing. It requires native numeric and natural-dimension checks,
the reviewed primary SVG policy, and both original/candidate SVG comparisons
against ordinary TikZ PDF. It establishes a calibrated PDF cross-check for
these fixtures on white paper, in the pinned renderer environment.

```text
dotnet run --project tools/TikzReference -c Release -- compare-node-interaction-pdf
npm run test:interaction-pdf --prefix tools/TikzVisual
```

The fresh-conversion command accepts `--case` and `--out artifacts/...`. It
consumes cached references and requires the pinned browser, Node, and .NET;
it invokes no TeX or PDF rasterizer. Original exact and primary reports remain
available. Required CI runs the full three-case suite and policy checks;
hosted execution remains unverified.

## Independent admission

The [policy](interaction-pdf-profile.json) pins the existing primary policy,
the [page-coordinate calibration](../../tests/Reference/NodeInteractionsRgb/pdf-calibration-page.json),
the [viewport probe](../../tests/Reference/NodeInteractionsRgb/pdf-viewport-probe.json),
and the [original camera experiment](../../tests/Reference/NodeInteractionsRgb/pdf-calibration.json).
The [admission record](../../tests/Reference/NodeInteractionsRgb/pdf-admission.json)
retains passing cases, counts, raw PDF measurements, policy/tool identities,
candidate provenance, and the completed failure checks.

The loader validates reference/source/tool hashes, browser identity, native
SVG/PDF path/bounds/anchor agreement, the measured page origin, every fixed
region, all four oracle variants, repeat captures, and complete scale/background
coverage. It recomputes every channel, mean, edge, and component limit from the
1,416 independent measurements. It also verifies the 27 successful padded
viewport controls and their unchanged native SVG inputs. Caller-supplied limits,
regions, PDF cameras, and other raster policies cannot weaken this route.

| Fixture | Native numeric checks | Primary regional checks | PDF checks per SVG side |
| --- | ---: | ---: | ---: |
| `state-paint` | 1,210 | 228 | 78 |
| `transforms` | 953 | 210 | 72 |
| `colors` | 3,110 | 606 | 204 |

Each PDF side has 174 mandatory local glyph/path regions plus three whole-picture
regions, sampled at 1x/4x on the measured native page lattice. Source content maps
directly through declared units and page origin; the natural SVG viewport stays
an explicit clip. Neither image is fitted or fractionally resampled. Natural
dimensions remain a separate required primary check. The original ink-framed
oracle SVG is checked as well as the fresh candidate; matching one derived SVG
alone cannot establish the combined PDF verdict.

## Failure checks and retained history

Forty-one policy checks repeat six positive controls, reject all thirteen image
defects with numeric checks bypassed, and assert the PDF verdict independently
of the primary verdict. They reject changed/missing evidence, renderer/input
changes, altered fixed regions, moved origins, missing variants/measurements,
failed or omitted viewport controls, and inflated means even when the altered
evidence hash is updated. Correct pixels with a failed numeric quantity still
fail the combined verdict; a wrong natural height also fails. Missing numeric
coverage, fitted registration, caller PDF options, and changed PDF pages fail.
Image-only reports identify their bypass and approve no conformance claim.

The [initial failed trial](../../tests/Reference/NodeInteractionsRgb/pdf-mutation-trial.json)
and [grounded camera repair](INTERACTION-PDF-REGIONS.md) remain available. With
the repaired camera, the three formerly failing candidate/native SVG crops
match exactly at both scales. The new limits come only from recomputed oracle
variants. No compiler coordinates, reference content, or original thresholds
were changed to fit candidate failures.

## Inspection and limits

Open `artifacts/node-interaction-pdf/index.html`, then the selected case.
Each bundle links the primary SVG/numeric viewer, original oracle SVG versus
PDF, candidate SVG versus PDF, and combined `report.json`. PDF viewers provide
opacity, blink, zoom, raw errors, amplified differences, and ranked paired
regions with named-node source links. Sources, SVGs, native measurements, logs,
ordinary PDF pages, provenance, exact reports, primary reports, policy identities,
and hashed inspection artifacts remain in the bundle.

The PDF cross-check has its own regional cross-renderer allowances; it claims
neither exact PDF pixels nor compatibility with arbitrary fonts, colors,
renderers, or TikZ libraries. White-on-white ink remains unobservable by PDF,
so native counts and transparent/light/dark primary checks are mandatory.
Default-color/driver-crop failures and separate exact experiments remain
unchanged. Wider node forms, labels, border intersections, and arrows require
their own independent fixtures and admission.

# Independent node interaction SVG experiment

This experiment re-expresses the trusted TikZ references in CSS units, using
only PGF soft paths, native DVI glyph identities/positions, measured node frames,
and the original SVG's glyph outlines, paint, order, and clipping. It never
calls the converter, its geometry/layout helpers, or its bundled font resources.

The RGB corpus has 41 actual nodes across `state-paint`, `transforms`, and
`colors`. Cached execution requires the pinned browser, but neither TeX nor
Poppler. Original SVG/PDF and native traces remain unchanged.

```text
dotnet run --project tools/TikzReference -c Release -- calibrate-node-interaction-svg --profile rgb
dotnet run --project tools/TikzReference -c Release -- calibrate-node-interaction-svg --profile rgb --framing ink
npm --prefix tools/TikzVisual run test:interaction-crops
```

Both calibration commands admit `--case` and `--out artifacts/...`. Each case
has three independently specified variants: native CSS representation, and
global translations of ±4 integer TeX scaled points with matching clip
translation and conservative frame padding. These perturbations use the same
fixed bound as the geometry experiment; no candidate output sets their value.
Matrix coefficients and coordinates are serialized to six decimal places and
checked individually in their stated units.

The default frame retains the original driver's picture-box crop. `--framing
ink` uses the independent offset-line stroke calculation, preserving
`original-driver.svg` in each bundle. Each route compares on the same measured
physical origin. Both also report the original and reconstructed SVG against
ordinary PDF on its native page lattice.

`interaction-crop-check.mjs` independently reads the original outline bounds
in the browser and maps them through the measured glyph frames. It intersects
only the native axis-aligned rectangle clips admitted by the generator.
Serialization allowances account for matrix-error amplification by outline
coordinates and frame/origin rounding; they are not raster tolerances.
Fully clipped glyphs and partially clipped glyphs are recorded separately.
Unknown ancestor transforms or missing clip definitions fail explicitly.
The ten containment tests include unchanged/clipped cases, overflow, removed
or incorrect clips, missing glyphs, and malformed frames.

The checked-in [driver](../../tests/Reference/NodeInteractionsRgb/calibration-driver.json)
and [ink](../../tests/Reference/NodeInteractionsRgb/calibration-ink.json)
snapshots retain source/tool/input identities, original and derived hashes,
all per-scale/background raster errors, PDF registration/results, and glyph
containment. Each snapshot has 4,260 passing serialization/containment checks
across nine variants. Unperturbed dimension error is below 0.000001 CSS pixel;
the perturbed frames differ by less than 0.000163 CSS pixel.

The following raw maxima are from the independent ink-frame experiment,
including the two deliberate perturbations. Channel/mean values use 0–255.

| Case | Native CSS max channel | All variants max channel | Worst foreground mean | Worst edge displacement, CSS px |
| --- | ---: | ---: | ---: | ---: |
| `state-paint` | 4 | 10 | 0.005928 | 0.25 |
| `transforms` | 10 | 32 | 0.026600 | 1 |
| `colors` | 5 | 43 | 0.006834 | 0.25 |

Connected-component counts agree in every primary variant. The one-pixel
transform edge-mask step occurs at display resolution; 4x evidence separately
records its finer sampling. These measurements explain that raw pixel
differences can arise without candidate code. They do not approve these
maxima as conformance limits.

Both primary and PDF gates force exact pixels and intentionally return `1`
for their measured differences. A completed experiment has `completed: true`,
`converterInvoked: false`, and `conformanceClaim: false`. A missing input,
incompatible measurement, failed containment/serialization, or changed renderer
is a harness failure. A new run removes any previous aggregate result before
starting, so a failed regeneration cannot leave an old completion snapshot.

The ignored bundles under
`artifacts/node-interaction-svg-calibration-rgb[-ink]/<case>/<variant>/`
provide `report.json`, paired PNGs, amplified differences, crops, `index.html`,
and the full per-number evidence. No command writes baselines or policies.
Before admitting a raster policy, run image-only defects against the actual
interaction corpus, including missing faint content, clipping, paint order,
transformed borders, and crop loss. Check local evidence as well as aggregate
errors; a large canvas or other correctly rendered objects must not hide a
missing faint glyph. Review the PDF results separately.

The [regional follow-up](../TikzVisual/INTERACTION-REGIONS.md) now records two
whole-image false passes, 3,132 independent local measurements, and image-only
trials with the resulting prospective regional gates. The faint losses are
rejected locally; unchanged transformed content exposes additional precision
failures. Neither experiment itself admits an interaction policy. The subsequent
[finite-transform repair](TRANSFORM-PRECISION.md) resolves those unchanged-control
failures; the reviewed [primary policy](../TikzVisual/INTERACTION-PRIMARY.md) now
consumes the unchanged global/regional evidence. PDF calibration remains separate.

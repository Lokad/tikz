# Independent circle and ellipse SVG calibration

The existing executable also has a native math-event route:

```text
dotnet run --project tools/TikzShapeCalibration -c Release -- derive-math-events --out artifacts/math-label-native-events
node tools/TikzVisual/math-label-native-images.mjs
```

It binds the three fixed [math-label fixtures](../../tests/Reference/MathLabels/README.md)
to their retained DVI/SVG, independent integer metrics and original TFM inputs.
Math-specific rules, selected faces and scaled glyph aliases use separate
readers; TFM decoding, checked movements, safe outputs and artifact hashing are
shared with shape calibration. This route runs no reference engine and has no
converter assembly dependency. Its default output is
`artifacts/math-label-native-events/`. The image command reuses the pinned
renderer and produces native-only diagnostic pairs; it admits no image policy.

The circle/ellipse route and its five representations remain as described below.

```text
dotnet run --project tools/TikzShapeCalibration -c Release -- derive-svg
node tools/TikzVisual/calibrate-shapes.mjs
```

The first command reconstructs the fixed, trusted 28-node shape fixture using
only retained native PGF paths, measured node frames, DVI glyph positions,
original TFM inputs, and the original SVG outlines and paint. It first executes
the independent reference project's cached verifier. This executable has only
framework assembly references; it neither references nor invokes Lokad.TikZ.
It links the independently tested native glyph reader as source, without
referencing the candidate comparison assembly. No TeX or browser is needed.

An optional `--out artifacts/...` directory isolates independent experiments.
Paths outside `artifacts/`, symlink/junction parents and symlink/junction artifact
targets are rejected before writing through them. PLAN remains outside the
allowed output scope.

Five derived SVGs isolate different representation choices:

| Variant | Independent operation |
| --- | --- |
| `driver-css` | Retain all original paths, outlines and transforms; express the root dimensions and camera in CSS units. |
| `native-css-12` | Reconstruct global geometry and label placement from native integer measurements, with twelve decimal places. |
| `native-css-6` | Serialize the same reconstruction with six decimal places. |
| `sp-plus`, `sp-minus` | Apply fixed global translations of ±4 TeX scaled points; pad the root frame by the translation magnitude. These are sensitivity experiments. |

The reconstruction preserves native paint order, including each background
followed by its label. Every glyph's font and slot must match its original
outline definition. Four native variants each retain 1,238 serialization
checks with explicit quantities, units, errors, bounds and verdicts. The
original driver root frame remains the independent framing input. Derivation
provenance includes retained artifacts, original inputs, source hashes, the
actual executable assembly hash and its framework references.

The second command generates a fresh derivation and verifies all its hashes.
It uses the existing pinned development renderer without applying any
candidate tolerance policy. Each representation is compared with the original
oracle at 1x/4x, on transparent/white/black backgrounds. Natural views retain
each original or derived root frame; expanded views use a shared camera from
native picture bounds and the original driver origin, with four CSS pixels of
declared padding. No image fitting or candidate geometry determines a camera
or region.

The bundle under `artifacts/node-shape-calibration/` contains:

- `derivation.json`, native measurements/glyph evidence, original source,
  SVGs, logs, profiles, font inputs and provenance;
- `calibration.json`, 60 whole-picture and 5,880 local measurements covering
  98 native background/glyph regions, with raw and premultiplied RGBA errors;
- twelve separately decoded unchanged-oracle pairs, requiring exact RGBA
  equality in both frames at every scale/background;
- 610 hash-identified paired images, RGB/alpha differences, amplified differences,
  overlays, contact sheets and enlarged local crops;
- `calibration.html`, linking the representations and their largest regional
  differences for direct agent or human inspection.

The source/tool/artifact identities are checked before and after rendering.
Exact equality uses original RGBA samples; a separate grayscale alpha difference
preserves alpha-only discrepancies that an RGB difference would hide.
The fixed output directory rejects symbolic links/junctions. Both commands
return 0 for complete evidence generation, and 2 for infrastructure failure.
`calibration.json` deliberately retains a pending verdict and makes no
candidate conformance claim. These observed differences and perturbations
are not approved acceptance limits.

Local execution establishes a useful framing control: `driver-css` is exact
in the expanded camera at both scales and all backgrounds, while its natural
root rendering differs. That identifies a viewport/rendering contribution
separately from changing compiler geometry. The six-decimal native
reconstruction has nonzero primary differences, retained in full. Twelve
decimals do not eliminate them. The ±4sp trials measure sensitivity and do not
authorize an error budget of that magnitude.

The separate [ink and frame checks](FRAMING.md) now measure all 98 native
contributions, validate their analytic bounds with the browser, retain viewport
and clip-control experiments, and pass 406 public ink/root comparisons.
Further focused and interaction fixtures, edge/component gates, image-only defect controls
with numeric checks bypassed, ordinary PDF references and separate calibration,
and a reviewed admission policy remain required. Existing rectangle/path
allowances do not apply. CI prepares the evidence and uploads the bundle;
hosted execution remains unverified.

The separate [semantic-frame raster experiment](SEMANTIC-FRAME.md) derives the
declared zero-padding root from independent native picture/ink bounds, retaining
every native six-decimal drawing instruction. Original-primary and root-only
pairs record global and fixed-region channel, edge and component observations.
This remains oracle-only evidence generation with a pending admission verdict.

The [primary policy trial](PRIMARY-TRIAL.md) now replays those measurements,
derives per-region/view/background limits before candidate conversion, and tests
missing/faint-content artifacts with numeric gates bypassed. Its public
candidate and eleven defect controls pass their expected outcomes. The policy
remains unapproved; PDF and wider reference coverage remain outstanding.

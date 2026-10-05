# Native transform and dimension precision

The converter now resolves affine composition, geometric point application,
node frame shifts, border corners, and named node anchors with finite PGF
scaled-point operations. Each affine product truncates separately; translation
addition follows those products. Coefficients use a short decimal that reads
back to the same scaled point. For example, 26214 sp prints as `.4`, whereas
uniform five-place rounding produces `.39999` and changes an SVG matrix.

Rotation uses PGF's whole-degree cosine values, calculated independently from
the mathematical cosine and rounded to five places. Fractional degrees use
scaled-point interpolation. Composition then converts and prints each resolved
coefficient. Continuous glyph outline emission uses the resolved SVG matrix;
outline vertices are not individually rounded as TeX coordinates.

Physical literals round their decimal fraction before the rational unit
conversion. Consequently native `1cm` is 1,864,679 sp, and `8mm` is 1,491,743 sp.
Input `px` uses the pinned engine's 65,782-sp pixel dimension; this differs from
the CSS pixels used by the output viewport. `1.9sp` becomes 1 sp, following the
native fractional-sp rule. General TeX register assignments and pixel-dimension
overrides remain outside the supported input grammar.

Transform/dimension overflow becomes a source-located `TIKZ004` failure. These
finite operations retain work charging, cancellation, and physical coordinate
budgets. Ordinary arithmetic expressions and other geometry calculations still
have their separately documented bounded semantics; this is not a TeX numeric
interpreter or a general TeX compatibility claim.

## Independent reference

```text
dotnet run --project tools/TikzReference -c Release -- generate-transform-precision
dotnet run --project tools/TikzReference -c Release -- verify-transform-precision
dotnet test Lokad.TikZ.slnx -c Release
```

Only the explicitly invoked generation command writes baselines. Both live
commands compile the trusted [case manifest](../../tests/Reference/Transforms/cases.json)
through the [numeric wrapper](transform-precision.tex). They invoke no converter
or production arithmetic helper. The reference records sixteen actual TikZ
node frames and native point transformations, plus ten direct TeX dimensions.
The cases include fractional, negative, and wrapped rotations, quarter/half-turn
boundaries, ordered shifts, composed shear, reflection, repeated scales, and a
singular frame.

The [measurements](../../tests/Reference/Transforms/measurements.json), sanitized
oracle log, and provenance retain engine/PGF identities, recorded package-input
hashes, manifest/wrapper/generated-source hashes, and the measurement hash.
Verification checks the complete fresh measurements and provenance without
overwriting those files. Missing, duplicate, or reordered measurements fail.
Normal tests use the cached data and the public converter; they need no TeX.
This reference proves numeric behavior for its enumerated cases. It does not
assign a raster tolerance to new rotation families.

## Interaction repair

The original [regional trial](../../tests/Reference/NodeInteractionsRgb/mutation-trial.json)
is retained as historical failure evidence. Five glyph regions and two path
regions exposed ideal-double coefficient/translation differences despite
passing the former 0.02-CSS-pixel numeric allowance.

After the repair, all 5,273 interaction numeric assertions pass with exact native
coefficients and 1e-9-CSS-pixel allowances for native frame/anchor/glyph origins.
Maximum observed conversion noise is below 3e-14 CSS pixel. Ordinary public
queries check all measured node anchors against exact integer sp values.
The same fixed references and independent regional limits now pass all
unchanged controls and reject all thirteen intended image defects. The
[post-repair evidence](../../tests/Reference/NodeInteractionsRgb/mutation-trial-after-transform.json)
retains the outcomes, image/tool identities, and implementation source hashes.

The global-only trial still accepts faint-period and short faint-stroke loss;
regional gates remain necessary. Geometry/PDF and rectangle-node policies
remain unchanged. Interaction primary policy admission and independent PDF
calibration remain release gates; these passing prospective trials do not
approve a new conformance policy.

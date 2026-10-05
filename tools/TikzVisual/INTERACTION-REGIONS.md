# Independent regional interaction experiment

Whole-image limits can conceal a small error among other correctly rendered
objects. The prospective limits from the independent ink-frame snapshot accept
removal of a one-percent-opacity period and a four-CSS-pixel faint stroke in
the state/paint fixture. Its opaque nodes dominate the foreground mean; the
faint content is below the edge/component mask threshold. Increasing canvas
size is not required to reproduce this problem.

This experiment adds fixed local gates without changing a reviewed policy.
The ordinary geometry, text, and rectangle-node profiles remain unchanged.
Every report and snapshot labels its interaction policy as unapproved.

## Independent measurements

```text
dotnet run --project tools/TikzReference -c Release -- calibrate-node-interaction-svg --profile rgb --framing ink
node tools/TikzVisual/calibrate-interaction-regions.mjs
```

The first command intentionally returns `1` for exact image differences. Its
completed oracle-only bundles must match the checked-in ink snapshot. The
second command reads those bundles and that snapshot; it never reads candidate
artifacts or invokes the converter. It requires the exact recorded renderer
identity, original/native SVG hashes, measurement hash, and native-position
hash.

Glyph regions use the original oracle outline bounds at native DVI positions
and measured PGF frames, intersected with the admitted rectangular clips. Path
regions use native soft-path/control bounds and conservative stroke extents,
with the original SVG's inherited join and miter limit. Region padding is fixed
at one CSS pixel before candidate inspection. Regions are expressed relative
to the measured picture origin; candidate bounds do not define them.

The comparator renders the physically registered pair at 1x and 4x over
transparent, white, and black backgrounds. It copies each region's integer
pixel rectangle directly from the rendered surfaces. There is no resizing,
interpolation, image fitting, or fractional translation of raster samples.
The actual camera intersection is recorded in `pixelCrop`.

The three independent representations are native CSS and fixed global ±4-sp
translations. Each region/scale/background retains its raw channel, visible
foreground mean, edge displacement, and component counts. Prospective regional
limits take their respective maxima; only the mean rounds upward to six
decimal places. No candidate error supplies a limit. The
[regional snapshot](../../tests/Reference/NodeInteractionsRgb/calibration-regions.json)
records the measurements, declared regions, inherited stroke state, source
identities, renderer, and tool hashes.

| Case | Fixed regions | Measurements across three variants |
| --- | ---: | ---: |
| `state-paint` | 38 | 684 |
| `transforms` | 35 | 630 |
| `colors` | 101 | 1,818 |
| Total | 174 | 3,132 |

These measurements describe this trusted corpus. They do not establish bounds
for arbitrary transforms, clip families, fonts, or diagrams. Conservative path
regions can overlap other objects; broader region coverage and defect trials
remain necessary as the feature set grows.

## Image-only stress tests

```text
dotnet run --project tools/TikzReference -c Release -- compare-node-interactions --profile rgb --framing ink
node tools/TikzVisual/interaction-mutation-trial.mjs
node tools/TikzVisual/interaction-mutation-trial.mjs --regional
npm run test:regions --prefix tools/TikzVisual
```

The candidate comparison deliberately retains exact-pixel failures. The two
mutation trials each make twenty comparisons and return `1` for any accepted
defect or unexpected unchanged-pair failure. They require passing native
candidate measurements before the trial, then bypass numeric gates for every
image check. They change only trusted SVG artifacts; mutated source is never
sent to TeX. No command writes reference baselines or reviewed policies.

The global-only trial passes all unchanged controls but accepts the missing
faint period and short faint stroke. With regional checks, both are rejected;
all thirteen deliberate defects produce image mismatches. State/paint and
palette controls still pass, as does the explicitly present synthetic stroke.
The two unchanged transform controls fail local gates despite passing global
metrics and current native numeric tolerances. Their reports localize errors
to five glyph regions and two path regions. This remains a converter precision
repair/admission issue: ideal double transforms differ from measured PGF
coefficients and scaled-point translations. The limits have not been widened.
This describes the historical trial retained below. The subsequent
[native transform repair](../TikzReference/TRANSFORM-PRECISION.md) now passes
every unchanged control and rejects all thirteen defects with the same fixed
references and regional limits. The separate post-repair snapshot retains its
implementation and artifact identities; no policy has been admitted.

The checked-in [trial evidence](../../tests/Reference/NodeInteractionsRgb/mutation-trial.json)
retains both completed outcomes and artifact/tool identities. It is an explicit
record of pending conformance, not a passing compatibility baseline. Both
trial output directories retain full reports, source traces, and PNGs:

```text
artifacts/interaction-mutation-trial-global/<case>-<mutation>/
artifacts/interaction-mutation-trial-regions/<case>-<mutation>/
```

Twenty-one independent synthetic comparator checks pass in required visual CI.
They reproduce foreground dilution with unrelated opaque ink, reject missing,
extra, and shifted faint content through exact declared regions, verify repeat
captures and source-attributed artifact hashes, and reject malformed manifests
and regions wholly outside the camera. Bounded crop output must retain every
local failure in the numerical report and identify truncation. A display-only
failure must still emit inspection crops when its 4x comparison passes. These tests need neither a
candidate bundle nor TeX.

## Inspection and admission

`report.json` lists every regional result, rectangle, native pixel crop, and
threshold. Overall primary success requires both the existing global gates and
every declared regional gate. Each failure gets paired reference/actual PNGs
and an amplified difference in `region-crops/`, with the largest failing scale
and available candidate source identity. The crop count shares the existing
bound; truncation is explicit and all numerical failures remain in the report.
`index.html` displays these regions with links to the source. Attribution uses
declared region and candidate trace identities; it does not infer an exact
mapping between arbitrary SVG elements.

An interaction policy can be admitted only after independently calibrated
global and regional gates pass unchanged candidates, relevant image defects
are rejected, numeric gates remain strict, and representative paired images
have been inspected. Ordinary PDF verification still needs its own independent
cross-renderer evidence. No interaction or PDF allowance is approved here.

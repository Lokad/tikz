# Independent semantic-frame raster experiment

```text
node tools/TikzVisual/shape-raster-self-test.mjs
node tools/TikzVisual/calibrate-shape-semantic-frame.mjs
```

The second command first runs a fresh independent ink/frame inspection in
`artifacts/node-shape-semantic-frame/oracle/`. Native PGF picture bounds and
tight transformed glyph/stroke extents determine the declared semantic frame.
Its origin, width and height are independently serialized to six CSS decimals,
with zero padding. Four explicit serialization checks require an error below
half a unit at the sixth decimal. The resulting `native-semantic-css-6.svg`
retains every drawing instruction from the native six-decimal reconstruction;
only its root dimensions and viewBox change. No converter is invoked or read.

Two pairs separate the remaining effects:

- `original-primary`: original outlined TikZ SVG versus the independently
  reconstructed geometry, glyph placements and declared semantic frame;
- `root-only`: the same native drawing instructions with the original-driver
root versus the declared semantic root.

The executed white-background observations are:

| Pair / view | Changed RGBA pixels, 1x / 4x | Maximum raw channel error, 1x / 4x |
| --- | --- | --- |
| Original-primary / natural | 27 / 831 | 19/255 / 50/255 |
| Original-primary / expanded | 30 / 421 | 4/255 / 30/255 |
| Root-only / natural | 21 / 502 | 2/255 / 50/255 |
| Root-only / expanded | 0 / 0 | 0 / 0 |

All six expanded root-only controls and twenty-four unchanged repeats pass
exactly. At the declared mask threshold, whole-picture component counts agree;
46 regional observations have nonzero edge displacement. A tiny root change
can therefore affect natural rasterization appreciably without changing any
drawing instruction. These raw observations do not grant a channel or edge
allowance. The report retains each scale/background/region separately.

Each pair runs in natural and expanded views, at 1x/4x over transparent, white
and black. The natural comparison retains each SVG's own root and registers
it by the measured physical origin. The expanded comparison uses the same
independent camera for both sides. Changing only the root must preserve exact
expanded RGBA samples. Twenty-four separately decoded unchanged pairs must
also remain exact. No candidate-derived extent, fitting or resampling selects
the camera or comparison regions.

All 98 regions derive from the union of native and original-driver tight ink
bounds, with three CSS pixels of declared padding. There are 24 whole-picture
and 2,352 regional observations. Global and local measurements include raw
RGBA equality, rounded premultiplied channel differences, foreground means,
connected components and symmetric Euclidean edge displacement. Foreground
error includes every visible sample; blank pixels cannot dilute the mean.

Topology alone uses a 16/255 foreground threshold, eight-neighbor components
and four-neighbor boundaries. Faint samples below this threshold still enter
channel and foreground errors. Missing edges have an explicit absent-edge state
and null distance, rather than a misleading zero or a non-JSON infinite number.
Distances are reported in raster and CSS pixels. These conventions are recorded
in the report and establish no acceptance allowance.

The shared development-only metric implementation is exercised in Node and
Chromium. Twenty-six controls cover exact repeats, known Euclidean distances,
symmetry, connected/missing/extra components, alpha-only discrepancies,
invisible RGB discrepancies, faint samples on all three backgrounds, blank-area
and local-region dilution, malformed inputs, and an independent brute-force
check of forty deterministic sparse point pairs. These are metric controls;
they do not admit a shape-specific image policy or replace its required defect
trials on real fixture artifacts.

`report.json` records the independent frame/derivation hashes, all native and
tool provenance, root serialization, renderer identity, natural dimensions,
camera, region definitions, measurements and repeat controls. `index.html`
links contact sheets and the largest changed regions. Each selected region
also has separate white-backed reference/derived/difference PNGs, with an
identical integer crop and labeled enlargement. The JSON agent entry point
links those exact files and gives focused rerun and control commands.
The owned bundle contains 628 PNGs, the derived SVG and the HTML viewer, all
hash-identified; the isolated oracle's artifacts are identified separately.
The changed-font circle and root-only natural contact sheet were inspected.

Every owned artifact and upstream source is checked before/after rendering.
The isolated oracle bundle retains its original SVGs, measurements, fonts,
logs, clipping experiments, and provenance. Output paths reject symlinks and
junctions. `inspect-shape-frames.mjs` also accepts `--out artifacts/...` to
isolate these independent experiments without overwriting its default gallery.

Exit 0 means evidence generation and controls completed; infrastructure failure
exits 2 and saves a failure report where the output path is valid. The report
remains pending, with `converterInvoked:false`, `conformanceClaim:false` and
`approvedImagePolicy:false`. Regional policies, image-only missing/faint-content
defect trials, combined candidate gates, focused/interaction coverage, ordinary
PDF calibration and reviewed admission remain required. Existing rectangle/path
allowances do not apply. Prepared CI execution is distinct from hosted evidence.

The separate [primary policy trial](PRIMARY-TRIAL.md) now consumes a fresh
calibration, replays every recorded metric, derives independently scoped limits,
and runs the public converter and image-only defect controls. That trial keeps
overall admission pending and never turns these observations into a universal
tolerance.

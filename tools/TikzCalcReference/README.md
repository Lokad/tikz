# Native calculated-coordinate reference

The trusted `tests/Fixtures/calc-coordinates.tikz` fixture covers 25 calculated
and input coordinate anchors plus an empty circle node. `wrapper.tex` compiles
the picture; `probes.tex` reads each coordinate in a reset world frame and logs
integer TeX scaled points. The probes add no paint.

The cached `tests/Reference/CalcCoordinates/points.json` records the source hash,
native coordinates, tool/font versions, observer SVG hash and TeX box. The
original outlined native SVG is cached beside it as `reference.svg`. Ordinary
xUnit tests read this cache and require no TeX installation or browser.

The native generation command requires Node, MiKTeX with PGF 3.1.11a and Latin
Modern already installed, and dvisvgm 3.4.3. Run from the repository root:

```powershell
node tools/TikzCalcReference/generate.mjs
```

Generation uses the fixed trusted fixture only, with package installation and
shell execution disabled. It creates a fresh ignored `artifacts/calc-native/`
directory containing plain/probed inputs, original logs, DVI, SVG, recorder
files and a hash-bound report. It requires identical plain/probed SVG bytes and
TeX boxes, all 25 expected anchors, and exact agreement with the cached source
and coordinate values. It never updates the cache automatically.

The converter is not invoked during native reference generation. Native
measurement is one part of grounding; candidate primary/PDF comparison and
image-only fault detection remain separate requirements.

For development-only candidate and primary-image research, export the same
fixture through the public converter and its trace:

```powershell
dotnet run --project tools/TikzReference -c Release -- export-calc-coordinates
```

Use the exact fresh report path printed by that command. The exporter checks
ordinary/traced SVG, diagnostics, bounds and work-statistics parity, then all
50 native anchor quantities at zero scaled-point tolerance. Its report binds
the candidate assembly, source hashes, SVG, scene and cached reference.

With the pinned development Playwright/Chromium installation available, run:

```powershell
node tools/TikzVisual/inspect-calc-coordinates.mjs <candidate-export/report.json>
```

The inspector checks export hashes and unchanged candidate sources. It derives
the origin, camera and all 24 paint regions from the original native SVG,
without fitting the candidate. It captures natural/expanded frames at 1x/4x
on transparent/white/black for both intrinsic-image and explicit-viewport
routes: 24 paired views and 576 regional observations, with unchanged repeats.
It also records 24 native-only encoding comparisons and four image-only
missing-mark/quarter-pixel-shift controls. No image allowance is selected.
All 24 native driver paths also match the public trace in segment kinds,
scaled-point endpoints/control points and the fixture's effective stroke state.

Open the fresh inspection report's `agent-inspection.json` and `index.html`.
They link the first observed difference, display-size and 4x contact sheets,
paired crops, raw/amplified differences and source/scene records. Attribution
is explicitly spatial overlap; overlapping paint can have several candidates.
The gallery is static; standalone PNGs support agent image inspection.
After a compiler change, create a new candidate export and inspect that new
report. The agent index distinguishes recapturing unchanged evidence from
exporting a changed candidate and links the ordinary follow-up test command.

Completion means evidence generation finished. Image admission remains pending:
ordinary PDF, independent calibration, the full defect matrix, independent
saved-evidence verification and broader interactions remain required. A black
stroke on an opaque black background has no visible contrast; exact samples
there do not establish detection of a missing stroke.

# Rectangle border regional experiments

These experiments cover the three unlabelled rectangle-border fixtures in
`tests/Reference/NodeBorders/path-cases.json`. They establish prospective primary
and ordinary PDF limits independently, then test those limits against unchanged
public conversions and deliberate image defects. **Research records stay
unapproved.** The separately pinned combined route is documented below.
Original driver comparisons and their exact failures remain available.

The [native frame](../TikzReference/NODE-BORDERS.md) derives the expanded viewport
without a converter and records 36 path-envelope regions and 104 miter regions.
Positions and padding precede candidate inspection; candidate bounds, pixels,
and defect results cannot change the regions or precision allowances.

Run the prerequisites and experiments from the repository root:

```text
dotnet run --project tools/TikzReference -c Release -- measure-border-framing
dotnet run --project tools/TikzReference -c Release -- calibrate-border-paths --out artifacts/border-framed-precision
dotnet run --project tools/TikzReference -c Release -- compare-border-framed
node tools/TikzVisual/calibrate-border-regions.mjs
node tools/TikzVisual/trial-border-regions.mjs
node tools/TikzVisual/calibrate-border-pdf-regions.mjs
node tools/TikzVisual/trial-border-pdf-regions.mjs
```

The two C# comparison/calibration commands retain exact-policy mismatches and
currently return 1. The four JavaScript experiments return 0 when their contract
completes, 1 when a trial misses an intended result, and 2 for invalid inputs,
stale provenance, missing tools, or renderer/infrastructure errors. Measurement
completion is distinct from conformance. Commands never update snapshots or
policies. Cached references suffice; these experiments do not invoke TeX.

The calibration routes accept no candidate input. They validate source, native
artifact/tool hashes, and browser identity; retain original paint and paths;
and use six-decimal CSS serialization with fixed zero/±4-sp variants. Reframing
changes only the root viewport. The dimension budget records printed driver
scale versus exact TeX-point conversion, two fixed padding extents, and half
a six-decimal unit of serialization error. The candidate's 0.00004 CSS px
geometry/natural-size contract stays separate.

The [primary evidence](../../tests/Reference/NodeBorders/primary-regions.json)
retains 2,520 local and 54 whole-picture measurements at 1x/4x over transparent,
white, and black backgrounds. Every variant's metrics and PNG hashes repeat.
Each proposed regional limit comes solely from the independent precision
variants at the corresponding scale/background. Reconstructed SVGs, frame
budgets, raw errors, artifact hashes, and provenance are retained.

The [primary trial](../../tests/Reference/NodeBorders/primary-region-trial.json)
passes 27 checks: six repeated unchanged controls and 21 intended defects.
Image defects bypass numeric gates and include borders, shifts, widths,
opacity, caps, a spurious node-gap join, a short line, beveled/open triangular
miters, and a cropped frame. A correct-image control deliberately fails its
numeric gate. Focused mutations must fail the affected path or miter region.
Whole-picture gates accept the missing short line; the local gate rejects it.
Repeated unchanged candidate PNG hashes agree.

The [PDF evidence](../../tests/Reference/NodeBorders/pdf-regions.json) retains
1,144 repeated measurements across 143 regions: the same 140 local regions and
three whole-picture regions. Four independent SVGs per case (expanded native
driver, six-decimal, and ±4-sp) render at 1x/4x on the measured native PDF page,
followed by identical integer crops. Fifty-one native SVG/PDF path records agree.
The [PDF trial](../../tests/Reference/NodeBorders/pdf-region-trial.json) passes
27 checks, independently rejecting all twenty image defects including the
short line and affected miters. Correct images with the deliberate numeric
failure pass PDF, demonstrating the separate numeric gate. No camera or
allowance is fitted to a candidate.

Bundles are under `artifacts/border-region-calibration/`, `border-region-trial/`,
`border-pdf-region-calibration/`, and `border-pdf-region-trial/`, with case/variant
folders. They retain source, raw measurements, SVGs, hashes, local viewers, and
paired crops. PDF trials include the original source trace, physical camera,
and enlarged `*-inspection.png` contact sheets for image-viewing tools.
Nearest-neighbour enlargements are presentation; raw captures determine the
verdict. Representative unchanged primary and mutated PDF images were inspected.

The separately reviewed [combined conformance route](BORDER-CONFORMANCE.md) now
pins these unchanged measurements and trials, validates complete provenance and
coverage, recomputes all allowances, and requires numeric/natural-size/primary/
PDF gates on both SVG sides. The research commands above remain unapproved
experiments. Existing geometry and node interaction policies remain separate.

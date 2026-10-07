# Curved-connection image diagnostics

Create a native numeric run, then select its exact report:

```text
dotnet run --project tools/TikzCurvedEdgeComparison -c Release
node tools/TikzVisual/inspect-curved-edges.mjs artifacts/curved-edge-numeric/run-<GUID>/report.json
```

The second command requires the separately installed pinned Playwright/browser
environment. It verifies the saved numeric report, candidate artifact hashes,
current converter/tool sources and frozen native evidence. It launches no TeX
or PDF executable and performs no new conversion.

Open the resulting `artifacts/curved-edge-inspection/run-<GUID>/index.html`.
Case viewers provide paired PNGs, a blink/opacity/zoom overlay, amplified
differences, failure crops and links to source lines and graphics traces. A
coding agent can open `comparison.png`, `reference-4x.png`, `actual-4x.png`,
`diff-amplified-4x.png` or the named `crops/` files directly. The raw native PDF
pages, SVG, PDF, measurements and provenance remain available in the bundle.

SVG registration uses its original physical translation. PDF registration uses
the independently measured page/picture origin. The diagnostic camera includes
both intrinsic roots; it must not be used as a qualified independent frame.
The runner applies exact diagnostic limits and records all raw primary/PDF
differences. Its completion means inspection artifacts were produced, not an
image-conformance pass. Root and case reports explicitly retain
`approvedImagePolicy: false`, `imageConformanceClaim: false` and
`overallVerdict: pending-image-calibration`.

This family still needs independent frame/region validation, oracle-only
primary/PDF calibration, fixed image-only defect expectations and an owned
fresh trial/checker before scoped admission. Existing straight-connection
allowances do not apply.

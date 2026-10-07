# Public curved-connection numeric comparison

```text
dotnet run --project tools/TikzCurvedEdgeComparison -c Release
```

An optional `--out artifacts/...` selects a fresh empty output directory.
This separate development project is restored explicitly; the solution manifest
captured by the existing independent straight-edge qualifications stays fixed.
The command accepts only the fixed trusted curved corpus. It verifies the
externally pinned snapshot, all native artifact hashes and producer sources,
then captures current converter/tool sources and runs the public converter.
The shared native comparator checks 2,066 geometry, paint/order, clipping,
picture, node and glyph quantities. No TeX or browser runs.

Each case saves `actual.svg`, `actual-scene.json`, `numeric.json`, its source,
and native input captures. The root report hashes these files, records assembly
identity and rechecks input/source integrity before completion. Public-result
parity is tested in the ordinary suite. The report grants no image claim.

Use the saved report with the separate
[diagnostic image command](../TikzVisual/CURVED-EDGE-INSPECTION.md) to inspect
paired PNGs, crops and overlays. Independent pixel calibration remains pending.

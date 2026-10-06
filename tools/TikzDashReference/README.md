# Native dash reference

This development-only .NET tool independently measures the fixed
[forty-line fixture](../../tests/Fixtures/Dashes/dashes.tikz) with
PGF 3.1.11a. It never invokes Lokad.TikZ and accepts no arbitrary source.
See [dash grounding](../../docs/DASHES.md) for the scope and pending gates.

Run from the repository root:

    dotnet run --project tools/TikzDashReference -c Release -- check-cached

This validates the external snapshot, artifact/source hashes, native
records, declared tool/input identities, driver agreement, and plain/probed
invariance without invoking TeX. Cached evidence is research evidence;
image admission is explicitly false.

After a Release build, run the separate integrity controls:

    pwsh -NoProfile -File tools/TikzDashReference/check-cached.ps1

Thirty disposable copies exercise two positive and twenty-eight negative
cases, including missing/changed sources, tools and recorded inputs,
false oracle/admission claims, and rehashed SVG/PDF/raster/log/page-origin
tampering. Each cached check runs with PATH empty. The original snapshot,
baseline and source hashes remain unchanged. Fresh hashed reports and
exact control-source copies live under artifacts/dash-cache-controls.

For nonoverwriting live verification:

    dotnet run --project tools/TikzDashReference -c Release -- verify

The live route requires the pinned MiKTeX/PGF installation, dvisvgm 3.4.3,
pdftoppm 24.04.0, and kpsewhich. It creates four fresh plain/probed SVG/PDF
runs under artifacts/dash-reference, checks recorded inputs and tool
identities, and compares native records and deterministic artifacts with
the cache. Shell escape and package installation are disabled; processes
and captured output are bounded.

The generate command explicitly replaces the cache and snapshot. Use it
only for a deliberate reference update after retaining prior evidence.
The wrapper, generator/helper/project/lock sources and build inputs are
hashed by the snapshot; changing those files requires a reference update.
Ordinary builds and tests only consume the checked-in cache.

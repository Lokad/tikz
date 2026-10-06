# Ordinary circle and ellipse PDF reference

This independent development executable compiles the same trusted
[28-node fixture](../../tests/Fixtures/Nodes/shapes.tikz) as the native SVG
oracle, using ordinary pdfLaTeX/PGF output. It has no converter reference or
runtime package dependency. Its build-only project reference produces the
original native cached-evidence verifier.

```text
dotnet run --project tools/TikzShapePdfReference -c Release -- generate
dotnet run --project tools/TikzShapePdfReference -c Release -- verify
dotnet run --project tools/TikzShapePdfReference -c Release -- check-cached
pwsh -NoProfile -File tools/TikzShapePdfReference/check-cached.ps1
```

Only generate writes the new baseline and external snapshot. Verify uses a
fresh GUID directory under ignored artifacts/node-shape-pdf-reference/ and
checks deterministic artifacts without overwriting references. Original cached
logs are immutable; fresh logs are compared through their complete native
records and page measurements because engine timestamps and statistics vary.
Check-cached needs .NET alone; TeX and Poppler are used only by live commands.
The PowerShell controls require the preceding Release build.

The tool derives a PDF wrapper from the original SVG wrapper without changing
that pinned file. It removes the explicit dvisvgm driver and zero-width DVI
glyph-origin specials, retains native measurement hooks and font setup, and
declares a 600 by 800 TeX-point page. The current fixture fits entirely on that
page. Explicit save-position/deferred-write measurements locate the picture's
left baseline on the shipped-out page; the PDF metadata dates and trailer ID
are suppressed for reproducible bytes.

Two separate plain/probed compilations must have identical picture boxes,
saved page positions, PDF bytes and 96/384-dpi PNG bytes. All 1,810 native
box/dimension/path/frame/anchor/border/normalization records must agree exactly
with the original SVG log. The actual PDF driver and PGF version are recorded
and checked independently. The tool also checks one physical PDF page, native
page/raster dimensions and the two embedded/subset Latin Modern faces.

The page origin in CSS pixels comes only from integer native measurements:

```text
xSp = savedBoxXSp - nativeMinXSp
ySp = pageHeightSp - savedBoxBaselineYSp + nativeMinYSp + boxDepthSp
cssPixelsPerSp = 96 / (72.27 * 65536)
```

For this fixture the measured origin is approximately (574.478943707,
199.114019854) CSS pixels. Page PNGs are 798 by 1063 at 1x and 3189 by 4251
at 4x. Neither an image search nor candidate geometry supplies that camera.
No fractional resampling of a PDF raster is part of reference generation.

The [PDF profile](../../tests/Reference/NodeShapes/pdf-oracle-profile.json)
pins MiKTeX 25.4/pdfTeX 4.21, PGF 3.1.11a, Poppler 24.04.0, and the existing
Latin Modern font inputs. Live runs hash tool executables and all recorded
inputs, disable shell escape and installation, and bound process duration,
output capture and raster size. They accept no arbitrary source or wrapper.

Thirteen artifacts, full provenance and native page measurements live in
tests/Reference/NodeShapes/pdf/. The
[external snapshot](../../tests/Reference/NodeShapes/pdf-snapshot.json) pins
their hashes, tool/input identities and generator identity outside that folder.
Cached validation reconstructs measurements from both logs and the original
native SVG evidence; rehashing a damaged artifact in its own provenance cannot
clear that check. Published metadata and the lock file use LF, and all recorded
source/artifact hashes were checked against the exact staged Git bytes.
PNG header checks verify dimensions and encoding; the
immutable original hash supplies byte integrity, rather than claiming that
the header reader decodes an image.

Twenty-six cached controls test two positive cases and twenty-four missing,
tampered, falsified or rehashed cases in isolated copies, without invoking TeX
or modifying the baseline. They write fresh per-run reports and
artifacts/node-shape-pdf-cache-tests/report.json. Twenty-two ordinary xUnit
cases independently exercise native/page agreement, engine line wrapping,
corrupted measurements and malformed/excessive raster headers.

This is reference evidence, not an SVG-versus-PDF image pass. Independent
cross-renderer calibration, fixed native-page whole/local comparisons on both
SVG sides, image-only defect controls, reviewed image/PDF admission and broader
interaction fixtures remain required. Existing admitted profiles and original
SVG/native artifacts are unchanged. Font data retains the
[third-party licenses](../../THIRD-PARTY-NOTICES.md).

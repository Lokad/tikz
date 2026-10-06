# Public straight-edge combined image trial

This development command converts the five fixed straight `to`/`edge` fixtures
through the public API. It requires .NET 10, Node and the pinned development
browser. It consumes separately completed and checked [primary](EDGE-PRIMARY.md)
and [native-page PDF](EDGE-PDF.md) qualification bundles. Cached comparison
launches neither TeX nor a PDF executable.

Select all four exact reports; mutable pointers are only a way to locate them:

```powershell
$edgePrimary = Get-Content artifacts/edge-primary-calibration/latest.json -Raw | ConvertFrom-Json
$edgePrimaryCheck = Get-Content artifacts/edge-primary-checks/latest.json -Raw | ConvertFrom-Json
$edgePdf = Get-Content artifacts/edge-pdf-calibration/latest.json -Raw | ConvertFrom-Json
$edgePdfCheck = Get-Content artifacts/edge-pdf-checks/latest.json -Raw | ConvertFrom-Json
if (@($edgePrimary, $edgePrimaryCheck, $edgePdf, $edgePdfCheck).Where({ -not $_.completed }).Count) { throw 'Qualification is incomplete.' }
node tools/TikzVisual/trial-edge-images.mjs `
  ('artifacts/edge-primary-calibration/' + $edgePrimary.report) `
  ('artifacts/edge-primary-checks/' + $edgePrimaryCheck.report) `
  ('artifacts/edge-pdf-calibration/' + $edgePdf.report) `
  ('artifacts/edge-pdf-checks/' + $edgePdfCheck.report)
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

Qualification roles, source/artifact hashes, view coverage, derived limits and
checker/report bindings are verified before invoking the converter. Complete
qualification bundles are copied into the trial with their original unapproved
roles. Candidate results never select, widen or replace an independent limit.
The numeric child retains actual SVGs, scenes, source spans and converter/tool
provenance. The trial checks native-derived frames and source attribution.
Five ordinary xUnit cases independently compare plain and traced public results:
SVG bytes, bounds, diagnostics and work statistics must agree for every fixture.

Public ink bounds follow the declared conservative pen contract. That contract
is evaluated independently from native geometry, shipped paint and clipping;
it is separate from the tighter native reference camera. Circular-pen inflation,
bounded offset intersections and convex rectangle corners supply expected
bounds. Declared roots must contain native ink and serialize the picture/ink
union. Camera origins, region rectangles and physical registration stay fixed.

Eight gates are required together:

| Gate | Required evidence |
| --- | --- |
| Numeric | All 2,585 native assertions through fresh public conversion |
| Frame | Every declared path envelope, picture/ink union, root and native containment |
| Primary | Natural/expanded, 1x/4x, transparent/white/black; whole and all native local regions |
| Derived PDF | Corrected-driver SVG versus unchanged ordinary PDF, four white views |
| Candidate PDF | Public SVG versus ordinary PDF with independent local limits and exact RGB sums |
| Native page | Exact full-page and regional public equality with the preselected independent SVG reconstruction |
| Fresh primary | Thirteen image-only mutations over 150 views; visible target rejection and exact declared invisible samples |
| Fresh PDF/native | Fifty visible mutation views must fail their PDF and native-page target regions |

The original driver remains diagnostic: its omitted round-cap dot is retained
in twelve primary views. The correction remains explicit. A reconstructed page
match never becomes a claim that the original PDF/browser routes have identical
pixels. Synthetic faint-paint and native opacity compatibility have distinct
qualification scopes; broader native interactions remain necessary.

The fresh GUID directory under `artifacts/edge-public-trial/` contains the
complete inputs, actual SVG/scene/source traces, measurements, evaluations,
paired whole/local images, raw/alpha/amplified differences, overlays and a static
gallery. Every native path/endpoint/glyph region links to the public SVG element
and original source span. Enlarged crops aid inspection; complete measurements
remain authoritative. Conversion, infrastructure and failed trial outcomes are
retained and fail the command. A completed pass is still unapproved.

Focused controls and the independent saved-trial checker run separately:

```powershell
node tools/TikzVisual/edge-trial-self-test.mjs
$edgeTrial = Get-Content artifacts/edge-public-trial/latest.json -Raw | ConvertFrom-Json
if (-not $edgeTrial.completed) { throw 'Public trial is incomplete.' }
node tools/TikzVisual/check-edge-trial.mjs ('artifacts/edge-public-trial/' + $edgeTrial.report)
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

The checker converts afresh, reconstructs controlled public SVGs and expected
frames, verifies source attribution, independently decodes saved primary/PDF/
native-page samples and RGB sums, and rejects weakened or incomplete reports.
It cannot promote data. Reviewed immutable admission, portable tracked evidence,
hosted CI and broader M1–M4 compatibility remain separate work.

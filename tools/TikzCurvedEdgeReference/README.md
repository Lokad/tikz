# Independent curved-connection native evidence

The separate [manifest](../../tests/Reference/CurvedEdges/cases.json) contains
five trusted fixtures, 70 native path calls and four measured nodes. PGF 3.1.11a
computes cubic controls, endpoints, continuation, paint and clipping directly.
The producer never calls Lokad.TikZ.

```text
node tools/TikzVisual/curved-edge-reference.mjs check-cached
node tools/TikzVisual/curved-edge-evidence-self-test.mjs
node tools/TikzVisual/curved-edge-reference.mjs verify-live
```

The first two commands use tracked evidence only. `verify-live` requires the
pinned local MiKTeX/PGF and PDF tools, regenerates into a fresh artifact bundle,
and compares all evidence with the frozen cache. SVG normalization permits only
unique glyph-definition ordering and dependent metadata. The producer's explicit
`generate` mode creates a new baseline during reviewed fixture development;
consumers' external snapshot pins must then be updated deliberately.

The observer checks plain/probed SVG drawing, picture size, ordinary PDF bytes,
raster pages and physical page position. It records nonempty PGF paths once
and preserves separate empty backend strokes as diagnostics. Original move-only
paths stay in the evidence. This separate observer and driver reader do not
change the straight-edge reference profile. Native state and source hashes
are rebuilt from original logs and SVG/PDF bytes by the cached reader.

Newly authored fixtures and tooling follow the repository license. Upstream
PGF and font resources retain their own provenance and notices. The reference
folder is development evidence and is excluded from the production package.
It supplies no image tolerance or converter conformance verdict.

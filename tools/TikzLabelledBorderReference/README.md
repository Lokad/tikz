# Labeled-node border references

This development-only producer compiles three trusted TikZ fixtures through
pinned MiKTeX/PGF, dvisvgm, DVItype, and ordinary pdfLaTeX/Poppler. It invokes no
converter or browser and supplies no image tolerance. Runtime conversion still
requires only .NET 10.

The fixed corpus has twelve measured rectangle/circle/ellipse nodes, 192 named
anchors, twelve background paths and fourteen connection paths. It combines
ligatures, descenders, punctuation, differing node/label fonts, multiline labels,
minimum sizes and separation with implicit borders, explicit anchors, chains,
relative continuation, orthogonal/cubic/closed paths, and differing affine node
and query frames. Arrows, `to`/`edge`, and path labels remain separate work.

Generate references explicitly from the repository root:

```text
node tools/TikzVisual/labelled-border-reference.mjs generate
```

Only the fixed manifest sources enter TeX. The wrapper loads Latin Modern EC
fonts and `shapes.geometric` outside the picture box. Each case retains plain
and probed original SVG/PDF, TeX logs, native node/path measurements, DVI glyph
positions, six original TFM inputs, shipped-out PDF registration, and 1x/4x PDF
page PNGs under `tests/Reference/LabelledBorders/`.

The unmodified Latin Modern TFM inputs retain their GUST/LPPL license; see the
repository's [font notices](../../THIRD-PARTY-NOTICES.md). These reference inputs
are excluded from the NuGet package.

Generation checks plain/probed picture-box and visible-SVG invariance, exact
PDF/PNG equality and page positions, and agreement of SVG/PDF native records.
The only SVG canonicalization reorders unchanged outlined-glyph definitions.
Raw SVG byte identity is recorded separately. Integer PGF soft paths include
compact rectangle tokens, recorded without executing their drawing operations.
Sanitized logs handle wrapped Windows filenames and DVI timestamps. Original
SVG/PDF/PNG and font bytes remain unchanged.

Each attempt writes a fresh GUID directory under
`artifacts/labelled-border-reference/`, including bounded subprocess output,
commands, file/input/tool hashes, phase and completion state. Missing tools,
version drift, timeout, excessive output or failed invariance fails generation.
Only successful explicit generation copies new references into the fixed cache.
Existing admitted fixture families and their policies are independent.

Consume and validate the cache without TeX, Poppler, or a browser:

```text
node tools/TikzVisual/labelled-border-reference.mjs check-cached
node tools/TikzVisual/labelled-border-evidence-self-test.mjs
dotnet test Lokad.TikZ.slnx
```

The frozen evidence consumer pins the snapshot and fixture manifest outside
the artifact manifest, checks complete input/artifact coverage, rederives PDF
registration, and rejects changed or consistently rehashed evidence. Its
controls cover missing/changed inputs, dropped/duplicate cases, false probe
invariance, image-admission claims, and canonical source line endings. Reports
stay under `artifacts/labelled-border-cache-controls/`; no control edits the
reference files. Both cached commands are prepared Windows/Linux CI steps.

Ordinary public-converter tests compare native label metrics, anchors, glyph
identity/position/frame, every painted soft-path segment, stroke widths and
picture bounds. The path default and width presets now use the same integer
TeX dimensions as node paint. Numeric checks preserve their fixed precision.

This is independent native evidence and a public numeric regression corpus.
Primary image calibration, local region sensitivity, PDF image acceptance,
combined admission and agent comparison bundles for this family remain pending.
It inherits no shape, border or dash image allowance. Regeneration legitimately
changes provenance; review old/new evidence and update the external pins
explicitly before accepting it.

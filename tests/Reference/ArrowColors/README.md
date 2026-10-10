# Implicit arrow color: frozen native evidence

The fixed [four-row contract](../../Fixtures/Diagrams/arrow-color-contract.tikz)
and [complete flowchart](../../Fixtures/Diagrams/flowchart-draw-color.tikz)
cover default arrow fill with no label, a matching or different label color,
explicit `color=`, positioned nodes, path labels, calculated coordinates,
orthogonal/bent routes, opacity, dashes and visible clipping.

`image-profile.json` pins two byte-preserving archives containing the four
native-only primary calibration/check and PDF calibration/check roles. The
archives retain original plain/probed SVGs and their wrapper, corrected SVGs,
unmodified PDFs/rasters, glyph observations, source captures, cameras, regions,
policies and sensitivity data. The native-reference hook is restricted to the
two reviewed fixtures. Independent readers require unchanged root, geometry,
clips, glyphs and all paint except the declared default tip fills, which follow
the unmodified PDF. See [arrow documentation](../../../docs/ARROWS.md).

Each primary calibration has three encodings, two capture routes and 72 native
views. The focused contract has 18 controls/72 control views; the complete
flowchart has 40 controls/160 views. A visible affected tip is filled black and
must fail all four expanded-white 1x/4x capture views with numeric checks
bypassed. The complete diagram also requires visible shaft/glyph clip controls.
SVG and PDF policies remain separate. Literal pixel equality is not assumed.

The existing [reader](../../../tools/TikzVisual/path-label-cache.mjs),
[codec](../../../tools/TikzVisual/path-label-cache-codec.mjs),
[materializer](../../../tools/TikzVisual/materialize-path-label-cache.mjs) and
generic corruption controls are shared with earlier families. The archive
format, size limits and 26 older archive bytes stay unchanged. Only the two
changed transport source digests are repinned in older profiles.

```text
node tools/TikzVisual/materialize-path-label-cache.mjs arrow-color-contract
node tools/TikzVisual/materialize-path-label-cache.mjs flowchart-draw-color
node tools/TikzVisual/path-label-cache-self-test.mjs
```

Restoration executes neither TeX nor the converter. These archives contain no
current converter acceptance. Fresh current output, final source/export/main
integration and broader release qualification remain separate requirements.

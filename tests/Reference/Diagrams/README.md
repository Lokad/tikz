# Frozen complete-diagram image evidence

These three archives preserve the exact qualified primary/PDF calibration and
independent checks for the authored sources in `tests/Fixtures/Diagrams`.
`image-profile.json` pins their report, artifact, archive and transport hashes.
Each archive contains original native observations, SVG/PDF/font inputs, three
independent native encodings and glyph/label/tip sensitivity. It contains no
current converter conformance result. Native generation remains a separate
trusted-fixture operation.

Restore a fixture in a clean source export with the existing lossless adapter:

```sh
node tools/TikzVisual/materialize-path-label-cache.mjs flowchart-basic
node tools/TikzVisual/materialize-path-label-cache.mjs network-bent
node tools/TikzVisual/materialize-path-label-cache.mjs flowchart-transformed
node tools/TikzVisual/path-label-cache-self-test.mjs
```

The shared bounded codec rejects unsafe paths, changed blobs, missing or unowned
assets, unreviewed archive bytes and changed scope claims. Restoration preserves
historical report paths and every owned byte, and refuses to overwrite different
evidence. It invokes neither the native engine nor the converter.

Use the exact report paths in the profile with the
[comparison workflow](../../../tools/TikzPathLabelComparison/README.md).
Fresh public numeric output, all primary/PDF gates, independent current-source
checking, ordinary tests and final source-export checks are required separately.
The two existing path-label archives retain their original bytes and semantics.

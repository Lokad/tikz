# Frozen foreach image evidence

These two archives preserve the qualified native primary/PDF calibration and
independent checks for `flowchart-foreach` and `foreach-contract`. Their authored
sources exercise the [declared loop subset](../../../docs/FOREACH.md), including
complete flowchart interactions and focused list/range/scope behavior.

`image-profile.json` pins every report, owned artifact, archive and transport
hash. The archives retain original SVG/PDF/font observations, three independent
native encodings and visible glyph/whole-label controls; the flowchart also has
arrow controls. They contain no current converter conformance result. Native
generation remains a separate operation restricted to trusted fixtures.

Restore frozen evidence in a clean source export with the existing adapter:

```sh
node tools/TikzVisual/materialize-path-label-cache.mjs flowchart-foreach
node tools/TikzVisual/materialize-path-label-cache.mjs foreach-contract
node tools/TikzVisual/path-label-cache-self-test.mjs
```

The shared bounded codec rejects unsafe paths, altered or unowned assets,
unreviewed archive bytes and changed scope claims. Materialization restores
historical paths and bytes without invoking TeX or the converter, and refuses
to overwrite different evidence. Previously accepted archives remain unchanged.

Use the exact profile receipts with the
[comparison workflow](../../../tools/TikzPathLabelComparison/README.md).
Fresh public numeric output, primary/PDF gates, independent current-source
checking, ordinary tests and final clean-source checks remain separate.

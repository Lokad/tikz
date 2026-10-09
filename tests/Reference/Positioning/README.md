# Positioning measurements for complete diagrams

These observations come from PGF 3.1.11a and the three trusted, authored sources
under `tests/Fixtures/Diagrams`. They contain nine named nodes, their independently
measured text boxes and placement matrices, and all 144 named anchors. Sources
are bound by their LF-normalized SHA-256 hashes.

The iteration command is:

```text
node tools/TikzVisual/diagram-positioning-reference.mjs
```

It accepts only those fixed repository sources. It reuses the existing native
wrapper, bounded process runner, artifact writer, SVG canonicalizer and log
sanitizer. Outputs stay under `artifacts/positioning-native/`; the command does
not overwrite these expected results or invoke the converter. Original and
probed SVG drawings must match before measurements are accepted.

The ordinary tests compare fresh public conversion, public/trace parity, text
boxes, linear matrices and every retained integer scaled-point anchor. These
measurements cover the first positioning work unit. Complete glyph/paint/path
evidence, viewport registration, local image sensitivity and both PDF image
gates remain separate requirements; this record makes no image-conformance claim.

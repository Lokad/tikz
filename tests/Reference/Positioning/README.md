# Node measurements for positioning and parameterized styles

These observations come from PGF 3.1.11a and trusted, authored sources under
`tests/Fixtures/Diagrams` and `tests/Fixtures/Positioning`. The complete diagrams
contain nine named nodes and 144 anchors; the focused fixtures add 28 named
nodes and 448 anchors. Text boxes and placement matrices are independently
measured. The parameterized flowchart and focused style contract add eleven nodes
and 176 anchors under `Diagrams/flowchart-parameterized.json` and
`Styles/style-contract.json`. Sources
are bound by their LF-normalized SHA-256 hashes.

The iteration command is:

```text
node tools/TikzVisual/diagram-positioning-reference.mjs
```

Pass fixed fixture names to measure only affected sources, for example:

```text
node tools/TikzVisual/diagram-positioning-reference.mjs contract registration scoped-unavailable scoped-reloaded
node tools/TikzVisual/diagram-positioning-reference.mjs flowchart-parameterized style-contract style-missing-argument style-second-parameter
```

It accepts only fixed repository sources. It reuses the existing native
wrapper, bounded process runner, artifact writer, SVG canonicalizer and log
sanitizer. Outputs stay under `artifacts/positioning-native/`; the command does
not overwrite these expected results or invoke the converter. Original and
probed SVG drawings must match before measurements are accepted. The two scoped
availability controls must fail in the native engine with the recorded PGF
error; their failure logs are retained separately from positive measurements.
The second-parameter style rejects natively at definition. The missing-argument
style converts natively with warnings; its original result is retained even
though that form is explicitly unsupported by the declared converter subset.

The ordinary tests compare fresh public conversion, public/trace parity, text
boxes, linear matrices and every retained integer scaled-point anchor. These
measurements cover the first positioning work unit. Complete glyph/paint/path
evidence, viewport registration, local image sensitivity and both PDF image
gates remain separate requirements; this record makes no image-conformance claim.

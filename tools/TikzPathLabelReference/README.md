# Focused path-label native observations

This retained focused oracle grounds the declared attached-label
[subset](../../docs/PATH-LABELS.md). The later
[comparison workflow](../TikzPathLabelComparison/README.md) owns the expanded
native observations and current-output checks; this smaller oracle remains a
separate regression input.
It accepts only the repository-authored
[placement fixture](../../tests/Fixtures/PathLabels/placement.tikz).
MiKTeX/PGF produce measurements independently of the converter.

Copy that fixture as `case.tikz` and [placement.tex](placement.tex) as `case.tex`
into an ignored artifact folder. Compile there with the existing native flags:

```text
latex -disable-write18 -disable-installer -interaction=nonstopmode -halt-on-error -recorder "\AtBeginDocument{\labelprobestrue}\input{case.tex}"
```

The wrapper reports text box dimensions, the node anchor and placement matrix,
and six named anchors per node. Log records can wrap at arbitrary columns;
remove whitespace only within each bounded `PATH-LABEL-*` record before parsing.
The committed [observations](../../tests/Reference/PathLabels/placement.json)
record 13 nodes, 78 anchors, PGF 3.1.11a and LF-normalized source/wrapper hashes.
Translations are reconstructed from PGF's printed TeX dimensions; retained
anchor coordinates are observed directly as integer scaled points.

The fixture covers straight midpoint/quarter placement, reversed slopes and
the upside-down override, relative and absolute curves, measured node borders
with a Stealth arrow, transform reset/full transformation, endpoint positions
and multiple labels. Tests compare the text boxes, linear matrices and retained
anchors. Separate original outlined SVGs supply iteration image inspection.

The later workflow checks native probe noninterference, shipped glyph/paint
order, primary/local policies and both ordinary-PDF gates. It reuses the artifact
writer, bounded saved-report reader, renderer, image metrics, child ownership
and corruption controls. Native measurement parsing and label policies retain
their own semantics. See the [current verification guide](../../docs/VERIFICATION.md)
for iteration and final qualification; the 78 anchors above describe this
retained six-anchor oracle, rather than the later 208-anchor placement corpus.

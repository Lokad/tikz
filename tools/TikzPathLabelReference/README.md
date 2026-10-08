# Focused path-label native observations

This is an iteration oracle for the declared attached-label
[prototype](../../docs/PATH-LABELS.md), not a qualification framework.
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

Native probe noninterference, shipped glyph/paint-order evidence, primary/local
policies and both ordinary-PDF gates remain required for feature qualification.
Final acceptance will reuse the existing artifact writer, bounded saved-report
reader, renderer, image metrics, child ownership and corruption controls. Native
measurement parsing and label policies retain their own semantics. Unchanged
calc calibration is preserved.

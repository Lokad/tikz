# Fill and clipping rules

`nonzero rule` is the default. `even odd rule` selects parity filling; the last
rule key applied to a filled path wins. Scope options are inherited and restored
when the scope ends. The rule affects the interior of compound contours and
does not alter their coordinates, winding or stroke.

```tex
\begin{scope}[even odd rule]
  \fill (0,0) rectangle (2,2) (.5,.5) rectangle (1.5,1.5);
  \clip (3,0) rectangle (5,2) (3.5,.5) rectangle (4.5,1.5);
  \fill[nonzero rule] (2,-1) rectangle (6,3);
\end{scope}
```

The first filled compound contour has a hole under parity filling. Under
nonzero filling, equally oriented nested contours remain filled; oppositely
oriented contours can form a hole. Select a clipping rule on a surrounding
scope. Local rule keys on `\clip`, including through styles, `every path` or
inline path options, reject with a source diagnostic. Native TikZ rejects these
extra clipping-command options as well.

A clip captures the selected rule when it is created. Later paint changes do
not change it. SVG paths carry `fill-rule`; clip paths carry `clip-rule`, with
clip lifetime following the surrounding scope. Nested clipping and clipped
glyphs/arrows use the same captured rule. General TeX execution and arbitrary
key handlers remain outside the supported subset.

The [ordinary mechanism tests](../tests/Lokad.TikZ.Tests/FillRuleTests.cs) cover
default/ordered rules, scope restoration, captured clip state and invalid local
rule syntax. The [complete flowchart](../tests/Fixtures/Diagrams/flowchart-fill-rules.tikz)
combines same/opposite contour winding with positioning, labels, arrows and
calculated coordinates, plus an even-odd clip and a separate nonzero clip.

Reference generation preserves the original native SVG and unmodified PDF.
PGF 3.1.11a's SVG backend omits `clip-rule` on the even-odd clip; a fixed-fixture
reference correction adds that one attribute. Independent PGF rule observations,
SVG attributes and PDF `f*`/`B*`/`W*` operators establish the rule semantics.
The correction preserves every other SVG byte, geometry, paint, glyph and
outline. Native image encodings preserve both rules, and wrong-fill-rule and
wrong-clip-rule controls must visibly fail the existing per-region policies.
Fresh converter output and final qualification remain separate from frozen
native calibration; see the [verification workflow](VERIFICATION.md).

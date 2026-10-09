# Bounded numeric assignments

The converter supports `\pgfmathsetmacro\name{expression}` before a picture
and among supported picture statements. The target is an unbraced control
sequence containing ASCII letters. Drawing commands, `\begin`, `\end`,
`\foreach`, `\tikzset`, `\usetikzlibrary`, and names starting with `pgf` or
`tikz` are reserved.

```tex
\begin{tikzpicture}
  \pgfmathsetmacro\spacing{(3+1)/2}
  \foreach \i in {1,...,3} {
    \pgfmathsetmacro\offset{-\i*\spacing}
    \node[draw] (stage\i) at (0,\offset) {Stage \i};
  }
  \draw (stage1) -- (stage3);
\end{tikzpicture}
```

Assignment expressions accept ordinary decimal literals, parentheses, unary
`+`/`-`, and binary `+`, `-`, `*`, `/`. They can read earlier numeric definitions
and integer foreach bindings. Assignments execute sequentially, including an
update that reads its previous value. Explicit groups, scopes and individual
foreach iterations inherit numeric values and restore enclosing values on exit.
Values defined before the picture are available in its numeric options.

The result is dimensionless. Numeric definitions can be read by supported
coordinate, calc and option expressions. The following forms are unsupported:

- Unit-bearing assignment literals, scientific notation, functions, powers,
  constants and arbitrary TeX definitions or expansion.
- Using a numeric definition to expand label text, node names or foreach lists.
- Assigning to an active foreach variable.

These forms fail explicitly with no partial SVG. Unknown or out-of-scope
numeric definitions produce TIKZ003. Division by zero and finite-register
overflow produce TIKZ004. Existing coordinate functions have their own
documented grammar; this assignment grammar does not add function support.

Arithmetic follows the observed PGF 3.1.11a finite scalar routes. Unsigned
literal decimal text is preserved. Each operation reads operands at TeX
scaled-point precision, performs bounded integer arithmetic, and prints the
native decimal result before the next operation. Division retains PGF's
integer, fractional and sub-unit reciprocal behavior. Thus `0.1*0.2` produces
`0.01999`, `7/1.5` produces `4.6667`, and `(1/3)*3` produces `0.99998`.
Assignment literals and intermediates must have an absolute scaled value at
most 1,073,741,823, the TeX dimension register limit. Intermediate overflow
can reject an expression whose mathematical result would be finite; the native
reciprocal route rejects `0/0.00002` for this reason.

Numeric values retain their original definition, expression and use locations
through diagnostics and graphics. Parsing, expansion, arithmetic and provenance
share cancellation and the conversion's work, expansion and depth budgets.
Definitions use the existing scoped semantic program and resolved graphics
pipeline, with no runtime TeX or package dependency.

Ordinary tests compare 65 independently observed printed assignment results and
496 named-node anchors across a complete flowchart, a focused scope/arithmetic
corpus and boundary controls. The complete diagram also exercises positioning,
styles, loops, path labels, five arrows and calculated coordinates. Its numeric
comparison and the focused comparison check fresh public output, glyphs,
paths, paint order and framing. Both fixtures pass 3,227 numeric checks, 48
current primary and 16 PDF views, and 64 independent fresh-source views in the
final committed clean export. Required diagram, foreach, style, path-label and
calc regressions also pass with frozen native calibration. All 623 ordinary
tests pass in both the export and the integrated source tree. Paired 1x/4x
iteration images retain raw differences; the [portable reference archives](../tests/Reference/MathMacros/README.md)
preserve exact native evidence. This evidence covers the declared grammar and
fixed fixtures; broader PGF math remains release scope.

# Selected scalar functions

Numeric assignments accept `abs(x)`, degree-based `sin(x)` and `cos(x)`, and
exactly two arguments for `min(x,y)` and `max(x,y)`. Names are case-sensitive.
Arguments can contain the documented [assignment arithmetic](MATH-MACROS.md),
earlier numeric definitions, foreach bindings and nested selected calls.

```tex
\begin{tikzpicture}
  \foreach \i in {1,2,3} {
    \pgfmathsetmacro\dx{2*cos(\i*30)}
    \pgfmathsetmacro\dy{2*sin(\i*30)}
    \node[draw] (worker\i) at (\dx,\dy) {Worker \i};
  }
\end{tikzpicture}
```

Functions follow the observed PGF 3.1.11a finite scalar routes. Operands read
at TeX scaled-point precision, and each function prints its finite decimal
result before enclosing arithmetic. Cosine normalizes degrees over a full turn
and interpolates rounded whole-degree constants with two separately truncated
products. Sine subtracts 90 degrees before normalization. Thus `cos(0.5)` prints
`0.99992`, `sin(0.5)` prints `0.00873`, and `cos(179.99999)` prints `-0.99998`.
The implementation calculates the constants independently.

Minimum starts from PGF's `16383` register and maximum from `-16383`.
Consequently `min(16383.9,16383.99)` prints `16383.0` and
`max(-16383.9,-16383.99)` prints `-16383.0`, even though all four input literals
fit a TeX dimension. Sine's temporary angle shift occurs before normalization;
both `sin(-16294)` and `sin(-16383)` succeed. Input operands and printed results
retain the assignment evaluator's finite-register bounds.

Wrong arity produces TIKZ001. Undeclared functions, unit-bearing assignment
operands, scientific notation, powers and constants produce TIKZ002. Unknown
numeric definitions produce TIKZ003; division by zero and finite overflow produce
TIKZ004. Failures emit no partial SVG. Function evaluation retains original
definition/use locations and graphics provenance and shares the conversion's
work, expansion and expression-depth limits and cancellation. Existing coordinate
functions have their own grammar and semantics.

The [native snapshots](../tests/Reference/MathFunctions/README.md) supply 1,490
printed results and 688 named-node anchors, including sine and cosine at every
whole and half degree in one complete turn. The complete network combines
functions with styles, loops, positioning, five path labels, six arrows and
calculated coordinates. Its comparison and the focused corpus pass 5,866 numeric
checks for fresh public output, glyphs, geometry, paint and framing. The portable
archives retain the original native observations, image calibration and control
sources, including the focused corpus's packed control JSON. The
[verification workflow](VERIFICATION.md) checks current primary/PDF images and
independent fresh-source recaptures under its declared view policy. Historical
reports retain their original camera products, matrix sizes and test totals.
Final qualification includes the complete diagram matrix and separate family
checks in a clean committed source export. This evidence qualifies the declared
functions and fixed fixtures. Other PGF functions require separate evidence;
[math labels](MATH-LABELS.md) and [plotting](PLOTTING.md) have their own contracts.

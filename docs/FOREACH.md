# Bounded statement loops

The converter supports one-variable statement loops with literal lists and
bounded signed integer ranges. TikZ includes this command without a library.

```tex
\begin{tikzpicture}
  \foreach \i in {1,...,3} {
    \node[draw] (stage\i) at (\i,0) {Stage \i};
  }
  \draw (stage1) -- (stage3);
\end{tikzpicture}
```

The grammar is `\foreach \name in {values} {statements}`. The variable is a
control sequence containing ASCII letters. Drawing commands, `\begin`, `\end`,
`\foreach`, `\tikzset`, `\usetikzlibrary`, and names starting with `pgf` or `tikz`
are reserved. The list and body must be braced; the body contains complete
supported statements. Names defined inside iterations remain available later.

Literal lists such as `{1,2,3}`, `{red,blue}` and `{8mm,12mm}` are supported.
Values may contain ASCII letters/digits, space/tab/CR/LF, signs and decimal points.
Outer grouping allows a value containing spaces, as in `{{Stage one}}`.
Comments retain their usual meaning. `{}` performs zero iterations; an empty
value inside a nonempty list is unsupported. General TeX tokens, structural
syntax and macro-defined lists are outside this contract. Outer loop variables
may be used in an inner loop's list.

Integer ranges have exactly one of these forms:

| Form | Values |
| --- | --- |
| `{1,...,3}` | `1,2,3` |
| `{3,...,1}` | `3,2,1` |
| `{1,3,...,6}` | `1,3,5` |
| `{-1,-3,...,-6}` | `-1,-3,-5` |
| `{2,...,2}` | `2` |
| `{1,3,...,0}` | `1,3` |

The implicit step is `1` or `-1`, toward the endpoint. Two explicit seeds
always execute and determine the step, even when it points away from the endpoint.
Continuation stops before crossing the endpoint; unreachable endpoints are
not appended. Each integer and the nonzero step must have magnitude at most
16383, matching the declared subset's exact TeX dimension arithmetic. Decimal
and alphabetic ranges, contextual ellipses and zero steps are unsupported.
PGF advances before comparing the endpoint. If that attempted continuation
exceeds the same integer bound, the converter reports TIKZ004 at the ellipsis,
even when the generated value would have crossed the endpoint. Trusted native
overflow controls retain PGF's corresponding `Dimension too large` failure.

Variables substitute into supported names, numeric expressions, option values
and labels. Control-word boundaries are preserved: `\i` does not match
`\index`. TeX ignores delimiter whitespace following a control word, so
`{\word two}` with `\word=One` produces `Onetwo`; use `{\word{} two}` for a
space. Each iteration has a local style/graphics scope. Nested loops inherit
bindings, shadow them locally, and restore the enclosing values afterward.
General macro expansion, foreach options, multiple variables, unbraced bodies,
path-local loops, `evaluate`, `remember`, `count` and `\breakforeach` are
unsupported, with explicit diagnostics and no output on failure.

Bodies remain source templates in the semantic program. One bound statement
is parsed and resolved at a time. Its span map points diagnostics and graphics
back to the original body/list, including variable uses and declarations in
`RelatedLocations`. Generated range values point to the original ellipsis and
retain their seed/endpoint locations. No generated-buffer offset is public.

Loops share the conversion's cancellation and work, nesting, node, glyph,
iteration and expansion budgets. `MaxLoopIterations` counts every entered
iteration, including outer loops and empty bodies. `MaxExpansionDepth` bounds
nested loops. `MaxExpandedTokens` conservatively counts copied UTF-16 units of
lists and bound statements, including unchanged template text and generated
range values; style expansion uses the same accumulated counter. Ranges are
generated lazily rather than allocated as a complete list.

The trusted flowchart combines loop-created nodes/coordinates with positioning,
parameterized styles, path labels, five arrows and calc. Its independent native
SVG/PDF measurements check all 1,765 text/anchor/glyph/path/arrow/paint/bounds
quantities. A separate focused fixture measures 29 nodes and 464 anchors for
lists, ranges, shadowing and scope restoration. Its full native comparison also
checks 2,193 glyph/path/paint/order/bounds quantities and two named coordinates.
Nodes clear inherited draw/fill modes before applying node styles and local
options, retaining their inherited pen. These are iteration checks.
Complete image/PDF policy and final clean-source qualification remain separate
requirements; the converter does not promise general TeX compatibility.

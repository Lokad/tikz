# Zero-argument token definitions

`\def\name{body}` defines a scoped token template. The name is one unbraced
ASCII-letter control word; the body is balanced and has no parameters. Definitions
are accepted in `PictureBody`, inside a picture, and in the supported prefix
before an explicit `tikzpicture`.

```tex
\def\widthalias{\widthvalue}
\def\widthvalue{12mm}
\def\captiontext{Input}
\begin{tikzpicture}[box/.style={draw,minimum width=\widthalias}]
  \node[box] (first) {\captiontext};
  \def\widthvalue{18mm}
  \def\captiontext{Output}
  \def\place{\node[box] (second) at (3cm,0) {\captiontext};}
  \place
  \draw (first) -- (second);
\end{tikzpicture}
```

Bodies are stored without execution and resolved when invoked. An alias may
refer to a control defined later, provided that control exists at use. Unused
recursive bodies are harmless; invoked direct or indirect cycles produce
`TIKZ003`. Redefining a control with a different body may terminate a statement
template. Each statement sees the current definitions in source order; later
redefinition does not alter already resolved output.

Supported uses include complete statement calls, coordinate/path fragments,
prose/math labels, option values and individual key names. Expanded content must
belong to the existing supported grammar. A key alias must produce one supported
key; it cannot introduce a comma-delimited option list or an assignment through
the key name. Style bodies retain tokens until style use. Expansion consumes a
control word's delimiter whitespace/comments and preserves control boundaries,
escaped symbols and original source locations.

Scopes, braced statement groups and each `foreach` iteration restore definitions.
Statement calls add no implicit group. Numeric assignments and token definitions
replace the same scoped control name. A token definition cannot replace an active
foreach variable. Every conversion has its own environment, including concurrent
calls.

Numeric bindings can substitute into an invoked token alias or statement body.
Direct numeric uses outside that template retain their receiving grammar:
an unrelated token declaration does not enable numeric text, name or list
expansion. See the [numeric-assignment contract](MATH-MACROS.md).

Parameter definitions, parameter tokens, general argument scanning, `\newcommand`,
`\edef`, `\gdef`, catcodes and a macro-generated picture wrapper are unsupported.
TikZ statement controls and names beginning `pgf` or `tikz` cannot be redefined.
Unsupported invoked commands, keys and label constructs fail explicitly. An unused
body is not executed; storing it cannot access files or launch TeX.

Expansion uses the conversion's existing work, generated-unit and depth limits
and cancellation token. Diagnostics retain the original definition token and
invocation locations in UTF-16; failures return no partial SVG. Expansion is
local to statement/value evaluation, preserving the source-aware semantic
program, resolved graphics scene and SVG phases.

The [focused tests](../tests/Lokad.TikZ.Tests/DefinitionTests.cs) check hand-expanded
output/bounds parity, scope/order, token boundaries, cycles, explicit rejection,
provenance, shared limits, ongoing cancellation and conversion isolation.
The [focused corpus](../tests/Fixtures/Definitions/definitions-contract.tikz) and
[complete flowchart](../tests/Fixtures/Diagrams/flowchart-definitions.tikz) combine
definitions with measured nodes, styles, foreach, positioning, path labels,
arrows and calculated coordinates. Their [frozen references](../tests/Reference/Definitions/README.md)
use independent native measurements, original SVG and unmodified PDF routes.
The existing [verification tools](VERIFICATION.md) check fresh converter output.

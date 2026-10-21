# Bounded parameterized styles

Styles declared with `name/.style={...}` and extended with
`name/.append style={...}` can use one argument, `#1`, as an entire option value.
Use `name=value` or `name={value}` to supply it. The value follows the supported
grammar of the receiving key: a physical dimension, color, anchor, font setting
or another declared style argument, for example.

```tex
\usetikzlibrary{positioning}
\begin{tikzpicture}[node distance=9mm,
  box/.style={draw,rectangle,minimum width=#1,inner sep=3pt},
  stage/.style={box=#1},stage/.append style={minimum height=8mm}]
  \node[box=12mm] (input) {Input};
  \node[stage=16mm,right=of input] (check) {Check};
\end{tikzpicture}
```

Argument forwarding through nested styles retains option order. Appended options
receive the same argument; later explicit options can override their values.
Definitions and extensions restore on leaving a scope. `/tikz/` and `/pgf/` key
qualification follows the existing key handling. A style whose body does not use
`#1` ignores a supplied argument, as native TikZ does.

Every use of `#1` requires a nonempty explicit argument in this subset. This also
applies to automatic styles such as `every node`, `every path` and `every edge`.
Native TikZ can accept missing arguments in some cases; the converter diagnoses
those cases explicitly. Defaults and general TeX parameter expansion are outside
this contract. Higher parameter indices, parameterized keys, embedded expressions
such as `2*#1`, parameterized coordinate components, doubled parameter markers
and `/.style n args` are unsupported. Unsupported markers in a definition are
diagnosed even if that style is never used. Comments retain their usual meaning.

Argument errors point into the original invocation string. Definition and nested
forwarding positions are retained in diagnostic `RelatedLocations`; template-key
errors retain the definition span and related invocation positions. Diagnostic
offsets refer to the original source. Recursion and repeated application share
the caller's cancellation, work and expansion-depth limits. `MaxExpandedTokens` conservatively
counts each replayed option's key and value UTF-16 lengths plus one separator;
the count accumulates across style uses in the conversion.

The trusted `flowchart-parameterized` and `style-contract` fixtures have eleven
named nodes and 176 independently measured native anchors, with text boxes and
placement matrices. They cover forwarding, append order, overriding options and
scope restoration. Ordinary tests compare these exact observations and public/
trace parity, and cover source provenance, explicit rejection and shared limits.
The existing semantic comparer also checks fourteen text nodes and 65 glyphs
against independent SVG/PDF observations. All 2,053 numeric checks pass, including
the flowchart's paths, four arrow tips, shortening and calculated waypoint.
The standalone glyph oracle has only .NET references and loads no converter.
Native sensitivity includes first-glyph and whole-label controls for both
fixtures and arrow-tip controls for the flowchart. The
[frozen references](../tests/Reference/Diagrams/README.md) retain their original
SVG/PDF calibration and historical camera products. The current
[verification workflow](VERIFICATION.md) checks fresh converter output, numeric
agreement and independent source recapture under its declared view policy.
Final qualification includes the complete diagram matrix and separate family
checks in a clean committed source export. Broader TikZ compatibility remains
separate.

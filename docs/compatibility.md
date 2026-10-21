# TikZ compatibility index

Lokad.TikZ compiles the bounded forms described here and in the linked guides.
It implements selected TikZ behavior without a TeX engine. The
[public contract](../SPEC.md) defines inputs, options, output, diagnostics and
limits. The project remains a preview; broader TikZ compatibility and release
qualification are separate from the fixed fixture evidence.

## Statements and base geometry

`Picture` input contains one `tikzpicture`, optionally preceded by supported
library/style/token-definition/numeric-assignment statements. `PictureBody` contains the supported
statements directly. Percent comments, whitespace and balanced groups retain
their defined parser meaning. Scope environments and braced statement groups
restore local options; library availability is ordered within a conversion.

| Form | Implemented boundary / evidence |
| --- | --- |
| `\path`, `\draw`, `\fill`, `\filldraw`, `\clip` | Semicolon-terminated paths and scoped paint/clip state; [trusted fixtures](../tests/Fixtures), [geometry/numeric reference cases](../tests/Lokad.TikZ.Tests/ReferenceTests.cs) |
| Coordinates | Two-dimensional Cartesian `(x,y)`, polar `(angle:radius)`, named coordinates/node anchors, relative `+` and `++`; explicit `... cs:` systems and 3D are excluded |
| Path operations | Moves, `--`, `|-`, `-|`, `.. controls (a) [and (b)] .. (end)`, `rectangle`, `circle`, `ellipse`, `arc` and `cycle`; connections, labels and plots use their narrower guides below |
| Shape syntax | Circle radius, paired ellipse radii and [legacy/modern arcs with ordered radii](ARCS.md); modern arcs accept `start angle`, `end angle`, `radius`, `x radius`, `y radius`; mixed physical/unitless ellipse/arc radii reject |
| Coordinates/transforms | Physical `pt`, `bp`, `cm`, `mm`, `in`, `sp`, `px`, contextual `em`/`ex`, basis vectors `x`/`y`; ordered `scale`, `xscale`, `yscale`, `xslant`, `yslant`, `rotate`, `shift`, `xshift`, `yshift`, `cm`; [finite native precision cases](../tests/Lokad.TikZ.Tests/TransformPrecisionTests.cs) |
| Paint | `draw`/`fill`/`color`, [nonnegative line widths and thickness presets](WIDTHS.md), opacity channels, caps/joins/miter limits and [nonzero/even-odd fill and clip rules](FILL-RULES.md); [colors](COLORS.md), [dashes](DASHES.md), [complete paint fixtures](../tests/Reference/PaintDiagrams/README.md) |
| Arithmetic | Expressions are bounded and context-dependent; coordinate calculations, numeric assignments and function plots have distinct contracts below. Division by zero, nonfinite results, unresolved names and undeclared contextual operations diagnose explicitly |

The [parser](../src/Lokad.TikZ/Frontend/Parser.cs) and
[option handling](../src/Lokad.TikZ/Semantics/KeyRegistry.cs) also contain
implementation details beyond individual reference cases. Acceptance by an
implementation branch alone does not establish a native compatibility envelope
for every option/function combination. Reference geometry fixtures retain their
own exact or calibrated policies, independent from label and diagram policies.

## Feature contracts

Each guide enumerates its syntax, restrictions, numeric behavior, source
attribution and independently grounded scope. These contracts are not widened by
another family accepting a similar expression or option.

| Family | Supported slice | Contract and retained evidence |
| --- | --- | --- |
| RGB colors | Nineteen declared names and selected `!` mixtures; path/glyph quantization is distinct | [Colors](COLORS.md), [focused tests](../tests/Lokad.TikZ.Tests/RgbColorTests.cs) |
| Dashes | Named presets, bounded on/off patterns, phases and native pen-dependent state | [Dashes](DASHES.md), [state](../tests/Lokad.TikZ.Tests/DashTests.cs)/[geometry](../tests/Lokad.TikZ.Tests/DashGeometryTests.cs) |
| Nodes | Rectangle/circle/ellipse, measured labels, anchors/separation/minimum dimensions and declared transform behavior | [Nodes](NODES.md), [native border tests](../tests/Lokad.TikZ.Tests/RectangleBorderTests.cs) |
| Prose and multiline labels | Six bundled Latin Modern faces, enumerated repertoire/commands, explicit rows and left/center/right alignment; no wrapping or fallback font | [Text](TEXT.md), [layout tests](../tests/Lokad.TikZ.Tests/TextLayoutTests.cs) |
| Math labels | Declared inline math, scripts, Greek symbols, fractions, roots and mixed prose | [Math labels](MATH-LABELS.md), [parser](../tests/Lokad.TikZ.Tests/MathParserTests.cs)/[layout](../tests/Lokad.TikZ.Tests/MathLayoutTests.cs) |
| Straight connections | Declared `to` and `edge`, border endpoints, separate path order and effective paint | [Edges](EDGES.md), [native tests](../tests/Lokad.TikZ.Tests/EdgeTests.cs) |
| Curved connections | Selected bends, in/out angles, looseness and distance controls | [Curved edges](CURVED-EDGES.md), [native tests](../tests/Lokad.TikZ.Tests/CurvedEdgeTests.cs) |
| Arrows | One tip per end: legacy/modern `To`, `Stealth`, `Latex`; physical dimensions, shortening and bounded default-fill backend correction in reference generation | [Arrows](ARROWS.md), [native tests](../tests/Lokad.TikZ.Tests/ArrowTests.cs) |
| Attached path labels | Supported `-- node` and `to node`, `pos`/`midway`, `sloped`, declared orientation and paint behavior | [Path labels](PATH-LABELS.md), [native tests](../tests/Lokad.TikZ.Tests/PathLabelNativeTests.cs) |
| Positioning | Declared directional/diagonal `of` placement, anchor choices and scoped distances | [Positioning](POSITIONING.md), [native tests](../tests/Lokad.TikZ.Tests/PositioningTests.cs) |
| Calculated coordinates | Vector sums/factors, interpolation, physical distance, projection and selected rotated/nested modifiers | [Calc](CALC.md), [native tests](../tests/Lokad.TikZ.Tests/CalcCoordinateTests.cs) |
| Styles | Scoped `/.style`/`/.append style`, automatic styles and one whole-value `#1` argument; no general TeX parameters | [Styles](STYLES.md), [tests](../tests/Lokad.TikZ.Tests/ParameterizedStyleTests.cs) |
| Statement loops | One-variable literal lists/signed integer ranges and braced supported bodies | [Foreach](FOREACH.md), [tests](../tests/Lokad.TikZ.Tests/ForeachTests.cs) |
| Token definitions | Zero-argument `\def\name{body}`, lazy scoped statement/value templates, source order and explicit cycles; no general TeX arguments | [Definitions](DEFINITIONS.md), [tests](../tests/Lokad.TikZ.Tests/DefinitionTests.cs) |
| Numeric assignments | Scoped `\pgfmathsetmacro` targets and the guide's finite arithmetic subset | [Math macros](MATH-MACROS.md), [tests](../tests/Lokad.TikZ.Tests/MathMacroTests.cs) |
| Scalar functions | Selected assignment arithmetic/trigonometry/min/max; other expression contexts do not widen this profile | [Math functions](MATH-FUNCTIONS.md), [native tests](../tests/Lokad.TikZ.Tests/MathFunctionTests.cs) |
| Plotting | Sharp/smooth coordinate and finite function streams, connected plots, smooth cycle and bounded sampling | [Plotting](PLOTTING.md), [native tests](../tests/Lokad.TikZ.Tests/PlotTests.cs) |

## Libraries and exclusions

Only `calc`, `positioning`, `arrows.meta` and `shapes.geometric` are accepted
library names, through `\usetikzlibrary{...}` or `TikzOptions.Libraries`. They
enable the described subsets rather than executing the upstream library.
Reloading does not reset definitions or state. No library availability leaks
into another conversion. Unsupported library names produce `TIKZ002`.

General TeX document commands, `\input`/file access, parameterized definitions/`\newcommand`,
arbitrary package loading, unrestricted token expansion/typesetting, display
math, external/installed fonts, automatic paragraph shaping, graph drawing,
PGFPlots, file/gnuplot data, external images, raw SVG and script are outside the
contract. Unknown commands, keys, glyphs or required library features fail
explicitly. There is no production native fallback.

Native/reference policies cover independently authored fixtures and selected
complete flowchart/network interactions, rather than a Cartesian product of
every primitive. The [diagram corpus](../tests/Fixtures/Diagrams/README.md),
[verification coverage mapping](VERIFICATION.md) and [testing guide](TESTING.md)
describe numeric, original/corrected SVG, independent PDF, pixel and visible
negative controls. References are frozen while their inputs/tools stay unchanged;
new converter output is checked independently. Broader interaction, hosted and
release qualification remains separate.

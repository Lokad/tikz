# Bounded text profile

The `latin-modern-ec-10-12-v1` profile supplies measured prose labels.
Its parser and measured layout remain internal. The profile uses
only bundled regular, bold, and italic Latin Modern outlines at their 10pt
and 12pt design sizes; it never discovers fonts or invokes TeX at runtime.

## Declared grammar

Balanced groups scope font changes. Ordinary spaces/tabs collapse, line ends
produce space tokens, and percent comments consume their line end. Leading
ordinary space tokens and the final glue follow the trusted TikZ label wrapper.
Sentence spacing uses the pinned LaTeX EC space-factor codes. `~`, Unicode
nonbreaking space, and backslash-space produce ordinary fixed space glue.
Paragraphs, wrapping, justification, and hyphenation are excluded.

The six font declarations are `\bfseries`, `\mdseries`, `\itshape`,
`\upshape`, `\normalfont`, and `\rmfamily`; `\normalsize` and `\large`
select 10pt and 12pt. Grouped `\textbf`, `\textmd`, `\textit`, `\textup`,
`\textnormal`, and `\textrm` arguments have the supported automatic italic
correction behavior. `\/` requests explicit italic correction. Combined
bold italic and all other families/sizes fail explicitly.

Top-level `\\` starts a new explicit row; rows support left, center, or
right alignment. Breaks inside groups, starred breaks, and optional break
spacing fail. Native integer baselines follow the initial size's baseline
skip, with the measured tall-line spacing rule. Public nodes require an explicit
`align=left`, `center`, or `right` when their label contains line breaks. The
actual-node corpus checks mixed-size and empty-row interactions independently.

Escapes `\%`, `\#`, `\$`, `\&`, `\_`, `\{`, and `\}` emit punctuation.
The symbol commands are `\textbackslash`, `\textasciicircum`,
`\textasciitilde`, `\textquotedbl`, `\textquotedblleft`,
`\textquotedblright`, `\textsterling`, `\textsection`, `\textunderscore`,
`\ae`, `\AE`, `\oe`, `\OE`, `\o`, `\O`, `\ss`, `\i`, and `\j`.
All other prose commands fail. `$...$` delimits the
[bounded math-label grammar](MATH-LABELS.md); `\$` emits a literal dollar sign.
Raw `^`, `_`, `#`, and `&` require a declared escape outside that math grammar.

Literal repertoire: printable ASCII excluding those syntax characters;
U+00C0–U+00D6, U+00D8–U+00DE, U+00E0–U+00F6, U+00F8–U+00FE;
and U+00A1, U+00A3, U+00A7, U+00AB, U+00BB, U+00BF, U+00DF, U+00FF,
U+0152, U+0153, U+0131, U+0237, U+1E9E, U+2013, U+2014, U+2018,
U+2019, U+201C, and U+201D. U+00A0 is space glue. There is no Unicode
normalization, combining-accent shaping, bidi handling, or fallback font.
Malformed UTF-16 and unsupported scalars produce source diagnostics.

## Measurement and bounds

Layout retains integer TeX scaled points for advances, kerns, italic
corrections, box dimensions, alignment, and baselines. Font metrics and
outlines use the same pinned resources. Ligature chains and kerning run within
the supported lexical boundaries; groups/font assignments stop the sequence.
Resolved glyphs retain the contributing UTF-16 source span, including a
ligature's combined span. Whitespace never emits the visible EC slot-32 glyph.

Original source length is admitted at the conversion boundary. Generated label
content uses the shared expansion, nesting, work, glyph and dimension limits;
it is not measured against the caller-source ceiling again. Cancellation
preserves the caller's token.
The process cache contains only the six declared embedded faces; setup work
is charged consistently regardless of whether another call warmed that cache.

TeX width/height/depth are layout dimensions, not an outline ink box. Node
geometry must measure labels first and compute ink extents separately. The
whole-label image runner uses a declared fixed bp frame. A separate actual-node
corpus checks CSS outline placement, rectangle anchors, and natural cropping.
Neither result establishes arbitrary text transformations or secondary PDF
fidelity. The SVG contains XML-escaped readable labels and local outline uses.

The sixteen native-reference cases and their exact integer tests ground the
enumerated interactions they exercise. They do not establish general TeX
typesetting or every combination of the declared primitives. New interactions
require their own oracle cases; see [grounding instructions](TESTING.md).

## Integration evidence and current checking

The [styled multiline flowchart](../tests/Fixtures/Diagrams/flowchart-styled-labels.tikz)
qualifies the combined interaction of all six prose faces, three alignments,
mixed-size rows, normal inline math, positioning, measured borders, arrows,
sloped path labels and calculated coordinates. Its nine boxes/27 dimensions,
144 anchors, 75 glyphs and two rules have independent native checks. Historical
clean-export acceptance at `2efa289` recorded 24 primary/local views, eight
original/candidate PDF views and 32 source recaptures for this case. Those counts
describe that revision's camera product. The
[frozen evidence](../tests/Reference/StyledLabels/README.md) uses the existing
profile; it adds no fonts, wrapping or general TeX support.

The [node implementation](NODES.md) consumes measured labels before resolving
geometry. Its original rectangle corpus checks boxes, separations, anchors,
background corners and glyph measurements for 22 nodes. Actual-node CSS raster
policies and whole-label bp policies remain distinct. Later shape, transform,
clip and primary/PDF interaction evidence has its own declared scope in the
node and diagram guides.

Use the [current verification workflow](VERIFICATION.md) to check fresh output.
The routine `mechanisms-v1` views replace the historical camera product while
preserving native calibration and independent source recapture. Recorded passes
refer to their source revision and renderer; ordinary parsing or older images
do not establish current image conformance.

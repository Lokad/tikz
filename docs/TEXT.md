# Internal text profile

The `latin-modern-ec-10-12-v1` label frontend is internal preparatory work.
The public converter does not yet accept nodes or labels. The profile uses
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
skip, with the measured tall-line spacing rule. This grammar still needs
end-to-end TikZ node fixtures before public integration.

Escapes `\%`, `\#`, `\$`, `\&`, `\_`, `\{`, and `\}` emit punctuation.
The symbol commands are `\textbackslash`, `\textasciicircum`,
`\textasciitilde`, `\textquotedbl`, `\textquotedblleft`,
`\textquotedblright`, `\textsterling`, `\textsection`, `\textunderscore`,
`\ae`, `\AE`, `\oe`, `\OE`, `\o`, `\O`, `\ss`, `\i`, and `\j`.
All other commands fail. Raw `$`, `^`, `_`, `#`, and `&` require a declared
escape; dollar-delimited math fails rather than rendering as ordinary text.

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

Source length, nesting, total work, emitted glyph count, and dimension limits
share the conversion budget. Cancellation preserves the caller's token.
The process cache contains only the six declared embedded faces; setup work
is charged consistently regardless of whether another call warmed that cache.

TeX width/height/depth are layout dimensions, not an outline ink box. Node
geometry must measure labels first and compute ink extents separately. The
prototype image runner uses a declared fixed bp frame; it does not establish
the future converter's natural crop, CSS outline placement, node anchors,
text transformations, accessibility metadata, or secondary PDF fidelity.

The sixteen native-reference cases and their exact integer tests ground the
enumerated interactions they exercise. They do not establish general TeX
typesetting or every combination of the declared primitives. New interactions
require their own oracle cases; see [grounding instructions](TESTING.md).

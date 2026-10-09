# Bounded math labels: implementation target

Math labels are not implemented yet. The public converter reports TIKZ002 at
the opening `$` and emits no partial SVG. This document declares the bounded
target; the [native observations](../tests/Reference/MathLabels/README.md) are
grounding evidence, not current converter conformance.

The first profile supports inline `$...$` runs within existing node and path
labels, including mixed prose and math. It uses a small source-aware math AST,
integer scaled-point box layout and embedded Latin Modern math data. Label
measurement precedes node geometry. Glyphs and fraction/radical rules pass
through the resolved graphics scene before SVG serialization.

## Grammar and atoms

| Construct | Declared syntax and behavior |
| --- | --- |
| Letters and numbers | ASCII Latin letters use math italic; decimal digits use upright roman. Each character is an atom; an identifier or decimal number can contain several atoms. |
| Greek | `\alpha`, `\beta`, `\gamma`, `\delta`, `\epsilon`, `\zeta`, `\eta`, `\theta`, `\iota`, `\kappa`, `\lambda`, `\mu`, `\nu`, `\xi`, `\pi`, `\rho`, `\sigma`, `\tau`, `\upsilon`, `\phi`, `\chi`, `\psi`, `\omega`; variants `\varepsilon`, `\vartheta`, `\varpi`, `\varrho`, `\varsigma`, `\varphi`; uppercase `\Gamma`, `\Delta`, `\Theta`, `\Lambda`, `\Xi`, `\Pi`, `\Sigma`, `\Upsilon`, `\Phi`, `\Psi`, `\Omega`. |
| Ordinary symbols | `/`, `.`, `|` and `\infty`; punctuation is not treated as prose. |
| Binary operators | `+`, `-`, `\cdot`, `\times`, `\pm`, `\mp`. A binary atom becomes ordinary at the start/end, after a binary/operator/relation/opening/punctuation atom, or before a relation/closing/punctuation atom. |
| Relations | `=`, `<`, `>`, `:`, `\le`/`\leq`, `\ge`/`\geq`, `\ne`/`\neq`, `\to`/`\rightarrow`, `\leftarrow`, `\leftrightarrow`. Negated equality needs the native overlapping glyph composition. |
| Delimiters and punctuation | Fixed-size `(`, `)`, `[`, `]`; comma is a punctuation atom. Braces group a math list without printing braces. |
| Upright words | `\mathrm{...}` selects the upright roman math alphabet within a group. It does not invoke prose layout. |
| Scripts | `_` and `^` each take one atom or braced group and attach to the preceding atom. Either order is accepted; each script kind occurs at most once per base. Grouped bases and nested scripts are supported. |
| Fractions | `\frac{numerator}{denominator}`, including nested fractions and fractions in scripts. Both arguments must be braced. |
| Square roots | `\sqrt{radicand}`, including nested roots, fractions and scripts. The argument must be braced; indexed roots are outside this profile. |
| Explicit spacing | `\,`, `\!`, `\;` use the native signed math spacing. Ordinary input whitespace inside math does not print a space. |

The parser preserves atom classes and groups. Layout applies native math
spacing by neighboring classes and style, including binary-operator correction
and script-style suppression of implicit spacing. Fractions are inner atoms;
radicals and grouped bases are ordinary atoms. The full declared symbol list
requires focused coverage before feature completion; the initial corpus alone
does not qualify every entry.

## Fonts and layout

Normal inline math starts in text style. Surrounding 10pt text selects 10/7/5pt
text/script/scriptscript styles; 12pt selects 12/8/6pt. Further nesting remains
at scriptscript size and is constrained by the shared depth/work limits.
Fractions and scripts select smaller styles; radicals and appropriate nested
operands retain the native cramped-style distinction.

The profile uses OT1 Latin Modern roman (`rm-lmr`), OML math italic (`lmmi`),
OMS symbols (`lmsy`) and OMX extension (`lmex10`). Optical font faces and their
TFM parameters are required at each declared size. The extension font remains
at its native fixed 10pt size, including inside surrounding 12pt math. EC prose
faces retain their existing separate profile. Bold math, arbitrary fonts and
math-alphabet changes other than `\mathrm` are outside this first profile.

Layout must account for italic correction, math kerns, axis height, script
shifts/clearances, fraction bars, and radical glyph selection/assembly and
overbars. Advance, height and depth are measured independently of outline ink.
Every glyph and rule retains its source location. Native DVI movements and
rules supply an independent check of the resulting boxes and positions;
reusing the text-only native reader without math semantics is insufficient.

## Rejections and completion

Unknown commands, unlisted symbols, display math, `\left`/`\right`, indexed
roots, general TeX macros, AMS environments, arrays, accents, large operators,
style-selection commands and arbitrary font selection fail explicitly. Invalid
groups, missing arguments/base atoms and duplicate scripts produce source-aware
syntax diagnostics. Shared cancellation, nesting, work, glyph and graphics
limits apply throughout; exhaustion produces no partial SVG.

Completion requires fresh conversion of the complete network and focused
corpus, independent checks of boxes/anchors/glyphs/rules/paint, affected image
comparisons, and the required final clean-export acceptance and integration.
Native calibration and current converter qualification remain separate.

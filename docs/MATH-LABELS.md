# Bounded math labels

The converter measures and renders the bounded grammar below using nineteen
bundled math font/size resources. Three authored sources ground native boxes,
anchors, glyph positions, rules and paint order in scaled points: 64 labels,
1,024 anchors, 459 glyphs and 37 rules. Unsupported or malformed math reports
its offending source span and emits no partial SVG. The
[native observations](../tests/Reference/MathLabels/README.md) retain the fixed
profile's evidence, including its original primary/local and PDF acceptance.
Historical acceptance and current-output checking have distinct roles below.

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
| Scripts | `_` and `^` each take one atom or braced group and attach to the preceding atom. Either order is accepted; each script kind occurs at most once per base. Grouped bases and nested scripts are supported. Explicit spacing cannot serve as a script base or argument. |
| Fractions | `\frac{numerator}{denominator}`, including nested fractions and fractions in scripts. Both arguments must be braced. |
| Square roots | `\sqrt{radicand}`, including nested roots, fractions and scripts. The argument must be braced; indexed roots are outside this profile. |
| Explicit spacing | `\,`, `\!`, `\;` use the native signed math spacing. Ordinary input whitespace inside math does not print a space. |

The parser preserves atom classes and groups. Layout applies native math
spacing by neighboring classes and style, including binary-operator correction
and script-style suppression of implicit spacing. Fractions are inner atoms;
radicals and grouped bases are ordinary atoms. The full declared symbol list
has additive native coverage in `math-atom-contract.tikz`, including both
negated-equality aliases, binary spacing contexts and upright ligatures.

## Fonts and layout

Normal inline math starts in text style. Surrounding 10pt text selects 10/7/5pt
text/script/scriptscript styles; 12pt selects 12/8/6pt. Further nesting remains
at scriptscript size and is constrained by the shared depth/work limits.
Fractions and scripts select smaller styles; radicals and appropriate nested
operands retain the native cramped-style distinction.

The profile uses OT1 Latin Modern roman (`rm-lmr`), OML math italic (`lmmi`),
OMS symbols (`lmsy`) and OMX extension (`lmex10`). Roman and italic select their
native optical 5/6/7/8/10/12pt faces. Symbols select optical 5/6/7/8/10pt faces;
12pt symbols use `lmsy10` scaled to 12pt, as declared by the native font package.
The extension font remains at its native fixed 10pt size, including inside
surrounding 12pt math. These nineteen font/size combinations use eighteen
distinct native TFM files. Metrics and outline scaling must retain both design
and selected sizes. EC prose faces retain their existing separate profile.
Bold math, arbitrary fonts and math-alphabet changes other than `\mathrm` are
outside this first profile.

Layout accounts for italic correction, math kerns, axis height, script
shifts/clearances, fraction bars, and radical glyph selection/assembly and
overbars. Advance, height and depth are measured independently of outline ink.
Every glyph and rule retains its source location. Native DVI movements and
rules supply an independent check of the resulting boxes and positions;
reusing the text-only native reader without math semantics is insufficient.

## Rejections and qualification

Unknown commands, unlisted symbols, display math, `\left`/`\right`, indexed
roots, general TeX macros, AMS environments, arrays, accents, large operators,
style-selection commands and arbitrary font selection fail explicitly. Invalid
groups, missing arguments/base atoms and duplicate scripts produce source-aware
syntax diagnostics. Shared cancellation, nesting, work, glyph and graphics
limits apply throughout; exhaustion produces no partial SVG.

Historical clean-export acceptance for the fixed profile recorded
72 primary/local views, 24 original/candidate PDF views and 96 source recaptures
for its original three cases. The separate
[styled multiline flowchart](../tests/Reference/StyledLabels/README.md) combines
normal math with all six existing prose faces, mixed-size rows, three alignments,
positioning, path labels, arrows and calculated coordinates. At `2efa289` it
passed 24 primary/eight PDF/32 source views and independent checks of nine boxes,
27 dimensions, 144 anchors, 75 glyphs and two rules. Its thin-rule PDF checking
also retains native-only per-pixel error envelopes, so endpoint errors cannot
cancel in aggregate regional metrics.

That historical 23-case integration recorded 552 primary views, 184 PDF views,
736 source recaptures and 26,977 previous-family numeric checks. These are
revision-specific observations, rather than current suite totals or a required
camera product. Independent math checks retain native box, anchor, glyph, rule,
paint and framing semantics. Frozen calibration preserves the original
three-case limits.

The [current verification workflow](VERIFICATION.md) defines routine
`mechanisms-v1` views, complete-diagram qualification and independent fresh-source
recapture. Use fresh reports for the source tree being checked; historical
acceptance does not substitute for current converter output.

Reopen qualification for a changed dependency, failed regression or identified
coverage gap. Check fresh converter output before claiming current conformance;
preserve native calibration while its inputs and tools remain unchanged.
These results cover the declared grammar and fixed renderer profile. Broader
math coverage, hosted qualification and universal pixel identity remain open.

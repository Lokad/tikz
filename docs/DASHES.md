# Dash semantics and grounding

The current prototype handles solid, dashed, dotted, dashdotted, and
dashdotdotted styles, their dense/loose variants, and the corresponding
spaced aliases. Custom alternating on/off lengths and dash phase are
supported, including empty and odd-length patterns and zero-length on
segments with positive gaps. Negative lengths and all-zero patterns fail
with source diagnostics.

Dash options follow measured PGF 3.1.11a ordering. The configured pattern
and phase are separate from the last emitted graphics state. A phase
option reapplies the configured pattern. Solid emits an empty pattern
without erasing the configured phase. Dotted styles resolve the live
line-width register after the path options; dashdotted styles capture
the width when their dash command is scheduled. Reapplying the pattern
can capture a later width. Inherited painted patterns remain unchanged
by a child width option until a dash or phase option reapplies them.

These rules have independent native evidence for the forty horizontal
lines in [dashes.tikz](../tests/Fixtures/Dashes/dashes.tikz). They cover
style/option order, width registers, phase, physical literals, inline
options, and scope restoration. General TeX register expansion is outside
the supported profile.

## Independent evidence

[TikzDashReference](../tools/TikzDashReference/README.md) compiles the
trusted fixture with latex/dvisvgm and ordinary pdfLaTeX. Both drivers
produce the same integer scaled-point dash, phase, width, and picture-box
records. Plain and probed output is byte-identical for the SVG, PDF, and
the PDF rasters at 96 and 384 dpi. A measured page position registers
the PDF independently of candidate output.

An external snapshot pins the original artifacts, trusted fixture and
generator sources, tool identities, and recorded TeX inputs. Cached
validation needs no TeX installation:

    dotnet run --project tools/TikzDashReference -c Release -- check-cached
    dotnet run --project tools/TikzDashComparison -c Release

The public comparison executes 647 numeric checks, including serialized
dash lengths and phases, line geometry, caps, and root dimensions. Its
source spans and SVG element IDs link each line back to its case.

## Image trial and inspection

With the pinned development browser installed, run from the repository root:

    node tools/TikzVisual/trial-dashes.mjs

The command creates a fresh GUID directory under artifacts/dash-image-trial.
Its latest.json pointer identifies and hashes report.json; index.html links
paired images, amplified differences, overlays, and contact sheets.
The report includes exact tool-source copies, numeric evidence, source
mapping, cameras, regions, artifact hashes, and the focused rerun command.
An agent can open the PNG paths directly without using the HTML viewer.

Two candidate-independent SVG representations distinguish integer native
widths from the original SVG driver's printed width precision. The trial
derives provisional limits from those representations before running the
public converter. It checks natural/expanded framing at 1x/4x over
transparent, white, and black backgrounds, with all forty local regions.
Seven image-only defects are rejected at both scales: missing pattern,
wrong phase, missing line, doubled width, shifted line, reduced opacity,
and root cropping.

The local trial passes, and all twelve candidate captures equal the
independent printed-width representation. Small differences remain
against the original SVG. This is an unapproved primary trial, with no
pixel-identity claim against the original oracle.

Sixteen separately registered SVG/PDF observations retain raw differences
for the original driver, both independent representations, and the
candidate at both scales and frames. Some pattern boundary distances
reach four CSS pixels. Repeat captures are exact, and there is no changed
ink outside the declared whole region. A reviewed PDF policy and its
defect controls remain pending; no other corpus's tolerance applies here.

Further grounding is required for curves, compound paths and subpaths,
closed shapes, transforms, clipping, labels, and nodes. Neither this
fixture nor the trial establishes general dash conformance.

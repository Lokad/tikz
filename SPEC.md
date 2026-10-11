# Lokad.TikZ contract

Lokad.TikZ is a synchronous, in-memory compiler for a bounded TikZ subset on
.NET 10. The production assembly depends only on .NET. It does not invoke TeX,
read files, discover installed fonts, start processes, access the network or
write to a console. The caller supplies source and consumes returned SVG.

This specification defines the public API and execution boundary. The
[compatibility index](docs/compatibility.md) and linked feature guides define
the source subsets. A successful parse is not a claim of general TikZ/TeX
compatibility or identical pixels in arbitrary renderers.

## Input and options

```text
TikzConversionResult TikzConverter.Convert(
    string source, TikzOptions options, CancellationToken cancellationToken);
```

All arguments are explicit. `TikzOptions.Default` selects one
`\begin{tikzpicture}...\end{tikzpicture}` environment, zero padding, default
limits, no preloaded libraries and an automatically derived ID prefix.
Before that picture, supported `\usetikzlibrary`, `\tikzset`, zero-argument
`\def` and `\pgfmathsetmacro` statements are allowed. Only whitespace/comments may follow
the picture. `TikzInputKind.PictureBody` instead parses supported statements
without the picture wrapper. Neither input kind accepts a complete TeX document.

| Option | Meaning and validation |
| --- | --- |
| `InputKind` | `Picture` or `PictureBody`; other enum values are invalid caller options |
| `Limits` | Non-null `TikzLimits`, validated before conversion |
| `PaddingPixels` | Finite, nonnegative padding around the output viewport in CSS pixels |
| `IdPrefix` | Empty for the default, or at most 64 ASCII characters: first a letter, then letters/digits/`_`/`-`/`.` |
| `Libraries` | Non-null list of nonblank library names, loaded before source evaluation; supported names are in the compatibility index |

Options/limits are records with `init` properties. Their collection interfaces
do not make caller-owned collections immutable. Keep the source, options,
limits and library collection stable during a call and during any concurrent
calls sharing them. An unknown nonblank library name produces `TIKZ002`;
null/blank entries are caller errors.

## Results, diagnostics and cancellation

`TikzSuccess` contains `Svg`, `PictureBounds`, `InkBounds`, `Diagnostics` and
`Statistics`. Current success diagnostics are empty. Both bounds use CSS-pixel
SVG coordinates, with positive Y downward; an empty bound has `IsEmpty=true`
and zero width/height. Picture bounds and painted-ink bounds are distinct.
The SVG viewport encloses their union plus configured padding; an empty scene
uses a 1×1 pixel viewport.

`TikzFailure` contains diagnostics and partial statistics, has no SVG property
and reports zero `OutputBytes`. Current conversion stops at the first explicit
failure. `MaxDiagnostics` is not a request for recovery or multiple-error
collection. The [diagnostics guide](docs/diagnostics.md) defines `TIKZ001` through
`TIKZ005`, zero-based UTF-16 offsets/lengths, one-based line/column positions
and related original-source locations for bounded expansion.

Null arguments and invalid options throw argument exceptions. Validation runs
before cancellation checking. Cancellation before or during charged work throws
`OperationCanceledException` with the supplied token; it is not a `TikzFailure`
or partial success. Callers should retain cancellation when composing operations.

Statistics report charged `Work`, `Segments`, `Nodes`, `Glyphs`, executed
`LoopIterations` and successful UTF-8 `OutputBytes`. These are implementation work
counters, not counts of source lines, TeX tokens or only visible primitives.
Generated geometry and attached labels consume the same counters as their
corresponding standalone operations.

## Limits and compiler phases

| Limit | Default | Unit |
| --- | ---: | --- |
| `MaxSourceCharacters` | 1,048,576 | Caller-source UTF-16 code units |
| `MaxNesting` | 128 | Supported syntax/evaluation nesting |
| `MaxExpressionDepth` | 64 | Expression depth and bounded operator chains |
| `MaxExpansionDepth` | 64 | Bounded expansion depth |
| `MaxExpandedTokens` | 1,000,000 | Charged generated/replayed source-character units, rather than lexical TeX tokens |
| `MaxLoopIterations` | 100,000 | Executed loop/sample iterations |
| `MaxNodes` | 10,000 | Charged nodes/coordinates, including attached labels |
| `MaxSegments` | 100,000 | Charged path/generated geometry segments |
| `MaxGlyphs` | 100,000 | Layout glyph consumption |
| `MaxWork` | 10,000,000 | Shared charged work |
| `MaxOutputBytes` | 16,777,216 | UTF-8 SVG output bytes |
| `MaxDiagnostics` | 100 | Positive diagnostic cap; current conversion returns its first failure |
| `MaxCoordinatePixels` | 10,000,000 | Finite coordinate/dimension ceiling in CSS pixels |

Source, expansion, loop, node, segment, glyph and work caps may be zero. Depth,
output and diagnostic caps must be positive, and the coordinate ceiling must be
finite and positive. Exceeding a conversion resource produces `TIKZ005`; invalid
caller limits throw before parsing. See [performance measurements](docs/performance.md)
for counter definitions, calibration and provisional latency/allocation goals.
Resource defaults are not a response-time or process-memory guarantee.

The compiler preserves three internal stages:

1. Parse source into a semantic program with original-source locations.
2. Resolve scoped styles/libraries/bindings, measure text and math labels, then
   resolve nodes, paths, connections, clips, arrows, graphic commands and bounds.
3. Serialize the resolved scene to SVG.

One conversion budget/token is shared across these stages, including generated
source and geometry. Label measurement precedes node geometry. Unsupported
constructs fail explicitly; no stage delegates production input to TeX.
These stages are internal implementation boundaries, not additional public APIs.

## SVG and call isolation

Output is self-contained XML with a CSS-pixel viewport. Paths, transforms,
local clipping and embedded glyph-outline definitions reproduce the supported
scene. Labels use local outline references and XML-escaped readable titles;
rendering needs no installed font. Arrows are ordinary lowered paths, rather
than SVG markers. The converter accepts no raw SVG, script, external image or
external-resource injection construct.

Formatting is culture-invariant. Under a fixed library/runtime profile,
identical source/options produce the same SVG, bounds and counters irrespective
of font-cache warm-up. Default IDs use
`t` plus the first sixteen lowercase SHA-256 hex digits of the UTF-8 source,
followed by local definition suffixes. Supply different valid `IdPrefix` values
when embedding multiple identical conversions into one document. Library,
symbol, style, clipping and generated-outline state belongs to each call;
bounded embedded-font caches are shared across calls.

Independent native measurements and primary/PDF comparisons qualify concrete
fixtures under pinned tools, cameras and pixel policies. Some comparisons are
exact; others retain independently calibrated differences from native backends.
The [verification guide](docs/VERIFICATION.md) separates fast iteration from
final qualification. Arbitrary TikZ inputs, arbitrary browser/PDF engines and
every combination of implemented primitives are not inferred from those passes.

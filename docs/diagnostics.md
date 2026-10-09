# Conversion diagnostics

`TikzConverter.Convert` returns `TikzSuccess` with an SVG or `TikzFailure`
with diagnostics. A conversion failure has no SVG and reports zero output
bytes. Syntax errors, unsupported constructs, unresolved names, undefined
calculations and resource limits are ordinary conversion failures.

| Code | Meaning | Example |
| --- | --- | --- |
| `TIKZ001` | Invalid syntax or value | An unclosed group or a negative line width |
| `TIKZ002` | Unsupported construct | `\input`, an unknown key or an unsupported label glyph |
| `TIKZ003` | Unresolved name | A coordinate or numeric variable that has not been defined |
| `TIKZ004` | Undefined calculation or unsupported numeric precision | Division by zero or a noninvertible coordinate frame |
| `TIKZ005` | Conversion resource limit exceeded | Too many segments, excessive work or output beyond the configured byte limit |

Use the diagnostic code for programmatic handling and its message for the
explanation. The current converter stops at the first compilation error.
`Feature` and `RelatedLocations` are available on diagnostics; callers must
allow an empty feature and an empty list of related locations.

## Original source positions

`TikzDiagnostic.Span` points into the exact input string passed to the
converter. `Offset` is zero-based and `Length` counts UTF-16 code units, as
used by .NET string indexing. The range is `[Offset, Offset + Length)`.
Positions are retained through comment handling and label parsing.
Parameterized style arguments retain their original invocation positions through
forwarding. `RelatedLocations` can identify the contributing style definitions
and call sites; template-key failures keep the definition as the primary span.

Bounded `foreach` expansion maps generated parser input back to original list
values and body tokens. Substituted errors can include variable uses/declarations
in `RelatedLocations`; generated integer values point to their original ellipsis
and retain the range seeds and endpoint. Preserve the original input when
displaying these locations.

`Line` and `Column` are one-based. LF starts a new line; CRLF starts a new
line at its LF. Columns count UTF-16 code units, including a tab as one unit.
A supplementary character occupies two units. A lone surrogate retains its
original one-unit position when it is diagnosed. Positions are source indices,
so a caller displaying expanded tabs or grapheme clusters must map those
indices to its own visual columns. The current line counter treats a lone CR
as an ordinary code unit.

For example:

```csharp
using Lokad.TikZ;

var source = "\r\n  \\unsupported";
var options = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody };
var result = TikzConverter.Convert(source, options, CancellationToken.None);

if (result is TikzFailure failure)
{
    var diagnostic = failure.Diagnostics[0];
    // Code: TIKZ002; Span: Offset=4, Length=12, Line=2, Column=3.
    var highlightedSource = source.Substring(diagnostic.Span.Offset, diagnostic.Span.Length);
    // highlightedSource is "\\unsupported".
}
```

Keep the original input when displaying diagnostics. Normalizing newlines or
replacing invalid Unicode before highlighting changes the meaning of offsets.
A zero-length span can identify an insertion point, including the end of input.

## Caller errors and cancellation

Null arguments and invalid conversion options throw argument exceptions.
Cancellation throws `OperationCanceledException` carrying the supplied token.
These are separate from `TikzFailure`; callers should preserve cancellation
when composing conversions with other operations.

The ordinary regression suite checks literal command and label positions with
LF, CRLF, indentation, comments, tabs, supplementary characters and lone high/
low surrogates across `en-US`, `fr-FR`, `tr-TR` and `ar-SA`. Those tests cover
source positions and failure behavior; visual conformance uses its separate
reference harness.

# Lokad.TikZ

Target .NET 10. The production assembly has no package, native, filesystem,
process, network, console, or ambient environment dependency.

Preserve the source-aware semantic program → resolved graphics scene → SVG
pipeline. Unsupported TikZ and TeX constructs fail explicitly; never invoke TeX
as a production fallback. Keep source spans, cancellation, and shared work
budgets through every phase. Measure labels before resolving node geometry.

Run `dotnet test Lokad.TikZ.slnx` for ordinary tests, and explicit Release pack
checks after packaging changes. Live MiKTeX reference generation is separate.
Only trusted repository fixtures may enter the reference engine.

`PLAN.md` is intentionally local and untracked. `external/` contains ignored
reference checkouts and experiments. Neither belongs in commits or packages.
Keep public documentation TikZ-centric and free of private host details.

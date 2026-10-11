# Contributing

Lokad.TikZ targets .NET 10. Start with the [supported contract](docs/compatibility.md)
and [architecture](SPEC.md). The production assembly depends only on .NET;
filesystem, processes, native reference engines, network access and ambient
fonts belong in development tools. Unsupported TikZ/TeX constructs must fail
explicitly, with no runtime TeX fallback.

Name the feature requirement or demonstrated failure before changing code.
Preserve source spans, cancellation and shared work budgets through the semantic
program → measured/resolved graphics scene → SVG pipeline. Measure labels before
node geometry. Add focused checks for distinct mechanisms and use a small complete
diagram to expose interactions with positioning, labels, arrows and calc.

Run ordinary tests and the affected checks during implementation:

```text
dotnet test Lokad.TikZ.slnx
node tools/TikzVisual/verify-adversarial.mjs
node tools/TikzVisual/verify.mjs iterate --feature <affected-feature>
```

Ordinary tests need neither TeX nor a browser. The bounded [adversarial workflow](tools/TikzAdversarial/README.md)
requires .NET and Node built-ins only; it preserves malformed UTF-16 inputs and
checks fresh saved-input replay. The image command needs the pinned development
renderer; available feature selectors, installation and complete-diagram commands
are in the [verification mapping](docs/VERIFICATION.md) and [grounding guide](docs/TESTING.md).
Use only relevant checks during iteration.

At feature completion, run its declared acceptance and fresh-export checks
against the final source. Changes affecting image conversion require the full
diagram qualification command `node tools/TikzVisual/verify.mjs qualify` and
the relevant independent numeric/reference checks. Preserve frozen native
calibration when its inputs, tools and pixel policies are unchanged; always
check fresh converter output. Repeat closed qualification only for a changed
dependency, failed regression or identified coverage gap. Reuse existing artifact,
process and report handling; run identical corruption controls once. Verification
infrastructure must name the acceptance gap it closes.
The adversarial workflow's completion command adds `--controls` for its two
saved-source/result replay failures; ordinary iteration keeps the positive loop.

Run explicit Release packing and the isolated consumer after packaging changes:

```text
dotnet pack src/Lokad.TikZ -c Release --output artifacts/nuget
node tools/TikzPackageCheck/verify.mjs artifacts/nuget --controls
```

Live native reference generation is a separate, explicit development operation.
Only trusted repository fixtures may enter that engine; adversarial and submitted
user inputs must stay in the managed converter. Do not relax pixel policies to
hide a mismatch. Keep original SVG/PDF evidence, local crops, traces and visible
negative controls so a reviewer can inspect the failure.

Describe the concrete behavior change, its bounded compatibility contract and
validation results in the contribution. Keep documentation TikZ-centric, update
the relevant feature guide and changelog, and retain third-party font notices.
`artifacts/`, `external/` and the local `PLAN.md` are excluded from commits and
packages. Hosted CI and publishing are separate from local acceptance.

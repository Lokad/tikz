# Portable straight-edge trial

Run from the repository root:

```text
node tools/TikzVisual/edge-image-cache-self-test.mjs
node tools/TikzVisual/trial-edge-cached.mjs
```

The integrity controls need Node and tracked native evidence. The public trial
also needs .NET 10 and the pinned development browser. Neither command uses TeX
or a PDF executable, and neither needs old `artifacts/` or `external/` folders.

The [tracked cache](../../tests/Reference/Edges/conformance) contains the four
independent primary/PDF qualification and checker reports with their exact
original bytes. All 10,200 original artifacts remain, backed by 4,310 deduplicated
content blobs. Compressed and decoded SHA-256 pins live outside the cache in
`edge-image-cache.mjs`; its four report pins independently prevent replacement
of the underlying evidence. Limits are rederived from original measurements.
Native records are reparsed from the unchanged separate reference snapshot.
No candidate report or image supplies an expected value.

The archive is 55,961,547 bytes compressed and 266,286,932 bytes decoded. This
development fixture stays outside the production library and NuGet package.
Loading checks both digests before accepting data, bounds decompression and blob
sizes, reconciles every required artifact and verifies original source hashes.
The 33 controls reject changed roles, reports, pins, assets, blobs, paths,
rendering identity and qualification sources, including rehashed replacements.

The runner materializes complete original qualification bundles into fresh GUID
directories and owns the [public eight-gate trial](EDGE-TRIAL.md). It then owns
that exact trial's independent checker. Child output identifies both report
paths and hashes; the runner never selects a child through a mutable locator.
Incomplete, mismatched or failed child results fail the command and retain
their logs and partial artifacts. Candidate invocation remains unknown while a
child is running and is taken from the completed child report afterward.

Read the completed report under `artifacts/edge-cached-trial/run-<id>/`. Its
`inputs.trial.report` and `inputs.checker.report` are paths relative to the
repository root, with checked SHA-256 bindings. Open the owned trial's
`index.html` for paired images, raw/amplified differences, overlays, defect
crops, source spans and scene links. Copied child reports and command logs are
also retained in the cached runner's bundle.

The cached runner remains a prospective trial: `approvedImagePolicy: false`,
`imageConformanceClaim: false`, and overall admission pending. Original-driver
diagnostics, the corrected dot reference and reconstructed native-page equality
retain distinct meanings. No image threshold or required view is changed.
The [fixed conformance command](EDGE-CONFORMANCE.md) can admit this exact
corpus through its separately pinned profile and owned proof. Broader TikZ
interactions remain separate work.

Renderer identity retains the original authoritative profile, including its OS
release. An incompatible environment fails; no platform upgrade is inferred
from a successful same-host checkout reproduction. Hosted compatibility and
execution remain pending.

`prepare-edge-image-cache.mjs` is the explicit preparation command for the four
hard-pinned original investigations. It writes a fresh ignored candidate archive
and provenance report. It cannot overwrite the tracked cache or change its
acceptance pins.

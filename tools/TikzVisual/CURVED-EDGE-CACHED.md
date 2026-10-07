# Portable curved-connection trial

Run from the repository root:

```text
node tools/TikzVisual/curved-edge-image-cache-self-test.mjs
node tools/TikzVisual/trial-curved-edge-cached.mjs
```

The integrity controls require Node and tracked native evidence. The public
trial also requires .NET 10 and the pinned development browser. Neither command
uses TeX or a PDF executable, or needs old `artifacts/` or `external/` folders.

The [tracked archive](../../tests/Reference/CurvedEdges/conformance) stores the
four original independent qualification/checker reports as exact byte strings.
All 11,507 artifacts remain, backed by 4,708 deduplicated blobs. Compressed and
decoded SHA-256 pins live in `curved-edge-image-cache.mjs`, outside the archive;
four separate original report pins prevent replacing the underlying evidence.
Policies are rederived from those original measurements, and native records are
reparsed from the unchanged separate snapshot. No candidate report or image
supplies an expected value.

The archive is 85,442,412 bytes compressed and 373,159,037 bytes decoded.
Loading bounds compressed input to 96 MB, decoded JSON to 400 MB and decoded
blobs to 160 MB, then checks the exact required artifact/blob sets and byte
counts. Every source hash is checked before invoking the converter. The 33
controls reject changed roles, reports, pins, artifacts, blobs, paths, renderer
identity and qualification sources, including coherently rehashed replacements.
The new family has its own data bounds; earlier profiles and loaders are fixed.

The runner materializes complete qualifications into fresh GUID directories,
then owns the [public eight-gate trial](CURVED-EDGE-TRIAL.md) and that exact
trial's independent checker. Child stdout identifies the exact report path and
SHA-256; the parent never selects a child through a mutable locator. It checks
roles, exit status, combined verdicts and the checker's complete numeric,
reconstruction and measurement counts. Failed or incomplete children fail the
command while preserving their logs and artifacts. Candidate invocation stays
unknown while the trial is running and is read from its completed report.

Read the completed report under `artifacts/curved-edge-cached-trial/run-<GUID>/`.
Its `inputs.trial.report` and `inputs.checker.report` are repository-relative
paths with checked hashes. Open the owned trial's `index.html` for paired
images, raw/amplified differences, overlays, defect crops, source spans and
scene links. The parent also retains copied child reports and command logs.

The cached runner retains `approvedImagePolicy: false`,
`imageConformanceClaim: false` and overall admission pending. Primary/PDF
calibrated matches and exact reconstructed native-page equality keep their
separate meanings. The curved driver needs no correction. No limit, required
view, region, defect target or visibility declaration changes. Immutable
admission, broader interactions and hosted/release qualification remain work.

Renderer identity retains the original authoritative profile, including the OS
release. An incompatible environment fails; successful reproduction on the same
host does not qualify a platform upgrade or hosted environment.

`prepare-curved-edge-image-cache.mjs` explicitly prepares the four pinned
original investigations. It scans decoded artifact bytes for private host
markers and writes a fresh ignored archive and provenance report. It cannot
overwrite the tracked archive or change its acceptance pins.

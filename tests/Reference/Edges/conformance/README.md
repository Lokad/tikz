# Independent straight-edge image evidence

`qualifications.json.gz` stores complete native-only primary and PDF
qualifications and their independent checkers. The four original report hashes
and every artifact digest are preserved; deduplication changes storage only.
Candidate outputs and candidate-derived thresholds are excluded.

| Property | Value |
| --- | --- |
| Compressed bytes | 55,961,547 |
| Decoded bytes | 266,286,932 |
| Original artifacts | 10,200 |
| Unique content blobs | 4,310 |
| Compressed SHA-256 | `38345002d507eb509e3617475927b86e7df245c2095576b41a924203e156c7fa` |
| Decoded SHA-256 | `630c7b9166c947b1d266df605277fdffa924f1ceef2611a714291138887ff35f` |

The independent [native snapshot](../snapshot.json) and authored
[fixtures](../../../Fixtures/Edges) retain their original provenance. Upstream
fonts keep the attribution and redistribution terms in
[third-party notices](../../../../THIRD-PARTY-NOTICES.md); this cache does not
relicense font resources or generated references.

See [portable trial instructions](../../../../tools/TikzVisual/EDGE-CACHED.md).
This is development evidence, outside the runtime assembly and NuGet package.
Its reports retain unapproved research roles; immutable image admission remains
pending. The consumer pins both archive digests outside this file and validates
the original report/asset bindings before invoking the converter.

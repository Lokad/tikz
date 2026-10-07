# Frozen curved-connection reference

Profile: `pgf-3.1.11a-curved-to-edge-v1`.

The [trusted manifest](cases.json) fixes five independently authored cases:
continuation, styles, coordinates, nodes and clipping. The snapshot records
70 path calls and 66 painted paths. Native generation and cache verification
are described in [the producer documentation](../../../tools/TikzCurvedEdgeReference/README.md).

Each case retains plain/probed SVG, ordinary PDF, 1x/4x PDF pages, native logs,
glyph-position traces, measurements, wrappers/probes and provenance. The six
TFM files share the pinned font profile and existing redistribution notices.
Nothing is measured from Lokad.TikZ output. External consumer pins reject a
silently replaced snapshot even if its internal hashes are recomputed.

The public converter's numeric prototype is described in
[CURVED-EDGES.md](../../../docs/CURVED-EDGES.md). Image inspection is diagnostic;
this snapshot grants no calibrated pixel policy or admission.

# Independent curved-connection glyph reader

```text
dotnet run --project tools/TikzCurvedEdgeOracle -c Release
```

This separate development project has no reference to Lokad.TikZ. It links only
the existing bounded DVI/TFM reader and uses the frozen curved native snapshot,
original SVG definitions and pinned TFM files. The five fixed cases contain ten
glyphs in four nodes. Source/artifact hashes and framework-only assembly
references are checked before completion.

An optional `--out artifacts/...` selects a fresh empty output directory. Reports
retain native inputs, glyph positions, producer/reader sources and assembly
identity. Reading requires .NET 10; it launches no TeX, PDF tool or browser.
The project stays outside the qualification-captured solution and is restored
explicitly in CI. It grants no pixel policy or converter conformance claim.

The [native-only frame and rendering experiment](../TikzVisual/CURVED-EDGE-ORACLE.md)
owns a fresh invocation of this reader. Production glyph resources and candidate
output do not supply expected geometry or positions.

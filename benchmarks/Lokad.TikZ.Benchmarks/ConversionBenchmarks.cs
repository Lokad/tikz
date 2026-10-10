using BenchmarkDotNet.Attributes;

namespace Lokad.TikZ.Benchmarks;

[MemoryDiagnoser]
public class ConversionBenchmarks
{
    [ParamsSource(nameof(Ids))]
    public string Workload { get; set; } = "";

    public IEnumerable<string> Ids => Workloads.Ids;
    private Workload _workload = null!;

    [GlobalSetup]
    public void Setup()
    {
        _workload = Workloads.Load(Workload);
        _workload.Check(_workload.Convert());
    }

    // Setup intentionally warms JIT/fonts and checks admission before timing.
    [Benchmark]
    public TikzConversionResult? Convert() => _workload.Convert();
}

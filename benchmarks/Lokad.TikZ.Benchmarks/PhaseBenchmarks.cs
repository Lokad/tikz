using BenchmarkDotNet.Attributes;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Svg;

namespace Lokad.TikZ.Benchmarks;

[MemoryDiagnoser]
public class PhaseBenchmarks
{
    [ParamsSource(nameof(Ids))]
    public string Workload { get; set; } = "";
    public IEnumerable<string> Ids => Workloads.Ids.Take(10);
    private Workload _workload = null!;
    private Source _source;
    private List<Statement> _program = null!;
    private GraphicsScene _scene = null!;

    [GlobalSetup]
    public void Setup()
    {
        _workload = Workloads.Load(Workload);
        var expected = _workload.Convert();
        _workload.Check(expected);
        _source = new(_workload.Source, 0, _workload.Source.Length);
        _program = (List<Statement>)Parse();
        _scene = (GraphicsScene)Evaluate();
        if (expected is not TikzSuccess success || WriteSvg() != success.Svg)
            throw new InvalidOperationException("Isolated phase output differs from the public converter.");
        // Repeat with the same prepared inputs to reject mutable phase setup.
        _scene = (GraphicsScene)Evaluate();
        if (WriteSvg() != success.Svg) throw new InvalidOperationException("Phase inputs were mutated.");
        if (WriteSvg() != success.Svg) throw new InvalidOperationException("Scene was mutated by serialization.");
    }

    // Each isolated operation includes its fresh budget and phase object.
    // Parsing and resolution needed by later phases happen outside their timers.
    [Benchmark]
    public object Parse() => new Parser(_source, FreshBudget()).Parse(_workload.Options.InputKind);

    // Includes label parsing/layout, outline resolution and node/path geometry.
    [Benchmark]
    public object Evaluate() => new Evaluator(FreshBudget()).Evaluate(_program, _workload.Options);

    [Benchmark]
    public string WriteSvg() => SvgWriter.Write(_scene, _workload.Source, _workload.Options, FreshBudget());

    private Budget FreshBudget() => new(_workload.Options.Limits, CancellationToken.None);
}

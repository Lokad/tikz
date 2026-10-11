using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BenchmarkDotNet.Running;

namespace Lokad.TikZ.Benchmarks;

internal static class Program
{
    public static void Main(string[] args)
    {
        if (args is ["--check-phases"])
        {
            Console.WriteLine(JsonSerializer.Serialize(PerformanceProbes.CheckPhases()));
            return;
        }
        if (args is ["--check-limits"])
        {
            Console.WriteLine(JsonSerializer.Serialize(LimitProbes.Check()));
            return;
        }
        if (args is ["--first-warm", var id, var repeats])
        {
            Console.WriteLine(JsonSerializer.Serialize(PerformanceProbes.FirstAndWarm(id, int.Parse(repeats, System.Globalization.CultureInfo.InvariantCulture))));
            return;
        }
        if (args is ["--cancel-ongoing", var samples])
        {
            Console.WriteLine(JsonSerializer.Serialize(PerformanceProbes.CancelOngoing(int.Parse(samples, System.Globalization.CultureInfo.InvariantCulture))));
            return;
        }
        if (args is ["--check"])
        {
            var records = Workloads.Ids.Select(id =>
            {
                var workload = Workloads.Load(id);
                var result = workload.Convert();
                workload.Check(result);
                return new
                {
                    id, sourceSha256 = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(workload.Source))),
                    sourceCharacters = workload.Source.Length, expected = workload.Expected,
                    result = result is TikzSuccess ? "success" : result is TikzFailure ? "failure" : "cancelled",
                    statistics = result?.Statistics, diagnostics = result?.Diagnostics
                };
            }).ToArray();
            Console.WriteLine(JsonSerializer.Serialize(new { completed = true, workloads = records.Length, records }));
            return;
        }
        BenchmarkSwitcher.FromAssembly(typeof(ConversionBenchmarks).Assembly).Run(args);
    }
}

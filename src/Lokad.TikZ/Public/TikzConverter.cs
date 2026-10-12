using Lokad.TikZ.Frontend;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Svg;

namespace Lokad.TikZ;

/// <summary>Synchronous, in-memory conversion of a bounded TikZ subset to self-contained SVG.</summary>
/// <remarks>
/// Uses only .NET and embedded font data, with no production TeX, filesystem,
/// process, network or console dependency. Concurrent calls keep conversion state
/// local; shared caller options and collections must remain stable.
/// </remarks>
public static class TikzConverter
{
    /// <summary>Parses, resolves and serializes supported source using one shared budget and cancellation token.</summary>
    /// <param name="source">Original source string in the selected input mode.</param>
    /// <param name="options">Explicit input mode, limits and SVG options; see <see cref="TikzOptions.Default"/>.</param>
    /// <param name="cancellationToken">Caller token observed before conversion and during charged work.</param>
    /// <returns>
    /// A <see cref="TikzSuccess"/> with SVG or <see cref="TikzFailure"/> for explicit
    /// syntax, unsupported-feature, name, arithmetic or resource diagnostics.
    /// Failure has no SVG. Current conversion stops at its first explicit failure.
    /// </returns>
    /// <exception cref="ArgumentNullException">Source, options or a required option member is null.</exception>
    /// <exception cref="ArgumentOutOfRangeException">Input mode, padding or resource ceilings are invalid.</exception>
    /// <exception cref="ArgumentException">ID prefix or a library-list entry is invalid.</exception>
    /// <exception cref="OperationCanceledException">Cancellation is requested; the exception carries the supplied token.</exception>
    /// <remarks>
    /// Caller options are validated before cancellation checking. Labels are measured
    /// before node geometry. Unsupported constructs have no native fallback. Output
    /// is culture-invariant under a fixed library/runtime profile; pixel conformance
    /// remains specific to the independently qualified fixtures and renderers.
    /// </remarks>
    public static TikzConversionResult Convert(string source, TikzOptions options, CancellationToken cancellationToken)
        => ConvertWithTrace(source, options, cancellationToken, _ => { });

    internal static TikzConversionResult ConvertWithTrace(string source, TikzOptions options,
        CancellationToken cancellationToken, Action<GraphicsScene> trace)
    {
        ArgumentNullException.ThrowIfNull(source);
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(options.Limits);
        ArgumentNullException.ThrowIfNull(options.Libraries);
        ArgumentNullException.ThrowIfNull(options.IdPrefix);
        ArgumentNullException.ThrowIfNull(trace);
        Validate(options);
        cancellationToken.ThrowIfCancellationRequested();
        var origin = new Source(source, 0, source.Length);
        var budget = new Budget(options.Limits, cancellationToken);
        try
        {
            if (source.Length > options.Limits.MaxSourceCharacters) Budget.Fail(origin.Slice(0, 0), "source characters");
            var program = new Parser(origin, budget).Parse(options.InputKind);
            var scene = new Evaluator(budget).Evaluate(program, options);
            var svg = SvgWriter.Write(scene, source, options, budget, out var outputBytes);
            var result = new TikzSuccess(svg, scene.PictureBounds.Pixels, scene.InkBounds.Pixels,
                Array.Empty<TikzDiagnostic>(), budget.Statistics(outputBytes));
            trace(scene);
            return result;
        }
        catch (CompileError error)
        {
            return new TikzFailure(Array.AsReadOnly(new[] { error.Diagnostic }), budget.Statistics(0));
        }
    }

    private static void Validate(TikzOptions options)
    {
        var l = options.Limits;
        if (!Enum.IsDefined(options.InputKind) || !double.IsFinite(options.PaddingPixels) || options.PaddingPixels < 0
            || l.MaxSourceCharacters < 0 || l.MaxNesting < 1 || l.MaxExpressionDepth < 1 || l.MaxExpansionDepth < 1
            || l.MaxExpandedTokens < 0 || l.MaxLoopIterations < 0 || l.MaxNodes < 0 || l.MaxSegments < 0
            || l.MaxGlyphs < 0 || l.MaxWork < 0 || l.MaxOutputBytes < 1 || l.MaxDiagnostics < 1
            || !double.IsFinite(l.MaxCoordinatePixels) || l.MaxCoordinatePixels <= 0)
            throw new ArgumentOutOfRangeException(nameof(options), "Invalid conversion options or limits.");
        if (options.IdPrefix.Length > 64 || (options.IdPrefix.Length > 0 && !char.IsAsciiLetter(options.IdPrefix[0]))
            || options.IdPrefix.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('_' or '-' or '.')))
            throw new ArgumentException("IdPrefix must be an ASCII XML identifier of at most 64 characters.", nameof(options));
        if (options.Libraries.Any(string.IsNullOrWhiteSpace)) throw new ArgumentException("Invalid library name.", nameof(options));
    }
}

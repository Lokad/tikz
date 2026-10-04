using System.Text;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Svg;

namespace Lokad.TikZ;

public static class TikzConverter
{
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
            var svg = SvgWriter.Write(scene, source, options, budget);
            var result = new TikzSuccess(svg, scene.PictureBounds.Pixels, scene.InkBounds.Pixels,
                Array.Empty<TikzDiagnostic>(), budget.Statistics(Encoding.UTF8.GetByteCount(svg)));
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

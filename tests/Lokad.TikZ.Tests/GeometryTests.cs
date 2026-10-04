using Lokad.TikZ.Geometry;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class GeometryTests
{
    [Fact]
    public void TransformCompositionKeepsTranslationInLocalAxes()
    {
        var matrix = Affine.Rotation(90).Then(Affine.Translation(2, 0));
        var point = matrix.Apply(new Point(1, 0));
        Assert.Equal(0, point.X, 10);
        Assert.Equal(3, point.Y, 10);
    }

    [Fact]
    public void ReflectionAndNonuniformScaleCompose()
    {
        var matrix = Affine.Translation(2, 3).Then(Affine.Scale(-2, 4));
        Assert.Equal(new Point(0, 11), matrix.Apply(new Point(1, 2)));
    }
}

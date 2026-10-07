using System.Xml.Linq;
using TikzDashGeometryReference;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class EmittedSvgTests
{
    [Fact]
    public void SerializedGeometryAndDashDimensionsRecoverNativeEvidence()
    {
        var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures/Dashes/geometry.tikz"));
        var native = DashGeometryEvidence.Parse(source, File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference/DashGeometry/native/svg.log")), false);
        var success = Assert.IsType<TikzSuccess>(TikzConverter.Convert(source, TikzOptions.Default, CancellationToken.None));
        var doc = XDocument.Parse(success.Svg);
        Assert.Equal("xMidYMid meet", doc.Root!.Attribute("preserveAspectRatio")?.Value);
        var paths = doc.Descendants().Where(e => e.Name.LocalName == "path" && !e.Ancestors().Any(a => a.Name.LocalName is "defs" or "clipPath")).ToArray();
        var clips = doc.Descendants().Where(e => e.Name.LocalName == "clipPath").Select(e => e.Descendants().Single(p => p.Name.LocalName == "path")).ToArray();
        Assert.Equal(16, paths.Length); Assert.Equal(3, clips.Length);
        var paints = native.Records.Where(r => r.Actions != "clip").ToArray();
        for (var i = 0; i < paints.Length; i++)
        {
            var actual = EmittedSvgEvidence.Read(paths[i]);
            Assert.Equal(paints[i].Segments, actual.Segments);
            Assert.Equal(paints[i].WidthSp, actual.WidthSp);
            Assert.Equal(paints[i].LengthsSp, actual.DashSp);
            Assert.Equal(paints[i].PhaseSp, actual.PhaseSp);
            Assert.InRange(Math.Abs(actual.ScaleX - 96 / 72.27), 0, 1e-14);
            Assert.Equal(-actual.ScaleX, actual.ScaleY);
        }
        for (var i = 0; i < clips.Length; i++)
            Assert.Equal(native.Records.Where(r => r.Actions == "clip").ElementAt(i).Segments, EmittedSvgEvidence.Read(clips[i]).Segments);
    }

    [Theory]
    [InlineData("missing-transform")]
    [InlineData("ancestor-transform")]
    [InlineData("missing-move")]
    [InlineData("incomplete-cubic")]
    [InlineData("unknown-command")]
    [InlineData("negative-dash")]
    [InlineData("all-zero-dash")]
    [InlineData("overflow-width")]
    [InlineData("nan-width")]
    [InlineData("missing-width")]
    public void InvalidEmittedPrimitivesCannotBecomeNumericEvidence(string mutation)
    {
        var doc = XDocument.Parse("<svg><path transform='scale(1.32835201328352 -1.32835201328352)' d='M0 0L1 0' stroke='#000' stroke-width='1' stroke-dasharray='3 3'/></svg>");
        var path = doc.Root!.Element("path")!;
        switch (mutation)
        {
            case "missing-transform": path.Attribute("transform")!.Remove(); break;
            case "ancestor-transform": doc.Root.SetAttributeValue("transform", "scale(2)"); break;
            case "missing-move": path.SetAttributeValue("d", "L0 0L1 0"); break;
            case "incomplete-cubic": path.SetAttributeValue("d", "M0 0C1 2 3 4"); break;
            case "unknown-command": path.SetAttributeValue("d", "M0 0Q1 2 3 4"); break;
            case "negative-dash": path.SetAttributeValue("stroke-dasharray", "3 -3"); break;
            case "all-zero-dash": path.SetAttributeValue("stroke-dasharray", "0 0"); break;
            case "overflow-width": path.SetAttributeValue("stroke-width", "1e100"); break;
            case "nan-width": path.SetAttributeValue("stroke-width", "NaN"); break;
            case "missing-width": path.Attribute("stroke-width")!.Remove(); break;
        }
        Assert.Throws<InvalidDataException>(() => EmittedSvgEvidence.Read(path));
    }
}

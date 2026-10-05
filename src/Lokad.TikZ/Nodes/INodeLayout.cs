using Lokad.TikZ.Frontend;
using Lokad.TikZ.Geometry;
using Lokad.TikZ.Graphics;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Text;

namespace Lokad.TikZ.Nodes;

internal enum NodeShape { Rectangle, Circle, Ellipse }

internal interface INodeLayout
{
    MeasuredText Text { get; }
    NodeDimensions Dimensions { get; }
    NodePoint Center { get; }
    NodePoint BackgroundSouthWest { get; }
    NodePoint BackgroundNorthEast { get; }
    NodePoint Anchor(string name, NodeFontMetrics context, Budget budget, Source source);
    NodePoint Border(NodePoint direction, Budget budget, Source source);
    GraphicPath Background(Affine transform, Budget budget, Source source);
}

using Lokad.TikZ.Frontend;

namespace Lokad.TikZ.Text;

// Atom classes remain semantic data. Layout corrects binary classes and chooses
// style-dependent spacing without losing the class or source written by the user.
internal enum MathClass { Ordinary, Operator, Binary, Relation, Open, Close, Punctuation, Inner }
internal enum MathFamily { Roman, Italic, Symbol }
internal enum MathAlphabet { Inherit, Roman }
internal sealed record MathList(MathItem[] Items, Source Source);
internal abstract record MathItem(Source Source);
internal abstract record MathAtom(MathClass Class, Source Origin) : MathItem(Origin);
internal sealed record MathGlyph(MathFamily Family, int Slot, bool Alphabetic,
    MathClass AtomClass, Source Origin) : MathAtom(AtomClass, Origin);
internal sealed record MathGroup(MathList Body, MathAlphabet Alphabet, Source Origin)
    : MathAtom(MathClass.Ordinary, Origin);
internal sealed record MathFraction(MathList Numerator, MathList Denominator, Source Origin)
    : MathAtom(MathClass.Inner, Origin);
internal sealed record MathRadical(MathList Radicand, Source Origin)
    : MathAtom(MathClass.Ordinary, Origin);
internal sealed record MathScripts(MathAtom Nucleus, MathList? Superscript, MathList? Subscript,
    Source? SuperscriptMarker, Source? SubscriptMarker, Source Origin) : MathAtom(Nucleus.Class, Origin);
// Native \not= composition must be resolved by layout, rather than a guessed glyph.
internal sealed record MathNegatedEquality(Source Origin) : MathAtom(MathClass.Relation, Origin);
internal sealed record MathSpace(int Mu, Source Origin) : MathItem(Origin);

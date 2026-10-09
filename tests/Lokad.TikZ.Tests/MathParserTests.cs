using System.Text.Json;
using Lokad.TikZ.Frontend;
using Lokad.TikZ.Nodes;
using Lokad.TikZ.Semantics;
using Lokad.TikZ.Text;
using Xunit;

namespace Lokad.TikZ.Tests;

public sealed class MathParserTests
{
    private static readonly TikzOptions Body = TikzOptions.Default with { InputKind = TikzInputKind.PictureBody };

    [Fact]
    public void Every_declared_command_has_the_native_family_slot_and_atom_class()
    {
        // Independently enumerated from the inspected native fontmath declarations.
        var lower = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi chi psi omega varepsilon vartheta varpi varrho varsigma varphi".Split(' ');
        var upper = "Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega".Split(' ');
        var expected = lower.Select((name, i) => (name, family: MathFamily.Italic, slot: i + 11, cls: MathClass.Ordinary, alphabetic: false))
            .Concat(upper.Select((name, i) => (name, MathFamily.Roman, i, MathClass.Ordinary, true)))
            .Concat(new[] {
                ("infty", MathFamily.Symbol, 49, MathClass.Ordinary, false),
                ("cdot", MathFamily.Symbol, 1, MathClass.Binary, false),
                ("times", MathFamily.Symbol, 2, MathClass.Binary, false),
                ("pm", MathFamily.Symbol, 6, MathClass.Binary, false),
                ("mp", MathFamily.Symbol, 7, MathClass.Binary, false),
                ("le", MathFamily.Symbol, 20, MathClass.Relation, false),
                ("leq", MathFamily.Symbol, 20, MathClass.Relation, false),
                ("ge", MathFamily.Symbol, 21, MathClass.Relation, false),
                ("geq", MathFamily.Symbol, 21, MathClass.Relation, false),
                ("to", MathFamily.Symbol, 33, MathClass.Relation, false),
                ("rightarrow", MathFamily.Symbol, 33, MathClass.Relation, false),
                ("leftarrow", MathFamily.Symbol, 32, MathClass.Relation, false),
                ("leftrightarrow", MathFamily.Symbol, 36, MathClass.Relation, false)
            }).ToArray();
        Assert.Equal(53, expected.Length);
        var fonts = new[] { "roman", "italic", "symbol" }.SelectMany(family => new[] { 5, 6, 7, 8, 10, 12 }
            .Select(size => MathFontData.Load($"math-{family}-{size}"))).ToArray();
        foreach (var (name, family, slot, cls, alphabetic) in expected)
        {
            var actual = Assert.IsType<MathGlyph>(Assert.Single(Math(@"$\" + name + "$")));
            Assert.Equal((family, slot, cls, alphabetic), (actual.Family, actual.Slot, actual.Class, actual.Alphabetic));
            Assert.Equal(@"\" + name, actual.Source.Value);
            foreach (var font in fonts.Where(f => f.Id.StartsWith("math-" + family.ToString().ToLowerInvariant() + "-", StringComparison.Ordinal)))
                Assert.Contains(font.Glyphs, g => g.Slot == slot);
        }
        foreach (var command in new[] { "ne", "neq" })
            Assert.Equal(MathClass.Relation, Assert.IsType<MathNegatedEquality>(Assert.Single(Math(@"$\" + command + "$"))).Class);
    }

    [Fact]
    public void Letters_digits_delimiters_and_punctuation_keep_math_encodings_and_classes()
    {
        const string letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        var atoms = Math("$" + letters + "0123456789$").Cast<MathGlyph>().ToArray();
        Assert.Equal(62, atoms.Length);
        foreach (var glyph in atoms)
        {
            Assert.Equal(glyph.Source.Span[0], glyph.Slot);
            Assert.Equal(char.IsAsciiDigit(glyph.Source.Span[0]) ? MathFamily.Roman : MathFamily.Italic, glyph.Family);
            Assert.Equal(MathClass.Ordinary, glyph.Class);
            Assert.True(glyph.Alphabetic);
        }
        atoms = Math("$+-=<>:/ .|()[],$").Cast<MathGlyph>().ToArray();
        Assert.Equal(new[] { 43, 0, 61, 60, 62, 58, 61, 58, 106, 40, 41, 91, 93, 59 }, atoms.Select(g => g.Slot));
        Assert.Equal(new[] { MathClass.Binary, MathClass.Binary, MathClass.Relation, MathClass.Relation, MathClass.Relation,
            MathClass.Relation, MathClass.Ordinary, MathClass.Ordinary, MathClass.Ordinary, MathClass.Open,
            MathClass.Close, MathClass.Open, MathClass.Close, MathClass.Punctuation }, atoms.Select(g => g.Class));
        Assert.All(atoms, g => Assert.False(g.Alphabetic));
        Assert.Equal(MathFamily.Italic, atoms[6].Family); // Native slash is OML, not upright prose.
        Assert.Equal(MathFamily.Italic, atoms[7].Family); // Native decimal point is OML.
    }

    [Fact]
    public void Either_order_scripts_have_one_atom_arguments_and_retain_bases_markers_and_nesting()
    {
        var a = Assert.IsType<MathScripts>(Assert.Single(Math("$x_i^2$")));
        var b = Assert.IsType<MathScripts>(Assert.Single(Math("$x^2_i$")));
        Assert.Equal(Shape(a), Shape(b));
        Assert.Equal("Scripts(Italic:120;super=Roman:50;sub=Italic:105)", Shape(a));
        Assert.Equal("x", a.Nucleus.Source.Value);
        Assert.Equal("x_i^2", a.Source.Value);
        Assert.Equal("^", a.SuperscriptMarker!.Value.Value);
        Assert.Equal("_", a.SubscriptMarker!.Value.Value);
        Assert.Equal("i", a.Subscript!.Source.Value);
        Assert.Equal("Scripts(Italic:120;super=Scripts(Italic:121;super=;sub=Italic:105);sub=)", Shape(Assert.Single(Math("$x^{y_i}$"))));
        Assert.Equal("Scripts(Group(Italic:120,Italic:121);super=;sub=Italic:105)", Shape(Assert.Single(Math("${xy}_i$"))));
        var list = Math("$x^yz$");
        Assert.Equal(2, list.Length); // Unbraced script stops after y; z remains on the outer list.
        Assert.IsType<MathScripts>(list[0]);
        Assert.Equal('z', Assert.IsType<MathGlyph>(list[1]).Slot);
        Assert.Equal("Scripts(Italic:120;super=;sub=)", Shape(Assert.Single(Math("$x^{}_{}$"))));
    }

    [Fact]
    public void Fractions_roots_and_alphabet_groups_retain_their_complete_argument_tree()
    {
        const string label = @"$\frac{x_i^2+1}{\sqrt{y_j}}$";
        var fraction = Assert.IsType<MathFraction>(Assert.Single(Math(label)));
        Assert.Equal(MathClass.Inner, fraction.Class);
        Assert.Equal(@"\frac{x_i^2+1}{\sqrt{y_j}}", fraction.Source.Value);
        Assert.Equal("Scripts(Italic:120;super=Roman:50;sub=Italic:105),Roman:43,Roman:49", ListShape(fraction.Numerator));
        Assert.Equal("Root(Scripts(Italic:121;super=;sub=Italic:106))", ListShape(fraction.Denominator));
        Assert.Equal("Frac(Italic:97;Frac(Italic:98;Italic:99))", Shape(Assert.Single(Math(@"$\frac{a}{\frac{b}{c}}$"))));
        Assert.Equal("Root(Root(Italic:120))", Shape(Assert.Single(Math(@"$\sqrt{\sqrt{x}}$"))));
        var group = Assert.IsType<MathGroup>(Assert.Single(Math(@"$\mathrm{x\alpha+\Gamma}$")));
        Assert.Equal(MathAlphabet.Roman, group.Alphabet);
        var x = Assert.IsType<MathGlyph>(group.Body.Items[0]);
        var alpha = Assert.IsType<MathGlyph>(group.Body.Items[1]);
        var gamma = Assert.IsType<MathGlyph>(group.Body.Items[3]);
        Assert.True(x.Alphabetic); Assert.False(alpha.Alphabetic); Assert.True(gamma.Alphabetic);
        Assert.Equal(MathFamily.Italic, alpha.Family); // A mathord Greek glyph does not change alphabet.
    }

    [Fact]
    public void Math_comments_whitespace_and_control_word_boundaries_preserve_atoms_and_signed_mu()
    {
        var expected = Math(@"$\alpha b+x_i^2\,y\!z\;w$");
        var actual = Math("$ \\alpha% $ } ^ \\input ignored\r\n b + x %comment\r\n _ i ^ 2 \\, y \\! z \\; w $");
        Assert.Equal(expected.Select(Shape), actual.Select(Shape));
        Assert.Equal(new[] { 3, -3, 5 }, actual.OfType<MathSpace>().Select(s => s.Mu));
        Assert.All(actual.OfType<MathSpace>(), s => Assert.Equal(2, s.Source.Length));
        Assert.Empty(Math("$ % nothing\r\n $"));
        Assert.Empty(Math("${}$").OfType<MathGlyph>());
        Assert.Equal("TIKZ002", Assert.Throws<CompileError>(() => Math(@"$\alphab$")).Diagnostic.Code);
    }

    [Fact]
    public void Mixed_math_ends_at_its_delimiter_and_preserves_prose_state_and_escaped_dollars()
    {
        var source = @"Value $x_i$ next $\frac{a}{b}$\$";
        var items = Parse(source);
        Assert.Equal(2, items.OfType<LabelMath>().Count());
        Assert.Equal(new[] { "Value", "next" }, items.OfType<LabelLiteral>().Select(l => l.Source.Value));
        Assert.Equal(3, items.OfType<LabelSpace>().Count());
        Assert.Equal('$', Assert.Single(items.OfType<LabelSymbol>()).Slot);
        Assert.Equal(new[] { "$x_i$", @"$\frac{a}{b}$" }, items.OfType<LabelMath>().Select(m => m.Source.Value));
        var grouped = Assert.IsType<LabelGroup>(Assert.Single(Parse(@"\textit{before $x$ after}")));
        Assert.Single(grouped.Items.OfType<LabelMath>());
    }

    [Theory]
    [InlineData("$", "TIKZ001", 1, 0)]
    [InlineData("$x", "TIKZ001", 2, 0)]
    [InlineData("${x$", "TIKZ001", 3, 1)]
    [InlineData("$x}$", "TIKZ001", 2, 1)]
    [InlineData("$x^$", "TIKZ001", 3, 1)]
    [InlineData("$^2$", "TIKZ001", 1, 1)]
    [InlineData("$x^2^3$", "TIKZ001", 4, 1)]
    [InlineData("$x_i_j$", "TIKZ001", 4, 1)]
    [InlineData("$x^_i$", "TIKZ001", 3, 1)]
    [InlineData(@"$\frac a{b}$", "TIKZ001", 7, 1)]
    [InlineData(@"$\frac{a}$", "TIKZ001", 9, 1)]
    [InlineData(@"$\sqrt x$", "TIKZ001", 7, 1)]
    [InlineData(@"$\mathrm x$", "TIKZ001", 9, 1)]
    [InlineData(@"$\sqrt[3]{x}$", "TIKZ002", 6, 1)]
    [InlineData("$$x$$", "TIKZ002", 0, 2)]
    [InlineData(@"$\left(x\right)$", "TIKZ002", 1, 5)]
    [InlineData(@"$\input{x}$", "TIKZ002", 1, 6)]
    [InlineData(@"$\alphab$", "TIKZ002", 1, 7)]
    [InlineData(@"$x\, ^2$", "TIKZ001", 5, 1)]
    [InlineData(@"$x^\,$", "TIKZ001", 3, 2)]
    [InlineData(@"$\$ $", "TIKZ002", 1, 2)]
    [InlineData("$x\\", "TIKZ001", 2, 1)]
    [InlineData("$x~$", "TIKZ002", 2, 1)]
    [InlineData("$a&b$", "TIKZ002", 2, 1)]
    public void Invalid_math_has_exact_source_diagnostics(string label, string code, int offset, int length)
    {
        var diagnostic = Assert.Throws<CompileError>(() => Parse(label)).Diagnostic;
        Assert.Equal(code, diagnostic.Code);
        Assert.Equal(new TikzSourceSpan(offset, length, 1, offset + 1), diagnostic.Span);
    }

    [Theory]
    [InlineData(@"\input{x}")]
    [InlineData(@"\write18{x}")]
    [InlineData(@"\def\x{x}")]
    [InlineData(@"\sum")]
    [InlineData(@"\text{x}")]
    [InlineData(@"\displaystyle x")]
    [InlineData(@"\mathbf{x}")]
    [InlineData(@"\begin{array}x\end{array}")]
    [InlineData(@"\hat{x}")]
    [InlineData(@"\alphaSuffix")]
    [InlineData("α")]
    [InlineData("*")]
    public void Public_unsupported_math_rejects_at_the_control_or_character_and_emits_no_svg(string unsupported)
    {
        var source = "% \U0001F600\r\n\\node{before $" + unsupported + "$ after};";
        var result = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(result.Diagnostics);
        Assert.Equal("TIKZ002", diagnostic.Code);
        Assert.Equal(source.IndexOf(unsupported, StringComparison.Ordinal), diagnostic.Span.Offset);
        Assert.Equal(2, diagnostic.Span.Line);
        Assert.Equal(0, result.Statistics.OutputBytes);
    }

    [Fact]
    public void Shared_source_work_nesting_and_cancellation_limits_apply_to_math_parsing()
    {
        foreach (var (label, limits) in new[] {
            ("$longIdentifier$", TikzLimits.Default with { MaxWork = 8 }),
            ("$x$", TikzLimits.Default with { MaxSourceCharacters = 2 }),
            ("${x}$", TikzLimits.Default with { MaxNesting = 1 }),
            ("$x^{y_i}$", TikzLimits.Default with { MaxNesting = 2 }),
            ("$" + new string('{', 300) + "x" + new string('}', 300) + "$", TikzLimits.Default)
        }) Assert.Equal("TIKZ005", Assert.Throws<CompileError>(() => Parse(label, limits)).Diagnostic.Code);
        using var cancel = new CancellationTokenSource(); cancel.Cancel();
        Assert.Equal(cancel.Token, Assert.Throws<OperationCanceledException>(() => Parse("$$", cancellation: cancel.Token)).CancellationToken);
    }

    [Fact]
    public void Bound_script_glyphs_retain_original_utf16_spans_and_related_use_sites()
    {
        const string text = "% \U0001F600\r\n1 $x_{\\i}$";
        var source = new Source(text, 0, text.Length);
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var value = source.Slice(text.IndexOf('1'), 1);
        var label = source.Slice(text.IndexOf('$'), text.Length - text.IndexOf('$'));
        var expanded = SourceExpansion.Bind(label, new Dictionary<string, Source> { [@"\i"] = value }, budget);
        var math = Assert.IsType<LabelMath>(Assert.Single(new LabelParser(expanded, budget).Parse()));
        var scripts = Assert.IsType<MathScripts>(Assert.Single(math.Body.Items));
        var glyph = Assert.IsType<MathGlyph>(Assert.Single(scripts.Subscript!.Items));
        Assert.Equal(value.Location, glyph.Source.Location);
        Assert.Contains(glyph.Source.RelatedLocations(), span => span.Offset == text.IndexOf(@"\i", StringComparison.Ordinal));
        Assert.Equal(text.IndexOf('x'), scripts.Nucleus.Source.Location.Offset);
        Assert.Equal("1", glyph.Source.Value);
        Assert.NotNull(glyph.Source.Mapping);
    }

    [Theory]
    [InlineData("MathLabels", "math-label-contract", 26)]
    [InlineData("Diagrams", "network-math-labels", 10)]
    public void Complete_native_corpus_labels_parse_including_loop_expansion(string folder, string id, int count)
    {
        var text = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", folder, id + ".tikz"));
        var source = new Source(text, 0, text.Length);
        var budget = new Budget(TikzLimits.Default, CancellationToken.None);
        var labels = Labels(new Parser(source, budget).Parse(TikzInputKind.Picture), budget).ToArray();
        Assert.Equal(count, labels.Length);
        foreach (var label in labels)
        {
            var math = Assert.Single(new LabelParser(label, budget).Parse().OfType<LabelMath>());
            Assert.Equal('$', math.Source.Span[0]);
            Assert.Equal('$', math.Source.Span[^1]);
            Assert.All(Walk(math.Body), item => {
                Assert.InRange(item.Source.Location.Offset, 0, text.Length - 1);
                Assert.InRange(item.Source.Length, 1, label.Length);
            });
        }
        var references = folder == "Diagrams" ? Path.Combine("Diagrams", id + ".json") : id + ".json";
        using var native = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Reference", "MathLabels", references)));
        Assert.Equal(count, native.RootElement.GetProperty("nodes").GetArrayLength());
        var converted = Assert.IsType<TikzSuccess>(TikzConverter.Convert(text, TikzOptions.Default, CancellationToken.None));
        Assert.Empty(converted.Diagnostics);
        Assert.True(converted.Statistics.OutputBytes > 0);
    }

    [Fact]
    public void Valid_math_converts_and_font_options_stay_strict()
    {
        foreach (var label in new[] { "$x$", @"Before $\sqrt{\frac{a}{b}}$ after", @"\textbf{$x_i^2$}" })
        {
            var result = Assert.IsType<TikzSuccess>(TikzConverter.Convert(@"\node{" + label + "};", Body, CancellationToken.None));
            Assert.Empty(result.Diagnostics);
            Assert.True(result.Statistics.OutputBytes > 0);
        }
        var source = new Source("$x$", 0, 3);
        Assert.Equal("TIKZ002", Assert.Throws<CompileError>(() => NodeSettings.ApplyFont(source, TextFont.Default,
            new(TikzLimits.Default, CancellationToken.None))).Diagnostic.Code);
    }

    [Fact]
    public void Public_script_errors_preserve_foreach_template_locations_and_zero_output()
    {
        const string source = "% \U0001F600\r\n\\foreach \\i in {1,2}{\\node{$x_{\\i}^2^3$};}";
        var result = Assert.IsType<TikzFailure>(TikzConverter.Convert(source, Body, CancellationToken.None));
        var diagnostic = Assert.Single(result.Diagnostics);
        Assert.Equal("TIKZ001", diagnostic.Code);
        Assert.Equal(source.IndexOf("^3", StringComparison.Ordinal), diagnostic.Span.Offset);
        Assert.Equal(1, diagnostic.Span.Length);
        Assert.Equal(2, diagnostic.Span.Line);
        Assert.Equal(0, result.Statistics.OutputBytes);
        result = Assert.IsType<TikzFailure>(TikzConverter.Convert(source,
            Body with { Limits = TikzLimits.Default with { MaxExpandedTokens = 0 } }, CancellationToken.None));
        Assert.Equal("TIKZ005", Assert.Single(result.Diagnostics).Code);
        Assert.Equal(0, result.Statistics.OutputBytes);
    }

    private static List<LabelItem> Parse(string text, TikzLimits? limits = null, CancellationToken cancellation = default)
        => new LabelParser(new(text, 0, text.Length), new(limits ?? TikzLimits.Default, cancellation)).Parse();
    private static MathItem[] Math(string text) => Assert.IsType<LabelMath>(Assert.Single(Parse(text))).Body.Items;
    private static string ListShape(MathList? list) => list is null ? "" : string.Join(',', list.Items.Select(Shape));
    private static string Shape(MathItem item) => item switch {
        MathGlyph g => $"{g.Family}:{g.Slot}", MathSpace s => $"Space({s.Mu})",
        MathGroup g => $"Group({ListShape(g.Body)})", MathFraction f => $"Frac({ListShape(f.Numerator)};{ListShape(f.Denominator)})",
        MathRadical r => $"Root({ListShape(r.Radicand)})",
        MathScripts s => $"Scripts({Shape(s.Nucleus)};super={ListShape(s.Superscript)};sub={ListShape(s.Subscript)})",
        MathNegatedEquality => "NotEqual", _ => throw new InvalidOperationException()
    };
    private static IEnumerable<MathItem> Walk(MathList list)
    {
        foreach (var item in list.Items)
        {
            yield return item;
            var children = item switch {
                MathGroup g => new[] { g.Body }, MathFraction f => [f.Numerator, f.Denominator],
                MathRadical r => [r.Radicand], MathScripts s => new[] { new MathList([s.Nucleus], s.Nucleus.Source), s.Subscript, s.Superscript },
                _ => Array.Empty<MathList?>()
            };
            foreach (var child in children.OfType<MathList>()) foreach (var node in Walk(child)) yield return node;
        }
    }
    private static IEnumerable<Source> Labels(List<Statement> program, Budget budget, IReadOnlyDictionary<string, Source>? bindings = null)
    {
        foreach (var statement in program)
            switch (statement)
            {
                case NodeStatement node: yield return node.Label; break;
                case PathStatement path:
                    foreach (var label in path.Operations.SelectMany(op => op.Labels)) yield return label.Label;
                    break;
                case ScopeStatement scope:
                    foreach (var label in Labels(scope.Body, budget, bindings)) yield return label;
                    break;
                case ForeachStatement loop:
                    foreach (var value in ForeachValues.Read(loop.Values, bindings, budget))
                    {
                        var scoped = bindings is null ? new Dictionary<string, Source>() : new Dictionary<string, Source>(bindings);
                        scoped[loop.Variable.Value] = value;
                        foreach (var label in Labels(new Parser(loop.Body, budget, scoped).Body(0), budget, scoped)) yield return label;
                    }
                    break;
            }
    }
}

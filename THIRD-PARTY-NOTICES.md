# Third-party notices

The library's C# code is MIT licensed. Bundled font data has its own license.

`src/Lokad.TikZ/Resources/Fonts/LokadTikzText-*.json` contains renamed,
generated subsets of Latin Modern font metrics and outlines, copyright
2003–2021 by B. Jackowski and J. M. Nowacki on behalf of TeX Users Groups.
Latin Modern is distributed under the GUST Font License 1.0, which applies
the LaTeX Project Public License 1.3c or later. These generated resources
retain that license; they are not relicensed under MIT.

The derived data is called **LokadTikzText**, with maintenance status
`maintained` and Lokad as its maintainer. It contains EC/Cork text glyphs,
metrics, and pair rules for Latin Modern Roman regular, bold, and italic at
design sizes 10 and 12 TeX points. It does not replace an installed Latin
Modern font. The changes are extraction into JSON, selection of six fonts,
flattening of their kerning/ligature tables, and conversion of their Type 1
outlines into baseline-relative SVG path data with six decimal places.
The same font-derived data appears in the independent metric and atlas
fixtures under `tests/Reference/Fonts/`.

`tests/Reference/NodeShapes/fonts/` also retains two unmodified Latin Modern
TFM files as development reference inputs, under the same GUST/LPPL license.
Their hashes appear in the font profile. They are not included in the NuGet
package; the production converter uses its renamed embedded data only.

The complete unmodified upstream work is available from
[CTAN's Latin Modern archive](https://ctan.org/tex-archive/fonts/lm), including
its [download archive](https://mirrors.ctan.org/fonts/lm.zip), or the
[GUST Latin Modern project](https://www.gust.org.pl/projects/e-foundry/latin-modern).
`tools/TikzFontData/font-profile.json` names and hashes every input used.
The installed upstream README identifies version 2.005 (2021-03-21); its
accompanying manifest identifies 2.004 (2009-10-30). Both files are retained
verbatim and hashed separately rather than treating their version labels as
identical. Their files' content hashes identify the actual inputs.

See the included [GUST Font License](licenses/Fonts/GUST-FONT-LICENSE.txt),
[LPPL 1.3c](licenses/Fonts/LPPL-1.3c.txt),
[upstream README](licenses/Fonts/README-Latin-Modern.txt),
[upstream manifest](licenses/Fonts/MANIFEST-Latin-Modern.txt), and
[derived-work manifest](licenses/Fonts/MANIFEST-LokadTikzText.txt).
Font-related changes and support for these resources are Lokad's
responsibility; no upstream approval or support is implied.

PGF, dvisvgm, MiKTeX, Playwright, and Chromium are development reference
tools. Their implementations are not included in the production assembly or
NuGet package. The C# TFM reader and metrics arithmetic are independently
implemented from the format documented in
[TeX's source](https://github.com/TeX-Live/texlive-source/blob/trunk/texk/web2c/tex.web).

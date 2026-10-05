# Original native font metrics

`ec-lmr10.tfm` and `ec-lmri12.tfm` are unmodified Latin Modern inputs used by
the independent circle/ellipse fixture. Their byte hashes are pinned in
[`font-profile.json`](../../../../tools/TikzFontData/font-profile.json).
The glyph-trace reader verifies them before decoding the width tables.

DVItype records TeX's integer scaled-point advances. dvisvgm advances through
fractional TFM widths. These original files let development tests reconstruct
both positions and check the original driver's six-decimal coordinates
without using the converter's generated metrics or font resources.

These two files retain the [GUST Font License](../../../../licenses/Fonts/GUST-FONT-LICENSE.txt)
and [LPPL](../../../../licenses/Fonts/LPPL-1.3c.txt); they are not MIT licensed.
See [third-party notices](../../../../THIRD-PARTY-NOTICES.md) for copyright,
the complete upstream work, and its original manifest. The raw files are
test/reference inputs only and are not included in the production package.

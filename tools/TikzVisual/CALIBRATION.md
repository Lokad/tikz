# Initial geometry profile

This profile covers the `line-units` fixture, not the full planned TikZ subset.
The primary Chromium comparison requires exact RGBA equality at both 1x and
4x, including transparent, white, and black backgrounds. Repeated captures
must also be identical. Numeric checks have a separate 0.02 CSS pixel bound.

The secondary comparison uses ordinary pdfLaTeX and Poppler 24.04.0, rather
than the dvisvgm driver. Register each image through measured TeX positions.
Crop the PDF on its native pixel lattice and render the SVG at the same page
position. Never interpolate an already rasterized PDF to align it with an
integer picture origin.

On the pinned local toolchain, comparing the **oracle SVG with the oracle PDF**
produced these errors, independently of the converter:

| Scale | Changed pixels | Maximum channel error | Mean foreground error | Maximum edge displacement |
| --- | ---: | ---: | ---: | ---: |
| 1x | 81 | 90 | 18.315 | 1 CSS pixel |
| 4x | 324 | 90 | 5.017 | 0.25 CSS pixels |

The connected foreground component count is one in both routes. These are
cross-renderer antialiasing differences: the edge allowance is one **native
raster pixel**, tightening to 0.25 CSS pixels at 4x. Channel error is bounded
at 128 and mean foreground error at 24. Candidate-versus-PDF errors are
reported alongside oracle-SVG-versus-PDF errors. This suite does not assert
pixel identity between Poppler and Chromium.

All raw differences remain in the reports. Comparator mutation tests must
continue to reject geometry, color, opacity, clipping, and sizing defects.
Adding curves or text requires new independent calibration evidence and a
reviewed profile change; this elementary fixture does not justify broad
antialiasing tolerances for those features.

// Native-reference-only correction for PGF's SVG color cache after label boxes.
// Apply after loading TikZ. Reapply automatic tip fill from PGF's actual stroke
// color; leave explicit arrow fill alone. Production never loads this module.
export const svgDefaultArrowFillWorkaroundKind='pgf-svg-default-arrow-fill-v1';
export const svgDefaultArrowFillWorkaround=String.raw`\makeatletter%
\let\lokadtikz@original@arrowcolorsetup\pgf@arrows@color@setup%
\def\pgf@arrows@color@setup{%
  \lokadtikz@original@arrowcolorsetup%
  \ifx\pgf@arrows@fill@color\pgfutil@empty%
    \pgf@arrows@color@setup@restore@std@colors%
    \pgfsetfillcolor{pgfstrokecolor}%
  \fi%
}%
\makeatother%
`;

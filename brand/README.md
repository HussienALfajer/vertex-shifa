# Brand assets

Single source for the Vertex Shifa brand assets (ADR 0018). Apps and packages reference files from here (the design system reads them at build time or pins its copy with a test); don't keep other copies of the logo in the repository.

Visual identity rules: [identity.md](identity.md).

## Logo files

| Path | Contents | Use |
|---|---|---|
| `logo/svg/vertex-shifa-logo.svg` | Full logo (mark + wordmark), `fill="currentColor"` | UI: inherits text color, works in both themes |
| `logo/svg/vertex-shifa-mark.svg` | Mark only, `currentColor` | App headers, sidebars, loaders |
| `logo/svg/vertex-shifa-{logo,mark}-{green,gold,white}.svg` | Fixed-color variants | Prints, PDFs, anywhere CSS color is unavailable |
| `logo/svg/favicon.svg` | Sand mark on a green rounded square | Browser favicon |
| `logo/png/vertex-shifa-logo-{green,gold,white}.png` | 1024 px, transparent | Tools that don't support SVG |
| `logo/png/vertex-shifa-mark-{green,gold,white}.png` | 512 px, transparent | Same |
| `logo/png/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | Sand mark on a Vertex Green square | Home-screen and app icons (the platform rounds the corners) |

## Provenance

- The logo is the Vertex Hub logo (`D:\vertex-hub\brand\logo\`, traced from the designer's raster at 99.3% pixel overlap) with one change: the knockout word **MEDIA** on the mark's left stroke is replaced by **SHIFA** in the same typeface, tracking and position. The traced MEDIA matches Montserrat Medium, so SHIFA is set in Montserrat Medium (OFL) at the same cap height, baseline and 60° angle, with the same letter gap, centered where MEDIA was. The bottom wordmark "VERTEX" and the strokes are unchanged.
- The PNGs are rendered from the SVGs. When the designer delivers vector originals with SHIFA, replace the SVGs and render the PNGs again.
- The Vertex Media source rasters are not copied: they carry MEDIA.

## Fonts

- Madani Arabic is a commercial font: its files are **never committed** (this repository is public). Until the license and files are provisioned, Arabic renders in Noto Kufi Arabic.
- Montserrat and Noto Kufi Arabic (SIL OFL) come from `@fontsource` packages in `packages/ui`.

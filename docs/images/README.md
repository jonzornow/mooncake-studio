# README comparison images

- `mooncake-baked.png`: the user's real baked mooncake photograph, edited using the built-in image editing tool. Background, framing, white balance and contrast were cleaned up. AI editing can change fine detail; this is an illustrative retouched photo, not dimensional evidence.
- `mooncake-render.png`: an actual Mooncake Studio WebGL capture. No AI image generation was used for this panel.

## Photo edit prompt

Use case: precise-object-edit. Edit target: supplied real baked mooncake photo. Create a restrained cleaned-up documentary product photo for a software README, square image. Preserve EXACT cake, embossed rocket and four cloud scrolls, irregular crumb, cracks, browned top, pale sides, scallops, leaked filling at bottom left, and its exact original camera elevation and orientation. Do not beautify or redesign the cake or invent details. Correct yellow cast gently, moderate noise, improve subtle contrast. Replace distracting decorated plate background with plain light neutral gray matte surface and natural soft contact shadow. Crop/reframe with whole cake centered, occupying about 76 percent of square width and height. No text, no other objects. This is a retouched real-result comparison, fidelity to the baked cake is paramount.

## Reproduce the rendering

Run `npm run build:standalone`, install Playwright Chromium, then run `node scripts/capture-readme.mjs` from the repository root. Optionally set `BROWSER_EXECUTABLE` to an installed Chromium executable. The script changes only its in-memory preview settings, not the app defaults. It captures a 1024 px square with a 36° perspective lens, 48° camera elevation and front-facing azimuth. Camera matching is visual and approximate; there is no camera calibration or recovery of the photographed mold parameters.

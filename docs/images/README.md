# Comparison image notes

- `mooncake-render.png` is a 1024 × 1024 capture of the app's Three.js preview.
- `mooncake-baked.png` is the user's real cake photograph, retouched to remove the distracting plate background and normalize framing, color, and contrast. Fine detail may have changed during retouching, so it is not dimensional evidence.

The two files use equal canvases and closely matched subject scale, crop, viewpoint, and artwork orientation. The README intentionally shows the simulation first.

Recreate the render from `app/` with `node scripts/capture-readme.mjs` after building the standalone app. The capture uses a 36° perspective lens, 48° camera elevation, and front-facing azimuth.

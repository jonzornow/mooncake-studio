# Development

Mooncake Studio is a static Vite application. Three.js renders the preview, Manifold builds watertight geometry in a worker, and all image tracing and STL export happen locally.

## Build and test

Requirements: Node 22.12 or newer, npm, and Python 3.

```sh
cd app
npm ci
npm run build:standalone
npm test
npx playwright install chromium firefox webkit
BROWSER=chromium npm run test:browser
BROWSER=chromium npm run test:mobile
```

`npm run build` creates `app/dist/` for GitHub Pages. `npm run build:standalone` also creates `release/Mooncake-Studio.html`, which embeds the JavaScript, CSS, artwork, worker, WebAssembly, and license notices.

## Browser status

- Chromium and Firefox desktop release tests passed.
- Safari on macOS passed a manual check.
- Chromium touch emulation passed iPhone 13, Pixel 7, and iPad Mini layouts.
- Physical Android and iOS devices remain a manual test item.

The app requires WebGL 2, WebAssembly, workers, Canvas, and native dialogs. On iPhone, use the hosted HTTPS app in Safari; Files and Quick Look may block features used by the standalone HTML.

## Project map

- `src/main.js` — interface, project files, rendering, and exports
- `src/geometry.js` — mold, plate, pusher, relief, and fit geometry
- `src/trace.js` — raster and SVG artwork tracing
- `src/pastry.js` — cosmetic pastry preview
- `src/worker.js` — off-main-thread geometry builds
- `tests/` — geometry, browser, mobile, and standalone checks

Rendering is event-driven and pauses when the view is idle or hidden. Geometry remains computationally intensive when settings change.

## Distribution and licenses

GitHub Actions builds and deploys `app/dist/` to Pages. The root `release/` folder contains the downloadable offline build.

Mooncake Studio is MIT licensed. Third-party license texts are retained in `app/licenses/`. The mold geometry and bundled artwork were created for this project; the referenced MakerWorld model was visual and dimensional inspiration only, and its geometry was not copied.

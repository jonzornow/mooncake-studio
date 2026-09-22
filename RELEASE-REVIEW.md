# Mooncake Studio release-candidate review

Reviewed 20 September 2026. This is a tested release candidate, not a universal compatibility certification. Nothing has been published to GitHub.

## Completed

- Incorporated physical baking feedback: pattern depth defaults to 3.5 mm and design walls have configurable 0–20° draft (6° default). Artwork-preserving draft is enabled by default, retaining the face outline while expanding toward the base; inward taper remains optional. Available margin safely limits/reports the applied draft and edge radius. The successfully tested straight sleeve, clearance and pusher profile are unchanged.
- Made the current artwork thumbnail the primary Edit control beside the camera/view controls. Ambiguous dimensions now have keyboard- and touch-accessible contextual help, including an explicit explanation of artwork size percentage.
- Replaced sidebar/tabs with an artwork-first modal editor and collapsible sections. Removed Snow skin, ink percentage and redundant preview descriptors. Added parchment/serif styling and mobile-sized fields/touch targets.
- Confirmed event-driven rendering: settled desktop view render counts remain unchanged during the idle test. Geometry rebuilding still uses CPU; no thermal measurements on real laptops or phones were made.
- Reviewed file handling and added SVG resource/script screening, decoded-image size checks, project file limits and bounded source names. Large contour bounds no longer use a spread that could exhaust argument limits. Imported legacy Snow skin projects normalize to baked appearance.
- Added a standalone content security policy blocking network fetches. Manifold's generated JavaScript bindings require `unsafe-eval`, in addition to WASM compilation. The policy therefore does not claim strict protection from arbitrary script injection. Artwork labels are inserted as text, and SVG imports are screened and rendered as images.
- Tested the security policy against actual startup; corrected its initial geometry-engine failure. The final Chromium suite passed offline with no HTTP requests and no page errors.
- Verified eight geometry configurations and three invalid settings, closed packed STL meshes, single connected components, fit/retention checks, both polarities, fillet/chamfer, radius limiting and automatic backing at deep relief. Analytical edge-volume and sloped-face tests passed.
- Chromium desktop tests passed: editor and focus return, geometry controls, invalid-input recovery, image tracing, unsafe-SVG rejection, project save/reopen and STL ZIP download.
- Chromium mobile emulation passed iPhone 13, Pixel 7 and iPad Mini presets: touch controls, popup, geometry rebuild, inset swap, download and horizontal-overflow checks. These are Chromium results, including the Apple-named presets.
- Formatted source, synchronized WASM from the lockfile during builds, replaced historical README notes, included dependency licenses (including internmap), and prepared repeatable browser/geometry tests plus GitHub CI.
- Source archive contains an explicit selection of maintained files, not node_modules, personal paths, temporary CAD, old screenshots or obsolete tests. The standalone HTML is included for immediate use.

## Remaining release gates

1. **Browsers/devices:** Chromium and Firefox automation passed on macOS, and the application was manually checked in Safari on macOS. Playwright's frozen macOS 14 WebKit build hangs before creating a blank page, so that automation remains blocked independently of the application. Physical Android/iOS devices remain unverified. Complete BROWSER-COMPATIBILITY.md; emulation cannot establish OS file handling, GPU stability or phone memory use.
2. **Repository destination:** source and CI are prepared, but no repository URL or publication destination has been supplied. CI has not run remotely.

## Practical limits and follow-up work

- The code, documentation and bundled original artwork are now MIT-licensed, copyright 2026 Jonathan Zornow. The channel was independently generated from project parameters; MakerWorld geometry was not downloaded or copied.

- Fillets smooth relief tips/complementary floors only; there is no general CAD edge fillet, perimeter roundover or channel draft. Physical mold-release behavior cannot be certified from mesh validation.
- The application now includes a food-contact warning. It cannot certify filament, printer hardware, coatings, finishing or sanitation practices as food-safe.
- GitHub Pages deployment is provided as a separate static-build workflow. The root standalone HTML remains committed for direct download and offline use; generated dependency/build/test directories remain ignored.
- Artwork tracing has a fixed 384 px resolution. DXF is not accepted directly. Image decoding occurs before the decoded-pixel limit is checked, so that check cannot prevent all memory pressure from hostile or huge compressed images.
- SVG screening is conservative input validation, not a general-purpose sanitizer. A formal penetration test was not performed. The standalone blocks network access; hosted builds require their own hosting headers/policy.
- Four WebGL views remain allocated; only redraws are cached. Memory and active editing cost remain significant on low-end devices. No real-device memory benchmark was available.
- Keyboard upload, modal Escape/focus return and responsive layout were checked. This is not a complete accessibility conformance audit or screen-reader certification.
- Main UI code and CSS still contain legacy layout structure/overrides. Formatting improves readability; a future component/style extraction would improve maintenance. A large release-time rewrite was avoided because it would invalidate tested behavior.
- Dependency audit reported zero known vulnerabilities at review time; this is not proof that none exist. Re-run after dependency updates.

## Reproduction

From the archive: `npm ci`, `npm run build:standalone`, `npm test`. Install Playwright browsers and run `npm run test:browser`, `npm run test:mobile`, and `node tests/hosted-browser.mjs`. Browser selection uses `BROWSER`. Reports are written to `test-results/`; geometry reports to `tests/`. The included workflow repeats the engine matrix on GitHub.

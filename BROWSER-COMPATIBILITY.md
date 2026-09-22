# Browser compatibility — 22 September 2026

| Environment | Result | Evidence and limits |
|---|---|---|
| Chromium 153 on Linux and macOS | Passed | Offline startup, modeling, dialog/focus, image tracing, save/reopen, STL ZIP, error recovery, no idle redraws or network requests |
| Chromium with iPhone 13, Pixel 7 and iPad Mini presets | Passed | Touch editing, geometry rebuild, focus swap, export, no horizontal overflow |
| Firefox 155 on macOS | Passed | Same release-browser workflow passed without page errors or network requests |
| Safari on macOS | Manual check passed | User confirmed the application appeared and behaved normally; this was not the full automated acceptance suite |
| Playwright WebKit on macOS 14 | Blocked | The frozen WebKit build launches but hangs in `browser.newPage()` before Mooncake Studio loads |
| Playwright WebKit on Linux | Blocked | Required GTK/GStreamer libraries were unavailable in the review container |
| Branded Chrome / Edge | Not directly tested | Chromium results are useful engine evidence, not a branded-browser certification |
| Safari on iOS and iPadOS | Not tested on device | Desktop Safari and emulation do not establish mobile file handling, GPU or memory behavior |
| Chrome, Firefox or Samsung Internet on Android | Not tested on device | Chromium emulation does not reproduce mobile GPU, memory limits, OS file picking or downloads |

Playwright emulation changes viewport, touch, user agent and related properties; it does not run the named phone's OS. See [emulation documentation](https://playwright.dev/docs/emulation) and [browser-engine documentation](https://playwright.dev/docs/browsers). An iPhone preset running in Chromium is **not Safari testing**.

## Physical-device acceptance checklist

Test current Safari on iPhone and iPad, Chrome on Android, plus Firefox Android/Samsung Internet if those are supported targets. Record model, OS, browser version, date, URL/file mode and outcome.

1. Load a static HTTPS build. Separately test downloaded HTML if local-file mobile use is promised. A persistent startup message means the preview blocked JavaScript, WebAssembly or its worker; use Safari with the hosted HTTPS URL.
2. Open Edit; scroll every section, change numeric fields using the on-screen keyboard, close it and rotate portrait/landscape. Confirm no clipping or unwanted page zoom.
3. Pick PNG/JPEG/SVG through Photos/Files. Check circular cropping, threshold and broad/thin artwork.
4. Orbit, pinch-zoom, swap all parts into focus; confirm page scrolling remains usable outside the canvas.
5. Test both polarities, fillet/chamfer, deep relief and automatic backing; recover from an invalid setting.
6. Save project and STL ZIP, locate them in the device file manager, reopen the project and inspect STLs in a slicer.
7. Background/resume the page. Leave it idle for a minute; verify rendering counters stop. Try complex artwork and watch for crashes, memory pressure or persistent overheating.

Do not mark a platform supported solely because it passes desktop emulation. GitHub CI has been prepared to repeat engine tests, but has not executed remotely yet.

## How to unblock the remaining tests

The Firefox and WebKit failures recorded above are restrictions of the review container, not configuration changes needed in Mooncake Studio.

On a Mac, extract the source archive and run:

```sh
npm ci
npm run build:standalone
npx playwright install chromium firefox webkit
npm test
BROWSER=chromium npm run test:browser
BROWSER=firefox npm run test:browser
BROWSER=webkit npm run test:browser
BROWSER=chromium npm run test:mobile
BROWSER=webkit npm run test:mobile
```

Unlike Linux CI, macOS normally does not use `playwright install-deps`. Playwright WebKit is valuable compatibility coverage, but it is not the installed Safari application. Test real Safari manually as well.

For a phone on the same Wi-Fi network, build the static version and serve it from the Mac:

```sh
npm run build
python3 -m http.server 4173 --directory dist --bind 0.0.0.0
ipconfig getifaddr en0
```

Open `http://MAC_IP_ADDRESS:4173/` on the phone. Keep the Terminal window open and allow the incoming connection if macOS asks. Use the physical-device checklist above. Hosting `dist/` with GitHub Pages is the easier repeatable test and avoids relying on a phone's limited local-file preview.

After publishing the repository, enable GitHub Actions and run the included **Release checks** workflow. It installs the Linux browser dependencies that were unavailable in the review container and tests Chromium, Firefox and WebKit automatically. Passing CI still does not replace the real Safari/iOS and Chrome/Android checks.

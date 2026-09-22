import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";

// Run after build:standalone. Camera matching is approximate, not calibration.
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || undefined,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 1024 },
    deviceScaleFactor: 1,
  });
  await page.goto(
    pathToFileURL(resolve("../release/Mooncake-Studio.html")).href,
  );
  await page.waitForFunction(() => window.__studioResult, null, {
    timeout: 120000,
  });
  await page.evaluate(() => {
    window.__studio.setParams({ cakeHeight: 23, relief: 1.5, rotation: -18 });
  });
  await page.waitForFunction(
    () => !document.querySelector("#all-stl").disabled,
    null,
    { timeout: 120000 },
  );
  await page.addStyleTag({
    content: `body > * { visibility: hidden !important; } #hero, #hero * { visibility: visible !important; } #hero { position: fixed !important; inset: 0 !important; width: 1024px !important; height: 1024px !important; background: #eeeeee !important; border-radius: 0 !important; z-index: 9999; }`,
  });
  await page.evaluate(() =>
    window.__studio.setPreviewCamera({
      azimuth: 0,
      elevation: 48,
      distance: 105,
    }),
  );
  await page.waitForTimeout(1500);
  mkdirSync("../docs/images", { recursive: true });
  await page
    .locator("#hero")
    .screenshot({ path: "../docs/images/mooncake-render.png" });
} finally {
  await browser.close();
}

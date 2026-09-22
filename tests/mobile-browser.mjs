import { chromium, webkit, devices } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const engine = process.env.BROWSER || "chromium";
const report = {
  engine,
  mode: "touch emulation, not physical devices",
  checks: [],
};
let browser;
try {
  browser = await { chromium, webkit }[engine].launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE
      ? { executablePath: process.env.BROWSER_EXECUTABLE }
      : {}),
    ...(engine === "chromium"
      ? {
          args: [
            "--no-sandbox",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
          ],
        }
      : {}),
    env: { ...process.env },
  });
  report.version = browser.version();
  for (const device of ["iPhone 13", "Pixel 7", "iPad Mini"]) {
    const context = await browser.newContext({
      ...devices[device],
      offline: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(pathToFileURL(resolve("Mooncake-Studio.html")).href);
    await page.waitForFunction(
      () => !document.querySelector("#all-stl").disabled,
      null,
      { timeout: 120000 },
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.locator("#edit-design").tap();
    assert(await page.locator("#editor").isVisible());
    await page.locator("#relief-panel > summary").tap();
    await page.locator("[data-finish=chamfer]").tap();
    await page.waitForFunction(
      () =>
        !document.querySelector("#all-stl").disabled &&
        window.__studioResult.finish.type === "chamfer",
      null,
      { timeout: 120000 },
    );
    await page.screenshot({
      path: `test-results/${engine}-${device.replaceAll(" ", "-")}-editor.png`,
    });
    await page.locator("#close-editor").tap();
    await page.locator("#plate-view").tap();
    assert.equal(
      await page.locator(".pastry-stage > .hero").getAttribute("id"),
      "plate-view",
    );
    const download = page.waitForEvent("download");
    await page.locator("#all-stl").tap();
    assert((await download).suggestedFilename().endsWith(".zip"));
    await page.screenshot({
      path: `test-results/${engine}-${device.replaceAll(" ", "-")}.png`,
    });
    assert.deepEqual(errors, []);
    report.checks.push(
      `${device}: layout, touch editing, geometry, focus swap, export`,
    );
    await context.close();
  }
  report.status = "passed";
} catch (e) {
  report.status = "failed";
  report.failure = String(e.stack || e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync(
    `test-results/${engine}-mobile.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(report);
}

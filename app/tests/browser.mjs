import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
  ],
  { stdio: "pipe" },
);
await new Promise((r) =>
  server.stdout.on("data", (d) => {
    if (d.toString().includes("Local:")) r();
  }),
);
let browser;
const errors = [],
  remote = [];
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) => {
    if (
      /^https?:/.test(route.request().url()) &&
      !route.request().url().startsWith("http://127.0.0.1:5173/")
    ) {
      remote.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  async function ready() {
    await page.waitForFunction(
      () =>
        !document.querySelector("#all-stl").disabled ||
        document.querySelector("#status").classList.contains("error"),
      null,
      { timeout: 120000 },
    );
    const status = await page.locator("#status").textContent();
    assert(status.startsWith("Ready"), status);
    return status;
  }
  await page.goto("http://127.0.0.1:5173/");
  console.log("DEFAULT", await ready());
  await page.screenshot({ path: "preview.png", fullPage: true });
  const paths = await page.evaluate(() => window.__studio.paths);
  await fs.writeFile("tests/rocket-paths.json", JSON.stringify(paths));
  async function download(button, path) {
    const promise = page.waitForEvent("download");
    await page.click(button);
    await (await promise).saveAs(path);
  }
  await download("#all-stl", "tests/browser-mold-set.zip");
  await download("#save", "tests/saved-project.json");
  await page.locator("input[type=number][data-key=diameter]").fill("5");
  assert(await page.locator("#all-stl").isDisabled());
  await page.locator("input[type=number][data-key=diameter]").fill("45");
  await ready();
  await page.evaluate(() =>
    window.__studio.setParams({
      polarity: "recessed",
      finish: "chamfer",
      style: "petal",
      lobes: 8,
      scallop: 2.5,
      opening: 32,
      artScale: 70,
    }),
  );
  console.log("VARIANT", await ready());
  await page.screenshot({ path: "variant-preview.png", fullPage: true });
  await download("#all-stl", "tests/browser-petal-set.zip");
  await page.locator("#project-file").setInputFiles("tests/saved-project.json");
  await page.waitForFunction(() => window.__studio.params.style === "classic");
  await ready();
  assert.equal(
    await page.evaluate(() => window.__studio.params.polarity),
    "raised",
  );
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const x = c.getContext("2d");
    x.fillStyle = "white";
    x.fillRect(0, 0, 256, 256);
    x.fillStyle = "black";
    x.beginPath();
    x.arc(128, 128, 90, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "white";
    x.beginPath();
    x.arc(128, 128, 55, 0, Math.PI * 2);
    x.fill();
    return c.toDataURL().split(",")[1];
  });
  await page.locator("#image-file").setInputFiles({
    name: "ring.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page.waitForFunction(
    () => document.querySelector("#source-name").textContent === "ring",
  );
  console.log("PNG", await ready());
  assert.equal(await page.evaluate(() => window.__studio.paths.length), 2);
  assert.deepEqual(errors, []);
  assert.deepEqual(remote, []);
  await fs.writeFile(
    "tests/browser-validation.json",
    JSON.stringify(
      {
        productionBuild: true,
        defaultExport: true,
        petalRecessedChamferExport: true,
        invalidDimensionBlocksExport: true,
        projectRoundTrip: true,
        pngTracePreservesHole: true,
        externalRequests: remote,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log("Browser checks passed, including offline-only requests.");
} finally {
  if (browser) await browser.close();
  server.kill();
}

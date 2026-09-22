import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
const location = "/tmp/mooncake-isolated.html";
await fs.copyFile("../release/Mooncake-Studio.html", location);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const context = await browser.newContext({
    offline: true,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage(),
    errors = [],
    network = [];
  context.on("request", (r) => {
    if (/^https?:/.test(r.url())) network.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("console:", m.text());
  });
  async function ready() {
    await page.waitForFunction(
      () =>
        !document.querySelector("#all-stl").disabled ||
        document.querySelector("#status").classList.contains("error"),
      null,
      { timeout: 90000 },
    );
    const s = await page.locator("#status").textContent();
    assert(s.startsWith("Ready"), s);
    console.log(s);
  }
  await page.goto(pathToFileURL(location).href);
  await ready();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "tests/standalone-preview.png" });
  async function download(selector, path) {
    const d = page.waitForEvent("download");
    await page.click(selector);
    await (await d).saveAs(path);
  }
  await download("#all-stl", "tests/standalone-mold-set.zip");
  await download("#save", "tests/standalone-project.json");
  await page.selectOption("#polarity", "recessed");
  await ready();
  await page
    .locator("#project-file")
    .setInputFiles("tests/standalone-project.json");
  await page.waitForFunction(
    () => window.__studio.params.polarity === "raised",
  );
  await ready();
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d");
    x.fillStyle = "white";
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = "black";
    x.beginPath();
    x.arc(64, 64, 45, 0, 7);
    x.fill();
    return c.toDataURL().split(",")[1];
  });
  await page.locator("#image-file").setInputFiles({
    name: "circle.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page.waitForFunction(
    () => document.querySelector("#source-name").textContent === "circle",
  );
  await ready();
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  const result = {
    fileProtocol: true,
    isolatedHTML: true,
    offline: true,
    server: false,
    defaultBuild: true,
    polarityChange: true,
    stlZIPDownload: true,
    projectSaveOpen: true,
    pngUploadTrace: true,
    pageErrors: errors,
    networkRequests: network,
  };
  await fs.writeFile(
    "tests/standalone-validation.json",
    JSON.stringify(result, null, 2),
  );
  console.log("Standalone checks passed.");
} finally {
  await browser.close();
}

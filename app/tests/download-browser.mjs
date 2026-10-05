import { chromium, firefox, webkit } from "@playwright/test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { unzipSync, strFromU8 } from "fflate";

const engine = process.env.BROWSER || "chromium";
const browser = await { chromium, firefox, webkit }[engine].launch({
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
});
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    offline: true,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    });
    window.shareMode = "success";
    window.sharedFiles = [];
    Object.defineProperty(navigator, "canShare", {
      value: ({ files }) =>
        window.shareMode !== "unsupported" &&
        (window.shareMode !== "zip-only" ||
          files[0].type === "application/zip"),
    });
    Object.defineProperty(navigator, "share", {
      value: async ({ files }) => {
        if (window.shareMode === "cancel")
          throw new DOMException("Cancelled", "AbortError");
        if (window.shareMode === "error")
          throw new DOMException("Blocked", "NotAllowedError");
        window.sharedFiles.push({
          name: files[0].name,
          type: files[0].type,
          bytes: Array.from(new Uint8Array(await files[0].arrayBuffer())),
        });
      },
    });
  });
  await page.goto(
    pathToFileURL(resolve("../release/Mooncake-Studio.html")).href,
  );
  await page.waitForFunction(
    () => !document.querySelector("#all-stl").disabled,
    null,
    { timeout: 120000 },
  );

  // A modified project must remain dirty after cancelling or failing a save.
  await page.locator("#edit-design").click();
  await page.locator("#drawing-clear").click();
  await page.locator("#close-editor").click();
  await page.waitForFunction(
    () => window.__studio.dirty && !document.querySelector("#all-stl").disabled,
    null,
    { timeout: 120000 },
  );
  for (const mode of ["cancel", "error", "unsupported"]) {
    await page.evaluate((mode) => {
      window.shareMode = mode;
    }, mode);
    await page.locator("#save").click();
    await page.locator("#file-save-dialog").waitFor();
    if (mode === "unsupported") {
      assert.equal(await page.locator("[data-file-share]").isVisible(), false);
      assert.equal(
        JSON.parse(
          await page
            .locator("[aria-label='Project recovery text']")
            .inputValue(),
        ).format,
        "mooncake-studio",
      );
      await page
        .locator("#file-save-dialog")
        .screenshot({ path: "test-results/iphone-save-fallback.png" });
      const download = page.waitForEvent("download");
      await page.locator("[data-file-download]").click();
      assert.equal(
        (await download).suggestedFilename(),
        "mooncake-project.json",
      );
    } else {
      await page.locator("[data-file-share]").click();
      await page.waitForFunction(
        () => !document.querySelector("[data-file-share]").disabled,
      );
      assert.match(
        await page.locator(".file-save-message").textContent(),
        mode === "cancel" ? /cancelled/ : /could not share/,
      );
    }
    await page.locator("[data-file-close]").click();
    assert.equal(await page.evaluate(() => window.__studio.dirty), true);
  }

  await page.evaluate(() => {
    window.shareMode = "success";
  });
  await page.locator("#save").click();
  await page.locator("[data-file-share]").click();
  await page.waitForFunction(
    () =>
      !document.querySelector("#file-save-dialog") && !window.__studio.dirty,
  );
  let saved = await page.evaluate(() => window.sharedFiles.at(-1));
  assert.equal(saved.name, "mooncake-project.json");
  assert.equal(
    JSON.parse(strFromU8(new Uint8Array(saved.bytes))).format,
    "mooncake-studio",
  );

  await page.locator("#all-stl").click();
  await page.locator("[data-file-share]").click();
  await page.waitForFunction(
    () => !document.querySelector("#file-save-dialog"),
  );
  saved = await page.evaluate(() => window.sharedFiles.at(-1));
  assert.equal(saved.type, "application/zip");
  assert(
    unzipSync(new Uint8Array(saved.bytes))["mooncake-plate.stl"].length > 84,
  );

  // The single-STL controls may be inside the export menu on mobile.
  await page.evaluate(() =>
    document.querySelector('[data-export="plate"]').click(),
  );
  await page.locator("[data-file-share]").click();
  await page.waitForFunction(
    () => !document.querySelector("#file-save-dialog"),
  );
  saved = await page.evaluate(() => window.sharedFiles.at(-1));
  assert.equal(saved.name, "mooncake-plate.stl");
  assert(saved.bytes.length > 84);

  await page.evaluate(() => {
    window.shareMode = "zip-only";
    document.querySelector('[data-export="plate"]').click();
  });
  await page.locator("[data-file-share]").click();
  await page.waitForFunction(
    () => !document.querySelector("#file-save-dialog"),
  );
  saved = await page.evaluate(() => window.sharedFiles.at(-1));
  assert.equal(saved.name, "mooncake-plate.stl.zip");
  assert(
    unzipSync(new Uint8Array(saved.bytes))["mooncake-plate.stl"].length > 84,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS iOS save flow with mocked sharing: project, ZIP, STL, ZIP fallback, cancellation, failure and recovery text. Physical device verification still required.",
  );
} finally {
  await browser.close();
}

import { chromium, firefox, webkit } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const engine = process.env.BROWSER || "chromium";
const report = {
  engine,
  date: new Date().toISOString(),
  checks: [],
  errors: [],
};
fs.mkdirSync("test-results", { recursive: true });
let browser;
try {
  browser = await { chromium, firefox, webkit }[engine].launch({
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
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    offline: true,
  });
  page.on("pageerror", (e) => report.errors.push(e.message));
  const requests = [];
  page.on("request", (r) => {
    if (/^https?:/.test(r.url())) requests.push(r.url());
  });
  await page.goto(pathToFileURL(resolve("Mooncake-Studio.html")).href);
  const ready = () =>
    page.waitForFunction(
      () => !document.querySelector("#all-stl").disabled,
      null,
      { timeout: 120000 },
    );
  await ready();
  report.checks.push("offline file:// startup and geometry");
  assert.equal(await page.locator("#startup-fallback").count(), 0);
  assert.equal(
    await page
      .locator("#volume-metric")
      .locator("xpath=following-sibling::span")
      .textContent(),
    "Cake volume",
  );
  assert.match(await page.locator("#volume-metric").textContent(), /^\d+ ml$/);
  assert.match(
    await page.locator(".food-safety").textContent(),
    /^Food-safety warning:/,
  );
  assert.equal(
    await page.locator('[data-key="relief"]').first().inputValue(),
    "3.5",
  );
  assert.equal(
    await page.locator('[data-key="draft"]').first().inputValue(),
    "6",
  );
  assert.equal(await page.locator("#preserve-artwork").isChecked(), true);
  assert(
    Math.abs(
      (await page.evaluate(() => window.__studioResult.finish.draftApplied)) -
        6,
    ) < 0.01,
  );
  assert.equal(
    await page.locator("#material,#ink-metric,#cake-sub,.mobile-nav").count(),
    0,
  );
  assert.equal(
    await page.locator(".view-buttons > .edit-cluster > #edit-design").count(),
    1,
  );
  assert(await page.locator("#edit-design img").isVisible());
  assert.equal(await page.locator("#edit-design").textContent(), "Edit Cake");
  assert.equal(await page.locator("#height-metric").count(), 0);
  assert.equal(
    await page
      .locator("#width-metric")
      .locator("xpath=following-sibling::span")
      .textContent(),
    "Cake width",
  );
  assert.equal(await page.locator("#help").textContent(), "?");
  assert.equal(await page.locator(".guide-recipe").count(), 1);
  assert.match(
    await page.locator(".guide-recipe").textContent(),
    /22 g pastry \+ 28 g filling/,
  );
  assert.match(
    await page.locator(".guide-recipe").textContent(),
    /Leanne Mai-ly Hilgart/,
  );
  assert.equal(await page.locator(".project-actions > #save").count(), 1);
  assert.equal(await page.locator(".project-actions > #open").count(), 1);
  assert((await page.locator(".help-tip").count()) >= 12);
  await page.waitForFunction(() =>
    Object.values(window.__studio.renderStats).every(
      (v) => v.renders > 0 && !v.pending && !v.dirty,
    ),
  );
  const counts = () =>
    page.evaluate(() =>
      Object.fromEntries(
        Object.entries(window.__studio.renderStats).map(([k, v]) => [
          k,
          v.renders,
        ]),
      ),
    );
  const before = await counts();
  await page.waitForTimeout(1200);
  assert.deepEqual(await counts(), before);
  report.checks.push("no idle renders");
  await page.screenshot({ path: `test-results/${engine}-desktop.png` });
  await page.locator("#edit-design").click();
  assert(await page.locator("#editor").isVisible());
  assert.equal(
    await page.locator("#editor .control-panel").first().getAttribute("id"),
    "art-panel",
  );
  await page.locator('[data-key="artScale"]').first().focus();
  await page.locator('[data-key="artScale"]').first().press("Shift+Tab");
  assert.equal(await page.locator(".help-tip:focus").count(), 1);
  await page.waitForTimeout(300);
  assert.equal(
    await page
      .locator(".help-tip:focus")
      .evaluate((element) => getComputedStyle(element, "::after").visibility),
    "visible",
  );
  await page.screenshot({ path: `test-results/${engine}-editor.png` });
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#editor").isVisible(), false);
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "edit-design",
  );
  report.checks.push("modal artwork-first, Escape and focus return");
  await page.locator("#edit-design").click();
  await page.locator("#relief-panel > summary").click();
  await page.locator("[data-finish=chamfer]").click();
  await page.locator('input[type=number][data-key="draft"]').fill("8");
  await page.waitForFunction(
    () =>
      !document.querySelector("#all-stl").disabled &&
      window.__studioResult.finish.type === "chamfer" &&
      window.__studioResult.finish.draftRequested === 8,
    null,
    { timeout: 120000 },
  );
  const preservedVolume = await page.evaluate(
    () => window.__studioResult.meshes.cake.volume,
  );
  await page.locator("#preserve-artwork").uncheck();
  await ready();
  assert(
    (await page.evaluate(() => window.__studioResult.meshes.cake.volume)) <
      preservedVolume,
  );
  await page.locator("#preserve-artwork").check();
  await ready();
  await page.locator("input[type=number][data-key=relief]").fill("9");
  assert(await page.locator("#design-status").isVisible());
  await page.locator("input[type=number][data-key=relief]").fill("2.5");
  await ready();
  assert.equal(
    await page.evaluate(() => window.__studioResult.effectiveBacking),
    4,
  );
  report.checks.push(
    "outward artwork-preserving draft, edge controls, invalid-input recovery and automatic plate thickness",
  );
  await page.locator("#inspect-edges").click();
  assert.equal(await page.locator("#editor").isVisible(), false);
  assert.equal(
    await page.locator(".pastry-stage > .hero").getAttribute("id"),
    "plate-view",
  );
  const save = page.waitForEvent("download");
  await page.locator("#save").click();
  const saved = await save;
  const projectPath = `test-results/${engine}-project.json`;
  await saved.saveAs(projectPath);
  await page.locator("#project-file").setInputFiles(projectPath);
  await ready();
  report.checks.push("project save and reopen");
  assert.equal(await page.evaluate(() => window.__studio.dirty), false);
  await page.locator("#help").click();
  assert.equal(await page.locator("[data-traditional-style]").count(), 4);
  await page.locator("[data-traditional-style=lotus]").click();
  await page.waitForFunction(
    () => document.querySelector("#source-name").textContent === "Lotus garden",
  );
  await ready();
  assert.equal(
    await page.evaluate(() => window.__studio.sourceKind),
    "traditional:lotus",
  );
  report.checks.push("traditional artwork library");
  await page.locator("#edit-design").click();
  assert.equal(await page.locator("[data-art-choice]").count(), 6);
  if (!(await page.locator("#art-panel").evaluate((el) => el.open)))
    await page.locator("#art-panel > summary").click();
  await page
    .locator(".edit-art-library")
    .screenshot({ path: `test-results/${engine}-art-library.png` });
  let templatePrompted = false;
  const templateDialog = async (dialog) => {
    templatePrompted = true;
    await dialog.dismiss();
  };
  page.on("dialog", templateDialog);
  for (const id of ["peony", "longevity", "happiness", "rocket"]) {
    await page.locator(`[data-art-choice=${id}]`).click();
    await page.waitForFunction(
      (id) =>
        window.__studio.sourceKind ===
        (id === "rocket" ? "builtin" : `traditional:${id}`),
      id,
    );
    await ready();
    assert.equal(
      await page
        .locator(`[data-art-choice=${id}]`)
        .getAttribute("aria-pressed"),
      "true",
    );
  }
  const chooser = page.waitForEvent("filechooser");
  await page.locator("[data-art-choice=custom]").click();
  await chooser;
  page.off("dialog", templateDialog);
  assert.equal(templatePrompted, false);
  assert.equal(
    await page.evaluate(() => window.__studio.sourceKind),
    "builtin",
  );
  await page.locator("#close-editor").click();
  report.checks.push(
    "Edit library: all five SVGs generate, selected states, templates never prompt",
  );
  const dl = page.waitForEvent("download");
  await page.locator("#all-stl").click();
  const download = await dl;
  await download.saveAs(`test-results/${engine}-molds.zip`);
  assert(fs.statSync(`test-results/${engine}-molds.zip`).size > 1000);
  report.checks.push("STL set download");
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 240;
    c.height = 120;
    const x = c.getContext("2d");
    x.fillStyle = "white";
    x.fillRect(0, 0, 240, 120);
    x.fillStyle = "black";
    x.beginPath();
    x.arc(120, 60, 40, 0, Math.PI * 2);
    x.fill();
    return c.toDataURL().split(",")[1];
  });
  await page.locator("#image-file").setInputFiles({
    name: "test.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page.waitForFunction(
    () => document.querySelector("#source-name").textContent === "test",
  );
  await ready();
  report.checks.push("raster upload and tracing");
  assert.equal(await page.evaluate(() => window.__studio.sourceKind), "custom");
  await page.locator("#help").click();
  let replacementPrompt = false;
  page.once("dialog", async (dialog) => {
    replacementPrompt = true;
    assert.match(dialog.message(), /Replace the current artwork/);
    await dialog.dismiss();
  });
  await page.locator("[data-traditional-style=peony]").click();
  assert(replacementPrompt);
  assert.equal(await page.locator("#source-name").textContent(), "test");
  await page.locator("#guide .close").click();
  let openPrompt = false;
  page.once("dialog", async (dialog) => {
    openPrompt = true;
    assert.match(dialog.message(), /Open another project/);
    await dialog.dismiss();
  });
  await page.locator("#open").click();
  assert(openPrompt);
  assert.equal(
    await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
    true,
  );
  report.checks.push("unsaved custom artwork safeguards");
  await page.locator("#image-file").setInputFiles({
    name: "unsafe.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>',
    ),
  });
  await page.waitForFunction(() =>
    document.querySelector("#status").classList.contains("error"),
  );
  assert(await page.locator("#all-stl").isDisabled());
  report.checks.push("external SVG resources rejected");
  await page.locator("#project-file").setInputFiles(projectPath);
  await ready();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `test-results/${engine}-mobile.png` });
  await page.locator("#edit-design").click();
  await page.locator("#art-panel > summary").click();
  await page.screenshot({ path: `test-results/${engine}-mobile-editor.png` });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.locator("#close-editor").click();
  report.checks.push("mobile popup and no horizontal overflow");
  assert.deepEqual(report.errors, []);
  assert.deepEqual(requests, []);
  report.checks.push("no page errors or HTTP requests");
  const blockedPreview = await browser.newPage({
    viewport: { width: 390, height: 844 },
    javaScriptEnabled: false,
    offline: true,
  });
  await blockedPreview.goto(
    pathToFileURL(resolve("Mooncake-Studio.html")).href,
  );
  assert.match(
    await blockedPreview.locator("#startup-fallback").first().textContent(),
    /open the hosted HTTPS version in Safari/i,
  );
  await blockedPreview.close();
  report.checks.push("static guidance when scripting is blocked");
  report.status = "passed";
} catch (e) {
  report.status = "failed";
  report.failure = String(e.stack || e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  fs.writeFileSync(
    `test-results/${engine}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}

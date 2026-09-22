import { pastryGeometry, pastryMaterial } from "./pastry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { zipSync, strToU8 } from "fflate";
import { defaults, profile } from "./geometry.js";
import { loadImage, traceImage, svgFor, validateSVG } from "./trace.js";
import lotusSvg from "./art/lotus.svg?raw";
import peonySvg from "./art/peony.svg?raw";
import longevitySvg from "./art/longevity.svg?raw";
import doubleHappinessSvg from "./art/double-happiness.svg?raw";
let params = { ...defaults },
  paths = [],
  sourceImage = null,
  cropPhoto = false,
  sourceName = "Rocket & clouds",
  result = null,
  version = 0,
  busy = false,
  pending = null,
  worker,
  dirty = false,
  initializing = true,
  sourceKind = "builtin";
const look = {
  realistic: true,
  bake: 0.58,
  grain: 0.7,
  glaze: 0.62,
  softness: 0.65,
};
const $ = (s) => document.querySelector(s);
function startupFailure(error) {
  const fallback = $("#startup-fallback");
  if (!fallback) return;
  fallback.querySelector("strong").textContent =
    "Mooncake Studio could not start";
  fallback.querySelector("[data-startup-detail]").textContent =
    `${error?.message || error || "The browser blocked a required feature."} ` +
    "Open the hosted HTTPS version in a current browser. On iPhone, use Safari rather than Files or Quick Look.";
}
const embedded = window.__MOONCAKE_EMBEDDED__;
const rocketURL =
  embedded?.rocketURL || `${import.meta.env.BASE_URL}rocket.svg`;
const traditionalStyles = [
  ["lotus", "Lotus garden", "Purity & renewal", lotusSvg],
  ["peony", "Peony scroll", "Prosperity", peonySvg],
  ["longevity", "Peach & five bats", "Long life & blessings", longevitySvg],
  ["happiness", "Double happiness", "Joy & union", doubleHappinessSvg],
].map(([id, name, meaning, svg]) => ({
  id,
  name,
  meaning,
  svg,
  url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
}));
const wasmBinary = embedded
  ? Uint8Array.from(atob(embedded.wasm), (c) => c.charCodeAt(0))
  : undefined;
const fields = {
  diameter: ["Max. width", 30, 100, 0.5, "mm"],
  cakeHeight: ["Cake height", 8, 45, 0.5, "mm"],
  bodyHeight: ["Mold height", 25, 75, 0.5, "mm"],
  lobes: ["Lobes / flutes", 6, 48, 1, ""],
  scallop: ["Edge depth", 0, 4, 0.1, "mm"],
  relief: ["Pattern depth", 0.2, 8, 0.1, "mm"],
  draft: ["Design wall draft from vertical", 0, 20, 0.5, "°"],
  rounding: ["Edge amount", 0, 1, 0.05, "mm"],
  inkOffset: ["Ink expansion", -0.6, 1, 0.05, "mm"],
  artScale: ["Artwork size", 35, 88, 1, "%"],
  rotation: ["Artwork rotation", -180, 180, 1, "°"],
  threshold: ["Image threshold", 10, 245, 1, ""],
  clearance: ["Clearance per side", 0.15, 0.65, 0.05, "mm"],
  wall: ["Wall thickness", 1.5, 5, 0.1, "mm"],
  backing: ["Base thickness", 2, 6, 0.1, "mm"],
  lipHeight: ["Retaining lip height", 1, 4, 0.1, "mm"],
  grip: ["Outer grip lip", 0, 4, 0.1, "mm"],
  opening: ["Rear opening", 15, 80, 0.5, "mm"],
};
const fieldTips = {
  diameter:
    "The cake’s widest outside dimension. All exported dimensions use millimeters.",
  cakeHeight:
    "The plain cake body height. Raised artwork can extend above this height.",
  bodyHeight:
    "The mold sleeve height, which controls capacity and pusher travel—not cake height.",
  lobes: "The number of repeated petals or flutes around the cake edge.",
  scallop:
    "How far the perimeter dips between lobes, measured radially from peak to valley.",
  relief:
    "How far the design rises from or sinks into the cake top. The stamp uses the complementary depth.",
  draft:
    "The taper of design walls measured from vertical, following the usual mold convention. A 10° draft produces a 100° interior cavity angle measured from its floor. More draft generally releases pastry more easily. Preserve artwork grows the base outward so the visible face retains its intended outline.",
  rounding:
    "The fillet radius or chamfer size at design tips and cavity floors. The applied amount may be limited by thin artwork.",
  inkOffset:
    "Expands black artwork by this many millimeters before making the stamp. Positive values strengthen lines and close small gaps.",
  artScale:
    "Scales the traced artwork relative to cake width. At 80%, its source extent is about 80% of the cake diameter. Line thickness is unchanged.",
  rotation: "Rotates only the top artwork around the center of the cake.",
  threshold:
    "Controls which image pixels become black artwork. Higher values include lighter pixels; lower values keep only darker pixels.",
  clearance:
    "The sliding gap on each side between the channel and plate/pusher. Total diametral clearance is twice this value.",
  wall: "The minimum radial thickness of the mold sleeve around the cake channel.",
  backing:
    "The flat base thickness of the pusher and raised-design plate. Engraved plates grow automatically when needed to retain solid material below the cavity.",
  lipHeight:
    "The axial height of the internal rear ledge that retains and supports the plates.",
  grip: "How far the external rear flange projects beyond the sleeve wall.",
  opening:
    "The clear rear opening used to push the parts forward. A larger opening leaves less support under the plate.",
};
function tip(text, label = "More information") {
  return `<span class="help-tip" tabindex="0" role="note" aria-label="${label}: ${text}" data-tip="${text}">?</span>`;
}
function field(k) {
  const [label, min, max, step, unit] = fields[k];
  return `<label class="field"><span class="row"><span>${label}${fieldTips[k] ? tip(fieldTips[k], label) : ""}</span><span class="num"><input type="number" aria-label="${label}" data-key="${k}" min="${min}" max="${max}" step="${step}" value="${params[k]}">${unit}</span></span><input aria-label="${label} slider" type="range" data-key="${k}" min="${min}" max="${max}" step="${step}" value="${params[k]}"></label>`;
}
const presets = [
  ["classic", "Classic"],
  ["petal", "Petal"],
  ["fluted", "Fluted"],
  ["square", "Square"],
  ["smooth", "Smooth"],
];
function icon(type) {
  const p = {
    ...params,
    style: type,
    lobes: type === "petal" ? 8 : type === "fluted" ? 32 : 16,
    scallop: type === "petal" ? 3 : type === "fluted" ? 1 : 1.1,
    diameter: 24,
  };
  return `<svg viewBox="-17 -17 34 34"><polygon points="${profile(p)
    .map((q) => q.join(","))
    .join(" ")}"/></svg>`;
}
$("#app").innerHTML =
  `<header><div class="brand"><span class="moon"></span><strong>Mooncake Studio</strong></div><div class="header-actions"><button id="save">Save project</button><button id="open">Open</button><button id="help">Guide</button></div></header><main><aside class="controls"><div class="preset-grid">${presets.map(([id, label]) => `<button data-preset="${id}" class="${params.style === id ? "selected" : ""}">${icon(id)}${label}</button>`).join("")}</div><section class="control"><h2>01 &nbsp; The silhouette</h2>${field("diameter")}<label class="field"><span class="row"><span>Actual circumference</span><span class="num"><input id="circumference" aria-label="Actual circumference" type="number" step=".5">mm</span></span></label>${field("cakeHeight")}${field("lobes")}${field("scallop")}<p class="small">Classic starts from your tested 45 mm CAD channel. Changing its profile requires a matching body and plate.</p></section><section class="control"><h2>02 &nbsp; The impression</h2><div class="drop" id="upload"><img id="art-preview" src="${rocketURL}" alt="Rocket and cloud artwork"><strong id="source-name">Rocket & clouds</strong><br><span>Choose PNG, JPEG, WebP or SVG</span></div><label class="check"><input type="checkbox" id="crop-photo"> Crop image to fill shape</label><label class="field">On the finished cake<select id="polarity"><option value="raised">Raised design · engraved stamp</option><option value="recessed">Recessed design · raised stamp</option></select></label>${field("relief")}<div class="field edge-control"><span>Design edge finish</span><div class="edge-options" role="group" aria-label="Design edge finish"><button data-finish="round">Fillet</button><button data-finish="chamfer">Chamfer</button><button data-finish="sharp">Sharp</button></div><select id="finish" hidden aria-label="Working edge"><option value="round">Fillet</option><option value="chamfer">Chamfer</option><option value="sharp">Sharp</option></select></div>${field("rounding")}<p class="small" id="finish-info" aria-live="polite">Checking working edges…</p><button id="inspect-edges">Inspect plate edges</button>${field("inkOffset")}<p class="small">Ink expansion thickens black regions and narrows white gaps. This adjusts the positive/negative area balance.</p>${field("artScale")}${field("rotation")}<label class="check"><input type="checkbox" id="invert"> Swap ink and background</label><details><summary>Image tracing</summary>${field("threshold")}<p class="small" id="trace-info">Local 384 px tracing. SVG uploads are rasterized before tracing. Black becomes the design; white is background.</p><button id="svg">Download traced SVG</button><button id="reset-art">Use rocket</button></details></section><section class="control"><h2>03 &nbsp; The pastry finish</h2><p class="small">Appearance only: softer pastry edges, browning, pores and glaze. Mold STLs retain their exact geometry.</p><label class="field"><span class="row"><span>Pastry softness</span><span class="num" id="look-softness-value">65%</span></span><input type="range" aria-label="Pastry softness" data-look="softness" min="0" max="1" step=".01" value="0.65"></label><label class="field"><span class="row"><span>Browning</span><span class="num" id="look-bake-value">57%</span></span><input type="range" aria-label="Browning" data-look="bake" min="0" max="1" step=".01" value="0.58"></label><label class="field"><span class="row"><span>Pastry texture</span><span class="num" id="look-grain-value">70%</span></span><input type="range" aria-label="Pastry texture" data-look="grain" min="0" max="1" step=".01" value="0.7"></label><label class="field"><span class="row"><span>Glaze</span><span class="num" id="look-glaze-value">62%</span></span><input type="range" aria-label="Glaze" data-look="glaze" min="0" max="1" step=".01" value="0.62"></label></section><section class="control"><h2>04 &nbsp; The hardware</h2>${field("bodyHeight")}${field("backing")}<p class="small" id="backing-info" aria-live="polite">Engraved plates grow automatically to retain 1.5 mm beneath the design.</p>${field("clearance")}${field("wall")}${field("lipHeight")}${field("grip")}${field("opening")}<p class="small">The inner ledge retains the plate. Push through the rear opening to eject toward the mouth. Channel walls remain straight for release.</p></section><button id="reset">Reset dimensions</button></aside><div class="stage"><div class="pastry-stage"><div class="stage-head"><h2 id="cake-title">Rocket & clouds</h2></div><div class="view-buttons"><button id="orbit">Perspective</button><button id="top">Top view</button><button id="realism">Exact geometry</button></div><div class="hero" id="hero" aria-label="Interactive 3D mooncake preview"></div><div class="progress show" id="progress">Preparing geometry…</div><div class="hint">Drag to orbit · scroll to zoom</div></div><div class="insets"><div class="inset"><div class="mini" id="body-view"></div><span><b>Mold body</b>Rear lip + grip flange</span></div><div class="inset"><div class="mini" id="plate-view"></div><span><b>Design plate</b>Mirrored for pressing</span></div><div class="inset"><div class="mini" id="pusher-view"></div><span><b>Blank pusher</b>Matching channel profile</span></div></div><div class="footer"><div class="metrics"><div class="metric"><b id="width-metric">45 mm</b><span>Maximum width</span></div><div class="metric"><b id="height-metric">22 mm</b><span>Base cake height</span></div><div class="metric"><b id="volume-metric">—</b><span>Cake volume</span></div></div><div class="export-row"><button class="primary export" id="all-stl" disabled>Export mold set</button><button class="export" data-export="plate" disabled>Plate STL</button><button class="export" data-export="body" disabled>Body STL</button><button class="export" data-export="pusher" disabled>Pusher STL</button><span id="status" class="status" role="status">Loading local geometry engine…</span></div></div></div></main><input id="image-file" class="sr" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"><input id="project-file" class="sr" type="file" accept=".json"><div class="toast" id="toast"></div><dialog id="guide"><button class="close">Close</button><h2>A mold for your mooncake.</h2><p>Everything runs in this browser, including image tracing, geometry and STL export. Uploaded artwork never leaves your computer. An internet connection is not needed to use this self-contained app.</p><ol class="help-list"><li>Start from a silhouette, then set cake width and height. Mold height is independent.</li><li>Choose black-on-white artwork. Use broad, smooth shapes; very fine details may disappear at the trace resolution. Use ink expansion to strengthen them.</li><li>Choose whether the design is raised or recessed <em>on the cake</em>. The complementary tooling is mirrored automatically.</li><li>Export the mold set. Import STLs as millimeters at 100%; print plates flat-back-down. Fit-test a new profile before a full set.</li></ol><p>Rounded relief edges use connected facets following a circular profile, not stair steps or exact analytic CAD fillets. Chamfers use straight sloping faces. The applied radius is shown beside the slider and may be limited by relief depth or thin artwork. This rounds relief tips (and the complementary cavity floors); it does not add draft to vertical walls. Engraved plates automatically thicken to retain 1.5 mm of solid backing. The pusher keeps your chosen base thickness. Perimeter and body rims are square. Pastry preview adds cosmetic rounding and irregularity to illustrate a baked result. Exact geometry mode shows the mesh used for export. Neither mode predicts dough flow, baking expansion or release behavior. Volume is not a gram rating.</p><h2>Shapes & traditions</h2><p>Cantonese-style cakes are commonly molded with intricate tops. Snow-skin cakes also suit decorative molds. The classic, petal, fluted, square and smooth presets here are geometric design options, not claims that each profile defines a regional recipe.</p><p>Suzhou cakes have flaky layered pastry; Teochew cakes can show spiral layers. Those textures come from dough preparation and cannot be reproduced by a straight-release mold alone.</p><p>References: <a href="https://en.wikipedia.org/wiki/Mooncake" target="_blank" rel="noreferrer">Regional mooncake styles</a> · <a href="https://en.wikipedia.org/wiki/Snow_skin_mooncake" target="_blank" rel="noreferrer">Snow-skin cakes</a> · <a href="https://manifoldcad.org/docs/html/classmanifold_1_1_cross_section.html" target="_blank" rel="noreferrer">Geometry engine</a></p><p>STLs contain the unsoftened geometry shown in Exact geometry mode; cosmetic pastry texture and rounding are never exported. A rebuild error disables exports; the last good preview is retained and labeled until corrected.</p></dialog>`;
// Keep the summary focused on dimensions determined by the generated mold.
$("#height-metric").closest(".metric").remove();
$("#width-metric").nextElementSibling.textContent = "Cake width";
$("#help").textContent = "?";
$("#help").setAttribute("aria-label", "Open guide");
$("#help").title = "Guide";

// Add the release-oriented draft control beside depth without making the large
// static markup harder to audit.
const draftControl = document.createElement("div");
draftControl.innerHTML = field("draft");
document
  .querySelector('[data-key="relief"]')
  .closest("label")
  .after(draftControl.firstElementChild);
const preserveDraft = document.createElement("label");
preserveDraft.className = "check";
preserveDraft.innerHTML = `<input type="checkbox" id="preserve-artwork" checked> Preserve artwork outline ${tip("Keeps the intended artwork at the visible relief face and grows draft outward toward its base. Turn this off for the older behavior, which keeps the base fixed and narrows the visible design.", "Preserve artwork outline")}`;
document
  .querySelector('[data-key="draft"]')
  .closest("label")
  .after(preserveDraft);
const guideGeometry = [...document.querySelectorAll("#guide p")].find((p) =>
  p.textContent.startsWith("Rounded relief edges"),
);
guideGeometry.textContent =
  "Design walls use the selected draft angle to improve pastry release. Preserve artwork is on by default: the intended line is retained at the visible relief face while the walls grow outward toward the base. Small enclosed gaps can therefore close below the face. Turn it off to keep the base fixed and taper inward, which narrows the face. Rounded relief edges use connected circular-profile facets; chamfers use straight sloping faces. Applied edge rounding may be limited by relief depth or the available edge margin. Engraved plates automatically thicken to retain 1.5 mm of solid backing. The blank pusher keeps the chosen base thickness. The tested sleeve remains straight so the pusher and interchangeable plates retain their established fit. Perimeter and body rims are square. Pastry appearance controls are cosmetic; Exact geometry shows the exported mesh. The preview does not predict dough flow or baking expansion, and volume is not a gram rating.";
// Compact workspace: group controls by task without changing their behavior.
const aside = $("aside.controls"),
  oldSections = [...aside.querySelectorAll("section.control")];
function panel(id, title, description) {
  const el = document.createElement("details");
  el.className = "control-panel";
  el.id = id;
  el.innerHTML = `<summary><span><b>${title}</b><small class="panel-summary">${description}</small></span><span class="chevron" aria-hidden="true">+</span></summary><div class="panel-content"></div>`;
  return el;
}
const panels = [
  panel("shape-panel", "Shape & size", "Classic · 45 × 22 mm"),
  panel("art-panel", "Artwork", "Rocket & clouds"),
  panel("relief-panel", "Relief & edges", "Raised · 3.5 mm · Fillet"),
  panel("pastry-panel", "Pastry appearance", "Preview only"),
  panel("hardware-panel", "Mold dimensions", "Fit & clearances"),
];
function put(i, node) {
  panels[i].querySelector(".panel-content").append(node);
}
put(0, $(".preset-grid"));
for (const node of [...oldSections[0].children])
  if (node.tagName !== "H2") put(0, node);
for (const selector of [
  "#upload",
  "#crop-photo",
  "[data-key=artScale]",
  "[data-key=rotation]",
  "#invert",
  "[data-key=inkOffset]",
]) {
  const node = $(selector);
  put(1, node.closest("label.field,label.check") || node);
}
const inkHelp = oldSections[1].querySelector("p.small:not([id])");
if (inkHelp) inkHelp.remove();
put(1, oldSections[1].querySelector("details"));
for (const node of [...oldSections[1].children])
  if (node.tagName !== "H2") put(2, node);
for (let i = 2; i < 4; i++)
  for (const node of [...oldSections[i].children])
    if (node.tagName !== "H2") put(i + 1, node);
const reset = $("#reset");
aside.replaceChildren();
const asideHead = document.createElement("div");
asideHead.className = "sidebar-head";
asideHead.innerHTML =
  '<span>Design settings</span><button id="collapse-panels" title="Collapse all sections">Collapse all</button>';
const designStatus = document.createElement("p");
designStatus.className = "design-status";
designStatus.id = "design-status";
designStatus.setAttribute("role", "status");
designStatus.hidden = true;
aside.append(
  asideHead,
  designStatus,
  panels[1],
  panels[0],
  ...panels.slice(2),
  reset,
);
panels[1].open = true;
const artworkLibrary = document.createElement("div");
artworkLibrary.className = "tradition-library edit-art-library";
artworkLibrary.setAttribute("role", "group");
artworkLibrary.setAttribute("aria-label", "Choose artwork");
artworkLibrary.innerHTML =
  [{ id: "rocket", name: "Rocket", url: rocketURL }, ...traditionalStyles]
    .map(
      (style) =>
        `<button type="button" data-art-choice="${style.id}" aria-pressed="false"><img src="${style.url}" alt=""><b>${style.name}</b></button>`,
    )
    .join("") +
  '<button type="button" data-art-choice="custom" aria-pressed="false"><span class="custom-art-symbol" aria-hidden="true">+</span><b>Custom</b><small>Upload artwork</small></button>';
panels[1].querySelector(".panel-content").prepend(artworkLibrary);
function syncArtworkChoices() {
  const selected =
    sourceKind === "builtin"
      ? "rocket"
      : sourceKind.startsWith("traditional:")
        ? sourceKind.slice(12)
        : "custom";
  for (const button of artworkLibrary.querySelectorAll("button"))
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.artChoice === selected),
    );
}
new MutationObserver(syncArtworkChoices).observe($("#source-name"), {
  childList: true,
});
syncArtworkChoices();
for (const button of artworkLibrary.querySelectorAll("button")) {
  button.onclick = () => {
    const id = button.dataset.artChoice;
    if (id === "custom") return chooseImage();
    const operation =
      id === "rocket"
        ? rocket(true)
        : loadTraditional(traditionalStyles.find((style) => style.id === id));
    operation.catch((error) => toast(error.message));
  };
}
for (const panel of panels)
  panel.addEventListener("toggle", () => {
    if (panel.open)
      for (const other of panels) if (other !== panel) other.open = false;
  });
$("#collapse-panels").onclick = () => panels.forEach((p) => (p.open = false));
const editor = document.createElement("dialog");
editor.id = "editor";
editor.setAttribute("aria-labelledby", "editor-title");
editor.innerHTML =
  '<div class="editor-head"><h2 id="editor-title">Edit</h2><button id="close-editor">Done</button></div>';
editor.append(aside);
document.body.append(editor);
const editButton = document.createElement("button");
editButton.id = "edit-design";
editButton.innerHTML = `<img id="edit-art-thumb" src="${rocketURL}" alt=""><span>Edit Cake</span>`;
editButton.setAttribute("aria-haspopup", "dialog");
editButton.setAttribute("aria-label", "Edit cake artwork and mold settings");
const editCluster = document.createElement("div");
editCluster.className = "edit-cluster";
const projectActions = document.createElement("div");
projectActions.className = "project-actions";
$("#save").textContent = "Save";
projectActions.append($("#save"), $("#open"));
editCluster.append(editButton, projectActions);
$(".view-buttons").prepend(editCluster);
// Keep cake editing near the title, while camera controls sit where they are
// used: at the lower-left of the viewport, directly below the orbit hint.
const cameraButtons = document.createElement("div");
cameraButtons.className = "camera-buttons";
cameraButtons.setAttribute("aria-label", "Cake view");
cameraButtons.append($("#orbit"), $("#top"), $("#realism"));
const viewportTools = document.createElement("div");
viewportTools.className = "viewport-tools";
viewportTools.append($(".hint"), cameraButtons);
$(".pastry-stage").append(viewportTools);
const editArtThumb = $("#edit-art-thumb");
const artPreview = $("#art-preview");
const syncEditThumb = () => (editArtThumb.src = artPreview.src);
new MutationObserver(syncEditThumb).observe(artPreview, {
  attributes: true,
  attributeFilter: ["src"],
});
syncEditThumb();
const polarity = $("#polarity");
polarity.insertAdjacentHTML(
  "beforebegin",
  tip(
    "Choose the result on the baked cake. The stamp automatically uses the opposite geometry and is mirrored for pressing.",
    "Cake design polarity",
  ),
);
$(".edge-control > span").insertAdjacentHTML(
  "beforeend",
  tip(
    "Fillet rounds the working edge, chamfer makes one straight bevel, and sharp leaves only the selected wall draft.",
    "Design edge finish",
  ),
);
for (const help of document.querySelectorAll(".help-tip")) {
  help.addEventListener("pointerdown", (event) => event.stopPropagation());
  help.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    help.focus();
  });
  help.addEventListener("keydown", (event) => {
    if (event.key === "Escape") help.blur();
  });
}
editButton.onclick = () => editor.showModal();
$("#close-editor").onclick = () => editor.close();
editor.addEventListener("close", () => editButton.focus());
editor.addEventListener("click", (e) => {
  const r = editor.getBoundingClientRect();
  if (
    e.target === editor &&
    (e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom)
  )
    editor.close();
});
const exportMenu = document.createElement("details");
exportMenu.className = "export-menu";
exportMenu.innerHTML = "<summary>Individual STLs</summary><div></div>";
for (const b of document.querySelectorAll("[data-export]"))
  exportMenu.lastElementChild.append(b);
$("#all-stl").after(exportMenu);
const foodSafety = document.createElement("p");
foodSafety.className = "food-safety";
foodSafety.innerHTML =
  "<strong>Food-safety warning:</strong> Not all printing materials are food-safe. FDM layer lines can hinder reliable sanitation. This tool does not certify prints for food contact. Use at your own risk, verify every material and process used for food-contact applications.";
$(".metrics").after(foodSafety);
const guideSafety = document.createElement("section");
guideSafety.className = "guide-safety";
guideSafety.innerHTML =
  "<p><strong>Food-safety warning:</strong> Not all printing materials are food-safe. FDM layer lines can hinder reliable sanitation. This tool does not certify prints for food contact. Use at your own risk, verify every material and process used for food-contact applications.</p>";
$("#guide .help-list").after(guideSafety);
const traditionsHeading = [...document.querySelectorAll("#guide h2")].find(
  (heading) => heading.textContent === "Shapes & traditions",
);
const traditionLibrary = document.createElement("section");
traditionLibrary.className = "tradition-library";
traditionLibrary.setAttribute("aria-label", "Traditional artwork library");
traditionLibrary.innerHTML = traditionalStyles
  .map(
    (style) =>
      `<button type="button" data-traditional-style="${style.id}"><img src="${style.url}" alt=""><span><b>${style.name}</b><small>${style.meaning}</small></span></button>`,
  )
  .join("");
traditionsHeading.after(traditionLibrary);
const recipe = document.createElement("details");
recipe.className = "guide-recipe";
recipe.innerHTML = `
  <summary><span><b>Vegan mooncake recipe</b><small>Leanne Mai-ly Hilgart · about 36 small 50 g cakes</small></span></summary>
  <div class="recipe-body">
    <p>These are vegan Cantonese-style baked mooncakes made with prepared sweet bean or seed pastes and a homemade alkaline solution instead of commercial kansui. Each cake uses <strong>22 g pastry + 28 g filling</strong>.</p>
    <p>This is easiest as a two-day project: prepare the alkaline ingredient and fillings on day one, then make the dough, mold and bake on day two. It can be completed in one day, but advance preparation makes a mooncake-making party much more relaxed.</p>

    <details open>
      <summary>Ingredients & equipment</summary>
      <h4>Pastry dough</h4>
      <ul>
        <li>425 g all-purpose flour</li>
        <li>255 g Lyle’s Golden Syrup — use golden syrup for the classic flavor, not maple or pancake syrup</li>
        <li>105 g vegetable oil</li>
        <li>9 g homemade alkaline solution (below), or commercial kansui/lye water</li>
      </ul>
      <h4>Fillings</h4>
      <p>About 1,000 g prepared sweet bean or seed paste total. Good options include red bean, matcha lotus or bean, lotus seed, white bean, chestnut, chestnut–white-bean and black sesame. Check packaged filling ingredients when baking vegan.</p>
      <p>Prepared fillings are often sold as dense rectangular tubes or bricks in clear airtight packaging. If they are not with baking ingredients, check the packaged-dessert section of an Asian grocery store.</p>
      <h4>For molding & baking</h4>
      <ul>
        <li>50 g mooncake press and traditional or custom inserts</li>
        <li>Cornstarch for dusting</li>
        <li>Parchment paper and baking sheets</li>
        <li>Digital kitchen scale</li>
        <li>Small pastry brush for optional vegan egg wash</li>
      </ul>
    </details>

    <details>
      <summary>Optional coffee filling</summary>
      <p>Mix 350 g prepared chestnut or white bean paste with 5–8 teaspoons instant coffee or espresso powder, to taste. Add the powder directly without water. Start with less, mix thoroughly, taste and increase as desired.</p>
      <p>The same approach works with dry flavorings such as ground black sesame, matcha, cocoa or spices. Avoid added liquid so the filling remains firm enough to roll.</p>
    </details>

    <details>
      <summary>Day 1 · Prepare</summary>
      <h4>1. Make the alkaline solution</h4>
      <ul>
        <li>½ teaspoon ordinary baking soda</li>
        <li>1⅔ teaspoons water</li>
      </ul>
      <ol>
        <li>Heat the oven to 400°F / 205°C.</li>
        <li>Spread the baking soda in a small uncovered oven-safe dish and bake for 1 hour. Cool completely.</li>
        <li>Dissolve ½ teaspoon of the baked baking soda in 1⅔ teaspoons water. Measure 9 g of this solution for the dough.</li>
      </ol>
      <p class="recipe-caution"><strong>Handle carefully:</strong> heating converts sodium bicarbonate to the stronger alkali sodium carbonate. Avoid breathing the dust or getting it in your eyes, and clearly label any leftovers.</p>
      <h4>2. Prepare the fillings</h4>
      <p>Mix any custom-flavored paste, then portion approximately 36 filling balls at <strong>28 g each</strong>. Cover and refrigerate overnight.</p>
    </details>

    <details>
      <summary>Day 2 · Make the mooncakes</summary>
      <h4>1. Make the dough</h4>
      <p>Whisk together 255 g golden syrup, 105 g vegetable oil and 9 g alkaline solution. Add 425 g flour and mix just until a soft cohesive dough forms; do not over-knead. Cover tightly and rest at room temperature for 45–60 minutes.</p>
      <h4>2. Portion</h4>
      <p>Divide the rested dough into approximately 36 <strong>22 g balls</strong>. Keep them covered. Remove filling balls from the refrigerator shortly before assembly so they remain firm but are not extremely cold.</p>
      <h4>3. Wrap</h4>
      <p>Flatten one dough ball into a small disc with a slightly thicker center and thinner edges. Place a 28 g filling ball in the center and gently work the pastry upward while rotating. Enclose the filling, pinch the opening closed and roll gently to smooth.</p>
      <h4>4. Press</h4>
      <p>Line baking sheets with parchment. Very lightly dust the filled ball and/or mold with cornstarch and tap away excess. Put the ball in a 50 g press, set it directly on the sheet, press firmly and evenly for a few seconds, release, then lift straight upward. Leave pressed cakes in place.</p>
      <h4>5. Optional vegan egg wash</h4>
      <p>A vegan egg alternative can give a more golden, glossy crust. Aquafaba may also work, although that variation was not tested for this recipe. Apply any wash extremely sparingly with a nearly dry pastry brush so it does not pool in the grooves. It is also fine to omit the wash for a matte finish.</p>
      <h4>6. Bake</h4>
      <ol>
        <li>Heat the oven to 350°F / 175°C.</li>
        <li>Bake one parchment-lined tray (about 12 cakes) for 8 minutes.</li>
        <li>Remove and rest for 5 minutes. Apply a very thin egg wash now, if using.</li>
        <li>Return to the oven for another 14 minutes, then cool completely. Repeat with the remaining trays.</li>
      </ol>
      <h4>7. Rest & eat</h4>
      <p>The cakes can be eaten the day they are baked, but Cantonese-style pastry is initially firmer. Once completely cool, store in an airtight container. Over 1–2 days the crust softens and develops a richer, slightly glossy appearance. Serve with hot unsweetened tea for a pleasant bitter–sweet balance.</p>
    </details>

    <details>
      <summary>Making mooncakes as a party</summary>
      <p><strong>The day before:</strong> prepare the alkaline ingredient, flavor any fillings, portion 28 g filling balls and refrigerate.</p>
      <p><strong>A couple of hours before:</strong> make and rest the dough, then portion 22 g balls.</p>
      <p><strong>When everyone arrives:</strong> set out the dough, fillings, cornstarch and molds. Then everyone can choose a filling → wrap → choose a mold → press → bake → make tea → eat mooncakes.</p>
    </details>
  </div>`;
$("#guide").append(recipe);
for (const b of exportMenu.querySelectorAll("button"))
  b.addEventListener("click", () => (exportMenu.open = false));
document.addEventListener("click", (e) => {
  if (!exportMenu.contains(e.target)) exportMenu.open = false;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") exportMenu.open = false;
});
const upload = $("#upload");
upload.setAttribute("role", "button");
upload.tabIndex = 0;
upload.setAttribute("aria-label", "Upload artwork");
upload.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    chooseImage();
  }
});
function updateSummaries() {
  const text = [
    `${params.diameter} × ${params.cakeHeight} mm`,
    sourceName,
    `${params.relief} mm · ${params.draft}° draft · ${params.finish === "round" ? "Fillet" : params.finish === "chamfer" ? "Chamfer" : "Sharp"}`,
    "Browning, texture & glaze",
    `${params.bodyHeight} mm body · ${params.clearance} mm clearance`,
  ];
  panels.forEach(
    (p, i) => (p.querySelector(".panel-summary").textContent = text[i]),
  );
}
function toast(s) {
  $("#toast").textContent = s;
  $("#toast").style.display = "block";
  setTimeout(() => ($("#toast").style.display = "none"), 3500);
}
function download(data, name, type = "application/octet-stream") {
  const u = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}
const views = {};
// Keep the browser's last composited canvas; schedule GPU work only on changes.
function requestView(view) {
  view.dirty = true;
  if (
    view.frame ||
    document.hidden ||
    !view.visible ||
    !view.el.clientWidth ||
    !view.el.clientHeight
  )
    return;
  view.frame = requestAnimationFrame(() => {
    view.frame = 0;
    if (
      document.hidden ||
      !view.visible ||
      !view.el.clientWidth ||
      !view.el.clientHeight
    )
      return;
    view.dirty = false;
    // Damping emits change events while the camera settles, then scheduling stops.
    view.controls.update();
    view.renderer.render(view.scene, view.camera);
    view.renderCount++;
  });
}
function pauseView(view) {
  if (view.frame) cancelAnimationFrame(view.frame);
  view.frame = 0;
}
document.addEventListener("visibilitychange", () => {
  for (const v of Object.values(views)) {
    if (document.hidden) pauseView(v);
    else if (v.dirty) requestView(v);
  }
});

function makeView(el, mini = false) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = mini ? 1.05 : 0.9;
  el.append(renderer.domElement);
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(mini ? 35 : 36, 1, 0.1, 1000);
  camera.up.set(0, 0, 1);
  camera.position.set(65, -86, 95);
  scene.add(new THREE.HemisphereLight(0xfff6e6, 0x807364, 1.05));
  const key = new THREE.DirectionalLight(0xffecd1, 2.7);
  key.position.set(-40, -50, 110);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.25);
  rim.position.set(50, 40, 75);
  scene.add(rim);
  if (!mini) {
    const generator = new THREE.PMREMGenerator(renderer),
      environment = new RoomEnvironment();
    scene.environment = generator.fromScene(environment, 0.04).texture;
    environment.dispose();
    generator.dispose();
  }
  const group = new THREE.Group();
  scene.add(group);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 25;
  controls.maxDistance = 300;
  controls.maxPolarAngle = Math.PI * 0.85;
  const view = {
    el,
    scene,
    camera,
    group,
    controls,
    renderer,
    mini,
    dirty: true,
    frame: 0,
    renderCount: 0,
    visible: false,
  };
  views[el.id] = view;
  controls.addEventListener("change", () => requestView(view));
  const obs = new ResizeObserver(() => {
    const w = el.clientWidth,
      h = el.clientHeight;
    if (!w || !h) {
      pauseView(view);
      view.dirty = true;
      return;
    }
    renderer.setPixelRatio(
      el.classList.contains("mini") ? 1 : Math.min(devicePixelRatio, 2),
    );
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestView(view);
  });
  obs.observe(el);
  const visibility = new IntersectionObserver(([entry]) => {
    view.visible = entry.isIntersecting;
    if (view.visible) {
      if (view.dirty) requestView(view);
    } else pauseView(view);
  });
  visibility.observe(el);
  renderer.domElement.addEventListener("webglcontextrestored", () => {
    renderer.shadowMap.needsUpdate = true;
    requestView(view);
  });
  return view;
}
try {
  makeView($("#hero"));
  for (const id of ["body", "plate", "pusher"])
    makeView($(`#${id}-view`), true);
} catch (e) {
  $("#status").textContent =
    "WebGL is unavailable. Enable browser hardware acceleration.";
  throw e;
}
const viewKinds = {
  hero: "cake",
  "body-view": "body",
  "plate-view": "plate",
  "pusher-view": "pusher",
};
const partLabels = {
  cake: ["Mooncake", "Pastry preview"],
  body: ["Mold body", "Rear lip + grip flange"],
  plate: ["Design plate", "Mirrored for pressing"],
  pusher: ["Blank pusher", "Matching channel profile"],
};
function focusedView() {
  return views[document.querySelector(".pastry-stage > .hero").id];
}
function refreshFocus() {
  const kind = viewKinds[document.querySelector(".pastry-stage > .hero").id],
    cake = kind === "cake";
  $("#cake-title").textContent = cake ? sourceName : partLabels[kind][0];
  $("#realism").hidden = !cake;
  for (const card of document.querySelectorAll(".inset")) {
    const k = viewKinds[card.querySelector(".mini").id],
      span = card.querySelector("span");
    span.replaceChildren();
    const b = document.createElement("b");
    b.textContent = partLabels[k][0];
    span.append(b, partLabels[k][1]);
    card.setAttribute("aria-label", `Focus ${partLabels[k][0]}`);
  }
}
function promote(card) {
  const small = card.querySelector(".mini"),
    large = document.querySelector(".pastry-stage > .hero");
  const marker = document.createComment("preview");
  large.replaceWith(marker);
  small.replaceWith(large);
  marker.replaceWith(small);
  small.className = "hero";
  large.className = "mini";
  refreshFocus();
}
for (const card of document.querySelectorAll(".inset")) {
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.title = "Click to bring into focus";
  let down = null;
  card.addEventListener("pointerdown", (e) => {
    down = [e.clientX, e.clientY];
  });
  card.addEventListener("click", (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6)
      promote(card);
    down = null;
  });
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      promote(card);
    }
  });
}
const colors = {
  cake: 0xb97632,
  body: 0x678d83,
  plate: 0x97b1a2,
  pusher: 0x93ada0,
};
function setMesh(view, data, kind) {
  const geometryKey =
    kind === "cake" ? `${look.realistic}:${look.softness}:${look.grain}` : kind;
  if (
    view.initialized &&
    view.lastData === data &&
    view.geometryKey === geometryKey &&
    view.group.children.length
  ) {
    const mesh = view.group.children[0];
    mesh.material.dispose();
    mesh.material =
      kind === "cake" && look.realistic
        ? pastryMaterial(params, look)
        : new THREE.MeshStandardMaterial({
            color:
              kind === "cake" && params.texture === "snow"
                ? 0xe9dec6
                : colors[kind],
            roughness: kind === "cake" ? 0.67 : 0.45,
          });
    requestView(view);
    return;
  }
  view.lastData = data;
  view.geometryKey = geometryKey;
  for (const m of [...view.group.children]) {
    m.geometry.dispose();
    m.material.dispose();
    view.group.remove(m);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geo.computeVertexNormals();
  const realistic = kind === "cake" && look.realistic;
  const mat = realistic
    ? pastryMaterial(params, look)
    : new THREE.MeshStandardMaterial({
        color:
          kind === "cake" && params.texture === "snow"
            ? 0xe9dec6
            : colors[kind],
        roughness: kind === "cake" ? 0.67 : 0.45,
        metalness: 0,
      });
  const displayGeo = realistic
    ? pastryGeometry(data, params, look)
    : toCreasedNormals(geo, Math.PI / 5);
  const mesh = new THREE.Mesh(displayGeo, mat);
  view.group.add(mesh);
  geo.computeBoundingBox();
  const b = geo.boundingBox,
    center = new THREE.Vector3();
  b.getCenter(center);
  view.controls.target.copy(center);
  if (!view.initialized) {
    const d = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
    view.camera.position.set(
      center.x + d * 1.35,
      center.y - d * 1.85,
      center.z + d * 1.7,
    );
    if (!view.mini)
      view.camera.position.set(
        center.x + d * 1.18,
        center.y - d * 1.5,
        center.z + d * 1.85,
      );
    view.initialized = true;
  }
  view.controls.update();
  geo.dispose();
  requestView(view);
}

function invalidate(text) {
  version++;
  result = null;
  pending = null;
  clearTimeout(timer);
  document.querySelectorAll(".export").forEach((b) => (b.disabled = true));
  $(".progress").classList.remove("show");
  status(text, true);
}
function status(text, error = false) {
  $("#status").textContent = text;
  $("#status").classList.toggle("error", error);
  $("#design-status").textContent = text;
  $("#design-status").hidden = !error;
}
let timer;
const invalidInputs = new Set();
function requestBuild() {
  if (invalidInputs.size) return;
  if (!initializing) dirty = true;
  $("#finish-info").textContent = "Updating working edges…";
  $("#backing-info").textContent = "Checking plate thickness…";
  version++;
  result = null;
  $(".progress").classList.add("show");
  $(".progress").textContent = "Updating geometry…";
  document.querySelectorAll(".export").forEach((b) => (b.disabled = true));
  status("Rebuilding…");
  clearTimeout(timer);
  timer = setTimeout(() => {
    pending = {
      id: version,
      params: { ...params },
      paths,
      wasmBinary,
      wasmURL: new URL(
        `${import.meta.env.BASE_URL}manifold.wasm`,
        location.href,
      ).href,
    };
    dispatch();
  }, 160);
}
function dispatch() {
  if (busy || !pending) return;
  busy = true;
  const data = pending;
  pending = null;
  worker.postMessage(data);
}
worker = embedded
  ? new Worker(
      URL.createObjectURL(
        new Blob(
          [
            new TextDecoder().decode(
              Uint8Array.from(atob(embedded.worker), (c) => c.charCodeAt(0)),
            ),
          ],
          { type: "text/javascript" },
        ),
      ),
    )
  : new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
worker.onmessage = ({ data }) => {
  busy = false;
  if (data.id === version) {
    $(".progress").classList.remove("show");
    if (data.error) {
      status(data.error, true);
    } else {
      result = data.result;
      updateScene();
      document.querySelectorAll(".export").forEach((b) => (b.disabled = false));
      status("Ready to export");
      window.__studioResult = result;
      $("#startup-fallback")?.remove();
    }
  }
  dispatch();
};
worker.onerror = (e) => {
  busy = false;
  $(".progress").classList.remove("show");
  status(`Geometry worker failed: ${e.message}. Reload the app.`, true);
  startupFailure(e.message || "The geometry worker could not start.");
};
function updateScene() {
  updateSummaries();
  const f = result.finish;
  $("#finish-info").textContent =
    f.type === "sharp"
      ? `Sharp tip edges · ${f.draftApplied.toFixed(1)}° wall draft applied ${params.preserveArtwork ? "outward from the artwork face" : "inward toward the artwork face"}.`
      : `Applied ${f.type === "round" ? "fillet radius" : "chamfer"}: ${f.applied.toFixed(3)} mm (requested ${f.requested.toFixed(2)} mm), with ${f.draftApplied.toFixed(1)}° wall draft ${params.preserveArtwork ? "outward from the artwork face" : "inward toward the artwork face"}. ${f.reason ? f.reason + ". " : ""}These change exported relief geometry; pastry softness is cosmetic.`;
  $("#backing-info").textContent =
    `Actual design plate base: ${result.effectiveBacking.toFixed(2)} mm. ${params.polarity === "raised" ? `Solid backing beneath engraving: ${(result.effectiveBacking - params.relief).toFixed(2)} mm.` : "Raised pattern adds " + params.relief.toFixed(2) + " mm."} Blank pusher: ${params.backing.toFixed(2)} mm.`;
  setMesh(views.hero, result.meshes.cake, "cake");
  for (const k of ["body", "plate", "pusher"])
    setMesh(views[`${k}-view`], result.meshes[k], k);
  $("#width-metric").textContent = `${params.diameter} mm`;
  $("#volume-metric").textContent =
    `${(result.meshes.cake.volume / 1000).toFixed(0)} ml`;
  $("#circumference").value = result.circumference.toFixed(1);
  refreshFocus();
}
function sync() {
  updateSummaries();
  syncLook();
  $("#crop-photo").checked = cropPhoto;
  $("#crop-photo").disabled = !sourceImage;
  for (const e of document.querySelectorAll("[data-key]"))
    e.value = params[e.dataset.key];
  $("#polarity").value = params.polarity;
  $("#finish").value = params.finish;
  for (const b of document.querySelectorAll("[data-finish]")) {
    b.classList.toggle("selected", b.dataset.finish === params.finish);
    b.setAttribute("aria-pressed", String(b.dataset.finish === params.finish));
  }
  for (const e of document.querySelectorAll("[data-key=rounding]"))
    e.disabled = params.finish === "sharp";
  $("#invert").checked = params.invert;
  $("#preserve-artwork").checked = params.preserveArtwork;
  for (const e of document.querySelectorAll("[data-preset]"))
    e.classList.toggle("selected", e.dataset.preset === params.style);
}
function retrace() {
  const t = traceImage(
    sourceImage,
    params.threshold,
    cropPhoto ? (params.style === "square" ? "square" : "round") : null,
  );
  paths = t.paths;
  $("#art-preview").src = t.preview;
  $("#trace-info").textContent =
    `${cropPhoto ? (params.style === "square" ? "Centered square crop. " : "Centered circular crop. ") : ""}Traced locally at 384 px into ${paths.length} contours. ${t.removed} tiny specks removed (<6 px²). SVGs are rasterized before tracing.`;
}
for (const e of document.querySelectorAll("[data-key]"))
  e.addEventListener("input", () => {
    const k = e.dataset.key,
      v = Number(e.value),
      spec = fields[k];
    if (e.value === "" || !Number.isFinite(v) || v < spec[1] || v > spec[2]) {
      invalidInputs.add(k);
      version++;
      result = null;
      clearTimeout(timer);
      pending = null;
      document.querySelectorAll(".export").forEach((b) => (b.disabled = true));
      status(`${spec[0]} must be between ${spec[1]} and ${spec[2]}.`, true);
      return;
    }
    invalidInputs.delete(k);
    params[k] = v;
    for (const t of document.querySelectorAll(`[data-key="${k}"]`))
      if (t !== e) t.value = v;
    if (k === "threshold" && sourceImage) {
      try {
        retrace();
      } catch (err) {
        invalidate(err.message);
        return;
      }
    }
    requestBuild();
  });
for (const b of document.querySelectorAll("[data-finish]"))
  b.onclick = () => {
    params.finish = b.dataset.finish;
    sync();
    requestBuild();
  };
for (const key of ["polarity", "finish", "invert", "preserve-artwork"])
  $(`#${key}`).onchange = () => {
    const paramKey = key === "preserve-artwork" ? "preserveArtwork" : key;
    params[paramKey] =
      key === "invert" || key === "preserve-artwork"
        ? $(`#${key}`).checked
        : $(`#${key}`).value;
    requestBuild();
  };
for (const e of document.querySelectorAll("[data-preset]"))
  e.onclick = () => {
    params.style = e.dataset.preset;
    params.lobes =
      params.style === "petal" ? 8 : params.style === "fluted" ? 32 : 16;
    params.scallop =
      params.style === "petal" ? 2.5 : params.style === "fluted" ? 0.7 : 1.1;
    sync();
    if (sourceImage && cropPhoto) {
      try {
        retrace();
      } catch (err) {
        invalidate(err.message);
        return;
      }
    }
    requestBuild();
  };
$("#circumference").onchange = () => {
  const target = +$("#circumference").value;
  if (!(target > 0)) return;
  let lo = 30,
    hi = 100;
  for (let i = 0; i < 25; i++) {
    const d = (lo + hi) / 2,
      pts = profile({ ...params, diameter: d });
    let sum = 0;
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      sum += Math.hypot(p[0] - q[0], p[1] - q[1]);
    });
    if (sum < target) lo = d;
    else hi = d;
  }
  params.diameter = Math.round(((lo + hi) / 2) * 100) / 100;
  sync();
  requestBuild();
};
function syncLook() {
  for (const e of document.querySelectorAll("[data-look]")) {
    e.value = look[e.dataset.look];
    $("#look-" + e.dataset.look + "-value").textContent =
      Math.round(+e.value * 100) + "%";
  }
  $("#realism").textContent = look.realistic
    ? "Exact geometry"
    : "Pastry preview";
  refreshFocus();
}
let lookTimer;
for (const e of document.querySelectorAll("[data-look]"))
  e.oninput = () => {
    dirty = true;
    look[e.dataset.look] = +e.value;
    syncLook();
    clearTimeout(lookTimer);
    lookTimer = setTimeout(() => {
      if (result) setMesh(views.hero, result.meshes.cake, "cake");
    }, 70);
  };
$("#realism").onclick = () => {
  dirty = true;
  look.realistic = !look.realistic;
  syncLook();
  if (result) setMesh(views.hero, result.meshes.cake, "cake");
};
$("#inspect-edges").onclick = () => {
  editor.close();
  const el = $("#plate-view");
  if (el.classList.contains("mini")) promote(el.closest(".inset"));
};
$("#top").onclick = () => {
  const v = focusedView(),
    t = v.controls.target;
  v.camera.position.set(t.x, t.y - 0.01, t.z + params.diameter * 2.8);
  v.controls.update();
};
$("#orbit").onclick = () => {
  const el = document.querySelector(".pastry-stage > .hero"),
    v = views[el.id],
    kind = viewKinds[el.id];
  v.initialized = false;
  if (result) setMesh(v, result.meshes[kind], kind);
};
function mayReplace(message) {
  return !(dirty || sourceKind === "custom") || window.confirm(message);
}
function mayReplaceArtwork(message) {
  const isTemplate =
    sourceKind === "builtin" || sourceKind.startsWith("traditional:");
  return (
    isTemplate || !(dirty || sourceKind === "custom") || window.confirm(message)
  );
}
function chooseImage() {
  if (
    mayReplaceArtwork(
      "Replace the current artwork? Save your project first if you want to keep these changes.",
    )
  )
    $("#image-file").click();
}
$("#upload").onclick = chooseImage;
$("#image-file").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (f.size > 15e6) throw Error("Please use an image smaller than 15 MB.");
    if (f.type === "image/svg+xml" || /\.svg$/i.test(f.name))
      validateSVG(await f.text());
    const u = URL.createObjectURL(f);
    try {
      sourceImage = await loadImage(u);
    } finally {
      URL.revokeObjectURL(u);
    }
    cropPhoto = f.type !== "image/svg+xml";
    $("#crop-photo").checked = cropPhoto;
    $("#crop-photo").disabled = false;
    sourceName = f.name.replace(/\.[^.]+$/, "");
    sourceKind = "custom";
    retrace();
    $("#source-name").textContent = sourceName;
    requestBuild();
  } catch (err) {
    invalidate(err.message);
  }
  e.target.value = "";
};
async function rocket(confirmReplacement = false) {
  if (
    confirmReplacement &&
    !mayReplaceArtwork(
      "Replace the current artwork with Rocket & clouds? Save your project first if you want to keep these changes.",
    )
  )
    return;
  sourceImage = await loadImage(`${rocketURL}`);
  cropPhoto = false;
  $("#crop-photo").checked = false;
  $("#crop-photo").disabled = false;
  sourceName = "Rocket & clouds";
  sourceKind = "builtin";
  $("#source-name").textContent = sourceName;
  retrace();
  requestBuild();
}
async function loadTraditional(style) {
  if (
    !mayReplaceArtwork(
      `Replace the current artwork with ${style.name}? Save your project first if you want to keep these changes.`,
    )
  )
    return;
  sourceImage = await loadImage(style.url);
  cropPhoto = false;
  $("#crop-photo").checked = false;
  $("#crop-photo").disabled = false;
  sourceName = style.name;
  sourceKind = `traditional:${style.id}`;
  $("#source-name").textContent = sourceName;
  retrace();
  requestBuild();
  $("#guide").close();
}
for (const button of document.querySelectorAll("[data-traditional-style]"))
  button.onclick = () => {
    const style = traditionalStyles.find(
      (item) => item.id === button.dataset.traditionalStyle,
    );
    loadTraditional(style).catch((error) => toast(error.message));
  };
$("#crop-photo").onchange = () => {
  cropPhoto = $("#crop-photo").checked;
  if (sourceImage) {
    try {
      retrace();
      requestBuild();
    } catch (err) {
      invalidate(err.message);
    }
  }
};
$("#reset-art").onclick = () => rocket(true);
$("#reset").onclick = () => {
  params = { ...defaults };
  invalidInputs.clear();
  sync();
  if (sourceImage) retrace();
  requestBuild();
};
$("#save").onclick = () => {
  download(
    JSON.stringify(
      {
        format: "mooncake-studio",
        version: 1,
        params,
        paths,
        sourceName,
        sourceKind,
        appearance: look,
      },
      null,
      2,
    ),
    "mooncake-project.json",
    "application/json",
  );
  dirty = false;
};
$("#open").onclick = () => {
  if (
    mayReplace(
      "Open another project and replace the current cake? Save first if you want to keep these changes.",
    )
  )
    $("#project-file").click();
};
$("#project-file").onchange = async (e) => {
  try {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 4000000)
      throw Error("Please use a project smaller than 4 MB.");
    const p = JSON.parse(await f.text());
    if (
      p.format !== "mooncake-studio" ||
      !Array.isArray(p.paths) ||
      p.paths.flat().length > 25000
    )
      throw Error("Not a supported Mooncake Studio project.");
    if (!p.params || typeof p.params !== "object")
      throw Error("Missing project settings.");
    const next = { ...defaults };
    for (const k of Object.keys(next))
      if (k in p.params) {
        if (typeof next[k] !== typeof p.params[k])
          throw Error("Invalid project setting.");
        next[k] = p.params[k];
      }
    for (const [key, range] of Object.entries(fields)) {
      if (
        !Number.isFinite(next[key]) ||
        next[key] < range[1] ||
        next[key] > range[2]
      )
        throw Error(`Project ${key} is out of range.`);
    }
    if (
      !p.paths.every(
        (r) =>
          r.length >= 3 &&
          r.every(
            (v) =>
              v.length === 2 &&
              v.every((n) => Number.isFinite(n) && Math.abs(n) < 2),
          ),
      )
    )
      throw Error("Invalid artwork coordinates.");
    if (
      !["classic", "petal", "fluted", "square", "smooth"].includes(
        next.style,
      ) ||
      !["round", "chamfer", "sharp"].includes(next.finish) ||
      !["raised", "recessed"].includes(next.polarity)
    )
      throw Error("Unknown project option.");
    if (p.appearance) {
      for (const key of ["bake", "grain", "glaze", "softness"])
        if (Number.isFinite(p.appearance[key]))
          look[key] = Math.max(0, Math.min(1, p.appearance[key]));
      if (typeof p.appearance.realistic === "boolean")
        look.realistic = p.appearance.realistic;
    }
    next.texture = "baked";
    params = next;
    invalidInputs.clear();
    paths = p.paths;
    sourceImage = null;
    sourceName =
      typeof p.sourceName === "string"
        ? p.sourceName.slice(0, 120)
        : "Imported project";
    sourceKind =
      typeof p.sourceKind === "string" ? p.sourceKind.slice(0, 120) : "project";
    $("#source-name").textContent = sourceName;
    $("#art-preview").src =
      "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgFor(paths));
    sync();
    requestBuild();
    dirty = false;
  } catch (err) {
    toast(err.message);
  }
  e.target.value = "";
};
$("#svg").onclick = () =>
  download(svgFor(paths), "traced-design.svg", "image/svg+xml");
function stl(k) {
  const d = result.meshes[k],
    g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(d.positions, 3));
  g.setIndex(new THREE.BufferAttribute(d.indices, 1));
  const m = new THREE.Mesh(g);
  const data = new STLExporter().parse(m, { binary: true });
  g.dispose();
  m.material.dispose();
  return new Uint8Array(data.buffer);
}
for (const b of document.querySelectorAll("[data-export]"))
  b.onclick = () => {
    if (result)
      download(stl(b.dataset.export), `mooncake-${b.dataset.export}.stl`);
  };
$("#all-stl").onclick = () => {
  if (!result) return;
  const files = {};
  for (const k of ["body", "plate", "pusher"])
    files[`mooncake-${k}.stl`] = stl(k);
  files["cake-reference.stl"] = stl("cake");
  files["project.json"] = strToU8(
    JSON.stringify(
      {
        format: "mooncake-studio",
        version: 1,
        params,
        paths,
        sourceName,
        sourceKind,
        appearance: look,
      },
      null,
      2,
    ),
  );
  files["validation.json"] = strToU8(
    JSON.stringify(
      {
        validation: result.validation,
        notes: result.notes,
        edgeFinish: result.finish,
        effectivePlateBacking: result.effectiveBacking,
        circumference: result.circumference,
        seatedCollisionVolume: result.fit,
        retentionOverlapVolume: result.retention,
      },
      null,
      2,
    ),
  );
  files["PRINT-ME.txt"] = strToU8(
    `Units: millimeters. Import at 100%. Plates flat-back-down, artwork facing up. Tooling is already mirrored. Pattern depth: ${params.relief} mm. Design-wall draft: ${params.draft} degrees, ${params.preserveArtwork ? "expanding toward the relief base to preserve the artwork face" : "tapering inward toward the artwork face"}. The cake-reference STL is a design reference, not a mold component. Mold height and cake height are independent. Changing shape requires matching parts. Fit-test before full production.`,
  );
  download(zipSync(files, { level: 4 }), "mooncake-mold-set.zip");
};
$("#help").onclick = () => $("#guide").showModal();
$("#guide .close").onclick = () => $("#guide").close();
window.addEventListener("beforeunload", (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});
window.__studio = {
  // Reproducible documentation captures; does not alter export geometry.
  setPreviewCamera({
    azimuth = 0,
    elevation = 48,
    distance = 110,
    fov = 36,
  } = {}) {
    const v = views.hero;
    const a = THREE.MathUtils.degToRad(azimuth);
    const e = THREE.MathUtils.degToRad(elevation);
    v.controls.enableDamping = false;
    v.camera.fov = fov;
    v.camera.updateProjectionMatrix();
    v.camera.position
      .copy(v.controls.target)
      .add(
        new THREE.Vector3(
          distance * Math.cos(e) * Math.sin(a),
          -distance * Math.cos(e) * Math.cos(a),
          distance * Math.sin(e),
        ),
      );
    v.controls.update();
    requestView(v);
  },
  get renderStats() {
    return Object.fromEntries(
      Object.entries(views).map(([id, v]) => [
        id,
        {
          renders: v.renderCount,
          pending: !!v.frame,
          visible: v.visible,
          dirty: v.dirty,
        },
      ]),
    );
  },
  get params() {
    return params;
  },
  get paths() {
    return paths;
  },
  get appearance() {
    return look;
  },
  get dirty() {
    return dirty;
  },
  get sourceKind() {
    return sourceKind;
  },
  setParams(p) {
    Object.assign(params, p);
    sync();
    requestBuild();
  },
};
rocket()
  .then(() => {
    dirty = false;
    initializing = false;
  })
  .catch((e) => {
    status(e.message, true);
    startupFailure(e);
  });

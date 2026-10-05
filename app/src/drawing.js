import { loadImage, traceImage } from "./trace.js";

const SIZE = 512;
const BRUSHES = {
  fine: 16,
  medium: 26,
  bold: 40,
};
const HISTORY_LIMIT = 12;

const toolIcon = (kind) =>
  kind === "pen"
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.2-1 10.6-10.6-3.2-3.2L5 15.8 4 20Zm10-13.2 3.2 3.2M13.7 4.7l1.6-1.6a1.6 1.6 0 0 1 2.3 0l3.3 3.3a1.6 1.6 0 0 1 0 2.3l-1.6 1.6"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 15 8.8-10.2a1.8 1.8 0 0 1 2.6-.1l4 3.5a1.8 1.8 0 0 1 .2 2.6L12 19.5H7.9L4 16.2V15Zm5.7 4.5 6.9-8-5.1-4.4-6.9 8 5.1 4.4ZM12 19.5h8"/></svg>';

function clonePixels(ctx) {
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

function hasInk(ctx) {
  const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 24) return true;
  return false;
}

export function mirroredSegments(a, b, symmetry = false, size = SIZE) {
  if (!symmetry) return [[a, b]];
  return [
    [a, b],
    [
      { x: size - a.x, y: a.y },
      { x: size - b.x, y: b.y },
    ],
    [
      { x: a.x, y: size - a.y },
      { x: b.x, y: size - b.y },
    ],
    [
      { x: size - a.x, y: size - a.y },
      { x: size - b.x, y: size - b.y },
    ],
  ];
}

export function drawingBrushMillimeters(pixels, diameter, artScale) {
  return (pixels / SIZE) * diameter * (artScale / 100);
}

export function pathsToDrawingSVG(paths) {
  const pathData = paths
    .map(
      (path) =>
        `M${path
          .map(
            ([x, y]) =>
              `${(SIZE / 2 + x * SIZE).toFixed(3)},${(SIZE / 2 - y * SIZE).toFixed(3)}`,
          )
          .join("L")}Z`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><path fill="#000" fill-rule="evenodd" d="${pathData}"/></svg>`;
}

export function createDrawingPad(mount, { onEdit, brushMillimeters }) {
  mount.className = "pattern-maker";
  mount.innerHTML = `
    <div class="pattern-maker-title">
      <span><b>Draw your pattern</b><small>The cake updates after each stroke.</small></span>
      <span class="drawing-local">Local only</span>
    </div>
    <div class="drawing-toolbar" aria-label="Drawing tools">
      <div class="draw-tool-group" role="group" aria-label="Pen or eraser">
        <button type="button" data-draw-tool="pen" aria-pressed="true">${toolIcon("pen")}<span>Pen</span></button>
        <button type="button" data-draw-tool="eraser" aria-pressed="false">${toolIcon("eraser")}<span>Eraser</span></button>
      </div>
      <div class="brush-sizes" role="group" aria-label="Stroke width">
        ${Object.entries(BRUSHES)
          .map(
            ([name, px]) =>
              `<button type="button" data-brush="${name}" aria-pressed="${name === "medium"}" aria-label="${name} stroke"><span class="brush-dot" style="--dot:${Math.round(px / 2)}px"></span><small></small></button>`,
          )
          .join("")}
      </div>
    </div>
    <div class="drawing-board symmetry-off" data-shape="round">
      <canvas id="pattern-canvas" width="${SIZE}" height="${SIZE}" tabindex="0" role="application" aria-label="Pattern drawing canvas. Draw with a mouse, finger, or stylus."></canvas>
      <div class="drawing-guide" aria-hidden="true"></div>
    </div>
    <div class="drawing-actions">
      <button type="button" id="drawing-symmetry" aria-pressed="false" title="Mirror every stroke across the horizontal and vertical axes">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M2 12h20M7 7l10 10M17 7 7 17"/><circle cx="7" cy="7" r="2"/></svg>
        <span>4-way symmetry</span>
      </button>
      <div class="drawing-history" role="group" aria-label="Drawing history">
        <button type="button" id="drawing-undo" title="Undo last stroke" aria-label="Undo last stroke" disabled>Undo</button>
        <button type="button" id="drawing-redo" title="Redo stroke" aria-label="Redo stroke" disabled>Redo</button>
        <button type="button" id="drawing-clear" title="Clear the drawing">Clear</button>
      </div>
    </div>
    <p class="drawing-note" id="drawing-note" aria-live="polite">Draw freely. Turn on four-way symmetry to mirror strokes across both axes.</p>`;

  const canvas = mount.querySelector("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const board = mount.querySelector(".drawing-board");
  const note = mount.querySelector("#drawing-note");
  const undoButton = mount.querySelector("#drawing-undo");
  const redoButton = mount.querySelector("#drawing-redo");
  const symmetryButton = mount.querySelector("#drawing-symmetry");
  let tool = "pen";
  let brush = "medium";
  let symmetry = false;
  let drawing = false;
  let previous = null;
  let history = [];
  let historyIndex = -1;

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * SIZE) / rect.width,
      y: ((event.clientY - rect.top) * SIZE) / rect.height,
    };
  }

  function segment(a, b) {
    ctx.save();
    ctx.globalCompositeOperation =
      tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#000";
    ctx.lineWidth = BRUSHES[brush];
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const [from, to] of mirroredSegments(a, b, symmetry)) {
      ctx.beginPath();
      if (Math.hypot(to.x - from.x, to.y - from.y) < 0.01) {
        ctx.arc(to.x, to.y, BRUSHES[brush] / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function syncHistory() {
    undoButton.disabled = historyIndex <= 0;
    redoButton.disabled = historyIndex >= history.length - 1;
  }

  function pushHistory(reset = false) {
    const frame = clonePixels(ctx);
    if (reset) {
      history = [frame];
      historyIndex = 0;
    } else {
      history = history.slice(0, historyIndex + 1);
      history.push(frame);
      if (history.length > HISTORY_LIMIT) history.shift();
      historyIndex = history.length - 1;
    }
    syncHistory();
  }

  function announceEdit(message) {
    note.textContent = message;
    onEdit?.({ empty: !hasInk(ctx), canvas });
  }

  function finishStroke(event) {
    if (!drawing) return;
    if (
      event?.pointerId !== undefined &&
      canvas.hasPointerCapture(event.pointerId)
    )
      canvas.releasePointerCapture(event.pointerId);
    drawing = false;
    previous = null;
    pushHistory();
    announceEdit(
      symmetry
        ? "Stroke added in four-way symmetry. Cake preview updated."
        : "Stroke added. Cake preview updated.",
    );
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    drawing = true;
    previous = point(event);
    segment(previous, previous);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    event.preventDefault();
    const events = event.getCoalescedEvents?.() || [event];
    for (const sample of events) {
      const next = point(sample);
      segment(previous, next);
      previous = next;
    }
  });
  canvas.addEventListener("pointerup", finishStroke);
  canvas.addEventListener("pointercancel", finishStroke);

  for (const button of mount.querySelectorAll("[data-draw-tool]"))
    button.onclick = () => {
      tool = button.dataset.drawTool;
      for (const peer of mount.querySelectorAll("[data-draw-tool]"))
        peer.setAttribute(
          "aria-pressed",
          String(peer.dataset.drawTool === tool),
        );
      note.textContent =
        tool === "eraser"
          ? "Eraser uses the selected width and follows the symmetry setting."
          : symmetry
            ? "Four-way symmetry mirrors each stroke horizontally and vertically."
            : "Draw freely with the selected pen width.";
    };

  for (const button of mount.querySelectorAll("[data-brush]"))
    button.onclick = () => {
      brush = button.dataset.brush;
      for (const peer of mount.querySelectorAll("[data-brush]"))
        peer.setAttribute("aria-pressed", String(peer.dataset.brush === brush));
      updateBrushLabels();
    };

  symmetryButton.onclick = () => {
    symmetry = !symmetry;
    symmetryButton.setAttribute("aria-pressed", String(symmetry));
    board.classList.toggle("symmetry-off", !symmetry);
    note.textContent = symmetry
      ? "Four-way symmetry mirrors each stroke horizontally and vertically."
      : "Symmetry is off. New strokes are drawn once.";
  };

  undoButton.onclick = () => {
    if (historyIndex <= 0) return;
    ctx.putImageData(history[--historyIndex], 0, 0);
    syncHistory();
    announceEdit("Last stroke undone. Cake preview updated.");
  };
  redoButton.onclick = () => {
    if (historyIndex >= history.length - 1) return;
    ctx.putImageData(history[++historyIndex], 0, 0);
    syncHistory();
    announceEdit("Stroke restored. Cake preview updated.");
  };
  mount.querySelector("#drawing-clear").onclick = () => {
    if (!hasInk(ctx)) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    pushHistory();
    announceEdit("Canvas cleared. Plain cake updated; Undo is available.");
  };

  mount.addEventListener("keydown", (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z")
      return;
    event.preventDefault();
    (event.shiftKey ? redoButton : undoButton).click();
  });

  function updateBrushLabels() {
    for (const button of mount.querySelectorAll("[data-brush]")) {
      const px = BRUSHES[button.dataset.brush];
      const mm = brushMillimeters?.(px) ?? 0;
      button.querySelector("small").textContent = `≈${mm.toFixed(1)} mm`;
      button.setAttribute(
        "aria-label",
        `${button.dataset.brush} stroke, approximately ${mm.toFixed(1)} millimeters on this cake`,
      );
    }
  }

  async function drawImage(image, { binary = false } = {}) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    const scale = Math.min(SIZE / image.width, SIZE / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    ctx.drawImage(
      image,
      (SIZE - width) / 2,
      (SIZE - height) / 2,
      width,
      height,
    );
    if (binary) {
      const pixels = ctx.getImageData(0, 0, SIZE, SIZE);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const ink = pixels.data[i] < 160 && pixels.data[i + 3] > 24;
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 0;
        pixels.data[i + 3] = ink ? 255 : 0;
      }
      ctx.putImageData(pixels, 0, 0);
    }
    pushHistory(true);
  }

  return {
    canvas,
    get empty() {
      return !hasInk(ctx);
    },
    get state() {
      return { brush, symmetry, tool };
    },
    set shape(value) {
      board.dataset.shape = value;
    },
    updateBrushLabels,
    clear({ notify = false } = {}) {
      ctx.clearRect(0, 0, SIZE, SIZE);
      pushHistory(true);
      if (notify) announceEdit("Blank canvas ready. Draw your pattern.");
      else note.textContent = "Blank canvas ready. Draw your pattern.";
    },
    async loadPattern(image, threshold, crop) {
      const traced = traceImage(image, threshold, crop);
      // Put normalized contours onto the editable canvas. Drawing the raster
      // preview here would retain source-image margins, then fit them a second
      // time during the final trace (noticeably shrinking the rocket template).
      const normalized = await loadImage(
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pathsToDrawingSVG(traced.paths))}`,
      );
      await drawImage(normalized, { binary: true });
      note.textContent = "Pattern loaded. Draw or erase to personalize it.";
      return traced;
    },
    async loadDataURL(url) {
      const image = await loadImage(url);
      await drawImage(image);
      note.textContent = "Saved drawing restored. Continue editing it here.";
    },
    serialize() {
      return {
        image: canvas.toDataURL("image/png"),
        brush,
        symmetry,
      };
    },
    restoreSettings(saved = {}) {
      if (saved.brush in BRUSHES) brush = saved.brush;
      if (typeof saved.symmetry === "boolean") symmetry = saved.symmetry;
      symmetryButton.setAttribute("aria-pressed", String(symmetry));
      board.classList.toggle("symmetry-off", !symmetry);
      for (const peer of mount.querySelectorAll("[data-brush]"))
        peer.setAttribute("aria-pressed", String(peer.dataset.brush === brush));
      updateBrushLabels();
    },
  };
}

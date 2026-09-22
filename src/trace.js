import { contours } from "d3-contour";
function simplify(points, eps = 0.65) {
  if (points.length < 4) return points;
  const dist = (p, a, b) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      t = Math.max(
        0,
        Math.min(
          1,
          ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
        ),
      );
    return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
  };
  function rec(a, b) {
    let max = eps,
      k = -1;
    for (let i = a + 1; i < b; i++) {
      const d = dist(points[i], points[a], points[b]);
      if (d > max) {
        max = d;
        k = i;
      }
    }
    return k < 0 ? [points[a]] : [...rec(a, k), ...rec(k, b)];
  }
  return [...rec(0, points.length - 1), points.at(-1)];
}
export async function loadImage(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () =>
      im.width * im.height > 36000000
        ? reject(Error("Please resize this image to 36 megapixels or less."))
        : resolve(im);
    im.onerror = () =>
      reject(
        Error(
          "Cannot read this image. Use PNG, JPEG, WebP or a self-contained SVG.",
        ),
      );
    im.src = url;
  });
}
export function traceImage(im, threshold = 128, crop = null) {
  const n = 384,
    c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, n, n);
  const span = n - 8;
  ctx.save();
  if (crop) {
    ctx.beginPath();
    if (crop === "round") ctx.arc(n / 2, n / 2, span / 2, 0, Math.PI * 2);
    else ctx.rect(4, 4, span, span);
    ctx.clip();
  }
  const sc =
    span /
    (crop ? Math.min(im.width, im.height) : Math.max(im.width, im.height));
  ctx.drawImage(
    im,
    (n - im.width * sc) / 2,
    (n - im.height * sc) / 2,
    im.width * sc,
    im.height * sc,
  );
  ctx.restore();
  const d = ctx.getImageData(0, 0, n, n).data;
  const values = new Float32Array(n * n);
  for (let i = 0; i < values.length; i++)
    values[i] =
      d[4 * i] * 0.2126 + d[4 * i + 1] * 0.7152 + d[4 * i + 2] * 0.0722 <
      threshold
        ? 1
        : 0;
  const poly = contours().size([n, n]).thresholds([0.5])(values)[0];
  let loops = [];
  let removed = 0;
  for (const group of poly.coordinates) {
    for (const ring of group) {
      const area = Math.abs(
        ring.reduce((s, p, i) => {
          const q = ring[(i + 1) % ring.length];
          return s + p[0] * q[1] - q[0] * p[1];
        }, 0) / 2,
      );
      if (area < 6) {
        removed++;
        continue;
      }
      loops.push(simplify(ring));
    }
  }
  if (!loops.length)
    throw Error(
      "No dark shapes found. Raise the threshold or upload a darker design.",
    );
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const r of loops)
    for (const [x, y] of r) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  const cx = crop ? n / 2 : (minX + maxX) / 2,
    cy = crop ? n / 2 : (minY + maxY) / 2,
    size = Math.max(maxX - minX, maxY - minY);
  // Radial fit prevents the corners of square artwork from crossing a round plate.
  let maxRadius = 0;
  for (const ring of loops)
    for (const [x, y] of ring)
      maxRadius = Math.max(maxRadius, Math.hypot(x - cx, y - cy));
  const denom = crop ? span : Math.max(size, 2 * maxRadius);
  loops = loops
    .map((r) =>
      r.slice(0, -1).map(([x, y]) => [(x - cx) / denom, -(y - cy) / denom]),
    )
    .filter((r) => r.length >= 3);
  return { paths: loops, removed, preview: c.toDataURL() };
}
export function svgFor(paths) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="45mm" height="45mm" viewBox="0 0 45 45"><g id="DESIGN"><path fill="black" fill-rule="evenodd" d="${paths.map((p) => "M" + p.map(([x, y]) => `${(22.5 + x * 36).toFixed(4)},${(22.5 - y * 36).toFixed(4)}`).join(" L") + " Z").join(" ")}"/></g></svg>`;
}

export function validateSVG(text) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (
    doc.querySelector("parsererror") ||
    doc.doctype ||
    doc.documentElement.localName !== "svg"
  )
    throw Error("Use a valid SVG without a document type declaration.");
  for (const el of doc.querySelectorAll("*")) {
    if (["script", "foreignObject", "image", "feImage"].includes(el.localName))
      throw Error(
        "Use vector-only SVG artwork without scripts or embedded images.",
      );
    for (const a of el.attributes) {
      if (
        /^on/i.test(a.name) ||
        (["href", "src"].includes(a.localName) && !a.value.startsWith("#"))
      )
        throw Error("SVG links must refer only to elements inside the image.");
    }
  }
  if (
    /@import|url\(\s*['"]?(?!#)/i.test(
      text.replace(/url\(\s*['"]?#[^)]*\)/gi, ""),
    )
  )
    throw Error("Use an SVG without external styles or resources.");
  return text;
}

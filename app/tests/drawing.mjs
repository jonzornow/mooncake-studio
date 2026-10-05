import assert from "node:assert/strict";
import {
  drawingBrushMillimeters,
  mirroredSegments,
  pathsToDrawingSVG,
} from "../src/drawing.js";

const a = { x: 40, y: 70 };
const b = { x: 90, y: 110 };

assert.deepEqual(mirroredSegments(a, b, false, 512), [[a, b]]);
assert.deepEqual(mirroredSegments(a, b, true, 512), [
  [a, b],
  [
    { x: 472, y: 70 },
    { x: 422, y: 110 },
  ],
  [
    { x: 40, y: 442 },
    { x: 90, y: 402 },
  ],
  [
    { x: 472, y: 442 },
    { x: 422, y: 402 },
  ],
]);

// Default 45 mm cake at 80% artwork scale: the three 16/26/40 px brushes
// correspond to practical printable strokes of about 1.1/1.8/2.8 mm.
assert.equal(drawingBrushMillimeters(16, 45, 80).toFixed(1), "1.1");
assert.equal(drawingBrushMillimeters(26, 45, 80).toFixed(1), "1.8");
assert.equal(drawingBrushMillimeters(40, 45, 80).toFixed(1), "2.8");

const normalizedSVG = pathsToDrawingSVG([
  [
    [-0.5, 0.5],
    [0.5, 0.5],
    [0.5, -0.5],
    [-0.5, -0.5],
  ],
]);
assert.match(normalizedSVG, /M0\.000,0\.000L512\.000,0\.000/);
assert.match(normalizedSVG, /fill-rule="evenodd"/);

console.log("Drawing symmetry and physical brush sizes passed.");

import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "manifold-3d";
import { defaults, makeBuilder } from "../src/geometry.js";

const m = await Module();
m.setup();
const build = makeBuilder(m);
const paths = JSON.parse(
  fs.readFileSync(new URL("rocket-paths.json", import.meta.url)),
);
const original = new m.CrossSection(
  paths.map((ring) => ring.map(([x, y]) => [x * 36, y * 36])),
  "EvenOdd",
);
const expanded = original.offset(defaults.inkOffset, "Round", 2, 16);
const expected = expanded.simplify(0.018);

// Compare the finished planar face, not just watertightness. A valid solid
// can still have lost the artwork's holes and narrow gaps during offsetting.
for (const draft of [0, 6, 20]) {
  for (const finish of ["sharp", "round", "chamfer"]) {
    const result = build({ ...defaults, draft, finish }, paths);
    const mesh = result.meshes.cake;
    const top = defaults.cakeHeight + defaults.relief;
    let faceArea = 0;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const v = [0, 1, 2].map((j) => {
        const k = mesh.indices[i + j] * 3;
        return mesh.positions.slice(k, k + 3);
      });
      if (!v.every((p) => Math.abs(p[2] - top) < 1e-5)) continue;
      faceArea +=
        Math.abs(
          (v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) -
            (v[2][0] - v[0][0]) * (v[1][1] - v[0][1]),
        ) / 2;
    }
    assert(
      Math.abs(faceArea - expected.area()) < 0.01,
      `${draft}° ${finish}: face ${faceArea} must match artwork ${expected.area()}`,
    );
    console.log(`PASS artwork face: ${draft}° ${finish}`);
  }
}
expected.delete();
expanded.delete();
original.delete();

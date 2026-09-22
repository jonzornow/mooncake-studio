import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "manifold-3d";
import { makeBuilder, defaults } from "../src/geometry.js";
const m = await Module();
m.setup();
const b = makeBuilder(m),
  art = JSON.parse(
    fs.readFileSync(new URL("./rocket-paths.json", import.meta.url)),
  );
const results = [];
for (const opts of [
  {},
  { polarity: "recessed" },
  {
    polarity: "recessed",
    finish: "chamfer",
    style: "petal",
    lobes: 8,
    scallop: 2.5,
    opening: 32,
    artScale: 70,
  },
  { style: "fluted", lobes: 32, scallop: 0.7 },
  { style: "square" },
  { style: "smooth" },
  { finish: "sharp", invert: true, artScale: 65 },
  { diameter: 65, cakeHeight: 30, bodyHeight: 50, opening: 36, rounding: 0.5 },
]) {
  const p = { ...defaults, ...opts },
    start = performance.now(),
    r = b(p, art);
  assert(r.retention > 1);
  assert(r.fit < 0.001);
  for (const v of Object.values(r.validation)) {
    assert(v.float32MeshClosed);
    assert.equal(v.components, 1);
    assert(v.volume > 0);
  }
  const maxZ = (d) => Math.max(...d.positions.filter((_, i) => i % 3 === 2));
  assert(
    Math.abs(
      maxZ(r.meshes.plate) -
        (r.effectiveBacking + (p.polarity === "recessed" ? p.relief : 0)),
    ) < 0.003,
  );
  assert(
    Math.abs(
      maxZ(r.meshes.cake) -
        (p.cakeHeight + (p.polarity === "raised" ? p.relief : 0)),
    ) < 0.003,
  );
  results.push({
    settings: opts,
    milliseconds: Math.round(performance.now() - start),
    notes: r.notes,
    validation: r.validation,
  });
  console.log("PASS", JSON.stringify(opts), results.at(-1).milliseconds + "ms");
}
for (const opts of [{ opening: 44 }, { bodyHeight: 25 }, { artScale: 99 }])
  assert.throws(() => b({ ...defaults, ...opts }, art));
fs.writeFileSync(
  new URL("./geometry-validation.json", import.meta.url),
  JSON.stringify({ cases: results, invalidSettingsBlocked: 3 }, null, 2),
);
console.log("All geometry and rejection checks passed.");

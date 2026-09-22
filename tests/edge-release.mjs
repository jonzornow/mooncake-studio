import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "manifold-3d";
import { makeBuilder, defaults } from "../src/geometry.js";
const m = await Module();
m.setup();
const build = makeBuilder(m);
const square = [
  [
    [-0.2, -0.2],
    [0.2, -0.2],
    [0.2, 0.2],
    [-0.2, 0.2],
  ],
];
const rocket = JSON.parse(
  fs.readFileSync(new URL("rocket-paths.json", import.meta.url)),
);
const report = [];
let last = -Infinity;
for (const radius of [0, 0.15, 0.3, 0.6]) {
  const r = build(
    {
      ...defaults,
      relief: 1,
      draft: 0,
      inkOffset: 0,
      rounding: radius,
      preserveArtwork: false,
    },
    square,
  );
  assert(Math.abs(r.finish.applied - radius) < 0.001);
  assert(r.meshes.plate.volume > last);
  last = r.meshes.plate.volume;
  // The rounding surface must have sloping triangles in the exported mesh.
  const mesh = r.meshes.plate;
  let slopes = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const v = [0, 1, 2].map((j) =>
      Array.from(
        mesh.positions.slice(
          mesh.indices[i + j] * 3,
          mesh.indices[i + j] * 3 + 3,
        ),
      ),
    );
    const u = v[1].map((a, j) => a - v[0][j]),
      w = v[2].map((a, j) => a - v[0][j]);
    const n = [
      u[1] * w[2] - u[2] * w[1],
      u[2] * w[0] - u[0] * w[2],
      u[0] * w[1] - u[1] * w[0],
    ];
    if (Math.abs(n[2]) > 1e-5 && Math.hypot(n[0], n[1]) > 1e-5) slopes++;
  }
  if (radius)
    assert(slopes > 0, "fillet must contain sloping surfaces, not stair steps");
  // Analytic volume of a square with a circular edge profile (numeric integral).
  const width = 14.4,
    N = 20000;
  let cap = 0;
  for (let i = 0; i < N; i++) {
    const z = ((i + 0.5) / N) * radius,
      d = radius - Math.sqrt(Math.max(0, radius * radius - z * z));
    cap += ((width - 2 * d) ** 2 * radius) / N;
  }
  const expectedCut = width * width * (1 - radius) + cap;
  const actualCut = r.meshes.pusher.volume - r.meshes.plate.volume;
  assert(
    Math.abs(actualCut - expectedCut) < 0.12,
    "export must follow requested circular radius",
  );
  report.push({
    radius,
    applied: r.finish.applied,
    plateVolume: r.meshes.plate.volume,
    slopingTriangles: slopes,
    volumeError: actualCut - expectedCut,
  });
}
const drafted = build(
  {
    ...defaults,
    relief: 5,
    draft: 6,
    rounding: 0,
    finish: "sharp",
    preserveArtwork: false,
  },
  square,
);
const undrafted = build(
  {
    ...defaults,
    relief: 5,
    draft: 0,
    rounding: 0,
    finish: "sharp",
    preserveArtwork: false,
  },
  square,
);
assert(drafted.finish.draftApplied > 5.9);
assert(
  drafted.meshes.plate.volume > undrafted.meshes.plate.volume,
  "drafted relief must narrow toward its tip",
);
report.push({ draftedRelief: drafted.finish });
const preserved = build(
  {
    ...defaults,
    relief: 5,
    draft: 6,
    rounding: 0,
    finish: "sharp",
    preserveArtwork: true,
  },
  square,
);
assert(preserved.finish.draftApplied > 5.9);
assert(
  preserved.meshes.plate.volume < undrafted.meshes.plate.volume,
  "artwork-preserving draft must expand the relief base away from its face",
);
assert(
  preserved.meshes.cake.volume > drafted.meshes.cake.volume,
  "preserved raised artwork must retain more material than inward draft",
);
report.push({ preservedArtworkDraft: preserved.finish });
for (const polarity of ["raised", "recessed"])
  for (const finish of ["round", "chamfer"]) {
    const p = {
        ...defaults,
        backing: 2,
        relief: 2.5,
        rounding: 0.5,
        polarity,
        finish,
      },
      r = build(p, rocket);
    assert.equal(p.backing, 2);
    assert.equal(r.effectiveBacking, polarity === "raised" ? 4 : 2);
    assert(Math.abs(r.meshes.pusher.bounds.max[2] - 2) < 0.001);
    assert(
      Math.abs(
        r.meshes.plate.bounds.max[2] - (polarity === "raised" ? 4 : 4.5),
      ) < 0.001,
    );
    for (const check of Object.values(r.validation))
      assert(check.float32MeshClosed && check.components === 1);
    assert(r.fit < 0.001);
    report.push({
      polarity,
      finish,
      backing: r.effectiveBacking,
      edge: r.finish,
    });
  }
const limited = build({ ...defaults, rounding: 1 }, rocket);
assert(limited.finish.applied < 1 && limited.finish.reason);
report.push({ thinArtworkLimit: limited.finish });
fs.writeFileSync(
  new URL("edge-release-validation.json", import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));

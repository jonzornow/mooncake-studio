import tested from "./tested-profile.json" with { type: "json" };
export const defaults = {
  diameter: 45,
  cakeHeight: 22,
  bodyHeight: 45,
  wall: 2.5,
  clearance: 0.3,
  backing: 3,
  lipHeight: 2,
  grip: 2,
  opening: 36,
  style: "classic",
  lobes: 16,
  scallop: 1.1,
  relief: 3.5,
  draft: 6,
  preserveArtwork: true,
  rounding: 0.05,
  finish: "round",
  polarity: "raised",
  inkOffset: 0.2,
  artScale: 80,
  rotation: 0,
  invert: false,
  threshold: 128,
  texture: "baked",
};
export function profile(p) {
  const points = [];
  const n = Math.max(384, p.lobes * 24);
  const R = p.diameter / 2;
  if (p.style === "classic" && p.lobes === 16) {
    return tested.map(([x, y]) => {
      const r = Math.hypot(x, y),
        a = Math.atan2(y, x),
        v = R - ((22.5 - r) * p.scallop) / 1.1;
      return [Math.cos(a) * v, Math.sin(a) * v];
    });
  }
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n;
    let r = R;
    if (p.style === "square")
      r =
        R /
        Math.pow(
          Math.pow(Math.abs(Math.cos(a)), 6) +
            Math.pow(Math.abs(Math.sin(a)), 6),
          1 / 6,
        );
    else if (p.style !== "smooth") {
      let t = (1 - Math.cos(a * p.lobes)) / 2;
      if (p.style === "fluted") t = Math.pow(t, 0.38);
      r -= p.scallop * t;
    }
    points.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return points;
}
function signed(poly) {
  return (
    poly.reduce((s, p, i) => {
      const q = poly[(i + 1) % poly.length];
      return s + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2
  );
}

export function validatePackedMesh(mesh) {
  const ids = new Map(),
    vertexIDs = [],
    edges = new Map();
  let id = 0;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const key = [
      mesh.positions[i],
      mesh.positions[i + 1],
      mesh.positions[i + 2],
    ]
      .map((v) => v.toFixed(8))
      .join(",");
    if (!ids.has(key)) ids.set(key, id++);
    vertexIDs.push(ids.get(key));
  }
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const tri = [0, 1, 2].map((j) => vertexIDs[mesh.indices[i + j]]);
    if (new Set(tri).size !== 3)
      throw Error("Export geometry failed: collapsed triangle.");
    for (let j = 0; j < 3; j++) {
      const a = tri[j],
        b = tri[(j + 1) % 3],
        key = a < b ? `${a},${b}` : `${b},${a}`,
        v = edges.get(key) || [0, 0];
      v[0]++;
      v[1] += a < b ? 1 : -1;
      edges.set(key, v);
    }
  }
  if (
    [...edges.values()].some(
      ([count, orientation]) => count !== 2 || orientation !== 0,
    )
  )
    throw Error(
      "Export geometry failed: non-manifold STL edges. Reduce the rounding or simplify the art.",
    );
  return true;
}

export function makeBuilder(Module) {
  const { CrossSection: C, Manifold: M, Mesh } = Module;
  let owned = [];
  const own = (x) => (owned.push(x), x);
  function extrude(cs, h, z = 0) {
    return own(own(cs.extrude(h)).translate([0, 0, z]));
  }
  function beveled(
    cs,
    h,
    r,
    type,
    draftDegrees,
    preserveArtwork,
    limit,
    notes,
    finishInfo,
  ) {
    const requested = r;
    let draftInset = h * Math.tan((draftDegrees * Math.PI) / 180);
    const reasons = [];
    r = Math.min(r, h - 0.02);
    const countParts = (x) => {
      const pieces = x.decompose();
      const n = pieces.length;
      pieces.forEach((v) => v.delete());
      return n;
    };
    const parts = countParts(cs),
      area = cs.area();
    function fits(radius) {
      const core = own(cs.offset(-radius, "Round", 2, 32));
      return (
        !core.isEmpty() &&
        core.area() >= area * 0.08 &&
        countParts(core) === parts
      );
    }
    function expands(radius) {
      const expanded = own(cs.offset(radius, "Round", 2, 32));
      return (
        !expanded.isEmpty() &&
        (!limit || own(expanded.subtract(limit)).area() <= 0.03)
      );
    }
    const draftFits = preserveArtwork ? expands : fits;
    if (draftInset > 0 && !draftFits(draftInset)) {
      let lo = 0,
        hi = draftInset;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (draftFits(mid)) lo = mid;
        else hi = mid;
      }
      draftInset = lo;
      reasons.push(
        preserveArtwork
          ? "Draft limited by the artwork edge margin"
          : "Draft limited by relief depth or thin artwork",
      );
      notes.push(
        preserveArtwork
          ? `Requested ${draftDegrees.toFixed(1)}° design-wall draft was reduced to keep its outward base inside the artwork margin.`
          : `Requested ${draftDegrees.toFixed(1)}° design-wall draft was reduced because inward taper would remove artwork.`,
      );
    }
    if (type === "sharp") r = 0;
    const edgeFits = preserveArtwork ? expands : fits;
    if (!edgeFits(draftInset + r)) {
      let lo = 0,
        hi = r;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (edgeFits(draftInset + mid)) lo = mid;
        else hi = mid;
      }
      r = lo;
    }
    if (type === "sharp") reasons.push("Sharp selected");
    else if (r < requested - 0.001)
      reasons.push(
        preserveArtwork
          ? "Edge finish limited by the artwork edge margin"
          : "Edge finish limited by relief depth or thin artwork",
      );
    Object.assign(finishInfo, {
      applied: r,
      draftRequested: draftDegrees,
      draftApplied: (Math.atan(draftInset / h) * 180) / Math.PI,
      reason: reasons.length ? reasons.join("; ") : null,
    });
    if (r < 0.015 && draftInset < 0.001) {
      finishInfo.applied = 0;
      finishInfo.reason =
        type === "sharp" ? "Sharp selected" : "Amount below mesh tolerance";
      return extrude(cs, h);
    }
    if (r < 0.015) {
      finishInfo.applied = 0;
      if (type !== "sharp") {
        finishInfo.reason = [
          ...reasons,
          preserveArtwork
            ? "No margin remains for this edge finish; draft retained"
            : "Artwork too thin for this edge finish; draft retained",
        ].join("; ");
        notes.push(finishInfo.reason);
      }
      r = 0;
    }
    // Triangulate nested offset strips at their true heights: continuous faces,
    // not a union of stair-stepped extrusions. Supports holes and split contours.
    const positions = [],
      triangles = [],
      ids = new Map();
    const key = (x, y, z) => [x, y, z].map((v) => Math.fround(v)).join(",");
    function vertex(x, y, z) {
      const k = key(x, y, z);
      if (!ids.has(k)) {
        ids.set(k, positions.length / 3);
        positions.push(x, y, z);
      }
      return ids.get(k);
    }
    function face(polys, zFor, reverse = false) {
      const flat = polys.flat(),
        v = flat.map(([x, y]) => vertex(x, y, zFor(x, y)));
      for (const [a, b, c] of Module.triangulate(polys))
        triangles.push(v[a], v[reverse ? c : b], v[reverse ? b : c]);
    }
    // Preserve mode treats the uploaded outline as the finished face of the
    // relief. Its draft and edge radius grow into the base, away from that
    // outline. Legacy mode treats it as the base and tapers inward.
    const startOffset = preserveArtwork ? draftInset + r : 0;
    const startSection =
      startOffset > 0.001 ? own(cs.offset(startOffset, "Round", 2, 32)) : cs;
    const rings = startSection.toPolygons();
    face(rings, () => 0, true);
    function bridge(previous, previousZ, next, nextZ) {
      const inner = new Set(
        next
          .toPolygons()
          .flat()
          .map(([x, y]) => key(x, y, 0)),
      );
      const strip = [
        ...previous.toPolygons(),
        ...next.toPolygons().map((ring) => ring.slice().reverse()),
      ];
      face(strip, (x, y) => (inner.has(key(x, y, 0)) ? nextZ : previousZ));
    }
    const base = h - r;
    const slope = draftInset / h;
    let previous = startSection;
    if (base > 0.001) {
      if (draftInset < 0.001) {
        for (const ring of rings)
          for (let i = 0; i < ring.length; i++) {
            const a = ring[i],
              b = ring[(i + 1) % ring.length],
              A = vertex(...a, 0),
              B = vertex(...b, 0),
              C = vertex(...b, base),
              D = vertex(...a, base);
            triangles.push(A, B, C, A, C, D);
          }
      } else {
        const draftedBase = own(
          startSection.offset(-slope * base, "Round", 2, 32),
        );
        bridge(previous, 0, draftedBase, base);
        previous = draftedBase;
      }
    }
    let previousZ = base,
      segments = 0;
    if (r > 0) {
      const n = type === "round" ? Math.max(12, Math.ceil(r / 0.025)) : 1;
      segments = n;
      for (let i = 1; i <= n; i++) {
        const theta = ((i / n) * Math.PI) / 2,
          edgeInset = type === "round" ? r * (1 - Math.cos(theta)) : r,
          delta = slope * (base + (i / n) * r) + edgeInset;
        const z = type === "round" ? base + r * Math.sin(theta) : h;
        const next = own(startSection.offset(-delta, "Round", 2, 32));
        if (next.isEmpty()) throw Error("Round offset removed all artwork.");
        bridge(previous, previousZ, next, z);
        previous = next;
        previousZ = z;
      }
    }
    face(previous.toPolygons(), () => h);
    const mesh = new Mesh({
      numProp: 3,
      vertProperties: Float32Array.from(positions),
      triVerts: Uint32Array.from(triangles),
    });
    mesh.merge();
    const solid = own(new M(mesh));
    if (solid.status() !== "NoError")
      throw Error("Rounded geometry failed validation.");
    notes.push(
      `Applied ${finishInfo.draftApplied.toFixed(2)}° design-wall draft${r > 0 ? ` and ${type === "round" ? "fillet radius" : "chamfer"} ${r.toFixed(3)} mm (${segments} edge segments)` : ""}.`,
    );
    notes.push(
      preserveArtwork
        ? "Artwork-preserving draft expands the relief base outward while retaining the intended outline at its face."
        : "Inward draft narrows the artwork toward the relief face.",
    );
    return solid;
  }

  function packed(s) {
    const m = s.getMesh(),
      vertices = [],
      mapping = [],
      unique = new Map();
    let removed = 0;
    for (let i = 0; i < m.numVert; i++) {
      const xyz = [0, 1, 2].map((j) => m.vertProperties[i * m.numProp + j]);
      const key = xyz.map((v) => v.toFixed(8)).join(",");
      if (!unique.has(key)) {
        unique.set(key, vertices.length / 3);
        vertices.push(...xyz);
      }
      mapping.push(unique.get(key));
    }
    const triangles = [];
    for (let i = 0; i < m.triVerts.length; i += 3) {
      const t = [0, 1, 2].map((j) => mapping[m.triVerts[i + j]]);
      if (new Set(t).size < 3) {
        removed++;
        continue;
      }
      triangles.push(...t);
    }
    return {
      positions: Float32Array.from(vertices),
      indices: Uint32Array.from(triangles),
      volume: s.volume(),
      bounds: s.boundingBox(),
      collapsedTrianglesRemoved: removed,
    };
  }

  function build(p, paths) {
    owned = [];
    const notes = [],
      finishInfo = { requested: p.rounding, type: p.finish };
    try {
      for (const [k, v] of Object.entries(p))
        if (typeof v === "number" && !Number.isFinite(v))
          throw Error(`Invalid ${k}`);
      const requestedBacking = p.backing;
      p = {
        ...p,
        backing: Math.max(
          p.backing,
          p.polarity === "raised" ? p.relief + 1.5 : 1.5,
        ),
      };
      if (p.backing > requestedBacking)
        notes.push(
          `Plate backing increased from ${requestedBacking.toFixed(2)} to ${p.backing.toFixed(2)} mm to retain 1.5 mm beneath engraving.`,
        );
      if (p.bodyHeight < p.cakeHeight + p.backing + p.lipHeight + p.relief + 1)
        throw Error("Increase mold height to fit this cake and design plate.");
      const outline = profile(p);
      const bore = own(new C([outline], "EvenOdd"));
      const plateSection = own(bore.offset(-p.clearance, "Round", 2, 32));
      const minRad = Math.min(...outline.map((v) => Math.hypot(...v)));
      if (p.opening / 2 > minRad - p.clearance - 2)
        throw Error(
          "Rear opening leaves less than 2 mm of plate support. Reduce opening diameter.",
        );
      const outer = own(bore.offset(p.wall, "Round", 2, 32));
      let body = own(
        extrude(outer, p.bodyHeight).subtract(
          extrude(bore, p.bodyHeight + 2, -1),
        ),
      );
      const flange = own(outer.offset(p.grip, "Round", 2, 32));
      const opening = own(C.circle(p.opening / 2, 128));
      const ledge = own(
        extrude(flange, p.lipHeight).subtract(
          extrude(opening, p.lipHeight + 2, -1),
        ),
      );
      body = own(body.add(ledge));
      const pusher = extrude(plateSection, requestedBacking);
      const blank = extrude(plateSection, p.backing);
      let plate = blank;
      let cake = extrude(bore, p.cakeHeight);
      const limit = own(plateSection.offset(-2.5));
      let art = own(
        new C(
          paths.map((poly) =>
            poly.map(([x, y]) => [
              (x * p.diameter * p.artScale) / 100,
              (y * p.diameter * p.artScale) / 100,
            ]),
          ),
          "EvenOdd",
        ),
      );
      art = own(art.rotate(p.rotation));
      art = own(art.offset(p.inkOffset, "Round", 2, 16));
      if (p.invert) art = own(limit.subtract(art));
      else if (own(art.subtract(limit)).area() > 0.03)
        throw Error(
          "Artwork reaches the edge margin. Reduce artwork size, ink width or rotation.",
        );
      art = own(art.intersect(limit).simplify(0.018));
      if (art.isEmpty())
        throw Error("No artwork remains. Adjust image threshold or ink width.");
      const relief = beveled(
        art,
        p.relief + 0.02,
        p.rounding,
        p.finish,
        p.draft,
        p.preserveArtwork,
        limit,
        notes,
        finishInfo,
      );
      let tool;
      if (p.polarity === "raised") {
        const raised = own(relief.translate([0, 0, p.cakeHeight - 0.02]));
        cake = own(cake.add(raised));
        tool = own(
          own(raised.scale([-1, 1, -1])).translate([
            0,
            0,
            p.backing + p.cakeHeight,
          ]),
        );
        plate = own(blank.subtract(tool));
      } else {
        tool = own(
          own(relief.mirror([1, 0, 0])).translate([0, 0, p.backing - 0.02]),
        );
        plate = own(blank.add(tool));
        const cut = own(
          own(tool.scale([-1, 1, -1])).translate([
            0,
            0,
            p.backing + p.cakeHeight,
          ]),
        );
        cake = own(cake.subtract(cut));
      }
      cake = own(cake.simplify(0.00001));
      plate = own(plate.simplify(0.00001));
      const results = { cake, body, plate, pusher };
      let validation = {};
      for (const [name, s] of Object.entries(results)) {
        if (s.status() !== "NoError" || s.isEmpty() || s.volume() <= 0)
          throw Error(`${name} geometry failed validation.`);
        const pieces = s.decompose();
        let count = pieces.length;
        pieces.forEach((x) => x.delete());
        if (count !== 1)
          throw Error(`${name} has disconnected features; adjust the artwork.`);
        validation[name] = {
          volume: s.volume(),
          components: count,
          status: s.status(),
        };
      }
      let length = 0;
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i],
          b = outline[(i + 1) % outline.length];
        length += Math.hypot(a[0] - b[0], a[1] - b[1]);
      }
      const fit = own(
        body.intersect(own(plate.translate([0, 0, p.lipHeight]))),
      ).volume();
      if (fit > 1e-3)
        throw Error("Plate collides with mold at the seating position.");
      const retention = own(
        body.intersect(own(blank.translate([0, 0, p.lipHeight - 0.5]))),
      ).volume();
      if (retention < 1) throw Error("Rear lip cannot retain this plate.");
      const meshes = Object.fromEntries(
        Object.entries(results).map(([k, s]) => [k, packed(s)]),
      );
      for (const [name, mesh] of Object.entries(meshes)) {
        try {
          validation[name].float32MeshClosed = validatePackedMesh(mesh);
          validation[name].collapsedTrianglesRemoved =
            mesh.collapsedTrianglesRemoved;
        } catch (e) {
          throw Error(name + ": " + e.message);
        }
      }
      return {
        meshes,
        notes,
        validation,
        finish: finishInfo,
        effectiveBacking: p.backing,
        circumference: length,
        area: bore.area(),
        artArea: art.area(),
        fit,
        retention,
      };
    } finally {
      for (const item of owned.reverse())
        try {
          item.delete();
        } catch {}
      owned = [];
    }
  }
  return function generate(p, paths) {
    let last;
    const attempts = p.finish === "sharp" || p.rounding === 0 ? 1 : 6;
    for (let i = 0; i < attempts; i++) {
      const radius = p.rounding * Math.pow(0.65, i);
      try {
        const result = build({ ...p, rounding: radius }, paths);
        result.finish.requested = p.rounding;
        if (i) {
          result.finish.reason = "Reduced to preserve valid connected geometry";
          result.notes.unshift(
            `Requested radius ${p.rounding.toFixed(3)} mm reduced to preserve a connected solid.`,
          );
        }
        return result;
      } catch (e) {
        last = e;
        if (!/disconnected|bevel|geometry failed|Not manifold/.test(e.message))
          throw e;
      }
    }
    throw last;
  };
}

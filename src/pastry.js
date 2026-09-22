import * as THREE from "three";
import { profile } from "./geometry.js";
const cache = new WeakMap();
function fieldFor(data, p) {
  if (cache.has(data)) return cache.get(data);
  const n = 512,
    span = p.diameter * 1.55,
    half = span / 2,
    a = new Float32Array(n * n).fill(-1e6),
    v = data.positions,
    idx = data.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const q = [0, 1, 2].map((k) => {
      const i = idx[t + k] * 3;
      return [
        ((v[i] + half) / span) * (n - 1),
        ((v[i + 1] + half) / span) * (n - 1),
        v[i + 2],
      ];
    });
    const [A, B, C] = q,
      den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
    if (Math.abs(den) < 1e-8) continue;
    const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))),
      x1 = Math.min(n - 1, Math.ceil(Math.max(A[0], B[0], C[0]))),
      y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))),
      y1 = Math.min(n - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const u =
            ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (y - C[1])) / den,
          w = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (y - C[1])) / den,
          z = 1 - u - w;
        if (u >= -1e-5 && w >= -1e-5 && z >= -1e-5)
          a[y * n + x] = Math.max(a[y * n + x], u * A[2] + w * B[2] + z * C[2]);
      }
  }
  for (let i = 0; i < a.length; i++) if (a[i] < 0.1) a[i] = p.cakeHeight;
  const out = { a, n, span, half };
  cache.set(data, out);
  return out;
}
function blur(a, n, sigma) {
  const r = Math.ceil(3 * sigma),
    weights = [];
  let total = 0;
  for (let i = -r; i <= r; i++) {
    const w = Math.exp((-i * i) / (2 * sigma * sigma));
    weights.push(w);
    total += w;
  }
  const b = new Float32Array(a.length),
    c = new Float32Array(a.length);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++)
        sum += a[y * n + Math.max(0, Math.min(n - 1, x + k))] * weights[k + r];
      b[y * n + x] = sum / total;
    }
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++)
        sum += b[Math.max(0, Math.min(n - 1, y + k)) * n + x] * weights[k + r];
      c[y * n + x] = sum / total;
    }
  return c;
}
const ripple = (x, y) =>
  Math.sin(x * 0.63 + y * 0.39) * 0.45 +
  Math.sin(x * 1.7 - y * 1.1 + 1.2) * 0.25 +
  Math.sin(x * 3.1 + y * 2.7) * 0.12;
export function pastryGeometry(data, p, look) {
  const f = fieldFor(data, p),
    a = blur(f.a, f.n, 0.5 + look.softness * 1.5),
    N = 512,
    RINGS = 160,
    SIDES = 56,
    H = p.cakeHeight;
  function height(x, y) {
    const u = Math.max(
        0,
        Math.min(f.n - 1.001, ((x + f.half) / f.span) * (f.n - 1)),
      ),
      v = Math.max(
        0,
        Math.min(f.n - 1.001, ((y + f.half) / f.span) * (f.n - 1)),
      ),
      ix = Math.floor(u),
      iy = Math.floor(v),
      tx = u - ix,
      ty = v - iy;
    return (
      (1 - ty) * ((1 - tx) * a[iy * f.n + ix] + tx * a[iy * f.n + ix + 1]) +
      ty * ((1 - tx) * a[(iy + 1) * f.n + ix] + tx * a[(iy + 1) * f.n + ix + 1])
    );
  }
  const outline = profile(p)
    .map(([x, y]) => [
      (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2),
      Math.hypot(x, y),
    ])
    .sort((a, b) => a[0] - b[0]);
  outline.unshift([outline.at(-1)[0] - Math.PI * 2, outline.at(-1)[1]]);
  outline.push([outline[1][0] + Math.PI * 2, outline[1][1]]);
  function radius(theta) {
    let lo = 0,
      hi = outline.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (outline[m][0] > theta) hi = m;
      else lo = m;
    }
    const t = (theta - outline[lo][0]) / (outline[hi][0] - outline[lo][0]);
    return outline[lo][1] * (1 - t) + outline[hi][1] * t;
  }
  const edge = Math.min(H * 0.22, 1 + look.softness * 2.2),
    bottom = Math.min(edge * 0.6, 1.2),
    positions = [],
    indices = [];
  const rr = Array.from({ length: N }, (_, i) => radius((i / N) * Math.PI * 2));
  const irregular = (theta, z) =>
    look.grain *
    (0.085 * Math.sin(theta * 9 + z * 0.29) +
      0.045 * Math.sin(theta * 19 - z * 0.67));
  positions.push(0, 0, height(0, 0));
  for (let j = 1; j <= RINGS; j++)
    for (let i = 0; i < N; i++) {
      const theta = (i / N) * Math.PI * 2,
        t = j / RINGS,
        rad = rr[i] * t + irregular(theta, H - edge) * t ** 5,
        x = Math.cos(theta) * rad,
        y = Math.sin(theta) * rad,
        d = rr[i] * (1 - t);
      let z = height(x, y);
      if (d < edge)
        z = H - edge + Math.sqrt(Math.max(0, edge * edge - (edge - d) ** 2));
      z += look.grain * 0.075 * ripple(x, y);
      positions.push(x, y, z);
    }
  for (let i = 0; i < N; i++) indices.push(0, 1 + i, 1 + ((i + 1) % N));
  for (let j = 1; j < RINGS; j++)
    for (let i = 0; i < N; i++) {
      const k = (i + 1) % N,
        A = 1 + (j - 1) * N + i,
        B = 1 + j * N + i,
        C = 1 + j * N + k,
        D = 1 + (j - 1) * N + k;
      indices.push(A, B, C, A, C, D);
    }
  const start = positions.length / 3;
  for (let j = 0; j <= SIDES; j++)
    for (let i = 0; i < N; i++) {
      const theta = (i / N) * Math.PI * 2,
        t = j / SIDES,
        nominal = t * (H - edge),
        shrink =
          nominal < bottom
            ? bottom -
              Math.sqrt(Math.max(0, bottom * bottom - (bottom - nominal) ** 2))
            : 0,
        rad = rr[i] - shrink + irregular(theta, nominal),
        x = Math.cos(theta) * rad,
        y = Math.sin(theta) * rad,
        z = nominal + look.grain * 0.075 * ripple(x, y) * t ** 4;
      positions.push(x, y, z);
    }
  for (let j = 0; j < SIDES; j++)
    for (let i = 0; i < N; i++) {
      const k = (i + 1) % N,
        A = start + j * N + i,
        B = start + j * N + k,
        C = start + (j + 1) * N + k,
        D = start + (j + 1) * N + i;
      indices.push(A, B, C, A, C, D);
    }
  const base = positions.length / 3;
  positions.push(0, 0, 0);
  for (let i = 0; i < N; i++)
    indices.push(base, start + ((i + 1) % N), start + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
const noiseGLSL = `
float phash(vec3 p){p=fract(p*.3183099+vec3(.11,.37,.73));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float pnoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(phash(i),phash(i+vec3(1,0,0)),f.x),mix(phash(i+vec3(0,1,0)),phash(i+vec3(1,1,0)),f.x),f.y),mix(mix(phash(i+vec3(0,0,1)),phash(i+vec3(1,0,1)),f.x),mix(phash(i+vec3(0,1,1)),phash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float pfbm(vec3 p){return .57*pnoise(p)+.28*pnoise(p*2.07+3.1)+.15*pnoise(p*4.13+7.4);}
`;
export function pastryMaterial(p, look) {
  const snow = p.texture === "snow";
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: snow ? 0.78 : 0.48 - look.glaze * 0.13,
    metalness: 0,
    clearcoat: snow ? 0.025 : look.glaze * 0.22,
    clearcoatRoughness: 0.4,
    specularIntensity: 0.45,
    ior: 1.42,
    sheen: snow ? 0.18 : 0,
    sheenColor: 0xffe5bb,
    envMapIntensity: 0.22,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      pastryH: { value: p.cakeHeight },
      pastryDepth: { value: p.relief },
      bake: { value: look.bake },
      grain: { value: look.grain },
      isSnow: { value: snow ? 1 : 0 },
      gold: { value: new THREE.Color("#aa591b") },
      toast: { value: new THREE.Color("#50200e") },
      crumb: { value: new THREE.Color("#d19a51") },
    });
    shader.vertexShader = "varying vec3 pastryP;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\npastryP=position;",
    );
    shader.fragmentShader =
      "varying vec3 pastryP;uniform float pastryH,pastryDepth,bake,grain,isSnow;uniform vec3 gold,toast,crumb;\n" +
      noiseGLSL +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
   float patches=pfbm(pastryP*.48);float micro=pnoise(pastryP*11.);
   float crest=smoothstep(pastryH-.15,pastryH+max(.18,pastryDepth*.8),pastryP.z);
   float top=smoothstep(pastryH-3.,pastryH-.6,pastryP.z);
   float baseToast=1.-smoothstep(.1,1.8,pastryP.z);
   float browning=clamp(.08+bake*.43+(patches-.5)*.48+crest*.22+baseToast*.2,0.,.95);
   vec3 crust=mix(crumb,gold,clamp(.48+top*.30+(patches-.5)*.3,0.,1.));crust=mix(crust,toast,browning);
   crust*=(.97+micro*.04)*(1.-grain*.12*smoothstep(.67,.9,micro));
   vec3 snowColor=mix(vec3(.76,.68,.56),vec3(.94,.89,.78),.55+patches*.3);
   diffuseColor.rgb*=mix(crust,snowColor,isSnow);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
   float pores=pow(max(0.,(pnoise(pastryP*16.)-.60)*2.5),2.);
   float bump=grain*(.010*pfbm(pastryP*3.)+.0015*pnoise(pastryP*33.)-.022*pores);
   vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);vec3 R1=cross(sy,normal),R2=cross(normal,sx);float det=dot(sx,R1);
   normal=normalize(abs(det)*normal-sign(det)*(dFdx(bump)*R1+dFdy(bump)*R2));`,
    );
  };
  mat.customProgramCacheKey = () => `pastry-v1-${snow}`;
  return mat;
}

// Prepara o modelo CAD do robô para a web:  node tools/prepare-model.mjs suporte_cubo.glb
//  1) decodifica Draco, solda vértices e simplifica (CAD ~5M vértices -> poucas dezenas de milhares)
//  2) gira o modelo para a placa-base ficar horizontal (Y = cima) e centraliza sobre a origem
//  3) grava public/models/robot.glb (sem Draco: não precisa de decoder no navegador) e robot.json (eixos/pivôs)
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, normals, quantize } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import { writeFileSync, mkdirSync } from 'node:fs';

const src = process.argv[2] || 'suporte_cubo.glb';
const RATIO = +(process.env.RATIO || 0.02), ERROR = +(process.env.ERROR || 0.01);

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(src);
await MeshoptSimplifier.ready;
const root = doc.getRoot();
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) p.setAttribute('NORMAL', null);
await doc.transform(weld({ tolerance: 0.0001 }), simplify({ simplifier: MeshoptSimplifier, ratio: RATIO, error: ERROR }), normals({ overwrite: true }), prune(), dedup());
for (const e of root.listExtensionsUsed()) if (e.extensionName === 'KHR_draco_mesh_compression') e.dispose();

// ---- álgebra mínima ----
const sub = (a, b) => a.map((v, i) => v - b[i]), add = (a, b) => a.map((v, i) => v + b[i]), mul = (a, k) => a.map((v) => v * k);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / Math.hypot(...a));
const rotQ = (q, v) => { const [x, y, z, w] = q, t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])]; return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])]; };
const quatFromTo = (a, b) => { const c = cross(a, b), w = 1 + dot(a, b), q = [...c, w], l = Math.hypot(...q); return q.map((v) => v / l); };
const quatAxis = (axis, ang) => [...mul(norm(axis), Math.sin(ang / 2)), Math.cos(ang / 2)];

// ---- vértices de cada peça em coordenadas de mundo (antes da correção) ----
const parts = {};
for (const n of root.listNodes()) {
  const m = n.getMesh(); if (!m) continue;
  const par = n.getParentNode(), q = par.getRotation(), t = par.getTranslation(), s = n.getScale();
  const pts = (parts[par.getName()] ??= []);
  for (const p of m.listPrimitives()) {
    const a = p.getAttribute('POSITION').getArray();
    for (let i = 0; i < a.length; i += 3) pts.push(add(rotQ(q, [a[i] * s[0], a[i + 1] * s[1], a[i + 2] * s[2]]), t));
  }
}
const stats = (pts) => {                         // centro e eixo de menor variância (normal de um disco/placa)
  const c = pts.reduce((s, p) => add(s, p), [0, 0, 0]).map((v) => v / pts.length);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) { const d = sub(p, c); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j] / pts.length; }
  let v = norm([1, 1, 1]);                       // menor autovalor via iteração inversa deslocada
  const tr = C[0][0] + C[1][1] + C[2][2], M = C.map((r, i) => r.map((x, j) => (i === j ? tr - x : -x)));
  for (let k = 0; k < 200; k++) v = norm(M.map((r) => dot(r, v)));
  return { c, n: v };
};
const key = (re) => Object.keys(parts).find((k) => re.test(k));
const base = [...parts[key(/Baseplate_front/)], ...parts[key(/Baseplate_rear/)]], holder = parts[key(/Cube_holder/)], top = parts[key(/Top_cover/)];
const B = stats(base), H = stats(holder), T = stats(top);
let up = B.n; if (dot(sub(H.c, B.c), up) < 0) up = mul(up, -1);                 // cima = lado onde está o suporte do cubo
let hAxis = H.n; if (dot(sub(T.c, H.c), hAxis) < 0) hAxis = mul(hAxis, -1);     // eixo do suporte, apontando para a tampa

// ---- correção: up -> +Y, depois guinada para que o eixo do suporte incline para +X; centraliza em XZ e apoia em y=0 ----
let R = quatFromTo(up, [0, 1, 0]);
const hh = rotQ(R, hAxis), yaw = Math.atan2(hh[2], hh[0]);                      // gira o componente horizontal para +X
const Ry = quatAxis([0, 1, 0], yaw);
const qm = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
R = qm(Ry, R);
const all = Object.values(parts).flat().map((p) => rotQ(R, p));
const lo = [0, 1, 2].map((i) => Math.min(...all.map((p) => p[i]))), hi = [0, 1, 2].map((i) => Math.max(...all.map((p) => p[i])));
const shift = [-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2];
const world = (p) => add(rotQ(R, p), shift);

const fix = doc.createNode('Fix').setRotation(R).setTranslation(shift);
const scene = root.listScenes()[0];
for (const n of scene.listChildren()) { scene.removeChild(n); fix.addChild(n); }
scene.addChild(fix);

const info = (pts) => { const w = pts.map(world), l = [0, 1, 2].map((i) => Math.min(...w.map((p) => p[i]))), h = [0, 1, 2].map((i) => Math.max(...w.map((p) => p[i]))); return { min: l, max: h, center: mul(add(l, h), 0.5) }; };
const meta = {
  size: sub(hi, lo),
  holder: { center: world(H.c), axis: rotQ(R, hAxis), extent: info(holder) },
  parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k.replace(/:\d+$/, ''), info(v)])),
};
// quantiza por último (a geometria acima já foi medida em float)
if (process.env.QUANTIZE !== '0') await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10 }));
mkdirSync('public/models', { recursive: true });
await io.write('public/models/robot.glb', doc);
writeFileSync('public/models/robot.json', JSON.stringify(meta, (k, v) => (typeof v === 'number' ? +v.toFixed(5) : v), 1));
let verts = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) verts += p.getAttribute('POSITION').getCount();
console.log('vértices:', verts, '| inclinação eixo do suporte vs vertical:', (Math.acos(rotQ(R, hAxis)[1]) * 180 / Math.PI).toFixed(1) + '°');
console.log(JSON.stringify(meta));

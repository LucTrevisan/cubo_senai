// Port da interpretação de cores de Cubotino_webcam.py:
//  1) distância CIEDE2000 aos 6 centros, com referências dinâmicas (facelets mais certos primeiro)
//  2) fallback em HSV (branco por V-S, demais por Hue) quando o resultado de (1) é rejeitado pelo solver.
// Entrada: 54 cores [r,g,b] na ordem Kociemba (face*9 + posição). Saída: string URFDLB de 54 letras.

import { FACES } from './cube.js';

const CENTERS = [4, 13, 22, 31, 40, 49];

export function rgb2lab([r, g, b]) {
  const lin = (v) => { v /= 255; return (v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92) * 100; };
  const R = lin(r), G = lin(g), B = lin(b);
  const f = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 95.047);
  const y = f((R * 0.2126 + G * 0.7152 + B * 0.0722) / 100);
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 108.883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function ciede2000([L1, a1, b1], [L2, a2, b2]) {
  const P = Math.PI, C25 = 6103515625;
  const Cave0 = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cave0 ** 7 / (Cave0 ** 7 + C25)));
  const A1 = (1 + G) * a1, A2 = (1 + G) * a2;
  const C1 = Math.hypot(A1, b1), C2 = Math.hypot(A2, b2);
  const hue = (a, b) => (a === 0 && b === 0 ? 0 : a >= 0 ? Math.atan2(b, a) : Math.atan2(b, a) + 2 * P);
  const h1 = hue(A1, b1), h2 = hue(A2, b2);
  let dh = h2 - h1;
  if (C1 * C2 === 0) dh = 0; else if (dh > P) dh -= 2 * P; else if (dh < -P) dh += 2 * P;
  const dL = L2 - L1, dC = C2 - C1, dH = 2 * Math.sqrt(C1 * C2) * Math.sin(dh / 2);
  const Lave = (L1 + L2) / 2, Cave = (C1 + C2) / 2;
  const ad = Math.abs(h1 - h2), sh = h1 + h2;
  let have;
  if (C1 * C2 === 0) have = sh;
  else if (ad <= P) have = sh / 2;
  else have = sh < 2 * P ? sh / 2 + P : sh / 2 - P;
  const T = 1 - 0.17 * Math.cos(have - P / 6) + 0.24 * Math.cos(2 * have)
    + 0.32 * Math.cos(3 * have + P / 30) - 0.2 * Math.cos(4 * have - (63 * P) / 180);
  let deg = (have * 180) / P;
  if (deg < 0) deg += 360; else if (deg > 360) deg -= 360;
  const dTheta = 30 * Math.exp(-(((deg - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cave ** 7 / (Cave ** 7 + C25));
  const SC = 1 + 0.045 * Cave, SH = 1 + 0.015 * Cave * T;
  const l50 = (Lave - 50) ** 2, SL = 1 + (0.015 * l50) / Math.sqrt(20 + l50);
  const RT = -Math.sin((dTheta * P) / 90) * RC;
  const fL = dL / SL, fC = dC / SC, fH = dH / SH;
  return Math.sqrt(fL * fL + fC * fC + fH * fH + RT * fC * fH);
}

/** RGB -> HSV no formato do OpenCV (H 0-179, S/V 0-255). */
export function rgb2hsv([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = (60 * (g - b)) / d;
    else if (mx === g) h = 120 + (60 * (b - r)) / d;
    else h = 240 + (60 * (r - g)) / d;
    if (h < 0) h += 360;
  }
  return [Math.round(h / 2) % 180, mx ? Math.round((d * 255) / mx) : 0, mx];
}

/** Passo 1: distância de cor com referências que se adaptam aos facelets já classificados. */
export function interpretLab(rgb) {
  const refRGB = CENTERS.map((c) => rgb[c].slice());
  const refLab = refRGB.map(rgb2lab);
  const lab = rgb.map(rgb2lab);
  const dist = lab.map((l) => refLab.map((r) => ciede2000(l, r)));
  const order = [...rgb.keys()].sort((a, b) => Math.min(...dist[a]) - Math.min(...dist[b]));
  const out = new Array(54);
  for (const i of order) {
    const d = refLab.map((r) => ciede2000(lab[i], r));
    const k = d.indexOf(Math.min(...d));
    out[i] = FACES[k];
    // média quadrática entre referência e facelet (como no original)
    refRGB[k] = refRGB[k].map((v, j) => Math.sqrt((v * v + rgb[i][j] ** 2) / 2));
    refLab[k] = rgb2lab(refRGB[k]);
  }
  return out.join('');
}

// ---------- fallback HSV ----------

/** Identifica o nome da cor de cada centro (white, yellow, red, orange, green, blue) pela ordem de apresentação. */
function colorOrder(vs, hue) {
  const centers = CENTERS.slice();
  const vsC = centers.map((c) => vs[c]);
  const white = centers[vsC.indexOf(Math.max(...vsC))];
  const opp = (c) => (c < 27 ? c + 27 : c - 27);
  const yellow = opp(white);
  const rest = centers.filter((c) => c !== white && c !== yellow);
  if (rest.length !== 4) return null;
  let red = null, orange = null;
  for (const f of rest) {
    const Hc = hue[f], Ho = hue[opp(f)];
    if ((Hc > 150 && Ho < 30) || (Hc < 30 && Ho < 30 && Hc < Ho) || (Hc > 160 && Ho > 170 && Hc < Ho)) red = f;
    else if ((Hc < 30 && Ho > 150) || (Hc < 30 && Hc > Ho) || (Hc > 170 && Hc > Ho)) orange = f;
  }
  if (red == null || orange == null) return null;
  const last = rest.filter((c) => c !== red && c !== orange);
  if (last.length !== 2) return null;
  const blue = hue[last[0]] > hue[last[1]] ? last[0] : last[1];
  const green = blue === last[0] ? last[1] : last[0];
  const names = { [white]: 'white', [yellow]: 'yellow', [red]: 'red', [orange]: 'orange', [blue]: 'blue', [green]: 'green' };
  return { seq: CENTERS.map((c) => names[c]), white };
}

export function interpretHSV(rgb) {
  const hsv = rgb.map(rgb2hsv);
  const hue = hsv.map((x) => x[0]);
  const vs = hsv.map((x) => x[2] - x[1]);
  const co = colorOrder(vs, hue);
  if (!co) return null;
  const { seq, white } = co;
  const [Hw] = hsv[white];

  const score = hsv.map(([H, S, V]) => 2 * V - S - Math.abs(3 * (H - Hw)));
  const whites = [...score.keys()].sort((a, b) => score[a] - score[b]).slice(-9);
  const isWhite = new Set(whites);
  const colored = CENTERS.filter((c) => c !== white);
  if (colored.some((c) => isWhite.has(c)) || !isWhite.has(white)) return null;

  const seqNoWhite = seq.filter((c) => c !== 'white');
  const Hcenters = colored.map((c) => hue[c]);
  const Hred = hue[colored[seqNoWhite.indexOf('red')]];
  const Hblue = hue[colored[seqNoWhite.indexOf('blue')]];
  const mid = (Hred + Hblue) >> 1;
  const coloredIdx = [...hsv.keys()].filter((i) => !isWhite.has(i));
  const redWrap = coloredIdx.filter((i) => hue[i] > mid).length < 5;

  const out = new Array(54);
  for (const i of whites) out[i] = FACES[seq.indexOf('white')];
  for (const i of coloredIdx) {
    let H = hue[i];
    const d = Hcenters.map((hc) => {
      let h = H;
      if (redWrap) { if (h > mid) h = 0; if (hc > mid) hc = 0; }
      return Math.min(Math.abs(h - hc), 180 - hc + h);
    });
    out[i] = FACES[seq.indexOf(seqNoWhite[d.indexOf(Math.min(...d))])];
  }
  return out.join('');
}

const HEX = { white: '#ffffff', red: '#d62d20', green: '#1faa4a', yellow: '#ffd400', orange: '#ff7a00', blue: '#1f5fd6' };
/** Cores de exibição por face (U R F D L B): nomes via HSV (como no original) ou, se falhar, a cor medida no centro. */
export function displayColors(rgb) {
  const hsv = rgb.map(rgb2hsv);
  const co = colorOrder(hsv.map((x) => x[2] - x[1]), hsv.map((x) => x[0]));
  return CENTERS.map((c, i) => (co ? HEX[co.seq[i]] : '#' + rgb[c].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')));
}

// Leitura do cubo pela webcam (getUserMedia). Substitui a detecção de contornos do OpenCV por uma grade-guia 3x3:
// leve (0 dependências) e determinística; a cor de cada facelet é a média quadrática (RMS) da área central da célula.

import { interpretLab, interpretHSV, displayColors } from './color.js';
import { verifyCube } from './cube.js';

export const FACE_ORDER = 'URFDLB';

export class Scanner {
  constructor(video, guide) {
    this.video = video; this.guide = guide;
    this.cv = document.createElement('canvas'); this.ctx = this.cv.getContext('2d', { willReadFrequently: true });
    this.faces = [];       // 6 x [9 x [r,g,b]]
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.faces = [];
    this.drawGuide();
  }

  stop() { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; this.video.srcObject = null; }

  /** Quadrado-guia centrado (60% do menor lado), em pixels do vídeo. */
  box() {
    const w = this.video.videoWidth, h = this.video.videoHeight, side = Math.min(w, h) * 0.6;
    return { x: (w - side) / 2, y: (h - side) / 2, side };
  }

  drawGuide() {
    const g = this.guide, w = (g.width = this.video.videoWidth), h = (g.height = this.video.videoHeight);
    const c = g.getContext('2d'), { x, y, side } = this.box(), d = side / 3;
    c.clearRect(0, 0, w, h); c.lineWidth = 2; c.strokeStyle = '#fff'; c.shadowColor = '#000'; c.shadowBlur = 3;
    for (let i = 0; i < 9; i++) c.strokeRect(x + (i % 3) * d + d * 0.3, y + ((i / 3) | 0) * d + d * 0.3, d * 0.4, d * 0.4);
    c.strokeRect(x, y, side, side);
  }

  /** Lê as 9 cores da grade no quadro atual. */
  capture() {
    const w = this.video.videoWidth, h = this.video.videoHeight;
    this.cv.width = w; this.cv.height = h;
    this.ctx.drawImage(this.video, 0, 0, w, h);
    const { x, y, side } = this.box(), d = side / 3, a = Math.max(2, Math.round(d * 0.4));
    const out = [];
    for (let i = 0; i < 9; i++) {
      const px = Math.round(x + (i % 3) * d + (d - a) / 2), py = Math.round(y + ((i / 3) | 0) * d + (d - a) / 2);
      const data = this.ctx.getImageData(px, py, a, a).data;
      let r = 0, g = 0, b = 0, n = a * a;
      for (let k = 0; k < data.length; k += 4) { r += data[k] ** 2; g += data[k + 1] ** 2; b += data[k + 2] ** 2; }
      out.push([Math.sqrt(r / n), Math.sqrt(g / n), Math.sqrt(b / n)]);
    }
    return out;
  }

  /** Com as 6 faces lidas, devolve { state, cols } ou { error }. Tenta Lab e, se incoerente, HSV (como o original). */
  interpret(faces) {
    const rgb = faces.flat();
    let state = interpretLab(rgb);
    let err = verifyCube(state), method = 'Lab';
    if (err) {
      const alt = interpretHSV(rgb);
      if (alt && !verifyCube(alt)) { state = alt; err = null; method = 'HSV'; }
    }
    if (err) return { error: err, state };
    return { state, cols: displayColors(rgb), method };
  }
}

// Vista 3D (Babylon.js modular) do cubo + robô esquemático. Todo o cubo é UMA malha com 81 thin instances
// (27 cubies + 54 adesivos, cor por instância) => 1 draw call. O render só roda quando algo muda (ou em XR).

import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/core/Meshes/thinInstanceMesh';

import { STICKERS, ROT, SOLVED, BASE_COLORS, applyRobotToken } from './cube.js';

const hex = (h) => Color3.FromHexString(h);
const DUR = { F: 0.9, S: 0.7, R: 0.6 };           // segundos por passo, a 1x
const CUBE_Y = 2.0;                                // (robô de reserva) altura do centro do cubo sobre a base
const MODEL_URL = import.meta.env.BASE_URL + 'models/robot.glb';   // gerado por tools/prepare-model.mjs
const META_URL = import.meta.env.BASE_URL + 'models/robot.json';
const CUBE_EDGE = 0.057;                           // aresta do cubo (m): o modelo do robô está em metros
const CUBE_SEAT = 0.0;                             // deslocamento do centro do suporte até a base do cubo (m)
const CUBE_YAW = -Math.PI / 2;                     // face F do cubo voltada para +X (lado oposto à dobradiça); múltiplos de 90°
const HINGE_PIN = [-0.045, 0.087, 0];              // eixo (paralelo a Z) = cilindro da tampa (medido na geometria), sistema do Babylon
const COVER_DZ = -0.005;                           // desloca a tampa 5 mm (eixo Z) para alinhá-la às faces do cubo
const COVER = { open: 0.3, flip: 0.9, sign: 1 };   // ângulos (rad) da tampa; sign inverte o sentido se necessário
// materiais por peça do modelo CAD (o GLB original é todo preto)
const PART_STYLE = {
  Cube_holder: ['#3a3f4d'], Alternative_Servo_axis_sup: ['#9aa3b5'], Alternative_Servo_axis_inf: ['#9aa3b5'],
  Top_cover: 'metal', Lifter: 'metal', Hinge: 'metal',                                   // parte superior: cinza metálico polido
  Structure: 'metal', Baseplate_front: 'metal', Baseplate_rear: 'metal',                // parte inferior: também cinza metálico
};
// logo na face lateral (-Z) da tampa: centro (x,y) no sistema do Babylon, largura em m, ângulo = inclinação da tampa
const LOGO = { url: import.meta.env.BASE_URL + 'models/senai-logo.png', aspect: 738 / 210, width: 0.06, x: 0.0095, y: 0.1063, zFace: -0.0395, angle: 0.3458 };

/** Reflexo "de estúdio" (gradiente + painéis de luz) em textura equiretangular: dá o brilho de metal polido sem HDRI externo. */
function studioReflection(scene) {
  const t = new DynamicTexture('studio', { width: 512, height: 256 }, scene, true), c = t.getContext();
  const g = c.createLinearGradient(0, 0, 0, 256);
  [[0, '#7d899f'], [0.4, '#c9d0dc'], [0.5, '#eef1f6'], [0.55, '#59606c'], [1, '#14171c']].forEach(([o, col]) => g.addColorStop(o, col));
  c.fillStyle = g; c.fillRect(0, 0, 512, 256);
  c.fillStyle = '#f4f6fa';
  for (const [x, y, w, h] of [[40, 70, 60, 26], [210, 60, 80, 22], [380, 74, 56, 28]]) c.fillRect(x, y, w, h);   // softboxes
  c.fillStyle = 'rgba(0,0,0,0.35)';
  for (const x of [120, 300, 460]) c.fillRect(x, 150, 14, 90);                                                    // faixas escuras
  t.update(); t.coordinatesMode = Texture.EQUIRECTANGULAR_MODE;
  return t;
}
const ease = (p) => p * p * (3 - 2 * p);

/** 'F2R1S3' -> passos unitários [{kind:'F'|'S'|'R', n, idx}] (idx = índice do caractere, como no ESP32). */
export function expandMoves(moves) {
  const steps = [];
  for (let i = 0; i < moves.length; i += 2) {
    const kind = moves[i], n = +moves[i + 1];
    if (kind === 'F') for (let k = 0; k < n; k++) steps.push({ kind, n: 1, idx: i });
    else steps.push({ kind, n, idx: i });
  }
  return steps;
}

export class CubeView {
  constructor(canvas) {
    this.canvas = canvas;
    this.engine = new Engine(canvas, true, { powerPreference: 'low-power' }, true);
    const scene = (this.scene = new Scene(this.engine));
    scene.clearColor = Color4.FromHexString('#1b2230ff');
    scene.autoClearDepthAndStencil = true;
    scene.skipPointerMovePicking = true;           // sem picking por movimento do mouse

    this.camera = new ArcRotateCamera('cam', -Math.PI / 2 - 0.5, 1.15, 13, new Vector3(0, 2.6, 0), scene);
    this.camera.lowerRadiusLimit = 5; this.camera.upperRadiusLimit = 30; this.camera.wheelPrecision = 30;
    this.camera.minZ = 0.5; this.camera.maxZ = 200;
    this.camera.attachControl(canvas, true);
    new HemisphericLight('h', new Vector3(0.2, 1, -0.3), scene).intensity = 0.85;
    const sun = new DirectionalLight('d', new Vector3(-0.4, -1, 0.6), scene); sun.intensity = 0.55;

    this.root = new TransformNode('model', scene);
    this.cubeTilt = new TransformNode('cubeTilt', scene); this.cubeTilt.parent = this.root;
    this.buildCube();
    this.holder = new TransformNode('holder', scene); this.holder.parent = this.root;   // gira com spin/rotate
    this.arm = new TransformNode('arm', scene); this.arm.parent = this.root;            // tampa (flip)
    this.armAxis = 'x'; this.armSign = 1; this.armOpen = 0.5; this.armFlip = 1.25;
    this.robotReady = this.loadRobot().catch((e) => { console.warn('modelo do robô indisponível, usando o esquemático:', e); this.buildFallbackRobot(); });

    this.cols = BASE_COLORS.slice();
    this.state = this.initial = SOLVED;
    this.steps = []; this.cursor = 0;
    this.playing = false; this.speed = 1; this.anim = null; this.holderAngle = 0; this.armTarget = 0.5;
    this.dirty = 120; this.inXR = false;
    this.onProgress = () => {}; this.onDone = () => {};

    for (const ev of ['pointerdown', 'pointermove', 'wheel']) canvas.addEventListener(ev, () => (this.dirty = Math.max(this.dirty, 90)), { passive: true });
    window.addEventListener('resize', () => { this.engine.resize(); this.dirty = 5; });
    scene.onBeforeRenderObservable.add(() => this.tick(this.engine.getDeltaTime() / 1000));
    this.engine.runRenderLoop(() => {
      if (this.dirty > 0 || this.inXR || this.anim || this.playing) { scene.render(); if (this.dirty > 0) this.dirty--; }
    });
    this.refresh();
  }

  // ---------- construção ----------
  buildFallbackRobot() {
    const sc = this.scene, mat = (c) => { const m = new StandardMaterial('m', sc); m.diffuseColor = hex(c); m.specularColor = Color3.Black(); return m; };
    const wood = mat('#c9a06b'), dark = mat('#3a3f4d'), accent = mat('#e8e8e8');
    const part = (mesh, parent, x, y, z, m) => { mesh.parent = parent; mesh.position.set(x, y, z); mesh.material = m; return mesh; };
    part(CreateBox('base', { width: 5.2, height: 0.3, depth: 5.2 }, sc), this.root, 0, 0.15, 0, wood);
    this.holder.position.y = 0.4; this.cubeTilt.position.y = CUBE_Y;
    part(CreateCylinder('disc', { diameter: 3.6, height: 0.2, tessellation: 32 }, sc), this.holder, 0, 0, 0, dark);
    part(CreateBox('mark', { width: 0.3, height: 0.08, depth: 0.9 }, sc), this.holder, 0, 0.12, -1.3, accent);
    for (const x of [-2.3, 2.3]) part(CreateBox('post', { width: 0.3, height: 4.2, depth: 0.3 }, sc), this.root, x, 2.4, 2.3, wood);
    part(CreateBox('bar', { width: 4.9, height: 0.3, depth: 0.3 }, sc), this.root, 0, 4.4, 2.3, wood);
    this.arm.position.set(0, 4.2, 2.3);
    part(CreateBox('cover', { width: 3.2, height: 0.12, depth: 3.4 }, sc), this.arm, 0, 0, -1.7, accent).visibility = 0.45;
    this.arm.rotation.x = 0.5; this.dirty = 5;
  }

  /** Carrega o modelo CAD (GLB simplificado) e posiciona cubo, suporte giratório e tampa a partir do robot.json. */
  async loadRobot() {
    const [, , , meta] = await Promise.all([
      import('@babylonjs/loaders/glTF/glTFFileLoader'), import('@babylonjs/loaders/glTF/2.0/glTFLoader'),
      import('@babylonjs/loaders/glTF/2.0/Extensions/KHR_mesh_quantization'),
      fetch(META_URL).then((r) => { if (!r.ok) throw new Error('robot.json ' + r.status); return r.json(); }),
    ]);
    const sc = this.scene, res = await ImportMeshAsync(MODEL_URL, sc);
    const top = res.meshes[0].parent ?? res.meshes[0];       // __root__ do loader (espelha x: Babylon = (-x, y, z) do glTF)
    top.parent = this.root;
    const node = (n) => res.transformNodes.find((t) => t.name.startsWith(n + ':'));
    const metal = new StandardMaterial('metal', sc);
    metal.diffuseColor = new Color3(0.34, 0.35, 0.38); metal.specularColor = new Color3(0.7, 0.7, 0.72); metal.specularPower = 90;
    metal.reflectionTexture = studioReflection(sc); metal.reflectionTexture.level = 0.55;
    for (const [name, style] of Object.entries(PART_STYLE)) {
      let m = metal;
      if (style !== 'metal') { m = new StandardMaterial(name, sc); m.diffuseColor = hex(style[0]); m.specularColor = new Color3(0.12, 0.12, 0.12); }
      node(name)?.getChildMeshes().forEach((c) => { c.material = m; c.isPickable = false; });
    }
    const v = (a) => new Vector3(-a[0], a[1], a[2]);
    const axis = v(meta.holder.axis).normalize(), center = v(meta.holder.center);
    const tilt = Quaternion.FromUnitVectorsToRef(Vector3.Up(), axis, new Quaternion());

    // suporte do cubo (+ eixos dos servos) gira em torno do eixo inclinado
    this.holder.position.copyFrom(center); this.holder.rotationQuaternion = tilt;
    const spinNode = new TransformNode('spin', sc); spinNode.parent = this.holder; this.holder = spinNode;   // rotation.y gira o suporte
    for (const n of ['Cube_holder', 'Alternative_Servo_axis_sup', 'Alternative_Servo_axis_inf']) node(n)?.setParent(this.holder);

    // tampa articulada: gira em torno do eixo Z que passa pela dobradiça
    this.arm.rotation.set(0, 0, 0); this.armTarget = this.armOpen;   // zera resíduo do esquemático (eixo X) antes de prender a tampa
    this.arm.position.set(...HINGE_PIN);
    node('Top_cover')?.setParent(this.arm);
    this.arm.position.z += COVER_DZ;
    const lm = new StandardMaterial('logo', sc), lt = new Texture(LOGO.url, sc);
    lm.diffuseTexture = lt; lm.emissiveTexture = lt; lm.specularColor = Color3.Black(); lm.disableLighting = true;
    lm.zOffset = -2; lm.zOffsetUnits = -4000;   // vence a facetagem da chapa (malha simplificada)
    for (const side of [-1, 1]) {               // -1: face lateral -Z, +1: face lateral +Z (girada 180° para ler certo)
      const logo = CreatePlane('logo' + side, { width: LOGO.width, height: LOGO.width / LOGO.aspect }, sc);
      logo.material = lm; logo.isPickable = false; logo.parent = this.arm;
      logo.position.set(LOGO.x - this.arm.position.x, LOGO.y - this.arm.position.y, side * (Math.abs(LOGO.zFace) + 0.0003));
      if (side < 0) logo.rotation.z = LOGO.angle; else logo.rotation.set(0, Math.PI, -LOGO.angle);
    }
    this.armAxis = 'z'; this.armSign = COVER.sign; this.armOpen = COVER.open; this.armFlip = COVER.flip;
    this.arm.rotation.z = this.armSign * COVER.open;

    // cubo apoiado no suporte, com o eixo Y = eixo do suporte e a face F voltada para +X
    this.cubeTilt.position.copyFrom(center.add(axis.scale(CUBE_SEAT + CUBE_EDGE / 2)));
    this.cubeTilt.rotationQuaternion = tilt; this.cubeTilt.scaling.setAll(CUBE_EDGE / 3);
    this.cubeNode.rotation.y = CUBE_YAW;
    const cam = this.camera;
    cam.target = new Vector3(0, meta.size[1] * 0.45, 0); cam.radius = 0.5; cam.alpha = -Math.PI / 2 - 0.6;
    cam.lowerRadiusLimit = 0.15; cam.upperRadiusLimit = 2; cam.minZ = 0.005; cam.maxZ = 20;
    cam.wheelDeltaPercentage = 0.01; cam.pinchDeltaPercentage = 0.01; cam.panningSensibility = 4000;
    this.armTarget = this.armOpen; this.dirty = 30;
  }

  buildCube() {
    const sc = this.scene;
    this.cubeNode = new TransformNode('cube', sc); this.cubeNode.parent = this.cubeTilt;
    const mesh = (this.mesh = CreateBox('cubies', { size: 1 }, sc));
    mesh.parent = this.cubeNode; mesh.alwaysSelectAsActiveMesh = true; mesh.isPickable = false;
    const m = new StandardMaterial('cm', sc); m.specularColor = new Color3(0.15, 0.15, 0.15); mesh.material = m;

    // instância 0..26 = cubies, 27..80 = adesivos
    this.inst = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++)
      this.inst.push({ s: [0.97, 0.97, 0.97], p: [x, y, z], bottom: y === -1 });
    for (const st of STICKERS) {
      const nx = Math.abs(st[3]), ny = Math.abs(st[4]), nz = Math.abs(st[5]), t = 0.86, th = 0.02;
      this.inst.push({
        s: [nx ? th : t, ny ? th : t, nz ? th : t],
        p: [st[0] + st[3] * 0.495, st[1] + st[4] * 0.495, st[2] + st[5] * 0.495],
        bottom: st[1] === -1,
      });
    }
    this.mats = new Float32Array(this.inst.length * 16);
    this.colorBuf = new Float32Array(this.inst.length * 4);
    for (let i = 0; i < 27; i++) this.colorBuf.set([0.05, 0.05, 0.06, 1], i * 4);
    this.writeMatrices(null, 0);
    mesh.thinInstanceSetBuffer('matrix', this.mats, 16, false);
    mesh.thinInstanceSetBuffer('color', this.colorBuf, 4, false);
  }

  /** Preenche as matrizes; `rot` ({at}) com ângulo `a` aplicado a `layer` ('all' | 'bottom'). */
  writeMatrices(rot, a, layer = 'all') {
    const c = Math.cos(a), s = Math.sin(a), M = this.mats, E = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    this.inst.forEach((it, i) => {
      const o = i * 16, moving = rot && (layer === 'all' || it.bottom);
      const rows = moving ? E.map((e) => rot.at(e[0], e[1], e[2], c, s)) : E;
      const p = moving ? rot.at(it.p[0], it.p[1], it.p[2], c, s) : it.p;
      M.fill(0, o, o + 16);
      for (let j = 0; j < 3; j++) { M[o + j * 4] = rows[j][0] * it.s[j]; M[o + j * 4 + 1] = rows[j][1] * it.s[j]; M[o + j * 4 + 2] = rows[j][2] * it.s[j]; }
      M[o + 12] = p[0]; M[o + 13] = p[1]; M[o + 14] = p[2]; M[o + 15] = 1;
    });
  }

  // ---------- estado / cores ----------
  setColors(cols) { this.cols = cols; this.refresh(); }
  /** Define o cubo inicial (string de 54 letras) e reinicia a sequência. */
  setState(str) { this.state = this.initial = str; this.cursor = 0; this.anim = null; this.refresh(); }
  refresh() {
    const lut = [...'URFDLB'].map((_, i) => Color3.FromHexString(this.cols[i].length === 7 ? this.cols[i] : '#888888'));
    for (let k = 0; k < 54; k++) {
      const col = lut['URFDLB'.indexOf(this.state[k])] || Color3.Gray();
      this.colorBuf.set([col.r, col.g, col.b, 1], (27 + k) * 4);
    }
    this.mesh.thinInstanceBufferUpdated('color');
    this.writeMatrices(null, 0); this.mesh.thinInstanceBufferUpdated('matrix');
    this.dirty = Math.max(this.dirty, 3);
  }

  // ---------- passos do robô ----------
  loadMoves(moves) { this.steps = expandMoves(moves); this.reset(); }
  reset() {
    this.pause(); this.state = this.initial; this.cursor = 0; this.anim = null;
    this.holder.rotation.y = this.holderAngle = 0; this.refresh(); this.emit();
  }
  get total() { return this.steps.length; }
  emit() { this.onProgress(this.cursor, this.total, this.steps[this.cursor - 1]?.idx ?? -1); }

  play() { if (this.cursor >= this.total) this.reset(); this.playing = this.total > 0; }
  pause() { this.playing = false; }
  /** Executa um passo (animado) e pausa; se já está animando, conclui o atual. */
  step() { this.pause(); if (this.anim) this.finish(); this.start(); }

  start() {
    const st = this.steps[this.cursor];
    if (!st) return false;
    this.anim = { st, t: 0, dur: DUR[st.kind] };
    return true;
  }
  /** Aplica o passo atual de forma definitiva (permuta os facelets e repõe as matrizes). */
  finish() {
    const { st } = this.anim;
    this.state = applyRobotToken(this.state, st.kind, st.n);
    if (st.kind !== 'F') this.holderAngle += (st.n === 1 ? -1 : 1) * Math.PI / 2;
    this.holder.rotation.y = this.holderAngle;
    this.anim = null; this.cursor++; this.refresh(); this.emit();
    if (this.cursor >= this.total) { this.playing = false; this.onDone(); }
  }
  /** Modo robô real: a mensagem `i_N` do ESP32 anima o passo do índice N (pulando passos perdidos). */
  advanceTo(idx) {
    if (this.anim) this.finish();
    while (this.cursor < this.total && this.steps[this.cursor].idx < idx) {
      const st = this.steps[this.cursor];
      this.state = applyRobotToken(this.state, st.kind, st.n);
      if (st.kind !== 'F') this.holderAngle += (st.n === 1 ? -1 : 1) * Math.PI / 2;
      this.cursor++;
    }
    this.holder.rotation.y = this.holderAngle; this.refresh();
    if (this.steps[this.cursor]?.idx === idx) this.start();
  }

  tick(dt) {
    // braço: segue suavemente o alvo (aberto / fechado / levantado no flip)
    const cur = this.arm.rotation[this.armAxis] * this.armSign, dx = this.armTarget - cur;
    if (Math.abs(dx) > 1e-3) { this.arm.rotation[this.armAxis] = (cur + dx * Math.min(1, dt * 9)) * this.armSign; this.dirty = Math.max(this.dirty, 2); }
    if (!this.anim && this.playing && !this.start()) this.playing = false;
    const an = this.anim;
    if (!an) { this.armTarget = this.armOpen; return; }
    an.t += dt * this.speed;
    const p = Math.min(an.t / an.dur, 1), a = ease(p) * Math.PI / 2, st = an.st;
    if (st.kind === 'F') { this.writeMatrices(ROT.flip, a); this.armTarget = p > 0.1 && p < 0.7 ? this.armFlip : this.armOpen; }
    else if (st.kind === 'S') {
      const rot = st.n === 1 ? ROT.spinCW : ROT.spinCCW;
      this.writeMatrices(rot, a); this.holder.rotation.y = this.holderAngle + (st.n === 1 ? -a : a); this.armTarget = this.armOpen;
    } else {
      const rot = st.n === 1 ? ROT.spinCW : ROT.spinCCW;
      this.writeMatrices(rot, a, 'bottom'); this.holder.rotation.y = this.holderAngle + (st.n === 1 ? -a : a); this.armTarget = 0;
    }
    this.mesh.thinInstanceBufferUpdated('matrix');
    if (p >= 1) this.finish();
  }

  // ---------- WebXR (carregado sob demanda, fora do bundle inicial) ----------
  async xrSupport() {
    if (!navigator.xr) return { ar: false, vr: false };
    const [ar, vr] = await Promise.all(['immersive-ar', 'immersive-vr'].map((m) => navigator.xr.isSessionSupported(m).catch(() => false)));
    return { ar, vr };
  }

  /** mode: 'immersive-ar' | 'immersive-vr'. Em AR: toque para posicionar sobre uma superfície detectada. */
  async enterXR(mode, overlayEl) {
    if (!this.xr) {
      const [{ WebXRDefaultExperience }, { WebXRFeatureName }] = await Promise.all([
        import('@babylonjs/core/XR/webXRDefaultExperience'),
        import('@babylonjs/core/XR/webXRFeaturesManager'),
        import('@babylonjs/core/XR/features/WebXRHitTest'),
      ]);
      this.xr = await WebXRDefaultExperience.CreateAsync(this.scene, {
        disableDefaultUI: true, disableTeleportation: false, disablePointerSelection: true, disableNearInteraction: true,
        inputOptions: { doNotLoadControllerMeshes: true },
      });
      this.xrFeature = WebXRFeatureName;
      this.xr.baseExperience.onStateChangedObservable.add((s) => {
        this.inXR = s === 2;                       // WebXRState.IN_XR
        if (!this.inXR) this.leaveXR();
      });
    }
    const ar = mode === 'immersive-ar';
    this.savedPose = { s: this.root.scaling.clone(), p: this.root.position.clone() };
    this.root.scaling.setAll(ar ? 1 : 3);                      // AR: tamanho real (~18 cm); VR: 3x (mesa virtual)
    this.root.position.set(0, ar ? 0.8 : 0.6, ar ? 0.7 : 1.0);
    if (ar) this.setupHitTest();
    const opts = overlayEl ? { optionalFeatures: ['dom-overlay'], domOverlay: { root: overlayEl } } : {};
    await this.xr.baseExperience.enterXRAsync(mode, 'local-floor', this.xr.renderTarget, opts);
    if (this.total && !this.playing) this.play();
  }

  setupHitTest() {
    if (this.reticle) return;
    try {
      const fm = this.xr.baseExperience.featuresManager;
      const ht = fm.enableFeature(this.xrFeature.HIT_TEST, 'latest');
      const r = (this.reticle = CreateTorus('ret', { diameter: 0.15, thickness: 0.01, tessellation: 24 }, this.scene));
      r.isVisible = false; r.rotationQuaternion = new Quaternion();
      const m = new StandardMaterial('rm', this.scene); m.emissiveColor = new Color3(0.2, 1, 0.6); m.disableLighting = true; r.material = m;
      let hit = false;
      ht.onHitTestResultObservable.add((res) => {
        hit = res.length > 0; r.isVisible = hit;
        if (hit) res[0].transformationMatrix.decompose(r.scaling, r.rotationQuaternion, r.position);
      });
      this.scene.onPointerObservable.add((pi) => {
        if (pi.type === 1 && hit && this.inXR) this.root.position.copyFrom(r.position);   // POINTERDOWN
      });
    } catch (e) { console.warn('hit-test indisponível:', e); }
  }

  leaveXR() {
    if (this.savedPose) { this.root.scaling.copyFrom(this.savedPose.s); this.root.position.copyFrom(this.savedPose.p); }
    if (this.reticle) this.reticle.isVisible = false;
    this.dirty = 30;
  }
}

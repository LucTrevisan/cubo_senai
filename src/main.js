import './style.css';
import { CubeView } from './scene3d.js';
import { FACES, SOLVED, BASE_COLORS, validateState } from './cube.js';
import { robotRequiredMoves } from './moves.js';
import { solve, randomCube, warmUp } from './solver.js';
import { RobotLink } from './serial.js';
import { Scanner } from './webcam.js';

const $ = (id) => document.getElementById(id);
const GRAYS = ['#7a7a7a', '#808080', '#868686', '#8c8c8c', '#929292', '#989898'];
const OFFSET = [[1, 0], [2, 1], [1, 1], [1, 2], [0, 1], [3, 1]];            // posição de cada face na planificação (U R F D L B)
const status = (t) => ($('status').textContent = t);
const logEl = $('log');
const log = (t) => { logEl.textContent += t + '\n'; logEl.scrollTop = logEl.scrollHeight; };

let cols = BASE_COLORS.slice();
let state = [...SOLVED];           // 54 letras; '?' = facelet vazio
let cur = 'U';                     // cor de pintura
let result = null;                 // { solution, count, robot }
let view;

// ---------------- editor da planificação ----------------
const net = $('net'), cells = [];
for (let f = 0; f < 6; f++) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
  const k = f * 9 + r * 3 + c, el = document.createElement('i');
  el.style.gridArea = `${OFFSET[f][1] * 3 + r + 1} / ${OFFSET[f][0] * 3 + c + 1}`;
  if (c === 1 && r === 1) { el.className = 'ctr'; el.textContent = FACES[f]; }
  else {
    const paint = () => { state[k] = cur; edited(); };
    el.addEventListener('pointerdown', paint);
    el.addEventListener('pointerenter', (e) => { if (e.buttons & 1) paint(); });
    el.addEventListener('wheel', (e) => { e.preventDefault(); const i = (FACES.indexOf(state[k]) + (e.deltaY > 0 ? 1 : 5)) % 6; state[k] = FACES[i]; edited(); }, { passive: false });
  }
  net.append(el); cells.push(el);
}
net.addEventListener('dragstart', (e) => e.preventDefault());

const pal = $('palette');
for (let i = 0; i < 6; i++) {
  const b = document.createElement('b');
  b.onclick = () => { cur = FACES[i]; drawPalette(); };
  pal.append(b);
}
function drawPalette() { [...pal.children].forEach((b, i) => { b.style.background = cols[i]; b.classList.toggle('on', FACES[i] === cur); }); }

function drawNet() {
  cells.forEach((el, k) => { const ch = state[k]; el.style.background = ch === '?' ? '#6b7280' : cols[FACES.indexOf(ch)]; });
  drawPalette();
}
function syncView() { view.setColors(cols); view.setState(state.join('')); }
function edited() { result = null; $('b-send').disabled = true; drawNet(); view.setColors(cols); view.setState(state.join('')); view.loadMoves(''); }

function setCube(str, newCols) {
  state = [...str]; cols = newCols || (scrambleMode() ? GRAYS : BASE_COLORS).slice();
  result = null; drawNet(); syncView(); view.loadMoves('');
}
const scrambleMode = () => $('scramble').checked;
$('scramble').onchange = () => { cols = (scrambleMode() ? GRAYS : BASE_COLORS).slice(); drawNet(); syncView(); };

$('b-clean').onclick = () => { $('out').textContent = ''; setCube(SOLVED); };
$('b-empty').onclick = () => { $('out').textContent = ''; setCube(FACES.split('').map((f) => '????' + f + '????').join('')); };
$('b-random').onclick = async () => { setCube(await randomCube()); await runSolve(); };

// ---------------- solver ----------------
async function runSolve() {
  const s = state.join(''), err = validateState(s);
  if (err) { $('out').textContent = 'Cubo inválido: ' + err; return; }
  status('Resolvendo…'); $('b-solve').disabled = true;
  const t0 = performance.now();
  const r = await solve(s);
  $('b-solve').disabled = false;
  if (r.error) { status('Erro'); $('out').textContent = 'Erro: ' + r.error; return; }
  status(`Pronto (${Math.round(performance.now() - t0)} ms)`);
  if (!r.solution) { $('out').textContent = 'O cubo já está resolvido.'; return; }
  const robot = robotRequiredMoves(r.solution);
  result = { ...r, robot };
  $('out').textContent = (scrambleMode() ? `Manobras: ${r.count}\nMovimentos do robô: como no cubo aleatório` :
    `Solução (${r.count}): ${r.solution}\nMovimentos do robô (${robot.total}): ${robot.moves}`);
  view.setState(s); view.loadMoves(robot.moves);
  $('b-send').disabled = !link?.connected;
}
$('b-solve').onclick = runSolve;

// ---------------- player ----------------
const playBtn = $('b-play');
function setPlayLabel() { playBtn.textContent = view.playing ? '⏸' : '▶'; }
playBtn.onclick = () => { view.playing ? view.pause() : view.play(); setPlayLabel(); };
$('b-step').onclick = () => { view.step(); setPlayLabel(); };
$('b-reset').onclick = () => { view.reset(); setPlayLabel(); };
$('speed').oninput = (e) => (view.speed = +e.target.value);
for (const [id, fn] of [['xr-play', playBtn.onclick], ['xr-step', $('b-step').onclick], ['xr-reset', $('b-reset').onclick]]) $(id).onclick = fn;

// ---------------- robô real (Web Serial) ----------------
let link = null;
const connectBtn = $('b-connect');
if (!RobotLink.supported) { connectBtn.disabled = true; connectBtn.title = 'Web Serial indisponível neste navegador'; }
connectBtn.onclick = async () => {
  try {
    if (link?.connected) { await link.disconnect(); link = null; connectBtn.textContent = 'Conectar ESP32'; $('b-send').disabled = $('b-stop').disabled = true; return; }
    link = new RobotLink({
      onLog: log,
      onProgress: (n) => view.advanceTo(n),
      onSolved: (t) => { log(`Concluído${t ? ' em ' + t + ' s' : ''}.`); view.pause(); setPlayLabel(); },
      onStopped: () => log('Robô parado.'),
    });
    await link.connect();
    connectBtn.textContent = 'Desconectar'; $('b-stop').disabled = false; $('b-send').disabled = !result;
    log('Conectado.');
  } catch (e) { log('Falha ao conectar: ' + e.message); link = null; }
};
$('b-send').onclick = async () => {
  if (!result || !link?.connected) return;
  view.reset();                                           // a animação passa a seguir as mensagens i_N do robô
  await link.sendSolution(result.solution, result.count);
  log('Solução enviada; aguardando confirmação do robô…');
};
$('b-stop').onclick = () => link?.stop();

// ---------------- webcam ----------------
const HINT = [
  'U (topo): incline o cubo para mostrar o topo, com o lado de trás (B) para cima na imagem',
  'R (direita): mostre a face direita, com U para cima',
  'F (frente): mostre a face da frente, com U para cima',
  'D (base): incline mostrando a base, com a frente (F) para cima na imagem',
  'L (esquerda): mostre a face esquerda, com U para cima',
  'B (trás): mostre a face de trás, com U para cima',
];
const dlg = $('scan');
let scanner, scanTimer;
$('b-scan').onclick = async () => {
  scanner ??= new Scanner($('video'), $('guide'));
  try { await scanner.start(); } catch (e) { status('Webcam indisponível: ' + e.message); return; }
  dlg.showModal(); scanFace(0, []);
};
function endScan() { clearInterval(scanTimer); scanner.stop(); if (dlg.open) dlg.close(); }
dlg.addEventListener('close', () => { clearInterval(scanTimer); scanner?.stop(); });
$('b-scan-cancel').onclick = endScan;

function scanFace(i, faces) {
  clearInterval(scanTimer);
  if (i === 6) return finishScan(faces);
  let left = Math.max(2, Math.min(30, +$('delay').value || 6));
  const msg = $('scan-msg'), grab = () => {
    clearInterval(scanTimer);
    faces.push(scanner.capture());
    const th = document.createElement('span');
    faces[i].forEach(([r, g, b]) => { const p = document.createElement('i'); p.style.background = `rgb(${r | 0},${g | 0},${b | 0})`; th.append(p); });
    if (i === 0) $('thumbs').textContent = '';
    $('thumbs').append(th);
    scanFace(i + 1, faces);
  };
  const show = () => (msg.textContent = `Face ${i + 1}/6 — ${HINT[i]} · captura em ${left} s`);
  show();
  $('b-capture').onclick = grab;
  scanTimer = setInterval(() => { if (--left <= 0) grab(); else show(); }, 1000);
}
function finishScan(faces) {
  const r = scanner.interpret(faces);
  endScan();
  if (r.error) { status('Leitura incoerente: ' + r.error); $('out').textContent = `Leitura incoerente (${r.error})\nTente novamente com melhor iluminação.`; return; }
  setCube(r.state, r.cols); status(`Cubo lido (${r.method})`); runSolve();
}

// ---------------- WebXR ----------------
async function initXR() {
  const sup = await view.xrSupport();
  $('b-ar').disabled = !sup.ar; $('b-vr').disabled = !sup.vr;
  if (!sup.ar && !sup.vr) $('xr-note').textContent = 'WebXR indisponível aqui (precisa de HTTPS e de um dispositivo/navegador compatível). A visualização 3D funciona normalmente.';
  for (const [id, mode] of [['b-ar', 'immersive-ar'], ['b-vr', 'immersive-vr']]) {
    $(id).onclick = async () => {
      const ov = $('xr-overlay');
      try {
        ov.hidden = mode !== 'immersive-ar';
        await view.enterXR(mode, mode === 'immersive-ar' ? ov : undefined);
        view.xr.baseExperience.onStateChangedObservable.add((s) => { if (s === 3) ov.hidden = true; });
      } catch (e) { ov.hidden = true; status('XR falhou: ' + e.message); }
    };
  }
}

// ---------------- início ----------------
try {
  view = new CubeView($('view')); window.__cubotino = view;
  view.onProgress = (cur, tot) => { const p = tot ? Math.round((100 * cur) / tot) : 0; $('prog').value = p; $('pct').textContent = p + '%'; setPlayLabel(); };
  view.onDone = setPlayLabel;
  drawNet(); syncView();
  status('Pronto');
  initXR().catch(() => {});
  setTimeout(() => warmUp().then(() => status('Solver pronto')), 300);   // tabelas do solver em segundo plano
} catch (e) {
  status('Erro: ' + e.message); console.error(e);
}
window.addEventListener('error', (e) => status('Erro: ' + e.message));

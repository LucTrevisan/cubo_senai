// Estado do cubo (54 facelets, ordem Kociemba URFDLB) e permutações dos movimentos do robô.
// As permutações são derivadas da geometria (não de tabelas), e conferidas contra as tabelas do Python em test/.

export const FACES = 'URFDLB';
export const BASE_COLORS = ['#ffffff', '#d62d20', '#1faa4a', '#ffd400', '#ff7a00', '#1f5fd6']; // U R F D L B
export const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

// Eixos: +X = R, +Y = U, -Z = F (frente voltada para a câmera padrão do Babylon, sistema left-handed).
// Retorna [cx,cy,cz, nx,ny,nz] do facelet: posição do cubie e normal da face.
function facelet(f, row, col) {
  const i = col - 1, j = 1 - row;
  switch (f) {
    case 0: return [i, 1, 1 - row, 0, 1, 0];     // U (B no topo)
    case 1: return [1, j, col - 1, 1, 0, 0];     // R
    case 2: return [i, j, -1, 0, 0, -1];         // F
    case 3: return [i, -1, row - 1, 0, -1, 0];   // D (F no topo)
    case 4: return [-1, j, 1 - col, -1, 0, 0];   // L
    default: return [1 - col, j, 1, 0, 0, 1];    // B
  }
}

export const STICKERS = Array.from({ length: 54 }, (_, k) => facelet((k / 9) | 0, ((k % 9) / 3) | 0, k % 3));
const KEY = new Map(STICKERS.map((s, k) => [s.join(','), k]));

// Rotação de 90° (vetores inteiros) e rotação contínua por ângulo `a`, para a animação.
export const ROT = {
  flip: { v: (x, y, z) => [x, z, -y], at: (x, y, z, c, s) => [x, y * c + z * s, -y * s + z * c] },
  spinCW: { v: (x, y, z) => [-z, y, x], at: (x, y, z, c, s) => [x * c - z * s, y, x * s + z * c] },
};
ROT.spinCCW = {
  v: (x, y, z) => [z, y, -x],
  at: (x, y, z, c, s) => ROT.spinCW.at(x, y, z, c, -s),
};

function permutation(rot, inLayer) {
  const ref = new Array(54);
  STICKERS.forEach((st, i) => {
    if (!inLayer(st)) { ref[i] = i; return; }
    const c = rot(st[0], st[1], st[2]), n = rot(st[3], st[4], st[5]);
    ref[KEY.get([...c, ...n].join(','))] = i;
  });
  return ref;
}

const all = () => true, bottom = (s) => s[1] === -1;

export const PERM = {
  flip: permutation(ROT.flip.v, all),
  spin1: permutation(ROT.spinCW.v, all),
  spin3: permutation(ROT.spinCCW.v, all),
  rot1: permutation(ROT.spinCW.v, bottom),   // camada inferior no mesmo sentido do spin CW
  rot3: permutation(ROT.spinCCW.v, bottom),
};

/** Aplica um token do robô ('F','S','R' + dígito) ao estado (string de 54 letras); F repete n vezes. */
export function applyRobotToken(state, kind, n) {
  const times = kind === 'F' ? n : 1;
  const ref = kind === 'F' ? PERM.flip : PERM[(kind === 'S' ? 'spin' : 'rot') + n];
  let s = state;
  for (let t = 0; t < times; t++) s = ref.map((r) => s[r]).join('');
  return s;
}

export function applyRobotMoves(state, moves) {
  for (let i = 0; i < moves.length; i += 2) state = applyRobotToken(state, moves[i], +moves[i + 1]);
  return state;
}

/** Validação local rápida antes de chamar o solver (9 facelets por cor e centros distintos). */
export function validateState(s) {
  if (s.length !== 54 || /[^URFDLB]/.test(s)) return 'Cores incompletas ou inválidas.';
  const cnt = {};
  for (const ch of s) cnt[ch] = (cnt[ch] || 0) + 1;
  for (const f of FACES) if (cnt[f] !== 9) return `A cor ${f} aparece ${cnt[f] || 0}x (devem ser 9).`;
  for (let f = 0; f < 6; f++) if (s[f * 9 + 4] !== FACES[f]) return 'Os centros das faces estão trocados.';
  return null;
}

// ---- verificação de coerência física (equivalente ao face.verify do twophase) ----
const CF = [[8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11], [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51]];
const CC = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];
const EF = [[5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25], [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14]];
const EC = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];

const parity = (p) => { let s = 0; for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) s++; return s & 1; };

/** Retorna null se o cubo é fisicamente possível, ou uma mensagem de erro. */
export function verifyCube(s) {
  const e = validateState(s);
  if (e) return e;
  const cp = [], co = [], ep = [], eo = [];
  for (const f of CF) {
    const c = f.map((i) => s[i]);
    const ori = c.findIndex((x) => x === 'U' || x === 'D');
    const j = CC.findIndex((cc) => cc[0] === c[ori] && cc[1] === c[(ori + 1) % 3] && cc[2] === c[(ori + 2) % 3]);
    if (ori < 0 || j < 0) return 'Combinação de cores de canto inexistente.';
    cp.push(j); co.push(ori);
  }
  for (const f of EF) {
    const c = f.map((i) => s[i]).join('');
    let j = EC.indexOf(c), o = 0;
    if (j < 0) { j = EC.indexOf(c[1] + c[0]); o = 1; }
    if (j < 0) return 'Combinação de cores de aresta inexistente.';
    ep.push(j); eo.push(o);
  }
  if (new Set(cp).size !== 8 || new Set(ep).size !== 12) return 'Peças repetidas: cores lidas incorretamente.';
  if (co.reduce((a, b) => a + b) % 3) return 'Um canto está torcido (impossível).';
  if (eo.reduce((a, b) => a + b) % 2) return 'Uma aresta está invertida (impossível).';
  if (parity(cp) !== parity(ep)) return 'Paridade inválida (duas peças trocadas).';
  return null;
}

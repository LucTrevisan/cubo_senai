// Port de PC_files/Cubotino_moves.py: solução Kociemba -> movimentos do robô (S=Spin, F=Flip, R=Rotate).

export const MOVES_DICT = {
  U1: 'F2R1S3', U2: 'F2R1S3R1S3', U3: 'F2S1R3',
  D1: 'R1S3',    D2: 'R1S3R1S3',   D3: 'S1R3',
  F1: 'F1R1S3', F2: 'F1R1S3R1S3', F3: 'F1S1R3',
  B1: 'F3R1S3', B2: 'F3R1S3R1S3', B3: 'F3S1R3',
  L1: 'S3F3R1', L2: 'S3F3R1S3R1', L3: 'S1F1R3',
  R1: 'S3F1R1', R2: 'S3F1R1S3R1', R3: 'S1F3R3',
};

const OPP = { F: 'B', B: 'F', U: 'D', D: 'U', R: 'L', L: 'R' };

/** Rastreia que face do cubo está em cada lado do robô (L,F,R na horizontal; D,F,U na vertical). */
export class Orientation {
  constructor() { this.reset(); }
  reset() {
    this.h = { L: 'L', F: 'F', R: 'R' };
    this.v = { D: 'D', F: 'F', U: 'U' };
  }
  flip() {
    const { h, v } = this;
    v.D = v.F; v.F = v.U; v.U = OPP[v.D]; h.F = v.F;
  }
  spinCCW() {
    const { h, v } = this;
    h.L = h.F; h.F = h.R; h.R = OPP[h.L]; v.F = h.F;
  }
  spinCW() {
    const { h, v } = this;
    h.R = h.F; h.F = h.L; h.L = OPP[h.R]; v.F = h.F;
  }
  /** Aplica uma sequência de movimentos do robô (ex.: 'F1R1S3'). */
  update(seq) {
    for (let i = 0; i < seq.length; i += 2) {
      const n = +seq[i + 1];
      if (seq[i] === 'F') for (let j = 0; j < n; j++) this.flip();
      else if (seq[i] === 'S') n === 3 ? this.spinCCW() : this.spinCW();
    }
  }
  /** Lado do robô onde está a face pedida pelo solver (a 6ª face, se não está nos 5 lados, é B). */
  sideOf(face) {
    for (const [side, f] of Object.entries({ ...this.h, ...this.v })) if (f === face) return side;
    return 'B';
  }
}

/** Remove pares S1S3 / S3S1 consecutivos (mesma varredura do original, para índices idênticos ao ESP32). */
export function optimizeMoves(moves) {
  const len = moves.length;
  const cut = [];
  let idx = 0;
  for (let i = 0; i < len; i += 2) {
    const a = moves.substr(idx, 2), b = moves.substr(idx + 2, 2);
    if ((a === 'S1' && b === 'S3') || (a === 'S3' && b === 'S1')) { cut.push(idx); idx += 4; }
    idx += 2;
    if (idx >= len + 2) break;
  }
  if (!cut.length) return moves;
  const skip = new Set();
  for (const c of cut) for (let k = 0; k < 4; k++) skip.add(c + k);
  let out = '';
  for (let i = 0; i < len; i++) if (!skip.has(i)) out += moves[i];
  return out;
}

export function countMoves(moves) {
  let n = 0;
  for (let i = 0; i < moves.length; i += 2) {
    const c = moves[i];
    if (c === 'F') n += +moves[i + 1];
    else if (c === 'R' || c === 'S') n++;
  }
  return n;
}

/** Solução ('U2 L1 ...' ou 'U2L1...') -> { steps, moves, total }. */
export function robotRequiredMoves(solution) {
  const sol = solution.replace(/\s+/g, '');
  const o = new Orientation();
  const steps = [];
  let moves = '';
  for (let i = 0; i + 1 < sol.length; i += 2) {
    const side = o.sideOf(sol[i]);
    const seq = MOVES_DICT[side + sol[i + 1]];
    steps.push(seq);
    moves += seq;
    o.update(seq);
  }
  moves = optimizeMoves(moves);
  return { steps, moves, total: countMoves(moves) };
}

/** Notação do solver (R, R', R2) -> notação do projeto (R1, R3, R2). */
export function toProjectNotation(sol) {
  return sol.trim().split(/\s+/).filter(Boolean)
    .map((m) => m[0] + (m[1] === "'" ? '3' : m[1] === '2' ? '2' : '1')).join(' ');
}

/** Progresso restante após cada token do robô (equivale a left_Cubotino_moves da GUI). */
export function leftMoves(moves) {
  let left = countMoves(moves);
  const out = {};
  for (let i = 0; i < moves.length; i += 2) {
    left -= moves[i] === 'F' ? +moves[i + 1] : 1;
    out[i] = left;
  }
  return out;
}

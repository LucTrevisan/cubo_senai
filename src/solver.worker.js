// Solver Kociemba two-phase (min2phase) fora da thread principal.
// probeMin=5000 faz a busca continuar até achar soluções mais curtas (média ~18.7 movimentos, ~0.4 s), análogo ao
// "max 18 movimentos / timeout 2 s" do twophase em Python.
import min2phase from 'min2phase.js';

const PROBE_MIN = 5000;
let ready = false;
const init = () => { if (!ready) { min2phase.initFull(); ready = true; } };

self.onmessage = ({ data: { id, type, state } }) => {
  try {
    if (type === 'random') return self.postMessage({ id, ok: true, state: min2phase.randomCube() });
    init();
    if (type === 'init') return self.postMessage({ id, ok: true });
    const s = new min2phase.Search().solution(state, 21, 1e9, PROBE_MIN).trim();
    self.postMessage(s.startsWith('Error') ? { id, ok: false, error: `Solver: ${s}` } : { id, ok: true, solution: s });
  } catch (e) {
    self.postMessage({ id, ok: false, error: String((e && e.message) || e) });
  }
};

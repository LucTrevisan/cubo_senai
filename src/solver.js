import { verifyCube } from './cube.js';
import { toProjectNotation } from './moves.js';

let worker, seq = 0;
const pending = new Map();

function ensure() {
  if (worker) return worker;
  worker = new Worker(new URL('./solver.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => { pending.get(data.id)?.(data); pending.delete(data.id); };
  return worker;
}
const call = (msg) => new Promise((res) => { const id = ++seq; pending.set(id, res); ensure().postMessage({ id, ...msg }); });

/** Pré-aquece as tabelas do solver em segundo plano. */
export const warmUp = () => call({ type: 'init' });

/** Cubo aleatório (string de 54 letras), gerado no worker. */
export const randomCube = async () => (await call({ type: 'random' })).state;

/** state (54 letras) -> { solution: 'U1 R3 ...' (notação do projeto), count } ou { error }. */
export async function solve(state) {
  const err = verifyCube(state);
  if (err) return { error: err };
  const r = await call({ type: 'solve', state });
  if (!r.ok) return { error: r.error };
  if (r.solution == null) return { error: 'Sem solução em até 22 movimentos.' };
  const solution = toProjectNotation(r.solution);
  return { solution, count: solution ? solution.split(' ').length : 0 };
}

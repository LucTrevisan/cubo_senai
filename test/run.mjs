// Testes: permutações vs tabelas do Python, tradução de movimentos vs Cubotino_moves.py, e solução ponta a ponta.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PERM, applyRobotMoves, SOLVED } from '../src/cube.js';
import { robotRequiredMoves, toProjectNotation } from '../src/moves.js';

const require = createRequire(import.meta.url);
const m2p = require('min2phase.js');
const here = path.dirname(fileURLToPath(import.meta.url));
const pcFiles = path.resolve(here, '../../PC_files');

// 1) tabelas de Cubotino_GUI.cube_facelets_permutation
const PY = {
  flip: [53,52,51,50,49,48,47,46,45,11,14,17,10,13,16,9,12,15,0,1,2,3,4,5,6,7,8,18,19,20,21,22,23,24,25,26,42,39,36,43,40,37,44,41,38,35,34,33,32,31,30,29,28,27],
  spin1: [2,5,8,1,4,7,0,3,6,18,19,20,21,22,23,24,25,26,36,37,38,39,40,41,42,43,44,33,30,27,34,31,28,35,32,29,45,46,47,48,49,50,51,52,53,9,10,11,12,13,14,15,16,17],
  spin3: [6,3,0,7,4,1,8,5,2,45,46,47,48,49,50,51,52,53,9,10,11,12,13,14,15,16,17,29,32,35,28,31,34,27,30,33,18,19,20,21,22,23,24,25,26,36,37,38,39,40,41,42,43,44],
  rot1: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,24,25,26,18,19,20,21,22,23,42,43,44,33,30,27,34,31,28,35,32,29,36,37,38,39,40,41,51,52,53,45,46,47,48,49,50,15,16,17],
  rot3: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,51,52,53,18,19,20,21,22,23,15,16,17,29,32,35,28,31,34,27,30,33,36,37,38,39,40,41,24,25,26,45,46,47,48,49,50,42,43,44],
};
for (const k of Object.keys(PY)) assert.deepEqual(PERM[k], PY[k], `permutação ${k} difere do Python`);
console.log('ok  permutações idênticas às tabelas do Python (5/5)');

// 2) + 3) cubos aleatórios
m2p.initFull();
const py = `
import sys; sys.path.insert(0, r'${pcFiles}')
import Cubotino_moves as cm
for line in sys.stdin.read().splitlines():
    if line: print(cm.robot_required_moves(line, '')[1])
`;
const N = 40, sols = [], states = [];
for (let i = 0; i < N; i++) {
  const st = m2p.randomCube();
  states.push(st);
  sols.push(toProjectNotation(m2p.solve(st)));
}
const expected = execFileSync('python', ['-I', '-c', py], { input: sols.join('\n') }).toString().trim().split(/\r?\n/);
let total = 0;
for (let i = 0; i < N; i++) {
  const { moves } = robotRequiredMoves(sols[i]);
  assert.equal(moves, expected[i], `movimentos diferentes do Python p/ ${sols[i]}`);
  const end = applyRobotMoves(states[i], moves);
  for (let f = 0; f < 6; f++) assert.ok(/^(.)\1{8}$/.test(end.slice(f * 9, f * 9 + 9)), `cubo não resolvido (${sols[i]})`);
  total += moves.length / 2;
}
assert.equal(applyRobotMoves(SOLVED, ''), SOLVED);
console.log(`ok  ${N} cubos aleatórios: movimentos idênticos ao Cubotino_moves.py e cubo resolvido após simular o robô`);

// 4) verificação física + classificação de cor (com ruído) a partir de cores sintéticas
import { verifyCube } from '../src/cube.js';
import { interpretLab, interpretHSV } from '../src/color.js';
for (const s of states) assert.equal(verifyCube(s), null);
const bad = states[0].split(''); [bad[0], bad[1]] = [bad[1], bad[0]];
assert.ok(verifyCube(bad.join('')) !== null || bad[0] === bad[1]);
const PAL = { U: [235, 235, 225], R: [190, 30, 40], F: [30, 150, 70], D: [235, 210, 40], L: [240, 110, 20], B: [30, 70, 190] };
let okLab = 0, okHsv = 0;
for (const s of states) {
  const rgb = [...s].map((ch) => PAL[ch].map((v) => Math.max(0, Math.min(255, v + (Math.random() - 0.5) * 30))));
  if (interpretLab(rgb) === s) okLab++;
  const clean = [...s].map((ch) => PAL[ch]);
  if (interpretHSV(clean) === s) okHsv++;   // o HSV é só fallback: validado sem ruído
}
assert.ok(okLab >= N - 1 && okHsv >= N - 1, `classificação de cor: lab ${okLab}/${N}, hsv ${okHsv}/${N}`);
console.log(`ok  verifyCube e classificação de cor com ruído (Lab c/ ruído ${okLab}/${N}, HSV sem ruído ${okHsv}/${N})`);

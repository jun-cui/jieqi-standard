#!/usr/bin/env node
// Generate the conformance vectors in ../../conformance from the reference
// implementation. Run after any change to the rules or the formats, then
// review the diff: the vectors are part of the standard.

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Position, Game, START_JPS, RED, BLACK, legalMoves, decisionCode, generalInDanger, displayMove,
  parseMoveCode, revealOdds, unknownCaptured, treeCount, seededLayout, SeedStream, commitment,
  arrangementIndex, POOL_TYPES, validateRecord, redactRecord, formatRecord,
} from '../src/index.js';
import { stringify } from './json.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '..', '..', 'conformance');
const EXAMPLES = resolve(here, '..', '..', 'examples');
mkdirSync(resolve(OUT, 'records'), { recursive: true });

const write = (name, data) => writeFileSync(resolve(OUT, name), stringify(data) + '\n');

const demo = JSON.parse(readFileSync(resolve(EXAMPLES, 'demo-match', 'game-public.jgr'), 'utf8'));
const demoPositions = [];
{
  const g = new Game(Position.parse(demo.start));
  demo.moves.forEach((code, i) => {
    g.play(code);
    if ((i + 1) % 10 === 0 && !g.result) demoPositions.push(g.position.toJPS());
  });
}

// ---------------------------------------------------------------------------
// positions.json

const validPositions = [
  ['the starting position', START_JPS],
  ['after h2e2=C b7b0=C:? (public view)', 'xxxxgxxxx/9/7x1/x1x1x1x1x/9/9/X1X1X1X1X/1X2C4/9/XcXXGXXXX r A2E2H2R2C1S5 a2e2h2r2c1s5 0 2'],
  ['the same position, as Black (told the capture was a Horse)', 'xxxxgxxxx/9/7x1/x1x1x1x1x/9/9/X1X1X1X1X/1X2C4/9/XcXXGXXXX r A2E2H1R2C1S5 a2e2h2r2c1s5 0 2'],
  ['revealed Advisor on its starting point', '3g5/9/9/9/9/9/9/9/9/3AG4 r - - 0 1'],
  ['revealed Elephant before the river', '3g5/9/9/9/9/2E6/9/9/9/4G4 r - - 0 1'],
  ['blocked elephant eye', '3g5/9/9/9/3s5/2E6/9/9/9/4G4 r - - 0 1'],
  ['hobbled Horse', '3g5/9/9/9/9/9/9/9/1S7/1H2G4 r - - 0 1'],
  ['Cannon screens', '3g5/9/r8/9/s8/9/9/9/9/C3G4 r - - 0 1'],
  ['Soldier across the river', '3g5/9/9/9/4S4/9/9/9/9/4G4 r - - 0 1'],
  ['Soldier on the far baseline', 'S2g5/9/9/9/9/9/9/9/9/4G4 r - - 0 1'],
  ['Horse pinned between the Generals', '4g4/9/9/9/9/9/4H4/9/9/4G4 r - - 0 1'],
  ['dark Chariot-role piece', 'x3g4/9/9/9/S8/9/9/9/9/3G5 b - r1 0 1'],
  ['kill', 'R3g4/R8/9/9/9/9/9/9/9/3G5 b - - 0 1'],
  ['trap', '4g4/R8/9/9/9/9/9/9/5R3/3G5 b - - 0 1'],
  ['arbiter position (layout from seed "demo")', `${START_JPS} ${seededLayout(Position.start(), 'demo')}`],
  ...demoPositions.map((jps, i) => [`demonstration game, after move ${(i + 1) * 10}`, jps]),
];

const invalidPositions = [
  ['adjacent digits', 'xxxxgxxxx/45/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX r A2E2H2R2C2S5 a2e2h2r2c2s5 0 1'],
  ['pool out of order', 'xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX r E2A2H2R2C2S5 a2e2h2r2c2s5 0 1'],
  ['zero count written', '3g5/9/9/9/9/9/9/9/9/4G4 r A0 - 0 1'],
  ['Red pool in lowercase', 'xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX r a2e2h2r2c2s5 a2e2h2r2c2s5 0 1'],
  ['double space', 'xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX  r A2E2H2R2C2S5 a2e2h2r2c2s5 0 1'],
  ['turn letter other than r or b', 'xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX w A2E2H2R2C2S5 a2e2h2r2c2s5 0 1'],
  ['leading zero', 'xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX r A2E2H2R2C2S5 a2e2h2r2c2s5 00 1'],
  ['round 0', 'xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX r A2E2H2R2C2S5 a2e2h2r2c2s5 0 0'],
  ['row of 8 points', 'xxxxgxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX r A2E2H2R2C2S5 a2e2h2r2c2s5 0 1'],
  ['dark piece off its starting points', '3g5/9/9/9/9/4X4/9/9/9/4G4 r A1 - 0 1'],
  ['General outside its palace', '3g5/9/9/9/9/9/9/9/9/G8 r - - 0 1'],
  ['three Red Chariots', '3g5/9/9/9/9/9/9/9/9/RRR1G4 r - - 0 1'],
  ['pool smaller than the dark pieces', '3g5/9/9/9/9/9/9/9/9/X3G4 r - - 0 1'],
  ['facing Generals', '4g4/9/9/9/9/9/9/9/9/4G4 r - - 0 1'],
  ['the side not to move is under jiang', 'R3g4/9/9/9/9/9/9/9/R8/3G5 r - - 0 1'],
  ['layout that does not match the pool', `${START_JPS} ${'S'.repeat(15)}${'s'.repeat(15)}`],
  ['limit count above 120', '5g3/9/9/9/9/9/S8/9/9/3G5 r - - 121 70'],
];

const describe = (jps) => {
  const pos = Position.parse(jps);
  const pools = {};
  for (const side of [RED, BLACK]) {
    pools[side === RED ? 'red' : 'black'] = {
      dark_pieces: pos.darkCount(side),
      unknown_captured: unknownCaptured(pos, side),
      odds: Object.fromEntries(revealOdds(pos, side).map((o) => [o.letter, `${o.count}/${o.total}`])),
    };
  }
  const game = new Game(pos);
  return {
    jiang: generalInDanger(pos.board, pos.turn),
    legal_moves: legalMoves(pos).map(decisionCode).sort(),
    result: game.result ? `${game.result.outcome} ${game.result.reason}` : null,
    pools,
  };
};

write('positions.json', {
  description: 'JPS parsing and validity (Spec 3), legal moves (Spec 1), jiang, results by rule, and reveal odds (Spec 8). legal_moves are decision codes, sorted.',
  valid: validPositions.map(([name, jps]) => ({ name, jps, ...describe(jps) })),
  invalid: invalidPositions.map(([name, jps]) => {
    let accepted = true;
    try {
      Position.parse(jps);
    } catch {
      accepted = false;
    }
    if (accepted) throw new Error(`vector "${name}" is accepted by the reference implementation`);
    return { name, jps };
  }),
});

// ---------------------------------------------------------------------------
// moves.json

const display = [];
const addDisplay = (jps, code) => {
  const pos = Position.parse(jps);
  display.push({ jps, move: code, en: displayMove(pos, code), zh: displayMove(pos, code, { lang: 'zh' }) });
};
for (const code of ['h2e2=C', 'b0c2=R', 'b2b9=H:?', 'i0i1=S', 'e3e4=S', 'd0e1=A', 'c0e2=E']) addDisplay(START_JPS, code);
addDisplay('xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X2R4/9/XXXXGXXXX b A2E2H2R1C2S5 a2e2h2r2c2s5 0 1', 'h7e7=S');
for (const code of ['a5a6', 'a0a1', 'a5b5', 'b0c2', 'c0e2', 'd0e1', 'e0e1', 'e0f0']) addDisplay('3g5/9/9/9/R8/9/9/9/9/RHEAG4 r - - 0 1', code);
for (const code of ['e5e6', 'c5c6', 'a5b5', 'c3c4']) addDisplay('3g5/9/9/9/S1S1S4/9/2S6/9/9/4G4 r - - 0 1', code);
{
  const g = new Game(Position.parse(demo.start));
  demo.moves.slice(0, 40).forEach((code) => {
    display.push({ jps: g.position.toJPS(), move: code, en: displayMove(g.position, code), zh: displayMove(g.position, code, { lang: 'zh' }) });
    g.play(code);
  });
}

write('moves.json', {
  description: 'Move code syntax (spec 4, section 2) and traditional notation (spec 4, section 5). The notation is computed from the position before the move.',
  valid_codes: ['h2e2', 'h2e2=R', 'b2b9=C:H', 'b2b9=C:?', 'a0a9:S', 'i9i0:?', 'e0e1'].map((code) => {
    const m = parseMoveCode(code);
    return { code, from: code.slice(0, 2), to: code.slice(2, 4), reveal: m.reveal ? code.split('=')[1][0] : null, disclosure: m.captured ? code.split(':')[1] : null };
  }),
  invalid_codes: ['h2h2', 'h2e2=G', 'h2e2=c', 'h2e2=X', 'h2e2:', 'H2E2', 'h2-e2', 'h2e2=C=R', 'h2e2:H=C', 'j0a0', 'a10a9', 'h2e2 ', ''],
  display,
});

// ---------------------------------------------------------------------------
// tree-counts.json

const counts = [];
const addCount = (name, jps, depth) => {
  const pos = Position.parse(jps);
  const mode = pos.layout ? 'layout' : 'chance';
  counts.push({ name, jps, mode, counts: Array.from({ length: depth }, (_, d) => treeCount(pos, d + 1)) });
};
addCount('the starting position', START_JPS, 3);
addCount('the starting position, layout from seed "demo"', `${START_JPS} ${seededLayout(Position.start(), 'demo')}`, 3);
addCount('the starting position, unshuffled layout', `${START_JPS} rheaaehrccsssssSSSSSCCRHEAAEHR`, 3);
for (const [i, jps] of demoPositions.slice(0, 4).entries()) addCount(`demonstration game, after move ${(i + 1) * 10}`, jps, 2);
write('tree-counts.json', {
  description: 'Tree counts (Spec 8, section 5). counts[d-1] is the count at depth d.',
  vectors: counts,
});

// ---------------------------------------------------------------------------
// shuffle.json

const stream = new SeedStream('demo');
const words = Array.from({ length: 8 }, () => stream.nextUint32());
const typesOf = (s) => [...s.toUpperCase()].map((ch) => POOL_TYPES['AEHRCS'.indexOf(ch)]);
const seeds = ['demo', 'harbor', 'jieqi', '揭棋', 'research-000001'].map((seed) => {
  const layout = seededLayout(Position.start(), seed);
  return { seed, layout, layout_numbers: { black: arrangementIndex(typesOf(layout.slice(0, 15))), red: arrangementIndex(typesOf(layout.slice(15))) } };
});
const board = Position.start().boardField();
write('shuffle.json', {
  description: 'Seeded layouts from the starting position, stream words, commitments (Spec 6).',
  stream: { seed: 'demo', first_words: words },
  seeded_layouts: seeds,
  commitments: ['00'.repeat(32), 'ab'.repeat(32)].map((salt) => ({ board, layout: seeds[0].layout, salt, commitment: commitment(board, seeds[0].layout, salt) })),
  unshuffled: { layout: 'rheaaehrccsssssSSSSSCCRHEAAEHR', layout_numbers: { black: arrangementIndex(typesOf('rheaaehrccsssss')), red: arrangementIndex(typesOf('SSSSSCCRHEAAEHR')) } },
});

// ---------------------------------------------------------------------------
// games.json: scripted games with the result the rules decide

const games = [
  ['kill on the spot', 'R3g4/R8/9/9/9/9/9/9/9/3G5 b - - 0 1', []],
  ['trap on the spot', '4g4/R8/9/9/9/9/9/9/5R3/3G5 b - - 0 1', []],
  ['perpetual jiang', '4g4/9/9/9/R8/9/9/9/9/3G5 r - - 0 1', 'a5e5 e9f9 e5f5 f9e9 f5e5 e9f9 e5f5 f9e9 f5e5'],
  ['perpetual chase', '5g3/9/9/1h7/9/4R4/9/9/9/4G4 r - - 0 1', 'e4e6 b6c4 e6e4 c4b6 e4e6 b6c4 e6e4 c4b6'],
  ['idle repetition', '5g3/9/9/9/9/9/S8/9/9/3G5 r - - 0 1', 'd0d1 f9f8 d1d0 f8f9 d0d1 f9f8 d1d0 f8f9'],
  ['natural move limit', '5g3/9/9/9/9/9/S8/9/9/3G5 r - - 119 60', 'd0d1'],
  ['bare Generals', '5g3/9/9/9/9/9/9/9/3s5/3G5 r - - 0 1', 'd0d1'],
  ['the demonstration game (public view)', demo.start, demo.moves.join(' ')],
].map(([name, start, moves]) => {
  const list = typeof moves === 'string' ? moves.split(' ') : moves;
  const g = Game.fromMoves(Position.parse(start), list);
  return { name, start, moves: list, final: g.position.toJPS(), result: g.result ? { outcome: g.result.outcome, reason: g.result.reason } : null };
});
write('games.json', { description: 'Scripted games and the result the rules decide (Spec 1, Rules 8-9).', games });

// ---------------------------------------------------------------------------
// records/: valid and invalid records

const arbiter = JSON.parse(readFileSync(resolve(EXAMPLES, 'demo-match', 'game-arbiter.jgr'), 'utf8'));
const records = [];
const addRecord = (file, record, valid, why) => {
  writeFileSync(resolve(OUT, 'records', file), formatRecord(record));
  const check = validateRecord(record);
  if (check.ok !== valid) throw new Error(`record vector ${file}: expected ${valid ? 'valid' : 'invalid'}, got ${check.errors.join('; ')}`);
  records.push({ file, valid, why });
};
addRecord('valid-arbiter.jgr', arbiter, true, 'the demonstration game, arbiter view');
addRecord('valid-red.jgr', redactRecord(arbiter, 'red'), true, 'redacted to the red view');
addRecord('valid-public.jgr', redactRecord(arbiter, 'public'), true, 'redacted to the public view');
const leak = redactRecord(arbiter, 'public');
leak.moves[0] = arbiter.moves[0];
addRecord('invalid-leaked-disclosure.jgr', leak, false, 'a public record that discloses a captured identity');
const tampered = structuredClone(arbiter);
tampered.shuffle.layout = tampered.shuffle.layout.replace(/^(.)(.)/, '$2$1');
addRecord('invalid-tampered-layout.jgr', tampered, false, 'the layout no longer matches the commitment or the seed');
const opened = { ...redactRecord(arbiter, 'red'), shuffle: { ...arbiter.shuffle } };
addRecord('invalid-layout-in-player-view.jgr', opened, false, 'a red-view record must not contain the layout');
const wrongResult = { ...redactRecord(arbiter, 'public'), result: { outcome: 'black-win', reason: 'kill' } };
addRecord('invalid-wrong-result.jgr', wrongResult, false, 'the result contradicts the final position');
const truncated = { ...redactRecord(arbiter, 'public'), moves: arbiter.moves.slice(0, 20).map((m) => m.replace(/:[AEHRCS]$/, ':?')) };
addRecord('invalid-missing-result-claim.jgr', { ...truncated, result: { outcome: 'red-win', reason: 'kill' } }, false, 'claims a kill that the board does not show');
addRecord('valid-unfinished.jgr', (({ result, ...rest }) => rest)(truncated), true, 'an unfinished game has no result');
write('records.json', { description: 'Records and whether a conforming reader accepts them (Spec 5, section 5).', records });

console.log(`wrote conformance vectors to ${OUT}`);

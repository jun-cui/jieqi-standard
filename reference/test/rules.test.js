import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Position, Game, legalMoves, decisionCode, parsePoint, RED, BLACK, START_JPS, generalInDanger,
} from '../src/index.js';

const movesOf = (jps, point) => legalMoves(Position.parse(jps))
  .filter((m) => (m & 127) === parsePoint(point)).map(decisionCode).sort();

const playAll = (jps, codes) => {
  const g = new Game(Position.parse(jps));
  for (const c of codes) g.play(c);
  return g;
};

test('the starting position has 44 legal moves', () => {
  assert.equal(legalMoves(Position.start()).length, 44);
});

test('a dark piece moves in role: Advisor role stays in the palace (Rule 3.3)', () => {
  assert.deepEqual(movesOf(START_JPS, 'd0'), ['d0e1']);
  assert.deepEqual(movesOf(START_JPS, 'a3'), ['a3a4']);
  assert.deepEqual(movesOf(START_JPS, 'c0'), ['c0a2', 'c0e2']);
  assert.equal(movesOf(START_JPS, 'b2').length, 12);
  assert.ok(movesOf(START_JPS, 'b2').includes('b2b9'), 'Cannon role captures over the screen on b7');
});

test('a revealed Advisor roams the board (Rule 4.2)', () => {
  assert.deepEqual(movesOf('3g5/9/9/9/9/9/9/9/9/3AG4 r - - 0 1', 'd0'), ['d0c1', 'd0e1']);
  assert.deepEqual(movesOf('3g5/9/9/9/9/4A4/9/9/9/4G4 r - - 0 1', 'e4'), ['e4d3', 'e4d5', 'e4f3', 'e4f5']);
});

test('a revealed Elephant crosses the river; a filled eye blocks it (Rule 4.3)', () => {
  assert.deepEqual(movesOf('3g5/9/9/9/9/2E6/9/9/9/4G4 r - - 0 1', 'c4'), ['c4a2', 'c4a6', 'c4e2', 'c4e6']);
  assert.deepEqual(movesOf('3g5/9/9/9/3s5/2E6/9/9/9/4G4 r - - 0 1', 'c4'), ['c4a2', 'c4a6', 'c4e2']);
});

test('a hobbled Horse cannot move past its leg (Rule 4.4)', () => {
  assert.deepEqual(movesOf('3g5/9/9/9/9/9/9/9/9/1H2G4 r - - 0 1', 'b0'), ['b0a2', 'b0c2', 'b0d1']);
  assert.deepEqual(movesOf('3g5/9/9/9/9/9/9/9/1S7/1H2G4 r - - 0 1', 'b0'), ['b0d1']);
});

test('a Cannon captures over exactly one screen (Rule 4.6)', () => {
  const jps = '3g5/9/r8/9/s8/9/9/9/9/C3G4 r - - 0 1';
  assert.deepEqual(movesOf(jps, 'a0'), ['a0a1', 'a0a2', 'a0a3', 'a0a4', 'a0a7', 'a0b0', 'a0c0', 'a0d0']);
});

test('Soldiers: forward only on the own side, sideways after the river, sideways only on the far baseline (Rule 4.7)', () => {
  assert.deepEqual(movesOf('3g5/9/9/9/9/9/4S4/9/9/4G4 r - - 0 1', 'e3'), ['e3e4']);
  assert.deepEqual(movesOf('3g5/9/9/9/4S4/9/9/9/9/4G4 r - - 0 1', 'e5'), ['e5d5', 'e5e6', 'e5f5']);
  assert.deepEqual(movesOf('S2g5/9/9/9/9/9/9/9/9/4G4 r - - 0 1', 'a9'), ['a9b9']);
  assert.deepEqual(movesOf('3g5/9/9/9/9/9/9/9/9/2S1G4 r - - 0 1', 'c0'), ['c0c1']);
});

test('facing Generals: an open column between the Generals is illegal (Rule 6.2)', () => {
  // The Red Horse on e3 is the only piece between the Generals: every Horse move would open the column.
  assert.deepEqual(movesOf('4g4/9/9/9/9/9/4H4/9/9/4G4 r - - 0 1', 'e3'), []);
  assert.deepEqual(movesOf('3g5/9/9/9/9/9/9/9/9/4G4 r - - 0 1', 'e0'), ['e0e1', 'e0f0']);
  assert.throws(() => Position.parse('4g4/9/9/9/9/9/9/9/9/4G4 r - - 0 1'), /General/);
});

test('dark pieces block, and threaten only by role', () => {
  // The dark piece on e6 stands between the Red Chariot and the Black General.
  const p = Position.parse('4g4/9/9/4x4/9/4R4/9/9/9/3G5 b - s1 0 1');
  assert.equal(generalInDanger(p.board, BLACK), false);
  // A dark piece on a Chariot point moves and captures as a Chariot.
  assert.deepEqual(movesOf('x3g4/9/9/9/S8/9/9/9/9/3G5 b - r1 0 1', 'a9'),
    ['a9a5', 'a9a6', 'a9a7', 'a9a8', 'a9b9', 'a9c9', 'a9d9']);
});

test('kill: under jiang with no legal move loses (Rule 8.1)', () => {
  const g = new Game(Position.parse('R3g4/R8/9/9/9/9/9/9/9/3G5 b - - 0 1'));
  assert.deepEqual(g.result, { outcome: 'red-win', reason: 'kill' });
});

test('trap: no legal move without jiang also loses (Rule 8.1)', () => {
  const g = new Game(Position.parse('4g4/R8/9/9/9/9/9/9/5R3/3G5 b - - 0 1'));
  assert.deepEqual(g.result, { outcome: 'red-win', reason: 'trap' });
});

test('perpetual jiang loses (Rule 9.6)', () => {
  const g = playAll('4g4/9/9/9/R8/9/9/9/9/3G5 r - - 0 1',
    ['a5e5', 'e9f9', 'e5f5', 'f9e9', 'f5e5', 'e9f9', 'e5f5', 'f9e9', 'f5e5']);
  assert.equal(g.result.outcome, 'black-win');
  assert.equal(g.result.reason, 'perpetual-jiang');
  assert.equal(g.history.length, 9);
});

test('perpetual chase of an undefended piece loses (Rules 9.5-9.6)', () => {
  const g = playAll('5g3/9/9/1h7/9/4R4/9/9/9/4G4 r - - 0 1',
    ['e4e6', 'b6c4', 'e6e4', 'c4b6', 'e4e6', 'b6c4', 'e6e4', 'c4b6']);
  assert.equal(g.result.outcome, 'black-win');
  assert.equal(g.result.reason, 'perpetual-chase');
  assert.deepEqual(g.result.span.kinds, ['chase', 'idle', 'chase', 'idle', 'chase', 'idle', 'chase', 'idle']);
});

test('idle repetition is a draw (Rule 9.6)', () => {
  const g = playAll('5g3/9/9/9/9/9/S8/9/9/3G5 r - - 0 1',
    ['d0d1', 'f9f8', 'd1d0', 'f8f9', 'd0d1', 'f9f8', 'd1d0', 'f8f9']);
  assert.deepEqual([g.result.outcome, g.result.reason], ['draw', 'repetition']);
});

test('the natural move limit draws after 120 moves without capture or reveal (Rule 8.3)', () => {
  const g = playAll('5g3/9/9/9/9/9/S8/9/9/3G5 r - - 119 60', ['d0d1']);
  assert.deepEqual(g.result, { outcome: 'draw', reason: 'move-limit' });
});

test('bare Generals draw (Rule 8.4)', () => {
  const g = playAll('5g3/9/9/9/9/9/9/9/3s5/3G5 r - - 0 1', ['d0d1']);
  assert.deepEqual(g.result, { outcome: 'draw', reason: 'bare-generals' });
});

test('outcomes are required exactly when hidden information is involved', () => {
  const g = new Game();
  assert.throws(() => g.play('h2e2'), /reveal/);
  assert.throws(() => g.play('e0e1=C'), /revealed already/);
  g.play('h2e2=C');
  assert.throws(() => g.play('b7b0=C'), /identity or "\?"/);
  g.play('b7b0=C:?');
  assert.equal(g.position.toJPS(), 'xxxxgxxxx/9/7x1/x1x1x1x1x/9/9/X1X1X1X1X/1X2C4/9/XcXXGXXXX r A2E2H2R2C1S5 a2e2h2r2c1s5 0 2');
});

test('reveals must come from the pool', () => {
  const g = new Game();
  for (const c of ['h2e2=C', 'e6e5=S', 'b2b4=C', 'a6a5=S']) g.play(c);
  assert.throws(() => g.play('a3a4=C'), /not in the pool/);
});

test('turn order and round counting', () => {
  const g = new Game();
  g.play('e3e4=S');
  assert.equal(g.turn, BLACK);
  g.play('e6e5=S');
  assert.equal(g.turn, RED);
  assert.equal(g.position.round, 2);
  assert.equal(g.position.limitCount, 0);
});

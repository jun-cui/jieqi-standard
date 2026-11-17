import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Position, START_JPS, parseMoveCode, formatMoveCode, UNKNOWN, displayMove, revealOdds,
  unknownCaptured, treeCount, Game, RED, BLACK, seededLayout, oddsFraction,
} from '../src/index.js';

test('JPS round-trips the starting position', () => {
  assert.equal(Position.parse(START_JPS).toJPS(), START_JPS);
  assert.equal(Position.start().key(), START_JPS.split(' ').slice(0, 4).join(' '));
});

test('JPS parsing is strict: only canonical spellings are accepted', () => {
  const bad = {
    'two digits in a row': 'xxxxgxxxx/45/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX r A2E2H2R2C2S5 a2e2h2r2c2s5 0 1',
    'pool out of order': 'xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX r E2A2H2R2C2S5 a2e2h2r2c2s5 0 1',
    'zero count': 'xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX r A2E2H2R2C2S5G0 a2e2h2r2c2s5 0 1',
    'wrong case': 'xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX r a2e2h2r2c2s5 a2e2h2r2c2s5 0 1',
    'double space': 'xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX  r A2E2H2R2C2S5 a2e2h2r2c2s5 0 1',
    'Western turn letter': 'xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX w A2E2H2R2C2S5 a2e2h2r2c2s5 0 1',
    'leading zero': 'xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX r A2E2H2R2C2S5 a2e2h2r2c2s5 00 1',
    'round zero': 'xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX r A2E2H2R2C2S5 a2e2h2r2c2s5 0 0',
  };
  for (const [why, jps] of Object.entries(bad)) assert.throws(() => Position.parse(jps), undefined, why);
});

test('JPS validity: darks on starting points, Generals in palaces, pools within limits', () => {
  assert.match(Position.parse('3g5/9/9/9/9/4X4/9/9/9/4G4 r A1 - 0 1', { validate: false }).problems()[0], /not one of Red's starting points/);
  assert.match(Position.parse('3g5/9/9/9/9/9/9/9/9/G8 r - - 0 1', { validate: false }).problems()[0], /outside its palace/);
  assert.match(Position.parse('3g5/9/9/9/9/9/9/9/9/RRR1G4 r - - 0 1', { validate: false }).problems()[0], /more than 2/);
  assert.match(Position.parse('3g5/9/9/9/9/9/9/9/9/X3G4 r - - 0 1', { validate: false }).problems()[0], /pool holds 0 identities for 1/);
});

test('the layout field: one letter per dark piece in board order, matching the pools', () => {
  const layout = seededLayout(Position.start(), 'example');
  const p = Position.parse(`${START_JPS} ${layout}`);
  assert.equal(p.layoutString(), layout);
  assert.equal(p.toJPS({ layout: true }), `${START_JPS} ${layout}`);
  assert.throws(() => Position.parse(`${START_JPS} ${layout.slice(1)}`), /letters for 30/);
  assert.throws(() => Position.parse(`${START_JPS} ${layout.toUpperCase()}`), /wrong case/);
});

test('move codes: decisions and outcomes', () => {
  assert.deepEqual(parseMoveCode('h2e2'), { from: 25, to: 22, move: 25 | (22 << 7), reveal: 0, captured: 0 });
  const m = parseMoveCode('b2b9=C:H');
  assert.equal(m.reveal, 6);
  assert.equal(m.captured, 4);
  assert.equal(parseMoveCode('b2b9=C:?').captured, UNKNOWN);
  assert.equal(formatMoveCode(m), 'b2b9=C:H');
  for (const bad of ['h2h2', 'h2e2=G', 'h2e2=c', 'h2e2:', 'H2E2', 'h2-e2', 'h2e2=C=R', 'h2e2:H=C', 'j0a0']) {
    assert.throws(() => parseMoveCode(bad), undefined, bad);
  }
});

test('traditional notation in English and Chinese', () => {
  const start = Position.start();
  assert.equal(displayMove(start, 'h2e2=C'), 'XC2.5(C)');
  assert.equal(displayMove(start, 'h2e2=H', { lang: 'zh' }), '暗炮二平五(马)');
  assert.equal(displayMove(start, 'b0c2=R', { lang: 'zh' }), '暗马八进七(车)');
  const g = new Game();
  g.play('h2e2=R');
  assert.equal(displayMove(g.position, 'h7e7=S', { lang: 'zh' }), '暗炮８平５(卒)');
  const revealed = Position.parse('3g5/9/9/9/R8/9/9/9/9/RHEAG4 r - - 0 1');
  assert.equal(displayMove(revealed, 'a5a6', { lang: 'zh' }), '前车进一');
  assert.equal(displayMove(revealed, 'a0a1'), 'Rr+1');
  assert.equal(displayMove(revealed, 'b0c2'), 'H8+7');
  assert.equal(displayMove(revealed, 'c0e2', { lang: 'zh' }), '相七进五');
  assert.equal(displayMove(revealed, 'd0e1', { lang: 'zh' }), '仕六进五');
  assert.equal(displayMove(revealed, 'e0f0', { lang: 'zh' }), '帅五平四');
  assert.equal(displayMove(revealed, 'e0e1'), 'G5+1');
});

test('reveal odds come from the pool (Spec 8)', () => {
  const odds = revealOdds(Position.start(), RED);
  assert.deepEqual(odds.map((o) => [o.letter, o.count]), [['A', 2], ['E', 2], ['H', 2], ['R', 2], ['C', 2], ['S', 5]]);
  assert.equal(oddsFraction(Position.start(), BLACK, 'S'), '1/3');
});

test('captured dark pieces stay in the pool of a viewer who was not told', () => {
  const g = new Game();
  g.play('h2e2=C');
  g.play('b7b0=C:?');
  assert.equal(unknownCaptured(g.position, RED), 1);
  const told = new Game();
  told.play('h2e2=C');
  told.play('b7b0=C:H');
  assert.equal(unknownCaptured(told.position, RED), 0);
  assert.equal(revealOdds(told.position, RED).find((o) => o.letter === 'H').count, 1);
});

test('tree counts from the starting position', () => {
  assert.equal(treeCount(Position.start(), 1), 259);
  assert.equal(treeCount(Position.start(), 2), 66462);
  const sealed = Position.start().setLayout(seededLayout(Position.start(), 'example'));
  assert.equal(treeCount(sealed, 1), 44);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  Position, Game, sha256Hex, seededLayout, commitment, verifyCommitment, sealShuffle,
  createRecord, validateRecord, redactRecord, verifyOpenedShuffle, formatRecord,
  arrangementIndex, arrangementAt, ARRANGEMENTS_PER_SIDE, uniformInt, SeedStream,
} from '../src/index.js';

/** An independent implementation of the seeded shuffle of Spec 6, using node:crypto. */
function specLayout(seed) {
  let counter = 0;
  let buffer = Buffer.alloc(0);
  const next = () => {
    if (buffer.length < 4) {
      const k = Buffer.alloc(4);
      k.writeUInt32BE(counter++);
      buffer = Buffer.concat([buffer, createHash('sha256').update(`jieqi-seed\n${seed}\n`).update(k).digest()]);
    }
    const v = buffer.readUInt32BE(0);
    buffer = buffer.subarray(4);
    return v;
  };
  const uniform = (n) => {
    const limit = Math.floor(2 ** 32 / n) * n;
    let u;
    do u = next(); while (u >= limit);
    return u % n;
  };
  const side = (letters) => {
    const a = [...letters];
    for (let i = a.length - 1; i > 0; i--) {
      const j = uniform(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.join('');
  };
  return side('aaeehhrrccsssss') + side('AAEEHHRRCCSSSSS');
}

test('SHA-256 matches node:crypto', () => {
  for (const s of ['', 'abc', 'jieqi', '揭棋', 'x'.repeat(200)]) {
    assert.equal(sha256Hex(s), createHash('sha256').update(s).digest('hex'));
  }
});

test('seeded layouts follow Spec 6 exactly', () => {
  for (const seed of ['jieqi', 'example', 'research-000001', '揭棋']) {
    assert.equal(seededLayout(Position.start(), seed), specLayout(seed));
  }
});

test('uniformInt rejects the biased tail', () => {
  const s = new SeedStream('bias');
  const counts = [0, 0, 0];
  for (let i = 0; i < 3000; i++) counts[uniformInt(s, 3)]++;
  for (const c of counts) assert.ok(c > 900 && c < 1100);
});

test('commitments bind board, layout, and salt', () => {
  const start = Position.start();
  const layout = seededLayout(start, 'c');
  const salt = '0f'.repeat(32);
  const c = commitment(start.boardField(), layout, salt);
  assert.match(c, /^sha256:[0-9a-f]{64}$/);
  assert.ok(verifyCommitment(c, start.boardField(), layout, salt));
  assert.ok(!verifyCommitment(c, start.boardField(), layout, 'f0'.repeat(32)));
  const swapped = layout[1] + layout[0] + layout.slice(2);
  if (swapped !== layout) assert.ok(!verifyCommitment(c, start.boardField(), swapped, salt));
});

test('layout numbers index all 340,540,200 arrangements, and back', () => {
  const counts = { 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 5 };
  assert.equal(arrangementIndex(arrangementAt(0, counts)), 0);
  assert.equal(arrangementIndex(arrangementAt(ARRANGEMENTS_PER_SIDE - 1, counts)), ARRANGEMENTS_PER_SIDE - 1);
  for (const r of [1, 12345, 99999999, 271828182]) assert.equal(arrangementIndex(arrangementAt(r, counts)), r);
});

function sampleGame() {
  const start = Position.start();
  const shuffle = sealShuffle(start, { seed: 'record-test' });
  const game = new Game(Position.start().setLayout(shuffle.layout));
  // Each side's Cannon-role piece captures a dark piece, so both kinds of disclosure appear.
  for (const d of ['b2b9', 'h7h0', 'a3a4', 'a6a5']) game.play(d);
  return { game, shuffle };
}

test('arbiter records validate, and every narrower view validates too', () => {
  const { game, shuffle } = sampleGame();
  const record = createRecord(game, { view: 'arbiter', tags: { event: 'test' }, shuffle });
  assert.deepEqual(validateRecord(record).errors, []);
  for (const view of ['red', 'black', 'public']) {
    const r = redactRecord(record, view);
    assert.deepEqual(validateRecord(r).errors, [], view);
    assert.equal(r.shuffle.layout, undefined);
    assert.deepEqual(r, createRecord(game, { view, tags: { event: 'test' }, shuffle }), view);
  }
  const red = redactRecord(record, 'red');
  assert.match(red.moves[0], /:[AEHRCS]$/);
  assert.match(red.moves[1], /:\?$/);
  const black = redactRecord(record, 'black');
  assert.match(black.moves[0], /:\?$/);
  assert.match(black.moves[1], /:[AEHRCS]$/);
  assert.ok(redactRecord(record, 'public').moves.every((m) => !/:[AEHRCS]/.test(m)));
  assert.throws(() => redactRecord(red, 'black'));
});

test('validation catches leaks, tampering, and false results', () => {
  const { game, shuffle } = sampleGame();
  const record = createRecord(game, { view: 'arbiter', shuffle });
  const leaky = redactRecord(record, 'public');
  leaky.moves[0] = record.moves[0];
  assert.match(validateRecord(leaky).errors.join(), /cannot know/);
  const tampered = structuredClone(record);
  tampered.shuffle.salt = 'ff'.repeat(32);
  assert.match(validateRecord(tampered).errors.join(), /does not verify/);
  const wrongReveal = structuredClone(record);
  wrongReveal.moves[0] = wrongReveal.moves[0].replace(/=([AEHRCS])/, (_, t) => '=' + (t === 'S' ? 'C' : 'S'));
  assert.equal(validateRecord(wrongReveal).ok, false);
  const falseResult = { ...record, result: { outcome: 'red-win', reason: 'kill' } };
  assert.match(validateRecord(falseResult).errors.join(), /does not show it/);
  const leakedLayout = { ...redactRecord(record, 'red'), shuffle: { ...shuffle } };
  assert.match(validateRecord(leakedLayout).errors.join(), /open shuffle is an arbiter record/);
});

test('a spectator verifies the opened shuffle against the public record', () => {
  const { game, shuffle } = sampleGame();
  const pub = createRecord(game, { view: 'public', shuffle });
  assert.deepEqual(verifyOpenedShuffle(pub, shuffle.layout, shuffle.salt), { ok: true, problems: [] });
  const other = seededLayout(Position.start(), 'a different deal');
  assert.equal(verifyOpenedShuffle(pub, other, shuffle.salt).ok, false);
});

test('formatted records are valid JSON', () => {
  const { game, shuffle } = sampleGame();
  const record = createRecord(game, { view: 'arbiter', shuffle });
  assert.deepEqual(JSON.parse(formatRecord(record)), record);
});

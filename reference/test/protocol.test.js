import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { EngineProcess, runMatch } from '../host/match.js';
import { START_JPS, Game, validateRecord, redactRecord } from '../src/index.js';

const ENGINE = `node "${fileURLToPath(new URL('../engine/baseline.js', import.meta.url))}"`;

test('a JEP session: hello, position, go, move, play, ping, stop, errors', async () => {
  const e = new EngineProcess(ENGINE, { label: 'engine' });
  try {
    e.send({ type: 'hello', protocol: 'jep', host: { name: 'test' } });
    const hello = await e.expect((m) => m.type === 'hello');
    assert.equal(hello.protocol, 'jep');
    assert.ok(hello.views.includes('red'));
    e.send({ type: 'newgame', rules: 'jieqi', side: 'red' });
    e.send({ type: 'position', view: 'red', start: START_JPS, moves: [] });
    e.send({ type: 'go', id: 'g1', limits: { depth: 2 }, candidates: 2 });
    const move = await e.expect((m) => m.type === 'move' && m.id === 'g1');
    assert.match(move.move, /^[a-i][0-9][a-i][0-9]$/);
    assert.ok(move.score.ev >= 0 && move.score.ev <= 1);
    const infos = e.drain('info');
    const last = infos.filter((i) => i.candidates).pop();
    assert.equal(last.candidates.length, 2);
    const rev = last.candidates[0].reveals;
    const total = rev.reduce((s, r) => s + r.p, 0);
    assert.ok(Math.abs(total - 1) < 0.001, 'reveal probabilities sum to 1');
    const mixed = rev.reduce((s, r) => s + r.p * r.ev, 0);
    assert.ok(Math.abs(mixed - last.candidates[0].ev) < 0.001, 'the breakdown averages to the move value');
    // The host reports the outcome right away; the engine must not be "busy" any more.
    const need = new Game().inspect(move.move);
    e.send({ type: 'play', move: `${move.move}${need.moverDark ? '=S' : ''}${need.targetDark ? ':H' : ''}` });
    e.send({ type: 'ping', id: 'p1' });
    assert.deepEqual(await e.expect((m) => m.type === 'pong' || m.type === 'error'), { type: 'pong', id: 'p1' });
    e.send({ type: 'play', move: 'e9e7' });
    assert.equal((await e.expect((m) => m.type === 'error')).code, 'illegal-move');
    e.send({ type: 'go', id: 'g2', infinite: true });
    e.send({ type: 'position', view: 'red', start: START_JPS, moves: [] });
    assert.equal((await e.expect((m) => m.type === 'error')).code, 'busy');
    e.send({ type: 'stop' });
    const stopped = await e.expect((m) => m.type === 'move' && m.id === 'g2', 5000);
    assert.match(stopped.move, /^[a-i][0-9][a-i][0-9]$/);
    e.send({ type: 'frobnicate' });
    assert.equal((await e.expect((m) => m.type === 'error')).code, 'unknown-type');
    e.send({ type: 'newgame', rules: 'jieqi+unknown-modifier' });
    assert.equal((await e.expect((m) => m.type === 'error')).code, 'unsupported-rules');
  } finally {
    await e.quit();
  }
});

test('a hosted match: records validate, and each engine gets its own full history', { timeout: 60000 }, async () => {
  const transcript = [];
  const { game, record } = await runMatch({
    red: ENGINE, black: ENGINE, seed: 'protocol-test', depth: 1, maxMoves: 12, transcript,
  });
  assert.ok(game.result);
  assert.deepEqual(validateRecord(record).errors, []);
  for (const view of ['red', 'black', 'public']) assert.deepEqual(validateRecord(redactRecord(record, view)).errors, []);
  // Information discipline: no engine is ever sent a disclosure it may not know.
  for (const line of transcript.filter((l) => l.startsWith('>>') && l.includes('"play"'))) {
    const [, who, json] = line.match(/^>> (\w+) (.*)$/);
    const { move } = JSON.parse(json);
    if (/:[AEHRCS]$/.test(move)) {
      const index = record.moves.findIndex((m) => m === move);
      const capturer = index % 2 === 0 ? 'red' : 'black';
      assert.equal(who, capturer, `${who} was told ${move}`);
    }
  }
  // Full history (spec 7, section 4): the game's starting position, then every
  // move in order, written for the engine's own view.
  for (const side of ['red', 'black']) {
    const prefix = `>> ${side} `;
    const sent = transcript.filter((l) => l.startsWith(prefix)).map((l) => JSON.parse(l.slice(prefix.length)));
    const positions = sent.filter((m) => m.type === 'position');
    assert.equal(positions.length, 1);
    assert.equal(positions[0].start, record.start);
    assert.equal(positions[0].view, side);
    const later = sent.slice(sent.indexOf(positions[0]) + 1).filter((m) => m.type === 'play').map((m) => m.move);
    assert.deepEqual([...positions[0].moves, ...later], redactRecord(record, side).moves);
  }
});

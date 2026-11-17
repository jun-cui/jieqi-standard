// Jieqi Game Records, JGR (spec 5): creating, validating, redacting, and
// verifying records, and checking sealed shuffles once they are opened.

import { RED, BLACK } from './board.js';
import { Position, JPSError } from './position.js';
import {
  Game, parseRuleset, viewCode, OUTCOMES, RULE_REASONS, WIN_REASONS, DRAW_REASONS,
} from './game.js';
import { parseMoveCode, formatMoveCode, UNKNOWN } from './moves.js';
import { verifyCommitment, seededLayout } from './shuffle.js';

export const FORMAT = 'jgr';
export const VIEWS = ['arbiter', 'red', 'black', 'public'];
const RECORD_FIELDS = ['format', 'rules', 'view', 'tags', 'start', 'shuffle', 'moves', 'annotations', 'result'];
const SHUFFLE_FIELDS = ['commitment', 'layout', 'salt', 'seed'];
const RESULT_FIELDS = ['outcome', 'reason', 'by', 'note'];

/** Which views may see what a view sees (spec 5, section 4). */
const NARROWER = {
  arbiter: ['arbiter', 'red', 'black', 'public'],
  red: ['red', 'public'],
  black: ['black', 'public'],
  public: ['public'],
};

export class RecordError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RecordError';
  }
}

/** True if a party with view `view` knows what a capture by `capturer` disclosed. */
export function viewKnowsCapture(view, capturer, rules) {
  if (rules.modifiers.has('open-capture')) return true;
  return view === 'arbiter' || (view === 'red' && capturer === RED) || (view === 'black' && capturer === BLACK);
}

/** Build a record of `game` as `view` sees it. */
export function createRecord(game, { view = 'arbiter', tags = {}, shuffle = null, annotations = [] } = {}) {
  if (!VIEWS.includes(view)) throw new RecordError(`unknown view "${view}"`);
  const record = {
    format: FORMAT,
    rules: game.rules.id,
    view,
    tags: { ...tags },
    start: game.start.toJPS(),
  };
  if (shuffle) record.shuffle = view === 'arbiter' ? { ...shuffle } : { commitment: shuffle.commitment };
  record.moves = game.history.map((entry) => viewCode(entry, view, game.rules));
  // An annotation without a visibility is private to the arbiter (safe by default).
  const notes = annotations.filter((a) => NARROWER[view].includes(a.visibility || 'arbiter'));
  if (notes.length) record.annotations = notes.map((a) => ({ ...a }));
  if (game.result) {
    const { outcome, reason, by, note } = game.result;
    record.result = { outcome, reason };
    if (by) record.result.by = by;
    if (note) record.result.note = note;
  }
  return record;
}

/** Derive a narrower view from a record (spec 5, section 4.3). */
export function redactRecord(record, view) {
  if (!VIEWS.includes(view)) throw new RecordError(`unknown view "${view}"`);
  if (!NARROWER[record.view]?.includes(view)) {
    throw new RecordError(`a ${record.view} record cannot be redacted to the ${view} view`);
  }
  const rules = parseRuleset(record.rules);
  const start = Position.parse(record.start);
  const out = { ...record, view, tags: { ...record.tags } };
  if (record.shuffle) {
    out.shuffle = view === 'arbiter' ? { ...record.shuffle } : { commitment: record.shuffle.commitment };
    if (out.shuffle.commitment === undefined) delete out.shuffle;
  }
  out.moves = record.moves.map((code, i) => {
    const m = parseMoveCode(code);
    const capturer = i % 2 === 0 ? start.turn : -start.turn;
    if (m.captured > 0 && !viewKnowsCapture(view, capturer, rules)) m.captured = UNKNOWN;
    return formatMoveCode(m);
  });
  if (record.annotations) {
    const notes = record.annotations.filter((a) => NARROWER[view].includes(a.visibility || record.view));
    if (notes.length) out.annotations = notes.map((a) => ({ ...a }));
    else delete out.annotations;
  }
  // Keep key order stable.
  return orderKeys(out);
}

function orderKeys(r) {
  const keys = ['format', 'rules', 'view', 'tags', 'start', 'shuffle', 'moves', 'annotations', 'result'];
  const out = {};
  for (const k of keys) if (r[k] !== undefined) out[k] = r[k];
  for (const k of Object.keys(r)) if (!(k in out)) out[k] = r[k];
  return out;
}

/**
 * Validate a record completely: structure, a replay under the rules, what
 * the view may contain, the result, and the shuffle if it has been opened.
 * Returns { ok, errors, game }.
 */
export function validateRecord(record) {
  const errors = [];
  const fail = (msg) => {
    errors.push(msg);
    return { ok: false, errors, game: null };
  };
  if (typeof record !== 'object' || record === null || Array.isArray(record)) return fail('a record must be a JSON object');
  if (record.format !== FORMAT) return fail('"format" must be "jgr"');
  for (const k of Object.keys(record)) {
    if (!RECORD_FIELDS.includes(k)) errors.push(`unknown field "${k}": extensions belong in "tags" or in annotations`);
  }
  for (const k of Object.keys(record.shuffle ?? {})) {
    if (!SHUFFLE_FIELDS.includes(k)) errors.push(`unknown shuffle member "${k}"`);
  }
  for (const k of Object.keys(record.result ?? {})) {
    if (!RESULT_FIELDS.includes(k)) errors.push(`unknown result member "${k}"`);
  }
  let rules;
  try {
    rules = parseRuleset(record.rules);
  } catch (e) {
    return fail(e.message);
  }
  if (!VIEWS.includes(record.view)) return fail(`"view" must be one of ${VIEWS.join(', ')}`);
  if (record.tags !== undefined && (typeof record.tags !== 'object' || Array.isArray(record.tags))) return fail('"tags" must be an object');
  for (const [k, v] of Object.entries(record.tags || {})) {
    if (!/^[a-z][a-z0-9_]*$/.test(k)) errors.push(`tag name "${k}" must be lower_snake_case`);
    if (typeof v !== 'string') errors.push(`tag "${k}" must be a string`);
  }
  let start;
  try {
    if (typeof record.start !== 'string' || record.start.split(' ').length !== 6) {
      return fail('"start" must be a JPS with exactly 6 fields (the layout belongs in "shuffle")');
    }
    start = Position.parse(record.start);
  } catch (e) {
    return fail(`start: ${e instanceof JPSError ? e.message : e}`);
  }
  if (!Array.isArray(record.moves)) return fail('"moves" must be an array of move codes');

  const sh = record.shuffle;
  if (sh !== undefined) {
    if (typeof sh !== 'object' || sh === null) return fail('"shuffle" must be an object');
    if (sh.commitment !== undefined && !/^sha256:[0-9a-f]{64}$/.test(sh.commitment)) errors.push('shuffle.commitment must be "sha256:" and 64 hex digits');
    if (record.view !== 'arbiter' && (sh.layout !== undefined || sh.salt !== undefined || sh.seed !== undefined)) {
      return fail('only an arbiter record may contain the layout, salt, or seed; a record with an open shuffle is an arbiter record');
    }
  }
  const layout = sh?.layout;
  if (record.view === 'arbiter') {
    if (typeof layout !== 'string') return fail('an arbiter record must give shuffle.layout');
    try {
      start.setLayout(layout);
    } catch (e) {
      return fail(`shuffle.layout: ${e.message}`);
    }
    if (sh.seed !== undefined) {
      const derived = seededLayout(Position.parse(record.start), String(sh.seed));
      if (derived !== layout) errors.push('shuffle.layout is not the layout that shuffle.seed produces');
    }
    if (sh.salt !== undefined || sh.commitment !== undefined) {
      if (sh.salt === undefined || sh.commitment === undefined) errors.push('shuffle needs both salt and commitment to be verified');
      else if (!verifyCommitment(sh.commitment, start.boardField(), layout, sh.salt)) {
        errors.push('the sealed shuffle does not verify: the commitment does not match board, layout, and salt');
      }
    }
  }

  let game;
  try {
    game = new Game(start, { rules: record.rules });
  } catch (e) {
    return fail(e.message);
  }
  for (let i = 0; i < record.moves.length; i++) {
    const code = record.moves[i];
    let m;
    try {
      m = parseMoveCode(code);
    } catch (e) {
      return fail(`move ${i + 1}: ${e.message}`);
    }
    if (game.result) return fail(`move ${i + 1} (${code}) comes after the game ended (${game.result.reason})`);
    const capturer = game.turn;
    if (m.captured !== 0) {
      const knows = viewKnowsCapture(record.view, capturer, rules);
      if (knows && m.captured === UNKNOWN) errors.push(`move ${i + 1} (${code}): the ${record.view} view knows this capture disclosure, so it must be written`);
      if (!knows && m.captured > 0) errors.push(`move ${i + 1} (${code}): the ${record.view} view cannot know this capture disclosure; write ":?"`);
    }
    try {
      const entry = game.play(m);
      if (record.view === 'arbiter' && entry.code !== code) {
        errors.push(`move ${i + 1}: arbiter records must spell out every outcome (${entry.code}, not ${code})`);
      }
    } catch (e) {
      return fail(`move ${i + 1} (${code}): ${e.message}`);
    }
  }

  const res = record.result;
  if (res !== undefined) {
    if (typeof res !== 'object' || res === null) errors.push('"result" must be an object');
    else if (!OUTCOMES.includes(res.outcome)) errors.push(`result.outcome must be one of ${OUTCOMES.join(', ')}`);
    else {
      const allowed = res.outcome === 'draw' ? DRAW_REASONS : WIN_REASONS;
      if (!allowed.has(res.reason)) errors.push(`"${res.reason}" is not a reason for ${res.outcome}`);
      if (game.result) {
        if (game.result.outcome !== res.outcome || game.result.reason !== res.reason) {
          errors.push(`the board says ${game.result.outcome} by ${game.result.reason}, but the record says ${res.outcome} by ${res.reason}`);
        }
      } else if (RULE_REASONS.has(res.reason)) {
        errors.push(`the record claims ${res.reason}, but the final position does not show it`);
      } else if (res.reason === 'adjudication' && !res.by) {
        errors.push('an adjudicated result must say who adjudicated (result.by)');
      }
    }
  } else if (game.result) {
    errors.push(`the game ended by ${game.result.reason}; the record must give the result`);
  }

  for (const [i, a] of (record.annotations || []).entries()) {
    if (!Number.isInteger(a?.after) || a.after < 0 || a.after > record.moves.length) {
      errors.push(`annotation ${i + 1}: "after" must be an integer from 0 to ${record.moves.length}`);
    }
    if (a?.visibility !== undefined && !NARROWER[record.view].includes(a.visibility)) {
      errors.push(`annotation ${i + 1}: a ${record.view} record cannot hold ${a.visibility} annotations`);
    }
    for (const k of Object.keys(a ?? {})) {
      if (!/^[a-z][a-z0-9_]*$/.test(k)) errors.push(`annotation ${i + 1}: member name "${k}" must be lower_snake_case`);
    }
  }
  return { ok: errors.length === 0, errors, game };
}

/**
 * Check a non-arbiter record against a shuffle the arbiter has opened
 * (spec 6, section 5): the commitment must match, and every reveal and every
 * disclosed capture in the record must agree with the layout.
 */
export function verifyOpenedShuffle(record, layout, salt) {
  const problems = [];
  const start = Position.parse(record.start);
  const commit = record.shuffle?.commitment;
  if (!commit) problems.push('the record has no commitment to check against');
  else if (!verifyCommitment(commit, start.boardField(), layout, salt)) problems.push('the commitment does not match this layout and salt');
  try {
    start.setLayout(layout);
  } catch (e) {
    problems.push(`layout: ${e.message}`);
    return { ok: false, problems };
  }
  const game = new Game(start, { rules: record.rules });
  for (const [i, code] of record.moves.entries()) {
    const m = parseMoveCode(code);
    if (m.captured === UNKNOWN) m.captured = 0;
    try {
      game.play(m);
    } catch (e) {
      problems.push(`move ${i + 1} (${code}): ${e.message}`);
      break;
    }
  }
  return { ok: problems.length === 0, problems };
}

/** Serialize a record as readable JSON: two-space indent, moves wrapped ten to a line. */
export function formatRecord(record) {
  const r = orderKeys(record);
  const lines = ['{'];
  const keys = Object.keys(r);
  keys.forEach((k, i) => {
    const comma = i < keys.length - 1 ? ',' : '';
    if (k === 'moves') {
      const rows = [];
      for (let j = 0; j < r.moves.length; j += 10) rows.push('    ' + r.moves.slice(j, j + 10).map((m) => JSON.stringify(m)).join(', '));
      lines.push(r.moves.length ? `  "moves": [\n${rows.join(',\n')}\n  ]${comma}` : `  "moves": []${comma}`);
    } else {
      const body = JSON.stringify(r[k], null, 2).replace(/\n/g, '\n  ');
      lines.push(`  ${JSON.stringify(k)}: ${body}${comma}`);
    }
  });
  lines.push('}');
  return lines.join('\n') + '\n';
}

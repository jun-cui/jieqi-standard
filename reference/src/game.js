// Games: applying move outcomes, ending the game, and repetition (spec 1, rules 8-11).

import {
  RED, BLACK, DARK, GENERAL, SOLDIER, CHARIOT, TYPE_LETTERS, onOwnSide, sideIndex,
} from './board.js';
import { Position } from './position.js';
import {
  legalMoves, hasLegalMove, generalInDanger, pseudoMoves, isSafe, kindAt, isLegalMove,
} from './movegen.js';
import { parseMoveCode, formatMoveCode, decisionCode, UNKNOWN } from './moves.js';

export const BASE_RULESET = 'jieqi';
export const KNOWN_MODIFIERS = new Set(['open-capture']);
export const MOVE_LIMIT = 120;

export class GameError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GameError';
  }
}

/** Parse a ruleset ID such as "jieqi" or "jieqi+open-capture" (rule 11). */
export function parseRuleset(id = BASE_RULESET) {
  if (typeof id !== 'string') throw new GameError('ruleset ID must be a string');
  const [base, ...mods] = id.split('+');
  if (base !== BASE_RULESET) throw new GameError(`unknown ruleset "${base}"`);
  const modifiers = new Set();
  for (const m of mods) {
    if (!KNOWN_MODIFIERS.has(m)) throw new GameError(`unknown rule modifier "${m}"`);
    if (modifiers.has(m)) throw new GameError(`rule modifier "${m}" is repeated`);
    modifiers.add(m);
  }
  return { id, base, modifiers };
}

export const OUTCOMES = ['red-win', 'black-win', 'draw'];
export const RULE_REASONS = new Set(['kill', 'trap', 'perpetual-jiang', 'perpetual-chase', 'repetition', 'move-limit', 'bare-generals']);
export const WIN_REASONS = new Set(['kill', 'trap', 'perpetual-jiang', 'perpetual-chase', 'resignation', 'time', 'forfeit', 'adjudication']);
export const DRAW_REASONS = new Set(['repetition', 'move-limit', 'bare-generals', 'agreement', 'adjudication']);

const winFor = (side) => (side === RED ? 'red-win' : 'black-win');

export class Game {
  /**
   * @param {Position} start  Starting position. If it carries a layout, the game
   *                          is an arbiter game and reveals are filled in from it.
   */
  constructor(start = Position.start(), { rules = BASE_RULESET } = {}) {
    this.rules = parseRuleset(rules);
    this.start = start.clone();
    this.position = start.clone();
    this.history = [];
    this.result = null;
    // Positions since the last irreversible move (rule 9.2), oldest first.
    this._stretch = [this.position.clone()];
    this._keys = [this.position.key()];
    this._checkEnd();
  }

  static fromMoves(start, codes, options) {
    const game = new Game(start, options);
    for (const code of codes) game.play(code);
    return game;
  }

  get turn() {
    return this.position.turn;
  }

  legalMoves() {
    return this.result ? [] : legalMoves(this.position);
  }

  legalDecisions() {
    return this.legalMoves().map(decisionCode);
  }

  /** What playing `input` would need: { moverDark, targetDark }. Throws if illegal. */
  inspect(input) {
    const m = typeof input === 'string' ? parseMoveCode(input) : input;
    const pos = this.position;
    const move = m.from | (m.to << 7);
    if (!Number.isInteger(m.from) || !Number.isInteger(m.to) || !isLegalMove(pos, move)) {
      throw new GameError(`illegal move ${Number.isInteger(move) ? decisionCode(move) : String(input)}`);
    }
    const side = pos.turn;
    return {
      ...m,
      move,
      side,
      moverDark: pos.board[m.from] === side * DARK,
      targetDark: pos.board[m.to] === -side * DARK,
    };
  }

  /**
   * Play a move outcome: a move code string or { from, to, reveal, captured }.
   * In an arbiter game a bare decision is enough: outcomes come from the layout.
   */
  play(input) {
    if (this.result) throw new GameError('the game is already over');
    const m = this.inspect(input);
    const pos = this.position;
    const { side, moverDark, targetDark } = m;
    let reveal = m.reveal || 0;
    let captured = m.captured || 0;
    if (pos.layout) {
      if (moverDark) {
        const truth = pos.layout[m.from];
        if (reveal && reveal !== truth) throw new GameError(`reveal ${TYPE_LETTERS[reveal]} contradicts the layout`);
        reveal = truth;
      }
      if (targetDark) {
        const truth = pos.layout[m.to];
        if (captured > 0 && captured !== truth) throw new GameError(`capture disclosure ${TYPE_LETTERS[captured]} contradicts the layout`);
        captured = truth;
      }
    }
    if (moverDark && !reveal) throw new GameError('a dark piece moved, so the outcome must give its reveal (=X)');
    if (!moverDark && reveal) throw new GameError('the moving piece is revealed already, so there is no reveal');
    if (targetDark && !captured) throw new GameError('a dark piece was captured, so the outcome must give its identity or "?" (:X or :?)');
    if (!targetDark && captured) throw new GameError('no dark piece was captured, so there is no capture disclosure');
    if (captured === UNKNOWN && this.rules.modifiers.has('open-capture')) {
      throw new GameError('under open-capture every capture disclosure is public; "?" is not allowed');
    }
    if (moverDark && pos.pools[sideIndex(side)][reveal] <= 0) {
      throw new GameError(`reveal ${TYPE_LETTERS[reveal]} is impossible: that identity is not in the pool`);
    }
    if (captured > 0 && pos.pools[sideIndex(-side)][captured] <= 0) {
      throw new GameError(`capture disclosure ${TYPE_LETTERS[captured]} is impossible: that identity is not in the pool`);
    }
    const target = pos.board[m.to];
    pos.makeMove(m.move, reveal, captured);
    const entry = {
      index: this.history.length,
      side,
      from: m.from,
      to: m.to,
      move: m.move,
      reveal,
      captured,
      capture: target !== 0,
      code: formatMoveCode({ from: m.from, to: m.to, reveal, captured }),
      jiang: generalInDanger(pos.board, -side),
    };
    this.history.push(entry);
    if (moverDark || target !== 0) {
      this._stretch = [pos.clone()];
      this._keys = [pos.key()];
    } else {
      this._stretch.push(pos.clone());
      this._keys.push(pos.key());
    }
    this._checkEnd();
    return entry;
  }

  /** End the game for a reason outside the board: resignation, agreement, time, forfeit, adjudication. */
  end(outcome, reason, extra = {}) {
    if (this.result) throw new GameError('the game is already over');
    if (!OUTCOMES.includes(outcome)) throw new GameError(`unknown outcome "${outcome}"`);
    const allowed = outcome === 'draw' ? DRAW_REASONS : WIN_REASONS;
    if (!allowed.has(reason) || RULE_REASONS.has(reason)) {
      throw new GameError(`"${reason}" cannot be declared; it is decided by the board`);
    }
    this.result = { outcome, reason, ...extra };
    return this.result;
  }

  /** The move code of a history entry as a given view sees it (spec 5, section 4). */
  codeFor(entry, view) {
    return viewCode(entry, view, this.rules);
  }

  _checkEnd() {
    const pos = this.position;
    if (!hasLegalMove(pos)) {
      const reason = generalInDanger(pos.board, pos.turn) ? 'kill' : 'trap';
      this.result = { outcome: winFor(-pos.turn), reason };
      return;
    }
    const key = this._keys[this._keys.length - 1];
    let count = 0;
    for (const k of this._keys) if (k === key) count++;
    if (count >= 3) {
      this.result = this._repetitionVerdict(this._keys.indexOf(key));
      return;
    }
    if (pos.limitCount >= MOVE_LIMIT) {
      this.result = { outcome: 'draw', reason: 'move-limit' };
      return;
    }
    if (onlyGenerals(pos.board)) this.result = { outcome: 'draw', reason: 'bare-generals' };
  }

  _repetitionVerdict(first) {
    const moves = this.history.slice(this.history.length - (this._stretch.length - 1));
    const perpetual = { [RED]: true, [BLACK]: true };
    const allJiang = { [RED]: true, [BLACK]: true };
    const kinds = [];
    for (let j = first + 1; j < this._stretch.length; j++) {
      const entry = moves[j - 1];
      const kind = entry.jiang ? 'jiang' : isChase(this._stretch[j - 1], this._stretch[j], entry.side) ? 'chase' : 'idle';
      kinds.push(kind);
      if (kind === 'idle') perpetual[entry.side] = false;
      if (kind !== 'jiang') allJiang[entry.side] = false;
    }
    const span = { from: moves[first].index, to: this.history.length - 1, kinds };
    if (perpetual[RED] !== perpetual[BLACK]) {
      const loser = perpetual[RED] ? RED : BLACK;
      return { outcome: winFor(-loser), reason: allJiang[loser] ? 'perpetual-jiang' : 'perpetual-chase', span };
    }
    return { outcome: 'draw', reason: 'repetition', span };
  }
}

function onlyGenerals(board) {
  for (let p = 0; p < 90; p++) {
    const v = board[p];
    if (v !== 0 && Math.abs(v) !== GENERAL) return false;
  }
  return true;
}

/** Captures `side` could legally make in `pos` with an eligible attacker (rule 9.5.2): target -> attackers. */
function threats(pos, side) {
  const board = pos.board;
  const map = new Map();
  for (const m of pseudoMoves(board, side, true)) {
    const f = m & 127;
    const t = m >> 7;
    const k = kindAt(board, f);
    if (k === GENERAL || k === SOLDIER || !isSafe(board, side, m)) continue;
    if (!map.has(t)) map.set(t, []);
    map.get(t).push(f);
  }
  return map;
}

/** Can `defender` move onto t after the piece on f captures there? General safety is ignored (rule 9.5.4). */
function hasRecapture(board, f, t, defender) {
  const b = Int8Array.from(board);
  b[t] = b[f];
  b[f] = 0;
  return pseudoMoves(b, defender, true).some((m) => m >> 7 === t);
}

/** rule 9.5: is the move from P0 to P1, made by `side`, a chase? */
export function isChase(p0, p1, side) {
  const after = threats(p1, side);
  if (after.size === 0) return false;
  const before = threats(p0, side);
  for (const [t, attackers] of after) {
    if (before.has(t)) continue;
    const tt = Math.abs(p1.board[t]);
    if (tt === DARK || tt === GENERAL) continue;
    if (tt === SOLDIER && onOwnSide(-side, t)) continue;
    for (const f of attackers) {
      if (tt === CHARIOT && kindAt(p1.board, f) !== CHARIOT) return true;
      if (!hasRecapture(p1.board, f, t, -side)) return true;
    }
  }
  return false;
}

/** Mask capture disclosures that `view` is not entitled to (rule 5.3). */
export function viewCode(entry, view, rules = parseRuleset()) {
  let captured = entry.captured;
  if (captured > 0 && !rules.modifiers.has('open-capture')) {
    const knows = view === 'arbiter' || (view === 'red' && entry.side === RED) || (view === 'black' && entry.side === BLACK);
    if (!knows) captured = UNKNOWN;
  }
  return formatMoveCode({ from: entry.from, to: entry.to, reveal: entry.reveal, captured });
}

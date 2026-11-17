// Move codes (spec 4, section 2).
//
//   decision:   h2e2           what a player chooses
//   outcome:    h2e2=R         the moving dark piece was revealed as a Chariot
//               b2b9=C:H       ... and the dark piece it captured was a Horse
//               b2b9=C:?       ... but this viewer was not told what it captured
//
// Piece letters in move codes are always uppercase: the side is implied.

import { parsePoint, pointName, poolTypeOf, TYPE_LETTERS } from './board.js';

/** Marks a captured dark piece whose identity the viewer does not know. */
export const UNKNOWN = -1;

const MOVE_CODE = /^([a-i][0-9])([a-i][0-9])(?:=([AEHRCS]))?(?::([AEHRCS?]))?$/;

export class MoveCodeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MoveCodeError';
  }
}

/**
 * Parse a move code. Returns { from, to, move, reveal, captured } where
 * reveal is 0 or a type code, and captured is 0, UNKNOWN, or a type code.
 */
export function parseMoveCode(text) {
  const m = typeof text === 'string' ? MOVE_CODE.exec(text) : null;
  if (!m) throw new MoveCodeError(`"${text}" is not a move code`);
  const from = parsePoint(m[1]);
  const to = parsePoint(m[2]);
  if (from === to) throw new MoveCodeError(`"${text}" does not move`);
  return {
    from,
    to,
    move: from | (to << 7),
    reveal: m[3] ? poolTypeOf(m[3]) : 0,
    captured: m[4] ? (m[4] === '?' ? UNKNOWN : poolTypeOf(m[4])) : 0,
  };
}

export function isMoveCode(text) {
  return typeof text === 'string' && MOVE_CODE.test(text);
}

export function formatMoveCode({ from, to, reveal = 0, captured = 0 }) {
  let s = pointName(from) + pointName(to);
  if (reveal) s += '=' + TYPE_LETTERS[reveal];
  if (captured) s += ':' + (captured === UNKNOWN ? '?' : TYPE_LETTERS[captured]);
  return s;
}

/** The four-character decision code of an encoded move. */
export function decisionCode(move) {
  return pointName(move & 127) + pointName(move >> 7);
}

/** Strip outcome suffixes: "h2e2=R:H" -> "h2e2". */
export function toDecision(text) {
  const { from, to } = parseMoveCode(text);
  return pointName(from) + pointName(to);
}

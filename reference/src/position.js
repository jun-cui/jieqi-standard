// Positions and the Jieqi Position String, JPS (spec 3).
//
//   <board> <turn> <red pool> <black pool> <limit count> <round> [<layout>]
//
// The board is public. Pools are the identities the holder of the string
// cannot yet place. The optional layout field (arbiter positions only) gives
// the identity of every dark piece in board order.

import {
  RED, BLACK, GENERAL, ADVISOR, SOLDIER, DARK, POOL_TYPES, FULL_COUNT,
  pointOf, colOf, rowOf, pieceLetter, letterPiece, poolTypeOf, TYPE_LETTERS,
  inPalace, isDarkHome, sideIndex, GENERAL_POINT, ROLE, HOME,
} from './board.js';
import { generalInDanger } from './movegen.js';

export class JPSError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JPSError';
  }
}

/** Board order: rows 9 down to 0, columns a to i, the order the board field is written in. */
export const BOARD_ORDER = [];
for (let r = 9; r >= 0; r--) for (let c = 0; c < 9; c++) BOARD_ORDER.push(pointOf(c, r));

export const START_JPS =
  'xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX r A2E2H2R2C2S5 a2e2h2r2c2s5 0 1';

export class Position {
  constructor() {
    this.board = new Int8Array(90);
    this.turn = RED;
    /** pools[0] is Red's pool, pools[1] is Black's; each is indexed by type code. */
    this.pools = [new Int8Array(9), new Int8Array(9)];
    this.limitCount = 0;
    this.round = 1;
    /** Arbiter positions only: identity type of the dark piece on each point. */
    this.layout = null;
  }

  static start() {
    return Position.parse(START_JPS);
  }

  /** Parse a JPS. Strict: only the canonical spelling is accepted. */
  static parse(text, { validate = true } = {}) {
    if (typeof text !== 'string') throw new JPSError('JPS must be a string');
    const fields = text.split(' ');
    if (fields.length !== 6 && fields.length !== 7) {
      throw new JPSError(`JPS needs 6 or 7 fields separated by single spaces, found ${fields.length}`);
    }
    const pos = new Position();
    parseBoard(fields[0], pos.board);
    if (fields[1] !== 'r' && fields[1] !== 'b') throw new JPSError(`turn must be "r" or "b", found "${fields[1]}"`);
    pos.turn = fields[1] === 'r' ? RED : BLACK;
    parsePool(fields[2], RED, pos.pools[0]);
    parsePool(fields[3], BLACK, pos.pools[1]);
    pos.limitCount = parseCount(fields[4], 'limit count', 0);
    pos.round = parseCount(fields[5], 'round', 1);
    if (fields.length === 7) pos.layout = parseLayout(fields[6], pos.board);
    if (validate) {
      const problems = pos.problems();
      if (problems.length) throw new JPSError(problems[0]);
    }
    return pos;
  }

  clone() {
    const p = new Position();
    p.board.set(this.board);
    p.turn = this.turn;
    p.pools[0].set(this.pools[0]);
    p.pools[1].set(this.pools[1]);
    p.limitCount = this.limitCount;
    p.round = this.round;
    p.layout = this.layout ? Int8Array.from(this.layout) : null;
    return p;
  }

  pool(side) {
    return this.pools[sideIndex(side)];
  }

  poolSize(side) {
    const pool = this.pool(side);
    let n = 0;
    for (const t of POOL_TYPES) n += pool[t];
    return n;
  }

  /** Points holding side's dark pieces, in board order. */
  darkPoints(side) {
    const target = side * DARK;
    return BOARD_ORDER.filter((p) => this.board[p] === target);
  }

  darkCount(side) {
    const target = side * DARK;
    let n = 0;
    for (let p = 0; p < 90; p++) if (this.board[p] === target) n++;
    return n;
  }

  generalPoint(side) {
    const g = side * GENERAL;
    for (let p = 0; p < 90; p++) if (this.board[p] === g) return p;
    return -1;
  }

  boardField() {
    return formatBoard(this.board);
  }

  /** Fields 1-4: the part of the position that repetition compares (rule 9.1). */
  key() {
    return `${formatBoard(this.board)} ${this.turn === RED ? 'r' : 'b'} ${formatPool(this.pools[0], RED)} ${formatPool(this.pools[1], BLACK)}`;
  }

  /** Canonical JPS. The layout field is written only when asked for and present. */
  toJPS({ layout = false } = {}) {
    let s = `${this.key()} ${this.limitCount} ${this.round}`;
    if (layout && this.layout) s += ' ' + this.layoutString();
    return s;
  }

  toString() {
    return this.toJPS();
  }

  /** Layout letters for the dark pieces, in board order. */
  layoutString() {
    if (!this.layout) return '';
    let s = '';
    for (const p of BOARD_ORDER) {
      const v = this.board[p];
      if (Math.abs(v) === DARK) s += pieceLetter(Math.sign(v) * this.layout[p]);
    }
    return s;
  }

  /** Attach a layout (letters in board order) to this position. */
  setLayout(letters) {
    this.layout = parseLayout(letters, this.board);
    const problems = this.problems();
    if (problems.length) throw new JPSError(problems[0]);
    return this;
  }

  /** Every way in which this position breaks spec 3, section 5. Empty means valid. */
  problems() {
    const out = [];
    const b = this.board;
    for (const side of [RED, BLACK]) {
      const name = side === RED ? 'Red' : 'Black';
      const generals = [];
      const revealed = new Int8Array(9);
      let darks = 0;
      for (let p = 0; p < 90; p++) {
        const v = b[p];
        if (v === 0 || Math.sign(v) !== side) continue;
        const t = Math.abs(v);
        if (t === GENERAL) generals.push(p);
        else if (t === DARK) {
          darks++;
          if (!isDarkHome(side, p)) out.push(`${name} dark piece on ${pname(p)}, which is not one of ${name}'s starting points`);
        } else revealed[t]++;
      }
      if (generals.length !== 1) out.push(`${name} must have exactly one General, found ${generals.length}`);
      else if (!inPalace(side, generals[0])) out.push(`${name} General on ${pname(generals[0])} is outside its palace`);
      const pool = this.pool(side);
      let size = 0;
      for (const t of POOL_TYPES) {
        size += pool[t];
        if (revealed[t] + pool[t] > FULL_COUNT[t]) {
          out.push(`${name} has ${revealed[t]} revealed and ${pool[t]} pooled ${TYPE_LETTERS[t]}, more than ${FULL_COUNT[t]}`);
        }
      }
      if (size < darks) out.push(`${name} pool holds ${size} identities for ${darks} dark pieces`);
      if (this.layout) {
        const counted = new Int8Array(9);
        for (let p = 0; p < 90; p++) if (b[p] === side * DARK) counted[this.layout[p]]++;
        for (const t of POOL_TYPES) {
          if (counted[t] !== pool[t]) {
            out.push(`${name} layout does not match the pool for ${TYPE_LETTERS[t]} (an arbiter position has no unknown captures)`);
            break;
          }
        }
      }
    }
    if (out.length === 0) {
      const waiting = -this.turn;
      if (generalInDanger(b, waiting)) {
        out.push(`${waiting === RED ? 'Red' : 'Black'} is not to move but its General is under jiang or faces the other General`);
      }
    }
    if (this.limitCount > 120) out.push('limit count above 120 cannot occur: the game ends at 120');
    return out;
  }

  isValid() {
    return this.problems().length === 0;
  }

  // -------------------------------------------------------------------------
  // Making and unmaking moves. `reveal` is the identity of a moving dark
  // piece; `captured` is the identity of a captured dark piece, or -1 when the
  // holder of this position does not learn it.

  makeMove(move, reveal = 0, captured = 0) {
    const from = move & 127;
    const to = move >> 7;
    const b = this.board;
    const piece = b[from];
    const target = b[to];
    const side = piece > 0 ? RED : BLACK;
    const undo = {
      move, piece, target, reveal, captured,
      limitCount: this.limitCount, round: this.round, layoutFrom: 0, layoutTo: 0,
    };
    if (target === -side * DARK && captured > 0) this.pools[sideIndex(-side)][captured]--;
    if (piece === side * DARK) {
      b[to] = side * reveal;
      this.pools[sideIndex(side)][reveal]--;
    } else {
      b[to] = piece;
    }
    b[from] = 0;
    if (this.layout) {
      undo.layoutFrom = this.layout[from];
      undo.layoutTo = this.layout[to];
      this.layout[from] = 0;
      this.layout[to] = 0;
    }
    this.limitCount = target !== 0 || piece === side * DARK ? 0 : this.limitCount + 1;
    if (side === BLACK) this.round++;
    this.turn = -side;
    return undo;
  }

  unmakeMove(undo) {
    const from = undo.move & 127;
    const to = undo.move >> 7;
    const side = undo.piece > 0 ? RED : BLACK;
    const b = this.board;
    if (undo.piece === side * DARK) this.pools[sideIndex(side)][undo.reveal]++;
    if (undo.target === -side * DARK && undo.captured > 0) this.pools[sideIndex(-side)][undo.captured]++;
    b[from] = undo.piece;
    b[to] = undo.target;
    if (this.layout) {
      this.layout[from] = undo.layoutFrom;
      this.layout[to] = undo.layoutTo;
    }
    this.limitCount = undo.limitCount;
    this.round = undo.round;
    this.turn = side;
  }
}

// ---------------------------------------------------------------------------
// Field codecs

function pname(p) {
  return 'abcdefghi'[colOf(p)] + rowOf(p);
}

function parseBoard(field, board) {
  const rows = field.split('/');
  if (rows.length !== 10) throw new JPSError(`board needs 10 rows separated by "/", found ${rows.length}`);
  for (let i = 0; i < 10; i++) {
    const row = 9 - i;
    let col = 0;
    let lastDigit = false;
    for (const ch of rows[i]) {
      if (ch >= '1' && ch <= '9') {
        if (lastDigit) throw new JPSError(`row ${row}: adjacent digits are not canonical; write one digit per run of empty points`);
        col += ch.charCodeAt(0) - 48;
        lastDigit = true;
      } else {
        const piece = letterPiece(ch);
        if (piece === 0) throw new JPSError(`row ${row}: "${ch}" is not a JPS piece letter`);
        if (col > 8) throw new JPSError(`row ${row} has more than 9 points`);
        board[pointOf(col, row)] = piece;
        col++;
        lastDigit = false;
      }
    }
    if (col !== 9) throw new JPSError(`row ${row} describes ${col} points instead of 9`);
  }
}

export function formatBoard(board) {
  const rows = [];
  for (let r = 9; r >= 0; r--) {
    let s = '';
    let empty = 0;
    for (let c = 0; c < 9; c++) {
      const v = board[pointOf(c, r)];
      if (v === 0) empty++;
      else {
        if (empty) s += empty;
        empty = 0;
        s += pieceLetter(v);
      }
    }
    if (empty) s += empty;
    rows.push(s);
  }
  return rows.join('/');
}

function parsePool(field, side, pool) {
  if (field === '-') return;
  const re = /([A-Za-z])([1-9])/y;
  let order = -1;
  let i = 0;
  while (i < field.length) {
    re.lastIndex = i;
    const m = re.exec(field);
    if (!m) throw new JPSError(`pool "${field}" is malformed`);
    const letter = m[1];
    const isUpper = letter === letter.toUpperCase();
    if (isUpper !== (side === RED)) throw new JPSError(`pool "${field}": ${side === RED ? 'Red' : 'Black'} pool letters must be ${side === RED ? 'uppercase' : 'lowercase'}`);
    const t = poolTypeOf(letter.toUpperCase());
    if (!t) throw new JPSError(`pool "${field}": "${letter}" cannot be dark`);
    const k = POOL_TYPES.indexOf(t);
    if (k <= order) throw new JPSError(`pool "${field}" must list types once each, in the order A E H R C S`);
    order = k;
    pool[t] = m[2].charCodeAt(0) - 48;
    i += 2;
  }
}

export function formatPool(pool, side) {
  let s = '';
  for (const t of POOL_TYPES) {
    if (pool[t] > 0) s += (side === RED ? TYPE_LETTERS[t] : TYPE_LETTERS[t].toLowerCase()) + pool[t];
  }
  return s || '-';
}

function parseCount(field, name, min) {
  if (!/^(0|[1-9][0-9]*)$/.test(field)) throw new JPSError(`${name} "${field}" must be a canonical decimal integer`);
  const n = Number(field);
  if (n < min || !Number.isSafeInteger(n)) throw new JPSError(`${name} ${field} is out of range`);
  return n;
}

function parseLayout(field, board) {
  const layout = new Int8Array(90);
  const darks = BOARD_ORDER.filter((p) => Math.abs(board[p]) === DARK);
  if (field.length !== darks.length) {
    throw new JPSError(`layout has ${field.length} letters for ${darks.length} dark pieces`);
  }
  darks.forEach((p, i) => {
    const ch = field[i];
    const piece = letterPiece(ch);
    const t = Math.abs(piece);
    if (t < ADVISOR || t > SOLDIER) throw new JPSError(`layout letter "${ch}" is not an identity a dark piece can have`);
    if (Math.sign(piece) !== Math.sign(board[p])) throw new JPSError(`layout letter ${i + 1} ("${ch}") has the wrong case for the dark piece on ${pname(p)}`);
    layout[p] = t;
  });
  return layout;
}

export { GENERAL_POINT, ROLE, HOME };

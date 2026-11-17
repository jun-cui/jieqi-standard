// Board geometry, piece codes, starting points, and roles (spec 1, rules 1-2).
//
// Points are numbered 0..89: index = row * 9 + column, where column 0..8 is
// a..i (Red's left to right) and row 0..9 runs from Red's baseline to Black's.
// A cell holds 0 (empty) or a signed piece code: positive for Red, negative
// for Black. The absolute value is the piece type below; DARK marks a dark
// piece, whose movement comes from the role of the point it stands on.

export const RED = 1;
export const BLACK = -1;

export const GENERAL = 1;
export const ADVISOR = 2;
export const ELEPHANT = 3;
export const HORSE = 4;
export const CHARIOT = 5;
export const CANNON = 6;
export const SOLDIER = 7;
export const DARK = 8;

/** Letter of each type, indexed by type code. */
export const TYPE_LETTERS = ' GAEHRCSX';
/** English name of each type, indexed by type code. */
export const TYPE_NAMES = ['', 'General', 'Advisor', 'Elephant', 'Horse', 'Chariot', 'Cannon', 'Soldier', 'dark piece'];
/** The six types that can be dark, in canonical pool order: A E H R C S. */
export const POOL_TYPES = [ADVISOR, ELEPHANT, HORSE, CHARIOT, CANNON, SOLDIER];
/** How many pieces of each type one side owns, indexed by type code. */
export const FULL_COUNT = [0, 1, 2, 2, 2, 2, 2, 5, 0];

export const POINTS = 90;
export const COLUMN_LETTERS = 'abcdefghi';

export const pointOf = (col, row) => row * 9 + col;
export const colOf = (p) => p % 9;
export const rowOf = (p) => (p - (p % 9)) / 9;
export const onBoard = (col, row) => col >= 0 && col < 9 && row >= 0 && row < 10;
export const sideName = (side) => (side === RED ? 'red' : 'black');
export const opponent = (side) => -side;

/** "e0" style name of a point. */
export function pointName(p) {
  return COLUMN_LETTERS[colOf(p)] + String(rowOf(p));
}

/** Parse "e0" style point names; returns -1 when the text is not a point. */
export function parsePoint(text) {
  if (typeof text !== 'string' || text.length !== 2) return -1;
  const col = COLUMN_LETTERS.indexOf(text[0]);
  const row = text.charCodeAt(1) - 48;
  if (col < 0 || row < 0 || row > 9) return -1;
  return pointOf(col, row);
}

/** Letter for a piece code: uppercase for Red, lowercase for Black. */
export function pieceLetter(piece) {
  const letter = TYPE_LETTERS[Math.abs(piece)];
  return piece > 0 ? letter : letter.toLowerCase();
}

/** Inverse of pieceLetter; returns 0 for an unknown letter. */
export function letterPiece(ch) {
  const upper = ch.toUpperCase();
  const type = TYPE_LETTERS.indexOf(upper);
  if (type <= 0 || ch === ' ') return 0;
  return ch === upper ? type : -type;
}

/** Type code for an uppercase type letter among A E H R C S; 0 otherwise. */
export function poolTypeOf(letter) {
  const t = TYPE_LETTERS.indexOf(letter);
  return t >= ADVISOR && t <= SOLDIER ? t : 0;
}

export function inPalace(side, p) {
  const c = colOf(p);
  const r = rowOf(p);
  return c >= 3 && c <= 5 && (side === RED ? r <= 2 : r >= 7);
}

export function onOwnSide(side, p) {
  return side === RED ? rowOf(p) <= 4 : rowOf(p) >= 5;
}

// ---------------------------------------------------------------------------
// Starting points and roles (rule 2.1)

/** ROLE[p] is the role of starting point p (0 if p is not a starting point). */
export const ROLE = new Int8Array(POINTS);
/** HOME[p] is RED or BLACK for a starting point, 0 otherwise. */
export const HOME = new Int8Array(POINTS);

const BASELINE = [CHARIOT, HORSE, ELEPHANT, ADVISOR, GENERAL, ADVISOR, ELEPHANT, HORSE, CHARIOT];
function seat(col, row, side, role) {
  ROLE[pointOf(col, row)] = role;
  HOME[pointOf(col, row)] = side;
}
for (let c = 0; c < 9; c++) {
  seat(c, 0, RED, BASELINE[c]);
  seat(c, 9, BLACK, BASELINE[c]);
}
for (const c of [1, 7]) {
  seat(c, 2, RED, CANNON);
  seat(c, 7, BLACK, CANNON);
}
for (const c of [0, 2, 4, 6, 8]) {
  seat(c, 3, RED, SOLDIER);
  seat(c, 6, BLACK, SOLDIER);
}

export const GENERAL_POINT = { [RED]: pointOf(4, 0), [BLACK]: pointOf(4, 9) };

/** True if p is one of side's 15 starting points for dark pieces. */
export function isDarkHome(side, p) {
  return HOME[p] === side && ROLE[p] !== GENERAL;
}

// ---------------------------------------------------------------------------
// Precomputed movement tables

const ORTHO = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

/** RAYS[p]: four arrays of points walking away from p (up, down, right, left). */
export const RAYS = [];
/** ORTHO_STEPS[p]: orthogonal neighbors of p. */
export const ORTHO_STEPS = [];
/** DIAG_STEPS[p]: diagonal neighbors of p. */
export const DIAG_STEPS = [];
/** ELEPHANT_STEPS[p]: [to, eye] pairs. The relation is symmetric. */
export const ELEPHANT_STEPS = [];
/** HORSE_STEPS[p]: [to, leg] pairs for a Horse standing on p. */
export const HORSE_STEPS = [];
/** HORSE_ATTACKERS[p]: [from, leg] pairs: a Horse on `from` reaches p if `leg` is empty. */
export const HORSE_ATTACKERS = [];
/** SOLDIER_STEPS[0][p] for Red, [1][p] for Black: forward, plus sideways once across the river. */
export const SOLDIER_STEPS = [[], []];

for (let p = 0; p < POINTS; p++) {
  const c = colOf(p);
  const r = rowOf(p);
  RAYS.push(ORTHO.map(([dc, dr]) => {
    const ray = [];
    for (let k = 1; onBoard(c + dc * k, r + dr * k); k++) ray.push(pointOf(c + dc * k, r + dr * k));
    return ray;
  }));
  ORTHO_STEPS.push(ORTHO.filter(([dc, dr]) => onBoard(c + dc, r + dr)).map(([dc, dr]) => pointOf(c + dc, r + dr)));
  DIAG_STEPS.push(DIAG.filter(([dc, dr]) => onBoard(c + dc, r + dr)).map(([dc, dr]) => pointOf(c + dc, r + dr)));
  ELEPHANT_STEPS.push(DIAG.filter(([dc, dr]) => onBoard(c + 2 * dc, r + 2 * dr))
    .map(([dc, dr]) => [pointOf(c + 2 * dc, r + 2 * dr), pointOf(c + dc, r + dr)]));
  const horse = [];
  for (const [dc, dr] of ORTHO) {
    if (!onBoard(c + dc, r + dr)) continue;
    const leg = pointOf(c + dc, r + dr);
    const outward = dc !== 0 ? [[2 * dc, 1], [2 * dc, -1]] : [[1, 2 * dr], [-1, 2 * dr]];
    for (const [ec, er] of outward) {
      if (onBoard(c + ec, r + er)) horse.push([pointOf(c + ec, r + er), leg]);
    }
  }
  HORSE_STEPS.push(horse);
  HORSE_ATTACKERS.push([]);
  for (const [s, forward] of [[0, 1], [1, -1]]) {
    const side = s === 0 ? RED : BLACK;
    const steps = [];
    if (onBoard(c, r + forward)) steps.push(pointOf(c, r + forward));
    if (!onOwnSide(side, p)) {
      if (onBoard(c - 1, r)) steps.push(pointOf(c - 1, r));
      if (onBoard(c + 1, r)) steps.push(pointOf(c + 1, r));
    }
    SOLDIER_STEPS[s].push(steps);
  }
}
for (let p = 0; p < POINTS; p++) {
  for (const [to, leg] of HORSE_STEPS[p]) HORSE_ATTACKERS[to].push([p, leg]);
}

/** Index of a side into two-element tables: 0 for Red, 1 for Black. */
export const sideIndex = (side) => (side === RED ? 0 : 1);

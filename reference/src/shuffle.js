// Shuffles, seeded layouts, and sealed-shuffle commitments (spec 6).

import { RED, BLACK, DARK, POOL_TYPES, pieceLetter, sideIndex } from './board.js';
import { BOARD_ORDER } from './position.js';
import { sha256, sha256Hex, utf8 } from './sha256.js';

export const SEED_DOMAIN = 'jieqi-seed';
export const COMMIT_DOMAIN = 'jieqi-shuffle';

export class ShuffleError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ShuffleError';
  }
}

/**
 * Deterministic byte stream for seeded shuffles (spec 6, section 3):
 * block k = SHA-256( "jieqi-seed" LF seed LF uint32be(k) ), k = 0, 1, 2, ...
 */
export class SeedStream {
  constructor(seed) {
    if (typeof seed !== 'string' || seed.length === 0) throw new ShuffleError('a seed must be a non-empty string');
    this.prefix = utf8(`${SEED_DOMAIN}\n${seed}\n`);
    this.counter = 0;
    this.block = null;
    this.offset = 32;
  }

  nextUint32() {
    if (this.offset >= 32) {
      const input = new Uint8Array(this.prefix.length + 4);
      input.set(this.prefix);
      new DataView(input.buffer).setUint32(this.prefix.length, this.counter++);
      this.block = sha256(input);
      this.offset = 0;
    }
    const b = this.block;
    const o = this.offset;
    this.offset += 4;
    return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  }
}

/** Cryptographically secure stream for real games (crypto.getRandomValues). */
export class SecureStream {
  constructor() {
    this.buffer = new Uint32Array(64);
    this.offset = 64;
  }

  nextUint32() {
    if (this.offset >= 64) {
      globalThis.crypto.getRandomValues(this.buffer);
      this.offset = 0;
    }
    return this.buffer[this.offset++];
  }
}

/** Uniform integer in [0, n) by rejection sampling, so every value is equally likely. */
export function uniformInt(stream, n) {
  const limit = Math.floor(0x100000000 / n) * n;
  let u;
  do u = stream.nextUint32(); while (u >= limit);
  return u % n;
}

/**
 * Draw a layout for the dark pieces of `pos` (spec 6, section 2).
 * For each side, Black first and then Red: expand the pool in the order
 * A E H R C S, run Fisher-Yates from the last index down, and give the first
 * entries to that side's dark pieces in board order. Any entries left over are
 * the identities of captured dark pieces the holder of `pos` never learned.
 */
export function drawLayout(pos, stream) {
  let letters = '';
  for (const side of [BLACK, RED]) {
    const pool = pos.pools[sideIndex(side)];
    const list = [];
    for (const t of POOL_TYPES) for (let k = 0; k < pool[t]; k++) list.push(t);
    for (let i = list.length - 1; i > 0; i--) {
      const j = uniformInt(stream, i + 1);
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    const darks = BOARD_ORDER.filter((p) => pos.board[p] === side * DARK);
    if (darks.length > list.length) throw new ShuffleError('the pool is smaller than the number of dark pieces');
    letters += darks.map((p, i) => pieceLetter(side * list[i])).join('');
  }
  return letters;
}

export function seededLayout(pos, seed) {
  return drawLayout(pos, new SeedStream(seed));
}

export function randomLayout(pos) {
  return drawLayout(pos, new SecureStream());
}

/** 32 random bytes as 64 lowercase hex digits. */
export function makeSalt() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The sealed-shuffle commitment (spec 6, section 4):
 * "sha256:" + hex( SHA-256( "jieqi-shuffle" LF board LF layout LF salt ) )
 */
export function commitment(boardField, layout, salt) {
  if (!/^[0-9a-f]{64}$/.test(salt)) throw new ShuffleError('salt must be 64 lowercase hex digits');
  return 'sha256:' + sha256Hex(`${COMMIT_DOMAIN}\n${boardField}\n${layout}\n${salt}`);
}

export function verifyCommitment(commit, boardField, layout, salt) {
  try {
    return commitment(boardField, layout, salt) === commit;
  } catch {
    return false;
  }
}

/** Seal a fresh shuffle for a starting position: { layout, salt, commitment }. */
export function sealShuffle(pos, { seed } = {}) {
  const layout = seed === undefined ? randomLayout(pos) : seededLayout(pos, seed);
  const salt = makeSalt();
  return { layout, salt, commitment: commitment(pos.boardField(), layout, salt), ...(seed === undefined ? {} : { seed }) };
}

// ---------------------------------------------------------------------------
// Layout numbers. Each side's arrangement of A2 E2 H2 R2 C2 S5 over its 15
// starting points is one of 15! / (2!^5 * 5!) = 340,540,200 possibilities.
// A layout number is the index of the arrangement in lexicographic order of
// letters (A < E < H < R < C < S, following the pool order), written per side.

export const ARRANGEMENTS_PER_SIDE = 340540200;

function multinomial(counts) {
  let n = 0;
  let result = 1;
  for (const c of counts) {
    for (let k = 1; k <= c; k++) {
      n++;
      result = (result * n) / k;
    }
  }
  return Math.round(result);
}

/** Index of a sequence of type codes among all arrangements of the same multiset, in lexicographic order. */
export function arrangementIndex(types) {
  const counts = new Map(POOL_TYPES.map((t) => [t, 0]));
  for (const t of types) counts.set(t, counts.get(t) + 1);
  let index = 0;
  for (const t of types) {
    for (const smaller of POOL_TYPES) {
      if (smaller === t) break;
      if (counts.get(smaller) > 0) {
        counts.set(smaller, counts.get(smaller) - 1);
        index += multinomial([...counts.values()]);
        counts.set(smaller, counts.get(smaller) + 1);
      }
    }
    counts.set(t, counts.get(t) - 1);
  }
  return index;
}

/** The arrangement at a given index, for a multiset { type: count }: the inverse of arrangementIndex. */
export function arrangementAt(index, countsByType) {
  const counts = new Map(POOL_TYPES.map((t) => [t, countsByType[t] || 0]));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const out = [];
  for (let i = 0; i < total; i++) {
    for (const t of POOL_TYPES) {
      if (counts.get(t) === 0) continue;
      counts.set(t, counts.get(t) - 1);
      const block = multinomial([...counts.values()]);
      if (index < block) {
        out.push(t);
        break;
      }
      index -= block;
      counts.set(t, counts.get(t) + 1);
    }
  }
  return out;
}

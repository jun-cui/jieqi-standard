# 6. Shuffles, layouts and commitments

All of the chance in Jieqi comes from one event, the shuffle before the game (rule 2.3). This document says how an arbiter draws the shuffle, how it commits to it so the game can be checked afterwards, and how to draw seeded shuffles that every implementation reproduces exactly.

## 1. Layouts

A layout gives the identity of every dark piece in a position. It is written as a string of identity letters, one per dark piece, in board order ([spec 3](03-position.md#31-board)), uppercase for Red and lowercase for Black, so Black's pieces come first.

In the starting position a layout has 30 letters. The first 15 belong to Black's dark points (`a9 b9 c9 d9 f9 g9 h9 i9 b7 h7 a6 c6 e6 g6 i6`) and the last 15 to Red's (`a3 c3 e3 g3 i3 b2 h2 a0 b0 c0 d0 f0 g0 h0 i0`).

The layout in which every piece stands on its usual Xiangqi point reads `rheaaehrccsssss` for Black and `SSSSSCCRHEAAEHR` for Red:

```
rheaaehrccsssssSSSSSCCRHEAAEHR
```

It is one of 340,540,200² possible layouts, and the only one in which every dark piece turns out to match its role.

## 2. Drawing a layout

Arbiters MUST draw layouts with the following procedure, fed by a source of uniformly random 32-bit words (section 2.1). For a seeded shuffle the source is the stream described in section 3.

```
for each side S, first Black and then Red:
    list  ← S's pool written out in the order A E H R C S
            (for the starting pool: A A E E H H R R C C S S S S S)
    n     ← length of list
    for i from n − 1 down to 1:
        j ← uniform(i + 1)                 ; 0 ≤ j ≤ i
        swap list[i] and list[j]
    give list[0], list[1], … to S's dark pieces in board order
```

If the pool holds more identities than there are dark pieces, which only happens when the holder of the position was not told about some captured pieces, the identities left over belong to those captured pieces. Section 6 explains why this is the right way to sample a hidden position.

### 2.1 Uniform integers

`uniform(n)` returns an integer from 0 to n − 1, each with the same probability. It uses rejection sampling so that no value is favored:

```
limit ← floor(2³² / n) × n
repeat: u ← next 32-bit word
until u < limit
return u mod n
```

### 2.2 Real games

In real games the 32-bit words MUST come from a cryptographically secure random number generator, and the procedure above MUST be used. Another correct method would give the same odds, but only this procedure makes seeded layouts reproducible.

## 3. Seeded shuffles

A seed is any non-empty UTF-8 string. It produces a stream of bytes made of 32-byte SHA-256 blocks:

```
block k = SHA-256( "jieqi-seed" ‖ 0x0A ‖ UTF-8(seed) ‖ 0x0A ‖ uint32_be(k) ),   k = 0, 1, 2, …
```

The stream is block 0, then block 1, and so on, and each 32-bit word is the next four bytes of the stream, read big-endian. Feeding this stream to the procedure of section 2 gives the seeded layout.

Seeded layouts are meant for research, testing and teaching, where a set of games has to be reproducible ("1,000 games with seeds `run-0000` to `run-0999`"). The record of a seeded game SHOULD give the seed in `shuffle.seed` ([spec 5](05-record.md#33-shuffle)). A seeded layout MUST NOT be used in a game where either player could find out or guess the seed.

### 3.1 Examples

| Seed | Layout of the starting position |
|---|---|
| `demo` | `scsascassheerhrSESHASSSRCAECRH` |
| `harbor` | `assrcsreasshehcASSHEASCESRCRHS` |

More examples, including the first words of a stream, are in [`conformance/shuffle.json`](../conformance/shuffle.json).

## 4. Sealed shuffles

A sealed shuffle is a layout the arbiter has committed to before the first move. The arbiter:

1. draws the layout (section 2);
2. draws a salt of 32 bytes from a cryptographically secure source, written as 64 lowercase hex digits;
3. computes the commitment

```
commitment = "sha256:" ‖ hex( SHA-256( "jieqi-shuffle" ‖ 0x0A ‖ board ‖ 0x0A ‖ layout ‖ 0x0A ‖ salt ) )
```

where `board` is the board field of the starting JPS, `layout` the layout string and `salt` the hex digits of the salt, all as ASCII text;

4. publishes the commitment to both players, and to anyone who will see the record, before the first move;
5. during the game, reveals identities only as the rules require;
6. after the game, opens the shuffle by publishing the layout and the salt, which in practice means publishing the arbiter's record ([spec 5](05-record.md)).

Without the salt the commitment would give the layout away: there are only 340,540,200 arrangements per side, few enough to try them all against the hash in seconds. Including the board field ties the commitment to one particular starting position.

## 5. Checking a game

Anyone with a record of the game, in any view, and the opened shuffle can check the game:

1. Compute the commitment again from the starting board, the layout and the salt. It MUST equal the commitment the record gave before the game.
2. Replay the record with the layout attached. Every reveal (`=X`) MUST equal the layout letter for the point the piece started on, and every disclosed capture (`:X`) MUST equal the layout letter for the captured piece's point. (Dark pieces never move without being revealed, so these points are known.)

If both checks pass, no identity was changed during the game. With the reference implementation: `jieqi verify FILE.jgr --layout L --salt S`.

## 6. Drawing identities during the game

An arbiter could instead leave the layout undecided and draw each identity at the moment of the reveal, uniformly from what is left. [Spec 8](08-probability.md#2-the-exchangeability-theorem) shows that the odds are exactly the same as with a layout drawn in advance. The difference is that nobody can check afterwards whether the draws were fair. A sealed shuffle costs one hash and makes every game checkable, which is why rule 2.4 requires it.

The same result means that drawing a layout from a party's pools with the procedure of section 2 gives a fair sample of the hidden positions that party considers possible. Engines can use this to sample positions for Monte Carlo search.

## 7. Layout numbers

Each side's arrangement of `A2 E2 H2 R2 C2 S5` over its 15 dark points is one of

```
15! / (2!⁵ × 5!) = 340,540,200
```

possibilities. Take a side's identities in board order as a word over the alphabet A < E < H < R < C < S. The layout number of that side is the word's index among all such words in lexicographic order, from 0 to 340,540,199. A whole starting layout can then be given as two numbers, Black's and then Red's, which is convenient when collecting opening statistics. The reference implementation provides `arrangementIndex` and `arrangementAt`, and `jieqi shuffle` prints both numbers.

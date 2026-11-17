# 3. Position strings (JPS)

A Jieqi Position String (JPS) is a single line of ASCII text holding everything needed to continue a game from a position (局面): the board, the side to move, what the holder of the string knows about each side's hidden pieces, and the two counters the rules depend on.

## 1. Summary

```
xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX r A2E2H2R2C2S5 a2e2h2r2c2s5 0 1
```

The fields are, in order: the board, the side to move, Red's pool, Black's pool, the limit count and the round. An arbiter's position has a seventh field, the layout.

The board field is the same for everyone, because the board is public. What differs between parties is in the pools. The arbiter's secret is kept in the separate layout field, so a position without that field can be shown to anyone who is entitled to its pools. Parsing is strict, and each position has exactly one valid spelling, so positions can be compared and hashed as plain strings.

## 2. Grammar

In ABNF (RFC 5234). Fields are separated by exactly one space, with nothing before the first field or after the last.

```abnf
jps          = board SP turn SP red-pool SP black-pool SP limit-count SP round [SP layout]

board        = row 9("/" row)              ; rows 9, 8, ..., 0
row          = 1*(piece / empty-run)       ; exactly 9 points, never two empty-runs in a row
piece        = red-piece / black-piece
red-piece    = "G" / "A" / "E" / "H" / "R" / "C" / "S" / "X"
black-piece  = "g" / "a" / "e" / "h" / "r" / "c" / "s" / "x"
empty-run    = %x31-39                     ; 1 to 9 empty points

turn         = "r" / "b"

red-pool     = "-" / 1*6(red-type count)   ; types in the order A E H R C S, each at most once
black-pool   = "-" / 1*6(black-type count)
red-type     = "A" / "E" / "H" / "R" / "C" / "S"
black-type   = "a" / "e" / "h" / "r" / "c" / "s"
count        = %x31-39                     ; types with a count of zero are left out

limit-count  = "0" / (%x31-39 *DIGIT)      ; no leading zeros
round        = %x31-39 *DIGIT              ; no leading zeros

layout       = 1*(red-type / black-type)   ; one letter per dark piece, in board order
```

## 3. Fields

### 3.1 Board

The board is written as ten rows, from row 9 (Black's baseline, at the top of a diagram with Red at the bottom) down to row 0 (Red's baseline). Each row goes from column `a` to column `i`. A digit stands for that many empty points; a letter stands for a piece.

| | Red | Black |
|---|---|---|
| General | `G` | `g` |
| Advisor | `A` | `a` |
| Elephant | `E` | `e` |
| Horse | `H` | `h` |
| Chariot | `R` | `r` |
| Cannon | `C` | `c` |
| Soldier | `S` | `s` |
| dark piece | `X` | `x` |

A dark piece is only ever written `X` or `x`. How it moves follows from the point it stands on (rule 3.3), so nothing else is needed.

Board order is the order in which the board field lists the points: row 9 to row 0, and within each row column `a` to column `i`. Wherever this standard lists dark pieces, it uses board order. Black's starting points are in rows 6 to 9 and Red's in rows 0 to 3, so in board order all of Black's dark pieces come before all of Red's.

### 3.2 Turn

`r` when Red is to move, `b` when Black is to move.

### 3.3 Pools

A pool is a multiset of identities. Side S's pool, as held by whoever holds the string, contains:

- the identity of each of S's dark pieces on the board, and
- the identity of each of S's captured dark pieces that the holder was not told about (rule 5.3).

Identities the holder can already account for are not in the pool: revealed pieces, and captured dark pieces whose identity the holder was told.

A pool is written as type letters followed by counts, in the order A E H R C S, leaving out types with a count of zero. An empty pool is written `-`. Red's pool is in uppercase and Black's in lowercase. The case carries no extra information, but it means that two pools swapped by mistake fail to parse.

The number of S's captured dark pieces whose identity the holder does not know is

```
unknown captured(S) = |pool(S)| − (number of S's dark pieces on the board)
```

For example: Red opens with its Cannon-role piece on `h2`, which turns out to be a Cannon (`h2e2=C`). Black's Cannon-role piece on `b7` then captures the dark piece on `b0` and also turns out to be a Cannon. Only Black is told that the piece it took was a Horse (`b7b0=C:H`).

| Held by | Red pool | Red dark pieces | Unknown captured |
|---|---|---|---|
| Red (not told) | `A2E2H2R2C1S5` (14) | 13 | 1 |
| Black (told it was a Horse) | `A2E2H1R2C1S5` (13) | 13 | 0 |
| a spectator | `A2E2H2R2C1S5` (14) | 13 | 1 |

### 3.4 Limit count

The number of moves played since the last capture or reveal, from 0 to 120. When it reaches 120 the game is drawn (rule 8.3).

### 3.5 Round

The round (回合). It starts at 1 and goes up by one after each of Black's moves.

### 3.6 Layout (arbiter positions only)

The seventh field only appears in a position held by the arbiter, or in research that deliberately treats the layout as known. It has one identity letter per dark piece on the board, in board order, uppercase for Red and lowercase for Black.

The arbiter knows every identity, so an arbiter position has no unknown captures: each side's pool MUST be exactly the multiset of that side's layout letters.

```
xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX r A2E2H2R2C2S5 a2e2h2r2c2s5 0 1 scsascassheerhrSESHASSSRCAECRH
```

This is the starting position with the layout drawn from the seed `demo` ([spec 6](06-shuffle.md#3-seeded-shuffles)). The second letter, `c`, says that the Black dark piece on `b9` is a Cannon. The twenty-fourth, `R`, says that the Red dark piece on `b0` is a Chariot; it is the piece Black captures on move 2 of the example game.

A JPS with a layout MUST NOT be sent to a player or used as the `start` of a game record. Game records keep the layout apart, in the shuffle object ([spec 5](05-record.md#33-shuffle)).

## 4. Canonical form

A JPS is canonical when it matches the grammar exactly: single spaces, no two digit runs next to each other, pools in A E H R C S order with no zero counts and `-` for an empty pool, and counters written without leading zeros. Parsers MUST reject strings that are not canonical, and writers MUST only produce canonical strings.

## 5. Validity

A well-formed JPS is valid when all of the following hold:

1. Each side has exactly one General, standing in its own palace.
2. Every dark piece stands on one of its own side's 15 dark starting points (rule 2.1).
3. For each side and each type T among A E H R C S, the number of revealed pieces of type T on the board plus pool(T) is no more than the number of pieces of type T a side owns (2, or 5 for Soldiers).
4. For each side, the pool holds at least as many identities as the side has dark pieces on the board.
5. If there is a layout, it has one letter per dark piece, each letter has the case of its piece's side, and each side's letters are exactly that side's pool.
6. The side that is not to move is not under jiang, and the Generals do not face each other (rules 6.1 to 6.3).
7. The limit count is no more than 120.

A valid position does not have to be reachable from the start. Studies, puzzles and endgame research often use positions that are not, and rule 4.9 allows a revealed Soldier to stand anywhere, even on its own baseline.

Programs that accept positions from outside MUST check validity. They MAY offer a way to accept well-formed but invalid positions, for example in a position editor.

## 6. Repetition key

For the repetition rules (rule 9.1), two positions are the same exactly when their first four fields (board, turn and both pools) are identical as text.

## 7. More examples

| Position | JPS |
|---|---|
| Start | `xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX r A2E2H2R2C2S5 a2e2h2r2c2s5 0 1` |
| After `h2e2=C b7b0=C:?`, as a spectator sees it | `xxxxgxxxx/9/7x1/x1x1x1x1x/9/9/X1X1X1X1X/1X2C4/9/XcXXGXXXX r A2E2H2R2C1S5 a2e2h2r2c1s5 0 2` |
| Killed: Black to move, no legal move | `R3g4/R8/9/9/9/9/9/9/9/3G5 b - - 0 1` |
| Trapped: Black to move, no legal move, not under jiang | `4g4/R8/9/9/9/9/9/9/5R3/3G5 b - - 0 1` |
| A revealed Elephant across the river | `3g5/9/9/9/2E6/9/9/9/9/4G4 b - - 0 1` |

## Notes

The pools record what is still unknown rather than what has been captured. A list of captured pieces would have to be turned into a pool before any odds could be computed, and a pool can also describe a study that starts with an unusual set of hidden pieces.

The string does not say whose knowledge it holds. A pool means the same thing to everyone ("identities I cannot yet account for"), and the odds are computed the same way whoever holds it. Game records and engine sessions state the view separately where it matters ([spec 5](05-record.md#4-views), [spec 7](07-engine-protocol.md#4-views-and-what-engines-are-told)).

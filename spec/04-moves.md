# 4. Coordinates, move codes and traditional notation

This document defines three things: coordinates for the points of the board, move codes (the form in which programs store and exchange moves), and traditional notation (the form in which people read and write them, such as 炮二平五 or `C2.5`).

## 1. Coordinates

A point is named by a column letter followed by a row digit.

```
     a   b   c   d   e   f   g   h   i        Black
 9   ●───●───●───●───●───●───●───●───●        (row 9 is Black's baseline)
 8   │   │   │   │ ╲ │ ╱ │   │   │   │
 7   │   ●   │   │ ╱ │ ╲ │   │   ●   │
 6   ●───┼───●───┼───●───┼───●───┼───●
 5   ─────────────── river ───────────────
 4   │   │   │   │   │   │   │   │   │
 3   ●───┼───●───┼───●───┼───●───┼───●
 2   │   ●   │   │ ╲ │ ╱ │   │   ●   │
 1   │   │   │   │ ╱ │ ╲ │   │   │   │
 0   ●───●───●───●───●───●───●───●───●        Red
                                              (row 0 is Red's baseline)
```

- Columns `a` to `i` run from Red's left to Red's right.
- Rows `0` to `9` run from Red's baseline to Black's baseline.
- The Red General starts on `e0` and the Black General on `e9`.
- Where a program needs a number for a point, it uses `row × 9 + column` with `a` = 0, which runs from 0 (`a0`) to 89 (`i9`).

Coordinates do not depend on whose turn it is. They are meant for programs; people usually read traditional notation (section 5).

## 2. Move codes

A move code names a move by its two points. Optional suffixes record what the move revealed. The same grammar is used in two ways:

- a decision, such as `h2e2`, is what a player or engine chooses, and never has suffixes;
- an outcome, such as `h2e2=R`, `b2b9=C:H` or `b2b9=C:?`, is what happened: the move plus whatever it revealed.

```abnf
move-code    = from to [reveal] [disclosure]
from         = point
to           = point
point        = %x61-69 DIGIT          ; a-i, 0-9
reveal       = "=" identity           ; what the moving dark piece turned out to be
disclosure   = ":" (identity / "?")   ; what the captured dark piece was, or "?" if not known
identity     = "A" / "E" / "H" / "R" / "C" / "S"
```

### 2.1 Meaning

- `from` and `to` are the starting and finishing points of the move. They are never the same point.
- `=X` is present exactly when the moving piece was dark, and gives the identity it showed when it was revealed (rule 3.4). Everyone sees a reveal, so every view writes it.
- `:X` is present exactly when the captured piece was dark. It gives the captured piece's identity if whoever writes the code was told it (rule 5.3), and `?` otherwise. Capturing a revealed piece adds no suffix, since the board already shows what was taken.
- Identity letters in move codes are always uppercase. The side is implied: the reveal belongs to the side that moved and the disclosure to the other side.
- When both suffixes are present the reveal comes first.

### 2.2 Outcome codes are view-dependent

The same move can be written differently depending on who writes it. Suppose Black's Cannon-role piece on `b7` captures Red's dark piece on `b0`, jumping over the piece on `b2`; it turns out to be a Cannon, and the piece it took was a Horse:

| Written by | Outcome code |
|---|---|
| the arbiter | `b7b0=C:H` |
| Black (the capturer) | `b7b0=C:H` |
| Red (the owner) | `b7b0=C:?` |
| a spectator | `b7b0=C:?` |

Under the `open-capture` modifier (rule 11) everyone writes `:H`.

### 2.3 Writing and reading

1. A writer MUST include `=X` if and only if the moving piece was dark.
2. A writer MUST include a disclosure if and only if the captured piece was dark.
3. A writer MUST write the identity in a disclosure when its view entitles it to know it, and `?` when it does not. Writing `?` where the identity is known loses information, and writing an identity the view is not entitled to leaks it; both are errors.
4. A reader MUST reject a move code that does not match the grammar, and MUST check it against the position: the move must be legal, the suffixes must be present exactly when required, and every identity must still be in the right pool.

A decision never needs to say which piece moves, because the board shows it, and a dark piece's movement is fixed by its point. Four characters are therefore enough for any move, and records, positions and the engine protocol all use the same move format.

## 3. Lists of moves

In plain text, move codes are separated by single spaces: `h2e2=C h7e7=H b0c2=R`. In JSON a list of moves is an array of strings.

## 4. Other notations

Programs MAY accept moves from people in traditional notation (section 5) and convert them to move codes. Anything a program stores or sends to another program MUST use move codes.

## 5. Traditional notation

Traditional notation describes a move from the point of view of the side making it:

```
[dark marker] <piece> <line or position word> <action> <target> [(revealed identity)]
```

| Part | Chinese | English | Meaning |
|---|---|---|---|
| dark marker | 暗 | `X` | The moving piece was dark, so it is named by its role. |
| piece | 帅仕相马车炮兵 (Red), 将士象马车炮卒 (Black) | `G A E H R C S` | The identity of a revealed piece, or the role of a dark one. |
| line | 一 to 九 (Red), １ to ９ (Black) | `1` to `9` | The line number (路) of the piece's column, counted from the mover's own right. |
| action | 进 / 退 / 平 | `+` / `-` / `.` | Advance (toward the opponent), retreat, or traverse (sideways). |
| target | as for the line | as for the line | See below. |
| revealed identity | (马) | `(H)` | What the dark piece turned out to be. |

### 5.1 Line numbers

Each player counts the columns from their own right, so the same column has different numbers for the two players:

| Column | a | b | c | d | e | f | g | h | i |
|---|---|---|---|---|---|---|---|---|---|
| Red | 九 9 | 八 8 | 七 7 | 六 6 | 五 5 | 四 4 | 三 3 | 二 2 | 一 1 |
| Black | １ 1 | ２ 2 | ３ 3 | ４ 4 | ５ 5 | ６ 6 | ７ 7 | ８ 8 | ９ 9 |

In Chinese, Red's numbers are written as Chinese numerals and Black's as full-width digits. In English both are written as ordinary digits.

### 5.2 Target

- For a traverse, the target is the line number of the destination.
- For an advance or retreat by a piece that moves in straight lines (General, Chariot, Cannon, Soldier), it is the number of rows moved.
- For an advance or retreat by a piece that moves diagonally (Advisor, Elephant, Horse), it is the line number of the destination.

### 5.3 Pieces on the same column

Pieces only need telling apart from pieces of the same class: same side, both dark or both revealed, and the same type (for a dark piece, the same role). The dark marker already tells a dark piece from a revealed piece of the same type.

When two or more pieces of the same class stand on the mover's column, the line number is replaced by a position word, counted from the front (the end nearer the opponent):

| Pieces on the column | Chinese | English |
|---|---|---|
| 2 | 前 front, 后 rear | `f`, `r` |
| 3 | 前, 中 middle, 后 | `f`, `m`, `r` |
| 4 or 5 | 一 二 三 四 五, from the front | `#1` to `#5`, from the front |

In Chinese the position word comes before the piece (前车进一); in English it comes after the letter (`Rf+1`). If another column also has two or more pieces of the same class, the line number is added after the position word: 前兵七进一, `Sf7+1`.

### 5.4 Examples

| Move code | Position | Chinese | English |
|---|---|---|---|
| `h2e2=C` | start | 暗炮二平五(炮) | `XC2.5(C)` |
| `b0c2=R` | start | 暗马八进七(车) | `XH8+7(R)` |
| `h7e7=S` | after `h2e2=R` | 暗炮８平５(卒) | `XC8.5(S)` |
| `c0e2` | a revealed Elephant on `c0` | 相七进五 | `E7+5` |
| `d0e1` | a revealed Advisor on `d0` | 仕六进五 | `A6+5` |
| `a5a6` | Red Chariots on `a5` and `a0` | 前车进一 | `Rf+1` |
| `e0e1` | | 帅五进一 | `G5+1` |

Traditional notation depends on the position and on the language, so programs show it to people but MUST NOT store it or exchange it in place of move codes.

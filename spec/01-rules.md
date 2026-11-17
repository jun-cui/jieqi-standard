# 1. Rules

This document defines the game of Jieqi (揭棋, *jiēqí*), the form of Xiangqi (象棋) in which the pieces start face down. It is the ruleset called `jieqi`. Positions, records and engine sessions that do not name a ruleset are played under it.

Jieqi is not the same game as Banqi (暗棋, also called 翻翻棋), where pieces are turned over in place on half a board. In Jieqi the pieces stand on the normal Xiangqi starting points and are turned over by moving them.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are used as described in RFC 2119 and RFC 8174. Rules are numbered so they can be cited, for example "rule 9.5".

## 1. Equipment

**1.1 Board.** The board is formed by 9 vertical lines and 10 horizontal lines, which cross at 90 points. Pieces stand on the points.

**1.2 River.** The river (河界) runs between the fifth and sixth horizontal lines and splits the board in two. The half that contains a side's baseline is its own side; the other half is its far side.

**1.3 Palaces.** Each side has a palace (九宫), the block of 3 × 3 points in the middle of its baseline, marked with diagonal lines.

**1.4 Coordinates.** These rules use the coordinates of [spec 4](04-moves.md#1-coordinates). Columns `a` to `i` run from Red's left to Red's right, rows `0` to `9` from Red's baseline to Black's. A point is written as column and row, for example `e0`.

| | Red | Black |
|---|---|---|
| Baseline (底线) | row 0 | row 9 |
| Own side | rows 0–4 | rows 5–9 |
| Palace | `d0`–`f2` | `d7`–`f9` |
| Center of the palace | `e1` | `e8` |

**1.5 Pieces.** Red (红方) and Black (黑方) each have 16 pieces.

| Piece | Red | Black | Number | Letter |
|---|---|---|---|---|
| General | 帅 | 将 | 1 | G |
| Advisor | 仕 | 士 | 2 | A |
| Elephant | 相 | 象 | 2 | E |
| Horse | 马 (傌) | 马 (馬) | 2 | H |
| Chariot | 车 (俥) | 车 (車) | 2 | R |
| Cannon | 炮 | 炮 (砲) | 2 | C |
| Soldier | 兵 | 卒 | 5 | S |

The Chariot is written R because C is already taken by the Cannon.

**1.6** When played with physical pieces, the backs of all pieces of one side MUST look the same.

## 2. Setting up

**2.1 Starting points and roles.** Each side has 16 starting points (原位), the points its pieces occupy in the Xiangqi starting position. The role of a starting point is the type of piece that stands there in Xiangqi.

| Role | Red | Black |
|---|---|---|
| General | `e0` | `e9` |
| Advisor | `d0` `f0` | `d9` `f9` |
| Elephant | `c0` `g0` | `c9` `g9` |
| Horse | `b0` `h0` | `b9` `h9` |
| Chariot | `a0` `i0` | `a9` `i9` |
| Cannon | `b2` `h2` | `b7` `h7` |
| Soldier | `a3` `c3` `e3` `g3` `i3` | `a6` `c6` `e6` `g6` `i6` |

**2.2 Generals.** Each General is placed face up on its own General point (`e0`, `e9`).

**2.3 Shuffle.** The other 15 pieces of each side are shuffled (洗子) and placed face down, one on each of that side's remaining 15 starting points. Each side is shuffled separately and every arrangement MUST be equally likely. The resulting arrangement is called the layout. Nobody looks at the layout, the owner of the pieces included.

**2.4 Digital play.** In digital play the arbiter is the program that holds the layout and applies these rules. The arbiter:

1. MUST draw the layout uniformly at random from a cryptographically secure source, or, for research games, from a declared seed as described in [spec 6](06-shuffle.md#3-seeded-shuffles);
2. MUST commit to the layout before the first move, as described in [spec 6](06-shuffle.md);
3. MUST NOT reveal any part of the layout before the game is over, except as rules 3.4 and 5.3 require.

**2.5 First move.** Red moves first, then the sides alternate. Passing is not allowed.

## 3. Dark and revealed pieces

**3.1** A piece lying face down is a dark piece (暗子). A piece lying face up is a revealed piece (明子). The Generals are always revealed.

**3.2 Identity and role.** The identity of a piece is what it really is. A dark piece always stands on one of its own side's starting points, because it is revealed the first time it moves (rule 3.4), so it always has a role.

**3.3 Moving in role.** A dark piece moves in role: exactly as the Xiangqi piece of its point's role would, with all the restrictions that piece has in Xiangqi.

| Role | How the dark piece moves |
|---|---|
| Chariot | as a Chariot (4.5) |
| Horse | as a Horse (4.4) |
| Elephant | as an Elephant (4.3); from `c0` and `g0` it can only reach `a2`, `e2` and `i2`, and likewise for Black |
| Advisor | to the center of the palace only (`d0` or `f0` to `e1`, `d9` or `f9` to `e8`) |
| Cannon | as a Cannon (4.6), including captures over a screen |
| Soldier | one point forward only |

**3.4 Reveal.** When a dark piece has moved, with or without capturing, it is turned face up on the point where it landed. This is the reveal (揭). Both players now see its identity, and from then on it moves according to its identity. The reveal is part of the move, not a separate move.

**3.5** A revealed piece is never turned face down again.

## 4. How revealed pieces move

**4.1 General** (帅/将). One point along a column or row. It MUST stay inside its own palace.

**4.2 Advisor** (仕/士). One point diagonally. A revealed Advisor is not confined to the palace and may go anywhere on the board. (A dark piece in the Advisor role is confined; see 3.3.)

**4.3 Elephant** (相/象). Exactly two points diagonally. The point in between, the elephant's eye (象眼), MUST be empty; if it is occupied the move is blocked (塞象眼). A revealed Elephant may cross the river.

**4.4 Horse** (马). One point along a column or row and then one point diagonally away from where it started, in the shape of the character 日. The first point, the horse's leg (马腿), MUST be empty; if it is occupied the Horse is hobbled (蹩马腿) in that direction.

**4.5 Chariot** (车). Any number of points along a column or row, without passing over any piece.

**4.6 Cannon** (炮). When it does not capture, it moves like a Chariot. To capture, it jumps along a column or row over exactly one piece, the screen (炮架), and takes the next piece beyond it. The screen can belong to either side and can be dark or revealed. There may be empty points before and after the screen.

**4.7 Soldier** (兵/卒). One point forward. Once it is on its far side (it has crossed the river) it may instead move one point sideways. It never moves backward. On the far baseline it can only move sideways.

**4.8 Forward.** Forward is toward row 9 for Red and toward row 0 for Black.

**4.9** How a revealed piece moves depends only on its identity and the point it stands on. A piece that turns out to be a Soldier on its own baseline still moves one point forward. A revealed Elephant on its far side moves the same way it would on its own side.

## 5. Capturing

**5.1** A piece captures by moving, according to its movement rules, onto a point occupied by an opposing piece, dark or revealed. The captured piece is removed from the game. Capturing is never compulsory.

**5.2** A dark piece may capture while moving in role. It is revealed after the capture (3.4).

**5.3 Capture disclosure.** When a dark piece is captured, its identity is shown to the capturing side only. The owner of the piece is not told, and neither are spectators. As a result the capturer can know more about the owner's remaining hidden pieces than the owner does.

**5.4** Legal play never allows a General to be captured (rule 6.3).

## 6. Safety of the General

**6.1 Jiang.** A General is under jiang (被将) when an opposing piece could capture it with a move under rules 3 to 5. Dark pieces threaten according to their role. A move gives jiang (将军) when it leaves the opposing General under jiang.

**6.2 Facing Generals** (将帅对面). The two Generals may not stand on the same column with no piece between them. Any piece between them blocks, whatever its side and whether it is dark or revealed. A General facing the other General counts as being under jiang from it.

**6.3** A move is illegal if, after it, the mover's own General is under jiang, including by facing the other General. Every move that satisfies the movement rules and this rule is legal.

**6.4** Whether a move is legal never depends on hidden information. Blocking depends only on which points are occupied, and dark pieces threaten only according to their role, so a reveal cannot make a move legal or illegal after the fact.

## 7. Knowledge

**7.1** Neither player knows the identity of a dark piece, including their own. The only parties who can know it are the arbiter and, once the piece has been captured, the side that captured it (5.3).

**7.2** The board is public: every revealed piece and the position of every dark piece. So is every move, every reveal and every captured revealed piece.

**7.3** The identity of a captured dark piece is known to the side that captured it. The arbiter knows everything.

**7.4** For each side, the identities a given party cannot yet account for form that side's pool, as seen by that party. [Spec 8](08-probability.md) shows that a party's pools are all it needs to work out the exact odds of every reveal.

**7.5** A player MUST NOT try to learn hidden identities by any means outside these rules. An arbiter MUST NOT let them leak, whether through the content, the timing or the order of its messages.

## 8. End of the game

**8.1** A side that has no legal move when it is its turn loses. If it is under jiang it has been killed (将死). If it is not under jiang it is trapped (困毙).

**8.2** The repetition rules of section 9 apply.

**8.3 Natural move limit** (自然限着). If 120 moves in a row (60 rounds) are played without a capture or a reveal, the game is drawn.

**8.4 Bare Generals.** If nothing but the two Generals is left on the board, the game is drawn.

**8.5 Resignation** (认输). A player may resign at any time, and the opponent wins.

**8.6 Agreed draw** (议和). The players may agree to a draw at any time.

**8.7 Time** (超时). When a time control is in use, a player whose time runs out loses.

**8.8 Forfeit** (判负). The arbiter may declare a loss for a breach of these rules. In digital play this covers an engine sending an illegal move, a protocol error, and abandoning the game. An illegal move is never played.

**8.9** After every move the arbiter checks 8.1, then section 9, then 8.3, then 8.4. The first one that applies decides the game.

## 9. Repetition

**9.1 Same position.** Two positions are the same when every point holds the same thing (the same side, dark or revealed, and for a revealed piece the same identity), the same side is to move, and both sides' pools are the same.

**9.2 Reversible stretch.** Captures and reveals are irreversible moves. Repetition is only looked for among the positions since the last irreversible move, counting the position right after it.

**9.3** When a position occurs for the third time within the reversible stretch, the game ends. The span is the moves made after the first occurrence of that position, up to and including the move that produced the third occurrence.

**9.4** Every move in the span is one of three kinds:

- a jiang, if it gives jiang (6.1);
- a chase (捉), if it is not a jiang and meets rule 9.5;
- an idle move (闲着), otherwise.

**9.5 Chase.** Let S be the side that moved, P₀ the position before the move and P₁ the position after it. The move is a chase if there is an opposing piece T on some point *t* such that all four of these hold:

1. T is revealed, T is not the General, and T is not a Soldier on its own side of the river.
2. In P₁, supposing it were S's turn, S has a legal capture of T made by a piece that is neither a General nor a Soldier. For a dark capturing piece the role counts.
3. In P₀, S had no legal capture of T on *t* by such a piece.
4. At least one of the captures in condition 2 leaves T's side unable to recapture on *t*, or T is a Chariot and the capturing piece is not a Chariot (by identity, or by role if dark). For this test, a recapture is any move by T's side onto *t* that follows the movement rules; the safety of the General is not considered.

**9.6 Verdict.** A side is perpetual in the span if every one of its moves in the span is a jiang or a chase.

- If exactly one side is perpetual, that side loses. The reason is perpetual jiang (长将) if all its moves in the span were jiangs, and perpetual chase (长捉) otherwise.
- If neither side is perpetual, or both are, the game is drawn by repetition.

**9.7** Tournament Xiangqi treats chasing in much more detail: degrees of protection, relative piece values, threats of a kill and so on. This ruleset keeps the core of the classical rule (no endless jiang, no endless chasing of an undefended piece or of a Chariot) and states it as a test that a program can apply mechanically, so that every implementation reaches the same verdict.

## 10. Results

Every finished game has one outcome and one reason.

| Outcome | Possible reasons |
|---|---|
| Red wins or Black wins | `kill`, `trap`, `perpetual-jiang`, `perpetual-chase`, `resignation`, `time`, `forfeit`, `adjudication` |
| Draw | `repetition`, `move-limit`, `bare-generals`, `agreement`, `adjudication` |

`adjudication` is a decision by the arbiter outside the rules above, for example when a match has to be stopped. A record of such a game says who made the decision and why ([spec 5](05-record.md#7-results)).

## 11. Rule modifiers

A ruleset name may be followed by named modifiers, as in `jieqi+name`. A program that meets a modifier it does not know MUST refuse the game instead of guessing. One modifier is defined:

| Modifier | Effect |
|---|---|
| `open-capture` | Replaces rule 5.3: the identity of a captured dark piece is shown to both players and to spectators. |

## Notes

Revealed Advisors and Elephants are free to leave the palace and cross the river because that is how Jieqi is commonly played, and because a piece can be revealed far from where its type normally belongs. Dark pieces still move in role with the usual restrictions, so the opening keeps the shape of Xiangqi.

Capture disclosure is private by default because the resulting difference in knowledge is a large part of what makes Jieqi different from Xiangqi. The `open-capture` modifier exists for anyone who wants both players to know the same things.

A reveal resets the natural move limit, like a capture, because it cannot be undone and it changes what both players know.

Waiting for the third occurrence of a position means the span always covers two full cycles, so returning to a position once by accident is never punished.

An arbiter could also draw each identity at the moment of the reveal. [Spec 8](08-probability.md#2-the-exchangeability-theorem) shows that this gives exactly the same odds as a layout fixed in advance, but nobody can check it afterwards, which is why rule 2.4 requires a committed layout.

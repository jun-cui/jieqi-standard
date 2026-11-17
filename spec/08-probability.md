# 8. Probability

This document describes exactly what each party can know about the identities of dark pieces, and shows that a party's pools contain all of it. Programs that follow it compute the same odds for every reveal, and those odds are correct.

## 1. Setting

The layout is drawn uniformly at random before the game, separately for each side (rule 2.3). During the game, identities become known in three ways:

- a reveal (`=X`), which everyone sees;
- a capture disclosure (`:X`), which the capturer and the arbiter see;
- the layout published after the game, which everyone sees.

For a party V and a side S, let U(V, S) be the pieces of S whose identity V has not been told: S's dark pieces on the board, plus S's captured dark pieces whose disclosure V did not see. The pool, pool(V, S), is the multiset of the identities of the pieces in U(V, S). It is the pool written in a JPS held by V ([spec 3](03-position.md#33-pools)).

V can always work out its pools from what it has seen: start from S's 15 identities, then remove every identity V saw revealed and every identity V was told in a disclosure.

## 2. The exchangeability theorem

**Theorem 1.** Suppose the arbiter does not draw a layout in advance. Instead, whenever one of S's dark pieces is revealed or captured, it draws that piece's identity uniformly from S's identities that have not been drawn yet. This produces exactly the same joint distribution of identities and events as a uniform layout drawn before the game, whatever rule the players use to choose their moves, even one that depends on earlier draws.

*Proof sketch.* Under a uniform layout, once the identities at some of S's points are known, the identities at the remaining points are uniformly distributed over the arrangements of what is left, by the symmetry of the uniform distribution. So whichever point is queried next, its identity is uniform over the remaining identities, which is exactly what the draw at reveal time does. The two processes agree at every step, so they have the same distribution.

**Theorem 2.** Using only the information the rules provide (that is, conditioning on the events V has seen and treating the sequence of moves as given), the identities of the pieces in U(V, S) are a uniformly random arrangement of pool(V, S). In particular, any single dark piece of S has

```
P(identity = T) = pool(V, S)[T] / |pool(V, S)|
```

and any *k* given pieces of U(V, S) have the distribution of *k* draws without replacement from the pool.

*Proof sketch.* A uniform layout conditioned on the identities V has seen is uniform over the layouts consistent with them, and those are exactly the arrangements of pool(V, S) over U(V, S). Nothing V has seen distinguishes a dark piece still on the board from a captured piece V was not told about, so they are interchangeable in this distribution.

Some consequences:

1. Reveal odds can be computed from a position's pools alone. The history of the game is not needed.
2. A captured dark piece that V was not told about still counts in V's pool. Its identity is just as uncertain as that of a piece still on the board.
3. Drawing a layout from V's pools with the procedure of [spec 6](06-shuffle.md#2-drawing-a-layout) gives a fair sample of the hidden positions V considers possible.

Theorem 2 conditions on events, not on behavior. A player who reasons "my opponent is playing as if it knows it captured my Chariot" is drawing conclusions from the opponent's moves. That is legitimate, but it is strategy, not something the rules provide, and it is outside this standard. The reveal odds reported in the engine protocol are always the pool odds of Theorem 2 ([spec 7](07-engine-protocol.md#7-candidates-and-reveal-breakdowns)).

## 3. Examples

At the start every pool is `A2 E2 H2 R2 C2 S5`. The first dark piece Red moves is a Soldier with probability 5/15 = 1/3, and each other type with probability 2/15, about 13.3%.

Now suppose Red opens by moving its Cannon-role piece, which turns out to be a Cannon (`h2e2=C`). Black then captures one of Red's dark pieces and is told it was a Chariot; Red is told nothing. Red has 13 dark pieces left on the board:

| Party | Red pool | P(Red's next reveal is a Chariot) |
|---|---|---|
| Red | `A2E2H2R2C1S5` (14, of which 13 on the board) | 2/14 ≈ 14.3% |
| Black | `A2E2H2R1C1S5` (13) | 1/13 ≈ 7.7% |
| a spectator | `A2E2H2R2C1S5` (14) | 2/14 ≈ 14.3% |

Black now knows more about Red's hidden pieces than Red does. The pools make the difference exact.

As an example of joint odds, the chance that both of Red's Cannon-role pieces turn out to be Chariots, seen from the starting position, is (2/15) × (1/14) = 1/105.

## 4. Values and chance nodes

A game tree for Jieqi has decision nodes, where a player chooses a move, and chance nodes, where the identity of a dark piece is drawn. A move by a dark piece leads to a chance node with one branch per identity in the mover's pool, weighted by the odds of Theorem 2. A capture of a dark piece gives the capturer one more chance event, the disclosure, weighted by the opponent's pool.

The expected score of a position for the side to move is the value of this tree under the players' strategies, counting a win as 1, a draw as ½ and a loss as 0. The `ev` reported in the engine protocol is an engine's estimate of it, and its `reveals` breakdown gives the values of the branches of a chance node ([spec 7](07-engine-protocol.md#6-scores)).

Apart from capture disclosures, Jieqi is a game of perfect information with chance moves, much like backgammon. Engines can therefore use expectimax and Monte Carlo methods with explicit chance nodes, and handle the private part by sampling layouts from their own pools (consequence 3).

A forced result, such as `kill` in the engine protocol, has to hold on every branch of every chance node. Its value is exactly 1 or 0, not an average that happens to be close.

## 5. Tree counts

A tree count is the number of distinct sequences of a given number of moves, counting the outcomes of chance events. It is the usual way to check that a move generator is correct. There are two kinds:

- Chance mode, for a position without a layout. A legal move by a revealed piece counts once. A legal move by a dark piece counts once for each different identity left in the mover's pool, and that identity is then removed from the pool. A captured dark piece is not branched on: its identity stays unknown and the pools stay as they are. The count is the number of different public histories.
- Layout mode, for a position with a layout. Each move has exactly one outcome, given by the layout.

From the starting position:

| Depth | Chance mode | Layout mode, seed `demo` |
|---|---|---|
| 1 | 259 | 44 |
| 2 | 66,462 | 1,926 |
| 3 | 13,862,869 | 71,080 |

At depth 1 in chance mode there are 43 moves by dark pieces with 6 possible identities each, plus 1 move by the General: 43 × 6 + 1 = 259. More counts, from other positions, are in [`conformance/tree-counts.json`](../conformance/tree-counts.json).

## 6. Measuring hidden information

Because an engine accepts the arbiter's view as well as a player's, the effect of hidden information can be measured. Analyze the same positions twice, once from the player's view and once from the arbiter's view with the layout attached, and compare.

For a single position the difference can go either way. When the layout is bad news for the side to move, the arbiter-view evaluation is lower. What the layout is worth on average shows up as better decisions, so it has to be measured over many positions, for example over a set of sealed games. [`examples/analysis/information-value.json`](../examples/analysis/information-value.json) shows the comparison for a few positions of the example game.

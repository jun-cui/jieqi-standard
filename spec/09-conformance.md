# 9. Conformance

A program conforms to jieqi-standard when it meets the requirements of the documents it implements and passes the corresponding test vectors in [`conformance/`](../conformance). If a vector and the text of a document disagree, one of them is wrong; please report it.

## 1. Classes

A program states which of the following classes it meets. Most programs meet several.

| Class | Requirements | Vectors |
|---|---|---|
| Rules | Legal moves, jiang, kill and trap, repetition verdicts, the natural move limit, bare Generals ([spec 1](01-rules.md)). | `positions.json` (`legal_moves`, `jiang`, `result`), `games.json`, `tree-counts.json` |
| Positions | Reads and writes canonical JPS and checks validity ([spec 3](03-position.md)). | `positions.json` |
| Moves | Reads and writes move codes ([spec 4](04-moves.md#2-move-codes)). | `moves.json` (`valid_codes`, `invalid_codes`) |
| Traditional notation | Writes traditional notation in English, Chinese or both ([spec 4](04-moves.md#5-traditional-notation)). | `moves.json` (`display`) |
| Record reader | Makes every check in [spec 5, section 5](05-record.md#5-validation). | `records.json` |
| Record writer | Writes records that a record reader accepts, in the stated view, and redacts as described in spec 5, section 4.3. | `records/`: redacting `valid-arbiter.jgr` must give `valid-red.jgr` and `valid-public.jgr` |
| Arbiter | Draws layouts with the procedure of [spec 6](06-shuffle.md#2-drawing-a-layout) from a secure source or a declared seed, commits before the first move, opens the shuffle after the game, and sends each player only its own view. | `shuffle.json` |
| Engine | Implements the engine side of JEP ([spec 7](07-engine-protocol.md)). | section 3 |
| Host | Implements the host side of JEP and the rules in spec 7, section 4 about what engines are told. | section 3 |

## 2. Vector files

All vector files are JSON in UTF-8, and each has a `description` member.

| File | Contents |
|---|---|
| `positions.json` | `valid`: positions with their legal moves (decision codes, sorted), whether the side to move is under jiang, the result the rules give in that position if the game is over, and each side's reveal odds. `invalid`: strings every parser must reject. |
| `moves.json` | Move codes that must be accepted and rejected, and the traditional notation for moves in given positions, in English and Chinese. |
| `tree-counts.json` | Tree counts in chance mode and layout mode ([spec 8](08-probability.md#5-tree-counts)). |
| `shuffle.json` | The first words of a seed stream, seeded layouts with their layout numbers, and commitments with known salts. |
| `games.json` | Scripted games with their final position and the result the rules give: kill, trap, perpetual jiang, perpetual chase, repetition without a perpetual, the move limit, bare Generals, and a complete game. |
| `records.json` and `records/` | Valid and invalid records, with the reason each invalid one fails. |

The unshuffled layout in `tree-counts.json` is a good first test for a new move generator. When every dark piece turns out to match its role, the first three counts are the familiar Xiangqi ones: 44, 1,920 and 79,666.

## 3. Engines and hosts

The engine protocol is a dialogue, so there is no vector file for it. A conforming engine passes these checks, which the reference test [`protocol.test.js`](../reference/test/protocol.test.js) runs against the bundled engine:

1. It answers `hello` with `protocol`, `engine.name`, `rules` and `views`.
2. After `position` and `go` it sends exactly one `move` or `resign` carrying the `go`'s `id`, and the move is legal.
3. Every `info` belonging to that search carries the same `id`.
4. If it reports `reveals`, the probabilities are the pool odds of its view, and they average to the move's `ev`.
5. A `play` sent right after its `move` is accepted: once it has answered, the engine is idle.
6. It answers `ping` with `pong` and the same `id`, even during a search.
7. During a search it answers `busy` to `position`, `play`, `option` and `newgame`.
8. After `stop` it promptly finishes its search.
9. It answers an unknown `type` with `unknown-type`, an illegal `play` with `illegal-move` and an unlisted ruleset with `unsupported-rules`, and keeps working afterwards.
10. It exits on `quit` and at the end of its input.

A conforming host passes the two host checks in the same test. Over a whole game:

1. every capture disclosure sent to an engine came from a capture made by that engine's own side;
2. each engine was given the game's starting position, and the moves in its `position` message followed by every `play` it received are exactly the moves of that side's record of the game.

## 4. Running the vectors

```bash
cd reference
npm test              # unit tests, a live engine session and a short match
npm run conformance   # every vector in conformance/
```

To test another implementation, port [`run-conformance.js`](../reference/scripts/run-conformance.js). It is short and only uses the public API.

## 5. Stating conformance

State the classes, for example:

> Conforms to jieqi-standard: Rules, Positions, Moves, Record reader, Engine.

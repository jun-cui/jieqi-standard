# 5. Game records (JGR)

A Jieqi Game Record (JGR) is a JSON document recording one game (棋谱). Every record is written from a view, which says how much it knows: the arbiter's record contains everything, a player's record contains what that player knew, and a public record contains what a spectator could see. Records for the narrower views are produced from wider ones by redaction, which is a purely mechanical step.

## 1. Summary

- File extension: `.jgr` for a single record, `.jgrl` for a collection (section 6).
- Media type: `application/vnd.jieqi.jgr+json` is suggested.
- JSON Schema: [`schemas/jgr.schema.json`](../schemas/jgr.schema.json).

A record is a starting position followed by the list of moves as move codes. Positions are not stored, because they can always be worked out from the moves, and every chance outcome the view knows about is part of the move codes, so replaying a record never involves drawing anything at random. A record that contains something its view is not entitled to know is invalid. Records also carry the arbiter's commitment to the shuffle, so that once the arbiter publishes the layout anyone can check that every reveal was genuine ([spec 6](06-shuffle.md)).

## 2. Example

The public record of the example game in [`examples/demo-match`](../examples/demo-match), with most moves left out:

```json
{
  "format": "jgr",
  "rules": "jieqi",
  "view": "public",
  "tags": {
    "red": "jieqi-baseline",
    "black": "jieqi-baseline",
    "event": "jieqi-standard demonstration match",
    "site": "local",
    "date": "2026-11-17",
    "time_control": "none"
  },
  "start": "xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX r A2E2H2R2C2S5 a2e2h2r2c2s5 0 1",
  "shuffle": {
    "commitment": "sha256:78c65e15cf9303f185159070d7684f8871a9430984962f9f675c2aca977783d2"
  },
  "moves": [
    "h2h9=S:?", "b7b0=S:?", "h9g9:?", "b0a0:?", "g9f9:?", "e9f9", "b2b8=S", "a0b0", "c0e2=C", "h7h1=H",
    "…"
  ],
  "annotations": [
    { "after": 0, "visibility": "public", "comment": "Sealed shuffle sha256:78c65e15…" }
  ],
  "result": { "outcome": "red-win", "reason": "perpetual-jiang" }
}
```

## 3. Fields

A record is a JSON object with the fields below. Unknown top-level fields MUST be rejected; anything extra belongs in `tags` or in annotations. The order of the fields does not matter, but writers SHOULD use the order shown here.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `format` | string | yes | Always `"jgr"`. |
| `rules` | string | yes | The ruleset, such as `jieqi` ([spec 1](01-rules.md#11-rule-modifiers)). |
| `view` | string | yes | `arbiter`, `red`, `black` or `public`. |
| `tags` | object | no | Facts about the game (3.2). |
| `start` | string | yes | The starting position, as a JPS with six fields ([spec 3](03-position.md)). |
| `shuffle` | object | see 3.3 | The sealed shuffle. |
| `moves` | array of strings | yes | The moves, as outcome codes written for this view ([spec 4](04-moves.md#2-move-codes)). |
| `annotations` | array of objects | no | Comments, clock times, evaluations (3.6). |
| `result` | object | see 7 | How the game ended. |

### 3.1 `format`, `rules`, `view`

`format` is the string `"jgr"`. `rules` names the ruleset, and a reader MUST reject a ruleset or modifier it does not know. `view` says whose knowledge the record contains (section 4).

### 3.2 `tags`

An object whose values are strings and whose names are written in lower_snake_case. These names have a defined meaning:

| Tag | Meaning |
|---|---|
| `event` | Name of the event or match. |
| `site` | Where the game was played: a place, a server, or `local`. |
| `date` | The date the game started, in ISO 8601 form (`2026-11-17`). |
| `round` | The round within the event, such as `3` or `3.2`. |
| `red`, `black` | The players: a person's name, or the name of an engine. |
| `time_control` | `<base seconds>+<increment seconds>`, such as `300+5`, or `none`. |
| `annotator` | Who wrote the annotations. |

Other tags may be added. Tags MUST NOT contain hidden information.

### 3.3 Shuffle

```json
"shuffle": {
  "commitment": "sha256:78c65e15cf9303f185159070d7684f8871a9430984962f9f675c2aca977783d2",
  "layout": "scsascassheerhrSESHASSSRCAECRH",
  "salt": "6fa5009475db9e77639184d98816c33244b04cac8e08295eb71a29d605e11d17",
  "seed": "demo"
}
```

| Member | Meaning |
|---|---|
| `commitment` | The arbiter's commitment to the layout, made before the first move ([spec 6](06-shuffle.md#4-sealed-shuffles)). |
| `layout` | The identity of every dark piece in `start`, in board order ([spec 3](03-position.md#36-layout-arbiter-positions-only)). |
| `salt` | The secret salt used for the commitment, as 64 lowercase hex digits. |
| `seed` | Only for research games: the seed the layout was drawn from ([spec 6](06-shuffle.md#3-seeded-shuffles)). |

Only an arbiter record may contain `layout`, `salt` or `seed`, and an arbiter record MUST contain `layout`. Records of the other views MAY contain `commitment` and nothing else. Once the game is over the arbiter opens the shuffle by publishing its record. Any record that contains the layout is, by definition, an arbiter record.

### 3.4 `start`

The starting position, as a JPS with exactly six fields. The layout is never part of `start`; it lives in `shuffle`, so that `start` is identical in every view of the same game.

### 3.5 `moves`

The moves in order, as outcome codes written for the record's view ([spec 4](04-moves.md#22-outcome-codes-are-view-dependent)). In an arbiter record no disclosure is ever `?`.

### 3.6 `annotations`

Each annotation is an object attached to one point in the game:

| Member | Type | Meaning |
|---|---|---|
| `after` | integer | How many moves had been played when the annotation applies, from 0 to the number of moves. |
| `visibility` | string | The narrowest view allowed to see it (section 4.3). Defaults to the record's own view. |
| `comment` | string | Free text. |
| `score` | object | An evaluation in the format of the engine protocol ([spec 7](07-engine-protocol.md#6-scores)), for the side to move before the annotated move. |
| `depth` | integer | The search depth behind `score`. |
| `line` | array of strings | An expected continuation, as move codes. |
| `time_ms` | integer | The time spent on the move just played. |
| `clock` | object | `{ "red_ms": …, "black_ms": … }`, the time left after the move. |

Other members may be added if their names are in lower_snake_case. An annotation MUST NOT contain more than its visibility allows; an engine's evaluation, for example, is private to the side that ran the engine.

## 4. Views

### 4.1 The four views

| View | Knows |
|---|---|
| `arbiter` | Everything: the layout, every reveal and every capture disclosure. |
| `red` | What is public, plus the identities of the Black dark pieces Red captured. |
| `black` | What is public, plus the identities of the Red dark pieces Black captured. |
| `public` | The board, every move and every reveal, but no capture disclosures. |

Under `open-capture` every capture disclosure is public, so the `red`, `black` and `public` records of a game have the same moves.

### 4.2 Order

`arbiter` is wider than `red` and `black`, and both of those are wider than `public`. `red` and `black` cannot be compared with each other.

### 4.3 Redaction

To turn a record of view W into a record of a narrower view V:

1. Set `view` to V.
2. In each move code whose disclosure V is not entitled to, replace `:X` with `:?`. Under `jieqi`, V is entitled to a disclosure only if V is `arbiter` or V is the side that made the capture.
3. Keep only `commitment` in `shuffle`.
4. Keep only the annotations V may see. An annotation without a `visibility` has the visibility W.
5. Copy everything else unchanged.

Redaction does not require replaying the game, and applying it twice gives the same result. A record can never be redacted toward a wider view, or from `red` to `black`.

## 5. Validation

A reader that accepts a record MUST check all of the following, in addition to the schema:

1. The ruleset is known.
2. `start` is a valid JPS with six fields.
3. In an arbiter record, `shuffle.layout` is present and fits `start` ([spec 3](03-position.md#5-validity), item 5). If `seed` is present, the layout is the one that seed produces. If `salt` and `commitment` are present, the commitment matches.
4. In any other record, `shuffle` contains nothing but `commitment`.
5. Replaying `moves` from `start`, every move is legal, reveals and disclosures appear exactly where they are required, and every identity is still in its pool. In an arbiter record, every outcome agrees with the layout.
6. Every disclosure the view is entitled to is written as an identity, and every other disclosure is written as `?`.
7. No move comes after the end of the game.
8. If the replay ends the game by rule (kill, trap, repetition, move limit, bare Generals), `result` is present and agrees with it. Otherwise `result`, if present, gives a reason that does not depend on the board.
9. Every annotation's `after` is in range, and its `visibility` is the record's view or a narrower one.

The reference implementation's `validateRecord` makes exactly these checks; from the command line, use `jieqi validate FILE.jgr`.

## 6. Collections

A collection of games is a JSON Lines file (`.jgrl`): one complete record per line, in UTF-8, each line ending with LF. Datasets intended for research SHOULD use public or arbiter records, and SHOULD say which they use.

## 7. Results

```json
"result": { "outcome": "draw", "reason": "adjudication", "by": "match host", "note": "move cap of 1000 reached" }
```

| Member | Meaning |
|---|---|
| `outcome` | `red-win`, `black-win` or `draw`. |
| `reason` | Why; see the table below and [rule 10](01-rules.md#10-results). |
| `by` | Who decided, for `adjudication` and `forfeit`. Required for `adjudication`. |
| `note` | Free text. |

| Reason | Outcome | Decided by |
|---|---|---|
| `kill` | a win | the board (rule 8.1) |
| `trap` | a win | the board (rule 8.1) |
| `perpetual-jiang` | a win | the board (rule 9.6) |
| `perpetual-chase` | a win | the board (rule 9.6) |
| `repetition` | a draw | the board (rule 9.6) |
| `move-limit` | a draw | the board (rule 8.3) |
| `bare-generals` | a draw | the board (rule 8.4) |
| `resignation` | a win | a player (rule 8.5) |
| `agreement` | a draw | both players (rule 8.6) |
| `time` | a win | the clock (rule 8.7) |
| `forfeit` | a win | the arbiter (rule 8.8) |
| `adjudication` | a win or a draw | the arbiter, outside the rules |

An unfinished game has no `result`.

## Notes

Positions are not stored next to the moves because a list of positions can contradict the moves, while a list of moves cannot contradict itself. Working the positions out again is cheap; the reference implementation replays a few hundred moves in milliseconds.

Unknown fields are rejected because a field one program understands and another ignores is an easy place for hidden information to leak, or for something to get lost. `tags` and annotations exist for extra information, and their visibility is stated.

The view applies to the whole record rather than to individual fields, so that anyone holding a record knows at a glance what it may contain, and validation can check it.

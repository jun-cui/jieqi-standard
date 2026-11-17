# 7. Engine protocol (JEP)

JEP is the protocol a host (a GUI, a match runner, an analysis tool or a game server) uses to talk to an engine. Messages are JSON objects, one per line. A JSON Schema for every message is in [`schemas/jep.schema.json`](../schemas/jep.schema.json).

Three things set it apart from protocols written for games without hidden pieces:

- the host tells the engine which view it is playing from and gives it nothing beyond that view;
- every move the host reports includes what it revealed;
- the engine reports expected scores, and can break a move's score down by each identity its dark piece might turn out to have.

## 1. Design

JSON was chosen over a word-based text protocol because several messages carry nested data (lists of candidate moves, each with its own list of possible reveals) and options with types. Any language can parse JSON, and the extra bytes do not matter next to the time an engine spends searching.

The host sends a complete position first and single moves after that, so the engine never has to work out where it is. A move sent by the engine is only a decision: the engine cannot know what its own dark piece will turn out to be, so the host reports the outcome back to it, just as it reports the opponent's moves.

## 2. Transport

- The engine runs as a separate process. The host writes to the engine's standard input and reads its standard output.
- Each message is a single JSON object in UTF-8, on one line, ending with LF. Lines may not contain raw line breaks. Empty lines are ignored.
- The engine MUST write nothing but JEP messages to standard output. Anything else goes to standard error.
- Every message has a string member `type`. Receivers MUST ignore members they do not recognize. An engine that receives a `type` it does not recognize answers with an `error` with code `unknown-type` and carries on.
- Messages are handled in order. The host MAY send `stop`, `ping` and `quit` at any time; all other messages wait until the engine is idle. An engine that receives any other message during a search answers with an `error` with code `busy`.
- End of input counts as `stop` followed by `quit`.

## 3. A session

```
host                               engine
  |  hello  ------------------------>  |
  |  <------------------------  hello  |   name, rulesets, views, options
  |  option ... -------------------->  |
  |  newgame ----------------------->  |
  |  position ---------------------->  |   start and moves, in the engine's view
  |  go ---------------------------->  |
  |  <---------------------  info ...  |   progress, scores, candidates
  |  <-------------------------  move  |   a decision, e.g. "h2e2"
  |  play -------------------------->  |   its outcome, e.g. "h2e2=R"
  |  play -------------------------->  |   the opponent's move, in this view
  |  go ... ------------------------>  |
  |  result ------------------------>  |
  |  quit -------------------------->  |
```

## 4. Views and what engines are told

Every `position` message names a view ([spec 5](05-record.md#4-views)):

| View | Used for |
|---|---|
| `red`, `black` | Playing a game. The engine knows what that side knows. |
| `public` | Analyzing as a spectator, or a position nobody has private knowledge about. |
| `arbiter` | Analysis with everything known, for example after a game or to find the best move in hindsight. The `start` position includes the layout field. |

A host:

- MUST send an engine that is playing a game only the view of the side it plays, writing every move code for that view. When the opponent captures one of the engine's dark pieces, the engine receives `:?`.
- MUST NOT send an `arbiter` position to an engine that is playing a game in progress.
- MUST NOT pass one engine's `info` messages on to the other engine.

An engine:

- MUST list the views it accepts in its `hello`, and refuse any other with `unsupported-view`.
- MUST treat dark identities as unknown, apart from what its view tells it. In the `red`, `black` and `public` views this means taking reveal odds from the pools (spec 8).

## 5. Messages

### 5.1 From the host

| `type` | Members | Meaning |
|---|---|---|
| `hello` | `protocol` (`"jep"`), `host` {`name`} | Starts the session. Always the first message. |
| `option` | `name`, `value` | Sets an engine option. No reply when it succeeds. |
| `newgame` | `rules`, `side` (`"red"`, `"black"` or absent) | A new game begins; the engine resets its game state. |
| `position` | `view`, `start` (JPS), `moves` (outcome codes) | Sets the position, replacing any earlier one. |
| `play` | `move` (outcome code) | Adds one move to the current position. |
| `go` | `id`, `limits`, `clock`, `candidates`, `infinite` | Starts a search (section 9). |
| `stop` | | Ends the current search. The engine answers with `move` as soon as possible. |
| `ping` | `id` | The engine answers with `pong` and the same `id` once it has handled every earlier message. A running search does not delay the answer. |
| `offer` | `kind` (`"draw"`) | The opponent offers a draw. The engine answers with `reply`. |
| `result` | `outcome`, `reason` | The game has ended ([spec 5](05-record.md#7-results)). For information only. |
| `quit` | | The engine exits. |

### 5.2 From the engine

| `type` | Members | Meaning |
|---|---|---|
| `hello` | `protocol`, `engine` {`name`, `author`}, `rules`, `views`, `features`, `options` | Who the engine is and what it supports. |
| `info` | `id`, `depth`, `nodes`, `time_ms`, `nps`, `score`, `line`, `candidates`, `text` | Search progress. Every member except `type` is optional. |
| `move` | `id`, `move` (decision), `score`, `offer_draw` | The engine's decision for the `go` with this `id`. |
| `resign` | `id` | The engine resigns instead of moving. |
| `pong` | `id` | The answer to `ping`. |
| `reply` | `kind`, `accept` | The answer to `offer`. |
| `error` | `code`, `message`, and anything else useful | Something was wrong (section 10). |

### 5.3 The engine's `hello`

```json
{
  "type": "hello",
  "protocol": "jep",
  "engine": { "name": "jieqi-baseline", "author": "jieqi-standard contributors" },
  "rules": ["jieqi", "jieqi+open-capture"],
  "views": ["arbiter", "red", "black", "public"],
  "features": ["candidates", "reveal-breakdown", "kill", "line"],
  "options": [
    { "name": "depth", "kind": "integer", "default": 2, "min": 1, "max": 8, "label": "Maximum search depth (moves)" }
  ]
}
```

- `rules` lists every ruleset the engine can play, including modifiers. A host MUST NOT start a game under a ruleset the engine has not listed.
- `features` lists what the engine can report: `candidates`, `reveal-breakdown`, `capture-breakdown`, `wdl`, `kill` and `line`.
- Each entry in `options` has a `name` in lower_snake_case, a `kind` (`integer`, `number`, `boolean`, `string`, `choice` or `action`), a `default` and, where they apply, `min`, `max`, `choices` and a readable `label`. The names `threads`, `hash_mb`, `seed` and `strength` are reserved for their usual meanings.

## 6. Scores

A score is an object, always from the point of view of the side to move in the position being analyzed:

| Member | Type | Meaning |
|---|---|---|
| `ev` | number from 0 to 1 | The expected score: P(win) + ½ · P(draw). Always present. |
| `wdl` | three numbers | Probabilities of a win, a draw and a loss, adding up to 1. When both are given, `ev` = win + ½ · draw. |
| `kill` | integer other than 0 | A forced result. A positive *n* means the side to move can force a win by rule 8.1 (kill or trap) within at most *n* of its own moves, whatever is revealed and whatever the opponent does. A negative *n* means the opponent can force one within at most \|*n*\| of its moves. Absent when nothing is proven. |

`ev` is an expectation in two senses: over the reveals, using the odds of the engine's view (which spec 8 shows are exact), and over the play that follows, as the engine expects it. `kill`, on the other hand, is a proof. An engine MUST NOT report it unless it holds for every possible reveal. It is an upper bound, so a shallow search may report a number larger than the real distance.

There is no material score. In a position with hidden pieces the material on each side is not fixed, but the chances of winning are.

## 7. Candidates and reveal breakdowns

When `go` asks for `candidates: k`, the engine SHOULD report its best *k* moves in `info.candidates`, best first:

```json
{
  "move": "h2h9",
  "ev": 0.4908,
  "reveals": [
    { "as": "S", "p": 0.3333, "ev": 0.5795 },
    { "as": "A", "p": 0.1333, "ev": 0.4818 },
    { "as": "E", "p": 0.1333, "ev": 0.4818 },
    { "as": "H", "p": 0.1333, "ev": 0.4757 },
    { "as": "R", "p": 0.1333, "ev": 0.3268 },
    { "as": "C", "p": 0.1333, "ev": 0.4660 }
  ]
}
```

| Member | Meaning |
|---|---|
| `move` | A decision code. |
| `ev`, `wdl` | The score after this move, for the side to move at the root. |
| `visits` | For engines that sample: how often the move was explored. |
| `reveals` | For a move by a dark piece: one entry per identity left in the mover's pool. `p` is the probability of that reveal, exactly count / pool size in the engine's view (spec 8), and `ev` is the expected score if the piece turns out to be `as`. |
| `captures` | For a move that captures a dark piece, if the capturer will be told what it was: entries of the same form, with `p` taken from the opponent's pool in the engine's view. |

When the reveal is the only chance event in a move, the sum of `p` · `ev` over `reveals` equals the move's `ev`, up to rounding.

The example is real output from the baseline engine on the starting position. Capturing on `h9` with the Cannon-role piece is worth 0.58 if the piece is revealed as a Soldier, which costs little to lose, but only 0.33 if it is revealed as a Chariot, which can then be taken.

## 8. Main lines

`line` is the sequence of moves the engine expects, as outcome codes. Where the line passes a chance event, the suffix states which outcome it assumes, usually the most likely one, as in `h2h9=S:?`. A capture disclosure the engine does not model is written `:?`.

## 9. `go`

```json
{ "type": "go", "id": "m17",
  "limits": { "time_ms": 5000, "depth": 12, "nodes": 2000000 },
  "clock": { "red_ms": 183000, "black_ms": 201500, "red_inc_ms": 2000, "black_inc_ms": 2000 },
  "candidates": 3 }
```

- `id`: any string. The engine copies it into every `info`, `move` and `resign` that belongs to this search.
- `limits`: hard limits for this move. The engine MUST answer within `time_ms`, and SHOULD stop at `depth` or `nodes`.
- `clock`: time left and increments. With a clock and no `time_ms`, the engine manages its own time.
- `candidates`: how many candidate moves to report; 0 if absent.
- `infinite`: if `true`, search until `stop`, for analysis.

The engine MUST answer every `go` with exactly one `move` or `resign`, and a `move` MUST be legal in the current position.

## 10. Errors

An `error` message has a `code` and a readable `message`:

| Code | When |
|---|---|
| `bad-message` | A line is not a JSON object, or a member has the wrong type. |
| `unknown-type` | The `type` is not recognized. |
| `bad-position` | The `position` is invalid, or a `go` arrived without a position. |
| `illegal-move` | A `play` move is illegal or malformed. The position is not changed. |
| `unsupported-rules` | The ruleset is not one the engine listed. |
| `unsupported-view` | The view is not one the engine listed. |
| `bad-option` | Unknown option, or a value out of range. |
| `busy` | A message that has to wait for an idle engine arrived during a search. |
| `internal` | The engine failed. |

A host MUST NOT play an illegal `move` from an engine. In a game, the engine loses by `forfeit` (rule 8.8).

## 11. An example

The start of the example game, from [`examples/demo-match/jep-transcript.log`](../examples/demo-match/jep-transcript.log). Lines starting with `>>` go from the host to an engine, lines starting with `<<` from an engine to the host.

```
>> red   {"type":"hello","protocol":"jep","host":{"name":"jieqi-standard match host"}}
<< red   {"type":"hello","protocol":"jep","engine":{"name":"jieqi-baseline",…},"rules":["jieqi","jieqi+open-capture"],…}
>> red   {"type":"option","name":"depth","value":2}
>> red   {"type":"newgame","rules":"jieqi","side":"red"}
>> red   {"type":"position","view":"red","start":"xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX r A2E2H2R2C2S5 a2e2h2r2c2s5 0 1","moves":[]}
>> red   {"type":"go","id":"m1"}
<< red   {"type":"info","depth":1,"nodes":412,"time_ms":4,"score":{"ev":0.6297},"line":["b2b9=S:?"],"id":"m1"}
<< red   {"type":"info","depth":2,"nodes":95342,"time_ms":129,"score":{"ev":0.4908},"line":["h2h9=S:?","i9h9=S"],"id":"m1"}
<< red   {"type":"move","move":"h2h9","score":{"ev":0.4908},"id":"m1"}
>> red   {"type":"play","move":"h2h9=S:A"}
>> black {"type":"play","move":"h2h9=S:?"}
```

Red's Cannon-role piece captured on `h9` and turned out to be a Soldier. Red is told that the piece it captured was an Advisor; Black is not.

## 12. Extending the protocol

- New members can be added to existing messages, since receivers ignore members they do not recognize.
- New message types can be added if they are optional: engines answer with `unknown-type` and hosts carry on.
- The meaning of an existing member is never changed.
- Experimental members SHOULD start with `x_` until they are documented here.

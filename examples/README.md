# Examples

Everything here is written by `npm run demo` in [`reference/`](../reference). Running it again produces the same files, except for the timings in the protocol transcript and in `opening-candidates.json`.

## demo-match

A game between two copies of the `jieqi-baseline` engine, played over JEP. The match host acted as arbiter. The shuffle was seeded with `demo`, so anyone can reproduce it, and sealed before the first move.

| File | Contents |
|---|---|
| `game-arbiter.jgr` | Everything: the opened shuffle (layout, salt, commitment and seed), all capture disclosures, and both engines' evaluations. |
| `game-red.jgr` | What Red knew. Black's captures of Red's dark pieces read `:?`, and only Red's evaluations are included. |
| `game-black.jgr` | What Black knew. |
| `game-public.jgr` | What a spectator knew: no capture disclosures and no evaluations. |
| `jep-transcript.log` | Every protocol message. `>>` is from the host to an engine, `<<` from an engine to the host. Each engine is only told about its own captures; compare the `play` lines for the first two moves. |

The red, black and public records are redactions of the arbiter record (spec 5, section 4.3). To check them, and to check the shuffle against the public record:

```bash
cd reference
node bin/jieqi.js validate ../examples/demo-match/*.jgr
node bin/jieqi.js verify ../examples/demo-match/game-public.jgr \
  --layout scsascassheerhrSESHASSSRCAECRH \
  --salt 6fa5009475db9e77639184d98816c33244b04cac8e08295eb71a29d605e11d17
node bin/jieqi.js replay ../examples/demo-match/game-public.jgr --zh
```

On move 2 Black captures one of Red's dark pieces and is told it was a Chariot, which Red never finds out. The game ends at move 48: Black's Chariot gives jiang on every move while the Red General steps back and forth, the position comes up a third time, and Black loses for perpetual jiang (rule 9.6).

## analysis

| File | Contents |
|---|---|
| `opening-candidates.json` | A JEP `info` message for the starting position: five candidate moves, each with a reveal breakdown (spec 7, section 7). |
| `information-value.json` | Every tenth position of the example game, analyzed from the view of the side to move and from the arbiter's view (spec 8, section 6). |

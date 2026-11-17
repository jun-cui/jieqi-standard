# jieqi-standard

Rules, file formats and an engine protocol for Jieqi (揭棋), with a reference implementation in JavaScript and a set of test vectors.

In Jieqi every piece except the General starts face down, shuffled onto the usual Xiangqi starting points. A face-down (dark) piece moves like the piece whose starting point it stands on, and is turned over the first time it moves. When a dark piece is captured, only the side that captured it is told what it was, so after a while the two players no longer know the same things. Most of what is in this repository follows from those rules.

```
   a b c d e f g h i
9  x x x x g x x x x
8  . . . . . . . . .
7  . x . . . . . x .
6  x . x . x . x . x
5  . . . . . . . . .
   ~~~~~~ river ~~~~~~
4  . . . . . . . . .
3  X . X . X . X . X
2  . X . . . . . X .
1  . . . . . . . . .
0  X X X X G X X X X
```

The starting position. `X` and `x` are Red's and Black's dark pieces.

## What is specified

- [Rules](spec/01-rules.md): the ruleset `jieqi`, with numbered rules. Dark pieces move in role, revealed Advisors and Elephants are not confined to the palace or their own side, a captured dark piece is disclosed to the capturer only, and repetition is settled by a mechanical test for perpetual jiang and perpetual chase.
- [Glossary](spec/02-glossary.md): the English terms used everywhere, with the Chinese they stand for.
- [Positions (JPS)](spec/03-position.md): a one-line text format. The board is public, what the holder knows about the hidden pieces is kept in two pools, and the arbiter's secret layout can be added as an extra field.
- [Moves](spec/04-moves.md): coordinates, move codes such as `h2e2` and `h2e2=R:H`, and traditional notation (炮二平五, `C2.5`).
- [Game records (JGR)](spec/05-record.md): JSON records written from one of four views (arbiter, red, black, public). The narrower views are made from the wider ones by redaction.
- [Shuffles](spec/06-shuffle.md): how layouts are drawn, how to seed them for research, and how an arbiter commits to one with SHA-256 so that a game can be checked afterwards.
- [Engine protocol (JEP)](spec/07-engine-protocol.md): JSON lines over stdin and stdout. An engine only receives what its side knows, and reports expected scores, including a breakdown by what a dark piece might turn out to be.
- [Probability](spec/08-probability.md): why the pools are enough to work out reveal odds, and the tree counts used to test move generators.
- [Conformance](spec/09-conformance.md): what an implementation has to pass.

[spec/00-overview.md](spec/00-overview.md) explains how the parts fit together.

## Running it

You need Node.js 20 or newer. There is nothing to install.

```bash
cd reference
npm test               # unit tests, a live engine session and a short match
npm run conformance    # the vectors in ../conformance
npm run check          # all of the above, plus the schemas and the documentation links
npm run demo           # rebuilds ../examples
```

A few commands to try:

```bash
node bin/jieqi.js board --zh
node bin/jieqi.js odds
node bin/jieqi.js analyze --depth 2 --candidates 3
node bin/jieqi.js match --seed demo --depth 2 --out games
node bin/jieqi.js serve        # record viewer at http://localhost:8080/viewer/
```

`analyze` asks the bundled engine about a position. For a move by a dark piece it also shows the expected score for each identity the piece could have:

```
h2h9  暗炮二进七      expected score 0.491
      if revealed as S  p=0.3333  expected score 0.580
      if revealed as A  p=0.1333  expected score 0.482
      if revealed as E  p=0.1333  expected score 0.482
      if revealed as H  p=0.1333  expected score 0.476
      if revealed as R  p=0.1333  expected score 0.327
      if revealed as C  p=0.1333  expected score 0.466
```

Capturing on h9 with the Cannon-role piece is fine if it turns out to be a Soldier. It is a bad trade if it turns out to be a Chariot, which is then taken.

## The example game

[examples/demo-match](examples/demo-match) has a game between two copies of the bundled engine, played over the engine protocol with a sealed shuffle (seed `demo`). It contains one record per view and the full protocol transcript.

The first two moves show why the views exist. Red's Cannon-role piece captures on h9 (`h2h9=S:A`): it turns out to be a Soldier, and Red is told that the piece it took was an Advisor. Black answers by capturing on b0 (`b7b0=S:R`), and Black is told that it took one of Red's Chariots. Red is not told. In Red's record that move reads `b7b0=S:?`, and for the rest of the game Black knows more about Red's hidden pieces than Red does.

The game ends at move 48. Black's Chariot gives jiang on every move while the Red General steps back and forth between d2 and e2. When the position comes up for the third time, rule 9.6 applies and Black loses for perpetual jiang.

```bash
node bin/jieqi.js validate ../examples/demo-match/*.jgr
node bin/jieqi.js replay ../examples/demo-match/game-public.jgr --zh
```

## Repository layout

```
spec/          the specifications, starting with 00-overview.md
schemas/       JSON Schemas for game records and protocol messages
conformance/   test vectors
reference/     the JavaScript implementation, the jieqi command, an engine and a match host
examples/      the example game, its transcript and some analysis output
viewer/        a browser viewer for game records
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

The specifications, schemas and documentation are licensed under [CC BY 4.0](LICENSE-DOCS.md). The code and test vectors are under the [MIT license](LICENSE).

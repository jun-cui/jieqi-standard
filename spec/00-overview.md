# 0. Overview

jieqi-standard describes how Jieqi (揭棋) is played, written down and analyzed by computer. It consists of the documents listed below, two JSON Schemas, a set of test vectors and a reference implementation.

## Documents

1. [Rules](01-rules.md): the ruleset `jieqi`.
2. [Glossary](02-glossary.md): the terms used in all the other documents.
3. [Position strings (JPS)](03-position.md): a position as one line of text.
4. [Moves](04-moves.md): coordinates, move codes and traditional notation.
5. [Game records (JGR)](05-record.md): JSON game records, views and redaction.
6. [Shuffles](06-shuffle.md): drawing layouts, seeded layouts, and commitments.
7. [Engine protocol (JEP)](07-engine-protocol.md): how a GUI or match runner talks to an engine.
8. [Probability](08-probability.md): reveal odds and tree counts.
9. [Conformance](09-conformance.md): what an implementation must pass.

## How the parts fit together

The rules define the game. Chance enters it in one place only, the shuffle before the first move, and in digital play the arbiter (the program that holds the shuffle) commits to it before the game and publishes it afterwards.

A position (JPS) records the board, which everyone can see, together with what the holder of the position knows about the hidden pieces. A move code records a move together with whatever it revealed. A game record (JGR) is a starting position plus a list of move codes, written from one side's point of view or the arbiter's. The engine protocol (JEP) gives an engine a position and moves in exactly this form, and the engine answers with a move and with scores that take the hidden pieces into account.

## What each party knows

1. The board is public. Everyone can see every revealed piece and where every dark piece stands.
2. The layout is secret. Only the arbiter knows which dark piece is which.
3. When a dark piece is captured, the capturer learns what it was and nobody else does (rule 5.3). This is the only way the two players come to know different things.
4. Everything a party knows about the hidden pieces can be summed up in a pool for each side: the identities that party cannot yet account for. Spec 8 shows that the pool alone gives the exact odds of every reveal.

There are therefore four views of a game: the arbiter's, Red's, Black's and a spectator's (public). Records and engine sessions always say which one they are written from.

## Conventions

- MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are used as described in RFC 2119 and RFC 8174.
- Sections titled "Notes" explain the reasoning behind a design and contain no requirements.
- Terms are used as defined in the [glossary](02-glossary.md). Section 2.8 of the glossary lists the words borrowed from other board games that are not used, and what to say instead.
- Rules are cited by number ("rule 9.5"), other documents by number and section ("spec 5, section 4.3").

## Extending the standard

The standard is only extended in ways that existing programs can either ignore safely or reject outright:

- Rule variants are named modifiers added to the ruleset name, such as `jieqi+open-capture`. A program that does not know a modifier must refuse the game rather than guess (rule 11).
- In the engine protocol, receivers ignore message members they do not know, and unknown message types are answered with an `unknown-type` error. Experimental members start with `x_`.
- Game records reject unknown top-level fields. Extra information goes into tags or annotations, whose visibility is explicit.

## Reference implementation

[`reference/`](../reference) implements every document in plain JavaScript with no dependencies: the rules, JPS, move codes and notation, records, shuffles, tree counts, a small engine, a match host that acts as arbiter, the `jieqi` command line tool, and the scripts that generate and run the test vectors. If the code and a document disagree, the document is right and the code is wrong.

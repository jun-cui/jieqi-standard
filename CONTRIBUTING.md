# Contributing

Thanks for your interest. Bug reports, corrections, implementations in other languages, engines and datasets are all welcome.

## Reporting problems

If the documents contradict each other, a test vector disagrees with a document, or the reference implementation does something the documents don't allow, please open an issue. Include the position (as a JPS) or the record (as a JGR file) that shows the problem if you can.

## Changes to the documents

Typos, unclear wording and broken links can go straight to a pull request.

The rules and formats themselves are fixed. A change that would make an existing conforming program behave differently is not accepted. What can be added:

- New rule variants, as named modifiers (`jieqi+name`, see rule 11). A program that doesn't know a modifier refuses the game, so older programs are never misled.
- Optional members and message types in the engine protocol, which existing engines and hosts ignore or answer with `unknown-type`.
- New tags and annotation members in game records.

To propose one of these, open an issue describing the problem first. A pull request for it should include the new text, test vectors, and the change to `reference/` with tests.

## Implementations, engines and datasets

You don't need permission to implement the standard. To say that a program conforms, run the vectors (spec 9) and list the classes it meets. Open an issue with a link if you would like the project listed in the README.

## Working on the repository

```bash
cd reference
npm test                 # unit tests, a live engine session and a short match
npm run conformance      # the vectors in ../conformance
npm run check            # tests, vectors, schemas and documentation links
```

- The reference implementation has no dependencies. It runs on Node.js 20 or newer, and the modules in `src/` also run in a browser. Please keep it that way.
- After a change that affects behavior, run `npm run demo` and then `npm run vectors`, and look through the resulting diff of `examples/` and `conformance/` before committing.
- Code style: ES modules, two-space indentation, single quotes.

## Terminology

Please use the terms in the [glossary](spec/02-glossary.md), in American English, in text, identifiers and messages alike. Section 2.8 of the glossary lists the terms from other board games that are not used and what to say instead.

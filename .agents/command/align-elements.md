---
description: Find and fix misaligned chart node rows and columns using the source poster.
---

Use the `align-elements` skill.

Run the detector first and show the proposed moves before writing:

```bash
python3 scripts/align-elements/align.py
```

Graphic novels are included automatically and measured as angled hexagons, so
their column moves appear in the plan. If the output lists skipped works, those
nodes need manual inspection before writing.

Apply only after reviewing the plan:

```bash
python3 scripts/align-elements/align.py --write
```

If the user wants even spacing between rows/columns, run the uniform pass after
the poster pass:

```bash
python3 scripts/align-elements/align.py --uniform
python3 scripts/align-elements/align.py --uniform --write
```

Show the fitted pitches and line shifts before writing. Do not run the poster
pass after the uniform pass.

Then re-run the detector(s) and validate with `npm run lint`, `npm run check`,
and `node --experimental-strip-types scripts/check-graph.ts`.

Arguments: $ARGUMENTS

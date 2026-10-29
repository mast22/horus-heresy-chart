---
description: Fix wrong or missing chart connection directions using the source poster.
---

Use the `fix-connections` skill.

Turn the user's statement into explicit `Source -> Target:class` edges, then
inspect the current graph:

```bash
node --experimental-strip-types scripts/fix-connections/inspect.ts "<title or id>" --out
```

Crop the poster only when the direction is not already given, or when reversing
or removing an existing edge. Confirm where the stroke leaves and where the
arrowhead enters:

```bash
python3 scripts/fix-connections/crop.py "<title>" "<title>" --out /tmp/connection-check.png
```

Edit only the intended objects in the `edges` array in `src/flow/chart.ts`,
then assert the result:

```bash
node --experimental-strip-types scripts/fix-connections/inspect.ts \
  --expect "<Source -> Target:primary>" \
  --reject "<Source -> Target>" \
  --validate
```

Validate with `npm run lint`, `npm run check`, and
`node --experimental-strip-types scripts/check-graph.ts`. Add an important
fixed direction to `scripts/check-graph.ts` so it stays fixed.

Arguments: $ARGUMENTS

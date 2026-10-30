---
name: fix-connections
description: Use when chart connection directions in src/flow/chart.ts are wrong or missing, when the user says "fix connections", "fix connection direction", "this arrow is backwards", "X has no primary connection to Y", "X should connect to Y", or when validate reports opposite directions or a node has the wrong set of edges.
---

# Fix chart connections

Connection data lives in the `edges` array in `src/flow/chart.ts`; the boxes
live in `works`.

An edge is directed:

- `source` is the box the stroke leaves.
- `target` is the box the arrowhead enters.
- `connection` is the class the user gives: `primary`, `secondary`, or
  `tertiary`.

Do not infer direction from layout. Two boxes feeding off the same vertical
spine are siblings, not parent and child.

## Process

1. Check git state. Do not edit on top of unrelated uncommitted work.

   ```bash
   git status --short
   ```

2. Turn the user's statement into explicit edges, for example:

   ```text
   The Last Remembrancer -> Ghosts Speak Not : primary
   The Last Remembrancer -> Garro             : primary
   ```

   If the user says "has connections to" without a direction, ask the user
   which box the stroke leaves and which box the arrowhead enters.

3. Inspect the current graph. Endpoint names are title substrings or exact
   ids; an ambiguous title lists the candidates and exits. Pass every title in
   one invocation — do not run the script once per box.

   ```bash
   node --experimental-strip-types scripts/fix-connections/inspect.ts \
     "The Reflection Crack'd" "Riven" "The Dark King" "Strike and Fade"
   ```

4. Decide the smallest correct edit in `src/flow/chart.ts`:

   - **Missing edge** — add one object to `edges`.
   - **Backwards edge** — change `source` and `target` on the existing object
     and its id; do not leave both directions behind.
   - **Wrong class** — change `connection`.
   - **False edge** — delete the object.

   Keep ids unique and descriptive:
   `pN-<source-id>-<target-id>` for traced edges and `m-<source-id>-<target-id>`
   for hand-added edges. Match the surrounding style. Existing ids such as
   `the-maste-f-mankin`, `child-ofnight`, and `the-last-remembrancer-ancer-16`
   are existing slugs; keep them exactly.

   Locate the object with the ids printed by `inspect.ts`, then read/edit only
   those lines — never dump a large slice of `chart.ts`:

   ```bash
   rg -n 'id: "(p38|p77)-' src/flow/chart.ts
   ```

5. Assert the result with the same script. It exits non-zero on a mismatch.

   ```bash
   node --experimental-strip-types scripts/fix-connections/inspect.ts \
     --expect "The Last Remembrancer -> Ghosts Speak Not:primary" \
     --expect "The Last Remembrancer -> Garro:primary" \
     --reject "The Last Remembrancer -> Child of Night" \
     --validate
   ```

6. Validate the project:

   ```bash
   npm run lint
   npm run check
   node --test tests/graph.test.ts
   ```

   Only act on diagnostics in the files you changed; unrelated pre-existing
   errors are not part of this task.

7. Suggest a commit such as:

   ```text
   fix: correct chart connection directions
   ```

## Fast paths

Removing one or more false edges that the user asserted are absent:

```bash
node --experimental-strip-types scripts/fix-connections/inspect.ts \
  "The Reflection Crack'd" "Riven" "The Dark King" "Strike and Fade"
rg -n 'id: "(p38|p77)-' src/flow/chart.ts          # ids from inspect output
# delete the matching edge objects
node --experimental-strip-types scripts/fix-connections/inspect.ts \
  --reject "The Reflection Crack'd -> Riven" \
  --reject "The Dark King -> Strike and Fade" \
  --validate
node --test tests/graph.test.ts
npm run lint
```

## Direction pitfalls

- **Spines and buses.** A single stroke can run past several boxes. Only the
  box the stroke leaves is the source; each arrowhead is a separate target.
  In the example, The Last Remembrancer and Child of Night both hang off a
  spine that leaves The Flight of the Eisenstein. Neither points at the other.
- **Opposite pairs.** `inspect.ts --validate` warns when the same pair appears
  in both directions. That is usually a broken direction, not two real edges.
  Check the pair against the poster and keep the arrowhead that the poster
  shows. Warnings about pairs you did not touch are pre-existing noise; leave
  them alone.
- **Pass-by strokes.** A coloured stroke that stops beside a box, or joins a
  spine without an arrowhead, is not an edge into that box.
- **Badges.** Shortcut badges (`kind: "shortcut"`) sit on arrow endpoints and
  carry their own `standsFor` id. Do not move an edge onto a full-size work
  just because the badge is nearby.

## Tools

| Command | Purpose |
| ------- | ------- |
| `node --experimental-strip-types scripts/fix-connections/inspect.ts <title> [<title> ...] [--out\|--in]` | List each node's incoming and outgoing edges (pass all titles at once). |
| `inspect.ts --expect "<A -> B[:class]>" ...` | Assert an edge exists; repeatable. |
| `inspect.ts --reject "<A -> B[:class]>" ...` | Assert an edge is absent; repeatable. |
| `inspect.ts --validate` | Check dangling endpoints, duplicates, self-loops, and opposite pairs. |
| `rg -n '<edge-id>' src/flow/chart.ts` | Find the edge object to edit without reading the file. |
| `node --test tests/graph.test.ts` | Run the repository graph regression tests. |

## Regression checks

When a fixed connection is important, add it to `tests/graph.test.ts` so
the next edit cannot silently undo it. The Last Remembrancer example asserts
both primary targets and the sibling edge from The Flight of the Eisenstein.

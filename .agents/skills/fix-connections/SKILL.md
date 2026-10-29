---
name: fix-connections
description: Use when chart connection directions in src/flow/chart.ts are wrong or missing, when the user says "fix connections", "fix connection direction", "this arrow is backwards", "X has no primary connection to Y", "X should connect to Y", or when validate reports opposite directions or a node has the wrong set of edges.
---

# Fix chart connections

Connection data lives in the `edges` array in `src/flow/chart.ts`; the boxes
live in `works`. The poster is the source of truth.

An edge is directed:

- `source` is the box the stroke leaves.
- `target` is the box the arrowhead enters.
- `connection` is `primary` (solid red, solid triangle), `secondary`
  (dotted blue, diamond head), or `tertiary` (dotted green, circle head).

Do not infer direction from layout. Two boxes feeding off the same vertical
spine are siblings, not parent and child, and OCR/tracer output often swaps
them.

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

   If the user says "has connections to", ask or crop the poster before
   assuming a direction. The poster settles it.

3. Inspect the current graph. Endpoint names are title substrings or exact
   ids; an ambiguous title lists the candidates and exits.

   ```bash
   node --experimental-strip-types scripts/fix-connections/inspect.ts \
     "The Last Remembrancer" --out
   ```

4. Crop only when the poster is the only way to know the direction. Skip it
   when the user already gave an exact `Source -> Target:class` and the change
   only adds or asserts that edge. Crop when:

   - the user did not state the direction;
   - an existing edge is being reversed or removed;
   - `--validate` warns about an opposite pair;
   - two nodes hang off one spine and the owner of a branch is unclear.

   The script measures the real poster borders, because chart coordinates can
   drift after the uniform alignment pass. It prints the chart and poster
   coordinates.

   ```bash
   python3 scripts/fix-connections/crop.py \
     "The Last Remembrancer" Garro "Ghosts Speak Not" "Child of Night" \
     --out /tmp/connection-check.png --pad 250
   ```

   Then open `/tmp/connection-check.png`. Confirm, for each proposed edge:

   - the stroke leaves the source box;
   - the arrowhead enters the target box;
   - the stroke colour matches the class.

5. Decide the smallest correct edit in `src/flow/chart.ts`:

   - **Missing edge** — add one object to `edges`.
   - **Backwards edge** — change `source` and `target` on the existing object
     and its id; do not leave both directions behind.
   - **Wrong class** — change `connection`.
   - **False edge** — delete the object.

   Keep ids unique and descriptive:
   `pN-<source-id>-<target-id>` for traced edges and `m-<source-id>-<target-id>`
   for hand-added edges. Match the surrounding style. Existing ids such as
   `the-maste-f-mankin`, `child-ofnight`, and `the-last-remembrancer-ancer-16`
   are OCR slugs; keep them exactly.

6. Assert the result with the same script. It exits non-zero on a mismatch.

   ```bash
   node --experimental-strip-types scripts/fix-connections/inspect.ts \
     --expect "The Last Remembrancer -> Ghosts Speak Not:primary" \
     --expect "The Last Remembrancer -> Garro:primary" \
     --reject "The Last Remembrancer -> Child of Night" \
     --validate
   ```

7. Spot-check the crop again if the fix changed which node owns a branch.

8. Validate the project:

   ```bash
   npm run lint
   npm run check
   node --experimental-strip-types scripts/check-graph.ts
   ```

9. Suggest a commit such as:

   ```text
   fix: correct chart connection directions
   ```

## Direction pitfalls

- **Spines and buses.** A single stroke can run past several boxes. Only the
  box the stroke leaves is the source; each arrowhead is a separate target.
  In the example, The Last Remembrancer and Child of Night both hang off a
  spine that leaves The Flight of the Eisenstein. Neither points at the other.
- **Opposite pairs.** `inspect.ts --validate` warns when the same pair appears
  in both directions. That is usually a broken direction, not two real edges.
  Crop the pair and keep the arrowhead that the poster shows.
- **Long jumps.** `image-recognition/build_graph.py` drops traced edges longer
  than 3200px that change row by more than 180px. If a long primary is missing,
  check the "long jumps removed" list in `image-recognition/README.md` before
  inventing it.
- **Pass-by strokes.** A coloured stroke that stops beside a box, or joins a
  spine without an arrowhead, is not an edge into that box.
- **Badges.** Shortcut badges (`kind: "shortcut"`) sit on arrow endpoints and
  carry their own `standsFor` id. Do not move an edge onto a full-size work
  just because the badge is nearby.

## Tools

| Command | Purpose |
| ------- | ------- |
| `node --experimental-strip-types scripts/fix-connections/inspect.ts <title> [--out\|--in]` | List a node's incoming and outgoing edges. |
| `inspect.ts --expect "<A -> B[:class]>" ...` | Assert an edge exists; repeatable. |
| `inspect.ts --reject "<A -> B[:class]>" ...` | Assert an edge is absent; repeatable. |
| `inspect.ts --validate` | Check dangling endpoints, duplicates, self-loops, and opposite pairs. |
| `python3 scripts/fix-connections/crop.py <titles...> [--pad N] [--out PATH]` | Crop the poster around the nodes for visual verification. |
| `node --experimental-strip-types scripts/check-graph.ts` | Run the repository graph regression checks. |

The crop script needs Pillow and numpy, the same requirements as the alignment
scripts (`python3 -m pip install --user -r image-recognition/requirements.txt`).

## Regression checks

When a fixed connection is important, add it to `scripts/check-graph.ts` so
the next edit cannot silently undo it. The Last Remembrancer example asserts
both primary targets and the sibling edge from The Flight of the Eisenstein.

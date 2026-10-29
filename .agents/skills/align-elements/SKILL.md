---
name: align-elements
description: Use when chart nodes in src/flow/chart.ts look misaligned, when rows or columns have small x/y offsets, when row/column spacing is uneven and the user wants uniform spacing, when the user says "align-elements", "align chart elements", "fix misaligned rows", "uniform spacing", "even rows", or "snap nodes to the poster".
---

# Align chart elements

Snap `src/flow/chart.ts` coordinates to the rows and columns printed on
`sources/chart.png`. The poster is the source of truth; chart coordinates are
OCR-derived and can drift by more than the small offsets the eye notices.

## Why the poster, not the majority

Do not pick a row's canonical value by majority alone. OCR drift often affects
most nodes in a row. A real example from this chart:

- `y=8134` had 3 nodes, `y=8112` had 2.
- The poster showed all 5 boxes starting at y=8111.
- Majority would have moved the 2 correct nodes to the wrong value.

The same applied to `y=8253` (5 nodes) vs `y=8232` (6 nodes), and to
`Raven's Flight` at `x=2199` while 14 neighbours sat at `x=2173`.

## Process

The chart has two independent passes:

- **Poster pass** (default): snap OCR drift to the poster's rows/columns.
- **Uniform pass** (`--uniform`): fit one row pitch and one column pitch, then
  put every row and column on that lattice. This leaves the poster on purpose,
  so run it after the poster pass and only when the user wants even spacing.

Run the poster pass first, then the uniform pass if even spacing is wanted.

1. Check git state first. Do not edit on top of unrelated uncommitted work.

   ```bash
   git status --short
   ```

2. Run the poster detector. It measures each box's real top and left border on
   the poster, groups boxes into rows/columns, and lists coordinates that should
   move.

   ```bash
   python3 scripts/align-elements/align.py
   ```

   The default `--max-delta 30` catches poster-verified drift that a 20px
   chart-value pass misses (for example Raven's Flight at 21-26px). Use a
   smaller value to stay conservative:

   ```bash
   python3 scripts/align-elements/align.py --max-delta 3
   python3 scripts/align-elements/align.py --max-delta 20
   ```

3. Review every proposed move. Each line shows the chart value, the canonical
   value, and the measured poster edge. If a move would flatten an intentional
   design offset, skip it by tightening `--max-delta` or by excluding its kind.

4. Apply the plan. The script verifies the old value is still at the expected
   source offset before writing.

   ```bash
   python3 scripts/align-elements/align.py --write
   ```

5. Re-run the detector and expect:

   ```text
   No misaligned rows or columns found.
   ```

   If even spacing is wanted, run the uniform pass next (see below) before
   validating.

6. Validate:

   ```bash
   npm run lint
   npm run check
   node --experimental-strip-types scripts/check-graph.ts
   ```

7. Suggest a commit such as:

   ```text
   fix: align chart node rows and columns
   ```

## Uniform spacing

The poster spaces rows and columns by hand, so the gaps vary. `--uniform` fits
one pitch per axis and moves the whole chart onto that lattice:

```bash
python3 scripts/align-elements/align.py --uniform          # dry run
python3 scripts/align-elements/align.py --uniform --write  # apply
```

The dry run prints the fitted pitch, line count, origin, and the largest line
shifts. Review them before writing. A second run must print:

```text
Already uniformly spaced.
```

### How it fits

- Lines come from the full-size works (the excluded kinds are skipped). Values
  closer than half the median gap collapse into one line, so small staggers
  and OCR drift become a single row/column.
- The pitch is the average spacing across the whole span, clamped so boxes
  cannot overlap (work size plus a small gap). Override it with
  `--row-pitch` / `--col-pitch`.
- Every work, including badges and audio capsules, is mapped through a
  piecewise-linear transform. Works on a line snap exactly to it; works between
  lines keep their relative position. `--axes y` or `--axes x` regularizes only
  one axis.
- Zones are recomputed from their member works (the work's `zone` field). The
  poster's padding is kept; negative padding from a box that clipped a work on
  the poster is clamped to zero so every zone contains its members.
- `--max-delta`, `--search-window`, and `--edge-tolerance` belong to the poster
  pass; `--uniform` ignores them. `--json plan.json` saves the full plan.

### Safety

- The pass refuses to write if two full-size works would overlap. Review the
  reported pairs; only then rerun with `--allow-overlaps`.
- Do **not** run the poster pass after the uniform pass. The poster search
  assumes chart coordinates are still within `--search-window` of the poster,
  and the uniform pass deliberately moves some columns by hundreds of pixels.
  Commit the poster alignment first, then run uniform as a separate change.

## What gets aligned

By default the script skips `shortcut` (30x30 badges) and `audio` (100x100
capsules). Badges and audio are positioned on arrow endpoints. Graphic novels
are included: they are angled hexagons rather than rectangles, so they use a
separate measurement path (see below).

Override with:

```bash
python3 scripts/align-elements/align.py --exclude-kinds ""
python3 scripts/align-elements/align.py --exclude-kinds shortcut,audio,graphicNovel
```

Only full-size works participate by default:

- `--axes x,y` (default) or `--axes y`
- `--edge-tolerance 2` groups measured poster edges; raise it only if the
  poster measurement is noisy
- `--search-window 50` is how far from the chart seed the poster is searched
- `--json plan.json` saves the plan
- `--fail-on-moves` makes the command exit 1 when moves exist

## How the detector works

`scripts/align-elements/poster.py` finds the nearest dark horizontal run for
the box top and the nearest dark vertical run for the box left edge. It merges
row/column hits into regions, so black-filled boxes and white-text gaps do not
break the measurement. Vertical runs also tolerate small gaps where a
connection arrow crosses the border, which would otherwise hide the edge and
skip the node.

Graphic novels have angled sides, so there is no vertical border run to find.
For those, `measure_angled_box` measures the top from a half-width flat run and
takes the leftmost low-saturation outline pixel across the box height. The
angled border is grey/black, while connection arrows are saturated, so arrows
crossing the box are ignored.

`scripts/align-elements/align.py` parses only the `works` array, measures each
eligible work, groups by the measured edge, and chooses the canonical chart
value closest to that measured edge. It never uses the majority coordinate.
Replacements are made by absolute source offset, not by global string replace,
so identical coordinate values in unrelated nodes stay untouched.

Works whose border cannot be measured are listed by title and kind instead of
being skipped silently, so a missed alignment is visible in the detector
output.

## Requirements

Pillow and numpy, already listed in `ocr/requirements.txt`:

```bash
python3 -m pip install --user -r ocr/requirements.txt
```

## Notes

- The poster is 12000x12556; Pillow's decompression-bomb guard is disabled in
  `poster.py`.
- If a work is skipped for "no measured border", its chart coordinate may be
  more than `--search-window` away from the poster or its fill blends into the
  border. Inspect that node manually; do not silently widen the window without
  checking for a neighbouring box.

#!/usr/bin/env python3
"""Find work-box black borders the OCR seeder missed, especially where a red stroke cuts the fill.

Reads sources/chart.png and the works already listed in src/flow/chart.ts.
Writes debug crops to ocr/out/unmatched-boxes/. See README.md.
"""

import re
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None

HERE = Path(__file__).resolve().parent
ROOT = HERE / "out"
CHART = HERE.parent / "sources" / "chart.png"
SRC = HERE.parent / "src" / "flow" / "chart.ts"

# Chart body under the era bar.
X0, Y0, X1, Y1 = 180, 4200, 11940, 11920


def load_works():
    text = SRC.read_text()
    body = text.split("export const edges")[0]
    works = []
    for block in re.finditer(
        r'id: "([^"]+)"[\s\S]*?kind: "([^"]+)"[\s\S]*?x: (\d+),\s*y: (\d+),\s*w: (\d+),\s*h: (\d+)',
        body,
    ):
        works.append(
            {
                "id": block.group(1),
                "kind": block.group(2),
                "x": int(block.group(3)),
                "y": int(block.group(4)),
                "w": int(block.group(5)),
                "h": int(block.group(6)),
            }
        )
    return works


def main():
    works = load_works()
    print(f"existing works {len(works)}", flush=True)
    im = Image.open(CHART).convert("RGB")
    arr = np.asarray(im.crop((X0, Y0, X1, Y1)))
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    black = (r < 42) & (g < 42) & (b < 42)
    # Bridge a vertical stroke that cuts the top or bottom rule. Neighbouring
    # boxes sit ~170px apart, so a 16px close does not merge them.
    closed = ndimage.binary_closing(black, structure=np.ones((1, 16), dtype=bool))
    # Horizontal border runs. A work box top/bottom rule is ~150–280px long
    # and only a few pixels thick. Arrows enter the sides, so these rules stay
    # intact unless a vertical stroke cuts them.
    raw_runs = []
    rowpad = np.pad(closed, ((0, 0), (1, 1)))
    for y in range(closed.shape[0]):
        diff = np.diff(rowpad[y].astype(np.int8))
        starts = np.flatnonzero(diff == 1)
        ends = np.flatnonzero(diff == -1)
        for s, e in zip(starts, ends):
            length = e - s
            if 145 <= length <= 340:
                raw_runs.append((y, int(s), int(e)))
    print(f"horizontal runs {len(raw_runs)}", flush=True)

    # Collapse thickness. Several boxes share a row, so group by x-span and
    # then by a tight y cluster. A 1px anti-aliased gap still counts.
    rules = []
    raw_runs.sort(key=lambda item: (item[1], item[0], item[2]))
    consumed = [False] * len(raw_runs)
    for i, (y, s, e) in enumerate(raw_runs):
        if consumed[i]:
            continue
        cluster = [(y, s, e)]
        consumed[i] = True
        for j in range(i + 1, len(raw_runs)):
            y2, s2, e2 = raw_runs[j]
            if s2 - s > 8:
                break
            if consumed[j] or abs(e2 - e) > 8 or not (y - 2 <= y2 <= y + 10):
                continue
            cluster.append((y2, s2, e2))
            consumed[j] = True
        ys = [item[0] for item in cluster]
        thick = max(ys) - min(ys) + 1
        if thick < 2 or thick > 12 or len(cluster) < 2:
            continue
        rules.append((Y0 + min(ys), X0 + s, X0 + e, thick))
    print(f"horizontal rules {len(rules)}", flush=True)

    rules.sort(key=lambda t: (t[0], t[1]))
    used = set()
    boxes = []
    for i, (y, s, e, thick) in enumerate(rules):
        if i in used:
            continue
        best = None
        for j in range(i + 1, len(rules)):
            y2, s2, e2, thick2 = rules[j]
            dy = y2 - y
            if dy < 70:
                continue
            if dy > 130:
                break
            if abs(s2 - s) > 14 or abs(e2 - e) > 14:
                continue
            score = abs(s2 - s) + abs(e2 - e) + abs(dy - 92)
            if best is None or score < best[0]:
                best = (score, j, y2, s2, e2)
        if best is None:
            continue
        _, j, y2, s2, e2 = best
        used.add(i)
        used.add(j)
        x = min(s, s2)
        x2 = max(e, e2)
        boxes.append(
            {
                "x": x + 3,
                "y": y + 2,
                "w": (x2 - x) - 6,
                "h": (y2 - y) - 2,
                "x0": x,
                "x1": x2,
                "y0": y,
                "y1": y2 + 4,
            }
        )
    print(f"paired boxes {len(boxes)}", flush=True)

    def overlaps(box, work, pad=18):
        ax0, ay0 = box["x"] - pad, box["y"] - pad
        ax1, ay1 = box["x"] + box["w"] + pad, box["y"] + box["h"] + pad
        bx0, by0 = work["x"], work["y"]
        bx1, by1 = work["x"] + work["w"], work["y"] + work["h"]
        iw = max(0, min(ax1, bx1) - max(ax0, bx0))
        ih = max(0, min(ay1, by1) - max(ay0, by0))
        return iw * ih > 0

    red = (r > 155) & (r > g + 55) & (r > b + 55) & (g < 120) & (b < 120)
    unmatched = []
    matched = 0
    for box in boxes:
        hit = next((work for work in works if overlaps(box, work)), None)
        # Red pixels in the inner half: a stroke cutting the fill.
        iy0 = max(0, box["y0"] - Y0 + 20)
        iy1 = min(arr.shape[0], box["y1"] - Y0 - 20)
        ix0 = max(0, box["x0"] - X0 + 16)
        ix1 = min(arr.shape[1], box["x1"] - X0 - 16)
        cut = int(red[iy0:iy1, ix0:ix1].sum()) if iy1 > iy0 and ix1 > ix0 else 0
        if hit is None:
            box["red_cut"] = cut
            unmatched.append(box)
        else:
            matched += 1
            if cut > 40:
                print(
                    f"stroke-cut existing {hit['id']} cut={cut} box=({box['x']},{box['y']} {box['w']}x{box['h']})",
                    flush=True,
                )
    print(f"matched {matched} unmatched {len(unmatched)}", flush=True)
    unmatched.sort(key=lambda b: (b["y"], b["x"]))
    out = ROOT / "unmatched-boxes"
    out.mkdir(parents=True, exist_ok=True)
    for i, box in enumerate(unmatched):
        print(
            f"NEW {i:03d} x={box['x']} y={box['y']} w={box['w']} h={box['h']} red_cut={box['red_cut']}",
            flush=True,
        )
        crop = im.crop(
            (
                max(0, box["x"] - 30),
                max(0, box["y"] - 20),
                box["x"] + box["w"] + 40,
                box["y"] + box["h"] + 70,
            )
        )
        crop.convert("RGB").save(out / f"box-{i:03d}.jpg", quality=85)

    # Recall check against novels already in the graph.
    novels = [w for w in works if w["kind"] == "novel"]
    missed_known = []
    for work in novels:
        if not any(overlaps(box, work, pad=24) for box in boxes):
            missed_known.append(work["id"])
    print(f"known novels missed by border pair: {len(missed_known)}", flush=True)
    print(" ".join(missed_known[:40]), flush=True)


if __name__ == "__main__":
    main()

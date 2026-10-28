#!/usr/bin/env python3
"""Measure missed chamfered boxes and see which existing node each arrow hits.

Reads sources/chart.png and src/flow/chart.ts. Prints measurements. Writes nothing.
See README.md in this directory.
"""

import re
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None

HERE = Path(__file__).resolve().parent
CHART = HERE.parent / "sources" / "chart.png"
SRC = HERE.parent / "src" / "flow" / "chart.ts"

SEEDS = {
    "misbegotten": (9009, 4966),
    "terminus": (9009, 7759),
    "chamber": (4308, 7199),
    "prince": (4833, 10774),
    "scions": (3726, 11142),
    "badge-sc2": (6823, 10660),
    "badge-ae2": (7559, 10660),
    "first-wall": (10110, 8025),
    "saturnine": (10470, 8025),
    "mortis": (11150, 8025),
    "warhawk": (11510, 8025),
}


def load_works():
    text = SRC.read_text().split("export const edges")[0]
    works = []
    for m in re.finditer(
        r'\{\s*id: "([^"]+)",\s*title: "([^"]+)",\s*publication: "([^"]+)",\s*kind: "([^"]+)",[\s\S]*?x: (\d+),\s*y: (\d+),\s*w: (\d+),\s*h: (\d+),',
        text,
    ):
        works.append(
            {
                "id": m.group(1),
                "title": m.group(2),
                "kind": m.group(4),
                "x": int(m.group(5)),
                "y": int(m.group(6)),
                "w": int(m.group(7)),
                "h": int(m.group(8)),
            }
        )
    return works


def color_masks(arr):
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    red = (r > 155) & (r > g + 55) & (r > b + 55) & (g < 120) & (b < 120)
    blue = (b > 105) & (b > r + 40) & (b > g + 15) & (r < 110) & (g < 170)
    green = (g > 110) & (g > r + 35) & (g > b + 25) & (r < 130) & (b < 130)
    return red, blue, green


def measure(arr, cx, cy):
    h, w = arr.shape[:2]
    black = (arr[:, :, 0] < 45) & (arr[:, :, 1] < 45) & (arr[:, :, 2] < 45)
    # Interior flood from the seed, treating black and colored strokes as walls.
    wall = black.copy()
    yy, xx = np.ogrid[:h, :w]
    near = (yy - cy) ** 2 + (xx - cx) ** 2 <= 140 ** 2
    # Keep the flood local so a gap in the border cannot escape into the page.
    wall |= ~near
    free = ~wall
    labels, _ = ndimage.label(free)
    lab = labels[cy, cx]
    if lab == 0:
        # Seed landed on the border. Nudge inward.
        for dy in range(-8, 9):
            for dx in range(-8, 9):
                if labels[cy + dy, cx + dx]:
                    lab = labels[cy + dy, cx + dx]
                    break
            if lab:
                break
    interior = labels == lab
    ys, xs = np.where(interior)
    if len(xs) == 0:
        return None
    # Border is the black pixels touching the interior.
    dil = ndimage.binary_dilation(interior, iterations=3)
    border = black & dil & near
    by, bx = np.where(border)
    x0 = int(bx.min()) if len(bx) else int(xs.min())
    x1 = int(bx.max()) if len(bx) else int(xs.max())
    y0 = int(by.min()) if len(by) else int(ys.min())
    y1 = int(by.max()) if len(by) else int(ys.max())
    fill = np.median(arr[interior], axis=0)
    # Ribbon gold just under the box.
    gy0, gy1 = y1 + 1, min(h - 1, y1 + 55)
    gx0, gx1 = x0, x1
    sub = arr[gy0:gy1, gx0:gx1].astype(np.int16)
    if sub.size:
        rr, gg, bb = sub[:, :, 0], sub[:, :, 1], sub[:, :, 2]
        gold = (rr > 190) & (gg > 110) & (gg < 230) & (bb < 100) & (rr > gg)
        gold_n = int(gold.sum())
    else:
        gold_n = 0
    return {
        "x": x0,
        "y": y0,
        "w": x1 - x0 + 1,
        "h": y1 - y0 + 1,
        "fill": [int(c) for c in fill],
        "gold": gold_n,
        "area": int(interior.sum()),
    }


def hex_color(fill):
    return "#{:02x}{:02x}{:02x}".format(*fill)


def faction_key(fill):
    snapped = [min(255, int(round(int(c) / 32.0) * 32)) for c in fill]
    return "#{:02x}{:02x}{:02x}".format(*snapped)


def text_color(fill):
    r, g, b = fill
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    return "#1c1917" if lum > 155 else "#f6f1e6"


def main():
    works = load_works()
    im = Image.open(CHART).convert("RGB")
    # Full array is large but we need traces across the page.
    arr = np.asarray(im)
    print("image", arr.shape, flush=True)
    red, blue, green = color_masks(arr)
    masks = {"primary": red, "secondary": blue, "tertiary": green}
    closed = {
        name: ndimage.binary_closing(mask, structure=np.ones((1, 14), bool))
        | ndimage.binary_closing(mask, structure=np.ones((14, 1), bool))
        for name, mask in masks.items()
    }

    measured = {}
    for name, (cx, cy) in SEEDS.items():
        box = measure(arr, cx, cy)
        measured[name] = box
        if box is None:
            print(name, "NO BOX")
            continue
        fill = box["fill"]
        print(
            f"{name} x={box['x']} y={box['y']} w={box['w']} h={box['h']} "
            f"fill={hex_color(fill)} faction={faction_key(fill)} text={text_color(fill)} "
            f"gold={box['gold']} area={box['area']}",
            flush=True,
        )

    # Hit-test boxes: existing works plus the newly measured ones.
    nodes = [
        {"id": w["id"], "x": w["x"], "y": w["y"], "w": w["w"], "h": w["h"]}
        for w in works
        if w["kind"] != "shortcut"
    ]
    for name, box in measured.items():
        if box is None:
            continue
        nodes.append(
            {"id": name, "x": box["x"], "y": box["y"], "w": box["w"], "h": box["h"]}
        )

    def hit(x, y, ignore):
        for node in nodes:
            if node["id"] == ignore:
                continue
            if node["x"] - 6 <= x <= node["x"] + node["w"] + 6 and node["y"] - 6 <= y <= node["y"] + node["h"] + 6:
                return node["id"]
        return None

    # Walk out of each new box along each color. Sample the border and follow.
    for name, box in measured.items():
        if box is None or name.startswith("first") or name in {"saturnine", "mortis", "warhawk"}:
            continue
        print(f"-- exits {name}", flush=True)
        x0, y0, x1, y1 = box["x"], box["y"], box["x"] + box["w"], box["y"] + box["h"]
        for cname, mask in closed.items():
            # Seeds: colored pixels just outside the box.
            band = np.zeros(mask.shape, bool)
            pad = 8
            band[max(0, y0 - pad) : y1 + pad, max(0, x0 - pad) : x1 + pad] = True
            inner = np.zeros(mask.shape, bool)
            inner[y0 + 2 : y1 - 2, x0 + 2 : x1 - 2] = True
            seeds = np.argwhere(mask & band & ~inner)
            if len(seeds) == 0:
                continue
            # Cluster seed points so each side is one exit.
            used = np.zeros(len(seeds), bool)
            groups = []
            for i, (sy, sx) in enumerate(seeds):
                if used[i]:
                    continue
                grp = [(int(sy), int(sx))]
                used[i] = True
                for j in range(i + 1, len(seeds)):
                    if used[j]:
                        continue
                    if abs(int(seeds[j, 0]) - sy) < 18 and abs(int(seeds[j, 1]) - sx) < 18:
                        grp.append((int(seeds[j, 0]), int(seeds[j, 1])))
                        used[j] = True
                groups.append(grp)
            for grp in groups:
                sy = int(np.median([p[0] for p in grp]))
                sx = int(np.median([p[1] for p in grp]))
                # Step away from the box center.
                cy = (y0 + y1) / 2
                cx = (x0 + x1) / 2
                direction = np.array([sy - cy, sx - cx], dtype=float)
                norm = np.linalg.norm(direction) or 1
                direction /= norm
                y, x = sy, sx
                prev = None
                found = None
                for _ in range(2500):
                    best = None
                    best_d = 1e9
                    for dy in range(-3, 4):
                        for dx in range(-3, 4):
                            if dy == 0 and dx == 0:
                                continue
                            ny, nx = y + dy, x + dx
                            if not (0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1]):
                                continue
                            if prev and abs(ny - prev[0]) < 2 and abs(nx - prev[1]) < 2:
                                continue
                            if not mask[ny, nx]:
                                continue
                            # Prefer steps that continue outward or along the line.
                            step = np.array([dy, dx], dtype=float)
                            score = -np.dot(step, direction)
                            if score < best_d:
                                best_d = score
                                best = (ny, nx)
                    if best is None:
                        break
                    prev = (y, x)
                    y, x = best
                    # Update direction slowly so corners can turn.
                    direction = 0.85 * direction + 0.15 * np.array([y - prev[0], x - prev[1]], dtype=float)
                    nrm = np.linalg.norm(direction) or 1
                    direction /= nrm
                    found = hit(x, y, name)
                    if found:
                        break
                print(
                    f"  {cname} from ({sx},{sy}) -> {found or 'none'} end=({x},{y})",
                    flush=True,
                )


if __name__ == "__main__":
    main()

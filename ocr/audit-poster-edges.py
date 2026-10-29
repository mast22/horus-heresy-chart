#!/usr/bin/env python3
"""Read sources/chart.png and the shipped chart, then list poster joins.

A join is a stroke whose head meets one shipped work and whose tail meets
another. The shaft start is the skeleton pixel just outside the opened head,
so a nearby spine is not used as the start. The walk stops at the first
other work. Writes one line per shipped work to {scratch}/edge-audit.log.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.morphology import disk, opening, skeletonize

Image.MAX_IMAGE_PIXELS = None

ROOT = Path(__file__).resolve().parents[1]
CHART = ROOT / "sources" / "chart.png"
SRC = ROOT / "src" / "flow" / "chart.ts"

HEAD = {
    "primary": {"radius": 4, "min_area": 80, "max_area": 450, "max_side": 36, "min_side": 8},
    "secondary": {"radius": 2, "min_area": 100, "max_area": 500, "max_side": 48, "min_side": 12},
    "tertiary": {"radius": 2, "min_area": 50, "max_area": 400, "max_side": 32, "min_side": 6},
}

FACE = {
    ("raven-s-flight", "the-face-of-treachery", "primary"),
    ("the-face-of-treachery", "deliverance-lost", "primary"),
}
# The audit must see these even when another arrow of the same class shares the head.
MUST = FACE | {
    ("the-outcast-dead", "wolt-hunt", "primary"),
    ("saturnine", "the-fury-of-magnus", "primary"),
}


def load_chart():
    text = SRC.read_text()
    works_text, edges_text = text.split("export const edges", 1)
    works = []
    for m in re.finditer(
        r'\{\s*id: "([^"]+)",\s*title: "((?:\\.|[^"\\])*)",[\s\S]*?x: (\d+),\s*y: (\d+),\s*w: (\d+),\s*h: (\d+),',
        works_text,
    ):
        works.append(
            {
                "id": m.group(1),
                "title": m.group(2),
                "x": int(m.group(3)),
                "y": int(m.group(4)),
                "w": int(m.group(5)),
                "h": int(m.group(6)),
            }
        )
    edges = []
    for m in re.finditer(
        r'source: "([^"]+)",\s*target: "([^"]+)",\s*connection: "([^"]+)"',
        edges_text.split("export const zones", 1)[0],
    ):
        edges.append((m.group(1), m.group(2), m.group(3)))
    return works, edges


def color_masks(arr):
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    red = (r > 155) & (r > g + 55) & (r > b + 55) & (g < 120) & (b < 120)
    blue = (b > 105) & (b > r + 40) & (b > g + 15) & (r < 110) & (g < 170)
    green = (g > 110) & (g > r + 35) & (g > b + 25) & (r < 130) & (b < 130)
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    bg = (mx > 215) & ((mx - mn) < 28)
    return {"primary": red, "secondary": blue, "tertiary": green}, bg


def card_margins(bg, works):
    H, W = bg.shape
    margins = []
    for w in works:
        x, y, bw, bh = w["x"], w["y"], w["w"], w["h"]
        samples = {
            "left": ([(x, y + int(bh * t / 6)) for t in range(1, 6)], (-1, 0)),
            "right": ([(x + bw - 1, y + int(bh * t / 6)) for t in range(1, 6)], (1, 0)),
            "up": ([(x + int(bw * t / 6), y) for t in range(1, 6)], (0, -1)),
            "down": ([(x + int(bw * t / 6), y + bh - 1) for t in range(1, 6)], (0, 1)),
        }
        side = {}
        for name, (pts, (dx, dy)) in samples.items():
            dists = []
            for sx, sy in pts:
                hit = 55
                for step in range(0, 56):
                    px, py = sx + dx * step, sy + dy * step
                    if not (0 <= px < W and 0 <= py < H) or bg[py, px]:
                        hit = step
                        break
                dists.append(hit)
            side[name] = int(np.median(dists))
        margins.append(side)
    return margins


def expanded(work, margin, extra=0):
    return (
        work["x"] - margin["left"] - extra,
        work["y"] - margin["up"] - extra,
        work["x"] + work["w"] - 1 + margin["right"] + extra,
        work["y"] + work["h"] - 1 + margin["down"] + extra,
    )


def gap_to_rect(rect, x, y):
    x0, y0, x1, y1 = rect
    dx = 0 if x0 <= x <= x1 else (x0 - x if x < x0 else x - x1)
    dy = 0 if y0 <= y <= y1 else (y0 - y if y < y0 else y - y1)
    if dx == 0 and dy == 0:
        return -min(x - x0, x1 - x, y - y0, y1 - y)
    return (dx * dx + dy * dy) ** 0.5


def paint_meet(shape, works, margins):
    label = np.zeros(shape, dtype=np.int16)
    best = np.full(shape, 999, dtype=np.int16)
    H, W = shape
    for i, (work, margin) in enumerate(zip(works, margins), start=1):
        x0, y0, x1, y1 = expanded(work, margin, 3)
        xa, ya = max(0, int(x0)), max(0, int(y0))
        xb, yb = min(W - 1, int(x1)), min(H - 1, int(y1))
        if xb < xa or yb < ya:
            continue
        sx0, sy0 = work["x"], work["y"]
        sx1, sy1 = sx0 + work["w"] - 1, sy0 + work["h"] - 1
        yy = np.arange(ya, yb + 1)[:, None]
        xx = np.arange(xa, xb + 1)[None, :]
        dx = np.where(xx < sx0, sx0 - xx, np.where(xx > sx1, xx - sx1, 0))
        dy = np.where(yy < sy0, sy0 - yy, np.where(yy > sy1, yy - sy1, 0))
        dist = np.maximum(dx, dy).astype(np.int16)
        sub_l = label[ya : yb + 1, xa : xb + 1]
        sub_d = best[ya : yb + 1, xa : xb + 1]
        better = dist < sub_d
        sub_d[better] = dist[better]
        sub_l[better] = i
        label[ya : yb + 1, xa : xb + 1] = sub_l
        best[ya : yb + 1, xa : xb + 1] = sub_d
    return label


def blank_boxes(mask, works):
    H, W = mask.shape
    for w in works:
        x0, y0 = w["x"] + 4, w["y"] + 4
        x1, y1 = w["x"] + w["w"] - 5, w["y"] + w["h"] - 5
        if x1 <= x0 or y1 <= y0:
            continue
        mask[max(0, y0) : min(H, y1), max(0, x0) : min(W, x1)] = False


def find_heads(raw, spec):
    opened = opening(raw, disk(spec["radius"]))
    lab, n = ndimage.label(opened)
    if n == 0:
        return []
    counts = np.bincount(lab.ravel())
    objs = ndimage.find_objects(lab)
    found = []
    for i, sl in enumerate(objs, start=1):
        if sl is None:
            continue
        area = int(counts[i])
        bh = sl[0].stop - sl[0].start
        bw = sl[1].stop - sl[1].start
        if area < spec["min_area"] or area > spec["max_area"]:
            continue
        if max(bw, bh) > spec["max_side"] or min(bw, bh) < spec["min_side"]:
            continue
        ys, xs = np.nonzero(lab[sl] == i)
        found.append(
            {
                "cx": float(xs.mean() + sl[1].start),
                "cy": float(ys.mean() + sl[0].start),
                "sl": sl,
                "area": area,
            }
        )
    return found


def close_line(mask, kind):
    if kind == "primary":
        return ndimage.binary_closing(mask, structure=disk(1))
    horiz = ndimage.binary_closing(mask, structure=np.ones((1, 17), dtype=bool))
    vert = ndimage.binary_closing(mask, structure=np.ones((17, 1), dtype=bool))
    return ndimage.binary_closing(horiz | vert, structure=disk(5))


def neighbors(skel, y, x):
    H, W = skel.shape
    out = []
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            yy, xx = y + dy, x + dx
            if 0 <= yy < H and 0 <= xx < W and skel[yy, xx]:
                out.append((yy, xx))
    return out


def shaft_exit(skel, sl, cx, cy, tcx, tcy):
    """Skeleton pixel just outside the opened head's bounding box."""
    H, W = skel.shape
    y0 = max(0, sl[0].start - 6)
    y1 = min(H, sl[0].stop + 6)
    x0 = max(0, sl[1].start - 6)
    x1 = min(W, sl[1].stop + 6)
    local = skel[y0:y1, x0:x1]
    rim = local.copy()
    iy0, iy1 = sl[0].start - y0, sl[0].stop - y0
    ix0, ix1 = sl[1].start - x0, sl[1].stop - x0
    rim[iy0:iy1, ix0:ix1] = False
    ys, xs = np.nonzero(rim)
    if len(xs) == 0:
        return None
    xs = xs + x0
    ys = ys + y0
    near = (xs - cx) ** 2 + (ys - cy) ** 2 <= 34 * 34
    if not near.any():
        return None
    xs, ys = xs[near], ys[near]
    away = (xs - tcx) ** 2 + (ys - tcy) ** 2
    k = int(away.argmax())
    return int(ys[k]), int(xs[k])


def jump_gap(skel, y, x, prev, seen, reach=14):
    vy, vx = y - prev[0], x - prev[1]
    H, W = skel.shape
    best = None
    best_key = None
    y0, y1 = max(0, y - reach), min(H, y + reach + 1)
    x0, x1 = max(0, x - reach), min(W, x + reach + 1)
    ys, xs = np.nonzero(skel[y0:y1, x0:x1])
    for py, px in zip(ys, xs):
        yy, xx = int(py + y0), int(px + x0)
        if (yy, xx) in seen or (yy, xx) == (y, x):
            continue
        dy, dx = yy - y, xx - x
        if dy * vy + dx * vx < 1:
            continue
        dist = dy * dy + dx * dx
        key = (dist, -(dy * vy + dx * vx))
        if best_key is None or key < best_key:
            best_key = key
            best = (yy, xx)
    return best


def heading(hist):
    """Direction over several steps, so a one-pixel kink does not leave the shaft."""
    if len(hist) < 2:
        return (0, 0)
    y0, x0 = hist[max(0, len(hist) - 8)]
    y1, x1 = hist[-1]
    return (y1 - y0, x1 - x0)


def meets_other_head(x, y, hid, head_pts):
    """A card touched only at another head of this class is a second target.

    A thick corner on the shaft can look like a head and sit just outside the
    card. Only heads that actually sit on the card (gap <= 16) count, so that
    corner does not hide the card the shaft meets.
    """
    for cx, cy, idx, gap in head_pts:
        if idx != hid - 1 or gap > 16:
            continue
        if (cx - x) ** 2 + (cy - y) ** 2 <= 26 * 26:
            return True
    return False


def follow_to_card(skel, meet, start, prev, target_idx, head_pts, limit=1600, probe=420):
    """Return every work the shaft meets.

    The straight continuation is the shaft. At a corner, each other branch is
    followed until it meets a work or runs out, so a second tail into the same
    head is kept. A branch that only touches another head is not a source.
    """
    found = {}
    y, x = start
    seen = {prev, start}
    jumps = 0
    hist = [prev, start]

    def consider(hid, px, py, step):
        if not hid or hid == target_idx or step <= 8:
            return
        if meets_other_head(px, py, hid, head_pts):
            return
        found[hid] = min(found.get(hid, step), step)

    def probe_branch(seed, origin, blocked):
        py, px = seed
        pprev = origin
        pseen = set(blocked)
        pseen.add(origin)
        pseen.add(seed)
        phist = [origin, seed]
        pjumps = 0
        for step in range(1, probe + 1):
            hid = int(meet[py, px])
            # A touch that only lands on another head of this same card is a
            # sibling target. Keep walking so a shaft that also meets the card
            # body can still be recorded.
            if hid and hid != target_idx and step > 6 and not meets_other_head(px, py, hid, head_pts):
                return hid, px, py, step
            nbrs = [p for p in neighbors(skel, py, px) if p not in pseen]
            if not nbrs and pjumps < 2:
                hopped = jump_gap(skel, py, px, pprev, pseen, reach=10)
                if hopped is not None:
                    pjumps += 1
                    nbrs = [hopped]
            if not nbrs:
                hid = int(meet[py, px])
                if (
                    hid
                    and hid != target_idx
                    and not meets_other_head(px, py, hid, head_pts)
                ):
                    return hid, px, py, step
                return None
            if len(nbrs) == 1:
                nxt = nbrs[0]
            else:
                vy, vx = heading(phist)
                nbrs.sort(key=lambda p: (p[0] - py) * vy + (p[1] - px) * vx, reverse=True)
                if (nbrs[0][0] - py) * vy + (nbrs[0][1] - px) * vx < 0:
                    return None
                nxt = nbrs[0]
            pseen.add(nxt)
            phist.append(nxt)
            pprev = (py, px)
            py, px = nxt
        return None

    for step in range(1, limit + 1):
        hid = int(meet[y, x])
        if (
            hid
            and hid != target_idx
            and step > 8
            and not meets_other_head(x, y, hid, head_pts)
        ):
            consider(hid, x, y, step)
            return found
        nbrs = [p for p in neighbors(skel, y, x) if p not in seen]
        if not nbrs and jumps < 4:
            hopped = jump_gap(skel, y, x, prev, seen)
            if hopped is not None:
                jumps += 1
                nbrs = [hopped]
        if not nbrs:
            consider(int(meet[y, x]), x, y, step)
            return found
        vy, vx = heading(hist)
        if len(nbrs) == 1:
            nxt = nbrs[0]
        else:
            nbrs.sort(key=lambda p: (p[0] - y) * vy + (p[1] - x) * vx, reverse=True)
            if (nbrs[0][0] - y) * vy + (nbrs[0][1] - x) * vx < 0:
                return found
            nxt = nbrs[0]
            for side in nbrs[1:]:
                dot = (side[0] - y) * vy + (side[1] - x) * vx
                if dot < 0:
                    continue
                hit = probe_branch(side, (y, x), seen)
                if hit is not None:
                    consider(hit[0], hit[1], hit[2], step + hit[3])
        seen.add(nxt)
        hist.append(nxt)
        prev = (y, x)
        y, x = nxt
    return found


def main():
    if len(sys.argv) < 2:
        print("usage: audit-poster-edges.py SCRATCH", file=sys.stderr)
        sys.exit(2)
    scratch = Path(sys.argv[1])
    scratch.mkdir(parents=True, exist_ok=True)
    works, edges = load_chart()
    print(f"works {len(works)} shipped-edges {len(edges)}", flush=True)
    arr = np.asarray(Image.open(CHART).convert("RGB"))
    print("image", arr.shape, flush=True)
    masks, bg = color_masks(arr)
    margins = card_margins(bg, works)
    print("meet", flush=True)
    meet = paint_meet(arr.shape[:2], works, margins)
    rects = [expanded(w, m, 0) for w, m in zip(works, margins)]
    shipped = set(edges)
    detected = {}
    head_on = [False] * len(works)

    for kind, spec in HEAD.items():
        print("class", kind, flush=True)
        raw = masks[kind].copy()
        blank_boxes(raw, works)
        heads = find_heads(raw, spec)
        print(f"  heads {len(heads)}", flush=True)
        closed = close_line(raw, kind)
        skel = skeletonize(closed)
        print(f"  skel {int(skel.sum())}", flush=True)
        assigned = []
        for head in heads:
            best_i = None
            best_g = 1e9
            for i, rect in enumerate(rects):
                g = gap_to_rect(rect, head["cx"], head["cy"])
                if g < best_g:
                    best_g = g
                    best_i = i
            if best_i is None or not (-12 <= best_g <= 28):
                continue
            assigned.append((head, best_i))
        head_pts = []
        for head, best_i in assigned:
            rect = rects[best_i]
            head_pts.append(
                (head["cx"], head["cy"], best_i, gap_to_rect(rect, head["cx"], head["cy"]))
            )
        for head, best_i in assigned:
            head_on[best_i] = True
            rect = rects[best_i]
            tcx = (rect[0] + rect[2]) / 2
            tcy = (rect[1] + rect[3]) / 2
            exit_yx = shaft_exit(skel, head["sl"], head["cx"], head["cy"], tcx, tcy)
            if exit_yx is None:
                continue
            y, x = exit_yx
            exits = neighbors(skel, y, x)
            exits.sort(key=lambda p: (p[1] - tcx) ** 2 + (p[0] - tcy) ** 2, reverse=True)
            if not exits:
                continue
            found = follow_to_card(skel, meet, exits[0], (y, x), best_i + 1, head_pts)
            target = works[best_i]["id"]
            for hid, steps in found.items():
                source = works[hid - 1]["id"]
                key = (source, target, kind)
                if key not in detected or steps < detected[key]:
                    detected[key] = steps

    # A detection whose reverse is already shipped is the same stroke stored
    # the other way. A second tail into the same head is its own join.
    def unexplained(key):
        source, target, kind = key
        if key in shipped:
            return False
        if (target, source, kind) in shipped:
            return False
        return True

    missing = sorted(key for key in detected if unexplained(key))
    face_hits = {key for key in FACE if key in detected}
    # FACE is reported on its own. must_hits is only the extra pairs, and only
    # when the poster walk sees them and the shipped list contains them.
    must_hits = {key for key in (MUST - FACE) if key in detected and key in shipped}
    by_work = {w["id"]: [] for w in works}
    for source, target, kind in detected:
        by_work[source].append(f"out {kind} {target}")
        by_work[target].append(f"in {kind} {source}")

    lines = []
    for work, saw_head in zip(works, head_on):
        joins = sorted(by_work[work["id"]])
        if joins:
            reason = ""
        elif saw_head:
            reason = " head-meets-this-work but the stroke does not meet a second shipped work"
        else:
            reason = " no class-matching head meets this work"
        join_text = ", ".join(joins) if joins else "none"
        lines.append(f"work {work['id']} joins {join_text}{reason}")
    lines.append(f"detected-joins {len(detected)}")
    lines.append(f"missing-join count {len(missing)}")
    for key in missing:
        lines.append(f"missing {key[2]} {key[0]} -> {key[1]}")
    for key in sorted(FACE):
        flag = "SEEN" if key in face_hits else "MISSED"
        lines.append(f"face {flag} {key[2]} {key[0]} -> {key[1]}")
    for key in sorted(MUST - FACE):
        seen = key in detected
        shipped_ok = key in shipped
        flag = "SEEN" if seen and shipped_ok else "MISSED"
        lines.append(f"must {flag} {key[2]} {key[0]} -> {key[1]}")
    text = "\n".join(lines) + "\n"
    log = scratch / "edge-audit.log"
    log.write_text(text)
    print(text, end="")
    print(f"wrote {log}", flush=True)
    if missing or face_hits != FACE or must_hits != (MUST - FACE) or len(works) != 253:
        sys.exit(1)


if __name__ == "__main__":
    main()

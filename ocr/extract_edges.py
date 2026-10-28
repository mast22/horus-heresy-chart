#!/usr/bin/env python3
"""Trace primary, secondary, and tertiary arrows between detected nodes.

Reads ocr/out/nodes.json and sources/chart.png.
Writes ocr/out/edges.json and ocr/out/nodes-with-badges.json.
See README.md in this directory.
"""

import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage.morphology import (
    binary_closing,
    binary_dilation,
    binary_opening,
    disk,
    rectangle,
    remove_small_objects,
    skeletonize,
)

Image.MAX_IMAGE_PIXELS = None
HERE = Path(__file__).resolve().parent
ROOT = HERE / "out"
CHART = HERE.parent / "sources" / "chart.png"

# Inclusive crop of the chart body in source pixels.
X0, Y0, X1, Y1 = 60, 4140, 11940, 11920

CLASSES = {
    "primary": "red",
    "secondary": "blue",
    "tertiary": "green",
}


def color_mask(arr, kind):
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    if kind == "red":
        return (r > 155) & (r > g + 55) & (r > b + 55) & (g < 120) & (b < 120)
    if kind == "blue":
        return (b > 105) & (b > r + 40) & (b > g + 15) & (r < 110) & (g < 170)
    if kind == "green":
        return (g > 110) & (g > r + 35) & (g > b + 25) & (r < 130) & (b < 130)
    raise ValueError(kind)


def close_dashes(mask):
    horiz = binary_closing(mask, rectangle(1, 21))
    vert = binary_closing(mask, rectangle(21, 1))
    return binary_closing(horiz | vert, disk(2))


def angle_of(y0, x0, y1, x1):
    return math.degrees(math.atan2(y1 - y0, x1 - x0)) % 360


def angdiff(a, b):
    d = abs(a - b) % 360
    return min(d, 360 - d)


def component_centroids(mask, min_area, max_area):
    labeled, n = ndimage.label(mask)
    if n == 0:
        return []
    counts = np.bincount(labeled.ravel())
    objects = ndimage.find_objects(labeled)
    out = []
    for i, slc in enumerate(objects, start=1):
        area = int(counts[i])
        if area < min_area or area > max_area or slc is None:
            continue
        ys, xs = np.nonzero(labeled[slc] == i)
        cy = float(ys.mean() + slc[0].start)
        cx = float(xs.mean() + slc[1].start)
        out.append((cx, cy, area))
    return out


def build_skeleton_graph(skel, node_near):
    """Compress the skeleton. node_near is a label image, 0 = none, else node index+1."""
    h, w = skel.shape
    kernel = np.array([[1, 1, 1], [1, 0, 1], [1, 1, 1]], dtype=np.uint8)
    degree = ndimage.convolve(skel.astype(np.uint8), kernel, mode="constant")
    degree *= skel

    key = skel & (degree != 2)
    # Also promote pixels that sit on a node-port (label > 0) and are endpoints,
    # which degree != 2 already includes. Junctions inside a port stay keys.

    key_ys, key_xs = np.nonzero(key)
    index = {}
    for y, x in zip(key_ys.tolist(), key_xs.tolist()):
        index[(y, x)] = len(index)

    # Map every key pixel to a vertex. Endpoints adjacent to a node become ports.
    vertices = []
    for y, x in zip(key_ys.tolist(), key_xs.tolist()):
        label = int(node_near[y, x]) if 0 <= y < h and 0 <= x < w else 0
        vertices.append({"y": y, "x": x, "node": label - 1 if label else None, "deg": int(degree[y, x])})

    def neighbors(y, x):
        found = []
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and skel[yy, xx]:
                    found.append((yy, xx))
        return found

    adj = defaultdict(list)  # vertex -> list of edge ids
    edges = []
    seen = set()

    offsets = [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if not (dy == 0 and dx == 0)]

    for (y, x), vi in index.items():
        for ny, nx in neighbors(y, x):
            mark = (y, x, ny, nx)
            if mark in seen:
                continue
            # Walk the chain.
            path = [(y, x), (ny, nx)]
            seen.add(mark)
            py, px = y, x
            cy, cx = ny, nx
            guard = 0
            while (cy, cx) not in index:
                guard += 1
                if guard > 20000:
                    break
                nxt = None
                for dy, dx in offsets:
                    yy, xx = cy + dy, cx + dx
                    if (yy, xx) == (py, px):
                        continue
                    if 0 <= yy < h and 0 <= xx < w and skel[yy, xx]:
                        nxt = (yy, xx)
                        break
                if nxt is None:
                    break
                seen.add((cy, cx, nxt[0], nxt[1]))
                path.append(nxt)
                py, px = cy, cx
                cy, cx = nxt
            if (cy, cx) not in index:
                continue
            other = index[(cy, cx)]
            # Direction leaving each end, sampled a few pixels along the path.
            def leave_dir(seq):
                if len(seq) < 2:
                    return 0
                step = min(8, len(seq) - 1)
                return angle_of(seq[0][0], seq[0][1], seq[step][0], seq[step][1])

            eid = len(edges)
            edges.append(
                {
                    "a": vi,
                    "b": other,
                    "dir_a": leave_dir(path),
                    "dir_b": leave_dir(list(reversed(path))),
                    "len": len(path),
                }
            )
            adj[vi].append(eid)
            adj[other].append(eid)
    return vertices, edges, adj


def trace_class(arr, interior, dilated, nodes, kind, min_head=25, max_head=900, open_radius=4):
    raw = color_mask(arr, kind)
    outside = raw & ~interior
    closed = close_dashes(outside)
    closed = remove_small_objects(closed, 25)
    opened = binary_opening(closed, disk(open_radius))
    heads = component_centroids(opened, min_head, max_head)
    line = closed & ~dilated
    line = remove_small_objects(line, 12)
    skel = skeletonize(line)

    # Label image: skeleton pixels inherit the nearest dilated-node id when adjacent.
    # node_near is precomputed for dilated border pixels.
    return heads, skel, line


def nearest_node(nodes, x, y, limit):
    best = None
    best_d = limit * limit
    for i, node in enumerate(nodes):
        x0, y0, x1, y1 = node["box"]
        # Distance to the rectangle.
        dx = 0 if x0 <= x <= x1 else (x0 - x if x < x0 else x - x1)
        dy = 0 if y0 <= y <= y1 else (y0 - y if y < y0 else y - y1)
        d = dx * dx + dy * dy
        if d < best_d:
            best_d = d
            best = i
    if best is None:
        return None
    return best, math.sqrt(best_d)


def skeleton_neighbors(skel, y, x):
    h, w = skel.shape
    found = []
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and skel[yy, xx]:
                found.append((yy, xx))
    return found


def box_gap(node, x, y):
    x0, y0, x1, y1 = node["box"]
    dx = 0 if x0 <= x <= x1 else (x0 - x if x < x0 else x - x1)
    dy = 0 if y0 <= y <= y1 else (y0 - y if y < y0 else y - y1)
    return math.hypot(dx, dy)


def walk_to_source(skel, nodes, start, target_node, direction):
    """Follow the skeleton away from the arrow.

    Straight through a crossing. Stop only when the line actually meets another
    box, or when the line ends beside one. Passing near a box does not count.
    """
    y, x = start
    prev = None
    steps = 0
    seen = set()
    while steps < 12000:
        steps += 1
        key = (y, x)
        if key in seen:
            return None, steps
        seen.add(key)
        if steps > 8:
            best_i = None
            best_g = 7
            for i, node in enumerate(nodes):
                if i == target_node:
                    continue
                gap = box_gap(node, x, y)
                if gap < best_g:
                    best_g = gap
                    best_i = i
            if best_i is not None:
                return best_i, steps
        nbrs = [p for p in skeleton_neighbors(skel, y, x) if p != prev]
        if not nbrs:
            best_i = None
            best_g = 48
            for i, node in enumerate(nodes):
                if i == target_node:
                    continue
                gap = box_gap(node, x, y)
                if gap < best_g:
                    best_g = gap
                    best_i = i
            return best_i, steps
        if len(nbrs) == 1:
            nxt = nbrs[0]
            direction = angle_of(y, x, nxt[0], nxt[1])
        else:
            ranked = []
            for ny, nx in nbrs:
                ang = angle_of(y, x, ny, nx)
                ranked.append((angdiff(ang, direction), (ny, nx), ang))
            ranked.sort(key=lambda item: item[0])
            if ranked[0][0] <= 42:
                nxt = ranked[0][1]
                direction = ranked[0][2]
            else:
                # Ambiguous branch. Look ahead on each option for a node.
                best = None
                best_steps = 10**9
                for _, (ny, nx), ang in ranked:
                    yy, xx = ny, nx
                    py, px = y, x
                    found_at = None
                    for look in range(1, 700):
                        if look > 6:
                            for i, node in enumerate(nodes):
                                if i != target_node and box_gap(node, xx, yy) < 7:
                                    found_at = look
                                    break
                            if found_at is not None:
                                break
                        nxts = [p for p in skeleton_neighbors(skel, yy, xx) if p != (py, px)]
                        if not nxts:
                            break
                        # Stay on this branch: one step, prefer straight.
                        if len(nxts) == 1:
                            py, px = yy, xx
                            yy, xx = nxts[0]
                            continue
                        straight = min(
                            nxts,
                            key=lambda p: angdiff(angle_of(yy, xx, p[0], p[1]), ang),
                        )
                        py, px = yy, xx
                        yy, xx = straight
                        ang = angle_of(py, px, yy, xx)
                    if found_at is not None and found_at < best_steps:
                        best_steps = found_at
                        best = (ny, nx, ang)
                if best is None:
                    nxt = ranked[0][1]
                    direction = ranked[0][2]
                else:
                    nxt = (best[0], best[1])
                    direction = best[2]
        prev = (y, x)
        y, x = nxt
    return None, steps


def detect_badges(arr, interior):
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    sat = mx - mn
    # Saturated fill that is not a thin connector line.
    fill = (sat > 35) & (mx > 70) & ~interior
    # Knock out the three line colors so arrowheads are not badges.
    fill &= ~color_mask(arr, "red")
    fill &= ~color_mask(arr, "blue")
    fill &= ~color_mask(arr, "green")
    # Gold ribbons are not badges.
    gold = (r > 190) & (g > 110) & (g < 220) & (b < 100)
    fill &= ~gold
    labeled, n = ndimage.label(fill)
    counts = np.bincount(labeled.ravel())
    objects = ndimage.find_objects(labeled)
    badges = []
    for i, slc in enumerate(objects, start=1):
        if slc is None:
            continue
        area = int(counts[i])
        if area < 500 or area > 4500:
            continue
        ysl, xsl = slc
        bh = ysl.stop - ysl.start
        bw = xsl.stop - xsl.start
        if bh < 26 or bw < 26 or bh > 100 or bw > 100:
            continue
        aspect = bw / max(bh, 1)
        if aspect < 0.55 or aspect > 1.7:
            continue
        if area / float(bw * bh) < 0.45:
            continue
        cy = (ysl.start + ysl.stop) / 2
        cx = (xsl.start + xsl.stop) / 2
        crop = arr[ysl, xsl]
        med = np.median(crop.reshape(-1, 3), axis=0)
        badges.append(
            {
                "id": f"badge-{len(badges)+1}",
                "title": "Shortcut",
                "kind": "shortcut",
                "box": [int(xsl.start), int(ysl.start), int(xsl.stop), int(ysl.stop)],
                "fill": [int(med[0]), int(med[1]), int(med[2])],
                "ribbon": False,
                "publication": "",
                "book": None,
                "cx": float(cx),
                "cy": float(cy),
            }
        )
    return badges


def rects_mask(shape, nodes, pad=0):
    mask = np.zeros(shape, dtype=bool)
    h, w = shape
    for node in nodes:
        x0, y0, x1, y1 = node["box"]
        x0 = max(0, int(x0) - pad)
        y0 = max(0, int(y0) - pad)
        x1 = min(w, int(x1) + pad)
        y1 = min(h, int(y1) + pad)
        if x1 > x0 and y1 > y0:
            mask[y0:y1, x0:x1] = True
    return mask


def port_label(shape, nodes, reach):
    """Pixels within `reach` of a node get that node's index+1. Closer node wins."""
    label = np.zeros(shape, dtype=np.int32)
    dist = np.full(shape, 999, dtype=np.int16)
    h, w = shape
    for i, node in enumerate(nodes):
        x0, y0, x1, y1 = [int(v) for v in node["box"]]
        xa = max(0, x0 - reach)
        ya = max(0, y0 - reach)
        xb = min(w, x1 + reach)
        yb = min(h, y1 + reach)
        # Distance to the box edge inside the halo, 0 inside the box.
        yy = np.arange(ya, yb)[:, None]
        xx = np.arange(xa, xb)[None, :]
        dx = np.where(xx < x0, x0 - xx, np.where(xx > x1, xx - x1, 0))
        dy = np.where(yy < y0, y0 - yy, np.where(yy > y1, yy - y1, 0))
        d = np.maximum(dx, dy).astype(np.int16)
        sub_l = label[ya:yb, xa:xb]
        sub_d = dist[ya:yb, xa:xb]
        better = d < sub_d
        sub_d[better] = d[better]
        sub_l[better] = i + 1
        label[ya:yb, xa:xb] = sub_l
        dist[ya:yb, xa:xb] = sub_d
    return label


def main():
    print("load", flush=True)
    im = Image.open(CHART).convert("RGB")
    full = np.asarray(im)
    arr = full[Y0:Y1, X0:X1].copy()
    nodes = json.load(open(f"{ROOT}/nodes.json"))
    # Shift boxes into the crop.
    for node in nodes:
        x0, y0, x1, y1 = node["box"]
        node["box"] = [x0 - X0, y0 - Y0, x1 - X0, y1 - Y0]
        node["cx"] = (node["box"][0] + node["box"][2]) / 2
        node["cy"] = (node["box"][1] + node["box"][3]) / 2

    print("badges", flush=True)
    interior0 = rects_mask(arr.shape[:2], nodes, pad=0)
    badges = detect_badges(arr, interior0)
    print(" badge count", len(badges), flush=True)
    nodes.extend(badges)

    # Cut lines on work boxes. Leave shortcut badges undilated so a line that
    # only passes beside a badge is not severed.
    work_nodes = [node for node in nodes if node.get("kind") != "shortcut"]
    interior = rects_mask(arr.shape[:2], work_nodes, pad=0)
    badge_interior = rects_mask(arr.shape[:2], [node for node in nodes if node.get("kind") == "shortcut"], pad=0)
    interior = interior | badge_interior
    dilated = binary_dilation(rects_mask(arr.shape[:2], work_nodes, pad=0), disk(3)) | badge_interior

    found = []
    for cls, kind in (("primary", "red"), ("secondary", "blue"), ("tertiary", "green")):
        print("trace", cls, flush=True)
        radius = 4 if kind == "red" else 3
        heads, skel, line = trace_class(arr, interior, dilated, nodes, kind, open_radius=radius)
        print(f"  heads {len(heads)} skel {int(skel.sum())} line {int(line.sum())}", flush=True)
        # Attach node ids onto skeleton key pixels via the wide halo.
        # Build the graph with node_near masked to skeleton pixels that are
        # close (the halo) — vertices only become ports when their pixel is labeled.
        # Arrowheads sit on the node border. Ignore blobs out in the open,
        # which are crossings and corners rather than heads.
        matched = 0
        skel_ys, skel_xs = np.nonzero(skel)
        if len(skel_ys) == 0:
            print("  no skeleton", flush=True)
            continue
        # Quantize skeleton pixels into a dict of buckets for fast lookup.
        buckets = defaultdict(list)
        for y, x in zip(skel_ys.tolist(), skel_xs.tolist()):
            buckets[(x // 6, y // 6)].append((y, x))

        def nearest_skel(cx, cy, limit=18):
            best = None
            best_d = limit * limit
            gx, gy = int(cx) // 6, int(cy) // 6
            for oy in range(-4, 5):
                for ox in range(-4, 5):
                    for y, x in buckets.get((gx + ox, gy + oy), ()):
                        d = (x - cx) ** 2 + (y - cy) ** 2
                        if d < best_d:
                            best_d = d
                            best = (y, x)
            return best

        for cx, cy, area in heads:
            hit = nearest_node(nodes, cx, cy, 22)
            if not hit:
                continue
            target, gap = hit
            if gap > 22:
                continue
            start = nearest_skel(cx, cy, 16)
            if start is None:
                continue
            matched += 1
            node = nodes[target]
            direction = angle_of(node["cy"], node["cx"], cy, cx)
            source, dist = walk_to_source(skel, nodes, start, target, direction)
            if source is None or source == target:
                continue
            found.append(
                {
                    "source": nodes[source]["id"],
                    "target": nodes[target]["id"],
                    "cls": cls,
                    "sourceTitle": nodes[source]["title"],
                    "targetTitle": nodes[target]["title"],
                    "dist": dist,
                }
            )
        print(f"  matched heads {matched}", flush=True)
    # Dedup.
    uniq = {}
    for edge in found:
        key = (edge["source"], edge["target"], edge["cls"])
        if key not in uniq or edge["dist"] < uniq[key]["dist"]:
            uniq[key] = edge
    edges_out = list(uniq.values())
    print("edges", len(edges_out), flush=True)
    # Shift badge boxes back to page coordinates for saving.
    saved_nodes = []
    for node in nodes:
        copy = dict(node)
        x0, y0, x1, y1 = copy["box"]
        copy["box"] = [int(x0 + X0), int(y0 + Y0), int(x1 + X0), int(y1 + Y0)]
        saved_nodes.append(copy)
    ROOT.mkdir(parents=True, exist_ok=True)
    json.dump(saved_nodes, open(ROOT / "nodes-with-badges.json", "w"))
    json.dump(edges_out, open(ROOT / "edges.json", "w"), indent=2)

    # Region report for the anchor neighborhoods.
    def report(name, pred):
        print(f"\n== {name} ==")
        rows = [e for e in edges_out if pred(e)]
        for e in sorted(rows, key=lambda e: (e["cls"], e["sourceTitle"], e["targetTitle"])):
            print(f"  {e['cls']:10} {e['sourceTitle']}  ->  {e['targetTitle']}")

    report(
        "schism/prospero/webway anchors",
        lambda e: any(
            k in (e["sourceTitle"] + " " + e["targetTitle"]).lower()
            for k in (
                "kaban",
                "mechanicum",
                "nikaea",
                "thousand",
                "prospero",
                "rebirth",
                "mankin",
                "ordo",
                "bringer",
                "magisterium",
                "crimson",
                "last church",
                "horus rising",
                "false gods",
                "galaxy",
            )
        ),
    )


if __name__ == "__main__":
    main()

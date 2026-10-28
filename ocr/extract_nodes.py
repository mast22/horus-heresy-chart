#!/usr/bin/env python3
"""Cluster OCR hits into work nodes.

Reads ocr/out/ocr.json and sources/chart.png. Writes ocr/out/nodes.json.
See README.md in this directory.
"""

import json
import re
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

HERE = Path(__file__).resolve().parent
ROOT = HERE / "out"
CHART = HERE.parent / "sources" / "chart.png"

PUB_RE = re.compile(
    r"(?:→|->|>|›|»|•|\*|–|-)?\s*"
    r"(terra\s+book\s*\d+|book\s*\d+|e-?book|audio|novella|antholog\w*|"
    r"primarchs?(?:\s+e-?book|\s+audio|\s+book)?|characters?\s+series(?:\s+book)?|"
    r"graphic\s+novel)",
    re.I,
)
BOOK_NUM_RE = re.compile(r"book\s*(\d+)", re.I)
ARROW_PUB_RE = re.compile(r"(?:→|->|>|›|»)\s*(?:book|antholog)", re.I)

SHORTCUTS = {
    "F": ("Fulgrim", "fulgrim"),
    "AE": ("Angel Exterminatus", "angel-exterminatus"),
    "FT": ("Fear to Tread", "fear-to-tread"),
    "SC": ("Scars", "scars"),
    "OE": ("Old Earth", "old-earth"),
    "W": ("Wolfsbane", "wolfsbane"),
    "R": ("Ruinstorm", "ruinstorm"),
}

# Chart body, below the era bar and above the footer trademark block.
BODY_TOP = 4140
BODY_BOTTOM = 11940


def dedupe(hits):
    kept = []
    for hit in sorted(hits, key=lambda h: -h["conf"]):
        if hit["conf"] < 0.45:
            continue
        if hit["y"] < 4200 or hit["y"] > BODY_BOTTOM:
            continue
        cx = hit["x"] + hit["w"] / 2
        cy = hit["y"] + hit["h"] / 2
        text = hit["text"].strip()
        if len(text) < 1:
            continue
        drop = False
        for other in kept:
            ox = other["x"] + other["w"] / 2
            oy = other["y"] + other["h"] / 2
            if abs(cx - ox) < 28 and abs(cy - oy) < 16:
                # Same spot. Keep the longer, higher-confidence string.
                if len(text) <= len(other["text"].strip()) + 1:
                    drop = True
                    break
                kept.remove(other)
                break
        if not drop:
            kept.append(hit)
    return kept


class UF:
    def __init__(self, n):
        self.p = list(range(n))

    def find(self, i):
        while self.p[i] != i:
            self.p[i] = self.p[self.p[i]]
            i = self.p[i]
        return i

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[rb] = ra


def overlaps_x(a, b, frac):
    ax2 = a["x"] + a["w"]
    bx2 = b["x"] + b["w"]
    overlap = min(ax2, bx2) - max(a["x"], b["x"])
    if overlap <= 0:
        return False
    return overlap >= frac * min(a["w"], b["w"])


def cluster(hits):
    hits = sorted(hits, key=lambda h: (h["y"], h["x"]))
    uf = UF(len(hits))
    for i, a in enumerate(hits):
        ay2 = a["y"] + a["h"]
        for j in range(i + 1, len(hits)):
            b = hits[j]
            if b["y"] - ay2 > 26:
                # Later hits are lower on the page, but not all between are close.
                # Still have to scan until y is far from this hit's bottom.
                if b["y"] - a["y"] > 140:
                    break
                continue
            vgap = b["y"] - ay2
            if vgap > 24:
                continue
            if overlaps_x(a, b, 0.28):
                uf.union(i, j)
                continue
            acx = a["x"] + a["w"] / 2
            bcx = b["x"] + b["w"] / 2
            if vgap < 16 and abs(acx - bcx) < 36:
                uf.union(i, j)
    groups = defaultdict(list)
    for i, hit in enumerate(hits):
        groups[uf.find(i)].append(hit)
    return list(groups.values())


def group_text(group):
    lines = sorted(group, key=lambda h: (h["y"], h["x"]))
    # Merge fragments on the same baseline.
    rows = []
    for hit in lines:
        if rows and abs(hit["y"] - rows[-1][0]["y"]) < 12 and hit["x"] < rows[-1][-1]["x"] + rows[-1][-1]["w"] + 30:
            rows[-1].append(hit)
        else:
            rows.append([hit])
    texts = []
    for row in rows:
        row = sorted(row, key=lambda h: h["x"])
        texts.append(" ".join(h["text"].strip() for h in row))
    return texts


def bbox(group):
    x0 = min(h["x"] for h in group)
    y0 = min(h["y"] for h in group)
    x1 = max(h["x"] + h["w"] for h in group)
    y1 = max(h["y"] + h["h"] for h in group)
    return [x0, y0, x1, y1]


def find_border(arr, text_box, pad_limit=110):
    h, w, _ = arr.shape
    x0, y0, x1, y1 = [int(v) for v in text_box]
    x0 = max(0, x0)
    y0 = max(0, y0)
    x1 = min(w - 1, x1)
    y1 = min(h - 1, y1)

    def is_black_row(y, xa, xb):
        xa = max(0, int(xa))
        xb = min(w, int(xb))
        if y < 0 or y >= h or xb - xa < 8:
            return False
        row = arr[y, xa:xb]
        black = (row[:, 0] < 45) & (row[:, 1] < 45) & (row[:, 2] < 45)
        return black.mean() > 0.55

    def is_black_col(x, ya, yb):
        ya = max(0, int(ya))
        yb = min(h, int(yb))
        if x < 0 or x >= w or yb - ya < 8:
            return False
        col = arr[ya:yb, x]
        black = (col[:, 0] < 45) & (col[:, 1] < 45) & (col[:, 2] < 45)
        return black.mean() > 0.55

    # Search a little wider than the text so a short publication line still
    # finds the full rule of the box.
    span_x0 = x0 - 8
    span_x1 = x1 + 8
    top = y0
    for dy in range(2, pad_limit):
        y = y0 - dy
        if is_black_row(y, span_x0, span_x1):
            top = y
            break
    bottom = y1
    for dy in range(2, pad_limit):
        y = y1 + dy
        if is_black_row(y, span_x0, span_x1):
            bottom = y
            break
    span_y0 = top + 2
    span_y1 = bottom - 2
    left = x0
    for dx in range(2, pad_limit):
        x = x0 - dx
        if is_black_col(x, span_y0, span_y1):
            left = x
            break
    right = x1
    for dx in range(2, pad_limit):
        x = x1 + dx
        if is_black_col(x, span_y0, span_y1):
            right = x
            break
    # Second pass with the discovered width, in case the text was narrower
    # than the rule and the first horizontal search missed the real border.
    if right - left > (x1 - x0) + 8:
        top2 = top
        for dy in range(2, pad_limit):
            y = y0 - dy
            if is_black_row(y, left + 4, right - 4):
                top2 = y
                break
        bottom2 = bottom
        for dy in range(2, pad_limit):
            y = y1 + dy
            if is_black_row(y, left + 4, right - 4):
                bottom2 = y
                break
        top, bottom = top2, bottom2
    return [int(left), int(top), int(right), int(bottom)]


def has_ribbon(arr, border):
    x0, y0, x1, y1 = border
    h, w, _ = arr.shape
    ya = min(h - 1, y1 + 2)
    yb = min(h, y1 + 52)
    xa = max(0, x0 - 8)
    xb = min(w, x1 + 8)
    if yb <= ya:
        return False
    crop = arr[ya:yb, xa:xb]
    r = crop[:, :, 0].astype(np.int16)
    g = crop[:, :, 1].astype(np.int16)
    b = crop[:, :, 2].astype(np.int16)
    gold = (r > 190) & (g > 110) & (g < 220) & (b < 100) & (r > g)
    return int(gold.sum()) > 70


def fill_color(arr, border):
    x0, y0, x1, y1 = border
    xa = x0 + 6
    xb = x1 - 6
    ya = y0 + 6
    yb = y1 - 6
    if xb - xa < 6 or yb - ya < 6:
        return None
    crop = arr[ya:yb, xa:xb]
    r = crop[:, :, 0].astype(np.int16)
    g = crop[:, :, 1].astype(np.int16)
    b = crop[:, :, 2].astype(np.int16)
    black = (r < 50) & (g < 50) & (b < 50)
    white = (r > 235) & (g > 235) & (b > 235)
    keep = ~black & ~white
    if keep.sum() < 15:
        # White or near-white box.
        return [248, 246, 240]
    cols = crop[keep]
    med = np.median(cols, axis=0)
    return [int(med[0]), int(med[1]), int(med[2])]


def classify(texts):
    joined = " | ".join(texts)
    pubs = []
    for text in texts:
        match = PUB_RE.search(text)
        if match:
            pubs.append(match.group(0).strip())
    if not pubs:
        # A bare "Book" line merged with a nearby number already handled.
        return None
    publication = pubs[-1]
    # Title is every line that is not the publication line.
    title_lines = []
    for text in texts:
        if PUB_RE.search(text) and len(PUB_RE.sub("", text).strip(" -–→>•*|")) < 3:
            continue
        cleaned = PUB_RE.sub("", text).strip(" -–→>•*|")
        # Drop a line that is only the publication.
        if PUB_RE.fullmatch(text.strip()) or re.fullmatch(r"[\W_]*(?:book\s*\d+|e-?book|audio|novella)\s*", text.strip(), re.I):
            continue
        if cleaned:
            title_lines.append(cleaned)
        elif not PUB_RE.search(text):
            title_lines.append(text.strip())
    title = " ".join(title_lines).strip()
    title = re.sub(r"\s+", " ", title)
    if len(title) < 2:
        return None
    book = None
    num = BOOK_NUM_RE.search(publication)
    if num:
        book = int(num.group(1))
    pub_norm = publication.lower()
    if ARROW_PUB_RE.search(publication) or "→" in publication or publication.strip().startswith(">"):
        kind = "shortStory"
    elif "antholog" in pub_norm and book is None:
        kind = "anthology"
    elif "e-book" in pub_norm or "ebook" in pub_norm:
        kind = "ebook"
    elif "audio" in pub_norm:
        kind = "audio"
    elif "novella" in pub_norm:
        kind = "novella"
    elif "primarch" in pub_norm:
        kind = "primarchs"
    elif "character" in pub_norm:
        kind = "characters"
    elif "graphic" in pub_norm:
        kind = "graphicNovel"
    elif "terra book" in pub_norm:
        kind = "novel"
    elif book is not None:
        kind = "novel"
    else:
        kind = "other"
    # Anthology volumes are numbered books that also say anthology.
    if "antholog" in joined.lower() and kind == "novel":
        kind = "anthology"
    return {
        "title": title,
        "publication": re.sub(r"\s+", " ", publication),
        "book": book,
        "kind": kind,
    }


def slug(text):
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:48] or "work"


def main():
    hits = json.load(open(f"{ROOT}/ocr.json"))
    hits = dedupe(hits)
    print("deduped hits", len(hits))
    groups = cluster(hits)
    print("clusters", len(groups))
    im = Image.open(CHART).convert("RGB")
    arr = np.asarray(im)
    nodes = []
    skipped = 0
    for group in groups:
        texts = group_text(group)
        info = classify(texts)
        if not info:
            skipped += 1
            continue
        text_box = bbox(group)
        border = find_border(arr, text_box)
        # Reject runaway borders (zone frames).
        bw = border[2] - border[0]
        bh = border[3] - border[1]
        if bw > 700 or bh > 280 or bw < 36 or bh < 28:
            skipped += 1
            continue
        info.update(
            {
                "textBox": [round(v, 1) for v in text_box],
                "box": border,
                "ribbon": bool(has_ribbon(arr, border)),
                "fill": fill_color(arr, border),
                "lines": texts,
            }
        )
        nodes.append(info)
    print("works", len(nodes), "skipped clusters", skipped)
    # Stable ids. Duplicate titles get a position suffix.
    used = defaultdict(int)
    for node in sorted(nodes, key=lambda n: (n["box"][1], n["box"][0])):
        base = slug(node["title"])
        used[base] += 1
        node["id"] = base if used[base] == 1 else f"{base}-{used[base]}"
        node["cx"] = (node["box"][0] + node["box"][2]) / 2
        node["cy"] = (node["box"][1] + node["box"][3]) / 2
    ROOT.mkdir(parents=True, exist_ok=True)
    json.dump(nodes, open(ROOT / "nodes.json", "w"), indent=2)
    print("\nSAMPLE")
    for node in nodes[:40]:
        print(
            f"{node['id']:32} {node['kind']:12} {str(node['publication']):18} "
            f"ribbon={node['ribbon']} box={node['box']} | {node['title']}"
        )
    # Anchor presence
    print("\nANCHORS")
    for needle in [
        "kaban",
        "mechanicum",
        "nikaea",
        "thousand",
        "prospero burns",
        "rebirth",
        "master of mankind",
        "ordo sinister",
        "bringer",
        "magisterium",
        "crimson king",
        "last church",
    ]:
        found = [n for n in nodes if needle in n["title"].lower() or needle in n["id"]]
        print(needle, len(found), [(n["title"], n["publication"], n["book"], n["ribbon"]) for n in found])


if __name__ == "__main__":
    main()

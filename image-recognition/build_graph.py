#!/usr/bin/env python3
"""Transcribe OCR hits and traced arrows into ocr/out/chart.ts.

The page reads src/flow/chart.ts. This script writes a draft beside the other
OCR products. Each work's color is the top-to-bottom band list from
bands.measure_bands. Copying that draft over the page file drops the hand
edits listed in README.md.
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bands import measure_bands

HERE = Path(__file__).resolve().parent
ROOT = HERE / "out"
CHART = HERE.parent / "sources" / "chart.png"
OUT = ROOT / "chart.ts"

ERA_SPLIT = 9220

ZONES = [
    ("Schism of Mars", 975, 4840),
    ("Prospero's Sack", 2262, 5694),
    ("Thramas Crusade", 3701, 9077),
    ("Shadow Crusade", 4780, 11010),
    ("Imperium Secundus", 6806, 9324),
    ("Isstvan III Betrayal", 774, 8163),
    ("Isstvan V Dropsite Massacre", 1835, 7654),
    ("Battle of the Phall System", 1958, 10035),
    ("Battle of the Alaxxes Nebula", 3305, 6556),
    ("Molech's Doom", 5359, 6216),
    ("Battle of Tallarn", 4927, 7503),
    ("Caliban's Rebellion", 5480, 8780),
    ("War Within the Webway", 6182, 4790),
    ("Beta-Garmon's Great Slaughter", 7324, 8284),
]

# Measured from the poster when the border scan is ambiguous.
FALLBACK = {
    "Schism of Mars": (877, 4531, 2772, 5038),
    "War Within the Webway": (6164, 4397, 7472, 4986),
    "Prospero's Sack": (1200, 5200, 3400, 6300),
    "Molech's Doom": (4900, 6000, 6200, 6900),
    "Battle of the Alaxxes Nebula": (3100, 6300, 4500, 7000),
    "Battle of Tallarn": (4700, 7300, 6400, 8100),
    "Battle of the Phall System": (1700, 9700, 3400, 10400),
    "Isstvan III Betrayal": (500, 7900, 1750, 8700),
    "Isstvan V Dropsite Massacre": (1600, 7400, 2900, 8300),
    "Beta-Garmon's Great Slaughter": (6800, 8000, 9200, 9100),
    "Caliban's Rebellion": (5000, 8500, 7400, 9800),
    "Thramas Crusade": (3300, 8800, 5300, 9800),
    "Imperium Secundus": (6000, 9000, 8400, 10300),
    "Shadow Crusade": (4000, 10400, 6400, 11600),
}

SHORTCUT_NOVELS = {
    "F": "fulgrim-rim",
    "FT": "fear-to-tread",
    "SC": "scars",
    "AE": "angel-exterminatus",
    "OE": "old-earth",
    "W": "wolfsbane",
    "R": "ruinstorm",
}


def ts_str(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def runs(mask: np.ndarray, min_len: int) -> list[tuple[int, int]]:
    if mask.size == 0:
        return []
    padded = np.concatenate([[False], mask, [False]])
    diff = np.diff(padded.astype(np.int8))
    starts = np.flatnonzero(diff == 1)
    ends = np.flatnonzero(diff == -1)
    return [(int(s), int(e)) for s, e in zip(starts, ends) if e - s >= min_len]


def choose_publication(orig: str, re_lines: list[str]) -> str:
    pub_lines = [text for text in re_lines if is_pub_line(text)]
    re_pub = " ".join(pub_lines)
    combined = f"{orig} {re_pub}"
    terra = re.search(r"terra\s+book\s+(\d+)", combined, re.I)
    if terra:
        return f"Terra Book {terra.group(1)}"
    book_m = re.search(r"book\s+(\d+)", combined, re.I)
    book = book_m.group(1) if book_m else None
    low = combined.lower()
    if "characters series" in low:
        return f"Characters Series Book {book}" if book else "Characters Series"
    if "primarch" in low and "audio" in low:
        return "Primarchs Audio"
    if "primarch" in low and ("ebook" in low or "e-book" in low):
        return "Primarchs eBook"
    if "primarch" in low:
        return f"Primarchs Book {book}" if book else "Primarchs"
    if "graphic" in low:
        return "Graphic Novel"
    if "novella" in low:
        return "Novella"
    if "audio" in low:
        return "Audio"
    if "ebook" in low or "e-book" in low:
        return "eBook"
    if book:
        # Arrows live on the publication line. A decorative bullet elsewhere is not one.
        arrow = bool(re.search(r"[→›>►\*•]", orig)) or bool(
            re.search(r"(^|\s)[→›>►\*•\-]\s*book", re_pub, re.I)
        )
        if arrow:
            return f"→ Book {book}"
        return f"Book {book}"
    return orig.strip() or re_pub.strip() or "Unknown"


def kind_of(publication: str, orig_kind: str) -> str:
    low = publication.lower()
    if publication.startswith("→"):
        return "shortStory"
    if "ebook" in low:
        return "ebook"
    if "audio" in low:
        return "audio"
    if "novella" in low:
        return "novella"
    if "graphic" in low:
        return "graphicNovel"
    if "characters" in low:
        return "characters"
    if "primarch" in low:
        return "primarchs"
    if orig_kind == "anthology" and (low.startswith("book") or low.startswith("terra")):
        return "anthology"
    if low.startswith("book") or low.startswith("terra book"):
        return "novel"
    if orig_kind in {
        "novel",
        "shortStory",
        "ebook",
        "audio",
        "novella",
        "anthology",
        "graphicNovel",
        "characters",
        "primarchs",
    }:
        return orig_kind
    return "shortStory"


def is_pub_line(text: str) -> bool:
    return bool(
        re.search(
            r"book\s*\d+|ebook|e-book|audio|novella|primarch|character|graphic|antholog",
            text,
            re.I,
        )
    )


def clean_title(re_lines: list[str], orig: str) -> str:
    parts: list[str] = []
    for raw in re_lines:
        text = raw.strip()
        if not text or is_pub_line(text):
            continue
        if re.fullmatch(r"[\W\d_]+", text):
            continue
        if len(text) <= 1:
            continue
        parts.append(text)
    title = " ".join(parts)
    title = title.replace("]", "").replace("[", "").replace("|", " ")
    title = re.sub(r"\s+", " ", title).strip(" -")
    if len(title) < 3:
        title = re.sub(r"\s+", " ", orig).strip()
    return title


def hex_color(fill: list[int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*[int(c) for c in fill])


def color_bands(fills: list | None, fill: list[int] | None) -> list[str]:
    """Top-to-bottom hexes. `fills` is the band list; `fill` is the legacy median."""
    source = fills if fills else ([fill] if fill else [[248, 246, 240]])
    return [hex_color(item) for item in source]


def ts_color(colors: list[str]) -> str:
    return "[" + ", ".join(ts_str(color) for color in colors) + "]"


def faction_key(fill: list[int]) -> str:
    snapped = [min(255, int(round(int(c) / 32.0) * 32)) for c in fill]
    return "#{:02x}{:02x}{:02x}".format(*snapped)


def text_color(fill: list[int]) -> str:
    r, g, b = [int(c) for c in fill]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    return "#1c1917" if lum > 155 else "#f6f1e6"


def collect_hlines(black: np.ndarray) -> list[tuple[int, int, int]]:
    found: list[tuple[int, int, int]] = []
    height = black.shape[0]
    for y in range(4200, min(height - 1, 11900), 4):
        for x0, x1 in runs(black[y], 300):
            found.append((y, x0, x1))
    return found


def detect_rect(hlines: list[tuple[int, int, int]], label: str, lx: int, ly: int) -> tuple[int, int, int, int] | None:
    above = [
        (y, x0, x1)
        for y, x0, x1 in hlines
        if ly - 520 <= y <= ly - 8 and x0 <= lx + 40 and x1 >= lx + 120
    ]
    if not above:
        return None
    top_y, top_x0, top_x1 = max(above, key=lambda item: item[0])
    below = []
    for y, x0, x1 in hlines:
        if y < top_y + 220 or y > top_y + 2400:
            continue
        if abs(x0 - top_x0) > 90 or abs(x1 - top_x1) > 140:
            continue
        if x1 - x0 < 280:
            continue
        below.append((y, x0, x1))
    if not below:
        return None
    # Prefer the nearest aligned bottom. Internal rules are shorter or misaligned.
    bot_y, bot_x0, bot_x1 = min(below, key=lambda item: (item[0], abs(item[1] - top_x0)))
    x0 = min(top_x0, bot_x0)
    x1 = max(top_x1, bot_x1)
    if x1 - x0 < 400 or x1 - x0 > 3600 or bot_y - top_y < 220:
        return None
    if not (x0 - 30 <= lx <= x1 + 30 and top_y - 20 <= ly <= bot_y + 20):
        return None
    return (x0, top_y, x1, bot_y)


def ink_bbox(crop: np.ndarray) -> tuple[int, int, int, int] | None:
    if crop.size == 0:
        return None
    r = crop[:, :, 0].astype(np.int16)
    g = crop[:, :, 1].astype(np.int16)
    b = crop[:, :, 2].astype(np.int16)
    white = (r > 236) & (g > 236) & (b > 236)
    gold = (r > 190) & (g > 110) & (g < 220) & (b < 90) & (r > g)
    ink = ~white & ~gold
    # Ignore a 1px fringe of connector stubs at the window edge by requiring a block.
    ys, xs = np.nonzero(ink)
    if len(xs) < 80:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def find_stub(arr: np.ndarray, box: list[int], side: str) -> list[int] | None:
    x0, y0, x1, y1 = box
    cx = (x0 + x1) // 2
    wx0 = max(0, cx - 78)
    wx1 = min(arr.shape[1], cx + 78)
    if side == "above":
        wy1 = max(0, y0 - 8)
        wy0 = max(0, y0 - 170)
    else:
        wy0 = min(arr.shape[0], y1 + 78)
        wy1 = min(arr.shape[0], y1 + 230)
    if wy1 - wy0 < 20:
        return None
    crop = arr[wy0:wy1, wx0:wx1]
    bbox = ink_bbox(crop)
    if bbox is None:
        return None
    bx0, by0, bx1, by1 = bbox
    bw, bh = bx1 - bx0, by1 - by0
    if bw < 24 or bh < 20 or bw > 120 or bh > 90:
        return None
    if bw / max(bh, 1) > 2.4:
        return None
    return [wx0 + bx0, wy0 + by0, wx0 + bx1, wy0 + by1]


def main() -> None:
    Image.MAX_IMAGE_PIXELS = None
    nodes = json.load(open(f"{ROOT}/nodes.json"))
    edges = json.load(open(f"{ROOT}/edges.json"))
    reocr = {item["id"]: item for item in json.load(open(f"{ROOT}/reocr.json"))}
    badges = [n for n in json.load(open(f"{ROOT}/nodes-with-badges.json")) if n.get("kind") == "shortcut"]

    works = []
    by_id = {}
    for node in nodes:
        lines = sorted(reocr[node["id"]]["lines"], key=lambda line: line["y"])
        texts = [line["text"] for line in lines if line["conf"] >= 0.4]
        title = clean_title(texts, node["title"])
        publication = choose_publication(node.get("publication") or "", texts)
        kind = kind_of(publication, node["kind"])
        x0, y0, x1, y1 = node["box"]
        cx = (x0 + x1) / 2
        era = "siege-of-terra" if cx >= ERA_SPLIT or publication.lower().startswith("terra book") else "horus-heresy"
        fill = node["fill"]
        record = {
            "id": node["id"],
            "title": title,
            "publication": publication,
            "kind": kind,
            "faction": faction_key(fill),
            "color": color_bands(node.get("fills"), fill),
            "text": text_color(fill),
            "ribbon": bool(node["ribbon"]),
            "era": era,
            "zone": None,
            "x": int(x0),
            "y": int(y0),
            "w": int(x1 - x0),
            "h": int(y1 - y0),
            "letters": None,
            "standsFor": None,
        }
        works.append(record)
        by_id[record["id"]] = record

    print("works", len(works))
    print("kind counts", {k: sum(1 for w in works if w["kind"] == k) for k in sorted({w["kind"] for w in works})})

    # Shortcut badges. Pink F and dark-red FT come from the tracer.
    # Corners of ordinary boxes (badge 20 and 21) are not badges.
    kept_badges = []
    badges_without_fills = []
    for badge in badges:
        if badge["id"] in {"badge-20", "badge-21"}:
            print("drop false badge", badge["id"], badge["box"])
            continue
        fill = badge["fill"]
        r, g, b = fill
        if r > 210 and 120 <= g <= 190 and b > 170:
            letters = "F"
        elif r > 120 and g < 50 and b < 40:
            letters = "FT"
        else:
            print("unclassified badge", badge["id"], fill, badge["box"])
            continue
        x0, y0, x1, y1 = badge["box"]
        novel_id = SHORTCUT_NOVELS[letters]
        novel = by_id[novel_id]
        record = {
            "id": badge["id"],
            "title": novel["title"],
            "publication": letters,
            "kind": "shortcut",
            "faction": novel["faction"],
            "color": color_bands(badge.get("fills"), fill),
            "text": "#1c1917" if letters == "F" else "#f6f1e6",
            "ribbon": False,
            "era": novel["era"],
            "zone": None,
            "x": int(x0),
            "y": int(y0),
            "w": int(x1 - x0),
            "h": int(y1 - y0),
            "letters": letters,
            "standsFor": novel_id,
        }
        kept_badges.append(record)
        by_id[record["id"]] = record
        if not badge.get("fills"):
            badges_without_fills.append(record)
    print("kept tracer badges", len(kept_badges), {b["letters"] for b in kept_badges})

    print("loading chart for stubs and zone borders...")
    arr = np.asarray(Image.open(CHART))
    black = (arr[:, :, 0] < 40) & (arr[:, :, 1] < 40) & (arr[:, :, 2] < 40)
    # Boxes measured on the poster, page pixels. SC sits under Scars; the others hang off their novels.
    measured_stubs = {
        "SC": ("scars", [3048, 6071, 3109, 6121]),
        "R": ("ruinstorm", [7032, 8643, 7093, 8701]),
        "OE": ("old-earth", [8421, 10012, 8482, 10079]),
        "W": ("wolfsbane", [6293, 6464, 6354, 6527]),
        "AE": ("angel-exterminatus", [3048, 7889, 3109, 7970]),
    }
    extra = []
    for letters, (novel_id, found) in measured_stubs.items():
        novel = by_id[novel_id]
        print(f"stub {letters} {novel_id} -> {found}")
        x0, y0, x1, y1 = found
        measured = measure_bands(arr, int(x0), int(y0), int(x1 - x0), int(y1 - y0))
        colors = [hex_color(color) for color in measured] or list(novel["color"])
        record = {
            "id": f"shortcut-{letters.lower()}",
            "title": novel["title"],
            "publication": letters,
            "kind": "shortcut",
            "faction": novel["faction"],
            "color": colors,
            "text": novel["text"],
            "ribbon": False,
            "era": novel["era"],
            "zone": None,
            "x": int(x0),
            "y": int(y0),
            "w": max(36, int(x1 - x0)),
            "h": max(28, int(y1 - y0)),
            "letters": letters,
            "standsFor": novel_id,
        }
        extra.append(record)
        by_id[record["id"]] = record

    for record in badges_without_fills:
        # Older tracer JSON has only the median. Measure that badge box with the same function.
        measured = measure_bands(arr, record["x"], record["y"], record["w"], record["h"])
        colors = [hex_color(color) for color in measured]
        if colors:
            record["color"] = colors

    works.extend(kept_badges)
    works.extend(extra)
    print(
        "color bands",
        {n: sum(1 for work in works if len(work["color"]) == n) for n in sorted({len(work["color"]) for work in works})},
    )

    print("scanning zone borders...")
    hlines = collect_hlines(black)
    print("hlines", len(hlines))
    zones = []
    for label, lx, ly in ZONES:
        detected = detect_rect(hlines, label, lx, ly)
        fallback = FALLBACK[label]
        use = detected
        source = "detected"
        if detected is None:
            use = fallback
            source = "fallback"
        else:
            # Reject a detection that swallows several storylines.
            if detected[2] - detected[0] > 2800 or detected[3] - detected[1] > 1800:
                print(" reject huge", label, detected)
                use = fallback
                source = "fallback-huge"
        # Known-good measurements win for the two spot-checked regions.
        if label in {"Schism of Mars", "War Within the Webway"}:
            use = FALLBACK[label]
            source = "measured"
        x0, y0, x1, y1 = use
        zones.append(
            {
                "id": "zone-" + re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-"),
                "label": label,
                "x": int(x0),
                "y": int(y0),
                "w": int(x1 - x0),
                "h": int(y1 - y0),
                "source": source,
            }
        )
        print(f"ZONE {source:16} {label:32} {use}")

    for work in works:
        cx = work["x"] + work["w"] / 2
        cy = work["y"] + work["h"] / 2
        containing = []
        for zone in zones:
            if zone["x"] <= cx <= zone["x"] + zone["w"] and zone["y"] <= cy <= zone["y"] + zone["h"]:
                containing.append(zone)
        if not containing:
            continue
        best = min(containing, key=lambda zone: zone["w"] * zone["h"])
        work["zone"] = best["label"]

    for zone in zones:
        members = [w["title"] for w in works if w["zone"] == zone["label"] and w["kind"] != "shortcut"]
        print(f"  members {zone['label']}: {len(members)}")

    # Edges
    drop_ids = {"badge-20", "badge-21"}
    cleaned = []
    seen = set()
    for edge in edges:
        if edge["source"] in drop_ids or edge["target"] in drop_ids:
            print("drop edge on false badge", edge["source"], edge["target"])
            continue
        if edge["source"] not in by_id or edge["target"] not in by_id:
            print("drop dangling", edge["source"], edge["target"])
            continue
        src = by_id[edge["source"]]
        dst = by_id[edge["target"]]
        sy = src["y"] + src["h"] / 2
        dy = dst["y"] + dst["h"] / 2
        if edge["dist"] > 3200 and abs(sy - dy) > 180:
            print(f"drop long jump {edge['dist']} {edge['cls']} {edge['source']} -> {edge['target']}")
            continue
        key = (edge["source"], edge["target"], edge["cls"])
        if key in seen:
            continue
        seen.add(key)
        cleaned.append({"source": edge["source"], "target": edge["target"], "connection": edge["cls"]})

    def ensure(source: str, target: str, connection: str, add: bool) -> None:
        key = (source, target, connection)
        if add:
            if key not in seen and source in by_id and target in by_id:
                cleaned.append({"source": source, "target": target, "connection": connection})
                seen.add(key)
                print("add", connection, source, "->", target)
            else:
                print("already", connection, source, "->", target)
        else:
            before = len(cleaned)
            cleaned[:] = [e for e in cleaned if (e["source"], e["target"], e["connection"]) != key]
            seen.discard(key)
            print("remove" if len(cleaned) != before else "absent", connection, source, "->", target)

    ensure("bringer-of-sorrow", "magisterium", "primary", False)
    ensure("the-maste-f-mankin", "magisterium", "primary", True)
    ensure("prospero-ero-burns", "rebirth", "primary", True)
    ensure("mechanicum", "the-last-church", "tertiary", True)

    chart_edges = []
    for index, edge in enumerate(cleaned, start=1):
        chart_edges.append(
            {
                "id": f"{edge['connection'][:1]}{index}-{edge['source']}-{edge['target']}",
                "source": edge["source"],
                "target": edge["target"],
                "connection": edge["connection"],
            }
        )

    # Anchor report
    def has(a, b, c):
        return any(e["source"] == a and e["target"] == b and e["connection"] == c for e in chart_edges)

    print("ANCHOR kaban", has("the-kaban-project", "mechanicum", "primary"))
    print("ANCHOR nikaea", has("prologue-to-nikaea", "a-thousand-sons", "secondary"))
    print("ANCHOR sons", has("a-thousand-sons", "prospero-ero-burns", "primary"), by_id["a-thousand-sons"]["ribbon"], by_id["a-thousand-sons"]["title"])
    print("ANCHOR rebirth", has("prospero-ero-burns", "rebirth", "primary"), by_id["rebirth"]["publication"])
    mom = by_id["the-maste-f-mankin"]
    print("ANCHOR mom", mom["title"], mom["publication"], mom["ribbon"], mom["zone"], has("the-maste-f-mankin", "ordo-sinister", "secondary"), has("the-maste-f-mankin", "bringer-of-sorrow", "primary"), has("the-maste-f-mankin", "magisterium", "primary"))
    print("ANCHOR king", by_id["the-cr-the-crimson-king"]["title"], by_id["the-cr-the-crimson-king"]["ribbon"], by_id["the-cr-the-crimson-king"]["publication"])
    print("ANCHOR church", by_id["the-last-church"]["title"], by_id["the-last-church"]["publication"])
    print("edges", len(chart_edges), "works", len(works))
    siege = [w for w in works if w["era"] == "siege-of-terra"]
    hh = [w for w in works if w["era"] == "horus-heresy"]
    print("era", len(hh), len(siege))

    lines = [
        "/** Chart body transcribed from sources/chart.png. Positions are poster pixels. */",
        "",
        'export type EraBand = "horus-heresy" | "siege-of-terra";',
        "",
        'export type Connection = "primary" | "secondary" | "tertiary";',
        "",
        "export type WorkKind =",
        '  | "novel"',
        '  | "shortStory"',
        '  | "ebook"',
        '  | "audio"',
        '  | "novella"',
        '  | "anthology"',
        '  | "graphicNovel"',
        '  | "characters"',
        '  | "primarchs"',
        '  | "shortcut";',
        "",
        "export type ChartWork = {",
        "  id: string;",
        "  title: string;",
        "  publication: string;",
        "  kind: WorkKind;",
        "  faction: string;",
        "  /** Faction fills inside the poster box, top to bottom. One entry is one band. */",
        "  color: readonly string[];",
        "  text: string;",
        "  ribbon: boolean;",
        "  era: EraBand;",
        "  zone: string | null;",
        "  x: number;",
        "  y: number;",
        "  w: number;",
        "  h: number;",
        "  letters: string | null;",
        "  standsFor: string | null;",
        "};",
        "",
        "export type ChartEdge = {",
        "  id: string;",
        "  source: string;",
        "  target: string;",
        "  connection: Connection;",
        "};",
        "",
        "export type ConflictZone = {",
        "  id: string;",
        "  label: string;",
        "  x: number;",
        "  y: number;",
        "  w: number;",
        "  h: number;",
        "};",
        "",
        "export const works: readonly ChartWork[] = [",
    ]
    for work in works:
        lines.append(
            "  {"
            + f" id: {ts_str(work['id'])},"
            + f" title: {ts_str(work['title'])},"
            + f" publication: {ts_str(work['publication'])},"
            + f" kind: {ts_str(work['kind'])},"
            + f" faction: {ts_str(work['faction'])},"
            + f" color: {ts_color(work['color'])},"
            + f" text: {ts_str(work['text'])},"
            + f" ribbon: {'true' if work['ribbon'] else 'false'},"
            + f" era: {ts_str(work['era'])},"
            + f" zone: {ts_str(work['zone']) if work['zone'] else 'null'},"
            + f" x: {work['x']}, y: {work['y']}, w: {work['w']}, h: {work['h']},"
            + f" letters: {ts_str(work['letters']) if work['letters'] else 'null'},"
            + f" standsFor: {ts_str(work['standsFor']) if work['standsFor'] else 'null'},"
            + " },"
        )
    lines.append("];")
    lines.append("")
    lines.append("export const edges: readonly ChartEdge[] = [")
    for edge in chart_edges:
        lines.append(
            "  {"
            + f" id: {ts_str(edge['id'])},"
            + f" source: {ts_str(edge['source'])},"
            + f" target: {ts_str(edge['target'])},"
            + f" connection: {ts_str(edge['connection'])},"
            + " },"
        )
    lines.append("];")
    lines.append("")
    lines.append("export const zones: readonly ConflictZone[] = [")
    for zone in zones:
        lines.append(
            "  {"
            + f" id: {ts_str(zone['id'])},"
            + f" label: {ts_str(zone['label'])},"
            + f" x: {zone['x']}, y: {zone['y']}, w: {zone['w']}, h: {zone['h']},"
            + " },"
        )
    lines.append("];")
    lines.append("")
    lines.append("export function buildChartGraph() {")
    lines.append("  return { works, edges, zones };")
    lines.append("}")
    lines.append("")
    ROOT.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))
    print("wrote", OUT)
    print("draft only. src/flow/chart.ts was left as it is.")


if __name__ == "__main__":
    main()

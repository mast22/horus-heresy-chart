#!/usr/bin/env python3
"""Crop the poster around chart works so a connection can be checked by eye.

Chart coordinates can drift from the poster, especially after the uniform
alignment pass. The crop therefore measures each work's real top/left border
near its chart seed and prints the measured poster coordinate alongside it.

Usage:
    python3 scripts/fix-connections/crop.py "The Last Remembrancer" Garro
    python3 scripts/fix-connections/crop.py "child of night" --pad 500 \
        --out /tmp/child-of-night.png

Requires Pillow and numpy (see ocr/requirements.txt).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/align-elements"))

from align import parse_chart  # type: ignore[import-not-found] # noqa: E402

DEFAULT_CHART = ROOT / "src/flow/chart.ts"
DEFAULT_POSTER = ROOT / "sources/chart.png"
DARK = 40
MAX_GAP = 6


def longest_run(row: np.ndarray, max_gap: int = MAX_GAP) -> int:
    indices = np.flatnonzero(row)
    if indices.size == 0:
        return 0
    best = 0
    start = previous = int(indices[0])
    for raw in indices[1:]:
        current = int(raw)
        if current - previous > max_gap:
            best = max(best, previous - start + 1)
            start = current
        previous = current
    return max(best, previous - start + 1)


def border_groups(window: np.ndarray, axis: int, min_run: int) -> list[int]:
    """Return the start coordinate of each long dark line along an axis."""
    lines = window if axis == 0 else window.T
    hits: list[int] = []
    for offset, line in enumerate(lines):
        if longest_run(line) >= min_run:
            hits.append(offset)
    groups: list[list[int]] = []
    for hit in hits:
        if groups and hit - groups[-1][-1] <= 3:
            groups[-1].append(hit)
        else:
            groups.append([hit])
    return [group[0] for group in groups]


def pair_start(
    lines: list[int], expected_start: int, size: int
) -> int | None:
    """Pick the box edge from two parallel borders one box apart.

    Choosing the line nearest the chart seed can pick the opposite border
    when the chart has drifted by most of a box height. Requiring a partner
    at roughly the box size away disambiguates top from bottom (and left from
    right) before the seed is consulted.
    """
    best: tuple[float, int] | None = None
    for index, start in enumerate(lines):
        for end in lines[index + 1 :]:
            span = end - start
            if 0.6 * size <= span <= 1.4 * size:
                score = abs((start + end) / 2 - (expected_start + size / 2))
                if best is None or score < best[0]:
                    best = (score, start)
    if best is not None:
        return best[1]
    if not lines:
        return None
    return min(lines, key=lambda line: abs(line - expected_start))


def locate_box(
    luminance: np.ndarray,
    x: int,
    y: int,
    width: int,
    height: int,
    search: int,
) -> tuple[int | None, int | None]:
    """Find the poster's top and left border near a chart seed.

    The chart is searched in both axes because a uniform alignment pass can
    move a node far from its OCR coordinate. Only near-black pixels count, so
    saturated red/blue/green connection strokes are ignored.
    """
    image_height, image_width = luminance.shape
    y0 = max(0, y - search)
    y1 = min(image_height, y + height + search)
    x0 = max(0, x - search)
    x1 = min(image_width, x + width + search)
    window = luminance[y0:y1, x0:x1] < DARK

    rows = [y0 + line for line in border_groups(window, 0, int(0.5 * width))]
    columns = [
        x0 + line for line in border_groups(window, 1, int(0.5 * height))
    ]
    return pair_start(rows, y, height), pair_start(columns, x, width)


def find_works(
    works: list[dict[str, Any]], query: str
) -> list[dict[str, Any]]:
    lower = query.lower()
    exact = [work for work in works if work["id"] == query]
    if exact:
        return exact
    return [work for work in works if str(work["title"]).lower().find(lower) >= 0]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("titles", nargs="+", help="work titles or ids")
    parser.add_argument("--out", type=Path, default=Path("/tmp/connection-crop.png"))
    parser.add_argument("--chart", type=Path, default=DEFAULT_CHART)
    parser.add_argument("--poster", type=Path, default=DEFAULT_POSTER)
    parser.add_argument(
        "--pad",
        type=int,
        default=300,
        help="poster pixels of margin around the union of the boxes",
    )
    parser.add_argument(
        "--search",
        type=int,
        default=600,
        help="how far from the chart seed to look for the poster border",
    )
    parser.add_argument(
        "--max-width",
        type=int,
        default=2000,
        help="downscale the saved crop to this width (0 keeps full size)",
    )
    parser.add_argument(
        "--scale",
        type=int,
        default=1,
        help="integer upscale after cropping (1 keeps full size)",
    )
    args = parser.parse_args()

    _, works, _ = parse_chart(args.chart)
    selected: list[dict[str, Any]] = []
    for query in args.titles:
        matches = find_works(works, query)
        if not matches:
            print(f"error: no work matches {query!r}", file=sys.stderr)
            return 2
        if len(matches) > 1:
            print(f"error: {query!r} is ambiguous:", file=sys.stderr)
            for work in matches:
                print(f"  {work['id']} ({work['title']})", file=sys.stderr)
            return 2
        selected.append(matches[0])

    Image.MAX_IMAGE_PIXELS = None
    image = Image.open(args.poster).convert("RGB")
    luminance = np.asarray(image.convert("L"))

    boxes: list[tuple[int, int, int, int]] = []
    for work in selected:
        x = int(work["x"])
        y = int(work["y"])
        width = int(work["w"])
        height = int(work["h"])
        top, left = locate_box(luminance, x, y, width, height, args.search)
        if top is None or left is None:
            print(
                f"warn: {work['title']}: no poster border within "
                f"{args.search}px, using chart ({x},{y})",
                file=sys.stderr,
            )
            top, left = y, x
        else:
            print(
                f"{work['title']}: chart ({x},{y}) -> poster ({left},{top}) "
                f"delta ({left - x:+d},{top - y:+d})"
            )
        boxes.append((left, top, left + width, top + height))

    x0 = max(0, min(box[0] for box in boxes) - args.pad)
    y0 = max(0, min(box[1] for box in boxes) - args.pad)
    x1 = min(image.width, max(box[2] for box in boxes) + args.pad)
    y1 = min(image.height, max(box[3] for box in boxes) + args.pad)

    crop = image.crop((x0, y0, x1, y1))
    if args.scale > 1:
        crop = crop.resize(
            (crop.width * args.scale, crop.height * args.scale),
            Image.Resampling.LANCZOS,
        )
    if args.max_width and crop.width > args.max_width:
        ratio = args.max_width / crop.width
        crop = crop.resize(
            (args.max_width, round(crop.height * ratio)),
            Image.Resampling.LANCZOS,
        )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    crop.save(args.out)
    print(f"wrote {args.out} ({crop.width}x{crop.height}) from ({x0},{y0})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

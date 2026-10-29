"""Measure work-box borders on the source poster.

Used by align.py. Requires Pillow and numpy (see ocr/requirements.txt).
"""

from __future__ import annotations

import numpy as np
from PIL import Image

DARK = 40
ROW_GAP = 8
COL_GAP = 6
EDGE_GAP = 4
OUTLINE_DARK = 160
OUTLINE_SATURATION = 24


def load_poster(path: str) -> tuple[np.ndarray, np.ndarray]:
    """Return luminance and saturation so angled outlines can be isolated."""
    Image.MAX_IMAGE_PIXELS = None
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)
    return rgb.mean(axis=2), rgb.max(axis=2) - rgb.min(axis=2)


def _runs(mask: np.ndarray, offset: int, min_len: int, max_gap: int = 0) -> list[tuple[int, int]]:
    indices = np.flatnonzero(mask)
    if indices.size == 0:
        return []
    runs: list[tuple[int, int]] = []
    start = previous = int(indices[0])
    for raw in indices[1:]:
        current = int(raw)
        if current - previous <= max_gap + 1:
            previous = current
            continue
        if previous - start + 1 >= min_len:
            runs.append((offset + start, offset + previous))
        start = previous = current
    if previous - start + 1 >= min_len:
        runs.append((offset + start, offset + previous))
    return runs


def _regions(hits: list[tuple[int, int, int]], gap: int) -> list[list[tuple[int, int, int]]]:
    regions: list[list[tuple[int, int, int]]] = []
    for hit in hits:
        if regions and hit[0] - regions[-1][-1][0] <= gap:
            regions[-1].append(hit)
        else:
            regions.append([hit])
    return regions


def _nearest_region(
    regions: list[list[tuple[int, int, int]]], seed: int
) -> list[tuple[int, int, int]] | None:
    if not regions:
        return None

    def distance(region: list[tuple[int, int, int]]) -> int:
        first, last = region[0][0], region[-1][0]
        if first <= seed <= last:
            return 0
        return min(abs(first - seed), abs(last - seed))

    return min(regions, key=distance)


def _horizontal_hits(
    luminance: np.ndarray,
    x: int,
    y: int,
    width: int,
    search: int,
    min_ratio: float,
) -> list[tuple[int, int, int]]:
    image_height, image_width = luminance.shape
    hits: list[tuple[int, int, int]] = []
    for row in range(max(0, y - search), min(image_height, y + search + 1)):
        x0 = max(0, x - 60)
        x1 = min(image_width, x + width + 60)
        runs = _runs(luminance[row, x0:x1] < DARK, x0, int(width * min_ratio))
        if not runs:
            continue
        run = min(runs, key=lambda item: abs(item[0] - x))
        hits.append((row, run[0], run[1]))
    return hits


def measure_box(
    luminance: np.ndarray,
    x: int,
    y: int,
    width: int,
    height: int,
    search: int = 50,
) -> tuple[int | None, int | None]:
    """Return the poster's outer top and left edges nearest to the chart seed."""
    image_height, image_width = luminance.shape

    row_hits = _horizontal_hits(luminance, x, y, width, search, 0.65)
    top = None
    region = _nearest_region(_regions(row_hits, ROW_GAP), y)
    if region is not None:
        top = region[0][0]

    column_hits: list[tuple[int, int, int]] = []
    column_min = max(0, x - search)
    column_max = min(image_width, x + search + 1)
    for column in range(column_min, column_max):
        y0 = max(0, y - 10)
        y1 = min(image_height, y + height + 10)
        runs = _runs(luminance[y0:y1, column] < DARK, y0, int(height * 0.55), EDGE_GAP)
        if not runs:
            continue
        run = min(runs, key=lambda item: abs(item[0] - y))
        column_hits.append((column, run[0], run[1]))

    left = None
    region = _nearest_region(_regions(column_hits, COL_GAP), x)
    if region is not None:
        left = region[0][0]

    return top, left


def measure_angled_box(
    luminance: np.ndarray,
    saturation: np.ndarray,
    x: int,
    y: int,
    width: int,
    height: int,
    search: int = 50,
) -> tuple[int | None, int | None]:
    """Return the poster's outer top and left edges for a chamfered box.

    Graphic novels are hexagons: the sides are angled, so no vertical border
    run exists and `measure_box` cannot find the left edge. The top edge is a
    flat run that is also shorter than the rectangular minimum. Measure the
    top from a half-width run, then take the leftmost low-saturation outline
    pixel across the box height. Connection arrows are saturated, so they are
    ignored, while the grey/black border is kept.
    """
    image_height, image_width = luminance.shape

    row_hits = _horizontal_hits(luminance, x, y, width, search, 0.5)
    top = None
    region = _nearest_region(_regions(row_hits, ROW_GAP), y)
    if region is not None:
        top = region[0][0]

    left = None
    if top is not None:
        x0 = max(0, x - search)
        x1 = min(image_width, x + width)
        y1 = min(image_height, top + height + 1)
        outline = (luminance[top:y1, x0:x1] < OUTLINE_DARK) & (
            saturation[top:y1, x0:x1] <= OUTLINE_SATURATION
        )
        columns = np.flatnonzero(outline.any(axis=0))
        if columns.size:
            left = x0 + int(columns[0])

    return top, left

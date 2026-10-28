"""Horizontal faction-fill bands inside a poster work box.

The fill is the color that spans the box, top to bottom. A book about more
than one legion is several bands. Black rules, glyph ink, and the one-pixel
blend between bands are not fills. A band has to be at least 6px tall so a
thin stripe still counts and a boundary fringe does not.
"""

from __future__ import annotations

import numpy as np

INSET = 4
BLACK = 45
MIN_BAND = 6
SAME = 36


def _median(values: np.ndarray) -> int:
    ordered = np.sort(values.astype(np.int16))
    count = int(ordered.shape[0])
    if count % 2 == 1:
        return int(ordered[count // 2])
    left = int(ordered[count // 2 - 1])
    right = int(ordered[count // 2])
    return int(round((left + right) / 2.0))


def _longest_black_run(line: np.ndarray) -> int:
    black = (line[:, 0] < BLACK) & (line[:, 1] < BLACK) & (line[:, 2] < BLACK)
    longest = 0
    current = 0
    for value in black:
        if value:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest


def _border_index(crop: np.ndarray, along: str, from_end: bool) -> int | None:
    """Outer black rule. Glyphs are short runs, so only a real rule qualifies."""
    height, width, _ = crop.shape
    limit = height if along == "row" else width
    need = max(12, int((width if along == "row" else height) * 0.55))
    scan = min(limit, 36)
    for step in range(scan):
        index = limit - 1 - step if from_end else step
        line = crop[index] if along == "row" else crop[:, index]
        if _longest_black_run(line) >= need:
            return index
    return None


def _page_like(color: tuple[int, int, int]) -> bool:
    """Near-white, near-gray paper showing around a rounded shape."""
    lo = min(color)
    hi = max(color)
    return lo >= 214 and hi - lo <= 16


def _strip_median(sample: np.ndarray) -> tuple[int, int, int] | None:
    if sample.size == 0:
        return None
    keep = sample[~((sample[:, 0] < BLACK) & (sample[:, 1] < BLACK) & (sample[:, 2] < BLACK))]
    if keep.shape[0] < 3:
        return None
    return (_median(keep[:, 0]), _median(keep[:, 1]), _median(keep[:, 2]))


def _row_color(row: np.ndarray) -> tuple[int, int, int] | None:
    """Color of the fill on this row.

    Side strips sit inside the corner and outside the centered title, so glyph
    ink does not move the median. A chamfer or rounded cap can put paper on one
    side; that side is ignored. When both sides are paper and the middle is a
    fill, the middle is the cap of a round node.
    """
    width = int(row.shape[0])
    # A fixed strip just inside the rule. Percent gutters reach wide titles.
    inset = 7 if width >= 36 else 2
    span = 6 if width >= 36 else max(3, width // 6)
    left0 = inset
    left1 = min(width, inset + span)
    right1 = max(0, width - inset)
    right0 = max(0, right1 - span)
    if right0 <= left1:
        left0, left1 = 1, max(2, width // 5)
        right0, right1 = min(width - 2, (4 * width) // 5), max(left1 + 1, width - 1)
    sides = []
    for color in (
        _strip_median(row[left0:left1]),
        _strip_median(row[right0:right1]),
    ):
        if color is not None and not _page_like(color):
            sides.append(color)
    if sides:
        return _run_median(sides)
    center = _strip_median(row[int(width * 0.3) : int(width * 0.7)])
    if center is not None:
        return center
    return _strip_median(row[left0:left1]) or _strip_median(row[right0:right1])


def _far(a: tuple[int, int, int], b: tuple[int, int, int]) -> bool:
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2])) > SAME


def _run_median(colors: list[tuple[int, int, int]]) -> tuple[int, int, int]:
    arr = np.asarray(colors, dtype=np.int16)
    return (_median(arr[:, 0]), _median(arr[:, 1]), _median(arr[:, 2]))


def measure_bands(image: np.ndarray, x: int, y: int, w: int, h: int) -> list[tuple[int, int, int]]:
    """Ordered fill colors inside the box, top to bottom."""
    height, width, _ = image.shape
    x0 = max(0, int(x))
    y0 = max(0, int(y))
    x1 = min(width, int(x) + int(w))
    y1 = min(height, int(y) + int(h))
    if x1 - x0 < 8 or y1 - y0 < 8:
        return []
    crop = image[y0:y1, x0:x1]
    top_rule = _border_index(crop, "row", False)
    bot_rule = _border_index(crop, "row", True)
    left_rule = _border_index(crop, "col", False)
    right_rule = _border_index(crop, "col", True)
    loose = left_rule is None or right_rule is None
    top = (top_rule if top_rule is not None else 0) + INSET
    bottom = (bot_rule if bot_rule is not None else crop.shape[0] - 1) - INSET + 1
    left = (left_rule if left_rule is not None else 0) + INSET
    right = (right_rule if right_rule is not None else crop.shape[1] - 1) - INSET + 1
    if bottom - top < MIN_BAND or right - left < 8:
        top = min(INSET, crop.shape[0] - 1)
        bottom = max(top + 1, crop.shape[0] - INSET)
        left = min(INSET, crop.shape[1] - 1)
        right = max(left + 1, crop.shape[1] - INSET)
    interior = crop[top:bottom, left:right]
    rows: list[tuple[int, int, int] | None] = [_row_color(row) for row in interior]
    runs: list[list[tuple[int, int, int]]] = []
    for color in rows:
        if color is None:
            continue
        if not runs or _far(color, _run_median(runs[-1])):
            runs.append([color])
        else:
            runs[-1].append(color)
    if not runs:
        return []
    kept = [run for run in runs if len(run) >= MIN_BAND]
    if not kept:
        kept = [max(runs, key=len)]
    merged: list[list[tuple[int, int, int]]] = [kept[0]]
    for run in kept[1:]:
        if _far(_run_median(merged[-1]), _run_median(run)):
            merged.append(run)
        else:
            merged[-1].extend(run)
    # A loose badge box includes the paper above or below the round shape.
    # A pale fill inside a ruled rectangle is kept.
    if loose:
        while len(merged) > 1 and _page_like(_run_median(merged[0])):
            merged.pop(0)
        while len(merged) > 1 and _page_like(_run_median(merged[-1])):
            merged.pop()
    # Wide titles repaint the edge strip for a few rows. That interruption sits
    # between two runs of the same fill and stays close to it. A real middle
    # legion (red, salmon, red) is much further away and stays.
    index = 1
    while index < len(merged) - 1:
        left = _run_median(merged[index - 1])
        mid = _run_median(merged[index])
        right = _run_median(merged[index + 1])
        near_neighbors = max(abs(mid[channel] - left[channel]) for channel in range(3)) <= 56
        if (not _far(left, right)) and near_neighbors:
            merged[index - 1].extend(merged[index])
            merged[index - 1].extend(merged[index + 1])
            del merged[index : index + 2]
            continue
        index += 1
    return [_run_median(run) for run in merged]


def hex_color(color: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(color[0], color[1], color[2])

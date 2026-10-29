"""Fit chart rows and columns onto a uniformly spaced lattice.

The source poster places rows and columns by hand, so their pitches vary. This
module clusters coordinates that belong to the same visual line, fits one pitch
per axis, and maps every coordinate through the resulting lattice with a
piecewise-linear transform. Coordinates between lines (badges, audio capsules,
zone borders) keep their position relative to the nearest lines instead of
being rounded onto a line.
"""

from __future__ import annotations

from bisect import bisect_right
from dataclasses import dataclass
from statistics import median


@dataclass(frozen=True)
class AxisGrid:
    """A mapping from poster lines to an evenly spaced lattice."""

    lines: tuple[float, ...]
    bounds: tuple[tuple[int, int], ...]
    positions: tuple[int, ...]
    pitch: int

    def map(self, value: int | float) -> int:
        # Everything clustered into one line collapses onto that line, so a
        # second run is a no-op instead of nudging staggered members again.
        for (low, high), position in zip(self.bounds, self.positions):
            if low <= value <= high:
                return position

        lines = self.lines
        if value <= lines[0]:
            return round(self.positions[0] + (value - lines[0]))
        if value >= lines[-1]:
            return round(self.positions[-1] + (value - lines[-1]))

        index = bisect_right(lines, value) - 1
        span = lines[index + 1] - lines[index]
        ratio = (value - lines[index]) / span
        start = self.positions[index]
        return round(start + ratio * (self.positions[index + 1] - start))


def cluster_lines(values: list[int], tolerance: float) -> list[list[int]]:
    """Group sorted values whose neighbours are closer than ``tolerance``."""
    clusters: list[list[int]] = []
    for value in sorted(set(values)):
        if clusters and value - clusters[-1][-1] <= tolerance:
            clusters[-1].append(value)
        else:
            clusters.append([value])
    return clusters


def fit_axis(
    values: list[int],
    min_pitch: int,
    pitch: int | None = None,
    tolerance: float | None = None,
) -> AxisGrid:
    """Fit a single pitch to the lines inferred from ``values``.

    ``tolerance`` defaults to half the median gap, so lines that differ by a
    small offset (OCR drift or a deliberate stagger) collapse into one line
    while real rows/columns stay separate. The pitch defaults to the average
    spacing across the whole span, clamped to ``min_pitch`` so boxes cannot
    overlap on the same axis.
    """
    ordered = sorted(set(values))
    if len(ordered) < 2:
        raise ValueError("uniform spacing needs at least two lines")

    gaps = [right - left for left, right in zip(ordered, ordered[1:])]
    if tolerance is None:
        tolerance = median(gaps) / 2
    clusters = cluster_lines(ordered, tolerance)
    lines = [sum(cluster) / len(cluster) for cluster in clusters]
    bounds = tuple((cluster[0], cluster[-1]) for cluster in clusters)
    if len(lines) < 2:
        raise ValueError("uniform spacing needs at least two distinct lines")

    if pitch is None:
        average = (lines[-1] - lines[0]) / (len(lines) - 1)
        pitch = max(round(average), min_pitch)
    if pitch <= 0:
        raise ValueError("pitch must be positive")

    positions = tuple(
        round(lines[0] + index * pitch) for index in range(len(lines))
    )
    return AxisGrid(tuple(lines), bounds, positions, pitch)

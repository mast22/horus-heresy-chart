"""Find and fix chart rows/columns that disagree with the source poster.

The poster is the source of truth. Chart coordinates are OCR-derived and can
drift by more than the row spacing (see Raven's Flight). A group's canonical
chart value is therefore the value closest to the measured poster edge, not
the group's majority value.

Two passes are available:

- the default poster pass snaps near-misaligned rows/columns to the poster;
- ``--uniform`` fits one pitch per axis and regularizes every row and column
  onto that lattice (see ``grid.py``). Zones are recomputed from their works.

Usage:
    python3 scripts/align-elements/align.py
    python3 scripts/align-elements/align.py --max-delta 20
    python3 scripts/align-elements/align.py --uniform
    python3 scripts/align-elements/align.py --uniform --write

Requires Pillow and numpy (see ocr/requirements.txt).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from grid import AxisGrid, fit_axis
from poster import load_poster, measure_angled_box, measure_box

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CHART = ROOT / "src/flow/chart.ts"
DEFAULT_POSTER = ROOT / "sources/chart.png"
# Graphic novels are angled hexagons, but still occupy a chart column, so they
# are measured with measure_angled_box instead of being excluded.
ANGLED_KINDS = {"graphicNovel"}
DEFAULT_EXCLUDED = "shortcut,audio"
AXES = {"x", "y"}
# Minimum lattice pitch in the uniform pass. Leaves room for the box plus a
# small visual gap, so boxes sharing a row/column cannot overlap.
MIN_ROW_GAP = 12
MIN_COLUMN_GAP = 40
BLOCK_PATTERN = re.compile(r"(?ms)^  \{\n(.*?)^  \},")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chart", type=Path, default=DEFAULT_CHART)
    parser.add_argument("--poster", type=Path, default=DEFAULT_POSTER)
    parser.add_argument(
        "--max-delta",
        type=int,
        default=30,
        help="largest chart-value offset the poster pass may move (default: 30)",
    )
    parser.add_argument(
        "--edge-tolerance",
        type=int,
        default=2,
        help="max spread of measured poster edges in one row/column (default: 2)",
    )
    parser.add_argument(
        "--search-window",
        type=int,
        default=50,
        help="pixels around the chart seed to search the poster (default: 50)",
    )
    parser.add_argument("--axes", default="x,y", help="axes to align (default: x,y)")
    parser.add_argument(
        "--exclude-kinds",
        default=DEFAULT_EXCLUDED,
        help=f"comma-separated kinds to skip (default: {DEFAULT_EXCLUDED})",
    )
    parser.add_argument(
        "--uniform",
        action="store_true",
        help="regularize rows and columns onto one pitch instead of snapping to the poster",
    )
    parser.add_argument(
        "--row-pitch",
        type=int,
        help="explicit row pitch for --uniform (default: average of existing rows)",
    )
    parser.add_argument(
        "--col-pitch",
        type=int,
        help="explicit column pitch for --uniform (default: average of existing columns)",
    )
    parser.add_argument(
        "--line-tolerance",
        type=float,
        help="merge lines closer than this in --uniform (default: half the median gap)",
    )
    parser.add_argument(
        "--allow-overlaps",
        action="store_true",
        help="write even if regularized works overlap (default: refuse)",
    )
    parser.add_argument("--write", action="store_true", help="write changes to the chart")
    parser.add_argument("--json", type=Path, help="write the plan as JSON")
    parser.add_argument("--fail-on-moves", action="store_true", help="exit 1 when moves exist")
    return parser.parse_args()


def constant(source: str, name: str) -> int:
    match = re.search(rf"export const {name} = (\d+);", source)
    if match is None:
        raise ValueError(f"missing {name}")
    return int(match.group(1))


def section(source: str, header: str) -> tuple[int, str]:
    start = source.index(header) + len(header)
    end = source.index("\n];", start)
    return start, source[start:end]


def parse_chart(
    path: Path,
) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    source = path.read_text()
    start, body = section(source, "export const works: readonly ChartWork[] = [")

    dimensions = {
        "shortcut": (
            constant(source, "SHORTCUT_WIDTH"),
            constant(source, "SHORTCUT_HEIGHT"),
        ),
        "audio": (
            constant(source, "AUDIO_WIDTH"),
            constant(source, "AUDIO_HEIGHT"),
        ),
    }
    default_dimensions = (
        constant(source, "WORK_WIDTH"),
        constant(source, "WORK_HEIGHT"),
    )

    works: list[dict[str, Any]] = []
    for block in BLOCK_PATTERN.finditer(body):
        text = block.group(1)
        work_id = re.search(r'(?m)^    id: "([^"]+)"', text)
        title = re.search(r'(?m)^    title: "([^"]+)"', text)
        kind = re.search(r'(?m)^    kind: "([^"]+)"', text)
        zone = re.search(r'(?m)^    zone: (null|"([^"]*)")', text)
        x_match = re.search(r"(?m)^    x: (\d+),", text)
        y_match = re.search(r"(?m)^    y: (\d+),", text)
        if (
            work_id is None
            or title is None
            or kind is None
            or zone is None
            or x_match is None
            or y_match is None
        ):
            continue

        width, height = dimensions.get(kind.group(1), default_dimensions)
        base = start + block.start(1)
        works.append(
            {
                "id": work_id.group(1),
                "title": title.group(1),
                "kind": kind.group(1),
                "zone": zone.group(2),
                "x": int(x_match.group(1)),
                "y": int(y_match.group(1)),
                "w": width,
                "h": height,
                "x_offset": base + x_match.start(1),
                "y_offset": base + y_match.start(1),
            }
        )

    return source, works, parse_zones(source)


def parse_zones(source: str) -> list[dict[str, Any]]:
    start, body = section(source, "export const zones: readonly ConflictZone[] = [")
    zones: list[dict[str, Any]] = []
    for block in BLOCK_PATTERN.finditer(body):
        text = block.group(1)
        zone_id = re.search(r'(?m)^    id: "([^"]+)"', text)
        label = re.search(r'(?m)^    label: "([^"]+)"', text)
        fields = {
            name: re.search(rf"(?m)^    {name}: (\d+),", text)
            for name in ("x", "y", "w", "h")
        }
        if zone_id is None or label is None or any(value is None for value in fields.values()):
            continue

        base = start + block.start(1)
        zone: dict[str, Any] = {"id": zone_id.group(1), "label": label.group(1)}
        for name, match in fields.items():
            assert match is not None
            zone[name] = int(match.group(1))
            zone[f"{name}_offset"] = base + match.start(1)
        zone["has_parts"] = "parts:" in text
        zones.append(zone)
    return zones


def groups_by_actual(
    works: list[dict[str, Any]], actual_key: str, tolerance: int
) -> list[list[dict[str, Any]]]:
    ordered = sorted(
        (work for work in works if work[actual_key] is not None),
        key=lambda work: work[actual_key],
    )
    groups: list[list[dict[str, Any]]] = []
    for work in ordered:
        if groups and work[actual_key] - groups[-1][-1][actual_key] <= tolerance:
            groups[-1].append(work)
        else:
            groups.append([work])
    return groups


def canonical_value(group: list[dict[str, Any]], axis: str, actual_key: str) -> int:
    measured = Counter(work[actual_key] for work in group).most_common(1)[0][0]
    values = [work[axis] for work in group]
    return min(set(values), key=lambda value: (abs(value - measured), -values.count(value)))


def assign_lines(works: list[dict[str, Any]], edge_tolerance: int) -> None:
    """Record the canonical row/column for every work, singles included."""
    for axis, actual_key in (("x", "actual_left"), ("y", "actual_top")):
        line_key = f"line_{axis}"
        for work in works:
            work[line_key] = work[axis]
        for group in groups_by_actual(works, actual_key, edge_tolerance):
            canonical = canonical_value(group, axis, actual_key)
            for work in group:
                work[line_key] = canonical


def build_plan(
    works: list[dict[str, Any]],
    axes: list[str],
    max_delta: int,
) -> list[dict[str, Any]]:
    moves: list[dict[str, Any]] = []
    for axis in axes:
        line_key = f"line_{axis}"
        for work in works:
            canonical = work[line_key]
            delta = work[axis] - canonical
            if delta == 0 or abs(delta) > max_delta:
                continue
            moves.append(
                {
                    "id": work["id"],
                    "title": work["title"],
                    "axis": axis,
                    "from": work[axis],
                    "to": canonical,
                    "delta": delta,
                    "actual": work[f"actual_{'top' if axis == 'y' else 'left'}"],
                    "offset": work[f"{axis}_offset"],
                }
            )
    return sorted(moves, key=lambda move: (move["axis"], move["to"], move["title"]))


def map_value(grids: dict[str, AxisGrid], axis: str, value: int) -> int:
    return grids[axis].map(value) if axis in grids else value


def build_uniform_plan(
    works: list[dict[str, Any]],
    zones: list[dict[str, Any]],
    axes: list[str],
    excluded: set[str],
    row_pitch: int | None,
    col_pitch: int | None,
    line_tolerance: float | None,
) -> dict[str, Any]:
    eligible = [work for work in works if work["kind"] not in excluded]
    if not eligible:
        raise ValueError("no works left to fit a lattice")

    work_width = max(work["w"] for work in works)
    work_height = max(work["h"] for work in works)
    grids: dict[str, AxisGrid] = {}
    for axis in axes:
        grids[axis] = fit_axis(
            [work[f"line_{axis}"] for work in eligible],
            min_pitch=work_height + MIN_ROW_GAP
            if axis == "y"
            else work_width + MIN_COLUMN_GAP,
            pitch=row_pitch if axis == "y" else col_pitch,
            tolerance=line_tolerance,
        )

    moved_works: list[dict[str, Any]] = []
    mapped: dict[str, tuple[int, int]] = {}
    for work in works:
        new_x = map_value(grids, "x", work["x"])
        new_y = map_value(grids, "y", work["y"])
        mapped[work["id"]] = (new_x, new_y)
        if (new_x, new_y) == (work["x"], work["y"]):
            continue
        moved_works.append(
            {
                "id": work["id"],
                "title": work["title"],
                "kind": work["kind"],
                "x": coordinate_change(work, "x", new_x),
                "y": coordinate_change(work, "y", new_y),
            }
        )

    zones_plan = build_zone_plan(zones, works, mapped, grids)
    return {
        "mode": "uniform",
        "axes": axes,
        "grids": {
            axis: {
                "pitch": grid.pitch,
                "origin": grid.positions[0],
                "line_count": len(grid.lines),
                "lines": [round(line, 1) for line in grid.lines],
                "positions": list(grid.positions),
            }
            for axis, grid in grids.items()
        },
        "works": moved_works,
        "zones": zones_plan,
    }


def coordinate_change(work: dict[str, Any], axis: str, value: int) -> dict[str, int]:
    return {
        "from": work[axis],
        "to": value,
        "offset": work[f"{axis}_offset"],
    }


def build_zone_plan(
    zones: list[dict[str, Any]],
    works: list[dict[str, Any]],
    mapped: dict[str, tuple[int, int]],
    grids: dict[str, AxisGrid],
) -> list[dict[str, Any]]:
    plan: list[dict[str, Any]] = []
    for zone in zones:
        # Multi-part outlines (such as reversed L storylines) are hand-built;
        # a rectangular bounding-box rewrite would erase their shape.
        if zone["has_parts"]:
            continue
        members = [
            work for work in works if work["zone"] == zone["label"]
        ]
        if members:
            # Negative padding means the poster box clipped a work; clamp it
            # so a recomputed zone always contains its members.
            left = max(min(work["x"] for work in members) - zone["x"], 0)
            top = max(min(work["y"] for work in members) - zone["y"], 0)
            right = max(
                zone["x"]
                + zone["w"]
                - max(work["x"] + work["w"] for work in members),
                0,
            )
            bottom = max(
                zone["y"]
                + zone["h"]
                - max(work["y"] + work["h"] for work in members),
                0,
            )
            new = {
                "x": min(mapped[work["id"]][0] for work in members) - left,
                "y": min(mapped[work["id"]][1] for work in members) - top,
            }
            new["w"] = (
                max(mapped[work["id"]][0] + work["w"] for work in members)
                + right
                - new["x"]
            )
            new["h"] = (
                max(mapped[work["id"]][1] + work["h"] for work in members)
                + bottom
                - new["y"]
            )
        else:
            # No member works: keep the rectangle's proportions by mapping its
            # corners through the same transform.
            left = map_value(grids, "x", zone["x"])
            top = map_value(grids, "y", zone["y"])
            right = map_value(grids, "x", zone["x"] + zone["w"])
            bottom = map_value(grids, "y", zone["y"] + zone["h"])
            new = {"x": left, "y": top, "w": right - left, "h": bottom - top}

        fields = {
            name: coordinate_change(zone, name, new[name])
            for name in ("x", "y", "w", "h")
            if new[name] != zone[name]
        }
        if fields:
            plan.append({"id": zone["id"], "label": zone["label"], **fields})
    return plan


def find_overlaps(works: list[dict[str, Any]]) -> list[tuple[str, str]]:
    """Return pairs of full-size works whose boxes overlap."""
    overlaps: list[tuple[str, str]] = []
    for index, left in enumerate(works):
        for right in works[index + 1 :]:
            if abs(left["x"] - right["x"]) * 2 < left["w"] + right["w"]:
                if abs(left["y"] - right["y"]) * 2 < left["h"] + right["h"]:
                    overlaps.append((left["title"], right["title"]))
    return overlaps


def regularized_works(
    works: list[dict[str, Any]], plan: dict[str, Any]
) -> list[dict[str, Any]]:
    by_id = {move["id"]: move for move in plan["works"]}
    result = []
    for work in works:
        move = by_id.get(work["id"])
        result.append(
            {
                **work,
                "x": move["x"]["to"] if move else work["x"],
                "y": move["y"]["to"] if move else work["y"],
            }
        )
    return result


def collect_edits(
    works: list[dict[str, Any]], zones: list[dict[str, Any]], plan: dict[str, Any]
) -> list[tuple[int, str, str, str]]:
    edits: list[tuple[int, str, str, str]] = []
    by_id = {zone["id"]: zone for zone in zones}
    for move in plan["works"]:
        for axis in ("x", "y"):
            field = move.get(axis)
            if field and field["from"] != field["to"]:
                edits.append(
                    (
                        field["offset"],
                        str(field["from"]),
                        str(field["to"]),
                        f"{move['id']}.{axis}",
                    )
                )
    for move in plan["zones"]:
        zone = by_id[move["id"]]
        for axis in ("x", "y", "w", "h"):
            field = move.get(axis)
            if field and field["from"] != field["to"]:
                edits.append(
                    (
                        zone[f"{axis}_offset"],
                        str(field["from"]),
                        str(field["to"]),
                        f"{zone['id']}.{axis}",
                    )
                )
    return edits


def apply_edits(source: str, edits: list[tuple[int, str, str, str]]) -> str:
    ordered = sorted(edits, key=lambda edit: edit[0], reverse=True)
    for offset, old, new, label in ordered:
        if source[offset : offset + len(old)] != old:
            raise RuntimeError(f"{label}: source no longer has {old} at that offset")
        source = source[:offset] + new + source[offset + len(old) :]
    return source


def write_chart(
    path: Path, source: str, edits: list[tuple[int, str, str, str]]
) -> None:
    path.write_text(apply_edits(source, edits))
    try:
        display_path = path.relative_to(ROOT)
    except ValueError:
        display_path = path
    print(f"Wrote {len(edits)} coordinate(s) to {display_path}")


def print_uniform_plan(
    plan: dict[str, Any], works: list[dict[str, Any]]
) -> None:
    for axis in ("y", "x"):
        grid = plan["grids"].get(axis)
        if grid is None:
            continue
        label = "rows" if axis == "y" else "columns"
        print(
            f"Uniform {label}: {grid['line_count']} lines, pitch {grid['pitch']}, "
            f"origin {grid['origin']}"
        )

    if not plan["works"] and not plan["zones"]:
        print("Already uniformly spaced.")
        return

    shifts = [
        (abs(new - old), axis, old, new)
        for axis, grid in plan["grids"].items()
        for old, new in zip(grid["lines"], grid["positions"])
        if round(old) != new
    ]
    shifts.sort(key=lambda shift: shift[0], reverse=True)
    for _, axis, old, new in shifts[:12]:
        print(f"{axis} line {old:>7.1f} -> {new:<5} ({new - old:+6.1f})")
    if len(shifts) > 12:
        print(f"... and {len(shifts) - 12} more line shift(s)")

    print(
        f"Plan: {len(plan['works'])} work(s), {len(plan['zones'])} zone(s), "
        f"{len(works)} total work nodes"
    )


def main() -> int:
    args = parse_args()
    axes = [axis.strip() for axis in args.axes.split(",") if axis.strip()]
    unknown = set(axes) - AXES
    if unknown:
        print(f"unknown axes: {', '.join(sorted(unknown))}", file=sys.stderr)
        return 2

    excluded = {kind.strip() for kind in args.exclude_kinds.split(",") if kind.strip()}
    source, works, zones = parse_chart(args.chart)
    eligible = [work for work in works if work["kind"] not in excluded]

    if args.uniform:
        # Uniform spacing deliberately leaves the poster, so seeds come from
        # the chart itself. Run the default poster pass first if the chart is
        # still OCR-raw; otherwise the poster search would latch onto the
        # wrong box after the first regularization.
        for work in works:
            work["line_x"] = work["x"]
            work["line_y"] = work["y"]
        try:
            plan = build_uniform_plan(
                works,
                zones,
                axes,
                excluded,
                args.row_pitch,
                args.col_pitch,
                args.line_tolerance,
            )
        except ValueError as error:
            print(f"cannot fit a uniform lattice: {error}", file=sys.stderr)
            return 2

        print_uniform_plan(plan, works)
        overlaps = find_overlaps(
            [work for work in regularized_works(works, plan) if work["kind"] not in excluded]
        )
        if overlaps:
            print(f"{len(overlaps)} work pair(s) would overlap:", file=sys.stderr)
            for left, right in overlaps[:10]:
                print(f"  {left} / {right}", file=sys.stderr)
            if not args.allow_overlaps:
                print(
                    "Refusing to write; rerun with --allow-overlaps only after "
                    "reviewing the overlap list.",
                    file=sys.stderr,
                )
                return 2

        if args.json:
            args.json.write_text(json.dumps(plan, indent=2) + "\n")

        if args.write:
            write_chart(args.chart, source, collect_edits(works, zones, plan))

        return 1 if args.fail_on_moves and (plan["works"] or plan["zones"]) else 0

    luminance, saturation = load_poster(str(args.poster))
    for work in eligible:
        if work["kind"] in ANGLED_KINDS:
            work["actual_top"], work["actual_left"] = measure_angled_box(
                luminance,
                saturation,
                work["x"],
                work["y"],
                work["w"],
                work["h"],
                args.search_window,
            )
        else:
            work["actual_top"], work["actual_left"] = measure_box(
                luminance,
                work["x"],
                work["y"],
                work["w"],
                work["h"],
                args.search_window,
            )

    missing = [
        work
        for work in eligible
        if work["actual_top"] is None or work["actual_left"] is None
    ]
    if missing:
        print(
            f"skipped {len(missing)} work(s) with no measured border:",
            file=sys.stderr,
        )
        for work in missing:
            print(f"  {work['kind']:<12} {work['title']}", file=sys.stderr)

    assign_lines(eligible, args.edge_tolerance)

    moves = build_plan(eligible, axes, args.max_delta)
    if not moves:
        print("No misaligned rows or columns found.")
        return 0

    for move in moves:
        print(
            f"{move['axis']} {move['from']:>5} -> {move['to']:<5} "
            f"actual={move['actual']:<5} {move['title']}"
        )

    if args.json:
        args.json.write_text(json.dumps(moves, indent=2) + "\n")

    if args.write:
        edits = [
            (
                move["offset"],
                str(move["from"]),
                str(move["to"]),
                f"{move['id']}.{move['axis']}",
            )
            for move in moves
        ]
        write_chart(args.chart, source, edits)

    if args.fail_on_moves:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

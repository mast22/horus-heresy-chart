/**
 * Orthogonal edge routing with obstacle avoidance.
 *
 * The chart nodes sit on a grid, so an edge is routed as a Manhattan path that
 * leaves the source on its right edge, enters the target on its left edge, and
 * never crosses any other work. A* runs over a sparse grid built from the node
 * boundaries plus the midpoint of every gutter, so the path can turn inside the
 * gaps between boxes instead of cutting through them.
 */

import { buildChartGraph } from "./chart.ts";

export type Point = { x: number; y: number };

type Rect = { x: number; y: number; w: number; h: number };

/** Distance an edge keeps from a box it does not connect to. */
const MARGIN = 8;

/** Small extra cost per bend so ties break toward straighter, cleaner paths. */
const TURN_PENALTY = 0.5;

const { works } = buildChartGraph();

const rectById = new Map<string, Rect>(
  works.map((work) => [
    work.id,
    { x: work.x, y: work.y, w: work.w, h: work.h },
  ]),
);

// Single source of truth: obstacles and endpoint lookups share the same rect
// instances, so the source/target exclusion can compare by reference.
const rects: Rect[] = [...rectById.values()];

function inflate(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    w: rect.w + 2 * amount,
    h: rect.h + 2 * amount,
  };
}

function pointInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  );
}

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

/** Axis-aligned segment vs. axis-aligned rect overlap. */
function segmentHitsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: Rect,
): boolean {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  return (
    maxX > rect.x &&
    minX < rect.x + rect.w &&
    maxY > rect.y &&
    minY < rect.y + rect.h
  );
}

function midpoints(values: number[]): number[] {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const withMids: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    withMids.push(sorted[i]);
    if (i < sorted.length - 1) {
      withMids.push((sorted[i] + sorted[i + 1]) / 2);
    }
  }
  return [...new Set(withMids)].sort((a, b) => a - b);
}

type HeapEntry = {
  f: number;
  g: number;
  cell: number;
  dir: number;
};

class MinHeap {
  private items: HeapEntry[] = [];

  get size(): number {
    return this.items.length;
  }

  push(entry: HeapEntry): void {
    const items = this.items;
    items.push(entry);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].f <= items[i].f) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop(): HeapEntry | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0 && last !== undefined) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < items.length && items[left].f < items[smallest].f) {
          smallest = left;
        }
        if (right < items.length && items[right].f < items[smallest].f) {
          smallest = right;
        }
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

/** Direction a step moves in; 0..3 index the delta table below. */
const DX = [-1, 1, 0, 0];
const DY = [0, 0, -1, 1];

/**
 * Route an edge between two works. `sourcePoint` is the source handle (on the
 * source's right edge) and `targetPoint` is the target handle (on the target's
 * left edge), both in chart coordinates. Returns axis-aligned waypoints from
 * source to target; falls back to a direct two-segment path if no route exists.
 */
export function routeWorkEdge(
  sourceId: string,
  targetId: string,
  sourcePoint: Point,
  targetPoint: Point,
): Point[] {
  const source = rectById.get(sourceId);
  const target = rectById.get(targetId);
  if (!source || !target) {
    return [sourcePoint, targetPoint];
  }

  const obstacles = rects
    .filter(
      (rect) =>
        rect !== source &&
        rect !== target &&
        // A node that sits on top of the source (a shortcut badge or audio
        // capsule overlapping a work) must not trap the outgoing stroke.
        !overlaps(rect, source),
    )
    .map((rect) => inflate(rect, MARGIN));

  const xs = midpoints([
    ...rects.flatMap((rect) => [rect.x, rect.x + rect.w]),
    sourcePoint.x,
    targetPoint.x,
  ]);
  const ys = midpoints([
    ...rects.flatMap((rect) => [rect.y, rect.y + rect.h]),
    sourcePoint.y,
    targetPoint.y,
  ]);

  const nx = xs.length;
  const ny = ys.length;

  const sxi = xs.indexOf(sourcePoint.x);
  const syi = ys.indexOf(sourcePoint.y);
  const txi = xs.indexOf(targetPoint.x);
  const tyi = ys.indexOf(targetPoint.y);

  if (sxi < 0 || syi < 0 || txi < 0 || tyi < 0) {
    return [sourcePoint, targetPoint];
  }

  const cell = (xi: number, yi: number): number => yi * nx + xi;
  const start = cell(sxi, syi);
  const goal = cell(txi, tyi);

  const pointAt = (xi: number, yi: number): Point => ({
    x: xs[xi],
    y: ys[yi],
  });

  const freePoint = (xi: number, yi: number): boolean => {
    const point = pointAt(xi, yi);
    for (const obstacle of obstacles) {
      if (pointInRect(point, obstacle)) return false;
    }
    return true;
  };

  const freeSegment = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): boolean => {
    for (const obstacle of obstacles) {
      if (segmentHitsRect(x1, y1, x2, y2, obstacle)) return false;
    }
    return true;
  };

  // Cost so far keyed by cell and incoming direction.
  const keyOf = (c: number, dir: number): number => c * 4 + dir;

  const cameFrom = new Map<number, number>();
  const open = new MinHeap();
  const gScore = new Map<number, number>();
  const startKey = keyOf(start, 4); // 4 = "no direction yet"
  gScore.set(startKey, 0);
  open.push({ f: heuristic(start), g: 0, cell: start, dir: 4 });

  function heuristic(c: number): number {
    const xi = c % nx;
    const yi = Math.floor(c / nx);
    return Math.abs(xs[xi] - xs[txi]) + Math.abs(ys[yi] - ys[tyi]);
  }

  let found: number | undefined;

  while (open.size > 0) {
    const current = open.pop();
    if (current === undefined) break;

    const currentKey = keyOf(current.cell, current.dir);
    if ((gScore.get(currentKey) ?? Infinity) < current.g) continue;

    if (current.cell === goal) {
      found = currentKey;
      break;
    }

    const xi = current.cell % nx;
    const yi = Math.floor(current.cell / nx);
    const point = pointAt(xi, yi);
    const isSource = current.cell === start;

    for (let dir = 0; dir < 4; dir++) {
      const nxi = xi + DX[dir];
      const nyi = yi + DY[dir];
      if (nxi < 0 || nxi >= nx || nyi < 0 || nyi >= ny) continue;

      const nextCell = cell(nxi, nyi);
      // The source must leave rightward (never into its own box), and the
      // target is only entered from the left, so the final stroke is always a
      // rightward move into the box and the arrowhead orientation stays fixed.
      if (isSource && dir !== 1) continue;
      if (nextCell === goal && dir !== 1) continue;

      const nextPoint = pointAt(nxi, nyi);
      if (!freePoint(nxi, nyi)) continue;
      if (!freeSegment(point.x, point.y, nextPoint.x, nextPoint.y)) {
        continue;
      }

      const step =
        Math.abs(nextPoint.x - point.x) + Math.abs(nextPoint.y - point.y);
      const turn = current.dir === 4 || current.dir === dir ? 0 : TURN_PENALTY;
      const tentativeG = current.g + step + turn;
      const nextKey = keyOf(nextCell, dir);

      if (tentativeG < (gScore.get(nextKey) ?? Infinity)) {
        cameFrom.set(nextKey, currentKey);
        gScore.set(nextKey, tentativeG);
        open.push({
          f: tentativeG + heuristic(nextCell),
          g: tentativeG,
          cell: nextCell,
          dir,
        });
      }
    }
  }

  if (found === undefined) {
    return fallbackPath(sourcePoint, targetPoint);
  }

  // Reconstruct.
  const cells: number[] = [];
  let key: number | undefined = found;
  while (key !== undefined && key !== startKey) {
    cells.push(Math.floor(key / 4));
    key = cameFrom.get(key);
  }
  cells.push(start);
  cells.reverse();

  const points = cells.map((c) => pointAt(c % nx, Math.floor(c / nx)));
  return simplify(points, sourcePoint, targetPoint);
}

function fallbackPath(source: Point, target: Point): Point[] {
  return [
    source,
    { x: (source.x + target.x) / 2, y: source.y },
    { x: (source.x + target.x) / 2, y: target.y },
    target,
  ];
}

/** Collapse collinear waypoints so the path has no redundant segments. */
function simplify(
  points: Point[],
  sourcePoint: Point,
  targetPoint: Point,
): Point[] {
  const clean: Point[] = [];
  for (const point of points) {
    const last = clean[clean.length - 1];
    const prev = clean[clean.length - 2];
    if (last !== undefined && prev !== undefined) {
      const sameX = prev.x === last.x && last.x === point.x;
      const sameY = prev.y === last.y && last.y === point.y;
      if (sameX || sameY) {
        clean[clean.length - 1] = point;
        continue;
      }
    }
    clean.push(point);
  }

  if (
    clean.length > 0 &&
    (clean[0].x !== sourcePoint.x || clean[0].y !== sourcePoint.y)
  ) {
    clean.unshift(sourcePoint);
  }
  if (
    clean.length > 0 &&
    (clean[clean.length - 1].x !== targetPoint.x ||
      clean[clean.length - 1].y !== targetPoint.y)
  ) {
    clean.push(targetPoint);
  }

  return clean;
}

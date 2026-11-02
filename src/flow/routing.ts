/**
 * Orthogonal edge routing with obstacle avoidance and clearance.
 *
 * The chart nodes sit on a grid, so an edge is routed as a Manhattan path that
 * leaves the source on its right edge, enters the target on its left edge, and
 * never crosses any other work. A* runs over a sparse grid built from the node
 * boundaries plus the midpoint of every gutter, so the path can turn inside the
 * gaps between boxes instead of cutting through them.
 *
 * Every edge also reserves a minimum straight run on each end. An arrow must
 * meet its box at 90°, and the bend that makes that happen has to sit some
 * distance before the box — otherwise the rounded corner folds over the
 * arrowhead and the arrow reads as broken. The router therefore keeps the trunk
 * at least `MIN_RUN` pixels clear of the source's right edge and the target's
 * left edge, and finishes with a straight, perpendicular run into the target.
 * Secondary and tertiary links use a shorter run (60% and 30%) so their bends
 * sit closer to the boxes and the three colours do not turn on the same line.
 */

import { buildChartGraph, type Connection } from "./chart.ts";

export type Point = { x: number; y: number };

type Rect = { x: number; y: number; w: number; h: number };

/** Distance an edge keeps from a box it does not connect to. */
const MARGIN = 8;

/**
 * Minimum straight, perpendicular run before a bend at a node edge. This is
 * sized so the rounded corner plus the arrowhead have room to draw without
 * folding over the box. Exported so routing regression checks can assert it.
 */
export const MIN_RUN = 40;

/**
 * Minimum straight run on the exit side when the source and target are so close
 * there is no room for the full `MIN_RUN` on both ends. The source carries no
 * arrowhead, so it only needs enough room for the rounded bend.
 */
export const MIN_EXIT_RUN = 16;

/**
 * How much of the primary straight-run each connection colour keeps. Primary
 * stays at the full distance; secondary and tertiary turn sooner.
 */
export const RUN_SCALE: Record<Connection, number> = {
  primary: 1,
  secondary: 0.6,
  tertiary: 0.3,
};

/** Straight run a connection must keep before it may turn into a target. */
export function minRunFor(connection: Connection): number {
  return MIN_RUN * RUN_SCALE[connection];
}

/** Shortest clean exit bend for a connection when the gap is tight. */
export function minExitRunFor(connection: Connection): number {
  return MIN_EXIT_RUN * RUN_SCALE[connection];
}

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

// Shortcut badges annotate a line rather than occupy it, so edges pass under
// them instead of routing around a 30x30 label.
const shortcutRects = new Set<Rect>(
  works
    .filter((work) => work.kind === "shortcut")
    .map((work) => rectById.get(work.id))
    .filter((rect): rect is Rect => rect !== undefined),
);

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
  connection: Connection = "primary",
): Point[] {
  const source = rectById.get(sourceId);
  const target = rectById.get(targetId);
  if (!source || !target) {
    return [sourcePoint, targetPoint];
  }

  const run = minRunFor(connection);
  const sourceRight = source.x + source.w;
  const exitLane: Point = { x: sourceRight + run, y: sourcePoint.y };
  const entryLane: Point = { x: target.x - run, y: targetPoint.y };

  // Horizontally adjacent boxes with no room for a full 90° turn on both
  // sides get a straight two-turn path that still keeps the entry lane clear.
  if (target.x > sourceRight && target.x - sourceRight < 2 * run) {
    return tightPath(
      sourceRight,
      target.x,
      sourcePoint,
      targetPoint,
      connection,
    );
  }

  const obstacles: Rect[] = [
    ...obstaclesFor(source, target),
    // Reserve a straight exit lane to the right of the source and a straight
    // entry lane to the left of the target. The trunk runs between these two
    // bands; the straight runs themselves are appended below.
    { x: source.x, y: source.y, w: source.w + run, h: source.h },
    { x: target.x - run, y: target.y, w: target.w + run, h: target.h },
  ];

  const trunk = routeTrunk(exitLane, entryLane, obstacles);
  if (trunk.length === 0) {
    return fallbackPath(sourcePoint, targetPoint);
  }

  return simplify(
    [sourcePoint, ...trunk, targetPoint],
    sourcePoint,
    targetPoint,
  );
}

/** Every work an edge between `source` and `target` must route around. */
function obstaclesFor(source: Rect, target: Rect): Rect[] {
  return rects
    .filter(
      (rect) =>
        rect !== source &&
        rect !== target &&
        !shortcutRects.has(rect) &&
        // A node that sits on top of the source (an audio capsule overlapping
        // a work) must not trap the outgoing stroke.
        !overlaps(rect, source),
    )
    .map((rect) => inflate(rect, MARGIN));
}

/**
 * A clean orthogonal route through a shared vertical lane: leave the source
 * rightward, run along the lane, then enter the target from the left. Returns
 * `undefined` when the lane would violate clearance or hit another work, so the
 * caller can fall back to the ordinary route.
 */
export function routeThroughLane(
  sourceId: string,
  targetId: string,
  sourcePoint: Point,
  targetPoint: Point,
  laneX: number,
  connection: Connection = "primary",
): Point[] | undefined {
  const source = rectById.get(sourceId);
  const target = rectById.get(targetId);
  if (!source || !target) return undefined;

  const sourceRight = source.x + source.w;
  if (laneX < sourceRight + minExitRunFor(connection)) return undefined;
  if (laneX > target.x - minRunFor(connection)) return undefined;

  const points: Point[] =
    sourcePoint.y === targetPoint.y
      ? [sourcePoint, targetPoint]
      : [
          sourcePoint,
          { x: laneX, y: sourcePoint.y },
          { x: laneX, y: targetPoint.y },
          targetPoint,
        ];

  const obstacles = obstaclesFor(source, target);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (const obstacle of obstacles) {
      if (segmentHitsRect(a.x, a.y, b.x, b.y, obstacle)) return undefined;
    }
  }

  return simplify(points, sourcePoint, targetPoint);
}

/**
 * A* from `startPoint` to `goalPoint` over the node-boundary grid. The start
 * leaves rightward, the goal may be reached from any direction (the caller
 * appends the final straight run into the box), and the goal itself is exempt
 * from obstacle checks so it can sit exactly on a clearance band's edge.
 */
function routeTrunk(
  startPoint: Point,
  goalPoint: Point,
  obstacles: Rect[],
): Point[] {
  const xs = midpoints([
    ...rects.flatMap((rect) => [rect.x, rect.x + rect.w]),
    startPoint.x,
    goalPoint.x,
  ]);
  const ys = midpoints([
    ...rects.flatMap((rect) => [rect.y, rect.y + rect.h]),
    startPoint.y,
    goalPoint.y,
  ]);

  const nx = xs.length;
  const ny = ys.length;

  const sxi = xs.indexOf(startPoint.x);
  const syi = ys.indexOf(startPoint.y);
  const gxi = xs.indexOf(goalPoint.x);
  const gyi = ys.indexOf(goalPoint.y);

  if (sxi < 0 || syi < 0 || gxi < 0 || gyi < 0) {
    return [];
  }

  const cell = (xi: number, yi: number): number => yi * nx + xi;
  const start = cell(sxi, syi);
  const goal = cell(gxi, gyi);

  const pointAt = (xi: number, yi: number): Point => ({
    x: xs[xi],
    y: ys[yi],
  });

  const freePoint = (xi: number, yi: number): boolean => {
    if (cell(xi, yi) === goal) return true;
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
    return Math.abs(xs[xi] - xs[gxi]) + Math.abs(ys[yi] - ys[gyi]);
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
    const isStart = current.cell === start;

    for (let dir = 0; dir < 4; dir++) {
      const nxi = xi + DX[dir];
      const nyi = yi + DY[dir];
      if (nxi < 0 || nxi >= nx || nyi < 0 || nyi >= ny) continue;

      const nextCell = cell(nxi, nyi);
      // The start must leave rightward (never back into its own clearance
      // band); the goal may be reached from any direction.
      if (isStart && dir !== 1) continue;

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
    return [];
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

  return cells.map((c) => pointAt(c % nx, Math.floor(c / nx)));
}

function fallbackPath(source: Point, target: Point): Point[] {
  return [
    source,
    { x: (source.x + target.x) / 2, y: source.y },
    { x: (source.x + target.x) / 2, y: target.y },
    target,
  ];
}

/**
 * Direct two-turn path for a horizontally adjacent pair with a gap too small to
 * fit full clearance on both ends. It turns as close to the source as a clean
 * bend allows and gives the remainder to a straight entry into the target.
 */
function tightPath(
  sourceRight: number,
  targetX: number,
  sourcePoint: Point,
  targetPoint: Point,
  connection: Connection,
): Point[] {
  if (sourcePoint.y === targetPoint.y) {
    return [sourcePoint, targetPoint];
  }
  const gap = targetX - sourceRight;
  const exitRun = Math.max(
    minExitRunFor(connection),
    gap - minRunFor(connection),
  );
  const turnX = sourceRight + exitRun;
  return [
    sourcePoint,
    { x: turnX, y: sourcePoint.y },
    { x: turnX, y: targetPoint.y },
    targetPoint,
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

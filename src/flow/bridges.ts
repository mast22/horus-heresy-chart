/**
 * Bridge rendering for crossing primary connections.
 *
 * The red (`primary`) links are thick solid strokes. When a horizontal red link
 * crosses a vertical one, the horizontal reads as the road on top: the lower
 * link is interrupted for a short span at the crossing so the pair looks like an
 * overpass instead of one line cutting through the other.
 *
 * Routes and crossing gaps come from the same module so the break always lands
 * on the exact segment the renderer draws.
 */

import { buildChartGraph, type ChartEdge, type ChartWork } from "./chart.ts";
import { computePorts, type Ports, portFraction } from "./ports.ts";
import { type Point, routeThroughLane, routeWorkEdge } from "./routing.ts";

/** Total width of the break in the lower line at a bridge. */
export const BRIDGE_GAP = 18;

/**
 * How far a bridge point may sit from the rendered vertical segment's x. The
 * renderer and the checks share the same routes, so this only guards against
 * sub-pixel drift, never against a different lane.
 */
const MATCH_TOLERANCE = 2;

type Segment = { a: Point; b: Point };

let cachedRoutes: Map<string, Point[]> | undefined;
let cachedBridges: Map<string, Point[]> | undefined;

/** Route every edge once from the same port math the chart paints with. */
export function chartRoutes(): Map<string, Point[]> {
  cachedRoutes ??= buildRoutes();
  return cachedRoutes;
}

/** Bridge points per edge: the vertical link that should break under each crossing. */
export function primaryBridgeGaps(): Map<string, Point[]> {
  cachedBridges ??= buildBridgeGaps();
  return cachedBridges;
}

/**
 * Split an axis-aligned route into the pieces that survive the bridge gaps. The
 * pieces are contiguous runs of the original polyline; rendering each one leaves
 * an empty span where the lower line passes under a horizontal link.
 */
export function splitAtBridges(
  points: readonly Point[],
  bridges: readonly Point[],
  gap = BRIDGE_GAP,
): Point[][] {
  if (points.length < 2 || bridges.length === 0) {
    return [points.slice()];
  }

  const pieces: Point[][] = [];
  let current: Point[] = [points[0]];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];

    if (a.x !== b.x || a.y === b.y) {
      current.push(b);
      continue;
    }

    const dir = b.y > a.y ? 1 : -1;
    const length = Math.abs(b.y - a.y);
    const cuts = bridges
      .filter((bridge) => Math.abs(bridge.x - a.x) <= MATCH_TOLERANCE)
      .map((bridge) => (bridge.y - a.y) * dir)
      .filter((at) => at > 0 && at < length)
      .sort((left, right) => left - right);

    const half = gap / 2;
    let cursor = 0;

    for (const at of cuts) {
      const start = Math.max(at - half, cursor);
      const end = Math.min(at + half, length);
      if (end <= start) continue;

      if (start > cursor) {
        current.push(pointAlong(a, dir, start));
      }
      if (current.length >= 2) {
        pieces.push(current);
      }
      current = [pointAlong(a, dir, end)];
      cursor = end;
    }

    const last = current[current.length - 1];
    if (last.x !== b.x || last.y !== b.y) {
      current.push(b);
    }
  }

  if (current.length >= 2) {
    pieces.push(current);
  }

  return pieces.length > 0 ? pieces : [points.slice()];
}

type Endpoints = { source: Point; target: Point };

function buildRoutes(): Map<string, Point[]> {
  const { works, edges } = buildChartGraph();
  const worksById = new Map(works.map((work) => [work.id, work]));
  const ports = computePorts(works, edges);

  const endpoints = new Map<string, Endpoints>();
  for (const edge of edges) {
    const source = worksById.get(edge.source);
    const target = worksById.get(edge.target);
    if (!source || !target) continue;
    endpoints.set(edge.id, {
      source: sourcePoint(source, edge, ports),
      target: targetPoint(target, edge, ports),
    });
  }

  const baseline = new Map<string, Point[]>();
  for (const edge of edges) {
    const points = endpoints.get(edge.id);
    if (!points) continue;
    baseline.set(
      edge.id,
      routeWorkEdge(edge.source, edge.target, points.source, points.target),
    );
  }

  // First merge the links that leave one box, then the links that feed one box.
  // The target pass wins when an edge belongs to both, so convergence happens
  // immediately before the box the arrows enter.
  const routes = new Map(baseline);
  applyBundles("source", edges, endpoints, baseline, routes);
  applyBundles("target", edges, endpoints, baseline, routes);
  return routes;
}

/**
 * Give same-colour links that touch one box a shared vertical lane. The lane is
 * taken from the ordinary routes, so it is already clear of every work; the
 * first candidate that every member can reach safely is used.
 */
function applyBundles(
  side: "source" | "target",
  edges: readonly ChartEdge[],
  endpoints: ReadonlyMap<string, Endpoints>,
  baseline: ReadonlyMap<string, Point[]>,
  routes: Map<string, Point[]>,
): void {
  for (const group of groupsOf(edges, side)) {
    if (group.length < 2) continue;

    const members = group.filter((edge) => endpoints.has(edge.id));
    if (members.length < 2) continue;

    const lanes = candidateLanes(members, baseline);
    for (const lane of lanes) {
      const rebuilt = members.map((edge) => {
        const points = endpoints.get(edge.id);
        return points
          ? routeThroughLane(
              edge.source,
              edge.target,
              points.source,
              points.target,
              lane,
            )
          : undefined;
      });

      if (rebuilt.some((route) => route === undefined)) continue;

      for (let index = 0; index < members.length; index++) {
        const route = rebuilt[index];
        if (route) routes.set(members[index].id, route);
      }
      break;
    }
  }
}

function groupsOf(
  edges: readonly ChartEdge[],
  side: "source" | "target",
): ChartEdge[][] {
  const groups = new Map<string, ChartEdge[]>();
  for (const edge of edges) {
    const node = side === "source" ? edge.source : edge.target;
    const key = `${edge.connection}|${node}`;
    const group = groups.get(key) ?? [];
    group.push(edge);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Vertical lanes used by a group's ordinary routes, most common first. */
function candidateLanes(
  members: readonly ChartEdge[],
  baseline: ReadonlyMap<string, Point[]>,
): number[] {
  const counts = new Map<number, number>();
  for (const edge of members) {
    const route = baseline.get(edge.id) ?? [];
    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i];
      const b = route[i + 1];
      if (a.x === b.x && a.y !== b.y) {
        counts.set(a.x, (counts.get(a.x) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([lane]) => lane);
}

function sourcePoint(source: ChartWork, edge: ChartEdge, ports: Ports): Point {
  return {
    x: source.x + source.w,
    y:
      source.y +
      source.h * portFraction(ports.source, source.id, edge.connection),
  };
}

function targetPoint(target: ChartWork, edge: ChartEdge, ports: Ports): Point {
  return {
    x: target.x,
    y:
      target.y +
      target.h * portFraction(ports.target, target.id, edge.connection),
  };
}

function buildBridgeGaps(): Map<string, Point[]> {
  const { edges } = buildChartGraph();
  const routes = chartRoutes();
  const verticals: Array<{ edgeId: string; segment: Segment }> = [];
  const horizontals: Array<{ edgeId: string; segment: Segment }> = [];

  for (const edge of edges) {
    if (edge.connection !== "primary") continue;
    const route = routes.get(edge.id);
    if (!route) continue;

    for (const segment of segmentsOf(route)) {
      if (segment.a.x === segment.b.x) {
        verticals.push({ edgeId: edge.id, segment });
      } else {
        horizontals.push({ edgeId: edge.id, segment });
      }
    }
  }

  const gaps = new Map<string, Point[]>();

  for (const vertical of verticals) {
    for (const horizontal of horizontals) {
      if (vertical.edgeId === horizontal.edgeId) continue;

      const point = crossingPoint(vertical.segment, horizontal.segment);
      if (!point) continue;

      const bridges = gaps.get(vertical.edgeId) ?? [];
      if (!bridges.some((bridge) => samePoint(bridge, point))) {
        bridges.push(point);
      }
      gaps.set(vertical.edgeId, bridges);
    }
  }

  return gaps;
}

/** All non-zero axis-aligned segments of an orthogonal route. */
function segmentsOf(points: readonly Point[]): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a.x !== b.x || a.y !== b.y) {
      segments.push({ a, b });
    }
  }
  return segments;
}

/** Interior crossing of a vertical segment and a horizontal one. */
function crossingPoint(vertical: Segment, horizontal: Segment): Point | null {
  const x = vertical.a.x;
  const y = horizontal.a.y;
  const betweenX =
    x > Math.min(horizontal.a.x, horizontal.b.x) &&
    x < Math.max(horizontal.a.x, horizontal.b.x);
  const betweenY =
    y > Math.min(vertical.a.y, vertical.b.y) &&
    y < Math.max(vertical.a.y, vertical.b.y);
  return betweenX && betweenY ? { x, y } : null;
}

function pointAlong(origin: Point, dir: number, distance: number): Point {
  return { x: origin.x, y: origin.y + dir * distance };
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

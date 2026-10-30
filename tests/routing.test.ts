import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildChartGraph,
  type ChartEdge,
  type ChartWork,
  type Connection,
} from "../src/flow/chart.ts";
import {
  MIN_EXIT_RUN,
  MIN_RUN,
  type Point,
  routeWorkEdge,
} from "../src/flow/routing.ts";

type Rect = { x: number; y: number; w: number; h: number };

const graph = buildChartGraph();
const worksById = new Map<string, ChartWork>(
  graph.works.map((work) => [work.id, work]),
);

const PORT_TOPS = [0.5, 0.25, 0.75] as const;
const CONNECTION_ORDER: Record<Connection, number> = {
  primary: 0,
  secondary: 1,
  tertiary: 2,
};

/**
 * Poster-accurate overlaps where a shortcut badge (30x30) sits on top of a
 * full-size work, so its edge unavoidably starts inside that work. The router
 * cannot avoid the overlap without moving the badge in `src/flow/chart.ts`.
 */
const KNOWN_CROSSINGS = new Set(["s123-badge-8-scars:the-thirteenth-wolf"]);

function groupEdges(
  key: (edge: ChartEdge) => string,
): Map<string, ChartEdge[]> {
  const groups = new Map<string, ChartEdge[]>();
  for (const edge of graph.edges) {
    const group = groups.get(key(edge)) ?? [];
    group.push(edge);
    groups.set(key(edge), group);
  }
  return groups;
}

const outgoing = groupEdges((edge) => edge.source);
const incoming = groupEdges((edge) => edge.target);

function portTop(
  groups: Map<string, ChartEdge[]>,
  nodeId: string,
  connection: Connection,
): number {
  const edges = groups.get(nodeId) ?? [];
  const distinct = [...new Set(edges.map((edge) => edge.connection))].sort(
    (a, b) => CONNECTION_ORDER[a] - CONNECTION_ORDER[b],
  );
  const index = distinct.indexOf(connection);
  return PORT_TOPS[index] ?? 0.5;
}

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

type RouteFailure = {
  edge: ChartEdge;
  route: Point[];
};

const routes: RouteFailure[] = graph.edges.map((edge) => {
  const source = worksById.get(edge.source);
  const target = worksById.get(edge.target);
  assert.ok(source, `missing source work ${edge.source}`);
  assert.ok(target, `missing target work ${edge.target}`);

  const sourcePoint: Point = {
    x: source.x + source.w,
    y: source.y + source.h * portTop(outgoing, edge.source, edge.connection),
  };
  const targetPoint: Point = {
    x: target.x,
    y: target.y + target.h * portTop(incoming, edge.target, edge.connection),
  };

  return {
    edge,
    route: routeWorkEdge(edge.source, edge.target, sourcePoint, targetPoint),
  };
});

function routedRoutes(): RouteFailure[] {
  return routes.filter(({ route }) => route.length >= 2);
}

function edgeName({ edge }: RouteFailure): string {
  return `${edge.id} ${edge.source} -> ${edge.target}`;
}

describe("routing geometry", () => {
  it("routes every edge", () => {
    const unrouted = routes.filter(({ route }) => route.length < 2);
    assert.deepEqual(
      unrouted.map(edgeName),
      [],
      `${unrouted.length} edges have fewer than two points`,
    );
  });

  it("leaves every source rightward", () => {
    const failures = routedRoutes().filter(({ route }) => {
      const [first, second] = route;
      return !(second.x > first.x && second.y === first.y);
    });
    assert.deepEqual(
      failures.map(edgeName),
      [],
      `${failures.length} edges leave their source non-rightward`,
    );
  });

  it("enters every target from the left", () => {
    const failures = routedRoutes().filter(({ route }) => {
      const secondLast = route[route.length - 2];
      const last = route[route.length - 1];
      return !(last.x > secondLast.x && last.y === secondLast.y);
    });
    assert.deepEqual(
      failures.map(edgeName),
      [],
      `${failures.length} edges enter their target from a non-left side`,
    );
  });

  it(`turns 90° at least ${MIN_RUN}px before every target`, () => {
    const failures = routedRoutes().filter(({ route }) => {
      const secondLast = route[route.length - 2];
      const last = route[route.length - 1];
      return last.x - secondLast.x < MIN_RUN;
    });
    assert.deepEqual(
      failures.map(({ edge, route }) => {
        const secondLast = route[route.length - 2];
        const last = route[route.length - 1];
        return `${edgeName({ edge, route })}: ${last.x - secondLast.x}px`;
      }),
      [],
      `${failures.length} entries have less than ${MIN_RUN}px of clearance`,
    );
  });

  it(`keeps ${MIN_EXIT_RUN}px of room for every exit bend`, () => {
    const failures = routedRoutes().filter(({ route }) => {
      const [first, second] = route;
      return second.x - first.x < MIN_EXIT_RUN;
    });
    assert.deepEqual(
      failures.map(({ edge, route }) => {
        const [first, second] = route;
        return `${edgeName({ edge, route })}: ${second.x - first.x}px`;
      }),
      [],
      `${failures.length} exits have less than ${MIN_EXIT_RUN}px of clearance`,
    );
  });

  it("avoids every work it does not connect to", () => {
    const crossings: string[] = [];
    for (const { edge, route } of routedRoutes()) {
      for (const work of graph.works) {
        if (work.id === edge.source || work.id === edge.target) {
          continue;
        }
        const rect: Rect = { x: work.x, y: work.y, w: work.w, h: work.h };
        const hits = route.some((point, index) => {
          const next = route[index + 1];
          return (
            next !== undefined &&
            segmentHitsRect(point.x, point.y, next.x, next.y, rect)
          );
        });
        if (hits) {
          crossings.push(`${edge.id}:${work.id}`);
        }
      }
    }

    const unexpected = crossings.filter((key) => !KNOWN_CROSSINGS.has(key));
    assert.deepEqual(
      unexpected,
      [],
      `${crossings.length} crossings, ${unexpected.length} unexpected`,
    );
  });
});

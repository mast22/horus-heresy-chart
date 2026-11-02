import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chartRoutes } from "../src/flow/bridges.ts";
import {
  buildChartGraph,
  type ChartEdge,
  type ChartWork,
} from "../src/flow/chart.ts";
import { MIN_EXIT_RUN, MIN_RUN, type Point } from "../src/flow/routing.ts";

type Rect = { x: number; y: number; w: number; h: number };

const graph = buildChartGraph();
const worksById = new Map<string, ChartWork>(
  graph.works.map((work) => [work.id, work]),
);

/**
 * Poster-accurate overlaps where a shortcut badge (30x30) sits on top of a
 * full-size work, so its edge unavoidably starts inside that work. The router
 * cannot avoid the overlap without moving the badge in `src/flow/chart.ts`.
 */
const KNOWN_CROSSINGS = new Set(["s123-badge-8-scars:the-thirteenth-wolf"]);

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

const bundledRoutes = chartRoutes();

const routes: RouteFailure[] = graph.edges.map((edge) => {
  assert.ok(worksById.has(edge.source), `missing source work ${edge.source}`);
  assert.ok(worksById.has(edge.target), `missing target work ${edge.target}`);

  return {
    edge,
    route: bundledRoutes.get(edge.id) ?? [],
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

  it("routes every shortcut connection as a straight line", () => {
    const failures = routedRoutes().filter(({ edge, route }) => {
      const source = worksById.get(edge.source);
      const target = worksById.get(edge.target);
      const isShortcut =
        source?.kind === "shortcut" || target?.kind === "shortcut";
      if (!isShortcut || !source || !target) {
        return false;
      }
      // A badge stacked directly under its work has to leave the right side,
      // so a bend is unavoidable; a badge on a horizontal line must not bend.
      if (target.x <= source.x) {
        return false;
      }
      const y = route[0].y;
      return route.some((point) => point.y !== y);
    });
    assert.deepEqual(
      failures.map(edgeName),
      [],
      `${failures.length} shortcut connections bend`,
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
        // Shortcut badges annotate an endpoint and may sit on the line, so
        // they are not routing obstacles like full-size works are.
        if (work.kind === "shortcut") {
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

type Vertical = { x: number; top: number; bottom: number };

function verticals(route: readonly Point[]): Vertical[] {
  const segments: Vertical[] = [];
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    if (a.x === b.x && a.y !== b.y) {
      segments.push({
        x: a.x,
        top: Math.min(a.y, b.y),
        bottom: Math.max(a.y, b.y),
      });
    }
  }
  return segments;
}

/** The x where two routes run a shared vertical trunk, if they do. */
function sharedVerticalLane(
  a: readonly Point[],
  b: readonly Point[],
): number | undefined {
  for (const left of verticals(a)) {
    for (const right of verticals(b)) {
      if (
        left.x === right.x &&
        Math.min(left.bottom, right.bottom) > Math.max(left.top, right.top)
      ) {
        return left.x;
      }
    }
  }
  return undefined;
}

describe("trunk bundling", () => {
  function routeOf(edgeId: string): Point[] {
    const route = bundledRoutes.get(edgeId);
    assert.ok(route, `missing route ${edgeId}`);
    return route;
  }

  it("merges same-colour edges that leave one source", () => {
    const trunks = [
      {
        name: "The Flight of the Eisenstein spine",
        a: routeOf(
          "m-the-flight-of-the-eisenstein-the-last-remembrancer-ancer-16",
        ),
        b: routeOf("m-the-flight-of-the-eisenstein-child-ofnight"),
      },
      {
        name: "The Master of Mankind downward branch",
        a: routeOf("p166-the-maste-f-mankin-magisterium"),
        b: routeOf("m-the-maste-f-mankin-the-binary-succession"),
      },
    ];

    for (const { name, a, b } of trunks) {
      assert.notEqual(
        sharedVerticalLane(a, b),
        undefined,
        `${name} draws parallel trunks`,
      );
    }
  });

  it("merges same-colour edges that feed one target in front of it", () => {
    const either = routeOf("m-the-either-old-earth");
    const handElect = routeOf("m-the-hand-elect-old-earth");
    const lane = sharedVerticalLane(either, handElect);

    assert.notEqual(lane, undefined, "Old Earth approaches never merge");

    const hand = worksById.get("the-hand-elect");
    assert.ok(hand);
    assert.ok(
      (lane ?? 0) > hand.x + hand.w,
      "The Either joins behind The Hand Elect instead of in front of it",
    );
  });
});

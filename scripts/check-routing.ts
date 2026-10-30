/**
 * Routing geometry regression checks.
 *
 * Verifies the contract of `src/flow/routing.ts`: every edge leaves its source
 * rightward, enters its target from the left, never passes through a work it
 * does not connect to, and turns 90° with enough clearance before each box so
 * the arrowhead does not fold over its own bend. It also checks that ports fan
 * out toward their links and that horizontal red links bridge vertical ones.
 * Run with:
 *
 *   node --experimental-strip-types scripts/check-routing.ts
 */

import {
  BRIDGE_GAP,
  primaryBridgeGaps,
  splitAtBridges,
} from "../src/flow/bridges.ts";
import {
  buildChartGraph,
  type ChartWork,
  type Connection,
} from "../src/flow/chart.ts";
import { computePorts, portFraction } from "../src/flow/ports.ts";
import {
  MIN_EXIT_RUN,
  MIN_RUN,
  type Point,
  routeWorkEdge,
} from "../src/flow/routing.ts";

const graph = buildChartGraph();

const lines: string[] = [];
const failures: string[] = [];

function check(name: string, ok: boolean, detail: string) {
  lines.push(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
  if (!ok) {
    failures.push(name);
  }
}

type Rect = { x: number; y: number; w: number; h: number };

const worksById = new Map<string, ChartWork>(
  graph.works.map((work) => [work.id, work]),
);

const ports = computePorts(graph.works, graph.edges);

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

/**
 * Poster-accurate overlaps where a shortcut badge (30×30) sits on top of a
 * full-size work, so its edge unavoidably starts inside that work. The router
 * cannot avoid the overlap without moving the badge in `src/flow/chart.ts`.
 */
const KNOWN_CROSSINGS = new Set(["s123-badge-8-scars:the-thirteenth-wolf"]);

let routed = 0;
let badStart = 0;
let badEnd = 0;
let shortExit = 0;
let shortEntry = 0;
const crossings: string[] = [];
const primaryRoutes = new Map<string, Point[]>();

for (const edge of graph.edges) {
  const source = worksById.get(edge.source);
  const target = worksById.get(edge.target);
  if (!source || !target) continue;

  const sourcePoint: Point = {
    x: source.x + source.w,
    y:
      source.y +
      source.h * portFraction(ports.source, edge.source, edge.connection),
  };
  const targetPoint: Point = {
    x: target.x,
    y:
      target.y +
      target.h * portFraction(ports.target, edge.target, edge.connection),
  };

  const route = routeWorkEdge(
    edge.source,
    edge.target,
    sourcePoint,
    targetPoint,
  );
  routed += 1;
  if (edge.connection === "primary") {
    primaryRoutes.set(edge.id, route);
  }

  if (route.length < 2) {
    continue;
  }

  const first = route[0];
  const second = route[1];
  const secondLast = route[route.length - 2];
  const last = route[route.length - 1];

  if (!(second.x > first.x && second.y === first.y)) {
    badStart += 1;
    lines.push(`  ${edge.id} leaves ${edge.source} non-rightward`);
  }
  if (!(last.x > secondLast.x && last.y === secondLast.y)) {
    badEnd += 1;
    lines.push(`  ${edge.id} enters ${edge.target} from a non-left side`);
  }

  // Arrows must turn 90° some distance before the box, otherwise the rounded
  // corner folds over the arrowhead. The exit side only needs room for the
  // bend (no arrowhead), the entry side needs the full clearance.
  const exitRun = second.x - first.x;
  const entryRun = last.x - secondLast.x;
  if (exitRun < MIN_EXIT_RUN) {
    shortExit += 1;
    lines.push(
      `  ${edge.id} exits ${edge.source} with only ${exitRun}px of clearance`,
    );
  }
  if (entryRun < MIN_RUN) {
    shortEntry += 1;
    lines.push(
      `  ${edge.id} enters ${edge.target} with only ${entryRun}px of clearance`,
    );
  }

  for (const work of graph.works) {
    if (work.id === edge.source || work.id === edge.target) continue;
    const rect: Rect = { x: work.x, y: work.y, w: work.w, h: work.h };
    for (let i = 0; i < route.length - 1; i++) {
      if (
        segmentHitsRect(
          route[i].x,
          route[i].y,
          route[i + 1].x,
          route[i + 1].y,
          rect,
        )
      ) {
        crossings.push(`${edge.id}:${work.id}`);
        break;
      }
    }
  }
}

check(
  "every edge routes",
  routed === graph.edges.length,
  `${routed} of ${graph.edges.length} routed`,
);
check(
  "edges leave the source rightward",
  badStart === 0,
  `${badStart} non-rightward starts`,
);
check(
  "edges enter the target from the left",
  badEnd === 0,
  `${badEnd} non-left entries`,
);
check(
  "edges turn 90° before the box (entry clearance)",
  shortEntry === 0,
  `${shortEntry} entries with less than ${MIN_RUN}px clearance`,
);
check(
  "edges have room for the exit bend",
  shortExit === 0,
  `${shortExit} exits with less than ${MIN_EXIT_RUN}px clearance`,
);

const unexpected = crossings.filter((key) => !KNOWN_CROSSINGS.has(key));
check(
  "edges avoid unrelated works",
  unexpected.length === 0,
  `${crossings.length} crossings, ${unexpected.length} unexpected`,
);
for (const key of unexpected) {
  lines.push(`  unexpected crossing ${key}`);
}
for (const key of crossings) {
  if (KNOWN_CROSSINGS.has(key)) {
    lines.push(`  known badge-overlap crossing ${key}`);
  }
}

function centerY(work: ChartWork | undefined): number {
  return work ? work.y + work.h / 2 : 0;
}

let primaryOffCentre = 0;
let singlePortOffCentre = 0;
let wrongPortSide = 0;
let outOfOrderPorts = 0;

for (const sideName of ["source", "target"] as const) {
  for (const [nodeId, slots] of ports[sideName]) {
    const node = worksById.get(nodeId);
    if (!node) continue;
    const centre = node.y + node.h / 2;

    if (slots.length === 1) {
      if (slots[0].fraction !== 0.5) singlePortOffCentre += 1;
      continue;
    }

    const primary = slots.find((slot) => slot.connection === "primary");
    if (primary && primary.fraction !== 0.5) primaryOffCentre += 1;

    const farY = new Map<Connection, number>();
    for (const slot of slots) {
      if (slot.connection === "primary") continue;

      const incident = graph.edges.filter(
        (edge) =>
          (sideName === "source" ? edge.source : edge.target) === nodeId &&
          edge.connection === slot.connection,
      );
      const average =
        incident.reduce(
          (sum, edge) =>
            sum +
            centerY(
              worksById.get(sideName === "source" ? edge.target : edge.source),
            ),
          0,
        ) / incident.length;
      farY.set(slot.connection, average);

      if (slot.fraction < 0.5 !== average < centre) {
        wrongPortSide += 1;
      }
    }

    for (const half of [
      slots
        .filter((slot) => slot.connection !== "primary" && slot.fraction < 0.5)
        .sort((a, b) => a.fraction - b.fraction),
      slots
        .filter((slot) => slot.connection !== "primary" && slot.fraction > 0.5)
        .sort((a, b) => a.fraction - b.fraction),
    ]) {
      for (let i = 1; i < half.length; i++) {
        const previous = farY.get(half[i - 1].connection) ?? 0;
        const current = farY.get(half[i].connection) ?? 0;
        if (previous > current) outOfOrderPorts += 1;
      }
    }
  }
}

check(
  "primary ports keep the node centre",
  primaryOffCentre === 0,
  `${primaryOffCentre} primary ports off centre`,
);
check(
  "single-colour ports stay centred",
  singlePortOffCentre === 0,
  `${singlePortOffCentre} single-colour ports off centre`,
);
check(
  "multi-colour ports follow their link's vertical side",
  wrongPortSide === 0,
  `${wrongPortSide} ports on the wrong side`,
);
check(
  "ports keep the vertical order of their links",
  outOfOrderPorts === 0,
  `${outOfOrderPorts} out-of-order ports`,
);

type RouteSegment = { edgeId: string; a: Point; b: Point };

const verticalSegments: RouteSegment[] = [];
const horizontalSegments: RouteSegment[] = [];

for (const [edgeId, route] of primaryRoutes) {
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    if (a.x === b.x && a.y !== b.y) {
      verticalSegments.push({ edgeId, a, b });
    } else if (a.y === b.y && a.x !== b.x) {
      horizontalSegments.push({ edgeId, a, b });
    }
  }
}

const bridgeGaps = primaryBridgeGaps();
let primaryCrossings = 0;
const missingBridges: string[] = [];

for (const vertical of verticalSegments) {
  for (const horizontal of horizontalSegments) {
    if (vertical.edgeId === horizontal.edgeId) continue;

    const y = horizontal.a.y;
    const x = vertical.a.x;
    const crosses =
      y > Math.min(vertical.a.y, vertical.b.y) &&
      y < Math.max(vertical.a.y, vertical.b.y) &&
      x > Math.min(horizontal.a.x, horizontal.b.x) &&
      x < Math.max(horizontal.a.x, horizontal.b.x);
    if (!crosses) continue;

    primaryCrossings += 1;
    const bridges = bridgeGaps.get(vertical.edgeId) ?? [];
    if (!bridges.some((bridge) => bridge.x === x && bridge.y === y)) {
      missingBridges.push(`${vertical.edgeId}@${x},${y}`);
    }
  }
}

check(
  "horizontal red links bridge over vertical ones",
  primaryCrossings > 0 && missingBridges.length === 0,
  `${primaryCrossings} crossings, ${missingBridges.length} without a bridge`,
);
for (const key of missingBridges) {
  lines.push(`  missing bridge ${key}`);
}

const misplacedBridges: string[] = [];
const bridgesStillPainted: string[] = [];

for (const [edgeId, bridges] of bridgeGaps) {
  const route = primaryRoutes.get(edgeId) ?? [];
  const verticals = verticalSegments.filter(
    (segment) => segment.edgeId === edgeId,
  );

  for (const bridge of bridges) {
    const onVertical = verticals.some(
      (segment) =>
        segment.a.x === bridge.x &&
        bridge.y > Math.min(segment.a.y, segment.b.y) &&
        bridge.y < Math.max(segment.a.y, segment.b.y),
    );
    if (!onVertical) {
      misplacedBridges.push(`${edgeId}@${bridge.x},${bridge.y}`);
    }
  }

  for (const piece of splitAtBridges(route, bridges)) {
    for (let i = 0; i < piece.length - 1; i++) {
      const a = piece[i];
      const b = piece[i + 1];
      if (a.x !== b.x) continue;
      for (const bridge of bridges) {
        const covers =
          Math.abs(a.x - bridge.x) <= 2 &&
          bridge.y >= Math.min(a.y, b.y) &&
          bridge.y <= Math.max(a.y, b.y);
        if (covers) {
          bridgesStillPainted.push(`${edgeId}@${bridge.x},${bridge.y}`);
        }
      }
    }
  }
}

check(
  "every bridge sits on the vertical link it interrupts",
  misplacedBridges.length === 0,
  `${misplacedBridges.length} misplaced bridges`,
);
for (const key of misplacedBridges) {
  lines.push(`  misplaced bridge ${key}`);
}
check(
  "bridge gaps remove the lower link under the crossing",
  bridgesStillPainted.length === 0,
  `${bridgesStillPainted.length} bridges still painted`,
);
for (const key of bridgesStillPainted) {
  lines.push(`  bridge still painted ${key}`);
}
check(
  "bridge gap leaves a visible break",
  BRIDGE_GAP >= 16,
  `${BRIDGE_GAP}px break`,
);

lines.push("");
lines.push(
  failures.length === 0 ? "RESULT pass" : `RESULT fail ${failures.join(", ")}`,
);
console.log(lines.join("\n"));
if (failures.length > 0) {
  process.exitCode = 1;
}

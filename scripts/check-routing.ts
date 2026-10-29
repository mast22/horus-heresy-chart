/**
 * Routing geometry regression checks.
 *
 * Verifies the contract of `src/flow/routing.ts`: every edge leaves its source
 * rightward, enters its target from the left, never passes through a work it
 * does not connect to, and turns 90° with enough clearance before each box so
 * the arrowhead does not fold over its own bend. Run with:
 *
 *   node --experimental-strip-types scripts/check-routing.ts
 */

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

// Mirrors the component's port assignment: the first distinct connection on a
// side sits at 50%, the second at 25%, the third at 75%.
const PORT_TOPS = [0.5, 0.25, 0.75] as const;
const CONNECTION_ORDER: Record<Connection, number> = {
  primary: 0,
  secondary: 1,
  tertiary: 2,
};

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

for (const edge of graph.edges) {
  const source = worksById.get(edge.source);
  const target = worksById.get(edge.target);
  if (!source || !target) continue;

  const sourcePoint: Point = {
    x: source.x + source.w,
    y: source.y + source.h * portTop(outgoing, edge.source, edge.connection),
  };
  const targetPoint: Point = {
    x: target.x,
    y: target.y + target.h * portTop(incoming, edge.target, edge.connection),
  };

  const route = routeWorkEdge(
    edge.source,
    edge.target,
    sourcePoint,
    targetPoint,
  );
  routed += 1;

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

lines.push("");
lines.push(
  failures.length === 0 ? "RESULT pass" : `RESULT fail ${failures.join(", ")}`,
);
console.log(lines.join("\n"));
if (failures.length > 0) {
  process.exitCode = 1;
}

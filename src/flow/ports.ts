/**
 * Port assignment shared by the chart renderer and the geometry checks.
 *
 * A work exposes one port per distinct connection colour on each side. When a
 * side carries more than one colour, the ports fan out toward where their links
 * come from: a link whose far end sits above the node gets a port above the
 * centre, one below gets a port below. Primary links always keep the centre.
 *
 * A side with a single colour has nothing to fan out against, so its port stays
 * centred regardless of colour.
 */

import type { ChartEdge, ChartWork, Connection } from "./chart.ts";

export const CONNECTION_ORDER: Record<Connection, number> = {
  primary: 0,
  secondary: 1,
  tertiary: 2,
};

export type PortSlot = { connection: Connection; fraction: number };

export type Ports = {
  source: Map<string, PortSlot[]>;
  target: Map<string, PortSlot[]>;
};

/** Collect the port assignment on each side of every node. */
export function computePorts(
  works: readonly ChartWork[],
  edges: readonly ChartEdge[],
): Ports {
  const worksById = new Map(works.map((work) => [work.id, work]));

  return {
    source: sidePorts(worksById, edges, "source"),
    target: sidePorts(worksById, edges, "target"),
  };
}

/** Vertical fraction of a node side where a connection's port sits. */
export function portFraction(
  side: Map<string, PortSlot[]>,
  nodeId: string,
  connection: Connection,
): number {
  const slot = (side.get(nodeId) ?? []).find(
    (candidate) => candidate.connection === connection,
  );
  return slot?.fraction ?? 0.5;
}

function sidePorts(
  worksById: ReadonlyMap<string, ChartWork>,
  edges: readonly ChartEdge[],
  side: "source" | "target",
): Map<string, PortSlot[]> {
  const nodeIdOf = (edge: ChartEdge): string =>
    side === "source" ? edge.source : edge.target;
  const farNodeOf = (edge: ChartEdge): string =>
    side === "source" ? edge.target : edge.source;

  const grouped = groupBy(edges, nodeIdOf);
  const ports = new Map<string, PortSlot[]>();

  for (const [nodeId, incident] of grouped) {
    const node = worksById.get(nodeId);
    if (!node) continue;

    const center = node.y + node.h / 2;
    const colors = [...new Set(incident.map((edge) => edge.connection))].sort(
      (a, b) => CONNECTION_ORDER[a] - CONNECTION_ORDER[b],
    );

    if (colors.length === 1) {
      ports.set(nodeId, [{ connection: colors[0], fraction: 0.5 }]);
      continue;
    }

    const above: Array<{ connection: Connection; y: number }> = [];
    const below: Array<{ connection: Connection; y: number }> = [];

    for (const connection of colors) {
      if (connection === "primary") continue;

      const farY = average(
        incident
          .filter((edge) => edge.connection === connection)
          .map((edge) => centerOf(worksById.get(farNodeOf(edge)))),
      );

      const entry = { connection, y: farY };
      if (farY < center) {
        above.push(entry);
      } else {
        below.push(entry);
      }
    }

    above.sort((a, b) => a.y - b.y);
    below.sort((a, b) => a.y - b.y);

    const slots: PortSlot[] = [];
    if (colors.includes("primary")) {
      slots.push({ connection: "primary", fraction: 0.5 });
    }
    slots.push(...spread(above, "upper"));
    slots.push(...spread(below, "lower"));

    slots.sort((a, b) => a.fraction - b.fraction);
    ports.set(nodeId, slots);
  }

  return ports;
}

/**
 * Spread entries across one half of the node, keeping their vertical order:
 * the topmost link gets the topmost port. The outer quarter is the far edge of
 * each half, so a lone link stays at 25% or 75%.
 */
function spread(
  entries: ReadonlyArray<{ connection: Connection; y: number }>,
  half: "upper" | "lower",
): PortSlot[] {
  const step = 0.25 / entries.length;
  return entries.map((entry, index) => ({
    connection: entry.connection,
    fraction: half === "upper" ? 0.25 + index * step : 0.5 + (index + 1) * step,
  }));
}

function centerOf(work: ChartWork | undefined): number {
  return work ? work.y + work.h / 2 : 0;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function groupBy(
  edges: readonly ChartEdge[],
  key: (edge: ChartEdge) => string,
): Map<string, ChartEdge[]> {
  const groups = new Map<string, ChartEdge[]>();
  for (const edge of edges) {
    const group = groups.get(key(edge)) ?? [];
    group.push(edge);
    groups.set(key(edge), group);
  }
  return groups;
}

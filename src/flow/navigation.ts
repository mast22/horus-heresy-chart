import { buildChartGraph, type ChartWork } from "./chart.ts";

const graph = buildChartGraph();
const worksById = new Map<string, ChartWork>(
  graph.works.map((work) => [work.id, work]),
);

/** Works a reader should read next: the targets of the primary arrows leaving a
 * work, with shortcut badges resolved to the work they stand for. */
export function nextWorkIds(workId: string): string[] {
  const next = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.source !== workId || edge.connection !== "primary") {
      continue;
    }
    next.add(worksById.get(edge.target)?.standsFor ?? edge.target);
  }
  return [...next];
}

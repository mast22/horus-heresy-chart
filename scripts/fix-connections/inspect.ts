/**
 * Inspect, assert, and validate chart connections.
 *
 * Chart direction is part of the poster data: an edge source is the box the
 * stroke leaves, and the target is the box the arrowhead enters. This script
 * makes a broken direction visible before and after a manual edit.
 *
 * Usage:
 *   node --experimental-strip-types scripts/fix-connections/inspect.ts "The Last Remembrancer"
 *   node --experimental-strip-types scripts/fix-connections/inspect.ts "last remembrancer" --out
 *   node --experimental-strip-types scripts/fix-connections/inspect.ts \
 *     --expect "The Last Remembrancer -> Ghosts Speak Not:primary" \
 *     --expect "The Last Remembrancer -> Garro:primary" \
 *     --reject "The Last Remembrancer -> Child of Night"
 *   node --experimental-strip-types scripts/fix-connections/inspect.ts --validate
 */

import {
  buildChartGraph,
  type ChartEdge,
  type ChartWork,
  type Connection,
} from "../../src/flow/chart.ts";

type Spec = {
  source: ChartWork;
  target: ChartWork;
  connection: Connection | null;
  raw: string;
};

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(2);
}

function resolve(query: string, works: readonly ChartWork[]): ChartWork {
  const exact = works.find((work) => work.id === query);
  if (exact) {
    return exact;
  }
  const lower = query.toLowerCase();
  const matches = works.filter((work) =>
    work.title.toLowerCase().includes(lower),
  );
  if (matches.length === 0) {
    fail(`no work matches "${query}"`);
  }
  if (matches.length > 1) {
    const list = matches
      .map((work) => `  ${work.id} (${work.title})`)
      .join("\n");
    fail(`"${query}" is ambiguous:\n${list}`);
  }
  return matches[0];
}

function parseSpec(raw: string, works: readonly ChartWork[]): Spec {
  const match = /^(.*?)\s*->\s*(.*?)(?::(primary|secondary|tertiary))?$/.exec(
    raw,
  );
  if (!match) {
    fail(`bad spec "${raw}", expected "Source -> Target[:class]"`);
  }
  const [, source, target, connection] = match;
  return {
    source: resolve(source.trim(), works),
    target: resolve(target.trim(), works),
    connection: (connection as Connection | undefined) ?? null,
    raw,
  };
}

function matches(edge: ChartEdge, spec: Spec): boolean {
  return (
    edge.source === spec.source.id &&
    edge.target === spec.target.id &&
    (spec.connection === null || edge.connection === spec.connection)
  );
}

function name(works: readonly ChartWork[], id: string): string {
  return works.find((work) => work.id === id)?.title ?? id;
}

function validate(graph: ReturnType<typeof buildChartGraph>): boolean {
  const ids = new Set(graph.works.map((work) => work.id));
  const edgeIds = new Set<string>();
  const triples = new Set<string>();
  const pairs = new Map<string, ChartEdge>();
  let ok = true;

  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      console.log(`FAIL dangling: ${edge.id} ${edge.source} -> ${edge.target}`);
      ok = false;
    }
    if (edge.source === edge.target) {
      console.log(`FAIL self-loop: ${edge.id} ${edge.source}`);
      ok = false;
    }
    if (edgeIds.has(edge.id)) {
      console.log(`FAIL duplicate id: ${edge.id}`);
      ok = false;
    }
    edgeIds.add(edge.id);
    const triple = `${edge.source}|${edge.target}|${edge.connection}`;
    if (triples.has(triple)) {
      console.log(`FAIL duplicate edge: ${edge.id}`);
      ok = false;
    }
    triples.add(triple);
    const pair = [edge.source, edge.target].sort().join("|");
    const reverse = pairs.get(pair);
    if (reverse) {
      console.log(
        `WARN opposite directions: ${reverse.id} and ${edge.id} (${name(
          graph.works,
          edge.source,
        )} <-> ${name(graph.works, edge.target)})`,
      );
    } else {
      pairs.set(pair, edge);
    }
  }

  console.log(
    `${ok ? "PASS" : "FAIL"} validate: ${graph.works.length} works, ${
      graph.edges.length
    } edges`,
  );
  return ok;
}

const args = process.argv.slice(2);
const graph = buildChartGraph();
const works = graph.works;
const expectations: Spec[] = [];
const rejections: Spec[] = [];
const queries: string[] = [];
let onlyOutgoing = false;
let onlyIncoming = false;
let runValidation = false;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--expect") {
    expectations.push(parseSpec(args[++index] ?? "", works));
  } else if (arg === "--reject") {
    rejections.push(parseSpec(args[++index] ?? "", works));
  } else if (arg === "--out") {
    onlyOutgoing = true;
  } else if (arg === "--in") {
    onlyIncoming = true;
  } else if (arg === "--validate") {
    runValidation = true;
  } else if (arg.startsWith("-")) {
    fail(`unknown option ${arg}`);
  } else {
    queries.push(arg);
  }
}

let ok = true;

if (runValidation) {
  ok = validate(graph) && ok;
}

for (const query of queries) {
  const work = resolve(query, works);
  console.log(`${work.title} [${work.id}]`);
  const relevant = graph.edges.filter((edge) => {
    if (edge.source !== work.id && edge.target !== work.id) {
      return false;
    }
    if (onlyOutgoing) {
      return edge.source === work.id;
    }
    if (onlyIncoming) {
      return edge.target === work.id;
    }
    return true;
  });
  if (relevant.length === 0) {
    console.log("  (no connections)");
  }
  for (const edge of relevant) {
    const outgoing = edge.source === work.id;
    const other = outgoing ? edge.target : edge.source;
    console.log(
      `  ${outgoing ? "out" : "in "} ${edge.connection.padEnd(9)} ${
        outgoing ? "->" : "<-"
      } ${name(works, other)} (${other}) [${edge.id}]`,
    );
  }
}

for (const spec of expectations) {
  const found = graph.edges.some((edge) => matches(edge, spec));
  console.log(
    `${found ? "PASS" : "FAIL"} expect ${spec.raw} (${
      spec.source.id
    } -> ${spec.target.id}${spec.connection ? `:${spec.connection}` : ""})`,
  );
  ok = found && ok;
}

for (const spec of rejections) {
  const found = graph.edges.some((edge) => matches(edge, spec));
  console.log(
    `${found ? "FAIL" : "PASS"} reject ${spec.raw} (${
      spec.source.id
    } -> ${spec.target.id}${spec.connection ? `:${spec.connection}` : ""})`,
  );
  ok = !found && ok;
}

if (process.exitCode === undefined) {
  process.exitCode = ok ? 0 : 1;
}

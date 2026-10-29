/** Search index over the chart's works, grouped by work, author, and legion. */

import { works } from "./chart.ts";
import { FACTION_COLORS, factionsFor } from "./legions.ts";
import { workDetails } from "./work-details.ts";

export type SearchResult = {
  key: string;
  kind: "work" | "author" | "legion";
  label: string;
  meta: string;
  nodeIds: string[];
};

type IndexEntry = {
  result: SearchResult;
  haystacks: readonly string[];
};

function workCount(count: number): string {
  return `${count} work${count === 1 ? "" : "s"}`;
}

const byLabel = (a: SearchResult, b: SearchResult): number =>
  a.label.localeCompare(b.label, undefined, { sensitivity: "base" });

const nonShortcutWorks = works.filter((work) => work.kind !== "shortcut");

const workResults: SearchResult[] = nonShortcutWorks
  .map(
    (work): SearchResult => ({
      key: `work:${work.id}`,
      kind: "work",
      label: work.title,
      meta: work.publication,
      nodeIds: [work.id],
    }),
  )
  .sort(byLabel);

const authors = new Map<string, string[]>();
for (const work of nonShortcutWorks) {
  const author = workDetails[work.id]?.author ?? "Unknown";
  const ids = authors.get(author);
  if (ids) {
    ids.push(work.id);
  } else {
    authors.set(author, [work.id]);
  }
}

const authorResults: SearchResult[] = [...authors.entries()]
  .map(
    ([author, nodeIds]): SearchResult => ({
      key: `author:${author}`,
      kind: "author",
      label: author,
      meta: workCount(nodeIds.length),
      nodeIds,
    }),
  )
  .sort(byLabel);

const legionResults: SearchResult[] = [];
for (const faction of FACTION_COLORS) {
  const nodeIds = nonShortcutWorks
    .filter((work) =>
      factionsFor(work.color).some(
        (matched) => matched.name.toLowerCase() === faction.name.toLowerCase(),
      ),
    )
    .map((work) => work.id);
  if (nodeIds.length === 0) {
    continue;
  }
  legionResults.push({
    key: `legion:${faction.name}`,
    kind: "legion",
    label: faction.name,
    meta: workCount(nodeIds.length),
    nodeIds,
  });
}
legionResults.sort(byLabel);

const workEntries: IndexEntry[] = workResults.map((result) => ({
  result,
  haystacks: [result.label.toLowerCase(), result.meta.toLowerCase()],
}));

const authorEntries: IndexEntry[] = authorResults.map((result) => ({
  result,
  haystacks: [result.label.toLowerCase()],
}));

const legionEntries: IndexEntry[] = legionResults.map((result) => ({
  result,
  haystacks: [result.label.toLowerCase()],
}));

function matchesQuery(haystacks: readonly string[], query: string): boolean {
  const q = query.toLowerCase();
  if (haystacks.some((haystack) => haystack.includes(q))) {
    return true;
  }
  const tokens = q.split(/\s+/).filter((token) => token.length > 0);
  return tokens.every((token) =>
    haystacks.some((haystack) => haystack.includes(token)),
  );
}

function collect(
  entries: readonly IndexEntry[],
  query: string,
): SearchResult[] {
  return entries
    .filter((entry) => matchesQuery(entry.haystacks, query))
    .map((entry) => entry.result);
}

export function search(query: string): SearchResult[] {
  const q = query.trim();
  if (q.length === 0) {
    return [];
  }
  return [
    ...collect(workEntries, q),
    ...collect(authorEntries, q),
    ...collect(legionEntries, q),
  ].slice(0, 24);
}

import type { ChartWork } from "./chart";
import { type Faction, factionsFor } from "./legions.ts";
import { workDetails } from "./work-details.ts";

export type WorkSelection = {
  id: string;
  title: string;
  publication: string;
  author: string;
  year: number | null;
  length: string;
  factions: readonly Faction[];
};

/** Shortcut badges show the details of the work they stand for. */
export function selectionFor(
  work: ChartWork,
  byId: ReadonlyMap<string, ChartWork>,
): WorkSelection {
  const target = work.standsFor ? (byId.get(work.standsFor) ?? work) : work;
  const details = workDetails[target.id];

  return {
    id: target.id,
    title: target.title,
    publication: target.publication,
    author: details?.author ?? "Unknown",
    year: details?.year ?? null,
    length: details?.length ?? "Unknown",
    factions: factionsFor(target.color),
  };
}

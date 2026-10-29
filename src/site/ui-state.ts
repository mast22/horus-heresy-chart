import type { Faction } from "../flow/legions";

export const SIDEBAR_WIDTH_FRACTION = 0.25;
export const SIDEBAR_ENTRANCE = "right" as const;

export const chartControlConfig = {
  showInteractivityToggle: false,
  interactionEnabled: true,
  panOnDrag: true,
  zoomOnScroll: true,
  zoomOnPinch: true,
  zoomOnDoubleClick: true,
  nodesDraggable: false,
  nodesConnectable: false,
} as const;

export type WorkLike = {
  id: string;
  title: string;
  publication?: string;
  author?: string | null;
  year?: number | null;
  length?: string | null;
  factions?: readonly Faction[];
};

export type SidebarState = {
  open: boolean;
  workId: string | null;
  bookName: string;
  publication: string;
  author: string;
  year: number | null;
  length: string;
  factions: readonly Faction[];
  widthFraction: number;
  entrance: typeof SIDEBAR_ENTRANCE;
};

export type LegendState = {
  open: boolean;
  body: "";
};

export function workAuthor(work: WorkLike): string {
  if (typeof work.author !== "string") {
    return "";
  }
  return work.author;
}

export function workSelection(work: WorkLike): WorkLike {
  return {
    id: work.id,
    title: work.title,
    publication: work.publication ?? "",
    author: workAuthor(work),
    year: work.year ?? null,
    length: work.length ?? "",
    factions: work.factions ?? [],
  };
}

export function closedSidebar(): SidebarState {
  return {
    open: false,
    workId: null,
    bookName: "",
    publication: "",
    author: "",
    year: null,
    length: "",
    factions: [],
    widthFraction: SIDEBAR_WIDTH_FRACTION,
    entrance: SIDEBAR_ENTRANCE,
  };
}

export function toggleWorkSidebar(
  current: SidebarState,
  work: WorkLike,
): SidebarState {
  const selection = workSelection(work);
  if (current.open && current.workId === selection.id) {
    return closedSidebar();
  }
  return {
    open: true,
    workId: selection.id,
    bookName: selection.title,
    publication: selection.publication ?? "",
    author: selection.author ?? "",
    year: selection.year ?? null,
    length: selection.length ?? "",
    factions: selection.factions ?? [],
    widthFraction: SIDEBAR_WIDTH_FRACTION,
    entrance: SIDEBAR_ENTRANCE,
  };
}

export function initialLegend(): LegendState {
  return { open: false, body: "" };
}

export function openLegend(): LegendState {
  return { open: true, body: "" };
}

export function closeLegend(): LegendState {
  return { open: false, body: "" };
}

import type { Faction } from "../flow/legions.ts";

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
  description?: string | null;
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
  description: string;
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
    description: work.description ?? "",
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
    description: "",
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
    description: selection.description ?? "",
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

/** Remember that the first-visit opening note was dismissed. */
export const OPENING_STORAGE_KEY = "horus-heresy-opening";

/**
 * Primary chain from Horus Rising through The Flight of the Eisenstein.
 * These four sit on one row, left to right.
 */
export const OPENING_WORK_IDS = [
  "horus-rising",
  "false-gods",
  "galaxy-in-flames",
  "the-flight-of-the-eisenstein",
] as const;

/**
 * Below this zoom the opening titles stop being readable. A narrow screen
 * keeps Horus Rising on the left and lets the line run off to the right.
 */
export const OPENING_MIN_ZOOM = 0.72;
export const OPENING_MAX_ZOOM = 1.2;

/** Insets so the opening row clears the search field and the zoom controls. */
export const OPENING_FRAME_RESERVE = {
  top: 64,
  right: 48,
  bottom: 28,
  left: 36,
} as const;

export type FrameBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type FrameSize = {
  width: number;
  height: number;
};

export type FrameReserve = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type FrameViewport = {
  x: number;
  y: number;
  zoom: number;
};

export function readOpeningSeen(
  storage: { getItem(key: string): string | null } | null,
): boolean {
  if (!storage) {
    return false;
  }
  try {
    return storage.getItem(OPENING_STORAGE_KEY) === "seen";
  } catch {
    return false;
  }
}

export function markOpeningSeen(
  storage: { setItem(key: string, value: string): void } | null,
): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(OPENING_STORAGE_KEY, "seen");
  } catch {
    // Private mode can reject the write. The note still closes for this visit.
  }
}

export function openingBoxes(
  works: readonly (FrameBox & { id: string })[],
): FrameBox[] {
  const byId = new Map(works.map((work) => [work.id, work]));
  return OPENING_WORK_IDS.map((id) => {
    const work = byId.get(id);
    if (!work) {
      throw new Error(`Missing opening work ${id}`);
    }
    return { x: work.x, y: work.y, w: work.w, h: work.h };
  });
}

function fittedReserve(frame: FrameSize, reserve: FrameReserve): FrameReserve {
  let { top, right, bottom, left } = reserve;
  const minInner = 120;
  if (frame.height - top - bottom < minInner) {
    const spare = Math.max(0, frame.height - minInner);
    const scale = spare / Math.max(1, top + bottom);
    top = Math.round(top * scale);
    bottom = Math.round(bottom * scale);
  }
  if (frame.width - left - right < minInner) {
    const spare = Math.max(0, frame.width - minInner);
    const scale = spare / Math.max(1, left + right);
    left = Math.round(left * scale);
    right = Math.round(right * scale);
  }
  return { top, right, bottom, left };
}

/** Place Horus Rising on the left. Later books continue to the right. */
export function openingViewport(
  boxes: readonly FrameBox[],
  frame: FrameSize,
  reserve: FrameReserve = OPENING_FRAME_RESERVE,
): FrameViewport | null {
  if (boxes.length === 0 || frame.width <= 0 || frame.height <= 0) {
    return null;
  }
  const inset = fittedReserve(frame, reserve);
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.w));
  const maxY = Math.max(...boxes.map((box) => box.y + box.h));
  const spanW = Math.max(1, maxX - minX);
  const spanH = Math.max(1, maxY - minY);
  const innerW = Math.max(1, frame.width - inset.left - inset.right);
  const innerH = Math.max(1, frame.height - inset.top - inset.bottom);
  const fitZoom = Math.min(innerW / spanW, innerH / spanH);
  const zoom = Math.min(OPENING_MAX_ZOOM, Math.max(OPENING_MIN_ZOOM, fitZoom));
  const rowPx = spanH * zoom;
  const y =
    rowPx >= innerH
      ? inset.top - minY * zoom
      : inset.top + (innerH - rowPx) / 2 - minY * zoom;
  return {
    x: inset.left - minX * zoom,
    y,
    zoom,
  };
}

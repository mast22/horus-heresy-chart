import type { ChartWork } from "./chart.ts";

/** A shortcut this close to the work it stands for gets a double stem. */
export const ANCHOR_MAX_GAP = 60;

/** How far each stem sits from the shortcut's center line. */
const ANCHOR_OFFSET = 4;

/** How far each stem tucks under the badge and the book so the join has no gap. */
const ANCHOR_TUCK = 2;

export type AnchorStem = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type ShortcutAnchor = {
  id: string;
  shortcutId: string;
  originId: string;
  lines: readonly [AnchorStem, AnchorStem];
};

function overlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.min(a2, b2) - Math.max(a1, b1);
}

function pair(
  center: number,
  from: number,
  to: number,
  vertical: boolean,
): readonly [AnchorStem, AnchorStem] {
  const left = center - ANCHOR_OFFSET;
  const right = center + ANCHOR_OFFSET;
  if (vertical) {
    return [
      { x1: left, y1: from, x2: left, y2: to },
      { x1: right, y1: from, x2: right, y2: to },
    ];
  }
  return [
    { x1: from, y1: left, x2: to, y2: left },
    { x1: from, y1: right, x2: to, y2: right },
  ];
}

/**
 * Two close stems from a shortcut badge to the work it stands for.
 * Only badges that already sit against that work qualify. Distant badges
 * stay unconnected.
 */
export function shortcutAnchors(works: readonly ChartWork[]): ShortcutAnchor[] {
  const byId = new Map(works.map((work) => [work.id, work]));
  const anchors: ShortcutAnchor[] = [];

  for (const shortcut of works) {
    if (shortcut.kind !== "shortcut" || shortcut.standsFor == null) {
      continue;
    }
    const origin = byId.get(shortcut.standsFor);
    if (!origin || origin.kind === "shortcut") {
      continue;
    }

    const sx1 = shortcut.x;
    const sy1 = shortcut.y;
    const sx2 = shortcut.x + shortcut.w;
    const sy2 = shortcut.y + shortcut.h;
    const ox1 = origin.x;
    const oy1 = origin.y;
    const ox2 = origin.x + origin.w;
    const oy2 = origin.y + origin.h;
    const overlapX = overlap(sx1, sx2, ox1, ox2);
    const overlapY = overlap(sy1, sy2, oy1, oy2);
    const centerX = (sx1 + sx2) / 2;
    const centerY = (sy1 + sy2) / 2;

    let lines: readonly [AnchorStem, AnchorStem] | null = null;

    if (overlapX >= shortcut.w && overlapY <= 0) {
      const above = sy2 <= oy1;
      const gap = above ? oy1 - sy2 : sy1 - oy2;
      if (gap > 0 && gap <= ANCHOR_MAX_GAP) {
        const from = above ? sy2 - ANCHOR_TUCK : oy2 - ANCHOR_TUCK;
        const to = above ? oy1 + ANCHOR_TUCK : sy1 + ANCHOR_TUCK;
        const left = centerX - ANCHOR_OFFSET;
        const right = centerX + ANCHOR_OFFSET;
        if (left >= ox1 && right <= ox2) {
          lines = pair(centerX, from, to, true);
        }
      }
    } else if (overlapY >= shortcut.h && overlapX <= 0) {
      const leftOf = sx2 <= ox1;
      const gap = leftOf ? ox1 - sx2 : sx1 - ox2;
      if (gap > 0 && gap <= ANCHOR_MAX_GAP) {
        const from = leftOf ? sx2 - ANCHOR_TUCK : ox2 - ANCHOR_TUCK;
        const to = leftOf ? ox1 + ANCHOR_TUCK : sx1 + ANCHOR_TUCK;
        const top = centerY - ANCHOR_OFFSET;
        const bottom = centerY + ANCHOR_OFFSET;
        if (top >= oy1 && bottom <= oy2) {
          lines = pair(centerY, from, to, false);
        }
      }
    }

    if (!lines) {
      continue;
    }
    anchors.push({
      id: `anchor-${shortcut.id}`,
      shortcutId: shortcut.id,
      originId: origin.id,
      lines,
    });
  }

  return anchors;
}

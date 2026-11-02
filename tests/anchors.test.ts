import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shortcutAnchors } from "../src/flow/anchors.ts";
import { buildChartGraph } from "../src/flow/chart.ts";

const graph = buildChartGraph();
const byId = new Map(graph.works.map((work) => [work.id, work]));

describe("shortcut anchors", () => {
  it("draws two stems for every shortcut sitting on its source", () => {
    const anchors = shortcutAnchors(graph.works);
    const pairs = anchors.map(
      (anchor) => `${anchor.shortcutId}->${anchor.originId}`,
    );
    assert.deepEqual(pairs.sort(), [
      "badge-12->fulgrim-rim",
      "badge-14->fear-to-tread",
      "shortcut-ae->angel-exterminatus",
      "shortcut-oe->old-earth",
      "shortcut-r->ruinstorm",
      "shortcut-sc->scars",
      "shortcut-w->wolfsbane",
    ]);
    for (const anchor of anchors) {
      assert.equal(anchor.lines.length, 2);
      const [a, b] = anchor.lines;
      const vertical = a.x1 === a.x2 && b.x1 === b.x2;
      const horizontal = a.y1 === a.y2 && b.y1 === b.y2;
      assert.ok(vertical || horizontal, `${anchor.id} is not a straight pair`);
      const spread = vertical ? Math.abs(a.x1 - b.x1) : Math.abs(a.y1 - b.y1);
      assert.equal(spread, 8, `${anchor.id} stems are not close`);
    }
  });

  it("centers F on Fulgrim and AE on Angel Exterminatus", () => {
    const fulgrim = byId.get("fulgrim-rim");
    const f = byId.get("badge-12");
    const angel = byId.get("angel-exterminatus");
    const ae = byId.get("shortcut-ae");
    assert.ok(fulgrim && f && angel && ae);
    assert.equal(f.x + f.w / 2, fulgrim.x + fulgrim.w / 2);
    assert.equal(ae.x + ae.w / 2, angel.x + angel.w / 2);
    assert.ok(fulgrim.y - (f.y + f.h) < 40);
    assert.ok(angel.y - (ae.y + ae.h) < 40);
  });
});

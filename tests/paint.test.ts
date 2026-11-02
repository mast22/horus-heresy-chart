import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { inkFor, WorkFace } from "../src/components/WorkFace.ts";
import { buildChartGraph, type ChartWork } from "../src/flow/chart.ts";

const graph = buildChartGraph();

function findWork(title: RegExp): ChartWork {
  const work = graph.works.find(
    (item) => item.kind !== "shortcut" && title.test(item.title),
  );
  assert.ok(work, `missing ${title}`);
  return work;
}

function paint(work: ChartWork): string {
  return renderToStaticMarkup(
    createElement(WorkFace, {
      data: {
        title: work.title,
        publication: work.publication,
        kind: work.kind,
        color: work.color,
        ribbon: work.ribbon,
      },
    }),
  );
}

function readBands(html: string): Array<{ color: string; ink: string }> {
  const bands: Array<{ color: string; ink: string }> = [];
  const pattern =
    /class="work-band"[^>]*data-band="(\d+)"[^>]*data-color="(#[0-9a-fA-F]{6})"[^>]*data-ink="(#[0-9a-fA-F]{6})"/g;
  for (const match of html.matchAll(pattern)) {
    bands.push({
      color: match[2].toLowerCase(),
      ink: match[3].toLowerCase(),
    });
  }
  return bands;
}

const cases: Array<{
  label: string;
  title: RegExp;
  count: number;
  shape: "chamfer" | "round";
}> = [
  {
    label: "Ordo Sinister",
    title: /ordo sinister/i,
    count: 2,
    shape: "chamfer",
  },
  { label: "Ruinstorm", title: /^ruinstorm$/i, count: 3, shape: "round" },
  {
    label: "The Path of Heaven",
    title: /path of heaven/i,
    count: 3,
    shape: "round",
  },
  { label: "Mechanicum", title: /^mechanicum$/i, count: 1, shape: "round" },
];

describe("work face paint", () => {
  for (const item of cases) {
    it(`paints ${item.label} as ${item.count} band(s) with matching ink`, () => {
      const work = findWork(item.title);
      const html = paint(work);
      const bands = readBands(html);
      const shape = html.match(/data-shape="(chamfer|round)"/)?.[1];
      const colorsMatch =
        bands.length === work.color.length &&
        bands.every(
          (band, index) => band.color === work.color[index].toLowerCase(),
        );
      const inksMatch = bands.every((band) => band.ink === inkFor(band.color));
      const flat =
        bands.length > 1 &&
        bands.every((band) => band.color === bands[0].color);

      assert.equal(bands.length, item.count, "band count");
      assert.equal(work.color.length, item.count, "stored color count");
      assert.ok(colorsMatch, "rendered colors match the chart");
      assert.ok(inksMatch, "each band uses the ink for its fill");
      assert.equal(shape, item.shape, "shape");
      assert.equal(flat, false, "bands are not one flat color");
    });
  }

  it("leaves the release number off a novel and keeps a collection mark on a story", () => {
    const novel = paint(findWork(/^horus rising$/i));
    assert.equal(novel.includes("work-pub"), false);
    assert.equal(novel.includes("Book 1"), false);
    const story = paint(findWork(/^the last church$/i));
    assert.match(story, /class="work-pub"[^>]*>in Book 10</);
    assert.equal(story.includes("→"), false);
    const audio = paint(findWork(/^nightfane$/i));
    assert.match(audio, /class="work-pub"[^>]*>Audio</);
  });

  it("uses different ink on Ordo Sinister's two bands", () => {
    const bands = readBands(paint(findWork(/ordo sinister/i)));
    assert.equal(bands.length, 2);
    assert.notEqual(bands[0].ink, bands[1].ink);
  });
});

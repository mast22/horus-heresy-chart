import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WorkFace } from "../src/components/WorkFace.ts";
import { buildChartGraph, type ChartWork } from "../src/flow/chart.ts";

const css = readFileSync(
  fileURLToPath(new URL("../src/styles/global.css", import.meta.url)),
  "utf8",
);

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

function readBands(html: string): string[] {
  const bands: string[] = [];
  const pattern =
    /class="work-band"[^>]*data-band="(\d+)"[^>]*data-color="(#[0-9a-fA-F]{6})"/g;
  for (const match of html.matchAll(pattern)) {
    bands.push(match[2].toLowerCase());
  }
  return bands;
}

function namePlates(html: string): number {
  return html.match(/class="work-name"/g)?.length ?? 0;
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
    it(`paints ${item.label} as ${item.count} band(s) under one name plate`, () => {
      const work = findWork(item.title);
      const html = paint(work);
      const bands = readBands(html);
      const shape = html.match(/data-shape="(chamfer|round)"/)?.[1];
      const colorsMatch =
        bands.length === work.color.length &&
        bands.every(
          (color, index) => color === work.color[index].toLowerCase(),
        );
      const flat =
        bands.length > 1 && bands.every((color) => color === bands[0]);

      assert.equal(bands.length, item.count, "band count");
      assert.equal(work.color.length, item.count, "stored color count");
      assert.ok(colorsMatch, "rendered colors match the chart");
      assert.equal(namePlates(html), 1, "one name plate");
      assert.equal(
        html.match(/class="work-title"/g)?.length ?? 0,
        1,
        "title is painted once",
      );
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

  it("paints Pharos once on a plate over two legion bands", () => {
    const html = paint(findWork(/^pharos$/i));
    const bands = readBands(html);
    assert.deepEqual(bands, ["#0d407f", "#a1aefe"]);
    assert.equal(namePlates(html), 1);
    assert.equal(html.match(/class="work-title"/g)?.length, 1);
    assert.match(html, /class="work-title">Pharos</);
    assert.equal(html.includes("data-ink"), false);
  });

  it("gives every name the same plate color", () => {
    const node = css.match(/\.work-node \{[^}]*\}/)?.[0] ?? "";
    const plate = css.match(/\.work-name \{[^}]*\}/)?.[0] ?? "";
    assert.match(node, /--name-bg:\s*#161616/);
    assert.match(node, /--name-ink:\s*#f6f1e6/);
    assert.match(plate, /background:\s*var\(--name-bg\)/);
    assert.match(plate, /color:\s*var\(--name-ink\)/);
    assert.equal(css.includes("--name-ink:"), true);
    assert.equal(
      css.match(/--name-ink:/g)?.length,
      1,
      "name ink is declared once",
    );
  });
});

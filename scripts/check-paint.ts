import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WorkFace, inkFor } from "../src/components/WorkFace.ts";
import { buildChartGraph, type ChartWork } from "../src/flow/chart.ts";

const graph = buildChartGraph();
const lines: string[] = [];
const failures: string[] = [];

function check(name: string, ok: boolean, detail: string) {
  lines.push(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
  if (!ok) {
    failures.push(name);
  }
}

function findWork(title: RegExp): ChartWork {
  const work = graph.works.find(
    (item) => item.kind !== "shortcut" && title.test(item.title),
  );
  if (!work) {
    throw new Error(`missing ${title}`);
  }
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
        letters: work.letters,
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
  { label: "Ordo Sinister", title: /ordo sinister/i, count: 2, shape: "chamfer" },
  { label: "Ruinstorm", title: /^ruinstorm$/i, count: 3, shape: "round" },
  { label: "The Path of Heaven", title: /path of heaven/i, count: 3, shape: "round" },
  { label: "Mechanicum", title: /^mechanicum$/i, count: 1, shape: "round" },
];

for (const item of cases) {
  const work = findWork(item.title);
  const html = paint(work);
  const bands = readBands(html);
  const shape = html.match(/data-shape="(chamfer|round)"/)?.[1];
  const colorsMatch =
    bands.length === work.color.length &&
    bands.every((band, index) => band.color === work.color[index].toLowerCase());
  const inksMatch = bands.every((band) => band.ink === inkFor(band.color));
  const flat =
    bands.length > 1 && bands.every((band) => band.color === bands[0].color);
  check(
    `${item.label} bands ${item.count}`,
    bands.length === item.count &&
      work.color.length === item.count &&
      colorsMatch &&
      inksMatch &&
      shape === item.shape &&
      !flat,
    `shape ${shape} bands ${bands.map((band) => band.color).join(" ")} inks ${bands.map((band) => band.ink).join(" ")}`,
  );
}

const ordo = readBands(paint(findWork(/ordo sinister/i)));
check(
  "Ordo Sinister ink differs by band",
  ordo.length === 2 && ordo[0].ink !== ordo[1].ink,
  ordo.map((band) => band.ink).join(" "),
);

console.log(lines.join("\n"));
if (failures.length > 0) {
  console.error(`RESULT fail ${failures.join(", ")}`);
  process.exit(1);
}
console.log("RESULT pass");

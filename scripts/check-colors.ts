import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { buildChartGraph, type ChartWork } from "../src/flow/chart.ts";

const root = new URL("..", import.meta.url).pathname;
const pngPath = `${root}sources/chart.png`;
const png = readFileSync(pngPath);
if (png.readUInt32BE(16) !== 12000 || png.readUInt32BE(20) !== 12556) {
  console.error("FAIL poster size");
  process.exit(1);
}

const graph = buildChartGraph();
const measured = measureWorks(graph.works);
const lines: string[] = [];
const failures: string[] = [];

function check(name: string, ok: boolean, detail: string) {
  lines.push(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
  if (!ok) {
    failures.push(name);
  }
}

function channel(hex: string, index: number): number {
  return Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
}

function close(stored: string, measuredColor: string): boolean {
  return [0, 1, 2].every(
    (index) => Math.abs(channel(stored, index) - channel(measuredColor, index)) <= 40,
  );
}

let empty = 0;
let mismatched = 0;
for (const work of graph.works) {
  const colors = measured.get(work.id);
  if (!colors || colors.length === 0 || work.color.length === 0) {
    empty += 1;
    lines.push(`  empty ${work.id} stored=${work.color.length} measured=${colors?.length ?? "missing"}`);
    continue;
  }
  const sameCount = colors.length === work.color.length;
  const sameOrder =
    sameCount && work.color.every((color, index) => close(color, colors[index]));
  if (!sameOrder) {
    mismatched += 1;
    lines.push(
      `  mismatch ${work.id} stored=${work.color.join(",")} measured=${colors.join(",")}`,
    );
  }
}

check(
  "every work matched",
  mismatched === 0 && empty === 0 && measured.size === graph.works.length,
  `${graph.works.length} works, mismatched ${mismatched}, empty ${empty}`,
);
check("none empty", empty === 0, `empty ${empty}`);

const named: Array<[string, RegExp, number]> = [
  ["Ordo Sinister", /ordo sinister/i, 2],
  ["The Path of Heaven", /path of heaven/i, 3],
  ["Ruinstorm", /^ruinstorm$/i, 3],
  ["The Unremembered Empire", /unremembered empire/i, 4],
  ["Angels of Caliban", /angels of caliban/i, 4],
  ["Know No Fear", /know no fear/i, 3],
  ["Scars", /^scars$/i, 2],
  ["Mechanicum", /^mechanicum$/i, 1],
  ["The Master of Mankind", /master of mankind/i, 1],
];

for (const [label, title, count] of named) {
  const work = graph.works.find(
    (item) => item.kind !== "shortcut" && title.test(item.title),
  );
  const colors = work ? measured.get(work.id) : undefined;
  check(
    `${label} ${count}`,
    Boolean(work && colors && colors.length === count && work.color.length === count),
    work ? `${work.color.length} stored, ${colors?.length ?? 0} measured ${work.color.join(" ")}` : "missing",
  );
}

const nodesPath = `${root}ocr/out/nodes.json`;
if (existsSync(nodesPath)) {
  const nodes = JSON.parse(readFileSync(nodesPath, "utf8")) as Array<{
    box: [number, number, number, number];
    title: string;
  }>;
  const ocrMeasured = measureWorks(
    nodes.map((node, index) => ({
      id: `ocr-${index}`,
      x: node.box[0],
      y: node.box[1],
      w: node.box[2] - node.box[0],
      h: node.box[3] - node.box[1],
    })),
  );
  let paired = 0;
  let ocrMismatch = 0;
  for (const [index, node] of nodes.entries()) {
    const box = {
      x: node.box[0],
      y: node.box[1],
      w: node.box[2] - node.box[0],
      h: node.box[3] - node.box[1],
    };
    const work = graph.works.find((item) => iou(item, box) >= 0.55);
    if (!work) {
      continue;
    }
    paired += 1;
    const colors = ocrMeasured.get(`ocr-${index}`) ?? [];
    const same =
      colors.length === work.color.length &&
      work.color.every((color, colorIndex) => close(color, colors[colorIndex]));
    if (!same) {
      ocrMismatch += 1;
      if (ocrMismatch <= 12) {
        lines.push(
          `  ocr mismatch ${work.id} stored=${work.color.join(",")} box=${colors.join(",")}`,
        );
      }
    }
  }
  check(
    "ocr boxes match shipped colors",
    paired > 0 && ocrMismatch === 0,
    `paired ${paired}, mismatched ${ocrMismatch}`,
  );
}

console.log(lines.join("\n"));
if (failures.length > 0) {
  console.error(`RESULT fail ${failures.join(", ")}`);
  process.exit(1);
}
console.log("RESULT pass");

function iou(
  work: { x: number; y: number; w: number; h: number },
  box: { x: number; y: number; w: number; h: number },
): number {
  const ax2 = work.x + work.w;
  const ay2 = work.y + work.h;
  const bx2 = box.x + box.w;
  const by2 = box.y + box.h;
  const width = Math.max(0, Math.min(ax2, bx2) - Math.max(work.x, box.x));
  const height = Math.max(0, Math.min(ay2, by2) - Math.max(work.y, box.y));
  const inter = width * height;
  const union = work.w * work.h + box.w * box.h - inter;
  return union > 0 ? inter / union : 0;
}

function measureWorks(
  works: ReadonlyArray<Pick<ChartWork, "id" | "x" | "y" | "w" | "h">>,
): Map<string, string[]> {
  const script = `
import json, sys
import numpy as np
from PIL import Image
sys.path.insert(0, "ocr")
from bands import hex_color, measure_bands
Image.MAX_IMAGE_PIXELS = None
image = np.asarray(Image.open(sys.argv[1]).convert("RGB"))
works = json.loads(sys.stdin.read())
out = []
for work in works:
    colors = [hex_color(color) for color in measure_bands(image, work["x"], work["y"], work["w"], work["h"])]
    out.append({"id": work["id"], "colors": colors})
json.dump(out, sys.stdout)
`;
  const result = spawnSync("python3", ["-c", script, pngPath], {
    cwd: root,
    input: JSON.stringify(works),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    console.error(result.stderr);
    process.exit(1);
  }
  const rows = JSON.parse(result.stdout) as Array<{ id: string; colors: string[] }>;
  return new Map(rows.map((row) => [row.id, row.colors]));
}

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { buildChartGraph, type ChartWork } from "../src/flow/chart.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const pngPath = fileURLToPath(new URL("../sources/chart.png", import.meta.url));
const nodesPath = fileURLToPath(
  new URL("../image-recognition/out/nodes.json", import.meta.url),
);

const png = readFileSync(pngPath);
const graph = buildChartGraph();

function channel(hex: string, index: number): number {
  return Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
}

function nearBlack(hex: string): boolean {
  return [0, 1, 2].every((index) => channel(hex, index) <= 45);
}

function close(stored: string, measuredColor: string): boolean {
  return [0, 1, 2].every(
    (index) =>
      Math.abs(channel(stored, index) - channel(measuredColor, index)) <= 40,
  );
}

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
sys.path.insert(0, "image-recognition")
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
  assert.equal(
    result.status,
    0,
    result.stderr || "python poster measurement failed",
  );
  const rows = JSON.parse(result.stdout) as Array<{
    id: string;
    colors: string[];
  }>;
  return new Map(rows.map((row) => [row.id, row.colors]));
}

describe("poster colours", () => {
  it("measures the expected poster", () => {
    assert.equal(png.readUInt32BE(16), 12000, "poster width");
    assert.equal(png.readUInt32BE(20), 12556, "poster height");
  });

  it("has a non-empty fill on every work", () => {
    const empty = graph.works
      .filter((work) => work.color.length === 0)
      .map((work) => work.id);
    assert.deepEqual(empty, [], "works without bands");
  });

  it("matches the named multi-band works", () => {
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
      assert.ok(work, `missing ${label}`);
      assert.equal(work.color.length, count, `${label} bands`);
    }
  });

  it("keeps the known near-black fills", () => {
    const blackFill = [
      ["Deliverance Lost", "deliverance-lost"],
      ["The Divine Word", "the-divine-word"],
      ["The Shadowmasters", "the-shadowmasters"],
      ["The Face of Treachery", "the-face-of-treachery"],
      ["Ravenlord", "ravenlord"],
      ["Soulforge", "soulforge"],
      ["Raven's Flight", "raven-s-flight"],
      ["Weregeld", "weregeld"],
    ] as const;
    for (const [label, id] of blackFill) {
      const work = graph.works.find((item) => item.id === id);
      assert.ok(work, `missing ${label}`);
      assert.equal(work.color.length, 1, `${label} bands`);
      assert.ok(work.color[0], `${label} missing band`);
      assert.ok(
        nearBlack(work.color[0]),
        `${label} ${work.color[0]} is not black`,
      );
    }
  });

  it("keeps the known single-fill works", () => {
    const oneFill: Array<[string, RegExp]> = [
      ["Fear to Tread", /^fear to tread$/i],
      ["Guardian of Order", /guardian of order/i],
      ["Hubris of Monarchia", /hubris of monarchia/i],
      ["Nightfane", /^nightfane$/i],
    ];
    for (const [label, title] of oneFill) {
      const work = graph.works.find(
        (item) => item.kind !== "shortcut" && title.test(item.title),
      );
      assert.ok(work, `missing ${label}`);
      assert.equal(work.color.length, 1, `${label} bands`);
    }
  });

  it("matches the shipped colours to OCR boxes", {
    skip: existsSync(nodesPath)
      ? false
      : "generate image-recognition/out/nodes.json first",
  }, () => {
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
    const mismatched: string[] = [];
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
        work.color.every((color, colorIndex) =>
          close(color, colors[colorIndex]),
        );
      if (!same) {
        mismatched.push(work.id);
      }
    }
    assert.ok(paired > 0, "no OCR boxes paired with shipped works");
    assert.deepEqual(mismatched, [], "OCR boxes with different colours");
  });
});

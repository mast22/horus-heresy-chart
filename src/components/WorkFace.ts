import { createElement, type ReactNode } from "react";

import type { WorkKind } from "../flow/chart";

const MINOR_WORDS = new Set(["of", "the", "a", "and", "to", "in", "for"]);

/** Poster novels are set in capitals. Title case keeps the same words readable on the canvas. */
export function displayTitle(title: string): string {
  const letters = title.replace(/[^A-Za-z]/g, "");
  const isCaps = letters.length > 2 && letters === letters.toUpperCase();
  if (!isCaps) {
    return title;
  }
  return title
    .toLowerCase()
    .split(" ")
    .map((word, index) => {
      if (index > 0 && MINOR_WORDS.has(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** Dark ink on a light band, light ink on a dark band. */
export function inkFor(color: string): string {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
  return luminance > 155 ? "#1c1917" : "#f6f1e6";
}

const CHAMFER: ReadonlySet<string> = new Set([
  "shortStory",
  "ebook",
  "novella",
]);

export function workShape(kind: WorkKind): "chamfer" | "round" {
  return CHAMFER.has(kind) ? "chamfer" : "round";
}

export type WorkFaceData = {
  title: string;
  publication: string;
  kind: WorkKind;
  color: readonly string[];
  ribbon: boolean;
};

/** The work node the page paints: one horizontal band per recorded fill, top to bottom. */
export function WorkFace({
  data,
  children,
}: {
  data: WorkFaceData;
  children?: ReactNode;
}) {
  const colors = data.color;
  const shape = workShape(data.kind);
  const shortcut = data.kind === "shortcut";
  const count = colors.length;
  const bands = colors.map((color, index) =>
    createElement(
      "div",
      {
        key: `${index}-${color}`,
        className: "work-band",
        "data-band": String(index),
        "data-color": color,
        "data-ink": inkFor(color),
        style: { backgroundColor: color, color: inkFor(color) },
      },
      createElement(
        "div",
        {
          className: "work-copy",
          style: { height: `${count * 100}%`, top: `${-index * 100}%` },
        },
        shortcut
          ? createElement(
              "span",
              { className: "work-letters" },
              data.publication,
            )
          : createElement(
              "span",
              { className: "work-title" },
              displayTitle(data.title),
            ),
        shortcut
          ? null
          : createElement("span", { className: "work-pub" }, data.publication),
      ),
    ),
  );
  return createElement(
    "div",
    {
      className: `work-node kind-${data.kind}${shortcut ? " is-shortcut" : ""} shape-${shape}`,
      "data-shape": shape,
      "data-bands": String(count),
    },
    createElement("div", { className: "work-bands" }, bands),
    data.ribbon
      ? createElement(
          "span",
          { className: "work-ribbons", "aria-hidden": "true" },
          createElement("i"),
          createElement("i"),
        )
      : null,
    children,
  );
}

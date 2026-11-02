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
  const bands = colors.map((color, index) =>
    createElement("div", {
      key: `${index}-${color}`,
      className: "work-band",
      "data-band": String(index),
      "data-color": color,
      style: { backgroundColor: color },
    }),
  );
  const name = createElement(
    "div",
    { className: "work-name" },
    shortcut
      ? createElement("span", { className: "work-letters" }, data.publication)
      : [
          createElement(
            "span",
            { key: "title", className: "work-title" },
            displayTitle(data.title),
          ),
          createElement(
            "span",
            { key: "pub", className: "work-pub" },
            data.publication,
          ),
        ],
  );
  return createElement(
    "div",
    {
      className: `work-node kind-${data.kind}${shortcut ? " is-shortcut" : ""} shape-${shape}`,
      "data-shape": shape,
      "data-bands": String(colors.length),
    },
    createElement("div", { className: "work-bands" }, bands),
    createElement("div", { className: "work-copy" }, name),
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

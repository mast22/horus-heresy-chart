export type PageCopy = {
  credit: string;
  howTo: string;
  remaining: string;
};

type SectionKind = "credit" | "originalCreators" | "howTo";

type Block = {
  kind: SectionKind | "other";
  text: string;
};

function sectionKind(heading: string): SectionKind | null {
  const name = heading.trim().replace(/\s+/g, " ");
  if (/^credit$/i.test(name)) {
    return "credit";
  }
  if (/^original(?:\s+chart)?\s+creators$/i.test(name)) {
    return "originalCreators";
  }
  if (/^how to use this chart$/i.test(name)) {
    return "howTo";
  }
  return null;
}

function headingKind(line: string): SectionKind | null {
  const match = /^(#{1,6})[ \t]+(.+?)\s*$/.exec(line);
  if (!match) {
    return null;
  }
  return sectionKind(match[2]);
}

/** Split Credit, Original Creators, and How to use this chart.
 * Other headings stay inside the section that contains them.
 * Credit and Original Creators are removed from `remaining`; How to use stays.
 */
export function extractPageCopy(markdown: string): PageCopy {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let kind: Block["kind"] = "other";
  let buffer: string[] = [];

  const flush = () => {
    blocks.push({ kind, text: buffer.join("\n") });
    buffer = [];
  };

  for (const line of lines) {
    const next = headingKind(line);
    if (next) {
      flush();
      kind = next;
    }
    buffer.push(line);
  }
  flush();

  const textOf = (section: SectionKind) =>
    blocks
      .filter((block) => block.kind === section)
      .map((block) => block.text.trim())
      .filter((text) => text.length > 0)
      .join("\n\n");

  const credit = [textOf("credit"), textOf("originalCreators")]
    .filter((text) => text.length > 0)
    .join("\n\n");
  const howTo = textOf("howTo");
  const remaining = blocks
    .filter(
      (block) => block.kind !== "credit" && block.kind !== "originalCreators",
    )
    .map((block) => block.text.replace(/^\n+/, "").replace(/\n+$/, ""))
    .filter((text) => text.trim().length > 0)
    .join("\n\n");

  return {
    credit,
    howTo,
    remaining: remaining.length > 0 ? `${remaining}\n` : "",
  };
}

export function creditPageBody(markdown: string): string {
  return extractPageCopy(markdown).credit;
}

export function howToPageBody(markdown: string): string {
  return extractPageCopy(markdown).howTo;
}

function escapeHtml(value: string): string {
  const decoded = value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return decoded
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(value: string): string {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

export function renderSectionHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const parts: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }
    parts.push(`<p>${paragraph.join("<br>\n")}</p>`);
    paragraph = [];
  };

  for (const line of lines) {
    const heading = /^(#{1,6})[ \t]+(.+?)\s*$/.exec(line);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      parts.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      continue;
    }
    paragraph.push(renderInline(line.replace(/[ \t]+$/, "")));
  }
  flushParagraph();
  return parts.join("\n");
}

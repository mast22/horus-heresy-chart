import { readFileSync } from "node:fs";

import { buildChartGraph } from "../src/flow/chart.ts";
import { FACTION_COLORS, factionsFor } from "../src/flow/legions.ts";
import { nextWorkIds } from "../src/flow/navigation.ts";
import { search } from "../src/flow/search.ts";
import { selectionFor } from "../src/flow/selection.ts";
import { workDetails } from "../src/flow/work-details.ts";
import { extractPageCopy } from "../src/site/copy.ts";
import { navLinks, SITE_TITLE } from "../src/site/nav.ts";
import {
  chartControlConfig,
  closedSidebar,
  closeLegend,
  initialLegend,
  openLegend,
  SIDEBAR_ENTRANCE,
  SIDEBAR_WIDTH_FRACTION,
  toggleWorkSidebar,
  workAuthor,
} from "../src/site/ui-state.ts";

const lines: string[] = [];
const failures: string[] = [];

function check(name: string, ok: boolean, detail: string) {
  lines.push(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
  if (!ok) {
    failures.push(name);
  }
}

function headingNames(markdown: string): string[] {
  return markdown.split(/\r?\n/).flatMap((line) => {
    const match = /^(#{1,6})[ \t]+(.+?)\s*$/.exec(line);
    return match ? [match[2].trim().replace(/\s+/g, " ")] : [];
  });
}

function hasHeading(markdown: string, pattern: RegExp): boolean {
  return headingNames(markdown).some((name) => pattern.test(name));
}

const sample = `# Preamble

Keep this note.

# Credit

This flowchart is fanmade.

# Games Workshop

Still part of credit.

# Original Creators

Made by Nico.

# How to use this chart

Follow the arrows first.

# Leftover

Also keep.
`;

const sampleCopy = extractPageCopy(sample);
check(
  "sample credit body",
  sampleCopy.credit.includes("This flowchart is fanmade.") &&
    sampleCopy.credit.includes("Still part of credit.") &&
    sampleCopy.credit.includes("Made by Nico.") &&
    sampleCopy.credit.includes("# Credit") &&
    sampleCopy.credit.includes("# Original Creators") &&
    !sampleCopy.credit.includes("Follow the arrows first.") &&
    !sampleCopy.credit.includes("Keep this note.") &&
    !sampleCopy.credit.includes("Also keep."),
  "credit plus original creators, including the nested heading",
);
check(
  "sample how-to body",
  sampleCopy.howTo.includes("# How to use this chart") &&
    sampleCopy.howTo.includes("Follow the arrows first.") &&
    !sampleCopy.howTo.includes("Made by Nico.") &&
    !sampleCopy.howTo.includes("fanmade"),
  "how-to section only",
);
check(
  "sample strips credit sections",
  !hasHeading(sampleCopy.remaining, /^credit$/i) &&
    !hasHeading(sampleCopy.remaining, /^original(?:\s+chart)?\s+creators$/i) &&
    !sampleCopy.remaining.includes("fanmade") &&
    !sampleCopy.remaining.includes("Made by Nico.") &&
    sampleCopy.remaining.includes("# How to use this chart") &&
    sampleCopy.remaining.includes("Follow the arrows first.") &&
    sampleCopy.remaining.includes("Keep this note.") &&
    sampleCopy.remaining.includes("Also keep."),
  "credit and original creators removed; how-to and other text kept",
);
const emptyCopy = extractPageCopy("");
check(
  "empty markdown yields empty bodies",
  emptyCopy.credit === "" &&
    emptyCopy.howTo === "" &&
    emptyCopy.remaining === "",
  `credit ${emptyCopy.credit.length} how-to ${emptyCopy.howTo.length}`,
);

const creditPage = readFileSync("src/pages/credit.astro", "utf8");
const howToPage = readFileSync("src/pages/how-to-use-this-chart.astro", "utf8");
const aboutPage = readFileSync("src/pages/about.astro", "utf8");
const indexPage = readFileSync("src/pages/index.astro", "utf8");
const layout = readFileSync("src/layouts/BaseLayout.astro", "utf8");
const creditMarkdown = readFileSync("src/copy/credit.md", "utf8");
const howToMarkdown = readFileSync("src/copy/how-to-use-this-chart.md", "utf8");
check(
  "pages render the moved markdown chapters",
  creditPage.includes('import { Content } from "../copy/credit.md"') &&
    creditPage.includes("<Content />") &&
    !creditPage.includes("text_data.md") &&
    !creditPage.includes("creditPageBody") &&
    howToPage.includes(
      'import { Content } from "../copy/how-to-use-this-chart.md"',
    ) &&
    howToPage.includes("<Content />") &&
    !howToPage.includes("text_data.md") &&
    !howToPage.includes("howToPageBody") &&
    hasHeading(creditMarkdown, /^game workshop credit$/i) &&
    hasHeading(creditMarkdown, /^original flow chart creators credit$/i) &&
    creditMarkdown.includes("This flowchart is fanmade") &&
    creditMarkdown.includes("Nico.") &&
    !hasHeading(creditMarkdown, /^how to use this chart$/i) &&
    hasHeading(howToMarkdown, /^how to use this chart$/i) &&
    howToMarkdown.includes("spoiler-free reading order") &&
    !howToMarkdown.includes("This flowchart is fanmade") &&
    !howToMarkdown.includes("Nico.") &&
    /<main class="text-page">\s*<\/main>/.test(aboutPage) &&
    !aboutPage.includes("creditPage") &&
    indexPage.includes("<FlowChart"),
  "credit, how-to, about, graph",
);

check(
  "site title",
  SITE_TITLE === "Horus Heresy Order Flow Chart" &&
    layout.includes("{SITE_TITLE}") &&
    layout.includes("<title>{SITE_TITLE}</title>") &&
    layout.includes('class="site-title"') &&
    !layout.includes("Process chart") &&
    !layout.includes("Process Name") &&
    !indexPage.includes("Process chart") &&
    !indexPage.includes("Process Name"),
  SITE_TITLE,
);
const labels = navLinks.map((link) => link.label);
check(
  "nav order",
  labels.join(" | ") === "Graph | Credit | About | How to use this chart" &&
    navLinks[0].href === "/" &&
    navLinks[1].href === "/credit" &&
    navLinks[2].href === "/about" &&
    navLinks[3].href === "/how-to-use-this-chart" &&
    layout.includes("navLinks.map"),
  labels.join(" | "),
);

const graph = buildChartGraph();
const byId = new Map(graph.works.map((item) => [item.id, item]));
const detailIds = new Set(Object.keys(workDetails));
const nonShortcut = graph.works.filter((item) => item.kind !== "shortcut");
const missingDetails = nonShortcut
  .filter((item) => !detailIds.has(item.id))
  .map((item) => item.id);
const extraDetails = [...detailIds].filter(
  (id) => !nonShortcut.some((item) => item.id === id),
);
check(
  "every work has details",
  missingDetails.length === 0 && extraDetails.length === 0,
  `missing ${missingDetails.join(",") || "none"} extra ${extraDetails.join(",") || "none"}`,
);

const incomplete = nonShortcut.filter((item) => {
  const details = workDetails[item.id];
  return (
    !details ||
    details.author.trim() === "" ||
    !Number.isInteger(details.year) ||
    details.length.trim() === "" ||
    details.description.trim() === ""
  );
});
check(
  "details have author, year, length and description",
  incomplete.length === 0,
  incomplete.map((item) => item.id).join(",") || "all complete",
);

const work = graph.works.find((item) => item.id === "the-last-church");
const other = graph.works.find(
  (item) => item.kind !== "shortcut" && item.id !== work?.id,
);
check(
  "fixture works exist",
  Boolean(work && other),
  `${work?.id ?? "missing"} / ${other?.id ?? "missing"}`,
);

if (work && other) {
  const selection = selectionFor(work, byId);
  check(
    "selection reads the chart title and published details",
    selection.id === work.id &&
      selection.title === work.title &&
      selection.publication === work.publication &&
      selection.author === "Graham McNeill" &&
      selection.year === 2009 &&
      selection.length === "1 hr 26 min audio" &&
      selection.description === workDetails[work.id].description &&
      selection.description.length > 0 &&
      selection.factions.length === 1 &&
      selection.factions[0]?.name === "Expunged from Imperial Archives",
    `${selection.title} by ${selection.author}, ${selection.year}, ${selection.length}, ${selection.factions.map((faction) => faction.name).join(",")}`,
  );

  let sidebar = toggleWorkSidebar(closedSidebar(), selection);
  check(
    "work click opens sidebar",
    sidebar.open &&
      sidebar.workId === work.id &&
      sidebar.bookName === work.title &&
      sidebar.publication === work.publication &&
      sidebar.author === "Graham McNeill" &&
      sidebar.year === 2009 &&
      sidebar.length === "1 hr 26 min audio" &&
      sidebar.description === workDetails[work.id].description &&
      sidebar.factions.length === 1 &&
      sidebar.widthFraction === SIDEBAR_WIDTH_FRACTION &&
      sidebar.widthFraction === 0.25 &&
      sidebar.entrance === SIDEBAR_ENTRANCE &&
      sidebar.entrance === "right",
    `${sidebar.bookName} width ${sidebar.widthFraction} from ${sidebar.entrance}`,
  );

  sidebar = toggleWorkSidebar(sidebar, selection);
  check(
    "second click closes sidebar",
    !sidebar.open && sidebar.workId === null && sidebar.bookName === "",
    `open ${sidebar.open}`,
  );

  const otherSelection = selectionFor(other, byId);
  sidebar = toggleWorkSidebar(closedSidebar(), selection);
  sidebar = toggleWorkSidebar(sidebar, otherSelection);
  check(
    "different work replaces the book",
    sidebar.open &&
      sidebar.workId === other.id &&
      sidebar.bookName === other.title &&
      sidebar.author === workDetails[other.id].author &&
      sidebar.year === workDetails[other.id].year &&
      sidebar.bookName !== work.title,
    `${sidebar.bookName} by ${sidebar.author}`,
  );

  const authored = toggleWorkSidebar(closedSidebar(), {
    ...selection,
    author: "Kept Author",
  });
  check(
    "author line reads only the work author",
    authored.author === "Kept Author" &&
      authored.bookName === work.title &&
      workAuthor({ id: work.id, title: work.title, author: null }) === "" &&
      workAuthor({ id: work.id, title: work.title }) === "",
    authored.author,
  );
}

const badge = graph.works.find((item) => item.kind === "shortcut");
if (badge?.standsFor) {
  const target = byId.get(badge.standsFor);
  if (target) {
    const selection = selectionFor(badge, byId);
    check(
      "shortcut shows the work it stands for",
      selection.id === target.id &&
        selection.title === target.title &&
        selection.author === workDetails[target.id].author &&
        selection.length === workDetails[target.id].length,
      `${badge.publication} -> ${selection.title} by ${selection.author}`,
    );
  }
}

const unmapped = graph.works.filter(
  (item) => factionsFor(item.color).length === 0,
);
check(
  "every work colour maps to a faction",
  unmapped.length === 0,
  unmapped.map((item) => item.id).join(",") || "all mapped",
);
check(
  "legend colours drive the legion names",
  factionsFor(["#f597d3"])[0]?.name === "Emperor's Children" &&
    factionsFor(["#fffcec"])[0]?.name === "Luna Wolves / Sons of Horus" &&
    factionsFor(["#000000"])[0]?.name === "Raven Guard" &&
    factionsFor(["#b09642"])[0]?.name === "Siege of Terra" &&
    factionsFor(["#00461f", "#f597d3"])
      .map((faction) => faction.name)
      .join(",") === "Dark Angels,Emperor's Children",
  FACTION_COLORS.map((faction) => faction.name).join(","),
);

const legend = initialLegend();
const openedLegend = openLegend();
const closedLegendState = closeLegend();
check(
  "legend starts closed",
  legend.open === false && legend.body === "",
  `open ${legend.open}`,
);
check(
  "legend opens to an empty body",
  openedLegend.open === true && openedLegend.body === "",
  `body ${JSON.stringify(openedLegend.body)}`,
);
check(
  "legend close returns to closed",
  closedLegendState.open === false && closedLegendState.body === "",
  `open ${closedLegendState.open}`,
);

check(
  "chart control config",
  chartControlConfig.showInteractivityToggle === false &&
    chartControlConfig.interactionEnabled === true &&
    chartControlConfig.panOnDrag === true &&
    chartControlConfig.zoomOnScroll === true &&
    chartControlConfig.zoomOnPinch === true &&
    chartControlConfig.zoomOnDoubleClick === true &&
    chartControlConfig.nodesDraggable === false,
  `toggle ${chartControlConfig.showInteractivityToggle} interaction ${chartControlConfig.interactionEnabled}`,
);

const flowSource = readFileSync("src/components/FlowChart.tsx", "utf8");
const css = readFileSync("src/styles/global.css", "utf8");
const themeSource = readFileSync("src/site/theme.ts", "utf8");
const themeToggleSource = readFileSync(
  "src/components/ThemeToggle.astro",
  "utf8",
);
check(
  "chart wires the shipped chrome",
  flowSource.includes("toggleWorkSidebar") &&
    flowSource.includes("selectionFor") &&
    flowSource.includes("openLegend()") &&
    flowSource.includes("closeLegend()") &&
    flowSource.includes(
      "showInteractive={chartControlConfig.showInteractivityToggle}",
    ) &&
    flowSource.includes("chartControlConfig.interactionEnabled") &&
    flowSource.includes('className: "nopan"') &&
    /Legend\s*<\/button>/.test(flowSource) &&
    /Close\s*<\/button>/.test(flowSource) &&
    flowSource.includes('className="legend-body"') &&
    flowSource.includes("sidebar.bookName") &&
    flowSource.includes("sidebar.author") &&
    flowSource.includes("sidebar.year") &&
    flowSource.includes("sidebar.length") &&
    flowSource.includes("sidebar.factions") &&
    flowSource.includes('className="sidebar-close"') &&
    flowSource.includes("closedSidebar()") &&
    flowSource.includes("data-entrance={sidebar.entrance}") &&
    flowSource.includes("SIDEBAR_WIDTH_FRACTION") &&
    !flowSource.includes("Toggle interactivity") &&
    !flowSource.includes("Toggle Interactivity") &&
    !/showInteractive=\{true\}/.test(flowSource) &&
    css.includes("translateX(100%)") &&
    css.includes("--work-sidebar-width") &&
    css.includes(".sidebar-close") &&
    css.includes(".sidebar-facts") &&
    css.includes(".faction-chip") &&
    css.includes(".legend-button") &&
    css.includes(".legend-body"),
  "sidebar, legend, no interactivity toggle",
);

const lunaWolves = search("luna wolves").find(
  (result) => result.kind === "legion",
);
check(
  "search resolves a legion to its works",
  Boolean(lunaWolves?.nodeIds.includes("horus-rising")),
  `${lunaWolves?.label ?? "missing"} -> ${lunaWolves?.nodeIds.length ?? 0} works`,
);

const abnett = search("abnett").find((result) => result.kind === "author");
check(
  "search resolves an author",
  Boolean(abnett && abnett.nodeIds.length > 0),
  `${abnett?.label ?? "missing"} -> ${abnett?.nodeIds.length ?? 0} works`,
);

const galaxy = search("galaxy in flames").find(
  (result) => result.kind === "work",
);
check(
  "search resolves a work by name",
  galaxy?.label === "GALAXY IN FLAMES",
  galaxy?.label ?? "missing",
);

check(
  "next work follows the red arrows",
  nextWorkIds("galaxy-in-flames").includes("the-flight-of-the-eisenstein"),
  nextWorkIds("galaxy-in-flames").join(","),
);

const masseNext = nextWorkIds("the-maste-f-mankin");
const callNext = nextWorkIds("call-of-the-lion");
check(
  "next work follows blue and green connections too",
  masseNext.includes("ordo-sinister") && callNext.includes("fallen-angels"),
  `the-maste-f-mankin -> ${masseNext.join(",")}; call-of-the-lion -> ${callNext.join(",")}`,
);

check(
  "theme follows the device and toggles from the header",
  themeSource.includes('THEME_STORAGE_KEY = "horus-heresy-theme"') &&
    layout.includes("data-theme-storage-key={THEME_STORAGE_KEY}") &&
    layout.includes("prefers-color-scheme: dark") &&
    layout.includes("<ThemeToggle storageKey={THEME_STORAGE_KEY}") &&
    themeToggleSource.includes("prefers-color-scheme: dark") &&
    themeToggleSource.includes("themechange") &&
    css.includes(':root[data-theme="dark"]') &&
    css.includes(".theme-toggle") &&
    flowSource.includes("useSyncExternalStore") &&
    flowSource.includes("colorMode={colorMode}"),
  "device default, header toggle, chart color mode",
);

check(
  "search centers the selected works",
  flowSource.includes("handleSearchSelect") &&
    flowSource.includes("focusIds") &&
    flowSource.includes("focusKey") &&
    flowSource.includes("fitView({") &&
    flowSource.includes("nodes: focusIds.map"),
  "search selection drives fitView",
);

check(
  "search, pulse, description and close chrome",
  flowSource.includes("useNodesState") &&
    flowSource.includes("is-pulsing") &&
    flowSource.includes("nextWorkIds") &&
    flowSource.includes("sidebar.description") &&
    flowSource.includes('className="sidebar-description"') &&
    flowSource.includes('className="sidebar-top"') &&
    css.includes(".chart-search") &&
    css.includes(".chart-search-results") &&
    css.includes(".is-pulsing") &&
    css.includes("@keyframes work-pulse") &&
    css.includes(".sidebar-description") &&
    css.includes(".sidebar-top"),
  "search overlay, pulse animation, description and top close button",
);

lines.push("");
lines.push(
  failures.length === 0 ? "RESULT pass" : `RESULT fail ${failures.join(", ")}`,
);
console.log(lines.join("\n"));
if (failures.length > 0) {
  process.exitCode = 1;
}

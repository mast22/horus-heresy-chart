import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildChartGraph, type ChartWork } from "../src/flow/chart.ts";
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

const graph = buildChartGraph();
const byId = new Map(graph.works.map((item) => [item.id, item]));
const nonShortcut = graph.works.filter((item) => item.kind !== "shortcut");

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function requireWork(id: string): ChartWork {
  const work = graph.works.find((item) => item.id === id);
  assert.ok(work, `missing work ${id}`);
  return work;
}

function firstOtherWork(id: string): ChartWork {
  const work = graph.works.find(
    (item) => item.kind !== "shortcut" && item.id !== id,
  );
  assert.ok(work, "no second work");
  return work;
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

describe("page copy", () => {
  it("extracts credit and how-to sections", () => {
    assert.ok(sampleCopy.credit.includes("This flowchart is fanmade."));
    assert.ok(sampleCopy.credit.includes("Still part of credit."));
    assert.ok(sampleCopy.credit.includes("Made by Nico."));
    assert.ok(sampleCopy.credit.includes("# Credit"));
    assert.ok(sampleCopy.credit.includes("# Original Creators"));
    assert.equal(sampleCopy.credit.includes("Follow the arrows first."), false);
    assert.equal(sampleCopy.credit.includes("Keep this note."), false);
    assert.equal(sampleCopy.credit.includes("Also keep."), false);
    assert.ok(sampleCopy.howTo.includes("# How to use this chart"));
    assert.ok(sampleCopy.howTo.includes("Follow the arrows first."));
    assert.equal(sampleCopy.howTo.includes("Made by Nico."), false);
    assert.equal(sampleCopy.howTo.includes("fanmade"), false);
  });

  it("strips credit sections from the remaining text", () => {
    const copy = sampleCopy ?? extractPageCopy(sample);
    assert.equal(hasHeading(copy.remaining, /^credit$/i), false);
    assert.equal(
      hasHeading(copy.remaining, /^original(?:\s+chart)?\s+creators$/i),
      false,
    );
    assert.equal(copy.remaining.includes("fanmade"), false);
    assert.equal(copy.remaining.includes("Made by Nico."), false);
    assert.ok(copy.remaining.includes("# How to use this chart"));
    assert.ok(copy.remaining.includes("Follow the arrows first."));
    assert.ok(copy.remaining.includes("Keep this note."));
    assert.ok(copy.remaining.includes("Also keep."));
  });

  it("returns empty bodies for empty markdown", () => {
    const empty = extractPageCopy("");
    assert.equal(empty.credit, "");
    assert.equal(empty.howTo, "");
    assert.equal(empty.remaining, "");
  });
});

describe("pages and navigation", () => {
  it("renders the moved markdown chapters", () => {
    const creditPage = read("src/pages/credit.astro");
    const howToPage = read("src/pages/how-to-use-this-chart.astro");
    const aboutPage = read("src/pages/about.astro");
    const indexPage = read("src/pages/index.astro");
    const creditMarkdown = read("src/copy/credit.md");
    const howToMarkdown = read("src/copy/how-to-use-this-chart.md");

    assert.ok(
      creditPage.includes('import { Content } from "../copy/credit.md"'),
    );
    assert.ok(creditPage.includes("<Content />"));
    assert.equal(creditPage.includes("text_data.md"), false);
    assert.equal(creditPage.includes("creditPageBody"), false);
    assert.ok(
      howToPage.includes(
        'import { Content } from "../copy/how-to-use-this-chart.md"',
      ),
    );
    assert.ok(howToPage.includes("<Content />"));
    assert.equal(howToPage.includes("text_data.md"), false);
    assert.equal(howToPage.includes("howToPageBody"), false);
    assert.ok(hasHeading(creditMarkdown, /^game workshop credit$/i));
    assert.ok(
      hasHeading(creditMarkdown, /^original flow chart creators credit$/i),
    );
    assert.ok(creditMarkdown.includes("This flowchart is fanmade"));
    assert.ok(creditMarkdown.includes("Nico."));
    assert.equal(hasHeading(creditMarkdown, /^how to use this chart$/i), false);
    assert.ok(hasHeading(howToMarkdown, /^how to use this chart$/i));
    assert.ok(howToMarkdown.includes("spoiler-free reading order"));
    assert.equal(howToMarkdown.includes("This flowchart is fanmade"), false);
    assert.equal(howToMarkdown.includes("Nico."), false);
    assert.match(aboutPage, /<main class="text-page">\s*<\/main>/);
    assert.equal(aboutPage.includes("creditPage"), false);
    assert.ok(indexPage.includes("<FlowChart"));
  });

  it("sets the site title in the layout", () => {
    const layout = read("src/layouts/BaseLayout.astro");
    const indexPage = read("src/pages/index.astro");
    assert.equal(SITE_TITLE, "Horus Heresy Order Flow Chart");
    assert.ok(layout.includes("{SITE_TITLE}"));
    assert.ok(layout.includes("<title>{SITE_TITLE}</title>"));
    assert.ok(layout.includes('class="site-title"'));
    assert.equal(layout.includes("Process chart"), false);
    assert.equal(layout.includes("Process Name"), false);
    assert.equal(indexPage.includes("Process chart"), false);
    assert.equal(indexPage.includes("Process Name"), false);
  });

  it("keeps the navigation order and labels", () => {
    const layout = read("src/layouts/BaseLayout.astro");
    const labels = navLinks.map((link) => link.label);
    assert.equal(
      labels.join(" | "),
      "Graph | Credit | About | How to use this chart",
    );
    assert.equal(navLinks[0].href, "/");
    assert.equal(navLinks[1].href, "/credit");
    assert.equal(navLinks[2].href, "/about");
    assert.equal(navLinks[3].href, "/how-to-use-this-chart");
    assert.ok(layout.includes("navLinks.map"));
  });
});

describe("work details", () => {
  it("has details for every non-shortcut work", () => {
    const detailIds = new Set(Object.keys(workDetails));
    const missing = nonShortcut
      .filter((item) => !detailIds.has(item.id))
      .map((item) => item.id);
    const extra = [...detailIds].filter(
      (id) => !nonShortcut.some((item) => item.id === id),
    );
    assert.deepEqual(missing, [], "missing details");
    assert.deepEqual(extra, [], "details for works that are not in the chart");
  });

  it("fills in every detail field", () => {
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
    assert.deepEqual(
      incomplete.map((item) => item.id),
      [],
      "incomplete details",
    );
  });
});

describe("selection and sidebar", () => {
  const work = requireWork("the-last-church");
  const other = firstOtherWork(work.id);

  it("reads the chart title and published details", () => {
    const selection = selectionFor(work, byId);
    assert.equal(selection.id, work.id);
    assert.equal(selection.title, work.title);
    assert.equal(selection.publication, work.publication);
    assert.equal(selection.author, "Graham McNeill");
    assert.equal(selection.year, 2009);
    assert.equal(selection.length, "1 hr 26 min audio");
    assert.equal(selection.description, workDetails[work.id].description);
    assert.ok(selection.description.length > 0);
    assert.equal(selection.factions.length, 1);
    assert.equal(
      selection.factions[0]?.name,
      "Expunged from Imperial Archives",
    );
  });

  it("opens the sidebar on a work click", () => {
    const selection = selectionFor(work, byId);
    const sidebar = toggleWorkSidebar(closedSidebar(), selection);
    assert.equal(sidebar.open, true);
    assert.equal(sidebar.workId, work.id);
    assert.equal(sidebar.bookName, work.title);
    assert.equal(sidebar.publication, work.publication);
    assert.equal(sidebar.author, "Graham McNeill");
    assert.equal(sidebar.year, 2009);
    assert.equal(sidebar.length, "1 hr 26 min audio");
    assert.equal(sidebar.description, workDetails[work.id].description);
    assert.equal(sidebar.factions.length, 1);
    assert.equal(sidebar.widthFraction, SIDEBAR_WIDTH_FRACTION);
    assert.equal(sidebar.widthFraction, 0.25);
    assert.equal(sidebar.entrance, SIDEBAR_ENTRANCE);
    assert.equal(sidebar.entrance, "right");
  });

  it("closes the sidebar on a second click", () => {
    const selection = selectionFor(work, byId);
    const open = toggleWorkSidebar(closedSidebar(), selection);
    const closed = toggleWorkSidebar(open, selection);
    assert.equal(closed.open, false);
    assert.equal(closed.workId, null);
    assert.equal(closed.bookName, "");
  });

  it("replaces the book when a different work is clicked", () => {
    const sidebar = toggleWorkSidebar(
      toggleWorkSidebar(closedSidebar(), selectionFor(work, byId)),
      selectionFor(other, byId),
    );
    assert.equal(sidebar.open, true);
    assert.equal(sidebar.workId, other.id);
    assert.equal(sidebar.bookName, other.title);
    assert.equal(sidebar.author, workDetails[other.id].author);
    assert.equal(sidebar.year, workDetails[other.id].year);
    assert.notEqual(sidebar.bookName, work.title);
  });

  it("shows only the author carried by the work", () => {
    const selection = selectionFor(work, byId);
    const authored = toggleWorkSidebar(closedSidebar(), {
      ...selection,
      author: "Kept Author",
    });
    assert.equal(authored.author, "Kept Author");
    assert.equal(authored.bookName, work.title);
    assert.equal(
      workAuthor({ id: work.id, title: work.title, author: null }),
      "",
    );
    assert.equal(workAuthor({ id: work.id, title: work.title }), "");
  });

  it("shows the full-size work behind a shortcut badge", () => {
    const badge = graph.works.find((item) => item.kind === "shortcut");
    assert.ok(badge, "no shortcut badge");
    assert.ok(badge.standsFor, `${badge.id} has no standsFor`);
    const target = byId.get(badge.standsFor);
    assert.ok(target, `missing target ${badge.standsFor}`);
    const selection = selectionFor(badge, byId);
    assert.equal(selection.id, target.id);
    assert.equal(selection.title, target.title);
    assert.equal(selection.author, workDetails[target.id].author);
    assert.equal(selection.length, workDetails[target.id].length);
  });
});

describe("factions and legend", () => {
  it("maps every work colour to a faction", () => {
    const unmapped = graph.works.filter(
      (item) => factionsFor(item.color).length === 0,
    );
    assert.deepEqual(
      unmapped.map((item) => item.id),
      [],
      "unmapped work colours",
    );
  });

  it("drives the legion names from the legend colours", () => {
    assert.equal(factionsFor(["#f597d3"])[0]?.name, "Emperor's Children");
    assert.equal(
      factionsFor(["#fffcec"])[0]?.name,
      "Luna Wolves / Sons of Horus",
    );
    assert.equal(factionsFor(["#000000"])[0]?.name, "Raven Guard");
    assert.equal(factionsFor(["#b09642"])[0]?.name, "Siege of Terra");
    assert.equal(
      factionsFor(["#00461f", "#f597d3"])
        .map((faction) => faction.name)
        .join(","),
      "Dark Angels,Emperor's Children",
    );
    assert.ok(FACTION_COLORS.length > 0);
  });

  it("keeps the legend closed, opens it empty, and closes it again", () => {
    const legend = initialLegend();
    assert.equal(legend.open, false);
    assert.equal(legend.body, "");
    const opened = openLegend();
    assert.equal(opened.open, true);
    assert.equal(opened.body, "");
    const closed = closeLegend();
    assert.equal(closed.open, false);
    assert.equal(closed.body, "");
  });
});

describe("chart chrome", () => {
  it("uses the shipped control configuration", () => {
    assert.equal(chartControlConfig.showInteractivityToggle, false);
    assert.equal(chartControlConfig.interactionEnabled, true);
    assert.equal(chartControlConfig.panOnDrag, true);
    assert.equal(chartControlConfig.zoomOnScroll, true);
    assert.equal(chartControlConfig.zoomOnPinch, true);
    assert.equal(chartControlConfig.zoomOnDoubleClick, true);
    assert.equal(chartControlConfig.nodesDraggable, false);
  });

  it("wires the sidebar, legend, and no interactivity toggle", () => {
    const flowSource = read("src/components/FlowChart.tsx");
    const css = read("src/styles/global.css");
    assert.ok(flowSource.includes("toggleWorkSidebar"));
    assert.ok(flowSource.includes("selectionFor"));
    assert.ok(flowSource.includes("openLegend()"));
    assert.ok(flowSource.includes("closeLegend()"));
    assert.ok(
      flowSource.includes(
        "showInteractive={chartControlConfig.showInteractivityToggle}",
      ),
    );
    assert.ok(flowSource.includes("chartControlConfig.interactionEnabled"));
    assert.ok(flowSource.includes('className: "nopan"'));
    assert.match(flowSource, /Legend\s*<\/button>/);
    assert.match(flowSource, /Close\s*<\/button>/);
    assert.ok(flowSource.includes('className="legend-body"'));
    assert.ok(flowSource.includes("sidebar.bookName"));
    assert.ok(flowSource.includes("sidebar.author"));
    assert.ok(flowSource.includes("sidebar.year"));
    assert.ok(flowSource.includes("sidebar.length"));
    assert.ok(flowSource.includes("sidebar.factions"));
    assert.ok(flowSource.includes('className="sidebar-close"'));
    assert.ok(flowSource.includes("closedSidebar()"));
    assert.ok(flowSource.includes("data-entrance={sidebar.entrance}"));
    assert.ok(flowSource.includes("SIDEBAR_WIDTH_FRACTION"));
    assert.equal(flowSource.includes("Toggle interactivity"), false);
    assert.equal(flowSource.includes("Toggle Interactivity"), false);
    assert.doesNotMatch(flowSource, /showInteractive=\{true\}/);
    assert.ok(css.includes("translateX(100%)"));
    assert.ok(css.includes("--work-sidebar-width"));
    assert.ok(css.includes(".sidebar-close"));
    assert.ok(css.includes(".sidebar-facts"));
    assert.ok(css.includes(".faction-chip"));
    assert.ok(css.includes(".legend-button"));
    assert.ok(css.includes(".legend-body"));
  });

  it("uses the device theme and a header toggle", () => {
    const layout = read("src/layouts/BaseLayout.astro");
    const themeSource = read("src/site/theme.ts");
    const themeToggleSource = read("src/components/ThemeToggle.astro");
    const css = read("src/styles/global.css");
    const flowSource = read("src/components/FlowChart.tsx");
    assert.ok(themeSource.includes('THEME_STORAGE_KEY = "horus-heresy-theme"'));
    assert.ok(layout.includes("data-theme-storage-key={THEME_STORAGE_KEY}"));
    assert.ok(layout.includes("prefers-color-scheme: dark"));
    assert.ok(layout.includes("<ThemeToggle storageKey={THEME_STORAGE_KEY}"));
    assert.ok(themeToggleSource.includes("prefers-color-scheme: dark"));
    assert.ok(themeToggleSource.includes("themechange"));
    assert.ok(css.includes(':root[data-theme="dark"]'));
    assert.ok(css.includes(".theme-toggle"));
    assert.ok(flowSource.includes("useSyncExternalStore"));
    assert.ok(flowSource.includes("colorMode={colorMode}"));
  });

  it("centers selected search results", () => {
    const flowSource = read("src/components/FlowChart.tsx");
    assert.ok(flowSource.includes("handleSearchSelect"));
    assert.ok(flowSource.includes("focusIds"));
    assert.ok(flowSource.includes("focusKey"));
    assert.ok(flowSource.includes("fitView({"));
    assert.ok(flowSource.includes("nodes: focusIds.map"));
  });

  it("renders the search, pulse, description, and close chrome", () => {
    const flowSource = read("src/components/FlowChart.tsx");
    const css = read("src/styles/global.css");
    assert.ok(flowSource.includes("useNodesState"));
    assert.ok(flowSource.includes("is-pulsing"));
    assert.ok(flowSource.includes("pulseSourceId"));
    assert.ok(flowSource.includes("nextWorkIds"));
    assert.ok(flowSource.includes("sidebar.description"));
    assert.ok(flowSource.includes('className="sidebar-description"'));
    assert.ok(flowSource.includes('className="sidebar-top"'));
    assert.ok(css.includes(".chart-search"));
    assert.ok(css.includes(".chart-search-results"));
    assert.ok(css.includes(".is-pulsing"));
    assert.ok(css.includes("@keyframes work-pulse"));
    assert.ok(css.includes("@keyframes edge-pulse"));
    assert.ok(css.includes(".react-flow__edge.is-pulsing"));
    assert.ok(css.includes(".sidebar-description"));
    assert.ok(css.includes(".sidebar-top"));
  });
});

describe("search and navigation", () => {
  it("resolves a legion to its works", () => {
    const lunaWolves = search("luna wolves").find(
      (result) => result.kind === "legion",
    );
    assert.ok(lunaWolves, "missing Luna Wolves result");
    assert.ok(lunaWolves.nodeIds.includes("horus-rising"));
  });

  it("resolves an author", () => {
    const abnett = search("abnett").find((result) => result.kind === "author");
    assert.ok(abnett, "missing Dan Abnett result");
    assert.ok(abnett.nodeIds.length > 0);
  });

  it("resolves a work by name", () => {
    const galaxy = search("galaxy in flames").find(
      (result) => result.kind === "work",
    );
    assert.ok(galaxy, "missing Galaxy in Flames result");
    assert.equal(galaxy.label, "GALAXY IN FLAMES");
  });

  it("follows red, blue, and green connections", () => {
    assert.ok(
      nextWorkIds("galaxy-in-flames").includes("the-flight-of-the-eisenstein"),
    );
    assert.ok(nextWorkIds("the-maste-f-mankin").includes("ordo-sinister"));
    assert.ok(nextWorkIds("call-of-the-lion").includes("fallen-angels"));
  });
});

import { writeFileSync } from "node:fs";

import {
  buildChartGraph,
  type ChartWork,
  type Connection,
} from "../src/flow/chart.ts";

const scratch =
  process.argv[2] ??
  "/var/folders/p1/s4trrswx1q3b34blzrpss7x40000gn/T/grok-goal-5b0f2f99bc5c/implementer";

const graph = buildChartGraph();
const lines: string[] = [];
const failures: string[] = [];

function check(name: string, ok: boolean, detail: string) {
  lines.push(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
  if (!ok) {
    failures.push(name);
  }
}

const demoLabels = [
  "Source",
  "Intake",
  "Draft",
  "Review",
  "Revise",
  "Publish",
  "Archive",
];
for (const label of demoLabels) {
  const hit = graph.works.some((work) => work.title === label);
  check(`demo absent ${label}`, !hit, hit ? "present" : "absent");
}

const ids = new Set(graph.works.map((work) => work.id));
const connections = new Set<Connection>(["primary", "secondary", "tertiary"]);
let dangling = 0;
let badClass = 0;
for (const edge of graph.edges) {
  if (!ids.has(edge.source) || !ids.has(edge.target)) {
    dangling += 1;
  }
  if (!connections.has(edge.connection)) {
    badClass += 1;
  }
}
check(
  "edge endpoints exist",
  dangling === 0,
  `${graph.edges.length} edges, dangling ${dangling}`,
);
check(
  "edge connection class",
  badClass === 0,
  `non primary/secondary/tertiary: ${badClass}`,
);

const zoneLabels = [
  "Schism of Mars",
  "Prospero's Sack",
  "Thramas Crusade",
  "Shadow Crusade",
  "Imperium Secundus",
  "Isstvan III Betrayal",
  "Isstvan V Dropsite Massacre",
  "Battle of the Phall System",
  "Battle of the Alaxxes Nebula",
  "Molech's Doom",
  "Battle of Tallarn",
  "Caliban's Rebellion",
  "War Within the Webway",
  "Beta-Garmon's Great Slaughter",
];
for (const label of zoneLabels) {
  const zone = graph.zones.find((item) => item.label === label);
  const members = graph.works.filter((work) => work.zone === label);
  check(
    `zone ${label}`,
    Boolean(zone && zone.label.trim().length > 0 && zone.w > 0 && zone.h > 0),
    zone ? `${zone.w}x${zone.h} members ${members.length}` : "missing",
  );
}

const ribbons = graph.works.filter((work) => work.ribbon);
check("ribbon recorded", ribbons.length > 0, `${ribbons.length} ribbon works`);

const eras = new Set(graph.works.map((work) => work.era));
const heresy = graph.works.filter((work) => work.era === "horus-heresy");
const siege = graph.works.filter((work) => work.era === "siege-of-terra");
check(
  "era bands",
  heresy.length > 0 && siege.length > 0,
  `heresy ${heresy.length}, siege ${siege.length}, bands ${[...eras].join(",")}`,
);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

const heresyX = median(heresy.map((work) => work.x + work.w / 2));
const siegeX = median(siege.map((work) => work.x + work.w / 2));
check(
  "siege median x greater",
  siegeX > heresyX,
  `siege ${siegeX} heresy ${heresyX}`,
);

const shortcuts = graph.works.filter((work) => work.kind === "shortcut");
let shortcutOnly = 0;
for (const badge of shortcuts) {
  const full = graph.works.find(
    (work) => work.id === badge.standsFor && work.kind !== "shortcut",
  );
  if (!full || full.title !== badge.title) {
    shortcutOnly += 1;
    lines.push(
      `  shortcut problem ${badge.id} letters=${badge.letters} standsFor=${badge.standsFor}`,
    );
  }
}
check(
  "shortcuts are not the only copy",
  shortcuts.length > 0 && shortcutOnly === 0,
  `${shortcuts.length} badges, problems ${shortcutOnly}, letters ${[...new Set(shortcuts.map((badge) => badge.letters))].join(",")}`,
);

function findWork(title: RegExp, publication: RegExp): ChartWork | undefined {
  return graph.works.find(
    (work) =>
      work.kind !== "shortcut" &&
      title.test(work.title) &&
      publication.test(work.publication),
  );
}

function hasEdge(
  source: string | undefined,
  target: string | undefined,
  connection: Connection,
): boolean {
  if (!source || !target) {
    return false;
  }
  return graph.edges.some(
    (edge) =>
      edge.source === source &&
      edge.target === target &&
      edge.connection === connection,
  );
}

const kaban = findWork(/kaban project/i, /book\s*22/i);
const mechanicum = findWork(/^mechanicum$/i, /book\s*9/i);
const nikaea = findWork(/prologue to nikaea/i, /ebook/i);
const thousand = findWork(/thousand sons/i, /book\s*12/i);
const burns = findWork(/prospero burns/i, /book\s*15/i);
const rebirth = findWork(/^rebirth$/i, /book\s*16/i);
const mankind = findWork(/master of mankind/i, /book\s*41/i);
const ordo = findWork(/ordo sinister/i, /book\s*48/i);
const bringer = findWork(/bringer of sorrow/i, /ebook/i);
const magisterium = findWork(/^magisterium$/i, /book\s*52/i);
const king = findWork(/crimson king/i, /book\s*44/i);
const church = findWork(/last church/i, /book\s*10/i);

check(
  "kaban is book 22 short story",
  kaban?.kind === "shortStory",
  `${kaban?.kind ?? "missing"} ${kaban?.publication ?? ""}`,
);
check(
  "kaban primary to mechanicum",
  hasEdge(kaban?.id, mechanicum?.id, "primary"),
  `${kaban?.title ?? "missing"} -> ${mechanicum?.title ?? "missing"}`,
);
check(
  "mechanicum is book 9 novel",
  mechanicum?.kind === "novel" && mechanicum.publication === "Book 9",
  `${mechanicum?.kind ?? "missing"} ${mechanicum?.publication ?? ""}`,
);
check(
  "nikaea is ebook",
  nikaea?.kind === "ebook",
  nikaea?.publication ?? "missing",
);
check(
  "nikaea secondary to thousand sons",
  hasEdge(nikaea?.id, thousand?.id, "secondary"),
  `${nikaea?.publication ?? "missing"} -> ${thousand?.title ?? "missing"}`,
);
check(
  "thousand sons is ribboned novel",
  thousand?.kind === "novel" &&
    thousand.publication === "Book 12" &&
    thousand.ribbon,
  `${thousand?.kind ?? "missing"} ${thousand?.publication ?? ""} rib=${thousand?.ribbon ?? false}`,
);
check(
  "thousand sons primary to prospero burns",
  hasEdge(thousand?.id, burns?.id, "primary"),
  `${thousand?.title ?? "missing"} -> ${burns?.title ?? "missing"}`,
);
check(
  "prospero burns is book 15 novel",
  burns?.kind === "novel" && burns.publication === "Book 15",
  `${burns?.kind ?? "missing"} ${burns?.publication ?? ""}`,
);
check(
  "prospero burns primary to rebirth",
  hasEdge(burns?.id, rebirth?.id, "primary"),
  `${burns?.title ?? "missing"} -> ${rebirth?.publication ?? "missing"}`,
);
check(
  "rebirth is book 16 short story",
  rebirth?.kind === "shortStory" && /book\s*16/i.test(rebirth.publication),
  rebirth?.publication ?? "missing",
);
check(
  "master of mankind ribbons",
  mankind?.kind === "novel" &&
    mankind.publication === "Book 41" &&
    mankind.ribbon,
  `${mankind?.kind ?? "missing"} ${mankind?.publication ?? ""}`,
);
check(
  "master of mankind in webway",
  mankind?.zone === "War Within the Webway",
  mankind?.zone ?? "missing",
);
check(
  "ordo sinister is book 48",
  ordo?.kind === "shortStory" && /book\s*48/i.test(ordo.publication),
  ordo?.publication ?? "missing",
);
check(
  "master of mankind secondary to ordo sinister",
  hasEdge(mankind?.id, ordo?.id, "secondary"),
  `${ordo?.publication ?? "missing"}`,
);
check(
  "bringer of sorrow is ebook",
  bringer?.kind === "ebook",
  bringer?.publication ?? "missing",
);
check(
  "master of mankind primary to bringer of sorrow",
  hasEdge(mankind?.id, bringer?.id, "primary"),
  bringer?.publication ?? "missing",
);
check(
  "magisterium is book 52 short story",
  magisterium?.kind === "shortStory" &&
    /book\s*52/i.test(magisterium.publication),
  magisterium?.publication ?? "missing",
);
check(
  "master of mankind primary to magisterium",
  hasEdge(mankind?.id, magisterium?.id, "primary"),
  magisterium?.publication ?? "missing",
);
check(
  "crimson king ribbons",
  king?.kind === "novel" && king.publication === "Book 44" && king.ribbon,
  `${king?.kind ?? "missing"} ${king?.publication ?? ""}`,
);
check(
  "last church is book 10",
  church?.kind === "shortStory" && /book\s*10/i.test(church.publication),
  church?.publication ?? "missing",
);

const lost = findWork(/lost and the damned/i, /terra book\s*2/i);
const firstWall = findWork(/first wall/i, /terra book\s*3/i);
const saturnine = findWork(/^saturnine$/i, /terra book\s*4/i);
const mortis = findWork(/^mortis$/i, /terra book\s*5/i);
const warhawk = findWork(/^warhawk$/i, /terra book\s*6/i);

function siegeNovel(
  work: ChartWork | undefined,
  label: string,
  publication: string,
) {
  check(
    `${label} is a ribboned siege novel`,
    work?.kind === "novel" &&
      work.publication === publication &&
      work.ribbon === true &&
      work.era === "siege-of-terra",
    `${work?.kind ?? "missing"} ${work?.publication ?? ""} rib=${work?.ribbon ?? false} era=${work?.era ?? "missing"}`,
  );
}

siegeNovel(lost, "lost and the damned", "Terra Book 2");
siegeNovel(firstWall, "first wall", "Terra Book 3");
siegeNovel(saturnine, "saturnine", "Terra Book 4");
siegeNovel(mortis, "mortis", "Terra Book 5");
siegeNovel(warhawk, "warhawk", "Terra Book 6");
check(
  "lost and the damned primary to first wall",
  hasEdge(lost?.id, firstWall?.id, "primary"),
  `${lost?.title ?? "missing"} -> ${firstWall?.title ?? "missing"}`,
);
check(
  "first wall primary to saturnine",
  hasEdge(firstWall?.id, saturnine?.id, "primary"),
  `${firstWall?.title ?? "missing"} -> ${saturnine?.title ?? "missing"}`,
);
check(
  "saturnine primary to mortis",
  hasEdge(saturnine?.id, mortis?.id, "primary"),
  `${saturnine?.title ?? "missing"} -> ${mortis?.title ?? "missing"}`,
);
check(
  "mortis primary to warhawk",
  hasEdge(mortis?.id, warhawk?.id, "primary"),
  `${mortis?.title ?? "missing"} -> ${warhawk?.title ?? "missing"}`,
);

const face = graph.works.find((work) => work.id === "the-face-of-treachery");
const deliverance = graph.works.find((work) => work.id === "deliverance-lost");
const ravenFlight = graph.works.find((work) => work.id === "raven-s-flight");
check(
  "raven's flight primary to the face of treachery",
  hasEdge(ravenFlight?.id, face?.id, "primary"),
  `${ravenFlight?.title ?? "missing"} -> ${face?.title ?? "missing"}`,
);
check(
  "the face of treachery primary to deliverance lost",
  hasEdge(face?.id, deliverance?.id, "primary"),
  `${face?.title ?? "missing"} -> ${deliverance?.title ?? "missing"}`,
);

const outcastDead = graph.works.find((work) => work.id === "the-outcast-dead");
const wolfHunt = graph.works.find((work) => work.id === "wolt-hunt");
const furyOfMagnus = graph.works.find(
  (work) => work.id === "the-fury-of-magnus",
);
const callOfTheLion = graph.works.find(
  (work) => work.id === "call-of-the-lion",
);
const fallenAngels = graph.works.find((work) => work.id === "fallen-angels");
const forgottenSons = graph.works.find((work) => work.id === "forgotten-sons");
const gatesOfTerra = graph.works.find(
  (work) => work.id === "the-gates-of-terra",
);
const sinsOfTheFather = graph.works.find(
  (work) => work.id === "sins-of-the-father-ther",
);
const heraldOfSanguinius = graph.works.find(
  (work) => work.id === "herald-of-sanguinius",
);
const mechanicumById = graph.works.find((work) => work.id === "mechanicum");
const lastChurch = graph.works.find((work) => work.id === "the-last-church");
const scionsOfTheStorm = graph.works.find(
  (work) => work.id === "scions-of-the-storm",
);
const purge = graph.works.find((work) => work.id === "the-purge");
const horusRising = graph.works.find((work) => work.id === "horus-rising");
const wolfOfAsh = graph.works.find(
  (work) => work.id === "the-wolf-of-ash-and-fire",
);
check(
  "the outcast dead primary to wolf hunt",
  hasEdge(outcastDead?.id, wolfHunt?.id, "primary"),
  `${outcastDead?.title ?? "missing"} -> ${wolfHunt?.title ?? "missing"}`,
);
check(
  "saturnine primary to the fury of magnus",
  hasEdge(saturnine?.id, furyOfMagnus?.id, "primary"),
  `${saturnine?.title ?? "missing"} -> ${furyOfMagnus?.title ?? "missing"}`,
);
check(
  "call of the lion tertiary to fallen angels",
  hasEdge(callOfTheLion?.id, fallenAngels?.id, "tertiary"),
  `${callOfTheLion?.title ?? "missing"} -> ${fallenAngels?.title ?? "missing"}`,
);
check(
  "forgotten sons tertiary to the gates of terra",
  hasEdge(forgottenSons?.id, gatesOfTerra?.id, "tertiary"),
  `${forgottenSons?.title ?? "missing"} -> ${gatesOfTerra?.title ?? "missing"}`,
);
check(
  "sins of the father tertiary to herald of sanguinius",
  hasEdge(sinsOfTheFather?.id, heraldOfSanguinius?.id, "tertiary"),
  `${sinsOfTheFather?.title ?? "missing"} -> ${heraldOfSanguinius?.title ?? "missing"}`,
);
check(
  "mechanicum tertiary to the last church",
  hasEdge(mechanicumById?.id, lastChurch?.id, "tertiary"),
  `${mechanicumById?.title ?? "missing"} -> ${lastChurch?.title ?? "missing"}`,
);
check(
  "scions of the storm tertiary to the purge",
  hasEdge(scionsOfTheStorm?.id, purge?.id, "tertiary"),
  `${scionsOfTheStorm?.title ?? "missing"} -> ${purge?.title ?? "missing"}`,
);
check(
  "horus rising tertiary to the wolf of ash and fire",
  hasEdge(horusRising?.id, wolfOfAsh?.id, "tertiary"),
  `${horusRising?.title ?? "missing"} -> ${wolfOfAsh?.title ?? "missing"}`,
);
check(
  "work count stays 253",
  graph.works.length === 253,
  `${graph.works.length}`,
);

lines.push("");
lines.push("## Spot-check Schism of Mars and War Within the Webway");

function dumpZone(label: string) {
  const members = graph.works.filter((work) => work.zone === label);
  lines.push(`-- ${label} (${members.length})`);
  for (const work of members) {
    lines.push(
      `  ${work.kind} rib=${work.ribbon} ${work.title} | ${work.publication} | ${work.letters ?? ""}`,
    );
  }
  const memberIds = new Set(members.map((work) => work.id));
  const internal = graph.edges.filter(
    (edge) => memberIds.has(edge.source) && memberIds.has(edge.target),
  );
  const leaving = graph.edges.filter(
    (edge) => memberIds.has(edge.source) && !memberIds.has(edge.target),
  );
  const entering = graph.edges.filter(
    (edge) => !memberIds.has(edge.source) && memberIds.has(edge.target),
  );
  const name = (id: string) =>
    graph.works.find((work) => work.id === id)?.title ?? id;
  for (const edge of [...internal, ...leaving, ...entering]) {
    lines.push(
      `  edge ${edge.connection} ${name(edge.source)} -> ${name(edge.target)}`,
    );
  }
}

dumpZone("Schism of Mars");
dumpZone("War Within the Webway");
lines.push("Spot-check notes:");
lines.push(
  "- Schism: Kaban Project (→ Book 22) primary into Mechanicum (Book 9), then primary onward to Into Exile, Vorax, Cybernetica, and The Lightning Hall. Fulgrim shortcut badges sit on the secondary links into those four stories. A tertiary link from Mechanicum up to The Last Church (→ Book 10) is on the poster; The Last Church itself sits just above the zone border.",
);
lines.push(
  "- Webway: The Master of Mankind (Book 41) is inside the zone, has both gold ribbons, a secondary link to Ordo Sinister (→ Book 48), and primary links to Bringer of Sorrow (eBook) and Magisterium (→ Book 52). The tracer had stopped on the shorter Bringer-to-Magisterium stub; that sibling edge is not kept.",
);
lines.push(
  "- Corrected: Bringer of Sorrow no longer carries ribbons. The gold sampled under that box belongs to The Master of Mankind.",
);
lines.push(
  "- Mismatch: a green tertiary line runs into The Board is Set on the poster. Its far end was not a reliable trace, so that edge is not invented. Tertiary coverage elsewhere is still thin compared with the poster.",
);
lines.push(
  "- Mismatch: conflict-zone rectangles other than Schism of Mars, War Within the Webway, the Phall system, Tallarn, and Isstvan III are approximate clusters around the printed labels. Membership outside the two spot-checked zones can include a neighbouring story.",
);
lines.push(
  "- Siege row: The First Wall, Saturnine, Mortis, and Warhawk (Terra Books 3–6) are on y=7978 with gold ribbons. Primary chain: The Lost and the Damned, The First Wall, Saturnine, Mortis, Warhawk. A border re-scan also recovered chamfered boxes the rectangular pass dropped: Misbegotten, Terminus, The Chamber at the End of Memory, Prince of Blood, and Scions of the Storm, plus a second SC badge and a second AE badge. A red stroke beside The First Wall does not enter that box. Lines that join a vertical spine without an arrowhead into one node were not added.",
);

lines.push("");
lines.push(
  failures.length === 0 ? "RESULT pass" : `RESULT fail ${failures.join(", ")}`,
);

const logPath = `${scratch}/graph-check.log`;
writeFileSync(logPath, `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
console.log(`wrote ${logPath}`);
if (failures.length > 0) {
  process.exitCode = 1;
}

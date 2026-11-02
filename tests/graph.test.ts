import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildChartGraph,
  type ChartWork,
  type Connection,
} from "../src/flow/chart.ts";

const graph = buildChartGraph();
const workById = new Map(graph.works.map((work) => [work.id, work]));
const ids = new Set(graph.works.map((work) => work.id));
const connections = new Set<Connection>(["primary", "secondary", "tertiary"]);

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

function edgeDetail(
  edge: (typeof graph.edges)[number],
  source?: ChartWork,
  target?: ChartWork,
): string {
  return `${edge.id} (${source?.title ?? "missing"} -> ${target?.title ?? "missing"})`;
}

describe("graph integrity", () => {
  it("does not contain demo works", () => {
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
      assert.equal(
        graph.works.some((work) => work.title === label),
        false,
        `${label} is present`,
      );
    }
  });

  it("keeps every edge endpoint inside the chart", () => {
    const dangling = graph.edges.filter(
      (edge) => !ids.has(edge.source) || !ids.has(edge.target),
    );
    assert.deepEqual(
      dangling.map((edge) => edge.id),
      [],
      `dangling endpoints: ${dangling.map((edge) => edge.id).join(", ")}`,
    );
  });

  it("classifies every edge as primary, secondary, or tertiary", () => {
    const badClass = graph.edges.filter(
      (edge) => !connections.has(edge.connection),
    );
    assert.deepEqual(
      badClass.map((edge) => edge.id),
      [],
      `unknown classes: ${badClass.map((edge) => edge.id).join(", ")}`,
    );
  });

  it("points every edge forward", () => {
    const backward = graph.edges.filter((edge) => {
      const source = workById.get(edge.source);
      const target = workById.get(edge.target);
      if (source?.kind === "shortcut") {
        return false;
      }
      return source && target && target.x <= source.x;
    });
    assert.deepEqual(
      backward.map((edge) =>
        edgeDetail(edge, workById.get(edge.source), workById.get(edge.target)),
      ),
      [],
      `${backward.length} edges do not advance rightward`,
    );
  });

  it("moves non-shortcut edges at least one column forward", () => {
    const columnOrigins = [
      ...new Set(
        graph.works
          .filter((work) => work.kind !== "shortcut" && work.kind !== "audio")
          .map((work) => work.x),
      ),
    ].sort((a, b) => a - b);

    function columnOf(x: number): number {
      let nearest = 0;
      for (let index = 1; index < columnOrigins.length; index += 1) {
        if (
          Math.abs(columnOrigins[index] - x) <
          Math.abs(columnOrigins[nearest] - x)
        ) {
          nearest = index;
        }
      }
      return nearest;
    }

    const nonAdvancing = graph.edges.filter((edge) => {
      const source = workById.get(edge.source);
      const target = workById.get(edge.target);
      if (!source || !target || source.kind === "shortcut") {
        return false;
      }
      return columnOf(target.x) <= columnOf(source.x);
    });
    assert.deepEqual(
      nonAdvancing.map((edge) =>
        edgeDetail(edge, workById.get(edge.source), workById.get(edge.target)),
      ),
      [],
      `${nonAdvancing.length} non-shortcut edges stay in the same column`,
    );
  });
});

describe("zones and eras", () => {
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
    it(`records the ${label} zone`, () => {
      const zone = graph.zones.find((item) => item.label === label);
      const members = graph.works.filter((work) => work.zone === label);
      assert.ok(zone, `missing zone ${label}`);
      assert.ok(zone.label.trim().length > 0, "zone label is empty");
      assert.ok(zone.w > 0 && zone.h > 0, `zone is ${zone.w}x${zone.h}`);
      assert.ok(members.length > 0, "zone has no members");
    });
  }

  it("records ribbons on at least one work", () => {
    const ribbons = graph.works.filter((work) => work.ribbon);
    assert.ok(ribbons.length > 0, "no ribbon works");
  });

  it("covers both era bands", () => {
    const heresy = graph.works.filter((work) => work.era === "horus-heresy");
    const siege = graph.works.filter((work) => work.era === "siege-of-terra");
    assert.ok(heresy.length > 0, "no Horus Heresy works");
    assert.ok(siege.length > 0, "no Siege of Terra works");
  });

  it("places the Siege of Terra to the right of the Heresy", () => {
    function median(values: number[]): number {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
      }
      return sorted[mid];
    }

    const heresyX = median(
      graph.works
        .filter((work) => work.era === "horus-heresy")
        .map((work) => work.x + work.w / 2),
    );
    const siegeX = median(
      graph.works
        .filter((work) => work.era === "siege-of-terra")
        .map((work) => work.x + work.w / 2),
    );
    assert.ok(siegeX > heresyX, `siege ${siegeX} heresy ${heresyX}`);
  });

  it("keeps every work inside its zone with breathing room", () => {
    const padding = 24;
    for (const work of graph.works) {
      if (!work.zone) {
        continue;
      }
      const zone = graph.zones.find((item) => item.label === work.zone);
      assert.ok(zone, `${work.id} names a missing zone`);
      const parts = zone.parts ?? [zone];
      const inside = parts.some(
        (part) =>
          work.x >= part.x + padding &&
          work.y >= part.y + padding &&
          work.x + work.w <= part.x + part.w - padding &&
          work.y + work.h <= part.y + part.h - padding,
      );
      assert.ok(inside, `${work.title} is not padded inside ${zone.label}`);
    }
  });

  it("keeps works from other storylines outside every zone", () => {
    const padding = 24;
    for (const zone of graph.zones) {
      const parts = zone.parts ?? [zone];
      for (const work of graph.works) {
        if (work.zone === zone.label) {
          continue;
        }
        for (const part of parts) {
          const intrudes =
            work.x < part.x + part.w + padding &&
            work.x + work.w > part.x - padding &&
            work.y < part.y + part.h + padding &&
            work.y + work.h > part.y - padding;
          assert.equal(
            intrudes,
            false,
            `${work.title} is too close to ${zone.label}`,
          );
        }
      }
    }
  });

  it("keeps storylines at least 24px apart", () => {
    const margin = 24;
    const partsOf = (zone: (typeof graph.zones)[number]) =>
      zone.parts ?? [zone];
    for (let i = 0; i < graph.zones.length; i += 1) {
      for (let j = i + 1; j < graph.zones.length; j += 1) {
        const left = graph.zones[i];
        const right = graph.zones[j];
        let closest = -Infinity;
        for (const a of partsOf(left)) {
          for (const b of partsOf(right)) {
            const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
            const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
            closest = Math.max(closest, Math.max(dx, dy));
          }
        }
        assert.ok(
          closest >= margin,
          `${left.label} and ${right.label} are ${closest}px apart`,
        );
      }
    }
  });

  it("draws irregular storylines as one solid block", () => {
    for (const zone of graph.zones) {
      if (!zone.parts || zone.parts.length < 2) {
        continue;
      }
      const seen = new Set<number>([0]);
      const queue = [0];
      while (queue.length > 0) {
        const index = queue.shift() as number;
        const a = zone.parts[index];
        zone.parts.forEach((b, other) => {
          if (seen.has(other)) {
            return;
          }
          const overlaps =
            a.x < b.x + b.w &&
            a.x + a.w > b.x &&
            a.y < b.y + b.h &&
            a.y + a.h > b.y;
          if (overlaps) {
            seen.add(other);
            queue.push(other);
          }
        });
      }
      assert.equal(
        seen.size,
        zone.parts.length,
        `${zone.label} has disconnected parts`,
      );
    }
  });

  it("keeps zone labels clear of every work", () => {
    for (const zone of graph.zones) {
      const width = Math.ceil(zone.label.length * 22 * 0.72 + 16);
      const label = {
        x: zone.labelX,
        y: zone.labelY,
        w: width,
        h: 34,
      };
      for (const work of graph.works) {
        const overlaps =
          work.x < label.x + label.w &&
          work.x + work.w > label.x &&
          work.y < label.y + label.h &&
          work.y + work.h > label.y;
        assert.equal(
          overlaps,
          false,
          `${zone.label} label is covered by ${work.title}`,
        );
      }
    }
  });

  it("declares the two expanded storylines' works", () => {
    const expected: Record<string, string[]> = {
      "Caliban's Rebellion": [
        "master-of-the-first",
        "guardian-of-order",
        "descent-of-angels",
        "call-of-the-lion",
        "fallen-angels",
      ],
      "Imperium Secundus": [
        "virtues-of-the-sons",
        "sins-of-the-father-ther",
        "herald-of-sanguinius",
        "a-safe-and-shadowe-shadowed-place",
        "the-heart-of-the-pharos",
        "the-laurel-of-defiance",
        "pharos",
        "the-unremembered-empire",
        "red-marked",
        "stratagem",
      ],
    };
    for (const [label, ids] of Object.entries(expected)) {
      const members = new Set(
        graph.works
          .filter((work) => work.zone === label)
          .map((work) => work.id),
      );
      for (const id of ids) {
        assert.ok(members.has(id), `${id} is missing from ${label}`);
      }
    }
    const imperium = graph.zones.find(
      (zone) => zone.label === "Imperium Secundus",
    );
    assert.ok(imperium?.parts && imperium.parts.length > 1, "not L-shaped");
  });

  it("keeps every shortcut anchored to a full-size work", () => {
    const shortcuts = graph.works.filter((work) => work.kind === "shortcut");
    assert.ok(shortcuts.length > 0, "no shortcut badges");
    for (const badge of shortcuts) {
      const full = graph.works.find(
        (work) => work.id === badge.standsFor && work.kind !== "shortcut",
      );
      assert.ok(full, `${badge.id} has no full-size work`);
      assert.equal(full.title, badge.title, `${badge.id} title differs`);
    }
  });
});

describe("work metadata", () => {
  it("matches known work kinds, publications, and ribbons", () => {
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

    assert.equal(kaban?.kind, "shortStory", "Kaban Project kind");
    assert.equal(mechanicum?.kind, "novel", "Mechanicum kind");
    assert.equal(mechanicum?.publication, "Book 9", "Mechanicum publication");
    assert.equal(nikaea?.kind, "ebook", "Prologue to Nikaea kind");
    assert.equal(thousand?.kind, "novel", "Thousand Sons kind");
    assert.equal(thousand?.publication, "Book 12", "Thousand Sons publication");
    assert.equal(thousand?.ribbon, true, "Thousand Sons ribbon");
    assert.equal(burns?.kind, "novel", "Prospero Burns kind");
    assert.equal(burns?.publication, "Book 15", "Prospero Burns publication");
    assert.equal(rebirth?.kind, "shortStory", "Rebirth kind");
    assert.match(
      rebirth?.publication ?? "",
      /book\s*16/i,
      "Rebirth publication",
    );
    assert.equal(mankind?.kind, "novel", "The Master of Mankind kind");
    assert.equal(
      mankind?.publication,
      "Book 41",
      "The Master of Mankind publication",
    );
    assert.equal(mankind?.ribbon, true, "The Master of Mankind ribbon");
    assert.equal(
      mankind?.zone,
      "War Within the Webway",
      "The Master of Mankind zone",
    );
    assert.equal(ordo?.kind, "shortStory", "Ordo Sinister kind");
    assert.match(
      ordo?.publication ?? "",
      /book\s*48/i,
      "Ordo Sinister publication",
    );
    assert.equal(bringer?.kind, "ebook", "Bringer of Sorrow kind");
    assert.equal(magisterium?.kind, "shortStory", "Magisterium kind");
    assert.match(
      magisterium?.publication ?? "",
      /book\s*52/i,
      "Magisterium publication",
    );
    assert.equal(king?.kind, "novel", "The Crimson King kind");
    assert.equal(king?.publication, "Book 44", "The Crimson King publication");
    assert.equal(king?.ribbon, true, "The Crimson King ribbon");
    assert.equal(church?.kind, "shortStory", "The Last Church kind");
    assert.match(
      church?.publication ?? "",
      /book\s*10/i,
      "The Last Church publication",
    );
  });

  it("marks the Siege of Terra novels as ribboned novels", () => {
    const siegeNovels = [
      [/lost and the damned/i, /terra book\s*2/i, "Terra Book 2"],
      [/first wall/i, /terra book\s*3/i, "Terra Book 3"],
      [/^saturnine$/i, /terra book\s*4/i, "Terra Book 4"],
      [/^mortis$/i, /terra book\s*5/i, "Terra Book 5"],
      [/^warhawk$/i, /terra book\s*6/i, "Terra Book 6"],
    ] as const;
    for (const [title, publication, expected] of siegeNovels) {
      const work = findWork(title, publication);
      assert.ok(work, `missing ${expected}`);
      assert.equal(work.kind, "novel", `${expected} kind`);
      assert.equal(work.publication, expected, `${expected} publication`);
      assert.equal(work.ribbon, true, `${expected} ribbon`);
      assert.equal(work.era, "siege-of-terra", `${expected} era`);
    }
  });

  it("does not give The Serpent Beneath a ribbon", () => {
    const serpentBeneath = graph.works.find(
      (work) => work.id === "the-serpent-beneath",
    );
    assert.equal(serpentBeneath?.ribbon, false, "The Serpent Beneath ribbon");
  });

  it("keeps the chart at 257 works", () => {
    assert.equal(graph.works.length, 257);
  });
});

describe("known connections", () => {
  it("wires the Kaban Project into Mechanicum", () => {
    const kaban = findWork(/kaban project/i, /book\s*22/i);
    const mechanicum = findWork(/^mechanicum$/i, /book\s*9/i);
    assert.ok(hasEdge(kaban?.id, mechanicum?.id, "primary"));
  });

  it("wires Prologue to Nikaea into Thousand Sons", () => {
    const nikaea = findWork(/prologue to nikaea/i, /ebook/i);
    const thousand = findWork(/thousand sons/i, /book\s*12/i);
    assert.ok(hasEdge(nikaea?.id, thousand?.id, "secondary"));
  });

  it("wires Thousand Sons into Prospero Burns and Rebirth", () => {
    const thousand = findWork(/thousand sons/i, /book\s*12/i);
    const burns = findWork(/prospero burns/i, /book\s*15/i);
    const rebirth = findWork(/^rebirth$/i, /book\s*16/i);
    assert.ok(hasEdge(thousand?.id, burns?.id, "primary"));
    assert.ok(hasEdge(burns?.id, rebirth?.id, "primary"));
  });

  it("wires The Master of Mankind into its webway successors", () => {
    const mankind = findWork(/master of mankind/i, /book\s*41/i);
    const ordo = findWork(/ordo sinister/i, /book\s*48/i);
    const bringer = findWork(/bringer of sorrow/i, /ebook/i);
    const magisterium = findWork(/^magisterium$/i, /book\s*52/i);
    const dreams = findWork(/dreams of unity/i, /book\s*52/i);
    assert.ok(hasEdge(mankind?.id, ordo?.id, "secondary"));
    assert.ok(hasEdge(mankind?.id, bringer?.id, "primary"));
    assert.ok(hasEdge(mankind?.id, magisterium?.id, "primary"));
    assert.ok(hasEdge(mankind?.id, dreams?.id, "secondary"));
  });

  it("chains the Siege of Terra novels", () => {
    const lost = findWork(/lost and the damned/i, /terra book\s*2/i);
    const firstWall = findWork(/first wall/i, /terra book\s*3/i);
    const saturnine = findWork(/^saturnine$/i, /terra book\s*4/i);
    const mortis = findWork(/^mortis$/i, /terra book\s*5/i);
    const warhawk = findWork(/^warhawk$/i, /terra book\s*6/i);
    assert.ok(hasEdge(lost?.id, firstWall?.id, "primary"));
    assert.ok(hasEdge(firstWall?.id, saturnine?.id, "primary"));
    assert.ok(hasEdge(saturnine?.id, mortis?.id, "primary"));
    assert.ok(hasEdge(mortis?.id, warhawk?.id, "primary"));
  });

  it("chains Raven's Flight through The Face of Treachery", () => {
    const ravenFlight = graph.works.find(
      (work) => work.id === "raven-s-flight",
    );
    const face = graph.works.find(
      (work) => work.id === "the-face-of-treachery",
    );
    const deliverance = graph.works.find(
      (work) => work.id === "deliverance-lost",
    );
    assert.ok(hasEdge(ravenFlight?.id, face?.id, "primary"));
    assert.ok(hasEdge(face?.id, deliverance?.id, "primary"));
  });

  it("gives The Last Remembrancer two primary targets", () => {
    const lastRemembrancer = graph.works.find(
      (work) => work.id === "the-last-remembrancer-ancer-16",
    );
    const ghostsSpeakNot = graph.works.find(
      (work) => work.id === "ghosts-speak-not",
    );
    const garro = graph.works.find(
      (work) => work.id === "garro-novelization-of-short-stories",
    );
    assert.ok(hasEdge(lastRemembrancer?.id, ghostsSpeakNot?.id, "primary"));
    assert.ok(hasEdge(lastRemembrancer?.id, garro?.id, "primary"));
    const primaryOut = graph.edges.filter(
      (edge) =>
        edge.source === lastRemembrancer?.id && edge.connection === "primary",
    );
    assert.equal(primaryOut.length, 2);
  });

  it("wires The Flight of the Eisenstein into Child of Night", () => {
    const flight = graph.works.find(
      (work) => work.id === "the-flight-of-the-eisenstein",
    );
    const child = graph.works.find((work) => work.id === "child-ofnight");
    assert.ok(hasEdge(flight?.id, child?.id, "primary"));
  });

  it("does not promote two known pairs to primary", () => {
    const reflection = graph.works.find(
      (work) => work.id === "the-reflection-crack-d",
    );
    const riven = graph.works.find((work) => work.id === "riven");
    const darkKing = graph.works.find(
      (work) => work.id === "the-dark-king-king-22",
    );
    const strikeAndFade = graph.works.find(
      (work) => work.id === "strike-and-fade",
    );
    assert.equal(hasEdge(reflection?.id, riven?.id, "primary"), false);
    assert.equal(hasEdge(darkKing?.id, strikeAndFade?.id, "primary"), false);
  });

  it("wires The Outcast Dead into Wolf Hunt", () => {
    const outcastDead = graph.works.find(
      (work) => work.id === "the-outcast-dead",
    );
    const wolfHunt = graph.works.find((work) => work.id === "wolt-hunt");
    assert.ok(hasEdge(outcastDead?.id, wolfHunt?.id, "primary"));
  });

  it("wires Saturnine into The Fury of Magnus", () => {
    const saturnine = findWork(/^saturnine$/i, /terra book\s*4/i);
    const fury = graph.works.find((work) => work.id === "the-fury-of-magnus");
    assert.ok(hasEdge(saturnine?.id, fury?.id, "primary"));
  });

  it("keeps the known tertiary connections", () => {
    const pairs = [
      ["call-of-the-lion", "fallen-angels"],
      ["forgotten-sons", "the-gates-of-terra"],
      ["sins-of-the-father-ther", "herald-of-sanguinius"],
      ["mechanicum", "the-last-church"],
      ["scions-of-the-storm", "the-purge"],
      ["horus-rising", "the-wolf-of-ash-and-fire"],
    ] as const;
    for (const [source, target] of pairs) {
      assert.ok(hasEdge(source, target, "tertiary"), `${source} -> ${target}`);
    }
  });

  it("keeps the corrected connections", () => {
    const corrected = [
      ["a-safe-and-shadowe-shadowed-place", "pharos", "primary"],
      ["the-unremembered-empire", "the-laurel-of-defiance", "primary"],
      ["the-unremembered-empire", "stratagem", "primary"],
      ["the-unburdened", "ruinstorm", "primary"],
      ["a-rose-watered-with-blood", "the-lost-and-the-damned", "primary"],
      ["mark-of-calth", "perpetual", "primary"],
      ["praetorian-of-dorn", "now-peals-midnight", "primary"],
      ["legion", "the-serpent-beneath", "primary"],
      ["know-no-fear", "liar-s-due", "secondary"],
      ["know-no-fear", "hubris-of-monarchia", "secondary"],
      ["the-crimson-fist", "the-unremembered-empire", "primary"],
      ["the-chamber-at-the-end-of-memory", "the-solar-war", "secondary"],
      ["terminus", "the-lost-and-the-damned", "primary"],
      ["the-binary-succession", "the-lost-and-the-damned", "primary"],
      ["old-earth", "the-lost-and-the-damned", "primary"],
      ["ordo-sinister", "mortis", "primary"],
      ["the-maste-f-mankin", "the-board-is-set", "tertiary"],
      ["the-maste-f-mankin", "the-binary-succession", "primary"],
      ["bringer-of-sorrow", "saturnine", "primary"],
      ["ruinstorm", "the-atonement-of-fire", "primary"],
      ["angels-of-caliban", "luther-first-of-the-fallen", "primary"],
      ["angels-of-caliban", "ruinstorm", "primary"],
      ["pharos", "angels-of-caliban", "primary"],
      ["the-unremembered-empire", "sins-of-the-father-ther", "primary"],
      ["perpetual", "saturnine", "primary"],
      ["guardian-of-order", "angels-of-caliban", "tertiary"],
      ["by-the-lion-s-command", "angels-of-caliban", "tertiary"],
      ["fallen-angels", "guardian-of-order", "tertiary"],
      ["the-maste-f-mankin", "dreams-of-unity", "secondary"],
      ["lucius-the-eternal-blade", "the-cr-the-crimson-king", "primary"],
      ["the-cr-the-crimson-king", "the-fury-of-magnus", "primary"],
      ["shortcut-oe-2", "the-fury-of-magnus", "primary"],
      ["ruinstorm", "slaves-to-darkness", "primary"],
      ["slaves-to-darkness", "the-buried-dagger", "primary"],
      ["the-grey-raven-the-grey", "the-buried-dagger", "secondary"],
      ["patience", "the-buried-dagger", "secondary"],
      ["child-ofnight", "the-buried-dagger", "secondary"],
      ["the-damnation-of-pythos", "ruinstorm", "primary"],
      ["promethean-sun", "forgotten-sons", "tertiary"],
      ["fallen-angels", "the-iron-within", "tertiary"],
      ["savage-weapons", "angels-of-caliban", "primary"],
      ["deathfire", "sons-of-the-forge", "primary"],
      ["betrayer", "heart-of-the-conqueror", "primary"],
      ["betrayer", "the-revelation-of-theword", "primary"],
      ["prince-of-crows", "a-safe-and-shadowe-shadowed-place", "tertiary"],
      ["champion-of-oaths", "templar", "secondary"],
      ["the-long-night", "pharos", "secondary"],
    ] as const;
    for (const [source, target, connection] of corrected) {
      assert.ok(
        hasEdge(source, target, connection),
        `${source} ${connection} -> ${target}`,
      );
    }
  });

  it("keeps The Long Night outbound to one secondary", () => {
    const outbound = graph.edges.filter(
      (edge) => edge.source === "the-long-night",
    );
    assert.deepEqual(
      outbound.map((edge) => [edge.target, edge.connection]),
      [["pharos", "secondary"]],
    );
  });

  it("does not restore removed connections", () => {
    const removed = [
      ["bringer-of-sorrow", "the-binary-succession"],
      ["virtues-of-the-sons", "the-laurel-of-defiance"],
      ["lost-sons", "all-that-remains"],
      ["the-laurel-of-defiance", "the-heart-of-the-pharos"],
      ["a-rose-watered-with-blood", "perpetual"],
      ["distant-echoes-of-old-night", "child-of-chaos"],
      ["the-long-night", "the-unremembered-empire"],
      ["the-long-night", "the-honoured"],
      ["fear-to-tread", "hubris-of-monarchia"],
    ] as const;
    for (const [source, target] of removed) {
      assert.equal(
        graph.edges.some(
          (edge) => edge.source === source && edge.target === target,
        ),
        false,
        `${source} -> ${target} is present`,
      );
    }
  });
});

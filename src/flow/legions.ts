/** Faction fills from the poster legend, top to bottom. */
export type Faction = {
  name: string;
  color: string;
};

export const FACTION_COLORS: readonly Faction[] = [
  { name: "Dark Angels", color: "#00461f" },
  { name: "Expunged from Imperial Archives", color: "#ffffff" },
  { name: "Emperor's Children", color: "#f597d3" },
  { name: "Iron Warriors", color: "#595959" },
  { name: "White Scars", color: "#cdcccc" },
  { name: "Space Wolves", color: "#3c4a5e" },
  { name: "Imperial Fists", color: "#fed700" },
  { name: "Night Lords", color: "#a1aefe" },
  { name: "Blood Angels", color: "#970400" },
  { name: "Iron Hands", color: "#e6dfd0" },
  { name: "World Eaters", color: "#6a0001" },
  { name: "Ultramarines", color: "#0d407f" },
  { name: "Death Guard", color: "#a9d028" },
  { name: "Thousand Sons", color: "#62b6d2" },
  { name: "Luna Wolves / Sons of Horus", color: "#fffcec" },
  { name: "Word Bearers", color: "#e6a38f" },
  { name: "Salamanders", color: "#22cf0f" },
  { name: "Raven Guard", color: "#000000" },
  { name: "Alpha Legion", color: "#97e5dc" },
  { name: "Knights Errant", color: "#c8a4ee" },
  { name: "Custodes & Sisters of Silence", color: "#f8a913" },
  { name: "Mechanicum & Collegia Titanica", color: "#852444" },
  { name: "Officio Assassinorum", color: "#ffa0a0" },
  { name: "Perpetuals", color: "#62bc85" },
  { name: "Siege of Terra", color: "#b09642" },
];

const MAX_DISTANCE = 40;

function channels(color: string): [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

function distance(a: string, b: string): number {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

function nearestFaction(color: string): Faction | null {
  let best: Faction | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const faction of FACTION_COLORS) {
    const next = distance(color, faction.color);
    if (next < bestDistance) {
      best = faction;
      bestDistance = next;
    }
  }
  return bestDistance <= MAX_DISTANCE ? best : null;
}

/** Poster colours are flat fills, so the nearest legend swatch is the faction. */
export function factionsFor(colors: readonly string[]): Faction[] {
  const seen = new Set<string>();
  const factions: Faction[] = [];
  for (const color of colors) {
    const faction = nearestFaction(color);
    if (!faction || seen.has(faction.name)) {
      continue;
    }
    seen.add(faction.name);
    factions.push(faction);
  }
  return factions;
}

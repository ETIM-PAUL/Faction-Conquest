// Mirrors `enum Faction` in FactionWar.sol — keep in sync by hand, it's tiny.
// A plain const object (not `enum`) because tsconfig has erasableSyntaxOnly on.
export const Faction = {
  NONE: 0,
  RED: 1,
  BLUE: 2,
  GREEN: 3,
} as const;

export type Faction = (typeof Faction)[keyof typeof Faction];

export const FACTIONS = [Faction.RED, Faction.BLUE, Faction.GREEN] as const;

export const FACTION_LABEL: Record<Faction, string> = {
  [Faction.NONE]: "Unclaimed",
  [Faction.RED]: "Red",
  [Faction.BLUE]: "Blue",
  [Faction.GREEN]: "Green",
};

// One place to change the palette — flat UI and the R3F map both read from this.
export const FACTION_COLOR: Record<Faction, string> = {
  [Faction.NONE]: "#3a3a3a",
  [Faction.RED]: "#c0392b",
  [Faction.BLUE]: "#2980b9",
  [Faction.GREEN]: "#27ae60",
};

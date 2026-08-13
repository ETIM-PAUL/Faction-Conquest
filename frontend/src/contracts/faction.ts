// Mirrors `enum Faction` in FactionWar.sol — keep in sync by hand, it's tiny.
// A plain const object (not `enum`) because tsconfig has erasableSyntaxOnly on.
export const Faction = {
  NONE: 0,
  RED: 1,
  BLUE: 2,
  GREEN: 3,
} as const;

export type Faction = (typeof Faction)[keyof typeof Faction];

// Display order only (RGB) — the enum values themselves (RED=1, BLUE=2, GREEN=3)
// are fixed on-chain and unaffected by this ordering.
export const FACTIONS = [Faction.RED, Faction.GREEN, Faction.BLUE] as const;

export const FACTION_LABEL: Record<Faction, string> = {
  [Faction.NONE]: "Unclaimed",
  [Faction.RED]: "Red",
  [Faction.BLUE]: "Blue",
  [Faction.GREEN]: "Green",
};

// One place to change the palette — flat UI and the R3F map both read from this.
// Matches frontend/src/theme.css's --red/--blue/--green tokens.
export const FACTION_COLOR: Record<Faction, string> = {
  [Faction.NONE]: "#4a463e",
  [Faction.RED]: "#e0503a",
  [Faction.BLUE]: "#3f8fe0",
  [Faction.GREEN]: "#4fae5a",
};

// Shape backup for color, never rely on color alone (game-ui-design skill:
// ~8% of men have red-green color vision deficiency).
export const FACTION_GLYPH: Record<Faction, string> = {
  [Faction.NONE]: "○",
  [Faction.RED]: "▲",
  [Faction.BLUE]: "◆",
  [Faction.GREEN]: "■",
};

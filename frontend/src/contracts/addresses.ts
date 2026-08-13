// All addresses come from env — never hardcode past a placeholder. Re-verify
// the Megapot addresses against https://llms.megapot.io/contracts/reference
// before every deploy; that table can and has changed (Build.md 2.1).
function requireEnv(key: string): `0x${string}` {
  const value = import.meta.env[key];
  if (!value) throw new Error(`Missing required env var: ${key} (see frontend/.env.example)`);
  return value as `0x${string}`;
}

export const JACKPOT_ADDRESS = requireEnv("VITE_JACKPOT_ADDRESS");
export const USDC_ADDRESS = requireEnv("VITE_USDC_ADDRESS");

// FactionWar isn't deployed yet on a fresh checkout — this one is allowed to
// be empty until Build.md phase 2 (`forge script script/Deploy.s.sol`) runs.
export const FACTION_WAR_ADDRESS = (import.meta.env.VITE_FACTION_WAR_ADDRESS || "") as `0x${string}`;

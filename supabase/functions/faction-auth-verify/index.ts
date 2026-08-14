// Step 2 of chat sign-in: verify the wallet signed the nonce from
// faction-auth-nonce, independently re-read FactionWar.playerFaction
// on-chain (never trust a client-supplied faction), then attach the result
// to the caller's already-established anonymous Supabase session via
// app_metadata. A Custom Access Token Hook (see
// supabase/migrations/0002_faction_auth_hook.sql) copies that onto every
// token Supabase mints for this user afterwards — the client just needs to
// call auth.refreshSession() once this returns.
//
// verify_jwt = true (config.toml) means the platform already confirmed the
// caller has a valid Supabase session before this code runs.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createPublicClient, http, verifyMessage } from "npm:viem@2";
import { baseSepolia } from "npm:viem@2/chains";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

// Faction enum: 0=NONE, 1=RED, 2=BLUE, 3=GREEN — mirrors FactionWar.sol.
const FACTION_WAR_ABI = [
  {
    type: "function",
    name: "playerFaction",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const adminClient = createClient(supabaseUrl, serviceRoleKey);

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(Deno.env.get("BASE_SEPOLIA_RPC_URL") ?? undefined),
});

const factionWarAddress = Deno.env.get("FACTION_WAR_ADDRESS") as `0x${string}`;

function challengeMessage(address: string, nonce: string) {
  return `Faction Conquest chat login\naddress: ${address}\nnonce: ${nonce}`;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "missing_session" }, 401);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await callerClient.auth.getUser();
  if (!user) {
    return jsonResponse({ error: "missing_session" }, 401);
  }

  let address: string;
  let signature: string;
  try {
    ({ address, signature } = await req.json());
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  if (typeof address !== "string" || !ADDRESS_RE.test(address)) {
    return jsonResponse({ error: "invalid_address" }, 400);
  }
  if (typeof signature !== "string" || !signature.startsWith("0x")) {
    return jsonResponse({ error: "invalid_signature" }, 400);
  }
  address = address.toLowerCase();

  const { data: nonceRow, error: nonceError } = await adminClient
    .from("chat_nonces")
    .select("nonce, expires_at")
    .eq("address", address)
    .maybeSingle();

  if (nonceError) {
    console.error("nonce lookup failed", nonceError);
    return jsonResponse({ error: "internal_error" }, 500);
  }
  if (!nonceRow || new Date(nonceRow.expires_at).getTime() < Date.now()) {
    return jsonResponse({ error: "nonce_expired_or_missing" }, 401);
  }

  // Single-use: delete immediately so a captured signature can't be replayed.
  await adminClient.from("chat_nonces").delete().eq("address", address);

  const message = challengeMessage(address, nonceRow.nonce);
  const validSignature = await verifyMessage({
    address: address as `0x${string}`,
    message,
    signature: signature as `0x${string}`,
  });

  if (!validSignature) {
    return jsonResponse({ error: "signature_verification_failed" }, 401);
  }

  const faction = await publicClient.readContract({
    address: factionWarAddress,
    abi: FACTION_WAR_ABI,
    functionName: "playerFaction",
    args: [address as `0x${string}`],
  });

  if (faction === 0) {
    return jsonResponse({ error: "no_faction" }, 403);
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
    app_metadata: { wallet_address: address, faction },
  });
  if (updateError) {
    console.error("app_metadata update failed", updateError);
    return jsonResponse({ error: "internal_error" }, 500);
  }

  return jsonResponse({ faction });
});

// Step 1 of chat sign-in: issue a short-lived, single-use nonce for the
// wallet to sign. Storing it server-side (rather than trusting a
// client-echoed nonce in faction-auth-verify) prevents replaying an old
// signature.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const NONCE_TTL_MS = 5 * 60 * 1000;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method_not_allowed" }, 405);
  }

  let address: string;
  try {
    ({ address } = await req.json());
  } catch {
    return jsonResponse(req, { error: "invalid_json" }, 400);
  }

  if (typeof address !== "string" || !ADDRESS_RE.test(address)) {
    return jsonResponse(req, { error: "invalid_address" }, 400);
  }
  address = address.toLowerCase();

  const nonce = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS).toISOString();

  const { error } = await supabase
    .from("chat_nonces")
    .upsert({ address, nonce, expires_at: expiresAt }, { onConflict: "address" });

  if (error) {
    console.error("nonce upsert failed", error);
    return jsonResponse(req, { error: "internal_error" }, 500);
  }

  return jsonResponse(req, { nonce });
});

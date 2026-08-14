import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import type { Faction } from "../contracts/faction";
import { CHAT_CONFIGURED, SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "../lib/supabase";

const NONCE_URL = import.meta.env.VITE_FACTION_AUTH_NONCE_URL as string | undefined;
const VERIFY_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/faction-auth-verify` : undefined;

export type FactionAuthStatus = "signed-out" | "signing" | "ready" | "error";

/// Chat sign-in: ensure an anonymous Supabase session exists, sign a
/// server-issued nonce with the wallet, hand the signature to
/// faction-auth-verify (which independently re-reads playerFaction
/// on-chain and attaches it to that session's app_metadata — see
/// supabase/functions/), then refresh the session so its JWT picks up the
/// new app_metadata. RLS reads that claim directly, no custom token
/// signing needed.
export function useFactionAuth() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [faction, setFaction] = useState<Faction | null>(null);
  const [status, setStatus] = useState<FactionAuthStatus>("signed-out");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      const sessionFaction = session?.user.app_metadata.faction as Faction | undefined;
      const walletMatches = session?.user.app_metadata.wallet_address === address?.toLowerCase();
      if (sessionFaction && walletMatches) {
        setFaction(sessionFaction);
        setStatus("ready");
      } else {
        setFaction(null);
        setStatus("signed-out");
      }
    });
  }, [address]);

  const signIn = useCallback(async () => {
    if (!supabase || !address || !NONCE_URL) return;
    setStatus("signing");
    setError(null);
    try {
      let {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        const { data, error: anonError } = await supabase.auth.signInAnonymously();
        if (anonError) throw anonError;
        session = data.session;
      }
      if (!session) throw new Error("Could not start a chat session");

      const nonceRes = await fetch(NONCE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if (!nonceRes.ok) throw new Error("Could not start chat sign-in");
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      // faction-auth-verify lowercases the address before rebuilding this
      // challenge string server-side — must match exactly or the signature
      // check fails even for a valid signature.
      const message = `Faction Conquest chat login\naddress: ${address.toLowerCase()}\nnonce: ${nonce}`;
      const signature = await signMessageAsync({ message });

      if (!VERIFY_URL || !SUPABASE_ANON_KEY) throw new Error("Chat isn't configured");

      const verifyRes = await fetch(VERIFY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ address, signature }),
      });
      const verifyBody = (await verifyRes.json().catch(() => ({}))) as { faction?: Faction; error?: string };

      if (!verifyRes.ok) {
        const messages: Record<string, string> = {
          no_faction: "Join a faction before chatting",
          nonce_expired_or_missing: "Sign-in expired — try again",
          signature_verification_failed: "Signature didn't match this wallet",
        };
        throw new Error(messages[verifyBody.error ?? ""] ?? `Chat sign-in failed (${verifyBody.error ?? verifyRes.status})`);
      }

      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;

      const newFaction = refreshed.session?.user.app_metadata.faction as Faction | undefined;
      if (!newFaction) throw new Error("Chat sign-in didn't take — try again");

      setFaction(newFaction);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat sign-in failed");
      setStatus("error");
    }
  }, [address, signMessageAsync]);

  return {
    status: CHAT_CONFIGURED ? status : "error",
    faction,
    error,
    signIn,
    client: supabase,
  };
}

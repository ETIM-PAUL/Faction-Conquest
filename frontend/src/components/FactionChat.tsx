import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { FACTION_GLYPH, FACTION_LABEL, type Faction } from "../contracts/faction";
import { CHAT_CONFIGURED } from "../lib/supabase";
import { useFactionAuth } from "../hooks/useFactionAuth";
import { usePlayerFaction } from "../hooks/useFactionWar";

const MAX_BODY_LENGTH = 280;
const HISTORY_LIMIT = 30;

type ChatMessage = {
  id: string;
  faction: Faction;
  author_address: string;
  body: string;
  created_at: string;
};

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/// Off-chain faction taunt board — see supabase/. Gated in two layers: the
/// on-chain playerFaction (do you even belong to a faction) and the chat
/// session (have you signed a challenge proving you own this wallet, which
/// faction-auth-verify checks against the chain before minting a token).
export function FactionChat() {
  const { address } = useAccount();
  const { data: onChainFaction } = usePlayerFaction();
  const { status, faction, error, signIn, client } = useFactionAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!client || faction === null) {
      setMessages([]);
      return;
    }

    let cancelled = false;

    client
      .from("chat_messages")
      .select("id, faction, author_address, body, created_at")
      .eq("faction", faction)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT)
      .then(({ data }) => {
        if (!cancelled && data) setMessages([...data].reverse() as ChatMessage[]);
      });

    const channel = client
      .channel(`faction-chat-${faction}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `faction=eq.${faction}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as ChatMessage].slice(-HISTORY_LIMIT));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      client.removeChannel(channel);
    };
  }, [client, faction]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (!client || !faction || !address || !body) return;

    setSending(true);
    setSendError(null);
    try {
      const { error: insertError } = await client
        .from("chat_messages")
        .insert({ faction, author_address: address.toLowerCase(), body });
      if (insertError) throw insertError;
      setDraft("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Message failed to send");
    } finally {
      setSending(false);
    }
  }

  if (!CHAT_CONFIGURED) return null;

  return (
    <section className="panel">
      <h2>Faction chat</h2>

      {(onChainFaction === undefined || onChainFaction === 0) && (
        <p style={{ color: "var(--text-muted)" }}>Join a faction to unlock its chat.</p>
      )}

      {onChainFaction !== undefined && onChainFaction !== 0 && status !== "ready" && (
        <>
          <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
            One signature proves this wallet is yours — no gas, nothing sent on-chain.
          </p>
          <button onClick={signIn} disabled={status === "signing"}>
            {status === "signing" ? "Signing…" : "Unlock faction chat"}
          </button>
          {error && (
            <p style={{ color: "var(--accent)", fontSize: "var(--text-sm)", marginTop: "var(--space-1)" }}>{error}</p>
          )}
        </>
      )}

      {status === "ready" && faction !== null && (
        <>
          <ul
            ref={listRef}
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-1)",
              maxHeight: 240,
              overflowY: "auto",
            }}
          >
            {messages.length === 0 && (
              <p style={{ color: "var(--text-muted)" }}>
                No taunts yet — be the first {FACTION_GLYPH[faction]} {FACTION_LABEL[faction]} voice heard.
              </p>
            )}
            {messages.map((m) => (
              <li key={m.id} className="fade-in" style={{ fontSize: "var(--text-sm)" }}>
                <span style={{ color: "var(--text-muted)" }}>{shortAddress(m.author_address)}:</span> {m.body}
              </li>
            ))}
          </ul>

          <div style={{ display: "flex", gap: "var(--space-1)", marginTop: "var(--space-2)" }}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY_LENGTH))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !sending) send();
              }}
              placeholder={`Taunt as ${FACTION_LABEL[faction]}…`}
              maxLength={MAX_BODY_LENGTH}
              style={{ flex: 1 }}
            />
            <button onClick={send} disabled={sending || !draft.trim()}>
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
          {sendError && (
            <p style={{ color: "var(--accent)", fontSize: "var(--text-sm)", marginTop: "var(--space-1)" }}>
              {sendError}
            </p>
          )}
        </>
      )}
    </section>
  );
}

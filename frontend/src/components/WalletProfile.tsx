import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useMegapotProfile } from "../hooks/useMegapotProfile";
import { formatAmount, formatDate, matchLabel, netUsdc, SAMPLE_ADDRESS } from "../lib/megapot";

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "accent" | "muted" }) {
  return (
    <div className="profile-stat">
      <span className="profile-stat__label">{label}</span>
      <span
        className="profile-stat__value"
        style={tone === "accent" ? { color: "var(--accent)" } : tone === "muted" ? { color: "var(--text-muted)" } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

/// Banner for the Sepolia case. Deliberately loud and above the numbers rather
/// than a footnote — the stats underneath belong to a different wallet, and a
/// reader who misses this reads them as their own.
function PlaceholderNotice() {
  return (
    <div className="profile-notice" role="note">
      <p style={{ margin: 0 }}>
        <span aria-hidden="true">⚠ </span>
        <strong>Placeholder data — not this wallet.</strong>
      </p>
      <p style={{ margin: "var(--space-1) 0 0 0", fontSize: "var(--text-sm)" }}>
        Megapot's Data API indexes <strong>Base mainnet only</strong>, and this app runs on Base Sepolia, so
        your connected wallet returns an empty record here. The figures below are a real mainnet wallet (
        {short(SAMPLE_ADDRESS)}) shown so the layout is reviewable. Your own stats appear automatically once
        the app moves to Base mainnet — no code change needed.
      </p>
      <p style={{ margin: "var(--space-1) 0 0 0", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
        For your real Sepolia tickets right now, use <strong>My Tickets</strong> — that panel reads the chain
        directly and is accurate on testnet.
      </p>
    </div>
  );
}

function ProfileBody() {
  const { address } = useAccount();
  const { stats, wins, isPlaceholder, isLoading, error, refetch } = useMegapotProfile();

  if (isLoading) {
    return (
      <p className="pulse" style={{ color: "var(--text-muted)" }}>
        Loading profile…
      </p>
    );
  }

  if (error || !stats) {
    return (
      <div>
        <p style={{ color: "var(--accent)" }}>
          <span aria-hidden="true">⚠ </span>
          Couldn't reach the Megapot Data API{error ? `: ${error.message}` : "."}
        </p>
        <button onClick={refetch}>Retry</button>
      </div>
    );
  }

  const net = netUsdc(stats);

  return (
    <div>
      {isPlaceholder && <PlaceholderNotice />}

      <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
        {isPlaceholder ? "Sample wallet" : "Connected wallet"}{" "}
        <strong style={{ color: "var(--text)" }}>{short(stats.address)}</strong>
        {!isPlaceholder && address && stats.address.toLowerCase() !== address.toLowerCase() && " (recipient)"}
      </p>

      <div className="profile-stats">
        <Stat label="Tickets owned" value={String(stats.total_tickets)} />
        <Stat label="Rounds played" value={String(stats.rounds_played)} />
        <Stat label="Wins" value={String(stats.total_wins)} tone={stats.total_wins > 0 ? "accent" : undefined} />
        <Stat label="Won (USDC)" value={`$${formatAmount(stats.total_winnings)}`} />
        <Stat label="Spent (USDC)" value={`$${formatAmount(stats.total_spent)}`} />
        <Stat
          label="Net (USDC)"
          value={`${net < 0 ? "−" : "+"}$${Math.abs(net).toFixed(2)}`}
          tone={net >= 0 ? "accent" : "muted"}
        />
        <Stat label="Referral earnings" value={`$${formatAmount(stats.total_referral_earnings)}`} />
        <Stat label="First seen" value={formatDate(stats.first_seen_at)} />
        <Stat label="Last seen" value={formatDate(stats.last_seen_at)} />
      </div>

      <h3 style={{ fontSize: "var(--text-base)", color: "var(--text-muted)", textTransform: "uppercase", margin: "var(--space-3) 0 var(--space-1) 0" }}>
        Recent wins
      </h3>
      {wins.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>No winning tickets recorded yet.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Round</th>
                <th>Matched</th>
                <th>Payout</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {wins.map((win) => (
                <tr key={win.id}>
                  <td>#{win.round_id}</td>
                  <td>{matchLabel(win.matched_normals, win.bonusball_match)}</td>
                  <td>${formatAmount(win.amount)}</td>
                  {/* Glyph carries the state, not color alone. */}
                  <td style={{ color: win.claimed ? "var(--text-muted)" : "var(--accent)" }}>
                    {win.claimed ? "✓ claimed" : "● unclaimed"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
        Off-chain aggregate from Megapot's Data API (recipient-keyed: tickets you own, not tickets you paid
        for). Independent of the faction game — this is your lottery record across every Megapot app.
      </p>
    </div>
  );
}

/// Header entry point: a button that opens the wallet's Megapot profile. Renders
/// nothing until a wallet is connected — there's no profile to show otherwise.
export function WalletProfile() {
  const { isConnected } = useAccount();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes, and the close button takes focus on open so keyboard users
  // land inside the dialog rather than back at the top of the page.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!isConnected) return null;

  return (
    <>
      <button onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span aria-hidden="true">👤 </span>Profile
      </button>

      {open && (
        <div
          className="profile-backdrop fade-in"
          // Backdrop click closes; the guard keeps clicks inside the panel from bubbling out to it.
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="panel profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)" }}>
              <h2 id="profile-title" style={{ margin: 0 }}>
                Megapot profile
              </h2>
              <button ref={closeRef} onClick={() => setOpen(false)} aria-label="Close profile">
                ✕
              </button>
            </div>
            <div style={{ marginTop: "var(--space-2)" }}>
              <ProfileBody />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

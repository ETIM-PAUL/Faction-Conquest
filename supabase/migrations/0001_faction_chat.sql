-- Faction chat / taunt board. Membership is enforced by RLS reading the
-- `faction` claim on a custom JWT minted by the faction-auth-verify Edge
-- Function, which independently re-checks FactionWar.playerFaction on-chain
-- before signing anything — this migration only trusts the JWT, never a
-- client-supplied faction.

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  faction smallint not null check (faction between 1 and 3),
  author_address text not null,
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_faction_created_at_idx
  on public.chat_messages (faction, created_at desc);

alter table public.chat_messages enable row level security;

-- Append-only: no update/delete policies means those are default-denied.
create policy "read own faction messages"
  on public.chat_messages
  for select
  to authenticated
  using ((auth.jwt() ->> 'faction')::smallint = faction);

create policy "post to own faction as self"
  on public.chat_messages
  for insert
  to authenticated
  with check (
    (auth.jwt() ->> 'faction')::smallint = faction
    and lower(auth.jwt() ->> 'sub') = lower(author_address)
  );

-- Basic spam guard: one message per address every 3 seconds.
create or replace function public.chat_messages_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.chat_messages
    where lower(author_address) = lower(new.author_address)
      and created_at > now() - interval '3 seconds'
  ) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger chat_messages_rate_limit_trigger
  before insert on public.chat_messages
  for each row execute function public.chat_messages_rate_limit();

alter publication supabase_realtime add table public.chat_messages;

-- Sign-in nonces for the SIWE-style challenge in faction-auth-nonce /
-- faction-auth-verify. Only the Edge Functions (service role) touch this
-- table, so RLS is enabled with no policies at all (default-deny for every
-- client role, including authenticated).
create table if not exists public.chat_nonces (
  address text primary key,
  nonce text not null,
  expires_at timestamptz not null
);

alter table public.chat_nonces enable row level security;

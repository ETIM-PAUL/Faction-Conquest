-- Pivot from self-signed JWTs (blocked: this project has no legacy shared
-- HS256 secret exposed, only an asymmetric ES256 verification key) to real
-- anonymous Supabase sessions. The wallet signs in anonymously,
-- faction-auth-verify does the same nonce + signature + on-chain
-- playerFaction check as before, then writes the result to that session's
-- app_metadata via the service role (auth.admin.updateUserById).
--
-- No custom access token hook needed: every Supabase-issued JWT already
-- embeds the full app_metadata object as a standard claim, so RLS can read
-- it straight off auth.jwt() once the client calls refreshSession().

drop policy if exists "read own faction messages" on public.chat_messages;
drop policy if exists "post to own faction as self" on public.chat_messages;

create policy "read own faction messages"
  on public.chat_messages
  for select
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'faction')::smallint = faction);

create policy "post to own faction as self"
  on public.chat_messages
  for insert
  to authenticated
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'faction')::smallint = faction
    and lower(auth.jwt() -> 'app_metadata' ->> 'wallet_address') = lower(author_address)
  );

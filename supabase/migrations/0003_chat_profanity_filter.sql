-- Server-side profanity guard for chat_messages. The frontend already checks
-- with the `bad-words` npm package before sending (FactionChat.tsx) for a
-- fast, friendly rejection — but RLS lets any authenticated session insert
-- directly via the Supabase client, bypassing anything client-side. This
-- trigger is the actual, unbypassable gate, same "client check is just for a
-- clear message" pattern as faction-auth-verify re-checking on-chain state.
--
-- Word-boundary regex (\y...\y) so this doesn't false-positive on substrings
-- inside innocent words (e.g. "assessment", "class", "scunthorpe").
create or replace function public.chat_messages_profanity_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  banned_words text[] := array[
    'anal', 'anus', 'arse', 'ass', 'asshole',
    'bastard', 'bitch', 'blowjob', 'boner', 'boob', 'butthole',
    'clit', 'cock', 'coon', 'cum', 'cunt',
    'dick', 'dildo', 'dyke',
    'fag', 'faggot', 'fuck', 'fucker', 'fucking',
    'gook',
    'handjob', 'hoe', 'homo', 'horny',
    'jerkoff', 'jizz',
    'kike',
    'labia',
    'masturbate', 'motherfucker',
    'nigga', 'nigger', 'nazi',
    'penis', 'piss', 'porn', 'prick', 'pussy',
    'rape', 'retard', 'retarded',
    'shit', 'slut', 'spic', 'suck',
    'testicle', 'tit', 'titty', 'twat',
    'vagina', 'wank', 'whore'
  ];
  pattern text;
begin
  pattern := '\y(' || array_to_string(banned_words, '|') || ')\y';
  if new.body ~* pattern then
    raise exception 'profanity_detected' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger chat_messages_profanity_guard_trigger
  before insert on public.chat_messages
  for each row execute function public.chat_messages_profanity_guard();

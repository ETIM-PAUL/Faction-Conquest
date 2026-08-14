import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const CHAT_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/// One client for the whole app. Faction chat signs in anonymously (see
/// useFactionAuth) — supabase-js persists that session itself and refreshes
/// it automatically, so nothing here needs to manage tokens by hand.
export const supabase = CHAT_CONFIGURED
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

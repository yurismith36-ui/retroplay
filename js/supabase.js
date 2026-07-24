// RetroPlay Server 1.0 — cliente público do Supabase
const RETROPLAY_SUPABASE_URL = "https://acxxqfzrftxzwlxcxfen.supabase.co";
const RETROPLAY_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BAwQTbTCbJw89rx7fWUwvQ_5_D4cFzF";

window.retroplaySupabase = window.supabase.createClient(
  RETROPLAY_SUPABASE_URL,
  RETROPLAY_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

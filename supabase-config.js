
const SUPABASE_URL = "https://mqlfcidqrhcizkqwnnoe.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_ymT4ltuXbfeti2AyZMhKMg_QSxmhfN4";

const salonDB = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

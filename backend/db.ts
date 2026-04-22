import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL       || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY  || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[DB] Missing Supabase credentials — URL:', !!SUPABASE_URL, 'KEY:', !!SUPABASE_ANON_KEY);
}

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';

/** Client pubblico (anon key) — per operazioni di lettura e scrittura con RLS */
export const supabase = createClient(
  SUPABASE_URL || PLACEHOLDER_URL,
  SUPABASE_ANON_KEY || 'placeholder-key'
);

/** Client admin (service_role) — bypass RLS, solo uso backend */
export const supabaseAdmin = createClient(
  SUPABASE_URL || PLACEHOLDER_URL,
  SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY || 'placeholder-key',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const RETENTION_DAYS = 90;

export async function cleanupOldData() {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const tables = ['poll_votes', 'sessions'];
    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .delete()
        .lt('created_at', cutoff);
      if (error) console.log(`[DB] Cleanup ${table} error:`, error.message);
    }

    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const { error: schedError } = await supabase
      .from('cached_schedule')
      .delete()
      .lt('end_time', todayStart.toISOString());
    if (schedError) console.log('[DB] Cleanup cached_schedule error:', schedError.message);
    else console.log('[DB] Deleted past schedule entries (before today)');

    console.log('[DB] Cleaned up data older than', RETENTION_DAYS, 'days');
  } catch (e) {
    console.log('[DB] Cleanup error (non-fatal):', e);
  }
}

export async function seedInitialPoll() {
  try {
    const { data: existing } = await supabase
      .from('polls')
      .select('id')
      .eq('active', true)
      .limit(1);

    if (!existing || existing.length === 0) {
      const { error } = await supabase.from('polls').insert({
        question: 'Quale sezione di Lira TV preferisci?',
        options: ['Edizioni TG', 'Sport', 'Cronaca', 'Programmi'],
        active: true,
      });
      if (error) {
        console.log('[DB] Seed poll error:', error.message);
      } else {
        console.log('[DB] Seeded initial poll');
      }
    }
  } catch (e) {
    console.log('[DB] Seed error:', e);
  }
}

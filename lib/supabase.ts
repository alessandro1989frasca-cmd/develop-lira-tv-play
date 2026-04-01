import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[Supabase Frontend] Missing credentials — URL:', !!SUPABASE_URL, 'KEY:', !!SUPABASE_ANON_KEY);
}

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';

export const supabase = createClient(
  SUPABASE_URL || PLACEHOLDER_URL,
  SUPABASE_ANON_KEY || 'placeholder-key'
);

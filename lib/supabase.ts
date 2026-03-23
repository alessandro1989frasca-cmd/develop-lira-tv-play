import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

console.log('[Supabase] URL present:', !!SUPABASE_URL, 'URL starts with:', SUPABASE_URL?.substring(0, 20));
console.log('[Supabase] KEY present:', !!SUPABASE_ANON_KEY, 'KEY length:', SUPABASE_ANON_KEY?.length);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[Supabase Frontend] ⚠️ Missing credentials — URL:', !!SUPABASE_URL, 'KEY:', !!SUPABASE_ANON_KEY);
}

export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder-key'
);

/**
 * appConfig.ts
 *
 * Carica la configurazione app dalla tabella `app_config` di Supabase.
 * Strategia: stale-while-revalidate
 *   1. Restituisce subito il valore in cache (AsyncStorage) → 0 flash / 0 attesa
 *   2. In background aggiorna la cache con il dato fresco da Supabase
 *   3. Al prossimo avvio l'app ha già il valore aggiornato senza aspettare la rete
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL  ?? '';
const SUPABASE_KEY  = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const CACHE_KEY     = 'app_config_v1';
const CACHE_MAX_AGE = 60 * 60 * 1000; // 1 ora — scade solo se Supabase è raggiungibile

export interface AppConfig {
  liveStreamUrl: string;
  liveBannerImageUrl: string | null;
  liveBannerEnabled: boolean;
  liveBannerLabel: string;
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  liveStreamUrl:
    'https://a928c0678d284da5b383f29ecc5dfeec.msvdn.net/live/S57315730/8kTBWibNteJA/playlist.m3u8',
  liveBannerImageUrl: null,
  liveBannerEnabled: true,
  liveBannerLabel: 'SEGUI LA DIRETTA',
};

/* ------------------------------------------------------------------ */
/* Fetch REST diretta (evita la latenza di cold-start del client JS)    */
/* ------------------------------------------------------------------ */
async function fetchFromSupabase(): Promise<AppConfig> {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing Supabase credentials');

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/app_config?id=eq.1&select=live_stream_url,live_banner_image_url,live_banner_enabled,live_banner_label`,
    {
      method: 'GET',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept: 'application/json',
      },
    }
  );

  if (!res.ok) throw new Error(`Supabase error ${res.status}`);
  const rows: Array<{
    live_stream_url: string;
    live_banner_image_url: string | null;
    live_banner_enabled: boolean;
    live_banner_label: string;
  }> = await res.json();

  if (!rows || rows.length === 0) throw new Error('app_config row not found');
  const row = rows[0];

  return {
    liveStreamUrl:     row.live_stream_url     || DEFAULT_APP_CONFIG.liveStreamUrl,
    liveBannerImageUrl:row.live_banner_image_url ?? null,
    liveBannerEnabled: row.live_banner_enabled  ?? true,
    liveBannerLabel:   row.live_banner_label    || DEFAULT_APP_CONFIG.liveBannerLabel,
  };
}

/* ------------------------------------------------------------------ */
/* Cache AsyncStorage                                                    */
/* ------------------------------------------------------------------ */
interface CacheEntry {
  config: AppConfig;
  fetchedAt: number;
}

async function readCache(): Promise<AppConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    return entry.config ?? null;
  } catch {
    return null;
  }
}

async function writeCache(config: AppConfig): Promise<void> {
  try {
    const entry: CacheEntry = { config, fetchedAt: Date.now() };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {}
}

/* ------------------------------------------------------------------ */
/* API pubblica                                                          */
/* ------------------------------------------------------------------ */

/**
 * Restituisce la config immediatamente dalla cache,
 * poi riconvalida in background.
 * Chiama `onUpdate(fresh)` se il valore cambia dopo la fetch.
 */
export async function loadAppConfig(
  onUpdate?: (cfg: AppConfig) => void
): Promise<AppConfig> {
  const cached = await readCache();
  const current = cached ?? DEFAULT_APP_CONFIG;

  /* Riconvalida in background — non blocca il rendering */
  void fetchFromSupabase()
    .then(async (fresh) => {
      await writeCache(fresh);
      if (onUpdate) onUpdate(fresh);
    })
    .catch((e) => {
      console.log('[AppConfig] Background revalidation failed:', e?.message);
    });

  return current;
}

/**
 * Pre-fetch sincrono al boot: popola la cache in modo che la prossima
 * chiamata a `loadAppConfig` restituisca subito il dato aggiornato.
 */
export async function prefetchAppConfig(): Promise<void> {
  try {
    const fresh = await fetchFromSupabase();
    await writeCache(fresh);
  } catch (e) {
    console.log('[AppConfig] Prefetch failed (usando default/cache):', e);
  }
}

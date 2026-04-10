import { VideoContent, ProgramSchedule, NewsArticle, BreakingNewsItem } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { XMLParser } from 'fast-xml-parser';
import { supabase } from '@/lib/supabase';

const CACHE_KEY = 'lira_tv_videos_cache';
const NEWS_CACHE_KEY = 'cached_news_articles_v2';
const CACHE_EXPIRY = 5 * 60 * 1000;
const RETENTION_DAYS = 90;

let _queryClient: { setQueryData: (key: unknown[], data: unknown) => void } | null = null;
export function initQueryClient(qc: { setQueryData: (key: unknown[], data: unknown) => void }) {
  _queryClient = qc;
}

function extractFromHTML(html: string, selector: string): string | null {
  if (!html) return null;
  
  if (selector === '#video-url') {
    // First try: direct text content (no HTML inside)
    const directMatch = html.match(/<div[^>]*id=["']video-url["'][^>]*>\s*(https?:\/\/[^\s<"]+)\s*<\/div>/i);
    if (directMatch?.[1]) return directMatch[1].trim();
    // Fallback: bare .m3u8 URL anywhere in the div (handles nested tags or whitespace)
    const divBlock = html.match(/<div[^>]*id=["']video-url["'][^>]*>([\s\S]*?)<\/div>/i);
    if (divBlock?.[1]) {
      const urlMatch = divBlock[1].match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
      if (urlMatch?.[0]) return urlMatch[0].trim();
    }
    return null;
  }
  
  if (selector === '#featured-image img[src]') {
    const divMatch = html.match(/<div[^>]*id=["']featured-image["'][^>]*>([\s\S]*?)<\/div>/i);
    if (divMatch) {
      const imgMatch = divMatch[1].match(/<img[^>]*src=["']([^"']*)["']/i);
      return imgMatch ? imgMatch[1] : null;
    }
  }
  
  return null;
}

function decodeHTMLEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function extractProgramName(title: string): string | undefined {
  if (!title) return undefined;
  const datePattern = /\s+\d{2}\/\d{2}\/\d{4}\s*$/;
  const programName = title.replace(datePattern, '').trim();
  return programName || undefined;
}

const FETCH_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;

async function fetchWithTimeout(url: string, timeoutMs: number = FETCH_TIMEOUT_MS, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchSafe(url: string): Promise<string> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const waitMs = attempt * 1500;
      console.log(`⏳ Retry ${attempt}/${MAX_RETRIES} for ${url} after ${waitMs}ms...`);
      await delay(waitMs);
    }

    if (Platform.OS !== 'web') {
      try {
        console.log(`📡 Direct fetch (Native, attempt ${attempt + 1}): ${url}`);
        const response = await fetchWithTimeout(url, FETCH_TIMEOUT_MS, {
          headers: {
            'User-Agent': 'LiraTVApp/1.0.0',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        if (response.ok) {
          const text = await response.text();
          if (text && text.length > 0) {
            console.log(`✅ Direct fetch success for ${url} (${text.length} chars)`);
            return text;
          }
          console.warn(`Direct fetch returned empty response for ${url}`);
        } else {
          console.warn(`Direct fetch failed with status: ${response.status} for ${url}`);
        }
      } catch (error) {
        console.warn(`Direct fetch error (attempt ${attempt + 1}):`, error instanceof Error ? error.message : String(error));
      }
    }

    const proxies = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      `https://corsproxy.io/?${encodeURIComponent(url)}`,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
      `https://thingproxy.freeboard.io/fetch/${url}`
    ];

    for (const proxyUrl of proxies) {
      try {
        console.log(`📡 Proxy fetch: ${proxyUrl.substring(0, 60)}...`);
        const response = await fetchWithTimeout(proxyUrl, FETCH_TIMEOUT_MS);
        if (response.ok) {
          const text = await response.text();
          if (text && text.length > 0) {
            console.log(`✅ Proxy fetch success (${text.length} chars)`);
            return text;
          }
        }
      } catch {
        // try next proxy
      }
    }
  }

  throw new Error(`Failed to fetch ${url} after ${MAX_RETRIES + 1} attempts`);
}

function parseRSSItemObj(item: any, feedSource: 'main' | 'programmi' | 'news' | 'sport' | 'cronaca' | 'politica' | 'cultura' | 'ambiente'): VideoContent | null {
  try {
    let title = decodeHTMLEntities(item.title || '');
    
    const datePattern = /\s+\d{2}\/\d{2}\/\d{4}\s*$/;
    title = title.replace(datePattern, '').trim();
    const link = item.link || '';
    const pubDate = item.isoDate || (item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString());
    const descriptionHTML = item.description || '';
    
    const categoryRaw = item.category || [];
    const categories = Array.isArray(categoryRaw) ? categoryRaw : [categoryRaw];
    const categoriesLower = categories.map((c: string) => String(c).toLowerCase());
    
    const videoUrl = extractFromHTML(descriptionHTML, '#video-url');
    const thumbnail = extractFromHTML(descriptionHTML, '#featured-image img[src]');
    
    if (!title || !videoUrl) {
      return null;
    }

    let secureVideoUrl = videoUrl;
    if (secureVideoUrl && secureVideoUrl.startsWith('http://')) {
      secureVideoUrl = secureVideoUrl.replace('http://', 'https://');
    }
    
    let category: VideoContent['category'] = 'all';
    
    const cleanDescription = descriptionHTML
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
    
    const video: VideoContent = {
      id: link || `video-${Date.now()}-${Math.random()}`,
      title,
      description: cleanDescription || title,
      thumbnail: thumbnail || 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&h=450&fit=crop',
      videoUrl: secureVideoUrl,
      pubDate,
      category,
      programCategory: undefined,
    };

    if (feedSource === 'main') {
        const hasLiraTG = categoriesLower.some((c: string) => c.includes('liratg'));
        if (hasLiraTG) {
            video.category = 'edizioni_tg';
        } else if (categoriesLower.some((c: string) => c.includes('sport'))) {
            video.category = 'sport';
        } else if (categoriesLower.some((c: string) => c.includes('cronaca'))) {
            video.category = 'cronaca';
        } else {
            video.category = 'all';
        }
        return video;
    } else if (feedSource === 'sport') {
        video.category = 'sport';
        return video;
    } else if (feedSource === 'cronaca') {
        video.category = 'cronaca';
        return video;
    } else if (feedSource === 'politica') {
        video.category = 'politica';
        return video;
    } else if (feedSource === 'cultura') {
        video.category = 'cultura';
        return video;
    } else if (feedSource === 'ambiente') {
        video.category = 'ambiente';
        return video;
    } else if (feedSource === 'news') {
        if (categoriesLower.some((c: string) => c.includes('sport'))) {
            video.category = 'sport';
        } else if (categoriesLower.some((c: string) => c.includes('cronaca'))) {
            video.category = 'cronaca';
        } else {
            video.category = 'all';
        }
        return video;
    } else if (feedSource === 'programmi') {
        const hasLiraTG = categoriesLower.some((c: string) => c.includes('liratg'));
        if (hasLiraTG) {
            video.category = 'edizioni_tg';
        } else {
            video.category = 'programmi';
        }
        const catFromFeed = categories.find((c: string) => 
            !c.toLowerCase().includes('uncategorized') && 
            !c.toLowerCase().includes('programmi') &&
            !c.toLowerCase().includes('#eseiprotagonista') &&
            !c.toLowerCase().includes('#liratv') &&
            !c.toLowerCase().includes('cura') &&
            !c.toLowerCase().includes('giornalistica') &&
            !c.toLowerCase().includes('notizie') &&
            !c.toLowerCase().includes('redazione')
        );
        video.programCategory = catFromFeed || extractProgramName(video.title);
        return video;
    }

    return video;
  } catch (error) {
    console.error('Error parsing RSS item object:', error);
    return null;
  }
}

async function fetchSingleFeed(feedUrl: string, feedName: string, feedSource: 'main' | 'programmi' | 'news' | 'sport' | 'cronaca' | 'politica' | 'cultura' | 'ambiente', limit?: number): Promise<VideoContent[]> {
  try {
    const xmlText = await fetchSafe(feedUrl);
    
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text'
    });
    const result = parser.parse(xmlText);
    const channel = result?.rss?.channel;
    let items = channel?.item || [];
    
    if (!Array.isArray(items)) {
      items = [items];
    }
    
    console.log(`🔍 Found ${items.length} items in ${feedName}`);
    
    const videos: VideoContent[] = [];
    const maxItems = limit || items.length;
    
    for (let i = 0; i < Math.min(items.length, maxItems); i++) {
      const parsed = parseRSSItemObj(items[i], feedSource);
      if (parsed) {
        videos.push(parsed);
      }
    }
    
    console.log(`✅ Parsed ${videos.length} videos from ${feedName}`);
    return videos;
  } catch (e) {
    console.error(`❌ Failed to fetch/parse ${feedName}:`, e);
    return [];
  }
}

let supabaseAvailable: boolean | null = null;

async function fetchAllFromSupabase(): Promise<VideoContent[]> {
  if (supabaseAvailable === false) return [];
  try {
    console.log('🔵 [Supabase Direct] Fetching all videos from cached_programs...');
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('cached_programs')
      .select('*')
      .gt('pub_date', cutoff)
      .order('pub_date', { ascending: false })
      .limit(1000);

    if (error) {
      if (error.message?.toLowerCase().includes('forbidden') || error.message?.toLowerCase().includes('secret')) {
        supabaseAvailable = false;
      }
      console.log('🔵 [Supabase Direct] Query error:', error.message);
      return [];
    }

    if (!data || data.length === 0) {
      console.log('🔵 [Supabase Direct] No videos found in cached_programs');
      return [];
    }

    console.log(`🔵 [Supabase Direct] Loaded ${data.length} videos from cached_programs`);

    return data.map((row: any): VideoContent => ({
      id: row.id,
      title: row.title,
      description: row.description || '',
      thumbnail: row.thumbnail || '',
      videoUrl: row.video_url,
      pubDate: row.pub_date,
      category: (row.category || 'all') as VideoContent['category'],
      programCategory: row.program_category || undefined,
    }));
  } catch (e) {
    console.log('🔵 [Supabase Direct] fetchAllFromSupabase error:', e instanceof Error ? e.message : String(e));
    return [];
  }
}

async function fetchAllFromRSS(): Promise<VideoContent[]> {
  console.log('🟠 [RSS] Fetching all RSS feeds from Lira TV...');

  const [edizioniTgVideos, sportVideos, cronacaVideos, politicaVideos, culturaVideos, ambienteVideos, programmiPage1, programmiPage2, programmiPage3] = await Promise.all([
    fetchSingleFeed('https://www.liratv.it/feed/', 'Edizioni TG', 'main'),
    fetchSingleFeed('https://www.liratv.it/news/sport/feed/', 'Sport', 'sport'),
    fetchSingleFeed('https://www.liratv.it/news/cronaca/feed/', 'Cronaca', 'cronaca'),
    fetchSingleFeed('https://www.liratv.it/news/politica/feed/', 'Politica', 'politica'),
    fetchSingleFeed('https://www.liratv.it/news/cultura-e-spettacolo/feed/', 'Cultura e Spettacolo', 'cultura'),
    fetchSingleFeed('https://www.liratv.it/tag/ambiente/feed/', 'Ambiente', 'ambiente'),
    fetchSingleFeed('https://www.liratv.it/programmi/feed/', 'Programmi P1', 'programmi'),
    fetchSingleFeed('https://www.liratv.it/programmi/feed/?paged=2', 'Programmi P2', 'programmi'),
    fetchSingleFeed('https://www.liratv.it/programmi/feed/?paged=3', 'Programmi P3', 'programmi'),
  ]);

  const programmiVideos = [...programmiPage1, ...programmiPage2, ...programmiPage3];
  const allVideos = [...edizioniTgVideos, ...sportVideos, ...cronacaVideos, ...politicaVideos, ...culturaVideos, ...ambienteVideos, ...programmiVideos];

  console.log(`🟠 [RSS] Fetched ${allVideos.length} videos from RSS feeds`);
  return allVideos;
}

export async function fetchRSSFeed(useCache: boolean = true): Promise<VideoContent[]> {
  try {
    if (useCache) {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        if (age < CACHE_EXPIRY) {
          console.log('✅ Using local cached data (age:', Math.round(age / 1000), 's)');
          refreshInBackground();
          return data;
        }
      }
    }

    console.log('🔵 Trying Supabase DIRECT as primary source...');
    const supabaseVideos = await fetchAllFromSupabase();

    if (supabaseVideos.length > 0) {
      console.log(`✅ [Primary] Got ${supabaseVideos.length} videos from Supabase Direct`);

      supabaseVideos.sort((a, b) => {
        const dateA = new Date(a.pubDate);
        const dateB = new Date(b.pubDate);
        return dateB.getTime() - dateA.getTime();
      });

      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
        data: supabaseVideos,
        timestamp: Date.now()
      }));

      refreshFromRSSInBackground(supabaseVideos);

      return supabaseVideos;
    }

    console.log('🟠 [Fallback] Supabase empty, falling back to RSS feeds...');
    const rssVideos = await fetchAllFromRSS();

    const uniqueVideosMap = new Map<string, VideoContent>();
    rssVideos.forEach(v => uniqueVideosMap.set(v.videoUrl, v));
    const uniqueVideos = Array.from(uniqueVideosMap.values());

    uniqueVideos.sort((a, b) => {
      const dateA = new Date(a.pubDate);
      const dateB = new Date(b.pubDate);
      return dateB.getTime() - dateA.getTime();
    });

    console.log(`✅ [Fallback] Total unique videos from RSS: ${uniqueVideos.length}`);

    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
      data: uniqueVideos,
      timestamp: Date.now()
    }));

    upsertAllVideosDirect(uniqueVideos).catch((err: Error) =>
      console.warn('⚠️ Background upsert to Supabase failed:', err.message)
    );

    return uniqueVideos;
  } catch (error) {
    console.error('❌ Error fetching videos:', error instanceof Error ? error.message : String(error));

    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) {
      console.log('⚠️ Using stale local cache due to error');
      const { data } = JSON.parse(cached);
      return data;
    }

    throw error;
  }
}

function refreshInBackground() {
  fetchAllFromSupabase().then(async (supabaseVideos) => {
    if (supabaseVideos.length > 0) {
      supabaseVideos.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
        data: supabaseVideos,
        timestamp: Date.now()
      }));
      _queryClient?.setQueryData(['videos'], supabaseVideos);
      console.log(`🔄 [Background] UI updated from Supabase: ${supabaseVideos.length} videos`);
    }
  }).catch((err) => {
    console.warn('🔄 [Background] Supabase refresh failed:', err instanceof Error ? err.message : String(err));
  });
}

function refreshFromRSSInBackground(currentVideos: VideoContent[]) {
  fetchAllFromRSS().then(async (rssVideos) => {
    if (rssVideos.length === 0) return;

    const uniqueVideosMap = new Map<string, VideoContent>();
    currentVideos.forEach(v => uniqueVideosMap.set(v.videoUrl, v));
    rssVideos.forEach(v => uniqueVideosMap.set(v.videoUrl, v));
    const merged = Array.from(uniqueVideosMap.values());
    merged.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
      data: merged,
      timestamp: Date.now()
    }));
    _queryClient?.setQueryData(['videos'], merged);
    console.log(`🔄 [Background] RSS merged ${merged.length} videos, cache + UI updated`);

    upsertAllVideosDirect(merged).catch((err: Error) =>
      console.warn('⚠️ [Background] Upsert to Supabase failed:', err.message)
    );
  }).catch((err) => {
    console.warn('🔄 [Background] RSS refresh failed:', err instanceof Error ? err.message : String(err));
  });
}

/**
 * Normalizza i timestamp di Supabase (es. "2026-04-01 12:37:35+00") in ISO 8601
 * standard ("2026-04-01T12:37:35Z") prima di passarli a new Date().
 * Hermes (motore JS di React Native) può parsare diversamente le stringhe non-standard.
 */
function parseSupabaseTimestamp(raw: string): Date {
  if (!raw) return new Date();
  // Sostituisce lo spazio con T e normalizza l'offset +00 → Z
  const iso = raw
    .replace(' ', 'T')
    .replace(/\+00(:00)?$/, 'Z');
  return new Date(iso);
}

function getLastSundayOfMonthClient(year: number, month: number): number {
  const lastDay = new Date(year, month, 0).getDate();
  const dow = new Date(year, month - 1, lastDay).getDay();
  return lastDay - dow;
}

function isItalyCESTClient(year: number, month1: number, day: number): boolean {
  if (month1 >= 4 && month1 <= 9) return true;
  if (month1 < 3 || month1 > 10) return false;
  if (month1 === 3) return day >= getLastSundayOfMonthClient(year, 3);
  if (month1 === 10) return day < getLastSundayOfMonthClient(year, 10);
  return false;
}

function parseXMLTVDateClient(dateStr: string): Date {
  if (!dateStr || dateStr.length < 14) return new Date();
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  const hour = parseInt(dateStr.substring(8, 10));
  const minute = parseInt(dateStr.substring(10, 12));
  const second = parseInt(dateStr.substring(12, 14));
  let offsetMinutes = 0;
  if (dateStr.length >= 19) {
    const timezoneMatch = dateStr.match(/([+-])(\d{2})(\d{2})$/);
    if (timezoneMatch) {
      const sign = timezoneMatch[1] === '+' ? 1 : -1;
      offsetMinutes = sign * (parseInt(timezoneMatch[2]) * 60 + parseInt(timezoneMatch[3]));
    }
  }
  if (offsetMinutes === 60 && isItalyCESTClient(year, month + 1, day)) {
    offsetMinutes = 120;
  }
  return new Date(Date.UTC(year, month, day, hour, minute, second) - offsetMinutes * 60000);
}

function generateScheduleIdClient(title: string, startTime: Date): string {
  const dateStr = startTime.toISOString().replace(/[-:T.Z]/g, '').substring(0, 12);
  const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
  return `sched-${cleanTitle}-${dateStr}`;
}

async function fetchScheduleFromXMLDirect(): Promise<ProgramSchedule[]> {
  const epgUrl = 'https://www.liratv.it/wp-content/xlmvisia/palinsesto.xml';
  console.log('📡 Fetching schedule XML directly...');

  const xmlText = await fetchSafe(epgUrl);

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const result = parser.parse(xmlText);
  const tv = result.tv || result;
  let programmes = tv.programme || [];
  if (!Array.isArray(programmes)) programmes = [programmes];

  console.log(`🔍 Found ${programmes.length} programmes in XML`);

  const rawPrograms: Array<{ title: string; description: string; startTime: Date; endTime: Date; category: string }> = [];

  programmes.forEach((p: any) => {
    const titleRaw = p.title?.['#text'] || p.title || '';
    const descRaw = p.desc?.['#text'] || p.desc || '';
    const startStr = p['@_start'] || p.start;
    const stopStr = p['@_stop'] || p.stop;
    const channel = p['@_channel'] || p.channel || '';
    if (!titleRaw || !startStr || !stopStr) return;
    const title = typeof titleRaw === 'string' ? titleRaw.trim() : String(titleRaw).trim();
    const descText = typeof descRaw === 'string' ? descRaw.trim() : String(descRaw).trim();
    const description = descText && descText !== title ? descText : '';
    rawPrograms.push({
      title,
      description,
      startTime: parseXMLTVDateClient(startStr),
      endTime: parseXMLTVDateClient(stopStr),
      category: channel,
    });
  });

  rawPrograms.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const filtered = rawPrograms.filter(p => {
    const dur = (p.endTime.getTime() - p.startTime.getTime()) / 1000;
    return dur >= 180;
  });

  const merged: typeof rawPrograms = [];
  filtered.forEach((program) => {
    const previous = merged[merged.length - 1];
    if (previous && previous.title === program.title) {
      const newEnd = program.endTime > previous.endTime ? program.endTime : previous.endTime;
      merged[merged.length - 1] = { ...previous, description: previous.description || program.description, endTime: newEnd };
      return;
    }
    const effectiveStart = previous && program.startTime > previous.endTime ? previous.endTime : program.startTime;
    merged.push({ ...program, startTime: effectiveStart });
  });

  const now = new Date();
  return merged.map(p => ({
    id: generateScheduleIdClient(p.title, p.startTime),
    title: p.title,
    description: p.description,
    startTime: p.startTime,
    endTime: p.endTime,
    isLive: now >= p.startTime && now < p.endTime,
    category: p.category,
  }));
}

async function fetchScheduleFromSupabaseDirect(): Promise<{ programs: ProgramSchedule[]; lastUpdated: string | null }> {
  if (supabaseAvailable === false) return { programs: [], lastUpdated: null };
  try {
  console.log('🔵 [Supabase Direct] Fetching schedule from cached_schedule...');
  const { data, error } = await supabase
    .from('cached_schedule')
    .select('*')
    .order('start_time', { ascending: true });

  if (error) {
    if (error.message?.toLowerCase().includes('forbidden') || error.message?.toLowerCase().includes('secret')) {
      supabaseAvailable = false;
    }
    console.log('🔵 [Supabase Direct] cached_schedule error:', error.message);
    return { programs: [], lastUpdated: null };
  }

  if (!data || data.length === 0) {
    console.log('🔵 [Supabase Direct] No schedule data in cached_schedule');
    return { programs: [], lastUpdated: null };
  }

  const lastUpdated = (data as any[]).reduce((latest: string | null, row: any) => {
    const u = row.updated_at as string | null;
    if (!u) return latest;
    if (!latest) return u;
    return u > latest ? u : latest;
  }, null as string | null);

  const now = new Date();
  const programs: ProgramSchedule[] = data.map((row: any) => {
    const startTime = parseSupabaseTimestamp(row.start_time);
    const endTime = parseSupabaseTimestamp(row.end_time);
    return {
      id: row.id as string,
      title: row.title as string,
      description: (row.description || '') as string,
      startTime,
      endTime,
      isLive: now >= startTime && now < endTime,
      category: (row.category || '') as string,
    };
  });

  console.log(`🔵 [Supabase Direct] Loaded ${programs.length} schedule items`);
  return { programs, lastUpdated };
  } catch (e) {
    console.log('🔵 [Supabase Direct] fetchScheduleFromSupabaseDirect error:', e instanceof Error ? e.message : String(e));
    return { programs: [], lastUpdated: null };
  }
}

async function upsertScheduleToSupabase(programs: Array<{ id: string; title: string; description: string; startTime: string; endTime: string; category: string }>): Promise<number> {
  if (programs.length === 0) return 0;

  try {
    // Only save programs that end today or in the future — same logic as backend cleanupOldData
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayPrograms = programs.filter(p => new Date(p.endTime) >= todayStart);
    if (todayPrograms.length === 0) return 0;
    console.log(`[Schedule Sync] Filtering to today+: ${todayPrograms.length} of ${programs.length} programs`);

    const newIds = todayPrograms.map(p => p.id);
    const { error: deleteError } = await supabase
      .from('cached_schedule')
      .delete()
      .not('id', 'in', `(${newIds.join(',')})`);
    if (deleteError) console.log('[Schedule Sync] Cleanup error:', deleteError.message);

    const rows = todayPrograms.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      start_time: p.startTime,
      end_time: p.endTime,
      category: p.category,
      updated_at: new Date().toISOString(),
    }));

    const BATCH_SIZE = 50;
    let saved = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('cached_schedule').upsert(batch, { onConflict: 'id' });
      if (error) console.log('[Schedule Sync] Upsert batch error:', error.message);
      else saved += batch.length;
    }
    console.log(`[Schedule Sync] Saved ${saved} items to cached_schedule`);
    return saved;
  } catch (e) {
    console.warn('[Schedule Sync] Error:', e instanceof Error ? e.message : String(e));
    return 0;
  }
}

export async function fetchSchedule(): Promise<ProgramSchedule[]> {
  try {
    const CACHE_MAX_AGE_MS = 60 * 60 * 1000;
    const { programs: cachedPrograms, lastUpdated } = await fetchScheduleFromSupabaseDirect();

    const isFresh = lastUpdated
      ? (Date.now() - new Date(lastUpdated).getTime()) < CACHE_MAX_AGE_MS
      : false;

    if (isFresh && cachedPrograms.length > 0) {
      console.log(`✅ [Schedule] Supabase cache is fresh (updated ${lastUpdated}), returning ${cachedPrograms.length} items`);
      const live = cachedPrograms.find(p => p.isLive);
      if (live) console.log(`🔴 Live: ${live.title}`);
      return cachedPrograms;
    }

    console.log('[Schedule] Supabase cache stale or empty, fetching XML...');
    try {
      const xmlPrograms = await fetchScheduleFromXMLDirect();
      console.log(`✅ [Schedule] Loaded ${xmlPrograms.length} programs from XML`);

      if (xmlPrograms.length > 0) {
        upsertScheduleToSupabase(xmlPrograms.map(p => ({
          id: p.id,
          title: p.title,
          description: p.description,
          startTime: p.startTime.toISOString(),
          endTime: p.endTime.toISOString(),
          category: p.category || '',
        }))).catch(err => console.warn('[Schedule] Background upsert failed:', err));
      }

      const live = xmlPrograms.find(p => p.isLive);
      if (live) console.log(`🔴 Live: ${live.title}`);
      return xmlPrograms;
    } catch (xmlError) {
      console.warn('⚠️ XML fetch failed:', xmlError instanceof Error ? xmlError.message : String(xmlError));
    }

    if (cachedPrograms.length > 0) {
      console.log(`⚠️ [Schedule] XML failed, returning ${cachedPrograms.length} stale cached items`);
      return cachedPrograms;
    }

    console.log('[Schedule] No data available from any source');
    return [];
  } catch (error) {
    console.error('❌ [Schedule] Error:', error instanceof Error ? error.message : String(error));
    try {
      const programs = await fetchScheduleFromXMLDirect();
      return programs;
    } catch {
      return [];
    }
  }
}

export function getCurrentProgram(schedule: ProgramSchedule[]): ProgramSchedule | undefined {
  return schedule.find(program => program.isLive);
}

export function getNextProgram(schedule: ProgramSchedule[]): ProgramSchedule | undefined {
  const now = new Date();
  return schedule.find(program => program.startTime > now);
}

export interface FeaturedProgram {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  category: string;
  sortOrder: number;
  message: string;
  bottone: boolean;
}

export async function fetchFeaturedPrograms(): Promise<FeaturedProgram[]> {
  try {
    console.log('🔵 [Supabase Direct] Fetching featured_programs...');
    const { data, error } = await supabase
      .from('featured_programs')
      .select('*')
      .eq('featured', true)
      .order('sort_order', { ascending: true });

    if (error) {
      if (error.message?.toLowerCase().includes('forbidden') || error.message?.toLowerCase().includes('secret')) {
        supabaseAvailable = false;
      }
      console.log('🔵 [Featured] Query error:', error.message);
      return [];
    }

    if (!data || data.length === 0) {
      console.log('🔵 [Featured] No active featured programs');
      return [];
    }

    console.log(`🔵 [Featured] Loaded ${data.length} featured programs from Supabase`);

    return data.map((row: any): FeaturedProgram => ({
      id: row.id,
      title: row.title || '',
      description: row.description || '',
      thumbnail: row.thumbnail || '',
      videoUrl: row.video_url || '',
      category: row.category || '',
      sortOrder: row.sort_order ?? 0,
      message: row.message || 'Guarda ora',
      bottone: row.bottone !== false,
    }));
  } catch (e) {
    console.log('🔵 [Featured] Error:', e instanceof Error ? e.message : String(e));
    return [];
  }
}

export interface PollData {
  id: string;
  question: string;
  options: string[];
  voteCounts: number[];
  totalVotes: number;
  myVote: number | null;
}

export async function fetchActivePolls(deviceId: string): Promise<PollData[]> {
  try {
    console.log('🔵 [Supabase Direct] Fetching active polls...');
    const { data: polls, error: pollsError } = await supabase
      .from('polls')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (pollsError || !polls || polls.length === 0) {
      console.log('🔵 [Polls] No active polls or error:', pollsError?.message);
      return [];
    }

    const { data: myVotesData } = await supabase
      .from('poll_votes')
      .select('poll_id, option_index')
      .eq('device_id', deviceId);

    const myVotes = new Map<string, number>();
    for (const v of myVotesData ?? []) {
      myVotes.set(v.poll_id, v.option_index);
    }

    const result = await Promise.all(polls.map(async (poll: any) => {
      const pollId = String(poll.id);

      const { data: allVotes } = await supabase
        .from('poll_votes')
        .select('option_index')
        .eq('poll_id', pollId);

      const voteCounts = new Array(poll.options.length).fill(0) as number[];
      for (const v of allVotes ?? []) {
        if (v.option_index >= 0 && v.option_index < voteCounts.length) {
          voteCounts[v.option_index]++;
        }
      }

      const totalVotes = voteCounts.reduce((a: number, b: number) => a + b, 0);

      return {
        id: pollId,
        question: poll.question,
        options: poll.options as string[],
        voteCounts,
        totalVotes,
        myVote: myVotes.get(pollId) ?? null,
      };
    }));

    console.log(`🔵 [Polls] Loaded ${result.length} active polls`);
    return result;
  } catch (e) {
    console.log('🔵 [Polls] Error:', e instanceof Error ? e.message : String(e));
    return [];
  }
}

export async function submitPollVote(pollId: string, optionIndex: number, deviceId: string): Promise<boolean> {
  try {
    console.log('🔵 [Supabase Direct] Submitting poll vote...');
    const { error } = await supabase
      .from('poll_votes')
      .upsert(
        {
          poll_id: pollId,
          option_index: optionIndex,
          device_id: deviceId,
        },
        { onConflict: 'poll_id,device_id' }
      );

    if (error) {
      console.log('🔵 [Poll Vote] Error:', error.message);
      return false;
    }

    console.log('🔵 [Poll Vote] Success');
    return true;
  } catch (e) {
    console.log('🔵 [Poll Vote] Error:', e instanceof Error ? e.message : String(e));
    return false;
  }
}

export async function fetchViewCounts(videoIds: string[]): Promise<Record<string, number>> {
  if (videoIds.length === 0 || supabaseAvailable === false) return {};

  const safeIds = videoIds.slice(0, 50);
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('content_id')
      .eq('type', 'video')
      .in('content_id', safeIds)
      .limit(5000);

    if (error) {
      if (error.message?.toLowerCase().includes('forbidden') || error.message?.toLowerCase().includes('secret')) {
        supabaseAvailable = false;
      }
      console.log('🔵 [Views] getCounts error:', error.message);
      return {};
    }

    const counts: Record<string, number> = {};
    for (const r of data ?? []) {
      counts[r.content_id] = (counts[r.content_id] || 0) + 1;
    }
    return counts;
  } catch (e) {
    console.log('🔵 [Views] Error:', e instanceof Error ? e.message : String(e));
    return {};
  }
}

export async function trackVideoView(videoId: string, deviceId: string): Promise<number> {
  try {
    const { error: deviceError } = await supabase
      .from('devices')
      .upsert(
        { device_id: deviceId, last_seen: new Date().toISOString() },
        { onConflict: 'device_id' }
      );
    if (deviceError) console.log('[Views] Device upsert error:', deviceError.message);

    const { error: sessionError } = await supabase
      .from('sessions')
      .insert({
        device_id: deviceId,
        type: 'video',
        content_id: videoId,
        duration_sec: 0,
      });
    if (sessionError) console.log('[Views] Session insert error:', sessionError.message);

    const { count } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'video')
      .eq('content_id', videoId);

    return count ?? 0;
  } catch (e) {
    console.log('[Views] trackVideoView error:', e instanceof Error ? e.message : String(e));
    return 0;
  }
}

export async function registerDevice(deviceId: string, platform?: string, osVersion?: string): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('devices')
      .select('device_id')
      .eq('device_id', deviceId)
      .single();

    const platformData: Record<string, string> = {};
    if (platform) platformData.platform = platform;
    if (osVersion) platformData.os_version = osVersion;

    if (existing) {
      await supabase
        .from('devices')
        .update({ last_seen: new Date().toISOString(), ...platformData })
        .eq('device_id', deviceId);
    } else {
      await supabase
        .from('devices')
        .insert({ device_id: deviceId, ...platformData });
    }
    console.log('🔵 [Device] Registered/updated device:', deviceId);
  } catch (e) {
    console.warn('🔵 [Device] Error:', e instanceof Error ? e.message : String(e));
  }
}

export async function trackSessionDirect(deviceId: string, type: 'live' | 'video', contentId: string, durationSec: number): Promise<void> {
  if (durationSec < 3) return;
  try {
    const { error: deviceError } = await supabase
      .from('devices')
      .upsert(
        { device_id: deviceId, last_seen: new Date().toISOString() },
        { onConflict: 'device_id' }
      );
    if (deviceError) console.log('[Analytics] Device upsert error:', deviceError.message);

    const { error } = await supabase
      .from('sessions')
      .insert({
        device_id: deviceId,
        type,
        content_id: contentId,
        duration_sec: durationSec,
      });
    if (error) console.log('[Analytics] Session error:', error.message);
    else console.log(`🔵 [Analytics] Tracked ${type} session: ${contentId} (${durationSec}s)`);
  } catch (e) {
    console.warn('[Analytics] trackSession error:', e instanceof Error ? e.message : String(e));
  }
}

export async function reportErrorDirect(deviceId: string, message: string, stack?: string, screen?: string, context?: string, level: 'error' | 'warn' | 'fatal' = 'error'): Promise<void> {
  try {
    const { error } = await supabase
      .from('error_logs')
      .insert({
        device_id: deviceId,
        message,
        stack: stack ?? null,
        screen: screen ?? null,
        context: context ?? null,
        level,
      });
    if (error) console.log('[Error Report] Insert error:', error.message);
  } catch (e) {
    console.warn('[Error Report] Error:', e instanceof Error ? e.message : String(e));
  }
}

function extractImageFromHTML(html: string): string {
  if (!html || typeof html !== 'string') return '';
  
  const imgMatch = html.match(/<img[^>]*src=["']([^"']*)["']/i);
  if (imgMatch && imgMatch[1]) {
    return imgMatch[1];
  }
  
  const enclosureMatch = html.match(/url=["']([^"']*\.(?:jpg|jpeg|png|gif|webp))["']/i);
  if (enclosureMatch && enclosureMatch[1]) {
    return enclosureMatch[1];
  }
  
  return 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&h=450&fit=crop';
}

function extractTextFromHTML(html: string): string {
  if (!html || typeof html !== 'string') return '';
  
  return html
    .replace(/<img[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&hellip;/g, '...')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
}

function extractNewsVideoUrl(item: any): string | undefined {
  // Priority 1: <div id="video-url"> inside description or content:encoded HTML
  for (const key of ['description', 'content:encoded', 'encoded']) {
    let html = item[key] || '';
    if (typeof html === 'object') html = html['__cdata'] || html['#text'] || '';
    html = String(html);
    if (html) {
      // Match <div id="video-url">URL</div>
      const divMatch = html.match(/<div[^>]+id=["']video-url["'][^>]*>\s*(https?:\/\/[^\s<]+\.m3u8[^\s<]*)\s*<\/div>/i);
      if (divMatch && divMatch[1]) return divMatch[1].trim();
      // Fallback: any bare .m3u8 URL in the description
      const bareMatch = html.match(/https?:\/\/[^\s"'<>]+\.m3u8/i);
      if (bareMatch) return bareMatch[0];
    }
  }

  // Priority 2: media:content — may be a single object or an array when multiple are present
  const mediaContent = item['media:content'];
  if (mediaContent) {
    const arr = Array.isArray(mediaContent) ? mediaContent : [mediaContent];
    for (const mc of arr) {
      const url = String(mc['@_url'] || '');
      const medium = String(mc['@_medium'] || '');
      const type = String(mc['@_type'] || '');
      if (
        url.includes('.m3u8') ||
        medium === 'video' ||
        type.includes('mpegURL') ||
        type.includes('video')
      ) {
        if (url) return url;
      }
    }
  }

  // Priority 3: enclosure
  const enclosure = item.enclosure;
  if (enclosure) {
    const arr = Array.isArray(enclosure) ? enclosure : [enclosure];
    for (const enc of arr) {
      const url = String(enc['@_url'] || '');
      const type = String(enc['@_type'] || '');
      if (url.includes('.m3u8') || type.includes('video') || type.includes('mpegURL')) {
        if (url) return url;
      }
    }
  }

  // Priority 4: plain custom XML element
  for (const key of ['video', 'video-url', 'videoUrl', 'video_url']) {
    if (item[key]) {
      const val = typeof item[key] === 'string'
        ? item[key]
        : String(item[key]['#text'] || item[key]['__cdata'] || item[key]['@_url'] || '');
      if (val && val.includes('.m3u8')) return val;
    }
  }

  return undefined;
}

function parseNewsFeedItems(items: any[], fallbackCategory?: string): NewsArticle[] {
  if (!Array.isArray(items)) {
    items = [items];
  }

  return items.map((item: any, index: number): NewsArticle => {
    let rawTitle = item.title || '';
    if (typeof rawTitle === 'object' && rawTitle['__cdata']) {
      rawTitle = rawTitle['__cdata'];
    }
    const title = decodeHTMLEntities(String(rawTitle));
    const link = typeof item.link === 'object' ? String(item.link['#text'] || item.link['__cdata'] || '') : String(item.link || '');
    const pubDateStr = item.pubDate || new Date().toISOString();
    const pubDate = new Date(pubDateStr);
    let author = item['dc:creator'] || item.creator || 'Redazione';
    if (typeof author === 'object' && author['__cdata']) {
      author = author['__cdata'];
    }
    author = String(author);

    let category = item.category || fallbackCategory || 'News';
    if (Array.isArray(category)) {
      category = category[0] || fallbackCategory || 'News';
    }
    if (typeof category === 'object' && category['__cdata']) {
      category = category['__cdata'];
    }
    category = decodeHTMLEntities(String(category));

    if (fallbackCategory && (category === 'News' || category === 'Uncategorized' || !category)) {
      category = fallbackCategory;
    }

    let descriptionHTML = item.description || '';
    let contentHTML = item['content:encoded'] || item.encoded || descriptionHTML;

    if (typeof descriptionHTML === 'object' && descriptionHTML['__cdata']) {
      descriptionHTML = descriptionHTML['__cdata'];
    }
    if (typeof contentHTML === 'object' && contentHTML['__cdata']) {
      contentHTML = contentHTML['__cdata'];
    }

    descriptionHTML = String(descriptionHTML || '');
    contentHTML = String(contentHTML || '');

    const thumbnail = extractImageFromHTML(descriptionHTML);
    const description = extractTextFromHTML(descriptionHTML);
    const content = extractTextFromHTML(contentHTML);
    const videoUrl = extractNewsVideoUrl(item);

    return {
      id: link || `news-${index}-${Date.now()}`,
      title,
      link,
      pubDate,
      author,
      category,
      thumbnail,
      description,
      content,
      ...(videoUrl ? { videoUrl } : {}),
    };
  }).filter((article: NewsArticle) => article.title && article.content);
}

async function fetchNewsFeed(feedUrl: string, feedName: string, fallbackCategory?: string): Promise<NewsArticle[]> {
  try {
    const xmlText = await fetchSafe(feedUrl);
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      cdataPropName: '__cdata'
    });
    const result = parser.parse(xmlText);
    const channel = result?.rss?.channel;
    let items = channel?.item || [];
    if (!Array.isArray(items)) {
      items = [items];
    }
    console.log(`🔍 Found ${items.length} news articles in ${feedName}`);
    return parseNewsFeedItems(items, fallbackCategory);
  } catch (e) {
    console.error(`❌ Failed to fetch news feed ${feedName}:`, e);
    return [];
  }
}

export async function fetchNewsArticles(): Promise<NewsArticle[]> {
  try {
    console.log('🔄 Fetching news articles from Lira TV...');

    const mainArticles = await fetchNewsFeed('https://www.liratv.it/feed/articoli-app/', 'Articoli App');

    const uniqueMap = new Map<string, NewsArticle>();
    mainArticles.forEach(a => {
      if (!uniqueMap.has(a.id)) {
        uniqueMap.set(a.id, a);
      }
    });

    const articles = Array.from(uniqueMap.values()).sort(
      (a, b) => b.pubDate.getTime() - a.pubDate.getTime()
    );

    console.log(`✅ Parsed ${articles.length} total news articles`);
    
    try {
      await AsyncStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({
        data: articles.map(a => ({ ...a, pubDate: a.pubDate.toISOString() })),
        timestamp: Date.now(),
      }));
      console.log('💾 News articles cached for offline use');
    } catch (cacheError) {
      console.warn('⚠️ Failed to cache news articles:', cacheError);
    }
    
    return articles;
  } catch (error) {
    console.error('❌ Error fetching news articles:', error instanceof Error ? error.message : String(error));
    
    try {
      const cached = await AsyncStorage.getItem(NEWS_CACHE_KEY);
      if (cached) {
        const { data } = JSON.parse(cached);
        console.log('📦 Using cached news articles (offline mode)');
        return data.map((a: any) => ({ ...a, pubDate: new Date(a.pubDate) }));
      }
    } catch (cacheError) {
      console.warn('⚠️ Failed to read news cache:', cacheError);
    }
    
    return [];
  }
}

export async function getCachedNewsArticles(): Promise<{ articles: NewsArticle[]; isCached: boolean; cacheAge: number }> {
  try {
    const cached = await AsyncStorage.getItem(NEWS_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;
      return {
        articles: data.map((a: any) => ({ ...a, pubDate: new Date(a.pubDate) })),
        isCached: true,
        cacheAge: age,
      };
    }
  } catch (e) {
    console.warn('⚠️ getCachedNewsArticles error:', e);
  }
  return { articles: [], isCached: false, cacheAge: 0 };
}

async function upsertAllVideosDirect(videos: VideoContent[]): Promise<void> {
  if (videos.length === 0) {
    console.log('[Sync] No videos to upsert, skipping');
    return;
  }

  try {
    const articleCutoff = Date.now() - 45 * 24 * 60 * 60 * 1000;
    const filtered = videos.filter(v => {
      if (v.programCategory) return true;
      const d = new Date(v.pubDate);
      return !isNaN(d.getTime()) && d.getTime() >= articleCutoff;
    });
    console.log(`[Sync] Filtered ${videos.length - filtered.length} articles > 45 days before upsert`);

    const rows = filtered.map((v) => {
      let pubDateIso = v.pubDate;
      try {
        const d = new Date(v.pubDate);
        if (!isNaN(d.getTime())) pubDateIso = d.toISOString();
      } catch {}
      return {
        id: v.id,
        title: v.title,
        description: v.description || '',
        thumbnail: v.thumbnail || '',
        video_url: v.videoUrl,
        pub_date: pubDateIso,
        category: v.category,
        program_category: v.programCategory || null,
        updated_at: new Date().toISOString(),
      };
    });

    const BATCH_SIZE = 50;
    let savedCount = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('cached_programs')
        .upsert(batch, { onConflict: 'video_url' });

      if (error) {
        console.log('[Sync] Upsert batch error:', error.message);
      } else {
        savedCount += batch.length;
      }
    }

    console.log(`[Sync] Upserted ${savedCount} videos directly to Supabase`);
  } catch (e) {
    console.warn('[Sync] upsertAllVideosDirect error:', e instanceof Error ? e.message : String(e));
  }
}

const VOD_STOP_WORDS = new Set(['di', 'il', 'la', 'le', 'lo', 'i', 'gli', 'e', 'a', 'da', 'in', 'su', 'con', 'per', 'un', 'una', 'del', 'della', 'dei', 'degli', 'delle', 'al', 'ai', 'dal', 'nei', 'nel', 'che', 'non', 'si', 'tv']);

function normalizeTitleWords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !VOD_STOP_WORDS.has(w));
}

export function findMatchingVod(scheduleTitle: string, scheduleEndTime: Date, vodList: VideoContent[]): VideoContent | null {
  const schedWords = normalizeTitleWords(scheduleTitle);
  if (schedWords.length === 0) return null;

  const endMs = scheduleEndTime.getTime();
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

  let bestMatch: VideoContent | null = null;
  let bestScore = 0;

  for (const vod of vodList) {
    if (!vod.videoUrl) continue;
    const vodWords = normalizeTitleWords(vod.title);
    const common = schedWords.filter(w => vodWords.includes(w));
    if (common.length === 0) continue;

    const pubDate = new Date(vod.pubDate);
    const withinWindow = !isNaN(pubDate.getTime()) && Math.abs(pubDate.getTime() - endMs) <= SIX_HOURS_MS;

    const score = common.length * 2 + (withinWindow ? 3 : 0);
    const isValid = common.length >= 2 || (common.length >= 1 && withinWindow);

    if (isValid && score > bestScore) {
      bestScore = score;
      bestMatch = vod;
    }
  }

  return bestMatch;
}

export async function fetchCachedPrograms(): Promise<VideoContent[]> {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('cached_programs')
      .select('*')
      .gt('pub_date', cutoff)
      .order('pub_date', { ascending: false })
      .limit(300);

    if (error) {
      console.warn('[Cache] fetchCachedPrograms error:', error.message);
      return [];
    }

    console.log(`[Cache] Loaded ${data?.length ?? 0} cached programs directly from Supabase`);

    return (data ?? []).map((row: any): VideoContent => ({
      id: row.id,
      title: row.title,
      description: row.description || '',
      thumbnail: row.thumbnail || '',
      videoUrl: row.video_url,
      pubDate: row.pub_date,
      category: (row.category || 'all') as VideoContent['category'],
      programCategory: row.program_category || undefined,
    }));
  } catch (e) {
    console.warn('[Cache] fetchCachedPrograms error:', e instanceof Error ? e.message : String(e));
    return [];
  }
}

export async function fetchActiveBreakingNews(): Promise<BreakingNewsItem | null> {
  try {
    const { data, error } = await supabase
      .from('breaking_news')
      .select('id, titolo, descrizione, url, attiva')
      .eq('attiva', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data as BreakingNewsItem;
  } catch {
    return null;
  }
}

export async function fetchAllActiveBreakingNews(): Promise<BreakingNewsItem[]> {
  try {
    const { data, error } = await supabase
      .from('breaking_news')
      .select('id, titolo, descrizione, url, attiva')
      .eq('attiva', true)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return data as BreakingNewsItem[];
  } catch {
    return [];
  }
}

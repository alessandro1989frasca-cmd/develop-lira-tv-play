import * as z from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { supabase } from "../../db";
import { XMLParser } from "fast-xml-parser";

const CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT_MS = 15000;

const scheduleSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().default(''),
  startTime: z.string(),
  endTime: z.string(),
  category: z.string().default(''),
});

function parseXMLTVDate(dateStr: string): Date {
  if (!dateStr || dateStr.length < 14) return new Date();
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  const hour = parseInt(dateStr.substring(8, 10));
  const minute = parseInt(dateStr.substring(10, 12));
  const second = parseInt(dateStr.substring(12, 14));
  let date = new Date(Date.UTC(year, month, day, hour, minute, second));
  if (dateStr.length >= 19) {
    const timezoneMatch = dateStr.match(/([+-])(\d{2})(\d{2})$/);
    if (timezoneMatch) {
      const sign = timezoneMatch[1] === '+' ? 1 : -1;
      const tzHours = parseInt(timezoneMatch[2]);
      const tzMinutes = parseInt(timezoneMatch[3]);
      const offsetMinutes = sign * (tzHours * 60 + tzMinutes);
      date = new Date(date.getTime() - (offsetMinutes * 60000));
    }
  }
  return date;
}

function generateScheduleId(title: string, startTime: Date): string {
  const dateStr = startTime.toISOString().replace(/[-:T.Z]/g, '').substring(0, 12);
  const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
  return `sched-${cleanTitle}-${dateStr}`;
}

async function fetchAndParseXML(): Promise<Array<{ id: string; title: string; description: string; startTime: string; endTime: string; category: string }>> {
  const epgUrl = 'https://www.liratv.it/wp-content/xlmvisia/palinsesto.xml';
  console.log('[Schedule] Fetching EPG XML from source...');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let xmlText: string;
  try {
    const response = await fetch(epgUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    xmlText = await response.text();
  } finally {
    clearTimeout(timeoutId);
  }

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const result = parser.parse(xmlText);
  const tv = result.tv || result;
  let programmes = tv.programme || [];
  if (!Array.isArray(programmes)) programmes = [programmes];

  console.log(`[Schedule] Found ${programmes.length} programmes in XML`);

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
      startTime: parseXMLTVDate(startStr),
      endTime: parseXMLTVDate(stopStr),
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

  return merged.map(p => ({
    id: generateScheduleId(p.title, p.startTime),
    title: p.title,
    description: p.description,
    startTime: p.startTime.toISOString(),
    endTime: p.endTime.toISOString(),
    category: p.category,
  }));
}

async function upsertScheduleToDB(programs: Array<{ id: string; title: string; description: string; startTime: string; endTime: string; category: string }>): Promise<number> {
  if (programs.length === 0) return 0;

  const newIds = programs.map(p => p.id);
  const { error: deleteError } = await supabase
    .from("cached_schedule")
    .delete()
    .not("id", "in", `(${newIds.join(",")})`);
  if (deleteError) console.log("[Schedule] Cleanup error:", deleteError.message);

  const rows = programs.map(p => ({
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
    const { error } = await supabase.from("cached_schedule").upsert(batch, { onConflict: "id" });
    if (error) console.log("[Schedule] Upsert batch error:", error.message);
    else saved += batch.length;
  }
  console.log(`[Schedule] Saved ${saved} items to DB`);
  return saved;
}

async function getCachedFromDB() {
  const { data, error } = await supabase
    .from("cached_schedule")
    .select("*")
    .order("start_time", { ascending: true });

  if (error) {
    console.log("[Schedule] getCached error:", error.message);
    return { rows: [], lastUpdated: null as string | null };
  }

  const rows = (data ?? []).map((row: any) => ({
    id: row.id as string,
    title: row.title as string,
    description: (row.description || '') as string,
    startTime: row.start_time as string,
    endTime: row.end_time as string,
    category: (row.category || '') as string,
  }));

  const lastUpdated = data && data.length > 0
    ? (data as any[]).reduce((latest: string | null, row: any) => {
        const u = row.updated_at as string | null;
        if (!u) return latest;
        if (!latest) return u;
        return u > latest ? u : latest;
      }, null as string | null)
    : null;

  return { rows, lastUpdated };
}

export const scheduleRouter = createTRPCRouter({
  upsertBatch: publicProcedure
    .input(z.object({ programs: z.array(scheduleSchema) }))
    .mutation(async ({ input }) => {
      const saved = await upsertScheduleToDB(input.programs);
      return { saved };
    }),

  getCached: publicProcedure.query(async () => {
    const { rows } = await getCachedFromDB();
    console.log("[Schedule] Returning", rows.length, "cached items");
    return rows;
  }),

  getSmartSchedule: publicProcedure.query(async () => {
    console.log('[Schedule] getSmartSchedule called');

    const { rows: cachedRows, lastUpdated } = await getCachedFromDB();

    const isFresh = lastUpdated
      ? (Date.now() - new Date(lastUpdated).getTime()) < CACHE_MAX_AGE_MS
      : false;

    if (isFresh && cachedRows.length > 0) {
      console.log(`[Schedule] Cache is fresh (updated ${lastUpdated}), returning ${cachedRows.length} cached items`);
      return { programs: cachedRows, source: 'cache' as const };
    }

    console.log('[Schedule] Cache is stale or empty, fetching XML...');
    try {
      const freshPrograms = await fetchAndParseXML();
      if (freshPrograms.length > 0) {
        await upsertScheduleToDB(freshPrograms);
        console.log(`[Schedule] Refreshed cache with ${freshPrograms.length} programs from XML`);
        return { programs: freshPrograms, source: 'xml' as const };
      }
    } catch (err) {
      console.error('[Schedule] XML fetch failed:', err instanceof Error ? err.message : String(err));
    }

    if (cachedRows.length > 0) {
      console.log(`[Schedule] XML failed, returning ${cachedRows.length} stale cached items`);
      return { programs: cachedRows, source: 'stale_cache' as const };
    }

    console.log('[Schedule] No data available from any source');
    return { programs: [], source: 'empty' as const };
  }),
});

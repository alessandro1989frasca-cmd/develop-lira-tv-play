import { Hono } from "hono";
import { cors } from "hono/cors";
import fs from "fs";
import path from "path";

import { cleanupOldData, supabaseAdmin } from "./db";
import { startFootballService, refreshMatchData } from "./services/footballService";

const app = new Hono();

cleanupOldData().catch((e) => console.log("[Startup] Cleanup error (non-fatal):", e));
startFootballService();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

app.get("/", (c) => {
  return c.json({ status: "ok", message: "Lira TV API is running" });
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.post("/maintenance/cleanup", async (c) => {
  try {
    await cleanupOldData();
    return c.json({ status: "ok", message: "Cleanup completed" });
  } catch (e) {
    console.log("[Maintenance] Cleanup error:", e);
    return c.json({ status: "error", message: "Cleanup failed" }, 500);
  }
});

/* ------------------------------------------------------------------ */
/* Program Description — WP categories API con cache 24h in memoria    */
/* ------------------------------------------------------------------ */

const programDescCache = new Map<string, { description: string; name: string; cachedAt: number }>();
const DESC_CACHE_TTL = 24 * 60 * 60 * 1000;

function toWpSlug(programName: string): string {
  return programName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

app.get('/api/program-description', async (c) => {
  const name = c.req.query('name') ?? '';
  if (!name) return c.json({ description: '' });

  const slug = toWpSlug(name);
  const cached = programDescCache.get(slug);
  if (cached && Date.now() - cached.cachedAt < DESC_CACHE_TTL) {
    return c.json({ description: cached.description, name: cached.name, slug, fromCache: true });
  }

  try {
    const res = await fetch(`https://www.liratv.it/wp-json/wp/v2/categories?slug=${slug}`);
    const data = await res.json() as any[];
    if (Array.isArray(data) && data.length > 0 && data[0].description) {
      const clean = stripHtml(data[0].description);
      const entry = { description: clean, name: data[0].name as string, cachedAt: Date.now() };
      programDescCache.set(slug, entry);
      return c.json({ description: entry.description, name: entry.name, slug });
    }
    programDescCache.set(slug, { description: '', name, cachedAt: Date.now() });
    return c.json({ description: '', slug });
  } catch (e: any) {
    return c.json({ description: '', error: e.message });
  }
});

/* ------------------------------------------------------------------ */
/* Heartbeat — conteggio spettatori live in tempo reale                 */
/* ------------------------------------------------------------------ */

const liveHeartbeats = new Map<string, number>(); // device_id → timestamp ultimo ping
const HEARTBEAT_TTL_MS = 60_000; // 60 secondi

app.post("/api/heartbeat", async (c) => {
  try {
    const body = await c.req.json<{ deviceId: string }>();
    if (!body?.deviceId) return c.json({ error: "deviceId mancante" }, 400);
    liveHeartbeats.set(body.deviceId, Date.now());
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Richiesta non valida" }, 400);
  }
});

app.get("/api/viewers/live", (c) => {
  const now = Date.now();
  let count = 0;
  for (const [, ts] of liveHeartbeats) {
    if (now - ts <= HEARTBEAT_TTL_MS) count++;
  }
  for (const [id, ts] of liveHeartbeats) {
    if (now - ts > HEARTBEAT_TTL_MS * 5) liveHeartbeats.delete(id);
  }
  return c.json({ viewers: count, at: new Date().toISOString() });
});

app.get("/viewers", (c) => {
  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="10">
  <title>Lira TV — Spettatori Live</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0a0e1a; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .count { font-size: 96px; font-weight: 800; color: #F5C518; line-height: 1; }
    .label { font-size: 18px; color: #94A3B8; margin-top: 12px; }
    .updated { font-size: 13px; color: #475569; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="count" id="count">…</div>
  <div class="label">spettatori guardano il live adesso</div>
  <div class="updated" id="updated"></div>
  <script>
    async function refresh() {
      try {
        const r = await fetch('/api/viewers/live');
        const d = await r.json();
        document.getElementById('count').textContent = d.viewers;
        document.getElementById('updated').textContent = 'Aggiornato: ' + new Date(d.at).toLocaleTimeString('it-IT');
      } catch(e) { document.getElementById('count').textContent = '—'; }
    }
    refresh();
    setInterval(refresh, 10000);
  </script>
</body>
</html>`;
  return c.html(html);
});

/* ------------------------------------------------------------------ */
/* Debug: Match Widget HTML                                              */
/* ------------------------------------------------------------------ */

app.get("/debug/match", (c) => {
  const htmlPath = path.join(process.cwd(), "match-widget-debug.html");
  const html = fs.readFileSync(htmlPath, "utf-8");
  return c.html(html);
});

/* ------------------------------------------------------------------ */
/* Debug: Match Widget API                                               */
/* ------------------------------------------------------------------ */

app.get("/api/match-debug", async (c) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("app_config")
      .select("match_widget_enabled, match_data")
      .eq("id", 1)
      .single();

    if (error) return c.json({ error: error.message }, 500);

    return c.json({
      match_widget_enabled: data.match_widget_enabled,
      match_data: data.match_data,
      fetched_at: new Date().toISOString(),
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/* Stato attuale match_data in Supabase + forza aggiornamento */
app.get("/api/football/status", async (c) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_config')
      .select('match_widget_enabled, match_data')
      .eq('id', 1)
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ match_widget_enabled: data.match_widget_enabled, match_data: data.match_data, read_at: new Date().toISOString() });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/api/football/force-refresh", async (c) => {
  try {
    await refreshMatchData();
    const { data } = await supabaseAdmin
      .from('app_config')
      .select('match_data')
      .eq('id', 1)
      .single();
    return c.json({ ok: true, match_data: data?.match_data, refreshed_at: new Date().toISOString() });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/* Salva forzatamente in Supabase il dato attuale di API-Football (bypassa il guard elapsed) */
app.post("/api/football/force-push", async (c) => {
  const API_KEY = process.env.API_FOOTBALL_KEY ?? "";
  const TEAM_ID = 514;
  if (!API_KEY) return c.json({ error: "API_FOOTBALL_KEY non configurata" }, 500);
  try {
    const res = await fetch(`https://v3.football.api-sports.io/fixtures?live=all&team=${TEAM_ID}`, {
      headers: { "x-apisports-key": API_KEY, Accept: "application/json" },
    });
    const raw = await res.json();
    if (!raw.response || raw.response.length === 0) {
      return c.json({ ok: false, message: "Nessuna partita live trovata — Supabase non aggiornato" });
    }
    const f = raw.response[0];
    const homeTeamId = f.teams.home.id;
    const scorers = (f.events ?? [])
      .filter((e: any) => e.type === 'Goal')
      .map((e: any) => ({
        minute: e.time?.elapsed ?? 0,
        playerName: e.player?.name ?? 'N/D',
        team: e.team?.id === homeTeamId ? 'home' : 'away',
        isOwnGoal: e.detail === 'Own Goal',
        isPenalty: e.detail === 'Penalty',
      }));
    const match = {
      fixtureId: f.fixture.id,
      date: f.fixture.date,
      status: f.fixture.status.short,
      elapsed: f.fixture.status.elapsed ?? null,
      homeTeam: f.teams.home.name,
      homeLogo: f.teams.home.logo,
      awayTeam: f.teams.away.name,
      awayLogo: f.teams.away.logo,
      homeGoals: f.goals.home ?? null,
      awayGoals: f.goals.away ?? null,
      league: f.league.name,
      round: f.league.round,
      scorers,
    };
    const { error: updateError } = await supabaseAdmin
      .from('app_config')
      .update({ match_data: match })
      .eq('id', 1);
    if (updateError) return c.json({ error: updateError.message }, 500);
    console.log(`[Football] force-push manuale: ${match.status} ${match.homeTeam} ${match.homeGoals}-${match.awayGoals} ${match.awayTeam} | elapsed=${match.elapsed} | ${new Date().toISOString()}`);
    return c.json({ ok: true, match_data: match, pushed_at: new Date().toISOString() });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/api/match-debug/refresh", async (c) => {
  const API_KEY = process.env.API_FOOTBALL_KEY ?? "";
  const TEAM_ID = 514;

  if (!API_KEY) return c.json({ error: "API_FOOTBALL_KEY non configurata" }, 500);

  try {
    const res = await fetch(`https://v3.football.api-sports.io/fixtures?live=all&team=${TEAM_ID}`, {
      headers: { "x-apisports-key": API_KEY, Accept: "application/json" },
    });
    const raw = await res.json();
    return c.json({ raw, fetched_at: new Date().toISOString() });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

export default app;

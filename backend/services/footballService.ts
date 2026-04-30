/**
 * footballService.ts
 *
 * Interroga API-Football ogni 2 minuti quando il widget è abilitato
 * e salva il risultato in Supabase (app_config.match_data, row id=1).
 *
 * La chiamata API viene fatta SOLO se match_widget_enabled = true,
 * per restare nelle 100 richieste giornaliere gratuite.
 *
 * Supporto chiave di backup: se la chiave principale esaurisce la quota
 * (errore "rateLimit" o HTTP 429), il servizio passa automaticamente a
 * API_FOOTBALL_KEY_2 e logga l'evento.
 */

import { supabaseAdmin } from '../db';

const API_KEY_PRIMARY   = process.env.API_FOOTBALL_KEY ?? '';
const API_KEY_BACKUP    = process.env.API_FOOTBALL_KEY_2 ?? '';
const API_BASE          = 'https://v3.football.api-sports.io';
const TEAM_ID           = 514;          // US Salernitana 1919
const POLL_MS           = 2 * 60 * 1000; // 2 minuti

// Quale chiave è attiva in questa sessione del backend
let activeKey: 'primary' | 'backup' = 'primary';

function getCurrentKey(): string {
  return activeKey === 'primary' ? API_KEY_PRIMARY : API_KEY_BACKUP;
}

function isQuotaError(json: any, httpStatus: number): boolean {
  if (httpStatus === 429) return true;
  // API-Football restituisce quota esaurita come errore nel body con status 200
  const errors = json?.errors ?? {};
  const errStr = JSON.stringify(errors).toLowerCase();
  return errStr.includes('ratelimit') || errStr.includes('requests') || errStr.includes('quota');
}

export interface GoalEvent {
  minute: number;
  playerName: string;
  team: 'home' | 'away';
  isOwnGoal: boolean;
  isPenalty: boolean;
}

export interface MatchData {
  fixtureId: number;
  date: string;
  status: string;
  elapsed: number | null;
  homeTeam: string;
  homeLogo: string;
  awayTeam: string;
  awayLogo: string;
  homeGoals: number | null;
  awayGoals: number | null;
  league: string;
  round: string;
  scorers: GoalEvent[];
}

/* ------------------------------------------------------------------ */
/* Fetch da API-Football con fallback automatico sulla chiave backup    */
/* ------------------------------------------------------------------ */

async function fetchApiFootball(path: string): Promise<any> {
  const key = getCurrentKey();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'x-apisports-key': key,
      Accept: 'application/json',
    },
  });

  const json = res.ok ? await res.json() : null;

  // Controlla quota esaurita
  if (isQuotaError(json ?? {}, res.status)) {
    if (activeKey === 'primary' && API_KEY_BACKUP) {
      console.warn('[Football] ⚠️  Quota chiave principale esaurita — passo alla chiave di backup');
      activeKey = 'backup';
      // Ritenta subito con la chiave di backup
      const res2 = await fetch(`${API_BASE}${path}`, {
        headers: {
          'x-apisports-key': API_KEY_BACKUP,
          Accept: 'application/json',
        },
      });
      if (!res2.ok) throw new Error(`API-Football (backup) ${res2.status}: ${res2.statusText}`);
      const json2 = await res2.json();
      if (json2.errors && Object.keys(json2.errors).length > 0 && !isQuotaError(json2, 200)) {
        throw new Error(`API-Football (backup) error: ${JSON.stringify(json2.errors)}`);
      }
      if (isQuotaError(json2, 200)) {
        console.error('[Football] ❌ Quota esaurita anche sulla chiave di backup');
        throw new Error('API-Football: quota esaurita su entrambe le chiavi');
      }
      return json2;
    } else if (activeKey === 'backup') {
      console.error('[Football] ❌ Quota esaurita sulla chiave di backup');
      throw new Error('API-Football: quota esaurita sulla chiave di backup');
    } else {
      throw new Error('API-Football: quota esaurita, nessuna chiave di backup configurata');
    }
  }

  if (!res.ok) throw new Error(`API-Football ${res.status}: ${res.statusText}`);
  if (json.errors && Object.keys(json.errors).length > 0) {
    throw new Error(`API-Football error: ${JSON.stringify(json.errors)}`);
  }
  return json;
}

function parseScorers(f: any): GoalEvent[] {
  const events: any[] = f.events ?? [];
  const homeTeamId = f.teams.home.id;
  return events
    .filter((e: any) => e.type === 'Goal')
    .map((e: any) => ({
      minute:     e.time?.elapsed ?? 0,
      playerName: e.player?.name ?? 'N/D',
      team:       e.team?.id === homeTeamId ? 'home' : 'away',
      isOwnGoal:  e.detail === 'Own Goal',
      isPenalty:  e.detail === 'Penalty',
    }));
}

function parseFixture(f: any): MatchData {
  return {
    fixtureId:  f.fixture.id,
    date:       f.fixture.date,
    status:     f.fixture.status.short,
    elapsed:    f.fixture.status.elapsed ?? null,
    homeTeam:   f.teams.home.name,
    homeLogo:   f.teams.home.logo,
    awayTeam:   f.teams.away.name,
    awayLogo:   f.teams.away.logo,
    homeGoals:  f.goals.home ?? null,
    awayGoals:  f.goals.away ?? null,
    league:     f.league.name,
    round:      f.league.round,
    scorers:    parseScorers(f),
  };
}

async function getSalernitanaMatch(): Promise<MatchData | null> {
  // Partite live (unico endpoint disponibile nel piano gratuito di API-Football)
  const live = await fetchApiFootball(`/fixtures?live=all&team=${TEAM_ID}`);
  if (live.response && live.response.length > 0) {
    return parseFixture(live.response[0]);
  }

  // Nessuna partita live — mantieni l'ultimo dato salvato (non sovrascrivere)
  return undefined as any;
}

/* ------------------------------------------------------------------ */
/* Aggiornamento Supabase                                               */
/* ------------------------------------------------------------------ */

export async function refreshMatchData(): Promise<void> {
  // Controlla se il widget è abilitato (legge direttamente da Supabase)
  const { data, error } = await supabaseAdmin
    .from('app_config')
    .select('match_widget_enabled')
    .eq('id', 1)
    .single();

  if (error || !data) {
    console.log('[Football] Could not read app_config:', error?.message);
    return;
  }

  if (!data.match_widget_enabled) {
    return; // Widget disabilitato — non consumare API
  }

  console.log(`[Football] Widget attivo, aggiornamento risultati... (chiave: ${activeKey})`);
  const match = await getSalernitanaMatch();

  // Se non c'è partita live, non sovrascriviamo il dato precedente
  if (match === undefined || match === null) {
    console.log('[Football] Nessuna partita live — dato precedente mantenuto');
    return;
  }

  // Leggi il dato attuale per confrontare l'elapsed: non tornare indietro
  const { data: current } = await supabaseAdmin
    .from('app_config')
    .select('match_data')
    .eq('id', 1)
    .single();

  const currentElapsed: number | null = (current?.match_data as any)?.elapsed ?? null;
  const newElapsed = match.elapsed ?? null;

  if (
    currentElapsed !== null &&
    newElapsed !== null &&
    newElapsed < currentElapsed
  ) {
    console.log(
      `[Football] Risposta stale (elapsed API=${newElapsed} < Supabase=${currentElapsed}) — retry in 4s su server diverso...`
    );
    // Aspetta 4 secondi e ritenta: i load-balancer di API-Football ruotano i server,
    // la seconda chiamata ha buone probabilità di colpire uno aggiornato
    await new Promise(r => setTimeout(r, 4000));
    const retry = await getSalernitanaMatch();
    const retryElapsed = retry?.elapsed ?? null;

    if (
      retry &&
      retryElapsed !== null &&
      currentElapsed !== null &&
      retryElapsed >= currentElapsed
    ) {
      console.log(`[Football] Retry riuscito: elapsed=${retryElapsed} — aggiorno Supabase`);
      const { error: retryErr } = await supabaseAdmin
        .from('app_config')
        .update({ match_data: retry })
        .eq('id', 1);
      if (!retryErr) {
        console.log(
          `[Football] match_data aggiornato (retry): ${retry.status} ${retry.homeTeam} ${retry.homeGoals ?? '?'}-${retry.awayGoals ?? '?'} ${retry.awayTeam} | elapsed=${retry.elapsed} | ${new Date().toISOString()}`
        );
      }
    } else {
      console.log(
        `[Football] Retry stale (elapsed=${retryElapsed ?? 'null'}) — Supabase mantenuto a ${currentElapsed}`
      );
    }
    return;
  }

  const { error: updateError } = await supabaseAdmin
    .from('app_config')
    .update({ match_data: match })
    .eq('id', 1);

  if (updateError) {
    console.log('[Football] Errore salvataggio match_data:', updateError.message);
  } else {
    console.log(
      `[Football] match_data aggiornato: ${match.status} ${match.homeTeam} ${match.homeGoals ?? '?'}-${match.awayGoals ?? '?'} ${match.awayTeam} | elapsed=${match.elapsed ?? 'null'} | ${new Date().toISOString()}`
    );
  }
}

/* ------------------------------------------------------------------ */
/* Start                                                                 */
/* ------------------------------------------------------------------ */

export function startFootballService(): void {
  if (!API_KEY_PRIMARY) {
    console.warn('[Football] API_FOOTBALL_KEY non configurata — servizio disabilitato');
    return;
  }

  if (API_KEY_BACKUP) {
    console.log('[Football] Chiave di backup configurata (API_FOOTBALL_KEY_2) ✓');
  } else {
    console.log('[Football] Nessuna chiave di backup configurata (API_FOOTBALL_KEY_2)');
  }

  console.log('[Football] Servizio risultati avviato (polling ogni 2 min)');

  // Prima chiamata subito all'avvio
  refreshMatchData().catch((e) =>
    console.log('[Football] Errore primo aggiornamento:', e?.message)
  );

  setInterval(() => {
    refreshMatchData().catch((e) =>
      console.log('[Football] Errore aggiornamento periodico:', e?.message)
    );
  }, POLL_MS);
}

/**
 * footballService.ts
 *
 * Interroga API-Football ogni 2 minuti quando il widget è abilitato
 * e salva il risultato in Supabase (app_config.match_data, row id=1).
 *
 * La chiamata API viene fatta SOLO se match_widget_enabled = true,
 * per restare nelle 100 richieste giornaliere gratuite.
 */

import { supabaseAdmin } from '../db';

const API_KEY      = process.env.API_FOOTBALL_KEY ?? '';
const API_BASE     = 'https://v3.football.api-sports.io';
const TEAM_ID      = 514;          // US Salernitana 1919
const POLL_MS      = 2 * 60 * 1000; // 2 minuti

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
/* Fetch da API-Football                                                 */
/* ------------------------------------------------------------------ */

async function fetchApiFootball(path: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'x-apisports-key': API_KEY,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`API-Football ${res.status}: ${res.statusText}`);
  const json = await res.json();
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

async function refreshMatchData(): Promise<void> {
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

  console.log('[Football] Widget attivo, aggiornamento risultati...');
  const match = await getSalernitanaMatch();

  // Se non c'è partita live, non sovrascriviamo il dato precedente
  if (match === undefined || match === null) {
    console.log('[Football] Nessuna partita live — dato precedente mantenuto');
    return;
  }

  const { error: updateError } = await supabaseAdmin
    .from('app_config')
    .update({ match_data: match })
    .eq('id', 1);

  if (updateError) {
    console.log('[Football] Errore salvataggio match_data:', updateError.message);
  } else {
    console.log('[Football] match_data aggiornato:', match.status, match.homeTeam, match.homeGoals, '-', match.awayGoals, match.awayTeam);
  }
}

/* ------------------------------------------------------------------ */
/* Start                                                                 */
/* ------------------------------------------------------------------ */

export function startFootballService(): void {
  if (!API_KEY) {
    console.warn('[Football] API_FOOTBALL_KEY non configurata — servizio disabilitato');
    return;
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

# Lira TV Play - Replit Setup

## Overview
Lira TV Play is an Italian TV streaming app built with Expo Router + React Native for cross-platform (iOS, Android, Web). It streams content from Lira TV's RSS feeds and provides live TV, news, and VOD content.

## Current Version
**v1.0.48 / versionCode 142**

### Changelog v1.0.48 (rispetto a v1.0.47)
- Breaking news banner rosso in cima al feed news (polling ogni 2 min da Supabase `breaking_news`)
- Campanella 🔔 nell'header News per opt-in notifiche push urgenti
- Token push salvato in Supabase `push_tokens` al consenso utente
- Edge Function `notify-breaking-news`: invia push via Expo API al trigger del webhook DB
- Edge Function `liratv-bn-bot` (Telegram): pubblica breaking news scrivendo al bot, /lista, /stop [ID]
- Fix timezone CET/CEST per orario programmi XMLTV (già in v1.0.47)

### Supabase Tables
- `breaking_news` — notizie urgenti (attiva=true per mostrarle)
- `push_tokens` — token dispositivi utenti per notifiche push

### Supabase Edge Functions
- `notify-breaking-news` — invia push notification a tutti i token quando inserisci breaking news
- `liratv-bn-bot` (slug: `bright-service`) — bot Telegram per pubblicare news da mobile

### Telegram Bot
- Webhook: `https://api.telegram.org/bot[TOKEN]/setWebhook?url=https://fqkuovbukvjtkcieabzy.supabase.co/functions/v1/bright-service`
- Comandi: testo libero = pubblica, /lista, /stop [ID], /aiuto

## Architecture
- **Frontend**: Expo Router + React Native (web target on port 5000)
- **Backend**: Hono + tRPC server (port 8000)
- **Database**: Supabase (requires `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` secrets)
- **Package Manager**: npm

## Key Files
- `server.ts` - Hono backend entry point (port 8000)
- `backend/hono.ts` - Hono app with CORS and tRPC routes
- `backend/db.ts` - Supabase client setup
- `backend/trpc/` - tRPC router definitions
- `lib/trpc.ts` - tRPC client (dynamically resolves backend URL)
- `app/` - Expo Router pages
- `components/` - React Native components

## Workflows
- **Start application**: `npx expo start --web --port 5000 --host lan` - Expo web dev server (webview, port 5000)
- **Start Backend**: `npx tsx server.ts` - Hono API server (console, port 8000)

## Environment Variables
- `EXPO_PUBLIC_RORK_API_BASE_URL` - Backend URL for mobile clients (set to Replit dev domain + :8000)
- `EXPO_PUBLIC_SUPABASE_URL` - Supabase project URL (optional, for DB features)
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key (optional, for DB features)

## Notes
- The tRPC client dynamically resolves the backend URL based on `window.location` on web
- Content is primarily fetched from Lira TV's RSS feeds via CORS proxies (allorigins.win, corsproxy.io, codetabs.com)
- Backend features (polls, analytics, schedule caching) require Supabase credentials
- The app works without Supabase credentials - RSS feeds provide all main content

## Release / Zip Convention
- Every time a new zip is created (v12, v13, ...), update both fields in `app.json`:
  - `expo.version` → `"1.0.x"` where x matches the zip number (e.g. v13 → `"1.0.13"`)
  - `android.versionCode` → increment by 1 (e.g. v12=102, v13=103, v14=104, ...)
- Current: zip **v19**, version **1.0.19**, versionCode **109**
- The Play Store rejects builds with a versionCode already used, so never reuse a number

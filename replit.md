# Lira TV Play - Replit Setup

## Overview
Lira TV Play is an Italian TV streaming app built with Expo Router + React Native for cross-platform (iOS, Android, Web). It streams content from Lira TV's RSS feeds and provides live TV, news, and VOD content.

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

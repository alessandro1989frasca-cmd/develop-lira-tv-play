import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import fs from "fs";
import path from "path";

import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import { cleanupOldData, supabaseAdmin } from "./db";
import { startFootballService } from "./services/footballService";

const app = new Hono();

cleanupOldData().catch((e) => console.log("[Startup] Cleanup error (non-fatal):", e));
startFootballService();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

app.use(
  "/api/trpc/*",
  trpcServer({
    endpoint: "/api/trpc",
    router: appRouter,
    createContext,
  }),
);

app.get("/", (c) => {
  return c.json({ status: "ok", message: "Lira TV API is running" });
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

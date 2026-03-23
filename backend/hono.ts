import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import { cleanupOldData } from "./db";

const app = new Hono();

cleanupOldData().catch((e) => console.log("[Startup] Cleanup error (non-fatal):", e));

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

export default app;

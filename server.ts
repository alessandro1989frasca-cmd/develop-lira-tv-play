import { serve } from "@hono/node-server";
import app from "./backend/hono";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8000;

serve({
  fetch: app.fetch,
  port: PORT,
}, (info) => {
  console.log(`[Server] Lira TV API running on http://localhost:${info.port}`);
});

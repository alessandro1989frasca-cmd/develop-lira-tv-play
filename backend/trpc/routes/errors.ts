import * as z from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { supabase } from "../../db";

export const errorsRouter = createTRPCRouter({
  report: publicProcedure
    .input(z.object({
      deviceId: z.string().min(5, 'Invalid device ID'),
      message: z.string().min(1).max(2000),
      stack: z.string().max(5000).optional(),
      screen: z.string().max(200).optional(),
      context: z.string().max(1000).optional(),
      level: z.enum(["error", "warn", "fatal"]).default("error"),
    }))
    .mutation(async ({ input }) => {
      console.log(`[Errors] ${input.level} from ${input.deviceId}: ${input.message}`);
      try {
        const { error } = await supabase
          .from('error_logs')
          .insert({
            device_id: input.deviceId,
            message: input.message,
            stack: input.stack ?? null,
            screen: input.screen ?? null,
            context: input.context ?? null,
            level: input.level,
          });

        if (error) {
          console.log("[Errors] Insert error:", error.message);
          return { success: false };
        }
      } catch (e) {
        console.log("[Errors] Insert error:", e);
        return { success: false };
      }
      return { success: true };
    }),

  getRecent: publicProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(50),
      deviceId: z.string().optional(),
      level: z.enum(["error", "warn", "fatal"]).optional(),
    }))
    .query(async ({ input }) => {
      let query = supabase
        .from('error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(input.limit);

      if (input.deviceId) {
        query = query.eq('device_id', input.deviceId);
      }
      if (input.level) {
        query = query.eq('level', input.level);
      }

      const { data, error } = await query;
      if (error) {
        console.log("[Errors] Query error:", error.message);
        return { logs: [], total: 0 };
      }

      return { logs: data ?? [], total: data?.length ?? 0 };
    }),

  getStats: publicProcedure
    .query(async () => {
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { count: total } = await supabase
        .from('error_logs')
        .select('*', { count: 'exact', head: true });

      const { count: last24hCount } = await supabase
        .from('error_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', last24h);

      const { count: last7dCount } = await supabase
        .from('error_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', last7d);

      const { count: fatalCount } = await supabase
        .from('error_logs')
        .select('*', { count: 'exact', head: true })
        .eq('level', 'fatal');

      return {
        total: total ?? 0,
        last24h: last24hCount ?? 0,
        last7d: last7dCount ?? 0,
        fatal: fatalCount ?? 0,
      };
    }),
});

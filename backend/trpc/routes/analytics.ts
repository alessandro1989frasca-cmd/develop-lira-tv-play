import * as z from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { supabase } from "../../db";

export const analyticsRouter = createTRPCRouter({
  registerDevice: publicProcedure
    .input(z.object({ deviceId: z.string().min(5, 'Invalid device ID') }))
    .mutation(async ({ input }) => {
      console.log("[Analytics] Registering device:", input.deviceId);
      try {
        const { data: existing } = await supabase
          .from('devices')
          .select('device_id')
          .eq('device_id', input.deviceId)
          .single();

        if (existing) {
          const { error } = await supabase
            .from('devices')
            .update({ last_seen: new Date().toISOString() })
            .eq('device_id', input.deviceId);
          if (error) console.log("[Analytics] Update device error:", error.message);
        } else {
          const { error } = await supabase
            .from('devices')
            .insert({ device_id: input.deviceId });
          if (error) console.log("[Analytics] Insert device error:", error.message);
        }
      } catch (e) {
        console.log("[Analytics] Register device error:", e);
      }
      return { success: true };
    }),

  trackSession: publicProcedure
    .input(z.object({
      deviceId: z.string().min(5, 'Invalid device ID'),
      type: z.enum(["live", "video"]),
      contentId: z.string().min(1),
      durationSec: z.number().int().min(0),
    }))
    .mutation(async ({ input }) => {
      console.log("[Analytics] Session:", input.type, input.contentId, input.durationSec, "sec");
      if (input.durationSec < 3) {
        console.log("[Analytics] Session too short, skipping");
        return { success: false };
      }
      try {
        const { error: deviceError } = await supabase
          .from('devices')
          .upsert(
            { device_id: input.deviceId, last_seen: new Date().toISOString() },
            { onConflict: 'device_id' }
          );
        if (deviceError) console.log("[Analytics] Device upsert error:", deviceError.message);

        const { error } = await supabase
          .from('sessions')
          .insert({
            device_id: input.deviceId,
            type: input.type,
            content_id: input.contentId,
            duration_sec: input.durationSec,
          });

        if (error) console.log("[Analytics] Session error:", error.message);
      } catch (e) {
        console.log("[Analytics] Session error:", e);
      }
      return { success: true };
    }),

  getSessionStats: publicProcedure
    .input(z.object({ type: z.enum(["live", "video"]).optional() }))
    .query(async ({ input }) => {
      let query = supabase
        .from('sessions')
        .select('duration_sec');

      if (input.type) {
        query = query.eq('type', input.type);
      }

      const { data: sessions, error } = await query;

      if (error || !sessions || sessions.length === 0) {
        return { totalSessions: 0, avgDurationSec: 0, totalDurationSec: 0 };
      }

      const totalDuration = sessions.reduce((sum, s) => sum + s.duration_sec, 0);
      const avg = Math.round(totalDuration / sessions.length);

      return {
        totalSessions: sessions.length,
        avgDurationSec: avg,
        totalDurationSec: totalDuration,
      };
    }),

  getLiveStats: publicProcedure
    .query(async () => {
      const { count: total } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'live');

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { count: todayCount } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'live')
        .gte('created_at', today.toISOString());

      return {
        total: total ?? 0,
        today: todayCount ?? 0,
      };
    }),

  getDeviceStats: publicProcedure
    .query(async () => {
      const { count: totalDevices } = await supabase
        .from('devices')
        .select('*', { count: 'exact', head: true });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { count: activeToday } = await supabase
        .from('devices')
        .select('*', { count: 'exact', head: true })
        .gte('last_seen', today.toISOString());

      return {
        totalDevices: totalDevices ?? 0,
        activeToday: activeToday ?? 0,
      };
    }),
});

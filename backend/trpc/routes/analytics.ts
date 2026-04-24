import * as z from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { supabase } from "../../db";

function todayUTC(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export const analyticsRouter = createTRPCRouter({
  registerDevice: publicProcedure
    .input(z.object({
      deviceId: z.string().min(5, 'Invalid device ID'),
      platform: z.string().optional(),
      osVersion: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      console.log("[Analytics] Registering device:", input.deviceId);
      try {
        const { data: existing } = await supabase
          .from('devices')
          .select('device_id')
          .eq('device_id', input.deviceId)
          .single();

        const platformData: Record<string, string> = {};
        if (input.platform) platformData.platform = input.platform;
        if (input.osVersion) platformData.os_version = input.osVersion;

        if (existing) {
          const { error } = await supabase
            .from('devices')
            .update({ last_seen: new Date().toISOString(), ...platformData })
            .eq('device_id', input.deviceId);
          if (error) console.log("[Analytics] Update device error:", error.message);
        } else {
          const { error } = await supabase
            .from('devices')
            .insert({ device_id: input.deviceId, ...platformData });
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
      const today = todayUTC();

      /* Sessioni di oggi (raw) */
      let todayQuery = supabase
        .from('sessions')
        .select('duration_sec')
        .gte('created_at', today);
      if (input.type) todayQuery = todayQuery.eq('type', input.type);
      const { data: todaySessions } = await todayQuery;

      /* Storico aggregato (sessions_daily) */
      let histQuery = supabase
        .from('sessions_daily')
        .select('session_count, total_duration_sec');
      if (input.type) histQuery = histQuery.eq('type', input.type);
      const { data: historical } = await histQuery;

      const histCount    = historical?.reduce((s, d) => s + d.session_count,    0) ?? 0;
      const histDuration = historical?.reduce((s, d) => s + d.total_duration_sec, 0) ?? 0;
      const todayCount    = todaySessions?.length ?? 0;
      const todayDuration = todaySessions?.reduce((s, d) => s + d.duration_sec, 0) ?? 0;

      const totalSessions   = histCount + todayCount;
      const totalDurationSec = histDuration + todayDuration;
      const avgDurationSec  = totalSessions > 0 ? Math.round(totalDurationSec / totalSessions) : 0;

      return { totalSessions, avgDurationSec, totalDurationSec };
    }),

  getLiveStats: publicProcedure
    .query(async () => {
      const today = todayUTC();

      /* Oggi (raw) */
      const { count: todayCount } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'live')
        .gte('created_at', today);

      /* Storico aggregato */
      const { data: historical } = await supabase
        .from('sessions_daily')
        .select('session_count')
        .eq('type', 'live');

      const histTotal = historical?.reduce((s, d) => s + d.session_count, 0) ?? 0;

      return {
        total: histTotal + (todayCount ?? 0),
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

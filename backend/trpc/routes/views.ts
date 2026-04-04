import * as z from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { supabase } from "../../db";

export const viewsRouter = createTRPCRouter({
  track: publicProcedure
    .input(z.object({ videoId: z.string().min(1), deviceId: z.string().min(5, 'Invalid device ID') }))
    .mutation(async ({ input }) => {
      console.log("[Views] Tracking view for video:", input.videoId, "device:", input.deviceId);

      try {
        const { error: deviceError } = await supabase
          .from('devices')
          .upsert(
            { device_id: input.deviceId, last_seen: new Date().toISOString() },
            { onConflict: 'device_id' }
          );
        if (deviceError) console.log("[Views] Device upsert error:", deviceError.message);

        const { error: sessionError } = await supabase
          .from('sessions')
          .insert({
            device_id: input.deviceId,
            type: 'video',
            content_id: input.videoId,
            duration_sec: 0,
          });

        if (sessionError) console.log("[Views] Session insert error:", sessionError.message);

        const { count } = await supabase
          .from('sessions')
          .select('*', { count: 'exact', head: true })
          .eq('type', 'video')
          .eq('content_id', input.videoId);

        const viewCount = count ?? 0;
        console.log("[Views] Current count for", input.videoId, ":", viewCount);
        return { videoId: input.videoId, count: viewCount };
      } catch (e) {
        console.log("[Views] Error:", e);
        return { videoId: input.videoId, count: 1 };
      }
    }),

  getCounts: publicProcedure
    .input(z.object({ videoIds: z.array(z.string().min(1)).max(50) }))
    .query(async ({ input }) => {
      if (input.videoIds.length === 0) return {};

      try {
        const { data, error } = await supabase
          .from('sessions')
          .select('content_id')
          .eq('type', 'video')
          .in('content_id', input.videoIds)
          .limit(5000);

        if (error) {
          console.log("[Views] getCounts error:", error.message);
          return {};
        }

        const counts: Record<string, number> = {};
        for (const r of data ?? []) {
          counts[r.content_id] = (counts[r.content_id] || 0) + 1;
        }
        return counts;
      } catch (e) {
        console.log("[Views] getCounts exception:", e instanceof Error ? e.message : String(e));
        return {};
      }
    }),
});

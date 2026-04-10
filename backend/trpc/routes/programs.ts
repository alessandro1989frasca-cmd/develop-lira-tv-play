import * as z from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { supabase } from "../../db";

const RETENTION_DAYS = 60;

const programSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().default(''),
  thumbnail: z.string().default(''),
  videoUrl: z.string(),
  pubDate: z.string(),
  category: z.string().default('all'),
  programCategory: z.string().optional(),
});

function mapRowToVideo(row: any) {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description || '') as string,
    thumbnail: (row.thumbnail || '') as string,
    videoUrl: row.video_url as string,
    pubDate: row.pub_date as string,
    category: (row.category || 'all') as string,
    programCategory: (row.program_category || undefined) as string | undefined,
  };
}

export const programsRouter = createTRPCRouter({
  upsertBatch: publicProcedure
    .input(z.object({ programs: z.array(programSchema) }))
    .mutation(async ({ input }) => {
      if (input.programs.length === 0) return { saved: 0 };

      console.log("[Programs] Upserting", input.programs.length, "programs");

      const rows = input.programs.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        thumbnail: p.thumbnail,
        video_url: p.videoUrl,
        pub_date: p.pubDate,
        category: p.category,
        program_category: p.programCategory || null,
        updated_at: new Date().toISOString(),
      }));

      const BATCH_SIZE = 50;
      let savedCount = 0;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from("cached_programs")
          .upsert(batch, { onConflict: "video_url" });

        if (error) {
          console.log("[Programs] Upsert batch error:", error.message);
        } else {
          savedCount += batch.length;
        }
      }

      console.log("[Programs] Saved", savedCount, "programs to cache");
      return { saved: savedCount };
    }),

  getAll: publicProcedure
    .input(
      z.object({
        limit: z.number().optional().default(500),
      })
    )
    .query(async ({ input }) => {
      const cutoff = new Date(
        Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();

      const { data, error } = await supabase
        .from("cached_programs")
        .select("*")
        .gt("updated_at", cutoff)
        .order("pub_date", { ascending: false })
        .limit(input.limit);

      if (error) {
        console.log("[Programs] getAll error:", error.message);
        return [];
      }

      console.log("[Programs] getAll returning", data?.length ?? 0, "videos from Supabase");
      return (data ?? []).map(mapRowToVideo);
    }),

  getCached: publicProcedure
    .input(
      z.object({
        category: z.string().optional(),
        limit: z.number().optional().default(200),
      })
    )
    .query(async ({ input }) => {
      const cutoff = new Date(
        Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();

      let query = supabase
        .from("cached_programs")
        .select("*")
        .gt("updated_at", cutoff)
        .order("pub_date", { ascending: false })
        .limit(input.limit);

      if (input.category) {
        query = query.eq("category", input.category);
      }

      const { data, error } = await query;

      if (error) {
        console.log("[Programs] getCached error:", error.message);
        return [];
      }

      console.log("[Programs] Returning", data?.length ?? 0, "cached programs");
      return (data ?? []).map(mapRowToVideo);
    }),

  cleanup: publicProcedure.mutation(async () => {
    const cutoff = new Date(
      Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const { error, count } = await supabase
      .from("cached_programs")
      .delete()
      .lt("updated_at", cutoff);

    if (error) {
      console.log("[Programs] Cleanup error:", error.message);
      return { deleted: 0 };
    }

    console.log("[Programs] Cleaned up", count ?? 0, "old programs");
    return { deleted: count ?? 0 };
  }),
});

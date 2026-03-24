import { createTRPCRouter, publicProcedure } from "../create-context";
import { supabase } from "../../db";

export const featuredRouter = createTRPCRouter({
  getActive: publicProcedure.query(async () => {
    const { data, error } = await supabase
      .from("featured_programs")
      .select("*")
      .eq("featured", true)
      .order("sort_order", { ascending: true });

    if (error) {
      console.log("[Featured] getActive error:", error.message);
      return [];
    }

    console.log("[Featured] Returning", data?.length ?? 0, "featured programs");

    return (data ?? []).map((row: any) => ({
      id: row.id,
      title: row.title || "",
      description: row.description || "",
      thumbnail: row.thumbnail || "",
      videoUrl: row.video_url || "",
      category: row.category || "",
      sortOrder: row.sort_order ?? 0,
    }));
  }),
});

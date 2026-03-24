import * as z from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { supabase } from "../../db";

export const pollsRouter = createTRPCRouter({
  getActive: publicProcedure
    .input(z.object({ deviceId: z.string().min(5, 'Invalid device ID') }))
    .query(async ({ input }) => {
      console.log("[Polls] Fetching active polls for device:", input.deviceId);

      const { data: polls, error: pollsError } = await supabase
        .from('polls')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (pollsError || !polls || polls.length === 0) {
        console.log("[Polls] No active polls or error:", pollsError?.message);
        return [];
      }

      const { data: myVotesData } = await supabase
        .from('poll_votes')
        .select('poll_id, option_index')
        .eq('device_id', input.deviceId);

      const myVotes = new Map<string, number>();
      for (const v of myVotesData ?? []) {
        myVotes.set(v.poll_id, v.option_index);
      }

      const result = await Promise.all(polls.map(async (poll) => {
        const pollId = String(poll.id);

        const { data: allVotes } = await supabase
          .from('poll_votes')
          .select('option_index')
          .eq('poll_id', pollId);

        const voteCounts = new Array(poll.options.length).fill(0) as number[];
        for (const v of allVotes ?? []) {
          if (v.option_index >= 0 && v.option_index < voteCounts.length) {
            voteCounts[v.option_index]++;
          }
        }

        const totalVotes = voteCounts.reduce((a: number, b: number) => a + b, 0);

        return {
          id: pollId,
          question: poll.question,
          options: poll.options as string[],
          voteCounts,
          totalVotes,
          myVote: myVotes.get(pollId) ?? null,
        };
      }));

      return result;
    }),

  vote: publicProcedure
    .input(z.object({
      pollId: z.string().min(1),
      optionIndex: z.number().int().min(0),
      deviceId: z.string().min(5, 'Invalid device ID'),
    }))
    .mutation(async ({ input }) => {
      console.log("[Polls] Vote:", input.pollId, "option:", input.optionIndex, "device:", input.deviceId);

      try {
        const { error } = await supabase
          .from('poll_votes')
          .upsert(
            {
              poll_id: input.pollId,
              option_index: input.optionIndex,
              device_id: input.deviceId,
            },
            { onConflict: 'poll_id,device_id' }
          );

        if (error) console.log("[Polls] Vote error:", error.message);
      } catch (e) {
        console.log("[Polls] Vote error:", e);
      }

      return { success: true };
    }),


});

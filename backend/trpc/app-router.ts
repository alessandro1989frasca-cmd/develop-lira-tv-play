import { createTRPCRouter } from "./create-context";
import { viewsRouter } from "./routes/views";
import { pollsRouter } from "./routes/polls";
import { analyticsRouter } from "./routes/analytics";
import { programsRouter } from "./routes/programs";
import { errorsRouter } from "./routes/errors";
import { scheduleRouter } from "./routes/schedule";
import { featuredRouter } from "./routes/featured";

export const appRouter = createTRPCRouter({
  views: viewsRouter,
  polls: pollsRouter,
  analytics: analyticsRouter,
  programs: programsRouter,
  errors: errorsRouter,
  schedule: scheduleRouter,
  featured: featuredRouter,
});

export type AppRouter = typeof appRouter;

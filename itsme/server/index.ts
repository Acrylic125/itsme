import { router } from "./trpc";
import { resumesRouter } from "./resumes-route";

export const appRouter = router({
  resumes: resumesRouter,
});

// Export the router type signature (for the client), not the router itself
export type AppRouter = typeof appRouter;

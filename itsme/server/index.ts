import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { z } from "zod";
import { publicProcedure, router } from "./trpc";
import { testRouter } from "./router";

export const appRouter = router({
  test: testRouter,
});

// Export the router type signature (for the client), not the router itself
export type AppRouter = typeof appRouter;

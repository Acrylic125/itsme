import { initTRPC } from "@trpc/server";
import { cache } from "react";

export const createTRPCContext = cache(async () => {
  /**
   * @see: https://trpc.io/docs/server/context
   */
  return {};
});

// Initialization of tRPC backend - should be done only once per backend
const t = initTRPC.create();

// Reusable router and procedure helpers that can be used throughout the router
export const router = t.router;
export const publicProcedure = t.procedure;

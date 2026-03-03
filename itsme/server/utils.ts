import { createTRPCContext } from "@trpc/tanstack-react-query";
import { AppRouter } from "@/server/index";

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

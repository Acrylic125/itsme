"use client";

import { useTRPC } from "@/server/utils";
import { useQuery } from "@tanstack/react-query";

export function TestComponent() {
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.test.test.queryOptions({
      id: "1",
    })
  );
  return <div>{data?.id ?? "No data"}</div>;
}

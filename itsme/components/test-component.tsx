"use client";

import { useTRPC } from "@/server/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

export function TestComponent() {
  const trpc = useTRPC();
  //   const { data } = useQuery(
  //     trpc.test.test.queryOptions({
  //       id: "1",
  //     })
  //   );

  const [prompt, setPrompt] = useState("");

  const resp = useMutation(
    trpc.test.testAi.mutationOptions({
      onSuccess: (data) => {
        console.log(data);
      },
    })
  );
  return (
    <div>
      <button
        onClick={() => {
          resp.mutate({
            prompt: `Convert the following resume to JSON in the form, { "header": string, "points": string[] }[]: <resume>${prompt}</resume>. Only return the JSON.`,
          });
          console.log("Success");
        }}
      >
        Test
      </button>
      <textarea
        value={prompt}
        className="border border-gray-300 rounded-md p-2 w-full h-40"
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div>{resp.data?.choices[0].message.content ?? "No data"}</div>
    </div>
  );
}

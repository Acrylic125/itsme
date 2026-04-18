"use client";

import { useTRPC } from "@/server/utils";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

export function TestComponent() {
  const trpc = useTRPC();

  const [prompt, setPrompt] = useState("");

  const resp = useMutation(
    trpc.resumes.createProject.mutationOptions({
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
            resume: prompt || "Mock resume from test component",
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
      <div>{resp.data?.projectId ?? "No data"}</div>
    </div>
  );
}

import OpenAI from "openai";

export const openaiClient = new OpenAI({
  apiKey: process.env.CLOUDFLARE_TOKEN!,
  baseURL: `https://gateway.ai.cloudflare.com/v1/${process.env.CLOUDFLARE_ACCOUNT_ID}/${process.env.CLOUDFLARE_AI_GATEWAY}/compat`,
});

import { drizzle } from "drizzle-orm/d1";

const db = drizzle({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
  token: process.env.CLOUDFLARE_TOKEN!,
});

export default db;

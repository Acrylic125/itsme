// https://gist.github.com/flopex/8ba626b2dc650947882d3f45769c4702
// https://github.com/drizzle-team/drizzle-orm/issues/2086
import { drizzle } from "drizzle-orm/sqlite-proxy";
import type { AsyncRemoteCallback } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

const { CLOUDFLARE_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DATABASE_ID } =
  process.env;

const D1_API_BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${CLOUDFLARE_DATABASE_ID}`;

// Low-level HTTP driver that talks to Cloudflare D1 over its HTTP API using fetch
const d1HttpDriver = async (
  sql: string,
  params: unknown[],
  method: "all" | "run" | "get"
) => {
  const res = await fetch(`${D1_API_BASE_URL}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params, method }),
  });

  if (!res.ok) {
    throw new Error(`Error from D1 HTTP API: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    success: boolean;
    errors: unknown[];
    result: Array<{
      success: boolean;
      results: Array<Record<string, unknown>>;
    }>;
  };

  if (data.errors?.length || !data.success) {
    throw new Error(`Error from D1 HTTP API: ${JSON.stringify(data, null, 2)}`);
  }

  const qResult = data.result?.[0];

  if (!qResult?.success) {
    throw new Error(
      `Error from D1 HTTP API result: ${JSON.stringify(data, null, 2)}`
    );
  }

  // See https://orm.drizzle.team/docs/get-started-sqlite#http-proxy
  return {
    rows: qResult.results.map((row) => Object.values(row)),
  };
};

// Adapter that matches Drizzle's AsyncRemoteCallback signature, including "values"
const wrappedDriver: AsyncRemoteCallback = async (
  sql,
  params,
  method
): Promise<{ rows: unknown[][] }> => {
  if (method === "values") {
    const result = await d1HttpDriver(sql, params, "all");
    return result;
  }

  return d1HttpDriver(sql, params, method);
};

const db = drizzle(wrappedDriver, { schema });

export default db;

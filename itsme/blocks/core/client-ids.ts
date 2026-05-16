import { nanoid } from "nanoid";

export const CLIENT_ID_PREFIX = "CLIENT_ID:" as const;

export function isClientId(id: string): boolean {
  return id.startsWith(CLIENT_ID_PREFIX);
}

export function newClientBlockId(kind: string): string {
  const token = nanoid(12);
  return `${CLIENT_ID_PREFIX}${kind}-${token}`;
}

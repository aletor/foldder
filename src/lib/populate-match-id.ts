import { randomUUID } from "node:crypto";

export function newPopulateMatchId(): string {
  return `match_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

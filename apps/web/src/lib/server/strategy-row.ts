import type { Strategy } from "@/lib/strategy";
import type { StoredStrategy } from "./quota";

export function toStrategy(row: StoredStrategy): Strategy {
  return {
    ...(row.data as Omit<Strategy, "schemaVersion" | "id" | "name" | "createdAt" | "updatedAt">),
    schemaVersion: 1,
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

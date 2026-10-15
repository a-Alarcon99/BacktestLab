import { rangePresets, timeframes } from "@/lib/candles";
import { readLimitedText } from "@/lib/server/body";
import { presetStrategies } from "@/lib/preset-strategies";
import {
  conditionKinds,
  hasErrors,
  MAX_CONDITIONS,
  MAX_RULES,
  validateStrategy,
  type Rule,
  type StrategyDraft,
} from "@/lib/strategy";

// Server-side validation of a strategy sent by the client. The UI validates too, but only this
// runs where it can't be bypassed. The backtest API validates the full model again at run time.

export const MAX_BODY_BYTES = 64 * 1024;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isRule(r: unknown): r is Rule {
  if (!isObj(r) || typeof r.id !== "string" || r.id.length === 0 || r.id.length > 64) return false;
  if (r.side !== "buy" && r.side !== "sell") return false;
  if (!isObj(r.size) || (r.size.unit !== "pct" && r.size.unit !== "usdt") || typeof r.size.value !== "number")
    return false;
  return (
    Array.isArray(r.conditions) &&
    r.conditions.length >= 1 &&
    r.conditions.length <= MAX_CONDITIONS &&
    r.conditions.every((c) => isObj(c) && conditionKinds.includes(c.kind as never))
  );
}

export type ParsedDraft = { ok: true; draft: StrategyDraft } | { ok: false; errors: string[] };

export function parseStrategyDraft(body: unknown): ParsedDraft {
  const bad = (...errors: string[]): ParsedDraft => ({ ok: false, errors });
  if (!isObj(body)) return bad("Cuerpo no válido.");
  const { name, initialCapital, feePct, rules, recommendedTimeframe, recommendedRange } = body;
  if (typeof name !== "string" || name.trim().length === 0 || name.length > 80) return bad("Nombre no válido (1–80 caracteres).");
  if (typeof initialCapital !== "number" || !Number.isFinite(initialCapital)) return bad("Capital inicial no válido.");
  if (typeof feePct !== "number" || !Number.isFinite(feePct)) return bad("Comisión no válida.");
  if (!Array.isArray(rules) || rules.length > MAX_RULES || !rules.every(isRule)) return bad("Reglas no válidas.");
  if (recommendedTimeframe !== undefined && !timeframes.includes(recommendedTimeframe as never))
    return bad("Temporalidad recomendada no válida.");
  if (recommendedRange !== undefined && !rangePresets.includes(recommendedRange as never))
    return bad("Periodo recomendado no válido.");

  const draft: StrategyDraft = {
    name: name.trim(),
    initialCapital,
    feePct,
    rules: rules as Rule[],
    recommendedTimeframe: recommendedTimeframe as StrategyDraft["recommendedTimeframe"],
    recommendedRange: recommendedRange as StrategyDraft["recommendedRange"],
  };
  // Own names are enforced by the unique index; only the built-in names are checked here.
  const errors = validateStrategy(draft, presetStrategies.map((s) => s.name));
  if (hasErrors(errors)) {
    const messages = [
      errors.name,
      errors.initialCapital,
      errors.feePct,
      ...errors.general,
      ...Object.values(errors.rules).flatMap((r) => [
        r.size,
        ...r.conflicts,
        ...r.conditions.flatMap((c) => Object.values(c)),
      ]),
    ].filter((m): m is string => Boolean(m));
    return bad(...new Set(messages));
  }
  return { ok: true, draft };
}

/** Reads and parses a JSON body with a hard size cap. */
export async function readJson(request: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown | undefined> {
  const text = await readLimitedText(request, maxBytes);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

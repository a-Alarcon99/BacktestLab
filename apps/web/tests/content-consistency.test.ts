import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// Guards for facts the product states in prose (landing, docs, legal pages) against the code that
// defines them. They read the sources as text because the modules pull in `@/` aliases. When one
// fails, fix the text or derive it from the data (`timeframes.length`), do not just edit the test.

const web = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(web, path), "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

const quoted = (source: string) => [...source.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

test("el correo de contacto del titular es una dirección real, no un relleno", () => {
  const email = /operator:\s*\{[^}]*?email:\s*"([^"]*)"/.exec(read("src/config/site.ts"))?.[1];
  assert.ok(email, "no se encontró siteConfig.operator.email");
  assert.match(email, /^[^\s@[\]]+@[^\s@[\]]+\.[a-z]{2,}$/i);
});

test("la lista de temporalidades es la misma en la web y en la API", () => {
  const web = quoted(/export const timeframes = \[([^\]]*)\]/.exec(read("src/lib/candles.ts"))![1]);
  const plan = quoted(/export const TIMEFRAME_ORDER = \[([^\]]*)\]/.exec(read("src/lib/robustness-plan.ts"))![1]);
  const api = quoted(/^Timeframe = Literal\[([^\]]*)\]/m.exec(read("../api/app/services/candles.py"))![1]);
  assert.equal(web.length, new Set(web).size);
  assert.deepEqual(plan, web);
  assert.deepEqual(api, web);
});

test("ningún texto fija a mano cuántas temporalidades hay", () => {
  // The count must come from `timeframes.length`; a typed number goes stale when one is added.
  const typed = /\b(\d+|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(temporalidades|timeframes)\b/i;
  const offenders = sourceFiles(join(web, "src"))
    .filter((file) => typed.test(readFileSync(file, "utf8")))
    .map((file) => file.slice(web.length));
  assert.deepEqual(offenders, []);
});

test("la docs enumera todas las temporalidades", () => {
  const count = quoted(/export const timeframes = \[([^\]]*)\]/.exec(read("src/lib/candles.ts"))![1]).length;
  const line = /term: t\("Temporalidad", "Timeframe"\),\s*meaning: t\(\s*"([^"]+)"/.exec(read("src/components/docs/sections-basics.tsx"))?.[1];
  assert.ok(line, "no se encontró la definición de «Temporalidad» en la docs");
  // "Lo que dura cada vela: 1, 3, 5, 15 o 30 minutos; 1, 2 o 4 horas; 1 día, 1 semana o 1 mes. ..."
  const listed = line.split(". ")[0].match(/\b\d+\b/g)!.length;
  assert.equal(listed, count);
});

const words: Record<number, [string, string]> = {
  2: ["Dos", "Two"], 3: ["Tres", "Three"], 4: ["Cuatro", "Four"], 5: ["Cinco", "Five"],
  6: ["Seis", "Six"], 7: ["Siete", "Seven"], 8: ["Ocho", "Eight"], 9: ["Nueve", "Nine"], 10: ["Diez", "Ten"],
};

test("la docs dice cuántos tipos de condición hay", () => {
  const union = /export type Condition =([\s\S]*?)\n\n/.exec(read("src/lib/strategy.ts"))?.[1] ?? "";
  const kinds = new Set([...union.matchAll(/kind: "([^"]+)"/g)].map((m) => m[1]));
  assert.ok(kinds.size > 0, "no se encontró la unión de condiciones");
  const [es, en] = words[kinds.size];
  const docs = read("src/components/docs/sections-basics.tsx");
  assert.ok(docs.includes(`Hay ${es.toLowerCase()} tipos`), `la docs debería decir «Hay ${es.toLowerCase()} tipos»`);
  assert.ok(docs.includes(`There are ${en.toLowerCase()} kinds`), `docs should say “There are ${en.toLowerCase()} kinds”`);
});

test("la landing dice cuántas estrategias predefinidas hay", () => {
  const n = (read("src/lib/preset-strategies.ts").match(/id: "preset-/g) ?? []).length;
  const [es, en] = words[n];
  assert.ok(read("src/components/landing/start-free.tsx").includes(`Las ${n} estrategias predefinidas`));
  assert.ok(read("src/components/landing/start-free.tsx").includes(`The ${n} built-in strategies`));
  assert.ok(read("src/components/landing/presets-section.tsx").includes(`${es} estrategias clásicas`));
  assert.ok(en.length > 0);
});

/**
 * Whether a parsed JSON value nests deeper than `max` levels. Iterative, so a hostile body can't
 * overflow the stack here; recursive walkers that run later (`requestHash`) rely on this cap.
 */
export function exceedsDepth(value: unknown, max: number): boolean {
  const stack: [unknown, number][] = [[value, 1]];
  while (stack.length > 0) {
    const [v, depth] = stack.pop()!;
    if (v === null || typeof v !== "object") continue;
    if (depth > max) return true;
    for (const child of Object.values(v)) stack.push([child, depth + 1]);
  }
  return false;
}

/**
 * Reads a request body as text without ever buffering more than `maxBytes`: the declared
 * Content-Length is checked first, then the stream is cut off as soon as it exceeds the cap
 * (`request.text()` would buffer the whole body before any size check).
 * Returns undefined when the body is too large.
 */
export async function readLimitedText(request: Request, maxBytes: number): Promise<string | undefined> {
  const declared = request.headers.get("content-length");
  if (declared !== null && !(/^\d+$/.test(declared) && Number(declared) <= maxBytes)) return undefined;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return undefined;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

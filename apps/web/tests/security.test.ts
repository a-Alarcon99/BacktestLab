import assert from "node:assert/strict";
import { test } from "node:test";

import { exceedsDepth, readLimitedText } from "../src/lib/server/body.ts";
import { normalizeIp } from "../src/lib/server/ip.ts";
import { checkAll, perClient, sharedWait, SlidingWindowLimiter } from "../src/lib/server/rate-limit.ts";

test("limiter blocks over the limit and recovers after the window", () => {
  const l = new SlidingWindowLimiter();
  assert.equal(l.hit("a", 2, 10, 0), 0);
  assert.equal(l.hit("a", 2, 10, 1), 0);
  assert.ok(l.hit("a", 2, 10, 2) > 0);
  assert.equal(l.hit("b", 2, 10, 2), 0);
  assert.equal(l.hit("a", 2, 10, 11), 0);
});

test("limiter memory stays bounded under key churn", () => {
  const l = new SlidingWindowLimiter(100);
  for (let i = 0; i < 5000; i++) l.hit(`ip${i}`, 1, 60, i);
  assert.ok(l.size <= 100);
});

test("checkAll returns the longest wait", () => {
  const l = new SlidingWindowLimiter();
  l.hit("x", 1, 100);
  assert.ok(checkAll([["x", 1, 100], ["y", 5, 10]], l) > 0);
  assert.equal(checkAll([["z", 5, 10]], l), 0);
});

test("IPv6 addresses of one /64 share a bucket", () => {
  const a = normalizeIp("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
  const b = normalizeIp("2001:DB8:1:2::1");
  assert.equal(a, b);
  assert.notEqual(a, normalizeIp("2001:db8:1:3::1"));
});

test("IPv4, mapped IPv4 and garbage are handled", () => {
  assert.equal(normalizeIp("203.0.113.9"), "203.0.113.9");
  assert.equal(normalizeIp("::ffff:203.0.113.9"), "203.0.113.9");
  assert.equal(normalizeIp("1:2:3::4::5"), "unknown");
  assert.equal(normalizeIp("zz:zz"), "unknown");
});

const req = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://x.test/", { method: "POST", body, headers });

test("body reader accepts small bodies", async () => {
  assert.equal(await readLimitedText(req("hello"), 10), "hello");
});

test("body reader rejects oversized bodies by streamed size", async () => {
  assert.equal(await readLimitedText(req("x".repeat(100)), 10), undefined);
});

test("body reader rejects an oversized or invalid Content-Length without reading", async () => {
  const huge = new Request("http://x.test/", { method: "POST", headers: { "content-length": "99999999" } });
  assert.equal(await readLimitedText(huge, 1000), undefined);
  const bad = new Request("http://x.test/", { method: "POST", headers: { "content-length": "abc" } });
  assert.equal(await readLimitedText(bad, 1000), undefined);
});

test("perClient skips unknown addresses", () => {
  assert.deepEqual(perClient("me:ip", "unknown", 5, 60), []);
  assert.deepEqual(perClient("me:ip", "203.0.113.9", 5, 60), [["me:ip:203.0.113.9", 5, 60]]);
});

test("JSON depth cap rejects hostile nesting without overflowing the stack", () => {
  assert.equal(exceedsDepth({ a: [{ b: 1 }] }, 3), false);
  assert.equal(exceedsDepth({ a: [{ b: {} }] }, 3), true);
  const deep = JSON.parse("[".repeat(30_000) + "]".repeat(30_000));
  assert.equal(exceedsDepth(deep, 32), true);
});

const store = { url: "https://redis.test", token: "t" };

test("shared limiter sends one EVAL with namespaced keys and returns its wait", async () => {
  let sent: unknown[] = [];
  const fake = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer t");
    return Response.json({ result: 42 });
  }) as typeof fetch;
  assert.equal(await sharedWait([["a", 5, 60], ["b", 1, 0.5]], store, fake), 42);
  assert.equal(sent[0], "EVAL");
  assert.deepEqual(sent.slice(2), ["2", "bl:rl:a", "bl:rl:b", "5", "60", "1", "1"]);
});

test("shared limiter fails open when unconfigured or unreachable", async () => {
  assert.equal(await sharedWait([["a", 1, 60]], null), 0);
  const down = (async () => {
    throw new Error("unreachable");
  }) as typeof fetch;
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(await sharedWait([["a", 1, 60]], store, down), 0);
    assert.equal(await sharedWait([["a", 1, 60]], store, (async () => new Response("", { status: 500 })) as typeof fetch), 0);
  } finally {
    console.error = original;
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { readLimitedText } from "../src/lib/server/body.ts";
import { normalizeIp } from "../src/lib/server/ip.ts";
import { checkAll, SlidingWindowLimiter } from "../src/lib/server/rate-limit.ts";

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

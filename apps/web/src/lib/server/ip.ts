/**
 * Canonical bucket for an address: IPv4 as is, IPv6 reduced to its /64 prefix. A single home or
 * hosting customer typically owns a whole /64 (2^64 addresses), so keying on the full address
 * would let one client rotate through "different" IPs and reset every per-IP quota.
 */
export function normalizeIp(raw: string): string {
  const value = raw.trim().toLowerCase().replace(/%.*$/, "").replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (mapped) return mapped[1];
  if (!value.includes(":")) return value.slice(0, 45);

  const [head, tail, ...extra] = value.split("::");
  if (extra.length > 0) return "unknown";
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  if (tail === undefined && left.length !== 8) return "unknown";
  const groups = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return "unknown";
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

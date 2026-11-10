/**
 * URL fetch policy for Loop task materials / connector helpers.
 * Production default: deny localhost, link-local, and private ranges.
 * Loopback DI tests may inject a custom classifier — production must not relax.
 */
import { isIP } from "node:net";

export type UrlFetchDecision =
  | { ok: true; href: string; host: string }
  | {
      ok: false;
      code: "invalid_url" | "scheme_denied" | "ssrf_denied" | "redirect_denied";
      message: string;
    };

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
]);

function isPrivateOrLocalIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map((part) => Number(part));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return true;
    const [a, b] = parts as [number, number, number, number];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // ULA
    if (normalized.startsWith("fe80")) return true; // link-local
    if (normalized.startsWith("::ffff:")) {
      const v4 = normalized.slice("::ffff:".length);
      return isPrivateOrLocalIp(v4);
    }
    return false;
  }
  return false;
}

/**
 * Classify a candidate URL before any network I/O.
 * Does not follow redirects — callers must re-classify each Location hop.
 */
export function classifyLoopMaterialUrl(
  raw: string,
  options?: { allowHttp?: boolean },
): UrlFetchDecision {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, code: "invalid_url", message: "Invalid URL" };
  }
  const scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
  if (scheme === "https") {
    // ok
  } else if (scheme === "http" && options?.allowHttp) {
    // ok for explicit test/loopback allow
  } else {
    return {
      ok: false,
      code: "scheme_denied",
      message: `Scheme ${scheme} not allowed for material fetch`,
    };
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) {
    return { ok: false, code: "invalid_url", message: "URL missing host" };
  }
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost")) {
    return {
      ok: false,
      code: "ssrf_denied",
      message: `Host ${host} denied by SSRF policy`,
    };
  }
  if (isIP(host) && isPrivateOrLocalIp(host)) {
    return {
      ok: false,
      code: "ssrf_denied",
      message: `IP ${host} denied by SSRF policy`,
    };
  }
  // Obvious DNS rebinding bait names — still require resolve-time checks in live fetch.
  if (host === "0" || host.startsWith("0.")) {
    return {
      ok: false,
      code: "ssrf_denied",
      message: `Host ${host} denied by SSRF policy`,
    };
  }

  return { ok: true, href: parsed.toString(), host };
}

/** Re-check redirect Location; deny protocol downgrade and private hops. */
export function classifyRedirectHop(
  previous: UrlFetchDecision & { ok: true },
  locationHeader: string,
  options?: { allowHttp?: boolean },
): UrlFetchDecision {
  let next: URL;
  try {
    next = new URL(locationHeader, previous.href);
  } catch {
    return {
      ok: false,
      code: "redirect_denied",
      message: "Invalid redirect Location",
    };
  }
  const classified = classifyLoopMaterialUrl(next.toString(), options);
  if (!classified.ok) {
    return {
      ok: false,
      code: "redirect_denied",
      message: classified.message,
    };
  }
  return classified;
}

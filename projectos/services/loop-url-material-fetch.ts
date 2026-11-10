/**
 * Production URL material read (read-only) with SSRF / redirect / DNS boundaries.
 * - No cookies / auth headers by default
 * - Re-classify every redirect hop
 * - Resolve DNS and deny private/link-local/metadata answers
 * - Does not claim HTML sanitization; returns capped plaintext
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import {
  classifyLoopMaterialUrl,
  classifyRedirectHop,
  type UrlFetchDecision,
} from "./loop-url-fetch-policy.js";

export type UrlMaterialFetchResult =
  | {
      ok: true;
      finalUrl: string;
      host: string;
      status: number;
      mimeType: string | null;
      textPreview: string;
      measuredSizeBytes: number;
      truncated: boolean;
      redirectHops: number;
    }
  | {
      ok: false;
      code:
        | "invalid_url"
        | "scheme_denied"
        | "ssrf_denied"
        | "redirect_denied"
        | "dns_denied"
        | "http_error"
        | "too_large"
        | "network_error";
      message: string;
    };

export type UrlMaterialLookup = (
  hostname: string,
  options?: { all?: boolean; verbatim?: boolean; family?: number },
) => Promise<Array<{ address: string; family: number }>>;

export type UrlMaterialFetchDeps = {
  fetchImpl?: typeof fetch;
  /** DI DNS — narrower than dns.promises.lookup overloads for tests. */
  lookupFn?: UrlMaterialLookup;
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
  allowHttp?: boolean;
};

function isPrivateOrLocalIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map((part) => Number(part));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return true;
    const [a, b] = parts as [number, number, number, number];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd")) {
      return true;
    }
    if (normalized.startsWith("fe80")) return true;
    if (normalized.startsWith("::ffff:")) {
      return isPrivateOrLocalIp(normalized.slice("::ffff:".length));
    }
    return false;
  }
  return true;
}

async function assertResolvedHostPublic(
  host: string,
  lookupFn: UrlMaterialLookup,
): Promise<UrlMaterialFetchResult | null> {
  if (isIP(host)) {
    if (isPrivateOrLocalIp(host)) {
      return {
        ok: false,
        code: "dns_denied",
        message: `Resolved IP ${host} denied by SSRF policy`,
      };
    }
    return null;
  }
  try {
    const results = await lookupFn(host, { all: true, verbatim: true });
    if (!results.length) {
      return { ok: false, code: "dns_denied", message: `DNS returned no addresses for ${host}` };
    }
    for (const entry of results) {
      if (isPrivateOrLocalIp(entry.address)) {
        return {
          ok: false,
          code: "dns_denied",
          message: `DNS for ${host} resolved to private/link-local ${entry.address}`,
        };
      }
    }
  } catch (error) {
    return {
      ok: false,
      code: "dns_denied",
      message: error instanceof Error ? error.message : "DNS lookup failed",
    };
  }
  return null;
}

function toPlaintext(body: string, mime: string | null): string {
  if (mime && /html/i.test(mime)) {
    return body
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return body;
}

/**
 * Read-only fetch for URL task materials. Callers must not pass Cookie headers.
 */
export async function fetchLoopUrlMaterial(
  rawUrl: string,
  deps: UrlMaterialFetchDeps = {},
): Promise<UrlMaterialFetchResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const lookupFn: UrlMaterialLookup =
    deps.lookupFn ??
    (async (hostname, options) => {
      const result = await lookup(hostname, {
        all: true,
        verbatim: true,
        ...(options?.family != null ? { family: options.family } : {}),
      });
      return result.map((entry) => ({
        address: entry.address,
        family: entry.family,
      }));
    });
  const maxBytes = deps.maxBytes ?? 2_000_000;
  const maxRedirects = deps.maxRedirects ?? 5;
  const timeoutMs = deps.timeoutMs ?? 15_000;
  const allowHttp = deps.allowHttp === true;

  let decision: UrlFetchDecision = classifyLoopMaterialUrl(rawUrl, { allowHttp });
  if (!decision.ok) {
    return { ok: false, code: decision.code, message: decision.message };
  }

  let hops = 0;
  let current = decision;

  while (hops <= maxRedirects) {
    const dnsBlock = await assertResolvedHostPublic(current.host, lookupFn);
    if (dnsBlock) return dnsBlock;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(current.href, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/plain,text/markdown,text/csv,application/json,text/html;q=0.5,*/*;q=0.1",
          // Explicitly no Cookie / Authorization — read-only public fetch.
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          return {
            ok: false,
            code: "redirect_denied",
            message: "Redirect without Location",
          };
        }
        const next = classifyRedirectHop(current, location, { allowHttp });
        if (!next.ok) {
          return { ok: false, code: "redirect_denied", message: next.message };
        }
        hops += 1;
        if (hops > maxRedirects) {
          return {
            ok: false,
            code: "redirect_denied",
            message: `Exceeded max redirects (${maxRedirects})`,
          };
        }
        current = next;
        continue;
      }

      if (!response.ok) {
        return {
          ok: false,
          code: "http_error",
          message: `HTTP ${response.status} for ${current.host}`,
        };
      }

      const mimeType = response.headers.get("content-type");
      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.byteLength > maxBytes) {
        return {
          ok: false,
          code: "too_large",
          message: `Response ${buf.byteLength}B exceeds ${maxBytes}B cap`,
        };
      }
      const rawText = buf.toString("utf8");
      const plain = toPlaintext(rawText, mimeType);
      const truncated = plain.length > 8_000;
      return {
        ok: true,
        finalUrl: current.href,
        host: current.host,
        status: response.status,
        mimeType,
        textPreview: plain.slice(0, 8_000),
        measuredSizeBytes: buf.byteLength,
        truncated,
        redirectHops: hops,
      };
    } catch (error) {
      return {
        ok: false,
        code: "network_error",
        message: error instanceof Error ? error.message : "Network error",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    code: "redirect_denied",
    message: `Exceeded max redirects (${maxRedirects})`,
  };
}

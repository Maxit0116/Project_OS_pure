/**
 * Production URL material read (read-only) with SSRF / redirect / DNS pin boundaries.
 *
 * - http/https only; port allowlist (80/443)
 * - DNS resolve once → pin socket to chosen public address (no rebind between lookup & connect)
 * - Multi A/AAAA: pick first public address; private/metadata/IPv4-mapped private denied
 * - Redirects: re-classify + re-resolve + re-pin each hop; never forward Cookie/Authorization
 * - AbortSignal + total timeout; response body capped (wire + decoded)
 * - Login/SSO walls are NOT treated as readable documents
 * - DI fetchImpl path kept for unit tests (still DNS-gates before call)
 */
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

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
      pinnedAddress?: string;
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
        | "network_error"
        | "login_wall"
        | "cancelled"
        | "blocked_port";
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
  signal?: AbortSignal;
  /**
   * Force DI `fetchImpl` path (tests). Production default pins via http/https
   * whenever fetchImpl is the global fetch.
   */
  forceFetchImpl?: boolean;
};

const ALLOWED_PORTS = new Set([80, 443]);

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
    if (a >= 224) return true;
    return false;
  }
  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("fe80")) return true;
    if (normalized.startsWith("::ffff:")) {
      const rest = normalized.slice("::ffff:".length);
      if (isIP(rest) === 4) return isPrivateOrLocalIp(rest);
      const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(rest);
      if (hex) {
        const hi = Number.parseInt(hex[1]!, 16);
        const lo = Number.parseInt(hex[2]!, 16);
        return isPrivateOrLocalIp(
          `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`,
        );
      }
      return true;
    }
    return false;
  }
  return true;
}

function assertAllowedPort(
  url: URL,
): (UrlMaterialFetchResult & { ok: false }) | null {
  const port =
    url.port !== ""
      ? Number(url.port)
      : url.protocol === "https:"
        ? 443
        : 80;
  if (!Number.isFinite(port) || !ALLOWED_PORTS.has(port)) {
    return {
      ok: false,
      code: "blocked_port",
      message: `Port ${port} not allowed for material fetch`,
    };
  }
  return null;
}

type PinnedAddr = { address: string; family: 4 | 6 };

async function resolvePublicAddresses(
  host: string,
  lookupFn: UrlMaterialLookup,
): Promise<{ ok: true; addrs: PinnedAddr[] } | UrlMaterialFetchResult> {
  if (isIP(host)) {
    if (isPrivateOrLocalIp(host)) {
      return {
        ok: false,
        code: "dns_denied",
        message: `Resolved IP ${host} denied by SSRF policy`,
      };
    }
    return {
      ok: true,
      addrs: [{ address: host, family: isIP(host) === 6 ? 6 : 4 }],
    };
  }
  try {
    const results = await lookupFn(host, { all: true, verbatim: true });
    if (!results.length) {
      return { ok: false, code: "dns_denied", message: `DNS returned no addresses for ${host}` };
    }
    const publicAddrs: PinnedAddr[] = [];
    for (const entry of results) {
      if (isPrivateOrLocalIp(entry.address)) continue;
      publicAddrs.push({
        address: entry.address,
        family: entry.family === 6 ? 6 : 4,
      });
    }
    if (!publicAddrs.length) {
      return {
        ok: false,
        code: "dns_denied",
        message: `DNS for ${host} resolved only to private/link-local/metadata addresses`,
      };
    }
    return { ok: true, addrs: publicAddrs };
  } catch (error) {
    return {
      ok: false,
      code: "dns_denied",
      message: error instanceof Error ? error.message : "DNS lookup failed",
    };
  }
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

function looksLikeLoginWall(
  status: number,
  mime: string | null,
  body: string,
  finalUrl: string,
): boolean {
  if (status === 401 || status === 403) return true;
  const urlLower = finalUrl.toLowerCase();
  if (
    /\/(login|signin|sso|oauth|authorize)(\/|$|\?)/i.test(urlLower) ||
    /accounts\.google\.com|login\.microsoftonline\.com/i.test(urlLower)
  ) {
    return true;
  }
  if (!mime || !/html/i.test(mime)) return false;
  const sample = body.slice(0, 8_000).toLowerCase();
  const signals = [
    'type="password"',
    "name=\"password\"",
    "sign in",
    "log in",
    "sso",
    "oauth",
    "authenticate",
  ];
  return signals.filter((s) => sample.includes(s)).length >= 2;
}

function decodePossiblyCompressed(
  buf: Buffer,
  contentEncoding: string | null,
  maxDecoded: number,
): { ok: true; buf: Buffer } | { ok: false; message: string } {
  const enc = (contentEncoding ?? "").toLowerCase();
  let raw = buf;
  try {
    if (enc.includes("gzip")) raw = gunzipSync(buf);
    else if (enc.includes("br")) raw = brotliDecompressSync(buf);
    else if (enc.includes("deflate")) raw = inflateSync(buf);
  } catch (error) {
    return {
      ok: false,
      message: `Decompress failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (raw.byteLength > maxDecoded) {
    return {
      ok: false,
      message: `Decoded body ${raw.byteLength}B exceeds ${maxDecoded}B cap`,
    };
  }
  return { ok: true, buf: raw };
}

type HopOk = {
  status: number;
  headers: Headers | { get(name: string): string | null };
  body: Buffer;
  href: string;
  pinnedAddress?: string;
};

async function requestPinnedHttp(
  decision: UrlFetchDecision & { ok: true },
  pinned: PinnedAddr,
  opts: {
    maxBytes: number;
    timeoutMs: number;
    signal?: AbortSignal;
  },
): Promise<{ kind: "hop"; hop: HopOk } | { kind: "err"; err: UrlMaterialFetchResult & { ok: false } }> {
  if (opts.signal?.aborted) {
    return { kind: "err", err: { ok: false, code: "cancelled", message: "Cancelled" } };
  }
  const parsed = new URL(decision.href);
  const portBlock = assertAllowedPort(parsed);
  if (portBlock) return { kind: "err", err: portBlock };

  const port =
    parsed.port !== ""
      ? Number(parsed.port)
      : parsed.protocol === "https:"
        ? 443
        : 80;
  const lib = parsed.protocol === "https:" ? https : http;

  return await new Promise((resolve) => {
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: pinned.address,
        port,
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        headers: {
          Host: decision.host,
          Accept:
            "text/plain,text/markdown,text/csv,application/json,text/html;q=0.5,*/*;q=0.1",
          "Accept-Encoding": "gzip, deflate, br",
          "User-Agent": "ProjectOS-LoopMaterialFetch/1.0",
          Connection: "close",
          // Explicitly no Cookie / Authorization — read-only public fetch.
        },
        servername: decision.host,
        family: pinned.family,
        timeout: opts.timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const headerGet = (name: string) => {
          const v = res.headers[name.toLowerCase()];
          if (Array.isArray(v)) return v[0] ?? null;
          return v ?? null;
        };
        if ([301, 302, 303, 307, 308].includes(status)) {
          res.resume();
          resolve({
            kind: "hop",
            hop: {
              status,
              headers: { get: headerGet },
              body: Buffer.alloc(0),
              href: decision.href,
              pinnedAddress: pinned.address,
            },
          });
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        let settled = false;
        res.on("data", (chunk: Buffer) => {
          total += chunk.byteLength;
          if (total > opts.maxBytes) {
            if (!settled) {
              settled = true;
              req.destroy();
              res.destroy();
              resolve({
                kind: "err",
                err: {
                  ok: false,
                  code: "too_large",
                  message: `Response exceeds ${opts.maxBytes}B cap`,
                },
              });
            }
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          if (settled) return;
          settled = true;
          resolve({
            kind: "hop",
            hop: {
              status,
              headers: { get: headerGet },
              body: Buffer.concat(chunks),
              href: decision.href,
              pinnedAddress: pinned.address,
            },
          });
        });
        res.on("error", (error) => {
          if (settled) return;
          settled = true;
          resolve({
            kind: "err",
            err: { ok: false, code: "network_error", message: error.message },
          });
        });
      },
    );

    const onAbort = () => {
      req.destroy();
      resolve({
        kind: "err",
        err: { ok: false, code: "cancelled", message: "Cancelled" },
      });
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    req.on("timeout", () => {
      req.destroy();
      resolve({
        kind: "err",
        err: { ok: false, code: "network_error", message: "Request timed out" },
      });
    });
    req.on("error", (error) => {
      resolve({
        kind: "err",
        err: {
          ok: false,
          code: opts.signal?.aborted ? "cancelled" : "network_error",
          message: error.message,
        },
      });
    });
    req.end();
  });
}

type HopOutcome =
  | { kind: "hop"; hop: HopOk }
  | { kind: "err"; err: UrlMaterialFetchResult & { ok: false } };

async function requestViaFetchImpl(
  decision: UrlFetchDecision & { ok: true },
  fetchImpl: typeof fetch,
  opts: {
    maxBytes: number;
    timeoutMs: number;
    signal?: AbortSignal;
  },
): Promise<HopOutcome> {
  if (opts.signal?.aborted) {
    return { kind: "err", err: { ok: false, code: "cancelled", message: "Cancelled" } };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  const onParentAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onParentAbort, { once: true });
  try {
    const response = await fetchImpl(decision.href, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Accept:
          "text/plain,text/markdown,text/csv,application/json,text/html;q=0.5,*/*;q=0.1",
        // Explicitly no Cookie / Authorization — read-only public fetch.
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      return {
        kind: "hop",
        hop: {
          status: response.status,
          headers: response.headers,
          body: Buffer.alloc(0),
          href: decision.href,
        },
      };
    }
    const ab = await response.arrayBuffer();
    // Copy into a fresh Buffer — avoid SharedArrayBuffer / oversized ArrayBuffer.buffer traps
    const body = Buffer.from(new Uint8Array(ab));
    if (body.byteLength > opts.maxBytes) {
      return {
        kind: "err",
        err: {
          ok: false,
          code: "too_large",
          message: `Response ${body.byteLength}B exceeds ${opts.maxBytes}B cap`,
        },
      };
    }
    return {
      kind: "hop",
      hop: {
        status: response.status,
        headers: response.headers,
        body,
        href: decision.href,
      },
    };
  } catch (error) {
    if (opts.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      return { kind: "err", err: { ok: false, code: "cancelled", message: "Cancelled" } };
    }
    return {
      kind: "err",
      err: {
        ok: false,
        code: "network_error",
        message: error instanceof Error ? error.message : "Network error",
      },
    };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onParentAbort);
  }
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
  const signal = deps.signal;
  const usePinnedTransport =
    deps.forceFetchImpl !== true && deps.fetchImpl == null;

  let decision: UrlFetchDecision = classifyLoopMaterialUrl(rawUrl, { allowHttp });
  if (!decision.ok) {
    return { ok: false, code: decision.code, message: decision.message };
  }

  {
    const portBlock = assertAllowedPort(new URL(decision.href));
    if (portBlock) return portBlock;
  }

  let hops = 0;
  let current = decision;
  const deadline = Date.now() + timeoutMs;

  while (hops <= maxRedirects) {
    if (signal?.aborted) {
      return { ok: false, code: "cancelled", message: "Cancelled" };
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return { ok: false, code: "network_error", message: "Request timed out" };
    }

    const resolved = await resolvePublicAddresses(current.host, lookupFn);
    if (!("addrs" in resolved)) return resolved;
    const pinned = resolved.addrs[0]!;

    const hopOpts = {
      maxBytes,
      timeoutMs: remaining,
      ...(signal ? { signal } : {}),
    };
    const hopResult = usePinnedTransport
      ? await requestPinnedHttp(current, pinned, hopOpts)
      : await requestViaFetchImpl(current, fetchImpl, hopOpts);
    if (hopResult.kind === "err") return hopResult.err;
    const { hop } = hopResult;

    if ([301, 302, 303, 307, 308].includes(hop.status)) {
      const location = hop.headers.get("location");
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
      const nextPort = assertAllowedPort(new URL(next.href));
      if (nextPort) return nextPort;
      hops += 1;
      if (hops > maxRedirects) {
        return {
          ok: false,
          code: "redirect_denied",
          message: `Exceeded max redirects (${maxRedirects})`,
        };
      }
      // Cross-host: credentials must not follow (we never send them).
      current = next;
      continue;
    }

    if (hop.status < 200 || hop.status >= 300) {
      // Still detect login walls on 401/403 before generic http_error
      if (looksLikeLoginWall(hop.status, hop.headers.get("content-type"), "", hop.href)) {
        return {
          ok: false,
          code: "login_wall",
          message: "URL looks like a login/SSO wall — not treated as readable document",
        };
      }
      return {
        ok: false,
        code: "http_error",
        message: `HTTP ${hop.status} for ${current.host}`,
      };
    }

    const encoding = hop.headers.get("content-encoding");
    const decoded = decodePossiblyCompressed(hop.body, encoding, maxBytes * 2);
    if (!decoded.ok) {
      return { ok: false, code: "too_large", message: decoded.message };
    }
    const mimeType = hop.headers.get("content-type");
    const rawText = decoded.buf.toString("utf8");
    if (looksLikeLoginWall(hop.status, mimeType, rawText, hop.href)) {
      return {
        ok: false,
        code: "login_wall",
        message: "URL looks like a login/SSO wall — not treated as readable document",
      };
    }
    const plain = toPlaintext(rawText, mimeType);
    const truncated = plain.length > 8_000;
    return {
      ok: true,
      finalUrl: current.href,
      host: current.host,
      status: hop.status,
      mimeType,
      textPreview: plain.slice(0, 8_000),
      measuredSizeBytes: decoded.buf.byteLength,
      truncated,
      redirectHops: hops,
      ...(hop.pinnedAddress || usePinnedTransport
        ? { pinnedAddress: hop.pinnedAddress ?? pinned.address }
        : {}),
    };
  }

  return {
    ok: false,
    code: "redirect_denied",
    message: `Exceeded max redirects (${maxRedirects})`,
  };
}

/** Exported for unit tests / policy reuse. */
export { isPrivateOrLocalIp as isBlockedMaterialAddress };

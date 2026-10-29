import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const MCP_HTTP_TIMEOUT_MS = 30_000;
export const MCP_HTTP_MAX_BODY_BYTES = 8 * 1024 * 1024;

const METADATA_HOSTS = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

export class McpHttpGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpHttpGuardError";
  }
}

export function assertMcpHttpUrlAllowed(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new McpHttpGuardError("MCP HTTP URL is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new McpHttpGuardError("MCP HTTP URL must use http or https");
  }
  if (url.username || url.password) {
    throw new McpHttpGuardError("MCP HTTP URL must not embed credentials");
  }
  const host = url.hostname.toLowerCase();
  if (METADATA_HOSTS.has(host) || host.endsWith(".metadata.google.internal")) {
    throw new McpHttpGuardError("MCP HTTP URL targets a blocked metadata host");
  }
  const ipVersion = isIP(host);
  if (ipVersion && isBlockedIpLiteral(host)) {
    throw new McpHttpGuardError("MCP HTTP URL targets a blocked address");
  }
  return url;
}

export type McpDnsLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string }>>;

/** Resolves DNS and rejects blocked addresses (SSRF). Loopback is allowed. */
export async function assertMcpHttpHostResolvesSafely(
  url: URL,
  resolveDns: McpDnsLookup = lookup,
): Promise<void> {
  const host = url.hostname;
  if (isIP(host)) {
    if (isBlockedIpLiteral(host)) {
      throw new McpHttpGuardError("MCP HTTP URL targets a blocked address");
    }
    return;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await resolveDns(host, { all: true, verbatim: true });
  } catch (error) {
    throw new McpHttpGuardError(
      `MCP HTTP host DNS lookup failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (addresses.length === 0) {
    throw new McpHttpGuardError("MCP HTTP host DNS lookup returned no addresses");
  }
  for (const entry of addresses) {
    if (isBlockedIpLiteral(entry.address)) {
      throw new McpHttpGuardError(
        `MCP HTTP host resolves to a blocked address (${entry.address})`,
      );
    }
  }
}

export function createMcpGuardedFetch(baseFetch: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = assertMcpHttpUrlAllowed(rawUrl);
    await assertMcpHttpHostResolvesSafely(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MCP_HTTP_TIMEOUT_MS);
    const parentSignal = init?.signal;
    const onAbort = () => controller.abort();
    parentSignal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await baseFetch(url.href, {
        ...init,
        redirect: "error",
        signal: controller.signal,
      });
      const lengthHeader = response.headers.get("content-length");
      if (lengthHeader) {
        const length = Number(lengthHeader);
        if (Number.isFinite(length) && length > MCP_HTTP_MAX_BODY_BYTES) {
          throw new McpHttpGuardError(
            `MCP HTTP response exceeds ${MCP_HTTP_MAX_BODY_BYTES} byte limit`,
          );
        }
      }
      return response;
    } finally {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", onAbort);
    }
  };
}

function isBlockedIpLiteral(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return false;
  if (normalized === "127.0.0.1" || normalized.startsWith("127.")) return false;

  if (normalized === "0.0.0.0" || normalized === "::" || normalized === "0:0:0:0:0:0:0:0") {
    return true;
  }

  // Link-local / cloud metadata (includes 169.254.169.254).
  if (normalized.startsWith("169.254.")) return true;
  if (normalized.startsWith("fe80:")) return true;

  // Non-loopback private / unique-local (desktop HTTP MCP should use public or loopback).
  if (normalized.startsWith("10.")) return true;
  if (normalized.startsWith("192.168.")) return true;
  const match172 = /^172\.(\d+)\./u.exec(normalized);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    // Unique local IPv6 fc00::/7
    if (/^f[cd][0-9a-f]{0,2}:/u.test(normalized)) return true;
  }
  return false;
}

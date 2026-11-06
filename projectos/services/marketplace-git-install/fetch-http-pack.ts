import { createMcpGuardedFetch } from "../mcp/mcp-http-guard.js";
import { MarketplaceGitUrlError } from "./parse-git-url.js";
import {
  parseCapabilityPackJson,
  type CapabilityPackEnvelope,
} from "./resolve-capability-pack.js";

const MAX_PACK_BYTES = 512 * 1024;

/**
 * True when the URL looks like a direct Capability Pack JSON download
 * (not a git repo root). Used after git parse fails or for non-GitHub hosts.
 */
export function looksLikeHttpPackJsonUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const path = url.pathname.toLowerCase();
    return path.endsWith(".json");
  } catch {
    return false;
  }
}

export async function fetchCapabilityPackFromHttpUrl(input: {
  url: string;
  fetchImpl?: typeof fetch;
}): Promise<{ envelope: CapabilityPackEnvelope; sourceUrl: string }> {
  const guarded = createMcpGuardedFetch(input.fetchImpl ?? fetch);
  let response: Response;
  try {
    response = await guarded(input.url.trim(), {
      method: "GET",
      headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.1" },
    });
  } catch (error) {
    throw new MarketplaceGitUrlError(
      error instanceof Error ? error.message : "Failed to fetch pack URL",
    );
  }
  if (!response.ok) {
    throw new MarketplaceGitUrlError(
      `Pack URL returned HTTP ${response.status}`,
    );
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_PACK_BYTES) {
    throw new MarketplaceGitUrlError(
      `Pack JSON exceeds ${MAX_PACK_BYTES} byte limit`,
    );
  }
  const text = new TextDecoder("utf-8").decode(buffer);
  const envelope = parseCapabilityPackJson(text);
  return { envelope, sourceUrl: input.url.trim() };
}

import {
  MCP_CATALOG_DEFAULT_URL,
  McpCatalogDocumentSchema,
  type McpCatalogDocument,
  type McpCatalogSourceKind,
  type McpCatalogView,
} from "../../contracts/mcp-catalog.js";
import {
  assertMcpHttpUrlAllowed,
  createMcpGuardedFetch,
  McpHttpGuardError,
} from "../mcp/mcp-http-guard.js";
import {
  readBundledCatalogBody,
  readBundledCatalogPublicKey,
  readBundledCatalogSignature,
} from "./bundled-assets.js";
import {
  defaultMcpCatalogCachePath,
  McpCatalogDiskCache,
  type McpCatalogCacheRecord,
} from "./cache.js";
import {
  McpCatalogSignatureError,
  verifyMcpCatalogSignature,
} from "./verify.js";

export const MCP_CATALOG_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export class McpCatalogClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpCatalogClientError";
  }
}

export type McpCatalogClientOptions = {
  cacheRoot: string;
  publicKeySpkiBase64?: string;
  defaultCatalogUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Injectable bundled reader for tests. */
  readBundled?: () => { bodyUtf8: string; signatureBase64: string };
};

function parseAndVerify(input: {
  bodyUtf8: string;
  signatureBase64: string;
  publicKeySpkiBase64: string;
}): McpCatalogDocument {
  verifyMcpCatalogSignature({
    bodyUtf8: input.bodyUtf8,
    signatureBase64: input.signatureBase64,
    publicKeySpkiBase64: input.publicKeySpkiBase64,
  });
  let json: unknown;
  try {
    json = JSON.parse(input.bodyUtf8);
  } catch (error) {
    throw new McpCatalogClientError(
      `Catalog JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = McpCatalogDocumentSchema.safeParse(json);
  if (!parsed.success) {
    throw new McpCatalogClientError(
      `Catalog schema invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    );
  }
  return parsed.data;
}

function viewFrom(
  document: McpCatalogDocument,
  source: McpCatalogSourceKind,
  catalogUrl: string | undefined,
  fetchedAt: string,
): McpCatalogView {
  return {
    document,
    source,
    fetchedAt,
    ...(catalogUrl ? { catalogUrl } : {}),
  };
}

export class McpCatalogClient {
  private readonly cache: McpCatalogDiskCache;
  private readonly publicKeySpkiBase64: string;
  private readonly defaultCatalogUrl: string;
  private readonly guardedFetch: typeof fetch;
  private readonly now: () => number;
  private readonly readBundled: () => { bodyUtf8: string; signatureBase64: string };

  constructor(options: McpCatalogClientOptions) {
    this.cache = new McpCatalogDiskCache(defaultMcpCatalogCachePath(options.cacheRoot));
    this.publicKeySpkiBase64 =
      options.publicKeySpkiBase64 ?? readBundledCatalogPublicKey();
    this.defaultCatalogUrl = options.defaultCatalogUrl ?? MCP_CATALOG_DEFAULT_URL;
    this.guardedFetch = createMcpGuardedFetch(options.fetchImpl ?? fetch);
    this.now = options.now ?? Date.now;
    this.readBundled =
      options.readBundled ??
      (() => ({
        bodyUtf8: readBundledCatalogBody(),
        signatureBase64: readBundledCatalogSignature(),
      }));
  }

  loadBundled(): McpCatalogView {
    const bundled = this.readBundled();
    const document = parseAndVerify({
      bodyUtf8: bundled.bodyUtf8,
      signatureBase64: bundled.signatureBase64,
      publicKeySpkiBase64: this.publicKeySpkiBase64,
    });
    return viewFrom(document, "bundled", undefined, new Date(this.now()).toISOString());
  }

  async getCatalog(input?: {
    catalogUrl?: string;
    forceRefresh?: boolean;
  }): Promise<McpCatalogView> {
    const catalogUrl = input?.catalogUrl?.trim() || this.defaultCatalogUrl;
    const forceRefresh = input?.forceRefresh === true;

    if (!forceRefresh) {
      const cached = await this.readValidCache(catalogUrl);
      if (cached && this.isFresh(cached.fetchedAt)) {
        return cached.view;
      }
    }

    try {
      return await this.fetchRemote(catalogUrl);
    } catch (remoteError) {
      const cached = await this.readValidCache(catalogUrl);
      if (cached) {
        return cached.view;
      }
      try {
        return this.loadBundled();
      } catch {
        throw remoteError instanceof Error
          ? remoteError
          : new McpCatalogClientError(String(remoteError));
      }
    }
  }

  private isFresh(fetchedAt: string): boolean {
    const ts = Date.parse(fetchedAt);
    if (!Number.isFinite(ts)) return false;
    return this.now() - ts <= MCP_CATALOG_CACHE_TTL_MS;
  }

  private async readValidCache(
    catalogUrl: string,
  ): Promise<{ view: McpCatalogView; fetchedAt: string } | null> {
    const record = await this.cache.read();
    if (!record || record.catalogUrl !== catalogUrl) return null;
    try {
      const document = parseAndVerify({
        bodyUtf8: record.bodyUtf8,
        signatureBase64: record.signatureBase64,
        publicKeySpkiBase64: this.publicKeySpkiBase64,
      });
      return {
        fetchedAt: record.fetchedAt,
        view: viewFrom(document, "cache", catalogUrl, record.fetchedAt),
      };
    } catch {
      // Poisoned or tampered cache must not be served.
      return null;
    }
  }

  private async fetchRemote(catalogUrl: string): Promise<McpCatalogView> {
    assertMcpHttpUrlAllowed(catalogUrl);
    const catalogResponse = await this.guardedFetch(catalogUrl);
    if (!catalogResponse.ok) {
      throw new McpCatalogClientError(
        `Catalog fetch failed with HTTP ${catalogResponse.status}`,
      );
    }
    const bodyUtf8 = await catalogResponse.text();
    // Sibling signature: `.../catalog.json` → `.../catalog.json.sig`
    const sigUrl = catalogUrl.endsWith(".json")
      ? `${catalogUrl}.sig`
      : `${catalogUrl.replace(/\/?$/u, "")}/catalog.json.sig`;
    let signatureBase64: string;
    try {
      assertMcpHttpUrlAllowed(sigUrl);
      const sigResponse = await this.guardedFetch(sigUrl);
      if (!sigResponse.ok) {
        throw new McpCatalogClientError(
          `Catalog signature fetch failed with HTTP ${sigResponse.status}`,
        );
      }
      signatureBase64 = (await sigResponse.text()).trim();
    } catch (error) {
      if (
        error instanceof McpHttpGuardError ||
        error instanceof McpCatalogClientError ||
        error instanceof McpCatalogSignatureError
      ) {
        throw error;
      }
      throw new McpCatalogClientError(
        `Catalog signature fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const document = parseAndVerify({
      bodyUtf8,
      signatureBase64,
      publicKeySpkiBase64: this.publicKeySpkiBase64,
    });
    const fetchedAt = new Date(this.now()).toISOString();
    const record: McpCatalogCacheRecord = {
      bodyUtf8,
      signatureBase64,
      fetchedAt,
      catalogUrl,
    };
    await this.cache.write(record).catch(() => undefined);
    return viewFrom(document, "remote", catalogUrl, fetchedAt);
  }
}

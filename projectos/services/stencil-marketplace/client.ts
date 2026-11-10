import {
  STENCIL_CATALOG_DEFAULT_URL,
  StencilCatalogDocumentSchema,
  type StencilCatalogDocument,
  type StencilCatalogSourceKind,
  type StencilCatalogView,
} from "../../contracts/stencil-marketplace.js";
import {
  assertMcpHttpUrlAllowed,
  createMcpGuardedFetch,
  type McpDnsLookup,
  McpHttpGuardError,
} from "../mcp/mcp-http-guard.js";
import {
  McpCatalogSignatureError,
  verifyMcpCatalogSignature,
} from "../mcp-catalog/verify.js";
import {
  readBundledStencilCatalogBody,
  readBundledStencilCatalogPublicKey,
  readBundledStencilCatalogSignature,
} from "./bundled-assets.js";
import {
  defaultStencilCatalogCachePath,
  StencilCatalogDiskCache,
  type StencilCatalogCacheRecord,
} from "./cache.js";

export const STENCIL_CATALOG_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export class StencilCatalogClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StencilCatalogClientError";
  }
}

export type StencilCatalogClientOptions = {
  cacheRoot: string;
  publicKeySpkiBase64?: string;
  defaultCatalogUrl?: string;
  fetchImpl?: typeof fetch;
  /** Address lookup for the URL guard; the real DNS lookup unless a test supplies one. */
  resolveDns?: McpDnsLookup;
  now?: () => number;
  readBundled?: () => { bodyUtf8: string; signatureBase64: string };
};

function parseAndVerify(input: {
  bodyUtf8: string;
  signatureBase64: string;
  publicKeySpkiBase64: string;
}): StencilCatalogDocument {
  verifyMcpCatalogSignature({
    bodyUtf8: input.bodyUtf8,
    signatureBase64: input.signatureBase64,
    publicKeySpkiBase64: input.publicKeySpkiBase64,
  });
  let json: unknown;
  try {
    json = JSON.parse(input.bodyUtf8);
  } catch (error) {
    throw new StencilCatalogClientError(
      `Stencil catalog JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = StencilCatalogDocumentSchema.safeParse(json);
  if (!parsed.success) {
    throw new StencilCatalogClientError(
      `Stencil catalog schema invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    );
  }
  return parsed.data;
}

function viewFrom(
  document: StencilCatalogDocument,
  source: StencilCatalogSourceKind,
  catalogUrl: string | undefined,
  fetchedAt: string,
): StencilCatalogView {
  return {
    document,
    source,
    fetchedAt,
    ...(catalogUrl ? { catalogUrl } : {}),
  };
}

export class StencilCatalogClient {
  private readonly cache: StencilCatalogDiskCache;
  private readonly publicKeySpkiBase64: string;
  private readonly defaultCatalogUrl: string;
  private readonly guardedFetch: typeof fetch;
  private readonly now: () => number;
  private readonly readBundled: () => { bodyUtf8: string; signatureBase64: string };

  constructor(options: StencilCatalogClientOptions) {
    this.cache = new StencilCatalogDiskCache(
      defaultStencilCatalogCachePath(options.cacheRoot),
    );
    this.publicKeySpkiBase64 =
      options.publicKeySpkiBase64 ?? readBundledStencilCatalogPublicKey();
    this.defaultCatalogUrl = options.defaultCatalogUrl ?? STENCIL_CATALOG_DEFAULT_URL;
    this.guardedFetch = createMcpGuardedFetch(options.fetchImpl ?? fetch, options.resolveDns);
    this.now = options.now ?? Date.now;
    this.readBundled =
      options.readBundled ??
      (() => ({
        bodyUtf8: readBundledStencilCatalogBody(),
        signatureBase64: readBundledStencilCatalogSignature(),
      }));
  }

  loadBundled(): StencilCatalogView {
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
  }): Promise<StencilCatalogView> {
    const catalogUrl = input?.catalogUrl?.trim() || this.defaultCatalogUrl;
    const forceRefresh = input?.forceRefresh === true;

    if (!forceRefresh) {
      const cached = await this.readValidCache(catalogUrl);
      if (cached && this.isFresh(cached.fetchedAt)) {
        return cached.view;
      }
      if (cached) {
        // Stale-while-revalidate: serve immediately and warm disk cache in background.
        void this.fetchRemote(catalogUrl).catch(() => undefined);
        return cached.view;
      }
      // Cold start: serve bundled immediately. Callers may forceRefresh in background.
      return this.loadBundled();
    }

    try {
      return await this.fetchRemote(catalogUrl);
    } catch (remoteError) {
      const cached = await this.readValidCache(catalogUrl);
      if (cached) return cached.view;
      try {
        return this.loadBundled();
      } catch {
        throw remoteError instanceof Error
          ? remoteError
          : new StencilCatalogClientError(String(remoteError));
      }
    }
  }

  private isFresh(fetchedAt: string): boolean {
    const ts = Date.parse(fetchedAt);
    if (!Number.isFinite(ts)) return false;
    return this.now() - ts <= STENCIL_CATALOG_CACHE_TTL_MS;
  }

  private async readValidCache(
    catalogUrl: string,
  ): Promise<{ view: StencilCatalogView; fetchedAt: string } | null> {
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
      return null;
    }
  }

  private async fetchRemote(catalogUrl: string): Promise<StencilCatalogView> {
    assertMcpHttpUrlAllowed(catalogUrl);
    const catalogResponse = await this.guardedFetch(catalogUrl);
    if (!catalogResponse.ok) {
      throw new StencilCatalogClientError(
        `Stencil catalog fetch failed with HTTP ${catalogResponse.status}`,
      );
    }
    const bodyUtf8 = await catalogResponse.text();
    const sigUrl = catalogUrl.endsWith(".json")
      ? `${catalogUrl}.sig`
      : `${catalogUrl.replace(/\/?$/u, "")}/catalog.json.sig`;
    let signatureBase64: string;
    try {
      assertMcpHttpUrlAllowed(sigUrl);
      const sigResponse = await this.guardedFetch(sigUrl);
      if (!sigResponse.ok) {
        throw new StencilCatalogClientError(
          `Stencil catalog signature fetch failed with HTTP ${sigResponse.status}`,
        );
      }
      signatureBase64 = (await sigResponse.text()).trim();
    } catch (error) {
      if (
        error instanceof McpHttpGuardError ||
        error instanceof StencilCatalogClientError ||
        error instanceof McpCatalogSignatureError
      ) {
        throw error;
      }
      throw new StencilCatalogClientError(
        `Stencil catalog signature fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const document = parseAndVerify({
      bodyUtf8,
      signatureBase64,
      publicKeySpkiBase64: this.publicKeySpkiBase64,
    });
    const fetchedAt = new Date(this.now()).toISOString();
    const record: StencilCatalogCacheRecord = {
      bodyUtf8,
      signatureBase64,
      fetchedAt,
      catalogUrl,
    };
    await this.cache.write(record).catch(() => undefined);
    return viewFrom(document, "remote", catalogUrl, fetchedAt);
  }
}

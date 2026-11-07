import type { ParsedMarketplaceGitUrl } from "./parse-git-url.js";
import { MarketplaceGitUrlError } from "./parse-git-url.js";

export type GithubFileContent = {
  path: string;
  content: string;
  sha?: string;
};

type GithubContentsResponse = {
  type?: string;
  path?: string;
  sha?: string;
  encoding?: string;
  content?: string;
  download_url?: string | null;
  name?: string;
};

type GithubTreeEntry = {
  path?: string;
  type?: string;
  sha?: string;
};

type GithubRepoResponse = {
  default_branch?: string;
};

export type GithubContentsClientOptions = {
  accessToken?: string;
  fetchImpl?: typeof fetch;
};

/**
 * Read public or private GitHub repo files via the Contents / Git Trees API.
 * Private repos require a GitHub OAuth token from the session manager.
 */
export class GithubContentsClient {
  private readonly accessToken: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GithubContentsClientOptions = {}) {
    this.accessToken = options.accessToken?.trim() || undefined;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getDefaultBranch(parsed: ParsedMarketplaceGitUrl): Promise<string> {
    const response = await this.api(
      `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`,
    );
    if (response.status === 404) {
      throw new MarketplaceGitUrlError(
        this.accessToken
          ? "Repository not found (or token lacks access)"
          : "Repository not found — sign in to GitHub for private repos",
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new MarketplaceGitUrlError(
        "GitHub authentication required for this repository. Connect GitHub in Settings.",
      );
    }
    if (!response.ok) {
      throw new MarketplaceGitUrlError(
        `GitHub API failed (${response.status}) while reading repository metadata`,
      );
    }
    const body = (await response.json()) as GithubRepoResponse;
    return body.default_branch?.trim() || "main";
  }

  async getFile(
    parsed: ParsedMarketplaceGitUrl,
    path: string,
    ref?: string,
  ): Promise<GithubFileContent | null> {
    const cleanPath = path.replace(/^\/+/u, "");
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const response = await this.api(
      `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/contents/${cleanPath
        .split("/")
        .map(encodeURIComponent)
        .join("/")}${query}`,
    );
    if (response.status === 404) return null;
    if (response.status === 401 || response.status === 403) {
      throw new MarketplaceGitUrlError(
        "GitHub authentication required for this repository. Connect GitHub in Settings.",
      );
    }
    if (!response.ok) {
      throw new MarketplaceGitUrlError(
        `GitHub API failed (${response.status}) while reading ${cleanPath}`,
      );
    }
    const body = (await response.json()) as GithubContentsResponse | GithubContentsResponse[];
    if (Array.isArray(body)) return null;
    if (body.type !== "file" || typeof body.content !== "string") {
      return null;
    }
    const encoding = body.encoding ?? "base64";
    const content =
      encoding === "base64"
        ? Buffer.from(body.content.replace(/\n/gu, ""), "base64").toString("utf8")
        : body.content;
    return {
      path: body.path ?? cleanPath,
      content,
      ...(body.sha ? { sha: body.sha } : {}),
    };
  }

  async listRecursivePaths(
    parsed: ParsedMarketplaceGitUrl,
    ref: string,
  ): Promise<string[]> {
    const response = await this.api(
      `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    );
    if (response.status === 404) {
      throw new MarketplaceGitUrlError("Could not list repository tree for that ref");
    }
    if (response.status === 401 || response.status === 403) {
      throw new MarketplaceGitUrlError(
        "GitHub authentication required for this repository. Connect GitHub in Settings.",
      );
    }
    if (!response.ok) {
      throw new MarketplaceGitUrlError(
        `GitHub API failed (${response.status}) while listing repository tree`,
      );
    }
    const body = (await response.json()) as { tree?: GithubTreeEntry[] };
    const paths: string[] = [];
    for (const entry of body.tree ?? []) {
      if (entry.type === "blob" && entry.path) paths.push(entry.path);
    }
    return paths;
  }

  private async api(path: string): Promise<Response> {
    const headers = new Headers({
      Accept: "application/vnd.github+json",
      "User-Agent": "ProjectOS",
      "X-GitHub-Api-Version": "2022-11-28",
    });
    if (this.accessToken) {
      headers.set("Authorization", `Bearer ${this.accessToken}`);
    }
    return this.fetchImpl(`https://api.github.com${path}`, {
      method: "GET",
      headers,
    });
  }
}

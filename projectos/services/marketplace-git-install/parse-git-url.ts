export type ParsedMarketplaceGitUrl = {
  /** Normalized https clone URL (no credentials). */
  httpsUrl: string;
  host: string;
  owner: string;
  repo: string;
  /** Branch, tag, or commit when present in the URL. */
  ref?: string;
  /** Path inside the repo (no leading slash), may point at a file or directory. */
  subpath?: string;
  isGithub: boolean;
};

export class MarketplaceGitUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketplaceGitUrlError";
  }
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

/**
 * Parse a GitHub / git URL used for marketplace install-from-URL.
 * Accepts https, git@, and github.com tree/blob deep links.
 */
export function parseMarketplaceGitUrl(raw: string): ParsedMarketplaceGitUrl {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2_048) {
    throw new MarketplaceGitUrlError("Repository URL is required");
  }
  if (/[\s"'`$\\]/.test(trimmed)) {
    throw new MarketplaceGitUrlError("Repository URL contains invalid characters");
  }

  const ssh = trimmed.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/i);
  if (ssh?.[1] && ssh[2] && ssh[3]) {
    const host = ssh[1].toLowerCase();
    assertHostAllowed(host);
    const owner = ssh[2];
    const repo = ssh[3].replace(/\.git$/i, "");
    return {
      httpsUrl: `https://${host}/${owner}/${repo}.git`,
      host,
      owner,
      repo,
      isGithub: host === "github.com" || host.endsWith(".github.com"),
    };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new MarketplaceGitUrlError("Repository URL is not a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new MarketplaceGitUrlError("Repository URL must use http(s) or git@");
  }
  if (url.username || url.password) {
    throw new MarketplaceGitUrlError("Repository URL must not embed credentials");
  }

  const host = url.hostname.toLowerCase();
  assertHostAllowed(host);

  const segments = url.pathname
    .replace(/\/$/u, "")
    .split("/")
    .filter(Boolean)
    .map((s) => decodeURIComponent(s));

  if (segments.length < 2) {
    throw new MarketplaceGitUrlError("Repository URL must include owner and repo");
  }

  const owner = segments[0]!;
  let repo = segments[1]!.replace(/\.git$/i, "");
  let ref: string | undefined;
  let subpath: string | undefined;

  // github.com/owner/repo/tree|blob/<ref>/<path...>
  if (
    (host === "github.com" || host.endsWith(".github.com")) &&
    segments.length >= 4 &&
    (segments[2] === "tree" || segments[2] === "blob")
  ) {
    ref = segments[3];
    if (segments.length > 4) {
      subpath = segments.slice(4).join("/");
    }
  } else if (segments.length > 2) {
    // Non-github or uncommon path — treat remainder as subpath hint.
    subpath = segments.slice(2).join("/");
  }

  const isGithub = host === "github.com" || host.endsWith(".github.com");
  return {
    httpsUrl: `https://${host}/${owner}/${repo}.git`,
    host,
    owner,
    repo,
    ...(ref ? { ref } : {}),
    ...(subpath ? { subpath } : {}),
    isGithub,
  };
}

function assertHostAllowed(host: string): void {
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".metadata.google.internal")) {
    throw new MarketplaceGitUrlError("Repository host is not allowed");
  }
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.)/u.test(host)) {
    throw new MarketplaceGitUrlError("Repository host is not allowed");
  }
}

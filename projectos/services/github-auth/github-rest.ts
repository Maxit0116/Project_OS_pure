export interface RestListedPullRequest {
  number: number;
  title: string;
  url: string;
  headRef: string;
  baseRef: string;
  state: "open" | "closed" | "merged";
}

export function parseGithubOwnerRepo(
  remoteUrl: string | undefined,
): { owner: string; repo: string } | undefined {
  if (!remoteUrl) return undefined;
  const trimmed = remoteUrl.trim().replace(/\.git$/i, "");
  const ssh = trimmed.match(/^git@github\.com:([^/]+)\/(.+)$/i);
  if (ssh?.[1] && ssh[2]) {
    return { owner: ssh[1], repo: ssh[2] };
  }
  const https = trimmed.match(
    /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/#?]+)$/i,
  );
  if (https?.[1] && https[2]) {
    return { owner: https[1], repo: https[2] };
  }
  return undefined;
}

async function githubApiFetch(
  path: string,
  accessToken: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("User-Agent", "ProjectOS");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  return fetchImpl(`https://api.github.com${path}`, { ...init, headers });
}

export async function listBranchesViaRest(
  owner: string,
  repo: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{
  available: boolean;
  branches: string[];
  message?: string;
}> {
  const names: string[] = [];
  let page = 1;
  while (page <= 10) {
    const response = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100&page=${page}`,
      accessToken,
      { method: "GET" },
      fetchImpl,
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        available: false,
        branches: names,
        message: `GitHub API branch list failed (${response.status}): ${body.slice(0, 200) || response.statusText}`,
      };
    }
    const raw = (await response.json()) as Array<{ name?: string }>;
    for (const item of raw) {
      const name = item.name?.trim();
      if (name) names.push(name);
    }
    if (raw.length < 100) break;
    page += 1;
  }
  return { available: true, branches: names };
}

export async function listPullRequestsViaRest(
  owner: string,
  repo: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{
  available: boolean;
  pullRequests: RestListedPullRequest[];
  message?: string;
}> {
  const response = await githubApiFetch(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&per_page=50`,
    accessToken,
    { method: "GET" },
    fetchImpl,
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      available: false,
      pullRequests: [],
      message: `GitHub API PR list failed (${response.status}): ${body.slice(0, 200) || response.statusText}`,
    };
  }
  const raw = (await response.json()) as Array<{
    number: number;
    title: string;
    html_url: string;
    head?: { ref?: string };
    base?: { ref?: string };
    state?: string;
    merged_at?: string | null;
  }>;
  return {
    available: true,
    pullRequests: raw.map((item) => ({
      number: item.number,
      title: item.title,
      url: item.html_url,
      headRef: item.head?.ref ?? "unknown",
      baseRef: item.base?.ref ?? "unknown",
      state: "open" as const,
    })),
  };
}

export async function createPullRequestViaRest(
  owner: string,
  repo: string,
  accessToken: string,
  input: { title: string; head: string; base: string; body?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; url?: string; number?: number; message: string }> {
  const response = await githubApiFetch(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
    accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        head: input.head,
        base: input.base,
        ...(input.body ? { body: input.body } : {}),
      }),
    },
    fetchImpl,
  );
  const json = (await response.json().catch(() => ({}))) as {
    html_url?: string;
    number?: number;
    message?: string;
    errors?: Array<{ message?: string }>;
  };
  if (!response.ok) {
    const detail =
      json.message ||
      json.errors?.map((e) => e.message).filter(Boolean).join("; ") ||
      response.statusText;
    return {
      ok: false,
      message: `GitHub API PR create failed (${response.status}): ${detail}`,
    };
  }
  return {
    ok: true,
    ...(json.html_url ? { url: json.html_url } : {}),
    ...(typeof json.number === "number" ? { number: json.number } : {}),
    message: json.html_url ? `Created ${json.html_url}` : "Pull request created.",
  };
}

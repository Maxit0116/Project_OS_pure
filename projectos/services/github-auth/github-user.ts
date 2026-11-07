export interface GitHubUserProfile {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  email: string | null;
}

interface GitHubUserJson {
  login?: string;
  name?: string | null;
  avatar_url?: string | null;
  email?: string | null;
}

export async function fetchGitHubUserProfile(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubUserProfile> {
  const response = await fetchImpl("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "ProjectOS",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `GitHub /user failed (${response.status}): ${body.slice(0, 200) || response.statusText}`,
    );
  }
  const json = (await response.json()) as GitHubUserJson;
  const login = json.login?.trim();
  if (!login) {
    throw new Error("GitHub /user response missing login");
  }
  return {
    login,
    name: json.name?.trim() || null,
    avatarUrl: json.avatar_url?.trim() || null,
    email: json.email?.trim() || null,
  };
}

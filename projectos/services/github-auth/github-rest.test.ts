import { describe, expect, it, vi } from "vitest";

import {
  createPullRequestViaRest,
  listPullRequestsViaRest,
  parseGithubOwnerRepo,
} from "./github-rest.js";

describe("github-rest", () => {
  it("parses owner/repo from ssh and https remotes", () => {
    expect(parseGithubOwnerRepo("git@github.com:acme/app.git")).toEqual({
      owner: "acme",
      repo: "app",
    });
    expect(parseGithubOwnerRepo("https://github.com/acme/app")).toEqual({
      owner: "acme",
      repo: "app",
    });
    expect(parseGithubOwnerRepo("https://gitlab.com/acme/app")).toBeUndefined();
  });

  it("lists pull requests via REST with bearer token", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json([
        {
          number: 7,
          title: "Fix login",
          html_url: "https://github.com/acme/app/pull/7",
          head: { ref: "fix/login" },
          base: { ref: "main" },
          state: "open",
        },
      ]),
    );
    const result = await listPullRequestsViaRest(
      "acme",
      "app",
      "tok",
      fetchImpl as typeof fetch,
    );
    expect(result.available).toBe(true);
    expect(result.pullRequests[0]?.number).toBe(7);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const firstUrl = String(fetchImpl.mock.calls.at(0)?.at(0) ?? "");
    expect(firstUrl).toContain("/repos/acme/app/pulls");
  });

  it("creates a pull request via REST", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        number: 9,
        html_url: "https://github.com/acme/app/pull/9",
      }),
    );
    const result = await createPullRequestViaRest(
      "acme",
      "app",
      "tok",
      { title: "Ship", head: "feat", base: "main" },
      fetchImpl as typeof fetch,
    );
    expect(result.ok).toBe(true);
    expect(result.number).toBe(9);
  });
});

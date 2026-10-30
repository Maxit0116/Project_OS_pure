import { describe, expect, it, vi } from "vitest";

import {
  createIssueViaRest,
  createPullRequestViaRest,
  listBranchesViaRest,
  listCommitCheckRunsViaRest,
  listIssuesViaRest,
  listPullRequestsViaRest,
  mergePullRequestViaRest,
  parseGithubOwnerRepo,
  updatePullRequestViaRest,
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

  it("lists branches via REST", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json([{ name: "main" }, { name: "backend" }, { name: "frontend" }]),
    );
    const result = await listBranchesViaRest(
      "acme",
      "app",
      "tok",
      fetchImpl as typeof fetch,
    );
    expect(result.available).toBe(true);
    expect(result.branches).toEqual(["main", "backend", "frontend"]);
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

  it("merges a pull request via REST", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        merged: true,
        sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        message: "Pull Request successfully merged",
      }),
    );
    const result = await mergePullRequestViaRest(
      "acme",
      "app",
      "tok",
      9,
      { mergeMethod: "squash" },
      fetchImpl as typeof fetch,
    );
    expect(result.ok).toBe(true);
    expect(result.sha).toMatch(/^a+/);
    expect(String(fetchImpl.mock.calls.at(0)?.at(0))).toContain("/merge");
  });

  it("closes a pull request via REST", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        html_url: "https://github.com/acme/app/pull/9",
      }),
    );
    const result = await updatePullRequestViaRest(
      "acme",
      "app",
      "tok",
      9,
      { state: "closed" },
      fetchImpl as typeof fetch,
    );
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/Closed/i);
  });

  it("lists and creates issues via REST", async () => {
    const listFetch = vi.fn(async () =>
      Response.json([
        {
          number: 3,
          title: "Bug",
          html_url: "https://github.com/acme/app/issues/3",
          state: "open",
        },
        {
          number: 4,
          title: "PR as issue",
          html_url: "https://github.com/acme/app/pull/4",
          state: "open",
          pull_request: {},
        },
      ]),
    );
    const listed = await listIssuesViaRest(
      "acme",
      "app",
      "tok",
      listFetch as typeof fetch,
    );
    expect(listed.issues).toHaveLength(1);
    expect(listed.issues[0]?.number).toBe(3);

    const createFetch = vi.fn(async () =>
      Response.json({
        number: 11,
        html_url: "https://github.com/acme/app/issues/11",
      }),
    );
    const created = await createIssueViaRest(
      "acme",
      "app",
      "tok",
      { title: "New" },
      createFetch as typeof fetch,
    );
    expect(created.ok).toBe(true);
    expect(created.number).toBe(11);
  });

  it("lists check runs for a commit", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        check_runs: [
          {
            id: 1,
            name: "ci",
            status: "completed",
            conclusion: "success",
            html_url: "https://github.com/acme/app/runs/1",
          },
        ],
      }),
    );
    const result = await listCommitCheckRunsViaRest(
      "acme",
      "app",
      "tok",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      fetchImpl as typeof fetch,
    );
    expect(result.available).toBe(true);
    expect(result.checkRuns[0]?.conclusion).toBe("success");
  });
});

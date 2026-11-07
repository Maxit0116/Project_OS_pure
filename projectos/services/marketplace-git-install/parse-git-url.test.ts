import { describe, expect, it } from "vitest";
import { parseMarketplaceGitUrl } from "./parse-git-url.js";

describe("parseMarketplaceGitUrl", () => {
  it("parses https github urls", () => {
    expect(parseMarketplaceGitUrl("https://github.com/acme/skill-repo")).toEqual({
      httpsUrl: "https://github.com/acme/skill-repo.git",
      host: "github.com",
      owner: "acme",
      repo: "skill-repo",
      isGithub: true,
    });
  });

  it("parses tree deep links", () => {
    expect(
      parseMarketplaceGitUrl(
        "https://github.com/acme/mono/tree/main/skills/demo",
      ),
    ).toMatchObject({
      owner: "acme",
      repo: "mono",
      ref: "main",
      subpath: "skills/demo",
      isGithub: true,
    });
  });

  it("parses ssh urls", () => {
    expect(parseMarketplaceGitUrl("git@github.com:acme/app.git")).toMatchObject({
      owner: "acme",
      repo: "app",
      isGithub: true,
    });
  });

  it("rejects private network hosts", () => {
    expect(() => parseMarketplaceGitUrl("https://192.168.1.5/acme/app")).toThrow(
      /not allowed/i,
    );
  });
});

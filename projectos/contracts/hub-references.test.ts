import { describe, expect, it } from "vitest";

import {
  createHubReferenceFromInput,
  createHubReferenceFromPickedFile,
  formatHubReferenceContextLines,
  formatHubReferenceToken,
  parseGithubUrl,
} from "./hub-references.js";
import { PinComposerHubReferenceSchema } from "./spatial-pin.js";

describe("hub-references", () => {
  it("parses github owner/repo and full URLs", () => {
    expect(parseGithubUrl("acme/widget")).toEqual({
      url: "https://github.com/acme/widget",
      owner: "acme",
      repo: "widget",
    });
    expect(parseGithubUrl("https://github.com/acme/widget/tree/main")).toMatchObject({
      owner: "acme",
      repo: "widget",
      ref: "main",
    });
  });

  it("classifies paste into github / url / media kinds", () => {
    const gh = createHubReferenceFromInput("https://github.com/foo/bar", "id1");
    expect(gh?.kind).toBe("github");
    const site = createHubReferenceFromInput("https://docs.example.com/guide", "id2");
    expect(site?.kind).toBe("url");
    const video = createHubReferenceFromInput(
      "https://cdn.example.com/demo.mp4",
      "id3",
    );
    expect(video?.kind).toBe("video");
    const audio = createHubReferenceFromInput(
      "https://cdn.example.com/tone.mp3",
      "id4",
    );
    expect(audio?.kind).toBe("audio");
    const image = createHubReferenceFromInput(
      "https://cdn.example.com/hero.png",
      "id5",
    );
    expect(image?.kind).toBe("image");
  });

  it("classifies Finder picks into file or media kinds", () => {
    expect(
      createHubReferenceFromPickedFile({
        path: "/tmp/spec.pdf",
        name: "spec.pdf",
        ext: "pdf",
      }).kind,
    ).toBe("file");
    expect(
      createHubReferenceFromPickedFile({
        path: "/tmp/hero.png",
        name: "hero.png",
        ext: "png",
      }).kind,
    ).toBe("image");
  });

  it("round-trips new reference kinds through the hub schema", () => {
    const github = PinComposerHubReferenceSchema.parse({
      kind: "github",
      id: "g1",
      url: "https://github.com/acme/app",
      owner: "acme",
      repo: "app",
      label: "acme/app",
    });
    const url = PinComposerHubReferenceSchema.parse({
      kind: "url",
      id: "u1",
      url: "https://example.com/spec",
    });
    expect(formatHubReferenceToken(github)).toContain("github:acme/app");
    expect(formatHubReferenceToken(url)).toContain("url:https://example.com/spec");
    const lines = formatHubReferenceContextLines([github, url]);
    expect(lines.some((line) => line.includes("GitHub reference"))).toBe(true);
    expect(lines.some((line) => line.includes("Website reference"))).toBe(true);
  });
});

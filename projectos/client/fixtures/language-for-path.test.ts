import { describe, expect, it } from "vitest";

import { languageForPath } from "./sample-file-contents.js";

describe("languageForPath", () => {
  it("keeps TypeScript and JavaScript ids used by the language server", () => {
    expect(languageForPath("src/App.tsx")).toBe("typescript");
    expect(languageForPath("src/util.ts")).toBe("typescript");
    expect(languageForPath("src/view.jsx")).toBe("javascript");
    expect(languageForPath("src/legacy.mjs")).toBe("javascript");
  });

  it("maps common source extensions onto Monaco languages", () => {
    expect(languageForPath("app/styles.module.css")).toBe("css");
    expect(languageForPath("docs/readme.md")).toBe("markdown");
    expect(languageForPath("scripts/build.py")).toBe("python");
    expect(languageForPath("cmd/main.go")).toBe("go");
    expect(languageForPath("src/lib.rs")).toBe("rust");
    expect(languageForPath("page.html")).toBe("html");
    expect(languageForPath("theme.scss")).toBe("scss");
    expect(languageForPath("deploy/config.yaml")).toBe("yaml");
    expect(languageForPath("bin/start.sh")).toBe("shell");
    expect(languageForPath("db/schema.sql")).toBe("sql");
    expect(languageForPath("native/widget.cpp")).toBe("cpp");
    expect(languageForPath("schema.graphql")).toBe("graphql");
    expect(languageForPath("services/api/Dockerfile")).toBe("dockerfile");
  });

  it("leaves languages Monaco does not ship as plain text", () => {
    expect(languageForPath("schema.prisma")).toBe("plaintext");
    expect(languageForPath("App.vue")).toBe("plaintext");
    expect(languageForPath("Makefile")).toBe("plaintext");
  });
});

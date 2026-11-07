import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildLabStartPrompt,
  detectLabLaunchProfile,
} from "./launch-profile.js";

const roots: string[] = [];

function tempRoot(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `lab-launch-${name}-`));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("detectLabLaunchProfile", () => {
  it("treats Couple_Recording-style native workspaces as non-web terminal starts", () => {
    const root = tempRoot("native");
    mkdirSync(join(root, "macos"), { recursive: true });
    mkdirSync(join(root, "android"), { recursive: true });
    writeFileSync(join(root, "macos", "Package.swift"), "// swift-tools\n");
    writeFileSync(join(root, "README.md"), "cd macos && swift run\n");

    const profile = detectLabLaunchProfile(root);
    expect(profile.hasWebPreview).toBe(false);
    expect(profile.needsTerminalStart).toBe(true);
    expect(profile.needsIdeCapabilities).toBe(true);
    expect(profile.capabilityNeeds).toEqual(
      expect.arrayContaining(["xcode", "android-studio", "android-emulator"]),
    );
    expect(profile.surface).toBe("native");
    expect(profile.suggestedCommands[0]).toBe("cd macos && swift run");
    expect(buildLabStartPrompt(profile)).toContain("does NOT have a web");
  });

  it("detects vite/next web projects and prefers npm run dev", () => {
    const root = tempRoot("web");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        scripts: { dev: "vite" },
        devDependencies: { vite: "5.0.0" },
      }),
    );
    writeFileSync(join(root, "vite.config.ts"), "export default {}\n");

    const profile = detectLabLaunchProfile(root);
    expect(profile.hasWebPreview).toBe(true);
    expect(profile.needsTerminalStart).toBe(true);
    expect(profile.needsIdeCapabilities).toBe(false);
    expect(profile.surface).toBe("web");
    expect(profile.suggestedCommands).toContain("npm run dev");
    expect(buildLabStartPrompt(profile)).toContain("HAS a web preview");
  });

  it("does not invent web preview for plain node scripts", () => {
    const root = tempRoot("node");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        scripts: { start: "node dist/cli.js" },
        dependencies: { commander: "12.0.0" },
      }),
    );

    const profile = detectLabLaunchProfile(root);
    expect(profile.hasWebPreview).toBe(false);
    expect(profile.needsTerminalStart).toBe(true);
    expect(profile.suggestedCommands).toContain("npm start");
  });
});

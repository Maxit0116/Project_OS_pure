import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { inferSpatialPinPath } from "./spatial-pin-path-infer.js";

const temps: string[] = [];

function makeWorkspace(layout: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "spatial-pin-infer-"));
  temps.push(root);
  for (const rel of layout) {
    const full = join(root, rel);
    if (rel.endsWith("/")) {
      mkdirSync(full, { recursive: true });
    } else {
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, "");
    }
  }
  return root;
}

afterEach(() => {
  while (temps.length > 0) {
    const dir = temps.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("inferSpatialPinPath", () => {
  it("prefers ios subtree for Xcode / Simulator", () => {
    const root = makeWorkspace([
      "ios/App.xcodeproj/project.pbxproj",
      "android/build.gradle",
      "android/app/src/main/AndroidManifest.xml",
    ]);
    expect(
      inferSpatialPinPath(root, {
        appName: "Xcode",
        deviceKind: "ide",
      }).inferredPath,
    ).toMatch(/^ios/);
    expect(
      inferSpatialPinPath(root, {
        appName: "Simulator",
        deviceKind: "ios-simulator",
      }).inferredPath,
    ).toMatch(/^ios/);
  });

  it("prefers android subtree for Android Studio / emulator", () => {
    const root = makeWorkspace([
      "ios/App.xcodeproj/project.pbxproj",
      "android/build.gradle",
      "android/app/src/main/AndroidManifest.xml",
    ]);
    expect(
      inferSpatialPinPath(root, {
        appName: "Android Studio",
        deviceKind: "ide",
      }).inferredPath,
    ).toMatch(/^android/);
    expect(
      inferSpatialPinPath(root, {
        appName: "Emulator",
        deviceKind: "android-emulator",
      }).inferredPath,
    ).toMatch(/^android/);
  });

  it("matches a path-like token from the window title", () => {
    const root = makeWorkspace([
      "ios/RecordingView.swift",
      "android/app/src/main/java/MainActivity.kt",
    ]);
    const result = inferSpatialPinPath(root, {
      windowTitle: "CoupleRecording — RecordingView.swift",
      appName: "Xcode",
      deviceKind: "ide",
    });
    expect(result.inferredPath).toMatch(/ios/);
  });

  it("returns empty when workspace is missing", () => {
    expect(inferSpatialPinPath("/tmp/does-not-exist-spatial-pin", {})).toEqual(
      {},
    );
  });
});

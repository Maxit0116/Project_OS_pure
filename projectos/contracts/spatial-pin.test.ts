import { describe, expect, it } from "vitest";

import {
  AnnotationStrokeSchema,
  buildSpatialPinUserContent,
  classifyMacHostApp,
  createArrowStroke,
  createDraftSpatialPin,
  emptyPinComposerHub,
  headFromSpatialPin,
  normalizeSpatialPinUrl,
  PinComposerHubSchema,
  SpatialPinSchema,
} from "./spatial-pin.js";

describe("spatial-pin contracts", () => {
  it("normalizes urls for stable location identity", () => {
    expect(normalizeSpatialPinUrl("http://localhost:3000/app/?q=1#hash")).toBe(
      "http://localhost:3000/app?q=1",
    );
    expect(normalizeSpatialPinUrl("https://example.com/path/")).toBe(
      "https://example.com/path",
    );
  });

  it("creates a draft pin defaulting to Agent (change) mode", () => {
    const pin = createDraftSpatialPin({
      id: "pin_1",
      projectId: "proj_1",
      location: {
        surface: "chrome",
        url: "http://localhost:5173/login",
        selector: "#submit",
      },
      captureRect: { x: 10, y: 20, width: 100, height: 40 },
    });
    expect(pin.composer.mode).toBe("change");
    expect(pin.status).toBe("draft");
    expect(pin.resolve?.confidence).toBe("exact");
    expect(SpatialPinSchema.parse(pin).id).toBe("pin_1");
    expect(headFromSpatialPin(pin).mode).toBe("change");
  });

  it("creates screen/workspace pins as snapshot_only without DOM selector", () => {
    const pin = createDraftSpatialPin({
      id: "pin_screen",
      projectId: "proj_1",
      location: {
        surface: "workspace",
        url: "spatial://workspace/%2Ftmp%2Fdemo",
        workspacePath: "/tmp/demo",
      },
      captureRect: { x: 0, y: 0, width: 200, height: 100 },
    });
    expect(pin.resolve?.confidence).toBe("snapshot_only");
    expect(pin.location.surface).toBe("workspace");
  });

  it("classifies macOS host apps for external IDE / virtual devices", () => {
    expect(classifyMacHostApp("Xcode", "CoupleRecording — ContentView.swift").deviceKind).toBe(
      "ide",
    );
    expect(classifyMacHostApp("Simulator", "iPhone 16 — CoupleRecording").deviceKind).toBe(
      "ios-simulator",
    );
    expect(classifyMacHostApp("Android Studio", "couple_recording").deviceKind).toBe("ide");
    expect(classifyMacHostApp("qemu-system-x86_64", "Android Emulator").deviceKind).toBe(
      "android-emulator",
    );
    expect(classifyMacHostApp("Emulator", "Pixel_8_API_35").deviceKind).toBe(
      "android-emulator",
    );
  });

  it("uses host_window resolve when host fields are present without selector", () => {
    const pin = createDraftSpatialPin({
      id: "pin_host",
      projectId: "proj_1",
      location: {
        surface: "workspace",
        url: "spatial://workspace/%2Ftmp%2Fdemo",
        workspacePath: "/tmp/demo",
        appName: "Xcode",
        deviceKind: "ide",
        inferredPath: "ios/",
      },
    });
    expect(pin.resolve?.confidence).toBe("approx");
    expect(pin.resolve?.method).toBe("host_window");
  });

  it("builds user content with host and snapshot metadata", () => {
    const pin = createDraftSpatialPin({
      id: "pin_meta",
      projectId: "proj_1",
      location: {
        surface: "workspace",
        url: "spatial://workspace/%2Ftmp%2Fdemo",
        workspacePath: "/tmp/demo",
        appName: "Simulator",
        deviceKind: "ios-simulator",
        inferredPath: "ios/",
        windowTitle: "iPhone 16",
      },
      captureRect: { x: 10, y: 20, width: 100, height: 40 },
    });
    pin.composer.prompt = "Fix the login button";
    pin.composer.snapshotAssetPath = ".projectos/spatial-pins/assets/pin_meta.png";
    const content = buildSpatialPinUserContent(pin);
    expect(content).toContain("Fix the login button");
    expect(content).toContain("app=Simulator");
    expect(content).toContain("device=ios-simulator");
    expect(content).toContain("inferredPath=ios/");
    expect(content).toContain("snapshot=.projectos/spatial-pins/assets/pin_meta.png");
    expect(content).toContain("rect=10,20 100x40");
  });

  it("round-trips arrow strokes with unbounded tails and anchors", () => {
    const stroke = createArrowStroke({
      id: "arrow_1",
      index: 1,
      color: "#ff5c5c",
      anchor: "topRight",
      head: { x: 1, y: 0 },
      tail: { x: 1.4, y: -0.2 },
    });
    expect(AnnotationStrokeSchema.parse(stroke)).toEqual(stroke);
    expect(stroke.tail.x).toBeGreaterThan(1);
  });

  it("includes arrow metadata in user content", () => {
    const pin = createDraftSpatialPin({
      id: "pin_arrow",
      projectId: "proj_1",
      location: {
        surface: "workspace",
        url: "spatial://workspace/%2Ftmp%2Fdemo",
        workspacePath: "/tmp/demo",
      },
      captureRect: { x: 0, y: 0, width: 100, height: 80 },
    });
    pin.composer.prompt = "Fix this control";
    pin.annotations.strokes = [
      createArrowStroke({
        id: "arrow_1",
        index: 2,
        color: "#4c7dff",
        anchor: "left",
        head: { x: 0, y: 0.5 },
        tail: { x: -0.3, y: 0.5 },
      }),
    ];
    const content = buildSpatialPinUserContent(pin);
    expect(content).toContain("arrow=#2");
    expect(content).toContain("anchor=left");
    expect(content).toContain("color=#4c7dff");
  });

  it("round-trips compose hub and embeds hub lines in user content", () => {
    const hub = PinComposerHubSchema.parse({
      ...emptyPinComposerHub(),
      researchEnabled: true,
      repo: { label: "acme/app", branch: "main" },
      folders: ["app/builder"],
      skillIds: ["motion"],
      references: [
        {
          kind: "image",
          id: "ref_1",
          assetPath: ".projectos/spatial-pins/assets/x.png",
        },
      ],
      subagents: [
        { id: "s1", name: "Explorer", brief: "Map files", enabled: true },
      ],
    });
    const pin = createDraftSpatialPin({
      id: "pin_hub",
      projectId: "proj_1",
      location: {
        surface: "workspace",
        url: "spatial://workspace/%2Ftmp%2Fdemo",
        workspacePath: "/tmp/demo",
      },
    });
    pin.composer.prompt = "Create a night sky";
    pin.composer.hub = hub;
    const parsed = SpatialPinSchema.parse(pin);
    expect(parsed.composer.hub?.skillIds).toEqual(["motion"]);
    const content = buildSpatialPinUserContent(parsed);
    expect(content).toContain("## Compose hub");
    expect(content).toContain("hub.repo=acme/app @main");
    expect(content).toContain("hub.folders=app/builder");
    expect(content).toContain("hub.skills=motion");
    expect(content).toContain("hub.research=enabled");
    expect(content).toContain("Explorer");
  });
});

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import type { SpatialPinDeviceKind } from "../contracts/spatial-pin.js";

export interface SpatialPinPathInferHost {
  appName?: string | null;
  windowTitle?: string | null;
  deviceKind?: SpatialPinDeviceKind | null;
}

export interface SpatialPinPathInferResult {
  inferredPath?: string;
  textHint?: string;
}

interface SubtreeMarker {
  path: string;
  side: "ios" | "android" | "other";
}

function normalizeRel(path: string): string {
  return path.replace(/\\/gu, "/").replace(/^\/+/u, "").replace(/\/+$/u, "");
}

function listShallowEntries(root: string, maxDepth: number): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth || out.length >= 200) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      const rel = normalizeRel(relative(root, full));
      out.push(rel);
      if (entry.isDirectory() && depth < maxDepth) {
        walk(full, depth + 1);
      }
      if (out.length >= 200) return;
    }
  };
  walk(root, 0);
  return out;
}

function collectMarkers(workspaceRoot: string): SubtreeMarker[] {
  if (!existsSync(workspaceRoot)) return [];
  const entries = listShallowEntries(workspaceRoot, 3);
  const markers: SubtreeMarker[] = [];

  for (const rel of entries) {
    const lower = rel.toLowerCase();
    const base = rel.split("/").pop() ?? rel;
    if (base.endsWith(".xcodeproj") || base.endsWith(".xcworkspace")) {
      const parent = rel.includes("/")
        ? rel.slice(0, rel.lastIndexOf("/"))
        : "";
      markers.push({
        path: parent ? `${parent}/` : normalizeRel(base.replace(/\.(xcodeproj|xcworkspace)$/u, "")),
        side: "ios",
      });
    }
    if (
      lower === "ios" ||
      lower.endsWith("/ios") ||
      lower === "macos" ||
      lower.endsWith("/macos")
    ) {
      markers.push({ path: `${normalizeRel(rel)}/`, side: "ios" });
    }
    if (lower === "android" || lower.endsWith("/android")) {
      markers.push({ path: `${normalizeRel(rel)}/`, side: "android" });
    }
    if (
      lower.endsWith("build.gradle") ||
      lower.endsWith("build.gradle.kts") ||
      lower.endsWith("settings.gradle") ||
      lower.endsWith("settings.gradle.kts")
    ) {
      const parent = rel.includes("/")
        ? `${rel.slice(0, rel.lastIndexOf("/"))}/`
        : "";
      markers.push({ path: parent || "android/", side: "android" });
    }
    if (lower.includes("app/src/main")) {
      const idx = lower.indexOf("app/src/main");
      const prefix = rel.slice(0, idx + "app".length);
      markers.push({ path: `${normalizeRel(prefix)}/`, side: "android" });
    }
  }

  const seen = new Set<string>();
  return markers.filter((marker) => {
    const key = `${marker.side}:${marker.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pathTokensFromTitle(windowTitle: string | null | undefined): string[] {
  if (!windowTitle?.trim()) return [];
  const tokens = new Set<string>();
  const raw = windowTitle.trim();
  for (const part of raw.split(/[\s—–\-|:]+/u)) {
    const cleaned = part.trim().replace(/^[\[\("']+|[\]\)"']+$/gu, "");
    if (!cleaned || cleaned.length < 2) continue;
    if (/^[A-Za-z0-9_.\-]+$/u.test(cleaned)) {
      tokens.add(cleaned);
    }
    if (cleaned.includes("/") || cleaned.includes(sep)) {
      tokens.add(normalizeRel(cleaned));
    }
    if (cleaned.endsWith(".swift") || cleaned.endsWith(".kt") || cleaned.endsWith(".java")) {
      tokens.add(cleaned);
    }
  }
  return [...tokens];
}

function preferSide(
  deviceKind: SpatialPinDeviceKind | null | undefined,
  appName: string | null | undefined,
): "ios" | "android" | null {
  if (deviceKind === "ios-simulator") return "ios";
  if (deviceKind === "android-emulator") return "android";
  const name = (appName ?? "").toLowerCase();
  if (name.includes("xcode")) return "ios";
  if (name.includes("android studio") || name.includes("studio")) return "android";
  return null;
}

function titleMatchPath(
  workspaceRoot: string,
  tokens: string[],
): string | undefined {
  for (const token of tokens) {
    const candidate = join(workspaceRoot, token);
    if (existsSync(candidate)) {
      try {
        const st = statSync(candidate);
        return st.isDirectory()
          ? `${normalizeRel(token)}/`
          : normalizeRel(token);
      } catch {
        /* continue */
      }
    }
  }
  // Match token as suffix of a known file under shallow scan
  const entries = listShallowEntries(workspaceRoot, 4);
  for (const token of tokens) {
    const lower = token.toLowerCase();
    const hit = entries.find((rel) => {
      const base = rel.split("/").pop()?.toLowerCase() ?? "";
      return base === lower || rel.toLowerCase().endsWith(`/${lower}`);
    });
    if (hit) {
      const dir = hit.includes("/") ? hit.slice(0, hit.lastIndexOf("/")) : "";
      return dir ? `${normalizeRel(dir)}/` : normalizeRel(hit);
    }
  }
  return undefined;
}

/**
 * Infer a workspace-relative subtree for Spatial Pin from host signals + repo layout.
 */
export function inferSpatialPinPath(
  workspaceRoot: string | null | undefined,
  host: SpatialPinPathInferHost = {},
): SpatialPinPathInferResult {
  const root = workspaceRoot?.trim();
  if (!root || !existsSync(root)) {
    return {};
  }

  const titleHit = titleMatchPath(root, pathTokensFromTitle(host.windowTitle));
  if (titleHit) {
    return {
      inferredPath: titleHit,
      textHint: `Matched window title → ${titleHit}`,
    };
  }

  const markers = collectMarkers(root);
  if (markers.length === 0) {
    return {};
  }

  const side = preferSide(host.deviceKind, host.appName);
  if (side) {
    const preferred = markers.find((marker) => marker.side === side);
    if (preferred) {
      return {
        inferredPath: preferred.path || undefined,
        textHint: `Host ${side} → ${preferred.path}`,
      };
    }
  }

  const first = markers[0]!;
  return {
    inferredPath: first.path || undefined,
    textHint: `Repo marker → ${first.path}`,
  };
}

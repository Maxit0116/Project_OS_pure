import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  LabLaunchProfile,
  LabLaunchSurface,
} from "../../contracts/product-lab.js";

export type { LabLaunchProfile, LabLaunchSurface };

interface PackageJsonShape {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const WEB_DEP_KEYS = [
  "next",
  "vite",
  "nuxt",
  "astro",
  "react-scripts",
  "@remix-run/dev",
  "@sveltejs/kit",
  "webpack-dev-server",
  "parcel",
] as const;

const WEB_CONFIG_FILES = [
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mjs",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "nuxt.config.ts",
  "nuxt.config.js",
  "astro.config.mjs",
  "astro.config.ts",
  "remix.config.js",
  "svelte.config.js",
] as const;

function safeReadJson(path: string): PackageJsonShape | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PackageJsonShape;
  } catch {
    return null;
  }
}

function hasPath(root: string, relative: string): boolean {
  return existsSync(join(root, relative));
}

function listTopLevel(root: string): string[] {
  try {
    return readdirSync(root);
  } catch {
    return [];
  }
}

function detectNativeSignals(root: string): {
  native: boolean;
  hints: string[];
  commands: string[];
  capabilityNeeds: string[];
} {
  const hints: string[] = [];
  const commands: string[] = [];
  const capabilityNeeds: string[] = [];
  let native = false;

  if (hasPath(root, "macos/Package.swift") || hasPath(root, "Package.swift")) {
    native = true;
    hints.push("Swift / SwiftUI macOS target");
    capabilityNeeds.push("xcode");
    commands.push(
      hasPath(root, "macos/Package.swift")
        ? "cd macos && swift run"
        : "swift run",
    );
  }
  if (
    hasPath(root, "android") ||
    hasPath(root, "android/app") ||
    listTopLevel(root).some((name) => name.endsWith(".gradle") || name === "settings.gradle")
  ) {
    native = true;
    hints.push("Android (open android/ in Android Studio or use Gradle)");
    capabilityNeeds.push("android-studio", "android-emulator");
  }
  if (
    listTopLevel(root).some(
      (name) =>
        name.endsWith(".xcodeproj") ||
        name.endsWith(".xcworkspace") ||
        name === "ios",
    ) ||
    hasPath(root, "ios")
  ) {
    native = true;
    hints.push("iOS / Xcode project");
    capabilityNeeds.push("xcode", "ios-simulator");
  }
  if (hasPath(root, "pubspec.yaml")) {
    native = true;
    hints.push("Flutter");
    commands.push("flutter run");
  }
  if (hasPath(root, "Cargo.toml") && !hasPath(root, "package.json")) {
    native = true;
    hints.push("Rust binary");
    commands.push("cargo run");
  }

  return {
    native,
    hints,
    commands,
    capabilityNeeds: [...new Set(capabilityNeeds)],
  };
}

function emptyProfileExtras(): Pick<
  LabLaunchProfile,
  "needsIdeCapabilities" | "capabilityNeeds"
> {
  return { needsIdeCapabilities: false, capabilityNeeds: [] };
}

function detectWebFromPackage(
  root: string,
  pkg: PackageJsonShape | null,
): {
  web: boolean;
  commands: string[];
  hints: string[];
} {
  const hints: string[] = [];
  const commands: string[] = [];
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const scripts = pkg?.scripts ?? {};

  let web = WEB_CONFIG_FILES.some((file) => hasPath(root, file));
  for (const key of WEB_DEP_KEYS) {
    if (deps[key]) {
      web = true;
      hints.push(`dependency:${key}`);
    }
  }

  if (hasPath(root, "index.html") && (deps.react || deps.vue || deps.svelte || deps["solid-js"])) {
    web = true;
    hints.push("SPA index.html");
  }

  if (typeof scripts.dev === "string" && scripts.dev.trim()) {
    // `dev` alone is not proof of web (could be electron/native tooling),
    // but combined with web deps/config it is the preferred start command.
    if (web || /vite|next|nuxt|astro|remix|webpack|parcel|react-scripts/i.test(scripts.dev)) {
      web = true;
      commands.push("npm run dev");
    }
  }
  if (commands.length === 0 && web && typeof scripts.start === "string" && scripts.start.trim()) {
    commands.push("npm start");
  }
  if (web && commands.length === 0 && typeof scripts.dev === "string" && scripts.dev.trim()) {
    commands.push("npm run dev");
  }

  return { web, commands, hints };
}

/**
 * Inspect a workspace and decide how Product Lab should launch surfaces.
 * Pure filesystem heuristics — no network, no process spawning.
 */
export function detectLabLaunchProfile(workspaceRoot: string): LabLaunchProfile {
  const root = workspaceRoot.trim();
  if (!root || root.startsWith("mock://") || !existsSync(root)) {
    return {
      hasWebPreview: false,
      needsTerminalStart: false,
      ...emptyProfileExtras(),
      surface: "unknown",
      suggestedCommands: [],
      startHints: ["Workspace root unavailable"],
      rationale: "missing_workspace",
    };
  }

  const pkgPath = join(root, "package.json");
  const pkg = hasPath(root, "package.json") ? safeReadJson(pkgPath) : null;
  const web = detectWebFromPackage(root, pkg);
  const native = detectNativeSignals(root);
  const ideCaps = native.capabilityNeeds.length > 0;

  // Explicit non-web: native multi-target without web package signals (e.g. Couple_Recording).
  if (native.native && !web.web) {
    return {
      hasWebPreview: false,
      // Prefer IDE capabilities when present; terminal may still help (swift run).
      needsTerminalStart: !ideCaps || native.commands.length > 0,
      needsIdeCapabilities: ideCaps,
      capabilityNeeds: native.capabilityNeeds,
      surface: "native",
      suggestedCommands: native.commands.slice(0, 3),
      startHints: native.hints,
      rationale: "native_without_web",
    };
  }

  if (web.web) {
    return {
      hasWebPreview: true,
      needsTerminalStart: true,
      ...emptyProfileExtras(),
      surface: "web",
      suggestedCommands: web.commands.slice(0, 3),
      startHints: web.hints.length > 0 ? web.hints : ["Web preview project"],
      rationale: "web_preview",
    };
  }

  // Node / unknown with start scripts — terminal start, no browser unless web proven.
  const scripts = pkg?.scripts ?? {};
  const scriptCommands: string[] = [];
  if (typeof scripts.dev === "string" && scripts.dev.trim()) scriptCommands.push("npm run dev");
  else if (typeof scripts.start === "string" && scripts.start.trim()) {
    scriptCommands.push("npm start");
  }

  if (scriptCommands.length > 0 || native.native) {
    return {
      hasWebPreview: false,
      needsTerminalStart: true,
      needsIdeCapabilities: ideCaps,
      capabilityNeeds: native.capabilityNeeds,
      surface: native.native ? "native" : "unknown",
      suggestedCommands: [...scriptCommands, ...native.commands].slice(0, 3),
      startHints: [
        ...(native.hints.length > 0 ? native.hints : ["Runnable project scripts"]),
      ],
      rationale: native.native ? "native_or_scripts" : "scripts_without_web",
    };
  }

  return {
    hasWebPreview: false,
    needsTerminalStart: false,
    ...emptyProfileExtras(),
    surface: "unknown",
    suggestedCommands: [],
    startHints: ["No clear start command detected — inspect README"],
    rationale: "no_start_signal",
  };
}

export function buildLabStartPrompt(profile: LabLaunchProfile): string {
  const commands =
    profile.suggestedCommands.length > 0
      ? profile.suggestedCommands.map((command) => `- \`${command}\``).join("\n")
      : "- (none inferred — read README / package manifests and choose the real start path)";

  const browserRule = profile.hasWebPreview
    ? "This project HAS a web preview. After the dev server is healthy, report the local URL so Product Lab can open Browser."
    : "This project does NOT have a web/browser preview. Do NOT open or assume a browser tab. Do NOT navigate to Project OS / localhost preview URLs that belong to other apps.";

  return [
    "Product Lab launch — start this workspace so a human can experience the product under test.",
    "Zero-prompt Lab entry: your only job now is to get the app running via the integrated Terminal / shell.",
    "",
    `Surface: ${profile.surface}`,
    `Has web preview: ${profile.hasWebPreview ? "yes" : "no"}`,
    `Detection: ${profile.rationale}`,
    `Hints: ${profile.startHints.join("; ") || "(none)"}`,
    "",
    "Suggested start commands (prefer these when valid; otherwise derive from README):",
    commands,
    "",
    browserRule,
    "",
    "Rules:",
    "1. Read only what you need (README, package manifests, platform folders).",
    "2. Run the real start command(s) in the shell. Prefer long-running dev/run processes.",
    "3. If env vars / secrets are required, say what is missing instead of inventing values.",
    "4. Do not edit product source unless required to start (e.g. missing config template).",
    "5. When the app is running (or blocked), reply with LAB_START_READY or LAB_START_BLOCKED and a one-line status.",
  ].join("\n");
}

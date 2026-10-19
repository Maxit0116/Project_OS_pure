/**
 * L2 structure-graph assembly: README language, file assignment, light imports.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, sep } from "node:path";

import type {
  FileEntry,
  FileRelation,
  FunctionalEdge,
  FunctionalNode,
  ProjectArchitecture,
  ProjectGraph,
  StructureScanMode,
} from "../contracts/graph.js";
import { sourceKindPriority } from "../shared/c4-architecture-views/index.js";

export type ScanLanguage = "zh-CN" | "en";

const SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".projectos",
  ".codesee",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".venv",
  "venv",
  ".next",
  ".turbo",
  ".cache",
  "target",
  "vendor",
]);

const TEXT_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".swift",
  ".vue",
  ".svelte",
  ".md",
  ".json",
  ".yml",
  ".yaml",
  ".toml",
  ".sql",
  ".prisma",
  ".css",
  ".scss",
  ".html",
]);

const DIR_SHELL_NAMES = new Set([
  "frontend",
  "backend",
  "frontend module",
  "backend module",
  "src",
  "src module",
  "app",
  "app module",
  "web",
  "api",
  "server",
  "client",
  "mobile",
  "desktop",
  "android",
  "android module",
  "macos",
  "macos module",
  "ios",
  "docs",
  "docs module",
  "shared",
  "shared module",
  "lib",
  "module",
]);

const SOURCE_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".swift",
  ".vue",
  ".svelte",
]);

export function detectReadmeLanguage(workspaceRoot: string): ScanLanguage {
  for (const name of ["README.md", "readme.md", "README.zh-CN.md"]) {
    const path = join(workspaceRoot, name);
    if (!existsSync(path)) continue;
    try {
      const text = readFileSync(path, "utf8").slice(0, 4000);
      const letters = text.replace(/\s/g, "");
      if (letters.length === 0) continue;
      const cjk = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
      return cjk / Math.max(letters.length, 1) >= 0.08 ? "zh-CN" : "en";
    } catch {
      continue;
    }
  }
  return "en";
}

export function isDirShellName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  if (DIR_SHELL_NAMES.has(normalized)) return true;
  return / module$/u.test(normalized);
}

export function collectRepoFiles(workspaceRoot: string, limit = 400): string[] {
  const files: string[] = [];
  const walk = (absoluteDir: string): void => {
    if (files.length >= limit) return;
    let entries;
    try {
      entries = readdirSync(absoluteDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= limit) return;
      if (entry.name.startsWith(".") && entry.name !== ".env.example") {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name !== ".github" && entry.name !== ".agents") continue;
      }
      if (SKIP_DIRS.has(entry.name)) continue;
      const absolute = join(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = entry.name.includes(".")
        ? `.${entry.name.split(".").pop()!.toLowerCase()}`
        : "";
      if (!TEXT_EXTS.has(ext) && entry.name !== "Dockerfile") continue;
      files.push(relative(workspaceRoot, absolute).split(sep).join("/"));
    }
  };
  walk(workspaceRoot);
  return files;
}

export interface ComponentFileHint {
  id: string;
  pathHints: string[];
}

export function assignFilesToComponents(input: {
  files: string[];
  components: ComponentFileHint[];
  maxFilesPerComponent?: number;
}): Map<string, string[]> {
  const maxFiles = input.maxFilesPerComponent ?? 12;
  const assigned = new Map<string, string[]>();
  for (const component of input.components) assigned.set(component.id, []);
  if (input.components.length === 0) return assigned;

  const ranked = [...input.files].sort((left, right) => {
    const leftSource = SOURCE_EXTS.has(extname(left).toLowerCase()) ? 0 : 1;
    const rightSource = SOURCE_EXTS.has(extname(right).toLowerCase()) ? 0 : 1;
    return leftSource - rightSource || left.length - right.length;
  });

  for (const file of ranked) {
    let best: { id: string; score: number } | null = null;
    for (const component of input.components) {
      const score = hintScore(file, component.pathHints);
      if (score <= 0) continue;
      if (!best || score > best.score) best = { id: component.id, score };
    }
    if (!best) continue;
    const bucket = assigned.get(best.id)!;
    if (bucket.length >= maxFiles) continue;
    bucket.push(file);
  }

  const claimed = new Set<string>();
  for (const paths of assigned.values()) {
    for (const path of paths) claimed.add(path);
  }
  const pending = ranked.filter((file) => isSourceFile(file) && !claimed.has(file));
  for (const file of pending) {
    const target = pickBackfillComponent(file, input.components, assigned, maxFiles);
    if (!target) break;
    assigned.get(target)!.push(file);
  }
  rebalanceEmptyComponents(input.components, assigned, maxFiles);

  return assigned;
}

function isSourceFile(file: string): boolean {
  return SOURCE_EXTS.has(extname(file).toLowerCase());
}

export function countSourceFiles(files: readonly string[]): number {
  return files.filter((file) => isSourceFile(file)).length;
}

function directoryOverlap(file: string, anchors: string[]): number {
  const fileDirs = file.split("/").slice(0, -1);
  let best = 0;
  for (const raw of anchors) {
    const anchor = raw.trim().replace(/^\.\//, "").replace(/\/+$/, "");
    if (!anchor) continue;
    const parts = anchor.split("/");
    const anchorDirs =
      extname(parts[parts.length - 1] ?? "").length > 0 ? parts.slice(0, -1) : parts;
    let shared = 0;
    const limit = Math.min(fileDirs.length, anchorDirs.length);
    for (let index = 0; index < limit; index += 1) {
      if (fileDirs[index] !== anchorDirs[index]) break;
      shared += 1;
    }
    best = Math.max(best, shared);
  }
  return best;
}

function pickBackfillComponent(
  file: string,
  components: ComponentFileHint[],
  assigned: Map<string, string[]>,
  maxFiles: number,
): string | null {
  let best: { id: string; score: number; count: number } | null = null;
  for (const component of components) {
    const bucket = assigned.get(component.id) ?? [];
    if (bucket.length >= maxFiles) continue;
    const score = directoryOverlap(file, [...component.pathHints, ...bucket]);
    const count = bucket.length;
    if (
      !best ||
      score > best.score ||
      (score === best.score && count < best.count)
    ) {
      best = { id: component.id, score, count };
    }
  }
  return best?.id ?? null;
}

/** Move spare source files onto components that hints left empty. */
function rebalanceEmptyComponents(
  components: ComponentFileHint[],
  assigned: Map<string, string[]>,
  maxFiles: number,
): void {
  const sourceCount = (id: string): number =>
    (assigned.get(id) ?? []).filter((file) => isSourceFile(file)).length;

  for (const target of components) {
    if (sourceCount(target.id) > 0) continue;
    const bucket = assigned.get(target.id);
    if (!bucket || bucket.length >= maxFiles) continue;
    const donor = [...components]
      .filter((component) => sourceCount(component.id) > 1)
      .sort((left, right) => sourceCount(right.id) - sourceCount(left.id))[0];
    if (!donor) break;
    const donorBucket = assigned.get(donor.id)!;
    for (let index = donorBucket.length - 1; index >= 0; index -= 1) {
      const file = donorBucket[index];
      if (!file || !isSourceFile(file)) continue;
      donorBucket.splice(index, 1);
      bucket.push(file);
      break;
    }
  }
}

function hintScore(file: string, hints: string[]): number {
  let best = 0;
  for (const raw of hints) {
    const hint = raw.trim().replace(/^\.\//, "").split(sep).join("/");
    if (!hint) continue;
    if (hint.includes("*")) {
      const pattern = new RegExp(
        `^${hint.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
        "i",
      );
      if (pattern.test(file)) best = Math.max(best, hint.length + 20);
      continue;
    }
    if (file === hint) {
      best = Math.max(best, 1000 + hint.length);
      continue;
    }
    const prefix = hint.endsWith("/") ? hint : `${hint}/`;
    if (file.startsWith(prefix) || file.startsWith(hint)) {
      best = Math.max(best, prefix.length);
    }
  }
  return best;
}

export function parseRelativeImports(source: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /(?:from|import)\s+['"](\.\.?\/[^'"]+)['"]/g,
    /require\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g,
    /import\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const spec = match[1];
      if (spec) specs.push(spec);
    }
  }
  return Array.from(new Set(specs));
}

/** Kotlin/Java/Python-style `import com.foo.Bar` (not quoted relative paths). */
export function parsePackageImports(source: string): string[] {
  const specs: string[] = [];
  const pattern =
    /^\s*import\s+(?:static\s+)?([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+)/gm;
  for (const match of source.matchAll(pattern)) {
    const spec = match[1]?.replace(/\.\*$/, "");
    if (spec && spec.includes(".")) specs.push(spec);
  }
  return Array.from(new Set(specs));
}

/** Python `from .session import x` / `from ..billing.plan import Plan`. */
export function parsePythonRelativeImports(source: string): string[] {
  const specs: string[] = [];
  const pattern = /^\s*from\s+(\.+[A-Za-z_][\w.]*)\s+import\s+/gm;
  for (const match of source.matchAll(pattern)) {
    const spec = match[1];
    if (spec) specs.push(spec);
  }
  return Array.from(new Set(specs));
}

/** Go quoted import paths (`import "module/pkg"` and grouped import blocks). */
export function parseGoImports(source: string): string[] {
  const specs: string[] = [];
  const pattern = /["']([A-Za-z0-9_./-]+\/[A-Za-z0-9_./-]+)["']/g;
  const blocks = source.match(/import\s*(?:\([^)]*\)|"[^"]+"|'[^']+')/g) ?? [];
  for (const block of blocks) {
    for (const match of block.matchAll(pattern)) {
      const spec = match[1];
      if (spec) specs.push(spec);
    }
  }
  return Array.from(new Set(specs));
}

/** Rust `use crate::foo::bar`, `use super::foo`, and `mod foo`. */
export function parseRustImports(source: string): string[] {
  const specs: string[] = [];
  for (const match of source.matchAll(
    /^\s*use\s+((?:crate|super|self)(?:::[A-Za-z_][\w]*)+)\s*;/gm,
  )) {
    const spec = match[1];
    if (spec) specs.push(spec);
  }
  for (const match of source.matchAll(/^\s*(?:pub\s+)?mod\s+([A-Za-z_][\w]*)\s*;/gm)) {
    const spec = match[1];
    if (spec) specs.push(`mod:${spec}`);
  }
  return Array.from(new Set(specs));
}

export function parseImportSpecs(source: string): string[] {
  return Array.from(
    new Set([
      ...parseRelativeImports(source),
      ...parsePackageImports(source),
      ...parsePythonRelativeImports(source),
      ...parseGoImports(source),
      ...parseRustImports(source),
    ]),
  );
}

/** Extract exported symbols from TS/JS source (named + default). */
export function parseExports(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(
    /export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g,
  )) {
    if (match[1]) names.push(match[1]);
  }
  for (const match of source.matchAll(/export\s+class\s+([A-Za-z_$][\w$]*)/g)) {
    if (match[1]) names.push(match[1]);
  }
  for (const match of source.matchAll(
    /export\s+(?:const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    if (match[1]) names.push(match[1]);
  }
  for (const match of source.matchAll(/export\s+\{\s*([^}]+)\s*\}/g)) {
    const inner = match[1] ?? "";
    for (const part of inner.split(",")) {
      const cleaned = part
        .trim()
        .replace(/^type\s+/, "")
        .replace(/\s+as\s+[A-Za-z_$][\w$]*$/, "")
        .trim();
      if (cleaned && /^[A-Za-z_$]/.test(cleaned)) names.push(cleaned);
    }
  }
  if (/export\s+default\b/.test(source)) names.push("default");
  return Array.from(new Set(names)).slice(0, 256);
}

function resolvePackageImportPath(spec: string, files: Set<string>): string | null {
  const classPath = spec.replace(/\./g, "/");
  for (const file of files) {
    const normalized = file.split(sep).join("/");
    const stem = normalized.replace(/\.[^.]+$/, "");
    if (stem === classPath || stem.endsWith(`/${classPath}`)) return file;
  }
  return null;
}

function resolvePythonRelativeImport(
  fromFile: string,
  spec: string,
  files: Set<string>,
): string | null {
  const dots = /^(\.+)/.exec(spec)?.[1]?.length ?? 0;
  if (dots === 0) return null;
  let dir = dirname(fromFile).split(sep).join("/");
  for (let index = 1; index < dots; index += 1) {
    const parent = dirname(dir);
    dir = parent === dir ? "" : parent.split(sep).join("/");
  }
  const rest = spec.slice(dots).replace(/\./g, "/");
  const base = rest ? (dir ? `${dir}/${rest}` : rest) : dir;
  const candidates = [`${base}.py`, `${base}/__init__.py`];
  return candidates.find((candidate) => files.has(candidate)) ?? null;
}

function resolveGoImportPath(spec: string, files: Set<string>): string | null {
  const parts = spec.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length < 2) return null;
  for (let length = parts.length; length >= 2; length -= 1) {
    const suffix = parts.slice(parts.length - length).join("/");
    const last = parts[parts.length - 1]!;
    const matches = [...files].filter((file) => {
      if (!file.endsWith(".go")) return false;
      const stem = file.slice(0, -3);
      return stem === suffix || stem.endsWith(`/${suffix}`) || stem.endsWith(`/${suffix}/${last}`);
    });
    if (matches.length === 1) return matches[0]!;
  }
  return null;
}

function resolveRustImportPath(
  fromFile: string,
  spec: string,
  files: Set<string>,
): string | null {
  if (spec.startsWith("mod:")) {
    const name = spec.slice(4);
    const dir = dirname(fromFile).split(sep).join("/");
    const candidates = [`${dir}/${name}.rs`, `${dir}/${name}/mod.rs`];
    return candidates.find((candidate) => files.has(candidate)) ?? null;
  }
  let relative = spec;
  let dir = dirname(fromFile).split(sep).join("/");
  if (relative.startsWith("crate::")) {
    relative = relative.slice("crate::".length);
    dir = "";
  } else if (relative.startsWith("super::")) {
    relative = relative.slice("super::".length);
    const parent = dirname(dir);
    dir = parent === dir ? "" : parent.split(sep).join("/");
  } else if (relative.startsWith("self::")) {
    relative = relative.slice("self::".length);
  } else {
    return null;
  }
  const rest = relative.replace(/::/g, "/");
  const base = dir ? `${dir}/${rest}` : rest;
  const candidates = [
    `${base}.rs`,
    `${base}/mod.rs`,
    `src/${base}.rs`,
    `src/${base}/mod.rs`,
  ];
  return candidates.find((candidate) => files.has(candidate)) ?? null;
}

export function resolveImportPath(
  fromFile: string,
  spec: string,
  files: Set<string>,
): string | null {
  if (spec.startsWith("mod:") || spec.startsWith("crate::") || spec.startsWith("super::") || spec.startsWith("self::")) {
    return resolveRustImportPath(fromFile, spec, files);
  }
  if (/^\.+[A-Za-z_]/.test(spec)) {
    return resolvePythonRelativeImport(fromFile, spec, files);
  }
  if (!spec.startsWith(".")) {
    if (spec.includes("/")) {
      return resolveGoImportPath(spec, files) ?? resolvePackageImportPath(spec, files);
    }
    return resolvePackageImportPath(spec, files);
  }
  const fromDir = dirname(fromFile);
  const combined = join(fromDir, spec).split(sep).join("/");
  const normalized = combined.replace(/^\.\//, "");
  const candidates = [
    normalized,
    `${normalized}.ts`,
    `${normalized}.tsx`,
    `${normalized}.js`,
    `${normalized}.jsx`,
    `${normalized}.mjs`,
    `${normalized}.cjs`,
    `${normalized}.swift`,
    `${normalized}.kt`,
    `${normalized}.java`,
    `${normalized}.py`,
    `${normalized}.go`,
    `${normalized}.rs`,
    `${normalized}/mod.rs`,
    `${normalized}/__init__.py`,
    `${normalized}/index.ts`,
    `${normalized}/index.js`,
    `${normalized}/index.tsx`,
  ];
  for (const candidate of candidates) {
    const path = candidate.replace(/^(\.\/)+/, "");
    if (files.has(path)) return path;
  }
  return null;
}

export function classifyRepoFileType(relativePath: string): FileEntry["type"] {
  const lower = relativePath.toLowerCase();
  const ext = extname(lower);
  if (/(^|\/)(test|tests|__tests__|spec)(\/|$)/.test(lower) || /\.(test|spec)\./.test(lower)) {
    return "test";
  }
  if (ext === ".css" || ext === ".scss") return "style";
  if (
    lower.endsWith("package.json") ||
    lower.endsWith("tsconfig.json") ||
    lower.includes("config") ||
    ext === ".yml" ||
    ext === ".yaml" ||
    ext === ".toml"
  ) {
    return "config";
  }
  if (/(^|\/)(api|routes|routers)(\/|$)/.test(lower) || lower.includes("router")) return "api";
  if (/(^|\/)(pages|page)(\/|$)/.test(lower) || lower.endsWith("index.html")) return "page";
  if (/(^|\/)(components?|ui)(\/|$)/.test(lower)) return "component";
  if (/(^|\/)(lib|utils|helpers|services)(\/|$)/.test(lower)) return "lib";
  if ([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"].includes(ext)) return "asset";
  return "other";
}

export function buildFileIndexAndRelations(input: {
  workspaceRoot: string;
  assignments: Map<string, string[]>;
}): { fileIndex: FileEntry[]; fileRelations: FileRelation[] } {
  const ownerByPath = new Map<string, string>();
  for (const [componentId, paths] of input.assignments) {
    for (const path of paths) ownerByPath.set(path, componentId);
  }
  const allPaths = new Set(ownerByPath.keys());
  const importsByPath = new Map<string, string[]>();
  const exportsByPath = new Map<string, string[]>();

  for (const path of allPaths) {
    const absolute = join(input.workspaceRoot, path);
    let body = "";
    try {
      if (existsSync(absolute) && statSync(absolute).isFile()) {
        body = readFileSync(absolute, "utf8").slice(0, 40_000);
      }
    } catch {
      body = "";
    }
    const resolved: string[] = [];
    for (const spec of parseImportSpecs(body)) {
      const target = resolveImportPath(path, spec, allPaths);
      if (target && target !== path) resolved.push(target);
    }
    importsByPath.set(path, Array.from(new Set(resolved)));
    exportsByPath.set(
      path,
      /\.(?:[cm]?[jt]sx?)$/i.test(path) ? parseExports(body) : [],
    );
  }

  const fileIndex: FileEntry[] = [...allPaths].map((path) => ({
    path,
    type: classifyRepoFileType(path),
    nodeIds: ownerByPath.get(path) ? [ownerByPath.get(path)!] : [],
    imports: importsByPath.get(path) ?? [],
    exports: exportsByPath.get(path) ?? [],
    status: "normal" as const,
  }));

  const fileRelations: FileRelation[] = [];
  for (const [sourcePath, imports] of importsByPath) {
    const sourceOwner = ownerByPath.get(sourcePath);
    if (!sourceOwner) continue;
    for (const targetPath of imports) {
      if (ownerByPath.get(targetPath) !== sourceOwner) continue;
      fileRelations.push({
        id: `rel_${sourcePath}_to_${targetPath}`.replace(/[^a-zA-Z0-9_]+/g, "_"),
        sourcePath,
        targetPath,
        relation: "imports",
        label: `${basenameLabel(sourcePath)} → ${basenameLabel(targetPath)}`,
        confidence: 0.8,
        evidence: `${sourcePath} imports ${targetPath}`,
      });
    }
  }

  return { fileIndex, fileRelations };
}

function basenameLabel(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

export interface L2QualityResult {
  complete: boolean;
  reasons: string[];
}

export function assessL2GraphQuality(
  graph: ProjectGraph,
  options: { sourceFileCount: number; language: ScanLanguage },
): L2QualityResult {
  const reasons: string[] = [];
  const components = graph.nodes.filter((node) => node.level === "component");
  const containers = graph.nodes.filter((node) => node.level === "container");
  const systems = graph.nodes.filter(
    (node) => node.elementType === "software_system" || node.level === "context",
  );
  if (systems.length < 1) reasons.push("missing_system");
  if (containers.length < 1) reasons.push("missing_container");

  const minComponents =
    options.sourceFileCount < 6 ? 2 : options.sourceFileCount < 20 ? 3 : 6;
  if (components.length < minComponents) {
    reasons.push(`too_few_components:${components.length}<${minComponents}`);
  }

  const shellNames = graph.nodes.filter(
    (node) =>
      (node.level === "container" || node.level === "component") &&
      isDirShellName(node.name),
  );
  if (shellNames.length > 0) {
    reasons.push(`dir_shell_names:${shellNames.map((node) => node.name).join(",")}`);
  }

  const rich =
    components.length === 0
      ? 0
      : components.filter((node) => node.linkedFiles.length >= 2).length;
  const minRich =
    options.sourceFileCount < 6
      ? Math.min(1, components.length)
      : Math.ceil(components.length * 0.5);
  if (rich < minRich) {
    reasons.push(`thin_file_mounts:${rich}<${minRich}`);
  }

  const named = [...containers, ...components];
  if (named.length > 0) {
    const cjkCount = named.filter((node) => /[\u3400-\u9fff]/u.test(node.name)).length;
    if (options.language === "zh-CN" && cjkCount / named.length < 0.4) {
      reasons.push("language_mismatch_expected_zh");
    }
    if (options.language === "en" && cjkCount / named.length > 0.6) {
      reasons.push("language_mismatch_expected_en");
    }
  }

  const unowned = components.filter(
    (node) =>
      node.linkedFiles.length === 0 &&
      !graph.fileIndex.some((file) => file.nodeIds.includes(node.id)),
  );
  const mounted = components.length - unowned.length;
  const couldCover = Math.min(components.length, options.sourceFileCount);
  if (unowned.length > 0 && mounted < couldCover) {
    reasons.push(`components_without_code:${unowned.length}`);
  }

  if (options.sourceFileCount >= 6) {
    const hasCodeEdge =
      (graph.fileRelations?.length ?? 0) > 0 ||
      graph.fileIndex.some((entry) => entry.imports.length > 0);
    if (!hasCodeEdge) reasons.push("missing_code_layer_edges");
  }

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const invalidEdges = (graph.edges ?? []).filter(
    (edge) =>
      edge.source.trim().length === 0 ||
      edge.target.trim().length === 0 ||
      edge.source === edge.target ||
      !nodeIds.has(edge.source) ||
      !nodeIds.has(edge.target),
  );
  if (invalidEdges.length > 0) {
    reasons.push(`invalid_edges:${invalidEdges.length}`);
  }

  return { complete: reasons.length === 0, reasons };
}

export function defaultArchitecture(language: ScanLanguage): ProjectArchitecture {
  if (language === "zh-CN") {
    return {
      notation: "c4",
      defaultLevel: "context",
      layers: [
        {
          id: "experience",
          label: "用户入口",
          order: 0,
          description: "用户以及他们能直接看到和操作的产品入口",
        },
        {
          id: "application",
          label: "核心功能",
          order: 1,
          description: "承载产品业务功能与流程",
        },
        {
          id: "infrastructure",
          label: "技术支撑",
          order: 2,
          description: "平台、数据与运行时",
        },
      ],
    };
  }
  return {
    notation: "c4",
    defaultLevel: "context",
    layers: [
      {
        id: "experience",
        label: "Experience",
        order: 0,
        description: "People and product entry points",
      },
      {
        id: "application",
        label: "Application",
        order: 1,
        description: "Product capabilities and flows",
      },
      {
        id: "infrastructure",
        label: "Infrastructure",
        order: 2,
        description: "Platform, data, and runtime",
      },
    ],
  };
}

/**
 * Drop edges that would fail workspace fixture validation: empty endpoints,
 * unknown node ids, or self-loops. AI rounds occasionally omit source/target.
 */
export function pruneDanglingEdges(
  edges: FunctionalEdge[],
  nodeIds: ReadonlySet<string>,
): FunctionalEdge[] {
  return edges.filter(
    (edge) =>
      edge.source.trim().length > 0 &&
      edge.target.trim().length > 0 &&
      edge.source !== edge.target &&
      nodeIds.has(edge.source) &&
      nodeIds.has(edge.target),
  );
}

export function mergeStructureGraphs(input: {
  base: ProjectGraph;
  incoming: ProjectGraph;
  mode: StructureScanMode;
  deepenIds?: string[];
}): ProjectGraph {
  if (input.mode === "regenerate") {
    const nodeIds = new Set(input.incoming.nodes.map((node) => node.id));
    return {
      ...input.incoming,
      edges: pruneDanglingEdges(input.incoming.edges, nodeIds),
    };
  }

  const deepen = new Set(input.deepenIds ?? []);
  const keepNode = (node: FunctionalNode): boolean => {
    if (input.mode !== "deepen" || deepen.size === 0) return true;
    if (deepen.has(node.id)) return true;
    if (node.parentId && deepen.has(node.parentId)) return true;
    return false;
  };

  const preferIncoming = (
    existingKind: FunctionalNode["sourceKind"] | FunctionalEdge["sourceKind"],
    incomingKind: FunctionalNode["sourceKind"] | FunctionalEdge["sourceKind"],
  ): boolean => sourceKindPriority(incomingKind) > sourceKindPriority(existingKind);

  const incomingById = new Map(input.incoming.nodes.filter(keepNode).map((node) => [node.id, node]));
  const nodesById = new Map(input.base.nodes.map((node) => [node.id, node]));
  for (const [id, node] of incomingById) {
    const existing = nodesById.get(id);
    if (!existing) {
      nodesById.set(id, node);
      continue;
    }
    // authored always wins for semantic fields / identity
    if (existing.sourceKind === "authored" && node.sourceKind !== "authored") {
      const linked = new Map(existing.linkedFiles.map((file) => [file.path, file]));
      for (const file of node.linkedFiles) linked.set(file.path, file);
      nodesById.set(id, {
        ...existing,
        linkedFiles: [...linked.values()],
        tags: Array.from(new Set([...(existing.tags ?? []), ...(node.tags ?? [])])),
      });
      continue;
    }
    const linked = new Map(existing.linkedFiles.map((file) => [file.path, file]));
    for (const file of node.linkedFiles) linked.set(file.path, file);
    const takeIncoming = preferIncoming(existing.sourceKind, node.sourceKind);
    nodesById.set(id, {
      ...existing,
      ...(takeIncoming ? node : {}),
      name: existing.sourceKind === "authored" ? existing.name : (takeIncoming ? node.name : existing.name),
      linkedFiles: [...linked.values()],
      tags: Array.from(new Set([...(existing.tags ?? []), ...(node.tags ?? [])])),
      sourceKind: takeIncoming
        ? (node.sourceKind ?? existing.sourceKind)
        : (existing.sourceKind ?? node.sourceKind),
    });
  }

  const nodes = [...nodesById.values()];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edgesById = new Map(
    pruneDanglingEdges(input.base.edges, nodeIds).map((edge) => [edge.id, edge]),
  );
  for (const edge of pruneDanglingEdges(input.incoming.edges, nodeIds)) {
    const existing = edgesById.get(edge.id);
    if (!existing || preferIncoming(existing.sourceKind, edge.sourceKind)) {
      edgesById.set(edge.id, edge);
    }
  }

  const fileByPath = new Map(input.base.fileIndex.map((entry) => [entry.path, entry]));
  for (const entry of input.incoming.fileIndex) {
    const existing = fileByPath.get(entry.path);
    if (!existing) {
      fileByPath.set(entry.path, entry);
      continue;
    }
    fileByPath.set(entry.path, {
      ...existing,
      nodeIds: Array.from(new Set([...existing.nodeIds, ...entry.nodeIds])),
      imports: Array.from(new Set([...existing.imports, ...entry.imports])),
      exports: Array.from(new Set([...existing.exports, ...entry.exports])),
    });
  }

  const relations = new Map(
    (input.base.fileRelations ?? []).map((relation) => [relation.id, relation]),
  );
  for (const relation of input.incoming.fileRelations ?? []) {
    relations.set(relation.id, relation);
  }

  return {
    ...input.incoming,
    projectId: input.base.projectId,
    nodes,
    edges: [...edgesById.values()],
    fileIndex: [...fileByPath.values()],
    fileRelations: [...relations.values()],
    topology: {
      rootIds: nodes.filter((node) => !node.parentId).map((node) => node.id),
      maxDepth: 3,
      totalNodes: nodes.length,
    },
  };
}

export function rebuildHierarchy(nodes: FunctionalNode[]): FunctionalNode[] {
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const list = childrenByParent.get(node.parentId) ?? [];
    list.push(node.id);
    childrenByParent.set(node.parentId, list);
  }
  return nodes.map((node) => ({
    ...node,
    children: childrenByParent.get(node.id) ?? node.children ?? [],
  }));
}

export function ensureEdgeFields(edge: FunctionalEdge, index: number): FunctionalEdge {
  const technology = edge.technology?.trim();
  return {
    ...edge,
    id: edge.id || `edge_${edge.source}_${edge.target}_${index}`,
    label: edge.label?.trim() || `${edge.source} → ${edge.target}`,
    evidence: edge.evidence?.trim() || "Inferred from repository structure",
    confidence: typeof edge.confidence === "number" ? edge.confidence : 0.7,
    ...(technology ? { technology } : {}),
  };
}

/** Signals collected from manifests / paths for C4 shape enrichment. */
export interface WorkspaceTechSignals {
  technologies: string[];
  dataStoreTechnologies: string[];
  queueTechnologies: string[];
  mobileTechnologies: string[];
  webTechnologies: string[];
  serverTechnologies: string[];
  externalSystemNames: string[];
  dataStorePathHints: string[];
}

const DATA_STORE_PATH_RE =
  /(^|\/)(prisma|drizzle|migrations?|database|db|sqlite|postgres|postgresql|mysql|mongo|mongodb|redis|dynamodb)(\/|$)/i;
const DATA_STORE_FILE_RE =
  /\.(prisma|sql)$|schema\.prisma$|drizzle\.config\.|docker-compose.*\.(ya?ml)$/i;

const TECH_FROM_DEP: Array<{ pattern: RegExp; technology: string; kind: TechKind }> = [
  { pattern: /^next$/, technology: "Next.js", kind: "web" },
  { pattern: /^react-native$/, technology: "React Native", kind: "mobile" },
  { pattern: /^expo$/, technology: "React Native", kind: "mobile" },
  { pattern: /^flutter$/, technology: "Flutter", kind: "mobile" },
  { pattern: /^@nestjs\//, technology: "NestJS", kind: "server" },
  { pattern: /^express$/, technology: "Node.js / Express", kind: "server" },
  { pattern: /^fastify$/, technology: "Node.js / Fastify", kind: "server" },
  { pattern: /^kafkajs$|^@confluent\/kafka$/, technology: "Kafka", kind: "queue" },
  { pattern: /^amqplib$|^amqp-connection-manager$/, technology: "RabbitMQ", kind: "queue" },
  { pattern: /^bullmq$|^bull$/, technology: "Redis", kind: "queue" },
  { pattern: /^ioredis$|^redis$/, technology: "Redis", kind: "data_store" },
  { pattern: /^pg$|^postgres$|^postgresql$/, technology: "PostgreSQL", kind: "data_store" },
  { pattern: /^mysql2?$/, technology: "MySQL", kind: "data_store" },
  { pattern: /^mongodb$|^mongoose$/, technology: "MongoDB", kind: "data_store" },
  { pattern: /^better-sqlite3$|^sqlite3$/, technology: "SQLite", kind: "data_store" },
  { pattern: /^@aws-sdk\/client-sqs$|^sqs$/, technology: "SQS", kind: "queue" },
  { pattern: /^@google-cloud\/pubsub$/, technology: "Pub/Sub", kind: "queue" },
  { pattern: /^nats$/, technology: "NATS", kind: "queue" },
  { pattern: /^vue$/, technology: "Vue", kind: "web" },
  { pattern: /^@angular\/core$/, technology: "Angular", kind: "web" },
  { pattern: /^svelte$/, technology: "Svelte", kind: "web" },
  { pattern: /^react$/, technology: "React", kind: "web" },
  { pattern: /^vite$/, technology: "Vite", kind: "web" },
];

const EXTERNAL_FROM_DEP: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /^stripe$/, name: "Stripe" },
  { pattern: /^@auth0\//, name: "Auth0" },
  { pattern: /^firebase$|^@firebase\//, name: "Firebase" },
  { pattern: /^@supabase\//, name: "Supabase" },
  { pattern: /^@sendgrid\//, name: "SendGrid" },
  { pattern: /^twilio$/, name: "Twilio" },
  { pattern: /^openai$/, name: "OpenAI" },
  { pattern: /^@anthropic-ai\//, name: "Anthropic" },
  { pattern: /^@aws-sdk\//, name: "AWS" },
];

type TechKind = "web" | "mobile" | "server" | "queue" | "data_store";

function pushUnique(list: string[], value: string): void {
  if (!value || list.includes(value)) return;
  list.push(value);
}

function readDepsFromPackageJson(body: string): string[] {
  try {
    const parsed = JSON.parse(body) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    return Object.keys({
      ...(parsed.dependencies ?? {}),
      ...(parsed.devDependencies ?? {}),
      ...(parsed.peerDependencies ?? {}),
    });
  } catch {
    return [];
  }
}

function inferPrismaProvider(schemaBody: string): string {
  const match = schemaBody.match(/provider\s*=\s*"([^"]+)"/i);
  const provider = (match?.[1] ?? "").toLowerCase();
  if (provider.includes("postgres") || provider === "postgresql") return "PostgreSQL";
  if (provider.includes("mysql")) return "MySQL";
  if (provider.includes("sqlite")) return "SQLite";
  if (provider.includes("mongo")) return "MongoDB";
  if (provider.includes("sqlserver")) return "SQL Server";
  if (provider.includes("cockroach")) return "CockroachDB";
  return "PostgreSQL";
}

function applyDepSignals(deps: string[], signals: WorkspaceTechSignals): void {
  for (const dep of deps) {
    const lower = dep.toLowerCase();
    for (const rule of TECH_FROM_DEP) {
      if (!rule.pattern.test(lower)) continue;
      pushUnique(signals.technologies, rule.technology);
      if (rule.kind === "web") pushUnique(signals.webTechnologies, rule.technology);
      if (rule.kind === "mobile") pushUnique(signals.mobileTechnologies, rule.technology);
      if (rule.kind === "server") pushUnique(signals.serverTechnologies, rule.technology);
      if (rule.kind === "queue") pushUnique(signals.queueTechnologies, rule.technology);
      if (rule.kind === "data_store") {
        pushUnique(signals.dataStoreTechnologies, rule.technology);
      }
    }
    for (const rule of EXTERNAL_FROM_DEP) {
      if (rule.pattern.test(lower)) pushUnique(signals.externalSystemNames, rule.name);
    }
  }
}

function applyPathSignals(filePath: string, signals: WorkspaceTechSignals): void {
  const lower = filePath.toLowerCase();
  if (DATA_STORE_PATH_RE.test(lower) || DATA_STORE_FILE_RE.test(lower)) {
    pushUnique(signals.dataStorePathHints, filePath.split("/").slice(0, 3).join("/"));
  }
  if (/(^|\/)(android|ios|mobile|react-native)(\/|$)/i.test(lower)) {
    if (/(^|\/)android(\/|$)/i.test(lower)) pushUnique(signals.mobileTechnologies, "Android");
    else if (/(^|\/)ios(\/|$)/i.test(lower)) pushUnique(signals.mobileTechnologies, "iOS");
    else pushUnique(signals.mobileTechnologies, "React Native");
  }
  if (/(^|\/)(app|pages|src)\/.*\.(tsx|jsx)$/i.test(lower) || /(^|\/)next\.config\./i.test(lower)) {
    // Prefer Next when next.config present; otherwise leave to package.json.
    if (/(^|\/)next\.config\./i.test(lower)) pushUnique(signals.webTechnologies, "Next.js");
  }
  if (/\.kt$|\.java$/i.test(lower) && /(^|\/)android(\/|$)/i.test(lower)) {
    pushUnique(signals.mobileTechnologies, "Android");
  }
  if (/\.swift$/i.test(lower)) {
    const onDesktop = /(^|\/)(macos|osx)(\/|$)/i.test(lower);
    const onIos = /(^|\/)ios(\/|$)/i.test(lower);
    if (onIos || !onDesktop) pushUnique(signals.mobileTechnologies, "SwiftUI");
  }
}

/**
 * Scan workspace manifests and sampled paths for C4 technology / data-store signals.
 */
export function collectWorkspaceTechSignals(
  workspaceRoot: string,
  files?: string[],
): WorkspaceTechSignals {
  const signals: WorkspaceTechSignals = {
    technologies: [],
    dataStoreTechnologies: [],
    queueTechnologies: [],
    mobileTechnologies: [],
    webTechnologies: [],
    serverTechnologies: [],
    externalSystemNames: [],
    dataStorePathHints: [],
  };

  const walked = files ?? collectRepoFiles(workspaceRoot, 400);
  const alwaysCheck = [
    "package.json",
    "prisma/schema.prisma",
    "schema.prisma",
    "requirements.txt",
    "pyproject.toml",
    "go.mod",
    "Cargo.toml",
    "Dockerfile",
    "dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
  ];
  const paths = Array.from(new Set([...alwaysCheck, ...walked]));
  for (const filePath of paths) {
    applyPathSignals(filePath, signals);
    const base = filePath.split("/").pop() ?? filePath;
    if (
      base === "package.json" ||
      base === "schema.prisma" ||
      base === "requirements.txt" ||
      base === "pyproject.toml" ||
      base === "go.mod" ||
      base === "Cargo.toml" ||
      /^dockerfile$/i.test(base) ||
      /^docker-compose.*\.ya?ml$/i.test(base)
    ) {
      const absolute = join(workspaceRoot, filePath);
      const body = (() => {
        try {
          if (!existsSync(absolute) || !statSync(absolute).isFile()) return "";
          return readFileSync(absolute, "utf8").slice(0, 80_000);
        } catch {
          return "";
        }
      })();
      if (!body) continue;
      if (base === "package.json") {
        applyDepSignals(readDepsFromPackageJson(body), signals);
        continue;
      }
      if (base === "schema.prisma") {
        const provider = inferPrismaProvider(body);
        pushUnique(signals.dataStoreTechnologies, provider);
        pushUnique(signals.technologies, provider);
        pushUnique(signals.dataStorePathHints, filePath);
        continue;
      }
      if (base === "requirements.txt" || base === "pyproject.toml") {
        if (/django/i.test(body)) pushUnique(signals.serverTechnologies, "Django");
        if (/fastapi/i.test(body)) pushUnique(signals.serverTechnologies, "FastAPI");
        if (/flask/i.test(body)) pushUnique(signals.serverTechnologies, "Flask");
        if (/psycopg|postgres/i.test(body)) {
          pushUnique(signals.dataStoreTechnologies, "PostgreSQL");
        }
        if (/redis/i.test(body)) pushUnique(signals.dataStoreTechnologies, "Redis");
        if (/kafka|aiokafka/i.test(body)) pushUnique(signals.queueTechnologies, "Kafka");
        continue;
      }
      if (base === "go.mod") {
        if (/gin-gonic\/gin/i.test(body)) pushUnique(signals.serverTechnologies, "Go / Gin");
        else pushUnique(signals.serverTechnologies, "Go");
        if (/jackc\/pgx|lib\/pq/i.test(body)) {
          pushUnique(signals.dataStoreTechnologies, "PostgreSQL");
        }
        if (/segmentio\/kafka|IBM\/sarama/i.test(body)) {
          pushUnique(signals.queueTechnologies, "Kafka");
        }
        continue;
      }
      if (base === "Cargo.toml") {
        pushUnique(signals.serverTechnologies, "Rust");
        continue;
      }
      if (/^dockerfile$/i.test(base)) {
        if (/FROM\s+node/i.test(body)) pushUnique(signals.serverTechnologies, "Node.js");
        if (/FROM\s+python/i.test(body)) pushUnique(signals.serverTechnologies, "Python");
        if (/FROM\s+golang|FROM\s+go:/i.test(body)) {
          pushUnique(signals.serverTechnologies, "Go");
        }
        continue;
      }
      if (/^docker-compose/i.test(base)) {
        if (/postgres|postgresql/i.test(body)) {
          pushUnique(signals.dataStoreTechnologies, "PostgreSQL");
        }
        if (/mysql|mariadb/i.test(body)) pushUnique(signals.dataStoreTechnologies, "MySQL");
        if (/mongo/i.test(body)) pushUnique(signals.dataStoreTechnologies, "MongoDB");
        if (/redis/i.test(body)) pushUnique(signals.dataStoreTechnologies, "Redis");
        if (/kafka/i.test(body)) pushUnique(signals.queueTechnologies, "Kafka");
        if (/rabbitmq/i.test(body)) pushUnique(signals.queueTechnologies, "RabbitMQ");
      }
    }
  }

  for (const tech of [
    ...signals.webTechnologies,
    ...signals.mobileTechnologies,
    ...signals.serverTechnologies,
    ...signals.dataStoreTechnologies,
    ...signals.queueTechnologies,
  ]) {
    pushUnique(signals.technologies, tech);
  }

  return signals;
}

function nodeTextBlob(node: FunctionalNode): string {
  return [
    node.id,
    node.name,
    node.nameEn ?? "",
    node.description,
    node.summary,
    node.responsibility ?? "",
    node.technology ?? "",
    ...(node.tags ?? []),
    ...node.linkedFiles.map((file) => file.path),
  ]
    .join(" ")
    .toLowerCase();
}

function looksLikeDataStore(blob: string, signals: WorkspaceTechSignals): boolean {
  if (
    /postgres|postgresql|mysql|mongo|sqlite|redis|dynamodb|cassandra|database|\bdb\b|prisma|drizzle|data.?store|数据/.test(
      blob,
    )
  ) {
    return true;
  }
  return signals.dataStorePathHints.some((hint) => blob.includes(hint.toLowerCase()));
}

function looksLikeQueue(blob: string): boolean {
  return /kafka|rabbit|sqs|pubsub|queue|nats|event.?bridge|消息队列/.test(blob);
}

function looksLikeDesktop(blob: string): boolean {
  return /macos|mac\s*os|\bos\s*x\b|macintosh|\bmac\b|appkit|electron|tauri|\bwpf\b|winui|桌面客户端|桌面应用/.test(
    blob,
  );
}

function looksLikeMobile(blob: string): boolean {
  if (
    looksLikeDesktop(blob) &&
    !/android|安卓|iphone|jetpack|react.?native|\bflutter\b|\bios\b/.test(blob)
  ) {
    return false;
  }
  return /react.?native|flutter|\bios\b|android|mobile|swiftui|jetpack|移动端|安卓/.test(
    blob,
  );
}

function looksLikeWeb(blob: string): boolean {
  return /next\.?js|react|vue|angular|svelte|frontend|web.?app|browser|spa|前台|前端/.test(blob);
}

function looksLikeExternal(blob: string): boolean {
  return /external|third.?party|saas|stripe|auth0|firebase|supabase|openai|anthropic|aws|第三方|外部系统/.test(
    blob,
  );
}

function pickTechnologyForNode(
  node: FunctionalNode,
  signals: WorkspaceTechSignals,
): string | undefined {
  if (node.technology?.trim()) return node.technology.trim();
  const blob = nodeTextBlob(node);

  if (node.elementType === "data_store" || looksLikeDataStore(blob, signals)) {
    return (
      signals.dataStoreTechnologies[0] ??
      (blob.includes("sqlite")
        ? "SQLite"
        : blob.includes("redis")
          ? "Redis"
          : blob.includes("mongo")
            ? "MongoDB"
            : blob.includes("mysql")
              ? "MySQL"
              : "PostgreSQL")
    );
  }
  if (looksLikeQueue(blob)) {
    return signals.queueTechnologies[0] ?? "Kafka";
  }
  if (looksLikeDesktop(blob) && !looksLikeMobile(blob)) {
    if (/electron/.test(blob)) return "Electron";
    if (/tauri/.test(blob)) return "Tauri";
    if (/windows|wpf|winui/.test(blob)) return "Windows";
    return "macOS";
  }
  if (looksLikeMobile(blob)) {
    return signals.mobileTechnologies[0] ?? "React Native";
  }
  if (looksLikeWeb(blob)) {
    return (
      signals.webTechnologies.find((tech) => /next/i.test(tech)) ??
      signals.webTechnologies[0] ??
      "React"
    );
  }
  if (node.level === "container" || node.elementType === "container") {
    return (
      signals.serverTechnologies[0] ??
      signals.webTechnologies[0] ??
      signals.technologies[0]
    );
  }
  return undefined;
}

/**
 * Enrich graph nodes with short `technology` strings and `data_store` /
 * `external_system` elementTypes that `resolveC4ShapeKind` can consume.
 * Does not invent new ArchitectureElementType enum values.
 */
export function enrichNodesForC4Shapes(input: {
  nodes: FunctionalNode[];
  workspaceRoot: string;
  files?: string[];
  signals?: WorkspaceTechSignals;
}): FunctionalNode[] {
  const signals =
    input.signals ?? collectWorkspaceTechSignals(input.workspaceRoot, input.files);

  return input.nodes.map((node) => {
    const blob = nodeTextBlob(node);
    let elementType = node.elementType;
    let level = node.level;
    let layer = node.layer;
    let technology = pickTechnologyForNode(node, signals);

    const isContainerish =
      level === "container" ||
      elementType === "container" ||
      elementType === "data_store";

    if (isContainerish && looksLikeDataStore(blob, signals)) {
      elementType = "data_store";
      level = level ?? "container";
      layer = layer ?? "infrastructure";
      technology =
        technology ??
        signals.dataStoreTechnologies[0] ??
        "PostgreSQL";
    } else if (
      (level === "context" || !level) &&
      elementType !== "person" &&
      elementType !== "software_system" &&
      (elementType === "external_system" || looksLikeExternal(blob))
    ) {
      // Only promote when already external or clearly named as such — do not
      // reclassify the primary software_system.
      if (elementType !== "software_system" && elementType !== "person") {
        elementType = "external_system";
        level = "context";
      }
    } else if (isContainerish && looksLikeQueue(blob)) {
      technology = technology ?? signals.queueTechnologies[0] ?? "Kafka";
      elementType = elementType === "data_store" ? elementType : "container";
      level = level ?? "container";
    } else if (isContainerish && looksLikeMobile(blob)) {
      technology = technology ?? signals.mobileTechnologies[0] ?? "React Native";
    } else if (isContainerish && looksLikeWeb(blob)) {
      technology =
        technology ??
        signals.webTechnologies.find((tech) => /next/i.test(tech)) ??
        signals.webTechnologies[0] ??
        "React";
    }

    // Fill missing technology on containers / systems from repo signals.
    if (!technology && (isContainerish || elementType === "software_system")) {
      technology = pickTechnologyForNode(
        { ...node, elementType, level, technology: undefined },
        signals,
      );
    }

    if (
      elementType === node.elementType &&
      level === node.level &&
      layer === node.layer &&
      technology === node.technology
    ) {
      return node;
    }

    return {
      ...node,
      ...(elementType ? { elementType } : {}),
      ...(level ? { level } : {}),
      ...(layer ? { layer } : {}),
      ...(technology ? { technology } : {}),
    };
  });
}

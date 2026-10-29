import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import type { SkillCatalogListing } from "../contracts/skill-marketplace.js";
import type { SkillContent, SkillDescriptor } from "../contracts/skills.js";
import { SkillContentSchema, SkillDescriptorSchema } from "../contracts/skills.js";

const SKILL_FILE = "SKILL.md";

function parseFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(raw);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }
  const frontmatter: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let value: unknown = line.slice(colon + 1).trim();
    if (value === "true") value = true;
    if (value === "false") value = false;
    if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
      try {
        value = JSON.parse(value.replace(/'/gu, '"'));
      } catch {
        // keep string
      }
    }
    frontmatter[key] = value;
  }
  return { frontmatter, body: match[2] };
}

function collectSkillFiles(
  root: string,
  skillsRoot: string,
  results: string[],
): void {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      const skillPath = join(fullPath, SKILL_FILE);
      if (existsSync(skillPath)) {
        results.push(skillPath);
      }
      collectSkillFiles(fullPath, skillsRoot, results);
    }
  }
}

function toDescriptor(
  skillFilePath: string,
  skillsRoot: string,
  workspaceRoot: string,
): SkillDescriptor | null {
  const raw = readFileSync(skillFilePath, "utf8");
  const { frontmatter } = parseFrontmatter(raw);
  const skillDir = resolve(skillFilePath, "..");
  const id = relative(skillsRoot, skillDir).split(/[/\\]/u).join("/");
  const name = typeof frontmatter.name === "string" ? frontmatter.name : id.split("/").pop() ?? id;
  const description =
    typeof frontmatter.description === "string" ? frontmatter.description : name;
  const pathsRaw = frontmatter.paths ?? frontmatter.globs;
  let paths: string[] | undefined;
  if (Array.isArray(pathsRaw)) {
    paths = pathsRaw.map(String);
  } else if (typeof pathsRaw === "string") {
    paths = pathsRaw.split(",").map((item) => item.trim()).filter(Boolean);
  }
  const scopeRoot =
    skillsRoot !== join(workspaceRoot, ".projectos", "skills")
      ? relative(workspaceRoot, skillsRoot) || undefined
      : undefined;
  return SkillDescriptorSchema.parse({
    id,
    name,
    description,
    rootPath: skillDir,
    skillFilePath,
    ...(paths ? { paths } : {}),
    ...(frontmatter["disable-model-invocation"] === true ||
    frontmatter.disableModelInvocation === true
      ? { disableModelInvocation: true }
      : {}),
    ...(frontmatter["usable-as-mode"] === true || frontmatter.usableAsMode === true
      ? { usableAsMode: true }
      : {}),
    ...(typeof frontmatter.icon === "string" ? { icon: frontmatter.icon } : {}),
    ...(typeof frontmatter.color === "string" ? { color: frontmatter.color } : {}),
    ...(scopeRoot ? { scopeRoot } : {}),
  });
}

export function listProjectSkills(workspaceRoot: string): SkillDescriptor[] {
  const skillsRoot = join(workspaceRoot, ".projectos", "skills");
  const skillFiles: string[] = [];
  collectSkillFiles(skillsRoot, skillsRoot, skillFiles);
  return skillFiles
    .map((file) => toDescriptor(file, skillsRoot, workspaceRoot))
    .filter((item): item is SkillDescriptor => item !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getProjectSkill(
  workspaceRoot: string,
  skillId: string,
): SkillContent | null {
  const skills = listProjectSkills(workspaceRoot);
  const descriptor = skills.find((skill) => skill.id === skillId);
  if (!descriptor) return null;
  const raw = readFileSync(descriptor.skillFilePath, "utf8");
  const { body } = parseFrontmatter(raw);
  return SkillContentSchema.parse({ descriptor, body: body.trim() });
}

export function filterSkillsForPath(
  skills: SkillDescriptor[],
  relativeFilePath?: string,
): SkillDescriptor[] {
  if (!relativeFilePath) return skills;
  return skills.filter((skill) => {
    if (!skill.paths?.length) return true;
    return skill.paths.some((pattern) => matchGlob(pattern, relativeFilePath));
  });
}

function matchGlob(pattern: string, path: string): boolean {
  const regex = new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/gu, "\\$&")
      .replace(/\*\*/gu, ".*")
      .replace(/\*/gu, "[^/]*")
      .replace(/\?/gu, ".")}$`,
    "u",
  );
  return regex.test(path);
}

export function seedBuiltinSkillsIfNeeded(workspaceRoot: string): void {
  const skillsRoot = join(workspaceRoot, ".projectos", "skills");
  if (existsSync(skillsRoot) && readdirSync(skillsRoot).length > 0) return;
  // Seeding handled by project template / skills-seed todo
}

export class SkillInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillInstallError";
  }
}

/** Normalize catalog listing id into a single path segment under .projectos/skills. */
export function safeSkillInstallId(listingId: string): string {
  const slug = listingId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  if (!slug || slug === "." || slug === ".." || slug.includes("..")) {
    throw new SkillInstallError(`Invalid skill listing id '${listingId}'`);
  }
  return slug;
}

export function projectSkillsRoot(workspaceRoot: string): string {
  return join(workspaceRoot, ".projectos", "skills");
}

export function skillExists(workspaceRoot: string, listingId: string): boolean {
  const id = safeSkillInstallId(listingId);
  const skillFile = join(projectSkillsRoot(workspaceRoot), id, SKILL_FILE);
  return existsSync(skillFile);
}

function assertContainedPath(root: string, candidate: string): string {
  const resolvedRoot = resolve(root);
  const resolved = resolve(candidate);
  const prefix = resolvedRoot.endsWith(sep) ? resolvedRoot : `${resolvedRoot}${sep}`;
  if (resolved !== resolvedRoot && !resolved.startsWith(prefix)) {
    throw new SkillInstallError("Skill install path escapes skills root");
  }
  return resolved;
}

/** Remove a catalog-installed skill directory under `.projectos/skills/<id>/`. */
export function uninstallProjectSkill(input: {
  workspaceRoot: string;
  listingId: string;
}): void {
  const id = safeSkillInstallId(input.listingId);
  const skillsRoot = projectSkillsRoot(input.workspaceRoot);
  const skillDir = assertContainedPath(skillsRoot, join(skillsRoot, id));
  if (!existsSync(skillDir)) {
    throw new SkillInstallError(`Skill '${id}' is not installed`);
  }
  rmSync(skillDir, { recursive: true, force: true });
}

/** Install a catalog listing into `.projectos/skills/<id>/`. */
export function installProjectSkill(input: {
  workspaceRoot: string;
  listing: SkillCatalogListing;
  replace?: boolean;
}): SkillDescriptor {
  const id = safeSkillInstallId(input.listing.id);
  const skillsRoot = projectSkillsRoot(input.workspaceRoot);
  mkdirSync(skillsRoot, { recursive: true });
  const skillDir = assertContainedPath(skillsRoot, join(skillsRoot, id));
  const skillFile = join(skillDir, SKILL_FILE);
  if (existsSync(skillFile) && input.replace !== true) {
    throw new SkillInstallError(
      `Skill '${id}' already exists. Pass replace: true to overwrite.`,
    );
  }
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(skillFile, input.listing.skillMarkdown, "utf8");
  if (input.listing.files) {
    for (const [rel, contents] of Object.entries(input.listing.files)) {
      if (
        !rel.trim() ||
        rel.includes("\0") ||
        rel.startsWith("/") ||
        rel.includes("..") ||
        rel.includes("\\")
      ) {
        throw new SkillInstallError(`Unsafe companion file path '${rel}'`);
      }
      const target = assertContainedPath(skillDir, join(skillDir, rel));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents, "utf8");
    }
  }
  const descriptor = toDescriptor(skillFile, skillsRoot, input.workspaceRoot);
  if (!descriptor) {
    throw new SkillInstallError(`Installed skill '${id}' failed to parse`);
  }
  return descriptor;
}

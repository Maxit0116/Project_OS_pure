import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

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

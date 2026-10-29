/** Shape-compatible with PinComposerHubReference (kept local to avoid import cycles). */
export type HubReferenceLike =
  | {
      kind: "image" | "video" | "audio";
      id: string;
      assetPath?: string;
      url?: string;
      label?: string;
    }
  | { kind: "file"; id: string; path: string; label?: string }
  | { kind: "url"; id: string; url: string; label?: string; folderId?: string }
  | {
      kind: "github";
      id: string;
      url: string;
      owner?: string;
      repo?: string;
      ref?: string;
      label?: string;
      folderId?: string;
    };

export interface PickedReferenceFile {
  path: string;
  name: string;
  ext: string;
}

export interface ParsedGithubUrl {
  url: string;
  owner: string;
  repo: string;
  ref?: string;
}

const GITHUB_HOST = /^(?:www\.)?github\.com$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv)(?:[?#]|$)/i;
const AUDIO_EXT = /\.(mp3|wav|aac|m4a|ogg|flac)(?:[?#]|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)(?:[?#]|$)/i;

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "avif",
  "bmp",
]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "m4v", "mkv"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "aac", "m4a", "ogg", "flac"]);

/** Classify a Finder-picked local path into a hub reference. */
export function createHubReferenceFromPickedFile(
  file: PickedReferenceFile,
  id = `ref_${crypto.randomUUID().slice(0, 8)}`,
): HubReferenceLike {
  const ext = file.ext.replace(/^\./, "").toLowerCase();
  const label = file.name;
  if (IMAGE_EXTS.has(ext)) {
    return { kind: "image", id, assetPath: file.path, label };
  }
  if (VIDEO_EXTS.has(ext)) {
    return { kind: "video", id, assetPath: file.path, label };
  }
  if (AUDIO_EXTS.has(ext)) {
    return { kind: "audio", id, assetPath: file.path, label };
  }
  return { kind: "file", id, path: file.path, label };
}

/** Normalize user paste into an http(s) URL when possible. */
export function normalizeReferenceInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^github\.com\//i.test(trimmed) || /^www\.github\.com\//i.test(trimmed)) {
    return `https://${trimmed.replace(/^www\./i, "")}`;
  }
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:@[\w./-]+)?$/.test(trimmed)) {
    const [repoPart, ref] = trimmed.split("@");
    const [owner, repo] = repoPart!.split("/");
    const base = `https://github.com/${owner}/${repo}`;
    return ref ? `${base}/tree/${ref}` : base;
  }
  return trimmed;
}

export function parseGithubUrl(raw: string): ParsedGithubUrl | null {
  const normalized = normalizeReferenceInput(raw);
  try {
    const parsed = new URL(normalized);
    if (!GITHUB_HOST.test(parsed.hostname)) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0]!;
    const repo = parts[1]!.replace(/\.git$/i, "");
    let ref: string | undefined;
    if (parts[2] === "tree" || parts[2] === "blob" || parts[2] === "commit") {
      ref = parts[3];
    }
    return {
      url: `https://github.com/${owner}/${repo}${ref ? `/tree/${ref}` : ""}`,
      owner,
      repo,
      ...(ref ? { ref } : {}),
    };
  } catch {
    return null;
  }
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^github\.com\//i.test(value);
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

/**
 * Classify pasted text into a hub reference.
 * GitHub wins over generic URL; media extensions pick video/audio/image.
 */
export function createHubReferenceFromInput(
  raw: string,
  id = `ref_${crypto.randomUUID().slice(0, 8)}`,
  options?: { folderId?: string },
): HubReferenceLike | null {
  const normalized = normalizeReferenceInput(raw);
  if (!normalized) return null;

  const github = parseGithubUrl(normalized);
  if (github) {
    return {
      kind: "github",
      id,
      url: github.url,
      owner: github.owner,
      repo: github.repo,
      ...(github.ref ? { ref: github.ref } : {}),
      label: `${github.owner}/${github.repo}`,
      ...(options?.folderId ? { folderId: options.folderId } : {}),
    };
  }

  if (looksLikeUrl(normalized)) {
    let url = normalized;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      void new URL(url);
    } catch {
      return null;
    }
    if (VIDEO_EXT.test(url)) {
      return { kind: "video", id, url, label: url.split("/").pop() };
    }
    if (AUDIO_EXT.test(url)) {
      return { kind: "audio", id, url, label: url.split("/").pop() };
    }
    if (IMAGE_EXT.test(url)) {
      return { kind: "image", id, url, label: url.split("/").pop() };
    }
    return {
      kind: "url",
      id,
      url,
      label: hostLabel(url),
      ...(options?.folderId ? { folderId: options.folderId } : {}),
    };
  }

  return null;
}

export function formatHubReferenceToken(ref: HubReferenceLike): string {
  switch (ref.kind) {
    case "image":
      return ref.url
        ? `image-url:${ref.url}`
        : `image:${ref.assetPath ?? ""}`;
    case "video":
      return ref.url
        ? `video-url:${ref.url}`
        : `video:${ref.assetPath ?? ""}`;
    case "audio":
      return ref.url
        ? `audio-url:${ref.url}`
        : `audio:${ref.assetPath ?? ""}`;
    case "file":
      return `file:${ref.path}`;
    case "url":
      return `url:${ref.url}`;
    case "github":
      return `github:${ref.owner && ref.repo ? `${ref.owner}/${ref.repo}` : ref.url}${ref.ref ? `@${ref.ref}` : ""}`;
    default:
      return "reference:unknown";
  }
}

/** Human + agent-facing lines that stay in prompt context. */
export function formatHubReferenceContextLines(
  references: readonly HubReferenceLike[],
): string[] {
  if (references.length === 0) return [];
  const lines = [
    "Treat the following as durable reference context for this task. Prefer aligning implementation with these sources (GitHub repos and websites included); do not ignore them.",
  ];
  for (const ref of references) {
    switch (ref.kind) {
      case "github":
        lines.push(
          `- GitHub reference: ${ref.url}` +
            (ref.owner && ref.repo
              ? ` (${ref.owner}/${ref.repo}${ref.ref ? `@${ref.ref}` : ""})`
              : "") +
            (ref.label ? ` — ${ref.label}` : "") +
            ". This is an external reference repository for design/code context only — do not treat it as the writable working checkout (that is hub.repo).",
        );
        break;
      case "url":
        lines.push(
          `- Website reference: ${ref.url}${ref.label ? ` — ${ref.label}` : ""}. Use this site as product/docs context.`,
        );
        break;
      case "image":
        lines.push(
          `- Image reference: ${ref.url ?? ref.assetPath ?? ""}${ref.label ? ` — ${ref.label}` : ""}`,
        );
        break;
      case "video":
        lines.push(
          `- Video reference: ${ref.url ?? ref.assetPath ?? ""}${ref.label ? ` — ${ref.label}` : ""}`,
        );
        break;
      case "audio":
        lines.push(
          `- Audio reference: ${ref.url ?? ref.assetPath ?? ""}${ref.label ? ` — ${ref.label}` : ""}`,
        );
        break;
      case "file":
        lines.push(
          `- Workspace file reference: ${ref.path}${ref.label ? ` — ${ref.label}` : ""}`,
        );
        break;
    }
  }
  return lines;
}

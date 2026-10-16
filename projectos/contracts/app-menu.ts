export const APP_MENU_SIMPLE_COMMAND_IDS = [
  "open-settings",
  "open-folder",
  "save",
  "close-editor",
  "command-palette",
  "go-to-file",
  "toggle-left-panel",
  "show-function-map",
  "show-agent-flow",
  "show-code",
  "toggle-bottom-panel",
  "show-activity",
  "show-services",
  "show-diagnostics",
  "split-editor-right",
  "split-editor-down",
  "find",
  "replace",
  "go-to-line",
  "terminal-new",
  "terminal-kill",
  "terminal-split-right",
  "terminal-split-down",
  "terminal-next",
  "terminal-previous",
  "show-keyboard-shortcuts",
  "spatial-pin",
] as const;

export type AppMenuSimpleCommandId = (typeof APP_MENU_SIMPLE_COMMAND_IDS)[number];

export type AppMenuCommand =
  | { id: AppMenuSimpleCommandId }
  | { id: "open-recent"; path: string };

export interface AppMenuRecentWorkspace {
  name: string;
  path: string;
}

export interface AppMenuState {
  locale: "en" | "zh";
  recentWorkspaces: AppMenuRecentWorkspace[];
  workspaceOpen: boolean;
  hasActiveEditor: boolean;
  /** Absolute workspace open in the window that published this state. */
  workspacePath: string | null;
}

const MAX_RECENT_WORKSPACES = 5;
const MAX_NAME_LENGTH = 120;
const MAX_PATH_LENGTH = 4096;

const SIMPLE_COMMAND_IDS = new Set<string>(APP_MENU_SIMPLE_COMMAND_IDS);

export function parseAppMenuState(input: unknown): AppMenuState | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  if (record.locale !== "en" && record.locale !== "zh") return null;
  if (typeof record.workspaceOpen !== "boolean") return null;
  if (typeof record.hasActiveEditor !== "boolean") return null;
  if (!Array.isArray(record.recentWorkspaces)) return null;
  if (record.recentWorkspaces.length > MAX_RECENT_WORKSPACES) return null;

  const recentWorkspaces: AppMenuRecentWorkspace[] = [];
  for (const item of record.recentWorkspaces) {
    const recent = parseRecentWorkspace(item);
    if (!recent) return null;
    recentWorkspaces.push(recent);
  }
  const workspacePath = parseWorkspacePath(record.workspacePath);
  if (workspacePath === undefined) return null;

  return {
    locale: record.locale,
    recentWorkspaces,
    workspaceOpen: record.workspaceOpen,
    hasActiveEditor: record.hasActiveEditor,
    workspacePath,
  };
}

function parseWorkspacePath(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const path = value.trim();
  if (!path) return null;
  if (!isSafePath(path)) return undefined;
  return path;
}

export function parseAppMenuCommand(input: unknown): AppMenuCommand | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  if (typeof record.id !== "string") return null;
  if (record.id === "open-recent") {
    if (typeof record.path !== "string") return null;
    const path = record.path.trim();
    if (!isSafePath(path)) return null;
    return { id: "open-recent", path };
  }
  if (!SIMPLE_COMMAND_IDS.has(record.id)) return null;
  return { id: record.id as AppMenuSimpleCommandId };
}

function parseRecentWorkspace(input: unknown): AppMenuRecentWorkspace | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  if (typeof record.name !== "string" || typeof record.path !== "string") return null;
  const name = record.name.trim();
  const path = record.path.trim();
  if (!name || name.length > MAX_NAME_LENGTH || /[\u0000-\u001f]/.test(name)) return null;
  if (!isSafePath(path)) return null;
  return { name, path };
}

function isSafePath(path: string): boolean {
  return path.length > 0 && path.length <= MAX_PATH_LENGTH && !/[\u0000-\u001f]/.test(path);
}

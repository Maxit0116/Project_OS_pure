import type {
  AgentAskLanguage,
  AgentResponseLanguage,
} from "../contracts/agent-conversation.js";

type ScriptFamily =
  | "arabic"
  | "cyrillic"
  | "devanagari"
  | "greek"
  | "han"
  | "hangul"
  | "hebrew"
  | "kana"
  | "latin"
  | "thai";

export interface ResolvedResponseLanguage {
  tag: string;
  source: AgentResponseLanguage["source"];
  expectedScripts: ScriptFamily[];
}

export type LanguageMatch = "passed" | "mismatch" | "not_checkable";

const SCRIPT_PATTERNS: Record<ScriptFamily, RegExp> = {
  arabic: /\p{Script=Arabic}/gu,
  cyrillic: /\p{Script=Cyrillic}/gu,
  devanagari: /\p{Script=Devanagari}/gu,
  greek: /\p{Script=Greek}/gu,
  han: /\p{Script=Han}/gu,
  hangul: /\p{Script=Hangul}/gu,
  hebrew: /\p{Script=Hebrew}/gu,
  kana: /[\p{Script=Hiragana}\p{Script=Katakana}]/gu,
  latin: /\p{Script=Latin}/gu,
  thai: /\p{Script=Thai}/gu,
};

const LANGUAGE_SCRIPTS: Record<string, ScriptFamily[]> = {
  ar: ["arabic"],
  be: ["cyrillic"],
  bg: ["cyrillic"],
  el: ["greek"],
  fa: ["arabic"],
  he: ["hebrew"],
  hi: ["devanagari"],
  ja: ["kana", "han"],
  kk: ["cyrillic"],
  ko: ["hangul", "han"],
  mk: ["cyrillic"],
  ru: ["cyrillic"],
  sr: ["cyrillic"],
  th: ["thai"],
  uk: ["cyrillic"],
  ur: ["arabic"],
  zh: ["han"],
};

export function resolveResponseLanguage(
  input: string,
  preference: AgentAskLanguage = { mode: "auto" },
): ResolvedResponseLanguage {
  if (preference.mode === "override") {
    const tag = Intl.getCanonicalLocales(preference.tag)[0]!;
    return {
      tag,
      source: "override",
      expectedScripts: scriptsForLanguageTag(tag),
    };
  }

  const detected = detectHighConfidenceLanguage(input);
  if (detected) {
    return {
      tag: detected,
      source: "detected",
      expectedScripts: scriptsForLanguageTag(detected),
    };
  }
  return { tag: "und", source: "undetermined", expectedScripts: [] };
}

export function responseLanguageInstruction(
  language: ResolvedResponseLanguage,
): string {
  return responseLanguageInstructionForTag(language.tag);
}

export function responseLanguageInstructionForTag(tag: string): string {
  return tag === "und"
    ? "Respond in the same language as the user's input. Do not assume Latin-script input is English."
    : `Respond in ${tag}. Preserve code identifiers and syntax exactly.`;
}

export function validateGrossLanguageMatch(
  output: string,
  language: ResolvedResponseLanguage,
): LanguageMatch {
  if (language.expectedScripts.length === 0) {
    return "not_checkable";
  }
  // This is deliberately a coarse script-family check, not language
  // identification. Latin script alone cannot distinguish English from
  // Spanish, French, or other Latin-script languages, so claiming a pass
  // would overstate the guarantee. Callers surface `not_checkable` honestly.
  if (
    language.expectedScripts.length === 1 &&
    language.expectedScripts[0] === "latin"
  ) {
    return "not_checkable";
  }
  const counts = countScripts(stripTechnicalSegments(output));
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (total < 4) {
    return "not_checkable";
  }
  const expectedCount = language.expectedScripts.reduce(
    (sum, script) => sum + (counts.get(script) ?? 0),
    0,
  );
  if (expectedCount / total >= 0.5) {
    return "passed";
  }
  const dominant = Math.max(...counts.values());
  return dominant >= 4 && dominant / total >= 0.6
    ? "mismatch"
    : "not_checkable";
}

function detectHighConfidenceLanguage(input: string): string | undefined {
  const counts = countScripts(stripTechnicalSegments(input));
  if ((counts.get("kana") ?? 0) >= 2) return "ja";
  if ((counts.get("hangul") ?? 0) >= 2) return "ko";
  if ((counts.get("han") ?? 0) >= 2) return "zh";
  if ((counts.get("cyrillic") ?? 0) >= 4) return "ru";
  if ((counts.get("arabic") ?? 0) >= 4) return "ar";
  if ((counts.get("hebrew") ?? 0) >= 4) return "he";
  if ((counts.get("devanagari") ?? 0) >= 4) return "hi";
  if ((counts.get("greek") ?? 0) >= 4) return "el";
  if ((counts.get("thai") ?? 0) >= 4) return "th";
  return undefined;
}

function scriptsForLanguageTag(tag: string): ScriptFamily[] {
  const locale = new Intl.Locale(tag);
  const explicitScript = locale.script?.toLowerCase();
  if (explicitScript === "cyrl") return ["cyrillic"];
  if (explicitScript === "arab") return ["arabic"];
  if (explicitScript === "deva") return ["devanagari"];
  if (explicitScript === "grek") return ["greek"];
  if (explicitScript === "hani" || explicitScript === "hans" || explicitScript === "hant") {
    return ["han"];
  }
  if (explicitScript === "hebr") return ["hebrew"];
  if (explicitScript === "latn") return ["latin"];
  if (explicitScript === "thai") return ["thai"];
  return LANGUAGE_SCRIPTS[locale.language] ?? ["latin"];
}

function countScripts(input: string): Map<ScriptFamily, number> {
  return new Map(
    (Object.entries(SCRIPT_PATTERNS) as Array<[ScriptFamily, RegExp]>).map(
      ([script, pattern]) => [script, input.match(pattern)?.length ?? 0],
    ),
  );
}

function stripTechnicalSegments(input: string): string {
  return input
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/`[^`]*`/gu, " ")
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/\[(?:REDACTED|PATH)\]/gu, " ")
    .replace(/\b\S*[\\/_.{}()[\]<>:=]\S*\b/gu, " ");
}

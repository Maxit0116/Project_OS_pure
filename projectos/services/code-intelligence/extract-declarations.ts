import type {
  CodeIntelligenceLanguage,
  CodeSymbol,
  CodeSymbolKind,
} from "../../contracts/code-intelligence.js";
import { symbolId, type ExtractedExports } from "./extract-exports.js";

/**
 * The public declarations of a file in a language the TypeScript compiler does not read. Symbol
 * lookup, a file's referrers and its tests were TypeScript and JavaScript only, so an Agent edit to
 * a Python, Go or Java file was given no list of the files that use it. This reads declarations from
 * the text, by each language's own rule for what other files can use: names without a leading
 * underscore in Python, capitalised names in Go, `pub` in Rust, `public` (or Kotlin's default) in the
 * JVM languages and C#. It is approximate and never fails.
 */
export function extractDeclaredSymbols(
  path: string,
  source: string,
  contentHash: string,
  language: CodeIntelligenceLanguage,
): ExtractedExports {
  const found: Array<{ name: string; kind: CodeSymbolKind; line: number }> = [];
  const lines = source.split("\n");
  const add = (name: string | undefined, kind: CodeSymbolKind, line: number) => {
    if (name) found.push({ name, kind, line });
  };
  lines.forEach((text, index) => {
    const line = index + 1;
    switch (language) {
      case "python":
        pythonDeclaration(text, line, add);
        break;
      case "go":
        goDeclaration(text, line, add);
        break;
      case "rust":
        rustDeclaration(text, line, add);
        break;
      case "java":
      case "csharp":
      case "kotlin":
      case "scala":
      case "swift":
        jvmLikeDeclaration(text, line, language, add);
        break;
      case "ruby":
        rubyDeclaration(text, line, add);
        break;
      case "php":
        phpDeclaration(text, line, add);
        break;
      default:
        break;
    }
  });
  const seen = new Set<string>();
  const symbols: CodeSymbol[] = [];
  for (const item of found) {
    const id = symbolId(path, item.kind, item.name, item.line);
    if (seen.has(id)) continue;
    seen.add(id);
    symbols.push({ id, kind: item.kind, name: item.name, path, startLine: item.line, exported: true, contentHash });
  }
  symbols.sort((left, right) => left.startLine - right.startLine || (left.name < right.name ? -1 : 1));
  return { symbols, omissions: [] };
}

type Add = (name: string | undefined, kind: CodeSymbolKind, line: number) => void;

function pythonDeclaration(text: string, line: number, add: Add): void {
  // Module level only: a method is reached through its class.
  const definition = /^(?:async\s+)?def\s+([A-Za-z_]\w*)/u.exec(text);
  if (definition && !definition[1]!.startsWith("_")) return add(definition[1], "function", line);
  const type = /^class\s+([A-Za-z_]\w*)/u.exec(text);
  if (type && !type[1]!.startsWith("_")) return add(type[1], "class", line);
  const constant = /^([A-Z][A-Z0-9_]+)\s*(?::[^=]+)?=(?!=)/u.exec(text);
  if (constant) add(constant[1], "const", line);
}

const exportedGo = (name: string | undefined) => (name && /^[A-Z]/u.test(name) ? name : undefined);

function goDeclaration(text: string, line: number, add: Add): void {
  const fn = /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*[[(]/u.exec(text);
  if (fn) return add(exportedGo(fn[1]), "function", line);
  const type = /^type\s+([A-Za-z_]\w*)\s+(struct|interface)?/u.exec(text);
  if (type) return add(exportedGo(type[1]), type[2] === "struct" ? "class" : type[2] === "interface" ? "interface" : "type", line);
  const value = /^(?:const|var)\s+([A-Za-z_]\w*)/u.exec(text);
  if (value) add(exportedGo(value[1]), "const", line);
}

function rustDeclaration(text: string, line: number, add: Add): void {
  const match = /^pub(?:\([^)]*\))?\s+(?:async\s+)?(?:unsafe\s+)?(?:const\s+fn\s+|extern\s+"[^"]*"\s+fn\s+)?(fn|struct|enum|trait|type|const|static|mod)\s+([A-Za-z_]\w*)/u.exec(text);
  if (!match) return;
  const kind: Record<string, CodeSymbolKind> = {
    fn: "function", struct: "class", enum: "enum", trait: "interface", type: "type", const: "const", static: "const", mod: "type",
  };
  add(match[2], kind[match[1]!]!, line);
}

const JVM_TYPE: Record<string, CodeSymbolKind> = {
  class: "class", record: "class", struct: "class", object: "class", interface: "interface", trait: "interface",
  protocol: "interface", enum: "enum",
};

function jvmLikeDeclaration(text: string, line: number, language: CodeIntelligenceLanguage, add: Add): void {
  const indent = (/^[ \t]*/u.exec(text)?.[0] ?? "").replace(/\t/gu, "    ").length;
  const modifiers = /^\s*((?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|private|protected|internal|static|final|abstract|sealed|open|data|partial|override|inline|suspend|readonly|virtual|async|enum|case|annotation|value|fileprivate)\s+)*)/u.exec(text)?.[1] ?? "";
  const hidden = /\b(?:private|protected|fileprivate)\b/u.test(modifiers) || (language === "csharp" && /\binternal\b/u.test(modifiers));
  // Java and C# need `public`; Kotlin, Scala and Swift are public unless they say otherwise.
  const publicByDefault = language === "kotlin" || language === "scala" || language === "swift";
  const visible = !hidden && (publicByDefault || /\bpublic\b/u.test(modifiers));
  const type = /^\s*(?:@\w+(?:\([^)]*\))?\s+)*(?:[a-z]+\s+)*(class|interface|enum|record|struct|object|trait|protocol)\s+([A-Za-z_]\w*)/u.exec(text);
  if (type && visible && indent <= 4) return add(type[2], /\benum\s+class\b/u.test(text) ? "enum" : JVM_TYPE[type[1]!]!, line);
  if (!visible || indent > 8) return;
  const kotlinFunction = /^\s*(?:[a-z]+\s+)*(?:fun|def|func)\s+(?:<[^>]*>\s*)?(?:[A-Za-z_][\w.]*\.)?([A-Za-z_]\w*)\s*[(<[]/u.exec(text);
  if (kotlinFunction) return add(kotlinFunction[1], "function", line);
  const method = /^\s*(?:[a-z]+\s+)*(?:<[^>]+>\s+)?[\w<>[\],.?]+\s+([A-Za-z_]\w*)\s*\([^;]*$/u.exec(text);
  if (method && !["if", "for", "while", "switch", "catch", "return", "new", "throw"].includes(method[1]!)) {
    add(method[1], "function", line);
  }
}

function rubyDeclaration(text: string, line: number, add: Add): void {
  const type = /^\s{0,2}(class|module)\s+([A-Z]\w*(?:::[A-Z]\w*)*)/u.exec(text);
  if (type) return add(type[2]!.split("::").at(-1), "class", line);
  const method = /^\s{0,4}def\s+(?:self\.)?([a-z_]\w*[?!=]?)/u.exec(text);
  if (method && !method[1]!.startsWith("_")) add(method[1], "function", line);
}

function phpDeclaration(text: string, line: number, add: Add): void {
  const type = /^\s*(?:(?:abstract|final|readonly)\s+)*(class|interface|trait|enum)\s+([A-Za-z_]\w*)/u.exec(text);
  if (type) return add(type[2], type[1] === "interface" || type[1] === "trait" ? "interface" : type[1] === "enum" ? "enum" : "class", line);
  const fn = /^\s*(?:(?:public|static|final|abstract)\s+)*function\s+&?([A-Za-z_]\w*)/u.exec(text);
  if (fn && !/^\s*(?:private|protected)\b/u.test(text) && !fn[1]!.startsWith("__")) add(fn[1], "function", line);
}

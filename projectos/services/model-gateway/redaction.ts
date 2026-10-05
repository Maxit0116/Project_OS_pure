import { redactHighConfidenceSecrets } from "../high-confidence-secret-patterns.js";

export function redactText(
  text: string,
  policy: "none" | "local_paths_only" | "secrets_and_paths",
): string {
  if (policy === "none") {
    return text;
  }

  let redacted = text;
  if (policy === "secrets_and_paths" || policy === "local_paths_only") {
    redacted = redactPaths(redacted);
  }
  if (policy === "secrets_and_paths") {
    redacted = redactHighConfidenceSecrets(redacted);
  }
  return redacted;
}

function redactPaths(text: string): string {
  return text.replace(
    /(?:\/Users\/|\/home\/|\/var\/|\/tmp\/|C:\\)[^\s"'`]+/gu,
    "[PATH]",
  );
}

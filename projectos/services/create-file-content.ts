import { ProjectOSError } from "../errors.js";

export const CREATE_FILE_MAX_BYTES = 262_144;

export function validateCreateFileContent(content: string, path: string): Uint8Array {
  const bytes = new TextEncoder().encode(content);
  const roundTrip = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (
    !path ||
    !content.trim() ||
    content.includes("\0") ||
    hasUnpairedSurrogate(content) ||
    roundTrip !== content ||
    bytes.byteLength > CREATE_FILE_MAX_BYTES
  ) {
    throw new ProjectOSError(
      "diff_apply_unsupported",
      `Created file '${path}' must be non-empty bounded UTF-8 text`,
    );
  }
  return bytes;
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

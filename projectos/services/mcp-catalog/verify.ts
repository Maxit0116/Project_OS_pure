import { createPublicKey, verify } from "node:crypto";

export class McpCatalogSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpCatalogSignatureError";
  }
}

/** Verify Ed25519 SPKI public key (base64) over exact UTF-8 catalog body bytes. */
export function verifyMcpCatalogSignature(input: {
  bodyUtf8: string;
  signatureBase64: string;
  publicKeySpkiBase64: string;
}): void {
  let publicKey;
  try {
    publicKey = createPublicKey({
      key: Buffer.from(input.publicKeySpkiBase64.trim(), "base64"),
      format: "der",
      type: "spki",
    });
  } catch (error) {
    throw new McpCatalogSignatureError(
      `Invalid catalog public key: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  let signature: Buffer;
  try {
    signature = Buffer.from(input.signatureBase64.trim(), "base64");
  } catch {
    throw new McpCatalogSignatureError("Catalog signature is not valid base64");
  }
  if (signature.length === 0) {
    throw new McpCatalogSignatureError("Catalog signature is empty");
  }
  const ok = verify(
    null,
    Buffer.from(input.bodyUtf8, "utf8"),
    publicKey,
    signature,
  );
  if (!ok) {
    throw new McpCatalogSignatureError("Catalog signature verification failed");
  }
}

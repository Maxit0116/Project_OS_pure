import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  McpCatalogSignatureError,
  verifyMcpCatalogSignature,
} from "./verify.js";
import {
  readBundledCatalogBody,
  readBundledCatalogPublicKey,
  readBundledCatalogSignature,
} from "./bundled-assets.js";

describe("verifyMcpCatalogSignature", () => {
  it("accepts the bundled catalog signature", () => {
    expect(() =>
      verifyMcpCatalogSignature({
        bodyUtf8: readBundledCatalogBody(),
        signatureBase64: readBundledCatalogSignature(),
        publicKeySpkiBase64: readBundledCatalogPublicKey(),
      }),
    ).not.toThrow();
  });

  it("rejects tampered bodies", () => {
    expect(() =>
      verifyMcpCatalogSignature({
        bodyUtf8: `${readBundledCatalogBody()}\n`,
        signatureBase64: readBundledCatalogSignature(),
        publicKeySpkiBase64: readBundledCatalogPublicKey(),
      }),
    ).toThrow(McpCatalogSignatureError);
  });

  it("rejects signatures from another key", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const body = readBundledCatalogBody();
    const badSig = sign(null, Buffer.from(body, "utf8"), privateKey).toString(
      "base64",
    );
    expect(() =>
      verifyMcpCatalogSignature({
        bodyUtf8: body,
        signatureBase64: badSig,
        publicKeySpkiBase64: readBundledCatalogPublicKey(),
      }),
    ).toThrow(McpCatalogSignatureError);
  });
});

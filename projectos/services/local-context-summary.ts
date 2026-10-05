import type { ContextAssembledPayload } from "../contracts/events.js";
import type { AgentContextBundle } from "../contracts/local-context.js";

export function summarizeLocalContext(
  context: AgentContextBundle,
): ContextAssembledPayload {
  if ("projectName" in context) {
    return {
      files: [],
      synopsisPresent: Boolean(context.conciseDescription.trim() || context.topLevelNodes.length),
      bundleHash: context.bundleHash,
    };
  }
  const localContext = context;
  return {
    files: localContext.fileManifest.map((file) => ({
      path: file.path,
      disposition: file.disposition,
      ...(file.byteLength === undefined ? {} : { byteLength: file.byteLength }),
      ...(file.includedByteLength === undefined
        ? {}
        : { includedByteLength: file.includedByteLength }),
      ...(file.omissionReason === undefined
        ? {}
        : { omissionReason: file.omissionReason }),
    })),
    synopsisPresent: localContext.project.synopsis.trim().length > 0,
    childrenCoverage: {
      totalCount: localContext.neighborhood.childrenCoverage.totalCount,
      includedCount: localContext.neighborhood.childrenCoverage.includedCount,
      omittedCount: localContext.neighborhood.childrenCoverage.omittedCount,
    },
    bundleHash: localContext.bundleHash,
  };
}

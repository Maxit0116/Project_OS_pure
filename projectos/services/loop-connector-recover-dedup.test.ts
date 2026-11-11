import { describe, expect, it } from "vitest";

import {
  dedupeConnectorIds,
  recoverConnectorCursor,
} from "./loop-connector-recover-dedup.js";

describe("connector recover / dedup", () => {
  it("returns only novel ids and grows seen set", () => {
    const first = dedupeConnectorIds({ seenIds: ["a"] }, ["a", "b", "c"]);
    expect(first.novel).toEqual(["b", "c"]);
    const second = dedupeConnectorIds(first.state, ["c", "d"]);
    expect(second.novel).toEqual(["d"]);
  });

  it("clears cursor on resync recover while retaining recent seen ids", () => {
    const recovered = recoverConnectorCursor(
      { seenIds: ["1", "2", "3"], cursor: "hist_9" },
      "resync_required",
    );
    expect(recovered.cursor).toBeUndefined();
    expect(recovered.seenIds).toEqual(["1", "2", "3"]);
  });
});

import { describe, expect, it } from "vitest";

import {
  ComposerDraftSchema,
  emptyComposerDraft,
  normalizeComposerDraft,
  PromptAttachmentSchema,
} from "./prompt-composer.js";

describe("prompt-composer contracts", () => {
  it("round-trips composer draft", () => {
    const draft = {
      text: "fix the bug",
      attachments: [
        {
          id: "att_1",
          label: "auth.ts",
          ref: { kind: "file" as const, path: "src/auth.ts" },
        },
      ],
      invokedSkillId: "review-change",
    };
    expect(ComposerDraftSchema.parse(draft)).toEqual(draft);
  });

  it("normalizes legacy string draft input", () => {
    expect(normalizeComposerDraft("hello")).toEqual(emptyComposerDraft("hello"));
  });

  it("fills missing attachments for partial draft objects", () => {
    expect(normalizeComposerDraft({ text: "" })).toEqual(emptyComposerDraft());
  });

  it("accepts git and terminal refs", () => {
    const attachment = PromptAttachmentSchema.parse({
      id: "att_git",
      label: "Working changes",
      ref: { kind: "git_working" },
    });
    expect(attachment.ref.kind).toBe("git_working");
  });
});

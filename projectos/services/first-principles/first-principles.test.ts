import { describe, expect, it } from "vitest";

import {
  looksLikeVisionPrompt,
  type FirstPrinciplesThesis,
} from "../../contracts/first-principles.js";
import {
  answerFirstPrinciplesTurn,
  buildHandoffPayload,
  confirmFirstPrinciplesThesis,
  createFirstPrinciplesSession,
} from "./session-ops.js";

describe("looksLikeVisionPrompt", () => {
  it("detects fuzzy feature impulses", () => {
    expect(looksLikeVisionPrompt("我想加一个 AI 助手，感觉会很酷")).toBe(true);
  });

  it("ignores concrete file questions", () => {
    expect(
      looksLikeVisionPrompt("这个函数 src/foo.ts 做什么？"),
    ).toBe(false);
  });
});

describe("first principles session flow", () => {
  it("walks L0–L4 to thesis_review then concludes go", () => {
    let session = createFirstPrinciplesSession({
      projectId: "proj_1",
      vision: "我想加一个订阅功能，感觉会很酷",
    });
    expect(session.status).toBe("layer_active");
    expect(session.activeQuestion?.layerId).toBe("L0");

    const picks = [
      "l0_user_pain",
      "l1_save_time",
      "l2_pass",
      "l3_single_happy",
      "l4_skip_diagram",
    ];
    for (const optionId of picks) {
      const question = session.activeQuestion!;
      session = answerFirstPrinciplesTurn(session, {
        questionId: question.id,
        kind: "option",
        selectedOptionId: optionId,
      });
    }
    expect(session.status).toBe("thesis_review");
    expect(session.thesis?.verdict).toBe("go");

    const thesis: FirstPrinciplesThesis = {
      ...session.thesis!,
      confidence: 4,
      verdict: "go",
    };
    session = confirmFirstPrinciplesThesis(session, thesis);
    expect(session.status).toBe("concluded");

    const handoff = buildHandoffPayload(session, "plan");
    expect(handoff.brief).toContain("Verdict: go");
    expect(handoff.clarifyingAnswers.length).toBeGreaterThan(0);
  });

  it("kill path refuses plan handoff", () => {
    let session = createFirstPrinciplesSession({
      projectId: "proj_1",
      vision: "随便加个东西",
    });
    for (const optionId of [
      "l0_self_pain",
      "l1_status",
      "l2_only_me",
      "l3_manual_path",
      "l4_skip_diagram",
    ]) {
      session = answerFirstPrinciplesTurn(session, {
        questionId: session.activeQuestion!.id,
        kind: "option",
        selectedOptionId: optionId,
      });
    }
    expect(session.thesis?.verdict).toBe("kill");
    session = confirmFirstPrinciplesThesis(session, session.thesis!);
    expect(() => buildHandoffPayload(session, "agent")).toThrow(/go verdict/i);
  });

  it("requires acknowledgeLowConfidence for go with confidence 2", () => {
    let session = createFirstPrinciplesSession({
      projectId: "proj_1",
      vision: "vision",
    });
    for (const optionId of [
      "l0_user_pain",
      "l1_save_time",
      "l2_pass",
      "l3_single_happy",
      "l4_skip_diagram",
    ]) {
      session = answerFirstPrinciplesTurn(session, {
        questionId: session.activeQuestion!.id,
        kind: "option",
        selectedOptionId: optionId,
      });
    }
    const thesis = { ...session.thesis!, confidence: 2 as const, verdict: "go" as const };
    expect(() => confirmFirstPrinciplesThesis(session, thesis)).toThrow(
      /confidence ≤ 2/i,
    );
    session = confirmFirstPrinciplesThesis(session, thesis, true);
    expect(session.status).toBe("concluded");
  });
});

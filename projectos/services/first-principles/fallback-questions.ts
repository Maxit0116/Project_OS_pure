import type {
  FirstPrinciplesLayerId,
  FirstPrinciplesQuestion,
  FirstPrinciplesSession,
} from "../../contracts/first-principles.js";

type QuestionDraft = Omit<
  FirstPrinciplesQuestion,
  "blocking" | "allowSkip" | "metaOptions"
> &
  Partial<Pick<FirstPrinciplesQuestion, "blocking" | "allowSkip" | "metaOptions">>;

function q(partial: QuestionDraft): FirstPrinciplesQuestion {
  return {
    blocking: true,
    allowSkip: true,
    metaOptions: ["unsure", "skip_layer", "wrong_question"],
    ...partial,
  };
}

export function fallbackQuestionForLayer(
  layerId: FirstPrinciplesLayerId,
  session: FirstPrinciplesSession,
): FirstPrinciplesQuestion {
  const vision = session.rawVision.slice(0, 120);
  switch (layerId) {
    case "L0":
      return q({
        id: "fp_l0_anchor",
        layerId: "L0",
        reflect: `你提到：「${vision}${session.rawVision.length > 120 ? "…" : ""}」。先钉住真实现象，而不是抽象愿望。`,
        question: "最近一次让你想做这件事的具体卡住/难受是什么？痛点主要属于谁？",
        options: [
          {
            id: "l0_self_pain",
            label: "我自己反复踩坑",
            description: "Solo 痛点；可能先做个人脚本",
          },
          {
            id: "l0_user_pain",
            label: "目标用户明确说过/表现出来",
            description: "有第二视角证据更好",
          },
          {
            id: "l0_trend",
            label: "跟风/技术兴奋，还没有具体事件",
            description: "立论风险高，需更严 Kill Test",
          },
          {
            id: "l0_vague",
            label: "说不清，就是觉得该有",
            description: "先停在现象层，补一个真实场景",
          },
        ],
      });
    case "L1":
      return q({
        id: "fp_l1_job",
        layerId: "L1",
        reflect: "把愿景拆成不可再缩的主张：谁、要完成什么工作、不做的代价。",
        question: "用户真正要完成的「工作」是什么？（不是「用你的产品」）",
        options: [
          {
            id: "l1_save_time",
            label: "省时间 / 少重复劳动",
            description: "可用时长或次数量化",
          },
          {
            id: "l1_reduce_error",
            label: "少犯错 / 提高正确率",
            description: "要有可观察的错误信号",
          },
          {
            id: "l1_new_capability",
            label: "以前根本做不到的事",
            description: "需证明现有工具做不到",
          },
          {
            id: "l1_status",
            label: "更好看 / 更酷 / 更完整",
            description: "产品冲动常见，Kill Test 要狠",
          },
        ],
      });
    case "L2":
      return q({
        id: "fp_l2_kill",
        layerId: "L2",
        reflect: "用反证淘汰站不住的路。选最接近你现状的一条。",
        question: "哪条反证现在最贴近事实？",
        options: [
          {
            id: "l2_workaround_ok",
            label: "现有 workaround 还能撑 ≥6 个月",
            description: "倾向 Park",
          },
          {
            id: "l2_only_me",
            label: "只有我痛，没有第二用户",
            description: "倾向 Kill 或缩成个人脚本",
          },
          {
            id: "l2_symptom",
            label: "这是另一个问题的症状",
            description: "倾向 Pivot 到根因",
          },
          {
            id: "l2_pass",
            label: "反证都不成立，值得做最小切片",
            description: "继续定义 MVP",
          },
        ],
      });
    case "L3":
      return q({
        id: "fp_l3_mvp",
        layerId: "L3",
        reflect: "只保留能证伪核心假设的最小交付，其余一律 non-goal。",
        question: "本轮最小可证伪切片应该是什么？",
        options: [
          {
            id: "l3_manual_path",
            label: "人工/半自动路径先跑通",
            description: "先验证需求，再自动化",
          },
          {
            id: "l3_single_happy",
            label: "只做一条 happy path UI/API",
            description: "砍掉设置、权限、协作等",
          },
          {
            id: "l3_instrument",
            label: "先埋点/日志验证假设，不做功能",
            description: "适合高不确定",
          },
          {
            id: "l3_fullish",
            label: "我想一次做相对完整",
            description: "风险高；需极高把握才 Go",
          },
        ],
      });
    case "L4":
      return q({
        id: "fp_l4_structure",
        layerId: "L4",
        reflect: "把已确认主张外化成结构图，便于发现边界矛盾。",
        question: "现在最需要画哪种结构图？",
        options: [
          {
            id: "l4_causal",
            label: "问题因果",
            description: "痛点 → 原因 → 干预点",
          },
          {
            id: "l4_journey",
            label: "用户旅程",
            description: "谁在何时卡住",
          },
          {
            id: "l4_boundary",
            label: "系统边界",
            description: "做什么 / 不做什么",
          },
          {
            id: "l4_decision",
            label: "决策树",
            description: "Go / Pivot / Kill 分支",
          },
          {
            id: "l4_skip_diagram",
            label: "先不画图，直接结案",
            description: "跳过可视化，进入 Thesis",
          },
        ],
        graphHint: { diagramKind: "causal" },
      });
  }
}

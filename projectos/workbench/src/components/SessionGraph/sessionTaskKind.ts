export const SESSION_TASK_KINDS = [
  'explore',
  'plan',
  'build',
  'fix',
  'design',
  'git',
  'setup',
] as const

export type SessionTaskKind = (typeof SESSION_TASK_KINDS)[number]

const FAILURE = /bug|报错|崩溃|失败|回归|异常|broken|failing|exception/iu
const DESIGN = /样式|布局|配色|颜色|动效|界面|视觉|间距|空态|无障碍|美化|排版|\bcss\b|\bui\b|\bux\b|\bdesign\b/iu
const SETUP = /依赖|安装|环境变量|部署|跑起来|跑不起来|工具链|docker|npm install|\.env|打包|构建失败/iu
const GIT = /pull request|merge conflict|github|rebase|cherry-pick|开(?:一个)?\s*pr|合并冲突|\bcommit\b|\bci\b/iu
const FIX = /bug|修复|修一下|修好|报错|崩溃|失败|回归|debug|broken|failing|没反应|不工作|坏了/iu
const PLAN = /方案|选型|拆任务|取舍|怎么做|实施计划|\bplan\b|\brfc\b/iu
const EXPLORE = /怎么|为什么|什么意思|解释一下|在哪|如何理解|怎么工作|how does|what is|explain|where is/iu
const BUILD = /实现|添加|新增|做一个|加一个|功能|feature|implement/iu

function has(pattern: RegExp, text: string): boolean {
  return pattern.test(text)
}

/** One icon family per session, from the title and responsibility rather than Ask/Plan/Debug mode. */
export function classifySessionTask(...parts: Array<string | undefined>): SessionTaskKind {
  const text = parts
    .map((part) => part?.trim() ?? '')
    .filter(Boolean)
    .join('\n')
  if (!text) return 'build'

  const design = has(DESIGN, text)
  const setup = has(SETUP, text)
  const git = has(GIT, text)
  const failure = has(FAILURE, text)
  const fix = has(FIX, text)
  const plan = has(PLAN, text)
  const explore = has(EXPLORE, text)
  const build = has(BUILD, text)
  const work = design || setup || fix || failure || plan || explore || build

  if (setup && !design && !build) return 'setup'
  if (design && !failure) return 'design'
  if (fix || failure) return 'fix'
  if (plan && !build) return 'plan'
  if (explore && !build && !plan && !design) return 'explore'
  if (git && !work) return 'git'
  if (build || plan) return 'build'
  if (git) return 'git'
  return 'build'
}

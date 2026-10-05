# Project OS 设计点 / 待办

## Figma 编辑器实施状态（A2 / 安全 A3）

- A2.0 已完成：新增权威 graph / semantic-tree 与客户端 mock 镜像的原始字节一致性回归门禁；本阶段不改 fixture 内容。
- A2.1 已完成：侧栏已接通现有契约中的 `borderColor` / `borderWidth`；仍只允许修改源码中已存在、由主进程判定可编辑的声明。
- A2.2 已完成：把既有样式写入链路抽象为通用 mutation / coordinator / verification 命名，但契约仍只有 `set-style-property` 一个严格分支，IPC 字符串和全部安全校验保持不变。
- A2.3 已完成：实时预览已放入可平移缩放的固定画布，提供选择 / 抓手、25–200% 光标锚定缩放与适应画布；状态仅在 renderer 内，不改变 guest 或写入权限。
- A2.4 已完成：所有小写 intrinsic 都获得可选择的会话绑定源码 ID；既有 A1 样式 / callsite ID 保持不变并随会话轮换，无样式、动态样式和含 spread 的节点仍由主进程判定为 agent-only。
- A2.5 已完成：新增主进程持有的会话级撤销 / 重做历史。重做不回放旧 handle、build、nonce、patch、run 或 backup，而是使用当前选中与解析信息重新授权，重跑 hash / AST / graph / ownership / 事务 / HMR 验证，并对共享实例重新确认；旧历史修订或旧会话一律失败关闭。事务进入 `recovery_required` 时会跨预览重启锁死项目写入，只有工作区启动恢复确认无未决事务后才解锁；forced-real 套件 981/981 通过。
- A2.6 已完成：双击文字只对“一个安全 intrinsic + 一个直接静态 `JsxText` 子节点”的主进程判定子集开放；草稿位于 closed shadow editor 中，只接受可信输入事件，仅可信 Enter 提交（blur 取消）且不改 app DOM。写入仍重跑 build / handle inventory / source hash / graph revision / AST / ownership / transaction / blast-radius / undo-redo 校验，HMR 后由主进程 CDP 按 template ID 验证所有渲染实例；forced-real 套件 1010/1010 通过。
- A2.7 已完成：新增无路径图层面板与最多 64 个不透明句柄的展示型多选；多选时 guest 与 renderer 双重禁用写入。主进程只对现有像素字面量开放安全几何：普通流元素仅 E/S/SE resize，只有完整的 `position: 'absolute'` + `left`/`top`/`width`/`height` 才允许移动及八向 resize；冲突 inset/transform 一律 agent-only。移动/resize 使用独立原子 mutation，吸附与辅助线仅为 guest 临时几何，提交仍重跑全部 hash/AST/graph/ownership/事务/blast/history/HMR-CDP 校验。样式新增向后兼容的严格 RGBA 与现有数字 opacity，继续拒绝渐变、命名颜色和通用 `left`/`top` 样式写入；forced-real 套件 1063/1063 通过，fixture 镜像保持原始字节一致。
- A3 静态结构子集已完成：仅当目标、父元素、全部直接兄弟及其子树都由主进程 AST 判定为安全静态 intrinsic，且父/兄弟渲染清单基数完全一致时，才显示复制/删除；删除不会移除唯一子元素。提交继续经过 build/session/handle/hash/graph/AST/ownership/事务/blast/history 校验，redo 重新授权并重新确认共享影响，HMR 后由主进程 CDP 验证每个父实例的有序子 ID 序列。任意新增、动态结构、分组、reparent 与 reorder 继续 agent-only；staged-index forced-real 套件 1078/1078 通过。
- A3 `LocalConstStyleObject` 已完成：`style={identifier}` 只有在 identifier 精确绑定同文件、模块级、未导出、唯一引用的 `const` 直接对象字面量时才获得现有属性的直接样式能力；函数局部、共享、导出/导入、断言、spread/computed/dynamic 对象继续 agent-only。主进程会把 adapter 身份纳入 lock 内重算与确认指纹，处理常量位于 JSX 前方导致的 span 偏移，并在 HMR 后重新分类源码值再做 CDP 验证；真实 Next 临时副本已覆盖 local-const 的 padding/color/RGBA/opacity、undo 与 fresh redo，staged-index forced-real 套件 1092/1092 通过。
- A3 `CssModuleClass` 已完成：只对同文件唯一默认 `.module.css` import、唯一静态 `className={styles.name}` 引用、同一唯一 graph/semantic owner、单一简单本地 class rule 和已有白名单字面量声明开放。CSS 文件拥有独立 hash / rule fingerprint / source digest，提交、共享影响确认、undo/fresh redo 与 HMR 后主进程验证继续经过完整安全边界；spread、动态 class、共享 import/reference、at-rule/media、伪类/global/组合选择器、`composes`、变量、Tailwind 和全局 CSS 继续 agent-only；staged-index forced-real 套件 1132/1132 通过。
- Round-2 Phase 6 生产组合实证已完成：隔离 Electron/真实 Next 场景只使用正式 preload、ProjectOS/design IPC 与唯一 production composition，完整验证可信点击 → 一次性 capability → 三实例确认 → CSS-module 事务写入 → 主进程观察同一 HMR socket 的 `building`→`built` → 强制 reload → 主进程 CDP/基数验证 → 通用 backup 恢复拒绝 → 精确 undo → 新 capability 授权 redo → 最终 undo。源码目标在整个事务内由 `O_NOFOLLOW` 文件描述符及 inode/ctime/mtime/字节 hash 精确固定；同 URL history 也会轮换 authority 而不触发 reload 循环。临时工作区恢复原始字节，所有 harness 资源与自有进程组完成清理；clean staged-index forced-real 套件 1654/1654（192 个文件）通过。

## 1. 前端可视化 —— 抄 Figma 的 UI
- 目标：像 Figma 一样直接展示「真实渲染的 UI」，而不是抽象的节点图。
- 交互：可以点击 UI 上的某个 block；点击后由 agent 去修改该 block 对应的前端代码。
- 手感：整体可自由拖拽（Scratch 那种拖拽的 vibe），但 UI 风格用 Figma，不要 Scratch 的观感。

## 2. node 用处前置 —— 面向不懂编程的人
- 范围：特指「产品全景 / 系统组成 / 功能模块」这三层里的 node。
- 要求：让不懂编程的人一眼看懂每个 node 的用处；描述简短但到位，放在名字前面 / 更显眼的位置。

## 3. 模块直连后端
- 在上面这个「抄 Figma、可拖拽、agent 可改」的模块体系里：
- 每个前端模块除了能被 agent 改前端代码，还应能通过这个模块直接访问 / 跳转到它所负责的后端内容（并由agent 改写）（前端 block ↔ 对应后端代码）。


现在这个地方的话。在最后一层的file 图。点击file不应该是直接跳转到file content，点击file可以变成和上一层一样的只expose相邻的node。

右键菜单点在node上要加一个打开子节点agent聊天框的选项。 


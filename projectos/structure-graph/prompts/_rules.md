# Structure Graph Rules（Project OS Pure）

CodeSee 三原则在结构层的变体。

## MUST

1. **语义归模型**：命名、职责、分层、依赖说明写入 `graph.json`；布局与交互仍归 Function Map UI
2. **路径真实**：`fileIndex.path` / `linkedFiles.path` 必须是仓库内真实相对路径；不确定就省略
3. **C4 最小完备**：至少 1 个 system + ≥1 container + ≥1 component
4. **层级一致**：`parentId` 与 `children` 双向对齐；`layer` 必须落在 `architecture.layers`
5. **边可解释**：每条边有人类可读 `label` 与可核对的 `evidence`
6. 枚举值只能使用 `_schema.md` 中的合法值

## SHOULD

1. 组件按产品能力/子系统划分，而不是按文件扩展名堆叠
2. 优先把入口文件、路由、API handler、核心服务挂到对应 component
3. `imports`/`exports` 可为空；第一期不强制 AST 依赖图
4. 中文仓库用中文命名；英文仓库用英文命名

## MUST NOT

1. 编造不存在的文件或包路径
2. 把布局坐标、画布状态写进 graph.json
3. 恢复故事层 / features.json / Story 画布内容
4. 用「frontend module / src module」这类目录壳作为最终组件名

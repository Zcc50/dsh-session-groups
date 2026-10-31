# HANDOFF：回合过程条插件化评估

> 项目组：回合过程条插件化评估 | 创建：2026-10-31
> 交付物：评估报告（本项目目录）
> 目录：`F:\DSH\projects\回合过程条插件化评估`

## 1 目标

评估把白皮书第⑨条「休息触发」（回合过程条累计 10 思考 + 20 工具，AND，每档叠加 20/40、30/60…）从 agent 自查条款改为**前端插件**（GUI 计数 + 注入提醒）的性价比与实现方式，给出推荐路径。

## 2 背景与现状

- 需求：累计 10/20 档触发休息；不结束会话，暂停更新任务列表、审视进度、判定「结束本轮或继续」。
- 当前实现：`AGENTS.md` 第⑨条，agent 自查（工具调用数准确，思考次数估算）。
- 截图观察：用户截图显示「执行 N 次思考，调用 M 次工具」，当前 asar 的 `TurnProcessNodeView` label 是「已完成 / 已完成·用时」，疑旧版本或另一前端，评估时需注明版本口径。
- 相关组件：`@deepseek-ai/dsh-client-ui-chat` → `TurnProcessNodeView` → slot `conversation.chat.node`，key `turn-process`；i18n 命名空间 `message.turnProcess.*`。

## 3 文件地图

```
HANDOFF-回合过程条插件化评估.md   本文件
报告-回合过程条插件化评估.md      评估报告（待产出）
```

- 白皮书：`C:\Users\Administrator\.dsh\AGENTS.md` 第⑨条
- 参考评估口径：`F:\DSH\projects\新插件实现成本与可能性评估\HANDOFF-插件评估.md`
- 前端插件参考：`F:\DSH\projects\dsh-workspace-frontend\HANDOFF-DSH工作区前端重建*.md`
- asar 取证工具：`F:\DSH\temp\find-asar-text.mjs`、`dump-asar-range.mjs`、`asar-grep.mjs`（前两者按字节区间 dump，不受二进制限制）

## 4 标准流程

1. 摸清前端插件能力边界（能否读 turnProcess 计数、能否注入消息/触发 agent 动作）。
2. 对比「白皮书条款 vs 前端插件」的成本、可靠性、失败模式。
3. 给推荐方案 + 实现路径（若推荐，写最小可行实现）。
4. 报告交付 → 用户验收。

## 5 踩坑索引

- `app.asar` 是单文件归档，grep 工具无法进入；用 Node 脚本按 Buffer `indexOf` 搜索或按区间 dump。
- 当前版本 turn-process 条文案与用户截图不一致，评估结论必须写清基于哪个版本。
- 前端插件运行在浏览器上下文，注入消息到会话依赖 DSH 客户端 API，须以源码/文档实证，不靠推断。

## 6 结论日志

- 2026-10-31 项目建立；需求口径与第⑨条一致（AND，10/20 档，每档叠加）。下一步：摸插件能力边界。
- 2026-10-31 评估完成：结论「维持第⑨条为主；插件化可行但性价比不高」。证据：client 插件可注入 `remote.session`（含 prompt RPC，asar ≈ 19,726,953），可读 turn-process 节点数据（asar ≈ 23,877,458）；但无系统消息注入通道，注入只能以用户消息身份进会话，有语义污染与打断风险。推荐：保留条款 + 可选做 B（UI 提醒，0.5–1 人日）；C（注入强触发）暂缓；D（改核心）不做。报告：`报告-回合过程条插件化评估.md`。
- 2026-10-31 B 方案定稿：用户选 dock 位置 + assistant 消息数口径 + 先本地验证。设计：`设计-B方案-UI提醒.md`。
- 2026-10-31 本地验证完成：当前会话日志 271 帧解压 467 行，累计 60 思考 / 62 工具，档位 3，AND 公式计算正确。结论：口径可行；插件端需读 turn-process 投影字段，待装后对照。报告：`验证-B方案-计数脚本.md`。
- 2026-10-31 B 骨架完成：`rest-notice/` 7 个文件（package.json、cordis.patch.yml、index.js、client.js、locale/zh.json、locale/en.json、icon.svg、README.md）；`node --check` client.js/index.js 通过，三个 JSON 校验通过。计数仍走调试注入 `window.__DSH_REST_NOTICE__.counts`，**未安装**。
- 2026-10-31 **B 砍掉**：用户指出 B 是提醒用户、agent 看不到、能直接看进度用不上；保留 A。产出完整评估档案 `评估档案-休息机制方案对比.md`（A/B/C/D 原理、副作用、可靠性、决策建议）。
- 2026-10-31 **项目结项**：用户决定只保留 A（白皮书第⑨条），B/C/D 均不做。评估报告、档案、B 骨架、验证脚本全部存档于本目录与 `F:\DSH\temp`。无后续动作。

# HANDOFF：任务系统父子结构治理（简称：父子结构）

> 项目组：DSH 任务列表面板（`@local/dsh-task-list`）
> 创建：2026-10-30 | 来源：从「新插件实现成本与可能性评估」P3 拆分，独立会话处理
> 被改插件：`F:\DSH\projects\DSH任务系统重建计划`（link 安装，改源即改运行文件）
> 状态：**已实施并验证**（2026-10-30 完成软校验版；strict 模式未做，留作可选）

## 0. 新会话快速接入（先读这节）

1. 读本文件 §1–§4，再看 `参考-报告-P3-父子任务插件.md`（评估证据与方案对比）。
2. 被改代码只有两处：
   - `F:\DSH\projects\DSH任务系统重建计划\index.js` 的 `taskWriteTool()`（L165–216：description L166–181、execute L212–216）与 `describeMerge()`（L103–118）
   - `F:\DSH\projects\DSH任务系统重建计划\lib\task-store.js` 的 `mergeAgent()`（L235–305）+ `DEFAULT_MAX_FLAT_TOP_LEVEL`（L29–35）
3. 单测（PATH 无 node，必须绝对路径）：
   ```
   cd F:\DSH\projects\DSH任务系统重建计划
   & "C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" --test lib/task-store.test.js
   ```
4. 改完生效：Host 半改 `index.js` 需要重载插件才能生效，**实测 `plugin_manager set_plugin` 把 `include:task-list` 禁用再启用即可**（Host 会重新 import，不用 remove + install，也不用重启 DSH）；只刷新页面不生效。

## 1. 目标

让 DSH 接入任务系统时**合理拆父子任务**：顶层任务 = 阶段/大块交付，执行项挂成子任务；每个顶层至少 1 个子任务；最多两层。解决「一次性平铺大量父任务、几乎不设子任务」的问题。

非目标：不改存储结构、不改面板 UI、不改四态语义、不引入第三层。

## 2. 背景结论（P3 评估，已定）

根因三条（不是模型不听话，是接口没表达「什么树算合格」）：

1. `task_write` 的 description（原 index.js L162–168）只讲整表替换/保留 id/四态/blocked，**没有一句父子结构要求**；
2. schema 里 `parentId` 是可选字符串，**无结构约束**；
3. `execute` 只 `mergeAgent`，最后 `assertValidTree` 只校验「父存在、不自指、不成环」——**平铺完全合法**。

方案：**改现有插件（不新建）**——描述加规则 + 软校验 warning；`strict` 模式可选。成本 1–2 人日。详细对比见参考报告 §3。

## 3. 现状证据（改前行号；实施后位置见 §0 第 2 点）

- `index.js` L165–216：`taskWriteTool()` 定义（description / parameters / execute）。
- `lib/task-store.js` L235–305：`mergeAgent()`——整表替换、按 id 合并、user 条目保留；末尾 `assertValidTree(merged)`，并计算 `structure`（新增顶层数 / 无子任务数）。
- `lib/task-store.js` L415 起：`assertValidTree()`——只查父存在/自指/环，不查结构合理性。
- 面板只渲染两层（`DSH任务系统重建计划` HANDOFF §14.2），第三层不渲染。
- 现有列表里已有大量平铺任务（本机 19 条），**硬拒绝会挡住旧数据更新**。

## 4. 改造方案

### 4.1 描述层（先做，零风险）

在 `task_write` description 追加三段（措辞要短）：

- 顶层任务 = 阶段/大块交付，不是执行步骤；超过 3 个顶层时先归到几个阶段下。
- 每个顶层任务至少 1 个子任务；一个子任务 = 一次可验收的动作。
- 最多两层（面板只渲染两层）。

### 4.2 校验层（软优先）

`mergeAgent` 成功后检查：

- 本次**新增**的顶层任务（不在旧列表里）数量 > `maxFlatTopLevel`（默认 3），且这些顶层全无子任务 → 在返回文本追加 warning，**不拒绝**。
- 文案（实际）：`Updated task list: N task(s), 4 added. (warning: 4 new top-level tasks without subtasks — keep at most 3 phases at the top level and hang each deliverable under one as a child task)`。
- 为何软：旧平铺列表仍能更新；模型看到 warning 通常下一次就补结构。

### 4.3 可选 strict（第二阶段）

配置 `structurePolicy: "soft" | "strict"`；strict 时拒绝并返回结构化错误，只对**新增顶层**生效，提供 `allowFlat: true` 逃生参数。

### 4.4 待用户确认的决策点（已按推荐默认实施）

1. 阈值默认 3 —— **采用**（`DEFAULT_MAX_FLAT_TOP_LEVEL = 3`，`mergeAgent` 支持 `maxFlatTopLevel` 覆盖）；
2. 软 warning 还是直接 strict —— **采用软 warning**；strict 未做（需要时再加配置项）；
3. 是否允许「顶层任务暂时没有子任务」的过渡期 —— **允许**，只在超阈值时提示一次，不拒绝。

## 5. 文件地图

```
HANDOFF-父子结构.md                本文件
参考-报告-P3-父子任务插件.md        评估证据与方案对比（只读参考）
（改动都在外部）F:\DSH\projects\DSH任务系统重建计划\
  index.js                          taskWriteTool() 描述 + execute 后校验
  lib/task-store.js                 mergeAgent 返回结构 / 新增顶层统计
  lib/task-store.test.js            加 4 条单测
```

## 6. 标准流程

1. `task_list` 读台账，把本轮动作建成 `in_progress`。
2. 读 §3 两处代码，先改描述（跑一次真实提交看行为）。
3. 加软校验 + warning 文本。
4. 补 4 条单测：
   - 新增 4 个平铺顶层 → warning；
   - 4 个顶层但挂子任务 → 无 warning；
   - ≤3 个顶层 → 无 warning；
   - 既有平铺列表只更新（无新增）→ 无 warning。
5. `node --test` 全绿；`plugin_manager set_plugin` 禁用→启用 `include:task-list` 重载，再真实提交验证 `task_write` 返回。
6. 面板显示正常（两层、状态节、拖拽）。
7. 每轮结束在本文件追加结论日志。

## 7. 踩坑索引

- **parameters 必须是标准 JSON Schema**：`ctx.tools.register` 不做转换，`{字段: {...}}` 会变 `type: null`，DeepSeek API 直接 400（整个会话每轮失败）。正确写法 `{ type:'object', properties:{...}, required:[...] }`。
- **output schema 属性上不能写 `required: true`**：会 `install_bundle` 失败；用 `required: ['text']` 或省略。
- **改 `index.js` 只刷新页面不生效**：Host 半要重载。实测 `plugin_manager set_plugin` 对 `include:task-list` 禁用→启用即可重新 import，不必 remove + install，也不必重启 DSH。
- **面板只渲染两层**：别造第三层。
- **单测必须用运行时 node 绝对路径**，PATH 里没有 node。
- 外部 link 安装的纯 JS 包**不能 import 宿主 `defineTool`**。

## 8. 验收标准

- [x] 新增 4 个平铺顶层（无子任务）→ 返回带 warning，任务仍写入（2026-10-30 真实 `task_write` 验证）；
- [x] 4 个顶层且各挂 1 个子任务 → 无 warning（单测 `mergeAgent stays quiet when 4 top-level tasks each carry a subtask`）；
- [x] ≤3 个顶层 → 无 warning（单测 `mergeAgent stays quiet at or below the top-level threshold`）；
- [x] 旧平铺列表（19 条）仍可正常更新，不被拒绝（单测 `mergeAgent never flags an existing flat list it merely updates` + 真实更新 probe 条目无 warning）；
- [x] 4 条新单测 + 原有 39 条全绿（`node --test` = 43 pass / 0 fail）；
- [x] 面板正常渲染（未动 UI；真实 `task_write` 后列表 `task_list` 读取正常）。

额外验证（HANDOFF 原未列）：`plugin_manager set_plugin` 禁用→启用 `include:task-list` 即可让改后的 Host 代码生效，无需 remove/install 或重启。

## 9. 结论日志

- 2026-10-30：从「新插件实现成本与可能性评估」P3 拆分为独立项目，未开工。评估结论见 `参考-报告-P3-父子任务插件.md`。
- 2026-10-30（实施轮）：
  - `task_write` description 追加结构三段（顶层=阶段/每顶层≥1子任务/最多两层）。
  - `lib/task-store.js`：新增 `DEFAULT_MAX_FLAT_TOP_LEVEL = 3`；`mergeAgent` 返回 `structure{ newTopLevel, newTopLevelWithoutChildren, maxFlatTopLevel, overLimit }`，只统计**本次新增**顶层，不追溯历史。
  - `index.js` `describeMerge`：`overLimit` 时在返回文本尾部追加 warning，不拒绝写入。
  - 单测 39 → 43 全绿（新增 4 条，含「旧平铺列表更新不误报」）。
  - `plugin_manager set_plugin` 禁用→启用 `include:task-list` 完成 Host 重载；真实提交 4 个新增平铺顶层，返回 `(warning: 4 new top-level tasks without subtasks — ...)`，随后原 id 更新无 warning。
  - 未做：strict 模式 / `allowFlat` 逃生参数 / 配置项 `structurePolicy`（按 §4.3 留作第二阶段）。
  - 2026-10-30（前端轮 · 用户验收通过）：
  - 改 `client.js` 三处：① `.dstl-row-card .dstl-status-slot{margin-right:-11px}` 把子任务行状态环到标题的空隙从约 15px 收到 4px（父行仍是 `.dstl-title{margin-left:-16px}` 贴环）；② 删掉子任务行的优先级竖条 `.dstl-pri` 渲染与 CSS；③ 按用户决定移除全部优先级入口（`onCyclePriority` / `PRIORITY_ORDER` / 中英文 `priority.*` 文案），优先级数据字段保留以兼容旧任务，新建任务仍默认 `medium`。
  - 验证：`node --check client.js` 通过；`plugin_manager set_plugin` 禁用→启用 `include:task-list` 重载后截图确认竖条消失、四父四子正常渲染；用户确认「搞定了」。
  - 微调（同日）：父任务与废弃区标题的 `margin-left` 由 `-16px` 调到 `-11px`（离环 6px），与子任务行的 4px 呼吸感对齐；hover 让位仍为 `translateX(20px)`。
- 2026-10-30（废弃父任务折叠修复 · 后端轮）：
  - 现象：废弃的父任务在废弃区正常显示，但点它的状态环「折叠」时，整行消失/弹回正常列表。
  - 根因：`buildList` 的 `collectAbandoned` 对废弃行动作写死 `hasChildren:false / childCount:0`，于是 `folds` 恒为 false，状态环点击落到 `abandoned → onRestore`，所谓「折叠」其实是恢复。
  - 修法（只动 `client.js`）：`collectAbandoned` 改为按直接子任务数计算 `hasChildren/childCount`，并尊重 `collapsedParents`（折叠时不展开子行）；废弃行的环 title/aria 改为「废弃 · 展开/收起」；`restore()` 时清掉该 id 的折叠状态，避免恢复后仍折叠。
  - 恢复入口：行内「⋯ → 恢复任务」（菜单），状态环现在只负责折叠。
  - 验证：`node --check` 通过；`node --test` 49 pass / 0 fail；`include:task-list` 已重载。
- 2026-10-30（废弃区视觉/动画修复 · 第二轮）：
  - 间距：新增 `.dstl-abandoned-root .dstl-title{margin-left:-11px}`（根 6px）与 `.dstl-abandoned-sub .dstl-status-slot{margin-right:-11px}`（子 4px），废弃行 class 按 depth 区分。
  - 标记：`displayStatus` 对废弃区行统一取 `abandoned`，隐式随父废弃的子任务不再显示绿色完成环；`restore` 只对 `task.status === 'abandoned'` 的根生效，子任务环点击 no-op、菜单不出「恢复」。
  - 动画：废弃子行包进 `.dstl-abandoned-kids[data-section-owner]`，`sectionBoxes()` 同时选它，折叠复用 `collapseBoxes` 高度过渡；子行挂 `dstl-item-in` 进场动画；`buildList` 折叠时仍收集子行（渲染层按 `folded` 隐藏），`visibleRows` 过滤隐藏行。
  - `toggleChildren` 的默认值对废弃根改为「默认展开」，不再用 `deriveStatus === completed`（否则首次点击被当成展开、看起来没反应）。
  - 验证：`node --check`；49 单测；重载。
  - 收尾微调：hover 让位位移由 `translateX(20px)` 收到 `17px`（`.dstl-row-head .dstl-title`、`.dstl-row-head .dstl-abandoned-name`、`.dstl-abandoned-root .dstl-title` 三条同改），让位结束后标题离环更近 3px；废弃 dock 加 `overflow-x:hidden` 去掉横向滚动条。
- 2026-10-30（交付 · 用户验收通过）：本轮所有改动都在 `client.js`，`node --check` 通过、49 条单测全绿、`include:task-list` 已重载生效。清单：① 子任务行环距收 15→4px、删优先级竖条与入口；② 父任务/废弃标题 `-16 → -11px`；③ 废弃父任务可折叠（补 `hasChildren/childCount`、复用 section box 高度动画、隐式子任务显示废弃环且不可单独恢复、根任务让位）；④ 废弃区 `overflow-x:hidden`、让位位移 20→17px。遗留：`task_write` description 写 `todo` 而 enum 只有 `pending`（见踩坑索引，未修）。
  - 已知未修（下一步候选）：`task_write` 的 description 写 `status` 用 `todo`，而 schema enum 只有 `pending` → 模型照描述提交会被拒（`status must be one of pending, in_progress, review, completed, abandoned: todo`）。建议把描述改成 `pending`，或在 `mergeAgent` 入口把 `todo` 归一化。
- 下一步（可选）：观察若干轮真实使用，若 warning 仍被忽略，再升级 strict；如模型仍造三层，考虑在 `mergeAgent` 里对 `parentId` 指向非顶层任务的情况追加 warning。

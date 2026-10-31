# HANDOFF：任务系统小修改（简称：小修）

> 建立：2026-10-31 09:07（Asia/Shanghai）
> 目录：`F:\DSH\projects\任务系统小修改\`
> 上游项目：`F:\DSH\projects\DSH任务系统重建计划\`（面板 v0.3.5 源码与历史记录）
> 关系：小修是在 v0.3.5 之上的增量微调，不重写、不迁移目录；上游 HANDOFF 仍是完整历史。

## 0. 新会话快速接入（三步）

1. 读本文件 §1 目标与 §5 最新结论，确认本轮要改的具体交互点。
2. 源码根 `F:\DSH\projects\DSH任务系统重建计划\`；已装路径 `C:\Users\Administrator\.dsh\profiles\desktop\node_modules\@local\dsh-task-list`（SymbolicLink → 源码根，改源码即改运行文件）。
3. 改完按 §3 标准流程走：`node --check` → `node --test` → 重载 Host 插件 → 刷新页面验证。

## 1. 目标

- 项目定位：任务面板（@local/dsh-task-list）的前端渲染与交互小修改。
- 方向已确认（2026-10-31 问答卡片）：**任务面板实现：前端渲染与交互**。
- 具体改动点：**待确认**（见 §6 下一步）。

## 2. 文件地图

```
F:\DSH\projects\DSH任务系统重建计划\        ← 插件源码根（link 安装源）
  client.js        全部前端 UI（约 2509 行 / 128 KB）：portal、行/状态节/卡片、双环、拖拽、折叠动画、废弃 dock
  index.js         Host 半：store 编解码、Remote、agent 工具 task_list/task_write
  lib/task-store.js       合并与状态纯函数（含单测）
  lib/task-store.test.js  node:test 单测（49 passed 基线）
  locale/zh.json, locale/en.json, icon.svg, cordis.patch.yml, package.json
F:\DSH\projects\任务系统小修改\HANDOFF-任务系统小修改.md   ← 本文件
```

- Node（PATH 里没有，必须绝对路径）：`C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`
- `$DSH_HOME` = `C:\Users\Administrator\.dsh`
- 会话任务数据：`$DSH_HOME\task-list\<sessionId>.json`

## 3. 标准流程（改 → 检 → 测 → 装 → 验）

1. 改前先读目标函数与调用点，一次只改一个因子。
2. `node --check client.js`（改 index.js / lib 同样各自 check）。
3. `node --test lib/task-store.test.js`，基线 49 passed，不得下降。
4. 重载 Host：`plugin_manager set_plugin` 禁用→启用 `include:task-list`（改 Host 半才需要；只改 client.js 刷新页面即可）。
5. 刷新页面验证真实界面效果；改完文档类不套哈希，但交付/装机要 SHA256 与源一致。
6. 结论追加到 §5，本文件在每轮改动后更新。

## 4. 踩坑索引（继承上游，遇到新坑追加）

- **折叠卡顿**：`.dstl-section-box` 是 content-box，`height:0` 只收内容，padding+border+margin ≈14px 仍占位，卸载时跳一下；要连 padding/border 一起过渡或改 border-box。
- **动画载体**：折叠/展开只在 `.dstl-section-box` 上播（`data-section-owner` 定位），行上不要再加类，否则双重位移。
- **折叠延迟**：三角朝向来自 `row.collapsed`，改 `collapsedParents` 前先用 `pendingFold` 立即翻转。
- **Host 改完必须重载**：只刷新页面不会加载新 index.js。
- **link 安装**：覆盖源码根即更新运行文件，profile 依赖不变；改完确认 `node_modules\@local\dsh-task-list` 仍指向源码根。
- **废弃父任务不接受新增子任务**（数据层硬校验，HTTP 400），渲染层整棵子树让位。
- **兜底颜色**：面板用 `--dsw-alias-*` 主题变量时都带 hex 兜底，避免皮肤缺变量时白屏。

## 5. 结论日志

- 2026-10-31：项目建立，方向确认为「任务面板渲染与交互」，具体改动点待用户确认；未改任何代码。
- 2026-10-31：用户报第一项需求（草稿，**已明确「先待命」，未动代码**）：已完成的独立任务/父任务收进与「废弃」同级的完成区；完成与废弃用点击互切。用户说明「这里写不下所有的内容」，后续继续补充，补完再开工。
- 2026-10-31 第二轮（需求定稿，3 张问答卡片）：完成头平时隐藏，**仅鼠标进入底部 dock 区（废弃条目）时从下往上滑出**；**点击完成头 → 完成体展开、废弃体合上成标题行保留在最底部**（两 dock 互斥展开）；完成头**不加计数、不加空态文案**；已完成项**不在正常列表重复**；完成区行**不加额外操作条目**（行上「…」更多操作里的废弃选项仍只在正常任务行）。原句「完成和废弃通过点击相互切换」= 两个 dock 区域互切，**不是**任务状态互切。
- 2026-10-31 第三轮（代码落地，client.js 单文件）：
  - `buildList()` 返回 `{ rows, abandoned, completed }`：completed 独立任务与派生完成的父任务整棵摘入 `completed`，正常列表不再渲染；完成子任务仍留在父的状态节。
  - 新增 `completedDock`（位于废弃 dock 上方）+ `.dstl-docks` hover 容器；内部复用 `renderDockRows`（原 `renderAbandoned` 泛化），折叠/子树让位/滚动规则与废弃完全一致。
  - `toggleCompleted` 与 `toggleAbandoned` 互斥：展开一个即收起另一个；点击完成头时废弃体收起成标题行。
  - `TaskRow` 新增 `dockKind`：完成区行隐藏整条操作带、点环不切状态；废弃行行为保持原样。
  - 验证：`node --check client.js` 通过；`node --test lib/task-store.test.js` → 49 passed；未改 `index.js`，Host 无需重载，刷新页面即可。
- 2026-10-31 第四轮（真机截图反馈，三项 BUG 修复）：
  - **BUG-1 常态废弃被遮盖**：`.dstl-complete-dock` 是 `.dstl-docks` 的 flex 子项，`min-height:auto` 盖过 `max-height:0`，隐藏时仍占一行高，把废弃区挤下去。修：补 `min-height:0`；`.dstl-abandoned-dock` 的 `max-height:40%`（包层后百分比链失效）改 `40vh`。
  - **BUG-2 完成展开后废弃未消失**：改为 `completedOpen` 时废弃 dock 加 `.dstl-abandoned-hidden`（`max-height:0` + 上滑 + 淡出），不再只折叠；`toggleCompleted` 不再调 `toggleAbandoned`。
  - **BUG-3 完成行显示废弃红环**：`displayStatus` 原按 `abandoned` 布尔判断，完成行 `variant='abandoned'` 被误判。修：按 `dockKind` 分派，completed 行用 `deriveStatus(task)`（绿环）。
  - 验证：`node --check` 通过、`node --test` 49 passed，待用户刷新确认。
- 2026-10-31 第五轮（需求重新定案：两 dock 完全镜像）：
  - 用户定案（3 张问答卡片）：①平时只显废弃标题；②展开一个时另一个向对面方向滑走（完成展开 → 废弃上滑消失；废弃展开 → 完成下滑消失）；③hover 展开中的那个会把另一个唤回（闭合标题）。除上下位置外，其余动画完全镜像。
  - 实现：
    - 可见性：完成 dock 可见 = `hover || completedOpen`；废弃 dock 可见 = `hover || !completedOpen`；废弃默认折叠（`abandonedCollapsed` 初值改 `true`）。
    - 点击完成头/废弃头时清 `completedHover`，避免点完立刻被 hover 唤回；移出再进入才唤回。
    - 方向：完成用 `translateY(8px)→0`（从下方升入）、收起回 `8px`（下滑走）；废弃隐藏用 `translateY(-6px)`（上滑走）+ `pointer-events:none`。
  - 验证：`node --check client.js` 通过；`node --test` 49 passed。
- 2026-10-31 第六轮（互斥闭合修正，用户验收前最后一项）：
  - 问题：一个 dock 展开后，另一个 hover 唤回时可能仍是展开体（`abandonedCollapsed` 保留旧值），违反「只有一个能展开」。
  - 修：`toggleCompleted` 展开时补 `setAbandonedCollapsed(true)`，废弃强制回到闭合态再滑走；废弃展开时 `setCompletedOpen(false)` 原逻辑已保证完成闭合。hover 唤回的一方因此永远是闭合标题。
  - 验证：`node --check client.js` 通过；`node --test` 49 passed。
- 2026-10-31 第七轮（收起时机：移开才收起）：
  - 问题：点开一个 dock 时另一个立即滑走，用户要求「鼠标移开时才执行收起」。
  - 修：`toggleCompleted` / `toggleAbandoned` 不再清 `completedHover`，另一方的可见性完全交给 `.dstl-docks` 的 `mouseenter/mouseleave`；点击后另一方保持可见（闭合标题），鼠标离开底部区域才滑走，再进入再滑回。
  - 验证：`node --check client.js` 通过；`node --test` 49 passed。
- 2026-10-31 第八轮（交付）：用户确认全部验收通过并按「交付」处理。`package.json` 0.3.5 → **0.3.6**；`node --check`（client.js / index.js / lib/task-store.js）全过、`node --test` 49 passed；打包 `F:\DSH\导出\任务系统小修改_2026-10-31.zip`（59 586 B，11 文件），解包重算 SHA256 → **11/11 一致**；已装路径仍是 SymbolicLink → 源码根，无需重装。
- 2026-10-31 第九轮（新任务：长任务名与操作按钮重叠，仅评估、未动代码）：
  - 根因（代码事实，client.js）：`.dstl-row-actions` 是 `position:absolute;right:4px;top:50%`（第 358 行）**不占布局**；`.dstl-title{flex:1;min-width:0}` + `.dstl-title-text{overflow:hidden;text-overflow:ellipsis}`（340/355 行）把标题撑满整行，ellipsis 截断点一直延伸到按钮带下面；hover 时 actions `opacity:1`（359 行）直接盖在标题尾部。现有 `.dstl-row-head:hover .dstl-title{translateX(17px)}`（350 行）是向右给箭头让位，方向与此需求相反，且只对 head 生效。
  - 按钮带宽度：head 最多 6 个（暂停/上移/下移/新建子任务/更多/删除），22px + 1px gap ≈ 137px；普通行 4 个 ≈ 91px；card 3~4 个。默认面板 340px 时标题可用约 280px，hover 后实际仅剩 140~190px。
  - A（hover 让位）评估：纯 UI，不改数据与 agent 写入；真正能腾出的空间只能来自「标题收缩」，状态环在最左，最多随行 padding 左移 6px，视觉几乎无感；需要按 head/row/card 三种变体分别给按钮带宽度，或统一按 137px 留白（普通行会浪费）；与现有 17px 右移规则冲突需重做；ellipsis 逐帧重排会抖动。副作用：hover 时标题截得更短，长名反而更看不到全名。
  - B（7 字简称 + 详情进备注）评估：根治且整齐，但单独用不解决重叠（长名照样盖）；改动面 4 处（index.js 工具描述、lib/task-store.js 校验、面板输入限长、存量任务改名+备注迁移）；7 字对技术任务名偏紧，当前任务列表几乎全部超限；硬校验会打断 agent 写入，软校验靠自觉易失效；属于把布局问题转成书写约束。
  - 推荐（供决策，未实施）：A + B 软约束。A 负责「任何长度都不被盖」，B 只写进 `task_write`/`task_list` 描述作为软约定、不硬拒绝；另可考虑第三条路：hover 只留 2 个主按钮，其余收进「…」溢出菜单，把按钮带从 137px 压到 ~50px。
- 2026-10-31 第十轮（长名重叠：A+B 落地）：
  - 用户拍板 **A + B**。
  - A（界面让位）：`.dstl-row-actions` 从 `position:absolute` 改成行的 flex 子项，`max-width:0 → 170px` 过渡展开；标题 `flex:1;min-width:0` 随之收缩、ellipsis 提前，按钮不再压字。同时删除与占位冲突的 `.dstl-row-head:hover .dstl-title` 与 `.dstl-abandoned-root:hover .dstl-title` 两条 17px 右移（保留废弃 dock 标题的 `.dstl-abandoned-name` 位移）。
  - B（7 字软约束）：`index.js` 的 `task_write` description 追加「title ≤ 7 个汉字简称，细节进 notes；超长接受但会被 ellipsis」；`title` 字段 description 改为「Short task name: 7 Chinese characters or fewer; details go in notes.」。不硬校验、不拒绝写入。
  - 验证：`node --check` client.js / index.js 全过；`node --test` 49 passed；已 `plugin_manager set_plugin` 禁用→启用 `include:task-list` 重载 Host；待用户刷新页面确认按钮让位效果。
- 2026-10-31 第十一轮（长名重叠交付）：用户验收通过。
  - 回归修正：父行 hover 右移让位原用 `transform:translateX(17px)`，在 actions 改 flex 占位后会滑进按钮区；改为 `margin-left:-11px → 6px`（同样 17px，布局参与），废弃根行同步。
  - `package.json` 0.3.6 → **0.3.7**；`node --check`（client/index/task-store/task-file）全过、`node --test` 49 passed；重打包 `F:\DSH\导出\任务系统小修改_2026-10-31.zip`（61 403 B，11 文件），解包重算 SHA256 **11/11 一致**。
  - 测试任务（test-long-1 / test-long-p 父子）留在面板里供日后回归用。
- 2026-10-31 第十二轮（废弃测试任务 + dock 切换 FLIP 交付）：
  - 清理：`test-long-*` / `test-done-*` / `test-aband-*` 全部标 `abandoned`；用户自建的「测试」（28441243…）保留未动。
  - 修复：FLIP 的 `useLayoutEffect` 依赖只有 `[tasks, collapsedParents]`，dock 展开/收起不触发；补 `completedOpen` / `abandonedCollapsed` 两个依赖，并在 `toggleCompleted()` / `toggleAbandoned()` 开头调 `snapshotRects()`，被挤压的行恢复上下滑动。
  - `package.json` 0.3.7 → **0.3.8**；check 全过、49 passed；重打包 `F:\DSH\导出\任务系统小修改_2026-10-31.zip`（61 759 B，11 文件），SHA256 11/11 一致。

## 6. 交付状态（2026-10-31，v0.3.8）

- 交互验收：完成区/废弃区镜像交互、长名让位、dock 切换 FLIP 全部通过。
- 插件版本：0.3.5 → 0.3.6（镜像）→ 0.3.7（长名）→ **0.3.8**（FLIP + 测试清理）。
- 最终校验：`node --check`（client.js / index.js / lib/task-store.js / lib/task-file.js）全过；`node --test` → 49 passed / 0 failed。
- 交付包：`F:\DSH\导出\任务系统小修改_2026-10-31.zip`（61 759 B，11 个文件），解包重算 SHA256 11/11 一致。
- 已装：`C:\Users\Administrator\.dsh\profiles\desktop\node_modules\@local\dsh-task-list` 是 SymbolicLink → 源码根，覆盖源码即生效，无需重装。
- 面板现状：测试任务已全部废弃进底部 dock；用户自建的「测试」保留在完成区。
- 后续可选项（未做，需要时另起任务）：完成行「恢复回进行中」、点环完成 ↔ 废弃互切、完成区空态处理、按钮带溢出菜单化、dock 展开高度按实际内容做过渡（若仍有高度瞬跳）。

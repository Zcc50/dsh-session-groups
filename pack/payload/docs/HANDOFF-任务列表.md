# HANDOFF：DSH 任务系统重建计划（简称：任务列表）

> 项目组：DSH Web 插件（Host + Client 双半）
> 创建：2026-10-29
> 状态：后端已接入（Host 存储 + HTTP API + `task_list`/`task_write` 工具），前端已删演示数据改接真实列表；四状态节归父任务的结构重构完成，对话列/输入框已对齐并加 920 宽上限；34 条单测通过；`todo_write` 暂与旧工具并存（2026-10-29 用户决定）
> 宿主版本：dsh 0.2.1-rc.3

## 0. 新会话快速接入（三步，先读这节）

1. **确认在线**：`task_list` 能调用；`cordis_inspect_query` client `Slots.listSubTree` root `conversation.input.dock` 里 `task-list.panel` 为 `active: true`。面板不显示就刷新页面（agent 写入不会自动推送到已打开的页面）。
2. **读约定**：数据规则见 §4.2 / §12.1（四态、`origin`、`blocked`、`focused`、任务级后写胜）；布局规则见 §15（右栏开→夹在面板与右栏之间，右栏关→对话恢复默认）。
3. **开工即建表**：用 `task_write` 整表提交，每条至少 `id` / `title` / `status`，可带 `parentId` / `priority` / `notes` / `blocked`；`todo_write` 已弃用（仍注册，不要新建）。收尾用 `task_write` 更新状态。

接入即用的命令：

```
task_list                      # 读当前会话的树
task_write { tasks: [...] }    # 整表提交；缺省的 agent 条目视为撤回，user 条目保留
```

- **口令约定（用户设定）**：用户说「测试」→ 用 `task_write` 往列表里加一条标题为「测试」的待办（`status: pending`，不改动其他任务），然后简短回复。这是验证即时刷新的固定口令。
- **工作即任务（强制，2026-10-29 用户质问后补定）**：任务列表是**实时工作台账**，不是事后补记。每轮动手前先 `task_list` 读一次，把本轮要做的事建成 / 更新为 `in_progress`；每完成一项立即改 `completed`；中途改计划也照实更新。**禁止「先做完再补一条已完成」**——那样列表就退化成了事后账本，也就失去了存在意义（用户原话：我们做任务列表的意义是什么）。

安装是 link 到 `F:\DSH\projects\DSH任务系统重建计划`，改源文件即改运行文件；改 `client.js` 后需要用户刷新页面。

## 1. 目标

重建 DSH 的任务系统：一个独立于对话流的任务面板，解决现有 `todo_write` 的三个痛点：

| 痛点 | 根因（已查实） |
|---|---|
| 容易被打断 | `todos` 投影在每次 `turn/start` 重置为 `null`；用户再发一句话，上一轮清单就从界面消失 |
| 建立不及时 | 建列表完全靠 model 自觉调用 `todo_write`，用户无法干预 |
| 条目结构不清晰 | schema 只有 `content` + 三状态（pending/in_progress/completed），无 id、层级、分组、优先级、备注 |

## 2. 已确认需求（用户逐项选定）

- **联动方式：双向联动。** 用户和 agent 读写同一份任务列表。
- **范围：当前会话**（含该会话的子代理）。
- **位置：中栏（对话区）左侧的竖向空白色块。** 红框只圈大致区域，四周留和谐余量（建议 16–20px），不贴边。
- **条目结构：** 子任务层级、优先级、备注/详情、四态（待办 / 进行中 / 待确认 / 完成）。
- 数据形态：四态中的「待确认」语义 = agent 声称完成不自动结算，等人确认（参考 dsh-global-todo 的 Needs review）。

## 3. 现状事实（已从宿主源码提取，勿重查）

宿主任务系统 = `@deepseek-ai/dsh-tool-todo`（提取位置 `F:\DSH\temp\asar-extract\dsh\node_modules\@deepseek-ai\dsh-tool-todo\`）：

- 工具 `todo_write`：**整表替换**（last-write-wins），每会话一份；校验 content 非空、去重、非并发模式下最多一个 in_progress。
- 投影 `todos`：`apply` 里 `todo/write` 写入整表，**`turn/start` 置 null**，`turn/end` 保留。
- 存储：`exec.agent.session.append('todo/write', { todos })` → session 事件日志（磁盘永久保留，历史可回放）。
- UI：仅在会话流 tool call 卡片渲染（`dsh-client-ui-tool` 的 `todosDetail`），无常驻面板、无用户入口。
- 写通道：Client 的 Session 是 Host 事件只读镜像，**client 侧没有 append 事件的 API**。界面要写任务，必须有 Host 半暴露 Remote 方法。
- 自定义会话事件不可用：`KNOWN_SESSION_EVENT_TYPES` 是宿主硬编码白名单（`dsh-api-session-controller/lib/client.js` 约 L138-201），外部插件事件「outside this list by construction」，replay 会按 ignorable 处理。**不要设计新的 session 事件类型来存任务。**

布局事实：

- 三列 grid：`sidebarCol | centerCol | rightbarCol`（`dsh-client-ui-layout` 的 AppFrame）。
- 对话内容 `max-width: var(--dsh-chat-content-width)`（默认 748px）+ `margin: 0 auto` 居中，左右留白是居中产物，不是预留插槽。
- Slot 树没有「sidebar 与 main 之间」的位置；可用的通用落点是 `sidebar` / `main`(keyed) / `rightbar` / `shell.overlay`。
- 侧栏宽度可变（264–420，拖拽），折叠时 56/0；`ctx.layout` 无 getSidebar/编程设宽。

## 4. 技术方案（开工按此执行）

### 4.1 布局：占位式

1. 面板用 `react-dom` 的 `createPortal` 挂到 `document.querySelector('[class*="_centerCol"]')`。
2. 面板 `position:absolute; left/top/right/bottom` 留 16–20px 余量；宽度建议 340–400px（随中栏宽度自适应，窄屏折叠）。
3. 给聊天滚动容器（`[class*="_scroll"]` 或 `[data-slot="conversation.chat.flow"]` 的祖先）加 `padding-left`，把对话内容右移，避免面板遮挡。
4. 输入框（composer）不动，面板高度止于 composer 上方。
5. 窄屏（中栏宽度不足以容纳面板+内容）时折叠为窄条或浮层按钮。

风险：`centerCol` 有 `overflow:hidden`（子元素会被裁剪，正常）；皮肤按原生 DOM 类名写的 CSS 可能命中新 padding（参考会话分组 HANDOFF 的皮肤教训）。

### 4.2 数据：独立 JSON store，不用新投影

- Host 半用 `ctx.storage` / 自有 JSON 文件（放 `$DSH_HOME` 下，参考 dsh-crabtodo）。
- 结构（建议）：

```js
Task = {
  id: string,
  sessionId: string,          // 所属会话（当前会话过滤用）
  parentId: string | null,    // 子任务层级
  title: string,
  notes: string,              // 备注/详情
  priority: 'high' | 'medium' | 'low',
  status: 'pending' | 'in_progress' | 'review' | 'completed',
  order: number,              // 同级顺序
  origin: 'agent' | 'user',   // user 条目永不被 agent 整表提交间接删除
  blocked: boolean,           // 卡住标记：不是第五态，环上加红点角标，备注写原因
  focused: boolean,           // 每会话最多一个焦点任务，面板顶部常驻「继续」
  version: number,            // 合并用；本地 patch 与 agent 写入都 +1
  createdAt: number,
  updatedAt: number,
  completedAt: number | null,
  externalUpdateAt: number | null,  // 最近一次被拒绝的外部写入时刻；UI 提示一次后本地写清除
}
```

### 4.3 写通道（Host 半 Remote）

- `task_list(sessionId)` / `task_upsert(task)` / `task_remove(id)` / `task_setStatus(id, status)`。
- Client 半通过 `inject` 注入对应 remote 命名空间，界面操作立即写回。

### 4.4 双向合并语义（已实现为纯函数：`lib/task-store.js` + `lib/task-store.test.js`，23 条单测）

- 用户操作 = 单任务 patch，`version++`、`updatedAt = now`，立即落盘（`patchTask`）。
- agent 写 = 整表提交，按 id 合并（`mergeAgent`）：
  - 新 id 插入；已有 id 用 agent 字段覆盖 title/notes/priority/status/parentId/order，`version++`；
  - 提交里缺失的 **`origin: 'user'` 条目保留**（agent 无法间接删除用户条目）；缺失的 agent 条目删除（视为 agent 撤回）；删除用户条目只能靠显式 `removeTask`。
  - origin 一经创建不变：agent 可更新用户条目的字段，但该条目仍是 user（后续缺失也不会被删）。
- 冲突：任务级后写胜，比较 `updatedAt`：
  - 用户更新时间更晚 → 保留用户版本，`conflicts.push(id)`，幸存任务打 `externalUpdateAt = agent 写入时刻`（UI 提示一次）；
  - 相等 → agent 胜（用户每次本地写都会推进 `updatedAt`，相等说明用户没动过）。
  - 不做字段级三方合并（无 base 快照，成本高于收益），冲突以整任务为单位记录。**2026-10-29 用户确认：保持任务级后写胜。**
- `completedAt`：进入 completed 时写时刻，离开时置 null；重复设同一状态不改写。
- 结构校验：合并后跑 `assertValidTree`，父不存在、自指、成环都抛错（不让坏提交产生不可达子树）。
- 旧会话兼容：`importLegacyTodos` 把历史 `todo_write` 的 `{content, status}` 一次性映射成 agent 条目（三态；`order` = 下标；未知状态按 pending），只读导入，不做双向同步。
- 时间与 id 全部注入（`options.now` / `options.idFactory`），单测因此完全确定。

## 5. 候选插件对比（已查 npm 包源码骨架）

| 插件 | 形态 | 数据 | 位置 | 结论 |
|---|---|---|---|---|
| `dsh-tool-todo-plus` 0.7.4 | todo_write fork + 浮动面板（fixed、可拖拽、240/380 宽） | content+status+priority | 浮动面板 | 无层级/备注/四态；不匹配 |
| `dsh-crabtodo` 0.2.4 | Host 工具(CRUD) + JSON store + Client 侧栏整页 | title/notes/status/priority/tags/scope/pinned/order/soft-delete | 侧栏整页 | 有备注/优先级/双向工具，**无父子层级、无「待确认」四态**；位置不对 |
| `dsh-global-todo` 0.21.0 | Host 服务 + Client 面板（跨会话、手机端、多机同步） | 四态含 Needs review、编号交接 | fixed 面板 | 四态语义最接近，但架构与目标范围远超需求 |

**结论：没有一个能直接改出目标形态，自研边界＝数据层 + 界面层全部自研。** 可借鉴：

- tool-todo-plus：从对话读 `todo_write`、fixed 面板定位与拖拽、面板宽度收起/展开（240/380）。
- crabtodo：Host 工具 CRUD + JSON store、`output.render` 防御式访问、软删除。
- global-todo：「完成 = 声明，需人确认」的四态语义、面板宽窄自适应（`position: fixed` 的理由在 `docs/DESIGN.md` §253）。

不 fork 任何一个：它们在位置、范围、状态机上的假设都与本项目冲突，改造比重写贵。

## 6. 风险清单

1. 双向合并冲突语义（最大风险，先写规则再写代码）。
2. 占位式布局挤压对话：中栏窄时面板与 748px 内容宽度打架，必须做折叠阈值。
3. 皮肤兼容：`dsh-claude-style` 按宿主原生 DOM 类名写 CSS；自绘面板需按 token 走，padding 改动要实测皮肤。
4. 面板挂载点靠 `[class*="_centerCol"]` 选择器，类名哈希会变但后缀稳定（同 `_handle` 经验）。
5. 旧会话数据导入：只读回放，不承诺双向同步。

## 7. 分阶段与进度

- **P0 骨架**：Client 半面板 portal + 占位布局 ✅；Host store + Remote ❌；读写闭环 ❌
- **P1 结构**：父子层级 ✅、优先级 ✅、备注 ✅、四态 ✅（父任务推导、阻塞标记、焦点）
- **P2 联动**：合并规则 ✅（纯函数 + 23 单测）；agent 工具 ❌；冲突提示 ❌（字段已备，UI 未接）
- **P3 打磨**：窄屏折叠 ✅、皮肤 ✅、键盘 ✅、历史导入 ❌（`importLegacyTodos` 有，默认不跑）

## 8. 下一步（新会话从这里开始）

### 交接状态（2026-10-29 第七轮）

- 前端交互全部完成，但仍跑内存 DEMO，刷新还原。
- 合并规则纯函数 + 23 条单测完成（`lib/task-store.js`）。
- 本轮新增：阻塞标记、焦点、恢复提示（§10.3 末条）。
- 交付包 v0.2.1 已导出并双备份（§11），含当前全部前端改动。
- **后端一行未动**：`index.js` 还是空 `apply`。

### 后端开工顺序

1. **存储层**：`$DSH_HOME/task-list/<sessionId>.json`，结构 `{ version, sessionId, tasks, updatedAt }`；临时文件 + rename 原子写；损坏时备份重建。
2. **Remote**：`task_list(sessionId)`（返回推导值后的树）/ `task_update` / `task_create` / `task_remove` / `task_setStatus`；写路径全部走 `lib/task-store.js`，agent 整表提交走 `mergeAgent`。
3. **前端对接**：删 DEMO、读 remote、乐观更新 + 失败回滚、`externalUpdateAt` 显示一次「已被外部更新」。
4. **agent 工具**：`task_list` + `task_write`；同时移除 `todo_write`（先查 `ctx.tools.restrict()` 或 patch 掉 `include:tool-todo`）。
5. **新建/编辑 UI**：头部「+」建大任务、父任务悬停「+」建子任务、备注与优先级行内编辑。
6. **边界**：fork 复制任务、归档保留、删除级联、无会话时面板行为。

### 动工前要查的工程事实

- Remote 的注册方式（`ctx.remote` 命名空间 + Client `inject`）。
- `todo_write` 的移除手段（`ctx.tools.restrict()` 或 patch 禁用 `include:tool-todo`）。
- 会话 fork 的事件钩子（fork 时复制任务文件）。
- `$DSH_HOME` = `C:\Users\Administrator\.dsh`。

### 验证命令

- `C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe --check client.js`
- `C:\...\node.exe --test lib/task-store.test.js` → 23 passed
- `cordis_inspect_query` client `Slots.listSubTree` root `conversation.input.dock` → `task-list.panel` `active: true`

## 9. 文件地图（当前）

```
F:\DSH\projects\DSH任务系统重建计划\   ← 插件根（install_bundle 直接 link 此目录）
  package.json      bundle 清单：dsh.bundle.patch + dsh.client（web / immediately / inject layout+conversation）；scripts.test
  cordis.patch.yml  insert 行 id=task-list
  index.js          Host 半空 apply（等 P0 数据层接在这里）
  client.js         全部 UI：portal、viewArea 占位、大任务/小任务/状态节/卡片、双环、拖拽、进度环、阻塞/焦点/恢复提示
  lib/task-store.js        合并规则纯函数（create/patch/merge/remove/import，无 I/O）
  lib/task-store.test.js   node:test 单测，23 条
  locale/zh.json    meta.title=任务列表
  locale/en.json    meta.title=Task List
  icon.svg          青绿底清单图标
  HANDOFF-任务列表_2026-10-29.md   ← 本文件
```

跑单测：`& "C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" --test lib/task-store.test.js`（PATH 里没有 node，`npm test` 跑不起来，必须用这个绝对路径）。

## 10. 实现记录

### 10.1 静态界面原型（2026-10-29 第二轮）

用户选定「先出静态界面原型」。已实现并装机：

- **渲染入口**：注册 `conversation.input.dock`（id `task-list.panel`，order 10，locale `taskList`）。该槽是会话作用域，组件返回 `createPortal`，槽内不留 DOM。
- **挂载点改为对话 body，不是 centerCol**：`[class*="_centerCol"]` 内找 `[class*="_scrollBody"]`，取其父级且必须含 `[class*="_composerSeat"]`（即 `.an3WzG_body`，宿主已 `position:relative`）。这样 `bottom` 只需扣掉 composerSeat 实测高度，且不受 centerCol 无定位的影响；也避免给宿主加 `position:relative`。
- **定位**：`left:16px; width:340px; top:8px; bottom = composerSeat 实测高度 + 16px`（面板 `position:absolute`），上下都留余量，竖向撑满。
- **占位（第二轮修正）**：**不能给 `_scrollBody` 加 padding**——composerSeat 是 scrollBody 内部的 sticky 子元素，padding 会把输入框一起挤偏。改为给 `[class*="_viewArea"]` 设内联 `padding-left`，只推聊天列、输入框不动。
- **占位宽度算准**：聊天列宽度由 `--dsh-chat-content-width` 决定且居中。设 viewArea 宽 W、列宽 C、目标缝隙左缘 T = 16 + 面板宽 + 16：
  - `W - C ≥ T`（列放得下）：`P = max(0, 2T - W + C)`（居中时左缘右移 P/2，解出 P）；
  - 否则列被压缩：`P = T`（左缘正好贴 T）。
  - C 优先读 viewArea 的 computed `--dsh-chat-content-width`（px 形式），读不到回退 748。用 ResizeObserver 跟 viewArea 尺寸重算，拖动侧栏也保持 16px 缝隙；卸载还原原内联值。
- **折叠**：头部按钮收成 52px 窄条（图标 + 竖排标题 + 计数）。中栏宽度 < 820 时自动窄条（点击不展开，title 提示拖宽侧栏）。
- **假数据**：三层结构（2 父 + 2 子 + 1 独立），覆盖四态（待办/进行中/待确认/完成）与三优先级；点击状态圆点循环四态，点击有备注的标题展开/收起备注；进度条与计数实时算。纯前端 state，无落盘。
- **主题**：只吃 `--dsw-alias-*` / `--dsw-radius-*` / `--dsw-font-family`，全部带 fallback。

宿主 DOM 事实（本轮解包 `dsh-client-ui-conversation/lib/client.js` 得到，勿重查）：

- 对话结构：`.an3WzG_root`（position:relative） > header + `.an3WzG_body`（flex column，position:relative） > `.an3WzG_scrollBody`（flex:1，overflow-y:auto）。**composerSeat 是 scrollBody 内部的 sticky 子元素**（`root[data-phase=active] .composerSeat { position:sticky; bottom:0; z-index:7 }`），viewArea 在 `[data-slot="conversation.session"]` 下。
- 因此：给 scrollBody 加 padding 会连输入框一起挤偏；要推正文只能用 viewArea 的 padding。
- `--dsh-chat-content-width` 定义在 `.an3WzG_body` 上（`--dsh-chat-user-width` clamp 680–920），composer 卡片 `--dsh-composer-card-max-width = 内容宽 + 32`。
- 类名哈希前缀会变，后缀 `_scrollBody` / `_composerSeat` / `_viewArea` / `_centerCol` 稳定，选择器用 `[class*=...]`。

验证状态（2026-10-29）：

- `node --check client.js` / `index.js` 通过；`package.json`、`locale/*.json` 由 node 直接读文件校验通过。
- `install_bundle` 返回 `application: applied`，无 warnings；profile 依赖 `"@local/dsh-task-list": "link:F:/DSH/projects/DSH任务系统重建计划"`（目录 link 安装，源文件即运行文件，无副本哈希可比）。
- `cordis_inspect_query` client `Slots.listSubTree` root `conversation.input.dock`：occupant `task-list.panel` `active: true`。
- **视觉已确认（用户截图，2026-10-29 第二轮）**：面板撑满高度（上端贴 header、下端在输入框上方）、对话与面板之间 16px 缝隙、输入框回居中。第一轮的两个缺陷（面板只从底部往上长、scrollBody padding 挤偏输入框）已修复。
- **合并规则单测（2026-10-29 第三轮）**：`node --test lib/task-store.test.js` → 23 tests / 23 pass / 0 fail。覆盖插入、字段更新、user 条目保留、agent 条目撤回、时间冲突、相等时间、completedAt 迁移、非法提交、父存在/环校验、旧 todo 导入。

### 10.3 交互同步与层级重构（2026-10-29 第四轮）

- **图标与动画直接复制工作区美化**：`PanelIcon` 风格列表图标、`IconChevron`（16 网格 / 1.3 线宽 / `.12s` 旋转）、上移/下移/铅笔/垃圾桶/叉号、`InlineInput`（自动聚焦全选、Enter 提交、Esc 取消）、hover 才显现的 26px 操作组、两段式删除（点一次变红叉，点别处撤销）。
- **行首状态标记换成 SessionMarker 的双环**：外环 r6.2 / 2.2 线宽（`/` 对角线留缝），内环 r3.6 / 1.1，四个内点；复用其 **enter / exit 两段环动画**（各 1s：退出时弧线收缩 + 反向旋转，进入时旋转 + 弧线填充）。状态色映射：pending = 双色（muted+accent）、in_progress = brand、review = warn、completed = 绿。会话专用的四角箭头没有搬。
- **分组结构（用户逐层确认）**：`大任务节头 → 小任务容器（可折叠）→ 四态状态节 → 卡片`。卡片只在与其状态一致的节里渲染，空节半透明；没有子任务的顶层任务仍是普通单行。
- **状态切换的移动动画**：卡片用 FLIP —— 切换前记录所有卡片 rect，渲染后（`useLayoutEffect`）从旧位置 240ms 过渡到新位置（`cubic-bezier(.2,.8,.2,1)`）。点状态环、键盘 Enter、拖拽三条路径共用。
- **拖拽反向切状态**：卡片 `draggable`；状态节 `onDragOver/onDragLeave/onDrop`，只接受同一任务的卡片（`dragTaskIdRef` 同步判断，避免拖拽首帧闭包过期）；hover 目标节高亮（品牌色内描边）；drop 后走同一 FLIP。`document` 上的 `dragend/drop` 兜底清状态，防止拖出面板后残留。
- **键盘仍可用**：↑↓ 在容器/节头/普通行之间移动，Enter 切状态，Del 删除，Esc 取消；状态节与卡片行不参与键盘移动。
- **题头进度环（第五轮）**：题头图标 + 下方 4px 进度条合并为一个 24px 的上下文环（沿用 ContextRing 几何：14 viewBox、外环 r5.5、内环 r3.2 分左右两段、27° 缺口、端点小圆）。外环按「完成数 / 总数」画弧（每 1% 一段，颜色 `hsl(120,12%,78%)` → `hsl(120,55%,50%)` 沿弧渐变，**无旋转**）；内环左段按 `进度/40`、右段按 `进度/80` 在浅灰与纯绿之间插值；外壁线宽 1 → 1.6（24px 显示下约 1.4px → 2.7px）。
- **行尾状态文字已删**：`dstl-badge` 系列（待办/进行中/待确认/完成 胶囊）全部移除，状态只由行首双环表达；行尾只剩 hover 显现的操作组。节头保留「子任务数」，hover 时让位给操作组。
- **hover 底色常驻**：补 `.dstl-row.dstl-selected:hover` 规则（原先 `.dstl-selected` 与 `:hover` 同特异性且后者写在前，点选后底色被盖住）；同时删除选中行左缘 2px 品牌色描边。
- **行内状态环 16 → 18px**（`TaskMarker` 的 svg 18×18，viewBox 16 不变，几何整体 ×1.125）。
- **父任务状态改为纯推导（用户确认）**：`deriveStatus` —— 子任务全部完成 → completed；有完成或有任一子任务处于非 pending → in_progress；全部 pending → pending。父的环只读（`aria-disabled`、title「状态由子任务自动决定」），点环与 Enter 都不改父状态，`cycleStatus` 对含子任务的节点直接返回原值。父的存储状态字段保留但不参与显示。
- **防走神三件套（2026-10-29 第六轮，用户确认设计动机为「会话卡住后能接着走」）**：
  - **阻塞标记** `blocked`：不是第五态，四态照旧；行内环右上角加红点角标，备注写原因。行操作的禁止图标可切换，阻塞任务在恢复提示里优先出现。
  - **焦点** `focused`：每会话最多一个，钉住的任务行首（优先级条后）显示图钉；钉另一个会自动取消前一个。
  - **恢复提示**：面板头部下方一行「继续：<任务标题>」，点击选中该任务；推导顺序 = 焦点 → 阻塞 → 待确认 → 进行中 → 第一条待办叶子。无任务时不显示。
  - 行操作增至 6 个（↑ ↓ 阻塞 焦点 编辑 删除），按钮 22px；`.dstl-icon-on` 表示当前生效（阻塞/已钉住）。

### 10.2 待确认项（下一轮先问用户）

1. ~~卡片标题是 button，从按钮上按下可能不触发父级 dragstart~~ —— 用户实测拖拽正常，不需要把手。
2. 小任务容器与卡片都显示标题，可能冗余；可精简为「容器=标题+环，卡片=优先级+备注」。
3. 默认展开状态节（`collapsedTasks` 为空），如果面板过长可改为默认折叠。
4. 窄屏阈值 820px 是否合适，窄条 vs 直接隐藏。
5. 行密度（13px/20px 行高、5px 内边距）是否与宿主对话密度一致。

已确认：面板位置/宽度/上下余量 ✓；任务级后写胜（合并粒度）✓；合并规则纯函数 + 23 条单测 ✓。


参考物（只读，勿改）：
- 宿主 todo 工具提取：`F:\DSH\temp\asar-extract\dsh\node_modules\@deepseek-ai\dsh-tool-todo\`
- 候选插件解包：`F:\DSH\temp\candidates\{dsh-tool-todo-plus,dsh-crabtodo,dsh-global-todo}\package\`
- 同模式插件经验：`F:\DSH\projects\dsh-workspace-frontend\HANDOFF-DSH工作区前端重建_2026-10-28.md`

## 11. 导出记录

- **2026-10-29 第六版（v0.3.2，当前交付版本）**：`F:\DSH\导出\DSH任务系统重建计划_2026-10-29_v0.3.2.zip`（76 257 B，SHA256 `1811F83C23803B8B546A8A905F79766C02F27032EB8490417AB6AD0D0F9903FF`）。
  - 含 §20 全部改动（禁用 `todo_write`、FLIP 修复、卡片可投放、状态节大框、阻塞级联）+ 39 条单测 + 安装记录；README 已订正为 0.3.2（旧机路径、34 条单测、`todo_write` 仍注册等描述全部更新）。
  - 解包 14 个文件，`SHA256SUMS.txt` 的 13 条逐一核对 **0 处不匹配**。
  - 本文档的改动发生在打包之后，因此**包内 HANDOFF 比本文件早一版**；以项目目录这份为准。
- **2026-10-29 第五版（v0.3.1，用户切机前导出）**：`F:\DSH\导出\DSH任务系统重建计划_2026-10-29_v0.3.1.zip`（69 516 B，SHA256 `5D751A6470FD9D649C1258F32EA1B9AB2A6745DCAEB0DA081D0ED3EAA4180E72`）。
  - 已复制到 `E:\_成果回传\DSH任务系统重建计划_2026-10-29_v0.3.1.zip`，两边 SHA256 一致（已校验）。
  - 含：§14–§17 全部改动（布局规则、移除窄条、入场动画、头部计数删除、启停开关、轮询即时刷新）+ 37 条单测 + 欢迎页桥接代码（未生效，见 §19.1）+ HANDOFF/安装说明/逐文件哈希。
  - 打包注意：`ZipFile.CreateFromDirectory` 传 `entryNameEncoding = null` 才会写入 UTF-8 标志位，否则中文文件名在 Windows 资源管理器解压会乱码（v0.3.0 包就是没标志的）。
- **2026-10-29 第四版（v0.3.0）**：`F:\DSH\导出\DSH任务系统重建计划_2026-10-29_v0.3.0.zip`（56 750 B，SHA256 `8143072D837F02B1C9C6AA83C65474CAC008640AA60A0615CBDB2B5CA64E888C`）。
  - 已复制到 `E:\_成果回传\DSH任务系统重建计划_2026-10-29_v0.3.0.zip`，两边 SHA256 一致（已校验）。
  - 含：后端接入完整版（原子存储、HTTP 写通道、`task_list`/`task_write`、fork 复制）+ 前端真实数据对接与新建/备注/优先级入口 + 34 条单测 + HANDOFF（含 §13 本轮记录与踩坑）+ 安装说明 + 逐文件哈希。
- **2026-10-29 第三版（v0.2.1）**：`F:\DSH\导出\DSH任务系统重建计划_2026-10-29.zip`（41 077 B，SHA256 `4084D74366E1E4BE06B01DD02DC144C67CDBF5F83A4ABDBA218C52D57B67126B`）。
  - 含：前端交互完整版 + 合并规则 23 条单测 + HANDOFF（含后端 15 项决策）+ 安装说明 + 逐文件哈希。
- 历史版本归档在 `F:\DSH\legacy\`：`..._v0.1.0.zip`（26 217 B，纯静态原型）、`..._v0.2.0.zip`（39 058 B，交互完成但无防走神三件套）。
- 包内 HANDOFF 为打包时刻版本；后续改动以项目目录里的本文件为准。

## 12. 后端实施方案（2026-10-29 两轮问答定案）

前端交互已基本完成，后端（Host 半）从零开始。以下 12 项决策已由用户逐条确认，动工按此执行。

### 12.1 决策记录

| # | 决策 | 结果 |
|---|---|---|
| 1 | 存储位置 | `$DSH_HOME` 下自建 JSON，按 sessionId 分桶（不用 `ctx.storage`） |
| 2 | 数据范围 | 每会话一份；**fork 时复制**；归档保留 |
| 3 | 多窗口同步 | 暂不做（无推送事件） |
| 4 | agent 读到的父状态 | **返回推导值**（后端计算后返回） |
| 5 | 与 `todo_write` | **替代**：从 agent 工具列表移除旧工具，写路径全部进新列表；历史 todo 卡片保留不动 |
| 6 | 新建入口 | 面板内可新建：头部「+」建大任务，大任务行悬停「+」建子任务 |
| 7 | 编辑能力 | 本轮做**备注 + 优先级**编辑（已有标题编辑） |
| 8 | 删除 | **硬删除**，级联子任务，无回收站 |
| 9 | 折叠/宽度 | 继续存浏览器 `localStorage`，不进 Host 数据 |
| 10 | agent 工具粒度 | 只给 `task_list`（读）+ `task_write`（整表提交）；不提供单条 patch 工具 |
| 11 | 旧数据导入 | **不导入**（`importLegacyTodos` 保留函数，默认不调用） |
| 12 | agent 删除权限 | 允许**显式删除**任意任务（含用户建的）；整表提交缺失只删 agent 自己的条目 |
| 13 | 卡住怎么表达 | 四态之外加 `blocked` 标记（环上红点角标 + 备注写原因），不新增第五态 |
| 14 | 恢复提示 | 面板顶部「继续：<任务标题>」，推导顺序 焦点 → 阻塞 → 待确认 → 进行中 → 待办 |
| 15 | 焦点 | 每会话最多一个 `focused`；钉住时任务行首显示图钉，钉另一个自动取消前一个 |

### 12.2 实现顺序与模块

1. **存储层**：`$DSH_HOME/task-list/<sessionId>.json`（或单文件分桶），结构 `{ version, sessionId, tasks, updatedAt }`；临时文件 + rename 原子写；损坏时备份并重建。
2. **Remote**：`task_list(sessionId)`（返回推导后的树）、`task_update(sessionId, id, patch)`、`task_create(sessionId, input)`、`task_remove(sessionId, id)`、`task_setStatus(sessionId, id, status)`；所有写路径走 `lib/task-store.js`。
3. **前端对接**：删 DEMO，读 remote；操作写回（先乐观更新，失败回滚）；`externalUpdateAt` 非空显示一次「已被外部更新」。
4. **agent 工具**：`task_list`、`task_write`；同时把宿主 `todo_write` 从工具列表移除（方式待查：`ctx.tools.restrict()` 或 patch 禁用 `include:tool-todo`）。
5. **新建与编辑 UI**：头部「+」/ 子任务「+」；备注、优先级的行内编辑。
6. **边界**：删除级联、fork 复制、归档保留、无会话时面板行为。

### 12.3 动工前仍需查证（工程事实，不是决策）

- Remote 的注册方式（`ctx.remote` 命名空间声明与 Client 侧 `inject`）。
- `todo_write` 的移除方式：`ctx.tools.restrict()` 是否覆盖会话级工具，或直接 patch 掉 `include:tool-todo` 行。
- fork 复制任务的钩子：会话 fork 事件（Event 服务）里读写新 sessionId 的任务文件。
- `$DSH_HOME` 在本机的实际路径（`C:\Users\Administrator\.dsh`）。

## 13. 后端接入（2026-10-29 第八轮，已装机）

### 13.1 落地结构

| 层 | 文件 | 要点 |
|---|---|---|
| 存储 | `lib/task-file.js` | `$DSH_HOME/storages/task-list/<sessionId>.json`；临时文件 + rename 原子写；损坏文件改名为 `.corrupt-<ts>` 并返回空表；sessionId 里非 `[A-Za-z0-9._-]` 一律换成 `_`，不会逃出目录 |
| 纯规则 | `lib/task-store.js` | 补上 `blocked`/`focused` 字段（§4.2 定义过、原实现漏了）；新增 `setFocus`（每会话唯一）、`deriveStatus`（父状态推导）、`nextOrder`、`moveSibling`、`removeSubtree`；agent 插入任务强制 `focused:false` |
| 写通道 | `index.js` | **一个** same-origin 路由 `POST /task-list/api/tasks`，body `{sessionId, op, id, patch, input, direction}`，op ∈ create/update/status/focus/move/delete；每次返回**整表**，前端直接用它替换乐观副本；写请求校验 `origin.host === req.headers.host` |
| agent 工具 | `index.js` | `task_list`（可选 `includeNotes`）读推导后的树；`task_write` 整表提交走 `mergeAgent`；输出 schema 只有 `{type:'object', properties:{text:{type:'string'}}}` |
| fork | `index.js` | 监听 `session/created`，读 `session.header.parentSession`；`origin==='subagent'` 跳过；子会话已有任务则跳过；整段 try/catch（同步抛异常会 veto 会话创建） |
| 前端 | `client.js` | 删 `DEMO`，`toTree(flat)` 把 parentId 列表转成渲染用的嵌套树；`runOp(乐观更新, op)` 统一「先改本地 → 请求 → 用返回整表覆盖 → 失败回滚 + footer 报错」 |

### 13.2 新增的前端入口（决策 #6/#7）

- 头部 `+` 建顶层任务，行尾操作组 `＋` 建子任务；草稿行渲染在列表最上方，回车创建、Esc 取消。
- 行尾操作组：主按钮 5 个（上移 / 下移 / 新建子任务 / 「⋯」/ 删除），低频 4 项（阻塞 / 焦点 / 备注 / 重命名）收进「⋯」菜单（图标 + 文字，当前生效项用品牌色）；菜单点外部或 Esc 关闭，菜单打开时操作条保持可见。
- 备注：展开的卡片里备注右侧 hover 出现铅笔；无备注时点「备注」按钮新建，textarea + 保存/取消，Ctrl+Enter 保存。
- 优先级：行首那条 3px 竖条改成按钮，点击循环 high → medium → low。
- `externalUpdateAt` 非空时行内显示橙色小点（title 提示「已被外部更新」），用户下次写该任务时由 `patchTask` 清掉。
- 空列表显示「还没有任务 / 用右上角 + 新建第一个任务」；footer 显示连接状态或错误原因。

### 13.3 踩坑（关键，勿重犯）

1. **工具 `parameters` 必须是标准 JSON Schema。** `ctx.tools.register` **不做**转换，转换只发生在 `defineTool`（`parameterSchemaSpecToJsonSchema`）里，而外部 link 安装的纯 JS 包没法 import 宿主包。直接传 `{字段: {...}}` 会让 `parameters` 变成 `type: null`，**DeepSeek API 直接 400，整个会话每一轮都失败**——表现就是「插件一开，对话就转不动」。正确写法：`{ type:'object', properties:{...}, required:[...] }`。
2. **工具至少要有一个 property**，空 `{}` 同样得到 `type: null`。所以 `task_list` 带了个 `includeNotes`。
3. **output schema 的属性上不能写 `required: true`**：`JsonSchemaError: schema.properties.text.required is not supported on type "string"`，`install_bundle` 会报 `application: failed`。用标准的 `required: ['text']`，或者干脆省略。
4. **`todo_write` 在 agent preset 内部注册，不是全局工具。** `ctx.tools.restrict` 只限制 global tools（「scope-local names fail」），从插件 ctx 调用碰不到它，监听 `tools/change` 重试也没用。要真移除只能改 profile patch 里 `preset-standard.plugins` 的 `- id: tool-todo` 加 `disabled: true` —— **并且要重启才生效，同时 `todos` 投影消失、输入框上方 todo 进度条随之消失**。本轮用户决定先保留旧工具，配置已还原。
5. 调试这类「工具 schema 坏 → 全轮失败」的问题时，每次安装后要立刻验证；插件拆装一次（remove + install）才会重新应用，单纯 install 遇到 `already-installed` 不会重载。

### 13.4 已验证（2026-10-29）

- `node --check`：`index.js` / `client.js` / `lib/task-store.js` / `lib/task-file.js` 全过。
- `node --test lib/task-store.test.js` → **34 passed / 0 failed**。
- 存储层冒烟（临时 `DSH_HOME`）：路径净化、缺失→空、往返、覆盖、损坏备份 aside、重建，全部符合预期。
- HTTP 冒烟（Node fetch，UTF-8）：创建（带中文与引号）、建子任务、改状态、设焦点、改备注、同级移动、级联删除（删父连子，removed 2）、跨源写 403、最终空表。
- `install_bundle` → `application: applied`，`warnings: []`。
- `cordis_inspect_query Tool listTools`：`task_list` / `task_write` 均为 `type: "object"`；`todo_write` 仍在（预期）。
- `cordis_inspect_query client Slots.listSubTree conversation.input.dock`：`task-list.panel` `active: true`。

### 13.5 未完成 / 待确认

- **面板视觉效果待用户确认**（刷新页面后）：空状态、新建行、备注编辑、优先级竖条点击、操作组 8 个按钮是否过挤。
- agent 写入后面板不会自动刷新（决策 #3「多窗口同步暂不做」）；要么手动刷新页面，要么后面加「窗口聚焦时重拉一次」。
- fork 复制未实测（需要真的 fork 一个会话）。
- `task_write` 工具本身未用真实 agent 调用跑过（HTTP 路径等价，且单测覆盖合并规则）。
- 交付包需要重新导出（v0.3.0）。

## 14. 结构与布局修正（2026-10-29 第九轮，已装机）

### 14.1 四状态节归父任务（用户确认的新形态）

`buildList` 重写为：

```
父任务（head） → 待办 / 进行中 / 待确认 / 完成 四节 → 该父下所有子任务卡片按 status 落节
```

- 子任务**不再有独立容器行**；`task` 变体、`collapsedTasks` state、`onToggleTask` prop 全部移除。
- 卡片现在自己也带操作组（原来 card 不显示操作组，因为它只是个展示卡）。
- 拖动：状态节归属父任务，接受**该父任务下任意子任务**，判据 `childOf(parentId, childId)`；`dropTarget` 结构从 `{taskId, status}` 改成 `{parentId, status}`。
- 空节判定改为 `count === 0`（原来拿 `task.status !== status`，父任务下不成立）。
- 键盘 ↑↓ 现在会走到卡片上（`visibleRows` 只排除 status 行）。

### 14.2 只做两层（用户决定）

- 子任务卡片不显示「＋」（`isCard ? null : …`），只有大任务行和顶层单行任务能建子任务。
- 历史三级任务不渲染；删除父任务时由 `removeSubtree` 一并级联删除。

### 14.3 环颜色与动画 bug（已修，根因值得记住）

**现象**：子任务卡片在「进行中」节里，环却是别的颜色；点环没反应、也不播动画。

**根因**：数据里这些"子任务"各自挂着三级子任务（早先建的），于是

1. `autoStatus = (task.children || []).length > 0` 为真 → 卡片被当成父任务，环显示 `deriveStatus()` 的**聚合值**；
2. 而分节用的是**自身 status** → 两套状态，颜色和所在节对不上；
3. `cycle()` 同样见到 children 就 `return` → 点环无效，`markerState` 不变，动画自然不播。

**修法**：判断"是不是父任务"必须用**渲染变体**，不能用数据里的 children 数量。

- `const autoStatus = isHead;`，`displayStatus = isHead ? deriveStatus(task) : task.status;`
- `cycle()` 只在「顶层（parentId 为空）且有子任务」时拦截。
- 顺手清掉两个三级残留（`333333333`、`333333`）。

### 14.4 对话列与输入框对齐（布局）

**原来的问题**：只给 `viewArea` 加左 padding，而宿主把对话列**居中**在剩余空间里，于是面板右边空一块、对话右边再空一块，对话被夹在中间。

**现在的做法**：

```
paddingLeft  = 16 + 面板宽 + 16      （左缘固定在面板右侧）
paddingRight = 0
--dsh-chat-content-width = min(920, 中栏宽 - paddingLeft)
```

- 列宽跟剩余空间走，`920` 是上限（对齐宿主 `--dsh-chat-user-width` 的 clamp 上限），右栏关闭时中栏变宽也不会撑成一面文字墙。
- **`composerSeat` 是 scrollBody 的 sticky 兄弟，不吃 `viewArea` 的 padding**，所以它要单独设 `paddingLeft` / `paddingRight` / 同名变量；给 sticky 元素加 padding 不会破坏 sticky。
- 卸载时三个属性都要恢复（`paddingLeft` / `paddingRight` / `--dsh-chat-content-width`）。
- 删掉了不再使用的 `computeShift` / `computePads` / `computeSeatPads` / `readContentWidth` / `CONTENT_WIDTH_FALLBACK`。

### 14.5 待确认（下一轮开头先问用户）

1. `MAX_CONTENT_WIDTH = 920` 是否合适（可改 `client.js` 顶部常量，一个数字）。
2. 右栏展开 / 关闭两种状态下的视觉是否都对。
3. 双段环动画（退出 1s + 进入 1s）在换节时是否恢复正常。

### 14.6 本轮未做

- `README-安装说明.md` 里「16px 缝隙」「中栏 <820 收窄条」等描述仍是旧逻辑，需要随 §14.4 一起更新。
- 交付包仍是 15:0x 导出的 v0.3.0，**不含本轮 §14 的改动**，需要重新导出 + 双备份。
- `SHA256SUMS.txt` 需要重算。

## 15. 移除窄条模式 + 布局规则定稿（2026-10-29 第十轮）

### 15.1 用户决定

- **删除窄条模式**：`collapsed` 手动收起、中栏 <820 自动窄条、顶部收起按钮、`.dstl-panel-rail` / `.dstl-rail*` 样式、`IconList`、`RAIL_WIDTH` / `NARROW_LIMIT` 常量与三条 locale 文案全部删除。面板只有展开态，宽度 280–480 拖拽。
- **布局规则**（问答卡片确认）：
  1. **右侧边栏打开时**：对话与输入框夹在「任务面板右缘」与「右侧边栏左缘」之间，左右各 16px 缝隙，内容宽随剩余空间自适应（不再有 920 上限）。
  2. **右侧边栏关闭时**：对话与输入框回到宿主默认布局（居中、不被面板推挤），面板浮在左侧、可能盖住对话左缘——用户明确接受。

### 15.2 实现

- 布局 effect 重写（`client.js` 原 §14.4 逻辑）：用 `document.querySelector('[data-rightbar-col]')`（回退 `[class*="_rightbarCol"]`）实时测右栏宽度，`> 1px` 视为打开，`≤ 1px` 视为关闭。
- 打开：`paddingLeft = 16 + 面板宽 + 16`、`paddingRight = 16`、`--dsh-chat-content-width = view.clientWidth - 左 - 右`；`viewArea` 与 `composerSeat` 各自设置同一组三个属性（seat 是 scrollBody 的直接子元素，不吃 viewArea 的 padding）。
- 关闭：`restore()` 把 viewArea 与 composerSeat 的内联 padding 与变量恢复成挂载时快照（通常为空）。
- `ResizeObserver` 仍只观察 `viewArea`：右栏开关会改变中栏宽 → view 宽变 → 重算；不需要额外观察右栏列。
- 拖动面板宽度通过 `panelWidth` effect 调 `applyRef.current()` 立即重算。
- `hostWidth` / `seat` 测量里只保留 `composerHeight`（面板底部止于输入框上方的依据）。

### 15.3 验证状态

- `node --check client.js` / `index.js` 通过。
- `node --test lib/task-store.test.js` → 34 passed / 0 failed（布局改动未触及合并规则）。
- 已装机（profile 依赖是 link 到本目录，源文件即运行文件）；client bundle 需刷新页面才加载新版。
- **视觉已确认（用户截图）**：右栏开时对话与输入框夹在中间、右栏关时恢复默认。

### 15.3.1 两处对齐补丁（同轮追加）

用户复查后又提了两处，均改为**实测**而非写死：

- **输入框左缘对齐正文列**：宿主给 composer 卡片包了带内边距的列，卡片天然比正文右一截。`alignComposer()` 量 `[class*="_column"]`（正文列）与 `[data-composer-card]` 的左缘差，直接加到 `composerSeat.style.paddingLeft` 上。
- **皮肤历史对话 rail 贴右栏**：`dsh-claude-style` 的 `.dsh-claude-turn-rail` 用 `absolute; right:12px` 贴它当初构建的列，列被推走后 rail 留在半空。`alignRail()` 先清 transform，量 rail 右缘与 `[data-rightbar-col]` 左缘，用 `translateY(-50%) translateX(dx)` 顶到右栏左缘 −12px；`restore()` 一并清掉。
- 两处都在布局 effect 的 `apply()` 里跑，随右栏开关、面板拖宽自动重算。

### 15.4 遗留

- 交付包仍为 v0.3.0（不含 §14/§15），`package.json` 已升 0.3.1，导出前需重新打包 + 双备份 + 重算 `SHA256SUMS.txt`。
- `README-安装说明.md` 顶部版本已改 0.3.1，交互节已按新布局改写；`已知限制` 里折叠态描述已删。

## 16. 面板即时刷新（2026-10-29 第十一轮）

用户要求：agent 写入后已打开的面板要自己更新，不要手动刷新或切会话。

### 16.1 做法：轮询文件戳

- `lib/task-file.js`：`readTaskState` 返回 `updatedAt`；`writeTaskState` 返回 `{ file, updatedAt }`。
- `index.js`：`GET /task-list/api/tasks` 与 `POST` 响应都带 `updatedAt`（写入时的时间戳）。
- `client.js`：
  - 新增 `lastSyncRef`（屏幕上的数据对应的戳）与 `writingRef`（本地写进行中）。
  - 初始加载与 `runOp` 响应都记录 `stampOf(body)`。
  - 新 effect 每 **1500ms** 拉一次 `readList`，`stamp !== lastSyncRef` 才 `setTasks`（整表替换，Host 是真相）。
  - 轮询暂停条件：标签页 `visibilityState === 'hidden'`、`writingRef.current`、`notesEditingId` / `creating` / `renamingId` 非空（避免吃掉正在编辑的草稿）。
  - `visibilitychange` → 回到前台立即拉一次。

### 16.2 验证

- `node --check` client.js / index.js / lib/task-file.js 通过；34 条单测通过。
- **必须重装 Host 半**：改 `index.js` 只刷新页面不生效，要 `remove_bundle` + `install_bundle` 重新应用（版本 0.3.1 已重装，`application: applied`）。
- 接口冒烟：`GET` 返回 `updatedAt`（写入前 1793259078657 → 写入后 1793259196670 变化 ✓，7 条任务）。
- 用户刷新一次页面加载新 client bundle 后，agent 写入应在 1–2 秒内出现在面板。

### 16.3 新条目入场动画

- **行从左划入**：`.dstl-item-in` 播放 `dstl-item-in`（`translateX(-16px)` + 透明 → 原位，0.34s，`cubic-bezier(.2,.8,.2,1)`）。挂在 `.dstl-item` 上，不影响 FLIP 与 `paddingLeft` 缩进。
- **圆环入场**：`TaskMarker` 新增 `enterOnMount`，首帧挂载时直接走 `enter` 相位（旋转 + 弧线填充 1s），复用状态切换那套动画。`prefers-reduced-motion` 下关闭。
- **判定新条目**：`primedRef` + `seenIdsRef`。首次加载只登记 id 不播（避免整列表刷入时全动）；之后 `tasks` 里新出现的 id（面板新建、agent 写入被轮询拉到）进 `entering` 集合，420ms 后清空。集合通过 `entering.has(id)` 传给 `TaskRow`。

### 16.4 头部去掉「完成/总数」计数

用户要求删除标题右侧的 `6/9` 胶囊：删 header 里的 `.dstl-head-count` `<span>` 与对应 CSS 规则。进度仍由标题左侧的进度环表达（`TaskProgressRing`）。

## 17. 全局/分组启停（2026-10-29 第十二轮）

### 17.1 用户决定（问答卡片）

- 启停语义：**独立 `paused` 标记**，不改变四态；暂停的条目不参与推进，面板置灰。
- 父任务行的 ▶/⏸ **只作用于该父任务的子任务**。

### 17.2 数据层

- `Task.paused: boolean`（默认 false）。`lib/task-store.js`：`LOCAL_PATCH_FIELDS` 加 `paused`，`createTask` 默认写、`patchTask` 支持、`applyIncoming`（agent 整表合并）保留 `current.paused`——与 `focused` 同属用户意图，agent 提交不能清掉。
- 新纯函数 `setPaused(tasks, scope, parentId, paused, { now })`：`all` 覆盖全部任务，`subtree` 只改 `parentId` 的直接子任务；**跳过 completed**（暂停已完成无意义）。新增 3 条单测 → 37 passed。
- `index.js`：`applyOp` 加 `case 'pause'`（`{ op:'pause', scope:'all'|'subtree', id, paused }`）；`formatTaskList` 对暂停任务输出 `(paused)` 标签，agent 读到就知道不要推进。

### 17.3 界面

- **一个切换按钮**（用户改）：运行时显示 ⏸、暂停时显示 ▶，点击即切换；两个图标叠放，用 `rotate(±90deg) + scale(.45)` + 淡入淡出 0.18s 衔接（`PlayPauseGlyph` + `.dstl-toggle*`），不是直接换图标。
- **全局**：头部 `+` 左侧；未暂停时按钮高亮。
- **分组**：父任务行操作组最左侧；`scopePaused` = 该父下任一未完成子任务处于 paused。
- **置灰**：`.dstl-row.dstl-paused{opacity:.5}` + 标题划线。
- **删除「继续：<任务>」**：连同 `nextTask()`、`dstl-resume*` CSS、`resume.label` 文案一并删除。
- 图标：新增 `IconPlay`（实心三角）、`IconPause`（两条竖线）；`PlayPauseGlyph` 负责变形切换。

### 17.4 验证

- `node --check` client.js / index.js / lib/task-store.js 通过；`node --test` → 37 passed。
- Host 重装（remove + install，application: applied）。
- HTTP 冒烟：`POST {op:'pause', scope:'all', paused:true}` → 11 条里 4 条未完成项被置 paused（7 条 completed 跳过）；`paused:false` 恢复后 0 条。
- 界面效果待用户刷新确认。

## 18. 彻底禁用 `todo_write`（2026-10-29 用户确认）

用户问「以后所有会话都调用新列表而不是旧的吧」，核实后**不能保证**：`todo_write` 仍在 `preset-standard` 里注册。用户选择彻底禁用。

- **改动**：`C:\Users\Administrator\.dsh\profiles\desktop\cordis.patch.yml`，`preset-standard.plugins` 的 `- id: tool-todo` 加 `disabled: true`（保留 `config.allowParallelInProgress`）。
- **生效条件**：**重启 DSH**（preset 在启动时装配，热重载不覆盖）。
- **副作用（用户已确认接受）**：`todos` 投影随工具一起消失 → 输入框上方那条 todo 进度条不再出现；历史会话里的 todo 卡片仍按事件日志回放。
- **回滚**：删掉 `disabled: true` 并重启即可恢复。
- 之后所有新会话的 agent 工具列表里只有 `task_list` / `task_write`，不会再出现 `todo_write`。

## 19. 新会话欢迎页自带面板（2026-10-29 第十三轮）

**问题**：打开新会话（欢迎页）时面板不出现，必须先发一条消息。

**根因（已查实）**：`conversation.input.dock` 是 `scope: "session"` 的槽；空会话没有 sessionId，宿主根本不渲染这个槽（`zone !== void 0 && renderSlot(...)`）。皮肤插件（dsh-claude-style）的欢迎页也是绕开它、手动往 hero 容器里塞 `.dsh-claude-home-seat` 的。

**做法**：新增 `HeroTaskPanel` 桥接，注册到根级 `shell.overlay`（`kind: list`、`scope: root`，可叠加、不覆盖）：
- 用 `MutationObserver` 盯 `document.body`（`childList/subtree` + `data-content-phase` 属性）；
- 判定 `[data-content-phase="hero"]` 存在且 `[data-slot="conversation.input.dock"]` 不存在 → 渲染 `TaskPanelHost`（`heroMode: true`）；
- dock 一出现（首条消息发出）立即返回 `null`，由 dock 的实例接管。

**heroMode 差异**：
- 底部不再按 composerSeat 高度收口（欢迎页输入框在中部，会让面板变矮），直接用 `PANEL_GAP` 撑满；
- 头部 `+` 禁用（空会话没有 sessionId，写了也没处落），title 提示「没有会话，面板未连接」；
- 空列表显示「还没有任务」，footer 显示未连接提示。

**验证**：`node --check client.js` 通过；`Slots.listSubTree shell.overlay` 里 `task-list.home` 已注册且 `active: true`（说明 client bundle 已被 HMR 热更新，无需刷新）。hero 时的实际效果待用户开新会话确认。

### 19.1 结果：未生效，用户叫停（2026-10-29）

- 试过两版判定：① `[data-content-phase="hero"]`；② `[data-conversation-content]` 存在且无 dock。两版在欢迎页都没有面板。
- 加过诊断浮层（右下角红字 `dstl probe: ...`），用户反馈**连浮层都没出现** → `HeroTaskPanel` 组件在欢迎页根本没有渲染（不是判定条件的问题）。
- 可能原因（未查实）：
  1. `shell.overlay` 的 occupant 虽 `active: true`，但欢迎页时 AppFrame 未渲染 overlay 层；
  2. 欢迎页其实**有** `[data-slot="conversation.input.dock"]`（皮肤把 home panel 塞进去），组件返回 null 而非探针——但那样 `task-list.panel` 也该随之渲染，与现象矛盾；
  3. 用户新开的是独立窗口/新实例，页面没有加载到最新 bundle。
- 用户决定「算了」：欢迎页这块不再追。面板在**已进入的会话**里正常，欢迎页需要发第一条消息后才出现。
- 已回滚诊断浮层，`HeroTaskPanel` 桥接代码保留（无害，若将来生效即用）。
- 任务 `hero-panel` 标为 blocked，备注指向本节。

## 20. 收尾轮（2026-10-29 晚，跨机重装后）

用户说「应该就差一点收尾了」，本轮做完安装校验、禁用旧工具、四个交互修复。

### 20.1 本机重装与健康检查

- 宿主 `0.2.1-rc.2`；插件 v0.3.1 link 到 `C:\Users\12870\.dsh\plugins\dsh-task-list`。
- 重启前后都验过：`task-list.panel` `active: true`、`node --test` 全过、`GET/POST /task-list/api/tasks` 正常。
- 交付包 `DSH任务体系重建计划_2026-10-29_v0.3.1.zip` 解包 13 文件与运行目录、HANDOFF 的 SHA256 逐一一致。

### 20.2 禁用宿主 `todo_write`（本机首次）

- 本机 `profiles\desktop\cordis.patch.yml` 原本没有这条（旧机的改动没随迁移过来）。
- 做法：追加 `- id: preset-standard` 覆盖行，**完整重述** shipped `@deepseek-ai/dsh-web-app/presets/standard.patch.yml` 的 `config`（`id`/`order`/22 个 plugins），只把 `tool-todo` 设为 `disabled: true`。
- **为什么不能只写一行**：`todo_write` 由 agent preset 内部注册，profile patch 命中不了子条目；而 patch 的 `config` 是整体替换、不深合并（见 `cordis-composition-reference` 的 Loader patch dialect），少写字段就会丢声明。
- 代价：standard preset 冻结在抄下的这个版本，宿主升级若改了 preset 需重新对照。
- 校验：PyYAML（临时装到 `F:\DSH\temp\pylibs`）解析通过。重启后 `plugin_manager list_plugins` → `include:tool-todo` `enabled: false`。
- **本会话仍带 `todo_write`**：已存在的会话沿用启动时的 preset 修订，新会话才没有。这是设计行为，不是没生效。

### 20.3 修复：agent 写入时卡片换节没有 FLIP 动画

- 根因：FLIP 的旧坐标只在「点环」`cycle()` 和「拖放」`onStatusDrop()` 里记录，轮询采纳 agent 写入时直接 `setTasks`，没有旧坐标可比。
- 修法：抽出 `snapshotRects()`，在 **`runOp` 入口**和**轮询采纳前**各调用一次。这样点环、拖放、删除、重命名、新建、agent 写入全部走同一条路径。
- 用户实测确认。

### 20.4 修复：拖到卡片上不能被状态节收录

- 根因：列表**扁平渲染**，`StatusSection` 只渲染「待办/进行中/…」那行文字，卡片是它的**兄弟节点**，不在节的 DOM 子树里，所以投放区只有那行字样。
- 修法：卡片行（`variant === 'card'`）转发 `dragover / dragleave / drop`，映射到自身所属节 `(row.ownerId, row.task.status)`；用 `ownerId` 而不是 `task.parentId`，与节行同源。

### 20.5 视觉：状态节与其卡片整合为一个框

- 渲染从 `rows.map` 改为**分组渲染**：遇到状态节就开框，把后继卡片收进去，直到下一个节。`rows` 数组仍扁平（键盘顺序、FLIP 快照都基于它）。
- `.dstl-section-box`：浅底 `bg-layer-2` + 1px `border-l1` + 10px 圆角；空节用虚线框、无底色。
- 卡片 `.dstl-row-card` 背景改 `transparent`，否则框内又是一块块白。
- **第一版踩坑**：给卡片单独加拖拽高亮 `.dstl-row-card.dstl-row-drop`，因为判定只看 `(ownerId, status)`，同节所有卡片会一起亮，用户看到「框套框」。改为只高亮整个大框 `.dstl-section-box-drop`（`outline: 2px` 品牌色 + `offset: -2px`，照搬工作区美化 `dssx-browser-group.dssx-drop-target` 的写法）。

### 20.6 父任务阻塞级联子任务（用户选定「级联写入」）

- `lib/task-store.js` 新增 `setBlocked(tasks, id, blocked, { scope })`：`subtree` 改父任务及其**未完成**直接子任务，`task` 只改自己。
- `index.js` 新增 op：`{ op: 'block', id, blocked, scope }`。
- `client.js` 的 `setBlockedLocal` 用同一规则做乐观更新，父任务有子任务时自动带 `scope: 'subtree'`。
- 跳过 `completed`：已完成条目没有「在等什么」，与 `pause` 的处理一致。
- 单测 37 → **39 passed**；HTTP 冒烟：父+两个子一起 true，解除后一起 false。
- **注意**：级联只发生在界面按钮上。agent 用 `task_write` 写父任务 `blocked: true` 不会顺带标子任务（写的是显式字段）。

### 20.7 本轮验证命令

```
node --check index.js / client.js / lib/task-store.js
node --test lib/task-store.test.js      → 39 passed
cordis_inspect_query client Slots conversation.input.dock → task-list.panel active
plugin_manager list_plugins → include:tool-todo enabled:false
```

### 20.8 回归：换节后环动画不播（用户发现，已修）

**现象**：拖动子任务换节后，状态环不再播那套「退出 + 进入」两段动画，直接变成新颜色。

**根因**：20.5 改成分组渲染后，卡片是各节的子节点。状态一变，卡片就从「待办」那个 `.dstl-section-box` 挪进「完成」那个框——**DOM 父节点变了，React 只能卸载重建**。新挂载的 `TaskMarker` 里 `prevState` 初始化就等于新状态，`prevState === markerState` 直接 return，两段动画一段都不播。FLIP 不受影响，因为它靠 `cardRefs` 的坐标快照，跟挂载无关。

**修法**：

- 新增 `prevStatusRef`（`Map<id, status>`），在 `tasks` 变化的 effect 里记录全树状态。
- 渲染卡片时读上一轮的 status 作为 `prevStatus` 传下去（`TaskRow` → `TaskMarker`）。
- `TaskMarker` 挂载时若 `prevStatus` 存在且与当前不同，先按**旧状态颜色**播 exit（1s），再按新状态播 enter（1s）；新条目仍走原来的 `enterOnMount` 单段进入。

**顺带修回点环**：点环切状态走的是同一条换节路径，之前同样没动画。

**教训**：把兄弟行改造成「容器内子元素」时，要顺手检查所有依赖**实例存活**的动效（React 的 `useRef` 初值、CSS transition、组件内 state）。跨父节点移动 = 重挂载，`useEffect` 的依赖比较不会发生。

用户实测确认。

## 21. 本机安装 v0.3.3（2026-10-30，Administrator 机）

- 来源：`E:\_成果回传\DSH任务系统重建计划_2026-10-29_v0.3.3.zip`（77 374 B），包内 `SHA256SUMS.txt` 13 项校验全一致。
- 安装方式：**link 安装**——`C:\Users\Administrator\.dsh\profiles\desktop\node_modules\@local\dsh-task-list` 是 SymbolicLink → 本目录，覆盖本目录即更新运行文件；profile 依赖不变，无需重跑 pnpm。覆盖前项目目录是 v0.3.1 时代（16:02），本轮整体升级到 v0.3.3。
- 覆盖前备份：`F:\DSH\temp\backup-task-list-20261030-105823\项目目录`（旧 v0.3.1）。
- 校验：已装 14 个文件与包内源 SHA256 逐一一致；`node --check`（index/client/task-file/task-store/test）全过；`node --test lib/task-store.test.js` → **39 passed / 0 failed**。
- 生效：**Host 半需重启 DSH**（本轮运行中的进程仍是旧 0.3.1 代码）；Client 半刷新页面。
- 附：全局白皮书 `~/.dsh/AGENTS.md` 同轮换新版（9 194 B，来自 `E:\_成果回传\AGENTS.md`），旧版备份在 `F:\DSH\temp\backup-task-list-20261030-105823\AGENTS.md.old`。
- 注意：本文件在包导出后又追加了本节，与包内 `SHA256SUMS.txt` 的 HANDOFF 行不再一致；其余文件哈希仍与 v0.3.3 一致。

## 22. v0.3.4：父子结构治理（P3 交付，2026-10-30）

- 背景：从「新插件实现成本与可能性评估」P3 拆分为独立项目 `F:\DSH\projects\任务系统父子结构治理`，由独立会话实施；本节记录其结果。
- 改动：
  - `index.js` 的 `taskWriteTool()` description 追加三段结构规则（顶层=阶段 / 每个顶层至少 1 个子任务 / 最多两层）。
  - `lib/task-store.js` 新增 `DEFAULT_MAX_FLAT_TOP_LEVEL = 3`；`mergeAgent` 返回 `structure{ newTopLevel, newTopLevelWithoutChildren, maxFlatTopLevel, overLimit }`，只统计**本次新增**顶层、不追溯历史。
  - `index.js` 的 `describeMerge`：`overLimit` 时在返回文本尾部追加 warning，**不拒绝写入**。
  - `lib/task-store.test.js` 39 → 43（新增 4 条：4 个平铺顶层 warning / 4 个顶层各带子任务无 warning / ≤3 无 warning / 旧平铺列表更新不误报）。
- 验证：`node --test` → **43 passed / 0 failed**；真实 `task_write` 提交 4 个新增平铺顶层 → 返回 `(warning: 4 new top-level tasks without subtasks — …)`；原 id 更新无 warning；`plugin_manager set_plugin` 禁用→启用 `include:task-list` 完成 Host 重载（无需重启）。
- 未做（第二阶段）：`strict` 模式 / `allowFlat` 逃生参数 / `structurePolicy` 配置；观察若干轮真实使用后，若 warning 仍被忽略再升级。
- 版本：0.3.3 → **0.3.4**；交付包 `E:\_成果回传\DSH任务系统重建计划_2026-10-30_v0.3.4.zip`。
- 相关项目：`F:\DSH\projects\任务系统父子结构治理\HANDOFF-父子结构.md`（评估 + 实施记录）。

## 23. v0.3.5：废弃状态（第五态 + 底部常驻分区，2026-10-30）

- 用户决定（问答卡片，逐条选定）：
  1. 数据用**第五态** `status: 'abandoned'`，不用独立布尔标记；
  2. 保留 `parentId` 作归属信息，**只在渲染与 agent 读取时摘出**；废弃父任务时整棵子树一起让位，恢复亦然；
  3. 上一轮 9 条已完成任务保留不动，新任务加在后面；
  4. 环**整环变红**，沿用现有两段换色动画（不加常驻旋转、不加斜杠）；
  5. 「废弃」分区在面板**最底部常驻**，空时显示虚线空框。
- 实现：
  - `lib/task-store.js`：`STATUSES` 加 `abandoned`；新增内部常量 `ABANDONED` 与 `statusTransition()`；`createTask` / `patchTask` / `applyIncoming` 维护 `abandonedFrom`（废弃时记住原状态，恢复时写回）；`deriveStatus` 跳过废弃子任务；`setPaused` / `setBlocked` 跳过废弃任务。
  - `index.js`：`STATUS_LABEL` 加 `abandoned: 'abandoned'`；`formatTaskList` 把「自身或祖先废弃」的任务摘进独立 `Abandoned (N):` 段，头部改成 `Task list (done/normal done, K abandoned)`；`task_list` / `task_write` 描述补第五态与废弃语义（`status: "abandoned"` 的写入、恢复、子树让位）。
  - `client.js`：`STATUS_COLOR.abandoned` 用 `--dsw-alias-state-danger-primary`（兜底 `#d8473a`）；`buildList` 返回 `{ rows, abandoned }`，废弃子树从父任务摘出、只列两层（父 + 直系子）；列表底部常驻 `.dstl-abandoned` 分区，空态 `.dstl-abandoned-empty` 虚线框 +「暂无废弃任务」；行菜单加「废弃任务 / 恢复任务」，点废弃行的环即恢复；新增 `abandonTask` / `restoreTask` 乐观更新；`countTasks` / `countDone` / `deriveStatus` 过滤废弃；键盘 Enter 对废弃行执行恢复。
- 验证：
  - `node --check` index.js / client.js / lib/task-store.js 全过。
  - `node --test lib/task-store.test.js` → **47 passed / 0 failed**（43 + 4：`abandonedFrom` 记录与恢复、agent 写入同样记录、`deriveStatus` 跳过废弃子任务、全废弃时父保持自身状态）。
  - HTTP 冒烟：`op:create` 建 probe → `op:status` 改 abandoned（返回 `status=abandoned from=pending`）→ `task_list` 输出 `Task list (9/21 done, 1 abandoned)` + 独立 `Abandoned (1):` 段 → `op:delete` 清理（剩 21 条）；面板靠轮询文件戳自动刷新。
  - 用户确认：面板底部「废弃」分区已可见；probe 清理后应为虚线空框 +「暂无废弃任务」。
- 生效方式：Host 半 `plugin_manager set_plugin` 禁用→启用 `include:task-list`；Client 半刷新页面（本轮改完 `client.js` 后用户页面已显示新分区）。
- 未做 / 已知边界：
  - 废弃区不支持拖拽进出（拖拽只服务于父任务的状态节）；
  - 废弃行保留上移/下移按钮，点了只改 `order`、无视觉移动（未置灰）；
  - `task_write` 的 schema 不暴露 `abandonedFrom`，agent 恢复靠写回原状态；
  - 已废弃任务的子任务在分区内按真实状态显示环色（它们没被标记废弃，只是随父让位）。
- 版本：0.3.4 → **0.3.5**。


- 测试约定（用户设定，2026-10-30）：用户输入 `114` 时，在「测试父任务」下新建名为 `514` 的子任务。同时写进「测试子任务」的 `notes`；仅会话内触发，不自动执行、不加自动建任务逻辑。


## 24. 修正：废弃父任务不再接受新子任务（2026-10-30）

- 触发：用户把「测试子任务」标废弃后，我收到 `114` 仍在其父任务下建了 `514`——会话约定没有校验规则载体的状态；同时数据层也允许往废弃父任务下 `create`。
- 修复（用户选定「数据层硬校验」）：
  - `lib/task-store.js` 新增 `assertParentAcceptsSubtask()`；`insertTask()` 在插入前拦截 `parentId` 指向 `abandoned` 任务的提交；`mergeAgent()` 在合并后只对**本次新增**（`inserted`）的任务做同一拦截。
  - **只拦新增**：已有子任务（父任务之后被废弃的存量）照旧合法，`task_write` 继续能更新旧列表，配合渲染层「整棵子树让位」。
  - 错误文案：`parent <id> is abandoned: cannot add a subtask under it`，HTTP 400。
- 规则更新：`114` 的约定改写到「测试子任务」的 notes——**若该任务已废弃则不创建**，直接回复「规则已随任务废弃」；恢复该任务后规则自动恢复。
- 验证：
  - `node --test` → **49 passed / 0 failed**（+2：`insertTask` 拒绝废弃父；`mergeAgent` 拒绝新增、但允许更新存量子树）。
  - 重载 Host（`set_plugin` 禁用→启用 `include:task-list`）后，向已废弃的「测试子任务」POST `op:create` → `HTTP 400 {"ok":false,"error":"parent 690d8cf6… is abandoned: cannot add a subtask under it"}`。
- 说明：用户选择保留误建的两条 `514`，未做数据清理。


## 25. 完成态折叠 + 废弃区底部 dock（2026-10-30）

### 25.1 完成态父任务默认折叠（用户需求：刷新后全绿的阶段不要默认打开）

- `buildList()` 给每个 head 行加 `collapsed`：
  - `collapsedParents[id] === undefined` → **按派生状态决定**：`deriveStatus(task) === 'completed'` 时默认闭合，否则展开；
  - `true` / `false` → 用户的显式选择，优先于默认值。
- `collapsedParents` 因此是**三态 map**（缺省 = 跟随默认）；`toggleChildren` 按当前有效状态取反，不会和默认值打架；刷新后 map 清空，完成态重新闭合。
- `renderRow` 改传 `row.collapsed`；`deriveStatus` 跳过废弃子任务，所以「子任务全废弃、父任务自己没标废弃」的阶段不会被误判成完成态。

### 25.2 废弃区改为面板底部独立 dock（用户需求：固定最低部、置顶、和正常任务互不遮盖、可折叠）

- 位置：从 `dstl-list` 滚动区内部移到**滚动区之外**，`h('div', {className:'dstl-list'}, createRow, listBody)` 之后、footer 之前。
- 布局：`.dstl-abandoned-dock{flex:none;max-height:40%;overflow-y:auto;border-top:1px solid …}`——正常任务在它上方滚动，永远盖不到它；废弃任务多时 dock 内部滚动。
- 标题吸顶：`.dstl-abandoned-head{position:sticky;top:0;background:…;z-index:2}`，滚动时标题不跑。
- 父任务同款条目：标题行复用 `.dstl-row.dstl-row-head`，结构是 `三角(caret) + 红色环(TaskMarker abandoned) + 「废弃」标题 + 计数`；三角与标题都能点，折叠状态存 `abandonedCollapsed`（默认展开）。
- 空态仍常驻：`.dstl-abandoned-dock-empty` 透明背景 +「暂无废弃任务」，标题行照样显示。
- 移除旧的 `.dstl-abandoned` / `.dstl-abandoned-empty` / `.dstl-abandoned-count` 样式，新增 `.dstl-abandoned-dock` / `.dstl-abandoned-slot` / `.dstl-abandoned-name` / `.dstl-abandoned-body`。

### 25.3 验证

- `node --check client.js` 通过；`node --test lib/task-store.test.js` → 49 passed（本轮未改 store）。
- 待用户刷新确认：完成态阶段默认收起、点开保持、刷新再收起；废弃 dock 固定在底部、正常列表滚不过去、标题吸顶、三角可折叠、空态仍显示。

## 26. 展开/收起动画：子节从左划入、倒放滑出，挤压行 FLIP 上下滑（2026-10-30）

- 需求：父任务展开时，折叠页（四个状态节 + 卡片）像新任务一样从左划入；其他被挤压移动的条目上下滑动。折叠时反向播放同一动画再收起（用户补充：「他们倒放就行了」）。
- 实现（全部在 `client.js`）：
  - **展开**：`toggleChildren()` 先 `snapshotRects()`（FLIP 旧坐标），再把该父的直接子任务 id 塞进 `entering`、把父 id 塞进 `expandedSection`；渲染时卡片走 `props.entering`（已有 `.dstl-item-in`），状态节走 `StatusSection` 新增的 `entering` prop（同样加 `.dstl-item-in`）。420ms 后清空。
  - **收起**：不立刻改 `collapsedParents`——先把子任务 id 放进 `exitingIds`、父 id 放进 `exitingSection`，渲染加新类 `.dstl-item-out`（`translateX(0)→-16px` + 淡出，入场动画的倒放）；420ms 后才 `setCollapsedParents({[id]: true})` 真正卸载，此时 FLIP 把下面被释放的行向上滑。
  - **FLIP 覆盖所有行**：`rowRef` 从「只有 card」改为所有行（head / 顶层 row / card / 废弃行）都登记到 `cardRefs`，`useLayoutEffect` 依赖扩成 `[tasks, collapsedParents]`。这样展开/收起时被挤压的父任务行也会上下滑动，而不是跳变。
  - 连续点击：`collapseTimer` 记录 pending 折叠，再次点击先 `clearTimeout`，行为不叠加。
  - `prefers-reduced-motion` 已把 `.dstl-item-out` 一并关掉。
- 验证：`node --check client.js` 通过。待刷新确认：展开滑入、收起倒放后上滑、其他行跟随滑动、完成态默认折叠不受影响。
- 任务：`d740bf7f…「父任务展开/收起动画」`（2 子已完成、1 子验证中）。


- 修正（用户实测反馈：折叠动画停滞、四状态底色区块没被一起收走）：
  - **动画载体从行改成状态节框**：折叠/展开的过渡只在 `.dstl-section-box` 上播放（`expandedSection` → `dstl-item-in`，`exitingSection` → `dstl-item-out`）。框内的状态名与卡片随之整体滑入/倒放，所以带底色与边框的框不再留在原地。
  - 移除了 `StatusSection` 与卡片上的 `exiting` 类，避免「框动 + 行再动」的双重位移。
  - **去掉停顿**：之前的折叠是「340ms 倒放 + 420ms 后折叠」，中间空档；现在改为倒放 340ms、`360ms` 后折叠，并在折叠前**重新 `snapshotRects()`**，保证 FLIP 用动画刚结束时的真实位置，下方行续上滑动而不是先等一拍再跳。
  - `expandTimer` / `collapseTimer` 两个 ref 分开管理，连续点击互不干扰。



- 二次修正（用户反馈：环左侧三角指针有延迟、折叠时行滑动有延迟）：
  - **指针延迟**：折叠要等 360ms 才改 `collapsedParents`，而三角的朝向来自 `row.collapsed`。新增 `pendingFold` state：点击折叠时立即置为该父 id，`collapsedChildren = row.collapsed || pendingFold === id`，箭头当场翻转；折叠落地后清空。
  - **行滑动延迟**：折叠不再是「先播倒放、再收布局」，改为 **盒子自身高度过渡**——`collapseBoxes(id)` 量出每个 `.dstl-section-box` 的 `offsetHeight`，写死 `height`，强制 reflow 后过渡到 `height:0; opacity:0; translateX(-16px)`（240ms）。列表随高度收缩连续上移，行滑动与盒子收走同步；260ms 后 `setCollapsedParents` 卸载节点。
  - 盒子加 `data-section-owner="<父 id>"` 供 `collapseBoxes` 定位；`exitingSection` / `dstl-item-out` 不再参与折叠路径（类保留未用）。
  - 代价：折叠走内联样式过渡，`prefers-reduced-motion` 下不会自动关掉；后续要补时给 `.dstl-section-box` 加媒体查询 `transition:none` 即可。


- 三次修正（用户反馈：折叠仍有卡顿）：
  - 根因：`.dstl-section-box` 是 content-box，`height:0` 只收内容，**padding(4px) + border(1px×2) + margin(7px) ≈ 14px 仍占位**；240ms 过渡结束后节点还撑着 14px，260ms 卸载时这 14px 突然消失 → 看起来就是卡一下。
  - 修法：`transition` 常驻在 `.dstl-section-box`（height / padding / margin / border-width / opacity / transform，240ms）；折叠时把这四项一起过渡到 0，空间连续收走，卸载时已无高度残留。
  - `restoreBoxes` 对应清理 `padding` / `margin` / `borderWidth`，避免展开复用节点时留下折叠样式。


## 27. 折叠指针整合到状态环（2026-10-30）

- 需求：删掉父任务行首的三角 caret；把「工作区美化」`SessionMarker` 里的指针动画移植到任务状态环上；方向语义：**收起向上、展开向下、hover 向右**；圆环颜色逻辑不变。
- 实现（`client.js`）：
  - `TaskRow`：删除 caret 按钮（`.dstl-row-caret` 样式保留给废弃 dock 的标题行）；父任务（`hasChildren`）的环按钮由「只读」改为**折叠开关**（`onToggleChildren`），`aria-expanded` 跟随展开状态，title 变为「状态由子任务自动决定 · 折叠/展开」。
  - `TaskMarker`：新增 `arrow` / `open` props。可折叠父任务的 SVG 用 **viewBox `0 0 26 26` 渲染 32×32**（给箭头旋转留出方框），环中心 `(13,13)`、外环 r6.2 / 内环 r3.6 不变；箭头 `M 13 4.8 L 9.9 9.8 L 13 7.8 L 16.1 9.8 Z`（尖朝上的四角箭头，取自工作区美化 `arrowPath`），fill 跟随环色（`displayColor || accent`）。子任务仍是 viewBox `0 0 16 16` 渲染 20×20、无箭头。
  - **箭头是三层结构**（照搬工作区美化）：
    1. `.dstl-marker-arrow`：绕**环中心** `13px 13px` 旋转，`translateX(0) rotate(0)` → 展开 `rotate(180deg)`（向下 = 向上的镜像）→ hover `translateX(3px) rotate(90deg)`（向右）；
    2. `.dstl-marker-arrow-scale`：绕箭头中心 `13px 7.3px` 从 `scale(.7)` 放大到 `scale(1.9)`（展开或 hover 时）；
    3. `.dstl-marker-arrow-squash`：绕箭头尖 `13px 4.8px` 从 `scaleY(1)` 压到 `scaleY(.55)`；
    4. `.dstl-marker-arrow-mini`：箭头内部的小凹槽，`opacity 0 → 1`（展开或 hover 时）出现。全部 `transition: transform .4s cubic-bezier(.3,.9,.4,1)` / opacity `.3s`。
  - SVG 加 `overflow: visible`，允许放大后的箭头越出 viewBox；`.dstl-status-slot` / `.dstl-status` 宽度改为 `auto`，让 32px 的父任务环比子任务行宽 12px。
  - `prefers-reduced-motion` 里补 `.dstl-marker-arrow{transition:none}`。
- 验证：`node --check client.js` 通过、`node --test` 49/49；视觉待刷新确认（父任务环上方箭头、收起向上/展开向下/hover 向右、放大压扁与小箭头、子任务无箭头）。
- 任务：`e2bbdfb2…「折叠指针整合到状态环」`（2 子完成、1 子验证中）。


## 28. 父任务环动画与工作区美化对齐（2026-10-30）

- 需求（工作区美化待办 p12）：把美化这一轮定稿的环动画移植到父任务环（`TaskMarker` arrow 版）。此前向下箭头是「小箭头 pop」错版、hover 向右多外推 3px、标题让位 6px 不够。
- 改动（全在 `client.js`）：
  - `TaskMarker` v2（2026-10-30 二次反馈后全面对齐美化）：arrow 版环几何改为美化同款形状——`r8.75 / r5`、stroke `2.5 / 1.25`、`outerSpan 84`、断点圆 `r0.7 / stroke0.45`、环心 `(20,15)`；svg 高 34、viewBox `0 -2 40 34`。父环视觉直径 17.5px（用户指定），子任务环保持 `r6.2/3.6`（15.5px），父 : 子 ≈ 1.13 : 1。
  - 箭头路径换成美化同款：主箭头 `M 20 0 L 16.5 6 L 20 2 L 23.5 6 Z`、mini `M 20 -3.4 L 18.4 -1.2 L 20 -1.7 L 21.6 -1.2 Z`（尖端上方）。
  - CSS origin 同步：arrow `20px 15px`、scale `20px 3px`、squash `20px 0px`。
  - 向下：保持 `.dstl-marker-open .dstl-marker-arrow{transform:rotate(180deg)}`（绕环心 20,15，停在环下方），删掉 `.dstl-arrow-pop` 的 open / folding 动画与 keyframes——与向上同大小、同曲线，只有朝向不同。
  - 向右：`.dstl-row:hover .dstl-status .dstl-marker-arrow` 的 `translateX(3px)` → `translateX(0)`；放大 1.9 / 压扁 .55 / mini 不变。
  - 标题：`.dstl-row-head .dstl-title{margin-left:-16px}`（-10 → -16）、hover `translateX(20px)`（6 → 20）；废弃区标题同步。
- 验证：`node --check` 通过；`F:\DSH\temp\dstl-arrow-check.mjs` 15 项全过；`node --test lib/task-store.test.js` 49/49。
- 生效：link 安装，刷新页面即可（Host 未改，无需重载插件）。


## 29. 修复：拖拽子任务进「完成」节后卡片消失（2026-10-31，v0.3.11）

- **现象**：子任务卡片拖进父任务的「完成」节后从面板消失，同父下其他子任务正常。
- **根因**：拖拽预览已把卡片渲染进完成节；drop 时 `commitPreview` 走 `retireThen` 播放退出折叠（`.dstl-item` 的高度/透明度动画，`fill: 'forwards'`）。状态写入落地后卡片仍在同一完成节、React 复用同一个 DOM 节点（点环路径会换节重挂载，所以只在这个路径发作），折叠动画的 fill-forwards 效果继续生效 → 卡片保持 `height:0` / `opacity:0`。另外 `retireThen` 把恢复回调传给了 `runOp` 的**第三参数**（实为 `onError`），成功路径永远不恢复。
- **修法**（全在 `client.js`）：
  1. `commitPreview` 的 `completed` / `abandoned` 分支先算 `rootStays`（根父任务是否仍留在列表）；仍在则直接 `runOp` 写状态 + 清预览，不播退出折叠——卡片就停在预览所在的落点。
  2. `runOp` 新增第 4 个参数 `onDone`（Host 整表采纳后调用）；`retireThen` 的恢复回调改为幂等 `restoreAll`，成功 / 失败都执行，防止任何复用节点被 fill-forwards 锁死。
- **验证**：`node --check client.js` 通过；`node --test lib/task-store.test.js` → **51 passed / 0 failed**（本轮未改数据层）；用户刷新页面后实测拖拽进完成节正常、**验收通过**。
- **生效**：link 安装，源文件即运行文件，刷新页面即可（未改 Host 半）。
- 版本：0.3.10 → **0.3.11**。


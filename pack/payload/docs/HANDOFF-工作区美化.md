# HANDOFF：DSH 工作区前端重建（简称：工作区美化）

> 项目组：DSH Web 插件（Client-only bundle）
> 创建：2026-10-28
> 插件目录（开发版 = 安装版，profile 以 Junction 方式引用）：`C:\Users\12870\.dsh\plugins\dsh-workspace-frontend`
> 包名：`@local/dsh-workspace-frontend`；Loader 行 id：`workspace-frontend`

## 1. 目标

在同一个工作区内，把会话按用户自定义的「分组」组织起来，让一个工作区里的多个互不相关的项目各归其位。

- 作用域：**每个工作区各自一套分组**（用户确认）。
- 入口：**左侧栏图标入口**（`sidebar.panellist`），点开主面板「会话分组」（阶段 A）。
- 阶段 B（**已实施**）：以 priority `-1` 替换原生 `sidebar.workspaces`，自绘「工作区 → 分组 → 会话」列表。

## 2. 当前实现（v0.1.0）

插件是 Client-only bundle：Host 半 `index.js` 只有空 `apply`，所有 UI 在 `client.js`。

注册的 slot（以 `client.js` 末尾 `apply` 为准）：

| slot | id/key | 作用 |
|---|---|---|
| `sidebar.workspaces` | priority `-1` | 自绘浏览器，替换宿主原生列表（工作区 → 分组 → 会话） |
| `sidebar.panellist` | `session-groups`（order 20） | 左侧栏「工作区美化」入口图标 |
| `main` | key `session-groups` | 分组面板（工作区下拉 + 分组卡片 + 会话归类） |
| `sidebar.workspaces.session.menu.item` | `session-groups.move`（order 500） | 「移入分组…」条目（行菜单已自绘，此项保留注册） |
| `sidebar.session.row.hover` | `session-groups.hover`（order 20） | 会话悬停卡片 |
| `shell.overlay` | `session-groups.move-dialog` | 移入分组对话框 |
| `shell.overlay` | `session-groups.rename-dialog` | 重命名对话框 |

- 注入服务：`slots` / `locale` / `uiWorkspace` / `layout` / `workspaces` / `sessions` / `remote` / `remote.schedule`。
- 行首装饰（上下文环、时钟）由 `BrowserSessionRow` 自绘，**不再走** `sidebar.session.row.leading`。

## 3. 数据模型

插件自有数据，**不写 Session 日志**，存在浏览器 `localStorage`：

```
key: 'dsh.session-groups.v1'
{
  version: 1,
  byWorkspace: {
    [workspaceId]: {
      sections: [{ id, name, color }],      // 顺序即显示顺序
      assignments: { [sessionId]: sectionId }
    }
  }
}
```

- 分区色取自 8 色调色板 `PALETTE`（Claude 风暖色系）。
- 工作区 / 会话身份来自 `useWorkspaces`、`useSessions` 标准 hook 的快照。
- 打开会话用 `ctx.uiWorkspace.openSession(sessionId)`。

## 4. 文件地图

```
package.json        bundle 清单（dsh.bundle.patch + dsh.client，exports ./client ./locale ./icon）
cordis.patch.yml    insert 行 id=session-groups
index.js            Host 空 apply
client.js           全部 UI / 状态 / 样式（window.__ModuleLoader__.load 格式）
locale/zh.json      meta.title=会话分组
locale/en.json      meta.title=Session Groups
icon.svg            自绘橙底分组图标
```

## 5. 安装与验证

1. 语法/清单检查（node 路径见下）：
   - `node --check client.js`
   - `node -e "JSON.parse(fs.readFileSync('package.json','utf8'))"`（JSON 必须用 node 直接读文件校验；不要用 PowerShell 管道传中文，会按 GBK 解码坏掉）
2. 安装：`plugin_manager` → `install_bundle`，target = 插件目录绝对路径。
3. 安装结果看返回的 `application`（本次为 `applied`）。
4. 验证注册：`cordis_inspect_query` client `Slots.listSubTree` 查 `sidebar.panellist`、`main`、`sidebar.workspaces.session.menu.item`、`sidebar.session.row.leading`、`shell.overlay`，确认 occupant `active: true`。
5. 页面效果：需人工点侧栏「会话分组」图标 / 会话行「…」菜单确认。

node：`C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`

## 6. 踩坑索引

- **pnpm 虚拟存储错位**：profile 从 restore-staging 恢复后，`node_modules/.modules.yaml` 的 `virtualStoreDir` 指向已不存在的 `profiles/restore-staging-*`，install_bundle 报 `ERR_PNPM_UNEXPECTED_VIRTUAL_STORE`。修复：把该字段改回 `profiles/desktop/node_modules/.pnpm`（备份在 `F:\DSH\temp\modules.yaml.backup`）。改完 install_bundle 成功。
- **pwsh 首次调用返回 0xC0000142**：稍后重试即可，不是命令问题。
- **asar 解析**：header 在 offset 12 是 JSON 长度，JSON 从 offset 16 开始（脚本 `F:\DSH\temp\asar-list.mjs` / `asar-extract.mjs`）。
- **PowerShell 管道传中文给 node**：PS 按默认编码读取 UTF-8 无 BOM 文件导致乱码/JSON 解析失败。校验 JSON 一律用 node 读文件。
- **文本替换引号**：批量替换英文文案时，把 `... workspace's ...` 塞进单引号字符串会破坏语法；英文含撇号用双引号字符串。
- **变量遮蔽致插件崩溃（重要）**：`SessionMarker` 内写 `const cx = 8`（圆点坐标），遮蔽了模块级 `cx()`（className 拼接函数），`cx('dssx-marker', …)` 变成数字调用 → `TypeError` → 整个 `SessionBrowser` 崩、宿主接管侧栏。取证同 createPortal 那次：`Slots.listSubTree` 看 `sidebar.workspaces` 的 `priority -1` 是否 `active: false`。规则：组件内局部坐标变量用 `dotCx/dotCy`，**不要用 `cx` / `cy` / `h`**。
- **皮肤费用接口单位**：`value.cny` 以「元 × 1e6」结算（本例 942400 → 0.9424 元），显示前必须 `/1e6`，否则出现 `¥7557405.36` 这类离谱值。
- **回滚后先查记录**：用户否掉的方向（双层箭头、外包边圆点、半圆平移断缝、scaleY/scaleX 压扁）都已记录在 §10.3，改回前先查，别再试一遍。

## 7. 渲染依据（已确认）

- `sidebar.panellist` 组件 props：`{ size, active }` + 标准 hook（`useWorkspaces`、`useSessions`…）+ 注册 `locale: NS` 后的 `t`。
- 会话菜单项 props：`{ sessionId, displayTitle }` + `useMenuOpenState`（`hookContext`）+ `t`。
- 行首 seat props：`{ sessionId }`；仅在行主状态 idle 时渲染，归档行留空。
- 面板组件可从 `useSessions` 快照的 `retainedBy.mainView` 找当前会话，从 `useWorkspaces().items[].sessionIds` 找所属工作区。
- 主题只用 `--dsw-alias-*` token（Claude 皮肤会覆盖这些 token）；所有 token 都带 fallback 颜色。

## 8. 验证记录

- 2026-10-28 安装：`install_bundle` 返回 `application: applied`；profile `package.json` 依赖 `"@local/dsh-workspace-frontend": "link:F:/DSH/projects/dsh-workspace-frontend"`，bundle 列表末位已加入。
- 注册检查：`sidebar.panellist`（id session-groups, order 20）、`main`（key session-groups）、`sidebar.workspaces.session.menu.item`（id session-groups.move, order 500）、`sidebar.session.row.leading`（id session-groups.mark, order 20）、`shell.overlay`（id session-groups.move-dialog）全部 `active: true`。
- 截图确认（2026-10-28）：
  - 侧栏出现「会话分组」入口，主面板正常渲染「未分组 5 个会话」卡片与会话行。
  - 会话「…」菜单末尾出现「移入分组…」。
- v0.1.1 样式修订（截图反馈后）：
  - 内容区宽度改为 `max-width: 900px` 居中（head/toolbar/list/foot）。
  - 菜单项改 13px、加分组图标、加分隔线，贴近宿主菜单项。
  - `client.js` SHA256 `C741335CD92DB8958953B5DE1C9A9C3693B7365A8E8D1EE6CE8A8F8A4D2B1B5A`。
- 待人工实测：新建分组 → 会话移入分组 → 刷新页面确认 localStorage 持久化。
- 2026-10-28 阶段 B（用户选择 A）：
  - 新增 `SessionGroupsBrowser`，以 `priority: 10` 替换 `sidebar.workspaces`（shadows-shipped-ui）。
  - 结构：工作区段 → 分组 → 会话；未分组殿后；当前会话高亮；行内分组色点（不再占用 leading seat）。
  - 复用 `renderSlot` 渲染 `sidebar.workspaces.session.menu.item`、`sidebar.workspaces.session.row.action`、`sidebar.session.row.leading`，保留宿主注册的重命名/归档/置顶/分叉/复制 ID 与定时任务标记。
  - 工具条：本地标题搜索（不请求 Host）、显示/隐藏归档、添加工作区（`pickDirectory` + `workspaces.create`）。
  - 注入服务：`slots, locale, uiWorkspace, layout, workspaces`。
  - 简化点（与宿主差异）：无拖拽排序、无悬浮卡、无工作区树/搜索内容匹配、无归档确认外的细节；空白会话只显示当前那一个。
  - 风险：菜单项与行按钮来自宿主注册项的 children 声明（宿主注册项被遮蔽但仍在）；若菜单不出现，需在我们的注册项上自声明 children（`menuOpenStateFactory = (_standard, state) => () => state`）。
  - `client.js` SHA256 `0A0F08EFC4D87EC39DBB24A093AA42751304ED2BDB1F39B5BCF2840AAA5DEA20`。
- 2026-10-28 阶段 B 修正（实机反馈）：
  - **接管规则**：shadowing slot 的 winner 是「按 priority 升序的第一个未让位项」（renderer 源码 `entriesOfSlot` 文档）。宿主是 `priority: 0`，插件必须用负值（现为 `-1`）才能排到宿主前面；`10` 会让宿主一直赢。
  - 字号与图标对齐宿主：会话标题 14px/20px，时间 10px（`label-tertiary`），工具按钮 28×28，caret/归档/加号/更多/铅笔/叉全部改为内联 SVG（16px 级），不再用字符图标。
  - 默认工作区本地化：存储标题为 `default-workspace` 时显示 `t('workspace.defaultName')`（面板下拉与侧栏一致）。
  - `client.js` SHA256 `ADDD8513006134D94C38D06439D75527983DBA926FEBA71B97F924FAF9577D9A`。
- 2026-10-28 菜单崩溃修复与头部还原（实机反馈）：
  - 现象：在阶段 B 侧栏点击会话行「⋯」，整个 `sidebar.workspaces` 崩溃并让位回宿主浏览器。
  - 处置：会话菜单改为**自绘**（打开会话 / 移入分组… / 归档或取消归档 / 复制 Session ID），不再在组件内 `renderSlot('sidebar.workspaces.session.menu.item', …)`。行首 leading 与行尾 row.action 仍走 renderSlot（实测正常）。
  - 推测根因：宿主菜单条目组件依赖声明方的 `menuOpenState` hook 源；插件在自己组件内直接渲染该 slot 时该源不可用，菜单条目抛错冒泡到浏览器组件（组件内 renderSlot 没有条目级错误边界）。
  - 头部还原为原生格式：一行「工作区」标题 + 归档过滤、添加工作区两个 28px 图标按钮；移除自绘搜索框（本地搜索暂不提供，`browser.searchPlaceholder` 字典键保留未用）。
  - `client.js` SHA256 `4B8D5E6FF81FC87676D0D811BE379A6C9D7720303B3BDFE0560CA113F32A330C`。
- 2026-10-28 重命名补全与皮肤 token 对齐：
  - 会话菜单新增「重命名」，弹窗 `RenameSessionDialog`（`shell.overlay`，id `session-groups.rename-dialog`），调用链路与宿主相同：`ctx.sessions.using(sessionId, { source: 'workspaceOperation' }, ref => ref.binding.session.rename(title))`，失败显示错误。注入服务新增 `sessions`。
  - 皮肤（dsh-claude-style）兼容：自绘 UI 的 19 处 hover/选中背景从写死的 `bg-layer-2` 改为宿主同款 `--dsw-alias-interactive-bg-hover`，皮肤调色板恢复生效。
  - 已知边界：皮肤按宿主原生 DOM 类名/结构写的 CSS 无法命中自绘浏览区；token 级（配色/字体/圆角）可继承。
  - `client.js` SHA256 `43EEFDFC3EA786277828E6A6E33A8C0D35AA705DBBC97E47ABB6F5747B30FAB9`。
- 2026-10-28 新增「删除工作区」（用户确认：侧栏工作区标题行 hover 按钮 + 行内二次确认 + 同步清分组数据）：
  - `SessionGroupsBrowser` 工作区标题行末尾新增删除按钮（`dssx-ws-delete`），hover/focus 才显示；第一次点击进入待确认（按钮变红显示「确认删除」），4 秒无操作自动恢复，第二次点击才执行。
  - 删除链路：注册项 `inject.deleteWorkspace` → `ctx.workspaces.delete(workspaceId)`（宿主只删工作区注册，**不删会话、不删磁盘文件**）；成功后调 `clearWorkspaceData(wsId)` 移除 localStorage `byWorkspace[wsId]`，失败静默（宿主通知通道报错），分组数据保留。
  - 新增字典键 `browser.deleteWorkspace` / `browser.deleteWorkspaceConfirm`（zh/en）。
  - 已知边界：删除最后一个工作区时宿主是否拒绝未实测；被删工作区的会话在侧栏不再出现（会话仍可凭 Session ID 找回）。
  - `client.js` SHA256 `E6275D33962B38882308297A0E71CA6321A65F15E89C1B3F160D2841D7555BAD`。
- 2026-10-28 P0 侧栏美化（用户确认「先做 P0 全部」，美化直接改本插件，不另起皮肤插件）：
  - 工作区标题改 `label-primary` 色（保留 13px/600），与分组名（secondary）拉开层级。
  - 缩进链收紧：`.dssx-browser-groups` 12→8px，`.dssx-browser-row` 24→20px（行首 seat 16px 不变）。
  - 当前会话行：`bg-layer-2` 底 + 2px `brand-primary` 左竖条（`inset box-shadow`）；hover 仍为 `interactive-bg-hover`，竖条保留。
  - 浏览区细滚动条：8px、`border-l2` thumb、透明 track（`scrollbar-width/color` + `::-webkit-scrollbar`）。
  - 分组色点 7→8px；分组间距 1→2px；未分组区加虚线细分隔（仅当存在真实分组时）。
  - 工作区计数改 pill（10px、bg-layer-2、圆角 999），分组计数保持纯文字。
  - `client.js` SHA256 `DF3933C5B0A138A53D6794C7CFC5FFE62AF60D11591D9B919CD80389ACDF821E`。
- 2026-10-28 侧栏字号整体放大 25%（用户要求）：
  - 仅左侧栏自绘区字号 ×1.25：工具条标题 12→15；工作区标题 13/18→16.25/22.5；分组名 13/18→16.25/22.5；会话标题 14/20→17.5/25；时间 10/16→12.5/20；计数 11→13.75、工作区计数 10/14→12.5/17.5；空态与 footer 12→15；面板入口与删除确认 11→13.75。
  - 行高按比例同步放大，图标尺寸（caret/按钮/SVG）未动，故文字相对图标略大；若观感失衡再调图标。
  - 面板 `SessionGroupsPanel` 不属于左侧栏，未改；rail 模式只有图标，无字号。
  - `client.js` SHA256 `A2BA3B825AB9993CDFFAAB9A124E95D4B992A183F90FCA893308804DDA1BA052`。
- 2026-10-28 字号回调为「两者平均向下取整」（用户反馈 25% 偏大）：
  - 按 `floor((原值 + 25%放大值) / 2)`：工具条标题 15→13；工作区标题 16.25/22.5→14/20；分组名 16.25/22.5→14/20；会话标题 17.5/25→15/22；时间 12.5/20→11/18；分组计数 13.75→12；工作区计数 12.5/17.5→11/15（pill min-width 20px、padding 0 6px）；空态与 footer 15→13；面板入口 13.75→12；删除确认 13.75→12。全部整数、无小数。
  - 图标尺寸仍未改（caret/按钮/SVG），文字较原版仍大约 8–12%。
  - `client.js` SHA256 `1E31E344102CB92E9211AC4DC9AB31EE547CA3A343F2A2124317B2D8A621F6AF`。
- 2026-10-28 「工作区」与「未分组」统一为区块标题规则（用户要求同字号、加粗、放大后取整）：
  - `dssx-browser-tools-title`（顶部「工作区」）与 `dssx-unassigned-name`（未分组组头）统一 `15px / 600 / line-height 21px`，此后两者必须同步改，不要再单独调其中一个。
  - 过程：先按未分组原 14×1.25=17.5→17px 做过一版，用户截图反馈偏大，最终定 15px（加粗保留）。
  - `client.js` SHA256 `608434BEAFB78F969E0C024BC9345A7B07DFB4C7C17CC320DA25F6AFCA2A9405`。
  - 最终分档（用户指定，覆盖上面的「统一」）：`dssx-browser-tools-title` = 16px/600/22px；`dssx-unassigned-name` = 12px/600/17px。两者不再要求同值。
  - `client.js` SHA256 `90F14F93720E36E39AB36421465BF7A3442D16D9AEBB81DB7C237FD4BE7BEC6B`。
- 2026-10-28 P1+P2+P3 全部执行（用户要求全部试；暗色模式放弃，用户只用一种配色）：
  - P1：工具条与工作区按钮常态 `opacity .8`、hover/active 为 1；工作区段 `margin-top` 6→10；footer 面板入口图标 13→14。
  - P2 图标统一 16 网格、stroke 1.3：IconChevron（viewBox 12→16，默认显示 13px）、IconPlus、IconEdit、IconClose、IconTrash 全部改 16 网格；IconMore 三点 r 1.2→1.4（cx 4/8/12）。IconArchive 原本即 16/1.3，未动。
  - P3-13：`.dssx-browser` 背景改用 `--dsw-specific-sidebar-fill`（fallback transparent）。
  - P3-14 取消：用户明确只用一种配色、不需要暗色；CSS 不加 `data-ds-dark-theme` 分支（试写过又移除，不要恢复）。
  - 删除确认态：pending 时不显示「确认删除」文字（会超出按钮边界）。删除按钮常态即红色垃圾桶（`color: state-error-primary`，fallback `#d93025`）；`dssx-danger` 时再加 10% 红底作确认态，4 秒超时恢复；title 仍是「确认删除」。
  - 同时修复 `installStyles`：HMR 重载时若旧 `<style>` 已存在则直接替换其 `textContent`，避免改了 CSS 但页面沿用旧样式（本次「图标没变红」的排查点之一）。
  - `client.js` SHA256 `D62BD4F6CF9338FD772F4A6F657E816362D1F718338169375A6D63DE19F3C45A`。
- 2026-10-28 删除工作区后的会话去向（用户反馈：删工作区后会话从侧栏消失）：
  - 宿主 API 没有「把会话移到另一个工作区」的方法：Host `workspaceRegistry` / `workspaceController` 只有 create/rename/delete/insertBefore/insertSessionBefore/归档/置顶；`insertSessionBefore` 只做工作区内部排序，不能跨工作区改归属。所以「自动回到默认工作区」不可行。
  - 采用「无工作区」兜底区：`SessionGroupsBrowser` 计算所有不在任何 `workspace.sessionIds` 里的会话（排除空白会话、遵循归档过滤），在侧栏工作区列表末尾渲染「无工作区」段（可折叠，复用 `BrowserSessionRow`，行首无分组色点，菜单不提供「移入分组…」）。
  - 已知风险：若 `useSessions().byId` 中含有 subagent 子会话，会一并出现在「无工作区」区；届时需按 summary 的父会话字段过滤（字段名待确认）。
  - 字典新增 `orphan.label`（无工作区 / No workspace）。
  - `client.js` SHA256 `A93B86724246AA18733CE03AACA8D4C329DCD81564A882563976BEBD2F9372FE`。
- 2026-10-28 拖拽移动会话（用户要求：按住拖动会话块到其他工作区/分组；「复制到新工作区再删旧的」宿主 API 不支持，改为显示层移动）：
  - 数据：state 增加 `moves: { [sessionId]: { workspaceId, sectionId } }`（与分组同存 `dsh.session-groups.v1`），`normalizeState` 兼容旧数据；新增 `setSessionMove` / `clearSessionMove`。
  - 渲染：工作区的行来源 = 自身 `sessionIds`（排除 moves 指向其他工作区的）+ moves 指向本工作区的会话；分组归属优先取 `move.sectionId`；「无工作区」区排除 moves 指向现存工作区的会话。
  - 交互：会话行 `draggable`；工作区头 / 分组头 / 未分组头是 drop 目标，悬停时虚线高亮（`dssx-drop-target`）；同工作区 drop 走 `assignments`，跨工作区 drop 写 `moves`。
  - 边界：宿主归属不变（无跨工作区移动、无删除会话 API）；移回宿主原工作区时清除 move；工作区被删后其 moves 记录自动失效，会话回到「无工作区」。
  - `client.js` SHA256 `A5F56C1423F8691A1BF72804C6138B08E29C62DA16F11985EDA04FC4F8E4D0B7`。
- 2026-10-28 拖拽判定区域调整（用户要求）：
  - 高亮边框改**实线**（2px solid brand），保留 0.12s 过渡。
  - 判定区域从「分组标题行」扩大到**整个分组容器**（标题 + 全部会话行 + 空行），未分组区同样整体接收；拖入任意分组即视为进入该工作区。
  - 删除工作区标题行的 drop 目标（工作区头不再接收拖拽）。
  - `client.js` SHA256 `B64043687079AD2FFB7BBE376B790B24807FF4CFC400B4D87942F7DB88BD7C1D`。
- 2026-10-28 拖拽高亮闪烁修复：
  - 根因：`dragleave` 在分组内部子元素（会话行、按钮）之间移动时同样会冒泡触发，导致 `dropTarget` 反复 null → 重建，高亮 class 每过一个会话闪一次。
  - 修复：`dragover` 先 `cancelLeave()` 再设目标（幂等 setState）；`dragleave` 若 `relatedTarget` 仍在容器内则忽略，否则 80ms 后才清除（期间重新进入取消）；`drop` 时清 timer。`leaveTimerRef` 用 `useRef`。
  - `client.js` SHA256 `F7913B5C223714937B180D854A197B3CC5225AA3A3492C426826D98CBD8DD191`。
- 2026-10-28 侧栏新增分组操作（用户要求）：
  - 工作区标题行、删除按钮左侧新增「添加分组」（IconFolderPlus，16 网格 / 1.3）：点击为该工作区创建分组并直接进入内联改名；工作区折叠时会先展开。
  - 分组标题行 hover 显示「修改颜色」「修改组名」：改色弹出 8 色色板（`PALETTE`、当前色描边高亮），改名为内联输入（`InlineInput`，Enter 保存 / Esc 取消）。
  - store 新增 `setSectionColor`；字典新增 `browser.addGroup`、`section.color`。
  - `client.js` SHA256 `42B7ED22F3D9743DDF289342F9C5E671F64774A30BD93281B7681EC102120F31`。
- 2026-10-28 布局列宽拖拽可见化（用户要求左右侧栏可调宽，尤其右侧看 md）：
  - 调研：宿主 `dsh-client-ui-layout` 的 AppFrame 自带 `DragHandle`（pointer capture + rAF），左栏 264–420px、右栏 300px–0.7×视口；但把手是完全透明的 8px 区域（只有 `cursor:col-resize`），所以看起来「不能调」。
  - 处理（加在本插件 CSS，全局生效）：把手热区 8→14px 并居中（`margin-left:-7px`），hover/拖拽时显示 4px 品牌色条。
  - 边界：`ctx.layout` 没有 setSidebar，插件无法编程设置宽度，只能靠宿主把手拖动；上下限写死在宿主 JS。样式选择器用 `[data-side="sidebar|rightbar"][class*="_handle"]`（类名哈希会变，`_handle` 后缀稳定）。
  - `client.js` SHA256 `A6AA712DE761A597A28FDEC1DF9B1DFD2DD108F63905D25C078E7DF3800348C0`。
- 2026-10-28 把手视觉改版（用户反馈「够丑」）：
  - 热区 14→16px（margin-left -8px）；去掉整条 4px 色条。
  - 改为纵轴中心 12×34 圆角长方形，左栏向右凸起、右栏向左凸起；内嵌双层折线箭头（两个 chevron，无横线，深橙 `#7a3d26`）。
  - 长方形品牌色、hover / data-dragging 时整体 `opacity: .3`；默认透明。
  - `client.js` SHA256 `79BB1D0F1CA50763262C7732E489B4C98BA78247C2D1E367E54DE72EF7123E59`。
- 2026-10-28 把手二次调整（用户要求）：
  - 恢复通体竖条：宽 4→6px（`linear-gradient` 5..11px），`rgba(217,119,87,.3)` 即 30% 不透明度。
  - 长方形 12×34 → 15×43（+25%），圆角 7px；箭头 12→15px、stroke 1.6→2、改白色。
  - 长方形改回实色（`opacity:1`），否则 30% 底上的白箭头不可见；如要长方形也半透明需另调。
  - `client.js` SHA256 `D612468AFF2CDC941AFC29FC073E23871CB4F398A4BA5C311503F27A3846CB00`。
- 2026-10-28 把手配色改用皮肤自定义色（用户指定）：
  - 长方形背景 = 皮肤强调色 `--dsh-claude-custom-accent`（回退 `#d97757`）。
  - 竖线 = 皮肤深色背景色 `--dsh-claude-custom-canvas-dark`（回退 `#161616`），保持 30% 不透明度（`color-mix`）。
  - 两个变量都由 dsh-claude-style 的自定义调色板注入，未启用时走回退色。
  - `client.js` SHA256 `86DA56D368213B989098C15FF2DB666693C06AB298089A229E3A467BBB2C0F50`。
- 2026-10-28 标题栏竖线错位修复（截图红框：侧栏顶部竖线断开）：
  - 根因：皮肤用 `[data-side=sidebar]::before{left:3px}` 画窗口标题栏区域的竖线，3px 是按原 8px 宽把手（`margin-left:-4px`）算的偏移；我们把把手改成 16px / -8px 后，边界移到 handle 左缘 +8px，标题栏竖线与内容区 `border-right` 相差约 5px，看起来断开。
  - 修复：`html[data-windows-titlebar] [data-side="sidebar"][class*="_handle"]::before{left:8px!important}`，把标题栏段竖线对齐到真实边界；实测仍差 1px，最终取 `left:7px`。
  - `client.js` SHA256 `CB4DF9B6506892EF9D02DAAC9FBD402B9B0AEBFD928C0BD1CF7479F2DDC35293`。
- 2026-10-28 侧栏会话行新增上下文用量环（用户要求，参考皮肤 composer 的 ContextMeter）：
  - 数据源：`contextPressure` projection（宿主 `dsh-client-ui-conversation` 的 ContextMeter 同源），读 `sessionState.projectionsBySession[id].values.contextPressure`，百分比 = `round((projectedTokens ?? pressureTokens) / contextWindow * 100)`，钳在 0–100。
  - 环几何复用宿主：14px viewBox、r=5.5、stroke 2、`rotate(-90)`；轨道 `border-l2`，进度用皮肤强调色 `--dsh-claude-custom-accent`（回退 `#d97757`）。
  - 渲染在会话行 `.dssx-browser-seat` 位置，14px；tooltip「上下文已用 N%」；无数据时回退原 `sidebar.session.row.leading`。
  - 首次挂载对每个会话调用一次 `ctx.sessions.refreshProjections`（`requestedProjections` ref 防重）触发投影加载；inject 新增 `refreshProjections`。
  - 风险：若宿主不为非当前会话返回 `contextPressure`，环会保持空白；届时可改为只显示当前会话或改读 DOM。
  - `client.js` SHA256 `F4802CA2E96FA4915CD40D404E62EDC427785B7C2865C9A32EC74DC0F28277E9`。
- 2026-10-28 上下文环改动态色阶（用户要求）：0% 纯绿 → 100% 纯红，每 10% 一档（11 档，`contextRingColor`：`r=255*step/10`、`g=255*(1-step/10)`、`b=0`）；不再使用皮肤强调色。
  - `client.js` SHA256 `379FD075AD4619DA59C7A6C34F01C77ADFF2A25099E549666FCBBB25537B4260`。
- 2026-10-28 环色阶降饱和 45%：改用 HSL，hue 120→0（每档 12°）、`saturation 55%`、`lightness 50%`。
  - `client.js` SHA256 `0F97228F5E5B989EACA228C1B0DDD650F8A17F51133128E6E68836853BB6845C`。
- 2026-10-28 分组标题行新增删除按钮（用户要求：与工作区删除按钮同款交互）：
  - 位置：侧栏分组标题行 actions（改色、改名）右侧追加红色垃圾桶（`IconTrash` 14px）。
  - 交互复制工作区删除：hover 分组标题时随 actions 出现；第一次点击进入确认态（`dssx-danger` 红底 10%、title/aria 变「确认删除」、actions 加 `dssx-visible` 保持可见），4 秒无操作自动恢复；第二次点击才真正删除。
  - `removeSection` 扩展：除删除 section 与清 `assignments` 外，还遍历 `moves`，把 `workspaceId` 相同且 `sectionId` 指向该分组的记录 `sectionId` 置空，会话回落到「未分组」，避免拖拽记录指向死 id；面板 `SessionGroupsPanel` 里的删除分组调用同一函数，同步受益。
  - 字典新增 `browser.deleteGroup` / `browser.deleteGroupConfirm`（zh/en）。
  - 删除时若该组正处于内联改名态，一并 `setEditingGroup(null)`；未分组区没有删除按钮（它不是真实分组）。
  - 实机确认（2026-10-28，用户反馈「功能已经实现」）：刷新页面后无需额外安装步骤，link 安装的 bundle 直接读源文件。
  - `client.js` SHA256 `8FE72A4262E8AE0A7D19DA8A774C746D71A17F1F9996744033ACBD76354C6DB8`。
- 2026-10-28 会话与分组新增 ↑↓ 排序（用户要求；已确认两点：会话只在所属分组内移动、手动排过之后该组不再按时间自动重排）：
  - 数据：state 新增 `orders: { [workspaceId]: { [sectionId | '']: [sessionId...] } }`（`''` = 未分组区），与 `byWorkspace` / `moves` 同存 `dsh.session-groups.v1`；`normalizeState` 兼容旧数据（非字符串/重复 id 过滤，空数组不落盘）。
  - 分组：侧栏分组标题 actions 最左新增 ↑↓（`IconArrowUp` / `IconArrowDown`，14px，首个禁用上移、末个禁用下移），复用已有 `moveSection`（主面板同一函数）。
  - 会话：行尾 `dssx-browser-actions` 最左新增 ↑↓（13px 图标、26px 热区，首行禁用上移、末行禁用下移）；`moveSessionInGroup` 取当前显示顺序交换相邻两项后整体写回 `orders`——即「动过一次的组固化为手动顺序」。
  - 排序规则：存在 `orders` 的组按数组顺序；不在数组中的会话（新建、外部注入）排在最前，其余按 `updatedAt` 兜底。**该组的 pinned 不再参与排序**（手动顺序优先）；没动过的组完全保持原行为（pinned + 时间）。
  - 归属维护：`assignSession` / `setSessionMove` 在目标组已有手动数组时把会话 unshift 到顶部、并从其它组数组移除；`removeSection` 清理对应 `orders[sectionId]`；`clearWorkspaceData` 清理整份 `orders[wsId]`。
  - 边界：主面板 `SessionGroupsPanel` 的分组本就有 ↑↓（未改），其会话行没有排序按钮；顺序只存在插件本地 localStorage，不调用宿主 `insertSessionBefore`，原生列表顺序不受影响。
  - 自测：排序函数用 `sortByOrder` 单测（手动顺序、新会话置顶、相邻交换）通过。
  - `client.js` SHA256 `DA879D9B05FEA724F4B695C1DBE316E22DE9E254E00476CDDAEEBF17488FC40A`。
- 2026-10-28 运行中会话的上下文环转圈 + 定时任务时钟接回（用户要求）：
  - 转圈：`ContextRing` 新增 `spinning`，span 加 `dssx-ctx-spin`；CSS `@keyframes dssx-ctx-spin` 360°、`1.2s cubic-bezier(.15,.85,.25,1) infinite`（先急后缓），`prefers-reduced-motion` 下关闭。
  - 触发条件：`useSessionStatus((snapshot) => snapshot)` 返回的 `Map.get(sessionId)?.running === true`（宿主 standard prop，`sidebar.workspaces` 有；缺失时 fallback 为永不转）。running 时 tooltip 改「正在工作 · 上下文已用 N%」。
  - 时钟：原先「有 contextPercent 就用环替代 `sidebar.session.row.leading`」，把宿主 `schedule-mark`（`IconClockOutlineRegular` 14px，仅当该会话有活跃定时任务才渲染）吞掉了；现改为 seat 内先 `renderSlot('sidebar.session.row.leading')` 再渲染环，顺序即时钟在左、环在右。
  - `.dssx-browser-seat` 由固定 `width:16px` 改为 `min-width:16px` + `gap:4px`，容纳「时钟 + 环」两个 cell（仅对有定时任务的会话，标题相应右移约 18px）。
  - 字典新增 `row.contextRunning`（zh/en）。
  - 边界：环必须有上下文投影数据才渲染（`percent` 为 null 时无环，running 也一样）；低百分比会话的进度弧很短，转圈观感弱。
  - `client.js` SHA256 `7CEEFFD3E95995F83A095D572B6E7AD01A9CD1FCDE3026520EC45725C6644430`。
- 2026-10-28 时钟重做（用户：上次接法失败，完全删除后重来）：
  - **删除**：会话行 seat 里的 `renderSlot('sidebar.session.row.leading')` 调用。宿主注册项 `schedule-mark` 虽然在 `sidebar.workspaces` 里声明、inspect 显示 `active: true`，但在本插件自绘行的组件内渲染不出来（与菜单条目同一类 problem，不报错、静默空白），上一版因此看不到表。
  - **新方案**：自绘 `ClockMark`（16 网格：circle r5.8 + 走针 `M8 4.9v3.4l2.4 1.5`，stroke 1.3，14px，`--dsw-alias-label-tertiary`），在 `ContextRing` 左边；`props.scheduled === true` 才渲染，tooltip `row.schedule`。
  - **数据**：Host `schedule` 服务 → 客户端 `ctx.remote.schedule.catalog()`（`@Remote('catalog')`），筛 `status === 'active'` 后取 `sessionId` 建 Set。`SessionGroupsBrowser` 挂载即拉一次，之后 20s 轮询；`sameIdSet` 避免同内容重建 state；失败保留上一次结果（不清空）。
  - **注入**：插件 `inject` 数组新增 `remote`、`remote.schedule`（键名 = Host 服务名，与 `remote.commands` / `remote.credentials` 同模式）。**风险点**：该键若不可解析，插件整体不 apply、侧栏会退回宿主原生列表——实机若发现侧栏变回原生，先查这里。
  - 字典新增 `row.schedule`（已设定时任务 / Scheduled task set）。
  - 边界：时钟对归档行也显示（宿主原生只给 idle 行）；catalog 是拉取式，最长 20s 延迟；`remote.schedule` 必须在 inject 里声明才可用。
  - `client.js` SHA256 `F58D5108053EE5BB78915B1A392CCCEE8130D42D648D48AB8127316067AC6F81`。
- 2026-10-28 时钟不显示——根因与修复（用户反馈「没有」）：
  - **根因**：`ctx.remote.schedule.catalog()` 返回的是 **RemoteResult 包装** `{ ok: true, value: ScheduleCatalogEntry[] }`，不是裸数组。上一版写 `Array.isArray(catalog) ? catalog : []` 永远为假 → Set 恒空 → 时钟一次都没渲染。宿主 `@deepseek-ai/dsh-client-ui-schedule` 自己的 `catalog-source.js` 也是 `result.ok ? result.value : ...` 这样解包的，可对照验证。
  - 修复：`scheduleSessions` 改为解 `result.ok === true && Array.isArray(result.value)`；读取失败返回 `null`（而不是空 Set），让 effect 保留上一次结果。
  - 实时性：新增 `ctx.remote.$on('schedule/changed', refresh)` 订阅（宿主同款事件名），新建/删除定时任务立即反映；轮询降为 30s 兜底。`$on` 用 try/catch 包裹，不可用时退化为纯轮询。
  - **顺带确认的事实**（下次不要再试）：
    - 宿主 mark 来自独立包 `@deepseek-ai/dsh-client-ui-schedule`，注册 `sidebar.session.row.leading` id `schedule-mark`，inject 是 `{ hooks: { catalog } }`（共享 store，非 RPC），组件 `SessionScheduleMark` 判据 `record.sessionId === sessionId && record.status === 'active'`。
    - 同一个包里还有 `sidebar.session.row.hover` id `schedule-tasks`（悬停卡片里的任务列表），与本插件的 `session-groups.hover` 共存。
    - 提取宿主 bundle 的办法：`F:\DSH\temp\asar-extract2.mjs <app.asar> <路径后缀> <输出文件>`（header 在 offset 12 是 JSON 长度，数据从 16 开始并按 4 字节对齐）。
  - `client.js` SHA256 `0B677D4C4ECC4EB52140EAF256467D2D98861BC7C19B79925E17363EB568C9D6`。
  - **实机确认（2026-10-28，用户「现在有了」）**：刷新页面后，带活跃定时任务的会话行左侧出现「时钟 + 上下文环」并排。此后改这块只需复跑 `node F:\DSH\temp\wf-stub-check.mjs`（stub 已按 RemoteResult 包装喂数）再刷新确认。
- 2026-10-28 时钟与环放大到 18px（用户要求：两者尺寸统一、放到和谐范围内最大、不动其它数值）：
  - 尺寸依据：会话行内容行高 22px（标题 15px / line-height 22），图标超过 22 会撑高整行；图标与字高的和谐比例 1.1–1.2。18px = 行高 82%、字高 1.2 倍，是上限一档。若用户还要更大，下一档是 20px（行高 91%，开始压字）。
  - 改法：`ContextRing` 与 `ClockMark` 的 svg 宽高 14→18，**viewBox 保持不变**（14 / 16），靠 SVG 自身缩放等比放大，环的 stroke 视觉值随之为 2×(18/14)≈2.57、时钟走针 1.3×(18/16)≈1.46，几何比例与线宽关系不变。
  - CSS `.dssx-ctx-ring` / `.dssx-clock` 宽高同步 14→18。**seat 的 `min-width:16px` 与 `gap:4px` 未动**（用户明确不动其它数值），因此有「时钟+环」的行会自然撑到约 40px，标题相应右移。
  - `client.js` SHA256 见 `SHA256SUMS.txt`。
  - **实机确认**：用户看后反馈「好多了」，18px 定稿，不再往上调。
- 2026-10-28 上下文阈值提醒（用户要求：20% 提醒一次，40% 提示交接换会话；白皮书 §8 同步写入）：
  - 位置：`SessionGroupsBrowser` 内，复用已有 `contextPercentOf(mainSessionId)`；**不新增 slot**、不改 `ContextRing`、不动宿主 composer 的 ContextMeter。
  - 逻辑：`CONTEXT_ALERT_LEVELS = [20, 40]`；当前会话 percent 跨档时弹一次，已触发阈值记 localStorage `dsh.context-alert.v1`（`{ [sessionId]: [20, 40] }`），刷新不重弹；一次跨两档只弹 40。
  - 呈现：`ContextToast` 经 `createPortal` 挂到 `document.body`（避免侧栏 overflow / transform 裁剪）；20% 中性色 6 秒自消，40% 橙色警示需点「知道了」才消失。
  - 字典新增 `ctx.alert20.title/body`、`ctx.alert40.title/body`（zh/en），按钮复用已有 `confirm`。
  - 边界：agent（Host）读不到该百分比，只能靠插件提醒用户、用户转达；`shell.overlay` 未用于此提醒（其组件是否带 `useSessions` 未确认，绕开）。
  - 验证：`node --check` 通过；阈值逻辑离线单测 `F:\DSH\temp\ctx-alert-sim.mjs` 覆盖爬升 / 刷新 / 跨档 / 新会话四场景通过；UI 效果待刷新实机确认。
  - 环强调（三次迭代，用户最终要求「环内一个圆点」）：`ContextRing` 在进度环之后叠一个实心 `<circle r=2.4>`，颜色 ≥20% `--dsw-alias-state-warning-primary`（回退 `#d98e2b`）、≥40% `--dsw-alias-state-error-primary`（回退 `#d93025`）；内径 4.5，点直径 4.8 ≈ 内径 53%，与环之间留净空；`contextRingColor` 10 档渐变**未改**。
  - 点中心镂空（用户追加：「再给这个点加一个镂空的点」）：实心点改 **`<mask>` 真镂空**——`<defs>` 内 mask 白圆 `r=2.4`、黑圆 `r=0.9`（`maskUnits:userSpaceOnUse`，区域 x/y=4、6×6），圆点 `mask:url(#id)`。id 由模块级计数器 `ctxHoleSeq` 生成 `dssx-ctx-hole-N`，保证同页多实例不冲突。孔直径 1.8 ≈ 点的 37.5%（18px 下约 2.3px）。
  - 用 mask 而不是「背景色小圆覆盖」：当前会话行有 `bg-layer-2` 高亮底，覆盖色会露馅；mask 在任何皮肤/底色下都成立。
  - **教训**：不要用 `box-shadow` 给图标做外描边——它沿 18×18 方形容器外扩、不跟环的真实圆径，必然既方又留缝。另：viewBox 14 里环外缘已到 6.5（边界 7），外圈没有空间，阈值强调落在**环心圆点**最省事也最直观。
  - `client.js` SHA256 见 `SHA256SUMS.txt`。
- 2026-10-29 行内时间挪到操作按钮右侧（用户截图：最后互动时间要放到三个按钮右边）：
  - 原结构：`[seat] [button.dssx-browser-open = 色点 + 标题 + 时间] [actions]`，时间在标题按钮内部末尾，所以显示在 actions 左边。
  - 新结构：`[seat] [button.dssx-browser-open = 色点 + 标题] [actions] [time]`，时间成为行的直接子级、排在 actions 之后。
  - 位置稳定：`actions` 常态 `opacity:0` 但保留占位（`flex:none`），悬停出现时时间不跳动；时间宽度随文案变化，右边缘贴行尾 padding（右侧对齐）。
  - 未改任何字号 / 行高 / gap（行 gap 仍 2px，因此时间与 actions 间距比原来 button 内的 6px 更紧，符合「不动其他数值」）。
- 2026-10-29 打包交付（用户「可以打包了」）：
  - 产物：`F:\DSH\导出\DSH工作区前端重建_2026-10-29.zip`（全局交付出口，平铺不建子目录）。
  - 包内为插件目录全量文件，顶层目录 `dsh-workspace-frontend/`；不含 `node_modules`（本插件无依赖，纯 JS Client bundle）。
  - 版本仍为 `0.1.0`（未改 `package.json`，因为 loader 行 id 与包名未变，改版本号对 link 安装无意义）；包名与日期靠 zip 文件名区分。
  - 打包前已校正 README 过时内容：兼容性说明移除废弃的 `sidebar.session.row.leading`，改列 `sidebar.workspaces.session.row.action`、`useSessionStatus`、`ctx.remote.schedule`；安装后验证补「时钟在环左边」。
  - 校验方式：解压后比对 `SHA256SUMS.txt`（README 里有现成 PowerShell 片段）。
- 2026-10-29 **插件崩溃（上下文阈值提醒）——根因与修复**：
  - 现象：用户报告「插件崩溃」。取证方式：`cordis_inspect_query` client `Slots.listSubTree` 查 `sidebar.workspaces`，occupants 里 `priority: -1`（本插件）为 **`active: false`**、`priority: 0`（宿主）为 `active: true` —— 协议层面证实插件被踢下线、宿主接管。
  - **根因**：`const createPortal = React.createPortal`。`createPortal` 属于 **`react-dom`**，`react` 包从不导出它，所以这里恒为 `undefined`；`ContextToast` 只在上下文 ≥20% 时走 portal，于是**恰好在第一次阈值提醒时**抛 `TypeError`，把 `SessionGroupsBrowser` 整个带崩。所以「平时好好的、一到 20% 就崩」。
  - 佐证：宿主所有容器都写 `react_dom.createPortal`（`dsh-client-ui-chat` / `ui-schedule` / `ui-settings-*` 等 12 个包），**没有一处**用 `React.createPortal`。
  - 修复：改为 `require('react-dom').createPortal`，外层 try/catch；toast 改为「有 portal 就 portal，没有就内联渲染」（CSS 本身是 `position:fixed`），任何情况下都不再抛错。
  - **教训（重要）**：stub 校验脚本原本在假 React 上伪造了 `createPortal`，把这个真实错误给掩盖了。`F:\DSH\temp\wf-stub-check.mjs` 已改为反映真实模块形状（`react` 无 `createPortal`、`react-dom` 才有），并加回归断言：源码出现 `React.createPortal` 即失败；行内时间必须排在 actions 之后也一并断言。
  - 另一条：**凡「只在某个阈值/条件分支才渲染」的 UI，必须在真实页面把那个分支触发一次**，不能只验证主路径。「UI 效果待刷新实机确认」这种记录等于没验。
- 2026-10-29 环心圆点两轮定稿（用户：先「放大一点先试试 2px」，再「太粗了，应该只有环一半的描边粗细」）：
  - 放大：外径 `r 2.4 → 3.2`（18px 渲染下视觉直径 6.2 → 8.2px）。圆点在 viewBox 14 里，视觉 = 值 ×18/14。
  - 壁厚：孔径 `1.2 → 2.2`，壁厚 = 3.2 − 2.2 = **1.0**，即环描边 2px 的一半。**壁厚的参照物是环的 stroke，不是外径比例**，这是用户第二次反馈的要点。
  - **连带项（下次改半径必查）**：`<mask>` 区域必须包住整个点 + 抗锯齿边缘。旧区域 `x/y=4, 6×6` 是按 r=2.4 算的，点变大会被裁成方形；现为 `x/y=1, 12×12`。
  - 定稿值：mask 白圆 `r=3.2`、黑圆 `r=2.2`、点 `r=3.2`、区域 `1,1,12×12`。
  - **实机确认**：用户「很好，打包吧」。
- 2026-10-29 最终打包（用户「打包吧」，覆盖当天早先那个含崩溃版本的包）：
  - 产物：`F:\DSH\导出\DSH工作区前端重建_2026-10-29.zip`，顶层目录 `dsh-workspace-frontend/`，10 个文件，不含 `node_modules`。
  - 包内含崩溃修复（`react-dom` 的 createPortal + 内联兜底）与环心圆点定稿，**打包前已用解压比对 `SHA256SUMS.txt` 校验零不匹配**。
  - 交付前提醒随包：该版本需刷新页面才生效；插件为 link 安装，升级只需覆盖目录内容。
- 2026-10-29 第二轮改造（用户逐项验收、多轮反馈迭代；改动全部落在 `client.js`）：
  - **环动画**：`dssx-ctx-spin` `1.2s cubic-bezier(.15,.85,.25,1)` → **`.8s linear`**（无间隔感）。running 时不再转整环，改「流星」：头部大圆 + 5 个递减尾点，`<g class="dssx-meteor-spin">` 绕环心 `.8s linear` 旋转，尾点 `opacity` 周期衰减 `0.95→0.06`、`animationDelay` 递增。**边界**：尾巴 110%→10% 用 opacity 淡出模拟，不是几何伸缩；低占用时段弧短、观感弱。
  - **环弧渐变**：进度弧 `stroke` 改 `url(#dssx-ctx-grad-N)`，`linearGradient` 以 `userSpaceOnUse` 从根部（`contextRingColor(0)`）到尾端（`contextRingColor(percent)`），id 复用 `holeRef` 序号。
  - **环心内环**（替换原镂空圆点）：两条半弧（顶部/底部各切 15% = 54° 缺口，左半 117°→243°、右半 297°→63°）+ 4 个断点空心圆（r 0.55 / stroke 0.35）。左半 ≥20% 变 `--dsw-alias-state-warn-primary`，右半 ≥40% 变 `--dsw-alias-state-error-primary`，否则 `contextRingColor(0)`。**原 `--dsw-alias-state-warning-primary` 拼写错误已顺手修正**（`Theme.listTokens` 确认真名是 `warn`）。
  - **金额显示**：三级——会话 = 本会话 cny、分组 = 组内会话合计、工作区 = 工作区全部合计（「无工作区」段为静态 span 不走 tail）。`formatCny`：`(cny / 1e6).toFixed(2)` + 整数 `padStart(2, '0')` → `¥00.72`。数据源 `GET /dsh-claude-style/session-cost?id=`（同源 fetch，**15s 轮询**；60s 时用户感到 0.01 偏差，缩短后解决）；读取失败显示 `—`，不崩行；cny 缓存 `Map` 存 state。
  - **金额 UI**：新增 `.dssx-browser-tail` 容器，金额绝对定位覆盖在按钮原位，`:hover` 时金额 `opacity:0`、按钮 `opacity:1`，**布局不跳**；金额样式 `12px/600`，`rgba(0,0,0,.07)` 底 + 四角 4px L 形描边（8 条 `linear-gradient` 拼角，角色 `rgba(0,0,0,.32)`）；时间 `margin-left:6px` 拉开间距。会话/分组/工作区三处 tail 已接；工作区按钮默认 `opacity:0`、hover 才显示。
  - **行首控件 `SessionMarker`**：行首新增 `[圆点 + 箭头]`，占用原 `padding-left:20px` 空白（行 padding 改 `2px`）。圆点 = 直径 **20px**（比上下文环 18px 略大）45° 双色实心圆：两半扇形（左上半 muted、右下半 accent），靠 **SVG mask** 挖一条 3px 斜缝（约直径 15%，与内环断口比例一致），缝是「圆被切开」而非两块平移；mask id 用模块级 `markerSeq` + `useRef` 生成 `dssx-marker-seam-N`。圆点中心 `(13,15)` 与标题/环同纵轴，控件 40×30 不撑高行。
  - **箭头**：实心四节点多边形 `M 13 0 L 9.5 6 L 13 2 L 16.5 6 Z`（顶点/左翼/内凹口/右翼，指向侧两节点）。向上 `rotate(0)`（`scale(.7)` 很小）；向右 `rotate(90deg)` + `translateX(3px)` + `scale(1.9)`。mini 同形状箭头沿尖端延长线（间隙 1.2px），仅向右态淡入；向上态隐藏。颜色 `currentColor`：未选中灰、开启/悬停主题色。
  - **三态**：开启会话 = 圆点左上灰/右下主题 + 箭头向右主题；悬停非开启 = 左上主题/右下灰 + 箭头向右主题；未选中 = 左上主题/右下灰 + 箭头向上灰。圆点两半靠整体 `rotate(180°)` 互换，箭头绕圆点中心摆 90°。
  - **被用户否掉的方向（不要再走）**：① 箭头双层双线（改实心 4 节点）；② 圆点「内点 + 外环镂空」双层（改实心双色）；③ 两个半圆各自平移做断缝（出现方形遮挡块，改 mask 切割）；④ `scaleY(.72)` 垂直压扁（用户「扁错了方向」）；⑤ `scaleX(.55)` 水平压扁（用户「做了坨屎，回滚」）。
  - `client.js` SHA256 `65BEE27F9797176B21CE633466FED7E42245997CAE38395D002C8884680DC4D8`，**146117 字节**。
- 2026-10-29 组行新建会话自动入组（用户要求「让从组行新建的会话自动入组」）：
  - 链路：分组标题行「+」不再直调 `startSession(wsKey)`，改用注入的 `startSessionInGroup(wsKey, group.key)`；后者走 `ctx.uiWorkspace.openWorkspace(workspaceId, beforeOpen)`，在 `beforeOpen(sessionId)` 里 `assignSession(workspaceId, sessionId, sectionId)`。
  - 依据（宿主源码 `dsh-client-ui-workspace/lib/client.js`）：`startSession` 返回 void，内部就是 `openWorkspace(target, beforeOpen?)`；`replaceMain` 在真正选中前同步调用 `beforeOpen?.(reference.sessionId)`（约 1658 行），这是唯一能拿到新会话 id 的公开钩子。client `uiWorkspace` Service 契约里 `openWorkspace(workspaceId, beforeOpen?, options?)` 已 inspect 确认。
  - 边界：`connectBlank` 会复用本工作区已有空白会话（`createInWorkspace` 的 blank 复用规则），被复用的会话同样改归该分组——「在组里点 + 拿到的就是组内空白会话」，符合预期；归档会话不在复用范围。
  - 防御：`openWorkspace` 不存在或同步抛错时回退 `startSession(workspaceId)`（只丢归组、不丢新建）；`openWorkspace` 的 rejection 被吞掉，失败提示仍由宿主 notice 发出。
  - 「未分组」区没有「+」按钮，不涉及。
  - 折叠态：分组折叠时点「+」先展开该组（`if (groupCollapsed) toggleKey(...)`，与「添加分组」对折叠工作区的处理一致），否则新行落进看不见的折叠区。
  - 校验：`node --check` 通过；`F:\DSH\temp\wf-marker-state-check.mjs` 的旧断言（匹配 `startSession(wsKey)`）已换成 4 条新断言（组行按钮调 `startSessionInGroup`、fallback、inject 暴露 + beforeOpen 内 `assignSession`、折叠先展开），34 项全过；另跑冒烟 `F:\DSH\temp\wf-group-session-smoke.mjs`（真实模块形状加载 → apply → 调注入 props，9 项全过）。
  - `client.js` SHA256 `448E23D5B6D6A7E04B86D5B757FF17192694E3AA1B67EF24758874A940C103EC`，154272 字节。
- 2026-10-29 接入状态复核（本次会话开头）：`plugin_manager list_bundles` → `@local/dsh-workspace-frontend` 0.1.0 `installed: true` / `enabled: true`，`source: link:F:\DSH\projects\dsh-workspace-frontend`；`Slots.listSubTree(sidebar.workspaces)` → 插件占用项 `priority -1 active: true`、宿主 `priority 0 active: false`。即插件已接入并在线，改源文件刷新页面即生效，无需 `install_bundle`。
- 2026-10-29 把手竖线与矩形横轴统一 + 矩形横向压扁（用户两轮要求：先「他们两个在横轴上统一」，选「都以侧栏分界线为中线」，再「矩形左右压扁，横向宽度与竖线只多出双向各 1px」）：
  - 几何基准：handle 容器宽 16、`margin-left:-8px` ⇒ 容器中线 = 侧栏分界线 = 容器内 x=8；宿主原生热区是 8px / `margin-left:-4px`，中线同样落在分界线。
  - 统一前：矩形 `::after` 为 `left:2px; width:15px` 且左栏 `translateX(4px)`、右栏 `translateX(-4px)`，中心在分界线 ±5.5px（朝内容区凸出），与竖条（gradient 5..11，中心 8）差 5.5px。统一为 `left:0.5px; width:15px` 并删掉两处 translateX，矩形中心回到 8；左右栏共用同一套横向位置。
  - 压扁定稿：竖线 6px（5..11），矩形「左右各外扩 1px」→ `width:8px; left:4px`（4..12）。
  - **连带项（改矩形宽度必查）**：箭头是 `background-image` + `background-size:15px 15px`，宽 8 的盒子会左右各裁 3.5px、把右侧 chevron 切掉；已同步改 `background-size:8px 8px`。
  - 圆角仍写 `7px`，但 width 8 时浏览器按规范把半径钳到 4px（两端半圆）；要改观感须同时调 radius。
  - 校验：`node --check` 退出码 0；`F:\DSH\temp\wf-handle-align-check.mjs` 19 项全过（容器中线 8、竖条中心 8、矩形中心 8、矩形宽 = 竖线 6 + 双向各 1、左右缘各外扩 1、箭头不宽于矩形、左右栏无 translateX）；`wf-marker-state-check.mjs` 与 `wf-group-session-smoke.mjs` 回归 ALL PASS。
  - `client.js` SHA256 `CDFECE200DE50182B8C315E026D1D7392C6742CECD5E3E3113F7CCCCDD3FD52D`，154216 字节。
- 2026-10-29 打包 + GitHub / 市场准备（用户：先「打包导出然后更新我们的github」，随后「先不急 GitHub，试试接入插件市场」→「我是说把插件上传到插件市场」）：
  - **打包已完成**：`F:\DSH\导出\dsh-workspace-frontend_2026-10-29.zip`（36868 字节，SHA256 `82526B1645ED5A284F7AFB47D10AF93C12871862F309CE3C2F5CA62D096F4DED`），已复制到 `E:\_成果回传\` 且两边哈希一致；解压回验包内 `SHA256SUMS.txt` 10 项零不匹配。
  - 包内新增 `SHA256SUMS.txt`（此前包内没有）；`使用说明.md` 补了「组内新建自动入组（折叠组先展开）」「侧栏调宽把手（竖线 + 圆角矩形）」两条功能。
  - 仓库版内容：`F:\DSH\temp\github-repo-v2`，11 个文件。`package.json` 改公共名 `dsh-workspace-frontend`、去掉 `private`、补 repository/homepage/bugs/keywords；`cordis.patch.yml` 的 `name` 同步成公共名（旧仓库那份 patch 名与包名不一致，这次一并修正）。
  - GitHub 仓库计划（用户确认）：旧仓库 `Zcc50/dsh-session-groups` **改名** `dsh-workspace-frontend` 并整体替换 main。脚本 `F:\DSH\temp\github-push.mjs`：改名 → 建 blob → 建 tree（不带 base_tree，旧文件随之消失）→ commit → 移 ref → 回查远端逐文件 size 比对。
  - 市场收录：`dshmarket` 只认 [awesome-dsh-plugin](https://awesome-dsh-plugin.com) 精选列表，上架 = 往上游提**一个 YAML 文件**的 PR（`data/plugins/<owner>__<repo>.yml`，最多 3 条/PR，CI 查 `dsh.bundle`、仓库满 1 天、描述属实、`dsh-plugin` topic）。
    - 条目已写：`F:\DSH\temp\market-entry\Zcc50__dsh-workspace-frontend.yml`（`category: session`，中英描述）。
    - 脚本 `F:\DSH\temp\github-market-pr.mjs`：同步 fork main → 从 main 建分支 `add-Zcc50-dsh-workspace-frontend` → PUT 条目 → 开 PR → 关闭旧 PR #10011 并留评论注明被取代。
    - 旧 PR #10011（Add Zcc50/dsh-session-groups）：**open、未合并**、0 评论、`mergeable_state: unstable`；上游 `data/plugins/` 下没有 `Zcc50__dsh-session-groups.yml`。用户 fork `Zcc50/awesome-dsh-plugin` 已存在（分支 `add-Zcc50-dsh-session-groups`）。
  - **硬顺序**：必须先完成「仓库改名 + 内容替换」，才能提市场 PR——CI 会按条目 `url` 去 fetch 新仓库的 `package.json` 查 `dsh.bundle`，仓库没改名会 404 直接失败。
  - **当前阻塞**：两步都需要 GitHub 写权限 token（classic，`public_repo`）。用户侧浏览器打不开 `github.com`；**agent 侧 `api.github.com` 可达**（本次所有只读查询均 200），所以只要拿到 token，即使浏览器打不开也能一次性完成。
  - 校验：两个脚本 `node --check` 均退出 0；条目 YAML 无「`: `（冒号+空格）」导致解析失败的写法。
- 2026-10-29 GitHub 执行结果（用户提供 classic PAT，执行完待吊销）：
  - **本机 TLS 坑（必记）**：`node` 直接 `fetch` GitHub 报 `UNABLE_TO_VERIFY_LEAF_SIGNATURE`；加 **`--use-system-ca`** 即可（本机到 GitHub 走中间人证书，Node 自带 CA 不认）。所有推送/校验脚本都必须带这个 flag。
  - 仓库改名成功：`Zcc50/dsh-session-groups` → **`Zcc50/dsh-workspace-frontend`**，description / homepage / topics（`deepseek-harness, dsh-plugin, session-groups, sidebar, workspace`）一并更新。**坑**：首次 `PATCH` 改名返回 502 `An error occurred while sending the request.`，属 GitHub 侧偶发，重试一次即 200（`F:\DSH\temp\gh-probe.mjs` 就是这个探针+重试）。改名后旧 URL 会 301 重定向，`PATCH /repos/<旧名>` 会跟随重定向并返回 200（所以 `github-push.mjs` 会打印 `renamed:` 而不是走 404 分支，无害）。
  - main 内容整体替换：10 个文件（`.gitignore` / `LICENSE` / `README.md` / `client.js` / `cordis.patch.yml` / `icon.svg` / `index.js` / `locale/{en,zh}.json` / `package.json`），旧插件的文件全部消失；commit `12906bd`，tree `a3a7e97`。
  - 校验：远端逐文件 size 比对 **0 不匹配**；`client.js` / `package.json` / `cordis.patch.yml` / `README.md` 经 Contents API 下载后 **SHA256 全部 MATCH**（client.js 154216B）。
  - CI 前置项实测通过：`dsh.bundle.patch` 存在、`package.json` name = `dsh-workspace-frontend`（与 `cordis.patch.yml` 的 name 一致）、`dsh-plugin` topic 已加、`created_at 2026-10-28T04:55:01Z`（>1 天）。
  - **市场 PR 已提交**：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/10275 —— 分支 `Zcc50:add-Zcc50-dsh-workspace-frontend`（head `032c707`），1 个文件 `data/plugins/Zcc50__dsh-workspace-frontend.yml`（+6 行），CI check 当时 `in_progress`。
  - 旧 PR **#10011 已关闭**并留评论指向 #10275（旧插件被新包取代，旧仓库名已不存在）。
  - 新增脚本：`F:\DSH\temp\gh-validate.mjs`（验 token/身份/scope/仓库可达）、`gh-probe.mjs`（写权限探针 + 改名重试）、`gh-verify-repo.mjs`（仓库元数据 + `dsh.bundle`）、`gh-verify-pr.mjs`（PR 状态 + check runs）、`gh-verify-hash.mjs`（Contents API 下载后 SHA256 比对）。token 只作 argv 传入，未写入任何文件。
  - **待办**：CI 出结果后确认（通过则等维护者合并、站点重建、dshmarket 自动收录；失败按 CI 报错在同一分支补推）；用户吊销 token。
- 2026-10-29 市场 PR CI 结果（**全绿**）：
  - `Submission gate` → `success`，summary：`All 1 submitted entry passes: dsh.bundle declared, repo old enough, enough commits.`（提交后 15 分钟才出，gate 是后补触发的）。
  - `check`（awesome-lint + 站点构建）→ `success`，耗时 **14 分 39 秒**（05:00:29Z → 05:15:08Z）。上游工作流本身就要十几分钟，不是卡住。
  - PR #10275 最终 `mergeable_state: clean`，`state: open`，1 文件 +6/-0，未被打 `held: author`。
  - **下一步**：等维护者合并 → 站点重建 → `awesome-dsh-plugin.com/plugins.json` 出现该条目 → `dshmarket` 市场自动收录（通常合并后一天内）。合并后无需再动仓库。
  - **重新查询方法**（token 已吊销时也能跑只读）：`GET /repos/awesome-dsh-plugin/awesome-dsh-plugin/pulls/10275` 看 `state`/`mergeable_state`/`merged`；条目合并后文件落在上游 `data/plugins/Zcc50__dsh-workspace-frontend.yml`。
- 2026-10-29 市场显示名改为项目正式名（用户：市场里找不到 + 要求市场内名字与项目正式名相同）：
  - **「找不到」的原因不是配置问题**：PR #10275 当时仍 `open` / `merged: false`，上游 `data/plugins/Zcc50__dsh-workspace-frontend.yml` 是 404 —— 条目要等维护者合并、站点重建后才会进 `plugins.json`，市场下次打开才可见。
  - **名字规则（关键，以后不用再查）**：`scripts/lib/entries.mjs` 里 `name` 是「列表里的链接文字」；只有当 `name` 的 `#` 前部分包含 `/`（即写成 `owner/repo`）时才校验「必须与实际 url 的 owner/repo 一致」，**纯显示名（不含 `/`，例如中文名）是合法的**，CI 不会打回。
  - 已把条目 `name` 从 `Zcc50/dsh-workspace-frontend` 改为 **`DSH 工作区前端重建`**（项目正式名；简称仍是「工作区美化」），commit `bf312b3`，PR 自动更新并重跑 CI。
  - **不影响安装匹配**：市场用**包名**（`installed` map / bundle 名）匹配已安装与更新，不用 catalog entry 的 `name`，所以改显示名不会让市场认不出已装插件。
  - 若以后还要改显示名：改 `F:\DSH\temp\market-entry\Zcc50__dsh-workspace-frontend.yml` 后跑 `F:\DSH\temp\gh-update-entry.mjs <token>`（GET sha → PUT 到 PR 分支，同内容会跳过）。
  - **改名后 CI 结果（全绿，2026-10-29 05:48Z）**：`check` success（05:32:38Z → 05:47:57Z，约 15 分 19 秒）；`Submission gate` success；PR #10275 `mergeable_state: clean`、`merged: false`、无 `held` 标签。上游 `data/plugins/Zcc50__dsh-workspace-frontend.yml` 仍 404（未合并，正常）。


## 9. 本机安装记录（2026-10-29，Administrator / F 盘工作区）

本机此前只装过旧包 `@local/dsh-session-groups`（行 id `session-groups`，目录 `F:\DSH\projects\dsh-session-groups`，client.js 81806 字节）。这次按「改名换代」处理：新包名 `@local/dsh-workspace-frontend`、行 id `workspace-frontend`、client.js 133409 字节，两者都占据 `sidebar.workspaces`（priority 均为 -1），不能共存。

- 卸载旧包：`plugin_manager remove_bundle` → target `@local/dsh-session-groups` → `application: applied`。
- 新包落点：`F:\DSH\projects\dsh-workspace-frontend`（目录名与包名一致，走 link 安装，不用 README 默认的 `~/.dsh/plugins`）。
- 安装：`plugin_manager install_bundle` → target `F:\DSH\projects\dsh-workspace-frontend` → `application: applied`，`bundle: @local/dsh-workspace-frontend`，`version: 0.1.0`，`warnings: []`。
- profile `C:\Users\Administrator\.dsh\profiles\desktop`：
  - `dependencies` 新增 `"@local/dsh-workspace-frontend": "link:F:/DSH/projects/dsh-workspace-frontend"`，旧依赖已移除；
  - `dsh.profile.bundles` 末位由 `@local/dsh-session-groups` 换成 `@local/dsh-workspace-frontend`；
  - `node_modules\@local\dsh-session-groups` 符号链接仍残留（pnpm 未清理），但不在 bundles 里，不参与加载；旧目录 `F:\DSH\projects\dsh-session-groups` 保留作回滚。
- 校验：解压源 `F:\DSH\temp\wsfrontend-2026-10-29\dsh-workspace-frontend` 与安装目录逐文件比对 `SHA256SUMS.txt` 9 项，零不匹配；`node --check client.js` / `index.js` 退出码 0；`package.json`、`locale/*.json` 均可解析。
- pnpm 旧坑预检：先读 `node_modules\.modules.yaml`，`virtualStoreDir` 已是 `C:\Users\Administrator\.dsh\profiles\desktop\node_modules\.pnpm`，本次未出现 `ERR_PNPM_UNEXPECTED_VIRTUAL_STORE`，不需要再改回该字段。
- 安装后 slot 在线情况（注意：新旧 bundle 注册的 id / priority 相同，卸载当次页面里残留的仍是旧 bundle，因此这一轮 inspect 结果不能作为「新代码已加载」的证据）：
  - `sidebar.workspaces`：priority -1 `active: true`，宿主 priority 0 `active: false`（接管成立）；
  - `sidebar.panellist`：id `session-groups`、order 20、`active: true`；
  - `sidebar.session.row.hover`：`schedule-tasks` 与 `session-groups.hover` 均 `active: true`。
- 生效条件：本机没有 `pnpm run dev:web` watcher（只有 Adobe 的 node 进程），客户端 bundle 不会热替换，必须刷新页面（`Ctrl+R`）才加载新代码。
- 刷新后需人工确认：侧栏面板入口标题变「工作区美化」；会话行左侧出现上下文用量环（18px，环心镂空点，≥20% 变橙、≥40% 变红）；有活跃定时任务的会话环左边有时钟；会话行可拖到分组；分组会话语时间在三个操作按钮右侧；当前会话上下文 ≥20%/≥40% 各弹一次提醒。
- 刷新后复验方式：`cordis_inspect_query` client `Slots.listSubTree` 查 `sidebar.workspaces` / `sidebar.panellist` / `sidebar.session.row.hover`，再核对页面实际渲染。

### 与旧项目的文档关系

- 旧项目 HANDOFF `F:\DSH\projects\dsh-session-groups\HANDOFF-会话分组_2026-10-28.md` 保留作历史（含 0.1.0 到阶段 B 的演进与踩坑），末尾已加一行指向本文件。
- 全局白皮书 `~/.dsh/AGENTS.md` §7 的触发词表现在指向本文件，旧 HANDOFF 作为历史附注保留。

## 10. 实现记录（2026-10-29）

### 10.1 会话行左描边：已删除

那条「像括号」的竖条不是字符，是 `.dssx-browser-row.dssx-current` 的 `box-shadow: inset 2px 0 0 var(--dsw-alias-brand-primary, …)`；行 `border-radius:6px` 把 inset 阴影两端裁成弧线。截图取样色 `#2c376d`。用户要求「只删除描边」，现规则只保留底色，其它样式未动：

```css
.dssx-browser-row.dssx-current{background:var(--dsw-alias-bg-layer-2,#f4f1eb)}
```

### 10.2 上下文环：渐变弧 + 流星 + 内环断口（2026-10-29 第二轮形态）

- **轨道**：`circle r=5.5 stroke 1`（2026-10-29 放大到 20px 后按用户要求打薄 1px；此前 18px 时曾打薄又回滚），色 `border-l2`。
- **渲染尺寸（2026-10-29 五改）**：svg 18 → 20px（viewBox 14 不变，等比放大），CSS `.dssx-ctx-ring` 同步 20px。行高 22px 下 20px = 91%，是「合规范围内尽可能大」的上限档（21px 接近行高、22px 会撑高整行）。
- **进度弧（2026-10-29 四改）**：按 1% 一段，共 100 段小弧 `path`（每段 3.6°，`polarPoint` 计算起止点，段尾 +0.06° 重叠防缝），每段 `stroke = contextRingColor(段中点)`，只画 `round(percent)` 段。`contextRingColor` 改为连续：`hue = 120 × (100 − percent) / 100`、`55% / 50%`——每 1% 变色，满环即从绿（119.4°）到红（0.6°）的连续渐变。线性渐变（`dssx-ctx-grad`）已整体移除。
- **运行中动画（2026-10-29 三改终版）**：整个进度弧（保持当前百分比弧长）包在 `g.dssx-ctx-spin` 里，绕环心 `transform-origin:7px 7px` 以 `.8s linear infinite` 旋转整圈——「进度条本身转」，不再有独立流星和生长动画。非 running 时进度弧静止显示实际百分比；`prefers-reduced-motion` 下不旋转。
- **内环**（环心，替换原镂空圆点）：`r=3.2 / stroke 1`，两条半弧——顶部缺口 243°–297°、底部缺口 63°–117°（各 54°=15%），左半 117°→243°、右半 297°→63°；4 个断点空心圆（r 0.55 / stroke 0.35）。左半 `percent>=20` 用 `--dsw-alias-state-warn-primary`，右半 `percent>=40` 用 `--dsw-alias-state-error-primary`，否则 `contextRingColor(0)`。
- **掩码 id**：`ctxHoleSeq` / `gradId` / `markerSeq` 均模块级计数器 + `useRef`，同页多实例不冲突。
- **调用点**：`BrowserSessionRow` 的 seat，props `percent / spinning / title`。
- **历史**：旧「双环 + 流星」实现早已删除（`ContextMeteor` 等），本次流星是重新实现的版本，勿与旧代码混淆。

### 10.3 行首控件 SessionMarker（2026-10-29 新；当日二改为双层环）

- 结构：`[SVG 40×30]` = 双层环（中心 13,15，几何照搬 ContextRing）+ 箭头组（四节点多边形 `M 13 0 L 9.5 6 L 13 2 L 16.5 6 Z` + 尖端 mini 箭头）。
- **外层环**：`r 7 / stroke 2.5`（ContextRing 外环比例 5.5:2 等比放大 1.27 倍），沿 `/` 斜向切成两段弧，缝在 315°/135°（每侧 12°，弦长≈3px）；左上半 `label-tertiary`、右下半 `brand-primary`。
- **内层环**：`r 4 / stroke 1.25`（ContextRing 内环比例 3.2:1 等比放大），断口在 45°/225°（左上—右下，`\` 方向），缺口 54°（±27°，同 ContextRing 内环）；两段弧为右上 `label-tertiary` / 左下 `brand-primary`——即外层两色顺时针旋转 90°；弧端点各一个空心小圆（r 0.7 / stroke 0.45）。
- 尺寸：外层视觉直径 16.5px。首版 13px（r5.5/stroke2）被用户判「太小，其他都正确」，等比放大到 16.5px（原实心双色圆 20px）。旧实现（r10 两半扇形 + mask 3px 斜缝）已整体删除。
- 状态映射靠 CSS 类：`.dssx-marker` 默认（未选中）、`.dssx-marker-on`（开启会话）、行 `:hover`（非开启且悬停）。
- 圆点旋转：`.dssx-marker-dot` 默认 `rotate(180deg)`（左上主题/右下灰），`on` 时 `rotate(0)`（左上灰/右下主题）；内外层一起转，相对颜色关系不变。
- 箭头：默认 `translateX(0) rotate(0deg)`（向上，`scale(.7)` 很小）；`on`/hover 时 `translateX(3px) rotate(90deg)`，内层 `.dssx-marker-arrow-scale` `scale(1.9)`；mini `.dssx-marker-arrow-mini` 默认 `opacity:0`、向右态 `opacity:1`。向右态横向压扁见 §10.6。
- **被否掉的中间态**：双层双线箭头、内点+外环镂空圆点、半圆平移做缝（出现方块）、`scaleY(.72)`、`scaleX(.55)`。见 §6 踩坑「回滚后先查记录」。
- **状态色（2026-10-29 三改）**：整环（外层两段弧 + 内层两段弧 + 4 个断点圆）换成单色——`pendingInteraction.kind === 'question'` 全蓝 `brand-primary`；`approval` / `plan-review` 全黄 `state-warn-primary`；`completionUnread === true` 全绿 `hsl(120,55%,50%)`。优先级：提问 > 权限 > 完成。状态来自 `useSessionStatus` 快照（`SessionGroupsBrowser` 的 `completedOf` / `pendingOf`）。
- **变色动画（2026-10-29，退出→入场序列）**：颜色切换时先对**旧颜色**播 1s 退出动画（`.dssx-marker-exit`：环**顺时针**转一周 + `.dssx-marker-exit-sweep` 弧从全长收回 0），再由 `setTimeout` 切到**新颜色**播 1s 入场动画（`.dssx-marker-enter`：顺时针转一周 + `.dssx-marker-sweep` 弧从断口处 0→全长；外层弧 19.06px / 内层弧 8.80px，来自 `2πr×跨度/360`）。两段都是顺时针（`0→360`，用户要求同向），总 2s。状态机 `{phase: exit|enter|idle, color}`，`key = anim-<phase>-<color>` 触发重挂重播，初始挂载 `firstRender` 守卫不播；状态色在 dot 组套 `filter: saturate(65%)` 降饱和 35%；定时器在切换/卸载时清理；`prefers-reduced-motion` 下全部关闭。
- **状态数据链路（2026-10-29 确认）**：`useSessionStatus` 快照 entry = `{ running, pendingInteraction, completionUnread }`（宿主 `dsh-client-ui-session/lib/client.js` publishStatus，约 985-988 行）：`pendingInteraction` 是 PendingApproval / PendingQuestion 实例，`kind` 分别为 `'approval'` / `'question'` / `'plan-review'`（approval client.js:156/181，user-questions:138/186）；`completionUnread` 只在 running→idle 且**非当前主会话**时置位（main 会话会被清掉，见 session client.js 953/966）。
- **测试代码已删除（2026-10-29 打包前）**：诊断 tooltip、Ctrl+Alt+1/2/3/4 测试开关、`dsh.marker-test` / `dsh.ctx-test` 持久化全部移除；线上只保留真实状态。
- **与 ContextRing 的关系（2026-10-29 三改，重要）**：行首环与上下文环是**两个不相关的控件**——行首环不读 `contextPercent`、不画进度弧、不共享动画代码。曾把上下文环的进度/色阶/流星套到行首外环，被用户判「把上下文环盖在行首环上」，已整体回滚。以后不要再把两个环的样式或动画混用。
- 调试手法：改完 `node --check` → 用户刷新 → 截图对比；visual 断言靠截图，不靠文字猜。

### 10.4 校验手段

- `node --check client.js`。
- 离线单测 `F:\DSH\temp\ctx-ring-check.mjs`：从源码抽 `contextRingColor + 常量 + ContextRing`，用最小 react stub 渲染，29 项断言（颜色连续、1% 分段数、满环首段绿/末段红、内环两半弧 + 4 断点圆、颜色分档、运行中整条旋转、20px 容器、mask id 唯一）。
- 离线单测 `F:\DSH\temp\wf-marker-state-check.mjs`：30 项（行首环默认双色、三档状态色与优先级、退出/入场动画契约、降饱和、测试代码已清除、整行点击三断言、分组新建对话按钮）。
- link 安装：源文件即安装版，改完刷新页面即生效，不用 `install_bundle`。
- 冒烟 `F:\DSH\temp\wf-group-session-smoke.mjs`：用 `new Function` 按 `window.__ModuleLoader__.load` 真实形状加载 client.js → `factory(require)` → `apply(ctx)`，再取 `sidebar.workspaces` 注册项的 `inject()` props，断言 9 项：模块收录、注册项存在、inject 工厂可用、`startSessionInGroup` 暴露、`openWorkspace` 收到 `(wsId, beforeOpen)`、`beforeOpen(sessionId)` 后 `assignments[sessionId] = sectionId` 落盘、`openWorkspace` 缺失时回退 `startSession`。这份 stub 把 `react` 与 `react-dom` 分开喂（react 无 createPortal），别再合成一个对象。
- 把手几何 `F:\DSH\temp\wf-handle-align-check.mjs`：从源码抽 handle 容器 / 竖条 gradient / 矩形 `::after` 三组数值，断言 19 项——容器中线 8、竖条中心 8、矩形中心 8、矩形宽 = 竖线宽 + 双向各 1px、左右缘各外扩 1px、箭头 `background-size` 不宽于矩形、左右栏无 `translateX`。改把手任何横向数值都先跑它。

### 10.5 环境与遗留事实

- 插件在线：`sidebar.workspaces` 上 priority `-1` 的占用项 `active: true`，宿主 `priority 0` 为 `false`。
- 无实体回滚包：`F:\DSH\导出\` 只剩 `说明.md`，`E:\_成果回传\` 只有旧项目 zip，项目非 git 仓库；回滚只能按记录在代码层重建。
- `SHA256SUMS.txt` 已于 2026-10-29 重算，9 项与源码一致（client.js `7F8F4708…`，含 §10.2 分段渐变 + 20px + 打薄、§10.3 状态色 / 变色动画 / 测试删除、§10.6 压扁、§10.7 整行点击、§10.8 分组新建按钮）。
- **token 名已修正**：`--dsw-alias-state-warning-primary` → `--dsw-alias-state-warn-primary`（`Theme.listTokens` 确认真名），源码不再依赖 fallback。
- **费用接口已接入**：`GET /dsh-claude-style/session-cost?id=<sessionId>` → `{ ok, value: { cny, usd, partial, model } }`，`cny` 单位元×1e6，已实现 `/1e6` 换算 + 15s 轮询 + 三级合计显示。
- 已知观感余项：行首圆点/箭头的最终形态仍可能微调（用户对箭头向右的宽高比有反复），数值都在 §10.3。

### 10.6 向右态箭头横向压扁（2026-10-29）

- 需求（用户确认选项「只缩短水平长度，尖端位置不动」）：箭头从向上摆到向右后，视觉水平长度压扁，尖端位置不动。首轮 `scaleY(.72)` 后用户要求「继续压扁，同时保持上下的高度不变」，二轮收紧到 `scaleY(.55)`。
- 实现：`dssx-marker-arrow-scale` 内新增 `.dssx-marker-arrow-squash` 包住主箭头 `arrowPath`；`transform-origin:13px 0px` 锚在箭头尖端（path 起点 `M 13 0`），默认 `scaleY(1)`；仅 `.dssx-marker-on` 与行悬停（即向右态）为 `scaleY(.55)`。mini 箭头留在 squash 层外，不参与压扁。
- 几何（离线 `F:\DSH\temp\wf-marker-check.mjs` 13 项全过，与浏览器 SVG 变换同序：内层 squash → 外层 scale(1.9) → rotate(90°) → translateX(3px)）：尖端 x 恒 33.7（viewBox 坐标）不动；水平长度 11.40 → 6.27px（缩短 45%）；垂直宽度 13.3px 不变（scaleY 只作用于旋转后的水平向，上下高度由 scaleX 1.9 决定）。
- 与 §6 被否 `scaleY(.72)` 的区别：那版是在向上态直接压扁（方向错）；本次只作用于向右态、以尖端为锚，向上态完全不受影响。
- 校验：`node --check` 通过；`wf-marker-check.mjs` 13/13；效果待刷新实机确认（link 安装，无需重装）。

### 10.7 会话行整行点击（2026-10-29）

- 需求：点会话行任意位置都能打开会话，不再只有标题按钮可点。
- 实现：`BrowserSessionRow` 行容器加 `onClick`——`props.dragging` 时忽略；`event.target.closest('button, [role="menuitem"], input, textarea, select')` 命中行内按钮/菜单项时放行（由各自 handler 处理），其余命中整行调用 `openSession(summary.id)`。标题按钮保留（键盘可达、回车可用）。
- 覆盖范围：行首环、时钟、上下文环、标题、色点、时间、成本、行内空白；排除：open 按钮自身、↑↓ 排序、行内 action、更多菜单及其菜单项。
- 指针：行容器 `cursor:pointer`（行首环/时钟/上下文环/时间/成本等区域都显示手型），行内按钮保持各自 pointer、禁用态 default。
- 校验：`wf-marker-state-check.mjs` 的三条结构断言（onClick 存在、跳过按钮、调用 openSession）。

### 10.8 分组新建对话按钮与导出包（2026-10-29）

- 分组标题的按钮列表最左侧新增「新建对话」（`IconPlus`，`startSession(wsKey)`），与工作区标题行新建按钮行为一致；`aria-label` 同 `browser.newSession`。
- 导出包：`F:\DSH\导出\dsh-workspace-frontend_2026-10-29.zip`（SHA256 `D1CE80C3…`，35185 字节），已备份到 `E:\_成果回传\`，两边哈希一致。包内 = 插件本体（client.js / index.js / cordis.patch.yml / package.json / icon.svg / locale）+ `使用说明.md`（自然人向简版）+ `安装说明.md`（一条指令）+ `安装.ps1`（复制到 `%USERPROFILE%\.dsh\plugins\dsh-workspace-frontend` 后完整输出使用说明，UTF-8 BOM）。
- 注意事项：`安装.ps1` 只复制文件，DSH 内仍需在插件管理器装一次 bundle 并刷新页面。

### 10.9 组行新建会话自动入组（2026-10-29）

- 渲染侧：`SessionGroupsBrowser` 解构 `props.startSessionInGroup`；分组标题行「+」的 `onClick` 优先调用 `startSessionInGroup(wsKey, group.key)`，缺失时回退 `startSession(wsKey)`。
- 注入侧：`startSessionInGroup(workspaceId, sectionId)` 调 `ctx.uiWorkspace.openWorkspace(workspaceId, (sessionId) => assignSession(workspaceId, sessionId, sectionId || ''))`；`openWorkspace` 不是函数或同步抛错则回退 `ctx.uiWorkspace.startSession(workspaceId)`；返回的 Promise 挂 `.catch(() => {})`，避免未处理 rejection。
- 为什么不用 `sessions.create` 自己建：那会绕过 `openWorkspace` 负责的连接 + 选中 + draft 导航语义，属于重造宿主已有链路。
- 为什么不用「调 startSession 后比对快照找新 id」：宿主会复用本工作区已有 blank 会话（`createInWorkspace`），那种情况下根本不产生新 id，监听方案必然漏判；`beforeOpen` 在新建与复用两条路径上都拿得到最终 id。
- 归组写入：`assignments[sessionId] = sectionId`，并按 `orders` 现状把会话 unshift 到组内手动顺序顶部（直接复用 `assignSession` 既有逻辑，拖拽/菜单归组同一条通路）。
- 验证：组行点「+」→ 该组立刻多出一行空白会话（通常在组内顶部）；若该工作区原有空白会话被复用，它也会改归到该组。

### 10.10 环 + 箭头 + 缩进改造（2026-10-30，多轮反馈定稿）

- 分组头 / 工作区头的 caret 换成 `RingCaret`（环 + 箭头），几何与会话行首 `SessionMarker` 同源：40×30 坐标系、环心 `(20,15)`、外环 `r7 / stroke 2.5`、内环 `r4 / stroke 1.25`、箭头 `M 20 0 L 16.5 6 L 20 2 L 23.5 6 Z`、mini 在尖端上方 `y -3.4`；svg `viewBox='13 -2 27 34'`（裁掉环左侧死空白让环贴左缘、纵向留出下方箭头空间并让环心居中）。
- 尺寸档位：工作区 36（视觉直径 ≈18.7）> 分组 30（≈15.6）> 会话行 40（14）。
- 箭头三向：收起向上（`scale(.7)`）；展开 = 绕环心 `rotate(180deg)` **停在环下方**，形状与大小和向上完全一致（不放大、不压扁、不出 mini）；悬停向右 = `translateX(0) rotate(90deg)` + `scale(1.9)` + `scaleY(.55)` + mini。三层 origin 固定 `20px 15px / 20px 3px / 20px 0px`。
- 标题：分组名 `margin-left:-15px`、工作区标题 `-18px` 贴环；悬停位移 20px（6px 会被箭头盖住）。
- 缩进三档（环左缘）：工作区 6px（头 padding）→ 分组 14px（`groups padding 10` + 头 padding 4）→ 会话 34px（行 `margin-left:26px` + 行内 padding 2 + 环心差 6）。
- 会话行：删分组色 Dot；`SessionMarker` 不参与悬停让位，时钟/上下文环/标题装进 `.dssx-browser-shift`，悬停与当前会话（`.dssx-current`，箭头常驻向右）都右移 12px；`margin-right:-15px` 收掉环右侧空白；`.dssx-browser-seat` gap `-2px`（时钟与上下文环轻叠 2px）。
- 折叠动画：`.dssx-collapse` 用 `grid-template-rows:0fr↔1fr` 过渡，内层 `translateX(-16px)+opacity` 划入/倒放，分组 / 工作区 / orphan 三处共用；`prefers-reduced-motion` 关闭。
- 验证：`node --check` 通过；`F:\DSH\temp\wf-ring-caret-check.mjs` 40 项全过，`ctx-ring-check` / `wf-marker-ring-check` / `wf-marker-check` / `wf-marker-state-check` / `wf-handle-align-check` 全绿。
- 待办（已登记到任务列表 p12）：把上述环动画修正移植到任务列表插件的 `TaskMarker`（其向下箭头仍是「小箭头 pop」错版）。

### 10.11 会话行缩进对齐（2026-10-30）

- 反馈：会话条目行首环左侧空白过多，缩进步进应与「工作区→分组」保持一致。
- 口径：沿用本文件既有的「环外缘左坐标」。工作区 4.33px（ws-head padding 6 + RingCaret(36) 偏移 −1.67）→ 分组 12.61px（groups 10 + group-head 4 + RingCaret(30) 偏移 −1.39）→ 会话原 32.75px（行 margin 26 + 行内 padding 2 + SessionMarker 环左缘 4.75）。
- 改动：`.dssx-browser-row` 的 `margin-left` 26→**14px**，会话环左缘落到 20.75px；两段步进 8.28 / 8.14px（差 0.14px），视觉上会话比分组再进一档 8px。
- 单因子：本次只动这一个值。行背景左缘随之从 28 收到 16；行内结构（SessionMarker、悬停右移 12px、marker `margin-right:-15px`、tail 金额）全部未改，层级仍为 工作区 < 分组 < 会话。
- 验证：`node --check` 通过；`F:\DSH\temp\wf-indent-check.mjs` 从源码解析真实值重算三档环左缘，6 项全过（旧 26px 已移除、两次步进差 ≤0.5px、会话环左缘 ≤22px、40px marker 未动）。
- 解析坑：SessionMarker 的 `arrowPath` 在源码中比 RingCaret 靠前，校验脚本必须先 `slice` 到 `function RingCaret` 再取环心，否则会把环心 20 误读成 13（本次脚本已修正）。
- 校验坑：用 `pwsh -Command` 拼中含中文文件名的 SHA256SUMS 时，`Get-Content` 回显会是 GBK 乱码，但文件本身是正确 UTF-8；判定编码一律用 `read` 工具回读，别信 PowerShell 控制台（`F:\DSH\temp\wf-sums-verify.mjs` 已用 node 逐行比对，9/9 一致）。

### 10.12 条目任意处点击折叠（2026-10-30）

- 反馈：工作区 / 分组条目原来只有点环能折叠，希望点击行内任意处都能展开或折叠。
- 实现：新增模块内 `headerToggleClick(event, toggle)`（放在 `shared inline pieces` 注释块后的 InlineInput 之前）。两处工作区头（普通工作区键 `collapsedWorkspaces`、orphan 区键 `'__orphan__'`）和分组头（`collapsedGroups`）统一走它；环按钮原有 onClick 保留，点击按钮时被 closest 拦截后交给按钮自己 toggle，不会双触发。
- 拦截规则：`closest('button, input, textarea, select, a, [role="menuitem"]')` 命中即放行；`window.getSelection()` 非折叠且 `anchorNode` 落在当前 header 内时不折叠（拖选标题文字不误触）；选区 API 抛错时照常折叠。
- 样式：`.dssx-browser-ws-head` / `.dssx-browser-group-head` 补 `cursor:pointer`；`.dssx-input` 补 `cursor:text`，重命名输入框的光标不被 header 继承成手型。
- 未动：「未分组」静态头（`dssx-unassigned-name`）本来没有折叠态，不接；会话行点击仍是打开会话。
- 验证：`node --check` 通过；`F:\DSH\temp\wf-header-click-check.mjs` 从源码提取函数体，在 mock window/event 上跑 14 项全过（点标题折叠、点按钮不折叠、标题内选中不折叠、别处选中照常折叠、选区异常兜底、连续两次点击恰好两次 toggle）。
- 交互备注：双击标题会连续 toggle 两次（折叠再展开，净效果不变）；重命名仍走尾部铅笔按钮。

### 10.13 会话重命名改为行内编辑（2026-10-30）

- 反馈：会话重命名不要再单独弹窗，交互要和分组一样。
- 改法：`BrowserSessionRow` 增加 `editing / editingName / editingError`；菜单「重命名」把标题按钮换成 `InlineInput`（`dssx-rename-inline`），Enter 提交、Escape 取消，提交调宿主 `renameSession`（`ctx.sessions.using(...).binding.session.rename`）。与分组头 `editingGroup + InlineInput` 是同一套交互。
- 校验：空标题拦下并显示 `rename.empty`，保持编辑态；宿主拒绝显示 `rename.failed`（带原因），保持编辑态，输入框标红（`.dssx-input-invalid`）。
- 副作用处理：编辑中行不可拖拽（`draggable: editing !== true`），行点击直接 return（不会顺手打开会话）；输入框本来就在行点击的 closest 排除名单里。
- 移除：`RenameSessionDialog` 组件、`useRenameRequest`、`openRenameDialog / closeRenameDialog`、rename request store、`shell.overlay` 的 `session-groups.rename-dialog` 注册、`.dssx-rename-form` 死样式（client.js 净减 2114 字节）。
- 传参：`SessionGroupsBrowser` 解构 `renameSession`，三处 `BrowserSessionRow`（分组 / 未分组 / orphan）都传；`sidebar.workspaces` 的 inject 增加 `renameSession`。
- 验证：`node --check` 通过；`F:\DSH\temp\wf-row-rename-check.mjs` 26 项全过（弹窗引用零残留、行内结构、三处传参，以及从源码提取 `commitRename` 在 mock 上跑空标题 / 正常 / 宿主拒绝 / 未注入 API 四路）。
- 交互备注：编辑中点别处不会自动提交或取消（与分组一致），需要 Enter 或 Escape。

### 10.14 分组默认展开按活动会话（2026-10-30）

- 需求：刷新后只展开「含活动会话」的分组，其余折叠。活动 = 运行中 / 提问 / 需要权限 / 有定时任务。
- 判定口径（用户确认）：与行首视觉同源。运行中 = 上下文环在播放旋转动画（`runningOf` → `ContextRing spinning`）；提问、需要权限 = 行首环换成状态色（`SessionMarker.stateColor`：question 用品牌色，approval / plan-review 用警告色）；定时任务 = 座位上的时钟标记（`scheduledIds` → `ClockMark`）。这三份数据本来就是渲染行首控件的同一份，所以直接读数据等于读环颜色/动画，不用查 DOM。
- 实现：折叠状态改为「派生 + 显式覆盖」：`groupCollapsed = groupKey in collapsedGroups ? collapsedGroups[groupKey] === true : !groupHasActiveRow(group)`；`groupHasActiveRow` 只看 `group.rows`。开关改成写显式布尔 `setGroupCollapsed(groupKey, !groupCollapsed)`，不再用 `toggleKey`（它按 key 存在性翻转，会让「显式展开」被删掉后回落到派生值，点一下没反应）。
- 行为：刷新后活动组展开、其余折叠；用户点过之后本页内以显式值为准；会话开始 / 结束运行会实时改变该组的默认折叠（派生跟随状态），刷新即重置。定时任务列表是异步拉取的（首次 + 30s 轮询），首帧可能先折叠、拿到 catalog 后再展开。
- 未动：工作区层级仍默认展开（否则折叠的分组标题都看不到）；未分组块没有折叠态。
- 为什么不读 DOM 的环颜色 / 动画：行首表现就是这三个信号渲染出来的（同一份 `statusMap` / `scheduledIds`），读数据等价。真去读 DOM 会踩三处：`prefers-reduced-motion` 会关掉上下文环的 `dssx-ctx-spin`，运行中会被误判成没在跑；`SessionMarker` 的颜色有四种（completed 也是绿色），按颜色反推会把「完成未读」当成活动；定时任务是时钟图标而不是环色，按颜色读整类漏掉。另有首帧未挂载、类名一改静默失效的问题。
- 约束：以后若行首表现需要新状态，先把状态并进这两个数据源再渲染，不要反向读 DOM。
- 验证：`node --check` 通过；`F:\DSH\temp\wf-group-default-check.mjs` 19 项全过（结构、四种活动信号、空组、混合组、completed 不算活动、派生与显式覆盖四路）。

### 10.15 绿环（完成未读）组的展开策略（2026-10-30）

- 现象：刷新后「任务系统 → 子插件分组 → 父子重建项目接入准备」是绿环（`completedUnread`）但组折叠——§10.14 只认四种活动状态，completed 不算活动，属于当时口径的预期结果。
- 决定（用户选）：绿环组刷新后也展开，但**不随点开自动收**（点开会话后绿环消失，组不能自己合上）。
- 实现：新增 `completedOpenGroups`（`useRef(new Set())`）+ 计数 state；effect 依赖 `nodes, statusMap`，把「组内有 completed 行」的组 key 记进快照，只增不删；派生式改为 `!(groupHasActiveRow(group) || completedOpenGroups.current.has(groupKey))`。手动折叠/展开仍以 `collapsedGroups` 的显式值为准，刷新重置快照。
- 附加行为（如需收紧）：页面存活期间新出现的绿环也会展开该组（快照持续吸收），同样永不自动收。若只想「刷新时快照一次」，给 effect 加一个已 seed 标记、只跑一次即可。
- 验证：`node --check` 通过；`F:\DSH\temp\wf-group-default-check.mjs` 25 项全过（新增绿环快照：刷新展开、点开后不收、只对所在组生效、手动折叠优先、ref+计数触发渲染）。

### 10.16 工作区标题栏余额标签（2026-10-31）

- 需求：把会话行金额标签（`.dssx-row-cost`，红框）的样式复制到「工作区」标题行右侧工具栏（归档 / 添加工作区按钮所在处，黑框），内容改为**剩余账户余额**。
- 数据源：Host `deepseekAccount.getBalance(client)` 的 Client 面 `ctx.remote.account.getBalance(metadata)`（设置 → 账号与余额同源，包 `dsh-client-ui-settings-account`）。返回 `RemoteResult`：`{ ok, value: { status: 'ready', value: AccountWallet[], bonusWallets } }`，钱包为 `{ currency: 'CNY' | 'USD', balance: '十进制字符串' }`。
- 实现：
  - `inject` 增加 `remote.account`；`sidebar.workspaces` 注入工厂新增 `readBalance()`：带 `AccountClientMetadata`（`version: '0.1.0'`、`ctx.locale.getSnapshot().active`、`-new Date().getTimezoneOffset()*60`），解包 RemoteResult，只接受 `status === 'ready'`，优先 CNY 钱包，异常一律返回 `null`。
  - `SessionGroupsBrowser` 新增 `accountBalance` state + 挂载即读 + 30s 轮询；失败 / 未登录保留上次值，首帧显示 `—`。
  - `formatAccountBalance`：两位小数 + 千分位；`<¥0.01` 兜底；负数 `-¥x.xx`；USD 用 `$`；空 / 非法显示 `—`。
  - UI：`tools` 里标题与归档按钮之间插入 `<span class="dssx-row-cost dssx-row-cost-static dssx-browser-balance">`，与红框共用同一套金额样式；tooltip 用字典 `browser.balance`。
  - 字典新增 `browser.balance`（zh「剩余账户余额」/ en「Remaining account balance」）；CSS 新增 `.dssx-browser-balance{flex:none;margin-right:2px;cursor:default}`。
- 校验：`node --check` 退出 0；`F:\DSH\temp\wf-balance-check.mjs` 32 项全过（格式化 10 例 + 源码结构断言 + 冒烟：成功 / 未登录 / failed / RemoteResult 失败 / 异常 / 无接口）。旧脚本 `wf-marker-state-check`（整行 onClick、折叠组新建前展开）与 `wf-ring-caret-check`（margin-left 26px）各有 1–2 条断言早于 §10.11 / §10.12 的改动，已过时，非本次引入。
- 边界：`remote.account` 若不可解析会导致插件不 apply（与 `remote.schedule` 同类风险）；刷新后先查 `sidebar.workspaces` priority -1 occupant 是否 `active: true`。
- 实机确认（2026-10-31，用户「完工」）：刷新后工具栏出现余额，数值与设置页「充值余额」一致；刷新后插件仍在线（`sidebar.workspaces` priority -1 `active: true`）。

### 10.17 刷新后展开当前打开会话所在的分组（2026-10-31）

- 需求：刷新后自动展开的列表里，要包含用户**当前打开**（main view）的会话所在的分组。
- 改动：`groupHasActiveRow` 增加 `id === mainSessionId`（与 running / pending / scheduled 同级）。`mainSessionId` 是组件内 `useMemo`，声明在函数定义之后，但 `groupHasActiveRow` 只在渲染 body（2692 附近）调用，晚于声明，无 TDZ。
- 折叠派生链未变：`groupKey in collapsedGroups ? ... : !(groupHasActiveRow(group) || completedOpenGroups.current.has(groupKey))`。因此：刷新后当前会话组展开；当前会话在别的组时本组不因此展开；页内手动折叠仍以显式值为准（刷新重置）。
- 边界：当前会话若在「未分组」区或「无工作区」区，那些区块本就没有折叠态（orphan 默认展开），不需要额外处理。
- 校验：`node --check` 0；`F:\DSH\temp\wf-group-default-check.mjs` 28 项全过（新增 3 条：当前打开 → 展开 / 别组打开 → 本组折叠 / 无打开 → 折叠）。
- 实机确认（2026-10-31，用户「完工」）：刷新后当前会话所在分组处于展开状态。

### 10.18 工作区 / 分组 / 会话拖拽排序（2026-10-31，工作区小修）

- 需求（用户确认）：新增「工作区小修」分支，直接改本插件；可拖动工作区和分组排序；叠加会话可在组内拖到指定位置。首版做了插入线，用户反馈「横线不直观不好看」，**改为拖动中实时重排 + 上下让位预演**，插入线整体删除。
- 交互口径（用户逐项确认）：
  - 拖动中实时重排：被拖项跟到目标位置，其他项立即让位，松手才写 store；被拖项保持 45% 半透明。
  - 让位动画：FLIP，`transform .18s cubic-bezier(.2,.7,.3,1)`；`prefers-reduced-motion` 关闭。
  - 分组头 ↑↓ 移除（侧栏）；会话行 ↑↓ 保留；主面板 `SessionGroupsPanel` 的分组 ↑↓ 保留（面板没有拖拽）。
  - 会话拖到分组空白处：组容器淡背景（`dssx-drop-into`，无描边），不再有整组描边。
- 数据与提交：
  - 工作区顺序：预览只改渲染；drop 时按预览序计算 anchor，调注入的 `moveWorkspaceBefore` → `ctx.workspaces.insertBefore(workspaceId, beforeWorkspaceId)`（Controller 乐观更新 + 宿主持久化）。
  - 分组顺序：`moveSectionBefore(wsId, sectionId, beforeSectionId)`（本地 `sections` 数组）。
  - 会话：`placeSessionIn(workspaceId, sectionId, sessionId, targetIds, beforeId, crossWorkspace)` 一次 commit 同时写归属与 `orders`；同工作区写 `assignments`，跨工作区写显示层 `moves`。
- 渲染：
  - `preview` 三种形状：`{kind:'workspace',order}` / `{kind:'group',wsId,order}` / `{kind:'session',sourceId,fromWs,fromSection,toWs,toSection,ids}`。
  - `renderedNodes` 在节点树上应用预览；会话预览会把源行从旧组移除、插入目标组。
  - 折叠派生改用 `baseGroups`（拖拽前的组数据）：拖拽中移走/移入活动行不改变组的展开/折叠。
  - 拖出「无工作区」区时，orphan 区按 `preview` 过滤源行，避免预览重复显示。
  - 行悬停在拖动源自身时吞掉 dragover（否则会冒泡到组容器触发「加入组顶部」）。
  - 会话行拖拽不排除按钮热区（标题按钮上也能起拖，保留原行为）；工作区/分组头入口只在非按钮区起拖。
- 校验：
  - `node --check client.js` 退出 0；`lsp_diagnostics` 无 error（仅既有 hint）。
  - 新增 `F:\DSH\temp\wf-drag-reorder-check.mjs`：33 项全过（结构 + `placeSessionIn` / `moveSectionBefore` / `insertNear` 源码提取行为）。**注意**：该脚本旧版曾断言插入线 CSS，已改为断言「插入线彻底移除 / 组容器淡背景 / renderedNodes / data-flip / FLIP」。
  - 全量回归 12 个脚本全过：`wf-marker-state`（修正 2 条过时断言）、`wf-group-default`（派生改用 baseGroup，28 项）、`wf-balance`、`wf-ring-caret`（margin-left 断言改为 14px）、`wf-header-click`、`wf-row-rename`、`wf-indent`、`wf-marker`、`wf-handle-align`、`ctx-ring`、`wf-group-session-smoke`（新增 moveWorkspaceBefore 冒烟）。
  - 已知边界：分组不能跨工作区拖动（目标工作区无该 section，静默忽略）；「无工作区」区不能作为拖拽落点（只可作源）；FLIP 在快速连续 dragover 时刻只保证最后一次位移平滑；取消拖拽的回位动画依赖 `flipKindRef` 记住上一次类型。
### 10.19 会话行拖拽抽搐修复（2026-10-31，用户反馈）

- 现象（用户）：「工作区的移动很好，但是会话本身太窄了，我在移动的时候他会反复的抽搐」。
- 根因三处叠加：① 会话行高约 22px，指针在中线附近 1–2px 抖动就会在 before/after 之间反复翻转，preview 随之重排；② FLIP 的 `translateY` 让 `getBoundingClientRect()` 返回动画中的视觉位置，把动画反馈进命中测试；③ dragover 高频重复计算同一落点。
- 修复：
  - 新增模块级 `sessionDropSide(rectTop, height, clientY, previousSide)`：滞回区 `min(6px, height*0.3)`，在中线±阈值内返回 `null`（保持当前预览），只有明显越过中线才翻面。
  - `onRowDragOver` 加 3px 指针位移门槛；同一目标行同一侧直接 return；`sessionDropRef` 记录上次目标（key = ws + section + sessionId），组容器 into 状态也写 ref 避免串味。
  - 命中判定改用布局位置：`parent.getBoundingClientRect().top + element.offsetTop` / `element.offsetHeight`，避开行自身 FLIP transform。
  - 行 FLIP 动画 180ms → **120ms**（工作区/分组保持 180ms）。
- 行高（用户在同轮确认）：标题行高 22→**24px**（`.dssx-browser-open` 与行内重命名 input 同步），行总高 +2px，拖拽抓手略宽；图标/时间/金额靠 flex 居中，未改字号。
- 校验：`node --check` 0；`wf-drag-reorder-check.mjs` 40 项全过（新增 6 项滞回断言：新目标直判、中线保持、越阈值翻面、零高度兜底）；全量回归 12 个脚本全绿。
- 实机验收（2026-10-31，用户「问题不大，验收通过」）：工作区 / 分组 / 会话三处拖拽、实时让位预演、行高 24px 均确认，不再调整。
- `client.js` SHA256 `C5070DF7F33B28B366385F98E1546A0A059F072ED943188358E2AA07819B1521`，191181 字节。

当前 `client.js`：SHA256 `C5070DF7F33B28B366385F98E1546A0A059F072ED943188358E2AA07819B1521`，191181 字节。

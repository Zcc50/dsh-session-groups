# DSH 重修整合包 v2 · 安装说明

> 版本：2026-10-31 | 适用：Windows + DSH Desktop / `dsh web`（本包在 DSH 0.2.1-rc.3 上验证）
> 一句话：工作区美化、任务列表 v0.3.8（含父子结构 + 完成区）、编码、LSP/审查、视觉、皮肤、白皮书——**每一项都先问你**，你确认或修改后才装。
> 联网口径：插件本体、配置、白皮书都在包里；`pnpm` 解析依赖时需要联网（DSH 装插件本来就要联网）。

## 一、包含什么

| 项目（卡片名） | 内容 | 装好后你会看到 |
|---|---|---|
| `workspace` 工作区美化 | `@local/dsh-workspace-frontend` 0.1.0 | 侧栏「工作区 → 分组 → 会话」、拖拽归组、上下文用量环、20%/40% 上下文提醒 |
| `tasklist` 任务列表 | `@local/dsh-task-list` **0.3.8** | 对话左侧任务面板、四态、父子折叠、**完成区 / 废弃区镜像 dock**（hover 唤回、点击展开互斥）、长任务名让位；`task_write` 带父子结构 warning |
| `encoding` 编码插件 | `dsh-fs-encoding` 1.5.2 | `read` / `write` / `edit` 自动识别 GBK / UTF-16 / Big5 等编码 |
| `lsp` LSP + 审查 | `dsh-lsp-actions` 0.5.17 + `brooks-lint` 1.9.1 + TypeScript 5.9.3 + TS 语言服务器 | `lsp_diagnostics` / `lsp_symbols` 可用；6 个 `brooks-*` 审查技能 |
| `vision` 视觉 | `dsh-vision` 0.1.0 | `analyze_image` 识图、`screenshot` 截屏（需自备 `vision.env`） |
| `skin` 皮肤 | `dsh-claude-style` 0.19.5 | 本机同款配色 / 圆角 / 背景 |
| `agents` 白皮书 | `AGENTS.md` 2026-10-31 版 | 全局操作规范（含第⑨条休息） |

> 父子结构是任务列表 v0.3.8 的一部分；「完成区」是本轮新增（2026-10-31）。
> 出入库等业务项目不属于环境包，不在这里。

## 二、先决条件

1. Windows 10/11，已安装 DSH（Desktop 或 `dsh web`）。
2. **DSH 至少启动过一次**，`%USERPROFILE%\.dsh\profiles\<profile>\package.json` 存在。
3. 不需要 `F:\DSH` 目录、不需要在 PATH 里有 node。安装过程需要网络（`pnpm` 解析依赖）；包内已带全部插件 tgz。

## 三、安装（推荐：让 DSH 里的 agent 装，逐项确认）

1. 把 zip 解压到任意位置（例如桌面），得到 `DSH重修_2026-10-31\` 文件夹。
2. 在 DSH 任意会话里发：

   > 按 `<解压目录>\安装指令.md` 安装重修整合包。

3. agent 会**逐项出问答卡片**（工作区美化 / 任务列表 / 编码 / LSP / 视觉 / 皮肤 / 白皮书），你可以：
   - 直接确认推荐项；
   - 说「不装 LSP」「皮肤不要」「白皮书只补缺失章节」这类修改，agent 会按你的选择拼安装命令；
   - 装完后让你重启 DSH。
4. 完全退出 DSH（含后台进程）再启动，刷新页面。

## 四、安装（手动，等价）

```powershell
# 只看计划不动文件
powershell -NoProfile -ExecutionPolicy Bypass -File "<解压目录>\install.ps1" -Include "workspace,tasklist,encoding,lsp,vision" -DryRun

# 按需组合（逗号分隔；可选：workspace tasklist encoding lsp vision skin agents）
powershell -NoProfile -ExecutionPolicy Bypass -File "<解压目录>\install.ps1" -Include "workspace,tasklist,encoding,lsp,vision"

# 加皮肤与白皮书
powershell -NoProfile -ExecutionPolicy Bypass -File "<解压目录>\install.ps1" -Include "skin,agents" -AgentsPolicy overwrite
```

不传 `-Include` 时默认装 `workspace,tasklist,encoding,lsp,vision`（不含皮肤、不动白皮书）。
`-AgentsPolicy` 取值：`keep`（默认，不动）/ `overwrite`（备份后覆盖）/ `append`（只补缺失章节）。

## 五、验证清单

重启后逐项确认（装了哪项就查哪项）：

- [ ] 左侧栏出现「工作区美化」入口，会话列表是 工作区 → 分组 → 会话
- [ ] 会话行左侧有上下文用量环；有定时任务的会话旁边有时钟
- [ ] 对话区左侧出现任务面板；底部有「完成」与「废弃」两个 dock：hover 唤回、点击展开互斥、展开一个另一个滑走
- [ ] `task_write` 提交 4 个无子任务的新顶层会返回 warning
- [ ] 让 agent 读一个 GBK 文件：`read` 不再报 `E_NOT_TEXT`，中文正常
- [ ] 打开任意 `.ts` 文件让 agent 调 `lsp_diagnostics`，返回诊断而不是 `LSP_ACTION_SERVER_FAILED`
- [ ] 会话技能目录里出现 6 个 `brooks-*` 技能
- [ ] （装了视觉）`analyze_image` 能识图；否则按 §六 配 `vision.env`
- [ ] （装了皮肤）界面配色变成 DeepSeek 蓝 + 本机同款布局
- [ ] （装了白皮书）`~/.dsh/AGENTS.md` 含第⑨条「休息」

## 六、视觉插件配置（`vision.env`）

视觉的识图走外部视觉模型，Key 不在包里。装好后在 `%USERPROFILE%\.dsh\vision.env` 写入：

```ini
DSH_VISION_BASE_URL=https://open.bigmodel.cn/api/paas/v4
DSH_VISION_MODEL=glm-4.6v-flash
DSH_VISION_API_KEY=<你的 Key>
```

（也可直接从旧机把 `~/.dsh/vision.env` 拷过来。）没有 Key 时 `analyze_image` 会报错，但不影响其它模块。

## 七、卸载 / 回滚

- 卸载：在 DSH 里让 agent 对对应包名执行 `plugin_manager` → `remove_bundle`：
  `@local/dsh-workspace-frontend`、`@local/dsh-task-list`、`dsh-vision`、`dsh-fs-encoding`、`dsh-lsp-actions`、`brooks-lint`、`dsh-claude-style`；
  再删 `~/.dsh/plugins\<同名目录>` 与 `<profile>\vendor`。
- 回滚：安装前自动备份在 `%USERPROFILE%\.dsh\backup-重修-<时间戳>\`，把 `package.json`、`cordis.patch.yml`、`AGENTS.md` 覆盖回去，重启 DSH。
- 只回滚配置：删掉 `cordis.patch.yml` 里 `preset-standard`、`ui-skin-claude-style`、`lsp-actions` 三段。

## 八、常见问题

| 现象 | 处理 |
|---|---|
| 安装报「未找到可用 profile」 | DSH 还没启动过；启动一次再装 |
| 安装报「未找到 DSH runtime 的 node/pnpm」 | DSH 安装不完整；重装 DSH |
| `pnpm add` 失败 | 需要联网：检查网络 / 代理 / registry 后重跑 |
| 装了没有任何变化 | 是否完全退出并重启了 DSH（只刷新页面不够） |
| 任务面板不出现 | 检查 `<profile>\package.json` 的 `dsh.profile.bundles` 是否含 `@local/dsh-task-list` |
| 任务列表想要回宿主 `todo_write` | `cordis.patch.yml` 的 `preset-standard` 段里把 `tool-todo` 的 `disabled: true` 删掉 |
| 皮肤没生效 | `-Include` 里是否含 `skin`；`cordis.patch.yml` 是否含 `ui-skin-claude-style` 段 |
| LSP 报 `LSP_ACTION_SERVER_FAILED` | 确认 `typescript` 是 5.9.x（7.x 没有 `lib/tsserver.js`） |

## 九、包里有什么

```
DSH重修_2026-10-31\
├─ install.ps1                 逐项安装（-Include / -AgentsPolicy / -DryRun）
├─ README-安装说明.md           本文件
├─ 安装指令.md                  给 DSH agent 的 SOP（7 张卡片话术在里面）
├─ SHA256SUMS.txt              全包哈希
└─ payload\
   ├─ plugins\                 3 个自研插件源码（workspace / tasklist 0.3.8 / vision）
   ├─ vendor\                  6 个离线 tgz
   ├─ profile\cordis.patch.fragment.yml
   ├─ AGENTS.md
   └─ docs\                    HANDOFF 与 P1/P2/P3 报告（只读参考）
```

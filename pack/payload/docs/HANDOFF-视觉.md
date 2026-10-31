# HANDOFF：DSH 视觉系统重建（简称：视觉）

> 项目组：DSH 视觉能力（Host + Client 双半插件）
> 创建：2026-10-30
> 状态：已安装并实测通过（宿主内闭环见 §12）；识图使用规则见 §14
> 宿主版本：dsh 0.2.1-rc.3
> 当前会话工作区：F:\DSH

## 0. 新会话快速接入（先读这节）

1. **确认在线**：工具清单里有 `analyze_image` 与 `screenshot`；`cordis_inspect_query` host `Tool.listTools` 可核对。
2. **确认配置**：`C:\Users\Administrator\.dsh\vision.env` 存在且含 `VISION_API_KEY`。
3. **读约定**：§2 现状 / §4 安装事实 / §6 踩坑；设计决策见 §3。
4. **口令**：用户说「测试视觉」→ 用 `screenshot` 截图后 `analyze_image` 识别，回显文本作为链路验证。

## 1. 目标

把「三入口、两套配置、零条能通」的视觉链路重建为**一套**：一个插件、两个工具（`analyze_image` / `screenshot`）、一份配置（`vision.env`），后端智谱 GLM-4.6V-Flash（免费）。

**成功判据**：新会话贴图 → agent 一次调用拿到准确描述；同图同问命中缓存；OCR 模式逐字准确；旧插件已卸载且页面无报错。

## 2. 现状事实（历史取证，勿重查）

| 项 | 事实 |
|---|---|
| 旧 `analyze_image` | 来自 `dsh-image-pathify@0.2.2`，默认 `deepseek-flash` + `api.deepseek.com`（DeepSeek 文本模型不支持图像输入），无 Key。 |
| 旧 `vision_understand` | 来自 `dsh-vision-tools@0.1.2`，需 `~/.dsh/vision.env`，实测报「未找到视觉 API 配置文件」。 |
| `read_image` | DSH 内置；当前模型无视觉，调用等于空转。 |
| 宿主能力 | `attachments` 服务有 `validateImage` / `imageLimits`；无 `sharp`；Python + Pillow 12.3 可用（`dsh-runtimes` 自带）。 |

## 3. 已确认决策（用户选定）

- 范围：**统一重构**为一套视觉系统，新插件取代两个旧插件。
- 后端：**智谱 GLM-4.6V-Flash（免费）**，限流自动降级 `glm-4v-flash`。
- 工具名：`analyze_image`（沿用旧名，降低模型迁移成本）。
- 增强项：压缩到长边 1568、结果缓存、OCR 模式、截图工具、多图批量、区域 crop（**不含** JSON 结构化输出）。
- 配置：`$DSH_HOME/vision.env`。
- 旧工具：全部替换。

## 4. 安装事实（2026-10-30）

- profile：`C:\Users\Administrator\.dsh\profiles\desktop`
- `package.json`：`dependencies` 增 `"@local/dsh-vision": "link:F:/DSH/projects/DSH视觉系统重建"`；移除 `dsh-vision-tools` / `dsh-image-pathify`；`dsh.profile.bundles` 增 `@local/dsh-vision`。
- 备份：`F:\DSH\temp\vision-backup-20261030-113854\`（package.json / pnpm-lock.yaml）。
- `pnpm install --prefer-offline`：`+ @local/dsh-vision <- dsh-vision 0.1.0`，`- dsh-image-pathify 0.2.2`，`- dsh-vision-tools 0.1.2`。
- 链接：`node_modules\@local\dsh-vision` → `F:\DSH\projects\DSH视觉系统重建`（SymbolicLink）。
- **生效条件：重启 DSH**（Host 半启动时注册工具；Client 半随页面加载）。

## 5. 文件地图

```
F:\DSH\projects\DSH视觉系统重建\
  HANDOFF-视觉.md              本文件
  README.md                    安装/配置/能力说明
  package.json                 dsh.bundle.patch + dsh.client 声明
  cordis.patch.yml             insert 插件行
  src\index.mjs                Host 半：analyze_image / screenshot / 粘贴路由 / 配置 / 缓存 / 降级
  lib\client.bundle.js         Client 半：📷 按钮 + 拖拽 + 捕获阶段粘贴拦截
  scripts\prepare_image.py     Pillow 预处理：crop + 缩放 + 转 PNG
```

## 6. 踩坑索引

- **不要用 deepseek-flash 当识图模型**：DeepSeek 文本模型不支持图像输入。
- **不 import `@deepseek-ai/*`**：用 `ctx.tools.register` 原生 JSON Schema，避免模块双实例导致工具层 `scheduler.prepare` 崩溃。
- **PowerShell 命令行传 JSON 会被改写**：Pillow 脚本改位置参数 `<src> <dst> <maxSide> [crop]`，crop 用 `x,y,width,height` 逗号分隔；Node 侧 `execFile` 直传不经 shell。
- **中文路径**：`import.meta.url` 取脚本路径必须 `fileURLToPath`（直接 `.pathname` 会被 URL 编码成 `%E8%A7%86`）。
- **截图**：PowerShell + `System.Drawing`，`CopyFromScreen` 截主屏；多屏需改虚拟屏幕范围。
- **Node 不在 PATH**：用 `C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`。
- **max_tokens 过小会截断 OCR 结果**：默认 2048，`VISION_MAX_TOKENS` 可调。

## 7. 轮次结论

- 2026-10-30 第 1 轮：现状取证 + 方向定案 + 插件实现（Host/Client/Pillow 脚本）+ 安装到 profile。
- 2026-10-30 第 2 轮：静态测试通过（工具注册、真实截屏 458KB、缺配置报错可读）；待 Key 与重启后实测。
- 2026-10-30 第 3 轮：与全局白皮书对齐——白皮书第③条看图句改为 `analyze_image` 唯一入口、第⑦条补识图触发词行（并修正前端插件失效路径）；本文件新增 §14 使用规则，承载工具边界、可信度与落盘例外。

## 8. 后端验证结论（GLM-4.6V-Flash 是否免费 + 如何接入）

**是否免费：是，官方定价表明确标注。**

`https://docs.bigmodel.cn/cn/guide/start/pricing`「视觉理解 - 更多视觉模型」原文：

| 模型 | 输入 | 输出 | 缓存存储 | 缓存命中 |
|---|---|---|---|---|
| GLM-4.6V-Flash | 免费 | 免费 | 限时免费 | 免费 |
| GLM-4V-Flash（降级模型） | 免费 | 免费 | 限时免费 | 不支持 |

- 平台同时存在 token 按量计费与 Coding Plan 套餐，那是**付费模型**（GLM-5.3 等）的模式；GLM-4.6V-Flash 不产生 token 费用。
- 免费模型成本为 0；唯一风险是限流。

**限流规则（`https://docs.bigmodel.cn/cn/api/rate-limit`）：**

- 限制的是**并发数**（同一时刻处理中的请求数），不是每日 token 额度；
- 不同模型独立并发上限，与账户权益等级相关；高峰期动态限流；
- 错误码：1302 账户速率限制、1305 平台过载 → HTTP 429；
- 对策：插件已内置「主模型 → `glm-4v-flash` 降级」，两者都免费。

**接入方式（已按此实现）：**

```
POST https://open.bigmodel.cn/api/paas/v4/chat/completions
Authorization: Bearer <API Key>
Content-Type: application/json
{ "model": "glm-4.6v-flash",
  "messages": [{ "role": "user", "content": [
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } },
    { "type": "text", "text": "..." } ] }],
  "max_tokens": 2048 }
```

**实测：** 用户首次提供的 `a034e777efd346df87924174a0ca2930` 调用返回 HTTP 401「令牌已过期或验证不正确」，判定为 Key ID 而非完整 Key；更换为完整 Key（`32位hex.16位secret` 格式）后认证通过。

## 9. 端到端实测结果（2026-10-30，插件代码直调）

测试脚本 `F:\DSH\temp\vision-e2e.mjs`（加载真实插件、不走宿主）：

| 项 | 结果 |
|---|---|
| describe | ✅ 主模型 429 后自动降级 `glm-4v-flash`，返回准确描述 |
| 缓存 | ✅ 同图同问第二次 `cached=true`，未重复请求 |
| OCR | ✅ 逐字识别截图界面文字，内容完整（830 prompt tokens） |
| 图片压缩 | ✅ 586KB 原图经 Pillow 缩到 800×787 后送图 |

**期间发现并已修复的两个真实问题：**

1. **`glm-4v-flash` 的 `max_tokens` 上限是 1024**——配置 2048 会被拒（错误码 1210）。已在 `clampMaxTokens()` 按模型名钳制，并加 1210 兜底重试。
2. **思考模式默认开启**——思考 token 计入 `max_tokens`，会截断输出（实测 32 tokens 全被 reasoning 吃掉）。已设 `VISION_THINKING=disabled`；且只对主模型发送 thinking 参数，降级模型不冒险。

**限流观察：** 测试时段 `glm-4.6v-flash` 频繁 429（高峰期并发限制），降级到 `glm-4v-flash` 后稳定可用；两者均免费。

## 10. 识图按钮图标改造（2026-10-30）

**需求（用户）：** 把输入框「📷 识图」的相机 emoji 换成会话行首的双层环图标；默认态与行首同配色逻辑；悬停变红。

**图标来源：** 工作区美化插件 `F:\DSH\projects\dsh-workspace-frontend\client.js` 的 `SessionMarker`（L1776-1901）——顶部四角箭头 + 双层环：

- 外环 r7 / stroke 2.5，按「/」对角线双色（左 muted、右 accent）；
- 内弧 r4 / stroke 1.25，双色旋转 90°（缺口在「\」对角线）+ 四个端点小圆点（r0.7 / stroke 0.45）；
- 默认配色：`var(--dsw-alias-label-tertiary,#a39d92)`（muted）+ `var(--dsw-alias-brand-primary,#d97757)`（accent）。

**实现：** `lib/client.bundle.js` 新增 `SessionMarkerIcon`（复刻上述路径，22×16.5 渲染）；按钮加 `useState` 跟踪 hover——默认 muted+accent 双色，悬停全部转 `#d93025` 红。按钮保持「识图」文字，图标在前。

**验证：** `node --check` 通过；mock React/`__ModuleLoader__` 加载测试通过（plugin 结构正确、apply 不抛错）。浏览器效果待刷新页面后截图确认。

**生效方式：** Client 半改动，**刷新页面**即可（无需重启）。

## 11. 降级模型验证：glm-4.1v-thinking-flash（2026-10-30）

`vision.env` 的 `VISION_FALLBACK_MODEL` 已从 `glm-4v-flash` 换为 `glm-4.1v-thinking-flash`（64K 上下文，免费）。

**实测（清缓存后强制走新模型）：**

| 项 | 结果 |
|---|---|
| 可用性 | ✅ 主模型 429 时自动降级并返回 |
| max_tokens | ✅ 2048 直接通过（不像 glm-4v-flash 受 1024 限制） |
| 输出格式 | ⚠️ 默认开启思考；文本调用时 content 里出现 `<think>…</think><answer>…</answer>` |
| 清洗 | ✅ 已加 `cleanVisionText()`：剥掉 `<think>` 块、有 `<answer>` 时只取正文 |
| 精度 | ✅ 描述比 glm-4v-flash 更细（构图/色彩/主体都覆盖） |

**结论：** 降级链 `glm-4.6v-flash → glm-4.1v-thinking-flash` 可用；清理函数同时兼容其他思考模型，不会把思考文本漏给主模型。

## 12. 宿主内最终验证（2026-10-30 12:14，重启后）

- 重启后 GUI 端口：62482。
- `screenshot` → `analyze_image`（`noCache: true` 强制请求）成功；输出无 `<think>` 标签，`cleanVisionText()` 在宿主内生效。
- 图标放大核对（截图像素级裁剪）：双层圆环、无箭头、`viewBox: "4.75 6.75 16.5 16.5"` 已生效；之前整屏截图视觉模型报「有箭头」为低分辨率幻觉，放大后否证。
- 项目全部任务完成：后端链路、前端图标、降级模型、成本评估均已验收。

## 13. 导出交付（2026-10-30）

- 位置：`E:\_成果回传\`
  - `dsh-vision-0.1.0.zip`（28 850 B，SHA256 `D6B65EC3CBC4A0CB70C8BB561CAAB5D90C50A28D26605757EFCCE3DE97C82231`）
  - `dsh-vision-0.1.0/`（解压目录）
  - `dsh-vision-0.1.0-SHA256SUMS.txt`
- 包内 10 项：`package.json`、`cordis.patch.yml`、`src/index.mjs`、`lib/client.bundle.js`、`scripts/prepare_image.py`、`README.md`、`README-安装说明.md`、`HANDOFF-视觉.md`、`验收报告-2026-10-30.md`、`SHA256SUMS.txt`
- 校验：解包 9/9 文件 SHA256 与清单一致；zip 顶层目录为 `dsh-vision-0.1.0/`。
- 安装方式见包内 `README-安装说明.md`（方式 A：zip 丢给 agent；方式 B：手动 link + pnpm install + 重启）。

## 14. 识图使用规则（白皮书第③条看图规则的细节）

**工具事实**：识图唯一入口是 `analyze_image`；`screenshot` 只在用户明确要求时截屏落盘，模型不要用它自查界面（白皮书第③条）。`read_image` 是给有视觉能力的模型用的——当前主模型无视觉，调用等于空转；`vision_understand` 随旧插件 `dsh-vision-tools` 一并卸载，不存在。

**调用要点**

- 模式：默认 `mode=describe`；文字 / 表格 / 代码截图用 `mode=ocr`（逐字识别、表格转 Markdown、代码转代码块、不可辨认字符用 □ 占位、不翻译不概括不省略）。
- 局部：`crop` 传 0-1 比例四值（`{x,y,width,height}`）；小图标、细字、边框、像素级细节必须先 crop 或截局部放大再判，整屏结果不足以定论。（脚本层实际同时支持比例与像素：四值全 ≤1 按比例，否则按像素。）
- 多图：`images` 一次传，比逐张调用省时；提示词会自动加上「共 N 张图片，按顺序描述每张」。
- 缓存：键含图片内容哈希、prompt、mode、crop、模型名；同图同问返回 `cached=true`，换 prompt 或换模型都会重算。`noCache: true` 强制重查。
- 限制：单图 ≤20MB；长边超过 1568 自动缩放（`VISION_MAX_SIDE` 可调）；手机照片按 EXIF 自动纠正方向；需要预处理时统一转 PNG（带 alpha）。

**结果可信度（有争议时按此判）**

- 降级模型随配置变化：当前 `VISION_FALLBACK_MODEL=glm-4.1v-thinking-flash`；早期用过 `glm-4v-flash`（4K 上下文），实测出过错字（「视觉系统重建」→「视搜系统重建」）。OCR 结果必须回读核对，换过降级模型后尤其要重新验证。
- 视觉模型会幻觉出并不存在的细节：§12 实测整屏截图让小图标被报「有箭头」，像素级裁切放大后否证。**细节以可复核证据（代码 / 像素 / 放大图）为准，整屏识图不得当判决**；拿不准就 crop 重看一次，别拿一次描述去改代码。
- 免费模型按并发限流（不是每日额度），高峰会 429 并自动降级；降级只影响精度、不影响可用性，不要因一次 429 就判定插件故障。

**落盘例外**：本插件产物固定落在 `~/.dsh`，不受白皮书第⑥条「落 DSH 目录」约束——粘贴图与截图在 `~/.dsh/pasted-images/`，结果缓存在 `~/.dsh/vision-cache/`（`prepared/` 为缩放 / 裁切后的临时图）。清理缓存删 `vision-cache/` 即可，下次调用自动重建；`pasted-images/` 是用户粘贴与截图的产物，按需保留。

**配置**：`~/.dsh/vision.env`（或 `$DSH_HOME/vision.env`、`<cwd>/.dsh-vision.env`），每次调用实时读取，改完无需重启。Key 是敏感信息：不贴进对话、不写进交付包、不提交到任何仓库。

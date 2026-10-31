# dsh-vision（DSH 视觉系统）

把 DSH 的视觉链路从「三入口、两套配置、零条能通」重建为**一套**：一个插件、两个工具、一份配置。

## 能力

| 能力 | 说明 |
|---|---|
| `analyze_image` | 识图：单张 `image` / 多张 `images` 一次请求；`mode=ocr` 逐字识别；`crop` 只看局部（0-1 比例） |
| `screenshot` | 截当前 Windows 屏幕（整屏或 `region` 像素区域）落盘，随后交给 `analyze_image` |
| 📷 识图入口 | 输入框左侧按钮、拖拽、`Ctrl+V` 粘贴，图片落盘后路径写入输入框 |
| 图片压缩 | 长边超过 1568px 自动缩放（Pillow），省 token |
| 结果缓存 | 同图同问第二次直接返回缓存，不重复请求 API |
| 限流降级 | 主模型 429/限流时自动降级到 `glm-4v-flash` |

## 配置

创建 `$DSH_HOME/vision.env`（即 `C:\Users\<你>\.dsh\vision.env`）：

```env
VISION_PROVIDER=zhipu
VISION_API_KEY=你的智谱Key
VISION_MODEL=glm-4.6v-flash
VISION_FALLBACK_MODEL=glm-4v-flash
```

- 智谱 GLM-4.6V-Flash 免费，Key 在 https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys 获取
- 可选：`VISION_MAX_TOKENS`（默认 2048）、`VISION_MAX_SIDE`（默认 1568）、`VISION_CACHE=0` 关缓存、`VISION_THINKING=enabled|disabled`
- 配置每次调用实时读取，改完无需重启

## 安装（本机已按此装好）

1. profile `package.json`：`dependencies` 增 `"@local/dsh-vision": "link:F:/DSH/projects/DSH视觉系统重建"`；`dsh.profile.bundles` 增 `"@local/dsh-vision"`，并移除 `dsh-vision-tools` / `dsh-image-pathify`。
2. 在 profile 目录执行 `pnpm install --prefer-offline`。
3. **重启 DSH**（Host 半工具在启动时注册）。

## 数据落盘

- 粘贴图片：`$DSH_HOME/pasted-images/`
- 截图：`$DSH_HOME/pasted-images/screenshot-<时间戳>.png`
- 缓存：`$DSH_HOME/vision-cache/`（`prepared/` 下为缩放后的临时图）

## 技术要点

- 不 import `@deepseek-ai/*` 宿主模块：用 `ctx.tools.register` 原生 JSON Schema，避免模块双实例导致工具层崩溃。
- 图片预处理走 Python + Pillow（DSH 自带运行时），子进程用 `execFile` 直传参数、不经 shell。

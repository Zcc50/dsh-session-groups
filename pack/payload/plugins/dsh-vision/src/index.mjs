/**
 * dsh-vision — DSH 视觉系统（宿主半区）
 *
 * 一个插件取代 dsh-vision-tools + dsh-image-pathify：
 *   1. analyze_image 工具：调用 OpenAI 兼容视觉 API 理解本地图片 / 多张图片，
 *      内置图片压缩（长边 1568）、结果缓存、OCR 模式、区域裁切、多图批量；
 *      主模型（VISION_MODEL）被限流时自动降级到 VISION_FALLBACK_MODEL。
 *   2. screenshot 工具：截取当前屏幕（整屏或指定区域）落盘，供 analyze_image 读取，
 *      形成「改界面 → 截图 → 识图 → 修正」的 GUI 自检闭环。
 *   3. POST /api/vision-paste 路由：浏览器端粘贴/拖拽/选择图片落盘。
 *
 * 配置读取顺序（每次调用实时读取，改完无需重启）：
 *   1. $DSH_HOME/vision.env
 *   2. ~/.dsh/vision.env
 *   3. <cwd>/.dsh-vision.env
 *
 * 不 import 任何 @deepseek-ai/* 宿主模块：用 ctx.tools.register 的原生 JSON Schema
 * 注册，避免与宿主 @deepseek-ai/dsh-tools 形成模块双实例（双实例会导致工具层
 * scheduler.prepare 崩溃）。
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve as pathResolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

// ------------------------------------------------------------------ 常量

const PRESETS = {
  zhipu: {
    base: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4.6v-flash',
    fallback: 'glm-4v-flash',
  },
  dashscope: {
    base: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-vl-plus',
    fallback: 'qwen-vl-plus',
  },
  siliconflow: {
    base: 'https://api.siliconflow.cn/v1/chat/completions',
    model: 'Qwen/Qwen2.5-VL-7B-Instruct',
    fallback: 'Qwen/Qwen2.5-VL-7B-Instruct',
  },
  openai: {
    base: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    fallback: 'gpt-4o-mini',
  },
}

const MAX_BYTES = 20 * 1024 * 1024
const MAX_SIDE = 1568
const DEFAULT_PROMPT = '请详细描述这张图片的内容，包括其中可见的文字。'
const OCR_PROMPT =
  '请逐字识别图片中所有可见文字，保持原始排版顺序。表格用 Markdown 表格输出，代码用代码块输出。'
  + '不要翻译、不要概括、不要省略任何字符；无法辨认的字符用 □ 占位。'

// ------------------------------------------------------------------ 路径

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function pastedDir() {
  return join(dshHome(), 'pasted-images')
}

function cacheDir() {
  const custom = (process.env.VISION_CACHE_DIR || '').trim()
  return custom || join(dshHome(), 'vision-cache')
}

function preparedDir() {
  return join(cacheDir(), 'prepared')
}

// ------------------------------------------------------------------ 配置

function parseEnv(text) {
  const cfg = {}
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    let value = line.slice(eq + 1).trim()
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1)
    }
    cfg[line.slice(0, eq).trim()] = value
  }
  return cfg
}

function visionEnvHint() {
  return [
    '未找到视觉 API 配置文件。请创建 ' + join(dshHome(), 'vision.env') + '，内容格式：',
    'VISION_PROVIDER=zhipu',
    'VISION_API_KEY=你的智谱开放平台Key',
    '（智谱 GLM-4.6V-Flash 免费，Key 在 https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys 获取）',
  ].join('\n')
}

async function readConfig() {
  const candidates = [
    join(dshHome(), 'vision.env'),
    join(homedir(), '.dsh', 'vision.env'),
    join(process.cwd(), '.dsh-vision.env'),
  ]
  let text = null
  let found = null
  for (const candidate of candidates) {
    try {
      text = await readFile(candidate, 'utf8')
      found = candidate
      break
    } catch {
      // 试下一个候选
    }
  }
  if (text === null || found === null) throw new Error(visionEnvHint())

  const cfg = parseEnv(text)
  if (!cfg.VISION_API_KEY || !cfg.VISION_API_KEY.trim()) {
    throw new Error('配置文件 ' + found + ' 缺少 VISION_API_KEY=xxx\n' + visionEnvHint())
  }
  const provider = (cfg.VISION_PROVIDER || 'zhipu').trim()
  const preset = PRESETS[provider] || PRESETS.zhipu
  const thinking = (cfg.VISION_THINKING || '').trim()
  return {
    key: cfg.VISION_API_KEY.trim(),
    endpoint: (cfg.VISION_BASE_URL || preset.base).trim(),
    model: (cfg.VISION_MODEL || preset.model).trim(),
    fallbackModel: (cfg.VISION_FALLBACK_MODEL || preset.fallback).trim(),
    maxTokens: Math.max(0, Number.parseInt(cfg.VISION_MAX_TOKENS || '2048', 10) || 2048),
    thinking: thinking === 'enabled' || thinking === 'disabled' ? thinking : '',
    cacheEnabled: !/^(0|false|off|no)$/i.test((cfg.VISION_CACHE || '1').trim()),
    maxSide: Math.max(256, Number.parseInt(cfg.VISION_MAX_SIDE || String(MAX_SIDE), 10) || MAX_SIDE),
    provider,
    file: found,
  }
}

// ------------------------------------------------------------------ 图片

function mimeFor(path) {
  const ext = (String(path).split('.').pop() || '').toLowerCase()
  const map = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
    heic: 'image/heic', heif: 'image/heif', avif: 'image/avif',
  }
  return map[ext] || 'image/png'
}

/** 从文件头快速读图片尺寸；不认识的格式返回 null（交给 Python 处理）。 */
function imageSize(bytes) {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } // PNG
  }
  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) } // GIF
  }
  if (bytes.length >= 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return { width: Math.abs(bytes.readInt32LE(18)), height: Math.abs(bytes.readInt32LE(22)) } // BMP
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    // JPEG：扫 SOF 段
    let i = 2
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i += 1; continue }
      const marker = bytes[i + 1]
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: bytes.readUInt16BE(i + 7), height: bytes.readUInt16BE(i + 5) }
      }
      const len = bytes.readUInt16BE(i + 2)
      if (!Number.isFinite(len) || len < 2) break
      i += 2 + len
    }
    return null
  }
  return null
}

async function loadImageBytes(rawPath) {
  const candidates = [rawPath]
  if (!isAbsolute(rawPath)) candidates.unshift(pathResolve(process.cwd(), rawPath))
  let lastError = null
  for (const candidate of candidates) {
    try {
      const bytes = await readFile(candidate)
      if (bytes.byteLength > MAX_BYTES) {
        throw new Error('图片超过 20MB 上限：' + candidate)
      }
      return { bytes, path: candidate }
    } catch (error) {
      lastError = error
    }
  }
  throw new Error('无法读取图片文件 ' + rawPath + '：' + String((lastError && lastError.message) || lastError))
}

/** 定位 Python：环境变量优先，其次 DSH 自带运行时，最后 PATH 里的 python。 */
function resolvePython() {
  const explicit = (process.env.VISION_PYTHON || process.env.DSH_PYTHON || '').trim()
  if (explicit) return explicit
  const candidates = [
    join(homedir(), '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python', 'python.exe'),
    join(dshHome(), 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python', 'python.exe'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return 'python'
}

/**
 * 预处理单张图：需要缩放或裁切时调 Python + Pillow，否则原样返回。
 * 返回 { bytes, mime, path, transformed }。
 */
async function prepareImage(path, { maxSide, crop }) {
  const loaded = await loadImageBytes(path)
  const size = imageSize(loaded.bytes)
  const needResize = !size || Math.max(size.width, size.height) > maxSide
  if (!crop && !needResize) {
    return { bytes: loaded.bytes, mime: mimeFor(loaded.path), path: loaded.path, transformed: false }
  }

  const script = join(MODULE_DIR, '..', 'scripts', 'prepare_image.py')
  const hash = createHash('sha256').update(loaded.bytes).update(JSON.stringify({ maxSide, crop })).digest('hex').slice(0, 16)
  const outPath = join(preparedDir(), hash + '.png')
  await mkdir(preparedDir(), { recursive: true })

  const cropArg = crop ? [crop.x, crop.y, crop.width, crop.height].join(',') : ''
  let stdout = ''
  try {
    ({ stdout } = await execFileAsync(resolvePython(), [script, loaded.path, outPath, String(maxSide), cropArg], {
      windowsHide: true,
      timeout: 60000,
    }))
  } catch (error) {
    const detail = String((error && (error.stdout || error.message)) || error)
    throw new Error('图片预处理失败（需要 Python + Pillow）：' + detail)
  }
  let result
  try {
    result = JSON.parse(String(stdout).trim().split(/\r?\n/).pop() || '{}')
  } catch {
    throw new Error('图片预处理返回了无法解析的内容：' + String(stdout).slice(0, 300))
  }
  if (!result.ok) throw new Error('图片预处理失败：' + String(result.error || '未知错误'))
  return { bytes: await readFile(outPath), mime: 'image/png', path: outPath, transformed: true }
}

function toDataUrl(mime, bytes) {
  return 'data:' + mime + ';base64,' + Buffer.from(bytes).toString('base64')
}

// ------------------------------------------------------------------ 缓存

function cacheKey(parts) {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex')
}

async function readCache(key) {
  try {
    const raw = await readFile(join(cacheDir(), key + '.json'), 'utf8')
    const value = JSON.parse(raw)
    if (value && typeof value.text === 'string' && value.text.trim()) return value
  } catch {
    // 未命中
  }
  return null
}

async function writeCache(key, value) {
  try {
    await mkdir(cacheDir(), { recursive: true })
    await writeFile(join(cacheDir(), key + '.json'), JSON.stringify(value), 'utf8')
  } catch (error) {
    // 缓存写失败不影响主流程
    console.log('[dsh-vision] 缓存写入失败：' + String((error && error.message) || error))
  }
}

// ------------------------------------------------------------------ API

function isRateLimit(status, raw) {
  if (status === 429) return true
  const text = String(raw || '').toLowerCase()
  return /rate\s*limit|too many requests|overload|负载|繁忙|稍后重试|quota|配额|限流|频率|频繁|429/.test(text)
}

/**
 * 不同视觉模型的 max_tokens 上限不同：glm-4v-flash 上限 1024（超了返回 1210）。
 * 发送前按模型名钳制，避免降级到老模型时直接 400。
 */
function clampMaxTokens(model, wanted) {
  if (/glm-4v-flash/i.test(model)) return Math.min(wanted, 1024)
  return wanted
}

/**
 * 部分思考模型（如 glm-4.1v-thinking-flash）会把思考写进 content：
 * "<think>...</think><answer>...</answer>"。这里剥掉 think，有 answer 时只取 answer。
 */
function cleanVisionText(text) {
  if (typeof text !== 'string') return text
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const answer = out.match(/<answer>([\s\S]*?)<\/answer>/i)
  if (answer) out = answer[1].trim()
  return out
}

/**
 * 调视觉 API：主模型 → 限流时降级到 fallback 模型。
 * images: [{ mime, bytes }]
 */
async function callVisionApi(cfg, images, prompt, signal) {
  const models = [...new Set([cfg.model, cfg.fallbackModel].filter(Boolean))]
  let lastRateLimit = null

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]
    const content = []
    for (const image of images) {
      content.push({ type: 'image_url', image_url: { url: toDataUrl(image.mime, image.bytes) } })
    }
    content.push({ type: 'text', text: prompt })

    let maxTokens = clampMaxTokens(model, cfg.maxTokens)
    const makeBody = () => {
      const base = {
        model,
        messages: [{ role: 'user', content }],
        max_tokens: maxTokens,
      }
      // 思考开关只对主模型发送：降级模型（如 glm-4v-flash）不一定支持该参数，
      // 且降级时优先保证「能出结果」，不额外冒险。
      return index === 0 && cfg.thinking ? { ...base, thinking: { type: cfg.thinking } } : base
    }

    const post = async (body) => {
      try {
        return await fetch(cfg.endpoint, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        })
      } catch (error) {
        throw new Error('请求视觉 API 失败（' + cfg.provider + '）：' + String((error && error.message) || error))
      }
    }

    let withThinking = makeBody()
    let response = await post(withThinking)
    let raw = await response.text()

    // 模型不接受 thinking 参数（参数非法 / 调用方式不支持）→ 去掉它重试一次
    if (!response.ok && withThinking.thinking && /thinking|1214|1212/i.test(raw)) {
      withThinking = makeBody()
      delete withThinking.thinking
      response = await post(withThinking)
      raw = await response.text()
    }

    // max_tokens 超模型上限（1210）→ 压到 1024 重试一次
    if (!response.ok && /1210|max_tokens/i.test(raw) && maxTokens > 1024) {
      maxTokens = 1024
      response = await post(makeBody())
      raw = await response.text()
    }

    let rateLimited = !response.ok && isRateLimit(response.status, raw)
    if (!response.ok && !rateLimited) {
      throw new Error('视觉 API 报错 HTTP ' + response.status + '（' + cfg.provider + '）：' + raw.slice(0, 1200))
    }

    let data = null
    if (response.ok) {
      try {
        data = JSON.parse(raw)
      } catch {
        throw new Error('视觉 API 返回了无法解析的内容：' + raw.slice(0, 500))
      }
      if (data && data.error) {
        if (!isRateLimit(response.status, JSON.stringify(data.error))) {
          throw new Error('视觉 API 报错：' + JSON.stringify(data.error).slice(0, 800))
        }
        rateLimited = true
      }
    }

    if (rateLimited) {
      lastRateLimit = { status: response.status, body: raw.slice(0, 400) }
      if (index < models.length - 1) {
        console.log('[dsh-vision] ' + model + ' 被限流，自动降级到 ' + models[index + 1])
        continue
      }
      throw new Error('视觉 API 限流（' + cfg.provider + '）：所有模型均被限流：' + raw.slice(0, 400))
    }

    const choice = data && data.choices && data.choices[0]
    let text = choice && choice.message && choice.message.content
    if (Array.isArray(text)) text = text.map((part) => (part && typeof part.text === 'string' ? part.text : '')).join('')
    text = cleanVisionText(text)
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('视觉 API 未返回有效内容：' + JSON.stringify(data).slice(0, 500))
    }
    return { text: text.trim(), model }
  }
  throw new Error('视觉 API 限流（' + cfg.provider + '）：' + JSON.stringify(lastRateLimit))
}

// ------------------------------------------------------------------ 工具

const OUTPUT_SCHEMA = { type: 'object', properties: { text: { type: 'string' } } }

function renderText(_args, value) {
  const text = value && typeof value.text === 'string' ? value.text : ''
  return [{ type: 'text', text }]
}

function analyzeImageTool() {
  return {
    name: 'analyze_image',
    description:
      '用外部视觉模型理解本地图片（PNG/JPG/WebP/GIF 等）。当前主模型没有视觉能力，看图片、读截图、识别文字一律用本工具，不要用 read_image。'
      + '单张传 image，多张一起传 images（一次请求全部看懂，比逐张调用省时）。'
      + 'mode=ocr 是逐字识别模式（文字、表格、代码截图最准）；mode=describe 是画面描述。'
      + 'crop 可只看局部（值为 0-1 的比例坐标，如 {x:0.1,y:0.1,width:0.5,height:0.5}）。'
      + '同一张图同一问题重复调用会命中缓存、不再请求 API。',
    parameters: {
      type: 'object',
      properties: {
        image: { type: 'string', description: '单张图片路径（绝对路径、相对当前目录、file:// URL 或 http(s) URL）。' },
        images: { type: 'array', items: { type: 'string' }, description: '多张图片路径；与 image 二选一或并用，一次请求全部处理。' },
        prompt: { type: 'string', description: '对图片的提问；省略时用默认描述（OCR 模式自动用逐字识别提示词）。' },
        mode: { type: 'string', enum: ['describe', 'ocr'], description: 'describe=画面描述（默认）；ocr=逐字识别文字。' },
        crop: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
          },
          description: '可选：只看局部。四值均为 0-1 的比例，例如左上 50% 区域 = {x:0,y:0,width:0.5,height:0.5}。',
        },
        noCache: { type: 'boolean', description: '为 true 时跳过缓存、强制重新请求。' },
      },
    },
    output: { schema: OUTPUT_SCHEMA, render: renderText },
    timeoutMs: 180000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const cfg = await readConfig()

      const paths = []
      if (args && typeof args.image === 'string' && args.image.trim()) paths.push(args.image.trim())
      if (args && Array.isArray(args.images)) {
        for (const item of args.images) {
          if (typeof item === 'string' && item.trim()) paths.push(item.trim())
        }
      }
      if (paths.length === 0) throw new Error('analyze_image 需要 image 或 images 参数')

      const mode = args && args.mode === 'ocr' ? 'ocr' : 'describe'
      let prompt = (args && typeof args.prompt === 'string' && args.prompt.trim())
        ? args.prompt.trim()
        : mode === 'ocr' ? OCR_PROMPT : DEFAULT_PROMPT
      if (paths.length > 1) prompt = '共 ' + paths.length + ' 张图片，按顺序描述每张：\n' + prompt
      const crop = args && args.crop && typeof args.crop === 'object' ? args.crop : null

      const images = []
      for (const rawPath of paths) {
        images.push(await prepareImage(rawPath, { maxSide: cfg.maxSide, crop }))
      }

      let key = null
      if (cfg.cacheEnabled && !(args && args.noCache === true)) {
        key = cacheKey([
          ...images.map((image) => createHash('sha256').update(image.bytes).digest('hex')),
          prompt,
          mode,
          crop ? JSON.stringify(crop) : '',
          cfg.model,
        ])
        const hit = await readCache(key)
        if (hit) {
          return { text: hit.text, model: hit.model || cfg.model, cached: true }
        }
      }

      const signal = exec && exec.signal ? exec.signal : undefined
      const result = await callVisionApi(cfg, images, prompt, signal)

      if (key) {
        await writeCache(key, {
          text: result.text,
          model: result.model,
          files: images.map((image) => image.path),
          ts: Date.now(),
        })
      }
      return { text: result.text, model: result.model, cached: false }
    },
  }
}

function screenshotTool() {
  return {
    name: 'screenshot',
    description:
      '截取当前 Windows 屏幕并保存为 PNG，返回文件路径；随后用 analyze_image 看这张图。'
      + '不传 region 时截主屏整屏；传 region 只截指定像素区域。用于改完界面后自查效果。',
    parameters: {
      type: 'object',
      properties: {
        region: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
          },
          description: '可选：屏幕像素坐标与宽高；省略则截主屏整屏。',
        },
        savePath: { type: 'string', description: '可选：保存路径；省略时保存到 $DSH_HOME/pasted-images/screenshot-<时间戳>.png。' },
      },
    },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' }, path: { type: 'string' } } },
      render: renderText,
    },
    timeoutMs: 60000,
    isConcurrencySafe: () => false,
    async execute(args) {
      const dir = pastedDir()
      await mkdir(dir, { recursive: true })
      const outPath = (args && typeof args.savePath === 'string' && args.savePath.trim())
        ? pathResolve(args.savePath.trim())
        : join(dir, 'screenshot-' + Date.now() + '.png')
      const outDir = dirname(outPath)
      if (outDir && outDir !== '.') await mkdir(outDir, { recursive: true })

      const region = args && args.region && typeof args.region === 'object' ? args.region : null
      const regionExpr = region
        ? '[System.Drawing.Rectangle]::new(' + Math.round(Number(region.x) || 0) + ', ' + Math.round(Number(region.y) || 0)
          + ', ' + Math.max(1, Math.round(Number(region.width) || 1)) + ', ' + Math.max(1, Math.round(Number(region.height) || 1)) + ')'
        : '[System.Windows.Forms.Screen]::PrimaryScreen.Bounds'

      const escaped = outPath.replace(/'/g, "''")
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms',
        'Add-Type -AssemblyName System.Drawing',
        '$b = ' + regionExpr,
        '$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height',
        '$g = [System.Drawing.Graphics]::FromImage($bmp)',
        '$g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)',
        "$bmp.Save('" + escaped + "', [System.Drawing.Imaging.ImageFormat]::Png)",
        '$g.Dispose(); $bmp.Dispose()',
      ].join('; ')

      try {
        await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
          windowsHide: true,
          timeout: 30000,
        })
      } catch (error) {
        throw new Error('截屏失败：' + String((error && (error.stderr || error.message)) || error).slice(0, 600))
      }
      return { text: '截图已保存：' + outPath, path: outPath }
    },
  }
}

// -------------------------------------------------------------- 粘贴路由

async function registerPasteRoute(ctx) {
  const dir = pastedDir()
  ctx.webServer.register({
    kind: 'exact',
    path: '/api/vision-paste',
    handler: (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405)
        res.end()
        return
      }
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
        if (body.length > 40 * 1024 * 1024) req.destroy(new Error('payload too large'))
      })
      req.on('error', () => {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: '读取请求体失败' }))
      })
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body)
          const name = String((payload && payload.name) || 'pasted.png').replace(/[^\w.\-]/g, '_').slice(0, 60)
          const base64 = String((payload && payload.base64) || '')
          if (!base64) throw new Error('缺少图片数据')
          await mkdir(dir, { recursive: true })
          const abs = join(dir, Date.now() + '-' + name)
          await writeFile(abs, Buffer.from(base64, 'base64'))
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ path: abs }))
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: String((error && error.message) || error) }))
        }
      })
    },
  })
  console.log('[dsh-vision] 路由 /api/vision-paste 已注册（保存目录：' + dir + '）')
}

// ------------------------------------------------------------------ 插件

export default {
  name: 'dsh-vision',
  inject: ['tools', 'webServer'],
  apply(ctx) {
    ctx.effect(() => ctx.tools.register(analyzeImageTool()), 'dsh-vision: tool analyze_image')
    ctx.effect(() => ctx.tools.register(screenshotTool()), 'dsh-vision: tool screenshot')
    ctx.effect(() => registerPasteRoute(ctx), 'dsh-vision: route /api/vision-paste')
    console.log('[dsh-vision] analyze_image / screenshot 工具已注册')
  },
}

<#
.SYNOPSIS
  DSH 重修整合包 v2 · 逐项安装（Windows PowerShell 5.1 兼容）
.DESCRIPTION
  按 -Include 指定的项目逐项安装；每个项目都能单独装/不装。
  项目：workspace（工作区美化）/ tasklist（任务列表，含父子结构 + 完成区）/
        encoding（编码 P1）/ lsp（LSP + 审查 P2）/ vision（视觉）/ skin（皮肤）/ agents（白皮书）
  默认（不传 -Include）= workspace, tasklist, encoding, lsp, vision（不含皮肤与白皮书）。
.PARAMETER Include
  逗号分隔的项目列表，例如 "workspace,tasklist,encoding,lsp"。
.PARAMETER AgentsPolicy
  keep（默认，不动）/ overwrite（备份后覆盖）/ append（保留旧文件，只补缺失章节）。
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Include "workspace,tasklist,encoding"
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Include "skin,agents" -AgentsPolicy overwrite
#>
[CmdletBinding()]
param(
  [string]$ProfilePath = '',
  [string]$PluginsDir = '',
  [string[]]$Include = @(),
  [ValidateSet('keep', 'overwrite', 'append')]
  [string]$AgentsPolicy = 'keep',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$Script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$Script:PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Script:PayloadDir = Join-Path $Script:PackageRoot 'payload'
$Script:DshHome = Join-Path $env:USERPROFILE '.dsh'
$Script:Warnings = New-Object System.Collections.ArrayList

# ---------- 项目表 ----------
$LocalPlugins = @(
  @{ Item = 'workspace'; Name = '@local/dsh-workspace-frontend'; Dir = 'dsh-workspace-frontend'; Label = '工作区美化' },
  @{ Item = 'tasklist'; Name = '@local/dsh-task-list'; Dir = 'dsh-task-list'; Label = '任务列表（含父子结构/完成区）' },
  @{ Item = 'vision'; Name = 'dsh-vision'; Dir = 'dsh-vision'; Label = '视觉（识图/截图）' }
)
$VendorPkgs = @(
  @{ Item = 'encoding'; Name = 'dsh-fs-encoding'; Tgz = 'dsh-fs-encoding-1.5.2.tgz'; Label = '编码插件 P1' },
  @{ Item = 'lsp'; Name = 'dsh-lsp-actions'; Tgz = 'dsh-lsp-actions-0.5.17.tgz'; Label = 'LSP 动作 P2' },
  @{ Item = 'lsp'; Name = 'brooks-lint'; Tgz = 'brooks-lint-1.9.1.tgz'; Label = '代码审查 P2' },
  @{ Item = 'lsp'; Name = 'typescript'; Tgz = 'typescript-5.9.3.tgz'; Label = 'TypeScript 5.9.3（LSP 运行时）' },
  @{ Item = 'lsp'; Name = 'typescript-language-server'; Tgz = 'typescript-language-server-6.0.2.tgz'; Label = 'TS 语言服务器' },
  @{ Item = 'skin'; Name = 'dsh-claude-style'; Tgz = 'dsh-claude-style-0.19.5.tgz'; Label = '皮肤' }
)
$AllItems = @('workspace', 'tasklist', 'encoding', 'lsp', 'vision', 'skin', 'agents')
$DefaultItems = @('workspace', 'tasklist', 'encoding', 'lsp', 'vision')

function Write-Step([string]$t) { Write-Host ''; Write-Host "== $t" -ForegroundColor Cyan }
function Write-Info([string]$t) { Write-Host "   $t" }
function Write-Warn2([string]$t) { Write-Host "   [warn] $t" -ForegroundColor Yellow; [void]$Script:Warnings.Add($t) }

function Get-JsonFile([string]$Path) {
  $raw = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  if ($raw.Length -gt 0 -and $raw[0] -eq [char]0xFEFF) { $raw = $raw.Substring(1) }
  return ($raw | ConvertFrom-Json)
}
function Set-JsonFile([string]$Path, $Object) {
  $json = $Object | ConvertTo-Json -Depth 12
  [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, $Script:Utf8NoBom)
}
function Copy-Tree([string]$Source, [string]$Dest) {
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  $roboArgs = @($Source, $Dest, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1')
  & robocopy @roboArgs | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE): $Source -> $Dest" }
}
function Invoke-Pnpm([string[]]$PnpmArgs) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $Script:nodeExe $Script:pnpmCjs @PnpmArgs 2>&1 | ForEach-Object { Write-Host "   $_" }
    return $LASTEXITCODE
  }
  finally { $ErrorActionPreference = $old }
}

# ---- cordis.patch.yml 块操作 ----
function Split-PatchBlocks([string]$Text) {
  $result = [pscustomobject]@{ Preamble = (New-Object System.Collections.ArrayList); Blocks = (New-Object System.Collections.ArrayList) }
  $current = $null
  foreach ($line in ($Text -split "`r?`n")) {
    if ($line -match '^- id:\s*(\S+)\s*$') {
      if ($null -ne $current) { [void]$result.Blocks.Add($current) }
      $current = [pscustomobject]@{ Id = $Matches[1]; Lines = (New-Object System.Collections.ArrayList) }
      [void]$current.Lines.Add($line)
    }
    elseif ($null -eq $current) { [void]$result.Preamble.Add($line) }
    else { [void]$current.Lines.Add($line) }
  }
  if ($null -ne $current) { [void]$result.Blocks.Add($current) }
  return $result
}
function Join-PatchBlocks($Parsed) {
  $out = New-Object System.Collections.ArrayList
  foreach ($l in $Parsed.Preamble) { [void]$out.Add($l) }
  foreach ($b in $Parsed.Blocks) {
    foreach ($l in $b.Lines) { [void]$out.Add($l) }
    [void]$out.Add('')
  }
  return ((($out -join [Environment]::NewLine).TrimEnd()) + [Environment]::NewLine)
}
function Merge-PatchFile([string]$TargetPath, [string]$FragmentText, [string[]]$OnlyIds) {
  $frag = Split-PatchBlocks $FragmentText
  if ($OnlyIds.Count -gt 0) { $frag.Blocks = @($frag.Blocks | Where-Object { $OnlyIds -contains $_.Id }) }
  if ($frag.Blocks.Count -eq 0) { return @() }
  if (Test-Path $TargetPath) {
    $existing = Split-PatchBlocks ([System.IO.File]::ReadAllText($TargetPath, [System.Text.Encoding]::UTF8))
  }
  else {
    $existing = [pscustomobject]@{
      Preamble = [System.Collections.ArrayList]@(
        '# Your patch layer for this dsh profile, applied after every bundle layer:',
        '# a top-level YAML array of loader patch entries (id-targeted config',
        '# overrides, disables, and insert lists; `!!js` expressions allowed).'
      )
      Blocks   = (New-Object System.Collections.ArrayList)
    }
  }
  $changed = New-Object System.Collections.ArrayList
  foreach ($fb in $frag.Blocks) {
    $hit = $null
    foreach ($eb in $existing.Blocks) { if ($eb.Id -eq $fb.Id) { $hit = $eb; break } }
    if ($null -ne $hit) { $hit.Lines = $fb.Lines; [void]$changed.Add("replace:$($fb.Id)") }
    else { [void]$existing.Blocks.Add([pscustomobject]@{ Id = $fb.Id; Lines = $fb.Lines }); [void]$changed.Add("append:$($fb.Id)") }
  }
  [System.IO.File]::WriteAllText($TargetPath, (Join-PatchBlocks $existing), $Script:Utf8NoBom)
  return $changed
}

# ---- AGENTS.md ----
function Get-AgentsChapterHeads([string]$Text) {
  $heads = New-Object System.Collections.ArrayList
  foreach ($line in ($Text -split "`r?`n")) { if ($line -match '^##\s+(第[^\s]+条.*)$') { [void]$heads.Add($Matches[1].Trim()) } }
  return $heads
}
function Merge-AgentsAppend([string]$OldText, [string]$NewText) {
  $oldHeads = Get-AgentsChapterHeads $OldText
  $blocks = New-Object System.Collections.ArrayList
  $cur = $null
  foreach ($line in ($NewText -split "`r?`n")) {
    if ($line -match '^##\s+(第[^\s]+条.*)$') {
      if ($null -ne $cur) { [void]$blocks.Add($cur) }
      $cur = [pscustomobject]@{ Head = $Matches[1].Trim(); HeadLine = $line; Lines = (New-Object System.Collections.ArrayList) }
    }
    elseif ($null -ne $cur) { [void]$cur.Lines.Add($line) }
  }
  if ($null -ne $cur) { [void]$blocks.Add($cur) }
  $add = New-Object System.Collections.ArrayList
  $added = 0
  foreach ($b in $blocks) {
    if ($oldHeads -notcontains $b.Head) {
      [void]$add.Add(''); [void]$add.Add($b.HeadLine)
      foreach ($l in $b.Lines) { [void]$add.Add($l) }
      $added++
    }
  }
  if ($added -eq 0) { return $null }
  $merged = $OldText.TrimEnd() + [Environment]::NewLine + ($add -join [Environment]::NewLine) + [Environment]::NewLine
  return [pscustomobject]@{ Text = $merged; Added = $added }
}

# ================= 选项目 =================
if ($Include.Count -eq 0) { $Include = $DefaultItems }
$items = @()
foreach ($raw in $Include) {
  foreach ($piece in ([string]$raw -split '[,; ]')) {
    $k = $piece.Trim().ToLowerInvariant()
    if ($k -eq '') { continue }
    if ($AllItems -notcontains $k) { throw "未知项目: $k（可选: $($AllItems -join ', ')）" }
    if ($items -notcontains $k) { $items += $k }
  }
}
if ($items.Count -eq 0) { throw '没有选中任何项目。' }

Write-Host ''
Write-Host ("本次安装项目: {0}" -f ($items -join ', ')) -ForegroundColor Green

# ================= 1. profile =================
Write-Step '1/9 解析 profile'
$profilesRoot = Join-Path $Script:DshHome 'profiles'
if (-not (Test-Path $profilesRoot)) { throw "未找到 $profilesRoot —— 目标机需要先安装并启动一次 DSH。" }
if (-not $ProfilePath) {
  $ordered = @('desktop')
  foreach ($n in (Get-ChildItem $profilesRoot -Directory | Select-Object -ExpandProperty Name)) { if ($ordered -notcontains $n) { $ordered += $n } }
  foreach ($n in $ordered) { $cand = Join-Path $profilesRoot $n; if (Test-Path (Join-Path $cand 'package.json')) { $ProfilePath = $cand; break } }
}
if (-not $ProfilePath -or -not (Test-Path (Join-Path $ProfilePath 'package.json'))) {
  throw '未找到可用 profile（含 package.json）。请确认 DSH 已启动过一次，或用 -ProfilePath 指定。'
}
$ProfilePath = (Resolve-Path $ProfilePath).Path
Write-Info "profile: $ProfilePath"
if (-not $PluginsDir) { $PluginsDir = Join-Path $Script:DshHome 'plugins' }
if (-not $DryRun) { New-Item -ItemType Directory -Force -Path $PluginsDir | Out-Null }

# ================= 2. runtime =================
Write-Step '2/9 探测 DSH runtime 的 node / pnpm'
$Script:nodeExe = $null; $Script:pnpmCjs = $null
foreach ($rt in (Get-ChildItem (Join-Path $Script:DshHome 'dsh-runtimes') -Directory -ErrorAction SilentlyContinue)) {
  $n = Join-Path $rt.FullName 'dependencies\node\bin\node.exe'
  $p = Join-Path $rt.FullName 'dependencies\pnpm\bin\pnpm.cjs'
  if ((Test-Path $n) -and (Test-Path $p)) { $Script:nodeExe = $n; $Script:pnpmCjs = $p; break }
}
if (-not $Script:nodeExe) { throw '未找到 DSH runtime 的 node/pnpm（~/.dsh/dsh-runtimes/*/dependencies）。' }
Write-Info "node: $($Script:nodeExe)"

# ================= 3. 备份 =================
Write-Step '3/9 备份目标文件'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $Script:DshHome ("backup-重修-$stamp")
if (-not $DryRun) { New-Item -ItemType Directory -Force -Path $backupDir | Out-Null }
$pkgPath = Join-Path $ProfilePath 'package.json'
$patchPath = Join-Path $ProfilePath 'cordis.patch.yml'
$agentsPath = Join-Path $Script:DshHome 'AGENTS.md'
foreach ($f in @($pkgPath, $patchPath, $agentsPath)) {
  if (Test-Path $f) {
    if ($DryRun) { Write-Info "将备份 $f" }
    else { Copy-Item $f (Join-Path $backupDir ([System.IO.Path]::GetFileName($f))) -Force; Write-Info "已备份 $f" }
  }
}

# ================= 4. 自研插件 =================
Write-Step '4/9 同步选中的自研插件'
$selectedPlugins = @($LocalPlugins | Where-Object { $items -contains $_.Item })
foreach ($lp in $selectedPlugins) {
  $src = Join-Path (Join-Path $Script:PayloadDir 'plugins') $lp.Dir
  $dst = Join-Path $PluginsDir $lp.Dir
  if (-not (Test-Path (Join-Path $src 'package.json'))) { throw "包内缺少插件: $src" }
  if (Test-Path $dst) {
    if (-not $DryRun) { Copy-Tree $dst (Join-Path $backupDir ('plugins\' + $lp.Dir)) }
    Write-Info "覆盖已有目录（已备份）: $dst"
  }
  if (-not $DryRun) { Copy-Tree $src $dst }
  Write-Info "$($lp.Label) -> $dst"
}
if ($selectedPlugins.Count -eq 0) { Write-Info '（本次不装自研插件）' }

# ================= 5. vendor tgz =================
Write-Step '5/9 复制选中的离线 tgz'
$selectedVendor = @($VendorPkgs | Where-Object { $items -contains $_.Item })
$vendorDst = Join-Path $ProfilePath 'vendor'
if ($selectedVendor.Count -gt 0 -and -not $DryRun) { New-Item -ItemType Directory -Force -Path $vendorDst | Out-Null }
foreach ($v in $selectedVendor) {
  $src = Join-Path (Join-Path $Script:PayloadDir 'vendor') $v.Tgz
  if (-not (Test-Path $src)) { throw "包内缺少 tgz: $src" }
  if (-not $DryRun) { Copy-Item $src (Join-Path $vendorDst $v.Tgz) -Force }
  Write-Info "$($v.Label) -> vendor\$($v.Tgz)"
}
if ($selectedVendor.Count -eq 0) { Write-Info '（本次不装第三方 tgz）' }

# ================= 6. 依赖规格 =================
Write-Step '6/9 计算依赖规格'
$linkSpecs = @()
foreach ($lp in $selectedPlugins) {
  $dir = (Join-Path $PluginsDir $lp.Dir).Replace('\', '/')
  $linkSpecs += ('link:' + $dir)
}
$fileSpecs = @()
foreach ($v in $selectedVendor) { $fileSpecs += ('file:vendor/' + $v.Tgz) }
Write-Info ("link: " + ($linkSpecs -join ', '))
Write-Info ("file: " + ($fileSpecs -join ', '))

if ($DryRun) {
  Write-Host ''
  Write-Host 'DryRun 结束：以上为将执行的动作，未改动任何文件。' -ForegroundColor Green
  exit 0
}

# ================= 7. pnpm add =================
Write-Step '7/9 pnpm add（联网解析依赖）'
if (($linkSpecs.Count + $fileSpecs.Count) -gt 0) {
  $pkg = Get-JsonFile $pkgPath
  $stale = @()
  if ($null -ne $pkg.dependencies) {
    foreach ($prop in $pkg.dependencies.PSObject.Properties) {
      $spec = [string]$prop.Value
      if ($spec -like 'link:*') { $p = $spec.Substring(5); if (-not (Test-Path $p)) { $stale += $prop.Name } }
    }
  }
  if ($stale.Count -gt 0) {
    Write-Warn2 ("清理失效 link 依赖: " + ($stale -join ', '))
    [void](Invoke-Pnpm (@('-C', $ProfilePath, 'remove') + $stale))
  }
  $addArgs = @('-C', $ProfilePath, 'add', '--prefer-offline', '--ignore-scripts', '--config.confirmModulesPurge=false')
  $addArgs += $linkSpecs
  $addArgs += $fileSpecs
  $addCode = Invoke-Pnpm $addArgs
  if ($addCode -ne 0) { throw "pnpm add 失败（退出码 $addCode）。请确认网络后重跑。" }
}
else { Write-Info '（没有需要 pnpm 安装的包）' }

# ================= 8. bundles + patch =================
Write-Step '8/9 合并 bundles 与 cordis.patch.yml'
$need = @()
foreach ($lp in $selectedPlugins) { $need += $lp.Name }
foreach ($v in $selectedVendor) { $need += $v.Name }
$need = @($need | Select-Object -Unique)
if ($need.Count -gt 0) {
  $pkg = Get-JsonFile $pkgPath
  if ($null -eq $pkg.dsh) { $pkg | Add-Member -NotePropertyName dsh -NotePropertyValue ([pscustomobject]@{}) }
  if ($null -eq $pkg.dsh.profile) { $pkg.dsh | Add-Member -NotePropertyName profile -NotePropertyValue ([pscustomobject]@{}) }
  if ($null -eq $pkg.dsh.profile.bundles) { $pkg.dsh.profile | Add-Member -NotePropertyName bundles -NotePropertyValue @() }
  $bundles = @($pkg.dsh.profile.bundles)
  foreach ($b in $need) { if ($bundles -notcontains $b) { $bundles += $b } }
  $pkg.dsh.profile.bundles = $bundles
  Set-JsonFile $pkgPath $pkg
  Write-Info ("bundles: " + ($bundles -join ', '))
}

$wantPatch = @()
if ($items -contains 'tasklist') { $wantPatch += 'preset-standard' }
if ($items -contains 'lsp') { $wantPatch += 'lsp-actions' }
if ($items -contains 'skin') { $wantPatch += 'ui-skin-claude-style' }
$fragmentPath = Join-Path (Join-Path $Script:PayloadDir 'profile') 'cordis.patch.fragment.yml'
if ((Test-Path $fragmentPath) -and $wantPatch.Count -gt 0) {
  $fragText = [System.IO.File]::ReadAllText($fragmentPath, [System.Text.Encoding]::UTF8)
  $tlsCli = Join-Path $ProfilePath 'node_modules\typescript-language-server\lib\cli.mjs'
  $fragText = $fragText.Replace('__NODE__', $Script:nodeExe.Replace('\', '/'))
  $fragText = $fragText.Replace('__TLS_CLI__', $tlsCli.Replace('\', '/'))
  $changes = Merge-PatchFile $patchPath $fragText $wantPatch
  if ($changes.Count -eq 0) { Write-Info '配置已是最新，无改动' }
  foreach ($c in $changes) { Write-Info $c }
}
elseif ($wantPatch.Count -eq 0) { Write-Info '（本次不合并配置块）' }
else { Write-Warn2 '包内缺少 cordis.patch.fragment.yml，跳过配置合并' }

# ================= 9. 白皮书 =================
Write-Step '9/9 白皮书（AGENTS.md）'
if (($items -notcontains 'agents') -or $AgentsPolicy -eq 'keep') {
  Write-Info '本次不处理 AGENTS.md'
}
else {
  $newAgents = Join-Path $Script:PayloadDir 'AGENTS.md'
  if (-not (Test-Path $newAgents)) { Write-Warn2 '包内缺少 AGENTS.md' }
  else {
    $newText = [System.IO.File]::ReadAllText($newAgents, [System.Text.Encoding]::UTF8)
    if (Test-Path $agentsPath) {
      $oldText = [System.IO.File]::ReadAllText($agentsPath, [System.Text.Encoding]::UTF8)
      if ($AgentsPolicy -eq 'overwrite') {
        [System.IO.File]::WriteAllText($agentsPath, $newText, $Script:Utf8NoBom)
        Write-Info '已覆盖（旧文件已备份）'
      }
      else {
        $r = Merge-AgentsAppend $oldText $newText
        if ($null -ne $r) {
          [System.IO.File]::WriteAllText($agentsPath, $r.Text, $Script:Utf8NoBom)
          Write-Info "已追加 $($r.Added) 个缺失章节"
        }
        else { Write-Info '旧文件已包含全部章节，无需追加' }
      }
    }
    else {
      [System.IO.File]::WriteAllText($agentsPath, $newText, $Script:Utf8NoBom)
      Write-Info '目标机无 AGENTS.md，已新建'
    }
  }
}

# ================= 校验 =================
Write-Host ''
Write-Host '校验安装结果' -ForegroundColor Cyan
$pkg = Get-JsonFile $pkgPath
$depsNow = @()
if ($null -ne $pkg.dependencies) { $depsNow = $pkg.dependencies.PSObject.Properties.Name }
$bundlesNow = @()
if ($null -ne $pkg.dsh.profile.bundles) { $bundlesNow = @($pkg.dsh.profile.bundles) }
$missing = New-Object System.Collections.ArrayList
foreach ($n in $need) {
  if ($depsNow -notcontains $n) { [void]$missing.Add("dependency:$n") }
  if ($bundlesNow -notcontains $n) { [void]$missing.Add("bundle:$n") }
}
foreach ($lp in $selectedPlugins) { if (-not (Test-Path (Join-Path (Join-Path $ProfilePath 'node_modules') $lp.Name))) { [void]$missing.Add("node_modules:$($lp.Name)") } }
foreach ($v in $selectedVendor) { if (-not (Test-Path (Join-Path (Join-Path $ProfilePath 'node_modules') $v.Name))) { [void]$missing.Add("node_modules:$($v.Name)") } }
if ($missing.Count -gt 0) { Write-Warn2 ("校验缺项: " + ($missing -join ', ')) }
else { Write-Host '   [ok] 选中项目的依赖 / bundles / node_modules 全部就位' -ForegroundColor Green }

Write-Host ''
Write-Host '安装完成。' -ForegroundColor Green
Write-Host "本次项目: $($items -join ', ')"
Write-Host "备份目录: $backupDir"
if ($Warnings.Count -gt 0) { Write-Host '警告:' -ForegroundColor Yellow; foreach ($w in $Warnings) { Write-Host "  - $w" } }
Write-Host ''
Write-Host '下一步：完全退出并重启 DSH（含后台进程），再刷新页面。' -ForegroundColor Cyan
exit 0

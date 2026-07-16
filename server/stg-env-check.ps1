# STG 本地 HTTP 环境检测（可选）
# 不影响游戏工程本身；仅帮助未安装 Python/Node 的用户检测环境，并可选择用 winget 安装 Python 或打开官网下载页。
# 用法：在 server 目录右键「使用 PowerShell 运行」，或：
#   powershell -ExecutionPolicy Bypass -File "...\STGproj\server\stg-env-check.ps1"

$ErrorActionPreference = 'SilentlyContinue'

function Test-Cmd($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Get-PythonVersion {
    try {
        $v = & python --version 2>&1
        if ($LASTEXITCODE -eq 0 -or $v -match 'Python') { return "python -> $v" }
    } catch {}
    try {
        $v = & py -3 --version 2>&1
        if ($LASTEXITCODE -eq 0 -or $v -match 'Python') { return "py -3 -> $v" }
    } catch {}
    return $null
}

Write-Host "======== STG 环境检测 ========" -ForegroundColor Cyan
$pyInfo = Get-PythonVersion
if ($pyInfo) {
    Write-Host "[OK] 已检测到 Python：$pyInfo" -ForegroundColor Green
} else {
    Write-Host "[--] 未在 PATH 中找到 python / py -3" -ForegroundColor Yellow
}

if (Test-Cmd node) {
    try {
        $nv = & node --version 2>&1
        Write-Host "[OK] 已检测到 Node.js：node -> $nv" -ForegroundColor Green
    } catch {
        Write-Host "[OK] 已检测到 node 命令" -ForegroundColor Green
    }
} else {
    Write-Host "[--] 未在 PATH 中找到 node" -ForegroundColor Yellow
}

if ($pyInfo -or (Test-Cmd node)) {
    Write-Host ""
    Write-Host "本机已具备一键启动条件（Python 或 Node 其一即可）。可直接双击项目根目录的 一键启动STG.bat" -ForegroundColor Green
    Write-Host ""
    $open = Read-Host "是否打开游戏页说明文档 启动说明.md（需本机已关联编辑器）？[y/N]"
    if ($open -eq 'y' -or $open -eq 'Y') {
        $root = Split-Path -Parent $PSScriptRoot
        $md = Join-Path $root "启动说明.md"
        if (Test-Path $md) { Start-Process $md }
    }
    exit 0
}

Write-Host ""
Write-Host "未检测到 Python 与 Node，无法启动本地 HTTP 服务。" -ForegroundColor Red
Write-Host "推荐：安装 Python 3 并勾选 Add Python to PATH，或安装 Node.js LTS。" -ForegroundColor Yellow
Write-Host ""

$winget = Test-Cmd winget
if ($winget) {
    Write-Host "检测到本机有 winget，可用其安装官方 Python（需网络，可能弹出 UAC）。" -ForegroundColor Cyan
    $do = Read-Host "是否尝试执行：winget install -e --id Python.Python.3.12 ？[y/N]"
    if ($do -eq 'y' -or $do -eq 'Y') {
        Write-Host "正在调用 winget ..." -ForegroundColor Cyan
        & winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
        Write-Host "若安装完成，请关闭并重新打开命令行窗口，再运行一键启动。" -ForegroundColor Yellow
    }
} else {
    Write-Host "未检测到 winget（旧版 Windows 可能没有）。请手动打开下载页安装 Python。" -ForegroundColor Yellow
}

$openDl = Read-Host "是否在浏览器中打开 Python 官方 Windows 下载页？[Y/n]"
if ($openDl -ne 'n' -and $openDl -ne 'N') {
    Start-Process "https://www.python.org/downloads/windows/"
}

Write-Host ""
Write-Host "完成。安装后请重新打开终端，确认 python --version 可用，再双击 一键启动STG.bat" -ForegroundColor Green

# PowerShell脚本 - 启动HTTP服务器
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "正在启动HTTP服务器..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查Python是否安装
try {
    $pythonVersion = python --version 2>&1
    Write-Host "Python已安装: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "错误：未找到Python！" -ForegroundColor Red
    Write-Host "请先安装Python 3.x" -ForegroundColor Yellow
    Write-Host "下载地址：https://www.python.org/downloads/" -ForegroundColor Yellow
    Read-Host "按Enter键退出"
    exit 1
}

Write-Host ""
Write-Host "服务器启动后，请在浏览器访问：" -ForegroundColor Yellow
Write-Host "http://localhost:8765/game_demo/index.html" -ForegroundColor Cyan
Write-Host ""
Write-Host "按 Ctrl+C 可停止服务器" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 启动服务器（从server目录运行，会自动切换到项目根目录）
python server.py

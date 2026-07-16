#!/bin/bash
# macOS 一键启动：新开终端运行 server，并打开默认浏览器（需本机已安装 python3 或 node）
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"
SERVER_DIR="$ROOT/server"
URL="http://localhost:8765/game_demo/index.html"

if [[ ! -d "$SERVER_DIR" ]]; then
  echo "未找到 server 目录：$SERVER_DIR"
  read -r
  exit 1
fi

run_in_terminal () {
  local cmd="$1"
  osascript <<EOF
tell application "Terminal"
  do script "cd \"$SERVER_DIR\" && $cmd"
end tell
EOF
}

if command -v python3 &>/dev/null; then
  run_in_terminal "python3 server.py"
  sleep 2
  open "$URL"
  echo "已在「终端」中启动服务器，并已尝试打开浏览器。"
  echo "关闭运行 python3 的那个终端标签页即可停止服务。"
  exit 0
fi

if command -v python &>/dev/null; then
  run_in_terminal "python server.py"
  sleep 2
  open "$URL"
  echo "已在「终端」中启动服务器，并已尝试打开浏览器。"
  exit 0
fi

if command -v node &>/dev/null; then
  run_in_terminal "node server.js"
  sleep 2
  open "$URL"
  echo "已在「终端」中启动服务器，并已尝试打开浏览器。"
  exit 0
fi

echo "未找到 python3 / python / node，请先安装其一。详见 启动说明.md"
read -r
exit 1

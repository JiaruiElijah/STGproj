#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
简单的HTTP服务器，用于本地开发
运行此脚本后，访问 http://localhost:8765/game_demo/index.html
"""

import http.server
import socketserver
import os
import sys

# 设置端口
PORT = 8765

# 切换到项目根目录（如果脚本在server子文件夹中，需要切换到上级目录）
script_dir = os.path.dirname(os.path.abspath(__file__))
# 如果当前在server文件夹中，切换到项目根目录
if os.path.basename(script_dir) == 'server':
    project_root = os.path.dirname(script_dir)
    os.chdir(project_root)
    script_dir = project_root
else:
    os.chdir(script_dir)

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # 添加CORS头，允许跨域请求
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        # 设置JSON文件的Content-Type
        if self.path.endswith('.json'):
            self.send_header('Content-Type', 'application/json; charset=utf-8')
        super().end_headers()

    def log_message(self, format, *args):
        # 自定义日志格式
        print(f"[{self.log_date_time_string()}] {format % args}")

if __name__ == "__main__":
    try:
        with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
            print("=" * 60)
            print(f"HTTP服务器已启动！")
            print(f"访问地址: http://localhost:{PORT}/game_demo/index.html")
            print(f"项目根目录: {script_dir}")
            print("=" * 60)
            print("按 Ctrl+C 停止服务器")
            print("=" * 60)
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n服务器已停止")
        sys.exit(0)
    except OSError as e:
        if e.errno == 10048:  # Windows端口被占用
            print(f"错误：端口 {PORT} 已被占用")
            print(f"请关闭占用该端口的程序，或修改脚本中的PORT变量")
        else:
            print(f"错误：{e}")
        sys.exit(1)

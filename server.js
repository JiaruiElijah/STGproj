/**
 * 简单的HTTP服务器，用于本地开发
 * 运行: node server.js
 * 然后访问: http://localhost:8765/game_demo/index.html
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8765;
// 如果脚本在server子文件夹中，需要指向项目根目录
const ROOT_DIR = path.basename(__dirname) === 'server' 
    ? path.dirname(__dirname) 
    : __dirname;

// MIME类型映射
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    // 解析URL路径
    let filePath = path.join(ROOT_DIR, req.url === '/' ? '/game_demo/index.html' : req.url);
    
    // 安全检查：确保文件在项目目录内
    if (!filePath.startsWith(ROOT_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Forbidden');
        return;
    }

    // 获取文件扩展名
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // 读取文件
    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('404 Not Found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('500 Internal Server Error');
            }
            return;
        }

        // 设置响应头
        res.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log(`HTTP服务器已启动！`);
    console.log(`访问地址: http://localhost:${PORT}/game_demo/index.html`);
    console.log(`项目根目录: ${ROOT_DIR}`);
    console.log('='.repeat(60));
    console.log('按 Ctrl+C 停止服务器');
    console.log('='.repeat(60));
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`错误：端口 ${PORT} 已被占用`);
        console.error('请关闭占用该端口的程序，或修改脚本中的PORT变量');
    } else {
        console.error(`错误：${err.message}`);
    }
    process.exit(1);
});

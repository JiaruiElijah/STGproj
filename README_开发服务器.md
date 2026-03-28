# 开发服务器使用说明

## 为什么需要服务器？

由于浏览器的安全限制，直接打开HTML文件（`file://`协议）时无法使用`fetch`加载JSON文件。因此需要使用HTTP服务器来运行项目。

## 使用方法

### 方法一：Python服务器（推荐，最简单）

#### Windows系统（最简单的方式）

**方式A：双击启动脚本（推荐）**
1. 在项目文件夹中，进入 `server` 文件夹
2. 双击 `启动服务器.bat` 文件
3. 服务器会自动启动
4. 在浏览器访问：`http://localhost:8765/game_demo/index.html`

**方式B：使用命令行**

1. **打开命令提示符或PowerShell**：
   - 按 `Win + R`，输入 `cmd` 或 `powershell`，按回车
   - 或者在项目文件夹中，按住 `Shift` 键，右键点击空白处，选择"在此处打开PowerShell窗口"

2. **切换到项目目录**（如果不在项目目录）：
   ```bash
   cd D:\FebTDproject
   ```

3. **检查Python是否安装**：
   ```bash
   python --version
   ```
   如果显示版本号（如 `Python 3.11.0`），说明已安装
   如果提示"不是内部或外部命令"，需要先安装Python：
   - 下载地址：https://www.python.org/downloads/
   - 安装时勾选"Add Python to PATH"

4. **运行服务器**：
   ```bash
   cd server
   python server.py
   ```
   或如果 `python` 命令不行，尝试：
   ```bash
   cd server
   py server.py
   ```

5. **看到以下信息说明启动成功**：
   ```
   ============================================================
   HTTP服务器已启动！
   访问地址: http://localhost:8765/game_demo/index.html
   项目根目录: D:\FebTDproject
   ============================================================
   按 Ctrl+C 停止服务器
   ============================================================
   ```

6. **访问游戏**：
   打开浏览器，访问：`http://localhost:8765/game_demo/index.html`

7. **停止服务器**：
   在命令行窗口按 `Ctrl+C`，然后按 `Y` 确认

### 方法二：Node.js服务器

1. **确保已安装Node.js**

2. **运行服务器**：
   ```bash
   cd server
   node server.js
   ```

3. **访问游戏**：
   打开浏览器，访问：`http://localhost:8765/game_demo/index.html`

4. **停止服务器**：
   按 `Ctrl+C`

### 方法三：使用VS Code的Live Server扩展

1. 安装 **Live Server** 扩展
2. 右键点击 `game_demo/index.html`
3. 选择 "Open with Live Server"

### 方法四：使用其他HTTP服务器工具

- **http-server** (Node.js):
  ```bash
  npx http-server -p 8765
  ```

- **PHP内置服务器**:
  ```bash
  php -S localhost:8765
  ```

## 开发工作流

1. **启动服务器**：运行 `python server.py` 或 `node server.js`
2. **修改代码**：编辑 `game_demo/game.js` 或 `obj_list/tower.json`
3. **刷新浏览器**：查看更改效果
4. **更新JSON数据**：修改 `obj_list/tower.json` 后，刷新页面即可看到更新

## 优势

✅ **数据分离**：JSON数据与代码分离，便于维护  
✅ **实时更新**：修改JSON文件后刷新即可看到效果  
✅ **无需手动同步**：不需要手动将JSON数据复制到JS文件  
✅ **符合最佳实践**：使用标准的HTTP协议加载资源  

## 注意事项

- 服务器运行时，不要关闭终端窗口
- 如果端口被占用，可以修改脚本中的 `PORT` 变量
- 确保 `obj_list/tower.json` 文件存在且格式正确

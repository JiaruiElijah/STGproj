# 美术素材（game_demo 内副本）

当本地静态服务器**只开放 `game_demo` 文件夹**为网站根时，浏览器无法请求上一级的 `../art_assets`，因此在此目录保留与 `STGproj/art_assets` 同步的贴图副本。

新增敌弹图时：可放在本目录 `bullets/` 下，或与仓库根 `art_assets/bullets/` 保持一致并复制一份到此处。

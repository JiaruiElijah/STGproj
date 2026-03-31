# 美术素材目录（待接入游戏）

本目录用于**集中存放**后续替换进 STG 工程的美术图片（PNG / WebP / 序列帧等）。  
代码里尚未强制引用这些路径时，可先把成品按分类放好，接入时再在 `stgMode.js` / 资源加载处统一改路径。

## 子文件夹说明

| 文件夹 | 用途 |
|--------|------|
| `player/` | 自机机体、判定点示意、僚机/使魔等 |
| `enemies/` | 普通敌人、精英（按种类分子目录亦可） |
| `bullets/` | 自机弹、敌弹、激光条等（含不同样式子文件夹）；敌弹在怪物编辑器填「敌弹贴图」文件名（相对本目录） |

**与 `game_demo` 的关系**：若本地静态服务器**只把 `game_demo` 当网站根目录**，浏览器无法访问上一级的 `../art_assets`。请任选其一：① 把本目录下文件**再复制一份**到 `game_demo/art_assets/bullets/`；② 把服务器根目录设为 **`STGproj` 仓库根**再打开 `game_demo/index.html`。游戏内会**依次尝试** `game_demo/art_assets/bullets/` 与 `../art_assets/bullets/`。
| `effects/` | 爆炸、擦弹、受击、升级光效、弹道尾迹等 |
| `ui/` | 按钮、面板背景、图标、血条/经验条皮肤、三选一卡面等 |
| `backgrounds/` | 关卡背景、卷轴层、视差层 |
| `props/` | 场景道具（P 点、充能点等）、掉落物图标 |
| `common/` | 通用图素：粒子点、数字、占位图、九宫格边框等 |

## 命名建议

- 使用**小写 + 下划线**，如 `enemy_red_01.png`，避免空格与特殊符号。  
- 序列帧：`fx_explode_01.png` … `fx_explode_12.png` 或统一放在子目录 `fx_explode/`。  
- 同一角色多状态：`player_idle.png`、`player_focus.png`。

## 可选扩展

若体量变大，可在任一类下再建子目录（例如 `enemies/boss/`、`bullets/enemy/`）。

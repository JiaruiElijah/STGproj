# 开发记录

## [2026-03-27] STG：arc_edges 离场切线叠加强制水平外偏（避免贴左右缘滑移不出屏）

- **类型**：Bug 修复
- **涉及文件**：`game_demo/stgMode.js`（`blendArcBezierTangentWithOutward`；退化弧改为水平法向离场）、`game_demo/index.html` `?v=20260331v`
- **说明**：靠边终点处贝塞尔切线常近似竖直，仅 `arcExitVx` 过小或为向屏内时无法触发「完全离场」剔除；现对左/右终点列强制最小水平穿出分量后再归一化。

## [2026-03-27] STG：弧线起点=主棋盘第0行+阵型列；终点列自动左右靠边；仅编离场行

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`StgEnemy` 增加 `formationMainCol` 参数→`stgFormationMainCol`；`initStgEnemyArcEdgesApproach` 起点 `getMainGridCellCenter(col,0)`；`buildStgEnemyArcBezierMain` 按 `sx` 比较左右边缘列格心定 `endCol`；`stgArcExitRow` / 旧 `stgArcMainEndRow` 为靠边行）、`game_demo/monsterEditorPanel.js`（仅「靠边离场行」+ 弧高）、`game_demo/index.html` `?v=20260331u`
- **说明**：编辑器不再填起点/终点列；列由阵型与自动选边决定。

## [2026-03-27] STG：弧线改为「主棋盘起点格 → 主棋盘终点格」+ 接近段竖直/水平

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`getMainGridCellCenter` / `worldToMainGridCell`；`initStgEnemyArcEdgesApproach` + `buildStgEnemyArcBezierMain`；`arc_edges` 先 `approach_v`→`approach_h` 对齐起点格心再贝塞尔至终点格心；旧档无 `stgArcMain*` 时起点用出生附近主格、终点由旧离场格或 `stgArcEdge2*` 映射主格）、`game_demo/monsterEditorPanel.js`（主棋盘起点/终点四格索引 + 弧高）、`game_demo/index.html` `?v=20260331t`
- **说明**：弧不再以出生格为起点、不以延伸棋盘为终点；与上/左/右无关。

## [2026-03-27] STG：双边缘弧线改为「出生格 → 离场格」单弧 + 切线离场

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`initStgEnemyArcEdges`：`getExtendedGridCellCenter` + 离场格；单条二次贝塞尔；`updateStgEnemyPosition` 去掉第二段弧；旧档无离场格时仍用 `stgArcEdge2*` 归一化终点）、`game_demo/monsterEditorPanel.js`（离场棋盘/列/行、单弧高；选项文案「弧线至离场格后离场」）、`game_demo/index.html` `?v=20260331s`
- **说明**：出生位置由阵型摆放格心决定；离场格与阵型编辑器上/左/右棋盘索引一致；离场后沿终点切线方向。

## [2026-03-27] STG：擦弹成功渐隐显示擦弹范围（外椭圆环带）

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`stgGrazeRangeFlashes`、`drawStgGrazeRangeFlashes`、`updateStgGrazeRangeFlashes`；擦弹判定成功后入队；`resetRun` 清空）、`game_demo/index.html` `?v=20260331r`
- **说明**：约 0.56s 内青白径向渐变环带 + 外椭圆描边 + 内受击圆细描边，淡出曲线为平方；同屏最多 8 段避免叠层过重。

## [2026-03-27] STG：升级右下提示 + E 打开居中三选一并暂停

- **类型**：修改功能
- **涉及文件**：`game_demo/index.html`（`#stgLevelUpHint`、`#stgUpgradeModalRoot` 全屏遮罩；移除棋盘列内嵌 dock）、`game_demo/styles.css`（`.stg-level-up-hint`、`.stg-upgrade-modal-root` / backdrop / dialog）、`game_demo/stgMode.js`（`stgUpgradePending`、`prepareLevelUpChoices`、`openStgUpgradeModal`、`phase=levelup` 暂停 `update`、`KeyE`、结算时关弹层）、`game_demo/stgUiI18n.js`（`hint.controls`、`upgrade.subhint`、`levelUp.*`、`applyStgLevelUpHintLabels`）、`?v=20260331q`
- **说明**：升级仅先显示棋盘右下脉冲按钮；按 E 或点击后全屏居中三选一；叠级未处理仍先随机上一组。

## [2026-03-27] STG：三选一区域上移、单行紧凑三卡

- **类型**：修改功能
- **涉及文件**：`game_demo/index.html`（`stg-upgrade-dock` 置于 `stg-meta-panel` 之上；标题与副提示包在 `stg-upgrade-headline`）、`game_demo/styles.css`（dock 取消大占位、`grid` 三列、`#stgUpgradeOverlay` 下卡片/徽章/字号缩小）、`game_demo/stgMode.js`（`resizeCanvas` 按 dock + meta 计高，去掉对 hint 的重复累加）、`?v=20260331p`
- **说明**：升级面板紧贴棋盘下缘，波次/时间/说明在其下方；无升级时 dock 高度近 0，画布可更高。

## [2026-03-27] STG：道具 B 额外弹改为追踪 + 穿透 2 次

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`pushBullet` 区分 `fromSpreadExtra` 与道具 D；`getStgSpreadExtraOverride` 增加 `homingStr`/`pierceHits`）、`game_demo/stgUiI18n.js`（`UPGRADE_EN.spread_extra`）、`game_demo/stgBuildInventoryPanel.js`（构筑覆盖：`extraHomingStr`、`extraPierceHits`）、`新模式玩法开发/STG所有道具/新玩法--STG模式`、`game_demo/index.html` `?v=20260331o`
- **说明**：额外弹走与 D 独立的追踪强度；`pierceHits` 默认 3 表示可连续命中 3 名不同敌人（文档「穿透 2 次」）；仍吃齐射伤害与道具 G 暴击等。

## [2026-03-27] STG：基础属性「擦弹收益」+ 基础道具10（三选一）

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`bonusGrazeChargeMult`、`stgStatBonusDisplay.pct_graze`、`stat_graze`、`STG_UPGRADE_POOL`、`updateStgGrazeOrbs` 灌条叠乘）、`game_demo/game.js`（`STG_REIMU_ASIDE_PANEL` 插入 `pct_graze`）、`game_demo/stgUiI18n.js`（`UPGRADE_EN.stat_graze`）、`新模式玩法开发/STG所有道具/新玩法--STG模式`、`新模式玩法开发/STG基础属性/属性列表显示`、`game_demo/index.html` `?v=20260331n`
- **说明**：每次选基础道具10 展示 +10% 并与 `stat_regen` 同档 ×1.1 叠乘擦弹球转化为大招蓄能；右侧栏顺序为攻击力与射速之间的「擦弹收益加成」。

## [2026-03-27] STG：三选一移至棋盘下方、不暂停；1/2/3 选择；叠级未选则随机

- **类型**：修改功能
- **涉及文件**：`game_demo/index.html`（`#stgUpgradeDock` 嵌在 `stg-main` 内棋盘列下方）、`game_demo/styles.css`（`.stg-upgrade-dock` 固定占位、`stg-upgrade-panel` 非全屏）、`game_demo/stgMode.js`（`stgUpgradePickOpen` 取代 `phase=levelup`；`finalizeStgUpgradePick`/`forceRandomStgUpgradePick`；拾取经验叠级时先随机上一组；`Digit1–3`）、`game_demo/stgUiI18n.js`（`upgrade.subhint`、静态面板选择器）、`?v=20260331m`
- **说明**：下方占位 `min-height:188px` 避免显隐顶动棋盘；`resizeCanvas` 计入 dock 高度。

## [2026-03-27] STG：受伤后拉回开局位置并停滞（毫秒可编辑）

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`hitSpawnHoldMs`、`snapStgPlayerToSpawn`、`applyStgPlayerHitResponse`、`_stgSpawnX/Y`、`_stgHitHoldUntil`；`update` 停滞期禁止移动/Z/X/阴阳玉产球/炮台）、`game_demo/stgPlayerEditorPanel.js` + `index.html`（`stgPlayerEditHitSpawnHoldMs`）、`?v=20260331l`
- **说明**：出生点与 `buildPlayerFromHero` 一致；窗口 resize 时更新 `_stgSpawn*`；激光持续伤不触发本逻辑（仍不调 `applyStgPlayerHitResponse`）。

## [2026-03-27] STG：基础道具1 改为「+1 整格生命与上限」（对齐《新玩法--STG模式》）

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`stat_hp`：`stgLifeCellsMax`+1 封顶 30、当前半格+2；侧栏 `hpCellsStat` 显示「+N 格」）、`game_demo/game.js`（右侧列表首行 `hp_cells_stat`）、`game_demo/stgUiI18n.js`（英文 stat_hp 描述）、`新模式玩法开发/STG所有道具/新玩法--STG模式`（条目标注已完成）、`index.html` `?v=20260331k`
- **说明**：取代原 5% 格数成长与「生命值加成 +5%」展示。

## [2026-03-27] STG：怪物编辑器可选「机体接触伤害」；局内敌机身体碰撞自机

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`StgEnemy.stgContactDamagePlayer`、`getEnemyTypeMap` 合并存档；敌机循环后检测圆与判定点重叠，扣血规则同 `resolveStgBulletLifeDamageHalvesFromEnemy`）、`game_demo/monsterEditorPanel.js`（STG 区块「自机碰撞」勾选、`stgContactDamagePlayer` 存盘）、`game_demo/index.html`（`stgMode.js`/`monsterEditorPanel.js` `?v=20260331j`）
- **说明**：默认启用；关闭则仅弹幕/激光可伤玩家。一帧最多结算一次接触，避免多机叠放瞬秒。

## [2026-03-27] STG：左上角生命 HUD 改为「每格一格 + 半格填充」与数值文案

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`refreshStgLifeCellsHud` 按 `stgLifeCellsMax`/`stgLifeHalfUnitsRemain` 绘制；`updateHud` 不再对生命用 10 段比例条）、`game_demo/index.html`（`#stgPriorityHpCells` 空容器 + `#stgPriorityHpDetail`）、`game_demo/styles.css`（`stg-priority-cells--life`、半格样式、`stg-priority-hp-detail`）、`game_demo/stgUiI18n.js`（`hud.hpDetail`/`hud.hpAria`/`hud.hpAriaIdle`）、`?v=20260331i`
- **说明**：从左到右为满血侧先扣右侧空槽；每格可半格亮；副行显示「3.5 / 6 格」类文案。

## [2026-03-27] STG：自机生命改为「X 格 / 半格」；敌弹仅扣半格或整格

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`stgLifeCellsMax` / `stgLifeHalfUnitsRemain`、`syncStgPlayerLifeHpMirror` 镜像 `hp/maxHp`；敌弹 `lifeDmgHalves` 由敌机 `attack` 决定；激光/回复/stat_hp/封魔阵等按半格处理）、`game_demo/stgPlayerEditorPanel.js`（`lifeCellsMax` 替代 `maxHpBase`；旧档 `maxHpBase` 读入时粗算格数）、`game_demo/index.html`（表单项与 `?v=20260331h`）
- **说明**：HUD 生命条仍用 `hp/maxHp` 比例（半格总数）；编辑器默认 6 格；`attack>=2` 的敌机子弹扣 1 整格，否则扣半格。

## [2026-03-27] STG：玩家编辑器可调生命/无敌/消弹；受伤无敌并清弹幕

- **类型**：新增功能
- **涉及文件**：`game_demo/stgPlayerEditorPanel.js`（`maxHpBase`、`hitInvulnMs`、`hitBulletClearMs` 存盘）、`game_demo/stgMode.js`（`buildPlayerFromHero` 用 `maxHpBase`；`mergeStgPlayerEditorIntoPlayer` 同步生命与受伤参数；`isStgPlayerInvulnerable` / `applyStgPlayerHitResponse`；敌弹命中触发无敌+清弹；激光伤害尊重无敌；消弹窗口内每帧清空 `enemyBullets`；无敌时机体闪烁）、`game_demo/index.html`（三项表单项、`stgMode.js`/`stgPlayerEditorPanel.js` `?v=20260331g`）
- **说明**：基础生命再乘局外 `max_health_bonus`；无敌为 0 时仍可被连续命中；消弹为 0 时仅受伤当帧清空敌弹一次。

## [2026-03-27] STG：波次阵型编辑器支持在任意位置插入空波

- **类型**：新增功能
- **涉及文件**：`game_demo/stgWaveFormationPanel.js`（`insertEmptyWaveAt` / `insertWaveBeforeCurrent` / `insertWaveAfterCurrent`、`defaultNewWaveMeta`）、`game_demo/index.html`（「在此波前/后插入」按钮、说明文案、`stgWaveFormationPanel.js` `?v=20260331f`）
- **说明**：先选中某波，再点「前插入」或「后插入」即可在两波之间加入空三棋盘新波并自动选中新波；最后一波后点「后插入」等同原末尾追加。原单一「添加波次」已替换为上述两键。

## [2026-03-27] STG：棋盘四向各扩 2 格（16×21）

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`GRID_COLS`/`GRID_ROWS` 12×17→16×21）、`game_demo/stgWaveFormationPanel.js`（默认格数与 `getGridSize` 兜底一致）、`game_demo/index.html`（`#stgCanvas` 初始 720×945、停火行 `max=21`、`stgMode`/`stgWaveFormationPanel` `?v=20260331e`）
- **说明**：与主战场同格的阵型编辑器、扩展格坐标、网格绘制随常量自动扩展；旧存档阵型数组不足新格数时以空格补全。

## [2026-03-27] STG：怪物血量改「每波倍率」；全局随波次公式停用

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`getStgEnemyHpMultiplierForWaveIndex` 改为读 `waves[k].enemyHpMult`；`loadWaves` 的 `pack` 内 `attachLegacyEnemyHpMultIfMissing` 为旧档补字段）、`game_demo/stgWaveFormationPanel.js`（`waveMetaBuffers` 增加 `enemyHpMult`；读档时无字段则用旧全局系数按波次换算进缓冲）、`game_demo/index.html`（每波血量输入；全局三项隐藏保留兼容）、`?v=20260331d`
- **说明**：局内血量 = 怪物基础血 × 当前波 `enemyHpMult`（0.05～500）。旧存档未写 per-wave 时，加载时按原 `enemyHpScale` 公式填入内存，避免难度突变；保存波次后写入各波 `enemyHpMult`。

## [2026-03-27] STG：构筑面板扩散 A–H 可调核心数值（与局内逻辑同源）

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`getStgBuildOverride` 下新增 `getStgSpreadFan/Extra/Homing/Crit/Turret/Yinyang/BigP/BigEnergyOverride`，并在 `emitPlayerVolley`、阴阳玉产球与持续伤、伴身炮台、击杀大掉落等处接入）、`game_demo/stgBuildInventoryPanel.js`（`spread_fan`～`spread_big_energy` 展开表单）、`game_demo/index.html`（`stgMode.js` / `stgBuildInventoryPanel.js` `?v=20260331c`）
- **说明**：A 扇条数加成/扇角覆盖/齐射伤害倍率；B 额外弹概率、横向偏移与水平速度范围、伤害倍率；C 炮台伤害倍率与开火间隔；D 追踪伤害乘区与 homingStr；E 产球间隔、球寿命、上限、碰撞/视觉半径、持续伤比例；F/H 大掉落概率与经验倍率；G 扩散额外暴击概率。卡牌文案未强制同步（按用户可忽视部分描述）。

## [2026-03-27] STG：构筑面板道具 I 可调水晶伤害/弹速/枚数（描述联动）

- **类型**：新增功能
- **涉及文件**：`game_demo/stgBuildInventoryPanel.js`（`focus_crystal_base` 展开区增加 `crystalDamageMult`、`crystalBulletSpeedMult`、`crystalCountBase`、`crystalCountExtraWithK`；与 `stgMode.js` 中 `getStgCrystalGameplayOverride` 字段一致）、`game_demo/styles.css`（`.stg-build-inv-detail-subtitle`）、`game_demo/index.html`（`styles.css` / `stgMode.js` / `stgBuildInventoryPanel.js` `?v=20260331b`）
- **说明**：保存后写入 `stg_build_upgrade_overrides`；局内 `emitCrystalVolley` 与 `buildFocusCrystalBaseDescZh/En`、三选一 `getUpgradeDisplay` 已读同一套覆盖，枚数与文案同步。

## [2026-03-27] STG：局内构筑道具面板可展开编辑（水晶外观、狂怒数值）

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`stg_build_upgrade_overrides` 本地存储；`getStgCrystalVisualOverride` / `getStgRageEffectOverride`；水晶弹 `shape`/`crystalFill`/`radiusScale`；狂怒 `durationBase/Extra`、`bulletSpdPerStack`、`fireIvMultPerStack`；`mergeBuildUpgradeOverrides` 等 API）、`game_demo/stgBuildInventoryPanel.js`（每条条目展开、I/M 表单、保存合并）、`game_demo/styles.css`（`.stg-build-inv-item` / `.stg-build-inv-detail` 等）、`game_demo/index.html`（`?v=20260331a`）
- **说明**：道具 I 可调形状/颜色/半径倍率；道具 M 可调基础与 O 追加持续、每层弹速加成与射击间隔乘数；其余道具展开为占位说明。

## [2026-03-27] STG：慢速模式不再绘制擦弹外椭圆

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`draw` 中 Shift 慢速仅保留受击虚线圆+判定点；`tryStgGrazeEnemyBullet` 仍用椭圆判定）、`game_demo/index.html`（`?v=20260330i`）

## [2026-03-27] STG：狂怒左下角双格统一 😤

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（击杀进度格与层数格同用 😤）、`game_demo/index.html`（`?v=20260330h`）

## [2026-03-27] STG：左下角 buff 缩小；狂怒拆成击杀进度与层数/计时两格

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`S=36`/`gap=6`；`drawStgCornerRageKillProgressBuff` 仅再杀数+emoji；`drawStgCornerRageStackTimerBuff` 仅层数+逆时针弧，`stacks===0` 不画；圆角随 S 缩放）、`game_demo/index.html`（`stgMode.js` `?v=20260330g`）
- **说明**：两枚狂怒图标横向并排不重叠；层数为 0 时不显示计时格。

## [2026-03-27] STG：阴阳玉对齐策划（10s 一枚、3s 存在、挡弹）

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`STG_YINYANG_SPAWN_INTERVAL_MS=10000`、`STG_YINYANG_ORB_DURATION_MS=3000`、球体 `lifeMs` 到期移除；敌弹位移后与阴阳玉圆判重叠则 `alive=false`；敌激光段与球心到线段距离判相交则移除激光；绘制寿命衰减）、`game_demo/stgUiI18n.js`（`UPGRADE_EN.spread_yinyang`）、`game_demo/index.html`（`?v=20260330f`）
- **说明**：与 `新模式玩法开发/STG所有道具/新玩法--STG模式` 道具 E 更新一致；对敌仍为 50% 等效单发/秒持续伤。

## [2026-03-27] STG：棋盘左下角水晶/狂怒方形 buff HUD

- **类型**：新增功能 | 修改功能
- **涉及文件**：`game_demo/stgMode.js`（`STG_CRYSTAL_FOCUS_HITS_NEEDED` / `STG_RAGE_KILLS_PER_STACK` 与碰撞累计同源；`drawStgCornerFocusBuffHud` 及水晶/狂怒绘制；移除自机 `drawStgRageUnifiedRing`）、`game_demo/index.html`（`stgMode.js` `?v=20260330e`）
- **说明**：水晶分支显示「还需命中几次」；狂怒 0 层大号「还需击杀」；有层时「生效中」小字+层数+底部「再杀N」，当前段剩余时间用方形内圆上逆时针弧（不写秒）；仅 `phase===playing` 且对应 focus 分支+核心卡时绘制。

## [2026-03-27] STG：敌人血环（圆盘与 emoji 之间、逆时针扣血）

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`drawStgEnemyHpRing`；`draw` 中敌人绘制顺序：原色圆→描边→三角→血环→emoji）、`game_demo/index.html`（`stgMode.js` `?v=20260330d`）
- **说明**：底轨整圈半透明黑；剩余血量用绿色弧从 12 点起 `arc(..., true)` 逆时针铺满 `hp/maxHp`，受伤时弧沿逆时针方向缩短。

## [2026-03-27] STG：阴阳玉按《新玩法--STG模式》重做逻辑（非改策划文）

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（移除开火 20% 随机产球；`stgYinYangNextSpawnWallMs`+每 5 秒在扩散模式产一枚；圆形绕机；接触 DPS=扩散主武器等效单发×50%/秒；上限 12 球；`getStgSpreadMainVolleyDmgForYinYang`）、`game_demo/stgUiI18n.js`（`UPGRADE_EN.spread_yinyang`）、`game_demo/index.html`（`?v=20260330c`）
- **说明**：策划文档 `道具E` 要求「每 5 秒一枚、圆形绕机、碰到 50% 攻击力」；实现为持续重叠伤害（每秒 50% 等效单发），道具 D 追踪减伤不作用于阴阳玉。

## [2026-03-27] STG：局内构筑道具编辑器显示道具简介

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`getBuildUpgradeCatalog` 增加 `desc`）、`game_demo/stgBuildInventoryPanel.js`（每行下方展示简介块）、`game_demo/styles.css`（`.stg-build-inv-row-content` / `.stg-build-inv-line1` / `.stg-build-inv-desc`）、`game_demo/index.html`（`?v=20260330a`）
- **说明**：构筑列表与 `STG_UPGRADE_POOL` 同源，简介取自各条 `desc`，便于在勾选开局持有时辨认；无 `desc` 时不占行。

## [2026-03-29] STG：阴阳玉轨道+太极绘制；伴身炮台小炮塔美术

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（阴阳玉 `phaseRad/orbitR/orbitOmega` 绕自机椭圆公转；`drawStgYinYangSymbol`；伤害圈虚线提示；炮台发射点改为随 `radius` 缩放；`drawStgSideTurret`）、`game_demo/index.html`（`?v=20260329z`）
- **说明**：阴阳玉 DPS/半径略调；炮台仅在扩散（非 Shift）局内显示并指向最近敌。

## [2026-03-29] STG：狂怒弹速/射速加成对普通（扩散）主武器同样生效

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`emitPlayerVolley` 狂怒弹速改为 `!isSkill` + 狂怒分支；主武器开火间隔缩短去掉 `shiftHeld`）、`game_demo/index.html`（`?v=20260329y`）
- **说明**：叠层仍须在慢速下击杀累计；有层后 Z 不按 Shift 也吃射速与弹速倍率。大招弹幕仍不套用弹速狂怒段。

## [2026-03-29] STG：狂怒圆环内仅显示当前层数一个数字

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`drawStgRageUnifiedRing`）、`game_demo/index.html`（`?v=20260329x`）
- **说明**：不再竖排 1…N，环心只画 `stgRageStacks`。

## [2026-03-29] STG：狂怒改为单圆环 + 叠层整段刷新 CD + 到期自上而下掉层

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`stgRageEndMs` 单段；叠层 `stgRageStacks++` 并重算结束时刻；到期减一层后若仍有层则新开一段 CD；`drawStgRageUnifiedRing` 环内竖排 1…N）、`game_demo/index.html`（`?v=20260329w`）
- **说明**：与「共用一个圆、叠层重置前段 CD、从最高层一层层掉」一致；逆时针弧仍表示当前段剩余时间。

## [2026-03-29] STG：狂怒层数可视化（轨道圆环 + 序号 + 逆时针剩余弧）+ 每层独立倒计时

- **类型**：新增功能 | 修改功能
- **涉及文件**：`game_demo/stgMode.js`（`stgRageLayerEndMs` FIFO 替代单一 `stgRageEndMs`；`drawStgRageStackIndicators`；叠层 `push` 独立结束时刻）、`game_demo/index.html`（`?v=20260329v`）
- **说明**：每层在自机周围按上限槽位均分角度布置小圆环，环内数字为层序；高亮弧用 `arc(..., true)` 从 12 点逆时针缩短表示剩余时间。新叠层不再整段刷新旧层倒计时（与旧版「一加层全体重算 5s」不同），更贴合逐层消退表现。

## [2026-03-29] STG：撤销 1fr|auto|1fr 主行网格，恢复 flex 三栏（修复侧栏被压成细条）

- **类型**：Bug 修复 | 重构回退
- **涉及文件**：`game_demo/styles.css`（`.stg-body-row` / `.stg-left-column` / `.stg-center-column` / `.stg-player-aside` 恢复为原先 flex 布局；折叠侧栏恢复 `align-self: flex-start`）、`game_demo/index.html`（`?v=20260329u`）
- **说明**：网格在部分视口宽度下两侧 `1fr` 与 `minmax` 行为导致左右栏被挤成竖条；改回横向 flex + 固定侧栏 `flex-basis`，避免版面崩坏。

## [2026-03-29] STG：主布局改 1fr|auto|1fr 网格，棋盘不因侧栏折叠水平位移 + 垂直居中

- **类型**：修改功能
- **涉及文件**：`game_demo/styles.css`（`.stg-body-row` 用 `grid-template-columns: minmax(0,1fr) auto minmax(0,1fr)`；左 `justify-self:end`、中 `justify-self:center`、右 `justify-self:start`；`align-items:center`；窄屏仍用 flex 列）、`game_demo/index.html`（`?v=20260329t`）
- **说明**：原 flex + `justify-content:center` 在右侧宽度变化时整组重算，棋盘会左右跳；现中间列恒在容器水平几何中心，折叠属性栏仅改变两侧 1fr 留白。垂直方向在顶栏下剩余区域内三列对齐居中。

## [2026-03-29] STG：右侧「属性加成」面板隐藏/展开 + localStorage 记忆

- **类型**：新增功能
- **涉及文件**：`game_demo/index.html`（`#stgPlayerAside`、标题行「隐藏」、折叠态「显示属性」）、`game_demo/styles.css`（`.stg-player-aside--collapsed`、`.stg-aside-header-row`、竖排展开按钮）、`game_demo/game.js`（`stg_reimu_aside_collapsed`、`applyStgPlayerAsideCollapsed`、点击绑定、折叠后 `resize`）、`game_demo/stgUiI18n.js`（`aside.hideStats` / `aside.showStats` 等）、`?v=20260329s`
- **说明**：偏好存 `localStorage`；折叠后仅窄条竖字按钮，再点恢复；触发 `resize` 以便画布利用变宽区域。

## [2026-03-29] STG：攻击构筑四项统计增加可见短标签（攻击/攻速/弹速/暴击）

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`fillStgAttackStatGrid` 每格增加 `stg-attack-stat-label`）、`game_demo/stgUiI18n.js`（`attackBuild.statLabel.*` 中英）、`game_demo/styles.css`（`.stg-attack-stat-label`）、`game_demo/index.html`（`?v=20260329r`）
- **说明**：原先仅 emoji + 数值，中文名只在 `title`；现与「已选构筑」一致在格内显示短字，悬停仍用完整 `statTip`。

## [2026-03-29] STG：已选构筑「图标下小字」可见性（flex 对齐 + 字号对比 + 文案回退）

- **类型**：Bug 修复
- **涉及文件**：`game_demo/stgMode.js`（`fillStgAttackUpgradeIcons` 小字用 `shortLabel` 回退池内 `name`/`id`）、`game_demo/styles.css`（`.stg-attack-upgrade-icons` 改为 `align-items: flex-start`、名称区 10px/加粗/深色、`min-height`）、`game_demo/index.html`（`?v=20260329q`）
- **说明**：侧栏已选构筑每项本为「emoji 方块 + 下方名称」；原 `align-items: flex-end` 与 9px 浅字在窄栏中易被误认为只有图标。统一顶端对齐并略增大对比度，避免空串。

## [2026-03-29] STG：已选构筑标题修复 + 移除局外强化菜单 + 棋盘加宽加高

- **类型**：Bug 修复 | 修改功能
- **涉及文件**：`game_demo/stgMode.js`（`applyStgAttackUpgLabel` 不再用 📦 覆盖「已选构筑」；`resizeCanvas` 高度上限 800）、`game_demo/index.html`（删除「强化道具池」「玩家强化物品栏」按钮与对应弹窗 DOM；移除两脚本引用；`?v=20260329p`）、`game_demo/game.js`（去掉两面板 init）、`game_demo/styles.css`（`.stg-container` max-width 1180；`.stg-main` max-width 放宽）、已删除 `enhanceItemsEditorPanel.js`、`playerEnhanceInventoryPanel.js`
- **说明**：左侧第二栏曾始终显示 📦，因 `refreshStgAttackBuildPanel` 内错误地把三栏标签都写成 emoji。顶栏去掉两项后整体可更宽，画布单格上限略提高以放大棋盘。

## [2026-03-29] STG：棋盘裁切感修复 + 强缓存对策（resize 预留 HUD / server 禁缓存）

- **类型**：Bug 修复 | 修改功能
- **涉及文件**：`game_demo/stgMode.js`（`resizeCanvas` 按 `.stg-canvas-wrap` 与下方 `meta`+`hint` 测高；`rAF` 二次计算）、`game_demo/styles.css`（`.stg-main` 改为 `overflow: visible`）、`game_demo/index.html`（meta no-cache、`?v=20260329o`）、`server.py`（对 html/js/css 发 `Cache-Control: no-store`）
- **说明**：原 `window.innerHeight-168` 未给下方波次白条留足空间，画布易高于可视区；`overflow-x:hidden` 会使部分浏览器纵向表现为可裁切。

## [2026-03-29] STG：index 全量统一 `?v=20260329n` 避免缓存导致「修改不生效」

- **类型**：修改功能
- **涉及文件**：`game_demo/index.html`（所有 script + styles 同一版本号；注释提示 Ctrl+F5）
- **说明**：此前仅部分文件 bump，`stgUiI18n` 等与 `stgMode` 版本不一致时浏览器仍可能用旧脚本。

## [2026-03-29] STG：已选构筑标题改回文字 + 每项图标下小字名

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`fillStgAttackUpgradeIcons` 包一层 `stg-attack-up-item` + `stg-attack-up-name`）、`game_demo/styles.css`、`game_demo/index.html`、`?v=20260329m`
- **说明**：「已选构筑」不再用 📦；每条构筑在 emoji 下显示 `getUpgradeDisplay` 名称。

## [2026-03-29] STG：左侧攻击构筑排版（统计改图标横排）

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`fillStgAttackStatGrid`、`applyStgAttackUpgLabel`）、`game_demo/stgUiI18n.js`（`attackBuild.statTip.*`、`statGridAria`）、`game_demo/styles.css`（`.stg-attack-stat-grid`、左栏宽约 300px）、`game_demo/index.html`、`?v=20260329l`
- **说明**：四项数值改为 🗡️⚡💨💥 + 数字横排；「已选构筑」为 📦+悬停/读屏全文。

## [2026-03-29] STG：停火判定改为棋盘行号（enemyFireStopRow）

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`enemyFireStopRow` 1..GRID_ROWS；`rn * cellSize` 为几何停火线；旧 `enemyFireStopLineY` 迁移）、`game_demo/stgWaveFormationPanel.js`、`game_demo/index.html`、`?v=20260329k`
- **说明**：阵型编辑器改为填「第几行」停火，与棋盘对齐；窗口改变格高时行号不变则带型仍对齐。

## [2026-03-29] STG：敌弹入场前禁射 + 阵型编辑器停火线

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`stgHasEnteredPlayfield` 与 `enemyFireStopLineY` 共同门控战斗弹幕；连射余弹在越线时清空）、`game_demo/stgWaveFormationPanel.js`（`enemyFireStopLineY` 读写与 `tower_defense_wave_config`）、`game_demo/index.html`、`game_demo/styles.css`、`?v=20260329j`
- **说明**：停火线为画布坐标 Y（自上而下）；`stgEmitWhen === 'on_death'` 仍仅在阵亡时发射，不受停火线/入场限制。

## [2026-03-29] STG：局内构筑道具面板 + R/S 依赖 Q + 大招分支显示名

- **类型**：新增功能 | Bug 修复 | 修改功能
- **涉及文件**：`game_demo/stgMode.js`（`ult_seal_economy`/`ult_seal_heal` 增加 `requires: ult_seal_size`；`applyStgSavedBuildGrants` 读 `stg_build_inventory_granted`；`StgMode.getBuildUpgradeCatalog`）、`game_demo/stgBuildInventoryPanel.js`（新建）、`game_demo/stgUiI18n.js`（`attackBuild.ultNameSealUpgraded`；三选一顶栏 `upgrade.weapon.ultSeal` 改为强化封魔阵线）、`game_demo/index.html`、`game_demo/styles.css`（`.stg-build-inv-*`）、`game_demo/game.js`（`init`）、`?v=20260329i`
- **说明**：升级三选一不再在未选 Q 时抽到 R/S；侧栏大招标题在选 Q 后为「强化封魔阵（X）」，选 T 后为「梦想妙珠（X）」，否则「试做型封魔阵（X）」。顶栏「局内构筑道具」可勾选开局即持有的 STG 道具（互斥组与前置自动补全）。

## [2026-03-29] STG：擦弹外椭圆 + 慢速机体透明度可调 + 已擦弹敌弹透明度归场景道具

- **类型**：新增功能 | 修改功能
- **涉及文件**：`game_demo/stgMode.js`（椭圆擦弹 `getStgGrazeOuterEllipseRadii`；慢速显示外椭圆预览；`grazedBulletAlpha` 读场景配置）、`game_demo/stgPlayerEditorPanel.js`（`grazeEllipseHorizMult`/`grazeEllipseVertMult`/`focusShipAlpha`）、`game_demo/stgScenePropsEditorPanel.js`（`grazedBulletAlpha`）、`game_demo/index.html`、`?v=20260329h`
- **说明**：外椭圆 Rx/Ry = (受击+弹半径) + 环宽×水平/垂直倍率；左右可大于上下。

## [2026-03-29] STG：擦弹后敌弹半透明 + 慢速模式自机半透明突出判定点

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`_stgGrazed` 敌弹改用 `rgba` 填充；慢速下机体 `globalAlpha≈0.42`、判定点与受击圆全不透明略加强）、`game_demo/index.html`（`?v=20260329g`）
- **说明**：视觉层次：判定点 > 机体轮廓。

## [2026-03-29] STG：擦弹机制（敌弹每弹一次、小白球吸附灌大招蓄能 + 玩家编辑器参数）

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`enemyBullets` 增加 `_stgGrazed`；`getStgGrazeRuntimeParams`/`tryStgGrazeEnemyBullet`/`updateStgGrazeOrbs`/`stgGrazeOrbs`；`mergeStgPlayerEditorIntoPlayer` 擦弹字段）、`game_demo/stgPlayerEditorPanel.js`（`DEFAULTS` 与 `fillInputs`/`readApplyObject`）、`game_demo/index.html`（擦弹折叠区块）、`game_demo/stgUiI18n.js`（顶栏说明）、`?v=20260329f`
- **说明**：判定点外环（受击圆+敌弹半径外侧、可配置宽度）内且本帧敌弹有位移时触发；蓄能收益与充能点同乘 `bonusUltChargeMult`；绘制白球光晕。

## [2026-03-29] STG：修复「击杀掉落充能点」不生效 — getEnemyTypeMap 合并遗漏字段

- **类型**：Bug 修复
- **涉及文件**：`game_demo/stgMode.js`（`getEnemyTypeMap` 写入 `stgDropChargePickup`/`stgChargeDropMult`；`pushStgChargePickupOnEnemyKillIfConfigured`；大招 DoT / 阴阳玉击杀与子弹击杀共用）
- **说明**：怪物编辑器已保存勾选，但 `getEnemyTypeMap` 输出对象未带上该字段，导致 `StgEnemy` 上恒为 false。已补合并；非 Z 弹击杀路径同样补掉充能点。

## [2026-03-29] STG：场景道具编辑器 — P 点 / 充能点 分轨（形状、大小、轨迹与速率）

- **类型**：新增功能 | 修改功能
- **涉及文件**：`game_demo/stgMode.js`（`getStgScenePropsDefaults`、`normalizeScenePropsConfig`、`buildPickupMotionFromScene` 按 `p`/`c` 前缀；拾取半径与绘制按 `pickupRadius`/`shape`/`sizePx`；大 P/大能量略放大半径）、`game_demo/stgScenePropsEditorPanel.js`（双套表单项与 `normalizeEditorCfg`）、`game_demo/index.html`（面板分区）、`game_demo/styles.css`（`.stg-scene-props-kind-section`）、`?v=20260329d`
- **说明**：旧存档无 `c*` 时运行时与编辑器均将充能点轨迹参数镜像自 P 点，避免手感突变；充能点默认方形、可改圆/菱。应用后仅新产生的掉落生效。

## [2026-03-28] STG：文档封魔阵/妙珠逻辑 + 伏魔针淡粉 UI + 封魔阵结界改绿色绘制

- **类型**：修改功能 | 文档
- **涉及文件**：`新模式玩法开发/STG所有道具/新玩法--STG模式`（分支互斥、Q/S/R 与 T/U/V 前置、竖屏「前方」= 上、妙珠向上与消弹伤害）、`game_demo/styles.css`（伏魔针分区与水晶三选一/顶栏改为淡粉系）、`game_demo/stgMode.js`（试做型封魔阵结界描边/填充与侧栏绿色一致）、`game_demo/index.html`（`?v=20260328c`）
- **说明**：文档与 `stgMode.js` 行为对齐；伏魔针不再使用史诗紫；局内封魔阵圆环由紫改绿以免与妙珠/伏魔针混淆。

## [2026-03-28] STG：充能点掉落 + 大招仅由充能点蓄能 + 左侧优先 HUD（生命/经验/大招格）

- **类型**：新增功能 | 修改功能
- **涉及文件**：`game_demo/stgMode.js`（`createPickupChargeAtKill`、`pickupKind: 'charge'`、`stgDropChargePickup`/`stgChargeDropMult`、拾取分流：P 点只加经验、充能点只灌 `stgUltChargeMeter`；`STG_PRIORITY_SEGMENTS` 与 `refreshStgPrioritySegmentRow`）、`game_demo/index.html`（`stg-left-column` 顶部 `stgPriorityHud`；画布下 HUD 去掉 HP/EXP/大招条；场景道具编辑器充能点基础价值）、`game_demo/styles.css`（`.stg-priority-*`、移除画布侧重复 `.stg-hud-ult-wrap`）、`game_demo/stgScenePropsEditorPanel.js`（`chargePointValue`）、`game_demo/monsterEditorPanel.js`（击杀掉落充能点开关与倍率）、`game_demo/stgUiI18n.js`（`hud.hpLabel`/`expLabel`、`hint.controls`）
- **说明**：怪物编辑器按种类配置击杀是否额外掉落充能点及倍率；场景道具编辑器配置单颗充能点基础蓄能值；局内充能点与 P 点共用轨迹绘制为方形「充」字。生命、经验、大招五格统一置于左侧最上方分段条。

## [2026-03-27] STG：大招五格充能 + 玩家编辑器初始格数 + 界面（X）提示

- **类型**：新增功能 | 修改功能
- **涉及文件**：`game_demo/stgMode.js`（`stgUltCharges`/`stgUltChargeMeter`、拾取 P 点蓄能、按 X 消耗一格、`mergeStgPlayerEditorIntoPlayer` 读 `ultInitialCharges`）、`game_demo/stgPlayerEditorPanel.js`（`ultInitialCharges` 存读）、`game_demo/index.html`（HUD 五格、`?v=20260327k`）、`game_demo/styles.css`（`.stg-hud-ult-*`）、`game_demo/stgUiI18n.js`（`hud.ultLabel`、`attackBuild.ultHeadingNeutral` 等）、`新模式玩法开发/STG所有道具/新玩法--STG模式`（充能说明）
- **说明**：默认 5 格上限；每格需蓄满阈值（基准 100÷`bonusUltChargeMult`，大能量点拾取有加成）；基础道具 9 加快蓄满；侧栏与攻击构筑标题显示「（X）」。

## [2026-03-27] STG：试做型封魔阵改为默认大招（移出升级池）

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（从 `STG_UPGRADE_POOL` 移除 `ult_seal_base`；Q–S 取消对 base 的 `requires`；未选妙珠分支时按 X 始终 `activateStgUltSeal`）、`game_demo/stgUiI18n.js`（顶栏说明、`UPGRADE_EN` 去掉 `ult_seal_base`）、`game_demo/index.html`（玩家编辑器大招说明、静态提示、`?v=20260327j`）、`新模式玩法开发/STG所有道具/新玩法--STG模式`（明确默认自带与 Q–V 为分支强化）
- **说明**：与文档一致：试做型封魔阵非三选一卡牌；升级池仅含 Q–S / T–V；选 T 后 X 改为梦想妙珠。

## [2026-03-27] STG：攻击构筑三色分区 + 未选大招仅「试做」+ 三选一配色强化

- **类型**：修改功能
- **涉及文件**：`game_demo/stgUiI18n.js`（`attackBuild.ultHeadingNeutral`）、`game_demo/stgMode.js`（大招标题、`data-stg-ult-variant`、构筑图标按 `group` 上色）、`game_demo/styles.css`（扩散蓝 / 伏魔针紫 / 大招绿或妙珠紫；三选一卡与顶栏同色）、`game_demo/index.html`（静态默认与 `?v=20260327i`）
- **说明**：未选 Q/T 时侧栏大招仅显示试做型封魔阵；选妙珠后大招区块与梦想妙珠卡统一为紫红色系，封魔阵为绿色系；左侧已选构筑 emoji 与对应体系统色。

## [2026-03-27] STG：攻击构筑大招标题 — 不再显示「未解锁」

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`refreshStgAttackBuildPanel`）、`game_demo/stgUiI18n.js`（移除 `attackBuild.ultLocked`）、`game_demo/styles.css`（大招标题统一绿色）、`game_demo/index.html`（静态默认与 `?v=20260327h`）
- **说明**：未选 Q/T 分支时仍显示 `attackBuild.ultHeading`（试做型封魔阵 / 梦想妙珠）；选中后显示对应单招式名。

## [2026-03-27] STG：玩家编辑器滚动 + 试做型封魔阵文案与道具 R（消弹转 P）

- **类型**：Bug 修复 | 修改功能 | 新增功能
- **涉及文件**：`game_demo/styles.css`（`#stgPlayerEditorPanel` 内层 flex 与宽度合并、中间区滚动/底栏固定）、`game_demo/stgMode.js`（`STG_UPGRADE_POOL` 大招命名与 Q–V 描述；新增 `ult_seal_economy`；封魔阵消弹生成 P 点、道具 R 转化倍率与阵内移速）、`game_demo/stgUiI18n.js`（试做型封魔阵/英文 Seal Prototype、`UPGRADE_EN`）、`game_demo/index.html`（顶栏提示、`?v=20260327g`）、`新模式玩法开发/STG所有道具/新玩法--STG模式`（大招段落已完成标记）
- **说明**：武器编辑器面板中间表单可滚动、底部按钮不裁切；与文档一致将大招称为试做型封魔阵，并补齐道具 R 的局内效果（与 Q/S 并存三选一）。

## [2026-03-27] STG：攻击构筑左侧大招标题 — 未解锁 / 封魔阵 / 梦想妙珠

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`refreshStgAttackBuildPanel` 依 `stgUltBranch` 设标题）、`game_demo/stgUiI18n.js`（`attackBuild.ultLocked` / `ultNameSeal` / `ultNameDream`）、`game_demo/styles.css`（`.stg-attack-ult--locked`）、`game_demo/index.html`（默认「未解锁」）、`?v=20260327f`
- **说明**：未选 Q/T 分支或未开局时显示「未解锁」；选后仅显示对应大招名。

## [2026-03-27] STG：攻击构筑与三选一命名（博丽御符/伏魔针等）+ 武器顶栏

- **类型**：修改功能
- **涉及文件**：`game_demo/stgUiI18n.js`（`attackBuild.*` 标题、`upgrade.weapon.*`、`getUpgradeWeaponBadge`）、`game_demo/stgMode.js`（`createStgUpgradeChoiceButton`、`refreshStgUiLanguageFromI18n` 复用）、`game_demo/styles.css`（三列网格、分色顶栏与边框）、`game_demo/index.html`（静态标题）、`新模式玩法开发/STG所有道具/新玩法--STG模式`（完成说明）、`?v=`
- **说明**：文档为「博丽御符」「伏魔针」；三选一每张卡顶栏显示所属武器体系并高亮；宽屏 `auto-fit` 网格排版。`?v=20260327e`

## [2026-03-27] STG：波次阵型编辑器 — 怪物血量随波次增长（可编辑系数）

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`enemyHpScale`、`getStgEnemyHpMultiplierForWaveIndex`、`spawnEnemyFromRaw` 乘算血量；`loadWaves` 读档）、`game_demo/stgWaveFormationPanel.js`（`loadWaveConfigFromStorage` / `saveWaveConfigToStorage` 写入 `tower_defense_wave_config`）、`game_demo/index.html`（三块说明下新增全局系数表单）、`game_demo/styles.css`（`.stg-formation-hp-scale-*`）、`game_demo/waveConfig.json`（示例 `enemyHpScale`）、`?v=20260327d`
- **说明**：倍率 = `baseMult + k*linearPerWave + k²*accelPerWaveSq`（k 为当前波次索引，第 1 波 k=0）。与怪物编辑器 `defaultHealth` 相乘后取整。旧存档无 `enemyHpScale` 时等价 1/0/0。

## [2026-03-27] STG：P 点弧线「曲线速率」区分先慢后快 / 先快后慢

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`normalizeArcUpSpeedMode` / `normalizeArcDownSpeedMode`；上抛 `ease_in`/`ease_out`/`ease_in_out`；下落 `ease_in`/`ease_out`；`stgPickupOnArcUpFinished`）、`game_demo/stgScenePropsEditorPanel.js`（读存与默认）、`game_demo/index.html`（下拉与说明、`?v=20260327c`）
- **说明**：旧存档 `curve` 上抛映射为 `ease_in_out`（原 smoothstep），下落映射为 `ease_in`（原先慢后快）。上抛第四项为「两端慢·中间快」。

## [2026-03-27] STG：场景道具编辑器底部按钮可见 + 扩散构筑侧栏排版

- **类型**：Bug 修复 | 修改功能
- **涉及文件**：`game_demo/index.html`（场景道具面板中间区包 `stg-scene-props-editor-body`、子区块类名、应用按钮主色）、`game_demo/styles.css`（面板 flex 分栏、可滚动主体、固定操作栏；左侧攻击构筑加宽至 276px、三段卡片式区块、扩散段强调色）
- **说明**：`wave-config-panel-inner` 的 `max-height` + `overflow:hidden` 曾裁切底部「应用」；现仅中间表单滚动，按钮区 `flex-shrink:0`。左侧「扩散攻击」与其它两段区分更清晰。

## [2026-03-27] STG：玩家编辑器加宽折叠 + 等级经验槽三参数

- **类型**：新增功能 | 修改功能
- **涉及文件**：`game_demo/index.html`（`#stgPlayerEditorPanel` 分区 `<details>`、等级经验三项输入）、`game_demo/styles.css`（面板 720px、滚动高度、`.stg-player-editor-section-details`）、`game_demo/stgPlayerEditorPanel.js`（`expBase` / `expLinearPerLevel` / `expAccelPerLevelSq` 存读）、`game_demo/stgMode.js`（`getStgExpFormulaParams`、`computeExpToNextForLevel`；`resetRun`/拾取升级/应用编辑器时同步 `expToNext`）、`?v=20260327a`
- **说明**：升级所需经验 = floor(基础 + (L−1)×线性 + (L−1)²×加速)；加速为 0 时与旧版 `100+(L−1)*40` 一致。武器三段默认折叠，移动与等级默认展开。

## [2026-03-29] 场景道具：P 点弧线 上抛/下落 匀速或曲线

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`pArcUpSpeedMode` / `pArcDownSpeedMode`；弧线上抛 curve=smoothstep、下落 curve=速度渐近）、`game_demo/stgScenePropsEditorPanel.js`（读存与默认）、`game_demo/index.html`（两下拉与说明、`?v=20260329h`）
- **说明**：旧存档无新字段的空中 P 点仍按 vy 正负旧逻辑；新掉落带完整字段。

## [2026-03-29] STG：道具A–P 局内效果实现

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（A 扇形+2、B 额外弹、D 追踪−40%伤+转向、E 阴阳玉范围伤、F/H 大P/大能量掉落、G 扩散额外暴击率、C 伴身炮台、I 集中命中30次水晶齐射+J/K/L、M–P 狂怒层数/射速弹速/持续/上限/虚弱；`新模式玩法开发/STG所有道具/新玩法--STG模式`（道具I 行标注））、`?v=20260329g`
- **说明**：阴阳玉跟随自机；狂怒仅慢速击杀计数；虚弱需狂怒≥5 层。

## [2026-03-29] STG：属性加成列表对齐《属性列表显示》6 项

- **类型**：修改功能
- **涉及文件**：`game_demo/game.js`（`STG_REIMU_ASIDE_PANEL` 仅 6 行文案）、`game_demo/stgMode.js`（`stgStatBonusDisplay` 去掉 P 点/充能显示项；`stat_exp`/`stat_ult_charge` 仍叠乘局内数值）、`新模式玩法开发/STG基础属性/属性列表显示`（完成说明）、`?v=20260329f`
- **说明**：与 `STG基础属性/属性列表显示` 一致；基础 7、9 不展示。

## [2026-03-29] STG：道具表对齐文档；仅基础道具写「属性加成」

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`STG_UPGRADE_POOL` 道具A–V + 基础1–7、9 文案；`applyStgStatPickup` / `stgStatBonusDisplay` / `refreshStgReimuBonusAside`；左侧已选构筑不再含 stat；`applyStgUpgradePick` 对 stat 早退不污染分支；`bonusUltChargeMult`、`stgRunRegenMult`；`window.refreshStgReimuBonusAside`）、`game_demo/game.js`（`STG_REIMU_ASIDE_PANEL` 八行与 `pct_p_value`/`pct_charge_value`）、`game_demo/stgUiI18n.js`（`UPGRADE_EN`、`applyAll` 刷新右侧栏）、`game_demo/index.html`（侧栏标题与 `?v=20260329e`）
- **说明**：与设计文档《STG所有道具/新玩法--STG模式》一致；构筑卡不改变右侧属性加成列表。

## [2026-03-29] 文档：区分局内三选一 STG_UPGRADE_POOL 与局外 enhance_items

- **类型**：修改功能（注释与 UI 说明）
- **涉及文件**：`game_demo/stgMode.js`（`STG_UPGRADE_POOL` 上方注释）、`game_demo/game.js`（`enhance_items` 加载处注释）、`game_demo/index.html`（强化道具池面板说明、`?v=20260329d`）
- **说明**：局内升级唯一随机源为 `STG_UPGRADE_POOL`；`enhance_items.json` 为局外 meta，二者数据源不同。

## [2026-03-29] 强化道具池：替换为 STG 有效条目

- **类型**：修改功能
- **涉及文件**：`obj_list/enhance_items.json`（新 id 前缀 `stg_enh_*`，仅含 STG 结算用到的 playerStats 属性：`attack_damage_bonus`、`attack_speed_bonus`、`crit_chance_bonus`、`elemental_*`、`max_health_bonus`、`health_regen_bonus`、`hero_xp_gain_bonus`）、`game_demo/index.html`（道具池/物品栏说明文案、`?v=20260329c`）、`game_demo/game.js`（`hero_xp_gain_bonus` 显示名改为「局内经验获取加成」）
- **说明**：移除塔防向金币/基地产灵/光环/大招灵耗等旧条目；若本地曾存 `stg_enhance_items_custom` 覆盖旧 id，需在编辑器中清理或手动清除该键。

## [2026-03-29] 玩家强化物品栏：展示 effects 与描述

- **类型**：修改功能
- **涉及文件**：`game_demo/game.js`（`window.formatEffectsAsReadableLines`）、`game_demo/playerEnhanceInventoryPanel.js`（每行展示 `description` + 与强化卡片一致的可读效果列表）、`game_demo/styles.css`（效果区样式）、`?v=20260329b`
- **说明**：`game.js` 未加载时用 `key: value` 兜底。

## [2026-03-29] 玩家强化物品栏（从道具池设置持有数）

- **类型**：新增功能
- **涉及文件**：`game_demo/game.js`（`stg_player_enhance_inventory`、`applyEnhanceInventoryOverride`、`loadSavedEnhanceInventoryOverride`、开局 `applyEnhanceInventoryOverridesFromStorage`；`window` 暴露）、`game_demo/playerEnhanceInventoryPanel.js`（列表、应用并刷新 `renderInventory`）、`game_demo/index.html`（顶栏 🎒、面板 DOM、`game.js` `?v=20260329a`）、`game_demo/styles.css`（`.player-enh-inv-*`）
- **说明**：与「强化道具池」分离——后者改池内条目定义，本面板只改 `inventory` 中强化 id 的数量（与英雄物品栏存档并列）。

## [2026-03-28] 怪物编辑器：每条折叠 + 紧凑排版

- **类型**：修改功能
- **涉及文件**：`game_demo/monsterEditorPanel.js`（每条怪用 `<details>`/`<summary>`，摘要行显示 id、图标、名称·HP、删除；`e.stopPropagation` 防误触折叠）、`game_demo/styles.css`（列表与表单项间距/字号收紧、摘要行与箭头样式）、`game_demo/index.html`（折叠说明文案、`styles.css`/`monsterEditorPanel.js` `?v=20260328h`）
- **说明**：默认全部折叠，点击标题行展开；减少纵向滚动与扫视成本。

## [2026-03-28] STG：敌人弹幕 — 连射次数 + 平均/扩散波速率

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`emitStgEnemyAttackVolley`、`getEnemyBurstSpeedMult`、战斗中 `_stgBurstRemain` 续发、眩晕清空连射、死后弹幕仍单轮）、`game_demo/monsterEditorPanel.js`（连射次数/间隔/速率下拉）、`game_demo/styles.css`（`.monster-stg-burst-hint`）、`game_demo/index.html`（`?v=20260328g`）
- **说明**：「平均」各波弹速一致；「扩散波」用 ease-out 曲线使后发波次更快、相邻波差递减；激光按 `spdMult` 缩短持续；分裂子弹速度与母弹同乘区。

## [2026-03-28] STG：敌人移动 — 锁 Y / 锁 X

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`stgMoveMode`：`lock_y` 仅沿 Y 移至 `lockTargetY` 后 `moveIdle`；`lock_x` 仅沿 X 移至 `lockTargetX`；构造时从 `stgLockTargetYNorm`/`stgLockTargetXNorm` 换算像素；波次合并 `mergeStgEnemyTypeDef` 支持新字段）、`game_demo/monsterEditorPanel.js`（下拉选项与「锁轴目标」面板）、`game_demo/index.html`（`?v=20260328f`）
- **说明**：坐标与「到点后静止」相同为画布归一化 0~1；到位阈值 6px（与 anchor 一致）。

## [2026-03-28] STG：玩家武器编辑器 — 子弹穿透 + 发射参数折叠

- **类型**：新增功能 | 修改功能
- **涉及文件**：`game_demo/stgPlayerEditorPanel.js`（`bulletPierceEnabled`/`bulletPierceHits` 及慢速、技能三套；`sync*PierceRow`）、`game_demo/stgMode.js`（`mergeStgPlayerEditorIntoPlayer`、`emitPlayerVolley` 的 `pierceHitsLeft`、敌撞玩家弹时递减穿透段数）、`game_demo/index.html`（穿透控件 + `<details>` 包裹发射模式与单发/扇/环子项）、`game_demo/styles.css`（折叠块与行内勾选样式）、`?v=20260328e`
- **说明**：未勾选穿透时行为与旧版一致（命中即消弹）；勾选后可设 2–20 段敌命中；`StgEnemy.stgInstanceId` + 弹体 `pierceHitEnemyIds` 避免穿透时对同一敌多段伤害。单发/扇形/环形参数收在「发射模式与弹道参数」折叠内。

## [2026-03-28] STG：大招不发射 skill 弹幕 + 强化物品编辑器

- **类型**：新增功能 | 修改功能
- **涉及文件**：`game_demo/stgMode.js`（X 仅按 `stgUltBranch` 触发封魔阵/妙珠，未选分支不发射 skill 弹幕）、`game_demo/game.js`（`stg_enhance_items_custom` 合并入 `ITEM_POOL`，同 id 覆盖 JSON）、`game_demo/enhanceItemsEditorPanel.js`（列表/JSON effects、导入池内强化、应用后 `mergeEnhanceCustomIntoPool` + `rollEnhanceOffers` + `renderEnhanceGrid`）、`game_demo/index.html`（顶栏「强化物品编辑器」、面板 DOM、`?v=20260328d`）、`game_demo/stgUiI18n.js`（提示与构筑「大招招式」文案）
- **说明**：大招与主武器/慢速弹幕分离；自定义强化仅存浏览器本地，与 `enhance_items.json` 合并供四选一抽取。

## [2026-03-28] STG：两种大招构筑实装（封魔阵 / 梦想妙珠）

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`stgUltBranch === 'seal'` 时 `activateStgUltSeal`：跟随自机圆域消敌弹 + 持续伤害；`ult_seal_size`/`ult_seal_heal` 强化范围、持续、疗愈回血与结束后 `_ultAtkBuff`；`dream` 分支 `activateStgUltDream`：多枚上行妙珠消弹 + 接触 DPS，`ult_dream_count`/`ult_dream_stun`；`updateStgUltSkills`；敌人 `stgStunUntil` 停移动与射击；Z 弹 `getStgUltAtkDamageMult`；`resetRun` 清空大招状态与构筑；绘制结界与妙珠）、`game_demo/index.html`（`?v=20260328c`）
- **说明**：选中「封魔阵」或「梦想妙珠」基础卡后，X 触发对应大招（仍受 `skillFireIntervalMs`/`skillCooldownMs` 约束）；未选分支时 X 不发射 skill 弹幕（见同日复核条目）。妙珠眩晕仅在敌人非眩晕态时施加，避免在接触区内每帧刷新。

## [2026-03-28] 继续剔除塔防数据链与冗余调试项

- **类型**：重构
- **涉及文件**：`game_demo/game.js`（不再加载 arrow/boom/guard/wizard/配装/特斯拉 JSON；去掉防御塔覆盖与塔物品栏/配装/特斯拉状态机；`loadItemsData` 以 `item.json` 为主；`FALLBACK_ITEM_POOL` 仅兜底英雄；`GameState` 初始库存改为首个英雄×1；精简 Debug）、`game_demo/stgMode.js`（`buildPlayerFromHero` 用 `gameState.inventory` 选英雄，与英雄编辑器一致）、`game_demo/stgWaveFormationPanel.js`（保存/笔刷选项不再依赖 `towerDefenseGame`）、`game_demo/index.html`（去掉商店类 Debug 按钮；波次说明去塔防表述；`?v=20260328b`）
- **说明**：减轻 ITEM_POOL 体积与 `game.js` 维护面；遗物商店与强化四选一仍可通过隐藏桩 + UIManager 调试；旧 localStorage 塔相关键可保留于用户磁盘，代码不再读取塔覆盖/塔栏/配装。

## [2026-03-28] 移除塔防玩法脚本与页面，保留 STG 共用启动链

- **类型**：重构
- **涉及文件**：`game_demo/index.html`（删塔防相关 `<script>`、`#towerUpgradeMenu`；`#gameEconomyDomStub` 隐藏桩保留；STG 顶栏增加「英雄编辑器」、标题纯 STG；`?v=20260328a`）、`game_demo/pageManager.js`（精简为仅 STG）、`game_demo/game.js`（去掉塔防延迟初始化与塔防专用编辑器 init；`MonsterEditorPanel.init(null)`；怪物编辑器按钮不再依赖塔防）、`game_demo/stgWaveFormationPanel.js`（打开阵型前不再调用已删除的 `ensureTowerDefenseStart`）、`game_demo/heroEditorPanel.js`（支持 `#stgOpenHeroEditorBtn`）、`game_demo/monsterEditorPanel.js`（空列表提示去塔防依赖）
- **说明**：已物理删除的 `towerDefense.js`、`gameMap.js`、`enemySystem.js`、`towerAttackSystem.js` 及塔防编辑面板脚本不再引用。保留 `game.js` 物品池、`GameState`、`UIManager`、隐藏经济 DOM 桩，供 STG 与 Debug 商店刷新等逻辑；`window.towerDefenseGame` 相关调用保留为可选分支（无实例时不执行）。

## [2026-03-27] STG：武器独立基础攻击力 + 强化攻击力乘区（不再用英雄 baseAttack）

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`applyStgHeroNonWeaponScalars`、`applyStgWeaponBaseAttackBonuses`、`buildPlayerFromHero` 用 `mainWeaponAttack`/`focusWeaponAttack`/`skillWeaponAttack`；`emitPlayerVolley` 与左栏 HUD 公式）、`game_demo/stgPlayerEditorPanel.js`（旧档 `bulletDamageMult` 迁移到攻击力数值）、`game_demo/index.html`、`?v=20260327w`、`game_demo/towerDefense.js`
- **说明**：每套武器填写基础攻击力；与塔防一致乘 `total_damage_percent`、`attack_damage_bonus`、元素乘区；再乘局内 `bonusDamage`。生命、射速仍可由英雄模板与强化攻速推导。已移除 `player.bulletDamage` 与旧「伤害倍率」字段。

## [2026-03-27] STG：武器编辑器 — 伤害/弹体尺寸/外观 + 按发射模式显隐参数

- **类型**：新增功能
- **涉及文件**：`game_demo/stgPlayerEditorPanel.js`（`bulletDamageMult`、`bulletRadius`、`bulletVisualShape` 及 focus/skill 对应项）、`game_demo/stgMode.js`（`merge`、`emitPlayerVolley` 每模式倍率/半径/`shape`、绘制 `drawStgPlayerBullet`、左栏攻击力按模式）、`game_demo/index.html`（表单项与「发射模式」文案）、`?v=20260327v`、`game_demo/towerDefense.js`
- **说明**：伤害为倍率×英雄基础×局内加成；弹体半径参与碰撞；外观圆形/菱形/方形（非圆随速度方向旋转）。单发/扇形/环形专属参数仍仅在选择该发射模式时显示（原有 `sync*StyleRows`）。

## [2026-03-27] STG：玩家编辑器整合「武器编辑器」+ 慢速独立武器参数

- **类型**：新增功能
- **涉及文件**：`game_demo/index.html`（面板标题与武器分块 UI）、`game_demo/stgPlayerEditorPanel.js`（`focus*` 读写与 `syncFocusStyleRows`）、`game_demo/stgMode.js`（`mergeStgPlayerEditorIntoPlayer`、`emitPlayerVolley(isSkill, mainUseFocus)`、主武器射速按 Shift 分支、`refreshStgAttackBuildPanel` 集中列数值）、`game_demo/styles.css`（`.stg-player-editor-weapon-*`）、`?v=20260327u`、`game_demo/towerDefense.js`
- **说明**：普通(Z)/慢速(Z+Shift)/大招(X) 分三块编辑；存档增加 `focusFireIntervalMs`、`focusBulletSpeed`、`focusEmitStyle`、`*Count`/`*Spread` 等。无旧存档时慢速表单项默认与普通一致；运行时慢速未单独存档则仍回退普通主武器字段。左侧「集中攻击」列现显示慢速武器换算后的攻速/弹速。

## [2026-03-27] STG：构筑悬浮层同步定位到图标下方

- **类型**：Bug 修复
- **涉及文件**：`game_demo/stgMode.js`（`showStgAttackUpgradeTooltip` 同步测量、`hide` 清空坐标）、`game_demo/styles.css`（去掉默认 left/top）、`?v=20260327t`、`game_demo/towerDefense.js`
- **说明**：原先用双 rAF 写坐标，首帧会按样式落在 (0,0)；改为先 `visibility:hidden` 再同步算宽高与位置（默认图标下沿+水平居中，下方空间不足再翻转到上方），关闭时清空 inline 坐标。

## [2026-03-27] STG：构筑图标悬浮改为 fixed 自定义层

- **类型**：Bug 修复
- **涉及文件**：`game_demo/stgMode.js`（`ensureStgAttackUpgradeTooltip` / `showStgAttackUpgradeTooltip`、scroll 隐藏）、`game_demo/styles.css`（`.stg-upgrade-icon-tooltip`）、`?v=20260327s`、`game_demo/towerDefense.js`
- **说明**：父级 `.page` / `aside` 带 `overflow` 时原生 `title` 常不出现；改为 `position:fixed` 气泡展示名称+说明，并保留 `title` 作后备。

## [2026-03-27] STG：攻击构筑简化为四项数值 + 构筑图标悬浮说明

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`STG_UPGRADE_POOL` 增加 `icon`、`fillStgAttackUpgradeIcons`、`refreshStgAttackBuildPanel` 仅四项）、`game_demo/index.html`（构筑区改为 `div.stg-attack-upgrade-icons`）、`game_demo/stgUiI18n.js`（`attackBuild.simple.*`）、`game_demo/styles.css`、`?v=20260327r`、`game_demo/towerDefense.js`
- **说明**：攻击力/攻速(发/s)/弹速/暴击率；已选三选一以 emoji 图标展示，`title` 两行（名称+效果）供悬浮查看。

## [2026-03-27] STG：攻击构筑面板三种攻击各自数值 + 逻辑接入

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`refreshStgAttackBuildPanel`、`getStgCritChance`、`stgStyleLine`、三栏数值与已选构筑列表；`updateHud`/开局/三选一/编辑器保存刷新）、`game_demo/index.html`（`#stgAttackFocusStats`）、`game_demo/stgUiI18n.js`（`attackBuild.stat.atkGlobal`/`aps`/`focusMove`）、`?v=20260327q`、`game_demo/towerDefense.js`
- **说明**：扩散（Z）列：攻击力（含全局）、局内乘区、单发伤害、射击间隔、理论射速、弹速、暴击、弹幕样式。集中列：同上 + 慢速移速倍率 + 分支说明。大招（X）列：分支 + 同上基伤 + 技能间隔/射速/弹速/冷却 + 技能样式。`StgMode.refreshAttackBuildPanel` 供语言切换与外部刷新。

## [2026-03-27] STG：属性强化道具局内生效（与塔防前台乘区对齐）

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`applyGlobalPlayerStatsToStgHeroScalars`、暴击、生命恢复、`hero_xp_gain_bonus` 叠 `bonusExpMult`）、`game_demo/index.html`（`?v=20260327p`）、`game_demo/towerDefense.js`
- **说明**：强化界面 `applyItemEffects` 已写入 `playerStats`；塔防原已消费。STG 自机现应用 `attack_damage_bonus`/`elemental_*`/`total_damage_percent`、legacy 三维均值、`max_health_bonus`、`attack_speed_*`、击中暴击、`health_regen_bonus` 持续回血、经验拾取叠 `hero_xp_gain_bonus`。金币/基地产灵/光环等为塔防专用，STG 未接。

## [2026-03-27] STG：修复入场前误判离场导致敌人为 0

- **类型**：Bug 修复
- **涉及文件**：`game_demo/stgMode.js`（`StgEnemy.stgHasEnteredPlayfield`、入场重叠后再做完全离场剔除）、`game_demo/index.html`（`?v=20260327o`）、`game_demo/towerDefense.js`
- **说明**：上/左/右扩展格出生点常在画布外，首帧即「完全离场」且被当成从生成边离开而秒删且不计入波次；改为曾与画布有重叠后才启用离场与边界清除逻辑。

## [2026-03-27] STG：清波提前下一波 + 按阵型边判定离场是否计「清除」

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`stgWaveSpawnTotal`/`stgWaveResolvedCount`、`stgSpawnEdge`、`classifyStgExitBoundary`/`isStgExitCountsAsWaveClear`、`markStgWaveEnemyResolved`、`checkStgWaveAllClearedAndAdvance`）、`game_demo/index.html`（`?v=20260327n`）、`game_demo/towerDefense.js`
- **说明**：本波敌全部击杀或从「有效边界」完全离场时立即 `tryStgAutoStartNextWave`；上/左/右阵型来源对应：仅从下·左·右 / 下·右·上 / 下·左·上 离场计清除，从各自「回去」的一边离场不计入提前下一波。角上越界按离开画布最深的边判定。

## [2026-03-27] 塔防/STG：波次阵型编辑器接管波次配置 + 删除旧面板 + 拖动笔刷

- **类型**：修改功能 | 重构
- **涉及文件**：`game_demo/stgWaveFormationPanel.js`（阵型即唯一来源、`formationToEnemiesOrdered`、`migrateEnemiesToFormation`、波次增删与节奏表单项、`pointermove` 拖动连续 `paintCell`）、`game_demo/stgMode.js`（`flattenWaveToQueue` 仅认 `stgFormation`、`migrateWaveForRuntime`）、`game_demo/enemySystem.js`（深拷贝 `stgFormation`）、`game_demo/index.html`（移除 `waveConfigPanel`、顶栏只保留阵型入口）、`game_demo/game.js`（塔防打开阵型面板）、`game_demo/towerDefense.js`、`game_demo/styles.css`（`.stg-formation-grid` 合并 `touch-action: none`）
- **说明**：删除 `waveConfigPanel.js`；怪物种类与数量仅在阵型三棋盘定义，保存时写回 `enemies` 供塔防 `spawnQueue`；STG 运行时只读阵型队列。棋盘上长按拖动可连续摆放/擦除多格。

## [2026-03-27] STG：界面中/英切换（非编辑器）

- **类型**：新增功能
- **涉及文件**：`game_demo/stgUiI18n.js`（文案表、`localStorage` `stg_ui_lang`、构筑英译）、`game_demo/stgMode.js`（HUD/结算/三选一/标题画布用 `stgUiT`、`refreshUiLanguage`）、`game_demo/game.js`（右侧属性栏 `titleEn`/`labelEn`、`StgUiI18n.init`）、`game_demo/index.html`（`#stgLangToggleBtn`、`?v=20260327l`）、`game_demo/towerDefense.js`
- **说明**：顶栏「English」/「中文」切换；编辑器弹窗保持中文；STG HUD、操作提示、右侧加成、升级三选一、结算与标题提示支持英文。

## [2026-03-27] STG：阵型=扩展棋盘格对齐 + 整波同时生成

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`flattenFormationToSpawnList`、`getExtendedGridCellCenter`、`spawnFormationEntriesImmediate`；移除分节拍三路出怪；敌人离场判定扩大）、`game_demo/index.html`（说明与标题、`?v=20260327k`）、`game_demo/towerDefense.js`
- **说明**：上/左/右 棋盘与主战场边对边拼接，格心用统一公式；有阵型时开局/切波**一帧内**生成该波全部敌人。无阵型仍用 legacy 间隔逐只。修正 `x<-40` 误杀左侧延伸区敌人的问题。

## [2026-03-27] STG：阵型三路同时出怪（每节拍各棋盘各 1 只）

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`flattenFormationToEdgeQueues`、`flattenWaveToQueue` 返回 formation/legacy；`spawnQueueFormation`/`spawnQueueLegacy`、`spawnFormationTick`、`getSpawnPendingCount`）、`game_demo/index.html`（阵型说明、`?v=20260327j`）、`game_demo/towerDefense.js`
- **说明**：有 `stgFormation` 时拆成 top/left/right 三队列；每个 `spawnIntervalMs` 节拍内三路各 `shift` 一只（空路跳过），与「三棋盘同时刷」一致。无阵型时仍为 legacy 单列，每节拍 1 只。

## [2026-03-27] STG：波次阵型出兵顺序与左右侧横向格对齐

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`flattenFormationToQueue` 遍历顺序；`spawnEnemyFromQueue` 上沿 Y 与左右 X 用 `col`/`row` 对齐）、`game_demo/index.html`（阵型说明与棋盘标题、`?v=20260327i`）、`game_demo/towerDefense.js`
- **说明**：上棋盘自下而上入队（最下一行最先）；左棋盘按列从右到左（最右列最先）；右棋盘按列从左到右（最左列最先）。上沿生成 Y 改为按「距战场底行」深度；左右侧不再固定单列，列索引映射到屏外横向位置。

## [2026-03-27] STG：敌人移动方式「水平向左 / 水平向右」

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`resolveStgMoveMode`、`updateStgEnemyPosition`、`getEnemyTypeMap`）、`game_demo/monsterEditorPanel.js`（下拉选项与 `buildDataFromDom` / `moveModeFromData`）、`game_demo/enemySystem.js`（`getEnemyTypes` / `setEnemyTypes` 合法值）、`game_demo/index.html`（`?v=20260327h`）、`game_demo/towerDefense.js`
- **说明**：`stgMoveMode` 增加 `horizontal_left`、`horizontal_right`；局内仅沿 X 轴以 `speed` 移动，无额外参数区。

## [2026-03-27] STG 右侧栏：移除「属性强化（道具）」仅保留新属性加成

- **类型**：修改功能
- **涉及文件**：`game_demo/game.js`（`STG_REIMU_ASIDE_PANEL` 只保留文档「新属性」7 项；注释说明道具走三选一）、`game_demo/index.html`（侧栏标题与 aria）、`?v=20260327g`、`game_demo/towerDefense.js`、`RECORD.md`
- **说明**：与 `新模式玩法开发/新玩法--STG模式` 一致：属性强化（道具）不放在右侧列表。

## [2026-03-27] STG：出怪位置微抖动 + 同格多怪螺旋错开；阵型格支持 type1|type2

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`spawnSlotUsage`、`spawnEnemyFromQueue` 抖动与同格堆叠偏移；`flattenFormationToQueue` 按 `|` 拆成多条队列）、`game_demo/index.html`（阵型说明、`?v=20260327f`）、`game_demo/towerDefense.js`、`RECORD.md`
- **说明**：每格首次生成仅随机偏移；同一 `(edge,col,row)` 第 2 只起黄金角外扩；阵型字符串可用 `|` 同格多怪。

## [2026-03-27] STG：波次阵型编辑器（左/上/右 三棋盘 + stgFormation）

- **类型**：新增功能
- **涉及文件**：`game_demo/stgWaveFormationPanel.js`（弹层、笔刷、保存到 `tower_defense_wave_config`）、`game_demo/stgMode.js`（`flattenFormationToQueue`、`spawnEnemyFromQueue` 支持 `edge/col/row`、`window.__STG_GRID__`）、`game_demo/waveConfigPanel.js`（`buildDataFromDom` 保留 `stgFormation`）、`game_demo/index.html`（顶栏按钮与弹层 DOM）、`game_demo/game.js`（`StgWaveFormationPanel.init`）、`game_demo/styles.css`、`?v=20260327e`、`RECORD.md`
- **说明**：每波可存 `stgFormation.{top,left,right}` 二维格（与局内格数一致）；有格则优先按阵型顺序出兵，否则沿用种类+数量列表。右键擦除格。

## [2026-03-27] STG 右侧栏：博丽灵梦构筑属性列表（与设计文档对齐）

- **类型**：修改功能
- **涉及文件**：`game_demo/game.js`（`STG_REIMU_ASIDE_PANEL`、`renderStgReimuStatsPanelToElement`，不再用商店 `getStatsForShopDisplay` 填 `#stgPlayerStatsList`）、`game_demo/index.html`（侧栏标题与 aria）、`game_demo/styles.css`（`.stg-stat-section-title` 等）、`?v=20260327d`、`game_demo/towerDefense.js`、`RECORD.md`
- **说明**：「属性强化」8 项、「加成属性」7 项；占位显示；行上 `data-stg-stat` 便于后续接入局内数值。

## [2026-03-27] 怪物编辑器 + STG：敌弹半径与形状（圆/三角）

- **类型**：新增功能
- **涉及文件**：`game_demo/monsterEditorPanel.js`（子弹属性：`stgEnemyBulletRadius`、`stgEnemyBulletShape`）、`game_demo/enemySystem.js`（内置类型与 get/set）、`game_demo/stgMode.js`（`StgEnemy` 字段、`pushStgEnemyBullet`、`emitStgEnemyAttack`、分裂子弹继承、`drawStgEnemyBulletFill`、`getEnemyTypeMap`）、`game_demo/index.html`（`?v=20260327c`）、`game_demo/towerDefense.js`、`RECORD.md`
- **说明**：弹体弹幕可设 2–28px 半径；三角形沿速度方向绘制；碰撞仍用圆形半径（与原先一致）。激光样式不变。

## [2026-03-27] STG：构筑「先基础后强化」（requires 前置）

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`STG_UPGRADE_POOL` 为水晶/狂怒/封魔阵/妙珠子项增加 `requires`；`isStgUpgradeEligible` 校验 `stgTakenUpgradeIds`）、`game_demo/index.html`（`?v=20260327b`）、`game_demo/towerDefense.js`、`RECORD.md`
- **说明**：例如须先选「封魔阵·结界」后才可出现范围/疗愈；水晶须先「水晶箭」、狂怒须先「狂怒层数」、妙珠须先「梦想妙珠」。与分支互斥仍并存。

## [2026-03-27] STG：博丽灵梦构筑池替换三选一 + 集中/大招分支互斥

- **类型**：新增功能 | 修改功能
- **涉及文件**：`game_demo/stgMode.js`（`STG_UPGRADE_POOL`：扩散 8、水晶 4、狂怒 4、封魔阵 3、妙珠 3、属性 8；`stgFocusBranch`/`stgUltBranch`/`stgTakenUpgradeIds`；`isStgUpgradeEligible`/`applyStgUpgradePick`；`openLevelUp` 洗牌逻辑）、`game_demo/index.html`（升级标题文案、`?v=20260327a`）、`game_demo/towerDefense.js`、`RECORD.md`
- **说明**：与 `新模式玩法开发/新玩法--STG模式` 文案对齐；选中水晶则不再出现狂怒卡，封魔阵/梦想妙珠同理；各卡 `apply` 暂为空占位。构筑抽空时显示「无更多强化」单卡。

## [2026-03-26] STG：棋盘格扩大（12×17）+ 顶栏按钮紧凑以腾出画布空间

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`GRID_COLS`/`GRID_ROWS` 各 +3；`resizeCanvas` 预留高度 `220→168`、`maxH` 上限 `700→720`）、`game_demo/styles.css`（`.stg-toolbar` 与 `.stg-toolbar .open-shop-btn` 缩小；`.stg-container` 略加宽；`.stg-main` max-width 640）、`game_demo/index.html`（`#stgCanvas` 初始尺寸与 `?v=20260326n`）、`game_demo/towerDefense.js`、`RECORD.md`
- **说明**：战场在格数上更宽更长；顶栏字号与内边距减小，纵向多留给棋盘像素预算。

## [2026-03-26] 怪物编辑器：STG 表单项按选择折叠（弹幕样式/无弹幕/激光/分裂/移动）

- **类型**：修改功能
- **涉及文件**：`game_demo/monsterEditorPanel.js`（`syncStgSubPanels`：无弹幕时隐藏发射时机/冷却/弹速/子弹属性；激光时隐藏跟踪强度；扇/环/激光参数与主方向仍按样式切换；末尾调用 `syncBulletKindRow`）、`game_demo/styles.css`（`#monsterEditorPanel .monster-editor-stg-block .hidden` 及若干行级类与 `.hidden` 同效）、`game_demo/index.html`（`?v=20260326m`）、`game_demo/towerDefense.js`、`RECORD.md`
- **说明**：根因是全局无通用 `.hidden{display:none}`，移动子块与分裂区仅加 class 不生效；现统一折叠并扩展「无弹幕」「激光」下的无关项。

## [2026-03-26] enemySystem：STG 敌人移动方式字段与内置类型对齐

- **类型**：修改功能
- **涉及文件**：`game_demo/enemySystem.js`（`normal`/`fast`/`tank` 默认 `stgMoveMode` 等；`getEnemyTypes` 导出；`setEnemyTypes` 写入与夹取）、`game_demo/index.html`（`?v=20260326l`）、`game_demo/towerDefense.js`（`SCRIPT_BUILD_ID`）、`RECORD.md`
- **说明**：避免从塔防读回类型时缺少 `stgMove*`，与 `stgMode` / 怪物编辑器合并后行为不一致；模式含 `straight`/`homing`/`anchor`/`arc_edges`/`homing_legacy`。

## [2026-03-26] STG：玩家/场景道具编辑器排版居中 + 玩家受击粒子与闪屏

- **类型**：修改功能 | 新增功能
- **涉及文件**：`game_demo/styles.css`（`#stgPlayerEditorPanel` / `#stgScenePropsEditorPanel` 内卡片宽度、标题居中、关闭按钮绝对定位、表单区 padding、底部按钮居中）、`game_demo/stgMode.js`（`stgPlayerFxParticles`、`triggerStgPlayerHitFx`、敌弹/激光受击反馈、`updateStgPlayerHitFx`、绘制粒子与淡红闪）、`game_demo/index.html`（`?v=20260326k`）、`game_demo/towerDefense.js`、`RECORD.md`
- **说明**：激光持续伤按约 95ms 节流喷发粒子；敌弹命中一次较多粒子 + 较长闪屏。

## [2026-03-26] STG：场景道具编辑器（P 点轨迹：直线向下 / 先上后下）

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`STG_SCENE_PROPS_KEY`、`createPickupAtKill`、弧线路径每帧更新、`applyScenePropsEditorConfig`）、`game_demo/stgScenePropsEditorPanel.js`、`game_demo/index.html`（顶栏「场景道具」+ 弹层）、`game_demo/game.js`（`StgScenePropsEditorPanel.init`）、`game_demo/styles.css`（`.stg-scene-props-editor-inner`）、`?v=20260326j`、`game_demo/towerDefense.js`、`RECORD.md`
- **说明**：本地存档 `stg_scene_props_config`；弧线路径为相对击杀点上抛 `pArcPeakPx` 像素后按 `pArcDownSpeed` 下落；应用后仅新掉落的 P 点生效。

## [2026-03-26] STG：玩家编辑器扩展（移速/慢速倍率/判定/主武器与技能弹幕）

- **类型**：新增功能 | 修改功能
- **涉及文件**：`game_demo/stgMode.js`（`mergeStgPlayerEditorIntoPlayer`、`emitPlayerVolley`、Shift 慢速用 `focusMoveMult`、`KeyX` 技能、`applyStgPlayerConfigToRuntime` 无档时整对象重建）、`game_demo/stgPlayerEditorPanel.js`（全表单项与样式联动）、`game_demo/index.html`（面板 DOM、HUD 提示）、`game_demo/styles.css`（分区与滚动）、`?v=20260326i`、`game_demo/towerDefense.js`、`RECORD.md`
- **说明**：主武器 Z：射速间隔、弹速、样式（单发并列数/扇形/环形及参数）；技能 X：同等字段 + 射速间隔与可选额外冷却；慢速为倍率（默认 0.34）。

## [2026-03-26] STG：补全玩家编辑器 DOM + 顶栏改名为「玩家编辑器」

- **类型**：Bug 修复
- **涉及文件**：`game_demo/index.html`（在 `#stgPage` 内补回 `#stgPlayerEditorPanel` 弹层，此前仅有脚本无节点导致点击无反应；顶栏按钮文案与标题）、`?v=20260326h`、`game_demo/towerDefense.js`（`SCRIPT_BUILD_ID`）、`RECORD.md`
- **说明**：`StgPlayerEditorPanel.open()` 依赖 `#stgPlayerEditorPanel`，缺失时静默 return。

## [2026-03-26] 怪物编辑器：死后弹幕存档修复 + 子弹类型（普通/分裂）与分裂参数

- **类型**：Bug 修复 | 新增功能
- **涉及文件**：`game_demo/enemySystem.js`（`getEnemyTypes` 补充 `stgEmitWhen`、分裂相关字段；避免 `undefined` 覆盖本地存档；`setEnemyTypes` 写入 `stgBulletKind`/`stgSplitCount`/`stgSplitStyle`）、`game_demo/monsterEditorPanel.js`（子弹类型下拉、分裂参数区、读档兼容）、`game_demo/stgMode.js`（`resolveStgSplitFromEnemy`、`pushStgEnemyBullet` 分裂个数/样式、整圈均匀放射）、`game_demo/index.html`（`?v=20260326g`）、`game_demo/towerDefense.js`、`RECORD.md`
- **说明**：根因是 `getEnemyTypes()` 未导出 `stgEmitWhen`，`render` 里 `{ ...fromDisk, ...fromGame }` 被不完整对象覆盖导致「死后弹幕」无法保存。现与编辑器字段对齐。新增「普通/分裂弹」与分裂个数、样式（目前仅十字均匀放射）；旧档仅 `stgSplitDelaySec>0` 仍视为分裂。

## [2026-03-26] STG：玩家属性编辑器（移速 + 受击判定半径）

- **类型**：新增功能
- **涉及文件**：`game_demo/stgPlayerEditorPanel.js`（`localStorage` 键 `stg_player_config`）、`game_demo/stgMode.js`（`loadStgPlayerConfig`、`getStgPlayerHitRadius`、`applyStgPlayerConfigToRuntime`、`StgMode.applyPlayerEditorConfig`、`buildPlayerFromHero` 合并存档；激光/敌弹/慢速圈共用同一判定半径）、`game_demo/index.html`（顶栏「玩家属性」+ 弹层）、`game_demo/game.js`（`StgPlayerEditorPanel.init`）、`game_demo/styles.css`（`.stg-player-editor-*`）、`game_demo/index.html`（`?v=20260326f`）、`game_demo/towerDefense.js`（`SCRIPT_BUILD_ID`）、`RECORD.md`
- **说明**：移速约 60–520、受击半径约 2–48（从中心到边缘）；无存档时恢复为英雄模板移速与默认 `10+机体半径` 判定；局内「应用」或「恢复默认」立即同步当前 `player`。

## [2026-03-26] STG：死后弹幕（`stgEmitWhen`）与战斗弹幕共用同一套样式与子弹属性

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`StgEnemy.stgEmitWhen`、战斗中跳过冷却发射、击杀时 `emitStgEnemyAttack`）、`game_demo/monsterEditorPanel.js`（「发射时机」：战斗中 / 死后弹幕；死后隐藏冷却行）、`game_demo/enemySystem.js`（默认与 get/set）、`game_demo/styles.css`（`.monster-stg-cooldown-row.hidden`）、`game_demo/index.html`（`?v=20260326e`）、`game_demo/towerDefense.js`、`RECORD.md`
- **说明**：阵亡时在同一位置按既有扇/环/激光/单发与分裂、跟踪等生成；无弹幕种类不释放；飞出屏幕清怪不触发。

## [2026-03-26] 怪物编辑器：支持添加/删除自定义种类 + 波次下拉同步

- **类型**：新增功能 | 修改功能
- **涉及文件**：`game_demo/enemySystem.js`（`setEnemyTypes` 以 `normal` 为模板新建种类、非内置且不在提交对象中的 id 删除）、`game_demo/monsterEditorPanel.js`（合并本地与 `getEnemyTypes`、排序、`tryAddNewMonsterType`、行内删除）、`game_demo/index.html`（添加栏）、`game_demo/styles.css`（添加栏与行头布局）、`game_demo/waveConfigPanel.js`（`getEnemyTypeOptions` 动态种类）、`game_demo/index.html`（`?v=20260326d`）、`game_demo/towerDefense.js`、`RECORD.md`
- **说明**：新种类 ID 规则 `[a-zA-Z_][a-zA-Z0-9_]*`；内置 `normal/fast/tank` 不可删。波次配置中种类下拉会读本地与运行时 enemyManager。

## [2026-03-26] 怪物编辑器 STG 区块：分组排版 + 统一样式下拉 + 激光折叠 + 跟踪强度

- **类型**：修改功能 | 新增功能
- **涉及文件**：`game_demo/monsterEditorPanel.js`（「弹幕发射样式」单下拉含无弹幕/单发三种/扇/环/激光；「主方向」仅扇/激光；扇/环/激光参数分区折叠；「子弹属性」含分裂与跟踪；`syncStgSubPanels`）、`game_demo/styles.css`（`.monster-stg-row` 网格对齐）、`game_demo/stgMode.js`（`stgHomingStrength`、敌弹跟踪）、`game_demo/enemySystem.js`、`game_demo/index.html`（`?v=20260326c`）、`game_demo/towerDefense.js`、`RECORD.md`
- **说明**：存档仍为 `stgBulletPattern`+`stgEmitStyle`；UI 映射与旧档兼容。跟踪 0~100 对弹体生效，激光无跟踪。

## [2026-03-26] STG：扇形/环形/直线激光发射 + 延迟十字分裂

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`emitStgEnemyAttack`、`enemyLasers`、线段判伤、`pushStgEnemyBullet`、分裂逻辑、`StgEnemy` 扩展字段、`getEnemyTypeMap` 合并）、`game_demo/monsterEditorPanel.js`（发射样式与参数表单）、`game_demo/enemySystem.js`（默认与 get/set 同步）、`game_demo/styles.css`（`.monster-stg-emit-style`）、`game_demo/index.html`（`?v=20260326b`）、`game_demo/towerDefense.js`（`SCRIPT_BUILD_ID`）、`RECORD.md`
- **说明**：发射样式 `single|fan|ring|laser`；扇形用张角与发数；环形均分 360°；激光为粗线段持续时间内点段距判伤；`stgSplitDelaySec>0` 时每弹在存活该时长后沿随机旋转十字拆成 4 发。

## [2026-03-26] STG：按住 Shift 慢速模式 + 显示伤害判定点

- **类型**：新增功能
- **涉及文件**：`game_demo/stgMode.js`（`STG_PLAYER_HIT_EXTRA` / `STG_FOCUS_MOVE_MULT`；`ShiftLeft`/`ShiftRight` 键位；移动倍率；敌弹碰撞与绘制共用命中半径；`blur` 清键）、`game_demo/index.html`（操作说明与 `?v=20260326a`）、`game_demo/towerDefense.js`（`SCRIPT_BUILD_ID`）、`RECORD.md`
- **说明**：按住 Shift 时移速为 `moveSpeed * bonusMoveMult * 0.34`；受击范围以 `10 + player.radius` 画虚线圆 + 中心点，与敌弹命中判定一致。

## [2026-03-17] STG：编辑器无塔防也能保存、死亡弹窗可重开、右侧玩家属性

- **类型**：Bug 修复 | 修改功能
- **涉及文件**：`game_demo/monsterEditorPanel.js`（`applyTypes` 先 `localStorage` 再按需 `setEnemyTypes`；`addTypeRow` 的 `stgPat` 含 `none`）、`game_demo/waveConfigPanel.js`（`loadWavesFromStorage` / `getWavesFromGame` 回退存档；`applyWaves` 无塔防时直接写 `tower_defense_wave_config`）、`game_demo/index.html`（`.stg-body-row` + `#stgPlayerStatsList`；`#stgResultRestartBtn`）、`game_demo/styles.css`（`.stg-toolbar` z-index、侧栏与重开按钮样式）、`game_demo/stgMode.js`（结算内重开与 `hideResult` 恢复 `#stgHintBar`）、`game_demo/game.js`（`refreshStgPlayerStatsPanel`）、`game_demo/towerDefense.js`（`SCRIPT_BUILD_ID`）、`RECORD.md`
- **说明**：解决 STG 未进塔防时怪物/波次「应用」不落盘；死亡全屏层遮挡顶栏导致点不到重开（顶栏提高层级 + 弹窗内重开）；右侧展示与商店同源的全局 `playerStats`。

## [2026-03-17] STG：下一波倒计时 HUD + 自动开波与塔防一致（本波起算 nextWaveDelaySec，不等待清怪）

- **类型**：修改功能
- **涉及文件**：`game_demo/stgMode.js`（`scheduleStgNextWaveTimerAfterCurrentWaveStarted`、`tryStgAutoStartNextWave`、`getStgNextWaveCountdownSec`；开局与每次自动下一波成功后重新计时；出兵队列未空则延后；移除「清场后才倒计时」旧逻辑）、`game_demo/index.html`（`#stgNextWaveText`、`?v=20260317g`）、`game_demo/towerDefense.js`（`SCRIPT_BUILD_ID`）、`RECORD.md`
- **说明**：与 `towerDefense.scheduleNextWaveTimerAfterCurrentWaveStarted` / `tryAutoStartNextWave` 行为对齐；下方 HUD 显示 `下一波 Ns` / `下一波 即将`。

## [2026-03-17] STG 弹幕类型增加「无弹幕」（none），该种敌人不发射敌弹

- **类型**：修改功能
- **涉及文件**：`game_demo/monsterEditorPanel.js`（下拉选项 `none`）、`game_demo/enemySystem.js`（`setEnemyTypes` 接受 `none`）、`game_demo/stgMode.js`（`resolveStgBulletPattern`、合并存档、`pattern==='none'` 时不进入发射逻辑）、`game_demo/index.html`（说明与 `?v=20260317f`）、`game_demo/towerDefense.js`、`RECORD.md`
- **说明**：`random` 仅在瞄准/直线间随机，不会出现无弹幕。

## [2026-03-17] 怪物编辑器：STG 弹幕类型/冷却/敌弹速度 + 碰撞半径；STG 与 enemySystem 读档一致

- **类型**：新增功能 | 修改功能
- **涉及文件**：`game_demo/monsterEditorPanel.js`（每种怪增加「碰撞半径」、STG 区块：弹幕类型 `random|aim|straight`、弹幕冷却 ms、敌弹速度；无塔防时用 `loadSavedTypes` 渲染）、`game_demo/enemySystem.js`（默认类型含 `stgBulletPattern`、`stgShootCooldownMs`、`stgEnemyBulletSpeed`；`getEnemyTypes`/`setEnemyTypes` 同步）、`game_demo/stgMode.js`（`getEnemyTypeMap` 合并上述字段；`resolveStgBulletPattern`、`StgEnemy.enemyBulletSpeed`、发射使用编辑器速度）、`game_demo/index.html`（说明文案与 `?v=20260317e`）、`game_demo/styles.css`（`.monster-editor-stg-block`）、`game_demo/towerDefense.js`（`SCRIPT_BUILD_ID`）、`RECORD.md`
- **说明**：STG 中怪物属性与弹幕模式与塔防共用 `tower_defense_enemy_types`；应用后写入本地，STG 局内从合并后的类型表读取。

## [2026-03-17] STG：棋盘区与 HUD/说明拆分布局，避免文案换行带动棋盘左右移动

- **类型**：修改功能
- **涉及文件**：`game_demo/index.html`（`.stg-board-slot` 内仅深色框 + `canvas`；`#stgHudBar` 与 `#stgHintBar` 移至 `.stg-meta-panel`）、`game_demo/styles.css`（`.stg-main` 纵向 flex + `max-width`；棋盘槽 `width:fit-content` 仅随画布宽度；元信息区 `width:100%`）、`?v=20260317d`、`towerDefense.js` `SCRIPT_BUILD_ID`、`RECORD.md`
- **说明**：原先 HUD/说明与画布同在一个可伸缩容器内，文字变长会撑宽外层深色框，整体被 `margin:auto` 重新居中，表现为棋盘左右动。现棋盘宽度只由 canvas 决定，与下方 UI 独立。

## [2026-03-17] STG 棋盘居中左右「抖动」：scrollbar-gutter + 页面宽度与 resize 防抖

- **类型**：Bug 修复
- **涉及文件**：`game_demo/styles.css`（`html { scrollbar-gutter: stable }` 避免滚动条显隐导致视口宽度突变；`.page` 用 `width:100%`+`max-width:100vw` 与 `overflow-x:hidden`；`.stg-main`/`.stg-canvas-wrap` 防止 flex 子级宽度微调时反复重算居中）、`game_demo/stgMode.js`（`resize` 防抖再 `resizeCanvas`）、`game_demo/index.html`（`?v=20260317c`）、`game_demo/towerDefense.js`（`SCRIPT_BUILD_ID`）、`RECORD.md`
- **说明**：深色框内棋盘左右移动多为 **纵向滚动条出现/消失** 或 **画布宽度随窗口微调** 后，外层 `justify-content:center` / `margin:auto` 重新居中所致。

## [2026-03-17] STG：修复波次倒计时变量名导致 strict 下开局崩溃 + 玩家/敌人可见绘制 + 首怪立即生成

- **类型**：Bug 修复 | 修改功能
- **涉及文件**：`game_demo/stgMode.js`（声明 `interWaveCountEnd` 与赋值一致；`startGame` 不再重复 `loop()`；`spawnAccMs` 首帧即出兵；出兵队列空时回退 `normal×5`；玩家/敌人增加几何图形与描边，不依赖 emoji）、`game_demo/index.html`（`?v=20260317b`）、`game_demo/towerDefense.js`（`SCRIPT_BUILD_ID`）、`RECORD.md`
- **说明**：原先把 `interWaveCountEnd` 写错成未声明的 `interWaveCountEnd` 与声明名 `interWaveCountdownEnd` 混用，在严格模式下 `resetRun` 在创建 `player` 前抛错，表现为「无自机、无敌人」。现已统一变量名并加强画面表现。

## [2026-03-17] STG 纵版射击新玩法（默认首页）+ 塔防改为按钮进入（延迟初始化）

- **类型**：新增功能 | 修改功能
- **涉及文件**：`game_demo/stgMode.js`（竖屏 9×14 格、方向键移动、Z 连射、敌人两种弹幕模式瞄准/直线、P 点经验、升级三选一、波次与 `tower_defense_wave_config`/`waveConfig.json` 及怪物编辑器存档共用）、`game_demo/index.html`（`#stgPage` 默认 `active`、`#gamePage` 初始隐藏；工具栏「塔防模式」「返回 STG」；`?v=20260317a`）、`game_demo/pageManager.js`（`showStgPage` / `showTowerDefensePage`，`currentPage` 含 `stg`）、`game_demo/game.js`（`StgMode.init`、`ensureTowerDefenseStart` 延迟构造 `TowerDefenseGame`；STG 上打开波次/怪物面板时 lazy init 后若仍在 STG 则 `pause` 塔防）、`game_demo/styles.css`（STG 布局与遮罩）、`game_demo/towerDefense.js`（`SCRIPT_BUILD_ID`）、`RECORD.md`
- **说明**：打开站点默认进入 STG；原塔防主界面通过「🗼 塔防模式（旧玩法）」进入，塔防画布内「🎮 STG 纵版射击」返回。塔防仅在首次需要时初始化，避免与 STG 抢首帧。设计文档：`新模式玩法开发/新玩法--STG模式`。

## [2026-03-16] 弹珠塔/飞刀塔独立 id：marble_tower、knife_tower（文档与物品栏编辑器对齐）

- **类型**：修改功能
- **涉及文件**：`game_demo/inventoryEditorPanel.js`（`BRANCH_BASE_IDS`、分组说明）、`配装道具`、`game_demo/index.html`（提示文案与 `?v=20260316z`）、`game_demo/towerDefense.js`（`SCRIPT_BUILD_ID`）、`RECORD.md`
- **说明**：局内分支与物品栏「五类基底塔」统一使用 **`marble_tower`（弹珠塔）**、**`knife_tower`（飞刀塔）**，与 `game.js` 中 `UPGRADE_BRANCH_BASE_TOWER_IDS`、`tower_upgrade_branches.json` 顶层键一致；旧存档 `red_diamond` / `sniper_tower` 仍由 `migrateLegacyTowerInventoryIdsInStorage` / `applyTowerLoadoutsFromStorage` 迁移，不重复混用。

## [2026-03-16] 文案：弹珠塔/飞刀塔显示名与 id 说明（red_diamond、sniper_tower）

- **类型**：修改功能
- **涉及文件**：`obj_list/arrow.json`（`sniper_tower`→显示名「飞刀塔」、图标🗡️；`red_diamond` 描述澄清 id/红钻；精英飞刀塔）、`game_demo/tower_upgrade_branches.json`（`displayName` 仅「弹珠塔」「飞刀塔」、`_comment`）、`game_demo/inventoryEditorPanel.js`（分组说明）、`配装道具`、`game_demo/towerDefense.js`、`game_demo/index.html`（`?v=20260316y`）、`RECORD.md`
- **说明**：局内分支表键名仍为 `red_diamond`（配装文档里「弹珠塔=red_diamond」）；「红钻」不作为塔种名称。`sniper_tower` 界面统一为「飞刀塔」，避免与「狙击」混淆。

## [2026-03-16] 物品栏编辑器：局内五塔分组置顶 + 显示 id + 左侧栏说明

- **类型**：修改功能
- **涉及文件**：`game_demo/inventoryEditorPanel.js`（`BRANCH_BASE_IDS` 分组、`partitionForBranchSection`、行内展示 `id`、分支行样式）、`game_demo/styles.css`（`.inventory-editor-section-title`、`.inventory-editor-row-branch` 等）、`game_demo/index.html`（说明：左侧栏仅数量&gt;0；第一组为分支五塔）、`game_demo/towerDefense.js`（构建号）、`?v=20260316x`、`RECORD.md`
- **说明**：数据已在池中且可配置，但仅按名称排序不易辨认；现将游侠/飞镖/弹珠/寒冰/狙击五类**固定置顶分组**，每行显示 **id**（如 `red_diamond`），并说明左侧部署栏需数量≥1 才显示。

## [2026-03-16] 控制台「防御塔」加载报告：arrow id 列表 + 五类分支校验 + 最终清单

- **类型**：修改功能
- **涉及文件**：`game_demo/game.js`（`UPGRADE_BRANCH_BASE_TOWER_IDS`、`logDefenseTowerLoadReport`、`[防御塔][arrow.json]` 日志）、`game_demo/inventoryEditorPanel.js`（`[防御塔][物品栏编辑器]`）、`game_demo/towerDefense.js`（构建号）、`game_demo/index.html`（`?v=20260316w`）、`RECORD.md`
- **说明**：控制台过滤「防御塔」时可看到：`arrow.json` 全部 id、与局内五类分支塔 id 对照、去重后塔类清单；补全跳过时亦有说明。物品栏编辑器打开时打印可配置塔 id 列表。

## [2026-03-16] 物品栏编辑器：初始化时机 + arrow 双路径补全 + 兜底塔 + 池去重

- **类型**：Bug 修复 | 修改功能
- **涉及文件**：`game_demo/game.js`（`mergeArrowJsonSupplement`、`mergeEmbeddedDefenseTowersIfMissing`、`dedupePoolById`；`InventoryEditorPanel` 等与塔防构造解耦提前 `init`）、`game_demo/inventoryEditorPanel.js`（`init` 防重复绑定、`console.debug` 条数）、`game_demo/towerDefense.js`（构建号）、`game_demo/index.html`（`?v=20260316v`）、`RECORD.md`
- **说明**：原先把 `InventoryEditorPanel.init()` 放在 `runTowerDefense` 内，塔防构造失败时面板从未绑定；现于 `window.gameState` 就绪后即初始化编辑器。`arrow.json` 增加相对路径补全与弹珠/寒冰嵌入式兜底，并对 `ITEM_POOL` 按 id 去重，避免多路径合并重复。

## [2026-03-16] 物品栏编辑器：完整物品池 + 排除精英行、名称排序

- **类型**：修改功能
- **涉及文件**：`game_demo/game.js`（`window.ITEM_POOL`）、`game_demo/inventoryEditorPanel.js`（优先 `window.ITEM_POOL`；排除 `buyable:false`；中文名排序）、`game_demo/towerDefense.js`（`SCRIPT_BUILD_ID`）、`game_demo/index.html`（`?v=20260316u`）、`RECORD.md`
- **说明**：新增防御塔需出现在「📦 物品栏编辑器」中；现列表与全局 `ITEM_POOL` 对齐，并隐藏精英塔单独行、按名称排序便于查找。

## [2026-03-16] 局内塔 Lv.4 升级分支战斗接入 + 弹珠/寒冰塔物品

- **类型**：新增功能 | 修改功能
- **涉及文件**：`game_demo/towerDefense.js`（`buildTowerBranchRuntime`、`countNeighborTowersByBaseId`、`refreshTowerCombatStats` 写入 `branchRuntime`、`applyProjectileSplitDamage`、`updateProjectiles` 穿透/分裂/金币/冰霜减速）、`game_demo/towerAttackSystem.js`（连射、分支暴击、非投射物分裂/减速）、`game_demo/enemySystem.js`（`applyFrostSlow` 与移速乘子）、`obj_list/arrow.json`（`red_diamond` / `frost_tower` 及精英）、`game_demo/tower_upgrade_branches.json`（`effectPending: false`、冰霜/飞刀选项3 文案）、`game_demo/index.html`（`?v=20260316t`）、`RECORD.md`
- **说明**：五类塔（游侠/飞镖/弹珠/寒冰/飞刀）的 3→4 分支按「配装道具」与 JSON 接入：射程/攻速/暴击/总伤乘区、连射多弹、穿透与弹射链、弹珠/飞刀分裂、飞镖击杀额外金币、寒冰减速 debuff；缺失的 **弹珠塔 `red_diamond`、寒冰塔 `frost_tower`** 已在 `arrow.json` 补全可部署条目。若 `tower_upgrade_branches.json` 异步晚于首场战斗加载，需依赖 `towerDefense.js` 内 `fetch` 缓存；刷新页面后生效。

## [2026-03-16] 强化卡片：effects 显示为中文可读（属性名 + 百分比/数值）

- **类型**：修改功能
- **涉及文件**：`game_demo/game.js`（`getPlayerStatEffectLabel`、`formatEffectValueReadable`、`formatEffectsAsReadableLines`、`escapeHtml`、`createEnhanceCard`）、`game_demo/styles.css`（`.enhance-effects-readable`）、`game_demo/index.html`（`?v=20260316s`）、`game_demo/towerDefense.js`（构建号）、`RECORD.md`
- **说明**：不再展示 `attack_damage_bonus: 0.02` 等原始键名，改为如「攻击力加成 +2%」多行列表。

## [2026-03-16] 强化界面：免费四选一、独立池 enhance_items.json、大招灵力减免属性

- **类型**：新增功能
- **涉及文件**：`obj_list/enhance_items.json`、`game_demo/game.js`（`loadItemsData`、`GameState.rollEnhanceOffers`/`pickEnhanceOffer`、`UIManager` 强化渲染）、`game_demo/pageManager.js`（`openEnhance`/`closeEnhance`）、`game_demo/index.html`、`game_demo/styles.css`、`player_stat/player_stats.json`（`hero_ult_cost_reduction`）、`game_demo/towerDefense.js`（`getEffectiveHeroSpiritCost`）、`待完成的功能/待开发的功能1`、`待完成的功能/强化道具`、`RECORD.md`、`?v=20260316r`
- **说明**：主界面顶部「⬆️ 强化」进入全屏页，布局与商店类似；中间 4 张卡免费，**选择一项**后应用 `effects` 到 `PlayerStats` 并自动重抽下一组；**刷新选项**不扣金币。强化与遗物、旧道具池分离。`hero_ult_cost_reduction` 降低英雄大招实际扣灵。

## [2026-03-16] 商店道具池改为遗物池（relics.json），旧道具保留在 itemPool 后台

- **类型**：修改功能
- **涉及文件**：`obj_list/relics.json`（约 32 条遗物，含临时 `effects` 数值）、`game_demo/game.js`（`loadItemsData` 合并遗物；`generateShopItems` 仅 `category === '遗物'`）、`待完成的功能/待开发的功能1`（已标记完成）、`.cursor/rules/task_marking.mdc`、`game_demo/index.html`（`?v=20260316q`）、`RECORD.md`
- **说明**：商店刷新与展示只从遗物池随机；`item.json`、防御塔与配装等仍加载进 `ITEM_POOL` 供库存、编辑器与 `findItemById` 使用。遗物效果键对齐 `player_stats` 前台/后台属性，便于 `applyItemEffects` 直接累加。

## [2026-03-16] 玩家属性：前台 11 项新列表 + 旧属性 legacy 后台兼容

- **类型**：新增功能 | 修改功能
- **涉及文件**：`player_stat/player_stats.json`（前台 11 项 + 原属性全部 `legacy:true`）、`game_demo/game.js`（`getStatsForShopDisplay`、`loadPlayerStats` 兜底）、`game_demo/towerAttackSystem.js`（伤害/攻速/金币）、`game_demo/towerDefense.js`（生命、光环范围、基地产灵、英雄经验、金币 `applyGoldCoinsIncome`、塔回血 `applyTowerHealthRegen`、大招伤害）、`game_demo/index.html`（`?v=20260316p`）、`RECORD.md`
- **说明**：商店右侧仅展示文档中的 **11 项**（攻击力/射速/暴击/元素效果与伤害/生命与回复/金币/基地产灵/光环范围/英雄经验）；原物理伤、全伤、收获力等仍加载在 `PlayerStats` 中供道具与旧逻辑使用，**不在商店列表显示**。新属性已部分接入战斗：攻击力与元素伤乘区、暴击（含旧 crit_rate）、射速（含旧 attack_speed_percent）、金币入账、基地产灵、光环格半径、英雄经验、塔生命与缓慢回复。

## [2026-03-16] UX：英雄大招 HUD 左下紧凑、战斗中点击塔打开升级菜单、英雄光环常态显示

- **类型**：修改功能 | Bug 修复
- **涉及文件**：`game_demo/towerDefense.js`（战斗中非英雄点击 `showTowerUpgradeMenu`；`fillTowerUpgradeMenu` 增加「瞄准释放大招」、战斗中禁用「移动位置」；`getHeroAuraDrawShape` + `drawHeroAuraHighlights` 每英雄必画）、`game_demo/styles.css`（`.hero-ultimate-hud` 左下、`tu-btn-ult`）、`game_demo/index.html`（`?v=20260316o`）、`RECORD.md`
- **说明**：原先**仅在休整期**点击塔才会 `showTowerUpgradeMenu`，战斗中无法升级；现战斗中点击非英雄塔直接打开升级菜单，**普通塔大招**改为菜单内按钮（满威能且本波未用时显示）。英雄大招面板改为**画布左下角**、字号与内边距缩小。光环：**不再依赖 `aura.enabled` 才绘制**，未配置 `attributes.aura` 时用默认 2 格方形范围常显；**属性加成**仍仅在编辑器勾选启用光环时生效。

## [2026-03-16] 待开发功能1：英雄光环高亮、塔战斗中可升级、英雄大招 HUD 与技能 CD/灵力

- **类型**：新增功能 | 修改功能
- **涉及文件**：`game_demo/towerDefense.js`（`drawHeroAuraHighlights`、`getHeroForUltHud`、`ensureHeroUltimateHud`、`updateHeroUltimateHud`、`castTowerUltimateAt` 英雄分支、`enterUltAiming` 与 `cancelUltAiming` 技能序号顺序、瞄准切换塔、点击英雄绑定 HUD）、`game_demo/index.html`（`#heroUltimateHud`）、`game_demo/styles.css`（`.hero-ultimate-hud` 等）、`RECORD.md`、`?v=20260316n`
- **说明**：
  - **光环**：每帧在 `render` 中于 `drawTowers` 前绘制所有启用 `attributes.aura` 的英雄覆盖格（金色半透明，与 `getHeroAuraMultiplierForDefenseTower` 使用相同 `getRangeCells` 参数）。
  - **升级**：`tryUpgradeTowerOneLevel` / `applyTowerBranchUpgrade` 已取消战斗中限制；升级菜单文案已提示战斗中可升级。
  - **英雄大招**：画布下方 HUD 显示当前选中英雄（点击英雄或部署时）的技能 **名称、灵力消耗、冷却文案与 CD 条**；按钮调用 `enterUltAiming(hero,1|2)`。施放时按 `ultAimingSkillIndex` 扣灵力、写入 `heroSkill1CdUntil`/`heroSkill2CdUntil`，普通塔仍用 `ultUsedThisWave`。**修复**：`enterUltAiming` 内在 `cancelUltAiming` **之后**再写入 `ultAimingSkillIndex`，避免技能 2 被重置为 1。

## [2026-03-16] 修复：每命 HP 仍为 1/1（旧蓝图缺 hpPerLife + 输入未同步到格子）

- **类型**：Bug 修复
- **涉及文件**：`game_demo/gameMap.js`（`DEFAULT_ORE_HP_PER_LIFE=100`、`applyHpPerLifeToAllOres` 按比例修正当前命 HP）、`game_demo/mapEditorPanel.js`（`input/change` 与打开面板时同步）、`game_demo/index.html`（`?v=20260316l`）、`RECORD.md`
- **说明**：旧存档无 `hpPerLife` 时原先默认成 **1**，与面板默认 **100** 不一致；现缺字段按 **100** 应用。改「每命生命值」输入或**打开地图编辑器**时，会将该值同步到**所有矿石格**并写回蓝图，并按旧/新上限比例缩放当前命剩余 HP（避免仍显示 1/100）。

## [2026-03-16] 矿石：每条命可配置生命值(HP)，伤害扣当前命

- **类型**：修改功能
- **涉及文件**：`game_demo/gameMap.js`（`oreHpPerLife`/`oreCurrentLifeHp`、`applyOreDamage` 替代按次扣命）、`game_demo/towerDefense.js`、`game_demo/towerAttackSystem.js`、`game_demo/mapEditorPanel.js`、`game_demo/index.html`（`?v=20260316k`）、`RECORD.md`
- **说明**：每条命有相同的 **每命生命值(HP)**，塔/英雄攻击的**伤害**先扣当前命剩余 HP，扣光一条命时结算一次**每命灵力**；旧存档无 `hpPerLife` 时默认 **1**（等价于原先「一击一命」）。地图编辑器增加 **每命生命值(HP)** 输入；格子上显示「N命」与「HP 当前/最大」。

## [2026-03-16] 矿石：仅战斗期可打矿、蓝图持久化（局内矿机刷新恢复矿石）

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`（`isOreMiningCombatActive` 与基地产灵同门控、`applyOreHitFromTower` 不再写蓝图）、`game_demo/towerAttackSystem.js`、`game_demo/gameMap.js`（`minerFromOre`、`saveOreMinerBlueprintOre`/`Miner`/`removeOreMinerBlueprintEntry` 替代全表扫描存档）、`game_demo/mapEditorPanel.js`、`game_demo/index.html`（`?v=20260316j`）、`RECORD.md`
- **说明**：塔**仅在**「本波正在出兵或场上仍有敌人」时可索敌/攻击矿石（与基地产灵一致，休整期不打）。本地仅存**地图编辑器**写入的蓝图；战斗中矿石打成矿机**不写** localStorage，**刷新后**仍按蓝图恢复为**满血矿石**。编辑器「最大生命(条)」可调，同格再点「矿石」覆盖保存。

## [2026-03-16] 地图元素：矿石与矿机（塔/英雄优先敌人、编辑器可调参数）

- **类型**：新增功能
- **涉及文件**：`game_demo/gameMap.js`（`CELL_TYPES.ORE/MINER`、`damageOreOneLife`、`getOresInRangeSorted`、`saveOreMinersToStorage`/`applySavedOreMiners`）、`game_demo/towerAttackSystem.js`（先敌人后矿石）、`game_demo/towerDefense.js`（矿石弹道、`applyOreHitFromTower`、`updateMinersSpirit`）、`game_demo/mapEditorPanel.js`、`game_demo/index.html`、`game_demo/styles.css`（`?v=20260316i`）、`RECORD.md`
- **说明**：矿石有 **条命**、每打掉 **1 条命** 得 **y 灵力**；防御塔/英雄在射程内 **无敌人时** 才攻击矿石；矿石 **命尽** 变为 **矿机**，按 **x1 秒 / y1 灵力** 周期产灵（沿用编辑器里「矿机间隔/每次灵力」）。地图编辑器增加 **矿石 / 矿机** 工具及四个数字输入；擦除可删矿石/矿机。存档键 `tower_defense_map_ore_miner`，`resizeGrid` 会恢复矿石矿机。

## [2026-03-16] 第二波→第三波倒计时 UI 空白：到期后 isSpawning 阻塞时仍显示 0 / 即将

- **类型**：Bug 修复
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/gameMap.js`、`game_demo/index.html`（`?v=20260316h`）、`RECORD.md`
- **说明**：倒计时到期但 `tryAutoStartNextWave` 因上一波仍在 `isSpawning` 而出兵队列未空时失败，`interWaveCountdownEnd` 已过期，`getSpawnNextWaveCountdownSec` 原对 `remainMs<=0` 返回 null，导致右上角与出怪口整段不显示。现到期且仍有下一波配置时返回 **0**，UI 显示 **「下一波即将到达（等待出兵队列）」** / 出怪口 **「即将」**；顶层画布用 **「即将下一波」**。

## [2026-03-16] 修复：自动开波成功后勿清空 interWaveCountdownEnd（第三波倒计时被误删）

- **类型**：Bug 修复
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/index.html`（`?v=20260316g`）、`RECORD.md`
- **说明**：`update` 中倒计时到期调用 `tryAutoStartNextWave` 成功后，原逻辑再执行 `interWaveCountdownEnd = null`，把 `startNextWave` 内刚设置的「下一波」新倒计时一并清掉，导致第二波及以后不再出现第三波倒计时。已改为成功时不再置 null；仅配表无后续波或当前波次已达最大时清空。

## [2026-03-16] 即时制：nextWaveDelaySec 从「本波开始」起算，不再等清怪

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/waveConfigPanel.js`、`game_demo/index.html`（`?v=20260316f`）、`RECORD.md`
- **说明**：`nextWaveDelaySec` 语义改为：**当前波开始出兵的瞬间**起算，到时自动开下一波；与清怪、所谓「休整」无关。倒计时在 **`startNextWave` 成功且非最后一波** 时由 `scheduleNextWaveTimerAfterCurrentWaveStarted` 设置；清怪结算处不再启动倒计时。失败后点下一波须先清 `levelFailed` 再设倒计时，已调整顺序。波次配置面板 tooltip 已同步。

## [2026-03-16] 右上角固定文案「下一波到来还有 N 秒」+ 倒计时不再用波次门控

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/index.html`（`?v=20260316e`）、`RECORD.md`
- **说明**：`getSpawnNextWaveCountdownSec` 仅根据 `interWaveCountdownEnd` 计算，去掉 `wave>=1` 以免与显示波次不同步导致 UI 永远不显示。`drawUI` 中该行改为 **`下一波到来还有 N 秒`**，背景宽度 300px；构建号 **20260316e**。

## [2026-03-16] 产灵/休整倒计时仅在「点下一波进入战斗」后生效

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/index.html`（`?v=20260316d`）、`RECORD.md`
- **说明**：
  - **基地产灵**：仅当 **`isSpawning || 场上存活敌人>0`** 时累计进度并发放；未开战、休整期不涨。首次 **0→1 波** 时清零进度与墙钟锚点。
  - **下一波倒计时**（出怪口 / 画布 / 右上角）：仅当 **`getDisplayWave() >= 1`**（已至少点过一次下一波）且存在 `interWaveCountdownEnd` 时显示；开局未出兵前不出字。
  - **HUD 产灵行**：与产灵逻辑一致，仅在出兵/接敌时显示。
  - 自动开波与 `tryAutoStartNextWave` 使用 **`getDisplayWave()`** 与配表最大波次比较，避免与内部波次不同步。

## [2026-03-16] 波次结束按存活数判定 + 自动开波不清倒计时直到成功 + UI 产灵百分比

- **类型**：Bug 修复
- **涉及文件**：`game_demo/enemySystem.js`（`getAliveEnemyCount`）、`game_demo/towerDefense.js`、`game_demo/index.html`（`?v=20260316c`）、`RECORD.md`
- **说明**：
  - **波次永远不结束**：原先用 `getEnemies().length===0`，同帧内塔/子弹在 `enemyManager.update` 之后击杀时，尸体仍在数组中，判定错误；改为 **`getAliveEnemyCount()===0`**。每帧与 **`enemyManager.getCurrentWave()`** 同步 `currentWave`。
  - **自动下一波失效**：原先倒计时到期先 `interWaveCountdownEnd=null` 再 `tryAutoStartNextWave`，若当帧 `isSpawning` 等导致失败会**静默丢倒计时**；改为 **仅成功 `startNextWave` 后再清**（`startNextWave(false)` 供自动调用）。
  - **基地产灵「看不见」**：右上角 HUD 增加 **`产灵 X% (满→+N)`**（战斗中且未失败时）。构建号 **`20260316c`**。

## [2026-03-16] index.html 脚本/CSS 加 ?v= 破坏缓存 + 控制台构建号

- **类型**：修改功能（开发体验 / 排障）
- **涉及文件**：`game_demo/index.html`、`game_demo/towerDefense.js`、`RECORD.md`
- **说明**：静态引用 `towerDefense.js` 等无版本号时，浏览器易长期缓存旧文件，表现为「改了代码页面不变」。已为 **styles 与全部 script** 增加 `?v=20260316b`；**以后每次改逻辑请 bump 该版本号**。`TowerDefenseGame.SCRIPT_BUILD_ID` 与控制台绿色日志用于核对是否加载到新脚本。

## [2026-03-16] 出怪口格内倒计时 + UI 下一波时间 + 基地产灵力墙钟累计

- **类型**：Bug 修复 | 修改功能
- **涉及文件**：`game_demo/gameMap.js`、`game_demo/towerDefense.js`、`RECORD.md`
- **说明**：
  - **倒计时仍看不见**：战斗中无「下一波」间隔故不出字属正常；休整期在 **`GameMap.drawCell` 出怪口格下半部** 绘制 **`Ns`**（与编号上下错开），并在右上角 **增加「下一波: Ns」**；保留画布最后层绘制作补强。
  - **基地产灵力**：去掉 **`start()`** 内对 **`baseSpiritAccumMs` 的无条件清零**（避免与首次开战流程叠加导致「像要点下一波才开始涨」）；**关卡失败**后点「下一波」重开时在 **`startNextWave`** 内清零进度；产灵力改为 **墙钟差分**（`_baseSpiritLastTick`），少依赖帧 `deltaTime` 钳制。

## [2026-03-16] 波次倒计时置顶绘制 + 基地产灵力（英雄编辑器可调）

- **类型**：Bug 修复 | 新增功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/heroEditorPanel.js`、`game_demo/index.html`、`RECORD.md`
- **说明**：
  - **倒计时不可见**：原先在 `map.render()` 之后立刻绘制，被塔/敌人/子弹覆盖；改为在 **`drawUI()` 之后**再画，并加描边与金边便于辨认。
  - **基地产灵力**：战斗中按 **`baseSpiritIntervalMs`** 累计进度条，满周期 **`baseSpiritPerCycle`**（默认 20）写入 `gameState.spirit`；新 **`start()`** 时进度从 0 计。配置存 **`tower_defense_base_spirit_config`**，在 **英雄编辑器** 顶部「基地产灵力」编辑，应用时调用 `applyBaseSpiritConfig` 并写盘；基地血条下方绘制紫色 **灵力产出** 进度条。

## [2026-03-16] 即时制波次：清波后按 nextWaveDelaySec 自动开波 + 出怪口倒计时

- **类型**：新增功能 / 修改功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/waveConfigPanel.js`、`game_demo/waveConfig.json`、`game_demo/enemySystem.js`（既有字段）、`RECORD.md`
- **说明**：
  - 每波敌人清空并结算奖励后，读取**刚结束波次**的 `nextWaveDelaySec`（秒），到时自动 `startNextWave()`；**最后一波**（配表最大 `waveNumber`）不再自动开波。
  - 间隔为 **0** 时用 `queueMicrotask` 立即尝试开下一波；手动点「下一波」、关卡失败时**清空** `interWaveCountdownEnd`，避免与自动开波冲突。
  - 倒计时以 **「下一波 Ns」** 文案绘制在 **`map.getSpawnPointsOrdered()`** 每个出怪口格中心附近；无出怪口时画在画布底部中央作 fallback。
  - 波次配置面板与 `waveConfig.json` 增加 **`nextWaveDelaySec`** 编辑/示例。

## [2026-03-16] 塔升级改扣灵力 + 升级菜单置底 + Debug 加灵力

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/tower_upgrade_branches.json`（`levelCosts`→`levelSpiritCosts`）、`game_demo/index.html`、`game_demo/styles.css`、`game.js`、`RECORD.md`
- **说明**：防御塔升级与 3→4 分支均消耗 **`gameState.spirit`**；配置表字段改为 **`levelSpiritCosts`**（兼容旧键 `levelCosts`）。升级菜单改为**屏幕底部水平居中**固定定位。Debug 栏增加灵力输入框与 **「+ 灵力」** 按钮，调用 `towerDefenseGame.updateSpiritUI()`。

## [2026-03-16] 点击防御塔升级 1–4 级与 3→4 分支（配装暂缓）

- **类型**：新增功能 / 修改功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/tower_upgrade_branches.json`、`game_demo/index.html`、`game_demo/styles.css`、`配装道具`、`RECORD.md`
- **说明**：
  - **休整期**点击场上**非英雄**防御塔弹出固定菜单：花**灵力**升 Lv.2、Lv.3；**Lv.3→4** 若该塔在配置表中有 3 条 `branches`，则显示**三选一**分支并扣第三档 `levelSpiritCosts[2]`；**最高 Lv.4**（后改为灵力与底部菜单，见上条记录）。
  - 属性基于**放置时快照** `levelStatSnapshot` × `tower_upgrade_branches.json` 中 `levelAttackMult` / `levelAttackSpeedMult` / `levelRangeGridAdd`；分支的穿透/连射等**仅文案与 id 存档**（`effectPending`），战斗公式未改。
  - 已配置：`ranger_tower`、`boomerang_tower`、`marble_tower`（弹珠塔）、`frost_tower`（寒冰/冰霜）、`knife_tower`（飞刀塔；旧 id 已迁移）；其余塔无表则**最高 Lv.3**，费用默认 `[40,70,100]`。
  - **移动塔**：由升级菜单内「移动位置」进入原移动模式（不再一点击塔就进移动）。
  - **配装**：`aggregateLoadoutBonuses` 恒为无加成；工具栏「防御塔配装」按钮加 `hidden` 隐藏。
  - Esc / 开战下一波 / hideEvolveMenu 会关闭升级菜单。

## [2026-03-16] 特斯拉专属配装数据 + 随机三选一与金币刷新

- **类型**：新增功能
- **涉及文件**：`obj_list/tesla_loadout_items.json`、`game_demo/game.js`、`game_demo/towerLoadoutPanel.js`、`game_demo/towerDefense.js`、`game_demo/styles.css`、`game_demo/index.html`、`RECORD.md`
- **说明**：
  - 根据根目录文档《配装道具》整理 **10 个被动**、**3 个大招**配装条目（`effectPending: true`，战斗效果未实现）；`loadoutFamily: "tesla"`，`loadoutKind`: `passive` | `ultimate`。
  - `loadItemsData` 合并 `tesla_loadout_items.json`；`GameState` 增加 `getLoadoutStorageKey`（`tesla`/`tesla_elite`→`tesla`）、`rollTeslaLoadoutOffers`、`tryRefreshTeslaLoadoutOffers`（费用 **5+次数×5** 金币）、`teslaUltimateLoadoutId`；扩展存档键 `tower_defense_tesla_loadout_extras`。
  - 配装面板改为**仅列出特斯拉塔**；打开时 **免费重抽** 3 个被动候选；**刷新按钮**扣金币再抽；**大招三选一**单独区块，仅存档。
  - `towerDefense` 中配装加成键改为 `getLoadoutStorageKey(tower.id)`。

## [2026-03-16] 配装三槽 ↔ 塔 1/2/3 级累计生效 + 局内数值接入

- **类型**：修改功能
- **涉及文件**：`game_demo/game.js`、`game_demo/towerDefense.js`、`game_demo/towerLoadoutPanel.js`、`game_demo/index.html`、`obj_list/loadout_items.json`、`RECORD.md`
- **说明**：
  - 配装由 **5 槽改为 3 槽**，分别对应局内 **1 / 2 / 3 级**；**非英雄**用当前 `item.quality`（1–3）作为阶，**英雄**用 `heroLevel`（上限 3）。达 N 级时 **第 1～N 槽配装累计生效**（`aggregateLoadoutBonuses` 累加前 N 槽）。
  - `TowerDefenseGame.refreshTowerCombatStats`：在 `placeTower`、英雄移动、`evolveTower`、英雄升级后刷新；`refreshAllTowerLoadoutStats` 供配装面板保存后刷新全场塔。
  - 配装道具 `attributes` 支持 **`loadoutAttackPercent` / `loadoutAttackSpeedPercent` / `loadoutRangeGridAdd`**（示例已写入 `loadout_items.json` 前三项）。
  - 存档仍用 `tower_defense_tower_loadouts`；读档时截取旧 5 槽前 3 项；`getTowerLoadoutSlots` 兼容内存中仍存 5 元数组的情况。

## [2026-03-16] 修复：TOWER_LOADOUT_STORAGE_KEY 暂时性死区

- **类型**：Bug 修复
- **涉及文件**：`game_demo/game.js`、`RECORD.md`
- **说明**：`TOWER_LOADOUT_STORAGE_KEY` 与 `applyTowerLoadoutsFromStorage` / `saveTowerLoadoutsToStorage` 原定义在 `GameState` 之后，却在文件前部 `window.TOWER_LOADOUT_STORAGE_KEY = …` 处被引用，触发 **Cannot access before initialization**。已将常量与两函数上移到 `window` 导出块之前。

## [2026-03-16] 防御塔配装系统（UI + 存档）

- **类型**：新增功能（后续已由「配装三槽 ↔ 塔 1/2/3 级」改版）
- **涉及文件**：`game_demo/game.js`、`game_demo/towerLoadoutPanel.js`、`game_demo/index.html`、`game_demo/styles.css`、`obj_list/loadout_items.json`、`RECORD.md`
- **说明**：
  - 工具栏 **「防御塔配装」** 打开全局面板：左侧选塔，中间槽位，右侧 `category: "配装"` 道具。
  - 初版曾为 5 槽 + quality 解锁；**现改为 3 槽对应局内 1/2/3 级**，详见上一条记录。
  - 交互：右侧点选配装，再点**空槽**填入；变更调用 `saveTowerLoadoutsToStorage`，键名 `tower_defense_tower_loadouts`。

## [2026-03-16] 大招交互改为「两次点击」+ 塔/射程双色高亮

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`、`RECORD.md`
- **说明**：
  - 去掉拖动施法（`ultDrag` / `pointerdown~up`）；改为 **`ultAimingTower`**：战斗中威能满且本波未放时 **第一次点击塔** 进入瞄准 → **鼠标移动** 更新落点预览 → **第二次点击地图** 施放（再点同一塔、**右键**、**Esc** 取消）。
  - **视觉**：瞄准中的塔 **绿色强描边**；地图先画 **金色** 该塔整段攻击射程，再叠 **紫红色**「落点伤害范围」（AOE∩射程）；与悬停蓝圈、部署绿圈区分。

## [2026-03-16] 去掉塔弹窗：休整期点击移动 / 战斗中拖动放大招

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/index.html`、`RECORD.md`
- **说明**：
  - **移除**塔点击弹窗（`openEvolveMenu` 空实现，`#evolveMenu` 从页面删除）；过载/防御/进化暂无 UI 入口。
  - **波次未在战斗中**（`!isWaveCombatActive()`）：点击塔进入**移动模式**（英雄 / 非英雄逻辑同前）。
  - **战斗中**：威能满且本波未放过时，在塔上 **pointerdown** 开始拖动瞄准，**pointerup** 在塔攻击范围内锚点施放**统一大招**（`getUnifiedTowerUltimateSkill`：默认方形 AOE，伤害格 = **技能范围 ∩ 塔射程**）；使用 `setPointerCapture` 跟手。
  - 新状态：`ultDrag`、`cancelUltDrag`；`castTowerUltimateAt` 替代原点击格子 `castHeroSkillAt`。

## [2026-03-16] 威能改为每塔独立条 + 塔菜单释放大招

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/towerAttackSystem.js`、`game_demo/index.html`、`game_demo/powerEfficiencyEditorPanel.js`、`game_demo/game.js`、`RECORD.md`
- **说明**：
  - **移除**画布上方全局威能条与左下角 `#heroSkillBar`；命中伤害只为**对应塔**增加 `towerPower`（`addTowerPower`），上限为 `towerPowerMax`（默认来自威能节能编辑器的 `powerMax`，物品可配 `attributes.towerPowerMax`）。
  - **过载/防御**战场升级改为 `tryConsumeTowerPower` 扣**该塔**威能；**进化**需该塔条满后清零该塔威能。
  - **点击任意塔**统一弹出菜单：英雄含「移动」「技能1/2 大招」「进化」；非英雄含「移动」「过载/防御」「☄ 大招（`attributes.ultimate` 或默认）」「进化」。大招需条满且本波未对该塔释放（`ultUsedThisWave`），再点地图选格施放（`startSkillCasting` / `castHeroSkillAt`，清空该塔威能）。
  - 画布上为每塔绘制**威能条**（英雄在经验条下，非英雄在护盾/血条上）。

## [2026-03-16] 怪物数值仅以怪物编辑器为准（修复波次覆盖）

- **类型**：Bug 修复 + 行为调整
- **涉及文件**：`game_demo/enemySystem.js`、`game_demo/waveConfigPanel.js`、`game_demo/towerDefense.js`、`game_demo/waveConfig.json`、`game_demo/index.html`、`game_demo/styles.css`、`RECORD.md`
- **说明**：
  - **原因**：`spawnEnemy` 曾优先使用波次条目里的 `health`/`attack`/`speed` 等，导致「怪物编辑器」与 `localStorage` 中的类型数值被 **waveConfig.json / 波次面板** 覆盖，看起来像编辑器不生效。
  - **修复**：生成敌人时 **只读** `enemyTypes`（怪物编辑器维护）；波次 `setWaves` 仅保留 `type`、`count`、`spawnIndex`。
  - **波次配置 UI**：去掉每组敌人的生命/攻击/速度/金币输入，提示改去怪物编辑器；默认/示例 `waveConfig.json` 已改为精简结构。
  - 从网络异步加载 `waveConfig.json` 后调用 `reapplyMonsterEditorTypes()`，再次套用本地怪物存档，避免时序问题。

## [2026-03-16] 威能节能编辑器（全局 + 防御塔 + 英雄技能）

- **类型**：新增功能
- **涉及文件**：`game_demo/powerEfficiencyEditorPanel.js`、`game_demo/index.html`、`game_demo/game.js`、`game_demo/towerDefense.js`、`game_demo/styles.css`、`RECORD.md`
- **说明**：
  - 工具栏新增 **「威能节能编辑器」** 面板：编辑 **威能上限**、**英雄技能默认威能消耗**（`localStorage` `tower_defense_power_global_settings`）；`TowerDefenseGame.applyPowerGlobalSettings()` 在初始化与保存后读取并刷新威能条/技能栏。
  - **防御塔**：每项可改 **攻击命中获得威能**、**过载/防御战场升级**的倍率/护盾与威能消耗；写入与合并到 `tower_defense_tower_overrides` 后 `applyTowerOverrides`。
  - **英雄**：每项可改 **普攻获得威能** 与 **技能1/2** 的名称、威能消耗、图标、伤害倍率、射程与范围形状/方向；合并到 `tower_defense_hero_overrides` 后 `applyHeroOverrides`。
  - 与原有防御塔/英雄编辑器共用存储键，采用读取旧存档再合并覆盖，避免整份覆盖丢失其它字段。

## [2026-03-16] 威能条叠层显示 + 休整期移动防御塔

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/index.html`、`game_demo/styles.css`、`RECORD.md`
- **说明**：
  - **威能 UI**：单条轨道内三层绝对定位（z-index 递增）：0–100 黄橙铺满整条；100–200 紫色从左侧按比例延伸，盖住下方黄条；200–300 青色同理盖住紫条（与「每 100 一段叠色」需求一致）。
  - **防御塔换位**：仅当 **非战斗中**（`!isWaveCombatActive`：未开第一波、或本波已结算 `waveRewardGiven`、或关卡失败待命）允许；点击非英雄塔打开菜单 → **📍 移动位置** 进入移动模式，点空地执行 `tryMoveDefenseTowerTo`（不扣灵力），再点该塔取消；开战点「下一波」会 `cancelDefenseTowerMoveMode`。

## [2026-03-16] 威能上限 300 + 三段分色进度条

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/index.html`、`game_demo/styles.css`、`RECORD.md`
- **说明**：
  - `powerMax` 由 100 改为 **300**；`powerTierSize=100`，威能条 UI 为 **3 个等宽格**，每格内 0–100% 表示该段 0–100 点：第 1 段黄橙渐变、第 2 段玫红–紫、第 3 段青绿–蓝（视觉上后两段叠在前一段右侧）。
  - `updatePowerBarUI` 分别设置 `#powerBarFill1`～`3` 宽度；**威能进化**仍以「当前威能 ≥ powerMax」为准（即需攒满 300）。
  - 英雄技能默认消耗、未配置 `powerCost` 时仍为 **100**（第一段满即可施放，与此前手感一致）。

## [2026-03-16] 英雄技能：技能名 + 威能消耗展示；基地血条缩小

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/heroEditorPanel.js`、`game_demo/styles.css`、`RECORD.md`
- **说明**：
  - 左下角技能栏每个技能槽显示 **技能名称**（`attributes.skill1/2.name`，未填时默认「技能1/技能2」）与 **「X 威能」**；施放消耗来自 `skill.powerCost`（缺省为 `heroSkillPowerCost`，一般为 100），与 `castHeroSkillAt` 扣费一致。
  - `addPower` 刷新技能栏的阈值改为「威能跨过场上**最低**技能消耗」，以支持低消耗技能。
  - **英雄编辑器**为每个技能增加「名称」「威能消耗」输入；并修正 `buildHeroOverridesAndInventory` 中 `deploySpiritCost` 未从表单读取导致保存异常的问题。
  - Canvas **基地血条**：宽度略减、高度 8→5、字号 13→11，与文字间距微调。

## [2026-03-16] 战场升级消耗威能（防御塔编辑器可配）

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/towerEditorPanel.js`、`game_demo/styles.css`、`RECORD.md`
- **说明**：
  - `attributes.upgradeOverload.powerCost`、`attributes.upgradeDefense.powerCost`（默认各 **25**）在**首次切换到**过载/防御模式时由 `tryConsumePower` 扣除并刷新威能条与英雄技能栏；威能不足时对应按钮 `disabled`，菜单内显示「需 X 威能」。
  - **取消升级**不扣威能；当前已是某模式时该按钮置灰（不重复扣费）。
  - 防御塔编辑器「战场升级」增加 **过载·威能消耗**、**防御·威能消耗**；悬浮窗属性区展示各模式威能花费。

## [2026-03-16] 防御塔战场升级：过载 / 防御模式 + 编辑器配置

- **类型**：新增功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/towerEditorPanel.js`、`game_demo/styles.css`、`RECORD.md`
- **说明**：
  - 点击已部署的**非英雄**塔时，在点击附近弹出菜单（`positionEvolveMenu`）：**过载模式**（`attributes.upgradeOverload`：`attackMult`、`attackSpeedMult`，默认 1.25）在 `statBaseAttack/statAttackSpeed` 上乘倍率；**防御模式**（`upgradeDefense.shield`，默认 20）获得护盾，近战伤害经 `applyDamageToTower` 先扣护盾再扣血；**取消升级**恢复基础攻防并清空护盾。
  - 放置时写入 `statBaseAttack`、`statAttackSpeed`；`applyTowerUpgradeMode` 切换模式。威能进化后重置升级状态与护盾。
  - 画布：过载/防御用不同外圈色；有 `maxShield` 时护盾条在生命条上方。
  - **防御塔编辑器**新增「战场升级」区块写入上述字段；悬浮窗展示过载与防御参数。

## [2026-03-16] 左侧部署种类恢复为物品栏编辑器配置

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`
- **说明**：`renderTowerInventory` 不再从全量 `itemPool` 列出塔，改回遍历 **`gameState.inventory`**，仅 **数量>0** 且分类属于防御塔/英雄等的条目显示在左侧；与 `game.js` 中物品栏编辑器、英雄物品栏覆盖一致。部署仍只扣灵力、不扣库存数量。

## [2026-03-16] 部署塔仅消耗灵力，不再扣库存数量

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`
- **说明**：左侧部署栏改为从 **`gameState.itemPool`** 按 `TOWER_INVENTORY_CATEGORIES` 列出所有塔/英雄（与库存 Map 无关）。`placeTower` 不再检查/扣除 `inventory`，成功放置仅扣灵力；物品栏项去掉「x数量」行；成功放置后不再 `renderTowerInventory`（列表不变）。商店「持有道具」与物品栏编辑器逻辑未改，仍可用于其他玩法。

## [2026-03-16] 灵力移入物品栏顶部；部署灵力在每项图标左侧

- **类型**：修改功能 / UI
- **涉及文件**：`game_demo/index.html`、`game_demo/styles.css`、`game_demo/towerDefense.js`、`RECORD.md`（修正灵力说明）
- **说明**：当前灵力条置于左侧「防御塔物品栏」标题下方（`#spiritBarWrap`），棋盘下灵力条已移除；每个物品行在图标左侧增加独立 **灵力** 列显示 `getDeploySpiritCost`，属性行不再重复「灵」；物品栏宽度略增至 260px；下一波按钮恢复贴底。

## [2026-03-16] 灵力资源、基地血条在地图上、波次奖励灵力

- **类型**：新增功能
- **涉及文件**：`game_demo/game.js`（`GameState.spirit`）、`game_demo/towerDefense.js`、`game_demo/enemySystem.js`（`WaveConfig.spiritReward`）、`game_demo/waveConfigPanel.js`、`game_demo/waveConfig.json`、`game_demo/towerEditorPanel.js`、`game_demo/heroEditorPanel.js`、`game_demo/index.html`、`game_demo/styles.css`
- **说明**：
  - **灵力**：部署塔/英雄时消耗 `attributes.deploySpiritCost`（未配置默认 5），在 `placeTower` 中先于库存校验灵力；成功后扣除并 `updateSpiritUI`。`GameState` 初始灵力 40。
  - **波次**：每波可配置 `spiritReward`（波次编辑器「波次灵力」、`setWaves`/`getWaves` 持久化）；清场发奖时按 `waveConfig.getWave(currentWave).spiritReward` 增加灵力并刷新下方显示。
  - **UI**：灵力显示在左侧物品栏顶部 `#spiritBarWrap`；每项塔的**部署灵力**单独在图标左侧高亮列；右上角 HUD 去掉基地生命行；`drawBaseHealthOverlay` 在基地中心上方绘制 **当前/最大** 与血条。
  - **编辑器**：防御塔与英雄编辑增加「部署灵力」→ `deploySpiritCost`。

## [2026-03-16] 基地近战承伤与关卡失败

- **类型**：新增功能 / 修改功能
- **涉及文件**：`game_demo/enemySystem.js`、`game_demo/towerDefense.js`、`game_demo/gameMap.js`、`game_demo/index.html`、`game_demo/styles.css`、`game_demo/waveConfigPanel.js`
- **说明**：
  - 敌人不再「一碰到基地就消失并瞬时扣血」；改为与打塔相同：进入 `getBaseMeleeRadius() + 自身半径 + 2` 的贴脸距离后 `isAttackingBase = true`，由 `towerDefense.update` 按 `attackInterval` 对 `baseHealth` 造成伤害。
  - `GameMap.getBaseMeleeRadius()`：基地矩形中心到最近边的距离（2×2 时为 `min(半宽,半高)`），用于停步与 `_projectBaseAttackersToRing` 环形站位。
  - `baseHealth <= 0` 时 `triggerLevelFail()`：`levelFailed`、`isRunning = false`、`enemyManager.clearAll()`，并显示 `#levelFailPanel`（约 4 秒隐藏）。点击「下一波」若循环已停且曾失败，则回满 `baseHealth`（`maxBaseHealth`）、清 `levelFailed` 并 `start()` 恢复主循环。
  - UI 画布右上角改为「基地生命」；波次配置里攻击力 tooltip 说明近战对基地/塔均适用。

## [2026-03-16] 敌人碰撞略缩小 + 基地更近时不转而攻塔

- **类型**：修改功能
- **涉及文件**：`game_demo/enemySystem.js`
- **说明**：
  - 两两分离时使用 `ENEMY_COLLISION_RADIUS_SCALE = 0.68` × 显示半径，`ENEMY_COLLISION_PAD = 0.4`，碰撞体比原先更小、更紧凑。
  - 索敌：在检测范围内筛出塔并取最近一座后，比较 **到基地的直线距离平方** `dSqBase` 与 **到该塔的** `nearestSq`；仅当 `dSqBase >= nearestSq` 时才把该塔作为目标；若基地更近则仍朝基地推进，避免「舍近求远」打远处的塔。

## [2026-03-16] 敌人圆形碰撞体：分离堆叠与围塔站位

- **类型**：新增功能
- **涉及文件**：`game_demo/enemySystem.js`
- **说明**：沿用 `Enemy.radius` 作为碰撞半径。`EnemyManager` 在每帧移动逻辑之后调用 `resolveEnemyOverlaps`：对存活敌人做 **4 轮** 两两圆分离（最小间距 `r1+r2+1.5px`）；再对 `isBlocked` 且 `blockedByTower` 的敌人 **径向投影** 到 `塔半径 + 自身半径 + 2` 的环上，使围殴同一塔时沿塔缘分散；最后 `_clampEnemiesOutOfStones` 若中心落在石块格则八方向微移，避免被挤进石格。不新增 GC 内临时数组（复用 `this.enemies` 遍历）。

## [2026-03-16] 移除阻挡力：多怪可同时贴脸攻击同一座塔

- **类型**：修改功能 / 重构
- **涉及文件**：`game_demo/enemySystem.js`、`game_demo/towerDefense.js`、`game_demo/heroEditorPanel.js`、`game_demo/towerEditorPanel.js`、`obj_list/item.json`
- **说明**：删除 `blockingPower` / `blockedCount` 及按容量挑选目标塔的逻辑。敌人进入检测范围后**始终朝最近的塔**移动并贴脸；**不再**维护塔上阻挡计数。`isBlocked` / `blockedByTower` 仍表示「贴脸攻塔」，供塔防伤害与英雄移动时释放敌人。物品栏与编辑器去掉「挡」与阻挡力表单项；`placeTower` / `evolveTower` 不再写入上述字段；`hero_soldier` 示例数据去掉 `blockingPower`。

## [2026-03-16] 波次配置「应用」持久化到 localStorage

- **类型**：新增功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/waveConfigPanel.js`
- **说明**：`localStorage` 键 `tower_defense_wave_config`，内容为 `{ waves: [...] }`。`TowerDefenseGame` 新增 `loadWaveConfigFromStorage` / `saveWaveConfigToStorage`；`loadWaveConfig` **优先**恢复本地保存，无则再 `fetch('waveConfig.json')`。波次配置器 `applyWaves` 在 `setWaves` 后调用 `saveWaveConfigToStorage`，刷新页面后仍生效。

## [2026-03-16] 寻路：石块附近禁止斜向一步

- **类型**：修改功能
- **涉及文件**：`game_demo/gameMap.js`
- **说明**：`isDiagonalStepAllowed` 由「两侧正交至少一侧可走」改为 **两侧正交都必须可走**（`o1 && o2`）。任一侧贴石块时不再允许该斜向边，BFS 会改为横/竖绕行，减少贴石斜走导致的卡住。

## [2026-03-16] 敌人寻路：八方向（含对角线）

- **类型**：修改功能
- **涉及文件**：`game_demo/gameMap.js`
- **说明**：`findPathBFS` 由四连通改为 **八连通**（增加四个对角邻居）；新增 `isDiagonalStepAllowed`：对角步需 **与当前格相邻的两正交格至少一格可走**，避免从两块石头的夹角斜穿。步数仍按「每格一步」计，BFS 保证步数最少。

## [2026-03-16] 波次出怪口 UI 修复 + 石块绕行寻路

- **类型**：Bug 修复 / 新增功能
- **涉及文件**：`game_demo/waveConfigPanel.js`、`game_demo/index.html`、`game_demo/styles.css`、`game_demo/gameMap.js`、`game_demo/enemySystem.js`、`game_demo/towerDefense.js`
- **说明**：
  - **波次配置器**：每组敌人拆成 **wave-config-enemy-block** 两行——第一行属性+删除，第二行单独 **出怪口** 下拉；面板加宽至 `min(920px,96vw)`；`open()` 时若 `game` 未注入则回退 `window.towerDefenseGame`；`buildSpawnSelectHtml` 同样用 `getGameRef()`；增加 **「刷新出怪口列表」** 仅更新下拉选项（`refreshSpawnDropdownsOnly`），避免整表重绘冲掉未应用编辑。
  - **寻路**：`GameMap` 增加 `isWalkableForGridPath`、`findPathBFS`、`findPathToBase`（基地四格中选全局最短步数）。`Enemy` 沿路径走向 **下一格中心**，遇石块绕行；无路或剩一格时回退为直线+遇石分段。换格或换目标时重算路径；解除阻挡时清空 `_navPath`。

## [2026-03-16] 出怪口 + 波次指定生成位置

- **类型**：新增功能
- **涉及文件**：`game_demo/gameMap.js`、`game_demo/enemySystem.js`、`game_demo/waveConfigPanel.js`、`game_demo/mapEditorPanel.js`、`game_demo/towerDefense.js`、`game_demo/index.html`、`game_demo/styles.css`、`game_demo/waveConfig.json`
- **说明**：地图新增格子类型 **出怪口**（`CELL_TYPES.SPAWN`），有序列表持久化 `localStorage`：`tower_defense_map_spawn_points`；棋盘上显示 **0、1、2…** 编号（与列表下标一致）。不可放塔、不可铺基地/石块；怪物穿行不阻挡。`resolveSpawnScreenPosition(spawnIndex)`：`spawnIndex` 为 `null`/未指定时在已有口中**随机**；无出怪口时 `spawnEnemy` 仍用 **地图边缘随机**。波次每组敌人可带 **`spawnIndex`**（0..n-1），波次配置器每行增加「出怪口」下拉（随机 / 口0 / 口1…）。`applyBaseAnchor` 仅在 **persist** 时 `saveSpawnsToStorage`，避免初始化时冲掉出怪口存档。地图编辑器增加工具「出怪口」，擦除工具可同时擦掉石块或出怪口。

## [2026-03-16] 移除棋盘「路径」系统

- **类型**：重构 / 修改功能
- **涉及文件**：`game_demo/gameMap.js`、`game_demo/towerDefense.js`
- **说明**：敌人早已改为**直线进攻基地**，蛇形路径仅残留视觉与 `attackModes.path`。本次删除 `initDefaultPath` / `setPath` / `pathCells` 等逻辑，棋盘默认**全为空地**（再铺基地与石块）。`CELL_TYPES.PATH` 与路径色移除；`getPathPoints` / `getPathGridCells` / `getPathStartEnd` 保留空实现以兼容旧调用。`canPlaceTower` 仅认空地，并兼容字符串 `'path'` 旧格。塔的攻击模式在运行时**统一为 `normal`**（仍可从物品 `attackModes.normal` 读数）。非英雄塔血量条改为在**非基地格**上显示。`update` 中每帧同步路径点给 `EnemyManager` 的代码已删除。

## [2026-03-16] 地图编辑器：石块阻挡 + 基地整合

- **类型**：新增功能
- **涉及文件**：`game_demo/gameMap.js`、`game_demo/enemySystem.js`、`game_demo/towerDefense.js`、`game_demo/mapEditorPanel.js`、`game_demo/index.html`、`game_demo/styles.css`、`game_demo/game.js`
- **说明**：新增格子类型 **石块**（`CELL_TYPES.STONE`）：**不可放塔**（`canPlaceTower`）、**基地 2×2 不可压在石块上**；**怪物**在 `Enemy.update` 中分段移动，**不可进入石块格**（遇石停）。石块列表持久化 `localStorage`：`tower_defense_map_stones`；初始化/改网格在路径与基地之后 **`applySavedStones`**。边缘随机出生点避开石块。工具栏 **「放置基地」** 改为 **「地图编辑器」** 悬浮面板：工具「石块 / 擦除石块 / 放置基地(2×2)」，画布点击优先由 `MapEditorPanel.handleGridClick` 处理；`game.js` 中 `MapEditorPanel.init(towerDefenseGame)`。

## [2026-03-19] 横向棋盘 20×15 + 扩大显示区域

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/game.js`、`game_demo/index.html`、`game_demo/styles.css`
- **说明**：将默认格子数改为 **20 列 × 15 行**（横向：列多于行，棋盘在视觉上更「横」）。主容器 `max-width` 放宽到 `min(1920px,100%)`，左侧塔栏缩为 `240px`，地图容器占满剩余宽度；画布初始 `1600×900`，`resizeCanvas` 用更大可用边距并增加 `ResizeObserver` + 双 `requestAnimationFrame` 在布局稳定后再量高，避免棋盘区域过扁、两侧留白过多。

## [2026-03-19] 棋盘 15×20 与手动放置基地

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/gameMap.js`、`game_demo/game.js`、`game_demo/index.html`、`game_demo/styles.css`
- **说明**：（已由 **20×15 横向棋盘** 替代原 15×20 竖向布局；基地与手动放置逻辑仍适用。）基地 **2×2**，初始化顺序 **先路径再铺基地**。`localStorage`：`tower_defense_base_anchor`。工具栏 **「放置基地」** 预览与点击保存。

## [2026-03-19] 战斗大改：直线进攻基地 2×2、怪物检测范围优先打塔

- **类型**：修改功能 / 重构
- **涉及文件**：`game_demo/gameMap.js`、`game_demo/enemySystem.js`、`game_demo/towerAttackSystem.js`、`game_demo/towerDefense.js`、`game_demo/monsterEditorPanel.js`
- **说明**：
  - 地图左下角 **2×2** 格为**基地**（`CELL_TYPES.BASE`），不可放置防御塔；`getBaseCenterScreen` / `isPointInBaseArea` 供寻路与抵达判定；
  - 敌人**不再沿路径移动**，在 `getRandomSpawnOnMapEdge()` 于地图边缘随机出生，**直线**朝基地中心移动；进入基地范围或足够接近即视为抵达并扣基地生命；
  - 每个敌人有 **`detectionRange`（像素）**：以自身为圆心，若范围内存在**仍有阻挡容量**的防御塔，则按距离**优先**朝最近的塔移动并贴脸阻挡（沿用 `blockedCount` / `blockingPower`）；
  - `EnemyManager` 构造改为 `new EnemyManager(canvas, game)`；`towerAttackSystem` 索敌排序改为按**到基地中心的直线距离**；
  - 怪物编辑器增加「检测范围(px)」；波次配置可带 `detectionRange` 覆盖。

## [2026-03-19] 英雄简易经验：造成伤害得经验，显示生命/经验条与等级

- **类型**：新增功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/towerAttackSystem.js`
- **说明**：部署英雄时初始化 `heroLevel=1`、`heroXp`、`heroXpToNext`（升级需求：`100 + (等级-1)*50`）。英雄对怪物造成**有效伤害数值**（取整）即加等量经验；支持**飞行弹命中**、`towerAttackSystem` 即时命中（若英雄将来无弹道）、**技能 AOE 伤害**。地图上用 `Lv.x`、绿色生命条、蓝色经验条叠在英雄上方。升级时 `console.log` 输出便于调试。

## [2026-03-19] 英雄手动技能：左下角图标点击施放（消耗100威能）

- **类型**：新增功能
- **涉及文件**：`game_demo/index.html`、`game_demo/styles.css`、`game_demo/towerDefense.js`、`game_demo/heroEditorPanel.js`、`obj_list/item.json`
- **说明**：
  - 英雄物品通过 `attributes.skill1` / `attributes.skill2` 配置技能：图标、`damageMultiplier`、`rangeGrid`、`rangeShape`、`rangeDirection`；
  - 英雄部署后在屏幕左下角显示“每个英雄两技能”的图标按钮，点击技能进入“选择目标格”状态，下一次点击任意格子时对技能AOE范围内的敌人造成一次伤害；
  - 施放消耗 100 威能（本项目 `powerMax=100`，施放后威能直接清零），并在当前波次全场仅允许释放 1 次；开新波次会重置可释放次数；
  - 英雄编辑器同时补齐技能字段的编辑与保存，刷新后可恢复配置。

## [2026-03-19] 新增英雄系统：可部署可移动并复用塔攻击逻辑

- **类型**：新增功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/game.js`、`obj_list/item.json`
- **说明**：新增 `category: "英雄"` 的可部署单位，并将其纳入左侧“防御塔栏位”。部署后英雄会作为普通塔一样进入 `towers` 数组，复用 `TowerAttackSystem` 完成寻敌与攻击；点击已部署英雄进入移动模式，再点击目标格移动英雄（允许移动到空地/路径），移动时会释放被该英雄阻挡的敌人并同步维护 `blockedCount`，随后根据新格子类型刷新英雄攻击模式与范围属性。补充了一个示例英雄数据 `obj_list/item.json` 的 `hero_soldier`，便于直接测试。

## [2026-03-19] 新增英雄编辑器：编辑英雄并设置物品栏数量可保存

- **类型**：新增功能
- **涉及文件**：`game_demo/index.html`、`game_demo/game.js`、`game_demo/heroEditorPanel.js`、`game_demo/towerDefense.js`
- **说明**：新增 `英雄编辑器` 弹窗，可编辑 `category: "英雄"` 的物品：名称/图标/描述/基础属性（攻击、攻速、射程格、生命、阻挡力、能量获取），并填写“物品栏x”数量。点击应用后同时保存英雄覆盖到 `tower_defense_hero_overrides`，并保存英雄数量覆盖到 `tower_defense_hero_inventory_override`，刷新后仍可恢复。英雄会出现在左侧“防御塔栏位”（category: 英雄），可直接部署与攻击。

## [2026-03-19] 修复进化菜单不可点击/移动即消失

- **类型**：Bug 修复
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/styles.css`
- **说明**：
  - 将进化菜单改为固定在页面底部居中显示；
  - 去掉 Canvas `mouseleave` 时隐藏进化菜单的逻辑；
  - 改为“点击弹窗外才关闭”，并在 `document click` 里忽略画布点击，避免菜单刚打开就被立刻关闭。

## [2026-03-19] 防御塔进化机制：威能满100替换Elite并染色

- **类型**：新增功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/gameMap.js`、`game_demo/game.js`、`game_demo/index.html`、`game_demo/styles.css`、`obj_list/arrow.json`、`obj_list/wizard.json`、`obj_list/guard.json`、`obj_list/boom.json`
- **说明**：防御塔在地图上可点击弹出「进化」菜单；当 `power >= 100` 且基础塔配置了 `attributes.evolveTo` 时可进化。进化会消耗 100 威能（本项目将威能清零），用进化塔 item 替换当前塔，并刷新塔的攻击/攻速/范围/生命等运行时字段。进化后的塔所在地块在 `gameMap.drawCell` 中叠加进化色（`evolutionStage`）。同时进化塔在商店中不可购买：`game.js` 对 `buyable:false` 或 `shopVisible:false` 的物品进行过滤，并在 `purchaseItem` 中二次校验。

## [2026-03-19] 修复 server/启动服务器.bat cmd 乱码导致启动失败

- **类型**：Bug 修复
- **涉及文件**：`server/启动服务器.bat`
- **说明**：将启动脚本重写为纯 ASCII，避免 Windows `cmd` 因代码页/文件编码不匹配导致 `echo/python` 等关键字解析错乱，从而出现“不是内部或外部命令”的错误。脚本使用 `%~dp0` 引用脚本目录，优先尝试 `python server.py`，否则回退到 `node server.js`。

## [2025-03-16] 开发服务器端口改为 8765 避免与其他项目冲突

- **类型**：修改功能
- **涉及文件**：`server.js`、`server.py`、`server/server.js`、`server/server.py`、`server/启动服务器.bat`、`server/启动服务器.ps1`、`game_demo/game.js`、`README_开发服务器.md`
- **说明**：将本地开发服务器端口从 8000 改为 8765，避免与用户其他本地项目占用同一端口。访问地址统一为 `http://localhost:8765/game_demo/index.html`。

## [2025-03-16] 放置时按悬停格显示对应攻击范围预览

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`
- **说明**：选中防御塔放置时，攻击范围预览随鼠标悬停格子变化：若悬停在路径格上则显示「路径上」模式的攻击范围，否则显示「普通位置」模式的范围（根据 map.getCellType 判断）。

## [2025-03-16] 防御塔「攻击模式」：普通/路径两套属性与范围形状

- **类型**：新增功能
- **涉及文件**：`game_demo/gameMap.js`、`game_demo/towerDefense.js`、`game_demo/towerAttackSystem.js`、`game_demo/towerEditorPanel.js`、`game_demo/styles.css`
- **说明**：防御塔增加攻击模式机制：放在普通格为「普通位置」模式，放在路径格为「路径上」模式。每种模式独立配置：攻击、攻速、范围格数，以及范围形状与方向。范围形状：方形(围一圈)、I型(一条线)、长方形(半包围)。I型方向：水平/垂直；长方形方向：开口上/下/左/右。gameMap.getRangeCells 增加参数 rangeShape、rangeDirection，按形状返回范围内格子。placeTower 时根据格子类型选模式并写入塔的 baseAttack、attackSpeed、rangeGrid、rangeShape、rangeDirection；范围预览与悬停使用 getTowerRangeCells；towerAttackSystem.isEnemyInRange 按塔的范围形状用 getRangeCells 判定敌人所在格是否在列表内。防御塔编辑器中增加「攻击模式」区块：普通位置与路径上各一套攻击/攻速/射程格/范围形状/范围方向，应用并保存到 attributes.attackModes（{ normal, path }），通过现有 tower overrides 持久化。

## [2025-03-16] 物品栏编辑器：指定防御塔数量并可保存

- **类型**：新增功能
- **涉及文件**：`game_demo/game.js`、`game_demo/index.html`、`game_demo/inventoryEditorPanel.js`（新建）、`game_demo/styles.css`
- **说明**：新增物品栏编辑器：工具栏按钮「物品栏编辑器」、弹窗内列出所有防御塔，每塔可设置物品栏中的数量（0 或正整数）。应用时调用 applyInventoryOverride(gameState, override, itemPool) 写入 gameState.inventory（仅影响防御塔，数量 0 的从 inventory 移除），并保存到 localStorage（key: tower_defense_inventory_override）；游戏初始化时在创建 GameState 后调用 applyInventoryOverridesFromStorage(gameState)，刷新页面后按保存的配置恢复玩家防御塔物品栏。面板打开时数量优先显示已保存的覆盖，否则显示当前物品栏数量。

## [2025-03-16] 防御塔属性「能量获取」：逻辑、编辑器与展示

- **类型**：新增功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/towerAttackSystem.js`、`game_demo/towerEditorPanel.js`
- **说明**：防御塔新增属性「能量获取」(powerGainPerHit)：每次攻击命中敌人时增加的威能点数等于该值。实现：placeTower 时从 item.attributes.powerGainPerHit 读值挂到塔对象（默认 1）；updateProjectiles 中飞行弹命中时用 proj.sourceTower.powerGainPerHit 调用 addPower(gain)；towerAttackSystem 中即时命中时用 tower.powerGainPerHit 调用 addPower。防御塔编辑器中增加「能量获取」输入，buildDataFromDom 写入 attributes.powerGainPerHit；左侧塔栏 createTowerInventoryItem 增加「能 X」展示；悬浮窗 renderTooltip 属性区增加「能量获取: X 威能/次」。

## [2025-03-16] 防御塔编辑器与保存

- **类型**：新增功能
- **涉及文件**：`game_demo/game.js`、`game_demo/index.html`、`game_demo/towerEditorPanel.js`（新建）、`game_demo/styles.css`
- **说明**：新增防御塔编辑器：工具栏按钮「防御塔编辑器」、弹窗内按物品池中所有防御塔（分类为防御塔/箭塔/法师塔/炮塔/兵营）列出，每塔可编辑名称、图标、分类、稀有度、描述、价格、攻击、攻速、射程格、生命、阻挡力。应用时构建 overrides（id -> 覆盖字段），调用 applyTowerOverrides(itemPool, overrides) 合并到物品池（原地修改），保存到 localStorage（key: tower_defense_tower_overrides），并刷新物品栏、商店塔栏、商店网格、持有道具；游戏初始化时 applyTowerOverridesFromStorage() 在 loadItemsData 之后执行，保证刷新后保留。塔在物品栏、商店、悬浮窗、已放置塔均引用同一 item 对象，故覆盖后所有展示同步更新。

## [2025-03-16] 怪物编辑器配置刷新后保留（localStorage）

- **类型**：新增功能
- **涉及文件**：`game_demo/monsterEditorPanel.js`、`game_demo/towerDefense.js`
- **说明**：怪物编辑器中点击「应用」后，除写入内存外还会将当前类型配置保存到 localStorage（key: tower_defense_enemy_types）。游戏初始化时（initEnemySystem 之后）会调用 MonsterEditorPanel.loadSavedTypes() 读取，若有则 setEnemyTypes，从而刷新页面后仍使用上次编辑的怪物属性。

## [2025-03-16] 攻击按攻击间隔结算、增加攻击间隔属性

- **类型**：修改功能
- **涉及文件**：`game_demo/enemySystem.js`、`game_demo/towerDefense.js`、`game_demo/monsterEditorPanel.js`
- **说明**：攻击力不再按“描述/时间比例”换算，改为固定单次伤害；增加「攻击间隔」（秒）：被阻挡时每隔 attackInterval 秒对塔造成一次 attack 点伤害。Enemy 增加 attackInterval、lastBlockedAttackTime；首次阻挡时 lastBlockedAttackTime = currentTime，之后当 now - lastBlockedAttackTime >= attackInterval*1000 时执行一次伤害并更新 lastBlockedAttackTime。类型配置与怪物编辑器增加 defaultAttackInterval（默认 1 秒），生成敌人时传入；怪物编辑器面板增加「攻击间隔(秒)」输入。

## [2025-03-16] 被阻挡的怪物对防御塔造成伤害

- **类型**：新增功能
- **涉及文件**：`game_demo/towerDefense.js`
- **说明**：被塔阻挡的怪物（isBlocked && blockedByTower）在每帧对阻挡塔造成伤害：伤害量 = (deltaTime/1000) * enemy.attack，即按攻击力与时间结算（约每秒造成 attack 点伤害）。塔的 currentHealth 扣减后若 ≤ 0，则从 towers 中移除、调用 map.removeTower、并解除所有 blockedByTower 为该塔的敌人的阻挡状态（isBlocked = false, blockedByTower = null）。新增 removeTower(tower) 方法负责地图释放与解除阻挡。

## [2025-03-16] 防御塔默认血量 10、路径上的塔显示血量条

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`
- **说明**：所有防御塔默认血量改为 10（`placeTower` 中 `health`/`currentHealth` 的默认值由 100 改为 10；左侧塔栏「命」在无配置时显示 10）。在 `drawTowers` 中，若塔所在格子为路径（`getCellType === CELL_TYPES.PATH`），则在塔上方绘制血量条：背景红、当前血量绿、描边，与敌人血量条风格一致。

## [2025-03-16] 塔栏显示生命与阻挡力、怪物攻击力、怪物编辑器

- **类型**：修改功能 + 新增功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/enemySystem.js`、`game_demo/waveConfigPanel.js`、`game_demo/game.js`、`game_demo/index.html`、`game_demo/styles.css`、`game_demo/monsterEditorPanel.js`（新建）
- **说明**：
  - **左侧防御塔栏**：在 `createTowerInventoryItem` 中增加「挡」即阻挡力展示，数据来自 `item.attributes.blockingPower ?? 1`，与攻、速、程、命同一行显示。
  - **怪物攻击力**：`Enemy` 增加 `attack`（到达基地时对基地造成的伤害）；`EnemyManager.update` 返回 `{ reachedEndCount, totalAttackDamage }`，到达基地的敌人按各自 `attack` 累加；游戏侧 `baseHealth -= totalAttackDamage`。类型配置与波次配置均支持 `defaultAttack` / `attack`，生成敌人时使用 `config.attack ?? typeConfig.defaultAttack ?? 1`。
  - **怪物编辑器**：工具栏新增「怪物编辑器」按钮；弹窗内展示当前 `enemyTypes`（normal/fast/tank），每类可编辑：名称、生命、攻击力、移速、金币、图标、颜色；`EnemyManager` 增加 `getEnemyTypes()`/`setEnemyTypes()` 供读写；应用后仅更新内存中的类型默认值，波次配置中未填项继续使用这些默认值。波次配置每行增加「攻击」输入，与怪物编辑器一致。

## [2025-03-16] 威能条位置与对比度、路径放塔、塔血量与阻挡力

- **类型**：修改功能 + 新增功能
- **涉及文件**：`game_demo/index.html`、`game_demo/styles.css`、`game_demo/gameMap.js`、`game_demo/towerDefense.js`、`game_demo/enemySystem.js`
- **说明**：
  - **威能条**：移至 `.game-canvas-container` 内、紧挨地图（canvas）上端；提高对比度：进度条轨道深色背景 `#2c3e50`、填充为黄橙渐变 `#f1c40f`～`#e67e22`，标签与数值深色加轻微描边。
  - **防御塔可放在路径上**：`GameMap.canPlaceTower` 改为允许 `EMPTY` 或 `PATH` 且 `!cell.hasTower`；放置后路径格仍为 PATH，仅设 `hasTower = true`。
  - **防御塔血量与阻挡力**：塔对象统一使用 `health`/`currentHealth`（来自 `item.attributes.health` 或 `baseHealth`），新增 `blockingPower`（来自 `item.attributes.blockingPower`，默认 1）、`blockedCount`（当前阻挡数）。`GameMap` 新增 `hasTowerAt(col, row)`、`getPathGridCells()`（与路径点顺序一致）。
  - **阻挡逻辑**：`Enemy` 增加 `isBlocked`、`blockedByTower`。`EnemyManager.update(deltaTime, game)` 接收 game；在调用 `enemy.update` 前若敌人将进入的路径格有塔且该塔 `blockedCount < blockingPower`，则设为阻挡并增加塔的 `blockedCount`；被阻挡的敌人本帧不移动；敌人死亡或到达终点被移除时递减对应塔的 `blockedCount`。

## [2025-03-16] 新增威能机制与威能条

- **类型**：新增功能
- **涉及文件**：`game_demo/index.html`、`game_demo/styles.css`、`game_demo/towerDefense.js`、`game_demo/towerAttackSystem.js`
- **说明**：
  - 威能条显示在游戏页屏幕顶部（`game-container` 内第一项）：标签「威能」、进度条、数值「当前/100」。样式为 `.power-bar-wrap`、`.power-bar-fill` 等，紫色渐变填充。
  - 在 `TowerDefenseGame` 中新增 `power`、`powerMax`（100）、`POWER_GAIN_PER_HIT`（1，占位常量），以及 `addPower(amount)`、`updatePowerBarUI()`。每次子弹对敌人造成伤害时调用 `addPower()`，当前为固定数值占位，后续可改为按伤害与防御塔属性计算。
  - 飞行子弹命中：在 `updateProjectiles` 中 `takeDamage` 之后调用 `this.addPower()`。
  - 炮塔/兵营即时命中：在 `TowerAttackSystem.update` 中即时命中分支内调用 `this.game.addPower()`。

## [2025-03-16] 防御塔物品栏排版优化（左图右文、加宽）

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/styles.css`
- **说明**：防御塔物品栏每项改为横向布局：左侧为图标（52×52px），右侧为名称、属性（攻/速/程/命）、数量，使用 `.tower-inventory-item-body` 包裹右侧内容；面板宽度由 200px 调整为 280px，单行更宽、信息更易读。

## [2025-03-16] 波次/关卡提示改为气泡并优化防御塔物品栏

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/index.html`、`game_demo/styles.css`
- **说明**：
  - 波次通关与关卡通过提示改为“气泡”形式：无按钮、无模糊背景，固定于页面顶部居中显示，约 2 秒后自动消失。HTML 使用 `result-bubble` 类，CSS 去掉遮罩层、`pointer-events: none`，JS 中 `showWaveClearPanel`/`showLevelClearPanel` 内用 `setTimeout(..., 2000)` 自动关闭，并清除旧定时器避免重复触发。
  - 移除原弹窗的“下一波”“确定”按钮及 `bindResultPanelEvents()`。
  - 左侧防御塔物品栏优化：在 `createTowerInventoryItem` 中为每个塔增加属性展示（攻、速、程、命），数据来自 `item.attributes`（baseAttack、attackSpeed、rangeGrid 经 `formatRangeGridLabel`、health/baseHealth），新增 `.tower-inventory-item-stats` 与 `.tower-stat` 样式。

## [2025-03-16] 关卡与波次结束弹窗逻辑

- **类型**：修改功能
- **涉及文件**：`game_demo/towerDefense.js`、`game_demo/index.html`、`game_demo/styles.css`
- **说明**：
  - 设定关卡：当前地图为关卡 1，每关卡固定 3 波。在 `TowerDefenseGame` 中新增 `currentLevel`、`wavesPerLevel`。
  - 波次结束逻辑调整：波次结束后不再执行“打开商店 + 免费刷新”，改为仅发放收获力金币并增长收获力、更新金币显示，然后根据是否为当前关卡最后一波弹出不同弹窗。
  - 波次通关弹窗：非本关最后一波（第 1、2 波）结束时显示“波次通关”，文案为“第 X 波通过！”，按钮“下一波”用于关闭弹窗并开始下一波。
  - 关卡通过弹窗：本关最后一波（第 3 波）结束时显示“关卡通过”，文案为“恭喜通过第 X 关！”，按钮“确定”用于关闭弹窗（后续可在此接入下一关等逻辑）。
  - 弹窗 DOM 与样式：在 `index.html` 中新增 `#waveClearPanel`、`#levelClearPanel`，在 `styles.css` 中新增 `.result-panel` 系列样式，与波次配置弹窗同级 z-index。
  - 事件绑定：在 `towerDefense.js` 的 `bindResultPanelEvents()` 中绑定“下一波”“确定”按钮，`init()` 中调用该方法。

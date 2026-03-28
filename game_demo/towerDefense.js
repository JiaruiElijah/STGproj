/**
 * 塔防游戏核心逻辑
 * 负责游戏循环、防御塔、敌人、路径、渲染等核心玩法
 */

/**
 * 塔防游戏主类
 */
class TowerDefenseGame {
    /** 与 index.html 中脚本 ?v= 同步修改，控制台可核对是否加载到新脚本 */
    static SCRIPT_BUILD_ID = '20260327w';

    /** 左侧部署栏可出现哪些种类：由物品栏编辑器/英雄物品栏写入的 inventory（数量>0）决定；部署时仍只扣灵力不扣数量 */
    static TOWER_INVENTORY_CATEGORIES = ['防御塔', '箭塔', '法师塔', '炮塔', '兵营', '英雄'];

    constructor(canvas, gameState, playerStats, gridCols = 20, gridRows = 15) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gameState = gameState; // 游戏状态（金币、库存等）
        this.playerStats = playerStats; // 玩家属性
        
        // 游戏状态
        this.isRunning = false;
        this.isPaused = false;
        this.lastFrameTime = 0;
        
        // 游戏对象
        this.towers = []; // 防御塔数组，每个元素包含 {item, col, row, x, y, ...}
        this.projectiles = []; // 投射物数组
        
        // 敌人系统
        this.enemyManager = null; // 将在init中初始化
        
        // 防御塔攻击系统（攻击范围内敌人、伤害、击杀奖励）
        this.towerAttackSystem = null;
        
        // 地图系统
        this.map = new GameMap(canvas, gridCols, gridRows);
        
        // 防御塔物品栏
        this.towerInventoryList = document.getElementById('towerInventoryList');
        this.selectedTowerItem = null; // 当前选中的防御塔物品
        
        // 攻击范围显示（格子半径，1 = 3*3，后续可改为按塔类型读取）
        this.towerRangeGrid = 1;
        this.previewRangeCells = null;   // 选中塔时，鼠标所在格若放置塔的范围预览
        this.hoveredTowerRangeCells = null; // 鼠标悬停在已部署塔时的范围

        // 英雄移动模式（点击已部署英雄后进入；再次点击目标格则尝试移动）
        this.movingHero = null;
        /** 非英雄塔：休整期从菜单「移动位置」进入，点空地换位 */
        this.movingDefenseTower = null;

        // 悬浮窗
        this.tooltip = document.getElementById('towerTooltip');
        this.tooltipItem = null; // 当前显示悬浮窗的物品
        this.tooltipTimeout = null; // 悬浮窗显示延迟

        // 原塔进化菜单 DOM 已移除；保留 null 兼容 hideEvolveMenu
        this.evolveMenu = document.getElementById('evolveMenu');
        this.evolveMenuTower = null; // 当前菜单对应的塔
        this.evolveMenuTimeout = null;

        /** 休整期点击防御塔：升级 / 3→4 分支 / 进入移动模式 */
        this.towerUpgradeMenu = document.getElementById('towerUpgradeMenu');
        this.towerUpgradeMenuTower = null;

        // 大招：战斗中威能满的塔第一次点击进入瞄准；塔与射程高亮；鼠标移动预览落点；第二次点击地图施放（再点该塔取消）
        this.heroSkillBar = document.getElementById('heroSkillBar'); // 已废弃，保留兼容避免空引用
        /** @type {Object|null} 正在瞄准大招的塔 */
        this.ultAimingTower = null;
        /** 英雄大招：当前瞄准的技能 1 或 2 */
        this.ultAimingSkillIndex = 1;
        /** 大招落点预览格（AOE ∩ 塔射程） */
        this.heroSkillPreviewCells = null;
        /** 画布下方英雄大招 HUD 容器 */
        this.heroUltimateHudEl = null;
        /** 大招 HUD 当前关联的英雄（点击英雄或部署时更新；移除后回退到场上第一座英雄） */
        this.heroUltHudTower = null;
        /** HUD 按钮是否已绑定（避免重复监听） */
        this._heroUltHudBound = false;

        /** 地图编辑器：基地 2×2 预览左上角（由 MapEditorPanel 工具「放置基地」驱动） */
        this.previewBaseAnchor = null;
        /** 地图编辑器：石块/擦除工具悬停格 */
        this.previewMapEditCell = null;
        
        // 游戏数据
        this.maxBaseHealth = 20; // 基地最大生命（失败后用「下一波」恢复主循环时会回满）
        this.baseHealth = this.maxBaseHealth; // 基地生命值（被近战怪按攻击间隔持续扣除，归零则关卡失败）
        this.currentWave = 0; // 当前波次
        this.currentLevel = 1; // 当前关卡（当前地图为关卡1）
        this.wavesPerLevel = 3; // 每关卡波次数
        this.enemiesSpawned = 0; // 已生成的敌人数量
        this.enemiesKilled = 0; // 已击杀的敌人数量
        this.waveRewardGiven = true; // 本波是否已发放波次结束奖励（未开波时为 true 避免误发）
        /** 下一波自动开启时刻（ms）；波次结束后按配置 nextWaveDelaySec 倒计时，到时调用 startNextWave */
        this.interWaveCountdownEnd = null;

        /** 基地产灵力：周期(ms)、每周期发放量；英雄编辑器写入 localStorage 后开局加载 */
        this.baseSpiritIntervalMs = 10000;
        this.baseSpiritPerCycle = 20;
        /** 本局累计毫秒，满周期则加灵力并扣除周期 */
        this.baseSpiritAccumMs = 0;
        /** 基地产灵力：上一帧时间戳，用墙钟差分避免与「下一波」触发的帧间隔异常 */
        this._baseSpiritLastTick = null;
        this.waveClearTimer = null;  // 波次通关气泡自动关闭定时器
        this.levelClearTimer = null; // 关卡通过气泡自动关闭定时器
        this.levelFailTimer = null;  // 关卡失败气泡自动关闭定时器
        /** 基地血量归零后为 true，停止主循环并弹出失败提示 */
        this.levelFailed = false;
        
        /** 单塔威能条上限默认值（物品可配 attributes.towerPowerMax 覆盖；威能节能编辑器写入 powerMax） */
        this.defaultTowerPowerMax = 100;
        /** 每次伤害增加的威能（占位常量，实际用塔的 powerGainPerHit） */
        this.POWER_GAIN_PER_HIT = 1;
        
        // 初始化
        this.init();
    }
    
    /**
     * 初始化游戏
     */
    init() {
        console.log('塔防游戏初始化...');
        
        // 设置Canvas尺寸
        this.resizeCanvas();
        
        // 初始化敌人系统
        this.initEnemySystem();
        
        // 加载已保存的怪物类型配置（怪物编辑器应用后会写入 localStorage，刷新后保留）
        if (window.MonsterEditorPanel && typeof window.MonsterEditorPanel.loadSavedTypes === 'function') {
            const saved = window.MonsterEditorPanel.loadSavedTypes();
            if (saved && Object.keys(saved).length > 0) {
                this.enemyManager.setEnemyTypes(saved);
                console.log('已加载已保存的怪物类型配置');
            }
        }
        
        // 绑定事件
        this.bindEvents();
        
        // 渲染防御塔物品栏
        this.renderTowerInventory();
        
        // 加载波次配置：优先本地已保存（波次配置器「应用」），否则 waveConfig.json
        this.loadWaveConfig();

        // 防御塔点击升级与 3→4 分支配置
        this.loadTowerUpgradeBranches();

        // 威能节能编辑器：单塔威能条默认上限等
        this.applyPowerGlobalSettings();

        // 基地产灵力周期（英雄编辑器保存于 localStorage）
        this.loadBaseSpiritConfigFromStorage();

        // 布局稳定后再量一次容器，避免首帧 flex 高度未算完导致棋盘偏小
        requestAnimationFrame(() => {
            this.resizeCanvas();
            requestAnimationFrame(() => this.resizeCanvas());
        });
        
        this.updateSpiritUI();
        this.ensureHeroUltimateHud();
        console.log(
            '%c[塔防] 脚本构建 ' + TowerDefenseGame.SCRIPT_BUILD_ID,
            'color:#2ecc71;font-weight:bold',
            '— 若功能与预期不符：请用 Ctrl+Shift+R 强制刷新，或 DevTools → Network → Disable cache 后再刷新'
        );
        console.log('塔防游戏初始化完成');
    }

    /**
     * 部署该物品所需灵力（未配置时默认 5）
     * @param {Object} item
     * @returns {number}
     */
    getDeploySpiritCost(item) {
        if (!item || !item.attributes) return 5;
        const v = item.attributes.deploySpiritCost;
        if (v == null || v === '') return 5;
        const n = Number(v);
        if (Number.isNaN(n)) return 5;
        return Math.max(0, Math.floor(n));
    }

    /**
     * 更新物品栏顶部的当前灵力显示
     */
    updateSpiritUI() {
        const el = document.getElementById('spiritBarValue');
        if (el && this.gameState) {
            el.textContent = String(Math.max(0, Math.floor(this.gameState.spirit || 0)));
        }
    }

    /** localStorage 键：与英雄编辑器「基地产灵力」一致 */
    static BASE_SPIRIT_CONFIG_KEY = 'tower_defense_base_spirit_config';

    /**
     * 从本地读取基地产灵力参数（周期 ms、每周期灵力）
     */
    loadBaseSpiritConfigFromStorage() {
        try {
            const raw = localStorage.getItem(TowerDefenseGame.BASE_SPIRIT_CONFIG_KEY);
            if (!raw) return;
            const d = JSON.parse(raw);
            this.applyBaseSpiritConfig(d);
        } catch (e) {
            console.warn('[基地] 读取产灵力配置失败', e);
        }
    }

    /**
     * 应用基地产灵力参数（英雄编辑器「应用」时也会调用）
     * @param {{ intervalMs?: number, spiritPerCycle?: number }} cfg
     */
    applyBaseSpiritConfig(cfg) {
        if (!cfg || typeof cfg !== 'object') return;
        const iv = cfg.intervalMs != null ? Number(cfg.intervalMs) : this.baseSpiritIntervalMs;
        const amt = cfg.spiritPerCycle != null ? Number(cfg.spiritPerCycle) : this.baseSpiritPerCycle;
        this.baseSpiritIntervalMs = Math.max(500, Number.isFinite(iv) ? iv : 10000);
        this.baseSpiritPerCycle = Math.max(1, Math.floor(Number.isFinite(amt) ? amt : 20));
        console.log('[基地] 产灵力配置', this.baseSpiritIntervalMs, 'ms / +' + this.baseSpiritPerCycle);
    }

    /**
     * 战斗中基地按周期产出灵力（进度满一条周期则 +spiritPerCycle）
     * @param {number} deltaTime
     */
    /**
     * 是否与「基地产灵」相同的战斗时段：本波正在出兵队列中，或场上仍有存活敌人
     * （休整期、未点下一波前为 false；矿石仅在此为 true 时可被塔攻击）
     * @returns {boolean}
     */
    isOreMiningCombatActive() {
        if (!this.isRunning || this.levelFailed) return false;
        if (!this.enemyManager) return false;
        return this.enemyManager.isSpawning || this.enemyManager.getAliveEnemyCount() > 0;
    }

    updateBaseSpiritProduction() {
        // 与 isOreMiningCombatActive 一致：仅战斗时段涨条
        if (!this.isOreMiningCombatActive()) {
            this._baseSpiritLastTick = null;
            return;
        }
        const now = performance.now();
        if (this._baseSpiritLastTick == null) this._baseSpiritLastTick = now;
        let dt = now - this._baseSpiritLastTick;
        this._baseSpiritLastTick = now;
        // 单帧过长（切回标签页等）封顶，避免一次跳满多根条
        dt = Math.min(120, Math.max(0, dt));
        const iv = Math.max(500, this.baseSpiritIntervalMs || 10000);
        const amtBase = Math.max(1, this.baseSpiritPerCycle || 20);
        const spiritBonus = this.playerStats && this.playerStats.getStat ? (this.playerStats.getStat('base_spirit_output_bonus') || 0) : 0;
        const amt = Math.max(1, Math.floor(amtBase * (1 + spiritBonus)));
        this.baseSpiritAccumMs = (this.baseSpiritAccumMs || 0) + dt;
        while (this.baseSpiritAccumMs >= iv) {
            this.baseSpiritAccumMs -= iv;
            this.gameState.spirit = Math.max(0, (this.gameState.spirit || 0) + amt);
            this.updateSpiritUI();
            console.log(`[基地] 产灵力 +${amt}，当前灵力 ${this.gameState.spirit}`);
        }
    }

    /**
     * 从物品数据读取过载模式倍率（防御塔编辑器 upgradeOverload）
     * @param {Object} item
     * @returns {{ attackMult: number, attackSpeedMult: number }}
     */
    getUpgradeOverloadConfig(item) {
        const u = item && item.attributes ? item.attributes.upgradeOverload : null;
        const atk = u && u.attackMult != null ? Number(u.attackMult) : 1.25;
        const spd = u && u.attackSpeedMult != null ? Number(u.attackSpeedMult) : 1.25;
        const pc = u && u.powerCost != null ? Number(u.powerCost) : 25;
        return {
            attackMult: Math.max(1, Number.isFinite(atk) ? atk : 1.25),
            attackSpeedMult: Math.max(1, Number.isFinite(spd) ? spd : 1.25),
            powerCost: Math.max(0, Math.floor(Number.isFinite(pc) ? pc : 25))
        };
    }

    /**
     * 从物品数据读取防御模式护盾量（防御塔编辑器 upgradeDefense）
     * @param {Object} item
     * @returns {{ shield: number }}
     */
    getUpgradeDefenseConfig(item) {
        const u = item && item.attributes ? item.attributes.upgradeDefense : null;
        const sh = u && u.shield != null ? Number(u.shield) : 20;
        const pc = u && u.powerCost != null ? Number(u.powerCost) : 25;
        return {
            shield: Math.max(0, Math.floor(Number.isFinite(sh) ? sh : 20)),
            powerCost: Math.max(0, Math.floor(Number.isFinite(pc) ? pc : 25))
        };
    }

    /**
     * 从物品读取该塔威能条上限（未配置则用 defaultTowerPowerMax）
     * @param {Object} item
     * @returns {number}
     */
    getTowerPowerMaxForItem(item) {
        const att = item && item.attributes ? item.attributes : {};
        if (att.towerPowerMax != null) {
            const n = Number(att.towerPowerMax);
            if (Number.isFinite(n) && n >= 1) return Math.floor(n);
        }
        return Math.max(1, this.defaultTowerPowerMax || 100);
    }

    /**
     * 确保运行时塔对象存在威能字段（兼容旧存档或中途改配置）
     * @param {Object} tower
     */
    ensureTowerPowerFields(tower) {
        if (!tower) return;
        if (tower.towerPowerMax == null || tower.towerPowerMax < 1) {
            tower.towerPowerMax = this.getTowerPowerMaxForItem(tower.item);
        }
        if (tower.towerPower == null || tower.towerPower < 0) tower.towerPower = 0;
        tower.towerPower = Math.min(tower.towerPowerMax, tower.towerPower);
    }

    /**
     * 该塔威能是否已满（可释放大招 / 进化）
     * @param {Object} tower
     * @returns {boolean}
     */
    isTowerPowerFull(tower) {
        if (!tower) return false;
        this.ensureTowerPowerFields(tower);
        return tower.towerPower >= tower.towerPowerMax;
    }

    /**
     * 命中敌人时：为该塔增加威能（仅该塔条增长）
     * @param {Object} tower
     * @param {number} [amount]
     */
    addTowerPower(tower, amount) {
        if (!tower) return;
        const gain = amount != null ? amount : this.POWER_GAIN_PER_HIT;
        const g = Math.max(0, Number(gain) || 0);
        if (g <= 0) return;
        this.ensureTowerPowerFields(tower);
        tower.towerPower = Math.min(tower.towerPowerMax, tower.towerPower + g);
    }

    /**
     * 消耗该塔威能（过载/防御战场升级）；不足则返回 false
     * @param {Object} tower
     * @param {number} amount
     * @returns {boolean}
     */
    tryConsumeTowerPower(tower, amount) {
        if (!tower) return false;
        this.ensureTowerPowerFields(tower);
        const c = Math.max(0, Math.floor(Number(amount) || 0));
        if (c <= 0) return true;
        if (tower.towerPower < c) return false;
        tower.towerPower -= c;
        return true;
    }

    /**
     * 英雄技能：展示用（编辑器仍可能配置 powerCost；局内大招以「满条」为准）
     * @param {Object|null|undefined} skill
     * @returns {number}
     */
    getHeroSkillPowerCost(skill) {
        const def = this.defaultTowerPowerMax != null ? this.defaultTowerPowerMax : 100;
        if (!skill || skill.powerCost == null) return def;
        const n = Number(skill.powerCost);
        return Math.max(0, Math.floor(Number.isFinite(n) ? n : def));
    }

    /**
     * 技能展示名称（优先配置 name，否则默认 技能1/技能2）
     * @param {Object|null|undefined} skill
     * @param {number} skillIndex 0 或 1
     * @returns {string}
     */
    getHeroSkillDisplayName(skill, skillIndex) {
        const raw = skill && skill.name != null ? String(skill.name).trim() : '';
        if (raw) return raw;
        return skillIndex === 0 ? '技能1' : '技能2';
    }

    /**
     * 应用战场升级模式：过载（攻防速倍率）或防御（护盾）；null 为取消
     * @param {Object} tower
     * @param {string|null} mode - 'overload' | 'defense' | null
     */
    applyTowerUpgradeMode(tower, mode) {
        if (!tower || tower.isHero || tower.category === '英雄') return;
        if (tower.statBaseAttack == null) {
            tower.statBaseAttack = tower.baseAttack != null ? tower.baseAttack : 0;
        }
        if (tower.statAttackSpeed == null) {
            tower.statAttackSpeed = tower.attackSpeed != null ? tower.attackSpeed : 1;
        }
        const baseA = tower.statBaseAttack;
        const baseS = tower.statAttackSpeed;
        tower.upgradeMode = mode || null;

        if (mode === 'overload') {
            const ol = this.getUpgradeOverloadConfig(tower.item);
            tower.baseAttack = baseA * ol.attackMult;
            tower.attackSpeed = baseS * ol.attackSpeedMult;
            tower.shield = 0;
            tower.maxShield = 0;
        } else if (mode === 'defense') {
            const df = this.getUpgradeDefenseConfig(tower.item);
            tower.baseAttack = baseA;
            tower.attackSpeed = baseS;
            tower.maxShield = df.shield;
            tower.shield = df.shield;
        } else {
            tower.baseAttack = baseA;
            tower.attackSpeed = baseS;
            tower.shield = 0;
            tower.maxShield = 0;
        }
        tower.lastAttackTime = 0;
        console.log(`[升级] ${tower.name} → ${mode || '无'}`, { baseAttack: tower.baseAttack, attackSpeed: tower.attackSpeed, shield: tower.shield });
    }

    /**
     * 局内塔「等级」1–3：非英雄用物品 quality；英雄用 heroLevel（上限 3）
     * @param {Object} tower
     * @returns {number} 1–3
     */
    getTowerBattleTier(tower) {
        if (!tower) return 1;
        if (tower.isHero || tower.category === '英雄') {
            const lv = tower.heroLevel != null ? Number(tower.heroLevel) : 1;
            return Math.max(1, Math.min(3, Number.isFinite(lv) ? Math.floor(lv) : 1));
        }
        // 非英雄：局内点击升级等级 1–4，配装等仍按 1–3 阶处理
        const lv = tower.runtimeLevel != null ? Number(tower.runtimeLevel) : 1;
        const n = Number.isFinite(lv) ? Math.floor(lv) : 1;
        return Math.max(1, Math.min(3, n));
    }

    /**
     * 从物品读取指定攻击模式下的原始攻防与范围（不含配装、不含过载倍率）
     * @param {Object} item
     * @param {string} [attackMode]
     * @returns {{ baseAttack: number, attackSpeed: number, rangeGrid: number, rangeShape: string, rangeDirection: string|null }}
     */
    getTowerItemBaseCombatStats(item, attackMode = 'normal') {
        if (!item) {
            return { baseAttack: 0, attackSpeed: 1, rangeGrid: 1, rangeShape: 'square', rangeDirection: null };
        }
        const modes = item.attributes?.attackModes;
        const modeConfig = (modes && modes[attackMode]) ? modes[attackMode] : (modes && (modes.normal || modes.path)) ? (modes.normal || modes.path) : null;
        const baseAttack = modeConfig?.attack != null ? modeConfig.attack : (item.attributes?.baseAttack || 0);
        const attackSpeed = modeConfig?.attackSpeed != null ? modeConfig.attackSpeed : (item.attributes?.attackSpeed || 1.0);
        const rangeOpts = this.getTowerRangeOptions(item, attackMode);
        const rangeGrid = Math.max(0.5, rangeOpts.rangeGrid);
        return {
            baseAttack,
            attackSpeed,
            rangeGrid,
            rangeShape: rangeOpts.rangeShape || 'square',
            rangeDirection: rangeOpts.rangeDirection ?? null
        };
    }

    /**
     * 累计第 1～tier 槽（下标 0～tier-1）配装道具的加成；配装 JSON 使用 attributes.loadoutAttackPercent 等
     * @param {number} tier 1–3
     * @param {string} towerTemplateId 塔物品 id（与运行时 tower.id 一致）
     * @returns {{ atkMul: number, spdMul: number, rangeGridAdd: number }}
     */
    aggregateLoadoutBonuses(tier, towerTemplateId) {
        // 当前版本暂不叠加配装数值（专注点击升级与分支）
        return { atkMul: 1, spdMul: 1, rangeGridAdd: 0 };
    }

    /**
     * 按当前物品、阶数与配装刷新攻防与射程；非英雄会写入 stat* 并重新套用战场升级（过载/防御）
     * @param {Object} tower
     */
    refreshTowerCombatStats(tower) {
        if (!tower || !tower.item) return;
        const mode = tower.attackMode || 'normal';
        const raw = this.getTowerItemBaseCombatStats(tower.item, mode);

        if (!tower.isHero && tower.category !== '英雄') {
            if (!tower.levelStatSnapshot) {
                tower.runtimeLevel = tower.runtimeLevel || 1;
                tower.baseTowerTypeId = tower.baseTowerTypeId || tower.item?.id;
                tower.levelStatSnapshot = {
                    baseAttack: raw.baseAttack,
                    attackSpeed: raw.attackSpeed,
                    rangeGrid: raw.rangeGrid,
                    rangeShape: raw.rangeShape,
                    rangeDirection: raw.rangeDirection
                };
            }
        }

        let atk = raw.baseAttack;
        let spd = raw.attackSpeed;
        let rg = Math.max(0.5, raw.rangeGrid);
        let rShape = raw.rangeShape;
        let rDir = raw.rangeDirection;

        if (!tower.isHero && tower.category !== '英雄' && tower.levelStatSnapshot) {
            const snap = tower.levelStatSnapshot;
            const lv = Math.min(4, Math.max(1, tower.runtimeLevel || 1));
            const cfgKey = this.getTowerUpgradeConfigKey(tower);
            const cfg = this.getTowerUpgradeCfgForKey(cfgKey);
            const idx = lv - 1;
            const aM = cfg?.levelAttackMult?.[idx] ?? (1 + 0.08 * idx);
            const sM = cfg?.levelAttackSpeedMult?.[idx] ?? (1 + 0.05 * idx);
            const rAdd = cfg?.levelRangeGridAdd?.[idx] ?? 0;
            atk = snap.baseAttack * (Number.isFinite(Number(aM)) ? Number(aM) : 1);
            spd = snap.attackSpeed * (Number.isFinite(Number(sM)) ? Number(sM) : 1);
            rg = Math.max(0.5, snap.rangeGrid + (Number.isFinite(Number(rAdd)) ? Number(rAdd) : 0));
            rShape = snap.rangeShape;
            rDir = snap.rangeDirection;
        }

        const branchRt = this.buildTowerBranchRuntime(tower);
        tower.branchRuntime = branchRt;
        if (!tower.isHero && tower.category !== '英雄' && tower.levelStatSnapshot) {
            atk *= branchRt.statDmgMul;
            spd *= branchRt.statSpdMul;
            rg = Math.max(0.5, rg + branchRt.statRangeAdd);
        }

        const tier = this.getTowerBattleTier(tower);
        const loadoutKey = this.gameState.getLoadoutStorageKey
            ? this.gameState.getLoadoutStorageKey(tower.id)
            : tower.id;
        const b = this.aggregateLoadoutBonuses(tier, loadoutKey);

        tower.baseAttack = Math.max(0, atk * b.atkMul);
        tower.attackSpeed = Math.max(0.01, spd * b.spdMul);
        tower.rangeGrid = Math.max(0.5, rg + b.rangeGridAdd);
        tower.rangeShape = rShape;
        tower.rangeDirection = rDir;

        if (!tower.isHero && tower.category !== '英雄') {
            const auraM = this.getHeroAuraMultiplierForDefenseTower(tower);
            tower.baseAttack = Math.max(0, tower.baseAttack * auraM.atkMul);
            tower.attackSpeed = Math.max(0.01, tower.attackSpeed * auraM.spdMul);
            tower.statBaseAttack = tower.baseAttack;
            tower.statAttackSpeed = tower.attackSpeed;
            this.applyTowerUpgradeMode(tower, tower.upgradeMode);
            this.syncTowerEvolutionStageVisual(tower);
        }

        // 玩家属性「生命值加成」：按物品原始血量乘算，保持当前血量比例
        if (this.playerStats && tower.item) {
            const rawHp = Number(tower.item.attributes?.health ?? tower.item.attributes?.baseHealth ?? 10);
            const hpBonus = this.playerStats.getStat('max_health_bonus') || 0;
            const maxHp = Math.max(1, Math.round(rawHp * (1 + hpBonus)));
            const oldMax = tower.health != null ? tower.health : rawHp;
            const cur = tower.currentHealth != null ? tower.currentHealth : oldMax;
            const ratio = oldMax > 0 ? Math.min(1, cur / oldMax) : 1;
            tower.health = maxHp;
            tower.currentHealth = Math.max(0, Math.round(maxHp * ratio));
        }
    }

    /**
     * 英雄光环有效格半径（含玩家「英雄光环范围加成」）
     * @param {Object} heroTower
     * @param {number} baseRg
     * @returns {number}
     */
    getHeroAuraEffectiveRangeGrid(heroTower, baseRg) {
        let rg = Math.max(0.5, Number(baseRg) || 2);
        if (this.playerStats) {
            const b = this.playerStats.getStat('hero_aura_range_bonus') || 0;
            rg = Math.max(0.5, rg * (1 + b));
        }
        return rg;
    }

    /**
     * 英雄光环：站在任意启用光环的英雄范围内时，非英雄塔获得攻击/攻速乘区（多英雄乘算叠加）
     * @param {Object} tower - 防御塔（非英雄）
     * @returns {{ atkMul: number, spdMul: number }}
     */
    getHeroAuraMultiplierForDefenseTower(tower) {
        let atkMul = 1;
        let spdMul = 1;
        if (!tower || tower.isHero || tower.category === '英雄') return { atkMul: 1, spdMul: 1 };
        if (!this.map || !this.towers || !this.towers.length) return { atkMul: 1, spdMul: 1 };
        for (let i = 0; i < this.towers.length; i++) {
            const h = this.towers[i];
            if (!h || (!h.isHero && h.category !== '英雄')) continue;
            const aura = h.item && h.item.attributes ? h.item.attributes.aura : null;
            if (!aura || !aura.enabled) continue;
            const rg = this.getHeroAuraEffectiveRangeGrid(h, Number(aura.rangeGrid) || 2);
            const shape = aura.rangeShape || 'square';
            const dir = (shape === 'line' || shape === 'rectangle') ? (aura.rangeDirection ?? null) : null;
            const cells = this.map.getRangeCells(h.col, h.row, rg, shape, dir);
            let inside = false;
            for (let j = 0; j < cells.length; j++) {
                if (cells[j].col === tower.col && cells[j].row === tower.row) {
                    inside = true;
                    break;
                }
            }
            if (!inside) continue;
            const ap = Number(aura.attackBonusPercent);
            const sp = Number(aura.attackSpeedBonusPercent);
            if (Number.isFinite(ap) && ap !== 0) atkMul *= 1 + ap / 100;
            if (Number.isFinite(sp) && sp !== 0) spdMul *= 1 + sp / 100;
        }
        return { atkMul, spdMul };
    }

    /**
     * 场上用于大招 HUD 的英雄：优先玩家最近点选/部署的，否则第一座英雄
     * @returns {Object|null}
     */
    getHeroForUltHud() {
        const list = this.towers || [];
        if (this.heroUltHudTower && list.includes(this.heroUltHudTower)) {
            return this.heroUltHudTower;
        }
        const first = list.find(t => t && (t.isHero || t.category === '英雄')) || null;
        this.heroUltHudTower = first;
        return first;
    }

    /**
     * 确保画布下方英雄大招 HUD 存在并绑定按钮（只绑定一次）
     */
    ensureHeroUltimateHud() {
        let el = document.getElementById('heroUltimateHud');
        if (!el) return;
        this.heroUltimateHudEl = el;
        if (this._heroUltHudBound) return;
        this._heroUltHudBound = true;
        el.addEventListener('click', (e) => {
            const btn = e.target && e.target.closest ? e.target.closest('[data-hero-ult-skill]') : null;
            if (!btn) return;
            const raw = btn.getAttribute('data-hero-ult-skill');
            const idx = raw === '2' ? 2 : 1;
            const hero = this.getHeroForUltHud();
            if (!hero) return;
            e.preventDefault();
            console.log('[大招 HUD] 请求瞄准 技能', idx, hero.name);
            this.enterUltAiming(hero, idx);
        });
    }

    /**
     * 每帧刷新英雄大招 HUD：技能名、灵力消耗、冷却剩余
     */
    updateHeroUltimateHud() {
        this.ensureHeroUltimateHud();
        const root = this.heroUltimateHudEl || document.getElementById('heroUltimateHud');
        if (!root) return;
        const hero = this.getHeroForUltHud();
        if (!hero) {
            root.classList.add('hidden');
            return;
        }
        root.classList.remove('hidden');

        const setSkill = (idx, nameEl, costEl, cdEl, barEl, btnEl) => {
            const sk = this.getUnifiedTowerUltimateSkill(hero, idx);
            const cdKey = idx === 2 ? 'heroSkill2CdUntil' : 'heroSkill1CdUntil';
            const now = performance.now();
            const until = hero[cdKey] || 0;
            const remain = until > now ? (until - now) / 1000 : 0;
            const cdSec = Math.max(0, Number(sk.cooldownSec) || 0);
            if (nameEl) nameEl.textContent = sk.name || `技能${idx}`;
            const sc = this.getEffectiveHeroSpiritCost(sk.spiritCost);
            if (costEl) costEl.textContent = `灵力 ${sc}`;
            const spiritOk = (this.gameState.spirit || 0) >= sc;
            const pMax = hero.towerPowerMax != null ? hero.towerPowerMax : 100;
            const needPow = Math.min(Number(sk.powerCost) != null ? Number(sk.powerCost) : pMax, pMax);
            const powOk = (hero.towerPower || 0) >= needPow;
            const onCd = remain > 0.05;
            if (cdEl) {
                if (onCd) {
                    cdEl.textContent = `冷却 ${remain.toFixed(1)}s`;
                    cdEl.classList.add('hero-ult-oncd');
                } else {
                    cdEl.textContent = cdSec > 0 ? `就绪 (CD ${cdSec}s)` : '就绪';
                    cdEl.classList.remove('hero-ult-oncd');
                }
            }
            if (barEl) {
                // 冷却条：剩余冷却占满配置 CD 的比例（随时间缩短）
                const p = onCd && cdSec > 0 ? Math.min(1, remain / cdSec) : 0;
                barEl.style.width = `${Math.round(p * 100)}%`;
            }
            if (btnEl) {
                btnEl.disabled = onCd || !spiritOk || !powOk;
                btnEl.title = onCd ? '冷却中' : (!spiritOk ? '灵力不足' : (!powOk ? '威能不足' : '点击后移动鼠标选落点'));
            }
        };

        const hName = root.querySelector('#heroUltHeroName');
        if (hName) hName.textContent = hero.name || '英雄';

        setSkill(
            1,
            root.querySelector('#heroUltSkill1Name'),
            root.querySelector('#heroUltSkill1Cost'),
            root.querySelector('#heroUltSkill1Cd'),
            root.querySelector('#heroUltSkill1CdBar'),
            root.querySelector('#heroUltSkill1Btn')
        );
        setSkill(
            2,
            root.querySelector('#heroUltSkill2Name'),
            root.querySelector('#heroUltSkill2Cost'),
            root.querySelector('#heroUltSkill2Cd'),
            root.querySelector('#heroUltSkill2CdBar'),
            root.querySelector('#heroUltSkill2Btn')
        );
    }

    /**
     * 英雄光环「显示用」形状：未在编辑器配置 aura 时仍给默认范围，便于看见英雄周身影响格（数值加成仍见 getHeroAuraMultiplierForDefenseTower）
     * @param {Object} heroTower
     * @returns {{ rg: number, shape: string, dir: * }}
     */
    getHeroAuraDrawShape(heroTower) {
        const aura = heroTower && heroTower.item && heroTower.item.attributes ? heroTower.item.attributes.aura : null;
        if (aura && typeof aura === 'object') {
            const baseRg = Math.max(0.5, Number(aura.rangeGrid) || 2);
            const rg = this.getHeroAuraEffectiveRangeGrid(heroTower, baseRg);
            const shape = aura.rangeShape || 'square';
            const dir = (shape === 'line' || shape === 'rectangle') ? (aura.rangeDirection ?? null) : null;
            return { rg, shape, dir };
        }
        return { rg: this.getHeroAuraEffectiveRangeGrid(heroTower, 2), shape: 'square', dir: null };
    }

    /**
     * 绘制所有英雄的光环覆盖格（金色半透明，常态显示；在防御塔精灵下层）
     */
    drawHeroAuraHighlights() {
        if (!this.map || !this.towers || !this.towers.length) return;
        const cellKeys = new Set();
        const cells = [];
        for (let i = 0; i < this.towers.length; i++) {
            const h = this.towers[i];
            if (!h || (!h.isHero && h.category !== '英雄')) continue;
            const { rg, shape, dir } = this.getHeroAuraDrawShape(h);
            const part = this.map.getRangeCells(h.col, h.row, rg, shape, dir);
            for (let j = 0; j < part.length; j++) {
                const k = `${part[j].col},${part[j].row}`;
                if (!cellKeys.has(k)) {
                    cellKeys.add(k);
                    cells.push(part[j]);
                }
            }
        }
        if (cells.length > 0) {
            this.map.drawRangeHighlight(
                cells,
                'rgba(241, 196, 15, 0.22)',
                'rgba(230, 170, 40, 0.65)'
            );
        }
    }

    /**
     * 配装/升级用的塔类型键（精英塔归一到基底 id）
     * @param {Object} tower
     * @returns {string|null}
     */
    getTowerUpgradeConfigKey(tower) {
        if (!tower) return null;
        let id = tower.baseTowerTypeId || tower.item?.id;
        if (!id) return null;
        const s = String(id);
        if (s.endsWith('_elite')) return s.replace(/_elite$/, '');
        return s;
    }

    /**
     * @param {string|null} configKey
     * @returns {Object|null}
     */
    getTowerUpgradeCfgForKey(configKey) {
        const root = TowerDefenseGame.towerUpgradeBranches;
        if (!root || !configKey || String(configKey).startsWith('_')) return null;
        return root[configKey] || null;
    }

    /**
     * 八邻格（含对角）内、同基底塔类型 id 的数量（不含自身），用于游侠分支3
     * @param {Object} tower
     * @param {string} baseKey - getTowerUpgradeConfigKey 结果，如 ranger_tower
     */
    countNeighborTowersByBaseId(tower, baseKey) {
        if (!tower || tower.col == null || tower.row == null || !this.towers || !baseKey) return 0;
        let n = 0;
        for (let i = 0; i < this.towers.length; i++) {
            const t = this.towers[i];
            if (!t || t.isHero || t.category === '英雄') continue;
            if (t === tower) continue;
            if (this.getTowerUpgradeConfigKey(t) !== baseKey) continue;
            const dc = Math.max(Math.abs((t.col | 0) - (tower.col | 0)), Math.abs((t.row | 0) - (tower.row | 0)));
            if (dc <= 1) n++;
        }
        return n;
    }

    /**
     * Lv.4 已选分支：局内战斗用参数（连射、穿透、弹射、分裂、金币、冰霜减速等）
     * 与「配装道具」文档及 tower_upgrade_branches.json 一致。
     * @param {Object} tower
     * @returns {Object}
     */
    buildTowerBranchRuntime(tower) {
        const empty = () => ({
            statDmgMul: 1,
            statSpdMul: 1,
            statRangeAdd: 0,
            volleyCount: 1,
            pierceAdd: 0,
            chainBounceAdd: 0,
            critAdd: 0,
            goldKillExtraChance: 0,
            splitExtraTargets: 0,
            splitDmgScale: 0,
            frostDamageMult: 1,
            applyFrostSlow: null
        });
        if (!tower || tower.isHero || tower.category === '英雄') return empty();
        const lv = tower.runtimeLevel || 1;
        if (lv < 4 || !tower.upgradeBranchId) return empty();
        const bid = tower.upgradeBranchId;
        switch (bid) {
            case 'ranger_b1':
                return { ...empty(), statRangeAdd: 0.5, pierceAdd: 1 };
            case 'ranger_b2':
                return { ...empty(), statSpdMul: 1.15, critAdd: 0.1 };
            case 'ranger_b3': {
                const n = this.countNeighborTowersByBaseId(tower, 'ranger_tower');
                return { ...empty(), statSpdMul: 1 + 0.2 * n };
            }
            case 'boomerang_b1':
                return { ...empty(), goldKillExtraChance: 0.35 };
            case 'boomerang_b2':
                return { ...empty(), volleyCount: 3 };
            case 'boomerang_b3':
                return { ...empty(), statDmgMul: 0.75, pierceAdd: 1 };
            case 'marble_b1':
                return { ...empty(), statDmgMul: 0.75, chainBounceAdd: 2 };
            case 'marble_b2':
                return { ...empty(), volleyCount: 2 };
            case 'marble_b3':
                return { ...empty(), statDmgMul: 0.75, splitExtraTargets: 2, splitDmgScale: 0.45 };
            case 'frost_b1':
                return { ...empty(), volleyCount: 3, frostDamageMult: 1.12 };
            case 'frost_b2':
                return { ...empty(), volleyCount: 5 };
            case 'frost_b3':
                return {
                    ...empty(),
                    statRangeAdd: 0.25,
                    statDmgMul: 1.06,
                    applyFrostSlow: { factor: 0.82, ms: 2500 }
                };
            case 'knife_b1':
                return { ...empty(), volleyCount: 4, statSpdMul: 1.12 };
            case 'knife_b2':
                return { ...empty(), statDmgMul: 0.75, splitExtraTargets: 2, splitDmgScale: 0.42 };
            case 'knife_b3':
                return { ...empty(), statRangeAdd: 0.35, critAdd: 0.12 };
            default:
                return empty();
        }
    }

    /**
     * 弹珠/飞刀分支：主弹命中后对射程内其他敌人追加分裂伤害（不重复弹射）
     * @param {Object} tower
     * @param {Object} excludeEnemy
     * @param {number} mainShotDamage - 单发子弹伤害（用于按比例缩放分裂）
     * @param {number} extraCount
     * @param {number} scale - 相对单发主弹的比例
     */
    applyProjectileSplitDamage(tower, excludeEnemy, mainShotDamage, extraCount, scale) {
        if (!tower || !this.map || !this.enemyManager || extraCount <= 0 || scale <= 0) return;
        const list = this.towerAttackSystem && this.towerAttackSystem.getEnemiesInRangeSorted
            ? this.towerAttackSystem.getEnemiesInRangeSorted(tower)
            : [];
        if (!list.length) return;
        const exId = excludeEnemy && excludeEnemy.id != null ? excludeEnemy.id : null;
        const dmgEach = Math.max(1, Math.round(mainShotDamage * scale));
        let added = 0;
        for (let i = 0; i < list.length && added < extraCount; i++) {
            const e = list[i];
            if (!e || !e.isAlive) continue;
            if (exId != null && e.id === exId) continue;
            e.takeDamage(dmgEach);
            added++;
            if (this.addHeroExperienceFromDamage) {
                this.addHeroExperienceFromDamage(tower, dmgEach);
            }
        }
    }

    /**
     * 该局内塔最高等级：有分支表则为 4，否则 3
     */
    getMaxRuntimeLevelForTower(tower) {
        const cfg = this.getTowerUpgradeCfgForKey(this.getTowerUpgradeConfigKey(tower));
        if (cfg && Array.isArray(cfg.branches) && cfg.branches.length >= 3) return 4;
        return 3;
    }

    /**
     * 从当前等级升到下一级所需灵力（3→4 选分支时同样扣第三档灵力）
     * @param {Object} tower
     * @returns {number|null}
     */
    getUpgradeSpiritCostForNextLevel(tower) {
        const lv = tower.runtimeLevel || 1;
        const maxLv = this.getMaxRuntimeLevelForTower(tower);
        if (lv >= maxLv) return null;
        const cfg = this.getTowerUpgradeCfgForKey(this.getTowerUpgradeConfigKey(tower));
        const costs = cfg?.levelSpiritCosts || cfg?.levelCosts || [40, 70, 100];
        const need = costs[lv - 1];
        if (need != null && Number.isFinite(Number(need))) return Math.max(0, Math.floor(Number(need)));
        return 40 + (lv - 1) * 35;
    }

    /** 地块进化色：与 runtimeLevel 同步（最多显示到 3 档样式） */
    syncTowerEvolutionStageVisual(tower) {
        if (!this.map || typeof this.map.setTowerEvolutionStage !== 'function') return;
        if (tower == null || tower.col == null || tower.row == null) return;
        if (tower.isHero || tower.category === '英雄') return;
        const lv = Math.min(3, Math.max(1, tower.runtimeLevel || 1));
        this.map.setTowerEvolutionStage(tower.col, tower.row, lv);
    }

    hideTowerUpgradeMenu() {
        if (this.towerUpgradeMenu) this.towerUpgradeMenu.classList.add('hidden');
        this.towerUpgradeMenuTower = null;
    }

    /**
     * 休整期点击塔后弹出：升级、分支、移动（菜单位于屏幕底部居中）
     * @param {Object} tower
     */
    showTowerUpgradeMenu(tower, clientX, clientY) {
        if (!tower || tower.isHero || tower.category === '英雄') return;
        if (!this.towerUpgradeMenu) return;
        this.towerUpgradeMenuTower = tower;
        this.fillTowerUpgradeMenu(tower);
        this.positionTowerUpgradeMenu();
        this.towerUpgradeMenu.classList.remove('hidden');
    }

    /**
     * 升级菜单固定在屏幕底部居中，避免挡住棋盘中央
     */
    positionTowerUpgradeMenu() {
        const menu = this.towerUpgradeMenu;
        if (!menu) return;
        const bottomGap = 12;
        menu.style.left = '50%';
        menu.style.transform = 'translateX(-50%)';
        menu.style.bottom = `${bottomGap}px`;
        menu.style.top = 'auto';
        menu.style.right = 'auto';
    }

    _escapeUpgradeHtml(s) {
        return (s == null ? '' : String(s))
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;');
    }

    fillTowerUpgradeMenu(tower) {
        const menu = this.towerUpgradeMenu;
        if (!menu || !tower) return;

        const lv = tower.runtimeLevel || 1;
        const maxLv = this.getMaxRuntimeLevelForTower(tower);
        const costNext = this.getUpgradeSpiritCostForNextLevel(tower);
        const spirit = this.gameState?.spirit ?? 0;
        const cfgKey = this.getTowerUpgradeConfigKey(tower);
        const cfg = this.getTowerUpgradeCfgForKey(cfgKey);
        const displayName = cfg?.displayName || tower.name || tower.item?.name || '防御塔';

        let body = '';
        body += `<div class="tu-head"><strong>${this._escapeUpgradeHtml(displayName)}</strong> <span class="tu-lv">Lv.${lv} / ${maxLv}</span></div>`;
        if (tower.upgradeBranchId && lv >= 4) {
            const br = cfg?.branches?.find(b => b.id === tower.upgradeBranchId);
            if (br) {
                body += `<p class="tu-branch-picked">已选分支：${this._escapeUpgradeHtml(br.title)} — ${this._escapeUpgradeHtml(br.description)}</p>`;
            }
        }
        body += `<p class="tu-hint">战斗中也可升级（消耗灵力）。Lv.4 分支效果已接入：穿透/连射/弹射/分裂/金币/冰霜减速等见各选项说明。</p>`;
        body += `<p class="tu-spirit-row">当前灵力：<strong>${Math.floor(spirit)}</strong></p>`;

        const combat = this.isWaveCombatActive();
        if (combat && this.isTowerPowerFull(tower) && !tower.ultUsedThisWave) {
            body += `<p class="tu-ult-row"><button type="button" class="tu-btn tu-btn-ult" data-tu-action="ult">瞄准释放大招</button></p>`;
        }

        if (lv >= maxLv) {
            body += `<p class="tu-maxed">已达当前塔最高等级。</p>`;
        } else if (lv < 3 || maxLv === 3) {
            const canPay = costNext != null && spirit >= costNext;
            body += `<p class="tu-cost">下一级花费：<strong>${costNext != null ? costNext : '—'}</strong> 灵力</p>`;
            body += `<button type="button" class="tu-btn tu-btn-primary" data-tu-action="levelup" ${canPay ? '' : 'disabled'}>升级到 Lv.${lv + 1}</button>`;
        } else if (lv === 3 && maxLv === 4) {
            body += `<p class="tu-cost">升至 Lv.4 需选择分支，花费：<strong>${costNext != null ? costNext : '—'}</strong> 灵力</p>`;
            const branches = cfg?.branches || [];
            branches.forEach(br => {
                const canPay = costNext != null && spirit >= costNext;
                body += `<button type="button" class="tu-btn tu-branch-btn" data-tu-action="branch" data-branch-id="${String(br.id).replace(/"/g, '&quot;')}" ${canPay ? '' : 'disabled'}>`;
                body += `<span class="tu-bt">${this._escapeUpgradeHtml(br.title)}</span>`;
                body += `<span class="tu-bd">${this._escapeUpgradeHtml(br.description)}</span>`;
                body += `</button>`;
            });
        }

        body += `<div class="tu-actions-row">`;
        body += `<button type="button" class="tu-btn tu-btn-ghost" data-tu-action="move" ${combat ? 'disabled title="战斗中不可移动防御塔"' : ''}>移动位置</button>`;
        body += `<button type="button" class="tu-btn tu-btn-ghost" data-tu-action="close">关闭</button>`;
        body += `</div>`;

        menu.innerHTML = body;

        menu.querySelectorAll('[data-tu-action]').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const action = btn.getAttribute('data-tu-action');
                const t = this.towerUpgradeMenuTower;
                if (!t || !this.towers.includes(t)) {
                    this.hideTowerUpgradeMenu();
                    return;
                }
                if (action === 'close') {
                    this.hideTowerUpgradeMenu();
                } else if (action === 'ult') {
                    this.hideTowerUpgradeMenu();
                    this.enterUltAiming(t);
                } else if (action === 'move') {
                    this.enterTowerMoveFromMenu(t);
                } else if (action === 'levelup') {
                    if (this.tryUpgradeTowerOneLevel(t)) {
                        this.fillTowerUpgradeMenu(t);
                    }
                } else if (action === 'branch') {
                    const bid = btn.getAttribute('data-branch-id');
                    if (bid && this.applyTowerBranchUpgrade(t, bid)) {
                        this.hideTowerUpgradeMenu();
                    }
                }
            });
        });
    }

    tryUpgradeTowerOneLevel(tower) {
        if (!tower || tower.isHero || tower.category === '英雄') return false;
        const lv = tower.runtimeLevel || 1;
        const maxLv = this.getMaxRuntimeLevelForTower(tower);
        if (lv >= maxLv) return false;
        if (lv === 3 && maxLv === 4) return false;
        const cost = this.getUpgradeSpiritCostForNextLevel(tower);
        if (cost == null || (this.gameState.spirit || 0) < cost) return false;
        this.gameState.spirit = Math.max(0, (this.gameState.spirit || 0) - cost);
        tower.runtimeLevel = lv + 1;
        this.refreshTowerCombatStats(tower);
        this.updateSpiritUI();
        console.log('[塔升级]', tower.name, '→ Lv.', tower.runtimeLevel, '灵力 -', cost);
        return true;
    }

    /**
     * 3→4：选分支并扣费（分支战斗效果见 buildTowerBranchRuntime / towerAttackSystem）
     * @param {Object} tower
     * @param {string} branchId
     */
    applyTowerBranchUpgrade(tower, branchId) {
        if (!tower || tower.isHero || tower.category === '英雄') return false;
        const lv = tower.runtimeLevel || 1;
        const maxLv = this.getMaxRuntimeLevelForTower(tower);
        if (lv !== 3 || maxLv !== 4) return false;
        const cfg = this.getTowerUpgradeCfgForKey(this.getTowerUpgradeConfigKey(tower));
        if (!cfg?.branches?.some(b => b.id === branchId)) return false;
        const cost = this.getUpgradeSpiritCostForNextLevel(tower);
        if (cost == null || (this.gameState.spirit || 0) < cost) return false;
        this.gameState.spirit = Math.max(0, (this.gameState.spirit || 0) - cost);
        tower.upgradeBranchId = branchId;
        tower.runtimeLevel = 4;
        this.refreshTowerCombatStats(tower);
        this.updateSpiritUI();
        console.log('[塔升级]', tower.name, '→ Lv.4 分支', branchId, '灵力 -', cost);
        return true;
    }

    enterTowerMoveFromMenu(tower) {
        this.hideTowerUpgradeMenu();
        if (!tower || tower.isHero || tower.category === '英雄') return;
        this.movingDefenseTower = tower;
        this.cancelHeroMoveMode();
        this.cancelUltAiming();
        this.previewRangeCells = null;
        console.log('[塔防] 移动模式：点击空地移动该塔，再点该塔取消');
    }

    /**
     * 配装面板保存后：场上所有塔按模板重算（进化/升级时已单独 refresh）
     */
    refreshAllTowerLoadoutStats() {
        const list = this.towers || [];
        list.forEach(t => this.refreshTowerCombatStats(t));
    }

    /**
     * 将进化菜单定位在点击位置附近（fixed，避免挡住塔）
     * @param {number} clientX
     * @param {number} clientY
     */
    positionEvolveMenu(clientX, clientY) {
        const menu = this.evolveMenu;
        if (!menu) return;
        const margin = 8;
        const estW = 280;
        const estH = 320;
        let x = clientX + 12;
        let y = clientY + 12;
        if (x + estW > window.innerWidth - margin) {
            x = clientX - estW - 12;
        }
        if (y + estH > window.innerHeight - margin) {
            y = clientY - estH - 12;
        }
        x = Math.max(margin, Math.min(x, window.innerWidth - estW - margin));
        y = Math.max(margin, Math.min(y, window.innerHeight - estH - margin));
        menu.style.left = `${Math.round(x)}px`;
        menu.style.top = `${Math.round(y)}px`;
        menu.style.right = 'auto';
        menu.style.bottom = 'auto';
        menu.style.transform = 'none';
    }

    /**
     * 塔受到伤害：优先扣护盾，再扣生命（防御模式）
     * @param {Object} tower
     * @param {number} rawDamage
     */
    applyDamageToTower(tower, rawDamage) {
        if (!tower || rawDamage <= 0) return;
        let dmg = rawDamage;
        const sh = tower.shield != null ? tower.shield : 0;
        if (sh > 0) {
            const absorb = Math.min(sh, dmg);
            tower.shield = sh - absorb;
            dmg -= absorb;
        }
        tower.currentHealth = Math.max(0, (tower.currentHealth || 0) - dmg);
    }
    
    /**
     * 从 localStorage 读取威能节能编辑器的全局设置：单塔威能条默认上限（原「威能上限」字段 powerMax）
     */
    applyPowerGlobalSettings() {
        this.defaultTowerPowerMax = 100;
        if (typeof window.loadPowerGlobalSettings === 'function') {
            const g = window.loadPowerGlobalSettings();
            if (g && typeof g === 'object' && g.powerMax != null) {
                const n = Number(g.powerMax);
                if (Number.isFinite(n) && n >= 1) this.defaultTowerPowerMax = Math.floor(n);
            }
        }
        // 已部署塔：同步上限（当前威能不超过新上限）
        (this.towers || []).forEach(t => {
            if (!t) return;
            const nextMax = this.getTowerPowerMaxForItem(t.item);
            t.towerPowerMax = nextMax;
            if (t.towerPower == null) t.towerPower = 0;
            t.towerPower = Math.min(t.towerPowerMax, t.towerPower);
        });
    }

    /**
     * 非英雄塔默认大招配置（物品未配置 attributes.ultimate 时使用）
     * @param {Object} tower
     * @returns {Object}
     */
    getDefaultUltimateSkill(tower) {
        return {
            name: '大招',
            damageMultiplier: 2,
            rangeGrid: 1.5,
            rangeShape: 'square'
        };
    }

    /**
     * 解析塔的大招（普通塔合并默认；英雄不走此函数）
     * @param {Object} tower
     * @returns {Object}
     */
    getTowerUltimateSkillForMenu(tower) {
        const u = tower && tower.item && tower.item.attributes ? tower.item.attributes.ultimate : null;
        const base = this.getDefaultUltimateSkill(tower);
        if (u && typeof u === 'object') return { ...base, ...u };
        return base;
    }

    /**
     * 全塔统一默认大招：在锚点格施放一片 AOE，最终伤害格 = AOE ∩ 该塔攻击范围
     * 可被物品 attributes.ultimate 局部覆盖（倍率、锚点处形状等）
     * @param {Object} tower
     * @returns {Object}
     */
    /**
     * 读取英雄物品上的 skill1 / skill2
     * @param {Object} tower
     * @param {number} skillIndex 1 或 2
     * @returns {Object}
     */
    getHeroSkillConfig(tower, skillIndex) {
        const att = tower && tower.item ? tower.item.attributes : null;
        if (!att) return {};
        const sk = skillIndex === 2 ? att.skill2 : att.skill1;
        return sk && typeof sk === 'object' ? sk : {};
    }

    /**
     * 大招配置：英雄用 skill1/skill2；普通塔用 attributes.ultimate 或默认
     * @param {Object} tower
     * @param {number} [skillIndex=1] - 英雄有效
     * @returns {Object}
     */
    getUnifiedTowerUltimateSkill(tower, skillIndex = 1) {
        const base = {
            name: '战略打击',
            damageMultiplier: 1.5,
            rangeGrid: 1,
            rangeShape: 'square',
            spiritCost: 0,
            powerCost: 100,
            cooldownSec: 8
        };
        if (tower && (tower.isHero || tower.category === '英雄')) {
            const sk = this.getHeroSkillConfig(tower, skillIndex);
            const name = sk.name != null && String(sk.name).trim() !== '' ? String(sk.name).trim() : `技能${skillIndex}`;
            return {
                ...base,
                ...sk,
                name,
                damageMultiplier: sk.damageMultiplier != null ? sk.damageMultiplier : base.damageMultiplier,
                rangeGrid: sk.rangeGrid != null ? sk.rangeGrid : base.rangeGrid,
                rangeShape: sk.rangeShape || base.rangeShape,
                rangeDirection: sk.rangeDirection ?? null,
                spiritCost: sk.spiritCost != null ? Math.max(0, Number(sk.spiritCost)) : 0,
                powerCost: sk.powerCost != null ? Math.max(0, Number(sk.powerCost)) : base.powerCost,
                cooldownSec: sk.cooldownSec != null ? Math.max(0, Number(sk.cooldownSec)) : base.cooldownSec
            };
        }
        const u = tower && tower.item && tower.item.attributes ? tower.item.attributes.ultimate : null;
        if (u && typeof u === 'object') return { ...base, ...u };
        return base;
    }

    /**
     * 屏幕坐标是否点在已部署塔圆形内
     * @param {number} x
     * @param {number} y
     * @returns {Object|null} tower
     */
    tryPickTowerAtScreen(x, y) {
        for (let i = this.towers.length - 1; i >= 0; i--) {
            const tower = this.towers[i];
            const r = tower.radius != null ? tower.radius : 1;
            const dx = x - tower.x;
            const dy = y - tower.y;
            if (dx * dx + dy * dy <= r * r) return tower;
        }
        return null;
    }

    /**
     * 将格子约束到「该塔攻击范围」内的最近一格（用于大招锚点）
     * @param {number} col
     * @param {number} row
     * @param {Object} tower
     * @returns {{ col: number, row: number }}
     */
    clampGridToTowerRange(col, row, tower) {
        const cells = this.getTowerRangeCells(tower, tower.col, tower.row, 'normal');
        if (!cells || cells.length === 0) return { col: tower.col, row: tower.row };
        const key = `${col},${row}`;
        const set = new Set(cells.map(c => `${c.col},${c.row}`));
        if (set.has(key)) return { col, row };
        let best = cells[0];
        let bestD = Infinity;
        for (let i = 0; i < cells.length; i++) {
            const c = cells[i];
            const d = Math.abs(c.col - col) + Math.abs(c.row - row);
            if (d < bestD) {
                bestD = d;
                best = c;
            }
        }
        return { col: best.col, row: best.row };
    }

    /**
     * 大招实际造成伤害的格子：技能 AOE 与塔攻击范围的交集
     * @param {Object} tower
     * @param {number} anchorCol
     * @param {number} anchorRow
     * @param {Object} skill
     * @returns {Array<{col:number,row:number}>}
     */
    computeUltimateDamageCells(tower, anchorCol, anchorRow, skill) {
        const rangeGrid = Math.max(0.5, skill.rangeGrid != null ? skill.rangeGrid : 1);
        const rangeShape = skill.rangeShape || 'square';
        const rangeDirection = (rangeShape === 'line' || rangeShape === 'rectangle') ? (skill.rangeDirection ?? null) : null;
        const aoeCells = this.map.getRangeCells(anchorCol, anchorRow, rangeGrid, rangeShape, rangeDirection);
        const towerCells = this.getTowerRangeCells(tower, tower.col, tower.row, 'normal');
        const set = new Set(towerCells.map(c => `${c.col},${c.row}`));
        return aoeCells.filter(c => set.has(`${c.col},${c.row}`));
    }

    /**
     * 本波战斗是否进行中（开战至波次结算前；失败待命时视为非战斗中以便调整塔）
     * @returns {boolean}
     */
    isWaveCombatActive() {
        if (this.levelFailed) return false;
        if (this.currentWave < 1) return false;
        if (this.waveRewardGiven) return false;
        return true;
    }

    /**
     * 是否允许移动场上防御塔（仅开战前与每波结束后的休整期）
     * @returns {boolean}
     */
    canRepositionTowers() {
        return !this.isWaveCombatActive();
    }

    /**
     * 英雄升到下一级所需经验（本段内累计满则升级）
     * 简易曲线：Lv.1→2 需 100，之后每级 +50
     * @param {number} currentLevel - 当前等级（1 起）
     * @returns {number}
     */
    getHeroXpToNext(currentLevel) {
        const lv = Math.max(1, currentLevel | 0);
        return 100 + (lv - 1) * 50;
    }

    /**
     * 英雄对怪物造成伤害时获得经验（经验值 = 本次伤害数值，向下取整）
     * @param {Object} tower - 防御塔/英雄对象
     * @param {number} damage - 本次造成的伤害
     */
    addHeroExperienceFromDamage(tower, damage) {
        if (!tower || (!tower.isHero && tower.category !== '英雄')) return;
        let amt = Math.max(0, Math.floor(damage));
        if (this.playerStats) {
            const xb = this.playerStats.getStat('hero_xp_gain_bonus') || 0;
            amt = Math.max(0, Math.floor(amt * (1 + xb)));
        }
        if (amt <= 0) return;
        if (tower.heroLevel == null) tower.heroLevel = 1;
        if (tower.heroXp == null) tower.heroXp = 0;
        if (tower.heroXpToNext == null) tower.heroXpToNext = this.getHeroXpToNext(tower.heroLevel);
        const prevLevel = tower.heroLevel;
        tower.heroXp += amt;
        while (tower.heroXp >= tower.heroXpToNext) {
            tower.heroXp -= tower.heroXpToNext;
            tower.heroLevel = (tower.heroLevel || 1) + 1;
            tower.heroXpToNext = this.getHeroXpToNext(tower.heroLevel);
            console.log(`[英雄经验] ${tower.name} 升至 Lv.${tower.heroLevel}`);
        }
        // 英雄等级变化 → 配装阶可能变化（1–3 槽累计）
        if (tower.heroLevel !== prevLevel) {
            this.refreshTowerCombatStats(tower);
        }
    }
    
    /** 波次配置本地存储 key（与波次阵型编辑器「应用并保存」写入一致） */
    static WAVE_CONFIG_STORAGE_KEY = 'tower_defense_wave_config';

    /** tower_upgrade_branches.json 解析结果（按塔基底 id） */
    static towerUpgradeBranches = null;

    /**
     * 从 localStorage 读取已保存的波次数组
     * @returns {Array|null}
     */
    loadWaveConfigFromStorage() {
        try {
            const raw = localStorage.getItem(TowerDefenseGame.WAVE_CONFIG_STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || !Array.isArray(data.waves) || data.waves.length === 0) return null;
            return data.waves;
        } catch (e) {
            return null;
        }
    }

    /**
     * 将波次配置写入 localStorage（波次配置器点击「应用」时调用）
     * @param {Array} waves - 与 waveConfig.json 结构一致
     */
    saveWaveConfigToStorage(waves) {
        if (!waves || !Array.isArray(waves) || waves.length === 0) return;
        try {
            localStorage.setItem(
                TowerDefenseGame.WAVE_CONFIG_STORAGE_KEY,
                JSON.stringify({ waves })
            );
            console.log('[波次] 已保存到本地，共', waves.length, '波');
        } catch (e) {
            console.warn('[波次] 保存失败', e);
        }
    }

    /**
     * 加载波次：优先本地已保存，否则拉取 waveConfig.json
     */
    loadWaveConfig() {
        const saved = this.loadWaveConfigFromStorage();
        if (saved && this.enemyManager) {
            this.enemyManager.waveConfig.setWaves(saved);
            console.log('已从本地恢复波次配置，共', saved.length, '波');
            return;
        }
        fetch('waveConfig.json?' + (Date.now()))
            .then(r => (r.ok ? r.json() : null))
            .then(data => {
                if (data && Array.isArray(data.waves) && this.enemyManager) {
                    this.enemyManager.waveConfig.setWaves(data.waves);
                    console.log('已加载默认 waveConfig.json，共', data.waves.length, '波');
                    this.reapplyMonsterEditorTypes();
                }
            })
            .catch(() => {});
    }

    /**
     * 加载防御塔点击升级与 4 级分支表（game_demo/tower_upgrade_branches.json）
     */
    loadTowerUpgradeBranches() {
        const url = `tower_upgrade_branches.json?${Date.now()}`;
        fetch(url)
            .then(r => (r.ok ? r.json() : null))
            .then(data => {
                if (data && typeof data === 'object') {
                    TowerDefenseGame.towerUpgradeBranches = data;
                    console.log('[升级] 已加载 tower_upgrade_branches.json');
                } else {
                    TowerDefenseGame.towerUpgradeBranches = {};
                }
            })
            .catch(() => {
                TowerDefenseGame.towerUpgradeBranches = {};
                console.warn('[升级] tower_upgrade_branches.json 加载失败，使用默认数值');
            });
    }

    /**
     * 异步加载波次后再次套用怪物编辑器存档，避免任何默认波次逻辑覆盖已保存的敌人类型数值
     */
    reapplyMonsterEditorTypes() {
        if (!this.enemyManager || !window.MonsterEditorPanel || typeof window.MonsterEditorPanel.loadSavedTypes !== 'function') {
            return;
        }
        const saved = window.MonsterEditorPanel.loadSavedTypes();
        if (saved && Object.keys(saved).length > 0) {
            this.enemyManager.setEnemyTypes(saved);
            console.log('[怪物] 波次加载后已再次应用本地怪物编辑器配置');
        }
    }
    
    /**
     * 初始化敌人系统
     */
    initEnemySystem() {
        // 地图已无蛇形路径；敌人直线朝基地移动，见 enemySystem
        // 创建敌人管理器（传入 game：直线进攻基地 + 检测范围内优先打塔）
        this.enemyManager = new EnemyManager(this.canvas, this);
        
        // 创建防御塔攻击系统（依赖敌人管理器与地图）
        this.towerAttackSystem = new TowerAttackSystem(this);
        
        // 绑定下一波按钮
        const nextWaveBtn = document.getElementById('nextWaveBtn');
        if (nextWaveBtn) {
            nextWaveBtn.addEventListener('click', () => {
                this.interWaveCountdownEnd = null;
                this.startNextWave();
            });
        }

        // 「放置基地」已并入地图编辑器（mapEditorPanel.js），此处不再绑定独立按钮
    }
    
    /**
     * 调整Canvas尺寸
     */
    resizeCanvas() {
        const container = this.canvas.parentElement;
        if (container) {
            const rect = container.getBoundingClientRect();
            // 尽量占满右侧画布容器
            const pad = 24;
            const newWidth = Math.max(320, Math.floor(rect.width - pad));
            const newHeight = Math.max(280, Math.floor(rect.height - pad));
            this.canvas.width = newWidth;
            this.canvas.height = newHeight;
        }
    }
    
    /**
     * 绑定事件
     */
    bindEvents() {
        // Canvas点击事件（用于放置防御塔）
        this.canvas.addEventListener('click', (e) => {
            this.handleCanvasClick(e);
        });
        
        // Canvas 指针移动（含鼠标/触摸；拖动大招时依赖 capture 仍持续收到移动）
        this.canvas.addEventListener('pointermove', (e) => {
            this.handleCanvasMouseMove(e);
        });
        
        // Canvas鼠标离开事件（隐藏悬浮窗并清空范围显示）
        this.canvas.addEventListener('mouseleave', () => {
            this.hideTooltip();
            this.previewRangeCells = null;
            this.hoveredTowerRangeCells = null;
            this.previewBaseAnchor = null;
            this.previewMapEditCell = null;
        });

        // 右键取消大招瞄准
        this.canvas.addEventListener('contextmenu', (e) => {
            if (this.ultAimingTower) {
                e.preventDefault();
                this.cancelUltAiming();
            }
        });
        // Esc 取消大招瞄准
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.ultAimingTower) this.cancelUltAiming();
                this.hideTowerUpgradeMenu();
            }
        });
        
        // 窗口与地图容器尺寸变化时调整 Canvas（横向布局下容器变宽时能铺满）
        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });
        if (typeof ResizeObserver !== 'undefined' && this.canvas && this.canvas.parentElement) {
            this._mapResizeObserver = new ResizeObserver(() => {
                this.resizeCanvas();
            });
            this._mapResizeObserver.observe(this.canvas.parentElement);
        }
    }
    
    /**
     * 处理Canvas点击事件
     */
    handleCanvasClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // 转换为网格坐标
        const gridPos = this.map.screenToGrid(x, y);
        
        if (gridPos) {
            console.log('点击格子:', gridPos);

            // 地图编辑器优先：石块 / 擦除 / 基地
            if (window.MapEditorPanel && typeof window.MapEditorPanel.isOpen === 'function' && window.MapEditorPanel.isOpen()) {
                if (window.MapEditorPanel.handleGridClick(gridPos)) {
                    return;
                }
            }

            // 大招瞄准中：再点同一塔取消；点另一座可放大招的塔则切换瞄准；点地图其它位置则施放
            if (this.ultAimingTower) {
                const aiming = this.ultAimingTower;
                let clickedTower = this.tryPickTowerAtScreen(x, y);
                if (!clickedTower) {
                    clickedTower = this.towers.find(t => t.col === gridPos.col && t.row === gridPos.row) || null;
                }
                if (clickedTower === aiming) {
                    this.cancelUltAiming();
                    console.log('[大招] 已取消瞄准');
                    return;
                }
                if (clickedTower && clickedTower !== aiming) {
                    const isH = clickedTower.isHero || clickedTower.category === '英雄';
                    if (isH) {
                        this.enterUltAiming(clickedTower, 1);
                    } else if (this.isTowerPowerFull(clickedTower) && !clickedTower.ultUsedThisWave) {
                        this.enterUltAiming(clickedTower);
                    }
                    return;
                }
                if (!this.towers.includes(aiming)) {
                    this.cancelUltAiming();
                    return;
                }
                const anchor = this.clampGridToTowerRange(gridPos.col, gridPos.row, aiming);
                this.castTowerUltimateAt(aiming, anchor.col, anchor.row);
                this.cancelUltAiming();
                return;
            }

            // 非英雄塔移动模式（休整期）：点击空地换位，再点该塔取消
            if (!this.selectedTowerItem && this.movingDefenseTower) {
                const clickedTower = this.towers.find(t => t.col === gridPos.col && t.row === gridPos.row) || null;
                if (clickedTower === this.movingDefenseTower) {
                    this.cancelDefenseTowerMoveMode();
                    return;
                }
                if (clickedTower && clickedTower !== this.movingDefenseTower) {
                    this.cancelDefenseTowerMoveMode();
                    return;
                }
                this.tryMoveDefenseTowerTo(this.movingDefenseTower, gridPos.col, gridPos.row);
                return;
            }

            // 英雄移动模式下：点击目标格尝试移动（放置模式优先；如果不在放置则说明不处理放置）
            if (!this.selectedTowerItem && this.movingHero) {
                const clickedTower = this.towers.find(t => t.col === gridPos.col && t.row === gridPos.row) || null;
                // 点击移动中的英雄本体：取消移动模式
                if (clickedTower === this.movingHero) {
                    this.cancelHeroMoveMode();
                    return;
                }
                // 点击了其他塔：不允许移动到占用格；直接取消移动模式，避免卡死
                if (clickedTower && clickedTower !== this.movingHero) {
                    this.cancelHeroMoveMode();
                    return;
                }

                this.tryMoveHeroTo(this.movingHero, gridPos.col, gridPos.row);
                return;
            }

            // 如果选中了防御塔：优先按原逻辑尝试放置
            if (this.selectedTowerItem) {
                if (this.map.canPlaceTower(gridPos.col, gridPos.row)) {
                    this.placeTower(this.selectedTowerItem, gridPos.col, gridPos.row);
                } else {
                    console.log('此位置不能放置防御塔（路径、阻挡或已被占用）');
                }
                this.hideEvolveMenu();
                this.movingHero = null;
                this.movingDefenseTower = null;
                return;
            }

            // 未处于放置模式：优先用圆形命中塔（比格心更准确），否则用格子
            let clickedTower = this.tryPickTowerAtScreen(x, y);
            if (!clickedTower) {
                clickedTower = this.towers.find(t => t.col === gridPos.col && t.row === gridPos.row);
            }
            if (clickedTower) {
                if (clickedTower.isHero || clickedTower.category === '英雄') {
                    this.heroUltHudTower = clickedTower;
                }
                if (!this.isWaveCombatActive() && this.canRepositionTowers()) {
                    if (clickedTower.isHero || clickedTower.category === '英雄') {
                        this.movingHero = clickedTower;
                        this.cancelDefenseTowerMoveMode();
                        this.hideTowerUpgradeMenu();
                        this.previewRangeCells = null;
                        console.log('[塔防] 英雄移动：点击目标格，再点英雄取消');
                    } else {
                        this.cancelDefenseTowerMoveMode();
                        this.cancelHeroMoveMode();
                        this.previewRangeCells = null;
                        this.showTowerUpgradeMenu(clickedTower, e.clientX, e.clientY);
                    }
                } else if (!(clickedTower.isHero || clickedTower.category === '英雄')) {
                    // 战斗中：非英雄塔点击打开升级菜单（大招从菜单「瞄准释放大招」进入）；英雄仍用左下角 HUD
                    this.cancelDefenseTowerMoveMode();
                    this.cancelHeroMoveMode();
                    this.previewRangeCells = null;
                    this.showTowerUpgradeMenu(clickedTower, e.clientX, e.clientY);
                }
            } else {
                this.hideEvolveMenu();
            }
        }
    }

    /**
     * 进入大招瞄准：高亮该塔 + 塔射程（在 render 中绘制），鼠标移动更新落点预览
     * @param {Object} tower
     */
    enterUltAiming(tower, skillIndex = 1) {
        if (!tower) return;
        const isHero = tower.isHero || tower.category === '英雄';
        if (isHero) {
            const idx = skillIndex === 2 ? 2 : 1;
            const cdKey = idx === 2 ? 'heroSkill2CdUntil' : 'heroSkill1CdUntil';
            const now = performance.now();
            if (now < (tower[cdKey] || 0)) {
                console.warn('[大招] 技能冷却中');
                return;
            }
            const sk = this.getUnifiedTowerUltimateSkill(tower, idx);
            const sc = this.getEffectiveHeroSpiritCost(sk.spiritCost);
            if ((this.gameState.spirit || 0) < sc) {
                console.warn('[大招] 灵力不足');
                return;
            }
            const pMax = tower.towerPowerMax != null ? tower.towerPowerMax : 100;
            const needPow = Math.min(Number(sk.powerCost) != null ? Number(sk.powerCost) : pMax, pMax);
            if ((tower.towerPower || 0) < needPow) {
                console.warn('[大招] 威能不足');
                return;
            }
        } else {
            if (!this.isTowerPowerFull(tower) || tower.ultUsedThisWave) return;
        }
        // cancelUltAiming 会清空 ultAimingSkillIndex，必须在之后写入本次瞄准的技能序号
        const resolvedSkillIndex = isHero ? (skillIndex === 2 ? 2 : 1) : 1;
        this.cancelUltAiming();
        this.ultAimingSkillIndex = resolvedSkillIndex;
        this.ultAimingTower = tower;
        this.hideTooltip();
        const anchor = this.clampGridToTowerRange(tower.col, tower.row, tower);
        const skill = this.getUnifiedTowerUltimateSkill(tower, this.ultAimingSkillIndex);
        this.heroSkillPreviewCells = this.computeUltimateDamageCells(tower, anchor.col, anchor.row, skill);
        console.log('[大招] 瞄准模式：移动鼠标选落点，再点击地图施放；再点该塔或右键/Esc 取消', tower.name);
    }

    /**
     * 瞄准中随鼠标更新「伤害范围」预览（与塔射程交集）
     */
    updateUltAimingPreview(screenX, screenY) {
        const tower = this.ultAimingTower;
        if (!tower || !this.map) {
            this.heroSkillPreviewCells = null;
            return;
        }
        const gridPos = this.map.screenToGrid(screenX, screenY);
        if (!gridPos) {
            this.heroSkillPreviewCells = null;
            return;
        }
        const anchor = this.clampGridToTowerRange(gridPos.col, gridPos.row, tower);
        const skIdx = this.ultAimingSkillIndex || 1;
        const skill = this.getUnifiedTowerUltimateSkill(tower, skIdx);
        this.heroSkillPreviewCells = this.computeUltimateDamageCells(tower, anchor.col, anchor.row, skill);
    }

    /**
     * 退出大招瞄准（不施放）
     */
    cancelUltAiming() {
        this.ultAimingTower = null;
        this.heroSkillPreviewCells = null;
        this.ultAimingSkillIndex = 1;
    }

    /**
     * 英雄大招实际灵力消耗（受玩家属性「英雄大招灵力消耗减免」影响）
     * @param {number} baseCost
     * @returns {number}
     */
    getEffectiveHeroSpiritCost(baseCost) {
        const b = Math.max(0, Math.floor(Number(baseCost) || 0));
        if (b <= 0) return 0;
        if (!this.playerStats || !this.playerStats.getStat) return b;
        const r = Math.min(0.85, Math.max(0, this.playerStats.getStat('hero_ult_cost_reduction') || 0));
        return Math.max(0, Math.floor(b * (1 - r)));
    }
    
    /**
     * 渲染防御塔物品栏（可指定目标容器，用于商店页左侧栏）
     * @param {HTMLElement} [targetElement] - 可选，不传则渲染到游戏页的 towerInventoryList
     */
    renderTowerInventory(targetElement) {
        const list = targetElement || this.towerInventoryList;
        if (!list) {
            console.warn('防御塔物品栏元素未找到');
            return;
        }
        
        // 清空列表
        list.innerHTML = '';
        
        // 种类来源：物品栏编辑器（防御塔）与英雄物品栏写入的 gameState.inventory，数量>0 才显示；部署仍只受灵力限制
        const cats = TowerDefenseGame.TOWER_INVENTORY_CATEGORIES;
        const towerItems = [];
        this.gameState.inventory.forEach((count, itemId) => {
            if (!count || count <= 0) return;
            const item = this.gameState.findItemById(itemId);
            if (item && cats.includes(item.category)) {
                towerItems.push(item);
            }
        });
        towerItems.sort((a, b) => (a.name || a.id || '').localeCompare(b.name || b.id || '', 'zh-CN'));

        if (towerItems.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-tower-inventory';
            emptyDiv.textContent = '暂无可用防御塔（请在物品栏/英雄物品栏编辑器中配置并应用）';
            list.appendChild(emptyDiv);
            return;
        }

        towerItems.forEach(item => {
            const itemElement = this.createTowerInventoryItem(item, !!targetElement);
            list.appendChild(itemElement);
        });
    }
    
    /**
     * 创建防御塔物品栏项（部署仅受灵力限制，不显示/不消耗库存数量）
     * @param {Object} item - 物品数据
     * @param {boolean} [readOnly] - 仅展示（商店页为 true，不绑定选中放置）
     * @returns {HTMLElement}
     */
    createTowerInventoryItem(item, readOnly = false) {
        const div = document.createElement('div');
        div.className = 'tower-inventory-item';
        div.dataset.itemId = item.id;
        
        // 获取图标与属性（攻击、攻速、射程、生命、能量获取）
        const icon = item.icon || this.getIconByRarity(item.rarity || item.quality);
        const att = item.attributes || {};
        const attack = att.baseAttack ?? '-';
        const attackSpeed = att.attackSpeed ?? '-';
        const rangeLabel = this.formatRangeGridLabel(this.getTowerRangeGrid(item));
        const health = att.health ?? att.baseHealth ?? 10; // 默认血量 10
        const powerGain = att.powerGainPerHit != null ? att.powerGainPerHit : 1; // 能量获取：每次攻击获得威能
        const deploySpirit = this.getDeploySpiritCost(item);
        div.innerHTML = `
            <div class="tower-inventory-item-spirit" title="部署所需灵力">
                <span class="tower-inventory-item-spirit-label">灵力</span>
                <span class="tower-inventory-item-spirit-value">${deploySpirit}</span>
            </div>
            <div class="tower-inventory-item-icon">${icon}</div>
            <div class="tower-inventory-item-body">
                <div class="tower-inventory-item-name">${item.name}</div>
                <div class="tower-inventory-item-stats">
                    <span class="tower-stat">攻 ${attack}</span>
                    <span class="tower-stat">速 ${attackSpeed}</span>
                    <span class="tower-stat">程 ${rangeLabel}</span>
                    <span class="tower-stat">命 ${health}</span>
                    <span class="tower-stat">能 ${powerGain}</span>
                </div>
            </div>
        `;
        
        if (!readOnly) {
            // 游戏页：绑定点击选中、悬停 tooltip
            div.addEventListener('click', () => {
                this.selectTowerItem(item, div);
            });
            div.addEventListener('mouseenter', (e) => {
                this.showTooltip(item, e.target);
            });
            div.addEventListener('mouseleave', () => {
                this.hideTooltip();
            });
        } else {
            // 商店页：仅悬停 tooltip
            div.addEventListener('mouseenter', (e) => {
                this.showTooltip(item, e.target);
            });
            div.addEventListener('mouseleave', () => {
                this.hideTooltip();
            });
        }
        
        return div;
    }
    
    /**
     * 选择防御塔物品
     * @param {Object} item - 物品数据
     * @param {HTMLElement} element - DOM元素
     */
    selectTowerItem(item, element) {
        if (window.MapEditorPanel && typeof window.MapEditorPanel.close === 'function') {
            window.MapEditorPanel.close();
        }
        // 清除之前的选择
        this.clearTowerSelection();
        
        // 设置新的选择
        this.selectedTowerItem = item;
        element.classList.add('selected');
        
        console.log('选中防御塔:', item.name);
    }
    
    /**
     * 清除防御塔选择
     */
    clearTowerSelection() {
        if (this.towerInventoryList) {
            const selected = this.towerInventoryList.querySelector('.selected');
            if (selected) {
                selected.classList.remove('selected');
            }
        }
        this.selectedTowerItem = null;
        this.previewRangeCells = null;
        this.hideEvolveMenu();
        this.movingHero = null;
        this.movingDefenseTower = null;
        this.cancelUltAiming();
    }
    
    /**
     * 获取防御塔攻击范围对应的格子半径（1 = 3×3，2 = 5×5）
     * 若有 attackModes 则取指定模式的 rangeGrid，否则用单组属性
     * @param {Object} item - 防御塔物品或塔的 item 引用
     * @param {string} [mode] - 'normal' | 'path'，不传时取 normal
     * @returns {number}
     */
    getTowerRangeGrid(item, mode = 'normal') {
        if (!item) return this.towerRangeGrid;
        const opts = this.getTowerRangeOptions(item, mode);
        return Math.max(1, Math.floor(opts.rangeGrid));
    }

    /**
     * 获取塔/物品的范围配置（范围格数、形状、方向），用于取格子和判定
     * @param {Object} towerOrItem - 已放置的塔对象（含 rangeGrid/rangeShape/rangeDirection）或物品
     * @param {string} [mode] - 仅对 item 有效：'normal' | 'path'
     * @returns {{ rangeGrid: number, rangeShape: string, rangeDirection: string|null }}
     */
    getTowerRangeOptions(towerOrItem, mode = 'normal') {
        if (!towerOrItem) {
            return { rangeGrid: 1, rangeShape: 'square', rangeDirection: null };
        }
        if (towerOrItem.rangeGrid != null && typeof towerOrItem.col === 'number') {
            return {
                rangeGrid: towerOrItem.rangeGrid ?? 1,
                rangeShape: towerOrItem.rangeShape ?? 'square',
                rangeDirection: towerOrItem.rangeDirection ?? null
            };
        }
        const att = towerOrItem.attributes || {};
        const modes = att.attackModes;
        const m = (modes && modes[mode]) ? modes[mode] : (modes && (modes.normal || modes.path)) ? (modes.normal || modes.path) : null;
        if (m && (m.rangeGrid != null || m.rangeShape != null)) {
            return {
                rangeGrid: m.rangeGrid != null ? m.rangeGrid : 1,
                rangeShape: m.rangeShape || 'square',
                rangeDirection: m.rangeDirection ?? null
            };
        }
        return {
            rangeGrid: att.rangeGrid ?? 1,
            rangeShape: 'square',
            rangeDirection: null
        };
    }

    /**
     * 获取塔/物品在指定格子上的攻击范围格子列表（支持方形/I型/长方形）
     */
    getTowerRangeCells(towerOrItem, col, row, mode = 'normal') {
        const opts = this.getTowerRangeOptions(towerOrItem, mode);
        return this.map.getRangeCells(col, row, opts.rangeGrid, opts.rangeShape, opts.rangeDirection);
    }

    /**
     * 将格子半径转为显示用字符串（如 1 -> "3×3"，2 -> "5×5"）
     */
    formatRangeGridLabel(rangeGrid) {
        const n = Math.max(1, Math.floor(rangeGrid || 1));
        const side = 2 * n + 1;
        return `${side}×${side}`;
    }
    
    /**
     * 根据稀有度获取图标
     * @param {string|number} rarity - 稀有度或品质
     * @returns {string} - 图标emoji
     */
    getIconByRarity(rarity) {
        // 如果是数字，转换为文字
        if (typeof rarity === 'number') {
            const qualityMap = {
                1: '普通',
                2: '稀有',
                3: '史诗',
                4: '传说'
            };
            rarity = qualityMap[rarity] || '普通';
        }
        
        const iconMap = {
            '普通': '🏰',
            '稀有': '🏯',
            '史诗': '🏛️',
            '传说': '👑'
        };
        return iconMap[rarity] || '🏰';
    }
    
    /**
     * 放置防御塔
     * @param {Object} item - 防御塔物品数据
     * @param {number} col - 列坐标
     * @param {number} row - 行坐标
     * @returns {boolean} - 是否成功放置
     */
    placeTower(item, col, row) {
        const spiritCost = this.getDeploySpiritCost(item);
        if ((this.gameState.spirit || 0) < spiritCost) {
            console.warn(`灵力不足：部署「${item.name}」需要 ${spiritCost} 灵力，当前 ${this.gameState.spirit}`);
            return false;
        }
        
        // 检查位置是否可以放置
        if (!this.map.canPlaceTower(col, row)) {
            console.warn('此位置不能放置防御塔');
            return false;
        }
        
        // 获取格子的屏幕坐标（中心点）
        const screenPos = this.map.gridToScreen(col, row);
        if (!screenPos) {
            console.error('无法获取格子屏幕坐标');
            return false;
        }
        
        // 已无“路径格”概念，统一使用 normal；具体攻防见 getTowerItemBaseCombatStats，放置后再套配装
        const attackMode = 'normal';
        const rawStats = this.getTowerItemBaseCombatStats(item, attackMode);
        const baseAttack = rawStats.baseAttack;
        const attackSpeed = rawStats.attackSpeed;
        const rangeGrid = rawStats.rangeGrid;
        const rangeShape = rawStats.rangeShape;
        const rangeDirection = rawStats.rangeDirection;

        // 创建防御塔对象（默认血量 10；多怪可同时贴脸攻击同一座塔，无阻挡容量限制）
        const health = item.attributes?.health ?? item.attributes?.baseHealth ?? 10;
        const tower = {
            id: item.id,
            item: item, // 保存物品数据引用
            name: item.name,
            category: item.category,
            isHero: item.category === '英雄',
            col: col,
            row: row,
            x: screenPos.x,
            y: screenPos.y,
            // 攻击模式及该模式下的属性
            attackMode,
            baseAttack,
            attackSpeed,
            rangeGrid,
            rangeShape,
            rangeDirection,
            health: health,
            currentHealth: health,
            powerGainPerHit: item.attributes?.powerGainPerHit != null ? item.attributes.powerGainPerHit : 1, // 能量获取：每次攻击获得的威能点数
            towerPower: 0,
            towerPowerMax: this.getTowerPowerMaxForItem(item),
            ultUsedThisWave: false, // 本波该塔是否已放过一次大招（满条释放后置 true，下波清零）
            // 缩放属性
            scaling: item.scaling || {},
            // 特殊效果
            specialEffects: item.specialEffects || [],
            // 游戏状态
            lastAttackTime: 0, // 上次攻击时间
            currentTarget: null,
            currentOreTarget: null // { col, row } 锁定的矿石格（无敌人时）
        };

        // 英雄：简易经验与等级（对怪物造成伤害时获得经验）
        if (tower.isHero) {
            tower.heroLevel = 1;
            tower.heroXp = 0;
            tower.heroXpToNext = this.getHeroXpToNext(1);
            tower.heroSkill1CdUntil = 0;
            tower.heroSkill2CdUntil = 0;
            this.heroUltHudTower = tower;
        } else {
            // 局内点击升级：1→4，属性基于放置时的快照 × 等级倍率（见 tower_upgrade_branches.json）
            tower.runtimeLevel = 1;
            tower.upgradeBranchId = null;
            tower.baseTowerTypeId = item.id;
            tower.levelStatSnapshot = {
                baseAttack: rawStats.baseAttack,
                attackSpeed: rawStats.attackSpeed,
                rangeGrid: rawStats.rangeGrid,
                rangeShape: rawStats.rangeShape,
                rangeDirection: rawStats.rangeDirection
            };
            tower.upgradeMode = null;
            tower.shield = 0;
            tower.maxShield = 0;
        }

        // 添加到防御塔数组
        this.towers.push(tower);

        // 配装槽 1/2/3 对应局内 1/2/3 级，按阶累计加成后再写入 stat* / 过载
        this.refreshTowerCombatStats(tower);
        
        // 在地图上标记该格子已被占用
        this.map.placeTower(col, row);
        
        this.gameState.spirit = Math.max(0, (this.gameState.spirit || 0) - spiritCost);
        this.updateSpiritUI();
        
        // 更新商店页面的库存显示（如果UI管理器存在）
        if (window.uiManager) {
            window.uiManager.renderInventory();
        }
        
        // 取消选择
        this.clearTowerSelection();
        
        console.log(`成功放置防御塔: ${item.name} 在位置 (${col}, ${row})`);
        return true;
    }
    
    /**
     * 移除防御塔（地图格子释放、解除被该塔阻挡的敌人）
     * @param {Object} tower - 防御塔对象
     */
    removeTower(tower) {
        if (this.towerUpgradeMenuTower === tower) this.hideTowerUpgradeMenu();
        if (this.heroUltHudTower === tower) this.heroUltHudTower = null;
        this.map.removeTower(tower.col, tower.row);
        const enemies = this.enemyManager ? this.enemyManager.getEnemies() : [];
        enemies.forEach(enemy => {
            if (enemy.blockedByTower === tower) {
                enemy.isBlocked = false;
                enemy.blockedByTower = null;
                enemy._navPath = null;
                enemy._navGoalKey = '';
            }
        });
        console.log(`防御塔 ${tower.name} 被摧毁，位置 (${tower.col}, ${tower.row})`);
    }
    
    /**
     * 开始游戏
     */
    start() {
        if (this.isRunning) {
            return;
        }
        
        this.isRunning = true;
        this.isPaused = false;
        this.lastFrameTime = performance.now();
        this.levelFailed = false;
        // 注意：不在此重置 baseSpiritAccumMs，避免与「首次点下一波才 start」类流程重复清零；
        // 仅在关卡失败后通过「下一波」重开时在 startNextWave 内清零。
        this._baseSpiritLastTick = performance.now();

        console.log('游戏开始');
        this.gameLoop();
    }
    
    /**
     * 暂停游戏
     */
    pause() {
        this.isPaused = true;
        console.log('游戏暂停');
    }
    
    /**
     * 继续游戏
     */
    resume() {
        this.isPaused = false;
        this.lastFrameTime = performance.now();
        console.log('游戏继续');
        this.gameLoop();
    }
    
    /**
     * 停止游戏
     */
    stop() {
        this.isRunning = false;
        this.isPaused = false;
        console.log('游戏停止');
    }
    
    /**
     * 游戏主循环
     */
    gameLoop(currentTime = performance.now()) {
        if (!this.isRunning) {
            return;
        }
        
        if (this.isPaused) {
            requestAnimationFrame((time) => this.gameLoop(time));
            return;
        }
        
        // 计算帧间隔
        let deltaTime = currentTime - this.lastFrameTime;
        // 如果是第一帧或间隔过大（可能是页面切换回来），限制 deltaTime
        if (this.lastFrameTime === 0 || deltaTime > 100) {
            deltaTime = 16; // 假设 60fps，约 16ms
        }
        this.lastFrameTime = currentTime;
        
        // 更新游戏状态
        this.update(deltaTime);
        
        // 渲染游戏
        this.render();
        
        // 继续循环
        requestAnimationFrame((time) => this.gameLoop(time));
    }
    
    /**
     * 更新游戏状态
     * @param {number} deltaTime - 帧间隔（毫秒）
     */
    update(deltaTime) {
        // 波次间隔倒计时结束 → 自动开始下一波；仅成功开波后再清倒计时（避免先清再失败导致静默无波）
        // 到期自动开波：成功时由 startNextWave → scheduleNextWaveTimerAfterCurrentWaveStarted 写入「下一波」新倒计时，此处不得再置 null，否则会清掉刚设好的第三波及以后倒计时
        if (this.interWaveCountdownEnd != null && performance.now() >= this.interWaveCountdownEnd) {
            const maxW = this.getMaxConfiguredWaveNumber();
            if (maxW <= 0 || this.getDisplayWave() >= maxW) {
                this.interWaveCountdownEnd = null;
            } else {
                this.tryAutoStartNextWave();
            }
        }

        // 基地产灵力（墙钟差分，不依赖 deltaTime 是否被钳制）
        this.updateBaseSpiritProduction();
        // 地图上矿机格按周期产灵力
        this.updateMinersSpirit(deltaTime);

        // 更新敌人系统
        if (this.enemyManager) {
            // 先更新敌人位置（传入 game 以支持塔的阻挡判定），再用“当前帧”位置做射程判定
            this.enemyManager.update(deltaTime, this);
            // 再执行防御塔攻击（射程内才开火）
            if (this.towerAttackSystem) {
                this.towerAttackSystem.update(performance.now());
            }
            // 更新飞行子弹：移动、命中时结算伤害
            this.updateProjectiles(deltaTime);
            
            // 被阻挡的怪物按攻击间隔对阻挡塔造成伤害（每 attackInterval 秒造成 attack 点伤害）
            const now = performance.now();
            const enemies = this.enemyManager.getEnemies();
            enemies.forEach(enemy => {
                if (!enemy.isBlocked || !enemy.blockedByTower) return;
                const sec = enemy.attackInterval != null && enemy.attackInterval > 0 ? enemy.attackInterval : 1;
                const nextHitMs = sec * 1000;
                const last = enemy.lastBlockedAttackTime || 0;
                if (now - last >= nextHitMs) {
                    const damage = enemy.attack != null ? enemy.attack : 1;
                    this.applyDamageToTower(enemy.blockedByTower, damage);
                    enemy.lastBlockedAttackTime = now;
                }
            });
            // 贴脸攻基地的怪物：与攻塔相同，按 attackInterval 对基地造成伤害
            enemies.forEach(enemy => {
                if (this.levelFailed) return;
                if (!enemy.isAttackingBase) return;
                const sec = enemy.attackInterval != null && enemy.attackInterval > 0 ? enemy.attackInterval : 1;
                const nextHitMs = sec * 1000;
                const last = enemy.lastBlockedAttackTime || 0;
                if (now - last >= nextHitMs) {
                    const damage = enemy.attack != null ? enemy.attack : 1;
                    this.baseHealth = Math.max(0, (this.baseHealth || 0) - damage);
                    enemy.lastBlockedAttackTime = now;
                    if (this.baseHealth <= 0 && !this.levelFailed) {
                        this.triggerLevelFail();
                    }
                }
            });
            // 移除血量为 0 的塔，并解除被该塔阻挡的敌人
            this.towers = this.towers.filter(tower => {
                if ((tower.currentHealth || 0) <= 0) {
                    this.removeTower(tower);
                    return false;
                }
                return true;
            });
            
            // 与敌人管理器同步波次号（避免 UI 与内部状态不一致导致永远不触发结束）
            if (this.enemyManager) {
                this.currentWave = this.enemyManager.getCurrentWave();
            }
            const aliveEnemyCount = this.enemyManager.getAliveEnemyCount();
            // 波次结束判定：本波已生成完且场上无存活敌人（必须用存活数：同帧击杀后 length 可能仍含尸体）
            if (!this.levelFailed && this.currentWave >= 1 && !this.waveRewardGiven && !this.enemyManager.isSpawning && aliveEnemyCount === 0) {
                this.waveRewardGiven = true;
                const waveCfg = this.enemyManager.waveConfig.getWave(this.currentWave);
                const spiritAdd = waveCfg && waveCfg.spiritReward != null ? Math.max(0, Math.floor(Number(waveCfg.spiritReward))) : 10;
                this.gameState.spirit = Math.max(0, (this.gameState.spirit || 0) + spiritAdd);
                this.updateSpiritUI();
                const harvest = this.gameState.harvestPower ?? 50;
                const growth = (this.gameState.playerStats && this.gameState.playerStats.getStat('harvest_power_growth_percent')) ?? this.gameState.harvestPowerGrowthPercent ?? 0.01;
                this.applyGoldCoinsIncome(harvest);
                this.gameState.harvestPower = Math.max(1, Math.round(this.gameState.harvestPower * (1 + growth)));
                if (this.gameState.playerStats) this.gameState.playerStats.setStat('harvest_power', this.gameState.harvestPower);
                console.log(`第 ${this.currentWave} 波结束，灵力 +${spiritAdd}，收获力金币 +${harvest}，当前金币: ${this.gameState.coins}，灵力: ${this.gameState.spirit}`);
                // 更新金币显示
                if (window.uiManager && typeof window.uiManager.updateCoinsDisplay === 'function') window.uiManager.updateCoinsDisplay();
                // 判断是否为当前关卡最后一波：每关 wavesPerLevel 波，currentWave % wavesPerLevel === 0 表示本关最后一波
                const isLastWaveOfLevel = this.currentWave % this.wavesPerLevel === 0;
                // 下一波倒计时改在「每波开始时」启动，不再在清怪后启动（见 scheduleNextWaveTimerAfterCurrentWaveStarted）
                if (isLastWaveOfLevel) {
                    this.showLevelClearPanel();
                }
            }
        }

        this.applyTowerHealthRegen(deltaTime);
        this.updateHeroUltimateHud();
    }

    /**
     * 基地被摧毁：停止游戏主循环并显示失败气泡
     */
    triggerLevelFail() {
        if (this.levelFailed) return;
        this.levelFailed = true;
        this.interWaveCountdownEnd = null;
        this.baseHealth = 0;
        this.isRunning = false;
        if (this.enemyManager) {
            this.enemyManager.clearAll();
        }
        this.showLevelFailPanel();
        console.log('[塔防] 关卡失败：基地血量归零');
    }

    /**
     * 显示关卡失败气泡（约 4 秒后自动隐藏，可再点「下一波」前需重新开始游戏）
     */
    showLevelFailPanel() {
        const panel = document.getElementById('levelFailPanel');
        if (!panel) return;
        if (this.levelFailTimer) {
            clearTimeout(this.levelFailTimer);
            this.levelFailTimer = null;
        }
        panel.classList.remove('hidden');
        this.levelFailTimer = setTimeout(() => {
            panel.classList.add('hidden');
            this.levelFailTimer = null;
        }, 4000);
    }
    
    /**
     * 渲染游戏
     */
    render() {
        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制背景
        this.drawBackground();
        
        // 出怪口格内倒计时（先于 map.render 写入，画在格子里，休整期无怪时最明显）
        if (this.map) {
            this.map.spawnNextWaveCountdownSec = this.getSpawnNextWaveCountdownSec();
        }

        // 绘制地图网格（包括路径）
        this.map.render();

        // 绘制攻击范围：悬停已部署塔时显示范围（在塔下层，先画）
        if (this.hoveredTowerRangeCells && this.hoveredTowerRangeCells.length > 0) {
            this.map.drawRangeHighlight(
                this.hoveredTowerRangeCells,
                'rgba(52, 152, 219, 0.25)',
                'rgba(52, 152, 219, 0.6)'
            );
        }
        // 选中塔准备部署时，显示鼠标所在格放置后的范围预览
        if (this.previewRangeCells && this.previewRangeCells.length > 0) {
            this.map.drawRangeHighlight(
                this.previewRangeCells,
                'rgba(46, 204, 113, 0.25)',
                'rgba(46, 204, 113, 0.7)'
            );
        }

        // 大招瞄准：先画整座塔的「攻击射程」（金色），再画「落点伤害范围」预览（紫红色，与射程区分）
        if (this.ultAimingTower) {
            const ultCells = this.getTowerRangeCells(this.ultAimingTower, this.ultAimingTower.col, this.ultAimingTower.row, 'normal');
            if (ultCells && ultCells.length > 0) {
                this.map.drawRangeHighlight(
                    ultCells,
                    'rgba(241, 196, 15, 0.26)',
                    'rgba(243, 156, 18, 0.92)'
                );
            }
        }
        if (this.heroSkillPreviewCells && this.heroSkillPreviewCells.length > 0) {
            this.map.drawRangeHighlight(
                this.heroSkillPreviewCells,
                'rgba(155, 89, 182, 0.24)',
                'rgba(142, 68, 173, 0.92)'
            );
        }

        // 地图编辑器：基地 2×2 预览（绿=可放，红=不可）
        const mapEditBasePreview =
            window.MapEditorPanel &&
            typeof window.MapEditorPanel.isOpen === 'function' &&
            window.MapEditorPanel.isOpen() &&
            window.MapEditorPanel.getTool &&
            window.MapEditorPanel.getTool() === 'base' &&
            this.previewBaseAnchor;
        if (mapEditBasePreview) {
            const a = this.previewBaseAnchor;
            const cells = [];
            for (let dr = 0; dr < 2; dr++) {
                for (let dc = 0; dc < 2; dc++) {
                    const c = a.col + dc;
                    const r = a.row + dr;
                    if (this.map.isValidCell(c, r)) {
                        cells.push({ col: c, row: r });
                    }
                }
            }
            if (cells.length > 0) {
                const valid = this.map.canPlaceBaseAt(a.col, a.row);
                this.map.drawRangeHighlight(
                    cells,
                    valid ? 'rgba(46, 204, 113, 0.38)' : 'rgba(231, 76, 60, 0.38)',
                    valid ? 'rgba(39, 174, 96, 0.95)' : 'rgba(192, 57, 43, 0.95)'
                );
            }
        }
        // 地图编辑器：石块/擦除悬停格高亮
        if (
            window.MapEditorPanel &&
            window.MapEditorPanel.isOpen &&
            window.MapEditorPanel.isOpen() &&
            this.previewMapEditCell
        ) {
            const t = window.MapEditorPanel.getTool && window.MapEditorPanel.getTool();
            if (t === 'stone' || t === 'erase' || t === 'spawn' || t === 'ore' || t === 'miner') {
                let fill = 'rgba(236, 240, 241, 0.22)';
                let stroke = 'rgba(127, 140, 141, 0.85)';
                if (t === 'spawn') {
                    fill = 'rgba(155, 89, 182, 0.22)';
                    stroke = 'rgba(142, 68, 173, 0.9)';
                } else if (t === 'ore') {
                    fill = 'rgba(241, 196, 15, 0.2)';
                    stroke = 'rgba(180, 140, 40, 0.95)';
                } else if (t === 'miner') {
                    fill = 'rgba(39, 174, 96, 0.2)';
                    stroke = 'rgba(30, 130, 76, 0.95)';
                }
                this.map.drawRangeHighlight(
                    [{ col: this.previewMapEditCell.col, row: this.previewMapEditCell.row }],
                    fill,
                    stroke
                );
            }
        }

        // 英雄光环范围（先于防御塔绘制，与攻击范围同层）
        this.drawHeroAuraHighlights();
        
        // 绘制防御塔
        this.drawTowers();
        
        // 绘制敌人
        if (this.enemyManager) {
            this.enemyManager.render();
        }
        
        // 绘制投射物
        this.drawProjectiles();

        // 基地生命条与数字（显示在基地中心上方）
        this.drawBaseHealthOverlay();
        // 基地产灵力进度条（紧挨血条下方）
        this.drawBaseSpiritProductionBar();

        // 绘制UI（波次、金币等，基地生命已移至基地上方）
        this.drawUI();

        // 波次间隔倒计时必须最后画，否则会塔/敌人/子弹盖住（原先画在地图后不可见）
        this.drawInterWaveSpawnCountdown();
    }

    /**
     * 在基地位置绘制基地血条与当前/最大生命数字
     */
    drawBaseHealthOverlay() {
        if (!this.map) return;
        const bc = this.map.getBaseCenterScreen();
        const maxHp = Math.max(1, this.maxBaseHealth || 1);
        const cur = Math.max(0, this.baseHealth);
        const ratio = Math.min(1, cur / maxHp);
        const barW = Math.min(this.map.mapWidth * 0.26, 140);
        const barH = 5;
        const cell = Math.min(this.map.cellWidth, this.map.cellHeight);
        const textY = bc.y - cell * 1.15;
        const barY = textY + 12;

        this.ctx.save();
        this.ctx.font = 'bold 11px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        const label = `${cur} / ${maxHp}`;
        this.ctx.strokeStyle = '#1a252f';
        this.ctx.lineWidth = 4;
        this.ctx.strokeText(label, bc.x, textY);
        this.ctx.fillStyle = '#ecf0f1';
        this.ctx.fillText(label, bc.x, textY);

        const barX = bc.x - barW / 2;
        this.ctx.fillStyle = 'rgba(44, 62, 80, 0.85)';
        this.ctx.fillRect(barX, barY, barW, barH);
        this.ctx.fillStyle = '#27ae60';
        this.ctx.fillRect(barX, barY, barW * ratio, barH);
        this.ctx.strokeStyle = '#2c3e50';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(barX, barY, barW, barH);
        this.ctx.restore();
    }

    /**
     * 基地灵力产出进度条：满周期后自动 +灵力（参数见英雄编辑器）
     */
    drawBaseSpiritProductionBar() {
        if (!this.map) return;
        if (!this.isOreMiningCombatActive()) return;
        const bc = this.map.getBaseCenterScreen();
        const cell = Math.min(this.map.cellWidth, this.map.cellHeight);
        const textY = bc.y - cell * 1.15;
        const hpBarY = textY + 12;
        const barH = 5;
        const spiritBarY = hpBarY + barH + 4;

        const iv = Math.max(500, this.baseSpiritIntervalMs || 10000);
        const acc = Math.max(0, this.baseSpiritAccumMs || 0);
        const ratio = Math.min(1, acc / iv);

        const barW = Math.min(this.map.mapWidth * 0.26, 140);
        const barX = bc.x - barW / 2;

        this.ctx.save();
        this.ctx.font = 'bold 10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        const lab = '灵力产出';
        this.ctx.strokeStyle = '#1a252f';
        this.ctx.lineWidth = 3;
        this.ctx.strokeText(lab, bc.x, spiritBarY - 8);
        this.ctx.fillStyle = '#d7bde2';
        this.ctx.fillText(lab, bc.x, spiritBarY - 8);

        this.ctx.fillStyle = 'rgba(44, 62, 80, 0.85)';
        this.ctx.fillRect(barX, spiritBarY, barW, barH);
        this.ctx.fillStyle = '#9b59b6';
        this.ctx.fillRect(barX, spiritBarY, barW * ratio, barH);
        this.ctx.strokeStyle = '#512e5f';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(barX, spiritBarY, barW, barH);
        this.ctx.restore();
    }
    
    /**
     * 绘制背景
     */
    drawBackground() {
        this.ctx.fillStyle = '#1a252f';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    /**
     * 绘制防御塔
     */
    drawTowers() {
        this.towers.forEach(tower => {
            // 更新防御塔的屏幕坐标（防止地图尺寸改变）
            const screenPos = this.map.gridToScreen(tower.col, tower.row);
            if (screenPos) {
                tower.x = screenPos.x;
                tower.y = screenPos.y;
            }
            
            // 绘制防御塔主体（圆形）
            const radius = Math.min(this.map.cellWidth, this.map.cellHeight) * 0.35;
            tower.radius = radius; // 保存半径用于鼠标检测
            
            // 根据防御塔类型选择颜色
            let color = '#3498db'; // 默认蓝色
            switch (tower.category) {
                case '防御塔':
                case '箭塔':
                    color = '#3498db'; // 蓝色
                    break;
                case '法师塔':
                    color = '#9b59b6'; // 紫色
                    break;
                case '炮塔':
                    color = '#e74c3c'; // 红色
                    break;
                case '兵营':
                    color = '#27ae60'; // 绿色
                    break;
                case '英雄':
                    color = '#f1c40f'; // 金色（英雄）
                    break;
            }
            
            // 绘制防御塔圆形
            this.ctx.fillStyle = color;
            this.ctx.beginPath();
            this.ctx.arc(tower.x, tower.y, radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 绘制边框
            this.ctx.strokeStyle = '#2c3e50';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // 大招瞄准中：该塔强高亮（与地图上金色射程、紫色落点区区分）
            if (this.ultAimingTower === tower) {
                this.ctx.save();
                this.ctx.strokeStyle = 'rgba(46, 204, 113, 0.98)';
                this.ctx.lineWidth = 5;
                this.ctx.shadowColor = 'rgba(39, 174, 96, 0.75)';
                this.ctx.shadowBlur = 14;
                this.ctx.beginPath();
                this.ctx.arc(tower.x, tower.y, radius + 7, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.restore();
            }

            // 非英雄：休整期「移动位置」模式高亮
            if (this.movingDefenseTower === tower && !tower.isHero && tower.category !== '英雄') {
                this.ctx.setLineDash([6, 4]);
                this.ctx.strokeStyle = 'rgba(241, 196, 15, 0.98)';
                this.ctx.lineWidth = 3;
                this.ctx.beginPath();
                this.ctx.arc(tower.x, tower.y, radius + 5, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            }

            // 非英雄：过载/防御模式外圈提示
            if (!tower.isHero && tower.category !== '英雄') {
                if (tower.upgradeMode === 'overload') {
                    this.ctx.strokeStyle = 'rgba(231, 76, 60, 0.95)';
                    this.ctx.lineWidth = 3;
                    this.ctx.beginPath();
                    this.ctx.arc(tower.x, tower.y, radius + 3, 0, Math.PI * 2);
                    this.ctx.stroke();
                } else if (tower.upgradeMode === 'defense') {
                    this.ctx.strokeStyle = 'rgba(52, 152, 219, 0.95)';
                    this.ctx.lineWidth = 3;
                    this.ctx.beginPath();
                    this.ctx.arc(tower.x, tower.y, radius + 3, 0, Math.PI * 2);
                    this.ctx.stroke();
                }
            }

            // 英雄额外描边：更显眼
            if (tower.isHero || tower.category === '英雄') {
                this.ctx.strokeStyle = 'rgba(241, 196, 15, 0.95)';
                this.ctx.lineWidth = 4;
                this.ctx.beginPath();
                this.ctx.arc(tower.x, tower.y, radius, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.lineWidth = 2;
            }
            
            // 绘制防御塔图标（如果有）
            const icon = tower.item.icon || this.getIconByRarity(tower.item.rarity || tower.item.quality);
            this.ctx.font = `${radius * 0.8}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillText(icon, tower.x, tower.y);
            
            const barWidth = radius * 2;
            const barHeight = 4;
            const cellType = this.map.getCellType(tower.col, tower.row);
            this.ensureTowerPowerFields(tower);
            const pMax = Math.max(1, tower.towerPowerMax || 1);
            const pCur = Math.min(pMax, tower.towerPower != null ? tower.towerPower : 0);
            const pRatio = pCur / pMax;

            // 英雄：始终显示 等级（上）+ 生命条 + 经验条 + 威能条（最靠下贴近塔）
            if (tower.isHero || tower.category === '英雄') {
                const lvl = tower.heroLevel != null ? tower.heroLevel : 1;
                const curXp = Math.max(0, tower.heroXp != null ? tower.heroXp : 0);
                const needXp = Math.max(1, tower.heroXpToNext != null ? tower.heroXpToNext : this.getHeroXpToNext(lvl));
                const xpRatio = Math.min(1, curXp / needXp);
                const maxHp = tower.health || 10;
                const curHp = Math.max(0, tower.currentHealth != null ? tower.currentHealth : maxHp);
                const hpRatio = maxHp > 0 ? curHp / maxHp : 0;
                const gap = 2;
                // 从上往下：等级 → 生命 → 经验（经验条最贴近塔）
                let yTop = tower.y - radius - 8;
                this.ctx.font = 'bold 11px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillStyle = '#ecf0f1';
                this.ctx.strokeStyle = '#2c3e50';
                this.ctx.lineWidth = 3;
                this.ctx.strokeText(`Lv.${lvl}`, tower.x, yTop);
                this.ctx.fillText(`Lv.${lvl}`, tower.x, yTop);

                const hpY = yTop + 10 + gap;
                this.ctx.fillStyle = '#c0392b';
                this.ctx.fillRect(tower.x - barWidth / 2, hpY, barWidth, barHeight);
                this.ctx.fillStyle = '#27ae60';
                this.ctx.fillRect(tower.x - barWidth / 2, hpY, barWidth * hpRatio, barHeight);
                this.ctx.strokeStyle = '#2c3e50';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(tower.x - barWidth / 2, hpY, barWidth, barHeight);

                const xpY = hpY + barHeight + gap;
                this.ctx.fillStyle = 'rgba(44, 62, 80, 0.35)';
                this.ctx.fillRect(tower.x - barWidth / 2, xpY, barWidth, barHeight);
                this.ctx.fillStyle = '#3498db';
                this.ctx.fillRect(tower.x - barWidth / 2, xpY, barWidth * xpRatio, barHeight);
                this.ctx.strokeStyle = '#2c3e50';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(tower.x - barWidth / 2, xpY, barWidth, barHeight);

                const powY = xpY + barHeight + gap;
                this.ctx.fillStyle = 'rgba(44, 62, 80, 0.45)';
                this.ctx.fillRect(tower.x - barWidth / 2, powY, barWidth, barHeight);
                this.ctx.fillStyle = pRatio >= 1 ? '#f1c40f' : '#e67e22';
                this.ctx.fillRect(tower.x - barWidth / 2, powY, barWidth * pRatio, barHeight);
                this.ctx.strokeStyle = '#2c3e50';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(tower.x - barWidth / 2, powY, barWidth, barHeight);

                this.ctx.textAlign = 'left';
                this.ctx.textBaseline = 'alphabetic';
            } else if (cellType !== this.map.CELL_TYPES.BASE) {
                // 非英雄：威能条（最上）+ 护盾条 + 血量条（基地格不会有塔）
                const maxHp = tower.health || 10;
                const curHp = Math.max(0, tower.currentHealth != null ? tower.currentHealth : maxHp);
                const barX = tower.x - barWidth / 2;
                let barY = tower.y - radius - 8;
                const maxSh = tower.maxShield != null ? tower.maxShield : 0;
                let powerY = barY - barHeight - 3;
                if (maxSh > 0) powerY -= barHeight + 3;
                this.ctx.fillStyle = 'rgba(44, 62, 80, 0.45)';
                this.ctx.fillRect(barX, powerY, barWidth, barHeight);
                this.ctx.fillStyle = pRatio >= 1 ? '#f1c40f' : '#e67e22';
                this.ctx.fillRect(barX, powerY, barWidth * pRatio, barHeight);
                this.ctx.strokeStyle = '#2c3e50';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(barX, powerY, barWidth, barHeight);
                if (maxSh > 0) {
                    const curSh = Math.max(0, tower.shield != null ? tower.shield : 0);
                    const shieldY = barY - barHeight - 3;
                    this.ctx.fillStyle = 'rgba(44, 62, 80, 0.5)';
                    this.ctx.fillRect(barX, shieldY, barWidth, barHeight);
                    this.ctx.fillStyle = '#5dade2';
                    this.ctx.fillRect(barX, shieldY, barWidth * (maxSh > 0 ? curSh / maxSh : 0), barHeight);
                    this.ctx.strokeStyle = '#2874a6';
                    this.ctx.lineWidth = 1;
                    this.ctx.strokeRect(barX, shieldY, barWidth, barHeight);
                }
                this.ctx.fillStyle = '#c0392b';
                this.ctx.fillRect(barX, barY, barWidth, barHeight);
                this.ctx.fillStyle = '#27ae60';
                this.ctx.fillRect(barX, barY, barWidth * (maxHp > 0 ? curHp / maxHp : 0), barHeight);
                this.ctx.strokeStyle = '#2c3e50';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(barX, barY, barWidth, barHeight);
            }
        });
    }
    
    /**
     * 与敌人管理器一致的当前波次（用于 UI/倒计时门控）
     * @returns {number}
     */
    getDisplayWave() {
        return this.enemyManager ? this.enemyManager.getCurrentWave() : (this.currentWave || 0);
    }

    /**
     * 下一波自动开启前的剩余整秒数。
     * 若时间已到但 enemyManager 仍 isSpawning（上一波还在按间隔出兵），自动开波会延后一帧帧重试；
     * 此时 remainMs<=0，若仍应存在「下一波」则返回 0，避免第二波→第三波之间 UI 整段空白。
     * @returns {number|null}
     */
    getSpawnNextWaveCountdownSec() {
        if (this.interWaveCountdownEnd == null) return null;
        const remainMs = this.interWaveCountdownEnd - performance.now();
        if (remainMs > 0) {
            return Math.max(1, Math.ceil(remainMs / 1000 - 0.001));
        }
        const maxW = this.getMaxConfiguredWaveNumber();
        if (maxW > 0 && this.getDisplayWave() < maxW) {
            return 0;
        }
        return null;
    }

    /**
     * 配表内最大波次编号（清完该波后不再自动开下一波，除非走无限生成）
     */
    getMaxConfiguredWaveNumber() {
        const waves = this.enemyManager && this.enemyManager.waveConfig && this.enemyManager.waveConfig.waves;
        if (!waves || waves.length === 0) return 0;
        return Math.max(...waves.map(w => w.waveNumber));
    }

    /**
     * 第 waveNumber 波配置中的 nextWaveDelaySec：**本波开始（出兵）起算**，多少秒后自动开下一波（与是否清完怪无关）
     * @param {number} waveNumber
     * @returns {number}
     */
    getNextWaveDelaySecAfterWave(waveNumber) {
        const w = this.enemyManager && this.enemyManager.waveConfig
            ? this.enemyManager.waveConfig.getWave(waveNumber)
            : null;
        const n = w && w.nextWaveDelaySec != null ? Number(w.nextWaveDelaySec) : 15;
        return Math.max(0, Number.isFinite(n) ? n : 15);
    }

    /**
     * 当前波已成功开始（第一波怪物出现瞬间起）：按本波配置的 nextWaveDelaySec 启动「下一波到来」倒计时，到时自动开下一波
     */
    scheduleNextWaveTimerAfterCurrentWaveStarted() {
        this.interWaveCountdownEnd = null;
        if (this.levelFailed) return;
        if (!this.enemyManager) return;
        const cw = this.enemyManager.getCurrentWave();
        const maxW = this.getMaxConfiguredWaveNumber();
        if (maxW <= 0 || cw >= maxW) return;
        const sec = this.getNextWaveDelaySecAfterWave(cw);
        if (sec <= 0) {
            queueMicrotask(() => this.tryAutoStartNextWave());
            return;
        }
        this.interWaveCountdownEnd = performance.now() + sec * 1000;
        console.log(`[波次] 第 ${cw} 波已开始，${sec}s 后自动第 ${cw + 1} 波`);
    }

    /**
     * 倒计时结束或延迟为 0 时调用：开始下一波（若仍有配置）
     */
    /**
     * @returns {boolean} 是否已成功开始下一波
     */
    tryAutoStartNextWave() {
        if (this.levelFailed || !this.isRunning) return false;
        if (!this.enemyManager) return false;
        if (this.enemyManager.isSpawning) return false;
        const maxW = this.getMaxConfiguredWaveNumber();
        if (maxW <= 0 || this.getDisplayWave() >= maxW) return false;
        // 不先清 interWaveCountdownEnd，由调用方在成功后再清
        return this.startNextWave(false);
    }

    /**
     * 在出怪口格子上绘制「下一波」倒计时（秒）
     */
    drawInterWaveSpawnCountdown() {
        const sec = this.getSpawnNextWaveCountdownSec();
        if (sec === null) return;
        const spawns = this.map.getSpawnPointsOrdered();
        const cw = this.map.cellWidth;
        const ch = this.map.cellHeight;
        const fs = Math.max(12, Math.min(22, Math.floor(cw * 0.38)));
        this.ctx.save();
        this.ctx.font = `bold ${fs}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        const label = sec <= 0 ? '即将下一波' : `下一波 ${sec}s`;
        if (spawns && spawns.length > 0) {
            spawns.forEach(p => {
                const pos = this.map.gridToScreen(p.col, p.row);
                if (!pos) return;
                const x = pos.x;
                const y = pos.y + ch * 0.28;
                const tw = Math.min(cw * 0.92, this.ctx.measureText(label).width + 10);
                const th = fs + 8;
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
                this.ctx.fillRect(x - tw / 2, y - th / 2, tw, th);
                this.ctx.strokeStyle = '#f1c40f';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(x - tw / 2, y - th / 2, tw, th);
                this.ctx.lineWidth = 3;
                this.ctx.strokeStyle = '#1a252f';
                this.ctx.strokeText(label, x, y);
                this.ctx.fillStyle = '#fff9e6';
                this.ctx.fillText(label, x, y);
            });
        } else {
            const x = this.canvas.width / 2;
            const y = this.canvas.height - 36;
            const twBox = Math.max(160, this.ctx.measureText(label).width + 24);
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
            this.ctx.fillRect(x - twBox / 2, y - 16, twBox, 32);
            this.ctx.strokeStyle = '#f1c40f';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x - twBox / 2, y - 16, twBox, 32);
            this.ctx.lineWidth = 3;
            this.ctx.strokeStyle = '#1a252f';
            this.ctx.strokeText(label, x, y);
            this.ctx.fillStyle = '#fff9e6';
            this.ctx.fillText(label, x, y);
        }
        this.ctx.restore();
    }

    /**
     * 开始下一波
     * @param {boolean} [clearInterWaveTimer=true] 是否清除休整倒计时；自动开波时传 false，成功后再由外层清除
     * @returns {boolean} 是否成功开始
     */
    startNextWave(clearInterWaveTimer = true) {
        if (clearInterWaveTimer) {
            this.interWaveCountdownEnd = null;
        }
        if (this.enemyManager) {
            const waveBefore = this.enemyManager.getCurrentWave();
            const success = this.enemyManager.startNextWave();
            if (success) {
                this.cancelDefenseTowerMoveMode();
                this.hideTowerUpgradeMenu();
                this.currentWave = this.enemyManager.getCurrentWave();
                // 首次从 0→1 波：产灵条从 0 开始（此前不允许产灵）
                if (waveBefore === 0 && this.currentWave === 1) {
                    this.baseSpiritAccumMs = 0;
                    this._baseSpiritLastTick = null;
                }
                this.waveRewardGiven = false; // 新波开始，尚未发放本波结束奖励
                // 每塔大招：新波可再释放一次
                (this.towers || []).forEach(t => {
                    if (t) t.ultUsedThisWave = false;
                });
                console.log(`开始第 ${this.currentWave} 波`);
                // 若因基地被毁已停止主循环，点「下一波」时回满基地生命并重新启动循环（须先于倒计时，否则 levelFailed 会挡掉定时）
                if (!this.isRunning) {
                    if (this.levelFailed) {
                        this.baseHealth = this.maxBaseHealth;
                        this.levelFailed = false;
                        this.enemyManager.clearAll();
                        this.baseSpiritAccumMs = 0;
                        this._baseSpiritLastTick = null;
                    }
                    this.start();
                }
                // 即时制：本波开始的瞬间起算倒计时，到时自动下一波（不等待清怪）
                this.scheduleNextWaveTimerAfterCurrentWaveStarted();
                return true;
            }
        }
        return false;
    }
    
    /**
     * 更新飞行子弹：移动并检测命中，命中时结算伤害
     * @param {number} deltaTime - 帧间隔（毫秒）
     */
    updateProjectiles(deltaTime) {
        const hitRadius = 14; // 与敌人中心距离小于此视为命中
        const dt = (deltaTime || 16) / 1000;

        this.projectiles = this.projectiles.filter(proj => {
            // 飞向矿石格：追踪格心（无 enemy target）
            if (proj.oreCol != null && proj.oreRow != null) {
                const map = this.map;
                if (!map) return false;
                map.calculateCellSize();
                const scr = map.gridToScreen(proj.oreCol, proj.oreRow);
                if (!scr) return false;
                const speed = proj.speed || 450;
                const dx = scr.x - proj.x;
                const dy = scr.y - proj.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                proj.vx = (dx / dist) * speed;
                proj.vy = (dy / dist) * speed;
                proj.x += proj.vx * dt;
                proj.y += proj.vy * dt;
                const toTx = scr.x - proj.x;
                const toTy = scr.y - proj.y;
                if (toTx * toTx + toTy * toTy < hitRadius * hitRadius) {
                    const od = proj.damage != null ? proj.damage : 0;
                    this.applyOreHitFromTower(proj.sourceTower, proj.oreCol, proj.oreRow, od);
                    return false;
                }
                return true;
            }

            if (!proj.target) return false;
            if (!proj.target.isAlive) {
                if (proj.sourceTower && proj.sourceTower.currentTarget === proj.target) {
                    proj.sourceTower.currentTarget = null;
                }
                if (!proj.hitEnemyIds) proj.hitEnemyIds = [];
                if (proj.target.id != null) proj.hitEnemyIds.push(proj.target.id);
                const prDead = proj.pierceRemaining | 0;
                if (prDead > 0 && proj.sourceTower && this.towerAttackSystem) {
                    const nextDead = this.towerAttackSystem.pickNextPierceTarget(proj.sourceTower, proj.hitEnemyIds || []);
                    if (nextDead) {
                        proj.target = nextDead;
                        proj.pierceRemaining = prDead - 1;
                        return true;
                    }
                }
                return false;
            }
            // 已发射的子弹不再因“目标出范围”而移除，让本发打出去并结算命中；索敌仍只从范围内选，不会持续打范围外
            // 追踪弹：每帧朝目标当前位置飞行，避免快移速敌人打不中
            const speed = proj.speed || 450;
            const dx = proj.target.x - proj.x;
            const dy = proj.target.y - proj.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            proj.vx = (dx / dist) * speed;
            proj.vy = (dy / dist) * speed;
            proj.x += proj.vx * dt;
            proj.y += proj.vy * dt;
            const toTargetX = proj.target.x - proj.x;
            const toTargetY = proj.target.y - proj.y;
            if (toTargetX * toTargetX + toTargetY * toTargetY < hitRadius * hitRadius) {
                if (proj.sourceTower) proj.sourceTower.currentTarget = null;
                if (!proj.hitEnemyIds) proj.hitEnemyIds = [];
                proj.hitEnemyIds.push(proj.target.id);

                if (proj.applyFrostSlow && proj.target.applyFrostSlow) {
                    proj.target.applyFrostSlow(proj.applyFrostSlow.factor, proj.applyFrostSlow.ms);
                }

                const killed = proj.target.takeDamage(proj.damage);

                if (killed) {
                    const rw = proj.target.reward || 0;
                    this.applyGoldCoinsIncome(rw);
                    const br = proj.sourceTower && proj.sourceTower.branchRuntime;
                    if (br && br.goldKillExtraChance > 0 && Math.random() < br.goldKillExtraChance) {
                        this.applyGoldCoinsIncome(rw);
                    }
                    this.enemiesKilled = (this.enemiesKilled || 0) + 1;
                }
                if (!proj.splitApplied && (proj.splitExtraTargets | 0) > 0 && proj.sourceTower) {
                    proj.splitApplied = true;
                    this.applyProjectileSplitDamage(
                        proj.sourceTower,
                        proj.target,
                        proj.damage,
                        proj.splitExtraTargets,
                        proj.splitDmgScale || 0
                    );
                }
                if (proj.sourceTower && proj.damage != null) {
                    this.addHeroExperienceFromDamage(proj.sourceTower, proj.damage);
                }
                const gain = (proj.sourceTower && proj.sourceTower.powerGainPerHit != null) ? proj.sourceTower.powerGainPerHit : 1;
                this.addTowerPower(proj.sourceTower, gain);

                const prHit = proj.pierceRemaining | 0;
                if (prHit > 0 && proj.sourceTower && this.towerAttackSystem) {
                    const nextHit = this.towerAttackSystem.pickNextPierceTarget(proj.sourceTower, proj.hitEnemyIds || []);
                    if (nextHit) {
                        proj.target = nextHit;
                        proj.pierceRemaining = prHit - 1;
                        return true;
                    }
                }
                return false;
            }
            return true;
        });
    }

    /**
     * 塔/英雄命中矿石：按伤害扣当前命 HP，条命扣光时加灵力；命尽变局内矿机（不写蓝图）
     * @param {Object|null} tower
     * @param {number} col
     * @param {number} row
     * @param {number} damage - 本次攻击伤害（与打怪一致）
     */
    applyOreHitFromTower(tower, col, row, damage) {
        if (!this.map || !this.map.applyOreDamage) return;
        const res = this.map.applyOreDamage(col, row, damage != null ? damage : 0);
        if (!res) {
            if (tower) tower.currentOreTarget = null;
            return;
        }
        this.gameState.spirit = Math.max(0, (this.gameState.spirit || 0) + res.spiritGained);
        this.updateSpiritUI();
        if (res.becameMiner && tower) {
            // 局内转化的矿机不写本地蓝图，刷新后仍从蓝图恢复为满血矿石
            tower.currentOreTarget = null;
        }
        const gain = tower && tower.powerGainPerHit != null ? tower.powerGainPerHit : 1;
        this.addTowerPower(tower, gain);
        console.log(`[矿石] (${col},${row}) +灵力 ${res.spiritGained}，变矿机=${res.becameMiner}`);
    }

    /**
     * 遍历地图矿机格，按间隔累计时间并发放灵力
     * @param {number} deltaTime
     */
    updateMinersSpirit(deltaTime) {
        const map = this.map;
        if (!map || !map.grid || !map.CELL_TYPES) return;
        const dt = Math.max(0, deltaTime || 16);
        const CT = map.CELL_TYPES;
        for (let row = 0; row < map.gridRows; row++) {
            for (let col = 0; col < map.gridCols; col++) {
                const cell = map.grid[row][col];
                if (cell.type !== CT.MINER) continue;
                const intervalMs = Math.max(100, (Number(cell.minerIntervalSec) || 3) * 1000);
                const add = Math.max(0, cell.minerSpiritPerTick | 0);
                if (add <= 0) continue;
                cell.minerAccumMs = (cell.minerAccumMs || 0) + dt;
                while (cell.minerAccumMs >= intervalMs) {
                    cell.minerAccumMs -= intervalMs;
                    this.gameState.spirit = Math.max(0, (this.gameState.spirit || 0) + add);
                    this.updateSpiritUI();
                }
            }
        }
    }
    
    /**
     * 绘制投射物
     */
    drawProjectiles() {
        this.projectiles.forEach(projectile => {
            const category = projectile.category || '防御塔';
            if (category === '法师塔') {
                this.ctx.fillStyle = '#9b59b6';
            } else {
                this.ctx.fillStyle = '#f39c12';
            }
            this.ctx.beginPath();
            this.ctx.arc(projectile.x, projectile.y, 5, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
        });
    }
    
    /**
     * 绘制UI（生命值、波次等）- 固定在右上角
     */
    drawUI() {
        // 设置文字样式
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 18px Arial';
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'top';
        
        // 右上角位置（距离右边和顶部各20px）
        const rightMargin = 20;
        const topMargin = 20;
        const lineHeight = 28;
        let y = topMargin;
        
        // 绘制背景（半透明黑色，增强可读性）
        const cdSec = this.getSpawnNextWaveCountdownSec();
        const showSpiritHud =
            this.isRunning &&
            !this.levelFailed &&
            this.enemyManager &&
            (this.enemyManager.isSpawning || this.enemyManager.getAliveEnemyCount() > 0);
        let lineCount = 3;
        if (cdSec != null) lineCount++;
        if (showSpiritHud) lineCount++;
        const textWidth = 340;
        const textHeight = lineHeight * lineCount + 10;
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(
            this.canvas.width - textWidth - rightMargin,
            topMargin - 5,
            textWidth,
            textHeight
        );
        
        // 绘制文字（基地生命已显示在基地格上方）
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText(`波次: ${this.currentWave}`, this.canvas.width - rightMargin, y);
        y += lineHeight;
        this.ctx.fillText(`金币: ${this.gameState.coins}`, this.canvas.width - rightMargin, y);
        y += lineHeight;
        this.ctx.fillText(`收获力: ${this.gameState.harvestPower ?? 0}`, this.canvas.width - rightMargin, y);
        if (cdSec != null) {
            y += lineHeight;
            this.ctx.fillStyle = '#f1c40f';
            this.ctx.font = 'bold 17px Arial';
            const cdLine =
                cdSec <= 0
                    ? '下一波即将到达（等待出兵队列）'
                    : `下一波到来还有 ${cdSec} 秒`;
            this.ctx.fillText(cdLine, this.canvas.width - rightMargin, y);
        }
        if (showSpiritHud) {
            y += lineHeight;
            const iv = Math.max(500, this.baseSpiritIntervalMs || 10000);
            const pct = Math.min(99, Math.floor(((this.baseSpiritAccumMs || 0) / iv) * 100));
            const amt = Math.max(1, this.baseSpiritPerCycle || 20);
            this.ctx.fillStyle = '#e8daef';
            this.ctx.font = 'bold 16px Arial';
            this.ctx.fillText(`产灵 ${pct}% (满→+${amt})`, this.canvas.width - rightMargin, y);
        }

        // 恢复默认对齐方式
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'alphabetic';
    }
    
    /**
     * 处理Canvas鼠标移动事件（检测防御塔悬停）
     */
    handleCanvasMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // 地图编辑器：基地预览 / 石块与擦除悬停
        if (window.MapEditorPanel && typeof window.MapEditorPanel.isOpen === 'function' && window.MapEditorPanel.isOpen()) {
            const tool = window.MapEditorPanel.getTool ? window.MapEditorPanel.getTool() : null;
            if (tool === 'base') {
                this.previewBaseAnchor = this.map.screenToGrid(x, y);
            } else {
                this.previewBaseAnchor = null;
            }
            if (tool === 'stone' || tool === 'erase' || tool === 'spawn' || tool === 'ore' || tool === 'miner') {
                this.previewMapEditCell = this.map.screenToGrid(x, y);
            } else {
                this.previewMapEditCell = null;
            }
        } else {
            this.previewBaseAnchor = null;
            this.previewMapEditCell = null;
        }

        // 检查鼠标是否在某个防御塔上
        let hoveredTower = null;
        for (const tower of this.towers) {
            const dx = x - tower.x;
            const dy = y - tower.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= tower.radius) {
                hoveredTower = tower;
                break;
            }
        }
        
        // 大招拖动瞄准：预览「AOE ∩ 塔射程」
        if (this.ultAimingTower) {
            this.updateUltAimingPreview(x, y);
            this.previewRangeCells = null;
            return;
        }

        // 部署/移动：显示普通攻击范围预览
        {
            this.heroSkillPreviewCells = null;
            // 选中塔准备部署时 / 英雄移动时：根据鼠标所在格显示攻击范围预览
            // 若悬停在路径上则显示路径模式，否则普通模式
            if (this.selectedTowerItem || this.movingHero || this.movingDefenseTower) {
                const gridPos = this.map.screenToGrid(x, y);
                if (gridPos) {
                    const mode = 'normal';
                    const src = this.selectedTowerItem
                        ? this.selectedTowerItem
                        : (this.movingHero ? this.movingHero.item : this.movingDefenseTower.item);
                    this.previewRangeCells = this.getTowerRangeCells(src, gridPos.col, gridPos.row, mode);
                } else {
                    this.previewRangeCells = null;
                }
            } else {
                this.previewRangeCells = null;
            }
        }
        
        // 悬停在已部署塔上时：显示该塔当前攻击模式的范围
        this.hoveredTowerRangeCells = hoveredTower
            ? this.getTowerRangeCells(hoveredTower, hoveredTower.col, hoveredTower.row)
            : null;
        
        if (hoveredTower) {
            // 显示悬浮窗
            this.showTooltipForTower(hoveredTower, e.clientX, e.clientY);
        } else {
            // 隐藏悬浮窗
            this.hideTooltip();
        }
    }
    
    /**
     * 显示悬浮窗（物品栏中的防御塔）
     * @param {Object} item - 物品数据
     * @param {HTMLElement} element - DOM元素
     */
    showTooltip(item, element) {
        if (!this.tooltip) {
            return;
        }
        
        // 清除之前的延迟
        if (this.tooltipTimeout) {
            clearTimeout(this.tooltipTimeout);
        }
        
        // 延迟显示（避免鼠标快速移动时闪烁）
        this.tooltipTimeout = setTimeout(() => {
            this.tooltipItem = item;
            this.renderTooltip(item);
            
            // 计算位置（在元素右侧显示）
            const rect = element.getBoundingClientRect();
            this.tooltip.style.left = (rect.right + 10) + 'px';
            this.tooltip.style.top = rect.top + 'px';
            this.tooltip.classList.add('visible');
        }, 200);
    }
    
    /**
     * 显示悬浮窗（地图上的防御塔）
     * @param {Object} tower - 防御塔对象
     * @param {number} mouseX - 鼠标X坐标（屏幕坐标）
     * @param {number} mouseY - 鼠标Y坐标（屏幕坐标）
     */
    showTooltipForTower(tower, mouseX, mouseY) {
        if (!this.tooltip) {
            return;
        }
        
        // 清除之前的延迟
        if (this.tooltipTimeout) {
            clearTimeout(this.tooltipTimeout);
        }
        
        // 延迟显示
        this.tooltipTimeout = setTimeout(() => {
            this.tooltipItem = tower.item;
            this.renderTooltip(tower.item);
            
            // 计算位置（在鼠标附近显示，避免超出屏幕）
            const tooltipWidth = 300;
            const tooltipHeight = 400;
            let left = mouseX + 15;
            let top = mouseY + 15;
            
            // 如果超出右边界，显示在左侧
            if (left + tooltipWidth > window.innerWidth) {
                left = mouseX - tooltipWidth - 15;
            }
            
            // 如果超出下边界，向上调整
            if (top + tooltipHeight > window.innerHeight) {
                top = mouseY - tooltipHeight - 15;
            }
            
            this.tooltip.style.left = left + 'px';
            this.tooltip.style.top = top + 'px';
            this.tooltip.classList.add('visible');
        }, 200);
    }
    
    /**
     * 隐藏悬浮窗
     */
    hideTooltip() {
        if (this.tooltipTimeout) {
            clearTimeout(this.tooltipTimeout);
            this.tooltipTimeout = null;
        }
        
        if (this.tooltip) {
            this.tooltip.classList.remove('visible');
            this.tooltipItem = null;
        }
    }

    /**
     * 隐藏塔进化菜单
     */
    hideEvolveMenu() {
        if (this.evolveMenu) this.evolveMenu.classList.add('hidden');
        this.evolveMenuTower = null;
        if (this.evolveMenuTimeout) {
            clearTimeout(this.evolveMenuTimeout);
            this.evolveMenuTimeout = null;
        }
        this.hideTowerUpgradeMenu();
    }

    /**
     * 左下角英雄技能栏已废弃；大招为战斗中在威能满的塔上拖动释放
     */
    updateHeroSkillBar() {
        if (this.heroSkillBar) {
            this.heroSkillBar.classList.add('hidden');
            this.heroSkillBar.innerHTML = '';
        }
    }

    /**
     * 根据技能配置计算大招伤害
     * @param {Object} heroTower
     * @param {Object} skill
     * @returns {number}
     */
    computeHeroSkillDamage(heroTower, skill) {
        const base = heroTower.baseAttack || 0;
        const multiplier = skill?.damageMultiplier != null ? skill.damageMultiplier : 1;

        let damage = base;
        if (this.playerStats && base > 0) {
            const physical = this.playerStats.getStat('physical_damage') || 0;
            const magic = this.playerStats.getStat('magic_damage') || 0;
            const explosion = this.playerStats.getStat('explosion_damage') || 0;
            const totalPercent = this.playerStats.getStat('total_damage_percent') || 0;

            if (heroTower.category === '法师塔') damage += magic;
            else if (heroTower.category === '炮塔') damage += explosion;
            else damage += physical;

            damage = damage * (1 + totalPercent);
            const atkBonus = this.playerStats.getStat('attack_damage_bonus') || 0;
            const elemDmg = this.playerStats.getStat('elemental_damage_bonus') || 0;
            damage *= (1 + atkBonus) * (1 + elemDmg);
            const critP = Math.min(0.95, (this.playerStats.getStat('crit_chance_bonus') || 0) + (this.playerStats.getStat('crit_rate') || 0));
            if (critP > 0 && Math.random() < critP) {
                damage *= 2;
            }
        }

        damage = damage * multiplier;
        return Math.max(0, Math.round(damage));
    }

    /**
     * 将金币收益加成应用到单次金币入账
     * @param {number} amount
     * @returns {number} 实际增加的金币
     */
    applyGoldCoinsIncome(amount) {
        const base = Math.max(0, Math.floor(Number(amount) || 0));
        if (base <= 0) return 0;
        const b = this.playerStats && this.playerStats.getStat ? (this.playerStats.getStat('gold_income_bonus') || 0) : 0;
        const add = Math.max(0, Math.round(base * (1 + b)));
        this.gameState.coins = Math.max(0, (this.gameState.coins || 0) + add);
        return add;
    }

    /**
     * 玩家「生命值恢复加成」：战斗中防御塔缓慢回血
     * @param {number} deltaTime
     */
    applyTowerHealthRegen(deltaTime) {
        if (!this.playerStats || !this.towers || !this.towers.length) return;
        const reg = this.playerStats.getStat('health_regen_bonus') || 0;
        if (reg <= 0) return;
        const sec = Math.max(0, deltaTime / 1000);
        for (let i = 0; i < this.towers.length; i++) {
            const t = this.towers[i];
            if (!t || !t.health) continue;
            const maxHp = t.health;
            let cur = t.currentHealth != null ? t.currentHealth : maxHp;
            if (cur >= maxHp) continue;
            // 每秒回复 maxHp × reg × 1%（reg=0.1 表示约 0.1%/s）
            const perSec = maxHp * reg * 0.01;
            cur = Math.min(maxHp, cur + perSec * sec);
            t.currentHealth = cur;
        }
    }

    /**
     * 在锚点格释放统一大招：伤害落在「技能 AOE ∩ 塔攻击范围」内
     * @param {Object} tower
     * @param {number} anchorCol
     * @param {number} anchorRow
     */
    castTowerUltimateAt(tower, anchorCol, anchorRow) {
        if (!tower || !this.towers.includes(tower)) return;
        const skillIndex = this.ultAimingSkillIndex || 1;
        const isHero = tower.isHero || tower.category === '英雄';
        const skill = this.getUnifiedTowerUltimateSkill(tower, skillIndex);

        if (isHero) {
            const idx = skillIndex === 2 ? 2 : 1;
            const cdKey = idx === 2 ? 'heroSkill2CdUntil' : 'heroSkill1CdUntil';
            const now = performance.now();
            if (now < (tower[cdKey] || 0)) {
                console.warn('[大招] 技能冷却中，施放取消');
                return;
            }
            const sc = this.getEffectiveHeroSpiritCost(skill.spiritCost);
            if ((this.gameState.spirit || 0) < sc) {
                console.warn('[大招] 灵力不足，施放取消');
                return;
            }
            const pMax = tower.towerPowerMax != null ? tower.towerPowerMax : 100;
            const needPow = Math.min(Number(skill.powerCost) != null ? Number(skill.powerCost) : pMax, pMax);
            if ((tower.towerPower || 0) < needPow) {
                console.warn('[大招] 威能不足，施放取消');
                return;
            }
        } else {
            if (!this.isTowerPowerFull(tower) || tower.ultUsedThisWave) return;
        }

        const damageCells = this.computeUltimateDamageCells(tower, anchorCol, anchorRow, skill);
        const cellSet = new Set(damageCells.map(c => `${c.col},${c.row}`));
        if (cellSet.size === 0) {
            console.warn('[大招] 无有效伤害格（锚点需在塔射程内且与 AOE 有交集）');
            return;
        }

        const enemies = this.enemyManager ? this.enemyManager.getEnemies() : [];
        const damage = this.computeHeroSkillDamage(tower, skill);
        if (damage > 0) {
            enemies.forEach(enemy => {
                if (!enemy || !enemy.isAlive) return;
                const enemyCell = this.map.screenToGrid(enemy.x, enemy.y);
                if (!enemyCell) return;
                const key = `${enemyCell.col},${enemyCell.row}`;
                if (cellSet.has(key)) {
                    const killed = enemy.takeDamage(damage);
                    if (killed) {
                        this.applyGoldCoinsIncome(enemy.reward || 0);
                        this.enemiesKilled = (this.enemiesKilled || 0) + 1;
                    }
                    if (tower.isHero || tower.category === '英雄') {
                        this.addHeroExperienceFromDamage(tower, damage);
                    }
                }
            });
        }

        this.ensureTowerPowerFields(tower);
        if (isHero) {
            const idx = skillIndex === 2 ? 2 : 1;
            const cdKey = idx === 2 ? 'heroSkill2CdUntil' : 'heroSkill1CdUntil';
            const sc = this.getEffectiveHeroSpiritCost(skill.spiritCost);
            this.gameState.spirit = Math.max(0, (this.gameState.spirit || 0) - sc);
            this.updateSpiritUI();
            const cdSec = Math.max(0, Number(skill.cooldownSec) || 0);
            tower[cdKey] = performance.now() + cdSec * 1000;
            tower.towerPower = 0;
            console.log('[大招] 英雄技能', idx, '已释放', tower.name, '扣灵力', sc, 'CD', cdSec, 's');
        } else {
            tower.towerPower = 0;
            tower.ultUsedThisWave = true;
        }

        this.heroSkillPreviewCells = null;
        this.previewRangeCells = null;
        this.hideTooltip();
        console.log('[大招] 已释放', tower.name, anchorCol, anchorRow, '格数', cellSet.size, 'skillIndex', skillIndex);
    }

    /**
     * 取消英雄移动模式
     */
    cancelHeroMoveMode() {
        this.movingHero = null;
        this.previewRangeCells = null;
    }

    /**
     * 尝试将英雄移动到指定格子
     * @param {Object} heroTower - 运行时英雄对象
     * @param {number} col
     * @param {number} row
     * @returns {boolean} 是否移动成功
     */
    tryMoveHeroTo(heroTower, col, row) {
        if (!heroTower) return false;
        if (col === heroTower.col && row === heroTower.row) {
            this.cancelHeroMoveMode();
            return true;
        }

        // 目标格可移动：空地或路径，且目标格不能被其他塔占用
        if (!this.map.canPlaceTower(col, row)) {
            return false;
        }

        // 释放所有贴脸攻击该英雄的敌人（避免英雄移走后敌人仍卡在“贴脸攻塔”状态）
        if (this.enemyManager && typeof this.enemyManager.getEnemies === 'function') {
            const enemies = this.enemyManager.getEnemies();
            enemies.forEach(enemy => {
                if (enemy && enemy.isBlocked && enemy.blockedByTower === heroTower) {
                    enemy.isBlocked = false;
                    enemy.blockedByTower = null;
                    enemy._navPath = null;
                    enemy._navGoalKey = '';
                }
            });
        }

        // 保存旧格 evolutionStage（进化标记）并在移动后搬运到新格
        const oldCell = (this.map.grid && this.map.grid[heroTower.row] && this.map.grid[heroTower.row][heroTower.col]) ? this.map.grid[heroTower.row][heroTower.col] : null;
        const oldStage = oldCell && oldCell.evolutionStage ? oldCell.evolutionStage : 0;

        // 更新地图占位
        this.map.removeTower(heroTower.col, heroTower.row);
        this.map.placeTower(col, row);
        if (this.map.setTowerEvolutionStage) this.map.setTowerEvolutionStage(col, row, oldStage);

        // 更新英雄坐标与用于鼠标检测的半径
        const screenPos = this.map.gridToScreen(col, row);
        if (screenPos) {
            heroTower.x = screenPos.x;
            heroTower.y = screenPos.y;
        }
        heroTower.col = col;
        heroTower.row = row;
        heroTower.radius = Math.min(this.map.cellWidth, this.map.cellHeight) * 0.35;

        // 无路径格，英雄始终按 normal 模式属性攻击
        const attackMode = 'normal';
        heroTower.attackMode = attackMode;

        this.refreshTowerCombatStats(heroTower);

        // 进度清零，避免切换后被当前冷却/锁定状态卡住
        heroTower.lastAttackTime = 0;
        heroTower.currentTarget = null;
        heroTower.currentOreTarget = null;

        // 移动完成：退出移动模式
        this.cancelHeroMoveMode();
        this.hideEvolveMenu();
        return true;
    }

    /**
     * 取消「非英雄塔移动位置」模式
     */
    cancelDefenseTowerMoveMode() {
        this.movingDefenseTower = null;
        this.previewRangeCells = null;
    }

    /**
     * 休整期将非英雄塔移动到另一格（不消耗灵力）
     * @param {Object} tower
     * @param {number} col
     * @param {number} row
     * @returns {boolean}
     */
    tryMoveDefenseTowerTo(tower, col, row) {
        if (!tower || tower.isHero || tower.category === '英雄') return false;
        if (!this.canRepositionTowers()) {
            console.log('[塔防] 战斗中不可移动防御塔，请等本波结束');
            return false;
        }
        if (col === tower.col && row === tower.row) {
            this.cancelDefenseTowerMoveMode();
            return true;
        }
        if (!this.map.canPlaceTower(col, row)) {
            return false;
        }
        if (this.enemyManager && typeof this.enemyManager.getEnemies === 'function') {
            const enemies = this.enemyManager.getEnemies();
            enemies.forEach(enemy => {
                if (enemy && enemy.isBlocked && enemy.blockedByTower === tower) {
                    enemy.isBlocked = false;
                    enemy.blockedByTower = null;
                    enemy._navPath = null;
                    enemy._navGoalKey = '';
                }
            });
        }
        const oldCell = (this.map.grid && this.map.grid[tower.row] && this.map.grid[tower.row][tower.col])
            ? this.map.grid[tower.row][tower.col]
            : null;
        const oldStage = oldCell && oldCell.evolutionStage ? oldCell.evolutionStage : 0;

        this.map.removeTower(tower.col, tower.row);
        this.map.placeTower(col, row);
        if (this.map.setTowerEvolutionStage) this.map.setTowerEvolutionStage(col, row, oldStage);

        const screenPos = this.map.gridToScreen(col, row);
        if (screenPos) {
            tower.x = screenPos.x;
            tower.y = screenPos.y;
        }
        tower.col = col;
        tower.row = row;
        tower.radius = Math.min(this.map.cellWidth, this.map.cellHeight) * 0.35;
        tower.lastAttackTime = 0;
        tower.currentTarget = null;
        tower.currentOreTarget = null;

        this.cancelDefenseTowerMoveMode();
        this.hideEvolveMenu();
        console.log(`[塔防] 防御塔已移动：${tower.name} → (${col},${row})`);
        return true;
    }

    /**
     * 原塔进化菜单已移除；移动/大招改由点击与拖动处理。保留空实现避免旧引用报错。
     */
    openEvolveMenu() {
        /* no-op */
    }

    /**
     * 对某座已放置塔执行进化（替换塔 item，并刷新其攻击/攻速/范围等运行时字段）
     * @param {Object} tower - 已放置防御塔对象
     */
    evolveTower(tower) {
        if (!tower) return;
        this.ensureTowerPowerFields(tower);
        if (!this.isTowerPowerFull(tower)) return;

        const nextId = tower.item?.attributes?.evolveTo;
        const nextItem = nextId ? this.gameState.findItemById(nextId) : null;
        if (!nextItem) return;

        // 消耗该塔满条威能
        tower.towerPower = 0;
        tower.towerPowerMax = this.getTowerPowerMaxForItem(nextItem);

        // 关键：替换 item 引用，使悬浮窗/图标等展示使用新数据
        tower.item = nextItem;
        tower.name = nextItem.name;
        tower.category = nextItem.category;
        tower.isHero = nextItem.category === '英雄';

        const attackMode = 'normal';
        tower.attackMode = attackMode;

        const nextAtt = nextItem.attributes || {};

        // 生命与能量获取：如果下一阶段有配置则更新，否则保留旧运行时值
        const nextHealth = nextAtt.health ?? nextAtt.baseHealth;
        if (nextHealth != null) {
            const maxHp = nextHealth;
            const ratio = maxHp > 0 ? ((tower.currentHealth || maxHp) / (tower.health || maxHp)) : 1;
            tower.health = maxHp;
            tower.currentHealth = Math.max(0, Math.round(maxHp * ratio));
        }

        if (nextAtt.powerGainPerHit != null) tower.powerGainPerHit = nextAtt.powerGainPerHit;

        // 缩放与特殊效果可直接替换（用于后续扩展）
        if (nextItem.scaling) tower.scaling = nextItem.scaling;
        if (Array.isArray(nextItem.specialEffects)) tower.specialEffects = nextItem.specialEffects;

        // 非英雄：进化后重置战场升级（需重新选过载/防御）；攻防由 refresh 重算并套配装
        if (!tower.isHero && tower.category !== '英雄') {
            tower.upgradeMode = null;
            tower.shield = 0;
            tower.maxShield = 0;
        }

        // 进化成英雄且尚无等级字段时补初始值（须在 refresh 前，以便 getTowerBattleTier 正确）
        if (tower.isHero || tower.category === '英雄') {
            if (tower.heroLevel == null) {
                tower.heroLevel = 1;
                tower.heroXp = 0;
                tower.heroXpToNext = this.getHeroXpToNext(1);
            }
        }

        // runtime id 保持为最初放置的塔物品 id，配装存档按「塔种」一条线；阶数由当前 item.quality / 英雄等级决定
        this.refreshTowerCombatStats(tower);

        // 进化后让塔重新开始冷却/目标锁定
        tower.lastAttackTime = 0;
        tower.currentTarget = null;
        tower.currentOreTarget = null;

        // 地块颜色标记：如果地图侧已实现 setTowerEvolutionStage，就同步进化阶段
        if (this.map.setTowerEvolutionStage) {
            const nextStage = nextItem.quality != null ? nextItem.quality : 1;
            this.map.setTowerEvolutionStage(tower.col, tower.row, nextStage);
        }

        this.hideEvolveMenu();
    }
    
    /**
     * 显示波次通关气泡（非本关最后一波时调用），约 2 秒后自动消失
     */
    showWaveClearPanel() {
        const panel = document.getElementById('waveClearPanel');
        const waveNumEl = document.getElementById('waveClearWaveNum');
        if (!panel || !waveNumEl) return;
        if (this.waveClearTimer) {
            clearTimeout(this.waveClearTimer);
            this.waveClearTimer = null;
        }
        const waveInLevel = ((this.currentWave - 1) % this.wavesPerLevel) + 1;
        waveNumEl.textContent = waveInLevel;
        panel.classList.remove('hidden');
        this.waveClearTimer = setTimeout(() => {
            panel.classList.add('hidden');
            this.waveClearTimer = null;
        }, 2000);
    }
    
    /**
     * 显示关卡通过气泡（本关最后一波通过时调用），约 2 秒后自动消失
     */
    showLevelClearPanel() {
        const panel = document.getElementById('levelClearPanel');
        const levelNumEl = document.getElementById('levelClearLevelNum');
        if (!panel || !levelNumEl) return;
        if (this.levelClearTimer) {
            clearTimeout(this.levelClearTimer);
            this.levelClearTimer = null;
        }
        levelNumEl.textContent = this.currentLevel;
        panel.classList.remove('hidden');
        this.levelClearTimer = setTimeout(() => {
            panel.classList.add('hidden');
            this.levelClearTimer = null;
        }, 2000);
    }
    
    /**
     * 渲染悬浮窗内容
     * @param {Object} item - 物品数据
     */
    renderTooltip(item) {
        if (!this.tooltip || !item) {
            return;
        }
        
        // 获取图标
        const icon = item.icon || this.getIconByRarity(item.rarity || item.quality);
        
        // 获取稀有度
        const rarity = item.rarity || (item.quality ? ['普通', '稀有', '史诗', '传说'][item.quality - 1] : '普通');
        
        // 计算伤害信息
        const damageInfo = calculateDamage(item);
        
        // 构建HTML内容
        let html = `
            <div class="tower-tooltip-header">
                <div class="tower-tooltip-icon">${icon}</div>
                <div class="tower-tooltip-name">${item.name}</div>
                <div class="tower-tooltip-rarity rarity-${rarity}">${rarity}</div>
            </div>
        `;
        
        // 描述
        if (item.description) {
            html += `<div class="tower-tooltip-description">${item.description}</div>`;
        }
        
        // 伤害信息
        if (damageInfo) {
            html += '<div class="tower-tooltip-section">';
            html += '<div class="tower-tooltip-section-title">伤害</div>';
            html += `<div class="tower-tooltip-attribute">基础: ${damageInfo.baseDamage}</div>`;
            html += `<div class="tower-tooltip-attribute">最终: ${damageInfo.finalDamage}</div>`;
            
            // 伤害加成
            const damageScalings = damageInfo.scalingInfo.filter(s => s.type === 'damage');
            if (damageScalings.length > 0) {
                damageScalings.forEach(s => {
                    html += `<div class="tower-tooltip-scaling">${s.name}: +${s.percentage}%</div>`;
                });
            }
            html += '</div>';
        }
        
        // 其他属性
        if (item.attributes) {
            html += '<div class="tower-tooltip-section">';
            html += '<div class="tower-tooltip-section-title">属性</div>';
            
            const rangeGrid = this.getTowerRangeGrid(item);
            html += `<div class="tower-tooltip-attribute">射程: ${this.formatRangeGridLabel(rangeGrid)} 格</div>`;
            if (item.attributes.attackSpeed !== undefined) {
                html += `<div class="tower-tooltip-attribute">攻速: ${item.attributes.attackSpeed}</div>`;
            }
            if (item.attributes.health !== undefined) {
                html += `<div class="tower-tooltip-attribute">生命: ${item.attributes.health}</div>`;
            }
            if (item.attributes.baseHealth !== undefined) {
                html += `<div class="tower-tooltip-attribute">生命: ${item.attributes.baseHealth}</div>`;
            }
            if (item.attributes.unitCount !== undefined) {
                html += `<div class="tower-tooltip-attribute">单位数: ${item.attributes.unitCount}</div>`;
            }
            if (item.attributes.powerGainPerHit !== undefined) {
                html += `<div class="tower-tooltip-attribute">本塔威能: 命中 +${item.attributes.powerGainPerHit}/次（仅该塔涨条）</div>`;
            }
            html += `<div class="tower-tooltip-attribute">部署灵力: ${this.getDeploySpiritCost(item)}</div>`;
            const olc = this.getUpgradeOverloadConfig(item);
            const dfc = this.getUpgradeDefenseConfig(item);
            html += `<div class="tower-tooltip-attribute">过载模式: 攻击×${olc.attackMult.toFixed(2)} 攻速×${olc.attackSpeedMult.toFixed(2)}（扣本塔 ${olc.powerCost} 威能）</div>`;
            html += `<div class="tower-tooltip-attribute">防御模式: 护盾 ${dfc.shield}（扣本塔 ${dfc.powerCost} 威能）</div>`;
            
            html += '</div>';
        }
        
        // 非伤害类型的scaling
        if (damageInfo && damageInfo.scalingInfo) {
            const otherScalings = damageInfo.scalingInfo.filter(s => s.type === 'other');
            if (otherScalings.length > 0) {
                html += '<div class="tower-tooltip-section">';
                html += '<div class="tower-tooltip-section-title">加成</div>';
                otherScalings.forEach(s => {
                    html += `<div class="tower-tooltip-scaling">${s.name}: +${s.percentage}%</div>`;
                });
                html += '</div>';
            }
        }
        
        // 特殊效果
        if (item.specialEffects && item.specialEffects.length > 0) {
            html += '<div class="tower-tooltip-section">';
            html += '<div class="tower-tooltip-section-title">特殊效果</div>';
            item.specialEffects.forEach(effect => {
                const desc = effect.description || '未知效果';
                html += `<div class="tower-tooltip-effect">✨ ${desc}</div>`;
            });
            html += '</div>';
        }
        
        this.tooltip.innerHTML = html;
    }
}

// 显式挂到全局，避免因脚本加载顺序或作用域导致 game.js 中取不到
window.TowerDefenseGame = TowerDefenseGame;

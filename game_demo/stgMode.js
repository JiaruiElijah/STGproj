/**
 * STG 纵版射击模式（棋盘格竖屏、玩家移动 + Z 连射 + 波次 + P 点经验 + 三选一强化）
 * 与塔防共用：波次 localStorage、怪物编辑器存档、英雄数值（物品池 + 英雄物品栏）
 */
(function () {
    'use strict';

    /** 棋盘格数：横向/纵向较早期版本各多 3 格，战场更宽更长 */
    const GRID_COLS = 12;
    const GRID_ROWS = 17;
    /** 与棋盘思路一致：竖向长条战场 */
    const WAVE_STORAGE_KEY = 'tower_defense_wave_config';
    const MONSTER_STORAGE_KEY = 'tower_defense_enemy_types';
    /**
     * 敌弹命中：中心距 < 机体半径 + 此余量即扣血（与东方系「判定点」思路一致）
     * 绘制慢速模式下的受击圈时须用同一数值，避免「圈与判定不一致」
     */
    const STG_PLAYER_HIT_EXTRA = 10;
    /** 与 stgPlayerEditorPanel 共用：STG 自机移速、判定点半径存档 */
    const STG_PLAYER_CONFIG_KEY = 'stg_player_config';
    /** 与 stgScenePropsEditorPanel 共用：P 点轨迹等场景道具 */
    const STG_SCENE_PROPS_KEY = 'stg_scene_props_config';
    /** 避免每帧读盘：应用编辑器或新开局时清空 */
    let scenePropsCache = null;
    /** 按住 Shift 慢速模式：在 bonusMoveMult 之后再乘此系数（可被玩家编辑器 focusMoveMult 覆盖） */
    const STG_FOCUS_MOVE_MULT = 0.34;

    /** 非编辑器 UI 文案，键与 stgUiI18n.js 一致；无脚本时退回空串（应保证先加载 stgUiI18n.js） */
    function stgUiT(key, vars) {
        if (window.StgUiI18n && typeof window.StgUiI18n.t === 'function') {
            return window.StgUiI18n.t(key, vars);
        }
        return '';
    }

    function loadStgScenePropsConfigRaw() {
        const def = {
            pTrajectory: 'straight_down',
            pStraightVy: 80,
            pArcUpSpeed: 120,
            pArcPeakPx: 55,
            pArcDownSpeed: 85
        };
        try {
            const raw = localStorage.getItem(STG_SCENE_PROPS_KEY);
            if (!raw) return def;
            const o = JSON.parse(raw);
            if (!o || typeof o !== 'object') return def;
            return { ...def, ...o };
        } catch (e) {
            return def;
        }
    }

    function getScenePropsConfig() {
        if (scenePropsCache == null) {
            scenePropsCache = loadStgScenePropsConfigRaw();
        }
        return scenePropsCache;
    }

    function invalidateScenePropsCache() {
        scenePropsCache = null;
    }

    /**
     * 击杀掉落 P 点：直线向下 或 先上抛至弧顶再下落
     */
    function createPickupAtKill(ex, ey, pExp) {
        const cfg = getScenePropsConfig();
        const traj = cfg.pTrajectory === 'arc_up_down' ? 'arc_up_down' : 'straight_down';
        if (traj === 'arc_up_down') {
            const peakPx = Math.max(10, Math.min(220, Number(cfg.pArcPeakPx) || 55));
            const up = Math.max(40, Math.min(400, Number(cfg.pArcUpSpeed) || 120));
            const fall = Math.max(40, Math.min(600, Number(cfg.pArcDownSpeed) || 85));
            return {
                x: ex,
                y: ey,
                exp: pExp,
                vy: -up,
                mode: 'arc',
                peakY: ey - peakPx,
                fallVy: fall
            };
        }
        const vy = Math.max(20, Math.min(400, Number(cfg.pStraightVy) || 80));
        return { x: ex, y: ey, exp: pExp, vy, mode: 'straight' };
    }

    /** 受击火星/血雾粒子（径向爆出 + 重力下落） */
    function spawnStgPlayerHitParticles(px, py, count) {
        const n = Math.min(24, Math.max(5, count | 0));
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 65 + Math.random() * 135;
            stgPlayerFxParticles.push({
                x: px + (Math.random() - 0.5) * 12,
                y: py + (Math.random() - 0.5) * 12,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp * 0.88,
                ageMs: 0,
                maxMs: 240 + Math.random() * 260,
                r: 1.4 + Math.random() * 2.6,
                kind: Math.random() < 0.55 ? 0 : 1
            });
        }
    }

    function triggerStgPlayerHitFx(px, py, particleCount, flashMs) {
        spawnStgPlayerHitParticles(px, py, particleCount);
        if (flashMs > 0) stgPlayerHitFlashMs = Math.max(stgPlayerHitFlashMs, flashMs);
    }

    function updateStgPlayerHitFx(dt) {
        const dtSec = dt * 0.001;
        for (let i = stgPlayerFxParticles.length - 1; i >= 0; i--) {
            const p = stgPlayerFxParticles[i];
            p.ageMs += dt;
            p.x += p.vx * dtSec;
            p.y += p.vy * dtSec;
            p.vy += 360 * dtSec;
            p.vx *= 0.987;
            if (p.ageMs >= p.maxMs) stgPlayerFxParticles.splice(i, 1);
        }
        if (stgPlayerHitFlashMs > 0) stgPlayerHitFlashMs = Math.max(0, stgPlayerHitFlashMs - dt);
    }

    function loadStgPlayerConfig() {
        try {
            const raw = localStorage.getItem(STG_PLAYER_CONFIG_KEY);
            if (!raw) return null;
            const o = JSON.parse(raw);
            return o && typeof o === 'object' ? o : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * 敌弹/激光对自机的受击半径：可来自编辑器 hitRadius，否则为 固定余量 + 机体显示半径
     */
    function getStgPlayerHitRadius() {
        if (!player) return STG_PLAYER_HIT_EXTRA + 14;
        if (player.hitRadius != null && Number.isFinite(player.hitRadius)) {
            return Math.max(1, player.hitRadius);
        }
        return STG_PLAYER_HIT_EXTRA + player.radius;
    }

    /**
     * 将编辑器存档合并到自机对象（字段与 stgPlayerEditorPanel 保存结构一致）
     */
    function mergeStgPlayerEditorIntoPlayer(p, cfg) {
        if (!p || !cfg) return;
        if (cfg.moveSpeed != null) {
            const ms = Number(cfg.moveSpeed);
            if (Number.isFinite(ms)) p.moveSpeed = Math.max(60, Math.min(520, ms));
        }
        if (cfg.hitRadius != null) {
            const hr = Number(cfg.hitRadius);
            if (Number.isFinite(hr)) p.hitRadius = Math.max(2, Math.min(48, hr));
        } else {
            delete p.hitRadius;
        }
        if (cfg.focusMoveMult != null) {
            const f = Number(cfg.focusMoveMult);
            if (Number.isFinite(f)) p.focusMoveMult = Math.max(0.05, Math.min(0.98, f));
        } else {
            delete p.focusMoveMult;
        }
        if (cfg.fireIntervalMs != null) {
            const v = Number(cfg.fireIntervalMs);
            if (Number.isFinite(v)) p.fireIntervalMs = Math.max(40, Math.min(400, v));
        }
        if (cfg.bulletSpeed != null) {
            const v = Number(cfg.bulletSpeed);
            if (Number.isFinite(v)) p.bulletSpeed = Math.max(120, Math.min(900, v));
        }
        if (cfg.emitStyle === 'single' || cfg.emitStyle === 'fan' || cfg.emitStyle === 'ring') {
            p.emitStyle = cfg.emitStyle;
        } else {
            delete p.emitStyle;
        }
        if (cfg.singleCount != null) {
            const n = parseInt(cfg.singleCount, 10);
            if (Number.isFinite(n)) p.singleCount = Math.max(1, Math.min(5, n));
        } else {
            delete p.singleCount;
        }
        if (cfg.fanCount != null) {
            const n = parseInt(cfg.fanCount, 10);
            if (Number.isFinite(n)) p.fanCount = Math.max(2, Math.min(24, n));
        } else {
            delete p.fanCount;
        }
        if (cfg.ringCount != null) {
            const n = parseInt(cfg.ringCount, 10);
            if (Number.isFinite(n)) p.ringCount = Math.max(3, Math.min(36, n));
        } else {
            delete p.ringCount;
        }
        if (cfg.fanSpreadDeg != null) {
            const n = Number(cfg.fanSpreadDeg);
            if (Number.isFinite(n)) p.fanSpreadDeg = Math.max(10, Math.min(180, n));
        } else {
            delete p.fanSpreadDeg;
        }
        if (cfg.mainWeaponAttack != null) {
            const a = Number(cfg.mainWeaponAttack);
            if (Number.isFinite(a)) p.mainWeaponAttack = Math.max(0.5, Math.min(9999, a));
        } else {
            delete p.mainWeaponAttack;
        }
        if (cfg.focusWeaponAttack != null) {
            const a = Number(cfg.focusWeaponAttack);
            if (Number.isFinite(a)) p.focusWeaponAttack = Math.max(0.5, Math.min(9999, a));
        } else {
            delete p.focusWeaponAttack;
        }
        if (cfg.skillWeaponAttack != null) {
            const a = Number(cfg.skillWeaponAttack);
            if (Number.isFinite(a)) p.skillWeaponAttack = Math.max(0.5, Math.min(9999, a));
        } else {
            delete p.skillWeaponAttack;
        }
        if (cfg.bulletRadius != null) {
            const r = Number(cfg.bulletRadius);
            if (Number.isFinite(r)) p.bulletRadius = Math.max(2, Math.min(24, r));
        } else {
            delete p.bulletRadius;
        }
        if (cfg.bulletVisualShape === 'circle' || cfg.bulletVisualShape === 'diamond' || cfg.bulletVisualShape === 'square') {
            p.bulletVisualShape = cfg.bulletVisualShape;
        } else {
            delete p.bulletVisualShape;
        }
        /** 慢速（Z+Shift）主武器：可选独立射速/弹速/弹幕形状；未存档时由运行时回退到普通主武器 */
        if (cfg.focusFireIntervalMs != null) {
            const v = Number(cfg.focusFireIntervalMs);
            if (Number.isFinite(v)) p.focusFireIntervalMs = Math.max(40, Math.min(400, v));
        } else {
            delete p.focusFireIntervalMs;
        }
        if (cfg.focusBulletSpeed != null) {
            const v = Number(cfg.focusBulletSpeed);
            if (Number.isFinite(v)) p.focusBulletSpeed = Math.max(120, Math.min(900, v));
        } else {
            delete p.focusBulletSpeed;
        }
        if (cfg.focusEmitStyle === 'single' || cfg.focusEmitStyle === 'fan' || cfg.focusEmitStyle === 'ring') {
            p.focusEmitStyle = cfg.focusEmitStyle;
        } else {
            delete p.focusEmitStyle;
        }
        if (cfg.focusSingleCount != null) {
            const n = parseInt(cfg.focusSingleCount, 10);
            if (Number.isFinite(n)) p.focusSingleCount = Math.max(1, Math.min(5, n));
        } else {
            delete p.focusSingleCount;
        }
        if (cfg.focusFanCount != null) {
            const n = parseInt(cfg.focusFanCount, 10);
            if (Number.isFinite(n)) p.focusFanCount = Math.max(2, Math.min(24, n));
        } else {
            delete p.focusFanCount;
        }
        if (cfg.focusRingCount != null) {
            const n = parseInt(cfg.focusRingCount, 10);
            if (Number.isFinite(n)) p.focusRingCount = Math.max(3, Math.min(36, n));
        } else {
            delete p.focusRingCount;
        }
        if (cfg.focusFanSpreadDeg != null) {
            const n = Number(cfg.focusFanSpreadDeg);
            if (Number.isFinite(n)) p.focusFanSpreadDeg = Math.max(10, Math.min(180, n));
        } else {
            delete p.focusFanSpreadDeg;
        }
        if (cfg.focusBulletRadius != null) {
            const r = Number(cfg.focusBulletRadius);
            if (Number.isFinite(r)) p.focusBulletRadius = Math.max(2, Math.min(24, r));
        } else {
            delete p.focusBulletRadius;
        }
        if (
            cfg.focusBulletVisualShape === 'circle' ||
            cfg.focusBulletVisualShape === 'diamond' ||
            cfg.focusBulletVisualShape === 'square'
        ) {
            p.focusBulletVisualShape = cfg.focusBulletVisualShape;
        } else {
            delete p.focusBulletVisualShape;
        }
        if (cfg.skillFireIntervalMs != null) {
            const v = Number(cfg.skillFireIntervalMs);
            if (Number.isFinite(v)) p.skillFireIntervalMs = Math.max(40, Math.min(400, v));
        } else {
            delete p.skillFireIntervalMs;
        }
        if (cfg.skillCooldownMs != null) {
            const v = Number(cfg.skillCooldownMs);
            if (Number.isFinite(v)) p.skillCooldownMs = Math.max(0, Math.min(60000, v));
        } else {
            delete p.skillCooldownMs;
        }
        if (cfg.skillBulletSpeed != null) {
            const v = Number(cfg.skillBulletSpeed);
            if (Number.isFinite(v)) p.skillBulletSpeed = Math.max(120, Math.min(900, v));
        } else {
            delete p.skillBulletSpeed;
        }
        if (cfg.skillEmitStyle === 'single' || cfg.skillEmitStyle === 'fan' || cfg.skillEmitStyle === 'ring') {
            p.skillEmitStyle = cfg.skillEmitStyle;
        } else {
            delete p.skillEmitStyle;
        }
        if (cfg.skillSingleCount != null) {
            const n = parseInt(cfg.skillSingleCount, 10);
            if (Number.isFinite(n)) p.skillSingleCount = Math.max(1, Math.min(5, n));
        } else {
            delete p.skillSingleCount;
        }
        if (cfg.skillFanCount != null) {
            const n = parseInt(cfg.skillFanCount, 10);
            if (Number.isFinite(n)) p.skillFanCount = Math.max(2, Math.min(24, n));
        } else {
            delete p.skillFanCount;
        }
        if (cfg.skillRingCount != null) {
            const n = parseInt(cfg.skillRingCount, 10);
            if (Number.isFinite(n)) p.skillRingCount = Math.max(3, Math.min(36, n));
        } else {
            delete p.skillRingCount;
        }
        if (cfg.skillFanSpreadDeg != null) {
            const n = Number(cfg.skillFanSpreadDeg);
            if (Number.isFinite(n)) p.skillFanSpreadDeg = Math.max(10, Math.min(180, n));
        } else {
            delete p.skillFanSpreadDeg;
        }
        if (cfg.skillBulletRadius != null) {
            const r = Number(cfg.skillBulletRadius);
            if (Number.isFinite(r)) p.skillBulletRadius = Math.max(2, Math.min(24, r));
        } else {
            delete p.skillBulletRadius;
        }
        if (
            cfg.skillBulletVisualShape === 'circle' ||
            cfg.skillBulletVisualShape === 'diamond' ||
            cfg.skillBulletVisualShape === 'square'
        ) {
            p.skillBulletVisualShape = cfg.skillBulletVisualShape;
        } else {
            delete p.skillBulletVisualShape;
        }
    }

    /** 应用本地玩家属性到当前局内 player（无存档时整对象按英雄模板重建并保留当前坐标） */
    function applyStgPlayerConfigToRuntime() {
        const cfg = loadStgPlayerConfig();
        if (!player) return;
        if (!cfg) {
            const px = player.x;
            const py = player.y;
            const fresh = buildPlayerFromHero();
            Object.keys(player).forEach((k) => {
                delete player[k];
            });
            Object.assign(player, fresh);
            player.x = px;
            player.y = py;
            return;
        }
        mergeStgPlayerEditorIntoPlayer(player, cfg);
    }

    /** @type {HTMLCanvasElement|null} */
    let canvas = null;
    let ctx = null;
    /** @type {number} */
    let cellSize = 45;

    let gameStateRef = null;
    let playerStatsRef = null;

    let isPaused = false;
    let isRunning = false;
    let lastFrameTime = 0;
    let rafId = 0;

    /** 键盘状态（避免在 update 里分配临时对象） */
    const keys = {
        ArrowUp: false,
        ArrowDown: false,
        ArrowLeft: false,
        ArrowRight: false,
        KeyZ: false,
        KeyX: false,
        ShiftLeft: false,
        ShiftRight: false
    };

    /** 游戏阶段：title | playing | levelup | dead | win */
    let phase = 'title';

    /** @type {Array<{x:number,y:number,vx:number,vy:number,dmg:number,alive:boolean}>} */
    let playerBullets = [];
    /** @type {Array<StgEnemy>} */
    let enemies = [];
    /** @type {Array<{x:number,y:number,vx:number,vy:number,dmg:number,alive:boolean,pattern:string,ageMs?:number,splitAfterMs?:number,splitDone?:boolean,splitChildSpeed?:number,splitCount?:number,splitStyle?:string,radius?:number,homingStr?:number}>} */
    let enemyBullets = [];
    /** 直线激光：线段 + 线宽 + 持续时间内每帧检测与玩家距离 */
    let enemyLasers = [];
    /** @type {Array<{x:number,y:number,exp:number,vy:number,mode?:string,peakY?:number,fallVy?:number}>} */
    let pickups = [];

    /** 玩家受击：粒子 + 全屏闪（仅 STG 画布内） */
    let stgPlayerFxParticles = [];
    let stgPlayerHitFlashMs = 0;
    let stgLaserFxAccMs = 0;

    /** @type {{waves:Array}} */
    let waveData = { waves: [] };
    let waveIndex = 0;
    /** 结算层是否通关，供切换语言时重刷文案 */
    let lastShowResultWin = null;
    /** 无阵型时：扁平 type 列表，按 spawnIntervalMs 每节拍 1 只 */
    let spawnQueueLegacy = [];
    /** 同一 (边,列,行) 已生成次数：用于同格多怪时螺旋错开 + 每波重置 */
    let spawnSlotUsage = new Map();
    let spawnAccMs = 0;
    let spawnIntervalMs = 400;
    /** 波次间隔倒计时结束时刻（ms）；与塔防波次衔接 */
    let interWaveCountEnd = null;
    /** 本波从阵型生成的敌人数（击杀 +「有效边界」完全离场均计为已消灭，用于提前下一波） */
    let stgWaveSpawnTotal = 0;
    let stgWaveResolvedCount = 0;

    let runStartMs = 0;
    let level = 1;
    let exp = 0;
    let expToNext = 100;

    /** @type {object} 含编辑器可选字段：focusMoveMult、emitStyle、skill* 等 */
    let player = null;

    /** 局内加成（强化叠加；构筑数值可后续接到下方池子的 apply） */
    let bonusDamage = 1;
    let bonusFireIntervalMult = 1;
    let bonusMoveMult = 1;
    let bonusPickupRadius = 1;
    let bonusBulletSpeed = 1;
    let bonusExpMult = 1;

    /**
     * 博丽灵梦构筑：集中 / 大招各两条分支互斥；且每条分支须先抽到「基础卡」，同分支的后续强化才会进入池子（requires）。
     */
    let stgFocusBranch = null;
    /** @type {'seal'|'dream'|null} */
    let stgUltBranch = null;
    const stgTakenUpgradeIds = new Set();

    /** 升级候选（三选一） */
    let upgradeChoices = [];

    /**
     * group: spread | focus_crystal | focus_rage | ult_seal | ult_dream | stat
     * requires: 须本局已选过该 id 后，本条才进入随机池（分支内先解锁基础再出强化）
     */
    const STG_UPGRADE_POOL = [
        // —— 扩散攻击（普通模式）—— icon 供左侧构筑栏；悬浮见 name/desc ——
        { id: 'spread_fan', icon: '📐', group: 'spread', name: '「扩散」扇形弹幕', desc: '攻击方式改为扇形，散射子弹 +2', apply: () => {} },
        { id: 'spread_extra', icon: '➕', group: 'spread', name: '「扩散」额外弹', desc: '攻击概率发射额外的子弹', apply: () => {} },
        { id: 'spread_turret', icon: '🔰', group: 'spread', name: '「扩散」伴身炮台', desc: '自机旁增加炮台，造成玩家攻击力 150% 伤害，随自机移动', apply: () => {} },
        { id: 'spread_homing', icon: '🎯', group: 'spread', name: '「扩散」追踪弹', desc: '子弹可追踪，伤害降低 40%', apply: () => {} },
        { id: 'spread_yinyang', icon: '☯️', group: 'spread', name: '「扩散」阴阳玉', desc: '每次攻击概率产生一枚阴阳玉，造成范围伤害', apply: () => {} },
        { id: 'spread_big_p', icon: '💠', group: 'spread', name: '「扩散」大 P 点', desc: '该攻击击杀敌人概率生成大 P 点', apply: () => {} },
        { id: 'spread_crit', icon: '💥', group: 'spread', name: '「扩散」暴击', desc: '该攻击的暴击概率上升', apply: () => {} },
        { id: 'spread_big_energy', icon: '⚡', group: 'spread', name: '「扩散」大能量点', desc: '该攻击击杀敌人概率生成大能量点', apply: () => {} },
        // —— 集中攻击 · 水晶 ——
        { id: 'focus_crystal_base', icon: '💎', group: 'focus_crystal', name: '「水晶」水晶箭', desc: '能向前方发射 6 枚水晶', apply: () => {} },
        { id: 'focus_crystal_atk', icon: '⚔️', group: 'focus_crystal', name: '「水晶」攻击力', desc: '水晶攻击力上升', requires: 'focus_crystal_base', apply: () => {} },
        { id: 'focus_crystal_count', icon: '🔢', group: 'focus_crystal', name: '「水晶」数量', desc: '水晶数量增多', requires: 'focus_crystal_base', apply: () => {} },
        { id: 'focus_crystal_pierce', icon: '➡️', group: 'focus_crystal', name: '「水晶」穿透', desc: '水晶能够穿透', requires: 'focus_crystal_base', apply: () => {} },
        // —— 集中攻击 · 狂怒 ——
        { id: 'focus_rage_core', icon: '😤', group: 'focus_rage', name: '「狂怒」狂怒层数', desc: '慢速模式下每击杀 5 名敌人叠 1 层【狂怒】；射速与弹速提升，持续 5 秒，最多 3 层', apply: () => {} },
        { id: 'focus_rage_cap', icon: '📊', group: 'focus_rage', name: '「狂怒」层数上限', desc: '【狂怒】叠加上限 +3 层', requires: 'focus_rage_core', apply: () => {} },
        { id: 'focus_rage_dur', icon: '⏱️', group: 'focus_rage', name: '「狂怒」持续时间', desc: '【狂怒】持续时间 +5 秒', requires: 'focus_rage_core', apply: () => {} },
        { id: 'focus_rage_weak', icon: '🧪', group: 'focus_rage', name: '「狂怒」虚弱', desc: '叠满 5 层时敌人获得虚弱，受到伤害 +20%', requires: 'focus_rage_core', apply: () => {} },
        // —— 大招 · 封魔阵 ——
        { id: 'ult_seal_base', icon: '🔯', group: 'ult_seal', name: '「封魔阵」结界', desc: '自机周围圆形结界：消除弹幕并对敌人造成伤害', apply: () => {} },
        { id: 'ult_seal_size', icon: '⭕', group: 'ult_seal', name: '「封魔阵」范围与持续', desc: '结界范围增大，持续时间增加', requires: 'ult_seal_base', apply: () => {} },
        { id: 'ult_seal_heal', icon: '💚', group: 'ult_seal', name: '「封魔阵」疗愈', desc: '结界可恢复生命，并短暂强化攻击', requires: 'ult_seal_base', apply: () => {} },
        // —— 大招 · 梦想妙珠 ——
        { id: 'ult_dream_base', icon: '🔮', group: 'ult_dream', name: '「妙珠」梦想妙珠', desc: '向前发射 3 个妙珠：消除弹幕并造成范围伤害', apply: () => {} },
        { id: 'ult_dream_count', icon: '✨', group: 'ult_dream', name: '「妙珠」数量', desc: '妙珠数量增加', requires: 'ult_dream_base', apply: () => {} },
        { id: 'ult_dream_stun', icon: '💫', group: 'ult_dream', name: '「妙珠」眩晕', desc: '妙珠可短暂眩晕敌人', requires: 'ult_dream_base', apply: () => {} },
        // —— 属性 ——
        { id: 'stat_hp', icon: '❤️', group: 'stat', name: '属性 · 生命', desc: '生命值增加', apply: () => {} },
        { id: 'stat_regen', icon: '💗', group: 'stat', name: '属性 · 回复', desc: '生命恢复增加', apply: () => {} },
        { id: 'stat_atk_all', icon: '🗡️', group: 'stat', name: '属性 · 全攻击', desc: '全攻击力增加', apply: () => {} },
        { id: 'stat_fire', icon: '🏹', group: 'stat', name: '属性 · 射速', desc: '射速增加', apply: () => {} },
        { id: 'stat_bullet_spd', icon: '💨', group: 'stat', name: '属性 · 弹速', desc: '弹速增加', apply: () => {} },
        { id: 'stat_move_spread', icon: '👟', group: 'stat', name: '属性 · 普通移速', desc: '普通模式移速增加', apply: () => {} },
        { id: 'stat_exp', icon: '📈', group: 'stat', name: '属性 · 经验', desc: '经验值增长', apply: () => {} },
        { id: 'stat_ult_charge', icon: '🌟', group: 'stat', name: '属性 · 大招充能', desc: '大招充能效率', apply: () => {} }
    ];

    function isStgUpgradeEligible(u) {
        if (!u || stgTakenUpgradeIds.has(u.id)) return false;
        if (u.group === 'focus_crystal' && stgFocusBranch === 'rage') return false;
        if (u.group === 'focus_rage' && stgFocusBranch === 'crystal') return false;
        if (u.group === 'ult_seal' && stgUltBranch === 'dream') return false;
        if (u.group === 'ult_dream' && stgUltBranch === 'seal') return false;
        /** 分支内：须先拿到 requires 所指的基础强化，本条才参与随机 */
        if (u.requires && !stgTakenUpgradeIds.has(u.requires)) return false;
        return true;
    }

    function applyStgUpgradePick(u) {
        if (!u || u.id === 'pool_empty') return;
        stgTakenUpgradeIds.add(u.id);
        if (u.group === 'focus_crystal') stgFocusBranch = 'crystal';
        if (u.group === 'focus_rage') stgFocusBranch = 'rage';
        if (u.group === 'ult_seal') stgUltBranch = 'seal';
        if (u.group === 'ult_dream') stgUltBranch = 'dream';
    }

    class StgEnemy {
        /**
         * @param {number} x
         * @param {number} y
         * @param {object} typeDef 含怪物编辑器中的 STG 弹幕字段
         * @param {string} pattern 'aim' | 'straight' | 'none'
         * @param {string} typeId 波次中的种类 id，用于读档合并
         */
        constructor(x, y, typeDef, pattern, typeId) {
            this.x = x;
            this.y = y;
            this.vx = 0;
            this.vy = 0;
            this.radius = typeDef.radius != null ? Math.max(4, Math.min(48, typeDef.radius)) : 14;
            this.maxHp = typeDef.defaultHealth != null ? typeDef.defaultHealth : 50;
            this.hp = this.maxHp;
            this.speed = (typeDef.defaultSpeed != null ? typeDef.defaultSpeed : 50) * 0.85;
            this.attack = typeDef.defaultAttack != null ? typeDef.defaultAttack : 1;
            this.shootCooldownMs = typeDef.stgShootCooldownMs != null ? Math.max(200, typeDef.stgShootCooldownMs) : 2200;
            this.lastShootTime = 0;
            this.pattern = pattern;
            /** 敌弹飞行速度（px/s），来自编辑器 stgEnemyBulletSpeed */
            this.enemyBulletSpeed = typeDef.stgEnemyBulletSpeed != null ? Math.max(40, typeDef.stgEnemyBulletSpeed) : 260;
            /** 敌弹显示与碰撞半径（px）；形状见 stgEnemyBulletShape */
            this.stgEnemyBulletRadius = Math.max(
                2,
                Math.min(28, typeDef.stgEnemyBulletRadius != null ? Number(typeDef.stgEnemyBulletRadius) : 5)
            );
            this.stgEnemyBulletShape = typeDef.stgEnemyBulletShape === 'triangle' ? 'triangle' : 'circle';
            this.icon = typeDef.icon || '👹';
            this.color = typeDef.color || '#e74c3c';
            this.alive = true;
            /** 是否已计入本波「已消灭」（击杀或有效边界离场），防止重复计数 */
            this.stgWaveCounted = false;
            /** 阵型来源边：'top' | 'left' | 'right'，用于离场边界是否算「清除」 */
            this.stgSpawnEdge = 'top';
            /** 曾与画布区域有重叠：未成立前不因「在生成侧外」而剔除，避免上/左/右出生点首帧被误判离场 */
            this.stgHasEnteredPlayfield = false;
            this.typeId = typeId || 'normal';
            /** 发射样式与参数（与怪物编辑器一致） */
            const es = typeDef.stgEmitStyle != null ? String(typeDef.stgEmitStyle) : 'single';
            this.stgEmitStyle = es === 'fan' || es === 'ring' || es === 'laser' ? es : 'single';
            this.stgFanCount = Math.max(2, Math.min(24, typeDef.stgFanCount != null ? typeDef.stgFanCount : 5));
            this.stgFanSpreadDeg = Math.max(10, Math.min(180, typeDef.stgFanSpreadDeg != null ? typeDef.stgFanSpreadDeg : 60));
            this.stgRingCount = Math.max(3, Math.min(36, typeDef.stgRingCount != null ? typeDef.stgRingCount : 12));
            this.stgLaserLength = Math.max(80, Math.min(600, typeDef.stgLaserLength != null ? typeDef.stgLaserLength : 300));
            this.stgLaserWidth = Math.max(4, Math.min(48, typeDef.stgLaserWidth != null ? typeDef.stgLaserWidth : 14));
            this.stgLaserDurationMs = Math.max(100, Math.min(3000, typeDef.stgLaserDurationMs != null ? typeDef.stgLaserDurationMs : 450));
            this.stgSplitDelaySec = Math.max(0, Math.min(10, typeDef.stgSplitDelaySec != null ? typeDef.stgSplitDelaySec : 0));
            this.stgSplitChildSpeed = Math.max(40, Math.min(520, typeDef.stgSplitChildSpeed != null ? typeDef.stgSplitChildSpeed : 220));
            this.stgHomingStrength = Math.max(0, Math.min(100, typeDef.stgHomingStrength != null ? typeDef.stgHomingStrength : 0));
            /** normal=不分裂；split=分裂；null=旧档仅看 stgSplitDelaySec */
            this.stgBulletKind =
                typeDef.stgBulletKind === 'split' ? 'split' : typeDef.stgBulletKind === 'normal' ? 'normal' : null;
            this.stgSplitCount = Math.max(2, Math.min(16, typeDef.stgSplitCount != null ? typeDef.stgSplitCount : 4));
            this.stgSplitStyle = typeDef.stgSplitStyle === 'cross' ? 'cross' : 'cross';
            /** cooldown=战斗中按冷却；on_death=仅阵亡时释放一次（样式与子弹属性同下方面板） */
            this.stgEmitWhen = typeDef.stgEmitWhen === 'on_death' ? 'on_death' : 'cooldown';

            const cw = canvas ? canvas.width : GRID_COLS * cellSize;
            const ch = canvas ? canvas.height : GRID_ROWS * cellSize;
            this.stgMoveMode = resolveStgMoveMode(typeDef);
            this.stgMoveStraightAngleDeg = Math.max(
                -55,
                Math.min(55, typeDef.stgMoveStraightAngleDeg != null ? Number(typeDef.stgMoveStraightAngleDeg) : 0)
            );
            const axN =
                typeDef.stgAnchorXNorm != null ? Number(typeDef.stgAnchorXNorm) : 0.5;
            const ayN =
                typeDef.stgAnchorYNorm != null ? Number(typeDef.stgAnchorYNorm) : 0.45;
            this.anchorTx = cw * Math.max(0.04, Math.min(0.96, axN));
            this.anchorTy = ch * Math.max(0.04, Math.min(0.96, ayN));
            this.moveIdle = false;
            if (this.stgMoveMode === 'arc_edges') {
                initStgEnemyArcEdges(this, x, y, typeDef, cw, ch);
            }
        }
    }

    /**
     * 由种类配置解析本只怪实际弹幕模式（编辑器：random / aim / straight / none）
     * @param {object} def
     * @returns {'aim'|'straight'|'none'}
     */
    function resolveStgBulletPattern(def) {
        const raw = (def && def.stgBulletPattern) || 'random';
        if (raw === 'none') return 'none';
        if (raw === 'random') return Math.random() < 0.5 ? 'aim' : 'straight';
        if (raw === 'aim' || raw === 'straight') return raw;
        return 'straight';
    }

    /**
     * 点到线段距离（用于激光与判定点）
     */
    function distPointToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        if (len2 < 1e-6) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const qx = x1 + t * dx;
        const qy = y1 + t * dy;
        return Math.hypot(px - qx, py - qy);
    }

    /** 二次贝塞尔曲线上的点（用于弧线移动） */
    function quadBezierPos(sx, sy, cx, cy, px, py, t) {
        const u = 1 - t;
        return {
            x: u * u * sx + 2 * u * t * cx + t * t * px,
            y: u * u * sy + 2 * u * t * cy + t * t * py
        };
    }

    function approxQuadBezierLength(sx, sy, cx, cy, px, py, steps) {
        let len = 0;
        let ox = sx;
        let oy = sy;
        const n = steps != null ? steps : 20;
        for (let i = 1; i <= n; i++) {
            const t = i / n;
            const p = quadBezierPos(sx, sy, cx, cy, px, py, t);
            len += Math.hypot(p.x - ox, p.y - oy);
            ox = p.x;
            oy = p.y;
        }
        return Math.max(len, 40);
    }

    function resolveStgMoveMode(def) {
        const m = def && def.stgMoveMode;
        if (
            m === 'straight' ||
            m === 'homing' ||
            m === 'anchor' ||
            m === 'arc_edges' ||
            m === 'homing_legacy' ||
            m === 'horizontal_left' ||
            m === 'horizontal_right'
        ) {
            return m;
        }
        return 'homing_legacy';
    }

    /** 双边缘弧线：出场点 → 边缘1 → 边缘2 → 沿斜向离场 */
    function initStgEnemyArcEdges(e, sx, sy, def, cw, ch) {
        const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        const n1x = clampN(def.stgArcEdge1XNorm != null ? Number(def.stgArcEdge1XNorm) : 0.12, 0.02, 0.98);
        const n1y = clampN(def.stgArcEdge1YNorm != null ? Number(def.stgArcEdge1YNorm) : 0.42, 0.05, 0.98);
        const n2x = clampN(def.stgArcEdge2XNorm != null ? Number(def.stgArcEdge2XNorm) : 0.88, 0.02, 0.98);
        const n2y = clampN(def.stgArcEdge2YNorm != null ? Number(def.stgArcEdge2YNorm) : 0.58, 0.05, 0.98);
        const P1x = cw * n1x;
        const P1y = ch * n1y;
        const P2x = cw * n2x;
        const P2y = ch * n2y;
        const bulge1 = Math.max(15, Math.min(220, def.stgArcBulge1 != null ? Number(def.stgArcBulge1) : 80));
        const bulge2 = Math.max(15, Math.min(220, def.stgArcBulge2 != null ? Number(def.stgArcBulge2) : 80));
        e.arcPhase = 1;
        e.arcT = 0;
        e.arc1Sx = sx;
        e.arc1Sy = sy;
        e.arc1Cx = (sx + P1x) * 0.5;
        e.arc1Cy = (sy + P1y) * 0.5 - bulge1;
        e.arc1Px = P1x;
        e.arc1Py = P1y;
        e.arcLen1 = approxQuadBezierLength(sx, sy, e.arc1Cx, e.arc1Cy, P1x, P1y, 24);
        e.arc2Cx = (P1x + P2x) * 0.5;
        e.arc2Cy = (P1y + P2y) * 0.5 - bulge2;
        e.arc2Px = P2x;
        e.arc2Py = P2y;
        e.arcLen2 = approxQuadBezierLength(P1x, P1y, e.arc2Cx, e.arc2Cy, P2x, P2y, 24);
        const towardLeft = P2x < cw * 0.5;
        e.arcExitVx = towardLeft ? -0.92 : 0.92;
        e.arcExitVy = 1.05;
    }

    /**
     * STG 敌人位置更新（与怪物编辑器 stgMoveMode 一致）
     */
    function updateStgEnemyPosition(e, player, cw, ch, dtSec) {
        const sp = e.speed * dtSec;
        const mode = e.stgMoveMode || 'homing_legacy';

        if (mode === 'homing_legacy') {
            const dx = player.x - e.x;
            const dy = player.y - e.y;
            const dist = Math.hypot(dx, dy) || 1;
            e.x += (dx / dist) * sp * 0.35;
            e.y += sp * 0.75;
            return;
        }
        if (mode === 'straight') {
            const deg = e.stgMoveStraightAngleDeg != null ? e.stgMoveStraightAngleDeg : 0;
            const rad = (deg * Math.PI) / 180;
            const vx = Math.sin(rad);
            const vy = Math.cos(rad);
            e.x += vx * sp;
            e.y += vy * sp;
            return;
        }
        if (mode === 'homing') {
            const dx = player.x - e.x;
            const dy = player.y - e.y;
            const dist = Math.hypot(dx, dy) || 1;
            e.x += (dx / dist) * sp;
            e.y += (dy / dist) * sp;
            return;
        }
        /** 水平横穿：仅沿 X 移动，适合侧翼入场敌人 */
        if (mode === 'horizontal_left') {
            e.x -= sp;
            return;
        }
        if (mode === 'horizontal_right') {
            e.x += sp;
            return;
        }
        if (mode === 'anchor') {
            if (e.moveIdle) return;
            const dx = e.anchorTx - e.x;
            const dy = e.anchorTy - e.y;
            const dist = Math.hypot(dx, dy) || 1;
            if (dist < 6) {
                e.x = e.anchorTx;
                e.y = e.anchorTy;
                e.moveIdle = true;
            } else {
                e.x += (dx / dist) * sp;
                e.y += (dy / dist) * sp;
            }
            return;
        }
        if (mode === 'arc_edges') {
            if (e.arcPhase === 1) {
                const len = Math.max(e.arcLen1, 60);
                e.arcT += sp / len;
                if (e.arcT >= 1) {
                    e.arcT = 0;
                    e.arcPhase = 2;
                    const p = quadBezierPos(e.arc1Sx, e.arc1Sy, e.arc1Cx, e.arc1Cy, e.arc1Px, e.arc1Py, 1);
                    e.x = p.x;
                    e.y = p.y;
                } else {
                    const p = quadBezierPos(
                        e.arc1Sx,
                        e.arc1Sy,
                        e.arc1Cx,
                        e.arc1Cy,
                        e.arc1Px,
                        e.arc1Py,
                        Math.min(1, e.arcT)
                    );
                    e.x = p.x;
                    e.y = p.y;
                }
                return;
            }
            if (e.arcPhase === 2) {
                const sx = e.arc1Px;
                const sy = e.arc1Py;
                const len = Math.max(e.arcLen2, 60);
                e.arcT += sp / len;
                if (e.arcT >= 1) {
                    e.arcPhase = 3;
                    const p = quadBezierPos(sx, sy, e.arc2Cx, e.arc2Cy, e.arc2Px, e.arc2Py, 1);
                    e.x = p.x;
                    e.y = p.y;
                } else {
                    const p = quadBezierPos(sx, sy, e.arc2Cx, e.arc2Cy, e.arc2Px, e.arc2Py, Math.min(1, e.arcT));
                    e.x = p.x;
                    e.y = p.y;
                }
                return;
            }
            const ex = Math.hypot(e.arcExitVx, e.arcExitVy) || 1;
            e.x += (e.arcExitVx / ex) * sp;
            e.y += (e.arcExitVy / ex) * sp;
        }
    }

    /**
     * 推入一颗敌弹（含可选的延迟分裂参数）
     */
    function pushStgEnemyBullet(o) {
        const br = o.radius != null ? Math.max(2, Math.min(28, o.radius)) : 5;
        const shp = o.shape === 'triangle' ? 'triangle' : 'circle';
        enemyBullets.push({
            x: o.x,
            y: o.y,
            vx: o.vx,
            vy: o.vy,
            dmg: o.dmg,
            alive: true,
            pattern: o.pattern || 'aim',
            radius: br,
            shape: shp,
            ageMs: 0,
            splitAfterMs: o.splitAfterMs != null ? o.splitAfterMs : 0,
            splitDone: false,
            splitChildSpeed: o.splitChildSpeed != null ? o.splitChildSpeed : 220,
            splitCount: o.splitCount != null ? Math.max(2, Math.min(16, o.splitCount)) : 4,
            splitStyle: o.splitStyle === 'cross' ? 'cross' : 'cross',
            /** 0~100，每帧向玩家方向扭转速度（见 update 内跟踪逻辑） */
            homingStr: o.homingStr != null ? o.homingStr : 0
        });
    }

    /** 是否启用分裂、延迟毫秒（普通弹恒为 0；旧档无 kind 时仅当延迟>0 视为分裂；分裂且延迟为 0 时用 1ms 以便首帧即触发） */
    function resolveStgSplitFromEnemy(e) {
        if (e.stgBulletKind === 'normal') return { splitMs: 0, splitCount: 4, splitStyle: 'cross' };
        const legacySplit = e.stgBulletKind == null && e.stgSplitDelaySec > 0;
        const useSplit = e.stgBulletKind === 'split' || legacySplit;
        if (!useSplit) return { splitMs: 0, splitCount: 4, splitStyle: 'cross' };
        const rawMs = Math.max(0, e.stgSplitDelaySec) * 1000;
        const splitMs = rawMs > 0 ? rawMs : 1;
        const cnt = Math.max(2, Math.min(16, e.stgSplitCount != null ? e.stgSplitCount : 4));
        const sty = e.stgSplitStyle === 'cross' ? 'cross' : 'cross';
        return { splitMs, splitCount: cnt, splitStyle: sty };
    }

    /**
     * 按种类配置发射：扇形 / 环形 / 直线激光 / 单发
     * @param {StgEnemy} e
     * @param {{x:number,y:number}} player
     */
    function emitStgEnemyAttack(e, player) {
        const bsp = e.enemyBulletSpeed;
        const px = player.x;
        const py = player.y;
        const ex = e.x;
        const ey = e.y;
        let baseAngle;
        if (e.pattern === 'aim') {
            baseAngle = Math.atan2(py - ey, px - ex);
        } else {
            baseAngle = Math.PI / 2;
        }

        const spInfo = resolveStgSplitFromEnemy(e);
        const splitMs = spInfo.splitMs;
        const splitCount = spInfo.splitCount;
        const splitStyle = spInfo.splitStyle;
        const childSp = e.stgSplitChildSpeed;
        const hom = e.stgHomingStrength != null ? Math.max(0, Math.min(100, e.stgHomingStrength)) : 0;
        const bulletR = e.stgEnemyBulletRadius != null ? e.stgEnemyBulletRadius : 5;
        const bulletShape = e.stgEnemyBulletShape === 'triangle' ? 'triangle' : 'circle';
        const bulletExtra = { radius: bulletR, shape: bulletShape };

        const style = e.stgEmitStyle || 'single';

        if (style === 'laser') {
            const len = e.stgLaserLength;
            const width = e.stgLaserWidth;
            const dur = e.stgLaserDurationMs;
            const x2 = ex + Math.cos(baseAngle) * len;
            const y2 = ey + Math.sin(baseAngle) * len;
            enemyLasers.push({
                x1: ex,
                y1: ey,
                x2,
                y2,
                width,
                dmg: e.attack,
                endMs: performance.now() + dur,
                alive: true
            });
            return;
        }

        if (style === 'fan') {
            const n = e.stgFanCount;
            const spread = (e.stgFanSpreadDeg * Math.PI) / 180;
            const start = baseAngle - spread * 0.5;
            for (let i = 0; i < n; i++) {
                const a = n <= 1 ? baseAngle : start + (spread * i) / Math.max(1, n - 1);
                pushStgEnemyBullet({
                    x: ex,
                    y: ey,
                    vx: Math.cos(a) * bsp,
                    vy: Math.sin(a) * bsp,
                    dmg: e.attack,
                    pattern: e.pattern,
                    splitAfterMs: splitMs,
                    splitChildSpeed: childSp,
                    splitCount,
                    splitStyle,
                    homingStr: hom,
                    ...bulletExtra
                });
            }
            return;
        }

        if (style === 'ring') {
            const n = e.stgRingCount;
            for (let i = 0; i < n; i++) {
                const a = (Math.PI * 2 * i) / n;
                pushStgEnemyBullet({
                    x: ex,
                    y: ey,
                    vx: Math.cos(a) * bsp,
                    vy: Math.sin(a) * bsp,
                    dmg: e.attack,
                    pattern: e.pattern,
                    splitAfterMs: splitMs,
                    splitChildSpeed: childSp,
                    splitCount,
                    splitStyle,
                    homingStr: hom,
                    ...bulletExtra
                });
            }
            return;
        }

        /** single */
        if (e.pattern === 'aim') {
            const a = Math.atan2(py - ey, px - ex);
            pushStgEnemyBullet({
                x: ex,
                y: ey,
                vx: Math.cos(a) * bsp,
                vy: Math.sin(a) * bsp,
                dmg: e.attack,
                pattern: 'aim',
                splitAfterMs: splitMs,
                splitChildSpeed: childSp,
                splitCount,
                splitStyle,
                homingStr: hom,
                ...bulletExtra
            });
        } else {
            pushStgEnemyBullet({
                x: ex,
                y: ey,
                vx: 0,
                vy: bsp,
                dmg: e.attack,
                pattern: 'straight',
                splitAfterMs: splitMs,
                splitChildSpeed: childSp,
                splitCount,
                splitStyle,
                homingStr: hom,
                ...bulletExtra
            });
        }
    }

    function getHudElements() {
        return {
            hp: document.getElementById('stgHpText'),
            exp: document.getElementById('stgExpText'),
            wave: document.getElementById('stgWaveText'),
            nextWave: document.getElementById('stgNextWaveText'),
            time: document.getElementById('stgTimeText'),
            upgrade: document.getElementById('stgUpgradeOverlay'),
            upgradeCards: document.getElementById('stgUpgradeCards'),
            result: document.getElementById('stgResultOverlay'),
            resultTitle: document.getElementById('stgResultTitle'),
            resultMsg: document.getElementById('stgResultMsg'),
            hintBar: document.getElementById('stgHintBar')
        };
    }

    /**
     * 合并怪物编辑器存档与内置默认（与 enemySystem、面板字段对齐，含 STG 弹幕）
     */
    function getEnemyTypeMap() {
        const base = {
            normal: {
                name: '普通', icon: '👹', color: '#e74c3c', radius: 15,
                defaultHealth: 50, defaultAttack: 1, defaultSpeed: 50,
                stgBulletPattern: 'random', stgShootCooldownMs: 2200, stgEnemyBulletSpeed: 260,
                stgEmitStyle: 'single', stgFanCount: 5, stgFanSpreadDeg: 60, stgRingCount: 12,
                stgLaserLength: 300, stgLaserWidth: 14, stgLaserDurationMs: 450,
                stgSplitDelaySec: 0, stgSplitChildSpeed: 220, stgHomingStrength: 0, stgEmitWhen: 'cooldown',
                stgBulletKind: 'normal', stgSplitCount: 4, stgSplitStyle: 'cross',
                stgMoveMode: 'homing_legacy',
                stgMoveStraightAngleDeg: 0,
                stgAnchorXNorm: 0.5,
                stgAnchorYNorm: 0.45,
                stgArcEdge1XNorm: 0.12,
                stgArcEdge1YNorm: 0.42,
                stgArcEdge2XNorm: 0.88,
                stgArcEdge2YNorm: 0.58,
                stgArcBulge1: 80,
                stgArcBulge2: 80,
                stgEnemyBulletRadius: 5,
                stgEnemyBulletShape: 'circle'
            },
            fast: {
                name: '快速', icon: '💨', color: '#f39c12', radius: 12,
                defaultHealth: 30, defaultAttack: 1, defaultSpeed: 100,
                stgBulletPattern: 'random', stgShootCooldownMs: 2000, stgEnemyBulletSpeed: 300,
                stgEmitStyle: 'single', stgFanCount: 5, stgFanSpreadDeg: 60, stgRingCount: 12,
                stgLaserLength: 300, stgLaserWidth: 14, stgLaserDurationMs: 450,
                stgSplitDelaySec: 0, stgSplitChildSpeed: 220, stgHomingStrength: 0, stgEmitWhen: 'cooldown',
                stgBulletKind: 'normal', stgSplitCount: 4, stgSplitStyle: 'cross',
                stgMoveMode: 'homing_legacy',
                stgMoveStraightAngleDeg: 0,
                stgAnchorXNorm: 0.5,
                stgAnchorYNorm: 0.45,
                stgArcEdge1XNorm: 0.12,
                stgArcEdge1YNorm: 0.42,
                stgArcEdge2XNorm: 0.88,
                stgArcEdge2YNorm: 0.58,
                stgArcBulge1: 80,
                stgArcBulge2: 80,
                stgEnemyBulletRadius: 5,
                stgEnemyBulletShape: 'circle'
            },
            tank: {
                name: '坦克', icon: '🛡️', color: '#34495e', radius: 20,
                defaultHealth: 150, defaultAttack: 2, defaultSpeed: 35,
                stgBulletPattern: 'random', stgShootCooldownMs: 2600, stgEnemyBulletSpeed: 220,
                stgEmitStyle: 'single', stgFanCount: 5, stgFanSpreadDeg: 60, stgRingCount: 12,
                stgLaserLength: 300, stgLaserWidth: 14, stgLaserDurationMs: 450,
                stgSplitDelaySec: 0, stgSplitChildSpeed: 220, stgHomingStrength: 0, stgEmitWhen: 'cooldown',
                stgBulletKind: 'normal', stgSplitCount: 4, stgSplitStyle: 'cross',
                stgMoveMode: 'homing_legacy',
                stgMoveStraightAngleDeg: 0,
                stgAnchorXNorm: 0.5,
                stgAnchorYNorm: 0.45,
                stgArcEdge1XNorm: 0.12,
                stgArcEdge1YNorm: 0.42,
                stgArcEdge2XNorm: 0.88,
                stgArcEdge2YNorm: 0.58,
                stgArcBulge1: 80,
                stgArcBulge2: 80,
                stgEnemyBulletRadius: 5,
                stgEnemyBulletShape: 'circle'
            }
        };
        let saved = null;
        try {
            const raw = localStorage.getItem(MONSTER_STORAGE_KEY);
            if (raw) saved = JSON.parse(raw);
        } catch (e) {
            console.warn('[STG] 读取怪物编辑器存档失败', e);
        }
        if (!saved || typeof saved !== 'object') return base;
        const out = { ...base };
        Object.keys(saved).forEach((id) => {
            const s = saved[id];
            if (!s) return;
            const b = base[id] || {
                name: id, icon: '👾', color: '#e74c3c', radius: 15,
                defaultHealth: 50, defaultAttack: 1, defaultSpeed: 50,
                stgBulletPattern: 'random', stgShootCooldownMs: 2200, stgEnemyBulletSpeed: 260,
                stgEmitStyle: 'single', stgFanCount: 5, stgFanSpreadDeg: 60, stgRingCount: 12,
                stgLaserLength: 300, stgLaserWidth: 14, stgLaserDurationMs: 450,
                stgSplitDelaySec: 0, stgSplitChildSpeed: 220, stgHomingStrength: 0, stgEmitWhen: 'cooldown',
                stgBulletKind: 'normal', stgSplitCount: 4, stgSplitStyle: 'cross',
                stgMoveMode: 'homing_legacy',
                stgMoveStraightAngleDeg: 0,
                stgAnchorXNorm: 0.5,
                stgAnchorYNorm: 0.45,
                stgArcEdge1XNorm: 0.12,
                stgArcEdge1YNorm: 0.42,
                stgArcEdge2XNorm: 0.88,
                stgArcEdge2YNorm: 0.58,
                stgArcBulge1: 80,
                stgArcBulge2: 80,
                stgEnemyBulletRadius: 5,
                stgEnemyBulletShape: 'circle'
            };
            let pat = b.stgBulletPattern;
            if (s.stgBulletPattern === 'aim' || s.stgBulletPattern === 'straight' || s.stgBulletPattern === 'random' || s.stgBulletPattern === 'none') {
                pat = s.stgBulletPattern;
            }
            let emit = b.stgEmitStyle;
            if (s.stgEmitStyle === 'fan' || s.stgEmitStyle === 'ring' || s.stgEmitStyle === 'laser' || s.stgEmitStyle === 'single') {
                emit = s.stgEmitStyle;
            }
            out[id] = {
                name: s.name != null ? s.name : b.name,
                icon: s.icon != null ? s.icon : b.icon,
                color: s.color != null ? s.color : b.color,
                radius: s.radius != null ? Math.max(4, Math.min(48, s.radius)) : b.radius,
                defaultHealth: s.defaultHealth != null ? s.defaultHealth : b.defaultHealth,
                defaultAttack: s.defaultAttack != null ? s.defaultAttack : b.defaultAttack,
                defaultSpeed: s.defaultSpeed != null ? s.defaultSpeed : b.defaultSpeed,
                stgBulletPattern: pat,
                stgShootCooldownMs: s.stgShootCooldownMs != null ? Math.max(200, s.stgShootCooldownMs) : b.stgShootCooldownMs,
                stgEnemyBulletSpeed: s.stgEnemyBulletSpeed != null ? Math.max(40, s.stgEnemyBulletSpeed) : b.stgEnemyBulletSpeed,
                stgEmitStyle: emit,
                stgFanCount: s.stgFanCount != null ? Math.max(2, Math.min(24, s.stgFanCount)) : b.stgFanCount,
                stgFanSpreadDeg: s.stgFanSpreadDeg != null ? Math.max(10, Math.min(180, s.stgFanSpreadDeg)) : b.stgFanSpreadDeg,
                stgRingCount: s.stgRingCount != null ? Math.max(3, Math.min(36, s.stgRingCount)) : b.stgRingCount,
                stgLaserLength: s.stgLaserLength != null ? Math.max(80, Math.min(600, s.stgLaserLength)) : b.stgLaserLength,
                stgLaserWidth: s.stgLaserWidth != null ? Math.max(4, Math.min(48, s.stgLaserWidth)) : b.stgLaserWidth,
                stgLaserDurationMs: s.stgLaserDurationMs != null ? Math.max(100, Math.min(3000, s.stgLaserDurationMs)) : b.stgLaserDurationMs,
                stgSplitDelaySec: s.stgSplitDelaySec != null ? Math.max(0, Math.min(10, s.stgSplitDelaySec)) : b.stgSplitDelaySec,
                stgSplitChildSpeed: s.stgSplitChildSpeed != null ? Math.max(40, Math.min(520, s.stgSplitChildSpeed)) : b.stgSplitChildSpeed,
                stgHomingStrength: s.stgHomingStrength != null ? Math.max(0, Math.min(100, s.stgHomingStrength)) : b.stgHomingStrength,
                stgEmitWhen: s.stgEmitWhen === 'on_death' ? 'on_death' : 'cooldown',
                stgBulletKind:
                    s.stgBulletKind === 'split'
                        ? 'split'
                        : s.stgBulletKind === 'normal'
                          ? 'normal'
                          : s.stgSplitDelaySec > 0
                            ? 'split'
                            : 'normal',
                stgSplitCount: s.stgSplitCount != null ? Math.max(2, Math.min(16, s.stgSplitCount)) : 4,
                stgSplitStyle: s.stgSplitStyle === 'cross' ? 'cross' : 'cross',
                stgMoveMode:
                    s.stgMoveMode === 'straight' ||
                    s.stgMoveMode === 'homing' ||
                    s.stgMoveMode === 'anchor' ||
                    s.stgMoveMode === 'arc_edges' ||
                    s.stgMoveMode === 'homing_legacy' ||
                    s.stgMoveMode === 'horizontal_left' ||
                    s.stgMoveMode === 'horizontal_right'
                        ? s.stgMoveMode
                        : b.stgMoveMode,
                stgMoveStraightAngleDeg:
                    s.stgMoveStraightAngleDeg != null
                        ? Math.max(-55, Math.min(55, s.stgMoveStraightAngleDeg))
                        : b.stgMoveStraightAngleDeg,
                stgAnchorXNorm:
                    s.stgAnchorXNorm != null ? Math.max(0.02, Math.min(0.98, s.stgAnchorXNorm)) : b.stgAnchorXNorm,
                stgAnchorYNorm:
                    s.stgAnchorYNorm != null ? Math.max(0.02, Math.min(0.98, s.stgAnchorYNorm)) : b.stgAnchorYNorm,
                stgArcEdge1XNorm:
                    s.stgArcEdge1XNorm != null ? Math.max(0.02, Math.min(0.98, s.stgArcEdge1XNorm)) : b.stgArcEdge1XNorm,
                stgArcEdge1YNorm:
                    s.stgArcEdge1YNorm != null ? Math.max(0.05, Math.min(0.98, s.stgArcEdge1YNorm)) : b.stgArcEdge1YNorm,
                stgArcEdge2XNorm:
                    s.stgArcEdge2XNorm != null ? Math.max(0.02, Math.min(0.98, s.stgArcEdge2XNorm)) : b.stgArcEdge2XNorm,
                stgArcEdge2YNorm:
                    s.stgArcEdge2YNorm != null ? Math.max(0.05, Math.min(0.98, s.stgArcEdge2YNorm)) : b.stgArcEdge2YNorm,
                stgArcBulge1: s.stgArcBulge1 != null ? Math.max(15, Math.min(220, s.stgArcBulge1)) : b.stgArcBulge1,
                stgArcBulge2: s.stgArcBulge2 != null ? Math.max(15, Math.min(220, s.stgArcBulge2)) : b.stgArcBulge2,
                stgEnemyBulletRadius:
                    s.stgEnemyBulletRadius != null ? Math.max(2, Math.min(28, s.stgEnemyBulletRadius)) : b.stgEnemyBulletRadius,
                stgEnemyBulletShape:
                    s.stgEnemyBulletShape === 'triangle' || s.stgEnemyBulletShape === 'circle'
                        ? s.stgEnemyBulletShape === 'triangle'
                            ? 'triangle'
                            : 'circle'
                        : b.stgEnemyBulletShape === 'triangle'
                          ? 'triangle'
                          : 'circle'
            };
        });
        return out;
    }

    /**
     * 异步加载波次：与塔防共用 tower_defense_wave_config
     */
    function loadWaves() {
        return new Promise((resolve) => {
            try {
                const raw = localStorage.getItem(WAVE_STORAGE_KEY);
                if (raw) {
                    const d = JSON.parse(raw);
                    if (d && Array.isArray(d.waves) && d.waves.length > 0) {
                        console.log('[STG] 已自本地加载波次，共', d.waves.length, '波');
                        resolve({ waves: d.waves });
                        return;
                    }
                }
            } catch (e) {
                console.warn('[STG] 本地波次解析失败', e);
            }
            fetch('waveConfig.json?' + Date.now())
                .then((r) => (r.ok ? r.json() : null))
                .then((data) => {
                    if (data && Array.isArray(data.waves)) {
                        const waves =
                            window.StgWaveFormationPanel &&
                            typeof window.StgWaveFormationPanel.migrateWaveForRuntime === 'function'
                                ? data.waves.map((w) => window.StgWaveFormationPanel.migrateWaveForRuntime(w))
                                : data.waves;
                        console.log('[STG] 已加载 waveConfig.json，共', waves.length, '波');
                        resolve({ waves });
                    } else {
                        resolve({
                            waves: [
                                {
                                    waveNumber: 1,
                                    spawnInterval: 450,
                                    nextWaveDelaySec: 8,
                                    spiritReward: 10,
                                    enemies: [{ type: 'normal', count: 6 }],
                                    stgFormation: null
                                }
                            ]
                        });
                    }
                })
                .catch(() => {
                    resolve({
                        waves: [
                            {
                                waveNumber: 1,
                                spawnInterval: 450,
                                nextWaveDelaySec: 8,
                                spiritReward: 10,
                                enemies: [{ type: 'normal', count: 6 }],
                                stgFormation: null
                            }
                        ]
                    });
                });
        });
    }

    /**
     * 将三块阵型棋盘展平为列表（与顺序无关：阵型波次同一帧全部生成）。
     * 棋盘与主战场同格数，上/左/右 为三个方向的延伸，见 getExtendedGridCellCenter。
     */
    function flattenFormationToSpawnList(f) {
        const list = [];
        if (!f || typeof f !== 'object') return list;

        function pushParts(cell, edge, c, r) {
            if (cell == null || String(cell).trim() === '') return;
            const parts = String(cell)
                .split('|')
                .map((s) => s.trim())
                .filter(Boolean);
            parts.forEach((typeId) => {
                list.push({ typeId, edge, col: c, row: r });
            });
        }

        const topGrid = f.top;
        if (topGrid && Array.isArray(topGrid)) {
            for (let r = 0; r < GRID_ROWS; r++) {
                const row = topGrid[r];
                if (!row || !Array.isArray(row)) continue;
                for (let c = 0; c < GRID_COLS; c++) {
                    pushParts(row[c], 'top', c, r);
                }
            }
        }

        const leftGrid = f.left;
        if (leftGrid && Array.isArray(leftGrid)) {
            for (let r = 0; r < GRID_ROWS; r++) {
                const row = leftGrid[r];
                if (!row || !Array.isArray(row)) continue;
                for (let c = 0; c < GRID_COLS; c++) {
                    pushParts(row[c], 'left', c, r);
                }
            }
        }

        const rightGrid = f.right;
        if (rightGrid && Array.isArray(rightGrid)) {
            for (let r = 0; r < GRID_ROWS; r++) {
                const row = rightGrid[r];
                if (!row || !Array.isArray(row)) continue;
                for (let c = 0; c < GRID_COLS; c++) {
                    pushParts(row[c], 'right', c, r);
                }
            }
        }

        return list;
    }

    /**
     * 仅使用阵型格子决定出兵；与旧 enemies 列表无关（读档时由阵型面板迁移逻辑写入 stgFormation）。
     * @returns {{ list: Array<{typeId, edge, col, row}> }}
     */
    function flattenWaveToQueue(wave) {
        if (!wave || !wave.stgFormation || typeof wave.stgFormation !== 'object') {
            return { list: [] };
        }
        return { list: flattenFormationToSpawnList(wave.stgFormation) };
    }

    function getSpawnPendingCount() {
        return spawnQueueLegacy.length;
    }

    /**
     * 主棋盘格坐标延伸：与编辑器同索引 (col,row)，上/左/右 三块与主战场边对边拼接。
     * - 上：接在主棋盘上方，行 r=0 为最上，r=ROWS-1 与主棋盘第 0 行相邻。
     * - 左：接在左侧，列 c=COLS-1 与主棋盘第 0 列相邻。
     * - 右：接在右侧，列 c=0 与主棋盘第 COLS-1 列相邻。
     */
    function getExtendedGridCellCenter(edge, col, row) {
        const cs = cellSize;
        const c = Math.max(0, Math.min(GRID_COLS - 1, col | 0));
        const r = Math.max(0, Math.min(GRID_ROWS - 1, row | 0));
        if (edge === 'top') {
            const x = (c + 0.5) * cs;
            const y = (r - GRID_ROWS) * cs + cs * 0.5;
            return { x, y };
        }
        if (edge === 'left') {
            const x = (c - GRID_COLS) * cs + cs * 0.5;
            const y = (r + 0.5) * cs;
            return { x, y };
        }
        if (edge === 'right') {
            const x = (GRID_COLS + c) * cs + cs * 0.5;
            const y = (r + 0.5) * cs;
            return { x, y };
        }
        return { x: (c + 0.5) * cs, y: (r + 0.5) * cs };
    }

    /**
     * 阵型：本波所有格子上的敌人在同一时刻生成（不使用 spawnInterval 逐个出）。
     */
    function spawnFormationEntriesImmediate(entries, typesMap) {
        if (!entries || entries.length === 0) return;
        for (let i = 0; i < entries.length; i++) {
            spawnEnemyFromRaw(entries[i], typesMap, { fromFormation: true });
        }
        console.log('[STG] 阵型已同时生成', entries.length, '只（扩展棋盘格心）');
    }

    function applyWaveFlattenResult(fr) {
        spawnQueueLegacy = [];
        const n = fr && fr.list ? fr.list.length : 0;
        stgWaveSpawnTotal = n;
        stgWaveResolvedCount = 0;
        if (fr.list && fr.list.length > 0) {
            spawnFormationEntriesImmediate(fr.list, getEnemyTypeMap());
        }
    }

    function isStgEnemyFullyOutsideCanvas(e, cw, ch) {
        const r = e.radius != null ? e.radius : 14;
        return e.x + r < 0 || e.x - r > cw || e.y + r < 0 || e.y - r > ch;
    }

    /**
     * 身体完全离开画布时，按「离开得最深」的一条边作为主离开边（角上同时越界时二选一）。
     * @returns {'top'|'bottom'|'left'|'right'|null}
     */
    function classifyStgExitBoundary(e, cw, ch) {
        if (!isStgEnemyFullyOutsideCanvas(e, cw, ch)) return null;
        const r = e.radius != null ? e.radius : 14;
        let best = 'top';
        let bestD = -1;
        if (e.y + r < 0) {
            const d = -(e.y + r);
            if (d > bestD) {
                bestD = d;
                best = 'top';
            }
        }
        if (e.y - r > ch) {
            const d = e.y - r - ch;
            if (d > bestD) {
                bestD = d;
                best = 'bottom';
            }
        }
        if (e.x + r < 0) {
            const d = -(e.x + r);
            if (d > bestD) {
                bestD = d;
                best = 'left';
            }
        }
        if (e.x - r > cw) {
            const d = e.x - r - cw;
            if (d > bestD) {
                bestD = d;
                best = 'right';
            }
        }
        return best;
    }

    /**
     * 扩展棋盘来源与屏幕四边：仅在「其它边界」离场算本波清除（与提前下一波计数一致）。
     * 上：下/左/右算清除；左：下/右/上算清除；右：下/左/上算清除。
     */
    function isStgExitCountsAsWaveClear(spawnEdge, exitBoundary) {
        if (!exitBoundary) return false;
        if (spawnEdge === 'top') return exitBoundary !== 'top';
        if (spawnEdge === 'left') return exitBoundary !== 'left';
        if (spawnEdge === 'right') return exitBoundary !== 'right';
        return true;
    }

    function markStgWaveEnemyResolved(e) {
        if (!e || e.stgWaveCounted) return;
        e.stgWaveCounted = true;
        stgWaveResolvedCount++;
    }

    /**
     * 本波登记敌全部消灭（击杀或有效边界离场）且仍有下一波时，立即开波（不等到倒计时）。
     */
    function checkStgWaveAllClearedAndAdvance() {
        const waves = waveData.waves || [];
        if (waves.length === 0) return;
        if (waveIndex >= waves.length - 1) return;
        if (stgWaveSpawnTotal <= 0) return;
        if (stgWaveResolvedCount < stgWaveSpawnTotal) return;
        if (getSpawnPendingCount() > 0) return;
        console.log('[STG] 本波敌人已全部消灭或从有效边界离场，提前开始下一波');
        tryStgAutoStartNextWave();
    }

    /**
     * 与 towerDefense.scheduleNextWaveTimerAfterCurrentWaveStarted 一致：
     * 当前波（waveIndex）已开始出兵起算，nextWaveDelaySec 秒后尝试自动开下一波（不等待清怪）。
     */
    function scheduleStgNextWaveTimerAfterCurrentWaveStarted() {
        interWaveCountEnd = null;
        const waves = waveData.waves || [];
        if (waves.length === 0) return;
        if (waveIndex >= waves.length - 1) {
            return;
        }
        const w = waves[waveIndex];
        const n = w && w.nextWaveDelaySec != null ? Number(w.nextWaveDelaySec) : 15;
        const sec = Math.max(0, Number.isFinite(n) ? n : 15);
        if (sec <= 0) {
            queueMicrotask(() => {
                tryStgAutoStartNextWave();
            });
            return;
        }
        interWaveCountEnd = performance.now() + sec * 1000;
        console.log('[STG] 第', waveIndex + 1, '波已开始，', sec, 's 后尝试自动下一波');
    }

    /**
     * 与 towerDefense.tryAutoStartNextWave 一致：上一波出兵队列未清空则延后
     * @returns {boolean}
     */
    function tryStgAutoStartNextWave() {
        const waves = waveData.waves || [];
        if (getSpawnPendingCount() > 0) {
            console.log('[STG] 上一波仍在按间隔出兵，延后自动下一波');
            return false;
        }
        if (waveIndex >= waves.length - 1) {
            interWaveCountEnd = null;
            return false;
        }
        waveIndex++;
        const nw = waves[waveIndex];
        if (!nw) {
            interWaveCountEnd = null;
            return false;
        }
        spawnIntervalMs = nw.spawnInterval != null ? nw.spawnInterval : 400;
        spawnSlotUsage.clear();
        applyWaveFlattenResult(flattenWaveToQueue(nw));
        if (getSpawnPendingCount() === 0) {
            console.warn('[STG] 该波阵型格子为空，本波无敌人');
        }
        spawnAccMs = spawnIntervalMs;
        interWaveCountEnd = null;
        scheduleStgNextWaveTimerAfterCurrentWaveStarted();
        console.log('[STG] 自动开始第', waveIndex + 1, '波，待出', getSpawnPendingCount());
        return true;
    }

    /**
     * 与 towerDefense.getSpawnNextWaveCountdownSec 一致，供 HUD 显示整秒
     * @returns {number|null}
     */
    function getStgNextWaveCountdownSec() {
        if (interWaveCountEnd == null) return null;
        const remainMs = interWaveCountEnd - performance.now();
        if (remainMs > 0) {
            return Math.max(1, Math.ceil(remainMs / 1000 - 0.001));
        }
        const waves = waveData.waves || [];
        if (waves.length > 1 && waveIndex < waves.length - 1) {
            return 0;
        }
        return null;
    }

    /**
     * 英雄模板生命、攻速→射击间隔：吃强化中的生命与攻速，**不**再混入英雄基础攻击。
     */
    function applyStgHeroNonWeaponScalars(maxHp, fireIntervalMs) {
        if (!playerStatsRef || !playerStatsRef.getStat) {
            return { maxHp, fireIntervalMs };
        }
        const ps = playerStatsRef;
        const mh = maxHp * (1 + (ps.getStat('max_health_bonus') || 0));
        const sb = (ps.getStat('attack_speed_bonus') || 0) + (ps.getStat('attack_speed_percent') || 0);
        let fi = fireIntervalMs / (1 + sb);
        fi = Math.max(40, Math.min(400, fi));
        return { maxHp: mh, fireIntervalMs: fi };
    }

    /**
     * 武器编辑器填写的「基础攻击力」乘上强化中的攻击力相关乘区（与塔防前台 damage 思路一致，不含英雄基础攻）。
     * @param {number} weaponBaseAtk
     */
    function applyStgWeaponBaseAttackBonuses(weaponBaseAtk) {
        if (!playerStatsRef || !playerStatsRef.getStat) {
            return weaponBaseAtk;
        }
        const ps = playerStatsRef;
        const totalPercent = ps.getStat('total_damage_percent') || 0;
        const atkB = ps.getStat('attack_damage_bonus') || 0;
        const elemDmg = ps.getStat('elemental_damage_bonus') || 0;
        const elemFx = ps.getStat('elemental_effect_bonus') || 0;
        const elemStack = elemDmg + elemFx * 0.5;
        return weaponBaseAtk * (1 + totalPercent) * (1 + atkB) * (1 + elemStack);
    }

    /**
     * 从物品池取第一格可用英雄属性；无则默认战士模板
     */
    function buildPlayerFromHero() {
        const pool = (typeof window !== 'undefined' && window.ITEM_POOL) || [];
        const gs = gameStateRef;
        let heroItem = pool.find((i) => i && i.category === '英雄');
        if (gs && gs.heroInventory && heroItem) {
            const has = (id) => (gs.heroInventory.get(id) || 0) > 0;
            const picked = pool.find((i) => i && i.category === '英雄' && has(i.id));
            if (picked) heroItem = picked;
        }
        const attr = (heroItem && heroItem.attributes) || {};
        let maxHp = attr.health != null ? attr.health : 80;
        const aps = attr.attackSpeed != null ? attr.attackSpeed : 5;
        let fireIntervalMs = Math.max(60, Math.min(350, 1000 / Math.max(aps * 0.15, 0.5)));
        let moveSpeed = 200;

        const scaled = applyStgHeroNonWeaponScalars(maxHp, fireIntervalMs);
        maxHp = scaled.maxHp;
        fireIntervalMs = scaled.fireIntervalMs;

        const cw = canvas ? canvas.width : GRID_COLS * cellSize;
        const ch = canvas ? canvas.height : GRID_ROWS * cellSize;
        const px = cw / 2;
        const py = ch - cellSize * 1.8;

        /** STG 伤害以武器编辑器为准，不再使用英雄 baseAttack */
        const p = {
            x: px,
            y: py,
            radius: 14,
            hp: maxHp,
            maxHp,
            moveSpeed,
            fireIntervalMs,
            bulletSpeed: 420,
            mainWeaponAttack: 10,
            focusWeaponAttack: 10,
            skillWeaponAttack: 10
        };
        const cfg = loadStgPlayerConfig();
        if (cfg) mergeStgPlayerEditorIntoPlayer(p, cfg);
        return p;
    }

    /**
     * 主武器(Z) / 技能(X) 发射：单发多线、扇形、环形；速度吃 bonusBulletSpeed
     * @param {boolean} isSkill 大招(X)
     * @param {boolean} [mainUseFocus] 主武器在按住 Shift 慢速时使用 focus* 参数（可与普通模式不同）
     */
    /** 玩家弹外观：与编辑器「子弹外观」一致；碰撞仍用 radius 圆形近似 */
    function normalizePlayerBulletVisualShape(s) {
        if (s === 'diamond' || s === 'square') return s;
        return 'circle';
    }

    function emitPlayerVolley(isSkill, mainUseFocus) {
        if (!player) return;
        const p = player;
        const useFocusMain = !isSkill && !!mainUseFocus;

        let spdBase;
        let style;
        let nSingle;
        let nFan;
        let nRing;
        let spreadDeg;
        let baseAtk = 10;
        let br = 4;
        let visShape = 'circle';

        if (isSkill) {
            spdBase = p.skillBulletSpeed != null ? p.skillBulletSpeed : p.bulletSpeed;
            style = p.skillEmitStyle || 'single';
            nSingle = p.skillSingleCount != null ? p.skillSingleCount : 1;
            nFan = p.skillFanCount != null ? p.skillFanCount : 5;
            nRing = p.skillRingCount != null ? p.skillRingCount : 12;
            spreadDeg = p.skillFanSpreadDeg != null ? p.skillFanSpreadDeg : 60;
            baseAtk = p.skillWeaponAttack != null ? p.skillWeaponAttack : 10;
            br = p.skillBulletRadius != null ? p.skillBulletRadius : 4;
            visShape = normalizePlayerBulletVisualShape(p.skillBulletVisualShape);
        } else if (useFocusMain) {
            spdBase = p.focusBulletSpeed != null ? p.focusBulletSpeed : p.bulletSpeed;
            style = p.focusEmitStyle || p.emitStyle || 'single';
            nSingle = p.focusSingleCount != null ? p.focusSingleCount : p.singleCount != null ? p.singleCount : 1;
            nFan = p.focusFanCount != null ? p.focusFanCount : p.fanCount != null ? p.fanCount : 5;
            nRing = p.focusRingCount != null ? p.focusRingCount : p.ringCount != null ? p.ringCount : 12;
            spreadDeg =
                p.focusFanSpreadDeg != null ? p.focusFanSpreadDeg : p.fanSpreadDeg != null ? p.fanSpreadDeg : 60;
            baseAtk =
                p.focusWeaponAttack != null
                    ? p.focusWeaponAttack
                    : p.mainWeaponAttack != null
                      ? p.mainWeaponAttack
                      : 10;
            br =
                p.focusBulletRadius != null
                    ? p.focusBulletRadius
                    : p.bulletRadius != null
                      ? p.bulletRadius
                      : 4;
            visShape = normalizePlayerBulletVisualShape(
                p.focusBulletVisualShape != null ? p.focusBulletVisualShape : p.bulletVisualShape
            );
        } else {
            spdBase = p.bulletSpeed;
            style = p.emitStyle || 'single';
            nSingle = p.singleCount != null ? p.singleCount : 1;
            nFan = p.fanCount != null ? p.fanCount : 5;
            nRing = p.ringCount != null ? p.ringCount : 12;
            spreadDeg = p.fanSpreadDeg != null ? p.fanSpreadDeg : 60;
            baseAtk = p.mainWeaponAttack != null ? p.mainWeaponAttack : 10;
            br = p.bulletRadius != null ? p.bulletRadius : 4;
            visShape = normalizePlayerBulletVisualShape(p.bulletVisualShape);
        }

        /** 局内三选一 bonusDamage × 强化攻击力乘区 × 各武器基础攻击力 */
        const dmg = applyStgWeaponBaseAttackBonuses(baseAtk) * bonusDamage;
        const spd = spdBase * bonusBulletSpeed;
        const px = p.x;
        const py = p.y - p.radius;

        function pushBullet(x, y, vx, vy) {
            playerBullets.push({
                x,
                y,
                vx,
                vy,
                dmg,
                alive: true,
                radius: br,
                shape: visShape
            });
        }

        if (style === 'single') {
            const n = Math.max(1, Math.min(5, nSingle));
            const gap = 10;
            for (let i = 0; i < n; i++) {
                const ox = (i - (n - 1) * 0.5) * gap;
                pushBullet(px + ox, py, 0, -spd);
            }
            return;
        }
        if (style === 'fan') {
            const n = Math.max(2, Math.min(24, nFan));
            const spread = (spreadDeg * Math.PI) / 180;
            const base = -Math.PI / 2;
            const start = base - spread * 0.5;
            for (let i = 0; i < n; i++) {
                const a = n <= 1 ? base : start + (spread * i) / Math.max(1, n - 1);
                pushBullet(px, py, Math.cos(a) * spd, Math.sin(a) * spd);
            }
            return;
        }
        const n = Math.max(3, Math.min(36, nRing));
        for (let i = 0; i < n; i++) {
            const a = (Math.PI * 2 * i) / n;
            pushBullet(px, py, Math.cos(a) * spd, Math.sin(a) * spd);
        }
    }

    /** 绘制单发玩家弹：圆形 / 菱形 / 方形（随速度方向旋转） */
    function drawStgPlayerBullet(ctx, b) {
        const rad = b.radius != null ? b.radius : 4;
        const sh = b.shape || 'circle';
        ctx.fillStyle = '#f1c40f';
        if (sh === 'circle') {
            ctx.beginPath();
            ctx.arc(b.x, b.y, rad, 0, Math.PI * 2);
            ctx.fill();
            return;
        }
        const ang = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(ang + Math.PI / 2);
        ctx.beginPath();
        if (sh === 'square') {
            ctx.rect(-rad, -rad, rad * 2, rad * 2);
        } else {
            ctx.moveTo(0, -rad);
            ctx.lineTo(rad, 0);
            ctx.lineTo(0, rad);
            ctx.lineTo(-rad, 0);
            ctx.closePath();
        }
        ctx.fill();
        ctx.restore();
    }

    function resetBonuses() {
        bonusDamage = 1;
        bonusFireIntervalMult = 1;
        bonusMoveMult = 1;
        bonusPickupRadius = 1;
        bonusBulletSpeed = 1;
        bonusExpMult = 1;
        /** 强化道具「英雄经验获取加成」：与局内三选一 bonusExpMult 叠乘 */
        if (playerStatsRef && playerStatsRef.getStat) {
            const xpb = playerStatsRef.getStat('hero_xp_gain_bonus') || 0;
            if (xpb > 0) bonusExpMult *= 1 + xpb;
        }
    }

    function resetRun() {
        phase = 'playing';
        level = 1;
        exp = 0;
        expToNext = 100;
        waveIndex = 0;
        spawnQueueLegacy = [];
        spawnAccMs = 0;
        interWaveCountEnd = null;
        playerBullets = [];
        enemies = [];
        enemyBullets = [];
        enemyLasers = [];
        pickups = [];
        stgPlayerFxParticles = [];
        stgPlayerHitFlashMs = 0;
        stgLaserFxAccMs = 0;
        invalidateScenePropsCache();
        resetBonuses();
        player = buildPlayerFromHero();
        runStartMs = performance.now();

        const w = waveData.waves[0];
        spawnSlotUsage.clear();
        if (w) {
            spawnIntervalMs = w.spawnInterval != null ? w.spawnInterval : 400;
            applyWaveFlattenResult(flattenWaveToQueue(w));
        }
        if (getSpawnPendingCount() === 0) {
            console.warn('[STG] 第一波阵型为空，无敌人（请在「波次阵型编辑器」摆放）');
        }
        /** 仅 legacy 队列需要：首拍即出第一只；阵型已在 apply 内一次刷完 */
        spawnAccMs = spawnIntervalMs;
        scheduleStgNextWaveTimerAfterCurrentWaveStarted();
        console.log(
            '[STG] 开局：HP=',
            player.maxHp,
            '武器攻',
            (player.mainWeaponAttack != null ? player.mainWeaponAttack : 10).toFixed(1),
            '/',
            (player.focusWeaponAttack != null ? player.focusWeaponAttack : player.mainWeaponAttack != null ? player.mainWeaponAttack : 10).toFixed(1),
            '/',
            (player.skillWeaponAttack != null ? player.skillWeaponAttack : 10).toFixed(1),
            '第1波待出',
            getSpawnPendingCount(),
            '只'
        );
        refreshStgAttackBuildPanel();
    }

    function startGame() {
        loadWaves().then((data) => {
            waveData = data;
            if (!waveData.waves || waveData.waves.length === 0) {
                waveData = { waves: [{ waveNumber: 1, spawnInterval: 450, enemies: [{ type: 'normal', count: 5 }] }] };
            }
            resetRun();
            isRunning = true;
            isPaused = false;
            lastFrameTime = performance.now();
            const h = getHudElements();
            if (h.hintBar) h.hintBar.classList.remove('hidden');
            hideResult();
            // 主循环已在 init 中启动，此处勿再调用 loop()，否则会重复注册 rAF
        });
    }

    function loop(t) {
        rafId = requestAnimationFrame(loop);
        if (!isRunning || isPaused) return;
        const now = t != null ? t : performance.now();
        let dt = now - lastFrameTime;
        if (dt > 80) dt = 80;
        lastFrameTime = now;

        if (phase === 'playing') {
            update(dt);
        }
        draw();
    }

    /**
     * @param {object} opts
     * @param {boolean} [opts.fromFormation] 扩展棋盘阵型：格心精确对齐，首只不随机抖动以免破坏几何形状
     */
    function spawnEnemyFromRaw(raw, typesMap, opts) {
        const fromFormation = opts && opts.fromFormation;
        let typeId;
        let edge = 'top';
        let col = Math.floor(Math.random() * GRID_COLS);
        let row = 0;
        if (typeof raw === 'string') {
            typeId = raw;
        } else if (raw && typeof raw === 'object') {
            typeId = raw.typeId || raw.type || 'normal';
            if (raw.edge === 'left' || raw.edge === 'right' || raw.edge === 'top') edge = raw.edge;
            if (raw.col != null) col = Math.max(0, Math.min(GRID_COLS - 1, raw.col | 0));
            if (raw.row != null) row = Math.max(0, Math.min(GRID_ROWS - 1, raw.row | 0));
        } else {
            typeId = 'normal';
        }
        const def = typesMap[typeId] || typesMap.normal;
        const pattern = resolveStgBulletPattern(def);
        let x;
        let y;
        const margin = 22;
        if (typeof raw === 'object' && raw && (raw.edge === 'left' || raw.edge === 'right' || raw.edge === 'top')) {
            const p = getExtendedGridCellCenter(edge, col, row);
            x = p.x;
            y = p.y;
        } else {
            /** 无阵型列表：从主棋盘顶沿外随机列入场 */
            x = col * cellSize + cellSize * 0.5;
            y = -margin;
        }
        const slotKey = edge + '|' + col + '|' + row;
        const slotIdx = spawnSlotUsage.get(slotKey) || 0;
        spawnSlotUsage.set(slotKey, slotIdx + 1);
        let ox = 0;
        let oy = 0;
        if (!fromFormation || slotIdx > 0) {
            const jitterMax = Math.min(16, cellSize * 0.38);
            ox = (Math.random() - 0.5) * 2 * jitterMax;
            oy = (Math.random() - 0.5) * 2 * jitterMax;
        }
        if (slotIdx > 0) {
            const golden = slotIdx * 2.39996322972865332;
            const rad = Math.min(36, 9 + slotIdx * 6);
            ox += Math.cos(golden) * rad;
            oy += Math.sin(golden) * rad;
        }
        x += ox;
        y += oy;
        const en = new StgEnemy(x, y, def, pattern, typeId);
        en.stgSpawnEdge = edge === 'left' || edge === 'right' || edge === 'top' ? edge : 'top';
        enemies.push(en);
    }

    function update(dt) {
        if (!canvas || !player) return;
        const dtSec = dt * 0.001;
        const typesMap = getEnemyTypeMap();
        const cw = canvas.width;
        const ch = canvas.height;

        /** --- 玩家移动 --- */
        let mvx = 0;
        let mvy = 0;
        if (keys.ArrowLeft) mvx -= 1;
        if (keys.ArrowRight) mvx += 1;
        if (keys.ArrowUp) mvy -= 1;
        if (keys.ArrowDown) mvy += 1;
        /** Shift：慢速移动 + 可选独立「集中」主武器参数（与武器编辑器一致） */
        const shiftHeld = keys.ShiftLeft || keys.ShiftRight;
        if (mvx !== 0 || mvy !== 0) {
            const len = Math.hypot(mvx, mvy) || 1;
            const fm = player.focusMoveMult != null ? player.focusMoveMult : STG_FOCUS_MOVE_MULT;
            const sp = player.moveSpeed * bonusMoveMult * (shiftHeld ? fm : 1);
            player.x += (mvx / len) * sp * dtSec;
            player.y += (mvy / len) * sp * dtSec;
        }
        player.x = Math.max(player.radius, Math.min(cw - player.radius, player.x));
        player.y = Math.max(player.radius, Math.min(ch - player.radius, player.y));

        /** 强化「生命恢复加成」：与塔防塔回复同量级思路，按最大生命×加成×系数/秒 */
        if (playerStatsRef && playerStatsRef.getStat && player.hp > 0 && player.hp < player.maxHp) {
            const reg = playerStatsRef.getStat('health_regen_bonus') || 0;
            if (reg > 0) {
                player.hp += player.maxHp * reg * 0.005 * dtSec;
                if (player.hp > player.maxHp) player.hp = player.maxHp;
            }
        }

        /** --- 玩家主武器（Z 按住）与技能弹幕（X 按住） --- */
        const nowT = performance.now();
        if (!player._lastFireMs) player._lastFireMs = 0;
        const mainIvBase = shiftHeld
            ? player.focusFireIntervalMs != null
                ? player.focusFireIntervalMs
                : player.fireIntervalMs
            : player.fireIntervalMs;
        const fireIv = mainIvBase * bonusFireIntervalMult;
        if (keys.KeyZ && nowT - player._lastFireMs >= fireIv) {
            player._lastFireMs = nowT;
            emitPlayerVolley(false, shiftHeld);
        }
        if (!player._lastSkillFireMs) player._lastSkillFireMs = 0;
        const skillIv = (player.skillFireIntervalMs != null ? player.skillFireIntervalMs : 120) * bonusFireIntervalMult;
        const skillCd = player.skillCooldownMs != null ? player.skillCooldownMs : 0;
        if (keys.KeyX && nowT >= (player._skillCooldownUntil || 0) && nowT - player._lastSkillFireMs >= skillIv) {
            player._lastSkillFireMs = nowT;
            emitPlayerVolley(true);
            if (skillCd > 0) player._skillCooldownUntil = nowT + skillCd;
        }

        /** --- 出兵与自动下一波（与 towerDefense：本波开始起算 nextWaveDelaySec，不等待清怪） --- */
        const waves = waveData.waves || [];
        if (interWaveCountEnd != null && performance.now() >= interWaveCountEnd) {
            if (waveIndex >= waves.length - 1) {
                interWaveCountEnd = null;
            } else {
                tryStgAutoStartNextWave();
            }
        }

        if (getSpawnPendingCount() > 0) {
            spawnAccMs += dt;
            while (spawnAccMs >= spawnIntervalMs && getSpawnPendingCount() > 0) {
                spawnAccMs -= spawnIntervalMs;
                const raw = spawnQueueLegacy.shift();
                spawnEnemyFromRaw(raw, typesMap, null);
            }
        } else if (enemies.length === 0 && getSpawnPendingCount() === 0 && waveIndex >= waves.length - 1) {
            phase = 'win';
            showResult(true);
            isRunning = false;
            interWaveCountEnd = null;
            console.log('[STG] 通关：最后一波已清空');
        }

        /** --- 敌人 --- */
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (!e.alive) {
                enemies.splice(i, 1);
                continue;
            }
            updateStgEnemyPosition(e, player, cw, ch, dtSec);

            const er = e.radius != null ? e.radius : 14;
            /** 与画布 [0,cw]×[0,ch] 有任意重叠则视为已入场，之后才允许「完全离场」剔除 */
            const overlapsCanvas = !(e.x + er < 0 || e.x - er > cw || e.y + er < 0 || e.y - er > ch);
            if (overlapsCanvas) e.stgHasEnteredPlayfield = true;

            /**
             * 身体完全离开画布：仅当曾进入过画面后才判定（否则上/左/右扩展出生点在画布外首帧会被当成从生成边离场而秒删）。
             * 按阵型来源边判断离场是否算「本波清除」（非清除边离场仅移除，不计入提前下一波）。
             */
            if (e.stgHasEnteredPlayfield && isStgEnemyFullyOutsideCanvas(e, cw, ch)) {
                const exitB = classifyStgExitBoundary(e, cw, ch);
                const spawnEdge =
                    e.stgSpawnEdge === 'left' || e.stgSpawnEdge === 'right' || e.stgSpawnEdge === 'top'
                        ? e.stgSpawnEdge
                        : 'top';
                if (isStgExitCountsAsWaveClear(spawnEdge, exitB)) {
                    markStgWaveEnemyResolved(e);
                }
                e.alive = false;
                continue;
            }

            /** none=无弹幕；死后弹幕仅在阵亡时发射，不在此循环 */
            if (e.pattern !== 'none' && e.stgEmitWhen !== 'on_death' && performance.now() - e.lastShootTime >= e.shootCooldownMs) {
                e.lastShootTime = performance.now();
                emitStgEnemyAttack(e, player);
            }
        }

        /** --- 子弹 --- */
        for (let i = playerBullets.length - 1; i >= 0; i--) {
            const b = playerBullets[i];
            if (!b.alive) {
                playerBullets.splice(i, 1);
                continue;
            }
            b.x += b.vx * dtSec;
            b.y += b.vy * dtSec;
            if (b.y < -20 || b.x < -20 || b.x > cw + 20) {
                b.alive = false;
            }
        }

        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const b = enemyBullets[i];
            if (!b.alive) {
                enemyBullets.splice(i, 1);
                continue;
            }
            b.ageMs = (b.ageMs || 0) + dt;
            /** 延迟分裂：十字样式=整圈均匀放射若干发（子弹不再分裂） */
            if (b.splitAfterMs > 0 && !b.splitDone && b.ageMs >= b.splitAfterMs) {
                b.splitDone = true;
                b.alive = false;
                const sp = b.splitChildSpeed != null ? b.splitChildSpeed : 220;
                const off = Math.random() * Math.PI * 2;
                const cnt = Math.max(2, Math.min(16, b.splitCount != null ? b.splitCount : 4));
                const step = (Math.PI * 2) / cnt;
                for (let k = 0; k < cnt; k++) {
                    const a = off + k * step;
                    pushStgEnemyBullet({
                        x: b.x,
                        y: b.y,
                        vx: Math.cos(a) * sp,
                        vy: Math.sin(a) * sp,
                        dmg: b.dmg,
                        pattern: b.pattern,
                        splitAfterMs: 0,
                        splitChildSpeed: sp,
                        homingStr: b.homingStr != null ? b.homingStr : 0,
                        radius: b.radius != null ? b.radius : 5,
                        shape: b.shape === 'triangle' ? 'triangle' : 'circle'
                    });
                }
                continue;
            }
            /** 跟踪：强度越大，越快地转向玩家（弧度/秒上限与强度成正比） */
            const hs = b.homingStr != null ? b.homingStr : 0;
            if (hs > 0 && player) {
                const spd = Math.hypot(b.vx, b.vy);
                if (spd > 8) {
                    const ta = Math.atan2(player.y - b.y, player.x - b.x);
                    let ca = Math.atan2(b.vy, b.vx);
                    let da = ta - ca;
                    while (da > Math.PI) da -= Math.PI * 2;
                    while (da < -Math.PI) da += Math.PI * 2;
                    const turnRate = (hs / 100) * 2.8;
                    const step = Math.max(-turnRate * dtSec, Math.min(turnRate * dtSec, da));
                    ca += step;
                    b.vx = Math.cos(ca) * spd;
                    b.vy = Math.sin(ca) * spd;
                }
            }
            b.x += b.vx * dtSec;
            b.y += b.vy * dtSec;
            if (b.y > ch + 30 || b.x < -30 || b.x > cw + 30) {
                b.alive = false;
            }
        }

        /** 激光持续段：过期移除；与玩家相交则持续伤害（按攻击力×秒） */
        const nowMs = performance.now();
        const prHit = getStgPlayerHitRadius();
        let playerInLaser = false;
        for (let li = enemyLasers.length - 1; li >= 0; li--) {
            const L = enemyLasers[li];
            if (!L.alive || nowMs >= L.endMs) {
                enemyLasers.splice(li, 1);
                continue;
            }
            const dSeg = distPointToSegment(player.x, player.y, L.x1, L.y1, L.x2, L.y2);
            if (dSeg < L.width * 0.5 + prHit) {
                playerInLaser = true;
                player.hp -= L.dmg * dtSec * 2.5;
                stgLaserFxAccMs += dt;
                if (stgLaserFxAccMs >= 95) {
                    stgLaserFxAccMs = 0;
                    triggerStgPlayerHitFx(player.x, player.y, 6, 72);
                }
                if (player.hp <= 0) {
                    player.hp = 0;
                    phase = 'dead';
                    showResult(false);
                    isRunning = false;
                    return;
                }
            }
        }
        if (!playerInLaser) stgLaserFxAccMs = 0;

        /** --- 碰撞：玩家弹 vs 敌 --- */
        for (let bi = 0; bi < playerBullets.length; bi++) {
            const b = playerBullets[bi];
            if (!b.alive) continue;
            for (let ei = 0; ei < enemies.length; ei++) {
                const e = enemies[ei];
                if (!e.alive) continue;
                const rr = b.radius != null ? b.radius : 4;
                if (Math.hypot(b.x - e.x, b.y - e.y) < rr + e.radius) {
                    let hitDmg = b.dmg;
                    if (playerStatsRef && playerStatsRef.getStat) {
                        const critP = Math.min(
                            0.95,
                            (playerStatsRef.getStat('crit_chance_bonus') || 0) + (playerStatsRef.getStat('crit_rate') || 0)
                        );
                        if (critP > 0 && Math.random() < critP) hitDmg *= 2;
                    }
                    e.hp -= hitDmg;
                    b.alive = false;
                    if (e.hp <= 0) {
                        /** 死后弹幕：与战斗中同一套 emit（扇/环/激光/单发）与子弹属性（分裂、跟踪等） */
                        if (e.pattern !== 'none' && e.stgEmitWhen === 'on_death') {
                            emitStgEnemyAttack(e, player);
                            console.log('[STG] 死后弹幕：种类', e.typeId || '');
                        }
                        markStgWaveEnemyResolved(e);
                        e.alive = false;
                        const pExp = Math.max(5, Math.floor(12 * bonusExpMult));
                        pickups.push(createPickupAtKill(e.x, e.y, pExp));
                        console.log('[STG] 击杀敌人，掉落 P点 经验', pExp);
                    }
                    break;
                }
            }
        }

        /** --- 敌弹 vs 玩家（含子弹自身半径） --- */
        for (let i = 0; i < enemyBullets.length; i++) {
            const b = enemyBullets[i];
            if (!b.alive) continue;
            const br = b.radius != null ? b.radius : 5;
            if (Math.hypot(b.x - player.x, b.y - player.y) < br + getStgPlayerHitRadius()) {
                b.alive = false;
                player.hp -= b.dmg;
                triggerStgPlayerHitFx(player.x, player.y, 12, 155);
                console.log('[STG] 玩家受击，剩余 HP', player.hp.toFixed(0));
                if (player.hp <= 0) {
                    phase = 'dead';
                    showResult(false);
                    isRunning = false;
                    return;
                }
            }
        }

        /** --- P点（直线 或 弧线上抛后下落） --- */
        for (let i = pickups.length - 1; i >= 0; i--) {
            const p = pickups[i];
            if (p.mode === 'arc' && p.peakY != null && p.fallVy != null) {
                if (p.vy < 0) {
                    const ny = p.y + p.vy * dtSec;
                    if (ny <= p.peakY) {
                        p.y = p.peakY;
                        p.vy = p.fallVy;
                    } else {
                        p.y = ny;
                    }
                } else {
                    p.y += p.vy * dtSec;
                }
            } else {
                p.y += p.vy * dtSec;
            }
            const pr = 16 * bonusPickupRadius;
            if (Math.hypot(p.x - player.x, p.y - player.y) < pr + player.radius) {
                exp += p.exp;
                pickups.splice(i, 1);
                console.log('[STG] 拾取 P点，经验', exp, '/', expToNext);
                while (exp >= expToNext) {
                    exp -= expToNext;
                    level++;
                    expToNext = Math.floor(100 + (level - 1) * 40);
                    openLevelUp();
                    return;
                }
            } else if (p.y > ch + 30) {
                pickups.splice(i, 1);
            }
        }

        updateStgPlayerHitFx(dt);
        checkStgWaveAllClearedAndAdvance();
        updateHud();
    }

    function openLevelUp() {
        phase = 'levelup';
        let pool = STG_UPGRADE_POOL.filter(isStgUpgradeEligible);
        if (pool.length === 0) {
            pool = [
                {
                    id: 'pool_empty',
                    group: 'stat',
                    name: '（无更多强化）',
                    desc: '本局可抽取的构筑已全部获得。',
                    apply: () => {}
                }
            ];
        }
        /** Fisher-Yates 洗牌，取 3 个（不足 3 张则只展示已有数量） */
        for (let i = pool.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            const t = pool[i];
            pool[i] = pool[j];
            pool[j] = t;
        }
        upgradeChoices = pool.slice(0, 3);
        const h = getHudElements();
        if (!h.upgrade || !h.upgradeCards) return;
        h.upgradeCards.innerHTML = '';
        upgradeChoices.forEach((u) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'stg-upgrade-card';
            const disp =
                window.StgUiI18n && typeof window.StgUiI18n.getUpgradeDisplay === 'function'
                    ? window.StgUiI18n.getUpgradeDisplay(u)
                    : { name: u.name, desc: u.desc };
            btn.innerHTML = `<span class="stg-up-title">${disp.name}</span><span class="stg-up-desc">${disp.desc}</span>`;
            btn.addEventListener('click', () => {
                applyStgUpgradePick(u);
                u.apply(player);
                console.log('[STG] 选择强化:', u.id, u.name, 'focusBranch=', stgFocusBranch, 'ultBranch=', stgUltBranch);
                h.upgrade.classList.add('hidden');
                phase = 'playing';
                lastFrameTime = performance.now();
                refreshStgAttackBuildPanel();
            });
            h.upgradeCards.appendChild(btn);
        });
        h.upgrade.classList.remove('hidden');
    }

    function showResult(win) {
        lastShowResultWin = win;
        const h = getHudElements();
        if (!h.result || !h.resultTitle) return;
        h.resultTitle.textContent = win ? stgUiT('result.titleWin') : stgUiT('result.titleLose');
        h.resultMsg.textContent = win ? stgUiT('result.msgWin') : stgUiT('result.msgLose');
        h.result.classList.remove('hidden');
        if (h.hintBar) h.hintBar.classList.add('hidden');
    }

    function hideResult() {
        lastShowResultWin = null;
        const h = getHudElements();
        if (h.result) h.result.classList.add('hidden');
        /** 结算层关闭后恢复操作说明（showResult 曾隐藏） */
        if (h.hintBar) h.hintBar.classList.remove('hidden');
    }

    /** 与命中结算一致：全局暴击率上限 95% */
    function getStgCritChance() {
        if (!playerStatsRef || !playerStatsRef.getStat) return 0;
        return Math.min(
            0.95,
            (playerStatsRef.getStat('crit_chance_bonus') || 0) + (playerStatsRef.getStat('crit_rate') || 0)
        );
    }

    function stgStyleLine(p, isSkill) {
        const est = isSkill ? p.skillEmitStyle || 'single' : p.emitStyle || 'single';
        if (est === 'fan') {
            const n = isSkill
                ? Math.max(2, Math.min(24, p.skillFanCount != null ? p.skillFanCount : 5))
                : Math.max(2, Math.min(24, p.fanCount != null ? p.fanCount : 5));
            const deg = isSkill
                ? Math.max(10, Math.min(180, p.skillFanSpreadDeg != null ? p.skillFanSpreadDeg : 60))
                : Math.max(10, Math.min(180, p.fanSpreadDeg != null ? p.fanSpreadDeg : 60));
            return stgUiT('attackBuild.stat.styleFan', { n, deg });
        }
        if (est === 'ring') {
            const n = isSkill
                ? Math.max(3, Math.min(36, p.skillRingCount != null ? p.skillRingCount : 12))
                : Math.max(3, Math.min(36, p.ringCount != null ? p.ringCount : 12));
            return stgUiT('attackBuild.stat.styleRing', { n });
        }
        const n = isSkill
            ? Math.max(1, Math.min(5, p.skillSingleCount != null ? p.skillSingleCount : 1))
            : Math.max(1, Math.min(5, p.singleCount != null ? p.singleCount : 1));
        return stgUiT('attackBuild.stat.styleSingle', { n });
    }

    function getTakenStgUpgrades(filterFn) {
        const out = [];
        for (let i = 0; i < STG_UPGRADE_POOL.length; i++) {
            const u = STG_UPGRADE_POOL[i];
            if (u && stgTakenUpgradeIds.has(u.id) && filterFn(u)) out.push(u);
        }
        return out;
    }

    /** 构筑图标悬浮层：原生 `title` 在带 overflow 的 .page / aside 内常不弹出，故用 fixed 层 */
    let stgAttackUpgradeTooltipRefs = null;
    let stgAttackUpgradeTipHideT = 0;

    function ensureStgAttackUpgradeTooltip() {
        if (stgAttackUpgradeTooltipRefs) return stgAttackUpgradeTooltipRefs;
        const wrap = document.createElement('div');
        wrap.id = 'stgAttackUpgradeTooltip';
        wrap.className = 'stg-upgrade-icon-tooltip hidden';
        wrap.setAttribute('role', 'tooltip');
        const nameEl = document.createElement('div');
        nameEl.className = 'stg-upgrade-icon-tooltip-name';
        const descEl = document.createElement('div');
        descEl.className = 'stg-upgrade-icon-tooltip-desc';
        wrap.appendChild(nameEl);
        wrap.appendChild(descEl);
        document.body.appendChild(wrap);
        stgAttackUpgradeTooltipRefs = { wrap, nameEl, descEl };
        return stgAttackUpgradeTooltipRefs;
    }

    function hideStgAttackUpgradeTooltip() {
        if (stgAttackUpgradeTipHideT) {
            clearTimeout(stgAttackUpgradeTipHideT);
            stgAttackUpgradeTipHideT = 0;
        }
        if (stgAttackUpgradeTooltipRefs && stgAttackUpgradeTooltipRefs.wrap) {
            const w = stgAttackUpgradeTooltipRefs.wrap;
            w.classList.add('hidden');
            // 下次显示前避免沿用旧坐标导致闪到左上角
            w.style.left = '';
            w.style.top = '';
            w.style.visibility = '';
            w.style.opacity = '';
        }
    }

    function scheduleHideStgAttackUpgradeTooltip() {
        if (stgAttackUpgradeTipHideT) clearTimeout(stgAttackUpgradeTipHideT);
        stgAttackUpgradeTipHideT = setTimeout(() => {
            stgAttackUpgradeTipHideT = 0;
            hideStgAttackUpgradeTooltip();
        }, 80);
    }

    function cancelScheduledHideStgAttackUpgradeTooltip() {
        if (stgAttackUpgradeTipHideT) {
            clearTimeout(stgAttackUpgradeTipHideT);
            stgAttackUpgradeTipHideT = 0;
        }
    }

    /**
     * @param {HTMLElement} iconEl
     * @param {{name?:string,desc?:string}} disp
     */
    function showStgAttackUpgradeTooltip(iconEl, disp) {
        cancelScheduledHideStgAttackUpgradeTooltip();
        const refs = ensureStgAttackUpgradeTooltip();
        refs.nameEl.textContent = disp.name != null ? String(disp.name) : '';
        if (disp.desc) {
            refs.descEl.textContent = String(disp.desc);
            refs.descEl.classList.remove('stg-upgrade-icon-tooltip-desc-empty');
        } else {
            refs.descEl.textContent = '';
            refs.descEl.classList.add('stg-upgrade-icon-tooltip-desc-empty');
        }
        const wrap = refs.wrap;
        wrap.classList.remove('hidden');
        // 同步测量并定位：禁止依赖 rAF，否则首帧会按 CSS 的 left:0;top:0 画在屏幕左上角
        wrap.style.visibility = 'hidden';
        wrap.style.opacity = '0';
        const rect = iconEl.getBoundingClientRect();
        let tw = wrap.offsetWidth;
        let th = wrap.offsetHeight;
        const margin = 10;
        const gap = 6;
        function applyPos() {
            // 默认：紧贴图标下沿，相对图标水平居中
            let left = rect.left + rect.width * 0.5 - tw * 0.5;
            let top = rect.bottom + gap;
            if (left + tw > window.innerWidth - margin) left = window.innerWidth - tw - margin;
            if (left < margin) left = margin;
            // 下方空间不足时再翻到图标上方（仍保持相对图标水平居中）
            if (top + th > window.innerHeight - margin) {
                top = rect.top - th - gap;
            }
            if (top < margin) top = margin;
            wrap.style.left = Math.round(left) + 'px';
            wrap.style.top = Math.round(top) + 'px';
            wrap.style.visibility = 'visible';
            wrap.style.opacity = '1';
        }
        if (tw < 2 || th < 2) {
            requestAnimationFrame(() => {
                tw = wrap.offsetWidth;
                th = wrap.offsetHeight;
                applyPos();
            });
        } else {
            applyPos();
        }
    }

    if (typeof window !== 'undefined' && !window.__stgAttackUpgradeTipGlobalBound) {
        window.__stgAttackUpgradeTipGlobalBound = true;
        window.addEventListener(
            'scroll',
            () => {
                hideStgAttackUpgradeTooltip();
            },
            true
        );
        window.addEventListener('resize', hideStgAttackUpgradeTooltip);
    }

    /**
     * 已选构筑：emoji 图标，鼠标悬浮用 fixed 层显示名称与效果（与界面语言一致）
     * @param {HTMLElement|null} el
     * @param {Array<{icon?:string,name?:string,desc?:string,id?:string}>} upgrades
     */
    function fillStgAttackUpgradeIcons(el, upgrades) {
        if (!el) return;
        el.innerHTML = '';
        if (!upgrades || !upgrades.length) {
            const s = document.createElement('span');
            s.className = 'stg-attack-upgrade-empty';
            s.textContent = '—';
            el.appendChild(s);
            return;
        }
        for (let i = 0; i < upgrades.length; i++) {
            const u = upgrades[i];
            const ic = document.createElement('span');
            ic.className = 'stg-attack-up-icon';
            ic.setAttribute('role', 'listitem');
            ic.setAttribute('tabindex', '0');
            ic.textContent = u.icon != null ? u.icon : '◇';
            const disp =
                window.StgUiI18n && typeof window.StgUiI18n.getUpgradeDisplay === 'function'
                    ? window.StgUiI18n.getUpgradeDisplay(u)
                    : { name: u.name, desc: u.desc };
            const tip = disp.desc ? disp.name + '\n' + disp.desc : disp.name;
            ic.setAttribute('title', tip);
            ic.setAttribute('aria-label', disp.name || '');
            ic.addEventListener('mouseenter', () => {
                showStgAttackUpgradeTooltip(ic, disp);
            });
            ic.addEventListener('mouseleave', () => {
                scheduleHideStgAttackUpgradeTooltip();
            });
            ic.addEventListener('focus', () => {
                showStgAttackUpgradeTooltip(ic, disp);
            });
            ic.addEventListener('blur', () => {
                hideStgAttackUpgradeTooltip();
            });
            el.appendChild(ic);
        }
    }

    /**
     * @param {HTMLUListElement|null} el
     * @param {string[]} lines
     * @param {boolean} isUpgradeList true=无条目时显示「暂无」，false=无 player 时显示「开始游戏后显示」
     */
    function fillStgAttackUl(el, lines, isUpgradeList) {
        if (!el) return;
        el.innerHTML = '';
        if (!lines.length) {
            const li = document.createElement('li');
            li.textContent = isUpgradeList ? stgUiT('attackBuild.emptyList') : stgUiT('attackBuild.placeholder');
            el.appendChild(li);
            return;
        }
        for (let i = 0; i < lines.length; i++) {
            const li = document.createElement('li');
            li.textContent = lines[i];
            el.appendChild(li);
        }
    }

    /**
     * 左侧「攻击构筑」：三种攻击各 4 项数值；已选构筑为图标，悬浮见效果。
     */
    function refreshStgAttackBuildPanel() {
        const title = document.getElementById('stgAttackBuildTitle');
        const hSpread = document.getElementById('stgAttackSpreadHeading');
        const hFocus = document.getElementById('stgAttackFocusHeading');
        const hUlt = document.getElementById('stgAttackUltHeading');
        const labSp = document.getElementById('stgAttackSpreadUpgLabel');
        const labFo = document.getElementById('stgAttackFocusUpgLabel');
        const labUl = document.getElementById('stgAttackUltUpgLabel');
        if (!title) return;

        title.textContent = stgUiT('attackBuild.title');
        if (hSpread) hSpread.textContent = stgUiT('attackBuild.spreadHeading');
        if (hFocus) hFocus.textContent = stgUiT('attackBuild.focusHeading');
        if (hUlt) hUlt.textContent = stgUiT('attackBuild.ultHeading');
        if (labSp) labSp.textContent = stgUiT('attackBuild.upgradesLabel');
        if (labFo) labFo.textContent = stgUiT('attackBuild.upgradesLabel');
        if (labUl) labUl.textContent = stgUiT('attackBuild.upgradesLabel');

        const ulSpreadStats = document.getElementById('stgAttackSpreadStats');
        const divSpreadUp = document.getElementById('stgAttackSpreadUpgrades');
        const ulFocusStats = document.getElementById('stgAttackFocusStats');
        const divFoUp = document.getElementById('stgAttackFocusUpgrades');
        const ulUltStats = document.getElementById('stgAttackUltStats');
        const divUltUp = document.getElementById('stgAttackUltUpgrades');

        if (!player) {
            fillStgAttackUl(ulSpreadStats, [], false);
            fillStgAttackUpgradeIcons(divSpreadUp, []);
            fillStgAttackUl(ulFocusStats, [], false);
            fillStgAttackUpgradeIcons(divFoUp, []);
            fillStgAttackUl(ulUltStats, [], false);
            fillStgAttackUpgradeIcons(divUltUp, []);
            return;
        }

        const crit = getStgCritChance();
        const critPct = (crit * 100).toFixed(1);
        const mainB = player.mainWeaponAttack != null ? player.mainWeaponAttack : 10;
        const focusB =
            player.focusWeaponAttack != null ? player.focusWeaponAttack : mainB;
        const skillB = player.skillWeaponAttack != null ? player.skillWeaponAttack : 10;
        const atkSpread = applyStgWeaponBaseAttackBonuses(mainB) * bonusDamage;
        const atkFocusNum = applyStgWeaponBaseAttackBonuses(focusB) * bonusDamage;
        const atkUltNum = applyStgWeaponBaseAttackBonuses(skillB) * bonusDamage;
        const ivMain = player.fireIntervalMs * bonusFireIntervalMult;
        const apsMain = ivMain > 0 ? (1000 / ivMain).toFixed(2) : '—';
        const bspMain = player.bulletSpeed * bonusBulletSpeed;

        const fourMain = [
            stgUiT('attackBuild.simple.atk', { v: atkSpread.toFixed(1) }),
            stgUiT('attackBuild.simple.aps', { v: apsMain }),
            stgUiT('attackBuild.simple.bulletSpd', { v: String(Math.round(bspMain)) }),
            stgUiT('attackBuild.simple.crit', { v: critPct })
        ];
        fillStgAttackUl(ulSpreadStats, fourMain, false);

        const ivFocus =
            (player.focusFireIntervalMs != null ? player.focusFireIntervalMs : player.fireIntervalMs) *
            bonusFireIntervalMult;
        const apsFocus = ivFocus > 0 ? (1000 / ivFocus).toFixed(2) : '—';
        const bspFocus =
            (player.focusBulletSpeed != null ? player.focusBulletSpeed : player.bulletSpeed) * bonusBulletSpeed;
        const fourFocus = [
            stgUiT('attackBuild.simple.atk', { v: atkFocusNum.toFixed(1) }),
            stgUiT('attackBuild.simple.aps', { v: apsFocus }),
            stgUiT('attackBuild.simple.bulletSpd', { v: String(Math.round(bspFocus)) }),
            stgUiT('attackBuild.simple.crit', { v: critPct })
        ];
        fillStgAttackUl(ulFocusStats, fourFocus, false);

        const siv = (player.skillFireIntervalMs != null ? player.skillFireIntervalMs : 120) * bonusFireIntervalMult;
        const apsSkill = siv > 0 ? (1000 / siv).toFixed(2) : '—';
        const ssb = (player.skillBulletSpeed != null ? player.skillBulletSpeed : player.bulletSpeed) * bonusBulletSpeed;
        const fourUlt = [
            stgUiT('attackBuild.simple.atk', { v: atkUltNum.toFixed(1) }),
            stgUiT('attackBuild.simple.aps', { v: apsSkill }),
            stgUiT('attackBuild.simple.bulletSpd', { v: String(Math.round(ssb)) }),
            stgUiT('attackBuild.simple.crit', { v: critPct })
        ];
        fillStgAttackUl(ulUltStats, fourUlt, false);

        fillStgAttackUpgradeIcons(
            divSpreadUp,
            getTakenStgUpgrades((u) => u.group === 'spread' || u.group === 'stat')
        );
        fillStgAttackUpgradeIcons(
            divFoUp,
            getTakenStgUpgrades((u) => {
                if (u.group !== 'focus_crystal' && u.group !== 'focus_rage') return false;
                if (stgFocusBranch === 'crystal') return u.group === 'focus_crystal';
                if (stgFocusBranch === 'rage') return u.group === 'focus_rage';
                return true;
            })
        );
        fillStgAttackUpgradeIcons(
            divUltUp,
            getTakenStgUpgrades((u) => {
                if (u.group !== 'ult_seal' && u.group !== 'ult_dream') return false;
                if (stgUltBranch === 'seal') return u.group === 'ult_seal';
                if (stgUltBranch === 'dream') return u.group === 'ult_dream';
                return true;
            })
        );
    }

    function updateHud() {
        const h = getHudElements();
        if (h.hp && player) {
            h.hp.textContent = 'HP ' + Math.max(0, Math.floor(player.hp)) + ' / ' + Math.floor(player.maxHp);
        }
        if (h.exp) {
            h.exp.textContent = stgUiT('hud.exp', {
                lv: level,
                cur: Math.floor(exp),
                next: expToNext
            });
        }
        const waves = waveData.waves || [];
        if (h.wave) {
            h.wave.textContent = stgUiT('hud.wave', {
                cur: waveIndex + 1,
                w: Math.max(1, waves.length),
                en: enemies.length,
                pending: getSpawnPendingCount()
            });
        }
        if (h.nextWave) {
            const sec = getStgNextWaveCountdownSec();
            if (sec === null) {
                h.nextWave.textContent = stgUiT('hud.nextWaveNone');
            } else if (sec <= 0) {
                h.nextWave.textContent = stgUiT('hud.nextWaveSoon');
            } else {
                h.nextWave.textContent = stgUiT('hud.nextWaveSec', { sec });
            }
        }
        if (h.time && runStartMs) {
            const sec = ((performance.now() - runStartMs) * 0.001) | 0;
            h.time.textContent = stgUiT('hud.time', { sec });
        }
        refreshStgAttackBuildPanel();
    }

    /** 切换语言时刷新 HUD、三选一卡、结算层（若打开） */
    function refreshStgUiLanguageFromI18n() {
        updateHud();
        const h = getHudElements();
        if (h.upgrade && h.upgradeCards && !h.upgrade.classList.contains('hidden') && upgradeChoices.length) {
            h.upgradeCards.innerHTML = '';
            upgradeChoices.forEach((u) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'stg-upgrade-card';
                const disp =
                    window.StgUiI18n && typeof window.StgUiI18n.getUpgradeDisplay === 'function'
                        ? window.StgUiI18n.getUpgradeDisplay(u)
                        : { name: u.name, desc: u.desc };
                btn.innerHTML = `<span class="stg-up-title">${disp.name}</span><span class="stg-up-desc">${disp.desc}</span>`;
                btn.addEventListener('click', () => {
                    applyStgUpgradePick(u);
                    u.apply(player);
                    h.upgrade.classList.add('hidden');
                    phase = 'playing';
                    lastFrameTime = performance.now();
                    refreshStgAttackBuildPanel();
                });
                h.upgradeCards.appendChild(btn);
            });
        }
        if (lastShowResultWin !== null && h.result && !h.result.classList.contains('hidden')) {
            showResult(lastShowResultWin);
        }
    }

    /**
     * 绘制敌弹：圆形或三角形（三角尖端朝向速度方向，与碰撞半径一致）
     */
    function drawStgEnemyBulletFill(b) {
        if (!ctx) return;
        const r = b.radius != null ? b.radius : 5;
        if (b.shape !== 'triangle') {
            ctx.beginPath();
            ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
            ctx.fill();
            return;
        }
        const spd = Math.hypot(b.vx, b.vy);
        const ang = spd > 0.01 ? Math.atan2(b.vy, b.vx) : Math.PI * 0.5;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(ang + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.2);
        ctx.lineTo(-r, r * 0.85);
        ctx.lineTo(r, r * 0.85);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function draw() {
        if (!ctx || !canvas) return;
        const cw = canvas.width;
        const ch = canvas.height;
        ctx.fillStyle = '#1a1f2e';
        ctx.fillRect(0, 0, cw, ch);

        /** 竖向棋盘格 */
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (let c = 0; c <= GRID_COLS; c++) {
            ctx.beginPath();
            ctx.moveTo(c * cellSize, 0);
            ctx.lineTo(c * cellSize, ch);
            ctx.stroke();
        }
        for (let r = 0; r <= GRID_ROWS; r++) {
            ctx.beginPath();
            ctx.moveTo(0, r * cellSize);
            ctx.lineTo(cw, r * cellSize);
            ctx.stroke();
        }

        /** 敌人（圆盘 + 朝向下的三角，不依赖 emoji 字体） */
        enemies.forEach((e) => {
            if (!e.alive) return;
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.beginPath();
            ctx.moveTo(e.x - e.radius * 0.5, e.y - e.radius * 0.35);
            ctx.lineTo(e.x + e.radius * 0.5, e.y - e.radius * 0.35);
            ctx.lineTo(e.x, e.y + e.radius * 0.65);
            ctx.closePath();
            ctx.fill();
            ctx.font = `${Math.max(11, Math.floor(e.radius * 0.9))}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText(e.icon, e.x, e.y - 1);
        });

        /** 子弹（外观由编辑器「子弹外观」决定） */
        playerBullets.forEach((b) => {
            if (!b.alive) return;
            drawStgPlayerBullet(ctx, b);
        });
        /** 直线激光（粗线段 + 高亮芯） */
        enemyLasers.forEach((L) => {
            if (!L.alive) return;
            ctx.lineCap = 'round';
            ctx.strokeStyle = 'rgba(255, 60, 100, 0.45)';
            ctx.lineWidth = L.width + 4;
            ctx.beginPath();
            ctx.moveTo(L.x1, L.y1);
            ctx.lineTo(L.x2, L.y2);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255, 180, 200, 0.92)';
            ctx.lineWidth = Math.max(3, L.width * 0.4);
            ctx.beginPath();
            ctx.moveTo(L.x1, L.y1);
            ctx.lineTo(L.x2, L.y2);
            ctx.stroke();
        });
        ctx.fillStyle = '#e74c3c';
        enemyBullets.forEach((b) => {
            if (!b.alive) return;
            drawStgEnemyBulletFill(b);
        });

        /** P点 */
        ctx.fillStyle = '#2ecc71';
        pickups.forEach((p) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('P', p.x, p.y + 4);
            ctx.fillStyle = '#2ecc71';
        });

        /** 玩家机体：外圈 + 朝上的三角（不依赖 emoji 也能辨认） */
        if (player) {
            const px = player.x;
            const py = player.y;
            const r = player.radius;
            ctx.shadowColor = 'rgba(52, 152, 219, 0.65)';
            ctx.shadowBlur = 12;
            ctx.fillStyle = '#2980b9';
            ctx.beginPath();
            ctx.arc(px, py, r + 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#3498db';
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ecf0f1';
            ctx.beginPath();
            ctx.moveTo(px, py - r * 0.95);
            ctx.lineTo(px - r * 0.75, py + r * 0.55);
            ctx.lineTo(px + r * 0.75, py + r * 0.55);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.25)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.font = `${Math.max(12, Math.floor(r))}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#1a5276';
            ctx.fillText('🚀', px, py + r * 0.08);

            /** 慢速模式：画出与敌弹判定一致的受击圆（比机体略大），便于玩家对齐判定点 */
            const focus = keys.ShiftLeft || keys.ShiftRight;
            if (phase === 'playing' && focus) {
                const hitR = getStgPlayerHitRadius();
                ctx.beginPath();
                ctx.arc(px, py, hitR, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255, 65, 85, 0.92)';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(255, 40, 60, 0.95)';
                ctx.beginPath();
                ctx.arc(px, py, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        /** 受击粒子（在机体之上） */
        stgPlayerFxParticles.forEach((fp) => {
            const t = fp.ageMs / fp.maxMs;
            const alpha = (1 - t) * 0.95;
            if (fp.kind === 0) {
                ctx.fillStyle = `rgba(230,55,70,${alpha})`;
            } else {
                ctx.fillStyle = `rgba(255,210,90,${alpha})`;
            }
            ctx.beginPath();
            ctx.arc(fp.x, fp.y, fp.r, 0, Math.PI * 2);
            ctx.fill();
        });

        /** 受击全画布淡红闪（不挡 UI 文字过多） */
        if (stgPlayerHitFlashMs > 0 && phase === 'playing') {
            const k = Math.min(1, stgPlayerHitFlashMs / 160);
            ctx.fillStyle = `rgba(255, 35, 55, ${0.06 + k * 0.16})`;
            ctx.fillRect(0, 0, cw, ch);
        }

        if (phase === 'title') {
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.fillRect(0, 0, cw, ch);
            ctx.fillStyle = '#ecf0f1';
            ctx.font = 'bold 22px Microsoft YaHei,sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(stgUiT('title.canvasMain') || 'STG 纵版射击', cw / 2, ch / 2 - 20);
            ctx.font = '15px Microsoft YaHei,sans-serif';
            ctx.fillText(stgUiT('title.canvasSub') || '点击「开始游戏」', cw / 2, ch / 2 + 20);
        }
    }

    function onKeyDown(e) {
        if (keys.hasOwnProperty(e.code)) {
            keys[e.code] = true;
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
                e.preventDefault();
            }
        }
        if (e.code === 'KeyZ') {
            keys.KeyZ = true;
            e.preventDefault();
        }
        if (e.code === 'KeyX') {
            keys.KeyX = true;
            e.preventDefault();
        }
    }

    function onKeyUp(e) {
        if (keys.hasOwnProperty(e.code)) keys[e.code] = false;
        if (e.code === 'KeyZ') keys.KeyZ = false;
        if (e.code === 'KeyX') keys.KeyX = false;
    }

    /** 失焦时浏览器未必派发 keyup，避免 Shift 卡死为「一直慢速」 */
    function onWindowBlur() {
        keys.ShiftLeft = false;
        keys.ShiftRight = false;
        keys.ArrowUp = false;
        keys.ArrowDown = false;
        keys.ArrowLeft = false;
        keys.ArrowRight = false;
        keys.KeyZ = false;
        keys.KeyX = false;
    }

    function resizeCanvas() {
        if (!canvas) return;
        /** 顶栏改紧凑后预留高度略减，把像素让给棋盘；仍留足 HUD/边距 */
        const maxH = Math.min(window.innerHeight - 168, 720);
        cellSize = Math.floor(maxH / GRID_ROWS);
        if (cellSize < 32) cellSize = 32;
        canvas.width = GRID_COLS * cellSize;
        canvas.height = GRID_ROWS * cellSize;
        if (player) {
            player.x = Math.min(canvas.width - player.radius, Math.max(player.radius, player.x));
            player.y = Math.min(canvas.height - player.radius, Math.max(player.radius, player.y));
        }
        console.log('[STG] 画布尺寸', canvas.width, 'x', canvas.height, 'cell', cellSize);
    }

    const StgMode = {
        /**
         * @param {{gameState:object, playerStats:object}} opt
         */
        init(opt) {
            gameStateRef = opt && opt.gameState;
            playerStatsRef = opt && opt.playerStats;
            canvas = document.getElementById('stgCanvas');
            if (!canvas) {
                console.warn('[STG] 未找到 #stgCanvas');
                return;
            }
            ctx = canvas.getContext('2d');
            resizeCanvas();
            /** 供波次阵型编辑器等读取，与局内棋盘格数一致（仅 cellSize 随窗口变） */
            window.__STG_GRID__ = { cols: GRID_COLS, rows: GRID_ROWS };
            /** 窗口拖拽时连续 resize 会微调 cellSize，画布变宽变窄 + flex 居中 = 棋盘「左右滑」；防抖合并重算 */
            let resizeDebounce = 0;
            window.addEventListener('resize', () => {
                clearTimeout(resizeDebounce);
                resizeDebounce = setTimeout(() => {
                    resizeCanvas();
                    console.log('[STG] 窗口尺寸稳定后已重算画布');
                }, 120);
            });
            document.addEventListener('keydown', onKeyDown);
            document.addEventListener('keyup', onKeyUp);
            window.addEventListener('blur', onWindowBlur);

            const btnStart = document.getElementById('stgStartBtn');
            const btnRestart = document.getElementById('stgRestartBtn');
            const btnResultRestart = document.getElementById('stgResultRestartBtn');
            /** 死亡/通关全屏层会盖住顶栏，弹窗内按钮与顶栏共用同一套重开逻辑 */
            function onRestartFromUi() {
                hideResult();
                startGame();
            }
            if (btnStart) {
                btnStart.addEventListener('click', () => {
                    startGame();
                    btnStart.classList.add('hidden');
                    if (btnRestart) btnRestart.classList.remove('hidden');
                });
            }
            if (btnRestart) {
                btnRestart.addEventListener('click', onRestartFromUi);
            }
            if (btnResultRestart) {
                btnResultRestart.addEventListener('click', onRestartFromUi);
            }

            phase = 'title';
            isRunning = true;
            isPaused = false;
            lastFrameTime = performance.now();
            loop();
            refreshStgAttackBuildPanel();
            console.log('[STG] StgMode 初始化完成');
        },

        pause() {
            isPaused = true;
        },

        resume() {
            isPaused = false;
            lastFrameTime = performance.now();
        },

        /** 从塔防返回时若未开过局，保持标题绘制 */
        isStgActive() {
            return !!isRunning && !isPaused;
        },

        /** 玩家属性编辑器保存后立即同步当前局内自机（无局或标题态时无操作） */
        applyPlayerEditorConfig() {
            applyStgPlayerConfigToRuntime();
            refreshStgAttackBuildPanel();
        },

        /** 场景道具编辑器保存后，新掉落的 P 点使用新轨迹 */
        applyScenePropsEditorConfig() {
            invalidateScenePropsCache();
        },

        /** 棋盘列/行数（与阵型编辑器一致） */
        getGridDimensions() {
            return { cols: GRID_COLS, rows: GRID_ROWS };
        },

        /** 与 StgUiI18n.applyAll 联动：切换中/英后刷新 HUD、三选一、结算文案 */
        refreshUiLanguage() {
            refreshStgUiLanguageFromI18n();
        },

        /** 刷新左侧攻击构筑面板（语言切换或外部可调用） */
        refreshAttackBuildPanel() {
            refreshStgAttackBuildPanel();
        }
    };

    window.StgMode = StgMode;
})();

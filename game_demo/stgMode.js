/**
 * STG 纵版射击模式（棋盘格竖屏、玩家移动 + Z 连射 + 波次 + P 点经验 + 波次「升级时刻」四选一强化）
 * 共用：波次 localStorage、怪物编辑器存档、英雄数值（物品池 + gameState.inventory 中英雄数量）
 */
(function () {
    'use strict';

    /** 棋盘格数：横向/纵向较早期版本各多 3 格，战场更宽更长 */
    /** 主战场格数：四边各再扩 2 格 → 12+4 × 17+4 */
    const GRID_COLS = 16;
    const GRID_ROWS = 21;
    /** 与棋盘思路一致：竖向长条战场 */
    const WAVE_STORAGE_KEY = 'tower_defense_wave_config';
    const MONSTER_STORAGE_KEY = 'tower_defense_enemy_types';
    /** 与 BOSS 编辑器 bossEditorPanel.js 一致；波次格子 token 为 __boss_<id> */
    const STG_BOSS_CONFIG_KEY = 'stg_boss_configs';
    /** 与 waveConfig.json 类似：随项目放置 enemyTypesBundled.json，无 localStorage 时仍能对齐怪物数值；有 localStorage 时与其浅合并（LS 覆盖同名种类） */
    let stgBundledEnemyTypesFromFile = null;
    let stgBundledEnemyTypesFetchPromise = null;

    function ensureBundledEnemyTypesLoaded() {
        if (stgBundledEnemyTypesFetchPromise) return stgBundledEnemyTypesFetchPromise;
        stgBundledEnemyTypesFetchPromise = fetch('enemyTypesBundled.json?' + Date.now())
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (data && typeof data === 'object') {
                    stgBundledEnemyTypesFromFile = data;
                    console.log('[STG] 已加载 enemyTypesBundled.json（与怪物编辑器 localStorage 合并或作默认）');
                }
                return null;
            })
            .catch(() => null);
        return stgBundledEnemyTypesFetchPromise;
    }
    /**
     * 敌弹命中：中心距 < 机体半径 + 此余量即扣血（与东方系「判定点」思路一致）
     * 绘制慢速模式下的受击圈时须用同一数值，避免「圈与判定不一致」
     */
    const STG_PLAYER_HIT_EXTRA = 10;
    /** 与 stgPlayerEditorPanel 共用：STG 自机移速、判定点半径存档 */
    const STG_PLAYER_CONFIG_KEY = 'stg_player_config';
    /** 与 stgScenePropsEditorPanel 共用：P 点轨迹等场景道具 */
    const STG_SCENE_PROPS_KEY = 'stg_scene_props_config';
    /** 局内构筑道具预设：勾选保存到 localStorage，每局 resetRun 时应用 */
    const STG_BUILD_INV_KEY = 'stg_build_inventory_granted';
    /** 穿透弹需避免对同一敌人重复结算：每实例唯一 id */
    let stgEnemyInstanceSeq = 0;
    /**
     * 敌弹贴图路径候选（相对当前页面 URL 解析）：
     * 1) 与 index 同目录的 art_assets（适合静态站根目录=game_demo）
     * 2) 上一级 art_assets（适合仓库根 STGproj 起服、或本机直接打开子路径）
     * 仅填文件名；禁止用绝对盘符路径。
     * 附带 query 版本号，避免浏览器对同一路径强缓存导致「换了图仍显示旧图」。
     */
    let stgEnemyBulletSpriteCacheBust = Date.now();

    function getStgEnemyBulletSpriteUrlCandidates(key) {
        const safe = sanitizeStgEnemyBulletSpriteName(key);
        if (!safe) return [];
        const relParts = ['art_assets/bullets/', '../art_assets/bullets/'];
        const q = '?v=' + encodeURIComponent(String(stgEnemyBulletSpriteCacheBust));
        const out = [];
        for (let i = 0; i < relParts.length; i++) {
            try {
                out.push(new URL(relParts[i] + encodeURIComponent(safe) + q, window.location.href).href);
            } catch (e) {
                /* 忽略 */
            }
        }
        return out;
    }

    /** @type {Record<string, { img: HTMLImageElement; failed: boolean; urlIdx: number }>} */
    let stgEnemyBulletSpriteCache = {};

    /** 贴图编辑器「全局暂不使用敌弹位图」：仅矢量绘制（忽略子弹上的 sprite 与默认 jpg） */
    let stgEnemyBulletTextureGloballyDisabled = false;
    const STG_ENEMY_BULLET_TEXTURE_DISABLED_KEY = 'stg_enemy_bullet_texture_disabled';

    function loadEnemyBulletTextureGloballyDisabledFromStorage() {
        try {
            stgEnemyBulletTextureGloballyDisabled = localStorage.getItem(STG_ENEMY_BULLET_TEXTURE_DISABLED_KEY) === '1';
        } catch (e) {
            stgEnemyBulletTextureGloballyDisabled = false;
        }
    }

    function sanitizeStgEnemyBulletSpriteName(s) {
        const t = String(s).trim();
        if (!t) return '';
        const base = t.replace(/^.*[/\\]/, '');
        return /^[\w.-]+$/i.test(base) ? base : '';
    }

    /**
     * 异步加载并缓存；首帧可能尚未 decode，绘制时未就绪则回退矢量圆
     */
    function getStgEnemyBulletSpriteImage(filename) {
        const key = sanitizeStgEnemyBulletSpriteName(filename);
        if (!key) return null;
        let entry = stgEnemyBulletSpriteCache[key];
        if (entry && entry.failed) return null;
        if (!entry) {
            const urls = getStgEnemyBulletSpriteUrlCandidates(key);
            if (urls.length === 0) {
                stgEnemyBulletSpriteCache[key] = { img: new Image(), failed: true, urlIdx: 0 };
                return null;
            }
            const img = new Image();
            entry = { img, failed: false, urlIdx: 0 };
            stgEnemyBulletSpriteCache[key] = entry;
            img.onload = () => {
                if (typeof img.decode === 'function') {
                    img.decode().catch(() => {});
                }
                console.log('[STG] 敌弹贴图已加载', key, urls[entry.urlIdx] || '');
            };
            img.onerror = () => {
                entry.urlIdx++;
                if (entry.urlIdx >= urls.length) {
                    entry.failed = true;
                    console.warn('[STG] 敌弹贴图全部路径加载失败（请确认文件在 art_assets/bullets 且静态服务根目录含上级目录，或把 art_assets 拷到 game_demo 下）', key, urls);
                    return;
                }
                img.src = urls[entry.urlIdx];
            };
            img.src = urls[0];
        }
        const im = entry.img;
        /** 部分环境下 decode 完成前 naturalWidth 仍为 0，仍应允许 drawImage 尝试 */
        return im.complete ? im : null;
    }

    /** 根据当前怪物种类表预加载可能用到的敌弹贴图 */
    function preloadStgBossBulletPoolSpritesFromStorage() {
        try {
            const raw = localStorage.getItem('stg_boss_bullet_texture_pool');
            const arr = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(arr)) return;
            arr.forEach((fn) => {
                if (fn) getStgEnemyBulletSpriteImage(String(fn));
            });
        } catch (e) {
            /* ignore */
        }
    }

    function preloadStgEnemyBulletSpritesFromTypes() {
        const map = getEnemyTypeMap();
        Object.keys(map).forEach((id) => {
            const fn = map[id] && map[id].stgEnemyBulletSprite;
            if (fn) getStgEnemyBulletSpriteImage(String(fn));
        });
        preloadStgBossBulletPoolSpritesFromStorage();
    }

    /** 新局或编辑器保存后：更新 URL 版本、清空 JS 内 Image 缓存并预加载（避免浏览器仍用旧位图） */
    function clearStgEnemyBulletSpriteCacheAndBumpBust() {
        stgEnemyBulletSpriteCacheBust = Date.now();
        stgEnemyBulletSpriteCache = {};
    }

    /** 贴图/怪物编辑器保存后：强制按当前种类表重新拉取位图 */
    function reloadEnemyBulletSpritesFromStorage() {
        clearStgEnemyBulletSpriteCacheAndBumpBust();
        preloadStgEnemyBulletSpritesFromTypes();
    }
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

    /** 场景道具默认：P 点与充能点可分别配置轨迹/速率/视觉；旧存档无 c* 时从 p* 镜像 */
    function getStgScenePropsDefaults() {
        return {
            pTrajectory: 'straight_down',
            pStraightVy: 80,
            pArcUpSpeed: 120,
            pArcPeakPx: 55,
            pArcDownSpeed: 85,
            pArcUpSpeedMode: 'uniform',
            pArcDownSpeedMode: 'uniform',
            /** P 点外观：circle | square | diamond；大小为外接尺寸（像素） */
            pShape: 'circle',
            pSizePx: 20,
            cTrajectory: 'straight_down',
            cStraightVy: 80,
            cArcUpSpeed: 120,
            cArcPeakPx: 55,
            cArcDownSpeed: 85,
            cArcUpSpeedMode: 'uniform',
            cArcDownSpeedMode: 'uniform',
            cShape: 'square',
            cSizePx: 22,
            chargePointValue: 45,
            /** 已触发擦弹的敌弹填充透明度（场景道具） */
            grazedBulletAlpha: 0.38
        };
    }

    /**
     * 合并本地存档与默认；无 c* 键的旧档：充能点轨迹参数跟随当时已保存的 p*（手感不变）
     */
    function normalizeScenePropsConfig(raw) {
        const base = getStgScenePropsDefaults();
        const o = raw && typeof raw === 'object' ? raw : {};
        const m = { ...base, ...o };
        if (!('cTrajectory' in o)) {
            m.cTrajectory = m.pTrajectory;
            m.cStraightVy = m.pStraightVy;
            m.cArcUpSpeed = m.pArcUpSpeed;
            m.cArcPeakPx = m.pArcPeakPx;
            m.cArcDownSpeed = m.pArcDownSpeed;
            m.cArcUpSpeedMode = m.pArcUpSpeedMode;
            m.cArcDownSpeedMode = m.pArcDownSpeedMode;
        }
        if (!('pShape' in o)) m.pShape = base.pShape;
        if (!('pSizePx' in o)) m.pSizePx = base.pSizePx;
        if (!('cShape' in o)) m.cShape = base.cShape;
        if (!('cSizePx' in o)) m.cSizePx = base.cSizePx;
        const shp = (v) => (v === 'square' || v === 'diamond' ? v : 'circle');
        m.pShape = shp(m.pShape);
        m.cShape = m.cShape === 'circle' || m.cShape === 'square' || m.cShape === 'diamond' ? m.cShape : 'square';
        m.pSizePx = Math.max(10, Math.min(48, Number(m.pSizePx) || base.pSizePx));
        m.cSizePx = Math.max(10, Math.min(48, Number(m.cSizePx) || base.cSizePx));
        const gba = Number(m.grazedBulletAlpha);
        m.grazedBulletAlpha = Number.isFinite(gba) ? Math.max(0.05, Math.min(0.98, gba)) : base.grazedBulletAlpha;
        return m;
    }

    function loadStgScenePropsConfigRaw() {
        try {
            const raw = localStorage.getItem(STG_SCENE_PROPS_KEY);
            if (!raw) return normalizeScenePropsConfig(null);
            const o = JSON.parse(raw);
            if (!o || typeof o !== 'object') return normalizeScenePropsConfig(null);
            return normalizeScenePropsConfig(o);
        } catch (e) {
            return normalizeScenePropsConfig(null);
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

    /** 场景道具：上抛曲线模式（兼容旧存档 curve → ease_in_out） */
    function normalizeArcUpSpeedMode(m) {
        if (m === 'ease_in' || m === 'ease_out' || m === 'ease_in_out') return m;
        if (m === 'curve') return 'ease_in_out';
        return 'uniform';
    }

    /** 场景道具：下落曲线模式（兼容旧存档 curve → ease_in，即先慢后快） */
    function normalizeArcDownSpeedMode(m) {
        if (m === 'ease_in' || m === 'ease_out') return m;
        if (m === 'curve') return 'ease_in';
        return 'uniform';
    }

    /** 弧顶结束：根据下落模式初始化竖直速度状态 */
    function stgPickupOnArcUpFinished(p) {
        p.arcUpDone = true;
        p.y = p.peakY;
        const dm = normalizeArcDownSpeedMode(p.arcDownMode);
        if (dm === 'ease_out') {
            /** 先快后慢：初速高于目标，再向目标回落 */
            p.fallVCurrent = p.fallVy * 1.42;
        } else if (dm === 'ease_in') {
            p.fallVCurrent = 0;
        } else {
            delete p.fallVCurrent;
        }
    }

    /**
     * 按前缀 p / c 从场景配置生成掉落运动与碰撞/绘制参数（不写入 exp / charge）
     * @param {'p'|'c'} prefix
     */
    function buildPickupMotionFromScene(ex, ey, prefix) {
        const cfg = getScenePropsConfig();
        const trajKey = prefix + 'Trajectory';
        const traj = cfg[trajKey] === 'arc_up_down' ? 'arc_up_down' : 'straight_down';
        const sizePx = Math.max(10, Math.min(48, Number(cfg[prefix + 'SizePx']) || (prefix === 'p' ? 20 : 22)));
        let shape = cfg[prefix + 'Shape'];
        if (prefix === 'p') {
            shape = shape === 'square' || shape === 'diamond' ? shape : 'circle';
        } else {
            shape = shape === 'circle' || shape === 'square' || shape === 'diamond' ? shape : 'square';
        }
        const pickupRadius = sizePx * 0.5;

        if (traj === 'arc_up_down') {
            const peakPx = Math.max(10, Math.min(220, Number(cfg[prefix + 'ArcPeakPx']) || 55));
            const up = Math.max(40, Math.min(400, Number(cfg[prefix + 'ArcUpSpeed']) || 120));
            const fall = Math.max(40, Math.min(600, Number(cfg[prefix + 'ArcDownSpeed']) || 85));
            const upMode = normalizeArcUpSpeedMode(cfg[prefix + 'ArcUpSpeedMode']);
            const downMode = normalizeArcDownSpeedMode(cfg[prefix + 'ArcDownSpeedMode']);
            const arcUpDurSec = peakPx / up;
            return {
                x: ex,
                y: ey,
                vy: -up,
                mode: 'arc',
                peakY: ey - peakPx,
                fallVy: fall,
                arcStartY: ey,
                arcUpMode: upMode,
                arcDownMode: downMode,
                arcUpT: 0,
                arcUpDurSec: Math.max(0.04, arcUpDurSec),
                arcUpDone: false,
                fallVCurrent: 0,
                pickupRadius,
                shape,
                sizePx
            };
        }
        const vy = Math.max(20, Math.min(400, Number(cfg[prefix + 'StraightVy']) || 80));
        return { x: ex, y: ey, vy, mode: 'straight', pickupRadius, shape, sizePx };
    }

    /**
     * 击杀掉落 P 点：直线向下 或 先上抛至弧顶再下落（参数见场景道具「P 点」）
     */
    function createPickupAtKill(ex, ey, pExp) {
        const o = buildPickupMotionFromScene(ex, ey, 'p');
        o.exp = pExp;
        return o;
    }

    /**
     * 充能点掉落：独立轨迹与外观（场景道具「充能点」）；拾取只增加大招蓄能条
     * @param {number} chargeValue 场景道具 chargePointValue × 怪物倍率后的整数值
     */
    function createPickupChargeAtKill(ex, ey, chargeValue) {
        const o = buildPickupMotionFromScene(ex, ey, 'c');
        o.pickupKind = 'charge';
        o.chargeValue = Math.max(1, Math.floor(chargeValue));
        o.exp = 0;
        return o;
    }

    /** 种类勾选「击杀掉落充能点」时追加掉落（子弹击杀 / 大招 DoT / 阴阳玉等路径共用） */
    function pushStgChargePickupOnEnemyKillIfConfigured(e) {
        if (!e || !e.stgDropChargePickup) return;
        const scfg = getScenePropsConfig();
        const baseCh = Math.max(5, Math.min(500, Number(scfg.chargePointValue) || 45));
        const mult = e.stgChargeDropMult != null && Number.isFinite(e.stgChargeDropMult) ? e.stgChargeDropMult : 1;
        const amt = Math.max(1, Math.floor(baseCh * mult));
        pickups.push(createPickupChargeAtKill(e.x, e.y, amt));
        console.log('[STG] 击杀敌人，额外充能点', amt);
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
     * 玩家编辑器中的「升级所需经验」三参数；缺省与旧版 floor(100 + (level-1)*40) 一致。
     */
    function getStgExpFormulaParams() {
        const cfg = loadStgPlayerConfig();
        const defB = 100;
        const defL = 40;
        const defA = 0;
        if (!cfg) {
            return { expBase: defB, expLinearPerLevel: defL, expAccelPerLevelSq: defA };
        }
        const b =
            cfg.expBase != null && Number.isFinite(Number(cfg.expBase))
                ? Math.max(1, Math.min(500000, Math.floor(Number(cfg.expBase))))
                : defB;
        const lin =
            cfg.expLinearPerLevel != null && Number.isFinite(Number(cfg.expLinearPerLevel))
                ? Math.max(0, Math.min(50000, Math.floor(Number(cfg.expLinearPerLevel))))
                : defL;
        const acc =
            cfg.expAccelPerLevelSq != null && Number.isFinite(Number(cfg.expAccelPerLevelSq))
                ? Math.max(0, Math.min(5000, Number(cfg.expAccelPerLevelSq)))
                : defA;
        return { expBase: b, expLinearPerLevel: lin, expAccelPerLevelSq: acc };
    }

    /**
     * 从当前等级升到下一级所需经验：floor(基础 + (L-1)*线性 + (L-1)²*加速)。
     * L 为当前等级（与旧逻辑一致：Lv1 时槽长为 expBase）。
     */
    function computeExpToNextForLevel(level) {
        const L = Math.max(1, Math.floor(level));
        const c = getStgExpFormulaParams();
        const t = L - 1;
        const n = c.expBase + t * c.expLinearPerLevel + c.expAccelPerLevelSq * t * t;
        return Math.max(1, Math.floor(n));
    }

    /** 编辑器应用后刷新局内升级条长度（不改变 level/exp，仅重算 expToNext） */
    function applyStgExpBarFromEditorConfig() {
        expToNext = computeExpToNextForLevel(level);
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

    /** 自机生命：整格数 ×2 = 半格单位（敌弹只扣 1 或 2 个半格） */
    function getStgPlayerMaxLifeHalfUnits() {
        if (!player) return 12;
        const c = player.stgLifeCellsMax != null ? player.stgLifeCellsMax | 0 : 6;
        return Math.max(2, Math.min(60, c * 2));
    }

    function syncStgPlayerLifeHpMirror() {
        if (!player) return;
        const maxH = getStgPlayerMaxLifeHalfUnits();
        let rem = player.stgLifeHalfUnitsRemain != null ? player.stgLifeHalfUnitsRemain | 0 : maxH;
        rem = Math.max(0, Math.min(maxH, rem));
        player.stgLifeHalfUnitsRemain = rem;
        player.maxHp = maxH;
        player.hp = rem;
    }

    /**
     * 按敌机攻击力决定弹幕扣几「半格」：attack 小于 2 为半格，否则为 1 整格（与内置 normal/fast vs tank 一致）。
     */
    function resolveStgBulletLifeDamageHalvesFromEnemy(e) {
        if (!e) return 1;
        const atk = e.attack != null ? Number(e.attack) : 1;
        return Number.isFinite(atk) && atk >= 2 ? 2 : 1;
    }

    /** 受伤无敌窗口内：不受敌弹与激光伤害；试做型封魔阵持续期间亦无敌（与《角色设计》一致） */
    function isStgPlayerInvulnerable(nowMs) {
        if (player && stgSealField && nowMs < stgSealField.endMs) return true;
        return !!(player && player._invulnUntil != null && nowMs < player._invulnUntil);
    }

    function getStgPlayerHitInvulnMsFromPlayer() {
        if (!player) return 2000;
        const v = player.hitInvulnMs;
        if (v != null && Number.isFinite(Number(v))) return Math.max(0, Math.min(20000, Number(v)));
        return 2000;
    }

    function getStgPlayerHitBulletClearMsFromPlayer() {
        if (!player) return 1200;
        const v = player.hitBulletClearMs;
        if (v != null && Number.isFinite(Number(v))) return Math.max(0, Math.min(20000, Number(v)));
        return 1200;
    }

    /** 受伤拉回：在出生点停滞的毫秒数；0=不拉回、不禁输入（与玩家编辑器一致） */
    function getStgPlayerHitSpawnHoldMsFromPlayer() {
        if (!player) return 1000;
        const v = player.hitSpawnHoldMs;
        if (v != null && Number.isFinite(Number(v))) return Math.max(0, Math.min(30000, Number(v)));
        return 1000;
    }

    /**
     * 将自机对齐到「开局出生点」（画布中下、与 buildPlayerFromHero 一致）；无画布时跳过。
     */
    function snapStgPlayerToSpawn() {
        if (!player || !canvas) return;
        const cw = canvas.width;
        const ch = canvas.height;
        const sx = player._stgSpawnX != null ? player._stgSpawnX : cw * 0.5;
        const sy = player._stgSpawnY != null ? player._stgSpawnY : ch - cellSize * 1.8;
        const pr = player.radius != null ? player.radius : 14;
        player.x = Math.max(pr, Math.min(cw - pr, sx));
        player.y = Math.max(pr, Math.min(ch - pr, sy));
    }

    /**
     * 受伤后：立即清空敌弹，并按编辑器启动无敌与「持续消弹」计时。
     * 可选：拉回出生点并停滞若干毫秒（见 hitSpawnHoldMs）。
     * 持续消弹时段内每帧在敌机开火之后再次清空数组，避免新弹停留。
     */
    function applyStgPlayerHitResponse(nowMs) {
        if (!player) return;
        const invMs = getStgPlayerHitInvulnMsFromPlayer();
        if (invMs > 0) {
            player._invulnUntil = nowMs + invMs;
        } else {
            player._invulnUntil = null;
        }
        const clrMs = getStgPlayerHitBulletClearMsFromPlayer();
        enemyBullets.length = 0;
        if (clrMs > 0) {
            player._bulletClearUntil = nowMs + clrMs;
        } else {
            player._bulletClearUntil = null;
        }
        const holdMs = getStgPlayerHitSpawnHoldMsFromPlayer();
        if (holdMs > 0) {
            snapStgPlayerToSpawn();
            player._stgHitHoldUntil = nowMs + holdMs;
        } else {
            player._stgHitHoldUntil = null;
        }
    }

    /** 擦弹参数默认值（与玩家编辑器一致；未存档时用内置默认） */
    function getStgGrazeRuntimeParams() {
        if (!player) {
            return {
                enabled: false,
                extra: 32,
                minMove: 0.9,
                gain: 6,
                /** 单颗敌弹重复擦弹冷却（毫秒） */
                perBulletCdMs: 180,
                orbR: 5,
                orbSpd: 480,
                glow: 0.65,
                /** 外椭圆：水平半轴倍率（左右宽） */
                ellipseHorizMult: 1.42,
                /** 外椭圆：垂直半轴倍率（上下窄） */
                ellipseVertMult: 0.76,
                /** 慢速时机体 globalAlpha */
                focusShipAlpha: 0.42
            };
        }
        const p = player;
        return {
            enabled: p.grazeEnabled !== false,
            extra: p.grazeExtraPx != null ? Math.max(0, Math.min(160, p.grazeExtraPx)) : 32,
            minMove: p.grazeMinMovePx != null ? Math.max(0.05, Math.min(30, p.grazeMinMovePx)) : 0.9,
            gain: p.grazeMeterGain != null ? Math.max(0, Math.min(200, p.grazeMeterGain)) : 6,
            perBulletCdMs: p.grazePerBulletCdMs != null ? Math.max(30, Math.min(1000, Number(p.grazePerBulletCdMs))) : 180,
            orbR: p.grazeOrbRadius != null ? Math.max(2, Math.min(16, p.grazeOrbRadius)) : 5,
            orbSpd: p.grazeOrbSpeedPx != null ? Math.max(60, Math.min(1200, p.grazeOrbSpeedPx)) : 480,
            glow: p.grazeOrbGlowAlpha != null ? Math.max(0.05, Math.min(1, p.grazeOrbGlowAlpha)) : 0.65,
            ellipseHorizMult:
                p.grazeEllipseHorizMult != null ? Math.max(0.2, Math.min(3, Number(p.grazeEllipseHorizMult))) : 1.42,
            ellipseVertMult:
                p.grazeEllipseVertMult != null ? Math.max(0.2, Math.min(3, Number(p.grazeEllipseVertMult))) : 0.76,
            focusShipAlpha:
                p.focusShipAlpha != null ? Math.max(0.08, Math.min(1, Number(p.focusShipAlpha))) : 0.42
        };
    }

    /**
     * 擦弹外椭圆半轴：以判定点为中心，左右（x）为长轴、上下（y）为短轴；在受击圆外、该椭圆内为可擦区域
     */
    function getStgGrazeOuterEllipseRadii(hitDist, g) {
        const ex = g.extra > 0 ? g.extra : 0;
        const h = g.ellipseHorizMult != null ? g.ellipseHorizMult : 1.42;
        const v = g.ellipseVertMult != null ? g.ellipseVertMult : 0.76;
        return {
            rx: hitDist + ex * h,
            ry: hitDist + ex * v
        };
    }

    /**
     * 判定点：子弹中心是否在「受击圆之外、擦弹外椭圆之内」（与 tryStgGraze 几何一致）
     */
    function stgEnemyBulletPointInGrazeBand(px, py, g, prHit, br) {
        if (!player) return false;
        const hitDist = prHit + br;
        const dx = px - player.x;
        const dy = py - player.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= hitDist * hitDist) return false;
        const { rx, ry } = getStgGrazeOuterEllipseRadii(hitDist, g);
        if (rx <= 0 || ry <= 0) return false;
        const ne = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
        return ne <= 1;
    }

    /**
     * 敌弹本帧位移后检测擦弹：沿轨迹采样，在受击圆外、外椭圆内 → 每弹按冷却可重复触发
     */
    function tryStgGrazeEnemyBullet(b, bx0, by0, movedPx, nowMs, shiftHeld) {
        if (!player || phase !== 'playing' || !b || !b.alive) return;
        if (!shiftHeld) return;
        const g = getStgGrazeRuntimeParams();
        if (!g.enabled || g.extra <= 0 || g.gain <= 0) return;
        const lastGrazeMs = b._stgGrazeLastMs != null ? b._stgGrazeLastMs : -1e9;
        if (nowMs - lastGrazeMs < g.perBulletCdMs) return;
        /**
         * 原逻辑用「子弹本帧位移」与 grazeMinMovePx 比较：低速弹（含低弹速环形）每帧常 < 0.9px，会永久无法擦弹。
         * 改为：子弹位移与自机本帧位移取较大，再与阈值比；阈值上限钳制，避免过严。
         */
        const pm = player._stgFrameMovePx != null ? player._stgFrameMovePx : 0;
        const thr = Math.min(Math.max(g.minMove, 0.04), 0.35);
        if (Math.max(movedPx, pm) < thr) return;
        const prHit = getStgPlayerHitRadius();
        const br = b.radius != null ? b.radius : 5;
        const baseN = STG_GRAZE_PATH_SAMPLES | 0;
        const n = Math.min(48, Math.max(Math.max(2, baseN), Math.ceil(movedPx / 3) + 2));
        let inBand = false;
        for (let si = 0; si < n; si++) {
            const t = si / Math.max(1, n - 1);
            const px = bx0 + (b.x - bx0) * t;
            const py = by0 + (b.y - by0) * t;
            if (stgEnemyBulletPointInGrazeBand(px, py, g, prHit, br)) {
                inBand = true;
                break;
            }
        }
        if (!inBand) return;
        const hitDist = prHit + br;
        const { rx, ry } = getStgGrazeOuterEllipseRadii(hitDist, g);
        b._stgGrazeLastMs = nowMs;
        b._stgGrazed = true;
        b._stgGrazeHighlightUntil = nowMs + 120;
        /** 慢速期间擦弹会累计一次「退慢速释放」能量弹，达到上限后不再增长 */
        stgFocusGrazeEnergyCount = Math.min(STG_FOCUS_GRAZE_ENERGY_MAX, stgFocusGrazeEnergyCount + 1);
        stgGrazeOrbs.push({
            x: b.x,
            y: b.y,
            meterGain: g.gain,
            r: g.orbR,
            spd: g.orbSpd,
            glow: g.glow,
            alive: true
        });
        /** 渐隐提示擦弹范围：以判定点为中心，外椭圆与受击圆之间的环带 */
        if (stgGrazeRangeFlashes.length < STG_GRAZE_RANGE_FLASH_MAX) {
            stgGrazeRangeFlashes.push({
                cx: player.x,
                cy: player.y,
                rx,
                ry,
                rHit: hitDist,
                startMs: performance.now(),
                durationMs: STG_GRAZE_RANGE_FLASH_MS
            });
        }
        console.log('[STG] 擦弹触发，本帧位移 px=', movedPx.toFixed(2));
        if ((keys.ShiftLeft || keys.ShiftRight) && stgTakenUpgradeIds.has('focus_graze_snipe')) {
            emitFocusGrazeCounterShot();
        }
    }

    /**
     * 退出慢速时释放擦弹积攒的能量弹（扇形向前）
     */
    function emitStgFocusGrazeEnergyBurst(count) {
        if (!player || !count || count <= 0) return;
        const n = Math.max(1, Math.floor(count));
        const spreadDeg = 70;
        const baseDeg = -90;
        const spd = (player.focusBulletSpeed != null ? player.focusBulletSpeed : player.bulletSpeed) * bonusBulletSpeed * 0.92;
        const baseAtk = player.focusWeaponAttack != null ? player.focusWeaponAttack : player.mainWeaponAttack != null ? player.mainWeaponAttack : 10;
        const dmg = applyStgWeaponBaseAttackBonuses(baseAtk) * bonusDamage * getStgUltAtkDamageMult() * 0.58;
        const r = Math.max(3, (player.focusBulletRadius != null ? player.focusBulletRadius : player.bulletRadius != null ? player.bulletRadius : 4) * 1.05);
        const shape = normalizePlayerBulletVisualShape(
            player.focusBulletVisualShape != null ? player.focusBulletVisualShape : player.bulletVisualShape
        );
        for (let i = 0; i < n; i++) {
            const t = n <= 1 ? 0.5 : i / (n - 1);
            const deg = baseDeg - spreadDeg * 0.5 + spreadDeg * t;
            const a = (deg * Math.PI) / 180;
            playerBullets.push({
                x: player.x,
                y: player.y - player.radius * 0.4,
                vx: Math.cos(a) * spd,
                vy: Math.sin(a) * spd,
                dmg: dmg,
                alive: true,
                radius: r,
                shape: shape,
                pierceHitsLeft: 1,
                pierceHitEnemyIds: null,
                homing: false,
                homingStr: 0,
                spreadCritBonus: 0,
                fromSpread: false,
                fromFocusMain: true,
                isCrystal: false,
                allowCrystalAcc: false,
                isGrazeEnergy: true
            });
        }
    }

    /** 移除过期的擦弹范围提示，避免数组无限增长 */
    function updateStgGrazeRangeFlashes(nowMs) {
        if (!stgGrazeRangeFlashes.length) return;
        stgGrazeRangeFlashes = stgGrazeRangeFlashes.filter((f) => nowMs < f.startMs + f.durationMs);
    }

    /**
     * 绘制擦弹范围闪：外椭圆半透明填充 + 内圆挖空形成环带，边缘加亮；随时间渐隐。
     */
    function drawStgGrazeRangeFlashes(ctx) {
        if (!stgGrazeRangeFlashes.length || !player) return;
        const now = performance.now();
        for (let i = 0; i < stgGrazeRangeFlashes.length; i++) {
            const f = stgGrazeRangeFlashes[i];
            const elapsed = now - f.startMs;
            if (elapsed < 0 || elapsed >= f.durationMs) continue;
            const u = elapsed / f.durationMs;
            /** 前快后慢淡出，末尾更明显留一点亮度 */
            const fade = (1 - u) * (1 - u);
            const aFill = 0.38 * fade;
            const aEdge = 0.72 * fade;
            ctx.save();
            ctx.translate(f.cx, f.cy);
            ctx.beginPath();
            ctx.ellipse(0, 0, f.rx, f.ry, 0, 0, Math.PI * 2);
            /** 环带主色：青白，与小白球、慢速判定点区分 */
            const grd = ctx.createRadialGradient(0, 0, f.rHit, 0, 0, Math.max(f.rx, f.ry) * 1.02);
            grd.addColorStop(0, `rgba(160, 235, 255, ${aFill * 0.15})`);
            grd.addColorStop(0.45, `rgba(120, 210, 255, ${aFill * 0.85})`);
            grd.addColorStop(1, `rgba(220, 250, 255, ${aFill * 0.55})`);
            ctx.fillStyle = grd;
            ctx.fill();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(0, 0, f.rHit, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = `rgba(240, 252, 255, ${aEdge})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 0, f.rx, f.ry, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = `rgba(255, 200, 120, ${0.35 * fade})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(0, 0, f.rHit, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    /** 擦弹小白球飞向判定点，吸附后按「收益」灌入大招蓄能条（叠乘 bonusUltChargeMult · bonusGrazeChargeMult） */
    function updateStgGrazeOrbs(dtSec) {
        if (!player || phase !== 'playing') return;
        const prHit = getStgPlayerHitRadius();
        const absorb = prHit + 10;
        for (let i = stgGrazeOrbs.length - 1; i >= 0; i--) {
            const o = stgGrazeOrbs[i];
            if (!o || !o.alive) {
                stgGrazeOrbs.splice(i, 1);
                continue;
            }
            const dx = player.x - o.x;
            const dy = player.y - o.y;
            const d = Math.hypot(dx, dy);
            if (d < absorb) {
                const gain = o.meterGain != null ? o.meterGain : 6;
                stgUltChargeMeter += gain * bonusUltChargeMult * bonusGrazeChargeMult;
                applyStgUltChargeMeterOverflowAndHints();
                stgGrazeOrbs.splice(i, 1);
                console.log('[STG] 擦弹球吸附，蓄能折算', gain);
                continue;
            }
            const spd = o.spd != null ? o.spd : 480;
            if (d > 0.5) {
                o.x += (dx / d) * spd * dtSec;
                o.y += (dy / d) * spd * dtSec;
            }
        }
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
        if (
            cfg.emitStyle === 'single' ||
            cfg.emitStyle === 'fan' ||
            cfg.emitStyle === 'ring' ||
            cfg.emitStyle === 'double_column'
        ) {
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
        if (cfg.doubleColumnSep != null) {
            const s = Number(cfg.doubleColumnSep);
            if (Number.isFinite(s)) p.doubleColumnSep = Math.max(8, Math.min(56, s));
        } else {
            delete p.doubleColumnSep;
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
        if (
            cfg.focusEmitStyle === 'single' ||
            cfg.focusEmitStyle === 'fan' ||
            cfg.focusEmitStyle === 'ring' ||
            cfg.focusEmitStyle === 'double_column'
        ) {
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
        if (cfg.focusDoubleColumnSep != null) {
            const s = Number(cfg.focusDoubleColumnSep);
            if (Number.isFinite(s)) p.focusDoubleColumnSep = Math.max(8, Math.min(56, s));
        } else {
            delete p.focusDoubleColumnSep;
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
        if (
            cfg.skillEmitStyle === 'single' ||
            cfg.skillEmitStyle === 'fan' ||
            cfg.skillEmitStyle === 'ring' ||
            cfg.skillEmitStyle === 'double_column'
        ) {
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
        if (cfg.skillDoubleColumnSep != null) {
            const s = Number(cfg.skillDoubleColumnSep);
            if (Number.isFinite(s)) p.skillDoubleColumnSep = Math.max(8, Math.min(56, s));
        } else {
            delete p.skillDoubleColumnSep;
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
        /** 穿透：未存档时按单段命中（runtime 与 pushBullet 一致） */
        if (cfg.bulletPierceEnabled != null || cfg.bulletPierce != null) {
            p.bulletPierceEnabled = !!(cfg.bulletPierceEnabled === true || cfg.bulletPierce === true);
        } else {
            delete p.bulletPierceEnabled;
        }
        if (cfg.bulletPierceHits != null) {
            const n = parseInt(cfg.bulletPierceHits, 10);
            if (Number.isFinite(n)) p.bulletPierceHits = Math.max(2, Math.min(20, n));
        } else {
            delete p.bulletPierceHits;
        }
        if (cfg.focusBulletPierceEnabled != null || cfg.focusBulletPierce != null) {
            p.focusBulletPierceEnabled = !!(cfg.focusBulletPierceEnabled === true || cfg.focusBulletPierce === true);
        } else {
            delete p.focusBulletPierceEnabled;
        }
        if (cfg.focusBulletPierceHits != null) {
            const n = parseInt(cfg.focusBulletPierceHits, 10);
            if (Number.isFinite(n)) p.focusBulletPierceHits = Math.max(2, Math.min(20, n));
        } else {
            delete p.focusBulletPierceHits;
        }
        if (cfg.skillBulletPierceEnabled != null || cfg.skillBulletPierce != null) {
            p.skillBulletPierceEnabled = !!(cfg.skillBulletPierceEnabled === true || cfg.skillBulletPierce === true);
        } else {
            delete p.skillBulletPierceEnabled;
        }
        if (cfg.skillBulletPierceHits != null) {
            const n = parseInt(cfg.skillBulletPierceHits, 10);
            if (Number.isFinite(n)) p.skillBulletPierceHits = Math.max(2, Math.min(20, n));
        } else {
            delete p.skillBulletPierceHits;
        }
        /** 开局已拥有的大招充能格数（0–5），与局内五格上限一致 */
        if (cfg.ultInitialCharges != null) {
            const n = parseInt(cfg.ultInitialCharges, 10);
            if (Number.isFinite(n)) p.ultInitialCharges = Math.max(0, Math.min(5, n));
        } else {
            delete p.ultInitialCharges;
        }
        /** 擦弹：敌弹掠过判定点外环时触发一次，生成小白球吸附并转化为大招蓄能 */
        if (cfg.grazeEnabled != null) {
            p.grazeEnabled = !!cfg.grazeEnabled;
        } else {
            delete p.grazeEnabled;
        }
        if (cfg.grazeExtraPx != null) {
            const n = Number(cfg.grazeExtraPx);
            if (Number.isFinite(n)) p.grazeExtraPx = Math.max(0, Math.min(160, n));
        } else {
            delete p.grazeExtraPx;
        }
        if (cfg.grazeMeterGain != null) {
            const n = Number(cfg.grazeMeterGain);
            if (Number.isFinite(n)) p.grazeMeterGain = Math.max(0, Math.min(200, n));
        } else {
            delete p.grazeMeterGain;
        }
        if (cfg.grazeMinMovePx != null) {
            const n = Number(cfg.grazeMinMovePx);
            if (Number.isFinite(n)) p.grazeMinMovePx = Math.max(0.05, Math.min(30, n));
        } else {
            delete p.grazeMinMovePx;
        }
        if (cfg.grazeOrbRadius != null) {
            const n = Number(cfg.grazeOrbRadius);
            if (Number.isFinite(n)) p.grazeOrbRadius = Math.max(2, Math.min(16, n));
        } else {
            delete p.grazeOrbRadius;
        }
        if (cfg.grazeOrbSpeedPx != null) {
            const n = Number(cfg.grazeOrbSpeedPx);
            if (Number.isFinite(n)) p.grazeOrbSpeedPx = Math.max(60, Math.min(1200, n));
        } else {
            delete p.grazeOrbSpeedPx;
        }
        if (cfg.grazeOrbGlowAlpha != null) {
            const n = Number(cfg.grazeOrbGlowAlpha);
            if (Number.isFinite(n)) p.grazeOrbGlowAlpha = Math.max(0.05, Math.min(1, n));
        } else {
            delete p.grazeOrbGlowAlpha;
        }
        if (cfg.grazeEllipseHorizMult != null) {
            const n = Number(cfg.grazeEllipseHorizMult);
            if (Number.isFinite(n)) p.grazeEllipseHorizMult = Math.max(0.2, Math.min(3, n));
        } else {
            delete p.grazeEllipseHorizMult;
        }
        if (cfg.grazeEllipseVertMult != null) {
            const n = Number(cfg.grazeEllipseVertMult);
            if (Number.isFinite(n)) p.grazeEllipseVertMult = Math.max(0.2, Math.min(3, n));
        } else {
            delete p.grazeEllipseVertMult;
        }
        if (cfg.focusShipAlpha != null) {
            const n = Number(cfg.focusShipAlpha);
            if (Number.isFinite(n)) p.focusShipAlpha = Math.max(0.08, Math.min(1, n));
        } else {
            delete p.focusShipAlpha;
        }
        /** P 点吸引范围（px，圆心为判定点；0=关闭；不绘制） */
        if (cfg.pPickupAttractRadius != null) {
            const n = Number(cfg.pPickupAttractRadius);
            if (Number.isFinite(n)) p.pPickupAttractRadius = Math.max(0, Math.min(1200, n));
        } else {
            delete p.pPickupAttractRadius;
        }
        if (cfg.lifeCellsMax != null) {
            const bc = Number(cfg.lifeCellsMax);
            if (Number.isFinite(bc)) {
                const baseCells = Math.max(1, Math.min(30, Math.round(bc)));
                let cells = baseCells;
                if (playerStatsRef && playerStatsRef.getStat) {
                    cells = Math.max(1, Math.round(baseCells * (1 + (playerStatsRef.getStat('max_health_bonus') || 0))));
                }
                const prevMaxHalf = Math.max(2, (p.stgLifeCellsMax != null ? p.stgLifeCellsMax : 6) * 2);
                const prevRem =
                    p.stgLifeHalfUnitsRemain != null ? (p.stgLifeHalfUnitsRemain | 0) : prevMaxHalf;
                p.stgLifeCellsMax = cells;
                const newMaxHalf = cells * 2;
                p.stgLifeHalfUnitsRemain = Math.min(newMaxHalf, Math.max(0, Math.round((prevRem / prevMaxHalf) * newMaxHalf)));
            }
        }
        if (cfg.hitInvulnMs != null) {
            const v = Number(cfg.hitInvulnMs);
            if (Number.isFinite(v)) p.hitInvulnMs = Math.max(0, Math.min(20000, v));
        } else {
            delete p.hitInvulnMs;
        }
        if (cfg.hitBulletClearMs != null) {
            const v = Number(cfg.hitBulletClearMs);
            if (Number.isFinite(v)) p.hitBulletClearMs = Math.max(0, Math.min(20000, v));
        } else {
            delete p.hitBulletClearMs;
        }
        if (cfg.hitSpawnHoldMs != null) {
            const v = Number(cfg.hitSpawnHoldMs);
            if (Number.isFinite(v)) p.hitSpawnHoldMs = Math.max(0, Math.min(30000, v));
        } else {
            delete p.hitSpawnHoldMs;
        }
        if (p.stgLifeCellsMax != null) {
            syncStgPlayerLifeHpMirror();
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
            applyStgExpBarFromEditorConfig();
            return;
        }
        mergeStgPlayerEditorIntoPlayer(player, cfg);
        applyStgExpBarFromEditorConfig();
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

    /** 游戏阶段：title | playing | upgrade_announce（棋盘播报「升级时刻」，尚未弹四选一）| levelup | chapter_transition | dead | win */
    let phase = 'title';
    /** 升级时刻全屏弹层是否打开 */
    let stgUpgradePickOpen = false;
    /** 自上次升级时刻结算以来，因经验累计升了多少级（波次衔接时一轮 4 选一次） */
    let stgLevelUpsBanked = 0;
    /** 当前波次衔接因升级时刻而延后：选完所有轮后才 waveIndex++ */
    let stgPendingWaveAdvanceAfterUpgradeMoment = false;
    /** 升级四选一全部选完后，延迟到该时刻再执行 advanceStgWaveIndexAndSpawnNext（毫秒；null=未等待） */
    let stgPostUpgradeAdvanceAtMs = null;
    /** 默认：升级选完后隔几秒再出下一波（可被波次存档 `postUpgradeSpawnDelaySec` 覆盖） */
    const STG_DEFAULT_POST_UPGRADE_SPAWN_DELAY_SEC = 2;
    /** 进入升级时刻后：棋盘播报「升级时刻」的时长（毫秒），之后再弹出四选一 */
    const STG_UPGRADE_MOMENT_ANNOUNCE_MS = 1500;
    /** 与 STG_UPGRADE_MOMENT_ANNOUNCE_MS 配套：到时刻后打开四选一 */
    let stgUpgradeMomentAnnounceEndMs = null;
    /** 本轮升级时刻剩余几轮 4 选一 */
    let stgUpgradeMomentRoundsLeft = 0;
    let stgUpgradeMomentRoundTotal = 0;

    /** @type {Array<{x:number,y:number,vx:number,vy:number,dmg:number,alive:boolean}>} */
    let playerBullets = [];
    /** @type {Array<StgEnemy>} */
    let enemies = [];
    /** @type {Array<{x:number,y:number,vx:number,vy:number,dmg:number,alive:boolean,pattern:string,ageMs?:number,splitAfterMs?:number,splitDone?:boolean,splitChildSpeed?:number,splitCount?:number,splitStyle?:string,radius?:number,homingStr?:number}>} */
    let enemyBullets = [];
    /** 直线激光：线段 + 线宽 + 持续时间内每帧检测与玩家距离 */
    let enemyLasers = [];
    /** @type {Array<{x:number,y:number,exp:number,vy:number,mode?:string,peakY?:number,fallVy?:number,pickupKind?:string,pickupRadius?:number,shape?:string,sizePx?:number,chargeValue?:number}>} */
    let pickups = [];
    /** 擦弹产生的小白球：飞向判定点，吸附后增加大招蓄能 */
    let stgGrazeOrbs = [];
    /** 擦弹成功时短暂显示「可擦区域」：外椭圆环带渐隐（与判定用椭圆一致） */
    /** @type {Array<{cx:number,cy:number,rx:number,ry:number,rHit:number,startMs:number,durationMs:number}>} */
    let stgGrazeRangeFlashes = [];
    const STG_GRAZE_RANGE_FLASH_MS = 560;
    const STG_GRAZE_RANGE_FLASH_MAX = 8;
    /** 擦弹：沿本帧子弹轨迹多点采样，避免高速弹（如环形齐射）一帧穿过擦弹带却不触发 */
    const STG_GRAZE_PATH_SAMPLES = 10;
    /** 慢速一次期间累计的「退出释放」能量弹数量 */
    let stgFocusGrazeEnergyCount = 0;
    /** 本次慢速能累计的能量弹上限 */
    const STG_FOCUS_GRAZE_ENERGY_MAX = 28;
    /** 上一帧是否处于慢速，用于检测进入/退出 */
    let stgFocusHeldPrevFrame = false;

    /** 道具E：阴阳玉（《新玩法--STG模式》间隔产球、圆形绕机、挡弹、对敌持续伤、限时存在） */
    /** @type {Array<{x:number,y:number,r:number,visR?:number,alive:boolean,lifeMs:number,maxLifeMs:number,phaseRad?:number,orbitR?:number,orbitOmega?:number}>} */
    let stgYinYangOrbs = [];
    /** 扩散模式下下次生成阴阳玉的 performance.now()（毫秒）；未持有道具时为 null */
    let stgYinYangNextSpawnWallMs = null;
    /** 与策划「每次隔 N 秒产生一枚」一致 */
    const STG_YINYANG_SPAWN_INTERVAL_MS = 10000;
    /** 与策划「持续时间」一致（毫秒） */
    const STG_YINYANG_ORB_DURATION_MS = 3000;
    /** 同时存在上限（10s 周期 + 3s 寿命下通常 1～2 枚，留余量防极端） */
    const STG_YINYANG_MAX_ORBS = 8;
    /** 道具I：集中主武器命中满该次数触发水晶齐射（与 HUD「还剩几次」同源） */
    const STG_CRYSTAL_FOCUS_HITS_NEEDED = 30;
    /** 道具M：慢速下每击杀该数量叠一层狂怒（与 HUD「再杀几只」同源） */
    const STG_RAGE_KILLS_PER_STACK = 5;
    /** 局内构筑面板：按道具 id 存 JSON，与勾选 grants 分键 */
    const STG_BUILD_OVERRIDES_KEY = 'stg_build_upgrade_overrides';
    /** @type {Record<string, Record<string, unknown>>} */
    let stgBuildUpgradeOverrides = {};
    /** 道具I：慢速+水晶分支下，主武器命中次数（满阈值触发水晶齐射） */
    let stgCrystalFocusHitAcc = 0;
    /** 道具M–P：狂怒层数、当前段结束时刻（叠层整段重置 CD；到期先掉最高层再开下一段） */
    let stgRageStacks = 0;
    /** 当前「正在掉」的这一层的结束 wall ms；叠层时整段刷新 */
    let stgRageEndMs = 0;
    let stgRageKillAcc = 0;
    /** 道具C：伴身炮台上次发射时刻 */
    let stgSideTurretLastFireMs = 0;
    /** 道具：连杀激射（spread_kill_haste）叠层与到期时刻 */
    let stgSpreadKillHasteStacks = 0;
    let stgSpreadKillHasteEndMs = 0;
    /** 式神援护（focus_shikigami）上次发射 */
    let stgShikigamiLastFireMs = 0;
    const STG_SPREAD_KILL_HASTE_MS = 3500;
    const STG_SPREAD_KILL_HASTE_MAX = 12;
    const STG_SPREAD_KILL_HASTE_ROF_PER_STACK = 0.04;
    /**
     * 从未与主画布 [0,cw]×[0,ch] 重叠、且长时间保持完全在画布外时强制剔除（秒）。
     * 原因：离场逻辑要求先 stgHasEnteredPlayfield，而 lock_y/lock_x/anchor 等若停在左右扩展格，
     * 机体可能永不对画布矩形重叠 → 既不绘制有效区、也不触发离场，波次与 HUD「剩余敌」永久卡死。
     */
    const STG_ENEMY_OFFSCREEN_NO_ENTRY_STUCK_MS = 12000;

    /** 玩家受击：粒子 + 全屏闪（仅 STG 画布内） */
    let stgPlayerFxParticles = [];
    let stgPlayerHitFlashMs = 0;
    let stgLaserFxAccMs = 0;

    /** @type {{waves:Array}} */
    let waveData = { waves: [] };
    let waveIndex = 0;
    /** 完整波次包：多章节；与存档 chapters 对应，用于章节衔接与 HUD */
    let stgWavePackRoot = null;
    /** 当前章节下标（0 起） */
    let stgChapterIndex = 0;
    /** 章节过渡全屏层结束时刻（performance.now） */
    let stgChapterTransitionEndMs = null;
    /** 通过章节后全屏提示停留时长（毫秒） */
    const STG_CHAPTER_TRANSITION_MS = 4000;
    /** 结算层是否通关，供切换语言时重刷文案 */
    let lastShowResultWin = null;
    /** 无阵型时：扁平 type 列表，按 spawnIntervalMs 每节拍 1 只 */
    let spawnQueueLegacy = [];
    /**
     * 当前波次阵型解析出的移动信标占位（a1–a4、b1–b4 → 扩展棋盘格索引）。
     * 多段移动（waypoint_a / waypoint_b）的敌人按序途经对应格心；局内不绘制信标本体。
     * @type {Record<string, { edge: string, col: number, row: number }|null>|null}
     */
    let stgCurrentWaveBeaconMap = null;
    /** 多段移动「阵型队列」自增 id（相邻格并查集分组后写入 stgWaypointQueueId） */
    let stgNextWaypointQueueId = 1;
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
    /** 大招：编辑器额外冷却 = 配置值 / 本乘区；充能阈值 = 基准 / 本乘区。仅「基础道具9」叠乘 */
    let bonusUltChargeMult = 1;
    /** 局内回复额外乘区；仅「基础道具2」叠乘（与局外 health_regen_bonus 叠乘） */
    let stgRunRegenMult = 1;
    /** 擦弹小白球灌入大招条时的额外乘区；仅「基础道具10」叠乘（与 bonusUltChargeMult 叠乘） */
    let bonusGrazeChargeMult = 1;

    /** 左侧 HUD：生命 / 经验 条格数（与大招五格区分） */
    const STG_PRIORITY_SEGMENTS = 10;

    /** 大招充能：最多 5 格方形；仅拾取充能点（及旧逻辑已移除）蓄满阈值 +1 格，按 X 消耗 1 格发动 */
    const STG_ULT_CHARGE_MAX = 5;
    /** 与升级经验同源数值；阈值 = 本常量 / bonusUltChargeMult（基础道具9 加快蓄满） */
    const STG_ULT_CHARGE_METER_BASE = 100;
    let stgUltCharges = 0;
    /** 当前格内已累积量（0～阈值） */
    let stgUltChargeMeter = 0;
    /** 自机下方「大招就绪」小字显示结束时刻（每充满一格追加 1s） */
    let stgUltReadyHintUntilMs = null;

    /**
     * 仅「基础属性强化」中、与《新玩法--STG模式》基础道具对应的项会累加并写入右侧栏（7 条）。
     * 基础道具7（P点）、9（充能）仍叠乘局内数值，但不计入本对象（不显示）。
     */
    let stgStatBonusDisplay = {
        /** 基础道具1：累计通过三选一增加的整格数（与《新玩法--STG模式》「+1 格生命与上限」一致） */
        hpCellsStat: 0,
        pct_regen: 0,
        pct_atk_all: 0,
        /** 基础道具10：擦弹球吸附时灌大招条的收益（展示为累计 +10%/ 次，与 bonusGrazeChargeMult 同步） */
        pct_graze: 0,
        pct_fire: 0,
        pct_bullet_spd: 0,
        pct_move_base: 0
    };

    function resetStgStatBonusDisplay() {
        stgStatBonusDisplay.hpCellsStat = 0;
        stgStatBonusDisplay.pct_regen = 0;
        stgStatBonusDisplay.pct_atk_all = 0;
        stgStatBonusDisplay.pct_graze = 0;
        stgStatBonusDisplay.pct_fire = 0;
        stgStatBonusDisplay.pct_bullet_spd = 0;
        stgStatBonusDisplay.pct_move_base = 0;
        bonusUltChargeMult = 1;
        stgRunRegenMult = 1;
        bonusGrazeChargeMult = 1;
    }

    /**
     * 基础属性强化：叠局内数值 + 右侧属性加成条；非 stat 卡勿调用。
     */
    function applyStgStatPickup(statId) {
        if (!player) return;
        const D = stgStatBonusDisplay;
        switch (statId) {
            case 'stat_hp': {
                /** 《新玩法--STG模式》基础道具1：+1 整格上限，并回复 1 整格（2 半格），不超过引擎格数上限 */
                const capCells = 30;
                D.hpCellsStat = (D.hpCellsStat | 0) + 1;
                const oldC = Math.max(1, player.stgLifeCellsMax | 0);
                const newC = Math.min(capCells, oldC + 1);
                player.stgLifeCellsMax = newC;
                const newMaxHalf = newC * 2;
                const oldRem = player.stgLifeHalfUnitsRemain != null ? (player.stgLifeHalfUnitsRemain | 0) : oldC * 2;
                player.stgLifeHalfUnitsRemain = Math.min(newMaxHalf, Math.max(0, oldRem + 2));
                syncStgPlayerLifeHpMirror();
                break;
            }
            case 'stat_regen':
                D.pct_regen += 10;
                stgRunRegenMult *= 1.1;
                break;
            case 'stat_atk_all':
                D.pct_atk_all += 8;
                bonusDamage *= 1.08;
                break;
            case 'stat_graze':
                /** 基础道具10：与 stat_regen 同档展示 +10%，擦弹灌条 ×1.1 */
                D.pct_graze += 10;
                bonusGrazeChargeMult *= 1.1;
                break;
            case 'stat_fire':
                D.pct_fire += 8;
                bonusFireIntervalMult *= 0.92;
                break;
            case 'stat_bullet_spd':
                D.pct_bullet_spd += 8;
                bonusBulletSpeed *= 1.08;
                break;
            case 'stat_move_spread':
                D.pct_move_base += 6;
                bonusMoveMult *= 1.06;
                break;
            case 'stat_exp':
                /** 基础道具7：无列表项，仅局内 P 点经验叠乘 */
                bonusExpMult *= 1.06;
                break;
            case 'stat_ult_charge':
                /** 基础道具9：无列表项；加快大招充能蓄满（降低阈值）并与编辑器冷却叠乘 */
                bonusUltChargeMult *= 1.08;
                break;
            default:
                return;
        }
        refreshStgReimuBonusAside();
    }

    /** 将 stgStatBonusDisplay 写入右侧栏（切换语言重建 DOM 后需再调） */
    function refreshStgReimuBonusAside() {
        const root = document.getElementById('stgPlayerStatsList');
        if (!root) return;
        const fmtPct = (v) => (v <= 0 ? '0%' : '+' + Math.round(v) + '%');
        const keys = ['hp_cells_stat', 'pct_regen', 'pct_atk_all', 'pct_graze', 'pct_fire', 'pct_bullet_spd', 'pct_move_base'];
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const row = root.querySelector('[data-stg-stat="' + k + '"]');
            if (!row) continue;
            const el = row.querySelector('.stg-reimu-stat-value');
            if (!el) continue;
            if (k === 'hp_cells_stat') {
                const n = stgStatBonusDisplay.hpCellsStat | 0;
                const useEn =
                    window.StgUiI18n && typeof window.StgUiI18n.isEn === 'function' && window.StgUiI18n.isEn();
                el.textContent = n <= 0 ? '—' : useEn ? '+' + n + ' cells' : '+' + n + ' 格';
            } else {
                el.textContent = fmtPct(stgStatBonusDisplay[k] || 0);
            }
        }
    }

    /**
     * 博丽灵梦构筑：集中 / 大招各两条分支互斥；且每条分支须先抽到「基础卡」，同分支的后续强化才会进入池子（requires）。
     */
    let stgFocusBranch = null;
    /** @type {'seal'|'dream'|null} */
    let stgUltBranch = null;
    const stgTakenUpgradeIds = new Set();

    /**
     * 封魔阵：持续跟随自机，范围内消敌弹并造成持续伤害；可选疗愈（期间回血 + 结束后短暂攻击加成）
     * @type {{ endMs: number, radius: number, dps: number, healPerSec: number, hasHealCard: boolean } | null}
     */
    let stgSealField = null;
    /** 梦想妙珠：向上移动，大范围消弹 + 接触伤害；可选眩晕 */
    let stgDreamOrbs = [];

    /** 升级候选（升级时刻：四选一，每轮洗牌后取至多 4 条） */
    let upgradeChoices = [];

    /**
     * 【局内升级】唯一随机源：prepareLevelUpChoices4() 对本数组洗牌后取至多 4 条（见 isStgUpgradeEligible）。
     * 条目必须与策划文档《新模式玩法开发/道具列表》一致：不含已废弃狂怒分支、不含未立项的「水晶 J/K/L」「阵内经济」、不含通用 stat 卡。
     * 试做型封魔阵为默认大招（按 X），不在本池；封魔阵强化仅「阵界扩续」「阵疗愈攻」；妙珠线为 T–V。
     * 与 obj_list/enhance_items.json（局外 meta）无关。
     *
     * group: spread | focus_crystal | focus_misc | ult_seal | ult_dream
     * requires: 须本局已选过该 id 后，本条才进入随机池（分支内先解锁基础再出强化）
     */
    const STG_UPGRADE_POOL = [
        // —— 扩散攻击（普通模式）道具A–H ——
        {
            id: 'spread_fan',
            icon: '📐',
            group: 'spread',
            name: '三向散射',
            desc: '攻击方式改为扇形散射；相对基础扇条数 +2（与武器编辑器一致，可构筑覆盖角度与齐射倍率）',
            apply: () => {}
        },
        {
            id: 'spread_extra',
            icon: '➕',
            group: 'spread',
            name: '追噬副弹',
            desc: '攻击概率发射额外的追踪子弹；额外弹可穿透多段敌机（默认穿透 2 次）。',
            apply: () => {}
        },
        {
            id: 'spread_turret',
            icon: '🔰',
            group: 'spread',
            name: '伴身炮台',
            desc: '自机旁增加炮台，造成约 150% 主武器单发伤害，随自机移动。',
            apply: () => {}
        },
        {
            id: 'spread_homing',
            icon: '🎯',
            group: 'spread',
            name: '灵符追踪',
            desc: '扩散主弹附带追踪；伤害降低 50%（与追踪强度平衡）。',
            apply: () => {}
        },
        {
            id: 'spread_yinyang',
            icon: '☯️',
            group: 'spread',
            name: '阴阳玉',
            desc: '每 10 秒产生一枚阴阳玉，存在 3 秒；绕机公转可挡敌弹，对接触敌人造成持续伤害（约 50% 等效攻击力）。',
            apply: () => {}
        },
        { id: 'spread_big_p', icon: '💠', group: 'spread', name: '大福点', desc: '该攻击击杀敌人有概率掉落大 P 点（经验）。', apply: () => {} },
        {
            id: 'spread_rof',
            icon: '⚡',
            group: 'spread',
            name: '扩散射速',
            desc: '仅普通模式（不按 Shift）：博丽御符射击间隔缩短。',
            apply: () => {}
        },
        {
            id: 'spread_might',
            icon: '🔥',
            group: 'spread',
            name: '扩散威力',
            desc: '仅普通模式：博丽御符单发/齐射伤害提高。',
            apply: () => {}
        },
        {
            id: 'spread_kill_haste',
            icon: '🩸',
            group: 'spread',
            name: '连杀激射',
            desc: '普通模式击杀敌人叠层，短时提高射速；层数随时间衰减。',
            apply: () => {}
        },
        { id: 'spread_big_energy', icon: '✨', group: 'spread', name: '大充能', desc: '该攻击击杀敌人有概率掉落大充能点。', apply: () => {} },
        // —— 集中攻击 · 水晶 道具I–L ——
        {
            id: 'focus_crystal_base',
            icon: '💎',
            group: 'focus_crystal',
            name: '水晶齐射',
            desc: '伏魔针每命中 30 次，向前方发射多枚水晶（数量与伤害可在「局内构筑道具」中调水晶齐射参数）。',
            apply: () => {}
        },
        {
            id: 'focus_bullet_spd',
            icon: '💨',
            group: 'focus_misc',
            name: '集中弹速',
            desc: '慢速模式（按住 Shift）下伏魔针弹速提高。',
            apply: () => {}
        },
        {
            id: 'focus_shikigami',
            icon: '🎎',
            group: 'focus_misc',
            name: '式神援护',
            desc: '慢速模式下周期从侧翼发射援护弹，伤害参照伏魔针。',
            apply: () => {}
        },
        {
            id: 'focus_stationary_ramp',
            icon: '🧘',
            group: 'focus_misc',
            name: '站桩蓄能',
            desc: '慢速下几乎不移动时，封魔针伤害随站立时间提高。',
            apply: () => {}
        },
        {
            id: 'focus_graze_snipe',
            icon: '🎯',
            group: 'focus_misc',
            name: '擦弹反击',
            desc: '擦弹成功时追加一发追踪伏魔针。',
            apply: () => {}
        },
        {
            id: 'focus_needle_slow',
            icon: '⏸️',
            group: 'focus_misc',
            name: '针芒迟滞',
            desc: '伏魔针命中的敌人有小概率短暂眩晕。',
            apply: () => {}
        },
        /** 大招：试做型封魔阵为局内默认自带（按 X），不在下列随机池 */
        // —— 大招 · 封魔阵分支强化（仅策划案列出的两项）——
        {
            id: 'ult_seal_size',
            icon: '⭕',
            group: 'ult_seal',
            name: '阵界扩续',
            desc: '试做型封魔阵：范围增大、持续时间延长。',
            apply: () => {}
        },
        {
            id: 'ult_seal_heal',
            icon: '💚',
            group: 'ult_seal',
            name: '阵疗愈攻',
            desc: '阵内持续回复生命；阵结束后短时间内攻击伤害提高。',
            requires: 'ult_seal_size',
            apply: () => {}
        },
        // —— 大招 · 梦想妙珠 道具T–V ——
        {
            id: 'ult_dream_base',
            icon: '🔮',
            group: 'ult_dream',
            name: '妙珠改式',
            desc: '将大招改为「梦想妙珠」：向前发射多枚妙珠，造成范围伤害（与封魔阵分支互斥）。',
            apply: () => {}
        },
        {
            id: 'ult_dream_count',
            icon: '✨',
            group: 'ult_dream',
            name: '妙珠数量',
            desc: '梦想妙珠数量增加。',
            requires: 'ult_dream_base',
            apply: () => {}
        },
        {
            id: 'ult_dream_stun',
            icon: '💫',
            group: 'ult_dream',
            name: '妙珠眩晕',
            desc: '妙珠可对敌人造成短暂眩晕。',
            requires: 'ult_dream_base',
            apply: () => {}
        }
    ];

    function isStgUpgradeEligible(u) {
        if (!u || stgTakenUpgradeIds.has(u.id)) return false;
        if (u.group === 'ult_seal' && stgUltBranch === 'dream') return false;
        if (u.group === 'ult_dream' && stgUltBranch === 'seal') return false;
        /** 分支内：须先拿到 requires 所指的基础强化，本条才参与随机 */
        if (u.requires && !stgTakenUpgradeIds.has(u.requires)) return false;
        return true;
    }

    function applyStgUpgradePick(u) {
        if (!u || u.id === 'pool_empty') return;
        /** 仅统计构筑卡；基础属性卡不占用构筑分支，避免误标 spread/focus */
        if (u.group === 'stat') {
            stgTakenUpgradeIds.add(u.id);
            return;
        }
        stgTakenUpgradeIds.add(u.id);
        if (u.group === 'focus_crystal') stgFocusBranch = 'crystal';
        if (u.group === 'ult_seal') stgUltBranch = 'seal';
        if (u.group === 'ult_dream') stgUltBranch = 'dream';
    }

    function getStgUpgradeById(id) {
        for (let i = 0; i < STG_UPGRADE_POOL.length; i++) {
            if (STG_UPGRADE_POOL[i].id === id) return STG_UPGRADE_POOL[i];
        }
        return null;
    }

    /** 勾选 R 时自动隐含 Q 等前置 id，与三选一 requires 一致 */
    function expandStgBuildGrantRequires(ids) {
        const set = new Set(ids);
        let added = true;
        while (added) {
            added = false;
            for (let i = 0; i < STG_UPGRADE_POOL.length; i++) {
                const u = STG_UPGRADE_POOL[i];
                if (u && set.has(u.id) && u.requires && !set.has(u.requires)) {
                    set.add(u.requires);
                    added = true;
                }
            }
        }
        return set;
    }

    function sortStgBuildGrantIdsByPoolOrder(ids) {
        const idx = new Map();
        for (let i = 0; i < STG_UPGRADE_POOL.length; i++) {
            idx.set(STG_UPGRADE_POOL[i].id, i);
        }
        return [...ids].sort((a, b) => (idx.get(a) ?? 99999) - (idx.get(b) ?? 99999));
    }

    /** 水晶/狂怒、封魔阵/妙珠 不可同时持有（与局内互斥一致） */
    function validateStgBuildGrantMutEx(set) {
        const sealIds = ['ult_seal_size', 'ult_seal_heal'];
        const dreamIds = ['ult_dream_base', 'ult_dream_count', 'ult_dream_stun'];
        const hasSeal = sealIds.some((id) => set.has(id));
        const hasDream = dreamIds.some((id) => set.has(id));
        if (hasSeal && hasDream) return false;
        return true;
    }

    /**
     * 读取局内道具面板存档，在开局自机创建后按池顺序应用（含 stat 的 apply）
     */
    function applyStgSavedBuildGrants() {
        let raw = null;
        try {
            raw = localStorage.getItem(STG_BUILD_INV_KEY);
        } catch (e) {
            return;
        }
        if (!raw) return;
        let arr = [];
        try {
            arr = JSON.parse(raw);
        } catch (e) {
            return;
        }
        if (!Array.isArray(arr)) return;
        const filtered = arr.filter((id) => typeof id === 'string');
        let set = expandStgBuildGrantRequires(filtered);
        if (!validateStgBuildGrantMutEx(set)) {
            console.warn('[STG] 局内道具预设互斥（封魔阵强化与梦想妙珠不可同时勾选），已跳过本局应用');
            return;
        }
        const ordered = sortStgBuildGrantIdsByPoolOrder(set);
        for (let i = 0; i < ordered.length; i++) {
            const u = getStgUpgradeById(ordered[i]);
            if (!u || u.id === 'pool_empty') continue;
            if (stgTakenUpgradeIds.has(u.id)) continue;
            applyStgUpgradePick(u);
            if (typeof u.apply === 'function') u.apply(player);
        }
    }

    class StgEnemy {
        /**
         * @param {number} x
         * @param {number} y
         * @param {object} typeDef 含怪物编辑器中的 STG 弹幕字段
         * @param {string} pattern 'aim' | 'straight' | 'none'
         * @param {string} typeId 波次中的种类 id，用于读档合并
         * @param {number} [formationMainCol] 阵型格列索引 0..GRID_COLS-1；弧线模式起点=主棋盘第0行+此列
         */
        constructor(x, y, typeDef, pattern, typeId, formationMainCol) {
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
            /** 非空且贴图加载成功时绘制位图；仅圆形弹使用 */
            this.stgEnemyBulletSprite = sanitizeStgEnemyBulletSpriteName(
                typeDef.stgEnemyBulletSprite != null ? String(typeDef.stgEnemyBulletSprite) : ''
            );
            this.icon = typeDef.icon || '👹';
            this.color = typeDef.color || '#e74c3c';
            this.alive = true;
            /** 是否已计入本波「已消灭」（击杀或有效边界离场），防止重复计数 */
            this.stgWaveCounted = false;
            /** 生成时的全局 waveIndex（0 起）；用于跨波时拒绝把上一波敌计入下一波 resolved */
            this.stgSpawnWaveIndex = -1;
            /** 阵型来源边：'top' | 'left' | 'right'，用于离场边界是否算「清除」 */
            this.stgSpawnEdge = 'top';
            /** 曾与画布区域有重叠：未成立前不因「在生成侧外」而剔除，避免上/左/右出生点首帧被误判离场 */
            this.stgHasEnteredPlayfield = false;
            /** 生成时刻（用于屏外超时兜底；缺省由首帧补齐） */
            this.stgSpawnClockMs = performance.now();
            this.typeId = typeId || 'normal';
            this.stgInstanceId = ++stgEnemyInstanceSeq;
            /** 击杀额外掉落充能点（仅大招蓄能）；怪物编辑器勾选 */
            this.stgDropChargePickup = !!(typeDef && typeDef.stgDropChargePickup);
            this.stgChargeDropMult =
                typeDef && typeDef.stgChargeDropMult != null && Number.isFinite(Number(typeDef.stgChargeDropMult))
                    ? Math.max(0.25, Math.min(4, Number(typeDef.stgChargeDropMult)))
                    : 1;
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
            /** 连射：战斗中按间隔续发；死后弹幕仅一发不连射 */
            this.stgBurstCount = Math.max(1, Math.min(16, typeDef.stgBurstCount != null ? typeDef.stgBurstCount : 1));
            this.stgBurstIntervalMs = Math.max(40, Math.min(500, typeDef.stgBurstIntervalMs != null ? typeDef.stgBurstIntervalMs : 100));
            this.stgBurstSpeedMode = typeDef.stgBurstSpeedMode === 'spread_wave' ? 'spread_wave' : 'average';
            this._stgBurstRemain = 0;

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
            /** 锁 Y / 锁 X：到达后停火位移（与编辑器 stgLockTarget*Norm 一致） */
            const lockNy =
                typeDef.stgLockTargetYNorm != null ? Number(typeDef.stgLockTargetYNorm) : 0.45;
            const lockNx =
                typeDef.stgLockTargetXNorm != null ? Number(typeDef.stgLockTargetXNorm) : 0.5;
            this.lockTargetY = ch * Math.max(0.04, Math.min(0.96, lockNy));
            this.lockTargetX = cw * Math.max(0.04, Math.min(0.96, lockNx));
            this.moveIdle = false;
            /** 多段移动：路径速率曲线、各信标停留(ms)，与怪物编辑器一致 */
            this.stgWaypointSpeedCurve = normalizeStgWaypointSpeedCurve(typeDef.stgWaypointSpeedCurve);
            this.stgWaypointDwellMs = parseStgWaypointDwellMsFromDef(typeDef);
            /** 当前段起点、段内参数 u、信标停留结束时刻（局内由 updateStgEnemyPosition 维护） */
            this.stgWaypointSegPx = x;
            this.stgWaypointSegPy = y;
            this.stgWaypointSegU = 0;
            this.stgWaypointDwellUntilMs = null;
            /** 阵型格键 `edge|col|row`（仅扩展棋盘出兵）；多段移动队列分组用 */
            this.stgFormationCellKey = null;
            /** 相邻同队多段移动共享同一 id；null=不参与队列同步 */
            this.stgWaypointQueueId = null;
            /** 阵型摆放列（主棋盘列号），与 flatten 的 col 一致；弧线入场用 */
            this.stgFormationMainCol =
                formationMainCol != null && Number.isFinite(Number(formationMainCol))
                    ? Math.max(0, Math.min(GRID_COLS - 1, formationMainCol | 0))
                    : null;
            if (this.stgMoveMode === 'arc_edges') {
                initStgEnemyArcEdgesApproach(this, x, y, typeDef, cw, ch);
            }
            /** 机体与自机重叠时是否按攻击力规则扣血；false=仅弹幕/激光可伤玩家（旧档缺省视为 true） */
            this.stgContactDamagePlayer = typeDef.stgContactDamagePlayer !== false;
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
            m === 'horizontal_right' ||
            m === 'lock_y' ||
            m === 'lock_x' ||
            m === 'waypoint_a' ||
            m === 'waypoint_b'
        ) {
            return m;
        }
        return 'homing_legacy';
    }

    /** 多段路径：直线匀速 / 两端缓动(慢进慢出) / 缓入 / 缓出（沿直线弦上的参数映射） */
    function normalizeStgWaypointSpeedCurve(raw) {
        const v = raw != null ? String(raw) : 'linear';
        if (v === 'smooth' || v === 'ease_in' || v === 'ease_out' || v === 'linear') return v;
        return 'linear';
    }

    /** 每信标 1～4 停留毫秒；支持数组或逗号分隔字符串 */
    function parseStgWaypointDwellMsFromDef(def) {
        const raw = def && def.stgWaypointDwellMs;
        const clampMs = (n) => Math.max(0, Math.min(120000, Math.round(Number(n)) || 0));
        if (Array.isArray(raw)) {
            return [0, 1, 2, 3].map((i) => clampMs(raw[i]));
        }
        if (raw != null && typeof raw === 'string') {
            const parts = String(raw)
                .split(/[,，;；\s]+/)
                .map((s) => parseInt(String(s).trim(), 10))
                .filter((n) => Number.isFinite(n));
            return [0, 1, 2, 3].map((i) => clampMs(parts[i]));
        }
        return [0, 0, 0, 0];
    }

    /**
     * u∈[0,1] 为时间归一化进度；返回值仍为 [0,1]，用于直线插值系数（非匀速时两端导数小）
     */
    function applyStgWaypointCurveT(u, curve) {
        const t = Math.max(0, Math.min(1, u));
        const c = curve || 'linear';
        if (c === 'smooth') return t * t * (3 - 2 * t);
        if (c === 'ease_in') return t * t;
        if (c === 'ease_out') {
            const o = 1 - t;
            return 1 - o * o;
        }
        return t;
    }

    /** 多段移动敌机：圆形机体互斥，防止重叠（每帧两遍迭代，位移对半分摊） */
    function resolveStgWaypointEnemySeparation(enemyArr) {
        if (!enemyArr || enemyArr.length < 2) return;
        const isWp = (e) =>
            e &&
            e.alive &&
            (e.stgMoveMode === 'waypoint_a' || e.stgMoveMode === 'waypoint_b');
        const passes = 2;
        for (let pass = 0; pass < passes; pass++) {
            for (let i = 0; i < enemyArr.length; i++) {
                const a = enemyArr[i];
                if (!isWp(a)) continue;
                const ra = a.radius != null ? a.radius : 14;
                for (let j = i + 1; j < enemyArr.length; j++) {
                    const b = enemyArr[j];
                    if (!isWp(b)) continue;
                    /** 同阵型队列会信标拉齐到同一点，再推挤会产生异常侧移；同 id 不互斥 */
                    const qa = a.stgWaypointQueueId;
                    if (qa != null && qa === b.stgWaypointQueueId) continue;
                    const rb = b.radius != null ? b.radius : 14;
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const dist = Math.hypot(dx, dy);
                    const minD = ra + rb + 0.5;
                    if (dist >= minD || dist < 1e-6) continue;
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const push = (minD - dist) * 0.5;
                    a.x -= nx * push;
                    a.y -= ny * push;
                    b.x += nx * push;
                    b.y += ny * push;
                }
            }
        }
    }

    /**
     * 阵型编辑器扩展棋盘：同一 board 内四邻接格键（与 flatten 的 edge/col/row 一致）。
     * @returns {string[]}
     */
    function getStgFormationNeighborCellKeys(edge, col, row) {
        const out = [];
        const c0 = col | 0;
        const r0 = row | 0;
        const dirs = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1]
        ];
        for (let d = 0; d < dirs.length; d++) {
            const nc = c0 + dirs[d][0];
            const nr = r0 + dirs[d][1];
            if (nc >= 0 && nc < GRID_COLS && nr >= 0 && nr < GRID_ROWS) {
                out.push(String(edge) + '|' + nc + '|' + nr);
            }
        }
        return out;
    }

    /**
     * 本波阵型同时生成后：按「相邻格 + 同多段组(A/B)」建并查集，写入 stgWaypointQueueId。
     * @param {Array<StgEnemy>} spawned
     */
    function assignStgWaypointFormationQueues(spawned) {
        if (!spawned || spawned.length === 0) return;

        function assignOneMode(mode) {
            /** @type {Map<string, StgEnemy[]>} */
            const cellsToEnemies = new Map();
            for (let i = 0; i < spawned.length; i++) {
                const e = spawned[i];
                if (!e || e.alive === false) continue;
                if (e.stgMoveMode !== mode) continue;
                if (!e.stgFormationCellKey) continue;
                if (!e.stgWaypointWorld || e.stgWaypointWorld.length === 0) continue;
                const k = e.stgFormationCellKey;
                if (!cellsToEnemies.has(k)) cellsToEnemies.set(k, []);
                cellsToEnemies.get(k).push(e);
            }
            const keys = Array.from(cellsToEnemies.keys());
            if (keys.length === 0) return;
            /** @type {Map<string, string>} */
            const parent = new Map();
            function find(k) {
                if (!parent.has(k)) parent.set(k, k);
                let p = parent.get(k);
                if (p !== k) {
                    p = find(p);
                    parent.set(k, p);
                }
                return p;
            }
            function union(ka, kb) {
                const ra = find(ka);
                const rb = find(kb);
                if (ra !== rb) parent.set(ra, rb);
            }
            for (let i = 0; i < keys.length; i++) find(keys[i]);
            for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                const parts = String(k).split('|');
                const edge = parts[0];
                const col = parseInt(parts[1], 10) || 0;
                const row = parseInt(parts[2], 10) || 0;
                const neigh = getStgFormationNeighborCellKeys(edge, col, row);
                for (let n = 0; n < neigh.length; n++) {
                    if (cellsToEnemies.has(neigh[n])) union(k, neigh[n]);
                }
            }
            /** @type {Map<string, number>} */
            const rootToId = new Map();
            for (let i = 0; i < keys.length; i++) {
                const r = find(keys[i]);
                if (!rootToId.has(r)) {
                    rootToId.set(r, stgNextWaypointQueueId++);
                }
                const id = rootToId.get(r);
                const arr = cellsToEnemies.get(keys[i]);
                for (let j = 0; j < arr.length; j++) {
                    arr[j].stgWaypointQueueId = id;
                }
            }
        }

        assignOneMode('waypoint_a');
        assignOneMode('waypoint_b');
    }

    /**
     * 是否已「抵达当前目标信标」（用于队列同步：仅信标到达拉齐，不比较段内 u 快慢）。
     * @returns {0|1|2} 0=仍在飞向当前信标；1=已落点（停留或本段走完）；2=路径已结束 moveIdle
     */
    function stgWaypointBeaconArrivalSub(e) {
        if (!e) return 0;
        if (e.moveIdle) return 2;
        const wps = e.stgWaypointWorld;
        if (!wps || !wps.length) return 0;
        const idx = e.stgWaypointIndex != null ? e.stgWaypointIndex | 0 : 0;
        if (idx >= wps.length) return 2;
        if (e.stgWaypointDwellUntilMs != null) return 1;
        const u = e.stgWaypointSegU != null ? e.stgWaypointSegU : 0;
        if (u >= 1 - 1e-8) return 1;
        return 0;
    }

    /** @returns {number} 正数表示 a 比 b 沿路径更靠前 */
    function cmpStgWaypointQueueProgress(a, b) {
        if (!a || !b) return 0;
        if (a.stgWaypointWorld !== b.stgWaypointWorld) return 0;
        if (a.moveIdle && !b.moveIdle) return 1;
        if (!a.moveIdle && b.moveIdle) return -1;
        const wps = a.stgWaypointWorld;
        if (!wps || !wps.length) return 0;
        const ia = a.stgWaypointIndex != null ? a.stgWaypointIndex | 0 : 0;
        const ib = b.stgWaypointIndex != null ? b.stgWaypointIndex | 0 : 0;
        if (ia !== ib) return ia - ib;
        return stgWaypointBeaconArrivalSub(a) - stgWaypointBeaconArrivalSub(b);
    }

    function copyStgWaypointStateFromLeader(leader, follower) {
        follower.x = leader.x;
        follower.y = leader.y;
        follower.stgWaypointIndex = leader.stgWaypointIndex;
        follower.stgWaypointSegPx = leader.stgWaypointSegPx;
        follower.stgWaypointSegPy = leader.stgWaypointSegPy;
        follower.stgWaypointSegU = leader.stgWaypointSegU;
        follower.stgWaypointDwellUntilMs = leader.stgWaypointDwellUntilMs;
        follower._stgWpReachedIdx = leader._stgWpReachedIdx;
        follower.moveIdle = leader.moveIdle;
    }

    /**
     * 每帧在全体位移更新之后：同一队列内取路径最前者，把尚未到达同信标者拉齐（视为同时到达）。
     */
    function applyStgWaypointQueueBeaconSync(enemyArr) {
        if (!enemyArr || enemyArr.length < 2) return;
        /** @type {Map<string, StgEnemy[]>} */
        const groups = new Map();
        for (let i = 0; i < enemyArr.length; i++) {
            const e = enemyArr[i];
            if (!e || !e.alive) continue;
            const qid = e.stgWaypointQueueId;
            if (qid == null) continue;
            if (e.stgMoveMode !== 'waypoint_a' && e.stgMoveMode !== 'waypoint_b') continue;
            const key = String(qid) + '|' + e.stgMoveMode;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(e);
        }
        groups.forEach((list) => {
            if (list.length < 2) return;
            let leader = list[0];
            for (let j = 1; j < list.length; j++) {
                if (cmpStgWaypointQueueProgress(list[j], leader) > 0) leader = list[j];
            }
            for (let j = 0; j < list.length; j++) {
                const f = list[j];
                if (f === leader) continue;
                if (cmpStgWaypointQueueProgress(leader, f) > 0) {
                    copyStgWaypointStateFromLeader(leader, f);
                }
            }
        });
    }

    function clampStgMainCol(v) {
        const n = parseInt(v, 10);
        if (!Number.isFinite(n)) return null;
        return Math.max(0, Math.min(GRID_COLS - 1, n));
    }
    function clampStgMainRow(v) {
        const n = parseInt(v, 10);
        if (!Number.isFinite(n)) return null;
        return Math.max(0, Math.min(GRID_ROWS - 1, n));
    }

    /**
     * 弧线：起点=主棋盘第 0 行 + 阵型摆放列（stgFormationMainCol）；先竖直再水平对齐格心；
     * 终点列=到达起点后据 x 自动选第 0 列或最后一列（近者）；终点行=编辑器 stgArcExitRow。
     */
    function initStgEnemyArcEdgesApproach(e, sx, sy, def, cw, ch) {
        let mainCol = e.stgFormationMainCol != null ? clampStgMainCol(e.stgFormationMainCol) : null;
        if (mainCol == null) {
            mainCol = worldToMainGridCell(sx, sy).col;
        }
        const startRow = 0;
        let exitRow = clampStgMainRow(def.stgArcExitRow);
        if (exitRow == null) {
            exitRow = clampStgMainRow(def.stgArcMainEndRow);
        }
        if (exitRow == null) {
            exitRow = 10;
        }
        const pStart = getMainGridCellCenter(mainCol, startRow);
        e.arcMainStartCol = mainCol;
        e.arcMainStartRow = startRow;
        e.arcExitEdgeRow = exitRow;
        e.arcApproachStartX = pStart.x;
        e.arcApproachStartY = pStart.y;
        e.arcBulgeMain = Math.max(
            15,
            Math.min(
                280,
                def.stgArcBulge != null && Number.isFinite(Number(def.stgArcBulge))
                    ? Number(def.stgArcBulge)
                    : ((Number(def.stgArcBulge1) || 80) + (Number(def.stgArcBulge2) || 80)) * 0.5
            )
        );
        e.arcMovePhase = 'approach_v';
        e.arcPhase = 0;
        e.arcT = 0;
    }

    /**
     * 弧终点落在左/右靠边列时，纯贝塞尔切线易接近竖直，机体沿屏幕竖缘滑动，中心 x 穿不出边界。
     * 在切线单位向量上强制「最小水平外偏」后再归一化，保证离场段持续穿出画布。
     */
    function blendArcBezierTangentWithOutward(tx, ty, endCol, e) {
        const minHx = 0.48;
        let vx = tx;
        let vy = ty;
        if (endCol === 0) {
            vx = Math.min(vx, -minHx);
        } else if (endCol === GRID_COLS - 1) {
            vx = Math.max(vx, minHx);
        }
        const nlen = Math.hypot(vx, vy) || 1;
        e.arcExitVx = vx / nlen;
        e.arcExitVy = vy / nlen;
    }

    /**
     * 到达主棋盘第0行起点后：据 sx 与左右边缘列格心距离自动选第 0 列或最后一列，行=arcExitEdgeRow；再建二次贝塞尔与切线离场。
     */
    function buildStgEnemyArcBezierMain(e) {
        const sx = e.arcApproachStartX;
        const sy = e.arcApproachStartY;
        const exitRow = e.arcExitEdgeRow != null ? Math.max(0, Math.min(GRID_ROWS - 1, e.arcExitEdgeRow | 0)) : 10;
        const leftCx = getMainGridCellCenter(0, exitRow).x;
        const rightCx = getMainGridCellCenter(GRID_COLS - 1, exitRow).x;
        const endCol = Math.abs(sx - leftCx) <= Math.abs(sx - rightCx) ? 0 : GRID_COLS - 1;
        e.arcMainEndCol = endCol;
        e.arcMainEndRow = exitRow;
        const pEnd = getMainGridCellCenter(endCol, exitRow);
        const exitPx = pEnd.x;
        const exitPy = pEnd.y;
        const bulge = e.arcBulgeMain != null ? e.arcBulgeMain : 80;
        const dx = exitPx - sx;
        const dy = exitPy - sy;
        const dlen = Math.hypot(dx, dy);
        if (dlen < 4) {
            e.x = sx;
            e.y = sy;
            e.arcPhase = 2;
            /** 退化弧：沿左/右边缘法向水平穿出，避免默认向上贴缘无法离开画布 */
            e.arcExitVx = endCol === 0 ? -1 : 1;
            e.arcExitVy = 0;
            return;
        }
        const mx = (sx + exitPx) * 0.5;
        const my = (sy + exitPy) * 0.5;
        const px = -dy / dlen;
        const py = dx / dlen;
        e.arcPhase = 1;
        e.arcT = 0;
        e.arc1Sx = sx;
        e.arc1Sy = sy;
        e.arc1Cx = mx + px * bulge;
        e.arc1Cy = my + py * bulge;
        e.arc1Px = exitPx;
        e.arc1Py = exitPy;
        e.arcLen1 = approxQuadBezierLength(sx, sy, e.arc1Cx, e.arc1Cy, exitPx, exitPy, 32);
        const tx = 2 * (exitPx - e.arc1Cx);
        const ty = 2 * (exitPy - e.arc1Cy);
        const tlen = Math.hypot(tx, ty) || 1;
        /** 纯切线在靠边格心处常近似「沿上下缘滑动」，水平穿出分量不足会永远贴边；叠加强制外法向分量后再归一化 */
        blendArcBezierTangentWithOutward(tx / tlen, ty / tlen, endCol, e);
        console.log(
            '[STG] arc_edges 弧线段',
            '起点列',
            e.arcMainStartCol,
            '行0 → 边缘列',
            e.arcMainEndCol,
            '离场行',
            exitRow
        );
    }

    /**
     * BOSS「移动」模块目标点（px）：可选本波阵型信标格心，否则为归一化坐标 × 画布。
     */
    function resolveBossModuleMoveTargetPx(mv, cw, ch) {
        const kind = mv && mv.moveTargetKind === 'beacon' ? 'beacon' : 'norm';
        const rawKey = mv && mv.moveBeaconId != null ? String(mv.moveBeaconId).replace(/^__beacon_/, '') : '';
        const key = /^[ab][1-4]$/.test(rawKey) ? rawKey : '';
        if (kind === 'beacon' && key) {
            const map = stgCurrentWaveBeaconMap;
            const slot = map && map[key] != null ? map[key] : null;
            const p = slot && stgBeaconSlotToWorld(slot);
            if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
                return { tx: p.x, ty: p.y };
            }
        }
        const txN = mv && mv.targetXNorm != null ? Number(mv.targetXNorm) : 0.5;
        const tyN = mv && mv.targetYNorm != null ? Number(mv.targetYNorm) : 0.4;
        return {
            tx: cw * Math.max(0.02, Math.min(0.98, txN)),
            ty: ch * Math.max(0.02, Math.min(0.98, tyN))
        };
    }

    /**
     * STG 敌人位置更新（与怪物编辑器 stgMoveMode 一致）
     */
    function updateStgEnemyPosition(e, player, cw, ch, dtSec) {
        const nowSt = performance.now();
        if (e.stgStunUntil != null && nowSt < e.stgStunUntil) return;
        /** BOSS 模块栈：idle/attack 不主动位移；move 朝当前模块目标点 */
        if (e.stgBossConfigSnapshot && e._stgBossFsm) {
            const boss = normalizeStgBossModulesForRuntime(e.stgBossConfigSnapshot);
            const mods = boss.modules || [];
            if (mods.length === 0) {
                return;
            }
            const ii = Math.min(Math.max(0, e._stgBossFsm.moduleIndex | 0), mods.length - 1);
            const mod = mods[ii];
            if (!mod) {
                return;
            }
            const typ = mod.type === 'move' ? 'move' : mod.type === 'attack' ? 'attack' : 'idle';
            if (typ === 'idle' || typ === 'attack') {
                return;
            }
            if (typ === 'move') {
                const mv = mod;
                const { tx, ty } = resolveBossModuleMoveTargetPx(mv, cw, ch);
                const spdPx =
                    mv && mv.speedPx != null && Number.isFinite(Number(mv.speedPx))
                        ? Math.max(0, Number(mv.speedPx))
                        : e.speed;
                const step = spdPx * dtSec;
                const dx = tx - e.x;
                const dy = ty - e.y;
                const dist = Math.hypot(dx, dy) || 1;
                if (dist <= Math.max(2, step)) {
                    e.x = tx;
                    e.y = ty;
                } else {
                    e.x += (dx / dist) * step;
                    e.y += (dy / dist) * step;
                }
                return;
            }
        }
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
        /** 多段移动：沿直线弦按速率曲线插值；信标处可停留；段末再走向下一信标 */
        if (mode === 'waypoint_a' || mode === 'waypoint_b') {
            if (e.moveIdle) return;
            const wps = e.stgWaypointWorld;
            if (!wps || wps.length === 0) {
                e.moveIdle = true;
                return;
            }
            /** 停留在信标：不位移，等计时结束后再切下一段 */
            if (e.stgWaypointDwellUntilMs != null) {
                if (nowSt < e.stgWaypointDwellUntilMs) return;
                e.stgWaypointDwellUntilMs = null;
                const finishedAt =
                    e._stgWpReachedIdx != null ? e._stgWpReachedIdx | 0 : e.stgWaypointIndex != null ? e.stgWaypointIndex | 0 : 0;
                e._stgWpReachedIdx = undefined;
                const nextIdx = finishedAt + 1;
                e.stgWaypointIndex = nextIdx;
                if (nextIdx >= wps.length) {
                    e.moveIdle = true;
                    return;
                }
                e.stgWaypointSegPx = e.x;
                e.stgWaypointSegPy = e.y;
                e.stgWaypointSegU = 0;
            }

            let idx = e.stgWaypointIndex != null ? e.stgWaypointIndex | 0 : 0;
            if (idx >= wps.length) {
                e.moveIdle = true;
                return;
            }
            const bx = wps[idx].x;
            const by = wps[idx].y;
            const ax = e.stgWaypointSegPx != null ? e.stgWaypointSegPx : e.x;
            const ay = e.stgWaypointSegPy != null ? e.stgWaypointSegPy : e.y;
            const sdx = bx - ax;
            const sdy = by - ay;
            const segLen = Math.hypot(sdx, sdy);
            const curve = e.stgWaypointSpeedCurve || 'linear';

            if (segLen < 0.5) {
                e.x = bx;
                e.y = by;
                const dms = (e.stgWaypointDwellMs && e.stgWaypointDwellMs[idx]) || 0;
                if (dms > 0) {
                    e.stgWaypointDwellUntilMs = nowSt + dms;
                    e._stgWpReachedIdx = idx;
                } else {
                    e.stgWaypointIndex = idx + 1;
                    if (e.stgWaypointIndex >= wps.length) {
                        e.moveIdle = true;
                        return;
                    }
                    e.stgWaypointSegPx = e.x;
                    e.stgWaypointSegPy = e.y;
                    e.stgWaypointSegU = 0;
                }
                return;
            }

            let u = e.stgWaypointSegU != null ? e.stgWaypointSegU : 0;
            /** sp 已是 speed*dtSec（本帧位移），此处不得再乘 dtSec，否则 u 推进过慢、难以到达首段信标 */
            u += sp / segLen;
            if (u >= 1) {
                e.x = bx;
                e.y = by;
                e.stgWaypointSegU = 1;
                const dms = (e.stgWaypointDwellMs && e.stgWaypointDwellMs[idx]) || 0;
                if (dms > 0) {
                    e.stgWaypointDwellUntilMs = nowSt + dms;
                    e._stgWpReachedIdx = idx;
                } else {
                    e.stgWaypointIndex = idx + 1;
                    if (e.stgWaypointIndex >= wps.length) {
                        e.moveIdle = true;
                        return;
                    }
                    e.stgWaypointSegPx = e.x;
                    e.stgWaypointSegPy = e.y;
                    e.stgWaypointSegU = 0;
                }
                return;
            }
            const te = applyStgWaypointCurveT(u, curve);
            e.x = ax + sdx * te;
            e.y = ay + sdy * te;
            e.stgWaypointSegU = u;
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
        /** 锁 Y：仅沿竖直方向移动到目标 Y，X 不变；到位后静止 */
        if (mode === 'lock_y') {
            if (e.moveIdle) return;
            const ty = e.lockTargetY != null ? e.lockTargetY : e.anchorTy;
            const dy = ty - e.y;
            if (Math.abs(dy) <= 6) {
                e.y = ty;
                e.moveIdle = true;
            } else {
                const step = Math.min(sp, Math.abs(dy));
                e.y += dy > 0 ? step : -step;
            }
            return;
        }
        /** 锁 X：仅沿水平方向移动到目标 X，Y 不变；到位后静止 */
        if (mode === 'lock_x') {
            if (e.moveIdle) return;
            const tx = e.lockTargetX != null ? e.lockTargetX : e.anchorTx;
            const dx = tx - e.x;
            if (Math.abs(dx) <= 6) {
                e.x = tx;
                e.moveIdle = true;
            } else {
                const step = Math.min(sp, Math.abs(dx));
                e.x += dx > 0 ? step : -step;
            }
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
            const eps = 2;
            const ap = e.arcMovePhase || 'approach_v';
            if (ap === 'approach_v') {
                const ty = e.arcApproachStartY != null ? e.arcApproachStartY : e.y;
                const dy = ty - e.y;
                if (Math.abs(dy) <= eps) {
                    e.y = ty;
                    e.arcMovePhase = 'approach_h';
                } else {
                    const step = Math.min(sp, Math.abs(dy));
                    e.y += dy > 0 ? step : -step;
                }
                return;
            }
            if (ap === 'approach_h') {
                const tx = e.arcApproachStartX != null ? e.arcApproachStartX : e.x;
                const dx = tx - e.x;
                if (Math.abs(dx) <= eps) {
                    e.x = tx;
                    e.arcMovePhase = 'arc';
                    buildStgEnemyArcBezierMain(e);
                } else {
                    const step = Math.min(sp, Math.abs(dx));
                    e.x += dx > 0 ? step : -step;
                }
                return;
            }
            if (e.arcPhase === 1) {
                const len = Math.max(e.arcLen1, 60);
                e.arcT += sp / len;
                if (e.arcT >= 1) {
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
        const ldh = o.lifeDmgHalves != null ? (o.lifeDmgHalves >= 2 ? 2 : 1) : 1;
        enemyBullets.push({
            x: o.x,
            y: o.y,
            vx: o.vx,
            vy: o.vy,
            dmg: o.dmg,
            /** 对自机生命格：1=半格，2=整格 */
            lifeDmgHalves: ldh,
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
            homingStr: o.homingStr != null ? o.homingStr : 0,
            /** 非空则尝试用 art_assets/bullets 下位图绘制 */
            sprite: o.sprite != null && String(o.sprite).trim() !== '' ? sanitizeStgEnemyBulletSpriteName(String(o.sprite)) : '',
            /** 绘制时若 sprite 丢失可回退到 getEnemyTypeMap()[typeId].stgEnemyBulletSprite */
            typeId: o.typeId != null && String(o.typeId).trim() !== '' ? String(o.typeId) : 'normal',
            /** 敌弹擦弹状态：支持多次触发（按冷却） */
            _stgGrazed: false,
            /** 该弹上次擦弹时刻（毫秒），用于多次擦弹冷却 */
            _stgGrazeLastMs: -1e9,
            /** 擦弹后短暂高亮时刻（毫秒） */
            _stgGrazeHighlightUntil: 0
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
     * 连射速率乘区：「扩散波」时越靠后的波次越快，相邻波次的速度差递减（ease-out）
     * @param {StgEnemy} e
     * @param {number} volleyIdx 当前第几发（0 起）
     * @param {number} totalVolleys 本周期连射总数
     */
    function getEnemyBurstSpeedMult(e, volleyIdx, totalVolleys) {
        if (totalVolleys <= 1) return 1;
        if (e.stgBurstSpeedMode !== 'spread_wave') return 1;
        const t = volleyIdx / Math.max(1, totalVolleys - 1);
        return 0.75 + 0.5 * (1 - Math.pow(1 - t, 2));
    }

    /**
     * 发射一整轮弹幕（单发/扇/环/激光中的一轮）；连射时由 volleyIdx/totalVolleys 控制弹速乘区
     * @param {StgEnemy} e
     * @param {{x:number,y:number}} player
     * @param {number} volleyIdx
     * @param {number} totalVolleys
     */
    function emitStgEnemyAttackVolley(e, player, volleyIdx, totalVolleys) {
        const style = e.stgEmitStyle || 'single';
        const spdMult = getEnemyBurstSpeedMult(e, volleyIdx, totalVolleys);
        const rawBulletSpd =
            e.stgEnemyBulletSpeed != null && Number.isFinite(Number(e.stgEnemyBulletSpeed))
                ? Math.max(40, Number(e.stgEnemyBulletSpeed))
                : e.enemyBulletSpeed;
        const bsp = rawBulletSpd * spdMult;
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
        const childSp = e.stgSplitChildSpeed * spdMult;
        const hom = e.stgHomingStrength != null ? Math.max(0, Math.min(100, e.stgHomingStrength)) : 0;
        const bulletR = e.stgEnemyBulletRadius != null ? e.stgEnemyBulletRadius : 5;
        const bulletShape = e.stgEnemyBulletShape === 'triangle' ? 'triangle' : 'circle';
        /** 贴图以种类表为准（与实例字段双保险），避免存档/旧实例上 stgEnemyBulletSprite 未带上 */
        const typesMapEmit = getEnemyTypeMap();
        const tidEmit = e.typeId != null && String(e.typeId).trim() !== '' ? String(e.typeId) : 'normal';
        /** BOSS token 不在种类表里：若用 normal 的贴图会误套小怪图，仅采用实例上弹幕方案写入的贴图 */
        let spFromMap = '';
        if (tidEmit.indexOf('__boss_') !== 0) {
            const defEmit = typesMapEmit[tidEmit] || typesMapEmit.normal;
            spFromMap =
                defEmit && defEmit.stgEnemyBulletSprite != null && String(defEmit.stgEnemyBulletSprite).trim() !== ''
                    ? String(defEmit.stgEnemyBulletSprite)
                    : '';
        }
        const spFromInst = e.stgEnemyBulletSprite != null && String(e.stgEnemyBulletSprite).trim() !== '' ? String(e.stgEnemyBulletSprite) : '';
        const spMerged = spFromMap || spFromInst;
        const bulletExtra = { radius: bulletR, shape: bulletShape, typeId: tidEmit };
        if (spMerged) {
            const sn = sanitizeStgEnemyBulletSpriteName(spMerged);
            if (sn) bulletExtra.sprite = sn;
        }
        const lifeHalves = resolveStgBulletLifeDamageHalvesFromEnemy(e);

        if (style === 'laser') {
            const len = e.stgLaserLength;
            const width = e.stgLaserWidth;
            /** 扩散波：波次越快，激光持续略短，形成「一浪快过一浪」 */
            const baseDur = e.stgLaserDurationMs;
            const dur = Math.max(
                80,
                Math.min(3500, Math.round(baseDur / Math.max(0.5, spdMult)))
            );
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
                    lifeDmgHalves: lifeHalves,
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
                    lifeDmgHalves: lifeHalves,
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
                lifeDmgHalves: lifeHalves,
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
                lifeDmgHalves: lifeHalves,
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

    /**
     * 按种类配置发射：扇形 / 环形 / 直线激光 / 单发；可连射（战斗中按间隔续发）
     * @param {StgEnemy} e
     * @param {{x:number,y:number}} player
     */
    function emitStgEnemyAttack(e, player) {
        /** 死后弹幕：仅一轮，不调度连射（敌实例即将移除） */
        const deathOnce = e.stgEmitWhen === 'on_death';
        const burstTotal = deathOnce
            ? 1
            : Math.max(1, Math.min(16, e.stgBurstCount != null ? e.stgBurstCount : 1));
        emitStgEnemyAttackVolley(e, player, 0, burstTotal);
        if (!deathOnce && burstTotal > 1) {
            const iv = Math.max(40, Math.min(500, e.stgBurstIntervalMs != null ? e.stgBurstIntervalMs : 100));
            e._stgBurstRemain = burstTotal - 1;
            e._stgBurstNextMs = performance.now() + iv;
            e._stgBurstIndex = 1;
            e._stgBurstTotal = burstTotal;
        } else {
            e._stgBurstRemain = 0;
            if (!deathOnce) {
                notifyBossFirePatternCycleComplete(e);
            }
        }
    }

    function getUltChargeMeterThreshold() {
        return STG_ULT_CHARGE_METER_BASE / Math.max(0.25, bonusUltChargeMult);
    }

    /** 每充满一大招格追加 1 秒提示；同帧多格则时长累加 */
    function pushStgUltReadyHintOneSecond() {
        const now = performance.now();
        const base =
            stgUltReadyHintUntilMs != null && stgUltReadyHintUntilMs > now ? stgUltReadyHintUntilMs : now;
        stgUltReadyHintUntilMs = base + 1000;
    }

    /** 在已向 stgUltChargeMeter 加量之后调用：按阈值折算整格并触发飘字 */
    function applyStgUltChargeMeterOverflowAndHints() {
        const th = getUltChargeMeterThreshold();
        while (stgUltChargeMeter >= th && stgUltCharges < STG_ULT_CHARGE_MAX) {
            stgUltCharges++;
            stgUltChargeMeter -= th;
            pushStgUltReadyHintOneSecond();
        }
        if (stgUltCharges >= STG_ULT_CHARGE_MAX) stgUltChargeMeter = 0;
    }

    /**
     * 左上角生命：每「整格」一个小格，从左到右对应从满血侧扣减；格内可显示半格（与 stgLifeHalfUnitsRemain 一致）。
     * 不再使用 10 段连续比例条，避免与离散半格/整格伤害不同步。
     */
    function refreshStgLifeCellsHud() {
        const wrap = document.getElementById('stgPriorityHpCells');
        const detailEl = document.getElementById('stgPriorityHpDetail');
        if (!wrap) return;
        if (!player) {
            wrap.innerHTML = '';
            wrap.setAttribute('aria-label', stgUiT('hud.hpAriaIdle'));
            if (detailEl) detailEl.textContent = '—';
            return;
        }
        let cellsMax = player.stgLifeCellsMax != null ? player.stgLifeCellsMax | 0 : 0;
        if (!cellsMax || cellsMax < 1) {
            const mh = player.maxHp != null ? player.maxHp | 0 : 12;
            cellsMax = Math.max(1, Math.min(30, Math.round(mh / 2)));
        } else {
            cellsMax = Math.max(1, Math.min(30, cellsMax));
        }
        const maxHalf = cellsMax * 2;
        let H = player.stgLifeHalfUnitsRemain != null ? player.stgLifeHalfUnitsRemain | 0 : player.hp | 0;
        H = Math.max(0, Math.min(maxHalf, H));
        const curDisp = H % 2 === 1 ? Math.floor(H / 2) + '.5' : String(H / 2);
        wrap.setAttribute('aria-label', stgUiT('hud.hpAria', { cur: curDisp, max: String(cellsMax) }));
        if (detailEl) {
            detailEl.textContent = stgUiT('hud.hpDetail', { cur: curDisp, max: String(cellsMax) });
        }
        let cells = wrap.querySelectorAll('.stg-priority-cell');
        if (cells.length !== cellsMax) {
            wrap.innerHTML = '';
            for (let i = 0; i < cellsMax; i++) {
                const cell = document.createElement('span');
                cell.className = 'stg-priority-cell';
                cell.setAttribute('role', 'presentation');
                const inner = document.createElement('span');
                inner.className = 'stg-priority-cell-inner';
                cell.appendChild(inner);
                wrap.appendChild(cell);
            }
            cells = wrap.querySelectorAll('.stg-priority-cell');
        }
        for (let j = 0; j < cellsMax; j++) {
            const cell = cells[j];
            const inner = cell.querySelector('.stg-priority-cell-inner');
            if (H >= 2 * j + 2) {
                cell.classList.add('stg-priority-cell--on');
                cell.classList.remove('stg-priority-cell--half');
                if (inner) inner.style.width = '100%';
            } else if (H === 2 * j + 1) {
                cell.classList.remove('stg-priority-cell--on');
                cell.classList.add('stg-priority-cell--half');
                if (inner) inner.style.width = '50%';
            } else {
                cell.classList.remove('stg-priority-cell--on', 'stg-priority-cell--half');
                if (inner) inner.style.width = '0%';
            }
        }
    }

    /** 左侧优先条：经验 10 格（比例 0~1）；生命条请用 refreshStgLifeCellsHud */
    function refreshStgPrioritySegmentRow(wrapId, ratio) {
        const wrap = document.getElementById(wrapId);
        if (!wrap) return;
        const n = STG_PRIORITY_SEGMENTS;
        const scaled = Math.max(0, Math.min(1, ratio)) * n;
        const full = Math.floor(scaled);
        const frac = scaled - full;
        const cells = wrap.querySelectorAll('.stg-priority-cell');
        for (let i = 0; i < n; i++) {
            const cell = cells[i];
            if (!cell) continue;
            const inner = cell.querySelector('.stg-priority-cell-inner');
            if (i < full) {
                cell.classList.add('stg-priority-cell--on');
                cell.classList.remove('stg-priority-cell--next');
                if (inner) inner.style.width = '100%';
            } else if (i === full) {
                const isFull = frac >= 0.999;
                cell.classList.toggle('stg-priority-cell--on', isFull);
                cell.classList.toggle('stg-priority-cell--next', !isFull);
                if (inner) inner.style.width = Math.round(frac * 100) + '%';
            } else {
                cell.classList.remove('stg-priority-cell--on', 'stg-priority-cell--next');
                if (inner) inner.style.width = '0%';
            }
        }
    }

    /** 更新 HUD 五格方形与当前格内蓄能比例 */
    function refreshStgUltChargeHud() {
        const labelEl = document.getElementById('stgUltChargeLabel');
        const wrap = document.getElementById('stgUltChargeCells');
        if (labelEl) labelEl.textContent = stgUiT('hud.ultLabel');
        if (wrap) {
            wrap.setAttribute('aria-label', stgUiT('hud.ultAria'));
            const th = getUltChargeMeterThreshold();
            const pctNext = th > 0 ? Math.min(1, stgUltChargeMeter / th) : 0;
            const cells = wrap.querySelectorAll('.stg-hud-ult-cell');
            for (let i = 0; i < STG_ULT_CHARGE_MAX; i++) {
                const cell = cells[i];
                if (!cell) continue;
                const inner = cell.querySelector('.stg-hud-ult-cell-inner');
                const filled = i < stgUltCharges;
                const isNext = !filled && i === stgUltCharges;
                cell.classList.toggle('stg-hud-ult-cell--on', filled);
                cell.classList.toggle('stg-hud-ult-cell--next', isNext);
                if (inner) {
                    if (filled) inner.style.width = '100%';
                    else if (isNext) inner.style.width = Math.round(pctNext * 100) + '%';
                    else inner.style.width = '0%';
                }
            }
        }
    }

    function getHudElements() {
        return {
            priorityHpLabel: document.getElementById('stgPriorityHpLabel'),
            priorityExpLabel: document.getElementById('stgPriorityExpLabel'),
            priorityExpDetail: document.getElementById('stgPriorityExpDetail'),
            wave: document.getElementById('stgWaveText'),
            nextWave: document.getElementById('stgNextWaveText'),
            time: document.getElementById('stgTimeText'),
            upgrade: document.getElementById('stgUpgradeModalRoot'),
            upgradeCards: document.getElementById('stgUpgradeCards'),
            upgradeTitle: document.getElementById('stgUpgradeTitle'),
            upgradeSubHint: document.getElementById('stgUpgradeSubHint'),
            result: document.getElementById('stgResultOverlay'),
            resultTitle: document.getElementById('stgResultTitle'),
            resultMsg: document.getElementById('stgResultMsg'),
            chapterTransition: document.getElementById('stgChapterTransitionOverlay'),
            chapterTransitionTitle: document.getElementById('stgChapterTransitionTitle'),
            chapterTransitionMsg: document.getElementById('stgChapterTransitionMsg'),
            hintBar: document.getElementById('stgHintBar')
        };
    }

    function hideStgChapterTransitionOverlay() {
        const h = getHudElements();
        if (h.chapterTransition) {
            h.chapterTransition.classList.add('hidden');
        }
    }

    function loadStgBossConfigsDoc() {
        try {
            const raw = localStorage.getItem(STG_BOSS_CONFIG_KEY);
            if (!raw) return null;
            const o = JSON.parse(raw);
            return o && typeof o === 'object' && o.bosses && typeof o.bosses === 'object' ? o : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * 波次阵型格子 token `__boss_<bossId>`：用 BOSS 编辑器中的血量与「发射弹幕」首条方案的 stg* 字段覆盖；
     * 机体模板优先取自 tank，便于默认高血与大体型。
     * @returns {{ def: object, boss: object|null } | null} 非 BOSS token 时返回 null
     */
    function getStgBossSpawnDef(typeId, typesMap) {
        const prefix = '__boss_';
        if (!typeId || String(typeId).indexOf(prefix) !== 0) return null;
        const bossId = String(typeId).slice(prefix.length);
        const doc = loadStgBossConfigsDoc();
        const boss = doc && doc.bosses ? doc.bosses[bossId] : null;
        const baseKey = typesMap && typesMap.tank ? 'tank' : 'normal';
        const baseSrc = typesMap && typesMap[baseKey] ? typesMap[baseKey] : typesMap.normal;
        const def = { ...baseSrc };
        if (!boss) {
            console.warn('[STG] 未找到 BOSS 配置，bossId=', bossId);
            def.name = 'BOSS(?)';
            def.icon = '🐉';
            return { def, boss: null };
        }
        def.name = boss.name != null ? String(boss.name) : bossId;
        def.icon = '🐉';
        const hp =
            boss.hp != null && Number.isFinite(Number(boss.hp)) ? Math.max(1, Math.round(Number(boss.hp))) : def.defaultHealth;
        def.defaultHealth = hp;
        const nb = normalizeStgBossModulesForRuntime(boss);
        let p0 = null;
        if (nb.modules && nb.modules.length) {
            for (let mi = 0; mi < nb.modules.length; mi++) {
                const m = nb.modules[mi];
                if (m && m.type === 'attack' && Array.isArray(m.patterns) && m.patterns.length > 0) {
                    p0 = m.patterns[0];
                    break;
                }
            }
        }
        if (!p0 && boss.states && boss.states.fire && Array.isArray(boss.states.fire.patterns) && boss.states.fire.patterns[0]) {
            p0 = boss.states.fire.patterns[0];
        }
        if (p0 && typeof p0 === 'object') {
            Object.keys(p0).forEach((k) => {
                if (k === 'patternId' || k === 'label') return;
                if (k.indexOf('stg') === 0) def[k] = p0[k];
            });
        }
        return { def, boss };
    }

    /**
     * 旧版三态 states → modules[]；已在内存中归一化，不写回磁盘。
     */
    function normalizeStgBossModulesForRuntime(boss) {
        if (!boss || typeof boss !== 'object') return { modules: [] };
        if (Array.isArray(boss.modules) && boss.modules.length > 0) return boss;
        if (boss.states && typeof boss.states === 'object') {
            const st = boss.states;
            const modules = [];
            if (st.idle && typeof st.idle === 'object') {
                modules.push({
                    type: 'idle',
                    moduleId: 'legacy_idle',
                    durationMs: Math.max(0, parseInt(st.idle.durationMs, 10) || 0)
                });
            }
            if (st.move && typeof st.move === 'object') {
                const m = st.move;
                modules.push({
                    type: 'move',
                    moduleId: 'legacy_move',
                    durationMs: Math.max(0, parseInt(m.durationMs, 10) || 0),
                    speedPx: m.speedPx != null ? Number(m.speedPx) : 90,
                    moveTargetKind: 'norm',
                    moveBeaconId: 'a1',
                    targetXNorm: m.targetXNorm != null ? Number(m.targetXNorm) : 0.5,
                    targetYNorm: m.targetYNorm != null ? Number(m.targetYNorm) : 0.38
                });
            }
            if (st.fire && typeof st.fire === 'object') {
                const f = st.fire;
                modules.push({
                    type: 'attack',
                    moduleId: 'legacy_attack',
                    durationMs: Math.max(0, parseInt(f.durationMs, 10) || 0),
                    patternPick: f.patternPick === 'random' ? 'random' : 'sequence',
                    patterns: Array.isArray(f.patterns) ? f.patterns : []
                });
            }
            if (modules.length > 0) return { ...boss, modules };
        }
        return { ...boss, modules: [{ type: 'idle', moduleId: 'fallback', durationMs: 1000 }] };
    }

    /**
     * 将 BOSS 弹幕方案中的 stg* 字段写入敌机实例，并同步 e.pattern（与 resolveStgBulletPattern 一致）
     */
    function applyBossPatternSnapshotToEnemy(e, p) {
        if (!e || !p || typeof p !== 'object') return;
        Object.keys(p).forEach((k) => {
            if (k === 'patternId' || k === 'label') return;
            if (k.indexOf('stg') !== 0) return;
            e[k] = p[k];
        });
        /** 发射逻辑读 enemyBulletSpeed；仅写 stgEnemyBulletSpeed 时弹速不变 */
        if (p.stgEnemyBulletSpeed != null && Number.isFinite(Number(p.stgEnemyBulletSpeed))) {
            e.enemyBulletSpeed = Math.max(40, Number(p.stgEnemyBulletSpeed));
        }
        e.pattern = resolveStgBulletPattern({ stgBulletPattern: p.stgBulletPattern });
    }

    function notifyBossFirePatternCycleComplete(e) {
        if (!e._stgBossFsm || !e.stgBossConfigSnapshot) return;
        const boss = normalizeStgBossModulesForRuntime(e.stgBossConfigSnapshot);
        const mods = boss.modules || [];
        if (mods.length === 0) return;
        const i = Math.min(Math.max(0, e._stgBossFsm.moduleIndex | 0), mods.length - 1);
        const mod = mods[i];
        if (!mod || mod.type !== 'attack') return;
        const patterns = Array.isArray(mod.patterns) ? mod.patterns : [];
        if (patterns.length <= 1) return;
        const pick = mod.patternPick === 'random' ? 'random' : 'sequence';
        let idx;
        if (pick === 'random') {
            idx = Math.floor(Math.random() * patterns.length);
        } else {
            idx = ((e._stgBossFsm.firePatternIdx | 0) + 1) % patterns.length;
        }
        e._stgBossFsm.firePatternIdx = idx;
        applyBossPatternSnapshotToEnemy(e, patterns[idx]);
    }

    function onStgBossModuleEnter(e, mod) {
        e._stgBurstRemain = 0;
        e._stgBurstNextMs = 0;
        if (!mod || !e._stgBossFsm) return;
        if (mod.type === 'attack') {
            const patterns = Array.isArray(mod.patterns) ? mod.patterns : [];
            if (patterns.length === 0) {
                e.pattern = 'none';
                return;
            }
            const pick = mod.patternPick === 'random' ? 'random' : 'sequence';
            let idx = 0;
            if (pick === 'random') {
                idx = Math.floor(Math.random() * patterns.length);
            }
            e._stgBossFsm.firePatternIdx = idx;
            e._stgBossFsm.firePatternPick = pick;
            applyBossPatternSnapshotToEnemy(e, patterns[idx]);
        } else {
            e.pattern = 'none';
        }
    }

    function initStgBossFsmOnEnemy(e) {
        const boss = normalizeStgBossModulesForRuntime(e.stgBossConfigSnapshot);
        if (!boss || !boss.modules || boss.modules.length === 0) return;
        e._stgBossFsm = {
            moduleIndex: 0,
            enterMs: performance.now(),
            firePatternIdx: 0,
            firePatternPick: 'sequence'
        };
        e.stgMoveMode = 'homing_legacy';
        e.moveIdle = false;
        onStgBossModuleEnter(e, boss.modules[0]);
    }

    /**
     * BOSS 模块栈：按顺序执行 modules[]，每条 durationMs 后进入下一条，最后一条后回到第一条。
     */
    function tickStgBossFsm(e, nowT) {
        const boss = normalizeStgBossModulesForRuntime(e.stgBossConfigSnapshot);
        if (!boss.modules || boss.modules.length === 0) return;
        let fsm = e._stgBossFsm;
        if (!fsm) {
            initStgBossFsmOnEnemy(e);
            fsm = e._stgBossFsm;
        }
        if (!fsm) return;
        const mods = boss.modules;
        const n = mods.length;
        let guard = 0;
        while (guard++ < 32) {
            const i = Math.min(Math.max(0, fsm.moduleIndex | 0), n - 1);
            const mod = mods[i];
            if (!mod) break;
            const rawDur = mod.durationMs != null ? Number(mod.durationMs) : 3000;
            const dur = Number.isFinite(rawDur) ? Math.max(0, rawDur) : 3000;
            const elapsed = nowT - fsm.enterMs;
            if (elapsed < dur) break;
            fsm.moduleIndex = (i + 1) % n;
            fsm.enterMs = nowT;
            onStgBossModuleEnter(e, mods[fsm.moduleIndex]);
            if (dur > 0) break;
        }
    }

    function isStgBossInAttackModule(e) {
        if (!e._stgBossFsm || !e.stgBossConfigSnapshot) return false;
        const boss = normalizeStgBossModulesForRuntime(e.stgBossConfigSnapshot);
        const mods = boss.modules || [];
        if (mods.length === 0) return false;
        const i = Math.min(Math.max(0, e._stgBossFsm.moduleIndex | 0), mods.length - 1);
        return !!(mods[i] && mods[i].type === 'attack');
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
                stgEnemyBulletShape: 'circle',
                /** 默认使用 art_assets/bullets 下贴图；怪物编辑器可清空改回矢量圆 */
                stgEnemyBulletSprite: 'enemy_round_red.jpg',
                stgBurstCount: 1,
                stgBurstIntervalMs: 100,
                stgBurstSpeedMode: 'average',
                stgContactDamagePlayer: true
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
                stgEnemyBulletShape: 'circle',
                stgEnemyBulletSprite: '',
                stgBurstCount: 1,
                stgBurstIntervalMs: 100,
                stgBurstSpeedMode: 'average',
                stgContactDamagePlayer: true
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
                stgEnemyBulletShape: 'circle',
                stgEnemyBulletSprite: '',
                stgBurstCount: 1,
                stgBurstIntervalMs: 100,
                stgBurstSpeedMode: 'average',
                stgContactDamagePlayer: true
            }
        };
        let saved = null;
        try {
            const raw = localStorage.getItem(MONSTER_STORAGE_KEY);
            if (raw) saved = JSON.parse(raw);
        } catch (e) {
            console.warn('[STG] 读取怪物编辑器存档失败', e);
        }
        const file = stgBundledEnemyTypesFromFile;
        if (file && typeof file === 'object') {
            saved = saved && typeof saved === 'object' ? { ...file, ...saved } : { ...file };
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
                stgEnemyBulletShape: 'circle',
                stgEnemyBulletSprite: '',
                stgBurstCount: 1,
                stgBurstIntervalMs: 100,
                stgBurstSpeedMode: 'average',
                stgContactDamagePlayer: true
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
                stgBurstCount:
                    s.stgBurstCount != null ? Math.max(1, Math.min(16, s.stgBurstCount)) : b.stgBurstCount != null ? b.stgBurstCount : 1,
                stgBurstIntervalMs:
                    s.stgBurstIntervalMs != null
                        ? Math.max(40, Math.min(500, s.stgBurstIntervalMs))
                        : b.stgBurstIntervalMs != null
                          ? b.stgBurstIntervalMs
                          : 100,
                stgBurstSpeedMode:
                    (s.stgBurstSpeedMode === 'spread_wave' || (s.stgBurstSpeedMode == null && b.stgBurstSpeedMode === 'spread_wave'))
                        ? 'spread_wave'
                        : 'average',
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
                    s.stgMoveMode === 'horizontal_right' ||
                    s.stgMoveMode === 'lock_y' ||
                    s.stgMoveMode === 'lock_x' ||
                    s.stgMoveMode === 'waypoint_a' ||
                    s.stgMoveMode === 'waypoint_b'
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
                stgLockTargetYNorm:
                    s.stgLockTargetYNorm != null ? Math.max(0.02, Math.min(0.98, s.stgLockTargetYNorm)) : b.stgLockTargetYNorm,
                stgLockTargetXNorm:
                    s.stgLockTargetXNorm != null ? Math.max(0.02, Math.min(0.98, s.stgLockTargetXNorm)) : b.stgLockTargetXNorm,
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
                          : 'circle',
                stgEnemyBulletSprite: (() => {
                    /** 存档里显式写空串：仅矢量，不回退到内置 enemy_round_red.jpg（与贴图编辑器「清除贴图」一致） */
                    if (s.stgEnemyBulletSprite !== undefined && s.stgEnemyBulletSprite !== null) {
                        const raw = String(s.stgEnemyBulletSprite);
                        if (raw.trim() === '') return '';
                        const sn = sanitizeStgEnemyBulletSpriteName(raw);
                        if (sn) return sn;
                    }
                    const fb = b.stgEnemyBulletSprite != null ? String(b.stgEnemyBulletSprite) : '';
                    return sanitizeStgEnemyBulletSpriteName(fb);
                })(),
                /** 击杀额外掉落充能点（怪物编辑器）；此前合并遗漏会导致勾选永远不生效 */
                stgDropChargePickup: !!s.stgDropChargePickup,
                stgChargeDropMult:
                    s.stgChargeDropMult != null && Number.isFinite(Number(s.stgChargeDropMult))
                        ? Math.max(0.25, Math.min(4, Number(s.stgChargeDropMult)))
                        : 1,
                stgContactDamagePlayer: s.stgContactDamagePlayer === false ? false : true,
                stgWaypointSpeedCurve: normalizeStgWaypointSpeedCurve(
                    s.stgWaypointSpeedCurve != null ? s.stgWaypointSpeedCurve : b.stgWaypointSpeedCurve
                ),
                stgWaypointDwellMs: (() => {
                    if (s.stgWaypointDwellMs != null) return parseStgWaypointDwellMsFromDef(s);
                    return parseStgWaypointDwellMsFromDef(b);
                })()
            };
        });
        return out;
    }

    /** 与波次阵型编辑器一致：旧版全局公式 base + k*lin + k²*acc（已改为每波 enemyHpMult；此结构仍存盘作兼容） */
    const DEFAULT_ENEMY_HP_SCALE = { baseMult: 1, linearPerWave: 0, accelPerWaveSq: 0 };

    /**
     * 旧档 wave 未写 enemyHpMult 时，用存档里的全局系数按波次索引算一条倍率写入内存，避免无字段时难度突变。
     */
    function attachLegacyEnemyHpMultIfMissing(waves, enemyHpScale) {
        if (!waves || !Array.isArray(waves)) return waves;
        const s = normalizeWaveDataEnemyHpScale(enemyHpScale);
        return waves.map((w, i) => {
            if (!w || typeof w !== 'object') return w;
            if (w.enemyHpMult != null && Number.isFinite(Number(w.enemyHpMult))) return w;
            const kk = Math.max(0, i | 0);
            let m = s.baseMult + s.linearPerWave * kk + s.accelPerWaveSq * kk * kk;
            m = Math.max(0.05, Math.min(500, m));
            return { ...w, enemyHpMult: m };
        });
    }

    function normalizeWaveDataEnemyHpScale(raw) {
        const o = raw && typeof raw === 'object' ? raw : {};
        const baseMult = o.baseMult != null && Number.isFinite(Number(o.baseMult)) ? Number(o.baseMult) : 1;
        const linearPerWave =
            o.linearPerWave != null && Number.isFinite(Number(o.linearPerWave)) ? Number(o.linearPerWave) : 0;
        const accelPerWaveSq =
            o.accelPerWaveSq != null && Number.isFinite(Number(o.accelPerWaveSq)) ? Number(o.accelPerWaveSq) : 0;
        return {
            baseMult: Math.max(0.05, Math.min(100, baseMult)),
            linearPerWave: Math.max(-5, Math.min(5, linearPerWave)),
            accelPerWaveSq: Math.max(-2, Math.min(2, accelPerWaveSq))
        };
    }

    /**
     * 阵型编辑器「停火行」：主棋盘从上往下第几行（1=最上行），敌人中心 Y≥该行下沿时不再发射战斗弹幕；null=不启用
     */
    function normalizeWaveDataEnemyFireStopRow(raw) {
        if (raw === '' || raw == null) return null;
        const n = parseInt(Number(raw), 10);
        if (!Number.isFinite(n) || n < 1 || n > GRID_ROWS) return null;
        return n;
    }

    /** 旧存档：仅像素线、无行号时，按当前格高换算成行 */
    function migrateLegacyEnemyFireStopLineYToRowIfNeeded() {
        if (normalizeWaveDataEnemyFireStopRow(waveData && waveData.enemyFireStopRow) != null) return;
        const ly = waveData && waveData.enemyFireStopLineY;
        if (ly == null || !Number.isFinite(Number(ly))) return;
        const cs = cellSize > 0 ? cellSize : 45;
        const row = Math.max(1, Math.min(GRID_ROWS, Math.round(Number(ly) / cs)));
        waveData.enemyFireStopRow = row;
    }

    /**
     * 停火几何线 Y（px）：第 N 行下沿 = N×格高（与棋盘横线对齐）；随 cellSize 变化自动跟手
     * @returns {number|null}
     */
    function getStgEnemyFireStopLineYClamped(ch) {
        migrateLegacyEnemyFireStopLineYToRowIfNeeded();
        const rn = normalizeWaveDataEnemyFireStopRow(waveData && waveData.enemyFireStopRow);
        if (rn == null) return null;
        const cs = cellSize > 0 ? cellSize : Math.max(1, ch / GRID_ROWS);
        const yLine = rn * cs;
        return Math.min(Math.max(0, ch), yLine);
    }

    /**
     * 单波血量倍率：来自波次阵型编辑器「本波敌人血量倍率」（相对怪物编辑器基础血）。
     * 全局 enemyHpScale 公式已暂时禁用，仅保留读档字段以兼容旧存档。
     * @param {number} k 当前波次索引（第 1 波为 0）
     */
    function getStgEnemyHpMultiplierForWaveIndex(k) {
        const waves = waveData && waveData.waves;
        const kk = Math.max(0, k | 0);
        if (!waves || !Array.isArray(waves) || kk >= waves.length) {
            return 1;
        }
        const w = waves[kk];
        const raw = w && w.enemyHpMult != null ? Number(w.enemyHpMult) : 1;
        const m = Number.isFinite(raw) ? raw : 1;
        return Math.max(0.05, Math.min(500, m));
    }

    /**
     * 将磁盘 JSON 归一化为运行时用的 root（多章）；每章 waves 已套 legacy 血量补全。
     */
    function normalizeStoredWavePackToRoot(d) {
        if (!d || typeof d !== 'object') return null;
        const hpNorm = normalizeWaveDataEnemyHpScale(d.enemyHpScale);
        const fireRow = normalizeWaveDataEnemyFireStopRow(d.enemyFireStopRow);
        const mkChapter = (wavesIn, um) => ({
            waves: attachLegacyEnemyHpMultIfMissing(Array.isArray(wavesIn) ? wavesIn : [], hpNorm),
            upgradeMomentsAfterWave: um
        });
        const pud =
            d.postUpgradeSpawnDelaySec != null && Number.isFinite(Number(d.postUpgradeSpawnDelaySec))
                ? Math.max(0, Math.min(60, Number(d.postUpgradeSpawnDelaySec)))
                : undefined;
        if (Array.isArray(d.chapters) && d.chapters.length > 0) {
            const chapters = d.chapters.map((ch) => mkChapter(ch && ch.waves, ch && ch.upgradeMomentsAfterWave));
            return {
                chapters,
                enemyHpScale: hpNorm,
                enemyFireStopRow: fireRow,
                enemyFireStopLineY: d.enemyFireStopLineY,
                postUpgradeSpawnDelaySec: pud
            };
        }
        if (Array.isArray(d.waves) && d.waves.length > 0) {
            return {
                chapters: [mkChapter(d.waves, d.upgradeMomentsAfterWave)],
                enemyHpScale: hpNorm,
                enemyFireStopRow: fireRow,
                enemyFireStopLineY: d.enemyFireStopLineY,
                postUpgradeSpawnDelaySec: pud
            };
        }
        return null;
    }

    function waveDataSliceFromRoot(root, chIdx) {
        const ch = root.chapters[chIdx];
        if (!ch) return null;
        const o = {
            waves: ch.waves,
            enemyHpScale: root.enemyHpScale,
            enemyFireStopRow: normalizeWaveDataEnemyFireStopRow(root.enemyFireStopRow)
        };
        if (root.enemyFireStopLineY != null && Number.isFinite(Number(root.enemyFireStopLineY))) {
            o.enemyFireStopLineY = Number(root.enemyFireStopLineY);
        }
        const um = ch.upgradeMomentsAfterWave;
        if (um !== undefined && um !== null) {
            o.upgradeMomentsAfterWave = Array.isArray(um)
                ? um.map((x) => parseInt(Number(x), 10)).filter((n) => Number.isFinite(n))
                : null;
        }
        if (root.postUpgradeSpawnDelaySec != null && Number.isFinite(Number(root.postUpgradeSpawnDelaySec))) {
            o.postUpgradeSpawnDelaySec = Math.max(0, Math.min(60, Number(root.postUpgradeSpawnDelaySec)));
        }
        return o;
    }

    /** 单章 waveData 写入 root（用于旧档/默认仅 pack 了一章时） */
    function assignRootFromSingleWaveData(wd) {
        if (!wd || !wd.waves) return;
        stgWavePackRoot = {
            chapters: [{
                waves: wd.waves,
                upgradeMomentsAfterWave: wd.upgradeMomentsAfterWave
            }],
            enemyHpScale: wd.enemyHpScale,
            enemyFireStopRow: wd.enemyFireStopRow,
            enemyFireStopLineY: wd.enemyFireStopLineY,
            postUpgradeSpawnDelaySec:
                wd.postUpgradeSpawnDelaySec != null && Number.isFinite(Number(wd.postUpgradeSpawnDelaySec))
                    ? Math.max(0, Math.min(60, Number(wd.postUpgradeSpawnDelaySec)))
                    : undefined
        };
        stgChapterIndex = 0;
    }

    /**
     * 异步加载波次：与塔防共用 tower_defense_wave_config
     */
    function loadWaves() {
        return new Promise((resolve) => {
            const fallbackWaves = [
                {
                    waveNumber: 1,
                    spawnInterval: 450,
                    nextWaveDelaySec: 8,
                    spiritReward: 10,
                    enemies: [{ type: 'normal', count: 6 }],
                    stgFormation: null
                }
            ];
            const pack = (waves, enemyHpScale, enemyFireStopRow, enemyFireStopLineYLegacy, upgradeMomentsAfterWave, postUpgradeSpawnDelaySec) => {
                const hpNorm = normalizeWaveDataEnemyHpScale(enemyHpScale);
                const o = {
                    waves: attachLegacyEnemyHpMultIfMissing(waves, hpNorm),
                    enemyHpScale: hpNorm,
                    enemyFireStopRow: normalizeWaveDataEnemyFireStopRow(enemyFireStopRow)
                };
                if (enemyFireStopLineYLegacy != null && Number.isFinite(Number(enemyFireStopLineYLegacy))) {
                    /** 仅旧档兼容，运行时优先用 enemyFireStopRow */
                    o.enemyFireStopLineY = Number(enemyFireStopLineYLegacy);
                }
                if (upgradeMomentsAfterWave !== undefined && upgradeMomentsAfterWave !== null) {
                    o.upgradeMomentsAfterWave = Array.isArray(upgradeMomentsAfterWave)
                        ? upgradeMomentsAfterWave.map((x) => parseInt(Number(x), 10)).filter((n) => Number.isFinite(n))
                        : null;
                }
                if (postUpgradeSpawnDelaySec != null && Number.isFinite(Number(postUpgradeSpawnDelaySec))) {
                    o.postUpgradeSpawnDelaySec = Math.max(0, Math.min(60, Number(postUpgradeSpawnDelaySec)));
                }
                return o;
            };
            try {
                const raw = localStorage.getItem(WAVE_STORAGE_KEY);
                if (raw) {
                    const d = JSON.parse(raw);
                    const root = normalizeStoredWavePackToRoot(d);
                    if (root && root.chapters.length > 0) {
                        stgWavePackRoot = root;
                        stgChapterIndex = 0;
                        const wd = waveDataSliceFromRoot(root, 0);
                        console.log('[STG] 已自本地加载波次包，共', root.chapters.length, '章；第 1 章', wd.waves.length, '波');
                        resolve(wd);
                        return;
                    }
                }
            } catch (e) {
                console.warn('[STG] 本地波次解析失败', e);
            }
            fetch('waveConfig.json?' + Date.now())
                .then((r) => (r.ok ? r.json() : null))
                .then((data) => {
                    if (data && Array.isArray(data.chapters) && data.chapters.length > 0) {
                        const migrated = {
                            ...data,
                            chapters: data.chapters.map((ch) => ({
                                ...ch,
                                waves:
                                    window.StgWaveFormationPanel &&
                                    typeof window.StgWaveFormationPanel.migrateWaveForRuntime === 'function'
                                        ? (ch.waves || []).map((w) => window.StgWaveFormationPanel.migrateWaveForRuntime(w))
                                        : ch.waves || []
                            }))
                        };
                        const root = normalizeStoredWavePackToRoot(migrated);
                        if (root && root.chapters.length > 0) {
                            stgWavePackRoot = root;
                            stgChapterIndex = 0;
                            const wd = waveDataSliceFromRoot(root, 0);
                            console.log('[STG] 已加载 waveConfig.json，', root.chapters.length, '章');
                            resolve(wd);
                            return;
                        }
                    }
                    if (data && Array.isArray(data.waves)) {
                        const waves =
                            window.StgWaveFormationPanel &&
                            typeof window.StgWaveFormationPanel.migrateWaveForRuntime === 'function'
                                ? data.waves.map((w) => window.StgWaveFormationPanel.migrateWaveForRuntime(w))
                                : data.waves;
                        console.log('[STG] 已加载 waveConfig.json，共', waves.length, '波（单章）');
                        const wd = pack(
                            waves,
                            data.enemyHpScale,
                            data.enemyFireStopRow,
                            data.enemyFireStopLineY,
                            data.upgradeMomentsAfterWave,
                            data.postUpgradeSpawnDelaySec
                        );
                        assignRootFromSingleWaveData(wd);
                        resolve(wd);
                    } else {
                        const wd = pack(fallbackWaves, DEFAULT_ENEMY_HP_SCALE, null, null, null, null);
                        assignRootFromSingleWaveData(wd);
                        resolve(wd);
                    }
                })
                .catch(() => {
                    const wd = pack(fallbackWaves, DEFAULT_ENEMY_HP_SCALE, null, null, null, null);
                    assignRootFromSingleWaveData(wd);
                    resolve(wd);
                });
        });
    }

    /** 阵型格内「移动信标」占位前缀：与波次编辑器笔刷一致，不参与出兵 */
    const STG_FORMATION_BEACON_PREFIX = '__beacon_';

    function isStgFormationBeaconToken(s) {
        return s != null && String(s).startsWith(STG_FORMATION_BEACON_PREFIX);
    }

    /**
     * 从三块阵型格解析 a1–a4、b1–b4 信标位置（后者覆盖前者）；未放置为 null。
     * @param {object} f stgFormation
     * @returns {Record<string, { edge: string, col: number, row: number }|null>}
     */
    function extractStgFormationBeacons(f) {
        const map = {
            a1: null,
            a2: null,
            a3: null,
            a4: null,
            b1: null,
            b2: null,
            b3: null,
            b4: null
        };
        const valid = new Set(Object.keys(map));
        function visitCell(cell, edge, col, row) {
            if (cell == null || String(cell).trim() === '') return;
            const parts = String(cell)
                .split('|')
                .map((s) => s.trim())
                .filter(Boolean);
            parts.forEach((p) => {
                if (!isStgFormationBeaconToken(p)) return;
                const key = String(p).slice(STG_FORMATION_BEACON_PREFIX.length);
                if (valid.has(key)) {
                    map[key] = { edge, col, row };
                }
            });
        }
        if (!f || typeof f !== 'object') return map;
        const topGrid = f.top;
        if (topGrid && Array.isArray(topGrid)) {
            for (let r = 0; r < GRID_ROWS; r++) {
                const row = topGrid[r];
                if (!row || !Array.isArray(row)) continue;
                for (let c = 0; c < GRID_COLS; c++) {
                    visitCell(row[c], 'top', c, r);
                }
            }
        }
        const leftGrid = f.left;
        if (leftGrid && Array.isArray(leftGrid)) {
            for (let r = 0; r < GRID_ROWS; r++) {
                const row = leftGrid[r];
                if (!row || !Array.isArray(row)) continue;
                for (let c = 0; c < GRID_COLS; c++) {
                    visitCell(row[c], 'left', c, r);
                }
            }
        }
        const rightGrid = f.right;
        if (rightGrid && Array.isArray(rightGrid)) {
            for (let r = 0; r < GRID_ROWS; r++) {
                const row = rightGrid[r];
                if (!row || !Array.isArray(row)) continue;
                for (let c = 0; c < GRID_COLS; c++) {
                    visitCell(row[c], 'right', c, r);
                }
            }
        }
        /** 主棋盘信标最后写入：若同一信标 id 在扩展格与主棋盘均出现，以主棋盘格为准 */
        const mainGrid = f.main;
        if (mainGrid && Array.isArray(mainGrid)) {
            for (let r = 0; r < GRID_ROWS; r++) {
                const row = mainGrid[r];
                if (!row || !Array.isArray(row)) continue;
                for (let c = 0; c < GRID_COLS; c++) {
                    visitCell(row[c], 'main', c, r);
                }
            }
        }
        return map;
    }

    /**
     * 信标占位：扩展棋盘用 getExtendedGridCellCenter；主棋盘用 getMainGridCellCenter
     * @param {{ edge: string, col: number, row: number }} slot
     */
    function stgBeaconSlotToWorld(slot) {
        if (!slot || slot.edge == null) return null;
        if (slot.edge === 'main') {
            return getMainGridCellCenter(slot.col, slot.row);
        }
        return getExtendedGridCellCenter(slot.edge, slot.col, slot.row);
    }

    /**
     * @param {Record<string, { edge: string, col: number, row: number }|null>} beaconMap
     * @param {'A'|'B'} group
     * @returns {Array<{x:number,y:number}>}
     */
    function buildStgWaypointWorldListFromBeacons(beaconMap, group) {
        const order = group === 'A' ? ['a1', 'a2', 'a3', 'a4'] : ['b1', 'b2', 'b3', 'b4'];
        const out = [];
        if (!beaconMap) return out;
        for (let i = 0; i < order.length; i++) {
            const slot = beaconMap[order[i]];
            if (slot && slot.edge) {
                const p = stgBeaconSlotToWorld(slot);
                if (p) out.push({ x: p.x, y: p.y });
            }
        }
        return out;
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
                if (isStgFormationBeaconToken(typeId)) return;
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
     * 主战场（中间棋盘）格心，与阵型主格索引一致：col 0..GRID_COLS-1，row 0..GRID_ROWS-1。
     */
    function getMainGridCellCenter(col, row) {
        const cs = cellSize;
        const c = Math.max(0, Math.min(GRID_COLS - 1, col | 0));
        const r = Math.max(0, Math.min(GRID_ROWS - 1, row | 0));
        return { x: (c + 0.5) * cs, y: (r + 0.5) * cs };
    }

    /** 世界坐标映射到主棋盘格索引（用于旧档离场格/归一化终点迁移） */
    function worldToMainGridCell(px, py) {
        const cs = cellSize > 0 ? cellSize : 1;
        const c = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(px / cs)));
        const r = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(py / cs)));
        return { col: c, row: r };
    }

    /**
     * 阵型：本波所有格子上的敌人在同一时刻生成（不使用 spawnInterval 逐个出）。
     */
    function spawnFormationEntriesImmediate(entries, typesMap) {
        if (!entries || entries.length === 0) return;
        const spawned = [];
        for (let i = 0; i < entries.length; i++) {
            spawnEnemyFromRaw(entries[i], typesMap, { fromFormation: true });
            spawned.push(enemies[enemies.length - 1]);
        }
        assignStgWaypointFormationQueues(spawned);
        console.log('[STG] 阵型已同时生成', entries.length, '只（扩展棋盘格心）');
    }

    /**
     * @param {{ list: Array }} fr
     * @param {object} [wave] 当前波次对象（取 stgFormation 解析信标）；缺省则清空信标表
     */
    function applyWaveFlattenResult(fr, wave) {
        spawnQueueLegacy = [];
        stgCurrentWaveBeaconMap =
            wave && wave.stgFormation && typeof wave.stgFormation === 'object'
                ? extractStgFormationBeacons(wave.stgFormation)
                : null;
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
        /** 仅统计「本波」生成敌；避免倒计时提前开波后上一波残敌死亡计入下一波 resolved */
        if (e.stgSpawnWaveIndex != null && (e.stgSpawnWaveIndex | 0) !== (waveIndex | 0)) return;
        e.stgWaveCounted = true;
        stgWaveResolvedCount++;
    }

    /**
     * 下一波/升级/结算前：出兵队列空、场上无敌人、本波登记数已齐（与 checkStgWaveAllCleared 一致）
     * @returns {boolean}
     */
    function canStgAdvanceWaveNow() {
        if (getSpawnPendingCount() > 0) return false;
        if (enemies.length > 0) return false;
        if (stgWaveSpawnTotal > 0 && stgWaveResolvedCount < stgWaveSpawnTotal) return false;
        return true;
    }

    /** 升级选完后延迟出波秒数：波次存档优先，否则默认 2s */
    function getStgPostUpgradeSpawnDelaySec() {
        const raw = waveData && waveData.postUpgradeSpawnDelaySec;
        const n = raw != null ? Number(raw) : STG_DEFAULT_POST_UPGRADE_SPAWN_DELAY_SEC;
        if (!Number.isFinite(n)) return STG_DEFAULT_POST_UPGRADE_SPAWN_DELAY_SEC;
        return Math.max(0, Math.min(60, n));
    }

    /**
     * 本波登记敌全部消灭（击杀或有效边界离场）且仍有下一波时，立即开波（不等到倒计时）。
     */
    function checkStgWaveAllClearedAndAdvance() {
        if (phase !== 'playing') return;
        const waves = waveData.waves || [];
        if (waves.length === 0) return;
        if (stgWaveSpawnTotal <= 0) return;
        if (stgWaveResolvedCount < stgWaveSpawnTotal) return;
        if (getSpawnPendingCount() > 0) return;
        /** 与 resolved 一致：场上必须已无敌（防跨波计数错位） */
        if (enemies.length > 0) return;
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
     * 波次阵型中配置的「升级时刻」：在第 N 波（1 起算）结束后触发。
     * 存档缺省字段时视为 [1]；显式空数组 [] 表示本局不在波次衔接插入升级时刻（经验仍累计银行）。
     */
    function getStgUpgradeMomentsAfterWaveNormalized() {
        const waves = waveData && waveData.waves ? waveData.waves : [];
        const maxW = Math.max(1, waves.length);
        const raw = waveData && waveData.upgradeMomentsAfterWave;
        if (raw === undefined || raw === null) {
            return [1];
        }
        if (!Array.isArray(raw)) {
            return [1];
        }
        if (raw.length === 0) {
            return [];
        }
        const out = [];
        for (let i = 0; i < raw.length; i++) {
            const n = parseInt(Number(raw[i]), 10);
            if (Number.isFinite(n) && n >= 1 && n <= maxW) {
                out.push(n);
            }
        }
        const uniq = [...new Set(out)];
        uniq.sort((a, b) => a - b);
        return uniq;
    }

    /**
     * waveIndex+1 并应用下一波阵型与出兵计时（与塔防 tryAutoStartNextWave 核心一致）
     * @returns {boolean}
     */
    function advanceStgWaveIndexAndSpawnNext() {
        const waves = waveData.waves || [];
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
        applyWaveFlattenResult(flattenWaveToQueue(nw), nw);
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
     * 本波结束后：进入下一波，或本章节已结束则进入章节过渡/全关通关。
     * @returns {boolean}
     */
    function tryStgAdvanceWaveOrFinishChapter() {
        const waves = waveData.waves || [];
        if (waveIndex >= waves.length - 1) {
            interWaveCountEnd = null;
            beginStgChapterTransitionOrWin();
            return false;
        }
        return advanceStgWaveIndexAndSpawnNext();
    }

    /** 最后一章打完：通关；否则全屏提示后进入下一章第一波 */
    function beginStgChapterTransitionOrWin() {
        /** 升级时刻选完后 phase 仍为 levelup，须允许衔接章节；upgrade_announce 非 playing/levelup，会于下行 return */
        if (phase !== 'playing' && phase !== 'levelup') return;
        interWaveCountEnd = null;
        stgPostUpgradeAdvanceAtMs = null;
        const pack = stgWavePackRoot && stgWavePackRoot.chapters;
        const chCount = pack && Array.isArray(pack) ? pack.length : 1;
        if (stgChapterIndex < chCount - 1) {
            const h = getHudElements();
            if (h.chapterTransitionTitle) {
                h.chapterTransitionTitle.textContent = stgUiT('chapter.passTitle', { passed: stgChapterIndex + 1 });
            }
            if (h.chapterTransitionMsg) {
                h.chapterTransitionMsg.textContent = stgUiT('chapter.passMsg', { next: stgChapterIndex + 2 });
            }
            if (h.chapterTransition) {
                h.chapterTransition.classList.remove('hidden');
            }
            phase = 'chapter_transition';
            stgChapterTransitionEndMs = performance.now() + STG_CHAPTER_TRANSITION_MS;
            console.log('[STG] 章节', stgChapterIndex + 1, '完成，', STG_CHAPTER_TRANSITION_MS, 'ms 后进入下一章');
            return;
        }
        phase = 'win';
        showResult(true);
        isRunning = false;
        interWaveCountEnd = null;
        console.log('[STG] 通关：全部章节已完成');
    }

    /** 章节过渡层关闭后：保留自机与成长，清空战场并开下一章第一波 */
    function finishStgChapterTransitionAndStartNext() {
        hideStgChapterTransitionOverlay();
        stgChapterTransitionEndMs = null;
        stgPostUpgradeAdvanceAtMs = null;
        stgChapterIndex++;
        if (!stgWavePackRoot || !stgWavePackRoot.chapters || !stgWavePackRoot.chapters[stgChapterIndex]) {
            phase = 'win';
            showResult(true);
            isRunning = false;
            return;
        }
        waveData = waveDataSliceFromRoot(stgWavePackRoot, stgChapterIndex);
        waveIndex = 0;
        playerBullets.length = 0;
        enemies.length = 0;
        enemyBullets.length = 0;
        enemyLasers.length = 0;
        pickups.length = 0;
        stgGrazeOrbs.length = 0;
        stgGrazeRangeFlashes.length = 0;
        spawnQueueLegacy = [];
        spawnAccMs = 0;
        interWaveCountEnd = null;
        spawnSlotUsage.clear();
        stgSealField = null;
        stgDreamOrbs.length = 0;
        const w0 = waveData.waves && waveData.waves[0];
        if (w0) {
            spawnIntervalMs = w0.spawnInterval != null ? w0.spawnInterval : 400;
            applyWaveFlattenResult(flattenWaveToQueue(w0), w0);
        } else {
            spawnIntervalMs = 400;
        }
        spawnAccMs = spawnIntervalMs;
        scheduleStgNextWaveTimerAfterCurrentWaveStarted();
        phase = 'playing';
        invalidateScenePropsCache();
        updateHud();
        console.log('[STG] 已进入第', stgChapterIndex + 1, '章，第 1 波待出', getSpawnPendingCount());
    }

    /**
     * 与 towerDefense.tryAutoStartNextWave 一致：上一波出兵队列未清空则延后。
     * 若本波结束落在「升级时刻」配置中：先消耗银行等级次数的 4 选一，再进入下一波或下一章。
     * @returns {boolean}
     */
    function tryStgAutoStartNextWave() {
        /** 通关/死亡/章节过渡中不再尝试衔接波次，避免与升级时刻逻辑打架 */
        if (phase === 'win' || phase === 'dead' || phase === 'chapter_transition') {
            return false;
        }
        const waves = waveData.waves || [];
        if (getSpawnPendingCount() > 0) {
            console.log('[STG] 上一波仍在按间隔出兵，延后自动下一波');
            return false;
        }
        if (stgPendingWaveAdvanceAfterUpgradeMoment) {
            return false;
        }
        /** 升级选完后延迟出波尚未到时，禁止其它路径抢先进波 */
        if (stgPostUpgradeAdvanceAtMs != null) {
            return false;
        }
        /** 必须清完本波登记敌且场上无敌，才允许进入升级时刻或下一波（修复倒计时提前开波导致跨波计数错乱） */
        if (!canStgAdvanceWaveNow()) {
            return false;
        }
        const completedWave1Based = waveIndex + 1;
        const moments = getStgUpgradeMomentsAfterWaveNormalized();
        if (moments.indexOf(completedWave1Based) >= 0) {
            interWaveCountEnd = null;
            const rounds = Math.max(0, stgLevelUpsBanked | 0);
            stgLevelUpsBanked = 0;
            stgUpgradeMomentRoundTotal = rounds;
            stgUpgradeMomentRoundsLeft = rounds;
            /** 经验银行无可用升级次数：不弹四选一，直接衔接下一波/章节，避免卡死 */
            if (rounds <= 0) {
                console.log('[STG] 升级时刻：经验银行次数为 0，跳过四选一，直接衔接波次');
                tryStgAdvanceWaveOrFinishChapter();
                /** 返回 true，避免倒计时重试在「最后一波衔接章节」时反复 try */
                return true;
            }
            stgPendingWaveAdvanceAfterUpgradeMoment = true;
            prepareLevelUpChoices4();
            /** 先棋盘播报「升级时刻」，再开四选一（与 loop 中 upgrade_announce 分支配合） */
            stgUpgradeMomentAnnounceEndMs = performance.now() + STG_UPGRADE_MOMENT_ANNOUNCE_MS;
            phase = 'upgrade_announce';
            return true;
        }
        return tryStgAdvanceWaveOrFinishChapter();
    }

    /**
     * 升级时刻全部轮次结束（或无法弹出 UI）：关弹层、按配置延迟后出下一波；与 finalizeStgUpgradePick 最后一轮共用。
     */
    function finalizeStgUpgradeMomentSessionComplete() {
        const h = getHudElements();
        if (h.upgrade) {
            h.upgrade.classList.add('hidden');
            h.upgrade.setAttribute('aria-hidden', 'true');
        }
        stgUpgradePickOpen = false;
        const hintBtn = document.getElementById('stgLevelUpHint');
        if (hintBtn) hintBtn.classList.add('hidden');
        const subEl = document.getElementById('stgUpgradeSubHint');
        if (subEl) subEl.innerHTML = '';
        if (stgPendingWaveAdvanceAfterUpgradeMoment) {
            stgPendingWaveAdvanceAfterUpgradeMoment = false;
            const sec = getStgPostUpgradeSpawnDelaySec();
            stgPostUpgradeAdvanceAtMs = performance.now() + sec * 1000;
        }
        if (phase === 'levelup' || phase === 'upgrade_announce') {
            phase = 'playing';
        }
        lastFrameTime = performance.now();
        refreshStgAttackBuildPanel();
        refreshStgReimuBonusAside();
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

    function loadStgBuildUpgradeOverridesFromStorage() {
        try {
            const raw = localStorage.getItem(STG_BUILD_OVERRIDES_KEY);
            const o = raw ? JSON.parse(raw) : {};
            stgBuildUpgradeOverrides = o && typeof o === 'object' ? o : {};
        } catch (e) {
            stgBuildUpgradeOverrides = {};
        }
    }

    function getStgBuildOverride(id) {
        const o = stgBuildUpgradeOverrides[id];
        return o && typeof o === 'object' ? o : {};
    }

    function clampOverrideNum(v, min, max, def) {
        const n = Number(v);
        if (!Number.isFinite(n)) return def;
        return Math.max(min, Math.min(max, n));
    }

    /** 道具I：局内构筑面板可改水晶弹体形状、颜色、半径倍率 */
    function getStgCrystalVisualOverride() {
        const o = getStgBuildOverride('focus_crystal_base');
        let sh = o.crystalShape;
        if (sh !== 'circle' && sh !== 'diamond' && sh !== 'square') sh = 'diamond';
        let fill = o.crystalFill;
        if (typeof fill !== 'string' || !String(fill).trim()) fill = '#f1c40f';
        const rs = clampOverrideNum(o.crystalRadiusScale, 0.35, 3, 1);
        return { shape: sh, fill: String(fill).trim(), radiusScale: rs };
    }

    /** 道具I：伤害/弹速/枚数（与 J/K 叠乘或相加关系见 emitCrystalVolley） */
    function getStgCrystalGameplayOverride() {
        const o = getStgBuildOverride('focus_crystal_base');
        return {
            damageMult: clampOverrideNum(o.crystalDamageMult, 0.1, 5, 1),
            bulletSpeedMult: clampOverrideNum(o.crystalBulletSpeedMult, 0.25, 3, 1),
            countBase: Math.round(clampOverrideNum(o.crystalCountBase, 2, 28, 6)),
            countExtraWithK: Math.round(clampOverrideNum(o.crystalCountExtraWithK, 0, 20, 3))
        };
    }

    /** 用于文案：本局是否已选道具 K（局内用 stgTakenUpgradeIds；局外/标题用构筑勾选展开） */
    function getStgHasFocusCrystalCountForDesc() {
        if (phase === 'playing' && stgTakenUpgradeIds && stgTakenUpgradeIds.size > 0) {
            return stgTakenUpgradeIds.has('focus_crystal_count');
        }
        try {
            const raw = localStorage.getItem(STG_BUILD_INV_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            const list = Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
            return expandStgBuildGrantRequires(list).has('focus_crystal_count');
        } catch (e) {
            return false;
        }
    }

    function getStgCrystalVolleyCountForDesc() {
        const cg = getStgCrystalGameplayOverride();
        const nExtra = getStgHasFocusCrystalCountForDesc() ? cg.countExtraWithK : 0;
        return Math.max(2, Math.min(28, cg.countBase + nExtra));
    }

    function buildFocusCrystalBaseDescZh() {
        const hits = STG_CRYSTAL_FOCUS_HITS_NEEDED;
        const n = getStgCrystalVolleyCountForDesc();
        return '攻击每命中' + hits + '次，就能向前方发射' + n + '枚水晶';
    }

    function buildFocusCrystalBaseDescEn() {
        const hits = STG_CRYSTAL_FOCUS_HITS_NEEDED;
        const n = getStgCrystalVolleyCountForDesc();
        return 'Every ' + hits + ' hits in focus: fire ' + n + ' crystals forward.';
    }

    /** 道具M：局内构筑面板可改狂怒层数对射速/弹速/持续的影响 */
    function getStgRageEffectOverride() {
        const o = getStgBuildOverride('focus_rage_core');
        return {
            bulletSpdPerStack: clampOverrideNum(o.rageBulletSpdPerStack, 0, 0.25, 0.065),
            fireIvMultPerStack: clampOverrideNum(o.rageFireIvMultPerStack, 0.5, 0.999, 0.9),
            durationBaseMs: Math.round(clampOverrideNum(o.rageDurationBaseMs, 500, 120000, 5000)),
            durationExtraMs: Math.round(clampOverrideNum(o.rageDurationExtraMs, 0, 120000, 5000))
        };
    }

    /** 道具A：扇面条数加成、扇面角覆盖、本分支齐射伤害倍率 */
    function getStgSpreadFanOverride() {
        const o = getStgBuildOverride('spread_fan');
        const degRaw = o.fanSpreadDeg;
        let spreadDegOverride = null;
        if (degRaw != null && Number.isFinite(Number(degRaw))) {
            spreadDegOverride = Math.max(15, Math.min(150, Number(degRaw)));
        }
        return {
            addCount: Math.round(clampOverrideNum(o.fanAddCount, 0, 20, 2)),
            spreadDeg: spreadDegOverride,
            damageMult: clampOverrideNum(o.fanDamageMult, 0.2, 5, 1)
        };
    }

    /**
     * 道具B：额外追踪弹（与道具 D 独立叠乘）；触发概率、偏移、伤害；
     * 穿透：pierceHits 为可命中的敌机段数，默认 3 = 穿透 2 次（第三名敌人后消失）
     */
    function getStgSpreadExtraOverride() {
        const o = getStgBuildOverride('spread_extra');
        return {
            chance: clampOverrideNum(o.extraChance, 0, 1, 0.28),
            xRange: clampOverrideNum(o.extraXRange, 0, 120, 18),
            vxRange: clampOverrideNum(o.extraVxRange, 0, 400, 50),
            damageMult: clampOverrideNum(o.extraDamageMult, 0.1, 5, 1),
            homingStr: Math.round(clampOverrideNum(o.extraHomingStr, 10, 200, 72)),
            pierceHits: Math.round(clampOverrideNum(o.extraPierceHits, 2, 8, 3))
        };
    }

    /** 道具D：追踪分支伤害乘区、转向强度（与 homingStr 挂钩）；默认 0.5=伤害减半 */
    function getStgSpreadHomingOverride() {
        const o = getStgBuildOverride('spread_homing');
        return {
            damageMult: clampOverrideNum(o.homingDamageMult, 0.05, 1, 0.5),
            homingStr: Math.round(clampOverrideNum(o.homingStr, 10, 200, 72))
        };
    }

    /** 原「道具 G·暴击」拆为射速/威力：仅普通模式博丽御符 */
    function getStgSpreadRofOverride() {
        const o = getStgBuildOverride('spread_rof');
        return {
            /** 乘在射击间隔上，<1 更快 */
            intervalMult: clampOverrideNum(o.spreadRofIntervalMult, 0.65, 1, 0.9)
        };
    }
    function getStgSpreadMightOverride() {
        const o = getStgBuildOverride('spread_might');
        return {
            damageMult: clampOverrideNum(o.spreadMightDamageMult, 1, 1.85, 1.12)
        };
    }
    /** 集中弹速（慢速伏魔针） */
    function getStgFocusBulletSpdOverride() {
        const o = getStgBuildOverride('focus_bullet_spd');
        return {
            mult: clampOverrideNum(o.focusBulletSpdMult, 1, 1.4, 1.1)
        };
    }
    /** 式神援护：与炮台类似，仅在慢速下开火 */
    function getStgShikigamiOverride() {
        const o = getStgBuildOverride('focus_shikigami');
        return {
            dmgMult: clampOverrideNum(o.shikigamiDmgMult, 0.25, 2, 0.58),
            fireIntervalMs: Math.round(clampOverrideNum(o.shikigamiFireIntervalMs, 200, 2000, 620))
        };
    }

    /** 道具C：伴身炮台相对主武器单发倍率、开火间隔（毫秒） */
    function getStgSpreadTurretOverride() {
        const o = getStgBuildOverride('spread_turret');
        return {
            dmgMult: clampOverrideNum(o.turretDmgMult, 0.5, 5, 1.5),
            fireIntervalMs: Math.round(clampOverrideNum(o.turretFireIntervalMs, 100, 2000, 420))
        };
    }

    /** 道具E：产球节奏、球体寿命与上限、碰撞/视觉半径、持续伤占主武器单发比例 */
    function getStgSpreadYinyangOverride() {
        const o = getStgBuildOverride('spread_yinyang');
        return {
            spawnIntervalMs: Math.round(clampOverrideNum(o.yinyangSpawnIntervalMs, 500, 120000, STG_YINYANG_SPAWN_INTERVAL_MS)),
            orbDurationMs: Math.round(clampOverrideNum(o.yinyangOrbDurationMs, 500, 120000, STG_YINYANG_ORB_DURATION_MS)),
            maxOrbs: Math.round(clampOverrideNum(o.yinyangMaxOrbs, 1, 30, STG_YINYANG_MAX_ORBS)),
            orbRadius: Math.round(clampOverrideNum(o.yinyangOrbRadius, 16, 120, 48)),
            visR: Math.round(clampOverrideNum(o.yinyangVisR, 6, 72, 17)),
            dpsFrac: clampOverrideNum(o.yinyangDpsFrac, 0.05, 1.5, 0.5)
        };
    }

    /** 道具F：击杀大 P 点概率与经验倍率 */
    function getStgSpreadBigPOverride() {
        const o = getStgBuildOverride('spread_big_p');
        return {
            chance: clampOverrideNum(o.bigPChance, 0, 1, 0.22),
            expMult: clampOverrideNum(o.bigPExpMult, 1, 10, 2.5)
        };
    }

    /** 道具H：击杀大能量点概率与经验倍率 */
    function getStgSpreadBigEnergyOverride() {
        const o = getStgBuildOverride('spread_big_energy');
        return {
            chance: clampOverrideNum(o.bigEnergyChance, 0, 1, 0.18),
            expMult: clampOverrideNum(o.bigEnergyExpMult, 1, 10, 1.85)
        };
    }

    /**
     * 道具E：阴阳玉「50% 攻击力」按扩散主武器等效单发伤害计（非子弹，不吃道具 D 追踪的 −40%）
     */
    function getStgSpreadMainVolleyDmgForYinYang() {
        if (!player) return 0;
        const baseAtk = player.mainWeaponAttack != null ? player.mainWeaponAttack : 10;
        return applyStgWeaponBaseAttackBonuses(baseAtk) * bonusDamage * getStgUltAtkDamageMult();
    }

    /**
     * 从物品池取第一格可用英雄属性；无则默认战士模板
     */
    function buildPlayerFromHero() {
        const pool = (typeof window !== 'undefined' && window.ITEM_POOL) || [];
        const gs = gameStateRef;
        let heroItem = pool.find((i) => i && i.category === '英雄');
        // 英雄编辑器写入的是 gameState.inventory（英雄 id→数量），非 heroInventory
        if (gs && gs.inventory && heroItem) {
            const picked = pool.find(
                (i) => i && i.category === '英雄' && (gs.inventory.get(i.id) || 0) > 0
            );
            if (picked) heroItem = picked;
        }
        const attr = (heroItem && heroItem.attributes) || {};
        const aps = attr.attackSpeed != null ? attr.attackSpeed : 5;
        let fireIntervalMs = Math.max(60, Math.min(350, 1000 / Math.max(aps * 0.15, 0.5)));
        let moveSpeed = 200;

        /** 仅用火英雄攻速→射击间隔；生命改为「格数」制，不再用英雄 health 数值 */
        const scaled = applyStgHeroNonWeaponScalars(100, fireIntervalMs);
        fireIntervalMs = scaled.fireIntervalMs;

        let baseCells = 6;
        const cfgHp = loadStgPlayerConfig();
        if (cfgHp && cfgHp.lifeCellsMax != null) {
            const c = Number(cfgHp.lifeCellsMax);
            if (Number.isFinite(c)) baseCells = Math.max(1, Math.min(30, Math.round(c)));
        }
        let lifeCells = baseCells;
        if (playerStatsRef && playerStatsRef.getStat) {
            lifeCells = Math.max(1, Math.round(baseCells * (1 + (playerStatsRef.getStat('max_health_bonus') || 0))));
        }

        const cw = canvas ? canvas.width : GRID_COLS * cellSize;
        const ch = canvas ? canvas.height : GRID_ROWS * cellSize;
        const px = cw / 2;
        const py = ch - cellSize * 1.8;

        /** STG 伤害以武器编辑器为准；生命为整格×半格单位 */
        const p = {
            x: px,
            y: py,
            radius: 14,
            stgLifeCellsMax: lifeCells,
            stgLifeHalfUnitsRemain: lifeCells * 2,
            moveSpeed,
            fireIntervalMs,
            bulletSpeed: 420,
            mainWeaponAttack: 10,
            focusWeaponAttack: 10,
            skillWeaponAttack: 10,
            /** 封魔阵「疗愈」结束后短时攻击加成（仅 Z 弹伤害） */
            _ultAtkBuffUntil: 0,
            _ultAtkBuffMult: 1.18,
            /** 与开局坐标一致，受伤拉回用；resize 时同步 */
            _stgSpawnX: px,
            _stgSpawnY: py,
            _stgHitHoldUntil: null
        };
        const cfg = loadStgPlayerConfig();
        if (cfg) mergeStgPlayerEditorIntoPlayer(p, cfg);
        syncStgPlayerLifeHpMirror();
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

    function getStgRageMaxStacks() {
        return stgTakenUpgradeIds.has('focus_rage_cap') ? 6 : 3;
    }

    function getStgRageDurationMs() {
        const ex = getStgRageEffectOverride();
        let d = ex.durationBaseMs;
        if (stgTakenUpgradeIds.has('focus_rage_dur')) d += ex.durationExtraMs;
        return d;
    }

    /** 道具P：狂怒层数≥5 时对敌伤害 +20% */
    function getStgWeakDamageMult() {
        if (!stgTakenUpgradeIds.has('focus_rage_weak')) return 1;
        if (stgFocusBranch !== 'rage') return 1;
        if (stgRageStacks < 5) return 1;
        return 1.2;
    }

    function emitPlayerVolley(isSkill, mainUseFocus) {
        if (!player) return;
        const p = player;
        const useFocusMain = !isSkill && !!mainUseFocus;
        const spreadMode = !isSkill && !useFocusMain;

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

        /** 道具A：扩散固定扇形，散射条数 +addCount（默认 +2，可局内构筑覆盖） */
        const fanOv = spreadMode && stgTakenUpgradeIds.has('spread_fan') ? getStgSpreadFanOverride() : null;
        if (fanOv) {
            style = 'fan';
            nFan = Math.max(2, Math.min(24, (nFan != null ? nFan : 5) + fanOv.addCount));
            if (fanOv.spreadDeg != null) {
                spreadDeg = fanOv.spreadDeg;
            } else if (spreadDeg == null || spreadDeg < 25) {
                spreadDeg = 60;
            }
        }

        let volleyDmg = applyStgWeaponBaseAttackBonuses(baseAtk) * bonusDamage * getStgUltAtkDamageMult();
        if (spreadMode && stgTakenUpgradeIds.has('spread_homing')) {
            volleyDmg *= getStgSpreadHomingOverride().damageMult;
        }
        if (fanOv) {
            volleyDmg *= fanOv.damageMult;
        }
        if (spreadMode && stgTakenUpgradeIds.has('spread_might')) {
            volleyDmg *= getStgSpreadMightOverride().damageMult;
        }
        if (useFocusMain && stgTakenUpgradeIds.has('focus_stationary_ramp') && player) {
            const sec = Math.floor((player._stgFocusStandStillMs | 0) / 1000);
            volleyDmg *= 1 + Math.min(0.42, sec * 0.065);
        }

        /** 道具M：狂怒下弹速随层数增加（主武器扩散 / 慢速均生效；大招弹幕不走本段；可局内构筑覆盖每层加成） */
        let rageBulletSpdMult = 1;
        if (!isSkill && stgFocusBranch === 'rage' && stgRageStacks > 0) {
            const tn = performance.now();
            if (tn < stgRageEndMs) {
                const rex = getStgRageEffectOverride();
                rageBulletSpdMult = 1 + rex.bulletSpdPerStack * stgRageStacks;
            }
        }
        let focusSpdMult = 1;
        if (useFocusMain && stgTakenUpgradeIds.has('focus_bullet_spd')) {
            focusSpdMult = getStgFocusBulletSpdOverride().mult;
        }
        const spd = spdBase * bonusBulletSpeed * rageBulletSpdMult * focusSpdMult;
        const px = p.x;
        const py = p.y - p.radius;

        /** 当前发射模式下的最大敌段命中数：未开穿透为 1，否则为 2–20 */
        function getPierceHitsMaxForVolley() {
            let enabled;
            let hitsRaw;
            if (isSkill) {
                enabled = p.skillBulletPierceEnabled;
                hitsRaw = p.skillBulletPierceHits;
            } else if (useFocusMain) {
                enabled = p.focusBulletPierceEnabled;
                hitsRaw = p.focusBulletPierceHits;
            } else {
                enabled = p.bulletPierceEnabled;
                hitsRaw = p.bulletPierceHits;
            }
            if (!enabled) return 1;
            const n = hitsRaw != null ? parseInt(hitsRaw, 10) : 3;
            if (!Number.isFinite(n)) return 1;
            return Math.max(2, Math.min(20, n));
        }
        const pierceHitsMax = getPierceHitsMaxForVolley();

        /** 道具D：同一次齐射内追踪强度一致，避免每颗弹重复读覆盖 */
        const spreadHomingStr =
            spreadMode && stgTakenUpgradeIds.has('spread_homing') ? getStgSpreadHomingOverride().homingStr : 72;
        /** 道具B：额外弹专用追踪强度与穿透段数（与 D 无关；无 B 时下方仅作占位不用于主弹） */
        const spreadExtraOv = spreadMode && stgTakenUpgradeIds.has('spread_extra') ? getStgSpreadExtraOverride() : null;
        const spreadExtraHomingStr = spreadExtraOv ? spreadExtraOv.homingStr : 72;
        const spreadExtraPierceHits = spreadExtraOv ? spreadExtraOv.pierceHits : 3;

        function pushBullet(x, y, vx, vy, extra) {
            const ex = extra || {};
            const d = volleyDmg * (ex.dmgMult != null ? ex.dmgMult : 1);
            const fromSpreadExtra = !!ex.fromSpreadExtra;
            const useHoming = !!(
                spreadMode &&
                (stgTakenUpgradeIds.has('spread_homing') || (fromSpreadExtra && stgTakenUpgradeIds.has('spread_extra')))
            );
            let homingStrUse = 0;
            if (useHoming) {
                if (fromSpreadExtra && stgTakenUpgradeIds.has('spread_extra')) {
                    homingStrUse = spreadExtraHomingStr;
                } else if (spreadMode && stgTakenUpgradeIds.has('spread_homing')) {
                    homingStrUse = spreadHomingStr;
                }
            }
            const critB = 0;
            const pl = ex.pierceOverride != null ? ex.pierceOverride : pierceHitsMax;
            const needSet = pl > 1;
            playerBullets.push({
                x,
                y,
                vx,
                vy,
                dmg: d,
                alive: true,
                radius: ex.radius != null ? ex.radius : br,
                shape: ex.shape != null ? ex.shape : visShape,
                pierceHitsLeft: pl,
                pierceHitEnemyIds: needSet ? new Set() : null,
                homing: useHoming,
                homingStr: homingStrUse,
                spreadCritBonus: critB,
                fromSpread: spreadMode,
                fromFocusMain: !!(useFocusMain && !isSkill),
                isCrystal: !!ex.isCrystal,
                allowCrystalAcc: !!(useFocusMain && !isSkill && stgFocusBranch === 'crystal' && !ex.isCrystal)
            });
        }

        function trySpreadExtraAndYinyang() {
            if (spreadMode && spreadExtraOv && Math.random() < spreadExtraOv.chance) {
                pushBullet(
                    px + (Math.random() - 0.5) * spreadExtraOv.xRange,
                    py,
                    (Math.random() - 0.5) * spreadExtraOv.vxRange,
                    -spd,
                    {
                        dmgMult: spreadExtraOv.damageMult,
                        fromSpreadExtra: true,
                        pierceOverride: spreadExtraPierceHits
                    }
                );
            }
            /** 道具E：改由 update 内定时生成，此处不再随机产球 */
        }

        if (style === 'single') {
            const n = Math.max(1, Math.min(5, nSingle));
            const gap = 10;
            for (let i = 0; i < n; i++) {
                const ox = (i - (n - 1) * 0.5) * gap;
                pushBullet(px + ox, py, 0, -spd, {});
            }
            trySpreadExtraAndYinyang();
            return;
        }
        /** 双列：左右两列各一组「单发并列」竖直弹，列间距可配置（px） */
        if (style === 'double_column') {
            const n = Math.max(1, Math.min(5, nSingle));
            const gap = 10;
            let sep = 20;
            if (isSkill) {
                sep =
                    p.skillDoubleColumnSep != null && Number.isFinite(Number(p.skillDoubleColumnSep))
                        ? Math.max(8, Math.min(56, Number(p.skillDoubleColumnSep)))
                        : 20;
            } else if (useFocusMain) {
                sep =
                    p.focusDoubleColumnSep != null && Number.isFinite(Number(p.focusDoubleColumnSep))
                        ? Math.max(8, Math.min(56, Number(p.focusDoubleColumnSep)))
                        : 20;
            } else {
                sep =
                    p.doubleColumnSep != null && Number.isFinite(Number(p.doubleColumnSep))
                        ? Math.max(8, Math.min(56, Number(p.doubleColumnSep)))
                        : 20;
            }
            const half = sep * 0.5;
            const leftCx = px - half;
            const rightCx = px + half;
            for (let col = 0; col < 2; col++) {
                const cx = col === 0 ? leftCx : rightCx;
                for (let i = 0; i < n; i++) {
                    const ox = (i - (n - 1) * 0.5) * gap;
                    pushBullet(cx + ox, py, 0, -spd, {});
                }
            }
            trySpreadExtraAndYinyang();
            return;
        }
        if (style === 'fan') {
            const n = Math.max(2, Math.min(24, nFan));
            const spread = (spreadDeg * Math.PI) / 180;
            const base = -Math.PI / 2;
            const start = base - spread * 0.5;
            for (let i = 0; i < n; i++) {
                const a = n <= 1 ? base : start + (spread * i) / Math.max(1, n - 1);
                pushBullet(px, py, Math.cos(a) * spd, Math.sin(a) * spd, {});
            }
            trySpreadExtraAndYinyang();
            return;
        }
        const n = Math.max(3, Math.min(36, nRing));
        for (let i = 0; i < n; i++) {
            const a = (Math.PI * 2 * i) / n;
            pushBullet(px, py, Math.cos(a) * spd, Math.sin(a) * spd, {});
        }
        trySpreadExtraAndYinyang();
    }

    /**
     * 擦弹反击：慢速 + 习得 focus_graze_snipe 时补一发追踪伏魔针
     */
    function emitFocusGrazeCounterShot() {
        if (!player) return;
        const p = player;
        const spdBase = p.focusBulletSpeed != null ? p.focusBulletSpeed : p.bulletSpeed;
        let focusSpdMult = stgTakenUpgradeIds.has('focus_bullet_spd') ? getStgFocusBulletSpdOverride().mult : 1;
        const spd = spdBase * bonusBulletSpeed * focusSpdMult;
        const baseAtk = p.focusWeaponAttack != null ? p.focusWeaponAttack : 10;
        const dmg = applyStgWeaponBaseAttackBonuses(baseAtk) * bonusDamage * getStgUltAtkDamageMult() * 0.82;
        const br =
            p.focusBulletRadius != null ? p.focusBulletRadius : p.bulletRadius != null ? p.bulletRadius : 4;
        const px = p.x;
        const py = p.y - p.radius;
        const visShape = normalizePlayerBulletVisualShape(
            p.focusBulletVisualShape != null ? p.focusBulletVisualShape : p.bulletVisualShape
        );
        playerBullets.push({
            x: px,
            y: py,
            vx: 0,
            vy: -spd,
            dmg,
            alive: true,
            radius: br,
            shape: visShape,
            pierceHitsLeft: 1,
            pierceHitEnemyIds: null,
            homing: true,
            homingStr: 80,
            spreadCritBonus: 0,
            fromSpread: false,
            fromFocusMain: true,
            isCrystal: false,
            allowCrystalAcc: false
        });
    }

    /**
     * 道具I+J/K/L：水晶齐射（集中主武器命中 30 次触发）
     */
    function emitCrystalVolley() {
        if (!player || stgFocusBranch !== 'crystal') return;
        const p = player;
        const cgPlay = getStgCrystalGameplayOverride();
        const nExtra = stgTakenUpgradeIds.has('focus_crystal_count') ? cgPlay.countExtraWithK : 0;
        const n = Math.max(2, Math.min(28, cgPlay.countBase + nExtra));
        const baseAtk =
            p.focusWeaponAttack != null
                ? p.focusWeaponAttack
                : p.mainWeaponAttack != null
                  ? p.mainWeaponAttack
                  : 10;
        let cdmg = applyStgWeaponBaseAttackBonuses(baseAtk) * bonusDamage * getStgUltAtkDamageMult();
        if (stgTakenUpgradeIds.has('focus_crystal_atk')) cdmg *= 1.28;
        cdmg *= cgPlay.damageMult;
        const spd =
            (p.focusBulletSpeed != null ? p.focusBulletSpeed : p.bulletSpeed) *
            bonusBulletSpeed *
            cgPlay.bulletSpeedMult;
        const cv = getStgCrystalVisualOverride();
        const brc = Math.max(
            2,
            Math.round(
                (p.focusBulletRadius != null ? p.focusBulletRadius : p.bulletRadius != null ? p.bulletRadius : 4) *
                    0.88 *
                    cv.radiusScale
            )
        );
        const spread = (42 * Math.PI) / 180;
        const baseA = -Math.PI / 2;
        const start = baseA - spread * 0.5;
        const px = p.x;
        const py = p.y - p.radius;
        const pierceL = stgTakenUpgradeIds.has('focus_crystal_pierce') ? 5 : 1;
        for (let i = 0; i < n; i++) {
            const a = n <= 1 ? baseA : start + (spread * i) / Math.max(1, n - 1);
            playerBullets.push({
                x: px,
                y: py,
                vx: Math.cos(a) * spd,
                vy: Math.sin(a) * spd,
                dmg: cdmg,
                alive: true,
                radius: brc,
                shape: cv.shape,
                crystalFill: cv.fill,
                pierceHitsLeft: pierceL,
                pierceHitEnemyIds: pierceL > 1 ? new Set() : null,
                homing: false,
                homingStr: 0,
                spreadCritBonus: 0,
                fromSpread: false,
                fromFocusMain: false,
                isCrystal: true,
                allowCrystalAcc: false
            });
        }
    }

    /** 「封魔阵疗愈」结束后短暂攻击乘区（仅影响玩家弹伤害） */
    function getStgUltAtkDamageMult() {
        if (!player) return 1;
        const t = performance.now();
        if (player._ultAtkBuffUntil != null && t < player._ultAtkBuffUntil) {
            return player._ultAtkBuffMult != null ? player._ultAtkBuffMult : 1;
        }
        return 1;
    }

    /**
     * 大招类无弹体伤害（封魔阵 DPS / 妙珠接触）；DoT 不使用暴击以免帧间噪声过大
     * @param {StgEnemy} e
     * @param {number} rawDmg
     * @param {boolean} useCrit
     */
    function stgApplyDamageToEnemyNoBullet(e, rawDmg, useCrit) {
        if (!e || !e.alive) return;
        let hitDmg = rawDmg * getStgWeakDamageMult();
        if (useCrit && playerStatsRef && playerStatsRef.getStat) {
            const critP = Math.min(
                0.95,
                (playerStatsRef.getStat('crit_chance_bonus') || 0) + (playerStatsRef.getStat('crit_rate') || 0)
            );
            if (critP > 0 && Math.random() < critP) hitDmg *= 2;
        }
        e.hp -= hitDmg;
        if (e.hp <= 0) {
            if (e.pattern !== 'none' && e.stgEmitWhen === 'on_death') {
                emitStgEnemyAttack(e, player);
                console.log('[STG] 死后弹幕：种类', e.typeId || '');
            }
            markStgWaveEnemyResolved(e);
            e.alive = false;
            const pExp = Math.max(5, Math.floor(12 * bonusExpMult));
            pickups.push(createPickupAtKill(e.x, e.y, pExp));
            pushStgChargePickupOnEnemyKillIfConfigured(e);
            console.log('[STG] 大招击杀，掉落 P点 经验', pExp);
        }
    }

    /** 大招 · 封魔阵：展开圆形结界 */
    function activateStgUltSeal() {
        if (!player) return;
        const now = performance.now();
        let radius = 94;
        let durationMs = 1380;
        if (stgTakenUpgradeIds.has('ult_seal_size')) {
            radius *= 1.42;
            durationMs += 580;
        }
        const sk = player.skillWeaponAttack != null ? player.skillWeaponAttack : 10;
        const dps = applyStgWeaponBaseAttackBonuses(sk) * bonusDamage * 0.38;
        let healPerSec = 0;
        if (stgTakenUpgradeIds.has('ult_seal_heal')) {
            healPerSec = 0.055;
        }
        stgSealField = {
            endMs: now + durationMs,
            radius,
            dps,
            healPerSec,
            hasHealCard: stgTakenUpgradeIds.has('ult_seal_heal'),
            /** 道具R：消弹转化的 P 点经验倍率、阵内移速倍率 */
            pFromBulletMult: stgTakenUpgradeIds.has('ult_seal_economy') ? 1.55 : 1,
            moveBonusDuringSeal: stgTakenUpgradeIds.has('ult_seal_economy') ? 1.14 : 1
        };
        console.log('[STG] 试做型封魔阵', 'R=', radius.toFixed(0), 'ms=', durationMs);
    }

    /** 大招 · 梦想妙珠：水平排布、向上飞行的消弹体 */
    function activateStgUltDream() {
        if (!player) return;
        const p = player;
        const n = stgTakenUpgradeIds.has('ult_dream_count') ? 5 : 3;
        const stunMs = stgTakenUpgradeIds.has('ult_dream_stun') ? 880 : 0;
        const spdBase = p.skillBulletSpeed != null ? p.skillBulletSpeed : p.bulletSpeed;
        const vy = -Math.max(200, Math.min(540, spdBase * bonusBulletSpeed * 0.52));
        const sk = p.skillWeaponAttack != null ? p.skillWeaponAttack : 10;
        const dps = applyStgWeaponBaseAttackBonuses(sk) * bonusDamage * 0.44;
        const py = p.y - p.radius;
        const gap = n >= 5 ? 22 : 30;
        const startX = p.x - ((n - 1) * gap) / 2;
        for (let i = 0; i < n; i++) {
            stgDreamOrbs.push({
                x: startX + i * gap,
                y: py,
                vx: 0,
                vy,
                r: 27,
                eraseR: 36,
                dps,
                stunMs,
                alive: true
            });
        }
        console.log('[STG] 梦想妙珠 x', n, stunMs ? '带眩晕' : '');
    }

    /**
     * 每帧更新封魔阵与梦想妙珠（须在敌弹位移之后、敌弹打玩家之前调用，以便先消弹）
     * @param {number} dtSec
     * @param {number} nowMs
     * @param {number} cw
     * @param {number} ch
     */
    function updateStgUltSkills(dtSec, nowMs, cw, ch) {
        if (stgSealField && player) {
            if (nowMs >= stgSealField.endMs) {
                if (stgSealField.hasHealCard) {
                    player._ultAtkBuffUntil = nowMs + 3000;
                    player._ultAtkBuffMult = 1.18;
                }
                stgSealField = null;
            } else {
                const px = player.x;
                const py = player.y;
                const R = stgSealField.radius;
                if (stgSealField.healPerSec > 0 && player.stgLifeHalfUnitsRemain < getStgPlayerMaxLifeHalfUnits()) {
                    const maxH = getStgPlayerMaxLifeHalfUnits();
                    player._stgSealHealHalfAcc =
                        (player._stgSealHealHalfAcc || 0) + maxH * stgSealField.healPerSec * dtSec;
                    while (player._stgSealHealHalfAcc >= 1 && player.stgLifeHalfUnitsRemain < maxH) {
                        player._stgSealHealHalfAcc -= 1;
                        player.stgLifeHalfUnitsRemain++;
                    }
                    syncStgPlayerLifeHpMirror();
                }
                /** 本帧由封魔阵消弹转化的 P 点数量上限，避免弹幕极密时单帧生成过多实体 */
                let sealPBudget = 14;
                for (let i = enemyBullets.length - 1; i >= 0; i--) {
                    const b = enemyBullets[i];
                    if (!b.alive) continue;
                    const br = b.radius != null ? b.radius : 5;
                    if (Math.hypot(b.x - px, b.y - py) < R + br) {
                        b.alive = false;
                        /** 试做型封魔阵：范围内消弹转化为 P 点（经验）；道具 R 提高转化价值 */
                        if (sealPBudget > 0) {
                            sealPBudget--;
                            const mult = (stgSealField.pFromBulletMult != null ? stgSealField.pFromBulletMult : 1) * bonusExpMult;
                            const pExp = Math.max(2, Math.floor(5 * mult));
                            pickups.push(createPickupAtKill(b.x, b.y, pExp));
                        }
                    }
                }
                for (let ei = 0; ei < enemies.length; ei++) {
                    const e = enemies[ei];
                    if (!e.alive) continue;
                    const er = e.radius != null ? e.radius : 14;
                    if (Math.hypot(e.x - px, e.y - py) < R + er) {
                        stgApplyDamageToEnemyNoBullet(e, stgSealField.dps * dtSec, false);
                    }
                }
            }
        }

        for (let i = stgDreamOrbs.length - 1; i >= 0; i--) {
            const o = stgDreamOrbs[i];
            if (!o || !o.alive) {
                stgDreamOrbs.splice(i, 1);
                continue;
            }
            o.x += (o.vx || 0) * dtSec;
            o.y += (o.vy || 0) * dtSec;
            if (o.y < -120 || o.x < -100 || o.x > cw + 100) {
                stgDreamOrbs.splice(i, 1);
                continue;
            }
            for (let j = enemyBullets.length - 1; j >= 0; j--) {
                const b = enemyBullets[j];
                if (!b.alive) continue;
                const br = b.radius != null ? b.radius : 5;
                if (Math.hypot(b.x - o.x, b.y - o.y) < o.eraseR + br) b.alive = false;
            }
            for (let ei = 0; ei < enemies.length; ei++) {
                const e = enemies[ei];
                if (!e.alive) continue;
                const er = e.radius != null ? e.radius : 14;
                if (Math.hypot(e.x - o.x, e.y - o.y) < o.r + er) {
                    stgApplyDamageToEnemyNoBullet(e, o.dps * dtSec, false);
                    /** 眩晕仅在「当前未处于眩晕」时施加，避免在接触区内每帧刷新结束时间 */
                    if (o.stunMs > 0 && (e.stgStunUntil == null || nowMs >= e.stgStunUntil)) {
                        e.stgStunUntil = nowMs + o.stunMs;
                    }
                }
            }
        }
    }

    /** 绘制单发玩家弹：圆形 / 菱形 / 方形（随速度方向旋转） */
    function drawStgPlayerBullet(ctx, b) {
        const rad = b.radius != null ? b.radius : 4;
        const sh = b.shape || 'circle';
        ctx.fillStyle =
            b.isCrystal && b.crystalFill != null && String(b.crystalFill).trim() !== ''
                ? String(b.crystalFill).trim()
                : '#f1c40f';
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
        resetStgStatBonusDisplay();
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
        expToNext = computeExpToNextForLevel(1);
        waveIndex = 0;
        spawnQueueLegacy = [];
        spawnAccMs = 0;
        interWaveCountEnd = null;
        playerBullets = [];
        enemies = [];
        enemyBullets = [];
        enemyLasers = [];
        pickups = [];
        stgGrazeOrbs = [];
        stgGrazeRangeFlashes = [];
        stgYinYangOrbs = [];
        stgYinYangNextSpawnWallMs = null;
        stgCurrentWaveBeaconMap = null;
        stgCrystalFocusHitAcc = 0;
        stgRageStacks = 0;
        stgRageEndMs = 0;
        stgRageKillAcc = 0;
        stgSideTurretLastFireMs = 0;
        stgShikigamiLastFireMs = 0;
        stgSpreadKillHasteStacks = 0;
        stgSpreadKillHasteEndMs = 0;
        stgPlayerFxParticles = [];
        stgPlayerHitFlashMs = 0;
        stgLaserFxAccMs = 0;
        stgSealField = null;
        stgDreamOrbs = [];
        stgTakenUpgradeIds.clear();
        stgFocusBranch = null;
        stgUltBranch = null;
        stgUpgradePickOpen = false;
        stgLevelUpsBanked = 0;
        stgPendingWaveAdvanceAfterUpgradeMoment = false;
        stgPostUpgradeAdvanceAtMs = null;
        stgUpgradeMomentAnnounceEndMs = null;
        stgUpgradeMomentRoundsLeft = 0;
        stgUpgradeMomentRoundTotal = 0;
        upgradeChoices = [];
        {
            const root = document.getElementById('stgUpgradeModalRoot');
            if (root) {
                root.classList.add('hidden');
                root.setAttribute('aria-hidden', 'true');
            }
            const sub = document.getElementById('stgUpgradeSubHint');
            if (sub) sub.innerHTML = '';
            const hintBtn = document.getElementById('stgLevelUpHint');
            if (hintBtn) hintBtn.classList.add('hidden');
        }
        invalidateScenePropsCache();
        resetBonuses();
        player = buildPlayerFromHero();
        if (player) player._stgFocusStandStillMs = 0;
        applyStgSavedBuildGrants();
        stgUltChargeMeter = 0;
        stgUltCharges = 0;
        stgUltReadyHintUntilMs = null;
        if (player && player.ultInitialCharges != null) {
            stgUltCharges = Math.max(0, Math.min(STG_ULT_CHARGE_MAX, Math.floor(player.ultInitialCharges)));
        }
        runStartMs = performance.now();

        const w = waveData.waves[0];
        spawnSlotUsage.clear();
        if (w) {
            spawnIntervalMs = w.spawnInterval != null ? w.spawnInterval : 400;
            applyWaveFlattenResult(flattenWaveToQueue(w), w);
        }
        if (getSpawnPendingCount() === 0) {
            console.warn('[STG] 第一波阵型为空，无敌人（请在「波次阵型编辑器」摆放）');
        }
        /** 仅 legacy 队列需要：首拍即出第一只；阵型已在 apply 内一次刷完 */
        spawnAccMs = spawnIntervalMs;
        scheduleStgNextWaveTimerAfterCurrentWaveStarted();
        refreshStgReimuBonusAside();
        console.log(
            '[STG] 开局：生命',
            (player.stgLifeHalfUnitsRemain != null ? player.stgLifeHalfUnitsRemain * 0.5 : player.hp * 0.5).toFixed(1),
            '/',
            player.stgLifeCellsMax != null ? player.stgLifeCellsMax : '?',
            '格；武器攻',
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
        /** 每局开局刷新贴图版本，避免仅替换磁盘同名文件仍走浏览器 HTTP 缓存 */
        clearStgEnemyBulletSpriteCacheAndBumpBust();
        preloadStgEnemyBulletSpritesFromTypes();
    }

    function startGame() {
        Promise.all([ensureBundledEnemyTypesLoaded(), loadWaves()]).then(([_, data]) => {
            waveData = data;
            if (!waveData.waves || waveData.waves.length === 0) {
                waveData = { waves: [{ waveNumber: 1, spawnInterval: 450, enemies: [{ type: 'normal', count: 5 }] }] };
            }
            waveData.enemyHpScale = normalizeWaveDataEnemyHpScale(waveData.enemyHpScale);
            waveData.enemyFireStopRow = normalizeWaveDataEnemyFireStopRow(waveData.enemyFireStopRow);
            if (!stgWavePackRoot) {
                assignRootFromSingleWaveData(waveData);
            }
            stgChapterIndex = 0;
            hideStgChapterTransitionOverlay();
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

        if (phase === 'playing' || phase === 'chapter_transition' || phase === 'upgrade_announce') {
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
        let def = typesMap[typeId] || typesMap.normal;
        let bossSnap = null;
        const bs = getStgBossSpawnDef(typeId, typesMap);
        if (bs) {
            def = bs.def;
            bossSnap = bs.boss;
        }
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
        const en = new StgEnemy(x, y, def, pattern, typeId, col);
        if (bossSnap) {
            en.stgBossConfigSnapshot = bossSnap;
            initStgBossFsmOnEnemy(en);
        }
        if (fromFormation && raw && typeof raw === 'object' && (raw.edge === 'left' || raw.edge === 'right' || raw.edge === 'top')) {
            en.stgFormationCellKey = String(raw.edge) + '|' + (raw.col | 0) + '|' + (raw.row | 0);
        }
        en.stgSpawnWaveIndex = waveIndex | 0;
        en.stgSpawnEdge = edge === 'left' || edge === 'right' || edge === 'top' ? edge : 'top';
        /** 波次阵型：按当前波配置的 enemyHpMult 抬血（waveIndex 从 0 起，第 1 波为 0） */
        const hpMult = getStgEnemyHpMultiplierForWaveIndex(waveIndex);
        en.maxHp = Math.max(1, Math.round(en.maxHp * hpMult));
        en.hp = en.maxHp;
        /** 多段移动：按本波阵型中信标 a1→… 或 b1→… 途经格心（无信标则回退追踪） */
        if (en.stgMoveMode === 'waypoint_a' || en.stgMoveMode === 'waypoint_b') {
            const grp = en.stgMoveMode === 'waypoint_a' ? 'A' : 'B';
            const wps = buildStgWaypointWorldListFromBeacons(stgCurrentWaveBeaconMap, grp);
            if (wps.length > 0) {
                en.stgWaypointWorld = wps;
                en.stgWaypointIndex = 0;
                en.moveIdle = false;
                /** 出生点已含抖动，段起点必须与当前世界坐标一致 */
                en.stgWaypointSegPx = en.x;
                en.stgWaypointSegPy = en.y;
                en.stgWaypointSegU = 0;
                en.stgWaypointDwellUntilMs = null;
                en._stgWpReachedIdx = undefined;
            } else {
                console.warn('[STG] 多段移动未放置对应信标或路径为空，已回退为 homing_legacy', typeId);
                en.stgMoveMode = 'homing_legacy';
            }
        }
        enemies.push(en);
    }

    function update(dt) {
        if (!canvas || !player) return;
        /** 章节过渡：仅计时，不跑局内逻辑 */
        if (phase === 'chapter_transition') {
            if (performance.now() >= stgChapterTransitionEndMs) {
                finishStgChapterTransitionAndStartNext();
            }
            return;
        }
        /** 升级时刻：仅等播报结束再弹层，不跑移动/碰撞，局面保持上一帧 */
        if (phase === 'upgrade_announce') {
            if (stgUpgradeMomentAnnounceEndMs != null && performance.now() >= stgUpgradeMomentAnnounceEndMs) {
                stgUpgradeMomentAnnounceEndMs = null;
                const opened = openStgUpgradeModal();
                /** 四选一无法弹出（DOM 缺失、选项为空等）时仍须衔接波次，否则会永久卡在 upgrade_announce */
                if (!opened) {
                    console.warn('[STG] 升级时刻：无法打开四选一 UI，跳过并衔接波次');
                    stgUpgradeMomentRoundsLeft = 0;
                    stgUpgradeMomentRoundTotal = 0;
                    finalizeStgUpgradeMomentSessionComplete();
                }
            }
            return;
        }
        /** 升级四选一选完后延迟再出下一波 */
        if (stgPostUpgradeAdvanceAtMs != null && performance.now() >= stgPostUpgradeAdvanceAtMs) {
            stgPostUpgradeAdvanceAtMs = null;
            const ok = advanceStgWaveIndexAndSpawnNext();
            if (!ok) {
                beginStgChapterTransitionOrWin();
            }
        }
        const dtSec = dt * 0.001;
        const typesMap = getEnemyTypeMap();
        const cw = canvas.width;
        const ch = canvas.height;
        const nowT = performance.now();
        /** 受伤后拉回出生点期间：不能移动、不能开火（与 hitSpawnHoldMs 一致） */
        const inHitHold = player._stgHitHoldUntil != null && nowT < player._stgHitHoldUntil;
        const playerX0 = player.x;
        const playerY0 = player.y;

        /** --- 玩家移动 --- */
        let mvx = 0;
        let mvy = 0;
        if (keys.ArrowLeft) mvx -= 1;
        if (keys.ArrowRight) mvx += 1;
        if (keys.ArrowUp) mvy -= 1;
        if (keys.ArrowDown) mvy += 1;
        /** Shift：慢速移动 + 可选独立「集中」主武器参数（与武器编辑器一致） */
        const shiftHeld = keys.ShiftLeft || keys.ShiftRight;
        const nowWall = performance.now();
        if (shiftHeld && !stgFocusHeldPrevFrame) {
            /** 每次进入慢速重新累计 */
            stgFocusGrazeEnergyCount = 0;
        } else if (!shiftHeld && stgFocusHeldPrevFrame) {
            /** 退出慢速后发射累计能量弹，并清零 */
            emitStgFocusGrazeEnergyBurst(stgFocusGrazeEnergyCount);
            stgFocusGrazeEnergyCount = 0;
        }
        stgFocusHeldPrevFrame = shiftHeld;
        /** 道具M：非狂怒分支清空；狂怒到期先减一层（最高层先掉），若仍有层则新开一段同长度 CD；叠层时整段 CD 在击杀逻辑里刷新 */
        if (stgFocusBranch !== 'rage') {
            stgRageStacks = 0;
            stgRageEndMs = 0;
        } else if (stgRageStacks > 0 && nowWall >= stgRageEndMs) {
            stgRageStacks--;
            if (stgRageStacks > 0) {
                stgRageEndMs = nowWall + getStgRageDurationMs();
            } else {
                stgRageEndMs = 0;
            }
        }
        if (!inHitHold) {
            if (mvx !== 0 || mvy !== 0) {
                const len = Math.hypot(mvx, mvy) || 1;
                const fm = player.focusMoveMult != null ? player.focusMoveMult : STG_FOCUS_MOVE_MULT;
                /** 道具R：试做型封魔阵持续期间额外移速（与文档「持续时间内能够增加自机移速」一致） */
                const nowMv = performance.now();
                const sealMv =
                    stgSealField && nowMv < stgSealField.endMs && stgSealField.moveBonusDuringSeal != null
                        ? stgSealField.moveBonusDuringSeal
                        : 1;
                const sp = player.moveSpeed * bonusMoveMult * (shiftHeld ? fm : 1) * sealMv;
                player.x += (mvx / len) * sp * dtSec;
                player.y += (mvy / len) * sp * dtSec;
            }
            player.x = Math.max(player.radius, Math.min(cw - player.radius, player.x));
            player.y = Math.max(player.radius, Math.min(ch - player.radius, player.y));
            /** 站桩蓄能（focus_stationary_ramp）：仅慢速且无方向输入时累计站立毫秒 */
            if (shiftHeld && mvx === 0 && mvy === 0) {
                player._stgFocusStandStillMs = (player._stgFocusStandStillMs | 0) + dt;
            } else {
                player._stgFocusStandStillMs = 0;
            }
        } else {
            snapStgPlayerToSpawn();
        }
        player._stgFrameMovePx = Math.hypot(player.x - playerX0, player.y - playerY0);

        /** 生命恢复：局外 health_regen_bonus × 局内基础道具2；若局外为 0，基础道具2 仍给少量按生命百分比回复 */
        if (
            playerStatsRef &&
            playerStatsRef.getStat &&
            player.stgLifeHalfUnitsRemain != null &&
            player.stgLifeHalfUnitsRemain < getStgPlayerMaxLifeHalfUnits()
        ) {
            const reg = playerStatsRef.getStat('health_regen_bonus') || 0;
            let rate = reg > 0 ? reg * 0.005 * stgRunRegenMult : stgRunRegenMult > 1 ? 0.004 * (stgRunRegenMult - 1) : 0;
            if (rate > 0) {
                const maxH = getStgPlayerMaxLifeHalfUnits();
                player._stgRegenHalfAcc = (player._stgRegenHalfAcc || 0) + maxH * rate * dtSec;
                while (player._stgRegenHalfAcc >= 1 && player.stgLifeHalfUnitsRemain < maxH) {
                    player._stgRegenHalfAcc -= 1;
                    player.stgLifeHalfUnitsRemain++;
                }
                syncStgPlayerLifeHpMirror();
            }
        }

        /** --- 玩家主武器（Z 按住）；大招（X）仅触发构筑招式，不发射 skill 弹幕 --- */
        /** 道具E：扩散（非 Shift）下按间隔产球；拉回停滞时不产球、不开火 */
        if (!inHitHold) {
            if (stgTakenUpgradeIds.has('spread_yinyang')) {
                const yyCfg = getStgSpreadYinyangOverride();
                if (!shiftHeld) {
                    if (stgYinYangNextSpawnWallMs == null) {
                        stgYinYangNextSpawnWallMs = nowT + yyCfg.spawnIntervalMs;
                    }
                    if (nowT >= stgYinYangNextSpawnWallMs) {
                        stgYinYangNextSpawnWallMs = nowT + yyCfg.spawnIntervalMs;
                        if (stgYinYangOrbs.length < yyCfg.maxOrbs) {
                            stgYinYangOrbs.push({
                                x: player.x,
                                y: player.y,
                                r: yyCfg.orbRadius,
                                visR: yyCfg.visR,
                                alive: true,
                                lifeMs: yyCfg.orbDurationMs,
                                maxLifeMs: yyCfg.orbDurationMs,
                                phaseRad: Math.random() * Math.PI * 2,
                                orbitR: 34 + Math.random() * 6,
                                orbitOmega: 1.75 + Math.random() * 0.55
                            });
                        }
                    }
                }
            } else {
                stgYinYangNextSpawnWallMs = null;
            }
            if (!player._lastFireMs) player._lastFireMs = 0;
            const mainIvBase = shiftHeld
                ? player.focusFireIntervalMs != null
                    ? player.focusFireIntervalMs
                    : player.fireIntervalMs
                : player.fireIntervalMs;
            let fireIv = mainIvBase * bonusFireIntervalMult;
            /** 道具M：狂怒叠层缩短主武器射击间隔（扩散与慢速均生效；可局内构筑覆盖每层乘数） */
            if (stgFocusBranch === 'rage' && stgRageStacks > 0 && nowT < stgRageEndMs) {
                const rex = getStgRageEffectOverride();
                fireIv *= Math.pow(rex.fireIvMultPerStack, stgRageStacks);
            }
            /** 扩散射速：仅普通模式 */
            if (!shiftHeld && stgTakenUpgradeIds.has('spread_rof')) {
                fireIv *= getStgSpreadRofOverride().intervalMult;
            }
            /** 连杀激射：普通模式击杀叠层 */
            if (!shiftHeld && stgTakenUpgradeIds.has('spread_kill_haste')) {
                if (nowT >= stgSpreadKillHasteEndMs) {
                    stgSpreadKillHasteStacks = 0;
                } else if (stgSpreadKillHasteStacks > 0) {
                    fireIv *= 1 / (1 + stgSpreadKillHasteStacks * STG_SPREAD_KILL_HASTE_ROF_PER_STACK);
                }
            }
            if (keys.KeyZ && nowT - player._lastFireMs >= fireIv) {
                player._lastFireMs = nowT;
                emitPlayerVolley(false, shiftHeld);
            }
            /** 道具C：扩散模式下伴身炮台额外朝最近敌射击 */
            const turOv = stgTakenUpgradeIds.has('spread_turret') ? getStgSpreadTurretOverride() : null;
            if (
                keys.KeyZ &&
                stgTakenUpgradeIds.has('spread_turret') &&
                !shiftHeld &&
                turOv &&
                nowT - stgSideTurretLastFireMs >= turOv.fireIntervalMs
            ) {
                stgSideTurretLastFireMs = nowT;
                const mainAtk = player.mainWeaponAttack != null ? player.mainWeaponAttack : 10;
                let tdmg =
                    applyStgWeaponBaseAttackBonuses(mainAtk) * bonusDamage * getStgUltAtkDamageMult() * turOv.dmgMult;
                const prT = player.radius != null ? player.radius : 16;
                const tx = player.x + prT * 2.15 + 8;
                const ty = player.y;
                let vx = 0;
                let vy = -1;
                let best = null;
                let bd = 1e9;
                for (let ei = 0; ei < enemies.length; ei++) {
                    const en = enemies[ei];
                    if (!en.alive) continue;
                    const d = Math.hypot(en.x - tx, en.y - ty);
                    if (d < bd) {
                        bd = d;
                        best = en;
                    }
                }
                if (best) {
                    const ang = Math.atan2(best.y - ty, best.x - tx);
                    vx = Math.cos(ang);
                    vy = Math.sin(ang);
                }
                const tspd = (player.bulletSpeed != null ? player.bulletSpeed : 420) * bonusBulletSpeed;
                playerBullets.push({
                    x: tx,
                    y: ty,
                    vx: vx * tspd,
                    vy: vy * tspd,
                    dmg: tdmg * getStgWeakDamageMult(),
                    alive: true,
                    radius: Math.max(3, (player.bulletRadius != null ? player.bulletRadius : 4) * 0.9),
                    shape: normalizePlayerBulletVisualShape(player.bulletVisualShape),
                    pierceHitsLeft: 1,
                    pierceHitEnemyIds: null,
                    homing: false,
                    homingStr: 0,
                    spreadCritBonus: 0,
                    fromSpread: true,
                    fromFocusMain: false,
                    isCrystal: false,
                    allowCrystalAcc: false,
                    isTurret: true
                });
            }
            /** 伏魔针·式神援护：慢速 + Z 按住时周期发射低威力伏魔针（类炮台，仅 Shift） */
            const shOv = stgTakenUpgradeIds.has('focus_shikigami') ? getStgShikigamiOverride() : null;
            if (
                keys.KeyZ &&
                shOv &&
                shiftHeld &&
                nowT - stgShikigamiLastFireMs >= shOv.fireIntervalMs
            ) {
                stgShikigamiLastFireMs = nowT;
                const mainAtkF = player.focusWeaponAttack != null ? player.focusWeaponAttack : 10;
                let sdmg =
                    applyStgWeaponBaseAttackBonuses(mainAtkF) * bonusDamage * getStgUltAtkDamageMult() * shOv.dmgMult;
                const prS = player.radius != null ? player.radius : 16;
                const sx = player.x - prS * 2.0;
                const sy = player.y - prS * 0.35;
                let svx = 0;
                let svy = -1;
                let bestS = null;
                let bdS = 1e9;
                for (let sei = 0; sei < enemies.length; sei++) {
                    const en = enemies[sei];
                    if (!en.alive) continue;
                    const d = Math.hypot(en.x - sx, en.y - sy);
                    if (d < bdS) {
                        bdS = d;
                        bestS = en;
                    }
                }
                if (bestS) {
                    const ang = Math.atan2(bestS.y - sy, bestS.x - sx);
                    svx = Math.cos(ang);
                    svy = Math.sin(ang);
                }
                let fspdMult = 1;
                if (stgTakenUpgradeIds.has('focus_bullet_spd')) {
                    fspdMult = getStgFocusBulletSpdOverride().mult;
                }
                const spdF = (player.focusBulletSpeed != null ? player.focusBulletSpeed : player.bulletSpeed) *
                    bonusBulletSpeed *
                    fspdMult;
                const brF =
                    player.focusBulletRadius != null ? player.focusBulletRadius : player.bulletRadius != null ? player.bulletRadius : 4;
                const visF = normalizePlayerBulletVisualShape(
                    player.focusBulletVisualShape != null ? player.focusBulletVisualShape : player.bulletVisualShape
                );
                playerBullets.push({
                    x: sx,
                    y: sy,
                    vx: svx * spdF,
                    vy: svy * spdF,
                    dmg: sdmg * getStgWeakDamageMult(),
                    alive: true,
                    radius: Math.max(3, brF * 0.92),
                    shape: visF,
                    pierceHitsLeft: 1,
                    pierceHitEnemyIds: null,
                    homing: false,
                    homingStr: 0,
                    spreadCritBonus: 0,
                    fromSpread: false,
                    fromFocusMain: true,
                    isCrystal: false,
                    allowCrystalAcc: false,
                    isShikigami: true
                });
            }
            if (!player._lastSkillFireMs) player._lastSkillFireMs = 0;
            const skillIv = (player.skillFireIntervalMs != null ? player.skillFireIntervalMs : 120) * bonusFireIntervalMult;
            const skillCdRaw = player.skillCooldownMs != null ? player.skillCooldownMs : 0;
            /** 基础道具9：充能点价值 → 冷却按 bonusUltChargeMult 缩短 */
            const skillCd = skillCdRaw > 0 ? skillCdRaw / bonusUltChargeMult : 0;
            /** X：消耗 1 格大招充能；未选梦想妙珠分支时试做型封魔阵，选 T 后妙珠 */
            if (
                keys.KeyX &&
                stgUltCharges > 0 &&
                nowT >= (player._skillCooldownUntil || 0) &&
                nowT - player._lastSkillFireMs >= skillIv
            ) {
                stgUltCharges--;
                if (stgUltBranch === 'dream') {
                    player._lastSkillFireMs = nowT;
                    activateStgUltDream();
                    if (skillCd > 0) player._skillCooldownUntil = nowT + skillCd;
                } else {
                    player._lastSkillFireMs = nowT;
                    activateStgUltSeal();
                    if (skillCd > 0) player._skillCooldownUntil = nowT + skillCd;
                }
            }
        }

        /** --- 出兵与自动下一波：倒计时到点后仅当本波已净空才衔接；否则短间隔重试（与清怪一致） --- */
        const waves = waveData.waves || [];
        if (interWaveCountEnd != null && performance.now() >= interWaveCountEnd) {
            if (waveIndex >= waves.length - 1) {
                interWaveCountEnd = null;
            } else {
                const progressed = tryStgAutoStartNextWave();
                if (!progressed) {
                    interWaveCountEnd = performance.now() + 400;
                }
            }
        }

        if (getSpawnPendingCount() > 0) {
            spawnAccMs += dt;
            while (spawnAccMs >= spawnIntervalMs && getSpawnPendingCount() > 0) {
                spawnAccMs -= spawnIntervalMs;
                const raw = spawnQueueLegacy.shift();
                spawnEnemyFromRaw(raw, typesMap, null);
            }
        } else if (
            phase === 'playing' &&
            enemies.length === 0 &&
            getSpawnPendingCount() === 0 &&
            waveIndex >= waves.length - 1
        ) {
            /** 最后一波净空：衔接升级时刻 / 下一章 / 通关（见 tryStgAutoStartNextWave） */
            tryStgAutoStartNextWave();
        }

        /** 全局停火几何线 Y（由阵型「停火行号」× 当前格高 得到；null=仅要求先入场） */
        const fireStopY = getStgEnemyFireStopLineYClamped(ch);

        /** --- 敌人 --- */
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (!e.alive) {
                enemies.splice(i, 1);
                continue;
            }
            if (e.stgBossConfigSnapshot) {
                tickStgBossFsm(e, nowT);
            }
            updateStgEnemyPosition(e, player, cw, ch, dtSec);

            const er = e.radius != null ? e.radius : 14;
            if (e.stgSpawnClockMs == null) e.stgSpawnClockMs = nowT;
            /** 与画布 [0,cw]×[0,ch] 有任意重叠则视为已入场，之后才允许「完全离场」剔除 */
            const overlapsCanvas = !(e.x + er < 0 || e.x - er > cw || e.y + er < 0 || e.y - er > ch);
            if (overlapsCanvas) e.stgHasEnteredPlayfield = true;

            /**
             * 从未入场且长期完全在屏外：lock_y/anchor 等只沿单轴移到「目标」后 moveIdle，若 X 或 Y 整段留在扩展格侧，
             * overlapsCanvas 永为假 → 无法走下方「先入场再离场」分支，波次永远无法清空。
             */
            if (
                !e.stgHasEnteredPlayfield &&
                isStgEnemyFullyOutsideCanvas(e, cw, ch) &&
                nowT - e.stgSpawnClockMs >= STG_ENEMY_OFFSCREEN_NO_ENTRY_STUCK_MS
            ) {
                markStgWaveEnemyResolved(e);
                e.alive = false;
                console.warn('[STG] 敌机长期未进入主画布且仍在屏外，已强制清除以免卡波', e.typeId || '');
                continue;
            }

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

            /** 战斗弹幕：须先进入棋盘；可选停火线（中心 Y≥线则停，含连射余弹）；死后弹幕不走此分支 */
            const canFireByLine = fireStopY == null || e.y < fireStopY;
            const canFireNormal = e.stgHasEnteredPlayfield && canFireByLine;
            /** BOSS：仅「攻击」模块允许战斗弹幕 */
            const bossFsmBlocks = e.stgBossConfigSnapshot && !isStgBossInAttackModule(e);

            /** none=无弹幕；死后弹幕仅在阵亡时发射，不在此循环；眩晕中不发弹 */
            const stunNow = performance.now();
            const stunned = e.stgStunUntil != null && stunNow < e.stgStunUntil;
            if (stunned) {
                e._stgBurstRemain = 0;
            } else if (!canFireNormal) {
                e._stgBurstRemain = 0;
            } else if (
                !bossFsmBlocks &&
                e.pattern !== 'none' &&
                e.stgEmitWhen !== 'on_death' &&
                e._stgBurstRemain > 0 &&
                performance.now() >= (e._stgBurstNextMs || 0)
            ) {
                /** 连射续发：与冷却独立，按间隔再发一轮同样式弹幕 */
                const iv = Math.max(40, Math.min(500, e.stgBurstIntervalMs != null ? e.stgBurstIntervalMs : 100));
                const total = e._stgBurstTotal != null ? e._stgBurstTotal : 1;
                const idx = e._stgBurstIndex != null ? e._stgBurstIndex : 0;
                emitStgEnemyAttackVolley(e, player, idx, total);
                e._stgBurstRemain = (e._stgBurstRemain || 0) - 1;
                e._stgBurstIndex = idx + 1;
                if (e._stgBurstRemain > 0) {
                    e._stgBurstNextMs = performance.now() + iv;
                } else {
                    e._stgBurstRemain = 0;
                    notifyBossFirePatternCycleComplete(e);
                }
            }
            if (
                canFireNormal &&
                !stunned &&
                !bossFsmBlocks &&
                e.pattern !== 'none' &&
                e.stgEmitWhen !== 'on_death' &&
                performance.now() - e.lastShootTime >= e.shootCooldownMs
            ) {
                e.lastShootTime = performance.now();
                emitStgEnemyAttack(e, player);
            }
        }

        /** 多段移动：相邻阵型格同队 — 任一人到达信标则本帧末将队友拉齐到同一路径状态 */
        applyStgWaypointQueueBeaconSync(enemies);

        /** 多段移动：同类路径敌机圆形机体互斥（位移与自机碰撞之间推挤分离） */
        resolveStgWaypointEnemySeparation(enemies);

        /** 敌机身体 vs 自机判定点：可每种类在怪物编辑器关闭；伤害规则与敌弹一致（半格/整格） */
        if (phase === 'playing' && player) {
            const nowCt = performance.now();
            const pr = getStgPlayerHitRadius();
            if (!isStgPlayerInvulnerable(nowCt)) {
                for (let ei = 0; ei < enemies.length; ei++) {
                    const e = enemies[ei];
                    if (!e.alive || e.stgContactDamagePlayer === false) continue;
                    const er = e.radius != null ? e.radius : 14;
                    if (Math.hypot(e.x - player.x, e.y - player.y) < er + pr) {
                        const halves = resolveStgBulletLifeDamageHalvesFromEnemy(e);
                        player.stgLifeHalfUnitsRemain = Math.max(0, (player.stgLifeHalfUnitsRemain | 0) - halves);
                        syncStgPlayerLifeHpMirror();
                        applyStgPlayerHitResponse(nowCt);
                        triggerStgPlayerHitFx(player.x, player.y, 12, 155);
                        console.log('[STG] 机体接触伤害', e.typeId, '半格×', halves);
                        if (player.stgLifeHalfUnitsRemain <= 0) {
                            phase = 'dead';
                            showResult(false);
                            isRunning = false;
                            return;
                        }
                        break;
                    }
                }
            }
        }

        /** 受伤后的持续消弹：敌机在上循环中已发射的弹幕在此清空 */
        if (player && player._bulletClearUntil != null && performance.now() < player._bulletClearUntil) {
            enemyBullets.length = 0;
        }

        /** --- 子弹 --- */
        for (let i = playerBullets.length - 1; i >= 0; i--) {
            const b = playerBullets[i];
            if (!b.alive) {
                playerBullets.splice(i, 1);
                continue;
            }
            /** 道具D：扩散追踪弹转向最近敌人 */
            const hstr = b.homingStr != null ? b.homingStr : 0;
            if (b.homing && hstr > 0 && enemies.length) {
                let bx = b.x;
                let by = b.y;
                let near = null;
                let nd = 1e9;
                for (let ei = 0; ei < enemies.length; ei++) {
                    const en = enemies[ei];
                    if (!en.alive) continue;
                    const d = Math.hypot(en.x - bx, en.y - by);
                    if (d < nd) {
                        nd = d;
                        near = en;
                    }
                }
                if (near) {
                    const spd = Math.hypot(b.vx, b.vy);
                    if (spd > 8) {
                        const ta = Math.atan2(near.y - by, near.x - bx);
                        let ca = Math.atan2(b.vy, b.vx);
                        let da = ta - ca;
                        while (da > Math.PI) da -= Math.PI * 2;
                        while (da < -Math.PI) da += Math.PI * 2;
                        const turnRate = (hstr / 100) * 3.2;
                        const step = Math.max(-turnRate * dtSec, Math.min(turnRate * dtSec, da));
                        ca += step;
                        b.vx = Math.cos(ca) * spd;
                        b.vy = Math.sin(ca) * spd;
                    }
                }
            }
            b.x += b.vx * dtSec;
            b.y += b.vy * dtSec;
            if (b.y < -20 || b.x < -20 || b.x > cw + 20) {
                b.alive = false;
            }
        }

        /** 道具E：阴阳玉绕自机圆形轨道公转；重叠范围内持续伤害 = dpsFrac×扩散主武器等效单发/秒 */
        if (player) {
            const yyDps =
                getStgSpreadMainVolleyDmgForYinYang() *
                (stgTakenUpgradeIds.has('spread_yinyang') ? getStgSpreadYinyangOverride().dpsFrac : 0.5);
            for (let yi = stgYinYangOrbs.length - 1; yi >= 0; yi--) {
                const o = stgYinYangOrbs[yi];
                if (!o || !o.alive) {
                    stgYinYangOrbs.splice(yi, 1);
                    continue;
                }
                const om = o.orbitOmega != null ? o.orbitOmega : 1.9;
                o.phaseRad = (o.phaseRad != null ? o.phaseRad : 0) + om * dtSec;
                const orad = o.orbitR != null ? o.orbitR : 34;
                o.x = player.x + Math.cos(o.phaseRad) * orad;
                o.y = player.y + Math.sin(o.phaseRad) * orad;
                o.lifeMs -= dt;
                if (o.lifeMs <= 0) {
                    o.alive = false;
                    stgYinYangOrbs.splice(yi, 1);
                    continue;
                }
                const wm = getStgWeakDamageMult();
                for (let ei = 0; ei < enemies.length; ei++) {
                    const en = enemies[ei];
                    if (!en.alive) continue;
                    if (Math.hypot(en.x - o.x, en.y - o.y) < o.r + en.radius) {
                        en.hp -= yyDps * wm * dtSec;
                        if (en.hp <= 0) {
                            if (en.pattern !== 'none' && en.stgEmitWhen === 'on_death') {
                                emitStgEnemyAttack(en, player);
                            }
                            markStgWaveEnemyResolved(en);
                            en.alive = false;
                            /** 连杀激射：阴阳玉 DoT 击杀仍算「扩散模式」击杀 */
                            if (!shiftHeld && stgTakenUpgradeIds.has('spread_kill_haste')) {
                                stgSpreadKillHasteStacks = Math.min(
                                    STG_SPREAD_KILL_HASTE_MAX,
                                    stgSpreadKillHasteStacks + 1
                                );
                                stgSpreadKillHasteEndMs = performance.now() + STG_SPREAD_KILL_HASTE_MS;
                            }
                            const pExp = Math.max(5, Math.floor(12 * bonusExpMult));
                            pickups.push(createPickupAtKill(en.x, en.y, pExp));
                            pushStgChargePickupOnEnemyKillIfConfigured(en);
                        }
                    }
                }
            }
        }

        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const b = enemyBullets[i];
            if (!b.alive) {
                enemyBullets.splice(i, 1);
                continue;
            }
            /** 本帧位移前坐标，用于擦弹「移动一点点」判定 */
            const bx0 = b.x;
            const by0 = b.y;
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
                        lifeDmgHalves: b.lifeDmgHalves != null ? b.lifeDmgHalves : 1,
                        pattern: b.pattern,
                        splitAfterMs: 0,
                        splitChildSpeed: sp,
                        homingStr: b.homingStr != null ? b.homingStr : 0,
                        radius: b.radius != null ? b.radius : 5,
                        shape: b.shape === 'triangle' ? 'triangle' : 'circle',
                        sprite: b.sprite ? b.sprite : '',
                        typeId: b.typeId != null && String(b.typeId).trim() !== '' ? String(b.typeId) : 'normal'
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
            const movedPx = Math.hypot(b.x - bx0, b.y - by0);
            /** 先判擦弹再消弹：否则阴阳玉先抹掉敌弹，本帧永远来不及擦弹 */
            if (phase === 'playing' && player && movedPx > 0) {
                tryStgGrazeEnemyBullet(b, bx0, by0, movedPx, nowT, shiftHeld);
            }
            /** 道具E：阴阳玉圆形范围与敌弹重叠则消弹（阻挡弹幕） */
            if (
                phase === 'playing' &&
                stgTakenUpgradeIds.has('spread_yinyang') &&
                stgYinYangOrbs.length &&
                b.alive
            ) {
                const br = b.radius != null ? b.radius : 5;
                for (let oi = 0; oi < stgYinYangOrbs.length; oi++) {
                    const yo = stgYinYangOrbs[oi];
                    if (!yo || !yo.alive) continue;
                    const yr = yo.r != null ? yo.r : 48;
                    if (Math.hypot(b.x - yo.x, b.y - yo.y) < yr + br) {
                        b.alive = false;
                        break;
                    }
                }
            }
            if (b.y > ch + 30 || b.x < -30 || b.x > cw + 30) {
                b.alive = false;
            }
        }

        /** 擦弹小白球飞向判定点（在敌弹与自机碰撞前更新，便于同帧吸附） */
        updateStgGrazeOrbs(dtSec);
        updateStgGrazeRangeFlashes(performance.now());

        /** 大招：封魔阵 / 梦想妙珠（消弹 + 区域伤害，需在敌弹打自机前执行） */
        updateStgUltSkills(dtSec, performance.now(), cw, ch);

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
            /** 道具E：阴阳玉与激光段相交则整段移除（视为挡弹） */
            if (stgTakenUpgradeIds.has('spread_yinyang') && stgYinYangOrbs.length) {
                let laserBlocked = false;
                const halfW = (L.width != null ? L.width : 14) * 0.5;
                for (let oi = 0; oi < stgYinYangOrbs.length; oi++) {
                    const yo = stgYinYangOrbs[oi];
                    if (!yo || !yo.alive) continue;
                    const yr = yo.r != null ? yo.r : 48;
                    if (distPointToSegment(yo.x, yo.y, L.x1, L.y1, L.x2, L.y2) < yr + halfW) {
                        laserBlocked = true;
                        break;
                    }
                }
                if (laserBlocked) {
                    enemyLasers.splice(li, 1);
                    continue;
                }
            }
            const dSeg = distPointToSegment(player.x, player.y, L.x1, L.y1, L.x2, L.y2);
            if (dSeg < L.width * 0.5 + prHit && !isStgPlayerInvulnerable(nowMs)) {
                playerInLaser = true;
                /** 激光按 DPS 折算为「半格」流失，不触发受伤消弹/无敌（仅弹幕命中触发） */
                const dmgN = L.dmg != null ? Number(L.dmg) : 1;
                const halvesPerSec = Math.max(0.35, Math.min(8, (Number.isFinite(dmgN) ? dmgN : 1) * 0.55));
                player._stgLaserHalfAcc = (player._stgLaserHalfAcc || 0) + halvesPerSec * dtSec * 2.5;
                while (player._stgLaserHalfAcc >= 1 && player.stgLifeHalfUnitsRemain > 0) {
                    player._stgLaserHalfAcc -= 1;
                    player.stgLifeHalfUnitsRemain--;
                }
                syncStgPlayerLifeHpMirror();
                stgLaserFxAccMs += dt;
                if (stgLaserFxAccMs >= 95) {
                    stgLaserFxAccMs = 0;
                    triggerStgPlayerHitFx(player.x, player.y, 6, 72);
                }
                if (player.stgLifeHalfUnitsRemain <= 0) {
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
                    if (b.pierceHitEnemyIds && e.stgInstanceId != null && b.pierceHitEnemyIds.has(e.stgInstanceId)) {
                        continue;
                    }
                    let hitDmg = b.dmg * getStgWeakDamageMult();
                    if (playerStatsRef && playerStatsRef.getStat) {
                        let critP = Math.min(
                            0.95,
                            (playerStatsRef.getStat('crit_chance_bonus') || 0) + (playerStatsRef.getStat('crit_rate') || 0)
                        );
                        if (b.spreadCritBonus) critP = Math.min(0.95, critP + b.spreadCritBonus);
                        if (critP > 0 && Math.random() < critP) hitDmg *= 2;
                    }
                    e.hp -= hitDmg;
                    /** 针芒迟滞：伏魔针命中后小概率短暂眩晕 */
                    if (
                        b.fromFocusMain &&
                        stgTakenUpgradeIds.has('focus_needle_slow') &&
                        e.hp > 0 &&
                        Math.random() < 0.14
                    ) {
                        const stunNow = performance.now();
                        e.stgStunUntil = stunNow + 320;
                    }
                    if (b.allowCrystalAcc && stgTakenUpgradeIds.has('focus_crystal_base')) {
                        stgCrystalFocusHitAcc++;
                        if (stgCrystalFocusHitAcc >= STG_CRYSTAL_FOCUS_HITS_NEEDED) {
                            stgCrystalFocusHitAcc = 0;
                            emitCrystalVolley();
                        }
                    }
                    if (b.pierceHitEnemyIds && e.stgInstanceId != null) {
                        b.pierceHitEnemyIds.add(e.stgInstanceId);
                    }
                    const pierceLeft = b.pierceHitsLeft != null ? b.pierceHitsLeft : 1;
                    const nextPierce = pierceLeft - 1;
                    if (nextPierce <= 0) {
                        b.alive = false;
                    } else {
                        b.pierceHitsLeft = nextPierce;
                    }
                    if (e.hp <= 0) {
                        /** 死后弹幕：与战斗中同一套 emit（扇/环/激光/单发）与子弹属性（分裂、跟踪等） */
                        if (e.pattern !== 'none' && e.stgEmitWhen === 'on_death') {
                            emitStgEnemyAttack(e, player);
                            console.log('[STG] 死后弹幕：种类', e.typeId || '');
                        }
                        markStgWaveEnemyResolved(e);
                        e.alive = false;
                        /** 连杀激射：非慢速（扩散）模式下击杀叠层，提高短时射速 */
                        if (!shiftHeld && stgTakenUpgradeIds.has('spread_kill_haste')) {
                            stgSpreadKillHasteStacks = Math.min(
                                STG_SPREAD_KILL_HASTE_MAX,
                                stgSpreadKillHasteStacks + 1
                            );
                            stgSpreadKillHasteEndMs = performance.now() + STG_SPREAD_KILL_HASTE_MS;
                        }
                        /** 道具M：慢速+狂怒分支，每击杀 5 敌叠狂怒层 */
                        if (shiftHeld && stgFocusBranch === 'rage' && stgTakenUpgradeIds.has('focus_rage_core')) {
                            stgRageKillAcc++;
                            if (stgRageKillAcc >= STG_RAGE_KILLS_PER_STACK) {
                                stgRageKillAcc = 0;
                                const maxS = getStgRageMaxStacks();
                                if (stgRageStacks < maxS) {
                                    stgRageStacks++;
                                    stgRageEndMs = performance.now() + getStgRageDurationMs();
                                }
                            }
                        }
                        let pExp = Math.max(5, Math.floor(12 * bonusExpMult));
                        const pk = createPickupAtKill(e.x, e.y, pExp);
                        const bigP = stgTakenUpgradeIds.has('spread_big_p') ? getStgSpreadBigPOverride() : null;
                        const bigE = stgTakenUpgradeIds.has('spread_big_energy') ? getStgSpreadBigEnergyOverride() : null;
                        if (bigP && b.fromSpread && Math.random() < bigP.chance) {
                            pk.exp = Math.floor(pExp * bigP.expMult);
                            pk.pickupKind = 'bigP';
                            pk.pickupRadius = (pk.pickupRadius != null ? pk.pickupRadius : 10) * 1.35;
                            pk.sizePx = (pk.sizePx != null ? pk.sizePx : 20) * 1.35;
                        } else if (bigE && b.fromSpread && Math.random() < bigE.chance) {
                            pk.exp = Math.floor(pExp * bigE.expMult);
                            pk.pickupKind = 'bigEnergy';
                            pk.pickupRadius = (pk.pickupRadius != null ? pk.pickupRadius : 10) * 1.35;
                            pk.sizePx = (pk.sizePx != null ? pk.sizePx : 20) * 1.35;
                        }
                        pickups.push(pk);
                        pushStgChargePickupOnEnemyKillIfConfigured(e);
                        console.log('[STG] 击杀敌人，掉落 P点 经验', pExp);
                    }
                    break;
                }
            }
        }

        /** --- 敌弹 vs 玩家（含子弹自身半径） --- */
        const nowPlHit = performance.now();
        for (let i = 0; i < enemyBullets.length; i++) {
            const b = enemyBullets[i];
            if (!b.alive) continue;
            const br = b.radius != null ? b.radius : 5;
            if (Math.hypot(b.x - player.x, b.y - player.y) < br + getStgPlayerHitRadius()) {
                b.alive = false;
                if (isStgPlayerInvulnerable(nowPlHit)) {
                    continue;
                }
                const halves = b.lifeDmgHalves != null ? (b.lifeDmgHalves >= 2 ? 2 : 1) : 1;
                player.stgLifeHalfUnitsRemain = Math.max(0, (player.stgLifeHalfUnitsRemain | 0) - halves);
                syncStgPlayerLifeHpMirror();
                applyStgPlayerHitResponse(nowPlHit);
                triggerStgPlayerHitFx(player.x, player.y, 12, 155);
                console.log(
                    '[STG] 玩家受击，剩余',
                    (player.stgLifeHalfUnitsRemain * 0.5).toFixed(1),
                    '/',
                    player.stgLifeCellsMax,
                    '格'
                );
                if (player.stgLifeHalfUnitsRemain <= 0) {
                    phase = 'dead';
                    showResult(false);
                    isRunning = false;
                    return;
                }
            }
        }

        /** --- P点（直线 或 弧线上抛后下落；弧线可匀速 / 多种曲线速率） --- */
        const nowPickup = performance.now();
        const sealPullActive =
            stgSealField && player && nowPickup < stgSealField.endMs;
        for (let i = pickups.length - 1; i >= 0; i--) {
            const p = pickups[i];
            /** 试做型封魔阵：持续期间将屏上可拾取物向自机牵引（含经验 P 点与充能点） */
            if (sealPullActive) {
                const dx = player.x - p.x;
                const dy = player.y - p.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 2) {
                    const pullSpd = 340;
                    const nx = dx / dist;
                    const ny = dy / dist;
                    p.x += nx * pullSpd * dtSec;
                    p.y += ny * pullSpd * dtSec;
                }
            }
            if (p.mode === 'arc' && p.peakY != null && p.fallVy != null) {
                /** 旧版 P 点无 arcUpMode：仍按 vy 正负分段（兼容已落地存档） */
                if (p.arcUpMode == null && p.arcUpDone == null) {
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
                    const upMode = normalizeArcUpSpeedMode(p.arcUpMode);
                    const downMode = normalizeArcDownSpeedMode(p.arcDownMode);
                    if (!p.arcUpDone) {
                        if (upMode === 'uniform') {
                            /** 匀速上抛：固定向上速度 */
                            if (p.vy < 0) {
                                const ny = p.y + p.vy * dtSec;
                                if (ny <= p.peakY) {
                                    stgPickupOnArcUpFinished(p);
                                } else {
                                    p.y = ny;
                                }
                            }
                        } else {
                            /** 曲线上抛：按时间 t∈[0,1] 插值位移比例 s */
                            p.arcUpT = (p.arcUpT || 0) + dtSec;
                            const dur = Math.max(0.04, p.arcUpDurSec != null ? p.arcUpDurSec : 0.5);
                            const t = Math.min(1, p.arcUpT / dur);
                            let s;
                            if (upMode === 'ease_in') {
                                /** 先慢后快：s=t²，靠近弧顶时竖直速度最大 */
                                s = t * t;
                            } else if (upMode === 'ease_out') {
                                /** 先快后慢：s=1-(1-t)²，起跳快、近弧顶减速 */
                                s = 1 - (1 - t) * (1 - t);
                            } else {
                                /** ease_in_out：smoothstep，两端慢、中段最快 */
                                s = t * t * (3 - 2 * t);
                            }
                            const sy = p.arcStartY != null ? p.arcStartY : p.y;
                            p.y = sy + (p.peakY - sy) * s;
                            if (t >= 1) {
                                stgPickupOnArcUpFinished(p);
                            }
                        }
                    } else {
                        /** 下落阶段 */
                        if (downMode === 'uniform') {
                            p.y += p.fallVy * dtSec;
                        } else if (downMode === 'ease_in') {
                            /** 先慢后快：竖直速度从 0 指数趋近 fallVy */
                            let fc = p.fallVCurrent != null ? p.fallVCurrent : 0;
                            const target = p.fallVy;
                            fc += (target - fc) * Math.min(1, dtSec * 5.5);
                            p.fallVCurrent = fc;
                            p.y += fc * dtSec;
                        } else {
                            /** ease_out 先快后慢：初速高于 fallVy，再向 fallVy 回落 */
                            let fc = p.fallVCurrent != null ? p.fallVCurrent : p.fallVy * 1.42;
                            fc += (p.fallVy - fc) * Math.min(1, dtSec * 4.2);
                            p.fallVCurrent = fc;
                            p.y += fc * dtSec;
                        }
                    }
                }
            } else {
                p.y += p.vy * dtSec;
            }
            /** 玩家属性：判定点周围圆形区域内将经验类 P 点（含大福/大充能）拉向自机；充能点不走此条，避免与封魔阵牵引叠乘语义混淆时可单独调 */
            const attractR =
                player && player.pPickupAttractRadius != null && Number.isFinite(Number(player.pPickupAttractRadius))
                    ? Math.max(0, Math.min(1200, Number(player.pPickupAttractRadius)))
                    : 0;
            if (player && p.pickupKind !== 'charge') {
                const dx = player.x - p.x;
                const dy = player.y - p.y;
                const dist = Math.hypot(dx, dy);
                let inAttractRange = attractR > 0 && dist <= attractR;
                /** 慢速模式：经验点吸取范围扩大为与擦弹外椭圆一致 */
                if (!inAttractRange && shiftHeld) {
                    const gcfg = getStgGrazeRuntimeParams();
                    if (gcfg.enabled && gcfg.extra > 0) {
                        const hitR = getStgPlayerHitRadius();
                        const { rx, ry } = getStgGrazeOuterEllipseRadii(hitR, gcfg);
                        if (rx > 0 && ry > 0) {
                            const nx = (p.x - player.x) / rx;
                            const ny = (p.y - player.y) / ry;
                            inAttractRange = nx * nx + ny * ny <= 1;
                        }
                    }
                }
                if (inAttractRange && dist > 1.5) {
                    const pullSpd = 340;
                    const nx = dx / dist;
                    const ny = dy / dist;
                    p.x += nx * pullSpd * dtSec;
                    p.y += ny * pullSpd * dtSec;
                }
            }
            const baseR = p.pickupRadius != null && Number.isFinite(p.pickupRadius) ? p.pickupRadius : 10;
            const pr = baseR * bonusPickupRadius;
            if (Math.hypot(p.x - player.x, p.y - player.y) < pr + player.radius) {
                if (p.pickupKind === 'charge') {
                    const cv = Math.max(1, p.chargeValue != null ? p.chargeValue : 1);
                    stgUltChargeMeter += cv * bonusUltChargeMult;
                    applyStgUltChargeMeterOverflowAndHints();
                    pickups.splice(i, 1);
                    console.log('[STG] 拾取充能点，蓄能值', cv);
                } else {
                    const expGain = p.exp != null ? p.exp : 0;
                    exp += expGain;
                    pickups.splice(i, 1);
                    console.log('[STG] 拾取 P点，经验', exp, '/', expToNext);
                    while (exp >= expToNext) {
                        exp -= expToNext;
                        level++;
                        expToNext = computeExpToNextForLevel(level);
                        /** 经验升级不再即时三选一，累计到「升级时刻」按次数连续 4 选一 */
                        stgLevelUpsBanked++;
                    }
                }
            } else if (p.y > ch + 30) {
                pickups.splice(i, 1);
            }
        }

        updateStgPlayerHitFx(dt);
        checkStgWaveAllClearedAndAdvance();
        updateHud();
    }

    /**
     * 确认四选一选择：与点击卡牌、快捷键 1～4 共用；一轮升级时刻内可能连续多轮。
     */
    function finalizeStgUpgradePick(u) {
        if (!player || !u) return;
        applyStgUpgradePick(u);
        if (typeof u.apply === 'function') u.apply(player);
        console.log('[STG] 选择强化:', u.id, u.name, 'focusBranch=', stgFocusBranch, 'ultBranch=', stgUltBranch);

        stgUpgradeMomentRoundsLeft--;
        if (stgUpgradeMomentRoundsLeft > 0) {
            prepareLevelUpChoices4();
            const h = getHudElements();
            if (h.upgradeCards) {
                h.upgradeCards.innerHTML = '';
                upgradeChoices.forEach((u2, idx) => {
                    h.upgradeCards.appendChild(createStgUpgradeChoiceButton(u2, idx));
                });
            }
            const subEl = document.getElementById('stgUpgradeSubHint');
            if (subEl) {
                const cur = stgUpgradeMomentRoundTotal - stgUpgradeMomentRoundsLeft + 1;
                subEl.innerHTML = stgUiT('upgrade.subhintRound', { cur, total: stgUpgradeMomentRoundTotal });
            }
            const titleEl = document.getElementById('stgUpgradeTitle');
            if (titleEl) titleEl.textContent = stgUiT('upgrade.title');
            stgUpgradePickOpen = true;
            phase = 'levelup';
            lastFrameTime = performance.now();
            refreshStgAttackBuildPanel();
            refreshStgReimuBonusAside();
            return;
        }

        finalizeStgUpgradeMomentSessionComplete();
    }

    /**
     * 升级四选一单卡：顶栏为所属武器体系（博丽御符 / 伏魔针 / 封魔阵分支 Q–S / 妙珠分支 T–V / 基础属性；试做型封魔阵默认自带不进池）
     * @param {number} keyIndex 0..3，对应快捷键 1～4
     */
    function createStgUpgradeChoiceButton(u, keyIndex) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'stg-upgrade-card';
        const disp =
            window.StgUiI18n && typeof window.StgUiI18n.getUpgradeDisplay === 'function'
                ? window.StgUiI18n.getUpgradeDisplay(u)
                : { name: u.name, desc: u.desc };
        const badge =
            window.StgUiI18n && typeof window.StgUiI18n.getUpgradeWeaponBadge === 'function'
                ? window.StgUiI18n.getUpgradeWeaponBadge(u)
                : { text: '', cssClass: 'stat' };
        if (badge.text) {
            const sp = document.createElement('span');
            const wc = badge.cssClass || 'stat';
            sp.className = 'stg-up-weapon-badge stg-up-weapon--' + wc;
            sp.textContent = badge.text;
            btn.appendChild(sp);
            btn.classList.add('stg-upgrade-card--' + wc);
        }
        const hk = document.createElement('span');
        hk.className = 'stg-upgrade-hotkey';
        hk.textContent = String((keyIndex != null ? keyIndex : 0) + 1);
        btn.appendChild(hk);
        const titleEl = document.createElement('span');
        titleEl.className = 'stg-up-title';
        titleEl.textContent = disp.name;
        btn.appendChild(titleEl);
        const descEl = document.createElement('span');
        descEl.className = 'stg-up-desc';
        descEl.textContent = disp.desc;
        btn.appendChild(descEl);
        btn.addEventListener('click', () => finalizeStgUpgradePick(u));
        return btn;
    }

    /**
     * 升级时刻：洗牌后取至多 4 条构筑（不足则全展示）。
     */
    function prepareLevelUpChoices4() {
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
        for (let i = pool.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            const t = pool[i];
            pool[i] = pool[j];
            pool[j] = t;
        }
        const n = Math.min(4, pool.length);
        upgradeChoices = pool.slice(0, n);
        stgUpgradePickOpen = false;
    }

    /** 全屏居中四选一，phase=levelup，局内 update 暂停（由波次衔接或连续轮次调用） */
    /** @returns {boolean} 是否成功打开（失败时调用方应衔接波次，避免卡死） */
    function openStgUpgradeModal() {
        if (upgradeChoices.length === 0 || stgUpgradePickOpen) return false;
        const h = getHudElements();
        if (!h.upgrade || !h.upgradeCards) return false;
        h.upgradeCards.innerHTML = '';
        upgradeChoices.forEach((u, idx) => {
            h.upgradeCards.appendChild(createStgUpgradeChoiceButton(u, idx));
        });
        const titleEl = document.getElementById('stgUpgradeTitle');
        if (titleEl) titleEl.textContent = stgUiT('upgrade.title');
        const subEl = document.getElementById('stgUpgradeSubHint');
        if (subEl) {
            if (stgUpgradeMomentRoundTotal > 1) {
                const cur = stgUpgradeMomentRoundTotal - stgUpgradeMomentRoundsLeft + 1;
                subEl.innerHTML = stgUiT('upgrade.subhintRound', { cur, total: stgUpgradeMomentRoundTotal });
            } else {
                subEl.innerHTML = stgUiT('upgrade.subhint');
            }
        }
        h.upgrade.classList.remove('hidden');
        h.upgrade.setAttribute('aria-hidden', 'false');
        const hintBtn = document.getElementById('stgLevelUpHint');
        if (hintBtn) hintBtn.classList.add('hidden');
        stgUpgradePickOpen = true;
        phase = 'levelup';
        lastFrameTime = performance.now();
        return true;
    }

    function showResult(win) {
        lastShowResultWin = win;
        hideStgChapterTransitionOverlay();
        const h = getHudElements();
        /** 死亡/通关时关闭升级弹层与右下提示，避免挡结算 */
        if (h.upgrade) {
            h.upgrade.classList.add('hidden');
            h.upgrade.setAttribute('aria-hidden', 'true');
        }
        stgUpgradePickOpen = false;
        stgPendingWaveAdvanceAfterUpgradeMoment = false;
        stgPostUpgradeAdvanceAtMs = null;
        stgUpgradeMomentAnnounceEndMs = null;
        stgUpgradeMomentRoundsLeft = 0;
        stgLevelUpsBanked = 0;
        const hintGo = document.getElementById('stgLevelUpHint');
        if (hintGo) hintGo.classList.add('hidden');
        const subGo = document.getElementById('stgUpgradeSubHint');
        if (subGo) subGo.innerHTML = '';
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
        if (est === 'double_column') {
            const n = isSkill
                ? Math.max(1, Math.min(5, p.skillSingleCount != null ? p.skillSingleCount : 1))
                : Math.max(1, Math.min(5, p.singleCount != null ? p.singleCount : 1));
            const sep = isSkill
                ? p.skillDoubleColumnSep != null && Number.isFinite(Number(p.skillDoubleColumnSep))
                    ? Math.max(8, Math.min(56, Number(p.skillDoubleColumnSep)))
                    : 20
                : p.doubleColumnSep != null && Number.isFinite(Number(p.doubleColumnSep))
                  ? Math.max(8, Math.min(56, Number(p.doubleColumnSep)))
                  : 20;
            return stgUiT('attackBuild.stat.styleDoubleCol', { n, sep });
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

    /** 已选构筑图标：与三选一卡牌、左侧分区同色系（STG_UPGRADE_POOL.group） */
    function stgAttackUpgradeIconModifierClass(group) {
        const g = group || '';
        if (g === 'spread') return 'stg-attack-up-icon--spread';
        if (g === 'focus_crystal') return 'stg-attack-up-icon--focus-crystal';
        if (g === 'focus_rage') return 'stg-attack-up-icon--focus-rage';
        if (g === 'focus_misc') return 'stg-attack-up-icon--focus-misc';
        if (g === 'ult_seal') return 'stg-attack-up-icon--ult-seal';
        if (g === 'ult_dream') return 'stg-attack-up-icon--ult-dream';
        if (g === 'stat') return 'stg-attack-up-icon--stat';
        return 'stg-attack-up-icon--spread';
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
     * 已选构筑：图标 + 下方小字名称；悬浮 fixed 层仍显示完整名与描述（与界面语言一致）
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
            const disp =
                window.StgUiI18n && typeof window.StgUiI18n.getUpgradeDisplay === 'function'
                    ? window.StgUiI18n.getUpgradeDisplay(u)
                    : { name: u.name, desc: u.desc };
            /** 侧栏小字：优先 i18n 名，其次池内 name，避免空串导致「只有图标没有字」 */
            const shortLabel =
                disp.name != null && String(disp.name).trim() !== ''
                    ? String(disp.name).trim()
                    : u.name != null && String(u.name).trim() !== ''
                      ? String(u.name).trim()
                      : u.id != null
                        ? String(u.id)
                        : '—';
            const tip = disp.desc ? shortLabel + '\n' + disp.desc : shortLabel;

            const item = document.createElement('div');
            item.className = 'stg-attack-up-item';
            item.setAttribute('role', 'listitem');
            item.setAttribute('tabindex', '0');
            item.setAttribute('title', tip);
            item.setAttribute('aria-label', shortLabel + (disp.desc ? '。' + disp.desc : ''));

            const ic = document.createElement('span');
            ic.className = 'stg-attack-up-icon ' + stgAttackUpgradeIconModifierClass(u.group);
            ic.setAttribute('aria-hidden', 'true');
            ic.textContent = u.icon != null ? u.icon : '◇';

            const nameEl = document.createElement('div');
            nameEl.className = 'stg-attack-up-name';
            nameEl.textContent = shortLabel;

            /** 悬浮层标题与侧栏小字一致（避免 disp.name 为空时浮层缺标题） */
            const dispForTip = { name: shortLabel, desc: disp.desc };

            item.appendChild(ic);
            item.appendChild(nameEl);

            item.addEventListener('mouseenter', () => {
                showStgAttackUpgradeTooltip(item, dispForTip);
            });
            item.addEventListener('mouseleave', () => {
                scheduleHideStgAttackUpgradeTooltip();
            });
            item.addEventListener('focus', () => {
                showStgAttackUpgradeTooltip(item, dispForTip);
            });
            item.addEventListener('blur', () => {
                hideStgAttackUpgradeTooltip();
            });
            el.appendChild(item);
        }
    }

    /** 构筑四项统计：图标键 → 与侧栏配色无关的通用符号 */
    const STG_ATTACK_STAT_ICONS = { atk: '🗡️', aps: '⚡', spd: '💨', crit: '💥' };

    /**
     * 左侧构筑：横向四格，每格为 图标 → 短标签（攻击/攻速…）→ 数值；悬停格见完整 statTip
     * @param {HTMLElement|null} el
     * @param {{ key: string, value: string }[]} entries
     * @param {boolean} emptyShowPlaceholder true=无自机时「开始游戏后显示」
     */
    function fillStgAttackStatGrid(el, entries, emptyShowPlaceholder) {
        if (!el) return;
        el.className = 'stg-attack-stat-grid';
        el.innerHTML = '';
        const aria = stgUiT('attackBuild.statGridAria');
        if (aria) el.setAttribute('aria-label', aria);
        if (!entries || entries.length === 0) {
            const msg = document.createElement('div');
            msg.className = 'stg-attack-stat-grid-msg';
            msg.textContent = emptyShowPlaceholder ? stgUiT('attackBuild.placeholder') : '—';
            el.appendChild(msg);
            return;
        }
        for (let i = 0; i < entries.length; i++) {
            const row = entries[i];
            const cell = document.createElement('div');
            cell.className = 'stg-attack-stat-cell';
            cell.setAttribute('role', 'listitem');
            const tipKey = 'attackBuild.statTip.' + row.key;
            const labelKey = 'attackBuild.statLabel.' + row.key;
            const tip = stgUiT(tipKey);
            const shortLab = stgUiT(labelKey);
            const labText = shortLab && shortLab !== labelKey ? shortLab : tip || row.key;
            if (tip) {
                cell.title = tip;
                cell.setAttribute('aria-label', tip + ' ' + row.value);
            }
            const ic = document.createElement('span');
            ic.className = 'stg-attack-stat-icon';
            ic.setAttribute('aria-hidden', 'true');
            ic.textContent = STG_ATTACK_STAT_ICONS[row.key] || '·';
            const lab = document.createElement('span');
            lab.className = 'stg-attack-stat-label';
            lab.textContent = labText;
            const val = document.createElement('span');
            val.className = 'stg-attack-stat-val';
            val.textContent = row.value;
            cell.appendChild(ic);
            cell.appendChild(lab);
            cell.appendChild(val);
            el.appendChild(cell);
        }
    }

    /** 已选构筑：小标题显示「已选构筑」文案（与 i18n 一致），勿用 📦 占位以免遮挡真实标题 */
    function applyStgAttackUpgLabel(el) {
        if (!el) return;
        const t = stgUiT('attackBuild.upgradesLabel');
        el.textContent = t || '已选构筑';
        el.title = t || '已选构筑';
        el.setAttribute('aria-label', t || '已选构筑');
    }

    /**
     * 左侧「攻击构筑」：三种攻击各 4 项数值；已选构筑为图标+小字名，悬浮见详情。
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
        /** 大招：未选分支 → 试做型；选 Q 线 → 强化封魔阵；选 T 线 → 梦想妙珠 */
        if (hUlt) {
            hUlt.classList.remove('stg-attack-ult--locked');
            if (stgUltBranch === 'dream') {
                hUlt.textContent = stgUiT('attackBuild.ultNameDream');
            } else if (stgUltBranch === 'seal' && stgTakenUpgradeIds.has('ult_seal_size')) {
                hUlt.textContent = stgUiT('attackBuild.ultNameSealUpgraded');
            } else {
                hUlt.textContent = stgUiT('attackBuild.ultHeadingNeutral');
            }
        }
        const ultSection = document.querySelector('[data-stg-attack-section="ult"]');
        if (ultSection) {
            if (stgUltBranch === 'seal') ultSection.setAttribute('data-stg-ult-variant', 'seal');
            else if (stgUltBranch === 'dream') ultSection.setAttribute('data-stg-ult-variant', 'dream');
            else ultSection.setAttribute('data-stg-ult-variant', 'none');
        }
        applyStgAttackUpgLabel(labSp);
        applyStgAttackUpgLabel(labFo);
        applyStgAttackUpgLabel(labUl);

        const ulSpreadStats = document.getElementById('stgAttackSpreadStats');
        const divSpreadUp = document.getElementById('stgAttackSpreadUpgrades');
        const ulFocusStats = document.getElementById('stgAttackFocusStats');
        const divFoUp = document.getElementById('stgAttackFocusUpgrades');
        const ulUltStats = document.getElementById('stgAttackUltStats');
        const divUltUp = document.getElementById('stgAttackUltUpgrades');

        if (!player) {
            fillStgAttackStatGrid(ulSpreadStats, [], true);
            fillStgAttackUpgradeIcons(divSpreadUp, []);
            fillStgAttackStatGrid(ulFocusStats, [], true);
            fillStgAttackUpgradeIcons(divFoUp, []);
            fillStgAttackStatGrid(ulUltStats, [], true);
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
            { key: 'atk', value: atkSpread.toFixed(1) },
            { key: 'aps', value: apsMain },
            { key: 'spd', value: String(Math.round(bspMain)) },
            { key: 'crit', value: critPct + '%' }
        ];
        fillStgAttackStatGrid(ulSpreadStats, fourMain, false);

        const ivFocus =
            (player.focusFireIntervalMs != null ? player.focusFireIntervalMs : player.fireIntervalMs) *
            bonusFireIntervalMult;
        const apsFocus = ivFocus > 0 ? (1000 / ivFocus).toFixed(2) : '—';
        const bspFocus =
            (player.focusBulletSpeed != null ? player.focusBulletSpeed : player.bulletSpeed) * bonusBulletSpeed;
        const fourFocus = [
            { key: 'atk', value: atkFocusNum.toFixed(1) },
            { key: 'aps', value: apsFocus },
            { key: 'spd', value: String(Math.round(bspFocus)) },
            { key: 'crit', value: critPct + '%' }
        ];
        fillStgAttackStatGrid(ulFocusStats, fourFocus, false);

        const siv = (player.skillFireIntervalMs != null ? player.skillFireIntervalMs : 120) * bonusFireIntervalMult;
        const apsSkill = siv > 0 ? (1000 / siv).toFixed(2) : '—';
        const ssb = (player.skillBulletSpeed != null ? player.skillBulletSpeed : player.bulletSpeed) * bonusBulletSpeed;
        const fourUlt = [
            { key: 'atk', value: atkUltNum.toFixed(1) },
            { key: 'aps', value: apsSkill },
            { key: 'spd', value: String(Math.round(ssb)) },
            { key: 'crit', value: critPct + '%' }
        ];
        fillStgAttackStatGrid(ulUltStats, fourUlt, false);

        /** 左侧「已选构筑」仅展示扩散/集中/大招，不含基础属性（属性只在右侧「属性加成」） */
        fillStgAttackUpgradeIcons(divSpreadUp, getTakenStgUpgrades((u) => u.group === 'spread'));
        fillStgAttackUpgradeIcons(
            divFoUp,
            getTakenStgUpgrades((u) => u.group === 'focus_misc' || u.group === 'focus_crystal')
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
        if (h.priorityHpLabel) h.priorityHpLabel.textContent = stgUiT('hud.hpLabel');
        if (h.priorityExpLabel) h.priorityExpLabel.textContent = stgUiT('hud.expLabel');
        if (player) {
            refreshStgLifeCellsHud();
            refreshStgPrioritySegmentRow('stgPriorityExpCells', expToNext > 0 ? exp / expToNext : 0);
        } else {
            refreshStgLifeCellsHud();
            refreshStgPrioritySegmentRow('stgPriorityExpCells', 0);
        }
        if (h.priorityExpDetail) {
            h.priorityExpDetail.textContent = player
                ? stgUiT('hud.exp', {
                      lv: level,
                      cur: Math.floor(exp),
                      next: expToNext
                  })
                : '—';
        }
        const waves = waveData.waves || [];
        const chTotal = stgWavePackRoot && stgWavePackRoot.chapters ? Math.max(1, stgWavePackRoot.chapters.length) : 1;
        if (h.wave) {
            h.wave.textContent = stgUiT('hud.waveChapter', {
                ch: stgChapterIndex + 1,
                chTotal,
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
        refreshStgUltChargeHud();
        refreshStgAttackBuildPanel();
    }

    /** 切换语言时刷新 HUD、三选一卡、结算层（若打开） */
    function refreshStgUiLanguageFromI18n() {
        updateHud();
        const h = getHudElements();
        if (h.upgradeTitle) h.upgradeTitle.textContent = stgUiT('upgrade.title');
        if (h.upgradeSubHint && h.upgrade && !h.upgrade.classList.contains('hidden')) {
            if (stgUpgradeMomentRoundTotal > 1 && stgUpgradeMomentRoundsLeft > 0) {
                const cur = stgUpgradeMomentRoundTotal - stgUpgradeMomentRoundsLeft + 1;
                h.upgradeSubHint.innerHTML = stgUiT('upgrade.subhintRound', { cur, total: stgUpgradeMomentRoundTotal });
            } else {
                h.upgradeSubHint.innerHTML = stgUiT('upgrade.subhint');
            }
        }
        if (h.upgrade && h.upgradeCards && !h.upgrade.classList.contains('hidden') && upgradeChoices.length) {
            h.upgradeCards.innerHTML = '';
            upgradeChoices.forEach((u, idx) => {
                h.upgradeCards.appendChild(createStgUpgradeChoiceButton(u, idx));
            });
        }
        if (window.StgUiI18n && typeof window.StgUiI18n.applyStgLevelUpHintLabels === 'function') {
            window.StgUiI18n.applyStgLevelUpHintLabels();
        }
        if (lastShowResultWin !== null && h.result && !h.result.classList.contains('hidden')) {
            showResult(lastShowResultWin);
        }
        if (h.chapterTransition && !h.chapterTransition.classList.contains('hidden') && phase === 'chapter_transition') {
            if (h.chapterTransitionTitle) {
                h.chapterTransitionTitle.textContent = stgUiT('chapter.passTitle', { passed: stgChapterIndex + 1 });
            }
            if (h.chapterTransitionMsg) {
                h.chapterTransitionMsg.textContent = stgUiT('chapter.passMsg', { next: stgChapterIndex + 2 });
            }
        }
    }

    /**
     * 绘制敌弹：圆形或三角形（三角尖端朝向速度方向，与碰撞半径一致）；圆形可套 art_assets/bullets 贴图
     */
    function drawStgEnemyBulletFill(b, spGrazeA, typesMapOpt) {
        if (!ctx) return;
        const r = b.radius != null ? b.radius : 5;
        const gz = spGrazeA != null && Number.isFinite(spGrazeA) ? Math.max(0.05, Math.min(0.98, spGrazeA)) : 0.38;
        const nowMs = performance.now();
        const highlighted = b && b._stgGrazeHighlightUntil != null && nowMs < b._stgGrazeHighlightUntil;
        let spriteKey = null;
        /** 种类表 stgEnemyBulletSprite 显式写空串时：不套默认 jpg，仅矢量 */
        let skipDefaultSprite = false;
        const isBossEnemyBullet = b.typeId != null && String(b.typeId).indexOf('__boss_') === 0;
        if (!stgEnemyBulletTextureGloballyDisabled) {
            spriteKey = b.sprite;
            if (!spriteKey && b.typeId && !isBossEnemyBullet) {
                const tm = typesMapOpt || getEnemyTypeMap();
                const d = tm[b.typeId] || tm.normal;
                if (d && d.stgEnemyBulletSprite != null) {
                    const raw = String(d.stgEnemyBulletSprite);
                    if (raw.trim() === '') {
                        skipDefaultSprite = true;
                    } else {
                        const sk = sanitizeStgEnemyBulletSpriteName(raw);
                        if (sk) spriteKey = sk;
                    }
                }
            }
            if (isBossEnemyBullet && !spriteKey) {
                skipDefaultSprite = true;
            }
            /** 最后兜底：内置默认文件名（未显式关闭贴图时）；BOSS 未选贴图时不套小怪默认图 */
            if (!spriteKey && !skipDefaultSprite) {
                spriteKey = 'enemy_round_red.jpg';
            }
        }
        if (spriteKey) {
            const img = getStgEnemyBulletSpriteImage(spriteKey);
            if (img && img.complete) {
                ctx.save();
                ctx.globalAlpha = highlighted ? gz : 1;
                ctx.imageSmoothingEnabled = true;
                const w = Math.max(2, r * 2);
                try {
                    if (Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(r)) {
                        ctx.drawImage(img, b.x - r, b.y - r, w, w);
                        ctx.restore();
                        return;
                    }
                } catch (drawErr) {
                    console.warn('[STG] 敌弹 drawImage 失败', spriteKey, drawErr);
                }
                ctx.restore();
            }
        }
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

    /** 道具E：太极阴阳符号（矢量，不依赖 emoji 字体） */
    function drawStgYinYangSymbol(ctx2, cx, cy, R) {
        if (!ctx2 || !(R > 0)) return;
        ctx2.save();
        ctx2.beginPath();
        ctx2.arc(cx, cy, R, 0, Math.PI * 2);
        ctx2.clip();
        ctx2.fillStyle = '#f4f4f4';
        ctx2.beginPath();
        ctx2.arc(cx, cy, R, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.beginPath();
        ctx2.arc(cx, cy, R, Math.PI * 0.5, Math.PI * 1.5);
        ctx2.lineTo(cx, cy);
        ctx2.closePath();
        ctx2.fillStyle = '#121212';
        ctx2.fill();
        ctx2.beginPath();
        ctx2.arc(cx, cy - R * 0.5, R * 0.5, 0, Math.PI * 2);
        ctx2.fillStyle = '#121212';
        ctx2.fill();
        ctx2.beginPath();
        ctx2.arc(cx, cy + R * 0.5, R * 0.5, 0, Math.PI * 2);
        ctx2.fillStyle = '#f4f4f4';
        ctx2.fill();
        ctx2.beginPath();
        ctx2.arc(cx, cy - R * 0.5, R * 0.11, 0, Math.PI * 2);
        ctx2.fillStyle = '#f4f4f4';
        ctx2.fill();
        ctx2.beginPath();
        ctx2.arc(cx, cy + R * 0.5, R * 0.11, 0, Math.PI * 2);
        ctx2.fillStyle = '#121212';
        ctx2.fill();
        ctx2.restore();
        ctx2.save();
        ctx2.shadowColor = 'rgba(241, 196, 15, 0.55)';
        ctx2.shadowBlur = 10;
        ctx2.beginPath();
        ctx2.arc(cx, cy, R, 0, Math.PI * 2);
        ctx2.strokeStyle = 'rgba(212, 175, 55, 0.92)';
        ctx2.lineWidth = 2;
        ctx2.stroke();
        ctx2.restore();
    }

    /**
     * 敌人血环：半径略大于本体；底轨整圈 + 从 12 点起逆时针的剩余血量弧（受伤时弧长逆时针缩短）。
     * @param {CanvasRenderingContext2D} ctx2
     * @param {StgEnemy} e
     */
    function drawStgEnemyHpRing(ctx2, e) {
        if (!ctx2 || !e) return;
        const maxH = e.maxHp > 0 ? e.maxHp : 1;
        const ratio = Math.max(0, Math.min(1, e.hp / maxH));
        const cx = e.x;
        const cy = e.y;
        const ringR = e.radius + 2;
        const lw = Math.max(2, Math.min(4, e.radius * 0.15));
        ctx2.save();
        ctx2.lineWidth = lw;
        ctx2.beginPath();
        ctx2.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx2.strokeStyle = 'rgba(0,0,0,0.32)';
        ctx2.stroke();
        if (ratio > 0.004) {
            ctx2.beginPath();
            const start = -Math.PI / 2;
            const end = start - ratio * Math.PI * 2;
            ctx2.arc(cx, cy, ringR, start, end, true);
            ctx2.strokeStyle = 'rgba(46, 204, 113, 0.95)';
            ctx2.lineCap = 'round';
            ctx2.stroke();
        }
        ctx2.restore();
    }

    /**
     * 道具C：伴身小炮台（与发射点同位），炮管指向最近敌；仅扩散模式显示
     * @param {Array<{x:number,y:number,alive:boolean,radius?:number}>} enemyArr
     */
    function drawStgSideTurret(ctx2, px, py, pr, enemyArr) {
        if (!ctx2) return;
        const tx = px + pr * 2.15 + 8;
        const ty = py;
        let aim = -Math.PI / 2;
        if (enemyArr && enemyArr.length) {
            let bd = 1e9;
            let best = null;
            for (let i = 0; i < enemyArr.length; i++) {
                const en = enemyArr[i];
                if (!en || !en.alive) continue;
                const d = Math.hypot(en.x - tx, en.y - ty);
                if (d < bd) {
                    bd = d;
                    best = en;
                }
            }
            if (best) aim = Math.atan2(best.y - ty, best.x - tx);
        }
        ctx2.save();
        ctx2.translate(tx, ty);
        ctx2.rotate(aim + Math.PI / 2);
        ctx2.fillStyle = '#4a3f2e';
        ctx2.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx2.lineWidth = 1;
        ctx2.beginPath();
        ctx2.moveTo(-9, 5);
        ctx2.lineTo(9, 5);
        ctx2.lineTo(7, 10);
        ctx2.lineTo(-7, 10);
        ctx2.closePath();
        ctx2.fill();
        ctx2.stroke();
        ctx2.fillStyle = '#7f8c8d';
        ctx2.beginPath();
        ctx2.arc(0, -1, 7.5, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.stroke();
        ctx2.fillStyle = '#bdc3c7';
        ctx2.fillRect(-2.5, -19, 5, 15);
        ctx2.fillStyle = '#e67e22';
        ctx2.fillRect(-2, -22, 4, 4);
        ctx2.restore();
    }

    /**
     * 左下角方形 buff 底图（圆角矩形；尺寸 S 较小时圆角随之缩小）
     */
    function drawStgCornerBuffSquare(ctx2, x, y, S, fillStyle, strokeStyle, lineW) {
        ctx2.save();
        ctx2.beginPath();
        const rr = Math.max(4, Math.min(8, Math.floor(S * 0.2)));
        if (typeof ctx2.roundRect === 'function') {
            ctx2.roundRect(x, y, S, S, rr);
        } else {
            ctx2.moveTo(x + rr, y);
            ctx2.lineTo(x + S - rr, y);
            ctx2.quadraticCurveTo(x + S, y, x + S, y + rr);
            ctx2.lineTo(x + S, y + S - rr);
            ctx2.quadraticCurveTo(x + S, y + S, x + S - rr, y + S);
            ctx2.lineTo(x + rr, y + S);
            ctx2.quadraticCurveTo(x, y + S, x, y + S - rr);
            ctx2.lineTo(x, y + rr);
            ctx2.quadraticCurveTo(x, y, x + rr, y);
            ctx2.closePath();
        }
        ctx2.fillStyle = fillStyle;
        ctx2.fill();
        ctx2.strokeStyle = strokeStyle;
        ctx2.lineWidth = lineW;
        ctx2.stroke();
        ctx2.restore();
    }

    /** 水晶：方形内 💎 + 「还需命中次数」 */
    function drawStgCornerCrystalBuff(ctx2, bx, by, S) {
        const remHits = Math.max(0, STG_CRYSTAL_FOCUS_HITS_NEEDED - stgCrystalFocusHitAcc);
        drawStgCornerBuffSquare(
            ctx2,
            bx,
            by,
            S,
            'rgba(52, 152, 219, 0.45)',
            'rgba(174, 214, 241, 0.95)',
            1.5
        );
        const cx = bx + S * 0.5;
        ctx2.save();
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        ctx2.font = `${Math.max(11, Math.floor(S * 0.34))}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
        ctx2.fillStyle = 'rgba(255,255,255,0.96)';
        ctx2.fillText('💎', cx, by + S * 0.3);
        ctx2.font = `bold ${Math.max(13, Math.floor(S * 0.38))}px "Microsoft YaHei","Segoe UI",sans-serif`;
        ctx2.fillStyle = 'rgba(236, 240, 241, 0.98)';
        ctx2.fillText(String(remHits), cx, by + S * 0.72);
        ctx2.restore();
    }

    /**
     * 狂怒：仅「击杀进度」——还需再杀几只叠层（独立方块，与层数/计时方块不叠）。
     */
    function drawStgCornerRageKillProgressBuff(ctx2, bx, by, S) {
        const remKills = Math.max(0, STG_RAGE_KILLS_PER_STACK - stgRageKillAcc);
        drawStgCornerBuffSquare(
            ctx2,
            bx,
            by,
            S,
            'rgba(190, 90, 70, 0.4)',
            'rgba(230, 170, 150, 0.92)',
            1.5
        );
        const cx = bx + S * 0.5;
        const cy = by + S * 0.5;
        ctx2.save();
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        ctx2.font = `${Math.max(11, Math.floor(S * 0.34))}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
        ctx2.fillStyle = 'rgba(255,255,255,0.96)';
        ctx2.fillText('😤', cx, by + S * 0.3);
        ctx2.font = `bold ${Math.max(13, Math.floor(S * 0.38))}px "Microsoft YaHei","Segoe UI",sans-serif`;
        ctx2.fillStyle = 'rgba(255, 245, 238, 0.98)';
        ctx2.fillText(String(remKills), cx, cy + S * 0.08);
        ctx2.font = `8px "Microsoft YaHei","Segoe UI",sans-serif`;
        ctx2.fillStyle = 'rgba(255, 220, 205, 0.82)';
        ctx2.fillText('还需击杀', cx, by + S - 6);
        ctx2.restore();
    }

    /**
     * 狂怒：仅「当前层数 + 本段剩余时间（逆时针弧）」；0 层不绘制（独立方块）。
     */
    function drawStgCornerRageStackTimerBuff(ctx2, bx, by, S) {
        const stacks = stgRageStacks;
        if (stacks <= 0) return;
        const now = performance.now();
        const dur = getStgRageDurationMs();
        const active = now < stgRageEndMs;
        let remRatio = 0;
        if (active && dur > 0) {
            remRatio = Math.max(0, Math.min(1, (stgRageEndMs - now) / dur));
        }
        drawStgCornerBuffSquare(
            ctx2,
            bx,
            by,
            S,
            'rgba(160, 48, 42, 0.48)',
            'rgba(241, 148, 138, 0.95)',
            1.5
        );
        const cx = bx + S * 0.5;
        const cy = by + S * 0.5;
        const ringR = S * 0.32;
        ctx2.save();
        ctx2.beginPath();
        ctx2.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx2.strokeStyle = 'rgba(45, 22, 22, 0.5)';
        ctx2.lineWidth = 1.6;
        ctx2.stroke();
        if (remRatio > 0.008) {
            ctx2.beginPath();
            ctx2.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 - remRatio * Math.PI * 2, true);
            ctx2.strokeStyle = 'rgba(255, 160, 140, 0.98)';
            ctx2.lineWidth = 2;
            ctx2.lineCap = 'round';
            ctx2.stroke();
        }
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        ctx2.font = `${Math.max(11, Math.floor(S * 0.34))}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
        ctx2.fillStyle = 'rgba(255,255,255,0.94)';
        ctx2.fillText('😤', cx, by + S * 0.22);
        const fs = stacks >= 6 ? Math.floor(S * 0.3) : Math.floor(S * 0.36);
        ctx2.font = `bold ${fs}px "Microsoft YaHei","Segoe UI",sans-serif`;
        ctx2.fillStyle = 'rgba(255, 245, 238, 0.98)';
        ctx2.fillText(String(stacks), cx, cy + S * 0.06);
        ctx2.restore();
    }

    /** 棋盘左下角：水晶命中、狂怒击杀进度、狂怒层数/计时（分开展示，不重叠） */
    function drawStgCornerFocusBuffHud(ctx2, cw, ch) {
        if (!ctx2 || phase !== 'playing') return;
        const pad = 8;
        const S = 36;
        const gap = 6;
        const y0 = ch - pad - S;
        let col = 0;
        const bx0 = pad;
        function nextX() {
            const x = bx0 + col * (S + gap);
            col++;
            return x;
        }
        if (stgFocusBranch === 'crystal' && stgTakenUpgradeIds.has('focus_crystal_base')) {
            drawStgCornerCrystalBuff(ctx2, nextX(), y0, S);
        }
        if (stgFocusBranch === 'rage' && stgTakenUpgradeIds.has('focus_rage_core')) {
            drawStgCornerRageKillProgressBuff(ctx2, nextX(), y0, S);
            if (stgRageStacks > 0) {
                drawStgCornerRageStackTimerBuff(ctx2, nextX(), y0, S);
            }
        }
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
            /** 血环：叠在原色圆盘+三角之上、emoji 之下 */
            drawStgEnemyHpRing(ctx, e);
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

        /** 道具E：阴阳玉（太极符号 + 淡圈示意伤害范围） */
        stgYinYangOrbs.forEach((o) => {
            if (!o || !o.alive) return;
            const vr = o.visR != null ? o.visR : 17;
            const maxL = o.maxLifeMs != null ? o.maxLifeMs : STG_YINYANG_ORB_DURATION_MS;
            const life = o.lifeMs != null ? o.lifeMs : maxL;
            const tw = performance.now() * 0.0025 + (o.phaseRad || 0);
            const lifePulse = maxL > 0 ? Math.max(0.35, Math.min(1, life / maxL)) : 1;
            const pulse = (0.78 + 0.22 * Math.sin(tw)) * lifePulse;
            ctx.save();
            ctx.beginPath();
            ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(120, 200, 255, ${0.07 + 0.1 * pulse})`;
            ctx.lineWidth = 1.2;
            ctx.setLineDash([5, 7]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
            drawStgYinYangSymbol(ctx, o.x, o.y, vr);
        });

        /** 大招 · 封魔阵：跟随自机的结界圆 */
        if (player && stgSealField && performance.now() < stgSealField.endMs) {
            const R = stgSealField.radius;
            ctx.save();
            ctx.setLineDash([12, 8]);
            /** 与侧栏「试做型封魔阵」绿色系一致，避免与伏魔针淡粉 / 妙珠紫混淆 */
            ctx.strokeStyle = 'rgba(30, 132, 73, 0.78)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(player.x, player.y, R, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(39, 174, 96, 0.14)';
            ctx.beginPath();
            ctx.arc(player.x, player.y, R, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        /** 大招 · 梦想妙珠 */
        stgDreamOrbs.forEach((o) => {
            if (!o || !o.alive) return;
            const grd = ctx.createRadialGradient(o.x, o.y, 2, o.x, o.y, o.r);
            grd.addColorStop(0, 'rgba(235, 210, 255, 0.98)');
            grd.addColorStop(0.5, 'rgba(160, 100, 220, 0.55)');
            grd.addColorStop(1, 'rgba(90, 50, 150, 0.22)');
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 2;
            ctx.stroke();
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
        const spGrazeA = (() => {
            const sc = getScenePropsConfig();
            const a = sc && sc.grazedBulletAlpha != null ? Number(sc.grazedBulletAlpha) : 0.38;
            return Number.isFinite(a) ? Math.max(0.05, Math.min(0.98, a)) : 0.38;
        })();
        const stgTypesForEnemyBullets = getEnemyTypeMap();
        enemyBullets.forEach((b) => {
            if (!b.alive) return;
            /** 已擦弹敌弹透明度由场景道具编辑器配置；位图敌弹用 globalAlpha */
            const highlighted = b._stgGrazeHighlightUntil != null && performance.now() < b._stgGrazeHighlightUntil;
            ctx.fillStyle = highlighted ? `rgba(231, 76, 60, ${spGrazeA})` : '#e74c3c';
            drawStgEnemyBulletFill(b, spGrazeA, stgTypesForEnemyBullets);
        });

        /** 擦弹：吸附向判定点的小白球 */
        stgGrazeOrbs.forEach((o) => {
            if (!o || !o.alive) return;
            const rr = o.r != null ? o.r : 5;
            const ga = o.glow != null ? o.glow : 0.65;
            ctx.save();
            ctx.shadowColor = `rgba(255,255,255,${ga})`;
            ctx.shadowBlur = 10 + rr * 0.8;
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.beginPath();
            ctx.arc(o.x, o.y, rr, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(200,220,255,0.85)';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.restore();
        });

        /** 擦弹成功：渐隐显示外椭圆擦弹带（紧随擦弹球，在掉落物与机体之下叠在敌弹之上） */
        drawStgGrazeRangeFlashes(ctx);

        /** P点 / 大掉落 / 充能点（形状与尺寸来自场景道具编辑器） */
        function drawStgPickupShapeBody(ctx2, cx, cy, r, shape) {
            const sh = shape === 'square' || shape === 'diamond' ? shape : 'circle';
            ctx2.beginPath();
            if (sh === 'circle') {
                ctx2.arc(cx, cy, r, 0, Math.PI * 2);
            } else if (sh === 'square') {
                ctx2.rect(cx - r, cy - r, r * 2, r * 2);
            } else {
                /** 菱形：外接圆半径 r */
                ctx2.moveTo(cx, cy - r);
                ctx2.lineTo(cx + r, cy);
                ctx2.lineTo(cx, cy + r);
                ctx2.lineTo(cx - r, cy);
                ctx2.closePath();
            }
        }

        pickups.forEach((p) => {
            const kind = p.pickupKind || '';
            const r = p.pickupRadius != null && Number.isFinite(p.pickupRadius) ? p.pickupRadius : 10;
            const shape = p.shape === 'square' || p.shape === 'diamond' ? p.shape : 'circle';
            const fs = Math.max(9, Math.floor((p.sizePx != null ? p.sizePx : r * 2) * 0.52));

            if (kind === 'charge') {
                ctx.fillStyle = 'rgba(26, 188, 156, 0.35)';
                ctx.strokeStyle = 'rgba(22, 160, 133, 0.95)';
                ctx.lineWidth = Math.max(1.5, r * 0.18);
                drawStgPickupShapeBody(ctx, p.x, p.y, r, shape);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#1abc9c';
                ctx.font = `${fs}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('充', p.x, p.y);
                return;
            }
            const big = kind === 'bigP' || kind === 'bigEnergy';
            ctx.fillStyle = kind === 'bigEnergy' ? '#f1c40f' : '#2ecc71';
            drawStgPickupShapeBody(ctx, p.x, p.y, r, shape);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = `${fs}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(kind === 'bigEnergy' ? '⚡' : 'P', p.x, p.y);
        });

        /** 玩家机体：外圈 + 三角；慢速时整体半透明，判定点最后单独绘制以突出 */
        if (player) {
            const px = player.x;
            const py = player.y;
            const r = player.radius;
            if (
                phase === 'playing' &&
                stgTakenUpgradeIds.has('spread_turret') &&
                !(keys.ShiftLeft || keys.ShiftRight)
            ) {
                drawStgSideTurret(ctx, px, py, r, enemies);
            }
            /** 狂怒层数与段计时改由棋盘左下角方形 HUD 绘制，避免与自机重叠 */
            const focus = keys.ShiftLeft || keys.ShiftRight;
            const focusShipFade = phase === 'playing' && focus;
            const invulnDraw = phase === 'playing' && isStgPlayerInvulnerable(performance.now());
            let shipAlpha = focusShipFade ? getStgGrazeRuntimeParams().focusShipAlpha : 1;
            /** 无敌时闪烁提示（与慢速半透明可叠乘） */
            if (invulnDraw) {
                shipAlpha *= 0.42 + 0.38 * (0.5 + 0.5 * Math.sin(performance.now() * 0.018));
            }
            if (focusShipFade || invulnDraw) {
                ctx.save();
                /** 机体略透明（玩家编辑器可调），判定点留在 save 外以全不透明绘制 */
                ctx.globalAlpha = shipAlpha;
            }
            ctx.shadowColor = 'rgba(52, 152, 219, 0.65)';
            ctx.shadowBlur = focusShipFade ? 6 : 12;
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
            if (focusShipFade || invulnDraw) {
                ctx.restore();
            }

            /** 慢速模式：受击圆 + 判定点（不绘制擦弹外椭圆范围，避免画面干扰；擦弹判定仍按椭圆逻辑） */
            if (phase === 'playing' && focus) {
                const hitR = getStgPlayerHitRadius();
                const gcfg = getStgGrazeRuntimeParams();
                if (gcfg.enabled && gcfg.extra > 0) {
                    const { rx, ry } = getStgGrazeOuterEllipseRadii(hitR, gcfg);
                    ctx.save();
                    ctx.beginPath();
                    ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(120, 220, 255, 0.68)';
                    ctx.lineWidth = 1.8;
                    ctx.setLineDash([6, 4]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.restore();
                }
                ctx.beginPath();
                ctx.arc(px, py, hitR, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255, 65, 85, 0.96)';
                ctx.lineWidth = 2.2;
                ctx.setLineDash([5, 5]);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(255, 40, 60, 1)';
                ctx.beginPath();
                ctx.arc(px, py, 3, 0, Math.PI * 2);
                ctx.fill();
            }

            /** 每充满一大招格：自机下缘下方小字「大招就绪」，跟随移动，持续由 pushStgUltReadyHintOneSecond 累加 */
            const nowUltHint = performance.now();
            if (
                phase === 'playing' &&
                stgUltReadyHintUntilMs != null &&
                nowUltHint < stgUltReadyHintUntilMs
            ) {
                ctx.save();
                const fs = Math.max(10, Math.floor(r * 0.38));
                ctx.font = `${fs}px "Microsoft YaHei","Segoe UI",sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                const ty = py + r + Math.max(6, r * 0.42);
                const txt = stgUiT('hud.ultReadyBelow') || '大招就绪';
                ctx.shadowColor = 'rgba(0,0,0,0.85)';
                ctx.shadowBlur = 3;
                ctx.lineWidth = Math.max(2, fs * 0.12);
                ctx.strokeStyle = 'rgba(0,0,0,0.55)';
                ctx.strokeText(txt, px, ty);
                ctx.shadowBlur = 0;
                ctx.fillStyle = 'rgba(255, 245, 220, 0.96)';
                ctx.fillText(txt, px, ty);
                ctx.restore();
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

        drawStgCornerFocusBuffHud(ctx, cw, ch);

        /** 升级时刻：先棋盘上方居中播报文案，再开四选一（阶段 upgrade_announce） */
        if (phase === 'upgrade_announce') {
            const txt = stgUiT('upgrade.boardAnnounce') || '升级时刻';
            const tPulse = performance.now() * 0.004;
            const pulse = 0.9 + 0.1 * Math.sin(tPulse);
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const fontPx = Math.max(24, Math.floor(Math.min(cw, ch) * 0.072));
            ctx.font = `bold ${fontPx}px "Microsoft YaHei","Segoe UI",sans-serif`;
            const bx = cw * 0.5;
            const by = ch * 0.16;
            ctx.shadowColor = 'rgba(0,0,0,0.75)';
            ctx.shadowBlur = 14;
            ctx.lineWidth = Math.max(3, fontPx * 0.08);
            ctx.strokeStyle = 'rgba(0,0,0,0.45)';
            ctx.strokeText(txt, bx, by);
            ctx.shadowBlur = 0;
            ctx.fillStyle = `rgba(255, 224, 120, ${pulse})`;
            ctx.fillText(txt, bx, by);
            ctx.restore();
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
        if (phase === 'levelup' && stgUpgradePickOpen && upgradeChoices.length > 0) {
            let idx = -1;
            if (e.code === 'Digit1' || e.code === 'Numpad1') idx = 0;
            else if (e.code === 'Digit2' || e.code === 'Numpad2') idx = 1;
            else if (e.code === 'Digit3' || e.code === 'Numpad3') idx = 2;
            else if (e.code === 'Digit4' || e.code === 'Numpad4') idx = 3;
            if (idx >= 0 && idx < upgradeChoices.length) {
                e.preventDefault();
                finalizeStgUpgradePick(upgradeChoices[idx]);
                return;
            }
        }
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
        /**
         * 棋盘高度：须为下方「波次/时间」白条 + 操作说明留出视口空间，否则画布过高、像被裁切且需猛滚才见底部。
         * 优先用 .stg-canvas-wrap 距视口顶的距离 + 下方 HUD 实测高度；兜底为旧公式加大预留。
         */
        let maxH = Math.min(window.innerHeight - 240, 800);
        const wrap = document.querySelector('.stg-canvas-wrap');
        const meta = document.querySelector('.stg-meta-panel');
        if (wrap) {
            const top = wrap.getBoundingClientRect().top;
            /** 棋盘下方：波次/说明 meta（含 #stgHintBar）；升级四选一全屏居中，不占布局高度 */
            let below = 32;
            if (meta) below += meta.getBoundingClientRect().height;
            const hFit = window.innerHeight - top - below;
            if (hFit > 200) maxH = Math.min(hFit, 800);
        }
        maxH = Math.max(200, maxH);
        cellSize = Math.floor(maxH / GRID_ROWS);
        if (cellSize < 32) cellSize = 32;
        canvas.width = GRID_COLS * cellSize;
        canvas.height = GRID_ROWS * cellSize;
        if (player) {
            const pr = player.radius != null ? player.radius : 14;
            player.x = Math.min(canvas.width - pr, Math.max(pr, player.x));
            player.y = Math.min(canvas.height - pr, Math.max(pr, player.y));
            player._stgSpawnX = canvas.width * 0.5;
            player._stgSpawnY = canvas.height - cellSize * 1.8;
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
            /** 首帧布局后 .stg-canvas-wrap 位置才稳定，再算一次避免棋盘过高裁切感 */
            requestAnimationFrame(() => {
                resizeCanvas();
            });
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
            const levelUpHint = document.getElementById('stgLevelUpHint');
            if (levelUpHint) {
                levelUpHint.addEventListener('click', () => {
                    if (phase === 'playing' && upgradeChoices.length > 0 && !stgUpgradePickOpen) {
                        openStgUpgradeModal();
                    }
                });
            }

            phase = 'title';
            isRunning = true;
            isPaused = false;
            lastFrameTime = performance.now();
            loop();
            /** 预取随包分发的怪物表，减少「开始游戏」首帧与内置默认不一致 */
            ensureBundledEnemyTypesLoaded();
            refreshStgAttackBuildPanel();
            loadStgBuildUpgradeOverridesFromStorage();
            loadEnemyBulletTextureGloballyDisabledFromStorage();
            clearStgEnemyBulletSpriteCacheAndBumpBust();
            preloadStgEnemyBulletSpritesFromTypes();
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

        /** 波次格子内容是否为移动信标（不出兵、局内不绘制） */
        isFormationBeaconToken(s) {
            return isStgFormationBeaconToken(s);
        },

        /** 与 StgUiI18n.applyAll 联动：切换中/英后刷新 HUD、三选一、结算文案 */
        refreshUiLanguage() {
            refreshStgUiLanguageFromI18n();
        },

        /** 刷新左侧攻击构筑面板（语言切换或外部可调用） */
        refreshAttackBuildPanel() {
            refreshStgAttackBuildPanel();
        },

        /**
         * 局内构筑道具面板：列出 STG_UPGRADE_POOL 条目（供勾选）
         * @returns {{ id: string, name: string, icon: string, group: string, requires?: string }[]}
         */
        getBuildUpgradeCatalog() {
            return STG_UPGRADE_POOL.map((u) => {
                let desc = u.desc != null ? u.desc : '';
                if (u.id === 'focus_crystal_base') {
                    desc = buildFocusCrystalBaseDescZh();
                }
                return {
                    id: u.id,
                    name: u.name,
                    desc,
                    icon: u.icon,
                    group: u.group,
                    requires: u.requires || null
                };
            });
        },

        /** 三选一 / 构筑面板：道具 I 动态中文描述 */
        getFocusCrystalBaseDesc() {
            return buildFocusCrystalBaseDescZh();
        },

        /** 三选一：道具 I 动态英文描述 */
        getFocusCrystalBaseDescEn() {
            return buildFocusCrystalBaseDescEn();
        },

        /** 局内构筑面板：读取本地覆盖（水晶外观、狂怒参数等） */
        getBuildUpgradeOverrides() {
            try {
                return JSON.parse(JSON.stringify(stgBuildUpgradeOverrides));
            } catch (e) {
                return {};
            }
        },

        /**
         * 合并写入覆盖并持久化；partial 形如 { focus_crystal_base: { crystalShape, ... }, ... }
         */
        mergeBuildUpgradeOverrides(partial) {
            if (!partial || typeof partial !== 'object') return;
            Object.keys(partial).forEach((k) => {
                const v = partial[k];
                if (v && typeof v === 'object') {
                    stgBuildUpgradeOverrides[k] = Object.assign({}, stgBuildUpgradeOverrides[k] || {}, v);
                }
            });
            try {
                localStorage.setItem(STG_BUILD_OVERRIDES_KEY, JSON.stringify(stgBuildUpgradeOverrides));
            } catch (e) {
                /* ignore */
            }
        },

        loadBuildUpgradeOverridesFromStorage() {
            loadStgBuildUpgradeOverridesFromStorage();
        },

        /** 敌弹贴图编辑器：保存种类表后调用，强制重新加载位图缓存 */
        reloadEnemyBulletSpritesFromStorage() {
            reloadEnemyBulletSpritesFromStorage();
        },

        /** 全局开关：true 时局内敌弹一律不绘位图（仅矢量） */
        setEnemyBulletTextureGloballyDisabled(on) {
            stgEnemyBulletTextureGloballyDisabled = !!on;
            try {
                localStorage.setItem(STG_ENEMY_BULLET_TEXTURE_DISABLED_KEY, stgEnemyBulletTextureGloballyDisabled ? '1' : '0');
            } catch (e) {
                /* ignore */
            }
        },

        getEnemyBulletTextureGloballyDisabled() {
            return stgEnemyBulletTextureGloballyDisabled;
        },

        /** 语言切换时刷新升级弹层副标题（多轮时保留「第几轮」） */
        refreshUpgradeModalSubhintForI18n() {
            const subEl = document.getElementById('stgUpgradeSubHint');
            if (!subEl) return;
            if (stgUpgradeMomentRoundTotal > 1 && stgUpgradeMomentRoundsLeft > 0) {
                const cur = stgUpgradeMomentRoundTotal - stgUpgradeMomentRoundsLeft + 1;
                subEl.innerHTML = stgUiT('upgrade.subhintRound', { cur, total: stgUpgradeMomentRoundTotal });
            } else {
                subEl.innerHTML = stgUiT('upgrade.subhint');
            }
        }
    };

    loadStgBuildUpgradeOverridesFromStorage();

    window.StgMode = StgMode;
    window.refreshStgReimuBonusAside = refreshStgReimuBonusAside;
})();

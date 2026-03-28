/**
 * 敌人系统
 * 负责敌人的生成、移动、路径跟随等逻辑
 */

/** 敌人之间推开重叠时用的半径 = 显示半径 × 该系数（略小，走位更紧凑） */
const ENEMY_COLLISION_RADIUS_SCALE = 0.68;
/** 两圆分离时的额外间隙（像素），略小以减少“弹开”感 */
const ENEMY_COLLISION_PAD = 0.4;

/**
 * 敌人类
 */
class Enemy {
    constructor(config) {
        // 敌人配置
        this.id = config.id || `enemy_${Date.now()}_${Math.random()}`;
        this.name = config.name || '敌人';
        this.type = config.type || 'normal';
        
        // 敌人属性
        this.maxHealth = config.health || 100;
        this.currentHealth = this.maxHealth;
        this.speed = config.speed || 100; // 移动速度（像素/秒）
        this.reward = config.reward || 10; // 击杀奖励金币
        this.attack = config.attack != null ? config.attack : 1; // 攻击力：贴脸攻塔 / 贴脸攻基地
        this.attackInterval = config.attackInterval != null ? config.attackInterval : 1; // 攻击间隔（秒）
        /** 检测范围（像素）：此范围内若发现塔，会与「到基地的直线距离」比较，更近者优先 */
        this.detectionRange = config.detectionRange != null ? config.detectionRange : 120;
        
        // 出生位置（地图边缘随机点，由 EnemyManager 传入）
        this.x = config.spawnX != null ? config.spawnX : 0;
        this.y = config.spawnY != null ? config.spawnY : 0;
        
        // 状态
        this.isAlive = true;
        this.isBlocked = false; // 是否已贴脸攻击某座塔（本帧不移动，由塔防逻辑扣塔血）
        this.blockedByTower = null; // 正在攻击的塔引用
        /** 是否贴脸攻击基地（与塔互斥；伤害在主游戏循环按 attackInterval 结算） */
        this.isAttackingBase = false;
        /** 上次近战造成伤害时刻（ms），攻塔与攻基地共用 */
        this.lastBlockedAttackTime = 0;
        
        /** 碰撞半径（像素）：与其它敌人推开重叠、与塔计算贴脸停步距离 */
        this.radius = config.radius || 15;
        this.color = config.color || '#e74c3c';
        this.icon = config.icon || '👹';

        /** 网格寻路：避开石块，八方向（含对角）BFS 最短步数路径 */
        this._navPath = null;
        this._navGoalKey = '';
        this._lastNavCell = null;

        /** 冰霜等减速：移动速度乘子，到期恢复为 1（由 applyFrostSlow 写入） */
        this._slowMul = 1;
        this._slowUntil = 0;
    }

    /**
     * 冰霜塔分支等：短时降低移动速度（刷新持续时间）
     * @param {number} factor - 乘子，如 0.82 表示减速 18%
     * @param {number} durationMs
     */
    applyFrostSlow(factor, durationMs) {
        const f = Math.max(0.2, Math.min(1, Number(factor) || 1));
        const d = Math.max(0, Number(durationMs) || 0);
        const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        this._slowMul = f;
        this._slowUntil = now + d;
    }
    
    /**
     * 移动：检测范围内有塔时，若基地比最近一座塔更近则仍朝基地；否则朝最近塔贴脸；否则朝基地
     * @param {number} deltaTime - 帧间隔（毫秒）
     * @param {Object} game - TowerDefenseGame（需 map、towers）
     * @returns {boolean} - 兼容旧接口，恒为 false（基地伤害改为贴脸持续攻击）
     */
    update(deltaTime, game) {
        if (!this.isAlive) {
            return false;
        }
        if (this.isBlocked || this.isAttackingBase) {
            return false;
        }
        if (!game || !game.map) {
            return false;
        }
        if (!deltaTime || deltaTime <= 0 || deltaTime > 100) {
            deltaTime = 16;
        }

        const nowTick = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        if (nowTick >= this._slowUntil) {
            this._slowMul = 1;
        }
        
        const map = game.map;
        const baseCenter = map.getBaseCenterScreen();
        const towers = game.towers || [];
        const rSq = this.detectionRange * this.detectionRange;
        
        const bx = baseCenter.x - this.x;
        const by = baseCenter.y - this.y;
        const dSqBase = bx * bx + by * by;

        // 检测范围内所有塔，按距离从近到远
        const candidates = [];
        for (let i = 0; i < towers.length; i++) {
            const t = towers[i];
            if (!t) continue;
            const dx = t.x - this.x;
            const dy = t.y - this.y;
            const dSq = dx * dx + dy * dy;
            if (dSq <= rSq) {
                candidates.push({ tower: t, dSq });
            }
        }
        candidates.sort((a, b) => a.dSq - b.dSq);
        // 基地比「检测范围内最近的塔」更近时，不转而攻塔，继续朝基地推进
        let targetTower = null;
        if (candidates.length > 0) {
            const nearestSq = candidates[0].dSq;
            if (dSqBase >= nearestSq) {
                targetTower = candidates[0].tower;
            }
        }
        
        const targetX = targetTower ? targetTower.x : baseCenter.x;
        const targetY = targetTower ? targetTower.y : baseCenter.y;
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const move = (this.speed * (this._slowMul != null ? this._slowMul : 1) * deltaTime) / 1000;
        const stepMax = Math.max(4, Math.min(map.cellWidth * 0.15, 14));
        const reachThreshold = Math.min(map.cellWidth, map.cellHeight) * 0.32;
        
        if (targetTower) {
            const tr = targetTower.radius != null ? targetTower.radius : 15;
            const stopDist = tr + this.radius + 2;
            if (dist <= stopDist) {
                this.isBlocked = true;
                this.blockedByTower = targetTower;
                this.lastBlockedAttackTime = performance.now();
                this._navPath = null;
                return false;
            }
        } else {
            const br = typeof map.getBaseMeleeRadius === 'function' ? map.getBaseMeleeRadius() : Math.min(map.cellWidth, map.cellHeight);
            const stopDistBase = br + this.radius + 2;
            if (dist <= stopDistBase || map.isPointInBaseArea(this.x, this.y)) {
                this.isAttackingBase = true;
                this.lastBlockedAttackTime = performance.now();
                this._navPath = null;
                return false;
            }
        }
        
        const gridPos = map.screenToGrid(this.x, this.y);
        if (!gridPos) {
            return false;
        }
        if (this._lastNavCell === null || this._lastNavCell.col !== gridPos.col || this._lastNavCell.row !== gridPos.row) {
            this._navPath = null;
            this._lastNavCell = { col: gridPos.col, row: gridPos.row };
        }
        const goalKey = targetTower
            ? `t:${targetTower.id}:${targetTower.col},${targetTower.row}`
            : `b:${map.baseAnchorCol},${map.baseAnchorRow}`;
        if (this._navGoalKey !== goalKey) {
            this._navPath = null;
            this._navGoalKey = goalKey;
        }
        if (this._navPath === null) {
            if (targetTower) {
                this._navPath = map.findPathBFS(gridPos.col, gridPos.row, targetTower.col, targetTower.row);
            } else {
                this._navPath = map.findPathToBase(gridPos.col, gridPos.row);
            }
        }
        
        if (this._navPath && this._navPath.length >= 2) {
            const next = this._navPath[1];
            const wp = map.gridToScreen(next.col, next.row);
            const wdx = wp.x - this.x;
            const wdy = wp.y - this.y;
            const wdist = Math.sqrt(wdx * wdx + wdy * wdy) || 1;
            if (wdist <= reachThreshold) {
                this._navPath.shift();
            } else {
                let remaining = Math.min(move, wdist);
                while (remaining > 1e-4) {
                    const seg = Math.min(stepMax, remaining);
                    this.x += (wdx / wdist) * seg;
                    this.y += (wdy / wdist) * seg;
                    remaining -= seg;
                }
            }
            return false;
        }
        
        // 无路或末段：直线逼近（遇石分段，与旧版兼容）
        let remaining = Math.min(move, dist);
        while (remaining > 1e-4) {
            const seg = Math.min(stepMax, remaining);
            const nx = this.x + (dx / dist) * seg;
            const ny = this.y + (dy / dist) * seg;
            const g = map.screenToGrid(nx, ny);
            if (g && map.isCellBlockedForEnemy(g.col, g.row)) {
                break;
            }
            this.x = nx;
            this.y = ny;
            remaining -= seg;
        }
        return false;
    }
    
    /**
     * 受到伤害
     * @param {number} damage - 伤害值
     * @returns {boolean} - 是否死亡
     */
    takeDamage(damage) {
        this.currentHealth -= damage;
        
        if (this.currentHealth <= 0) {
            this.isAlive = false;
            return true;
        }
        
        return false;
    }
    
    /**
     * 获取生命值百分比
     * @returns {number} - 0-1之间的值
     */
    getHealthPercentage() {
        return this.currentHealth / this.maxHealth;
    }
}

/**
 * 敌人波次配置
 */
class WaveConfig {
    constructor() {
        this.waves = [
            { waveNumber: 1, spawnInterval: 400, spiritReward: 10, nextWaveDelaySec: 15, enemies: [{ type: 'normal', count: 5 }] },
            { waveNumber: 2, spawnInterval: 400, spiritReward: 10, nextWaveDelaySec: 15, enemies: [{ type: 'normal', count: 8 }] },
            {
                waveNumber: 3,
                spawnInterval: 400,
                spiritReward: 12,
                nextWaveDelaySec: 15,
                enemies: [
                    { type: 'normal', count: 6 },
                    { type: 'fast', count: 4 }
                ]
            }
        ];
    }
    
    /**
     * 获取指定波次的配置
     * @param {number} waveNumber - 波次编号
     * @returns {Object|null} - 波次配置
     */
    getWave(waveNumber) {
        const wave = this.waves.find(w => w.waveNumber === waveNumber);
        if (wave) {
            return wave;
        }
        
        // 如果没有找到，生成默认波次（基于波次编号）
        return this.generateDefaultWave(waveNumber);
    }
    
    /**
     * 生成默认波次配置
     * @param {number} waveNumber - 波次编号
     * @returns {Object} - 波次配置
     */
    generateDefaultWave(waveNumber) {
        const baseCount = 5 + Math.floor(waveNumber / 2) * 2;
        return {
            waveNumber: waveNumber,
            spawnInterval: 400,
            spiritReward: 10,
            nextWaveDelaySec: 15,
            enemies: [
                {
                    type: 'normal',
                    count: baseCount
                }
            ]
        };
    }

    /**
     * 用外部数据覆盖波次配置（供波次组件编辑后写入）
     * @param {Array} waves - 波次数组，每项 { waveNumber, spawnInterval?, enemies: [{ type, health, speed, reward, count }, ...] }
     */
    setWaves(waves) {
        if (Array.isArray(waves) && waves.length > 0) {
            this.waves = waves.map((w) => {
                let stgFormation;
                if (w.stgFormation && typeof w.stgFormation === 'object') {
                    try {
                        stgFormation = JSON.parse(JSON.stringify(w.stgFormation));
                    } catch (e) {
                        stgFormation = undefined;
                    }
                }
                return {
                    waveNumber: w.waveNumber,
                    spawnInterval: w.spawnInterval ?? 400,
                    spiritReward: w.spiritReward != null ? w.spiritReward : 10,
                    nextWaveDelaySec: w.nextWaveDelaySec != null ? Number(w.nextWaveDelaySec) : 15,
                    enemies: Array.isArray(w.enemies)
                        ? w.enemies.map((e) => {
                              let spawnIndex = null;
                              if (e.spawnIndex !== undefined && e.spawnIndex !== null && e.spawnIndex !== '') {
                                  const n = Number(e.spawnIndex);
                                  if (!Number.isNaN(n)) spawnIndex = n;
                              }
                              return {
                                  type: e.type || 'normal',
                                  count: e.count ?? 1,
                                  spawnIndex
                              };
                          })
                        : [],
                    stgFormation
                };
            });
        }
    }

    /**
     * 返回当前波次配置的副本（供波次组件读取/编辑）
     */
    getWaves() {
        return this.waves.map((w) => {
            let stgFormation;
            if (w.stgFormation && typeof w.stgFormation === 'object') {
                try {
                    stgFormation = JSON.parse(JSON.stringify(w.stgFormation));
                } catch (e) {
                    stgFormation = undefined;
                }
            }
            return {
                waveNumber: w.waveNumber,
                spawnInterval: w.spawnInterval ?? 400,
                spiritReward: w.spiritReward != null ? w.spiritReward : 10,
                nextWaveDelaySec: w.nextWaveDelaySec != null ? Number(w.nextWaveDelaySec) : 15,
                enemies: (w.enemies || []).map((e) => ({ ...e })),
                stgFormation
            };
        });
    }
}

/**
 * 敌人管理器
 */
class EnemyManager {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {Object} game - TowerDefenseGame 实例（用于寻路、生成点）；可为 null 稍后赋值
     */
    constructor(canvas, game) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        /** @type {Object|null} 塔防主游戏引用：生成敌人、寻路需要 map 与 towers */
        this.game = game || null;
        this.pathPoints = []; // 兼容旧接口：敌人不再沿路径点移动
        
        // 敌人列表
        this.enemies = [];
        
        // 波次管理
        this.waveConfig = new WaveConfig();
        this.currentWave = 0;
        this.isSpawning = false;
        this.spawnQueue = []; // 待生成的敌人队列
        this.lastSpawnTime = 0;
        
        // 敌人类型配置（生命/攻击/移速等仅由「怪物编辑器」维护；波次只决定种类、数量、出怪口）
        this.enemyTypes = {
            'normal': {
                name: '普通敌人',
                icon: '👹',
                color: '#e74c3c',
                radius: 15,
                defaultHealth: 50,
                defaultAttack: 1,
                defaultAttackInterval: 1,
                defaultSpeed: 50,
                defaultReward: 2,
                defaultDetectionRange: 130,
                /** STG：弹幕模式 aim=瞄准玩家 straight=竖直向下 random=每局随机一种 */
                stgBulletPattern: 'random',
                stgShootCooldownMs: 2200,
                stgEnemyBulletSpeed: 260,
                stgEmitStyle: 'single',
                stgFanCount: 5,
                stgFanSpreadDeg: 60,
                stgRingCount: 12,
                stgLaserLength: 300,
                stgLaserWidth: 14,
                stgLaserDurationMs: 450,
                stgSplitDelaySec: 0,
                stgSplitChildSpeed: 220,
                stgHomingStrength: 0,
                stgEmitWhen: 'cooldown',
                stgBulletKind: 'normal',
                stgSplitCount: 4,
                stgSplitStyle: 'cross',
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
            'fast': {
                name: '快速敌人',
                icon: '💨',
                color: '#f39c12',
                radius: 12,
                defaultHealth: 30,
                defaultAttack: 1,
                defaultAttackInterval: 1,
                defaultSpeed: 100,
                defaultReward: 2,
                defaultDetectionRange: 110,
                stgBulletPattern: 'random',
                stgShootCooldownMs: 2000,
                stgEnemyBulletSpeed: 300,
                stgEmitStyle: 'single',
                stgFanCount: 5,
                stgFanSpreadDeg: 60,
                stgRingCount: 12,
                stgLaserLength: 300,
                stgLaserWidth: 14,
                stgLaserDurationMs: 450,
                stgSplitDelaySec: 0,
                stgSplitChildSpeed: 220,
                stgHomingStrength: 0,
                stgEmitWhen: 'cooldown',
                stgBulletKind: 'normal',
                stgSplitCount: 4,
                stgSplitStyle: 'cross',
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
            'tank': {
                name: '坦克敌人',
                icon: '🛡️',
                color: '#34495e',
                radius: 20,
                defaultHealth: 150,
                defaultAttack: 2,
                defaultAttackInterval: 1.5,
                defaultSpeed: 40,
                defaultReward: 5,
                defaultDetectionRange: 150,
                stgBulletPattern: 'random',
                stgShootCooldownMs: 2600,
                stgEnemyBulletSpeed: 220,
                stgEmitStyle: 'single',
                stgFanCount: 5,
                stgFanSpreadDeg: 60,
                stgRingCount: 12,
                stgLaserLength: 300,
                stgLaserWidth: 14,
                stgLaserDurationMs: 450,
                stgSplitDelaySec: 0,
                stgSplitChildSpeed: 220,
                stgHomingStrength: 0,
                stgEmitWhen: 'cooldown',
                stgBulletKind: 'normal',
                stgSplitCount: 4,
                stgSplitStyle: 'cross',
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
        
        console.log('敌人管理器初始化（直线进攻基地 + 检测范围内优先打塔）');
    }
    
    /**
     * 获取敌人类型配置（供怪物编辑器读取）
     * @returns {Object} 类型 id 到配置的映射副本
     */
    getEnemyTypes() {
        const out = {};
        Object.keys(this.enemyTypes).forEach(id => {
            const t = this.enemyTypes[id];
            out[id] = {
                name: t.name,
                icon: t.icon || '👹',
                color: t.color || '#e74c3c',
                radius: t.radius != null ? t.radius : 15,
                defaultHealth: t.defaultHealth != null ? t.defaultHealth : 50,
                defaultAttack: t.defaultAttack != null ? t.defaultAttack : 1,
                defaultAttackInterval: t.defaultAttackInterval != null ? t.defaultAttackInterval : 1,
                defaultSpeed: t.defaultSpeed != null ? t.defaultSpeed : 50,
                defaultReward: t.defaultReward != null ? t.defaultReward : 2,
                defaultDetectionRange: t.defaultDetectionRange != null ? t.defaultDetectionRange : 130,
                stgBulletPattern: t.stgBulletPattern != null ? t.stgBulletPattern : 'random',
                stgShootCooldownMs: t.stgShootCooldownMs != null ? t.stgShootCooldownMs : 2200,
                stgEnemyBulletSpeed: t.stgEnemyBulletSpeed != null ? t.stgEnemyBulletSpeed : 260,
                stgEmitStyle: t.stgEmitStyle != null ? t.stgEmitStyle : 'single',
                stgFanCount: t.stgFanCount != null ? t.stgFanCount : 5,
                stgFanSpreadDeg: t.stgFanSpreadDeg != null ? t.stgFanSpreadDeg : 60,
                stgRingCount: t.stgRingCount != null ? t.stgRingCount : 12,
                stgLaserLength: t.stgLaserLength != null ? t.stgLaserLength : 300,
                stgLaserWidth: t.stgLaserWidth != null ? t.stgLaserWidth : 14,
                stgLaserDurationMs: t.stgLaserDurationMs != null ? t.stgLaserDurationMs : 450,
                stgSplitDelaySec: t.stgSplitDelaySec != null ? t.stgSplitDelaySec : 0,
                stgSplitChildSpeed: t.stgSplitChildSpeed != null ? t.stgSplitChildSpeed : 220,
                stgHomingStrength: t.stgHomingStrength != null ? t.stgHomingStrength : 0,
                /** 须与 setEnemyTypes / 怪物编辑器一致，否则 STG 面板合并存档时会被不完整对象覆盖 */
                stgEmitWhen: t.stgEmitWhen === 'on_death' ? 'on_death' : 'cooldown',
                /** 必须始终为 normal|split，避免与本地存档 merge 时用 undefined 覆盖用户已保存的分裂选项 */
                stgBulletKind:
                    t.stgBulletKind === 'split'
                        ? 'split'
                        : t.stgBulletKind === 'normal'
                          ? 'normal'
                          : t.stgSplitDelaySec > 0
                            ? 'split'
                            : 'normal',
                stgSplitCount: t.stgSplitCount != null ? t.stgSplitCount : 4,
                stgSplitStyle: t.stgSplitStyle === 'cross' ? 'cross' : 'cross',
                stgMoveMode:
                    t.stgMoveMode === 'straight' ||
                    t.stgMoveMode === 'homing' ||
                    t.stgMoveMode === 'anchor' ||
                    t.stgMoveMode === 'arc_edges' ||
                    t.stgMoveMode === 'homing_legacy' ||
                    t.stgMoveMode === 'horizontal_left' ||
                    t.stgMoveMode === 'horizontal_right'
                        ? t.stgMoveMode
                        : 'homing_legacy',
                stgMoveStraightAngleDeg: t.stgMoveStraightAngleDeg != null ? t.stgMoveStraightAngleDeg : 0,
                stgAnchorXNorm: t.stgAnchorXNorm != null ? t.stgAnchorXNorm : 0.5,
                stgAnchorYNorm: t.stgAnchorYNorm != null ? t.stgAnchorYNorm : 0.45,
                stgArcEdge1XNorm: t.stgArcEdge1XNorm != null ? t.stgArcEdge1XNorm : 0.12,
                stgArcEdge1YNorm: t.stgArcEdge1YNorm != null ? t.stgArcEdge1YNorm : 0.42,
                stgArcEdge2XNorm: t.stgArcEdge2XNorm != null ? t.stgArcEdge2XNorm : 0.88,
                stgArcEdge2YNorm: t.stgArcEdge2YNorm != null ? t.stgArcEdge2YNorm : 0.58,
                stgArcBulge1: t.stgArcBulge1 != null ? t.stgArcBulge1 : 80,
                stgArcBulge2: t.stgArcBulge2 != null ? t.stgArcBulge2 : 80,
                stgEnemyBulletRadius: t.stgEnemyBulletRadius != null ? Math.max(2, Math.min(28, t.stgEnemyBulletRadius)) : 5,
                stgEnemyBulletShape: t.stgEnemyBulletShape === 'triangle' ? 'triangle' : 'circle'
            };
        });
        return out;
    }
    
    /**
     * 设置敌人类型配置（怪物编辑器保存时调用）
     * @param {Object} types - 类型 id 到配置的映射
     */
    setEnemyTypes(types) {
        if (!types || typeof types !== 'object') return;
        /** 内置三种不可通过本接口删除；其余种类可增删 */
        const BUILTIN_IDS = ['normal', 'fast', 'tank'];
        const cloneFromNormal = () => {
            const src = this.enemyTypes['normal'];
            if (!src) return null;
            return JSON.parse(JSON.stringify(src));
        };
        Object.keys(types).forEach(id => {
            if (!this.enemyTypes[id]) {
                const blank = cloneFromNormal();
                if (!blank) return;
                this.enemyTypes[id] = blank;
                this.enemyTypes[id].name = types[id].name != null ? types[id].name : id;
            }
            const t = types[id];
            if (t.name != null) this.enemyTypes[id].name = t.name;
            if (t.icon != null) this.enemyTypes[id].icon = t.icon;
            if (t.color != null) this.enemyTypes[id].color = t.color;
            if (t.radius != null) this.enemyTypes[id].radius = Math.max(4, Math.min(48, t.radius));
            if (t.defaultHealth != null) this.enemyTypes[id].defaultHealth = Math.max(1, t.defaultHealth);
            if (t.defaultAttack != null) this.enemyTypes[id].defaultAttack = Math.max(0, t.defaultAttack);
            if (t.defaultAttackInterval != null) this.enemyTypes[id].defaultAttackInterval = Math.max(0.1, t.defaultAttackInterval);
            if (t.defaultSpeed != null) this.enemyTypes[id].defaultSpeed = Math.max(1, t.defaultSpeed);
            if (t.defaultReward != null) this.enemyTypes[id].defaultReward = Math.max(0, t.defaultReward);
            if (t.defaultDetectionRange != null) this.enemyTypes[id].defaultDetectionRange = Math.max(20, t.defaultDetectionRange);
            if (t.stgBulletPattern != null) {
                const p = String(t.stgBulletPattern);
                if (p === 'aim' || p === 'straight' || p === 'random' || p === 'none') this.enemyTypes[id].stgBulletPattern = p;
            }
            if (t.stgShootCooldownMs != null) this.enemyTypes[id].stgShootCooldownMs = Math.max(200, Number(t.stgShootCooldownMs));
            if (t.stgEnemyBulletSpeed != null) this.enemyTypes[id].stgEnemyBulletSpeed = Math.max(40, Number(t.stgEnemyBulletSpeed));
            if (t.stgEmitStyle != null) {
                const es = String(t.stgEmitStyle);
                if (es === 'single' || es === 'fan' || es === 'ring' || es === 'laser') this.enemyTypes[id].stgEmitStyle = es;
            }
            if (t.stgFanCount != null) this.enemyTypes[id].stgFanCount = Math.max(2, Math.min(24, Number(t.stgFanCount)));
            if (t.stgFanSpreadDeg != null) this.enemyTypes[id].stgFanSpreadDeg = Math.max(10, Math.min(180, Number(t.stgFanSpreadDeg)));
            if (t.stgRingCount != null) this.enemyTypes[id].stgRingCount = Math.max(3, Math.min(36, Number(t.stgRingCount)));
            if (t.stgLaserLength != null) this.enemyTypes[id].stgLaserLength = Math.max(80, Math.min(600, Number(t.stgLaserLength)));
            if (t.stgLaserWidth != null) this.enemyTypes[id].stgLaserWidth = Math.max(4, Math.min(48, Number(t.stgLaserWidth)));
            if (t.stgLaserDurationMs != null) this.enemyTypes[id].stgLaserDurationMs = Math.max(100, Math.min(3000, Number(t.stgLaserDurationMs)));
            if (t.stgSplitDelaySec != null) this.enemyTypes[id].stgSplitDelaySec = Math.max(0, Math.min(10, Number(t.stgSplitDelaySec)));
            if (t.stgSplitChildSpeed != null) this.enemyTypes[id].stgSplitChildSpeed = Math.max(40, Math.min(520, Number(t.stgSplitChildSpeed)));
            if (t.stgHomingStrength != null) this.enemyTypes[id].stgHomingStrength = Math.max(0, Math.min(100, Number(t.stgHomingStrength)));
            if (t.stgEmitWhen != null) {
                const ew = String(t.stgEmitWhen);
                if (ew === 'on_death' || ew === 'cooldown') this.enemyTypes[id].stgEmitWhen = ew;
            }
            if (t.stgBulletKind != null) {
                const bk = String(t.stgBulletKind);
                if (bk === 'normal' || bk === 'split') this.enemyTypes[id].stgBulletKind = bk;
            }
            if (t.stgSplitCount != null) {
                this.enemyTypes[id].stgSplitCount = Math.max(2, Math.min(16, Number(t.stgSplitCount)));
            }
            if (t.stgSplitStyle != null) {
                const ss = String(t.stgSplitStyle);
                if (ss === 'cross') this.enemyTypes[id].stgSplitStyle = 'cross';
            }
            if (t.stgMoveMode != null) {
                const mm = String(t.stgMoveMode);
                if (
                    mm === 'straight' ||
                    mm === 'homing' ||
                    mm === 'anchor' ||
                    mm === 'arc_edges' ||
                    mm === 'homing_legacy' ||
                    mm === 'horizontal_left' ||
                    mm === 'horizontal_right'
                ) {
                    this.enemyTypes[id].stgMoveMode = mm;
                }
            }
            if (t.stgMoveStraightAngleDeg != null) {
                this.enemyTypes[id].stgMoveStraightAngleDeg = Math.max(-55, Math.min(55, Number(t.stgMoveStraightAngleDeg)));
            }
            if (t.stgAnchorXNorm != null) this.enemyTypes[id].stgAnchorXNorm = Math.max(0.02, Math.min(0.98, Number(t.stgAnchorXNorm)));
            if (t.stgAnchorYNorm != null) this.enemyTypes[id].stgAnchorYNorm = Math.max(0.02, Math.min(0.98, Number(t.stgAnchorYNorm)));
            if (t.stgArcEdge1XNorm != null) this.enemyTypes[id].stgArcEdge1XNorm = Math.max(0.02, Math.min(0.98, Number(t.stgArcEdge1XNorm)));
            if (t.stgArcEdge1YNorm != null) this.enemyTypes[id].stgArcEdge1YNorm = Math.max(0.05, Math.min(0.98, Number(t.stgArcEdge1YNorm)));
            if (t.stgArcEdge2XNorm != null) this.enemyTypes[id].stgArcEdge2XNorm = Math.max(0.02, Math.min(0.98, Number(t.stgArcEdge2XNorm)));
            if (t.stgArcEdge2YNorm != null) this.enemyTypes[id].stgArcEdge2YNorm = Math.max(0.05, Math.min(0.98, Number(t.stgArcEdge2YNorm)));
            if (t.stgArcBulge1 != null) this.enemyTypes[id].stgArcBulge1 = Math.max(15, Math.min(220, Number(t.stgArcBulge1)));
            if (t.stgArcBulge2 != null) this.enemyTypes[id].stgArcBulge2 = Math.max(15, Math.min(220, Number(t.stgArcBulge2)));
            if (t.stgEnemyBulletRadius != null) {
                this.enemyTypes[id].stgEnemyBulletRadius = Math.max(2, Math.min(28, Number(t.stgEnemyBulletRadius)));
            }
            if (t.stgEnemyBulletShape != null) {
                const bs = String(t.stgEnemyBulletShape);
                if (bs === 'circle' || bs === 'triangle') this.enemyTypes[id].stgEnemyBulletShape = bs;
            }
        });
        Object.keys(this.enemyTypes).forEach(id => {
            if (BUILTIN_IDS.indexOf(id) >= 0) return;
            if (!types[id]) delete this.enemyTypes[id];
        });
    }
    
    /**
     * 更新路径点（当地图路径改变时调用）
     * 注意：这会重置所有敌人的位置，只在路径真正改变时使用
     * @param {Array} pathPoints - 新的路径点数组（从左到右的顺序）
     */
    updatePath(pathPoints) {
        this.pathPoints = pathPoints || [];
        // 新战斗逻辑不再沿路径重置敌人位置
    }
    
    /**
     * 更新路径点坐标（当地图尺寸改变时调用）
     * 只更新路径点的坐标，不重置敌人的位置
     * @param {Array} pathPoints - 新的路径点数组（从左到右的顺序）
     */
    updatePathPoints(pathPoints) {
        this.pathPoints = pathPoints || [];
        // 地图缩放时敌人位置保持当前直线追击逻辑，不沿路径重算
    }

    /**
     * 敌人圆形碰撞体：两两推开重叠，避免出生点与围殴塔时完全堆叠。
     * 贴脸攻塔的敌人最后再径向投影回「塔缘 + 自身半径」的环上，保证仍视为近战且站位分散。
     * @param {Object|null} game - TowerDefenseGame（用于地图可走格修正）
     */
    resolveEnemyOverlaps(game) {
        const list = this.enemies;
        const n = list.length;
        if (n < 2) {
            this._projectBlockedEnemiesToTowerRing();
            this._projectBaseAttackersToRing(game);
            this._clampEnemiesOutOfStones(game);
            return;
        }
        const pad = ENEMY_COLLISION_PAD;
        const iterations = 4;
        for (let iter = 0; iter < iterations; iter++) {
            for (let i = 0; i < n; i++) {
                const a = list[i];
                if (!a || !a.isAlive) continue;
                const ra = (a.radius > 0 ? a.radius : 15) * ENEMY_COLLISION_RADIUS_SCALE;
                for (let j = i + 1; j < n; j++) {
                    const b = list[j];
                    if (!b || !b.isAlive) continue;
                    const rb = (b.radius > 0 ? b.radius : 15) * ENEMY_COLLISION_RADIUS_SCALE;
                    let dx = b.x - a.x;
                    let dy = b.y - a.y;
                    const distSq = dx * dx + dy * dy;
                    const minD = ra + rb + pad;
                    const minDSq = minD * minD;
                    if (distSq >= minDSq) continue;
                    const dist = Math.sqrt(distSq) || 1e-6;
                    const overlap = minD - dist;
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const push = overlap * 0.5;
                    a.x -= nx * push;
                    a.y -= ny * push;
                    b.x += nx * push;
                    b.y += ny * push;
                }
            }
        }
        this._projectBlockedEnemiesToTowerRing();
        this._projectBaseAttackersToRing(game);
        this._clampEnemiesOutOfStones(game);
    }

    /**
     * 将贴脸攻塔的敌人投影回塔身外缘固定距离，保持「近战」判定同时让围殴呈环形分散
     */
    _projectBlockedEnemiesToTowerRing() {
        const list = this.enemies;
        for (let k = 0; k < list.length; k++) {
            const e = list[k];
            if (!e || !e.isAlive || !e.isBlocked || !e.blockedByTower) continue;
            const tower = e.blockedByTower;
            const tr = tower.radius != null ? tower.radius : 15;
            const er = e.radius > 0 ? e.radius : 15;
            const stopDist = tr + er + 2;
            const dx = e.x - tower.x;
            const dy = e.y - tower.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 1e-4) {
                e.x = tower.x + stopDist;
                e.y = tower.y;
            } else {
                e.x = tower.x + (dx / d) * stopDist;
                e.y = tower.y + (dy / d) * stopDist;
            }
        }
    }

    /**
     * 贴脸攻基地的敌人投影到基地外缘固定距离（与 getBaseMeleeRadius + 自身半径一致）
     * @param {Object|null} game
     */
    _projectBaseAttackersToRing(game) {
        if (!game || !game.map || typeof game.map.getBaseMeleeRadius !== 'function') return;
        const map = game.map;
        const baseCenter = map.getBaseCenterScreen();
        const br = map.getBaseMeleeRadius();
        const list = this.enemies;
        for (let k = 0; k < list.length; k++) {
            const e = list[k];
            if (!e || !e.isAlive || !e.isAttackingBase) continue;
            const er = e.radius > 0 ? e.radius : 15;
            const stopDist = br + er + 2;
            const dx = e.x - baseCenter.x;
            const dy = e.y - baseCenter.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 1e-4) {
                e.x = baseCenter.x + stopDist;
                e.y = baseCenter.y;
            } else {
                e.x = baseCenter.x + (dx / d) * stopDist;
                e.y = baseCenter.y + (dy / d) * stopDist;
            }
        }
    }

    /**
     * 若敌人中心落在石块格内，沿八方向微移直到中心可走（避免分离后被挤进石格）
     * @param {Object|null} game
     */
    _clampEnemiesOutOfStones(game) {
        if (!game || !game.map) return;
        const map = game.map;
        const step = Math.min(map.cellWidth, map.cellHeight) * 0.35;
        const dirs = [
            [1, 0], [-1, 0], [0, 1], [0, -1],
            [1, 1], [1, -1], [-1, 1], [-1, -1]
        ];
        for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            if (!e || !e.isAlive) continue;
            let g = map.screenToGrid(e.x, e.y);
            if (!g || !map.isCellBlockedForEnemy(g.col, g.row)) continue;
            let fixed = false;
            for (let di = 0; di < dirs.length && !fixed; di++) {
                const nx = e.x + dirs[di][0] * step;
                const ny = e.y + dirs[di][1] * step;
                const ng = map.screenToGrid(nx, ny);
                if (ng && !map.isCellBlockedForEnemy(ng.col, ng.row)) {
                    e.x = nx;
                    e.y = ny;
                    fixed = true;
                }
            }
        }
    }
    
    /**
     * 开始生成下一波敌人
     * @returns {boolean} - 是否成功开始
     */
    startNextWave() {
        if (this.isSpawning) {
            console.log('正在生成敌人，请等待...');
            return false;
        }
        
        this.currentWave++;
        const waveConfig = this.waveConfig.getWave(this.currentWave);
        
        if (!waveConfig) {
            console.error('无法获取波次配置');
            return false;
        }
        
        console.log(`开始生成第 ${this.currentWave} 波敌人`);
        
        // 单队列、严格按配置顺序：先按 enemies 数组顺序，再按每组 count 依次入队，不按时间混排
        const waveInterval = waveConfig.spawnInterval ?? 400;
        this.spawnQueue = [];
        waveConfig.enemies.forEach(entry => {
            const n = Math.max(0, entry.count || 0);
            for (let i = 0; i < n; i++) {
                this.spawnQueue.push({
                    ...entry,
                    spawnDelay: this.spawnQueue.length * waveInterval
                });
            }
        });
        
        this.isSpawning = true;
        this.lastSpawnTime = performance.now();
        
        return true;
    }
    
    /**
     * 生成一个敌人
     * @param {Object} config - 敌人配置
     */
    spawnEnemy(config) {
        if (!this.game || !this.game.map) {
            console.error('EnemyManager 未绑定 game 或 map，无法生成敌人');
            return null;
        }
        // 优先使用地图上的出怪口（波次可指定 spawnIndex）；无出怪口时退回地图边缘随机
        let spawn = null;
        const port = this.game.map.resolveSpawnScreenPosition(config.spawnIndex);
        if (port) {
            spawn = { x: port.x, y: port.y };
        } else {
            spawn = this.game.map.getRandomSpawnOnMapEdge();
        }
        
        // 战斗数值一律来自 enemyTypes（怪物编辑器持久化到 localStorage）；忽略波次里可能存在的 health/attack 等遗留字段
        const typeConfig = this.enemyTypes[config.type] || this.enemyTypes['normal'];
        const health = typeConfig.defaultHealth ?? 50;
        const attack = typeConfig.defaultAttack ?? 1;
        const attackInterval = typeConfig.defaultAttackInterval ?? 1;
        const speed = typeConfig.defaultSpeed ?? 50;
        const reward = typeConfig.defaultReward ?? 2;
        const detectionRange = typeConfig.defaultDetectionRange ?? 130;
        
        const enemyConfig = {
            id: `enemy_${Date.now()}_${Math.random()}`,
            name: typeConfig.name,
            type: config.type,
            health: health,
            attack: attack,
            attackInterval: attackInterval,
            speed: speed,
            reward: reward,
            radius: typeConfig.radius,
            color: typeConfig.color,
            icon: typeConfig.icon,
            detectionRange: detectionRange,
            spawnX: spawn.x,
            spawnY: spawn.y
        };
        
        const enemy = new Enemy(enemyConfig);
        this.enemies.push(enemy);
        
        console.log(`生成敌人: ${enemy.name} (检测范围: ${enemy.detectionRange}px, 出生: ${enemy.x.toFixed(0)}, ${enemy.y.toFixed(0)})`);
        
        return enemy;
    }
    
    /**
     * 更新所有敌人（含贴脸攻塔：多怪可同时攻击同一座塔）
     * @param {number} deltaTime - 帧间隔（毫秒）
     * @param {Object} [game] - TowerDefenseGame 实例，用于读取地图与塔的阻挡信息
     * @returns {{ reachedEndCount: number, totalAttackDamage: number }} 兼容旧接口，均为 0（基地伤害由塔防主循环按近战间隔结算）
     */
    update(deltaTime, game) {
        const currentTime = performance.now();
        
        // 生成敌人
        if (this.isSpawning && this.spawnQueue.length > 0) {
            const elapsed = currentTime - this.lastSpawnTime;
            
            // 检查是否有需要生成的敌人
            while (this.spawnQueue.length > 0 && this.spawnQueue[0].spawnDelay <= elapsed) {
                const config = this.spawnQueue.shift();
                this.spawnEnemy(config);
            }
            
            // 如果队列为空，停止生成
            if (this.spawnQueue.length === 0) {
                this.isSpawning = false;
                console.log(`第 ${this.currentWave} 波敌人生成完成`);
            }
        }
        
        // 更新所有敌人：直线朝基地或检测范围内的塔移动；贴脸攻基地/攻塔的怪本帧不位移
        this.enemies = this.enemies.filter(enemy => {
            if (!enemy.isAlive) {
                return false;
            }
            
            if (enemy.isBlocked || enemy.isAttackingBase) {
                return true;
            }
            
            enemy.update(deltaTime, game);
            return true;
        });

        // 每帧末：圆形碰撞分离 + 贴脸怪投影到塔缘/基地缘（避免多怪重叠与围殴挤成一团）
        this.resolveEnemyOverlaps(game);
        
        return { reachedEndCount: 0, totalAttackDamage: 0 };
    }
    
    /**
     * 渲染所有敌人
     */
    render() {
        this.enemies.forEach(enemy => {
            this.renderEnemy(enemy);
        });
    }
    
    /**
     * 渲染单个敌人
     * @param {Enemy} enemy - 敌人对象
     */
    renderEnemy(enemy) {
        // 绘制敌人主体（圆底）
        this.ctx.fillStyle = enemy.color;
        this.ctx.beginPath();
        this.ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 绘制边框
        this.ctx.strokeStyle = '#2c3e50';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // 绘制代表敌人的图标（emoji 居中）
        const icon = enemy.icon || '👹';
        const fontSize = Math.round(enemy.radius * 1.4);
        this.ctx.font = `${fontSize}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillText(icon, enemy.x, enemy.y);
        
        // 绘制生命值条
        const barWidth = enemy.radius * 2;
        const barHeight = 4;
        const barX = enemy.x - barWidth / 2;
        const barY = enemy.y - enemy.radius - 8;
        
        // 背景（红色）
        this.ctx.fillStyle = '#c0392b';
        this.ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // 当前生命值（绿色）
        const healthPercentage = enemy.getHealthPercentage();
        this.ctx.fillStyle = '#27ae60';
        this.ctx.fillRect(barX, barY, barWidth * healthPercentage, barHeight);
        
        // 生命值条边框
        this.ctx.strokeStyle = '#2c3e50';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(barX, barY, barWidth, barHeight);
    }
    
    /**
     * 获取所有敌人
     * @returns {Array} - 敌人数组
     */
    getEnemies() {
        return this.enemies;
    }

    /**
     * 场上仍存活的敌人数量（用于波次结束判定：同帧内塔/子弹击杀后尸体可能仍在数组中，不能只用 length===0）
     * @returns {number}
     */
    getAliveEnemyCount() {
        let n = 0;
        for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            if (e && e.isAlive) n++;
        }
        return n;
    }
    
    /**
     * 获取当前波次
     * @returns {number}
     */
    getCurrentWave() {
        return this.currentWave;
    }
    
    /**
     * 检查是否正在生成敌人
     * @returns {boolean}
     */
    isSpawningWave() {
        return this.isSpawning;
    }
    
    /**
     * 清除所有敌人
     */
    clearAll() {
        this.enemies = [];
        this.isSpawning = false;
        this.spawnQueue = [];
    }
}

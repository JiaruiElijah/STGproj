/**
 * 防御塔攻击系统
 * 负责：塔的冷却、范围内寻敌、造成伤害、击杀奖励
 * 不负责：敌人移动与移除（由 EnemyManager 在 update 中过滤 isAlive）
 */

/** 设为 true 时在控制台打印射程判定与开火时的边界/坐标，用于排查“范围外仍被攻击” */
const DEBUG_RANGE = false;

/**
 * 判断单个敌人是否在塔的射程内
 * 与界面一致：按塔的范围形状（方形/I型/长方形）取范围格子，再判断敌人所在格是否在列表中
 */
function isEnemyInRange(tower, enemy, map) {
    if (!enemy || !enemy.isAlive || !map) return false;
    const rangeGrid = tower.rangeGrid != null ? tower.rangeGrid : 1;
    const rangeShape = tower.rangeShape || 'square';
    const rangeDirection = tower.rangeDirection ?? null;
    const cells = map.getRangeCells(tower.col, tower.row, rangeGrid, rangeShape, rangeDirection);
    const enemyCell = map.screenToGrid(enemy.x, enemy.y);
    if (!enemyCell) return false;
    return cells.some(c => c.col === enemyCell.col && c.row === enemyCell.row);
}

/**
 * 敌人到基地中心的直线距离平方（越小越优先被塔攻击）
 */
function getDistanceToBaseSq(enemy, map) {
    if (!map || !map.getBaseCenterScreen) return 0;
    const c = map.getBaseCenterScreen();
    const dx = enemy.x - c.x;
    const dy = enemy.y - c.y;
    return dx * dx + dy * dy;
}

/**
 * 从敌人列表中筛选出在塔射程内的敌人，并按“离基地越近越优先”排序
 */
function getEnemiesInRange(tower, enemies, map) {
    const inRange = enemies.filter(enemy => isEnemyInRange(tower, enemy, map));
    inRange.sort((a, b) => getDistanceToBaseSq(a, map) - getDistanceToBaseSq(b, map));
    return inRange;
}

/**
 * 计算塔对单次攻击的伤害（基础攻击 + 玩家属性加成）
 * @param {Object} tower - 防御塔对象
 * @param {Object} [playerStats] - 玩家属性（可选）
 * @returns {number}
 */
/**
 * @param {Object} tower
 * @param {Object} [playerStats]
 * @param {number} [branchCritAdd] - 局内 4 级分支额外暴击率（仅本塔）
 */
function computeTowerDamage(tower, playerStats, branchCritAdd = 0) {
    let damage = tower.baseAttack || 0;
    if (playerStats && damage > 0) {
        const physical = playerStats.getStat('physical_damage') || 0;
        const magic = playerStats.getStat('magic_damage') || 0;
        const explosion = playerStats.getStat('explosion_damage') || 0;
        const totalPercent = playerStats.getStat('total_damage_percent') || 0;
        if (tower.category === '法师塔') {
            damage += magic;
        } else if (tower.category === '炮塔') {
            damage += explosion;
        } else {
            damage += physical;
        }
        damage = damage * (1 + totalPercent);
        // 前台属性：攻击力加成、元素伤害加成（与后台乘区叠乘）
        const atkBonus = playerStats.getStat('attack_damage_bonus') || 0;
        const elemDmg = playerStats.getStat('elemental_damage_bonus') || 0;
        damage *= (1 + atkBonus) * (1 + elemDmg);
        // 寒冰塔分支：元素层数强化（与元素伤乘区叠乘，避免重复乘 atkBonus）
        const br = tower.branchRuntime;
        if (br && br.frostDamageMult && br.frostDamageMult !== 1 && tower.item && tower.item.id === 'frost_tower') {
            damage *= br.frostDamageMult;
        }
        // 暴击：前台暴击率 + 后台旧 crit_rate + 局内分支
        const critP = Math.min(
            0.95,
            (playerStats.getStat('crit_chance_bonus') || 0) + (playerStats.getStat('crit_rate') || 0) + (Number(branchCritAdd) || 0)
        );
        if (critP > 0 && Math.random() < critP) {
            damage *= 2;
        }
    }
    return Math.max(0, Math.round(damage));
}

/** 炮塔、兵营不做飞行子弹，直接命中；其余塔（箭塔、法师塔、防御塔）发射飞行子弹 */
const TOWER_CATEGORIES_NO_PROJECTILE = ['炮塔', '兵营'];

/** 子弹飞行速度（像素/秒） */
const PROJECTILE_SPEED = 450;

/**
 * 判断该塔是否使用飞行子弹（否则为即时命中）
 */
function towerUsesProjectile(tower) {
    return tower.category && !TOWER_CATEGORIES_NO_PROJECTILE.includes(tower.category);
}

/**
 * 防御塔攻击系统
 * 在每帧 update 中调用，驱动塔攻击与击杀结算
 */
class TowerAttackSystem {
    /**
     * @param {Object} game - TowerDefenseGame 实例（需要 towers, enemyManager, map, gameState, playerStats）
     */
    constructor(game) {
        this.game = game;
    }

    /**
     * 穿透/弹射：在塔射程内选取下一个未被本发子弹击中的敌人（离基地近者优先，与 getEnemiesInRange 一致）
     * @param {Object} tower
     * @param {string[]} hitEnemyIds
     * @returns {Object|null}
     */
    pickNextPierceTarget(tower, hitEnemyIds) {
        const enemies = this.game.enemyManager ? this.game.enemyManager.getEnemies() : [];
        const list = getEnemiesInRange(tower, enemies, this.game.map);
        const set = new Set(hitEnemyIds || []);
        for (let i = 0; i < list.length; i++) {
            const e = list[i];
            if (e && e.isAlive && !set.has(e.id)) return e;
        }
        return null;
    }

    /** 供分裂伤害等复用：射程内敌人列表（与开火索敌顺序一致） */
    getEnemiesInRangeSorted(tower) {
        const enemies = this.game.enemyManager ? this.game.enemyManager.getEnemies() : [];
        return getEnemiesInRange(tower, enemies, this.game.map);
    }

    /**
     * 每帧更新：遍历所有塔，冷却到了则找范围内目标并造成伤害，击杀时发金币并计数
     * @param {number} currentTime - 当前时间（毫秒，performance.now()）
     */
    update(currentTime) {
        const { towers, enemyManager, map, gameState, playerStats } = this.game;
        if (!map) return;

        const enemies = enemyManager ? enemyManager.getEnemies() : [];

        towers.forEach(tower => {
            // 敌人目标已死则解除锁定
            if (tower.currentTarget && !tower.currentTarget.isAlive) {
                tower.currentTarget = null;
            }
            // 矿石格已清空或打死则解除锁定
            if (tower.currentOreTarget) {
                const c = tower.currentOreTarget;
                const rowG = map.grid[c.row];
                const cell = rowG ? rowG[c.col] : null;
                if (!cell || cell.type !== map.CELL_TYPES.ORE || (cell.oreLives | 0) <= 0) {
                    tower.currentOreTarget = null;
                }
            }

            // 攻速修正：配置值偏大，按 0.2 倍率并封顶约 3 次/秒；叠加玩家「射速加成」与后台 attack_speed_percent
            let speedFactor = 1;
            if (playerStats) {
                const sb = (playerStats.getStat('attack_speed_bonus') || 0) + (playerStats.getStat('attack_speed_percent') || 0);
                speedFactor = Math.max(0.25, 1 + sb);
            }
            const effectiveAttacksPerSecond = Math.min((tower.attackSpeed || 1) * 0.2 * speedFactor, 5);
            const attackIntervalMs = 1000 / effectiveAttacksPerSecond;

            // 首次攻击不等待冷却（lastAttackTime 为 0 表示从未开火）
            const hasFiredBefore = (tower.lastAttackTime || 0) > 0;
            if (hasFiredBefore && (currentTime - tower.lastAttackTime < attackIntervalMs)) return;

            const rangeGrid = tower.rangeGrid != null ? tower.rangeGrid : 1;
            const rangeShape = tower.rangeShape || 'square';
            const rangeDirection = tower.rangeDirection ?? null;

            // —— 优先：射程内敌人 ——
            let enemyTarget = null;
            if (tower.currentTarget && tower.currentTarget.isAlive) {
                enemyTarget = tower.currentTarget;
            } else {
                tower.currentTarget = null;
                const candidates = getEnemiesInRange(tower, enemies, map);
                enemyTarget = candidates[0] || null;
                tower.currentTarget = enemyTarget;
            }

            if (enemyTarget) {
                const br = tower.branchRuntime || {};
                const critAdd = br.critAdd || 0;
                const volleyCount = Math.max(1, br.volleyCount | 0);
                const fullDmg = computeTowerDamage(tower, playerStats, critAdd);
                if (fullDmg <= 0) return;

                tower.lastAttackTime = currentTime;
                tower.currentTarget = null;
                tower.currentOreTarget = null;

                const perShot = Math.max(1, Math.round(fullDmg / volleyCount));
                const pierceTotal = (br.pierceAdd | 0) + (br.chainBounceAdd | 0);
                const splitExtra = br.splitExtraTargets | 0;
                const splitScale = br.splitDmgScale || 0;
                const frostSlow = br.applyFrostSlow || null;

                if (towerUsesProjectile(tower)) {
                    for (let v = 0; v < volleyCount; v++) {
                        const dx = enemyTarget.x - tower.x;
                        const dy = enemyTarget.y - tower.y;
                        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                        const vx = (dx / dist) * PROJECTILE_SPEED;
                        const vy = (dy / dist) * PROJECTILE_SPEED;
                        this.game.projectiles.push({
                            x: tower.x,
                            y: tower.y,
                            vx,
                            vy,
                            speed: PROJECTILE_SPEED,
                            target: enemyTarget,
                            damage: perShot,
                            sourceTower: tower,
                            category: tower.category,
                            pierceRemaining: pierceTotal,
                            hitEnemyIds: [],
                            splitExtraTargets: splitExtra,
                            splitDmgScale: splitScale,
                            splitApplied: false,
                            applyFrostSlow: frostSlow
                        });
                    }
                } else {
                    const killed = enemyTarget.takeDamage(fullDmg);
                    if (killed) {
                        tower.currentTarget = null;
                        if (this.game.applyGoldCoinsIncome) {
                            this.game.applyGoldCoinsIncome(enemyTarget.reward || 0);
                            if (br.goldKillExtraChance > 0 && Math.random() < br.goldKillExtraChance) {
                                this.game.applyGoldCoinsIncome(enemyTarget.reward || 0);
                            }
                        } else {
                            gameState.coins += enemyTarget.reward || 0;
                        }
                        this.game.enemiesKilled = (this.game.enemiesKilled || 0) + 1;
                    }
                    if (this.game.addHeroExperienceFromDamage) {
                        this.game.addHeroExperienceFromDamage(tower, fullDmg);
                    }
                    if (this.game.addTowerPower) {
                        this.game.addTowerPower(tower, tower.powerGainPerHit != null ? tower.powerGainPerHit : 1);
                    }
                    if (frostSlow && enemyTarget.applyFrostSlow) {
                        enemyTarget.applyFrostSlow(frostSlow.factor, frostSlow.ms);
                    }
                    if (splitExtra > 0 && this.game.applyProjectileSplitDamage) {
                        this.game.applyProjectileSplitDamage(tower, enemyTarget, fullDmg, splitExtra, splitScale);
                    }
                }
                return;
            }

            tower.currentTarget = null;

            // —— 无敌人：射程内矿石（优先级低于敌人）——
            // 与基地产灵一致：仅在本波已出兵或场上仍有敌人时可打矿；休整期/未开战不打
            if (!this.game.isOreMiningCombatActive || !this.game.isOreMiningCombatActive()) {
                tower.currentOreTarget = null;
                return;
            }

            let orePick = null;
            if (tower.currentOreTarget) {
                const c = tower.currentOreTarget;
                const ores = map.getOresInRangeSorted(tower.col, tower.row, rangeGrid, rangeShape, rangeDirection);
                for (let i = 0; i < ores.length; i++) {
                    if (ores[i].col === c.col && ores[i].row === c.row) {
                        orePick = ores[i];
                        break;
                    }
                }
            }
            if (!orePick) {
                tower.currentOreTarget = null;
                const ores = map.getOresInRangeSorted(tower.col, tower.row, rangeGrid, rangeShape, rangeDirection);
                orePick = ores[0] || null;
            }
            if (!orePick) return;

            const brOre = tower.branchRuntime || {};
            const damage = computeTowerDamage(tower, playerStats, brOre.critAdd || 0);
            if (damage <= 0) return;

            tower.lastAttackTime = currentTime;
            tower.currentOreTarget = { col: orePick.col, row: orePick.row };

            if (towerUsesProjectile(tower)) {
                this.game.projectiles.push({
                    x: tower.x,
                    y: tower.y,
                    vx: 0,
                    vy: 0,
                    speed: PROJECTILE_SPEED,
                    target: null,
                    oreCol: orePick.col,
                    oreRow: orePick.row,
                    damage,
                    sourceTower: tower,
                    category: tower.category
                });
            } else if (this.game.applyOreHitFromTower) {
                this.game.applyOreHitFromTower(tower, orePick.col, orePick.row, damage);
            }
        });
    }
}

/**
 * 游戏地图网格系统
 * 负责管理网格地图、基地、石块、可放置区域等（已不再使用“路径”格子）
 */

/**
 * 地图网格类
 */
class GameMap {
    constructor(canvas, gridCols = 8, gridRows = 7) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // 网格配置
        this.gridCols = gridCols; // 列数
        this.gridRows = gridRows; // 行数
        this.cellWidth = 0; // 格子宽度（像素）
        this.cellHeight = 0; // 格子高度（像素）
        
        // 地图数据
        this.grid = []; // 网格数据，每个格子存储其类型和状态
        
        // 格子类型
        this.CELL_TYPES = {
            EMPTY: 'empty',      // 空地（可放置防御塔）
            BLOCKED: 'blocked',  // 阻挡（不可放置）
            BASE: 'base',        // 基地（2×2，敌人进攻目标；不可放塔）
            STONE: 'stone',      // 石块：不可放塔、怪物不可穿行
            SPAWN: 'spawn',      // 出怪口：怪物从此格中心生成；不可放塔；不阻挡移动
            ORE: 'ore',          // 矿石：可被塔攻击，有若干条命；不阻挡移动
            MINER: 'miner'       // 矿机：矿石打完后生成，周期性产灵力
        };
        
        // 基地区域：左上角格坐标 + 宽高（格数），在 initBaseArea 中写入 grid
        this.baseAnchorCol = 0;
        this.baseAnchorRow = 0;
        this.baseCols = 2;
        this.baseRows = 2;
        
        // 颜色配置
        this.COLORS = {
            EMPTY: '#34495e',      // 空地颜色（深灰蓝）
            BLOCKED: '#2c3e50',    // 阻挡颜色（深灰）
            BASE: '#1e3a5f',       // 基地底色（深蓝）
            STONE: '#5d4e37',      // 石块（岩褐）
            SPAWN: '#6c3483',      // 出怪口（紫，与基地/石块区分）
            ORE: '#6e4c1e',        // 矿石（铜褐）
            MINER: '#1e4d3a',      // 矿机（深绿灰）
            GRID_LINE: '#1a252f',  // 网格线颜色
            HOVER: 'rgba(52, 152, 219, 0.3)' // 悬停高亮
        };
        
        // 当前悬停的格子
        this.hoverCell = null;
        /** 出怪口有序列表（下标 0、1、2… 对应波次里的「出怪口0/1/…」） */
        this._spawnPointsList = [];
        /**
         * 休整期「下一波」剩余秒数（由 TowerDefenseGame 每帧写入）；为 null 时不画出倒计时
         * 画在格内可避免被后续塔/敌人层完全挡住（波次间隔时场上通常无怪）
         */
        this.spawnNextWaveCountdownSec = null;

        // 初始化
        this.init();
    }

    /** 基地锚点本地存储 key（与 towerDefense 共用逻辑时保持一致） */
    static BASE_ANCHOR_STORAGE_KEY = 'tower_defense_base_anchor';
    /** 石块坐标列表 JSON 数组 [{col,row},...] */
    static STONES_STORAGE_KEY = 'tower_defense_map_stones';
    /** 出怪口坐标有序列表 JSON，顺序即出怪口编号 */
    static SPAWN_POINTS_STORAGE_KEY = 'tower_defense_map_spawn_points';
    /** 矿石与矿机存档 [{ kind, col, row, ... }] */
    static ORE_MINER_STORAGE_KEY = 'tower_defense_map_ore_miner';
    /** 每命生命值默认，须与 index.html 中 mapEditorOreHpPerLife 的 value 一致；旧蓝图缺字段时按此恢复 */
    static DEFAULT_ORE_HP_PER_LIFE = 100;
    
    /**
     * 初始化地图
     */
    init() {
        console.log(`初始化地图网格: ${this.gridCols}x${this.gridRows}`);
        
        // 初始化网格数据
        this.initGrid();
        
        // 基地 2×2：默认左下角，或从 localStorage 恢复
        this.initBaseArea();
        // 石块在基地之后应用；持久化见 applySavedStones
        this.applySavedStones();
        // 出怪口在石块之后应用（若与石块坐标冲突则跳过该出怪口）
        this.applySavedSpawns();
        this.applySavedOreMiners();
        
        // 计算格子尺寸
        this.calculateCellSize();
        
        // 绑定事件
        this.bindEvents();
    }
    
    /**
     * 初始化网格数据
     */
    initGrid() {
        this.grid = [];
        for (let row = 0; row < this.gridRows; row++) {
            this.grid[row] = [];
            for (let col = 0; col < this.gridCols; col++) {
                // 新棋盘不再使用 path 类型；若将来从存档恢复整图，可在此处把 'path' 洗成 EMPTY
                this.grid[row][col] = {
                    type: this.CELL_TYPES.EMPTY,
                    col: col,
                    row: row,
                    hasTower: false, // 标记是否有防御塔
                    evolutionStage: 0, // 塔进化阶段：0未进化；1/2... 表示不同阶段
                    // 矿石/矿机（仅当 type 为 ore/miner 时有效）
                    oreLives: 0,
                    oreMaxLives: 0,
                    /** 每条命的最大生命值（相同）；当前命剩余见 oreCurrentLifeHp */
                    oreHpPerLife: 0,
                    oreCurrentLifeHp: 0,
                    oreSpiritPerLife: 0,
                    minerIntervalSec: 3,
                    minerSpiritPerTick: 1,
                    minerAccumMs: 0,
                    /** true：战斗中矿石被打成矿机；false：地图编辑器直接放的矿机。仅编辑器矿机写入本地蓝图 */
                    minerFromOre: false
                };
            }
        }
    }

    /**
     * 从本地读取保存的基地左上角
     * @returns {{ anchorCol: number, anchorRow: number }|null}
     */
    loadSavedBaseAnchor() {
        try {
            const raw = localStorage.getItem(GameMap.BASE_ANCHOR_STORAGE_KEY);
            if (!raw) return null;
            const o = JSON.parse(raw);
            if (typeof o.anchorCol !== 'number' || typeof o.anchorRow !== 'number') return null;
            return { anchorCol: o.anchorCol, anchorRow: o.anchorRow };
        } catch (e) {
            return null;
        }
    }

    /**
     * 默认基地位置：左下角 2×2
     */
    getDefaultBaseAnchor() {
        return {
            anchorCol: 0,
            anchorRow: Math.max(0, this.gridRows - this.baseRows)
        };
    }

    /**
     * 初始化基地：首次为默认或已保存的锚点
     */
    initBaseArea() {
        this.baseCols = 2;
        this.baseRows = 2;
        const saved = this.loadSavedBaseAnchor();
        const def = this.getDefaultBaseAnchor();
        let anchorCol = saved ? saved.anchorCol : def.anchorCol;
        let anchorRow = saved ? saved.anchorRow : def.anchorRow;
        if (!this.applyBaseAnchor(anchorCol, anchorRow, false)) {
            this.applyBaseAnchor(def.anchorCol, def.anchorRow, false);
        }
    }

    /**
     * 清除网格上所有基地格（还原为 EMPTY，便于重新放置）
     */
    clearBaseCellsFromGrid() {
        for (let row = 0; row < this.gridRows; row++) {
            for (let col = 0; col < this.gridCols; col++) {
                if (this.grid[row][col].type === this.CELL_TYPES.BASE) {
                    this.grid[row][col].type = this.CELL_TYPES.EMPTY;
                }
            }
        }
    }

    /**
     * 某锚点是否可放置 2×2 基地：在棋盘内，且四格均无防御塔
     */
    canPlaceBaseAt(anchorCol, anchorRow) {
        if (anchorCol < 0 || anchorRow < 0) return false;
        if (anchorCol + this.baseCols > this.gridCols || anchorRow + this.baseRows > this.gridRows) {
            return false;
        }
        for (let dr = 0; dr < this.baseRows; dr++) {
            for (let dc = 0; dc < this.baseCols; dc++) {
                const col = anchorCol + dc;
                const row = anchorRow + dr;
                if (this.grid[row][col].hasTower) {
                    return false;
                }
                if (this.grid[row][col].type === this.CELL_TYPES.STONE) {
                    return false;
                }
                if (this.grid[row][col].type === this.CELL_TYPES.SPAWN) {
                    return false;
                }
                if (this.grid[row][col].type === this.CELL_TYPES.ORE ||
                    this.grid[row][col].type === this.CELL_TYPES.MINER) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * 怪物是否不可进入该格（仅石块阻挡；基地不阻挡移动，抵达由 isPointInBaseArea 判定）
     * @param {number} col
     * @param {number} row
     * @returns {boolean}
     */
    isCellBlockedForEnemy(col, row) {
        if (!this.isValidCell(col, row)) return true;
        return this.grid[row][col].type === this.CELL_TYPES.STONE;
    }

    /**
     * 放置石块：不可在基地格、已有塔的格子上放置
     * @param {number} col
     * @param {number} row
     * @returns {boolean}
     */
    setStoneAt(col, row) {
        if (!this.isValidCell(col, row)) return false;
        const cell = this.grid[row][col];
        if (cell.type === this.CELL_TYPES.BASE) return false;
        if (cell.hasTower) return false;
        if (cell.type === this.CELL_TYPES.SPAWN) return false;
        if (cell.type === this.CELL_TYPES.ORE || cell.type === this.CELL_TYPES.MINER) return false;
        if (cell.type === this.CELL_TYPES.STONE) return true;
        cell.type = this.CELL_TYPES.STONE;
        return true;
    }

    /**
     * 移除石块，恢复为空地
     * @param {number} col
     * @param {number} row
     * @returns {boolean} 是否发生了移除
     */
    removeStoneAt(col, row) {
        if (!this.isValidCell(col, row)) return false;
        const cell = this.grid[row][col];
        if (cell.type !== this.CELL_TYPES.STONE) return false;
        cell.type = this.CELL_TYPES.EMPTY;
        return true;
    }

    /**
     * 从 localStorage 读取石块列表
     * @returns {Array<{col:number,row:number}>}
     */
    loadSavedStonesList() {
        try {
            const raw = localStorage.getItem(GameMap.STONES_STORAGE_KEY);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return [];
            return arr.filter(
                o => o && typeof o.col === 'number' && typeof o.row === 'number'
            );
        } catch (e) {
            return [];
        }
    }

    /**
     * 将当前网格中所有石块写入 localStorage
     */
    saveStonesToStorage() {
        const list = [];
        for (let row = 0; row < this.gridRows; row++) {
            for (let col = 0; col < this.gridCols; col++) {
                if (this.grid[row][col].type === this.CELL_TYPES.STONE) {
                    list.push({ col, row });
                }
            }
        }
        try {
            localStorage.setItem(GameMap.STONES_STORAGE_KEY, JSON.stringify(list));
        } catch (e) {
            console.warn('保存石块数据失败', e);
        }
    }

    /**
     * 应用已保存的石块列表（初始化或改网格大小后调用）
     */
    applySavedStones() {
        const list = this.loadSavedStonesList();
        for (let i = 0; i < list.length; i++) {
            const { col, row } = list[i];
            if (!this.isValidCell(col, row)) continue;
            const cell = this.grid[row][col];
            if (cell.type === this.CELL_TYPES.BASE) continue;
            if (cell.hasTower) continue;
            cell.type = this.CELL_TYPES.STONE;
        }
    }

    /**
     * 从 localStorage 读出怪口有序列表
     * @returns {Array<{col:number,row:number}>}
     */
    loadSavedSpawnsList() {
        try {
            const raw = localStorage.getItem(GameMap.SPAWN_POINTS_STORAGE_KEY);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return [];
            return arr.filter(
                o => o && typeof o.col === 'number' && typeof o.row === 'number'
            );
        } catch (e) {
            return [];
        }
    }

    /**
     * 将当前 _spawnPointsList 写入 localStorage（与网格一致）
     */
    saveSpawnsToStorage() {
        try {
            localStorage.setItem(GameMap.SPAWN_POINTS_STORAGE_KEY, JSON.stringify(this._spawnPointsList));
        } catch (e) {
            console.warn('保存出怪口数据失败', e);
        }
    }

    /**
     * 应用已保存的出怪口（在基地、石块之后调用）
     */
    applySavedSpawns() {
        this._spawnPointsList = [];
        const list = this.loadSavedSpawnsList();
        for (let i = 0; i < list.length; i++) {
            const { col, row } = list[i];
            if (!this.isValidCell(col, row)) continue;
            const cell = this.grid[row][col];
            if (cell.type === this.CELL_TYPES.BASE) continue;
            if (cell.type === this.CELL_TYPES.STONE) continue;
            if (cell.type === this.CELL_TYPES.ORE || cell.type === this.CELL_TYPES.MINER) continue;
            if (cell.hasTower) continue;
            cell.type = this.CELL_TYPES.SPAWN;
            this._spawnPointsList.push({ col, row });
        }
    }

    /**
     * 放置出怪口：顺序追加到列表末尾，编号为「当前个数」
     * @param {number} col
     * @param {number} row
     * @returns {boolean}
     */
    setSpawnAt(col, row) {
        if (!this.isValidCell(col, row)) return false;
        const cell = this.grid[row][col];
        if (cell.type === this.CELL_TYPES.BASE) return false;
        if (cell.type === this.CELL_TYPES.STONE) return false;
        if (cell.hasTower) return false;
        if (cell.type === this.CELL_TYPES.ORE || cell.type === this.CELL_TYPES.MINER) return false;
        if (cell.type === this.CELL_TYPES.SPAWN) return true;
        cell.type = this.CELL_TYPES.SPAWN;
        this._spawnPointsList.push({ col, row });
        return true;
    }

    /**
     * 移除出怪口格
     * @param {number} col
     * @param {number} row
     * @returns {boolean}
     */
    removeSpawnAt(col, row) {
        if (!this.isValidCell(col, row)) return false;
        const cell = this.grid[row][col];
        if (cell.type !== this.CELL_TYPES.SPAWN) return false;
        cell.type = this.CELL_TYPES.EMPTY;
        this._spawnPointsList = this._spawnPointsList.filter(
            p => !(p.col === col && p.row === row)
        );
        return true;
    }

    /**
     * 清空格子上的矿石/矿机专用字段（还原为 EMPTY 时调用）
     * @param {Object} cell
     */
    clearOreMinerFields(cell) {
        cell.oreLives = 0;
        cell.oreMaxLives = 0;
        cell.oreHpPerLife = 0;
        cell.oreCurrentLifeHp = 0;
        cell.oreSpiritPerLife = 0;
        cell.minerIntervalSec = 3;
        cell.minerSpiritPerTick = 1;
        cell.minerAccumMs = 0;
        cell.minerFromOre = false;
    }

    /**
     * 地图编辑器：放置矿石（矿机参数为矿石打完后沿用）
     * @param {number} col
     * @param {number} row
     * @param {{ lives?: number, hpPerLife?: number, spiritPerLife?: number, minerIntervalSec?: number, minerSpiritPerTick?: number }} [opts]
     * @returns {boolean}
     */
    setOreAt(col, row, opts) {
        opts = opts || {};
        if (!this.isValidCell(col, row)) return false;
        const cell = this.grid[row][col];
        if (cell.type === this.CELL_TYPES.BASE) return false;
        if (cell.type === this.CELL_TYPES.STONE) return false;
        if (cell.type === this.CELL_TYPES.SPAWN) return false;
        if (cell.hasTower) return false;
        const lives = Math.max(1, Math.floor(Number(opts.lives) || 3));
        let hpRaw = opts.hpPerLife;
        if (hpRaw == null || hpRaw === '') hpRaw = GameMap.DEFAULT_ORE_HP_PER_LIFE;
        const hpPerLife = Math.max(1, Math.floor(Number(hpRaw) || 1));
        const perLife = Math.max(0, Number(opts.spiritPerLife) || 0);
        const mInt = Math.max(0.1, Number(opts.minerIntervalSec) || 3);
        const mTick = Math.max(0, Number(opts.minerSpiritPerTick) || 1);
        cell.type = this.CELL_TYPES.ORE;
        cell.oreMaxLives = lives;
        cell.oreLives = lives;
        cell.oreHpPerLife = hpPerLife;
        cell.oreCurrentLifeHp = hpPerLife;
        cell.oreSpiritPerLife = perLife;
        cell.minerIntervalSec = mInt;
        cell.minerSpiritPerTick = mTick;
        cell.minerAccumMs = 0;
        cell.minerFromOre = false;
        return true;
    }

    /**
     * 地图编辑器：直接放置矿机（不经过打矿石）
     * @param {number} col
     * @param {number} row
     * @param {{ minerIntervalSec?: number, minerSpiritPerTick?: number }} [opts]
     * @returns {boolean}
     */
    setMinerAt(col, row, opts) {
        opts = opts || {};
        if (!this.isValidCell(col, row)) return false;
        const cell = this.grid[row][col];
        if (cell.type === this.CELL_TYPES.BASE) return false;
        if (cell.type === this.CELL_TYPES.STONE) return false;
        if (cell.type === this.CELL_TYPES.SPAWN) return false;
        if (cell.hasTower) return false;
        const mInt = Math.max(0.1, Number(opts.minerIntervalSec) || 3);
        const mTick = Math.max(0, Number(opts.minerSpiritPerTick) || 1);
        cell.type = this.CELL_TYPES.MINER;
        this.clearOreMinerFields(cell);
        cell.minerIntervalSec = mInt;
        cell.minerSpiritPerTick = mTick;
        cell.minerAccumMs = 0;
        cell.minerFromOre = false;
        return true;
    }

    /**
     * 移除矿石或矿机格，恢复为空地
     * @param {number} col
     * @param {number} row
     * @returns {boolean}
     */
    removeOreOrMinerAt(col, row) {
        if (!this.isValidCell(col, row)) return false;
        const cell = this.grid[row][col];
        if (cell.type !== this.CELL_TYPES.ORE && cell.type !== this.CELL_TYPES.MINER) {
            return false;
        }
        cell.type = this.CELL_TYPES.EMPTY;
        this.clearOreMinerFields(cell);
        return true;
    }

    /**
     * 对矿石造成攻击伤害：每条命有 oreHpPerLife 点生命（各条相同）；先扣当前命，扣光一条命时获得灵力
     * @param {number} col
     * @param {number} row
     * @param {number} rawDamage - 塔本次攻击伤害（取整）
     * @returns {{ spiritGained: number, becameMiner: boolean, col: number, row: number }|null}
     */
    applyOreDamage(col, row, rawDamage) {
        if (!this.isValidCell(col, row)) return null;
        const cell = this.grid[row][col];
        if (cell.type !== this.CELL_TYPES.ORE) return null;
        let lives = cell.oreLives | 0;
        if (lives <= 0) return null;
        const hpMax = Math.max(1, Math.floor(Number(cell.oreHpPerLife) || 1));
        let damage = Math.max(0, Math.floor(Number(rawDamage) || 0));
        if (damage <= 0) return null;

        let spiritGained = 0;
        let curHp = cell.oreCurrentLifeHp != null ? Math.max(0, cell.oreCurrentLifeHp | 0) : hpMax;
        if (curHp <= 0) curHp = hpMax;

        const perSpirit = Math.max(0, cell.oreSpiritPerLife | 0);

        while (damage > 0 && lives > 0) {
            if (curHp <= 0) curHp = hpMax;
            if (damage >= curHp) {
                damage -= curHp;
                lives--;
                spiritGained += perSpirit;
                if (lives <= 0) {
                    cell.oreLives = 0;
                    cell.oreCurrentLifeHp = 0;
                    this._convertCellOreToMiner(cell);
                    return { spiritGained, becameMiner: true, col, row };
                }
                curHp = hpMax;
            } else {
                curHp -= damage;
                damage = 0;
            }
        }
        cell.oreLives = lives;
        cell.oreCurrentLifeHp = curHp;
        cell.oreHpPerLife = hpMax;
        return { spiritGained, becameMiner: false, col, row };
    }

    /**
     * 局内将一格矿石变为矿机（保留 minerIntervalSec / minerSpiritPerTick）
     * @param {Object} cell
     */
    _convertCellOreToMiner(cell) {
        cell.type = this.CELL_TYPES.MINER;
        cell.oreLives = 0;
        cell.oreMaxLives = 0;
        cell.oreHpPerLife = 0;
        cell.oreCurrentLifeHp = 0;
        cell.oreSpiritPerLife = 0;
        cell.minerAccumMs = 0;
        // 局内转化：不写本地蓝图，刷新后仍从蓝图恢复为矿石
        cell.minerFromOre = true;
    }

    /**
     * 塔/英雄索敌：射程内仍有命的矿石，按「离基地中心越近越优先」
     * @param {number} towerCol
     * @param {number} towerRow
     * @param {number} rangeGrid
     * @param {string} rangeShape
     * @param {string|null} rangeDirection
     * @returns {Array<{col:number,row:number,distSq:number}>}
     */
    getOresInRangeSorted(towerCol, towerRow, rangeGrid, rangeShape, rangeDirection) {
        this.calculateCellSize();
        const cells = this.getRangeCells(towerCol, towerRow, rangeGrid, rangeShape, rangeDirection);
        const baseCenter = this.getBaseCenterScreen();
        const list = [];
        for (let i = 0; i < cells.length; i++) {
            const c = cells[i];
            const cell = this.grid[c.row][c.col];
            if (cell.type !== this.CELL_TYPES.ORE || (cell.oreLives | 0) <= 0) continue;
            const scr = this.gridToScreen(c.col, c.row);
            if (!scr) continue;
            const dx = scr.x - baseCenter.x;
            const dy = scr.y - baseCenter.y;
            list.push({ col: c.col, row: c.row, distSq: dx * dx + dy * dy });
        }
        list.sort((a, b) => a.distSq - b.distSq);
        return list;
    }

    /**
     * 从 localStorage 读取矿石/矿机列表
     */
    loadSavedOreMinersList() {
        try {
            const raw = localStorage.getItem(GameMap.ORE_MINER_STORAGE_KEY);
            if (!raw) return { version: 1, entries: [] };
            const o = JSON.parse(raw);
            if (o && Array.isArray(o.entries)) return o;
            return { version: 1, entries: [] };
        } catch (e) {
            return { version: 1, entries: [] };
        }
    }

    /**
     * 写入矿石/矿机蓝图（内部）
     * @param {Array} entries
     */
    _writeOreMinerBlueprintEntries(entries) {
        try {
            localStorage.setItem(GameMap.ORE_MINER_STORAGE_KEY, JSON.stringify({ version: 1, entries }));
        } catch (e) {
            console.warn('保存矿石/矿机蓝图失败', e);
        }
    }

    /**
     * 仅地图编辑器：在蓝图中记录一格矿石（局内打成的矿机不会经过此函数）
     * @param {number} col
     * @param {number} row
     * @param {{ lives?: number, hpPerLife?: number, spiritPerLife?: number, minerIntervalSec?: number, minerSpiritPerTick?: number }} opts
     */
    saveOreMinerBlueprintOre(col, row, opts) {
        opts = opts || {};
        const data = this.loadSavedOreMinersList();
        const entries = (data.entries || []).filter(e => !(e.col === col && e.row === row));
        const lives = Math.max(1, Math.floor(Number(opts.lives) || 3));
        let hpRaw = opts.hpPerLife;
        if (hpRaw == null || hpRaw === '') hpRaw = GameMap.DEFAULT_ORE_HP_PER_LIFE;
        const hpPerLife = Math.max(1, Math.floor(Number(hpRaw) || 1));
        const spiritPerLife = Math.max(0, Number(opts.spiritPerLife) || 0);
        const minerIntervalSec = Math.max(0.1, Number(opts.minerIntervalSec) || 3);
        const minerSpiritPerTick = Math.max(0, Number(opts.minerSpiritPerTick) || 1);
        entries.push({
            kind: 'ore',
            col,
            row,
            lives,
            hpPerLife,
            spiritPerLife,
            minerIntervalSec,
            minerSpiritPerTick
        });
        this._writeOreMinerBlueprintEntries(entries);
    }

    /**
     * 仅地图编辑器：在蓝图中记录一格直接放置的矿机
     * @param {number} col
     * @param {number} row
     * @param {{ minerIntervalSec?: number, minerSpiritPerTick?: number }} opts
     */
    saveOreMinerBlueprintMiner(col, row, opts) {
        opts = opts || {};
        const data = this.loadSavedOreMinersList();
        const entries = (data.entries || []).filter(e => !(e.col === col && e.row === row));
        const intervalSec = Math.max(0.1, Number(opts.minerIntervalSec) || 3);
        const spiritPerTick = Math.max(0, Number(opts.minerSpiritPerTick) || 1);
        entries.push({
            kind: 'miner',
            col,
            row,
            intervalSec,
            spiritPerTick
        });
        this._writeOreMinerBlueprintEntries(entries);
    }

    /**
     * 仅地图编辑器：从蓝图中移除一格（擦除矿石/矿机）
     * @param {number} col
     * @param {number} row
     */
    removeOreMinerBlueprintEntry(col, row) {
        const data = this.loadSavedOreMinersList();
        const entries = (data.entries || []).filter(e => !(e.col === col && e.row === row));
        this._writeOreMinerBlueprintEntries(entries);
    }

    /**
     * 地图编辑器：将「每命生命值」同步到棋盘上所有矿石格，并更新蓝图中各 ore 条目的 hpPerLife
     * （改输入框即可生效，无需逐格再点矿石）
     * @param {number} hpPerLife
     */
    applyHpPerLifeToAllOres(hpPerLife) {
        const v = Math.max(1, Math.floor(Number(hpPerLife) || 1));
        const data = this.loadSavedOreMinersList();
        const entries = (data.entries || []).map(e => {
            if (e && e.kind === 'ore') {
                return Object.assign({}, e, { hpPerLife: v });
            }
            return e;
        });
        this._writeOreMinerBlueprintEntries(entries);
        for (let row = 0; row < this.gridRows; row++) {
            for (let col = 0; col < this.gridCols; col++) {
                const cell = this.grid[row][col];
                if (cell.type !== this.CELL_TYPES.ORE) continue;
                const oldMax = Math.max(1, Math.floor(Number(cell.oreHpPerLife)) || 1);
                const cur = cell.oreCurrentLifeHp != null ? cell.oreCurrentLifeHp : oldMax;
                cell.oreHpPerLife = v;
                // 按比例缩放当前命剩余 HP（例如曾错误为 1/1 时改为 100，则变为 100/100）
                let nextCur = Math.round((cur / oldMax) * v);
                if (nextCur < 0) nextCur = 0;
                if (nextCur > v) nextCur = v;
                if ((cell.oreLives | 0) > 0 && nextCur <= 0) nextCur = v;
                cell.oreCurrentLifeHp = nextCur;
            }
        }
    }

    /**
     * 应用存档中的矿石与矿机（在基地、石块、出怪口之后）
     */
    applySavedOreMiners() {
        const data = this.loadSavedOreMinersList();
        const entries = data.entries || [];
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            if (!e || typeof e.col !== 'number' || typeof e.row !== 'number') continue;
            if (!this.isValidCell(e.col, e.row)) continue;
            const cell = this.grid[e.row][e.col];
            if (cell.type === this.CELL_TYPES.BASE || cell.type === this.CELL_TYPES.STONE ||
                cell.type === this.CELL_TYPES.SPAWN || cell.hasTower) {
                continue;
            }
            if (e.kind === 'ore') {
                const hpPL = (e.hpPerLife != null && e.hpPerLife !== '')
                    ? Math.max(1, Math.floor(Number(e.hpPerLife)))
                    : GameMap.DEFAULT_ORE_HP_PER_LIFE;
                this.setOreAt(e.col, e.row, {
                    lives: e.lives,
                    hpPerLife: hpPL,
                    spiritPerLife: e.spiritPerLife,
                    minerIntervalSec: e.minerIntervalSec,
                    minerSpiritPerTick: e.minerSpiritPerTick
                });
            } else if (e.kind === 'miner') {
                this.setMinerAt(e.col, e.row, {
                    minerIntervalSec: e.intervalSec,
                    minerSpiritPerTick: e.spiritPerTick
                });
            }
        }
    }

    /**
     * 当前出怪口列表（按编号 0..n-1），供波次配置与生成使用
     * @returns {Array<{col:number,row:number}>}
     */
    getSpawnPointsOrdered() {
        return this._spawnPointsList.map(p => ({ col: p.col, row: p.row }));
    }

    /**
     * 根据波次中的 spawnIndex 解析出生屏幕坐标；无出怪口或索引无效时返回 null（由调用方用随机边）
     * @param {number|null|undefined} spawnIndex - 0..n-1 指定口；null/undefined 表示在已有出怪口中随机
     * @returns {{x:number,y:number}|null}
     */
    resolveSpawnScreenPosition(spawnIndex) {
        this.calculateCellSize();
        const list = this._spawnPointsList;
        if (!list.length) return null;
        let idx;
        if (spawnIndex == null || spawnIndex === '') {
            idx = Math.floor(Math.random() * list.length);
        } else {
            idx = Math.floor(Number(spawnIndex));
            if (Number.isNaN(idx) || idx < 0) {
                idx = Math.floor(Math.random() * list.length);
            } else if (idx >= list.length) {
                idx = list.length - 1;
            }
        }
        const p = list[idx];
        if (!this.isValidCell(p.col, p.row)) return null;
        return this.gridToScreen(p.col, p.row);
    }

    /**
     * 寻路用：可走格（仅石块不可走；目标格始终视为可走以便抵达塔/基地中心格）
     * @param {number} goalCol
     * @param {number} goalRow
     */
    isWalkableForGridPath(col, row, goalCol, goalRow) {
        if (!this.isValidCell(col, row)) return false;
        if (col === goalCol && row === goalRow) return true;
        return this.grid[row][col].type !== this.CELL_TYPES.STONE;
    }

    /**
     * 对角线一步是否允许：石块附近禁止斜走——斜向移动要求与拐角相邻的两格正交邻格**均可走**
     * （任一侧为石块则只能先横/竖绕行，避免贴石斜走被卡住）
     * @param {number} c 当前格列
     * @param {number} r 当前格行
     * @param {number} nc 目标格列
     * @param {number} nr 目标格行
     */
    isDiagonalStepAllowed(c, r, nc, nr, goalCol, goalRow) {
        const dc = nc - c;
        const dr = nr - r;
        if (Math.abs(dc) !== 1 || Math.abs(dr) !== 1) {
            return true;
        }
        const o1 = this.isWalkableForGridPath(c + dc, r, goalCol, goalRow);
        const o2 = this.isWalkableForGridPath(c, r + dr, goalCol, goalRow);
        return o1 && o2;
    }

    /**
     * 八连通 BFS（含对角线；对角步受 isDiagonalStepAllowed 限制），每步代价相同，步数最少即最短路径
     * @returns {Array<{col:number,row:number}>|null}
     */
    findPathBFS(startCol, startRow, goalCol, goalRow) {
        if (!this.isValidCell(goalCol, goalRow)) return null;
        if (!this.isWalkableForGridPath(startCol, startRow, goalCol, goalRow)) return null;
        if (!this.isWalkableForGridPath(goalCol, goalRow, goalCol, goalRow)) return null;
        if (startCol === goalCol && startRow === goalRow) {
            return [{ col: startCol, row: startRow }];
        }

        const key = (c, r) => `${c},${r}`;
        const q = [[startCol, startRow]];
        const visited = new Set([key(startCol, startRow)]);
        const parent = new Map();
        parent.set(key(startCol, startRow), null);

        const dirs = [
            [1, 0], [-1, 0], [0, 1], [0, -1],
            [1, 1], [1, -1], [-1, 1], [-1, -1]
        ];
        let qi = 0;
        while (qi < q.length) {
            const c = q[qi][0];
            const r = q[qi][1];
            qi++;
            if (c === goalCol && r === goalRow) {
                const path = [];
                let cur = key(c, r);
                while (cur != null) {
                    const parts = cur.split(',');
                    path.push({ col: Number(parts[0]), row: Number(parts[1]) });
                    cur = parent.get(cur);
                }
                path.reverse();
                return path;
            }
            for (let d = 0; d < dirs.length; d++) {
                const nc = c + dirs[d][0];
                const nr = r + dirs[d][1];
                if (!this.isWalkableForGridPath(nc, nr, goalCol, goalRow)) continue;
                if (!this.isDiagonalStepAllowed(c, r, nc, nr, goalCol, goalRow)) continue;
                const nk = key(nc, nr);
                if (visited.has(nk)) continue;
                visited.add(nk);
                parent.set(nk, key(c, r));
                q.push([nc, nr]);
            }
        }
        return null;
    }

    /**
     * 到基地 2×2 的最短路径：在四个基地格中选路径步数最少者
     * @returns {Array<{col:number,row:number}>|null}
     */
    findPathToBase(startCol, startRow) {
        let best = null;
        let bestLen = Infinity;
        for (let dr = 0; dr < this.baseRows; dr++) {
            for (let dc = 0; dc < this.baseCols; dc++) {
                const gc = this.baseAnchorCol + dc;
                const gr = this.baseAnchorRow + dr;
                const p = this.findPathBFS(startCol, startRow, gc, gr);
                if (p && p.length < bestLen) {
                    bestLen = p.length;
                    best = p;
                }
            }
        }
        return best;
    }

    /**
     * 写入基地 2×2（不校验时请外部保证安全）
     * @param {number} anchorCol
     * @param {number} anchorRow
     * @param {boolean} persist - 是否写入 localStorage
     * @returns {boolean}
     */
    applyBaseAnchor(anchorCol, anchorRow, persist) {
        this.baseCols = 2;
        this.baseRows = 2;
        if (!this.canPlaceBaseAt(anchorCol, anchorRow)) {
            return false;
        }
        this.clearBaseCellsFromGrid();
        // 基地覆盖区域内的出怪口从列表移除（编号会变化，需保存）
        this._spawnPointsList = this._spawnPointsList.filter(p =>
            !(p.col >= anchorCol && p.col < anchorCol + this.baseCols &&
              p.row >= anchorRow && p.row < anchorRow + this.baseRows)
        );
        // 仅在玩家保存基地时持久化出怪口列表；初始化 initBaseArea(persist=false) 时不能写盘，否则会清空尚未加载的出怪口存档
        if (persist) {
            this.saveSpawnsToStorage();
        }
        this.baseAnchorCol = anchorCol;
        this.baseAnchorRow = anchorRow;
        for (let dr = 0; dr < this.baseRows; dr++) {
            for (let dc = 0; dc < this.baseCols; dc++) {
                const col = anchorCol + dc;
                const row = anchorRow + dr;
                this.grid[row][col].type = this.CELL_TYPES.BASE;
            }
        }
        if (persist) {
            try {
                localStorage.setItem(GameMap.BASE_ANCHOR_STORAGE_KEY, JSON.stringify({
                    anchorCol,
                    anchorRow
                }));
            } catch (e) {
                console.warn('保存基地位置失败', e);
            }
        }
        return true;
    }

    /**
     * 玩家手动设置基地（与 initBaseArea 共用逻辑）
     * @param {number} anchorCol - 2×2 左上角列
     * @param {number} anchorRow - 2×2 左上角行
     * @param {boolean} [persist=true]
     */
    setBaseAnchor(anchorCol, anchorRow, persist = true) {
        return this.applyBaseAnchor(anchorCol, anchorRow, persist !== false);
    }

    /**
     * 基地中心点（屏幕坐标），供敌人寻路瞄准
     * @returns {{ x: number, y: number }}
     */
    getBaseCenterScreen() {
        this.calculateCellSize();
        const x0 = this.mapOffsetX + this.baseAnchorCol * this.cellWidth;
        const y0 = this.mapOffsetY + this.baseAnchorRow * this.cellHeight;
        return {
            x: x0 + (this.cellWidth * this.baseCols) / 2,
            y: y0 + (this.cellHeight * this.baseRows) / 2
        };
    }

    /**
     * 基地「近战接敌」半径（像素）：基地矩形中心到最近边的距离，用于敌人贴脸停步与环形站位（与塔缘逻辑一致）
     * @returns {number}
     */
    getBaseMeleeRadius() {
        this.calculateCellSize();
        const halfW = (this.cellWidth * this.baseCols) / 2;
        const halfH = (this.cellHeight * this.baseRows) / 2;
        return Math.min(halfW, halfH);
    }

    /**
     * 点是否在基地矩形区域（屏幕坐标）
     */
    isPointInBaseArea(x, y) {
        this.calculateCellSize();
        const x0 = this.mapOffsetX + this.baseAnchorCol * this.cellWidth;
        const y0 = this.mapOffsetY + this.baseAnchorRow * this.cellHeight;
        const x1 = x0 + this.cellWidth * this.baseCols;
        const y1 = y0 + this.cellHeight * this.baseRows;
        return x >= x0 && x <= x1 && y >= y0 && y <= y1;
    }

    /**
     * 在地图外缘随机取一点作为敌人生成（避免落在基地内）
     * @returns {{ x: number, y: number }}
     */
    getRandomSpawnOnMapEdge() {
        this.calculateCellSize();
        const left = this.mapOffsetX;
        const right = this.mapOffsetX + this.mapWidth;
        const top = this.mapOffsetY;
        const bottom = this.mapOffsetY + this.mapHeight;
        for (let attempt = 0; attempt < 50; attempt++) {
            const side = Math.floor(Math.random() * 4);
            let x;
            let y;
            if (side === 0) {
                x = left + Math.random() * this.mapWidth;
                y = top;
            } else if (side === 1) {
                x = right;
                y = top + Math.random() * this.mapHeight;
            } else if (side === 2) {
                x = left + Math.random() * this.mapWidth;
                y = bottom;
            } else {
                x = left;
                y = top + Math.random() * this.mapHeight;
            }
            if (this.isPointInBaseArea(x, y)) {
                continue;
            }
            const g = this.screenToGrid(x, y);
            if (g && this.isCellBlockedForEnemy(g.col, g.row)) {
                continue;
            }
            return { x, y };
        }
        return { x: right, y: top + this.mapHeight * 0.2 };
    }
    
    /**
     * 检查格子坐标是否有效
     * @param {number} col - 列
     * @param {number} row - 行
     * @returns {boolean}
     */
    isValidCell(col, row) {
        return col >= 0 && col < this.gridCols && 
               row >= 0 && row < this.gridRows;
    }
    
    /**
     * 计算格子尺寸（尽可能接近正方形）
     */
    calculateCellSize() {
        const padding = 20; // 内边距
        const availableWidth = this.canvas.width - padding * 2;
        const availableHeight = this.canvas.height - padding * 2;
        
        // 计算理想的格子尺寸（基于可用空间和网格大小）
        const idealWidth = availableWidth / this.gridCols;
        const idealHeight = availableHeight / this.gridRows;
        
        // 选择较小的尺寸，确保格子接近正方形
        const cellSize = Math.floor(Math.min(idealWidth, idealHeight));
        
        // 使用相同的尺寸作为宽度和高度
        this.cellWidth = cellSize;
        this.cellHeight = cellSize;
        
        // 计算实际使用的尺寸（居中显示）
        this.mapWidth = this.cellWidth * this.gridCols;
        this.mapHeight = this.cellHeight * this.gridRows;
        this.mapOffsetX = (this.canvas.width - this.mapWidth) / 2;
        this.mapOffsetY = (this.canvas.height - this.mapHeight) / 2;
    }
    
    /**
     * 将屏幕坐标转换为网格坐标
     * @param {number} x - 屏幕X坐标
     * @param {number} y - 屏幕Y坐标
     * @returns {Object|null} - {col, row} 或 null
     */
    screenToGrid(x, y) {
        // 转换为相对于地图的坐标
        const relX = x - this.mapOffsetX;
        const relY = y - this.mapOffsetY;
        
        // 检查是否在地图范围内
        if (relX < 0 || relX >= this.mapWidth || 
            relY < 0 || relY >= this.mapHeight) {
            return null;
        }
        
        const col = Math.floor(relX / this.cellWidth);
        const row = Math.floor(relY / this.cellHeight);
        
        if (this.isValidCell(col, row)) {
            return { col, row };
        }
        
        return null;
    }
    
    /**
     * 将网格坐标转换为屏幕坐标（格子中心点）
     * @param {number} col - 列
     * @param {number} row - 行
     * @returns {Object|null} - {x, y} 或 null
     */
    gridToScreen(col, row) {
        if (!this.isValidCell(col, row)) {
            return null;
        }
        
        const x = this.mapOffsetX + col * this.cellWidth + this.cellWidth / 2;
        const y = this.mapOffsetY + row * this.cellHeight + this.cellHeight / 2;
        
        return { x, y };
    }
    
    /**
     * 获取格子类型
     * @param {number} col - 列
     * @param {number} row - 行
     * @returns {string} - 格子类型
     */
    getCellType(col, row) {
        if (!this.isValidCell(col, row)) {
            return this.CELL_TYPES.BLOCKED;
        }
        return this.grid[row][col].type;
    }
    
    /**
     * 检查格子是否可以放置防御塔（仅空地，且未被占用）
     * @param {number} col - 列
     * @param {number} row - 行
     * @returns {boolean}
     */
    canPlaceTower(col, row) {
        if (!this.isValidCell(col, row)) {
            return false;
        }
        
        const cell = this.grid[row][col];
        // 基地格、石块不可放置
        if (cell.type === this.CELL_TYPES.BASE) {
            return false;
        }
        if (cell.type === this.CELL_TYPES.STONE) {
            return false;
        }
        if (cell.type === this.CELL_TYPES.SPAWN) {
            return false;
        }
        if (cell.type === this.CELL_TYPES.ORE || cell.type === this.CELL_TYPES.MINER) {
            return false;
        }
        // 兼容旧存档中可能出现的 'path' 类型：视为可放塔的空地
        const isPlaceableGround =
            cell.type === this.CELL_TYPES.EMPTY || cell.type === 'path';
        const canPlace = isPlaceableGround && !cell.hasTower;
        return canPlace;
    }
    
    /**
     * 在格子上放置防御塔
     * @param {number} col - 列
     * @param {number} row - 行
     * @returns {boolean} - 是否成功放置
     */
    placeTower(col, row) {
        if (!this.canPlaceTower(col, row)) {
            return false;
        }
        
        this.grid[row][col].hasTower = true;
        // 放置后默认未进化；后续进化会由 setTowerEvolutionStage 标记
        this.grid[row][col].evolutionStage = 0;
        return true;
    }
    
    /**
     * 移除格子上的防御塔
     * @param {number} col - 列
     * @param {number} row - 行
     */
    removeTower(col, row) {
        if (this.isValidCell(col, row)) {
            this.grid[row][col].hasTower = false;
            this.grid[row][col].evolutionStage = 0;
        }
    }

    /**
     * 设置塔进化阶段（用于地块颜色表现）
     * @param {number} col
     * @param {number} row
     * @param {number} stage 进化阶段，1/2/...；<=0 表示未进化
     */
    setTowerEvolutionStage(col, row, stage) {
        if (!this.isValidCell(col, row)) return;
        const s = stage != null ? stage : 0;
        this.grid[row][col].evolutionStage = s > 0 ? s : 0;
    }
    
    /**
     * 检查指定格子是否有防御塔
     * @param {number} col - 列
     * @param {number} row - 行
     * @returns {boolean}
     */
    hasTowerAt(col, row) {
        if (!this.isValidCell(col, row)) return false;
        return !!this.grid[row][col].hasTower;
    }
    
    /**
     * 历史接口：曾返回路径格子列表；当前无路径系统，恒为空数组
     * @returns {Array<{col: number, row: number}>}
     */
    getPathGridCells() {
        return [];
    }
    
    /**
     * 绑定事件
     */
    bindEvents() {
        // 鼠标移动事件（用于高亮悬停的格子）
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const gridPos = this.screenToGrid(x, y);
            this.hoverCell = gridPos;
        });
        
        // 鼠标离开Canvas时清除悬停
        this.canvas.addEventListener('mouseleave', () => {
            this.hoverCell = null;
        });
    }
    
    /**
     * 渲染地图
     */
    render() {
        // 重新计算格子尺寸（防止Canvas尺寸改变）
        this.calculateCellSize();
        
        // 绘制所有格子
        for (let row = 0; row < this.gridRows; row++) {
            for (let col = 0; col < this.gridCols; col++) {
                this.drawCell(col, row);
            }
        }
        
        // 绘制网格线
        this.drawGridLines();
        
        // 绘制悬停高亮
        if (this.hoverCell) {
            this.drawHoverHighlight(this.hoverCell.col, this.hoverCell.row);
        }
    }
    
    /**
     * 绘制单个格子
     * @param {number} col - 列
     * @param {number} row - 行
     */
    drawCell(col, row) {
        const cell = this.grid[row][col];
        const x = this.mapOffsetX + col * this.cellWidth;
        const y = this.mapOffsetY + row * this.cellHeight;
        
        // 根据格子类型选择颜色
        let color = this.COLORS.EMPTY;
        switch (cell.type) {
            case this.CELL_TYPES.BLOCKED:
                color = this.COLORS.BLOCKED;
                break;
            case this.CELL_TYPES.BASE:
                color = this.COLORS.BASE;
                break;
            case this.CELL_TYPES.STONE:
                color = this.COLORS.STONE;
                break;
            case this.CELL_TYPES.SPAWN:
                color = this.COLORS.SPAWN;
                break;
            case this.CELL_TYPES.ORE:
                color = this.COLORS.ORE;
                break;
            case this.CELL_TYPES.MINER:
                color = this.COLORS.MINER;
                break;
            case 'path':
                // 旧版存档中可能残留 path 类型，按空地显示
                color = this.COLORS.EMPTY;
                break;
            default:
                color = this.COLORS.EMPTY;
        }
        
        // 绘制格子背景
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, this.cellWidth, this.cellHeight);

        // 出怪口：边框 + 编号（与 _spawnPointsList 下标一致）
        if (cell.type === this.CELL_TYPES.SPAWN) {
            this.ctx.save();
            this.ctx.strokeStyle = 'rgba(236, 240, 241, 0.65)';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x + 2, y + 2, this.cellWidth - 4, this.cellHeight - 4);
            this.ctx.lineWidth = 1;
            const idx = this._spawnPointsList.findIndex(p => p.col === col && p.row === row);
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
            this.ctx.font = `bold ${Math.max(10, Math.floor(this.cellWidth * 0.32))}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            const cx = x + this.cellWidth / 2;
            const cy = y + this.cellHeight / 2;
            this.ctx.fillText(idx >= 0 ? String(idx) : '?', cx, cy - this.cellHeight * 0.12);
            // 休整期下一波倒计时：大号画在格内下半部分，与编号错开（波次间隔时无怪遮挡）
            if (this.spawnNextWaveCountdownSec != null && this.spawnNextWaveCountdownSec >= 0) {
                const sec = this.spawnNextWaveCountdownSec;
                const fs2 = Math.max(11, Math.floor(this.cellWidth * 0.26));
                const txt = sec <= 0 ? '即将' : `${sec}s`;
                this.ctx.font = `bold ${fs2}px Arial`;
                const tw = this.ctx.measureText(txt).width + 8;
                const th = fs2 + 4;
                const bx = cx - tw / 2;
                const by = y + this.cellHeight - th - 3;
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
                this.ctx.fillRect(bx, by, tw, th);
                this.ctx.strokeStyle = '#f1c40f';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(bx, by, tw, th);
                this.ctx.fillStyle = '#fff9e6';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(txt, cx, by + th / 2);
            }
            this.ctx.restore();
        }

        // 石块：斜线纹理便于与空地区分
        if (cell.type === this.CELL_TYPES.STONE) {
            this.ctx.strokeStyle = 'rgba(44, 62, 80, 0.35)';
            this.ctx.lineWidth = 1;
            const step = 6;
            for (let i = -this.cellHeight; i < this.cellWidth + this.cellHeight; i += step) {
                this.ctx.beginPath();
                this.ctx.moveTo(x + i, y);
                this.ctx.lineTo(x + i + this.cellHeight, y + this.cellHeight);
                this.ctx.stroke();
            }
        }

        // 矿石：剩余条命 + 当前命血量（每条命 HP 相同）
        if (cell.type === this.CELL_TYPES.ORE) {
            this.ctx.save();
            this.ctx.strokeStyle = 'rgba(241, 196, 15, 0.85)';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x + 2, y + 2, this.cellWidth - 4, this.cellHeight - 4);
            const hpMax = Math.max(1, cell.oreHpPerLife | 0);
            const curHp = cell.oreCurrentLifeHp != null ? Math.max(0, cell.oreCurrentLifeHp | 0) : hpMax;
            const fs = Math.max(9, Math.floor(this.cellWidth * 0.24));
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
            this.ctx.font = `bold ${fs}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            const cx = x + this.cellWidth / 2;
            const cy = y + this.cellHeight / 2;
            this.ctx.fillText(`矿 ${Math.max(0, cell.oreLives | 0)}命`, cx, cy - fs * 0.45);
            this.ctx.font = `${Math.max(8, fs - 1)}px Arial`;
            this.ctx.fillStyle = 'rgba(236, 240, 241, 0.85)';
            this.ctx.fillText(`HP ${curHp}/${hpMax}`, cx, cy + fs * 0.5);
            this.ctx.restore();
        }

        // 矿机：标注「机」与周期产灵（简要）
        if (cell.type === this.CELL_TYPES.MINER) {
            this.ctx.save();
            this.ctx.strokeStyle = 'rgba(46, 204, 113, 0.75)';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x + 2, y + 2, this.cellWidth - 4, this.cellHeight - 4);
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            const fs = Math.max(9, Math.floor(this.cellWidth * 0.22));
            this.ctx.font = `${fs}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            const cx = x + this.cellWidth / 2;
            const cy = y + this.cellHeight / 2 - 4;
            this.ctx.fillText('矿机', cx, cy);
            const iv = cell.minerIntervalSec != null ? Number(cell.minerIntervalSec) : 3;
            const tk = cell.minerSpiritPerTick != null ? Number(cell.minerSpiritPerTick) : 1;
            this.ctx.font = `${Math.max(8, fs - 2)}px Arial`;
            this.ctx.fillStyle = 'rgba(236, 240, 241, 0.85)';
            this.ctx.fillText(`${iv}s→+${tk}`, cx, cy + fs * 0.9);
            this.ctx.restore();
        }

        // 绘制塔进化标记：在塔所在格叠加颜色
        if (cell.hasTower && (cell.evolutionStage || 0) > 0) {
            const stage = cell.evolutionStage;
            const fill =
                stage === 1 ? 'rgba(155, 89, 182, 0.35)' :
                stage >= 2 ? 'rgba(241, 196, 15, 0.35)' :
                'rgba(155, 89, 182, 0.35)';
            const stroke =
                stage === 1 ? 'rgba(155, 89, 182, 0.75)' :
                stage >= 2 ? 'rgba(241, 196, 15, 0.85)' :
                'rgba(155, 89, 182, 0.75)';
            this.ctx.fillStyle = fill;
            this.ctx.fillRect(x, y, this.cellWidth, this.cellHeight);
            this.ctx.strokeStyle = stroke;
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x + 1, y + 1, this.cellWidth - 2, this.cellHeight - 2);
            this.ctx.lineWidth = 1;
        }
    }
    
    /**
     * 绘制网格线
     */
    drawGridLines() {
        this.ctx.strokeStyle = this.COLORS.GRID_LINE;
        this.ctx.lineWidth = 1;
        
        // 绘制垂直线
        for (let col = 0; col <= this.gridCols; col++) {
            const x = this.mapOffsetX + col * this.cellWidth;
            this.ctx.beginPath();
            this.ctx.moveTo(x, this.mapOffsetY);
            this.ctx.lineTo(x, this.mapOffsetY + this.mapHeight);
            this.ctx.stroke();
        }
        
        // 绘制水平线
        for (let row = 0; row <= this.gridRows; row++) {
            const y = this.mapOffsetY + row * this.cellHeight;
            this.ctx.beginPath();
            this.ctx.moveTo(this.mapOffsetX, y);
            this.ctx.lineTo(this.mapOffsetX + this.mapWidth, y);
            this.ctx.stroke();
        }
    }
    
    /**
     * 绘制悬停高亮
     * @param {number} col - 列
     * @param {number} row - 行
     */
    drawHoverHighlight(col, row) {
        const x = this.mapOffsetX + col * this.cellWidth;
        const y = this.mapOffsetY + row * this.cellHeight;
        
        this.ctx.fillStyle = this.COLORS.HOVER;
        this.ctx.fillRect(x, y, this.cellWidth, this.cellHeight);
    }
    
    /**
     * 根据中心格和“半径”获取攻击范围内的所有格子，支持多种范围形状
     * @param {number} col - 中心格列
     * @param {number} row - 中心格行
     * @param {number} rangeGrid - 半径（格子数），1 表示 3*3（方形时）
     * @param {string} [rangeShape='square'] - 范围形状：'square' 方形围一圈，'line' I型一条线，'rectangle' 长方形半包围
     * @param {string|null} [rangeDirection=null] - 方向：line 时为 'horizontal'|'vertical'；rectangle 时为 'n'|'s'|'e'|'w'（开口方向）
     * @returns {Array} - [{col, row}, ...]，仅包含有效格子
     */
    getRangeCells(col, row, rangeGrid = 1, rangeShape = 'square', rangeDirection = null) {
        const g = Math.max(0, Math.floor(rangeGrid));
        const cells = [];
        if (rangeShape === 'line') {
            // I型：一条线，长度 2*g+1
            if (rangeDirection === 'vertical') {
                for (let r = row - g; r <= row + g; r++) {
                    if (this.isValidCell(col, r)) cells.push({ col, row: r });
                }
            } else {
                for (let c = col - g; c <= col + g; c++) {
                    if (this.isValidCell(c, row)) cells.push({ col: c, row });
                }
            }
            return cells;
        }
        if (rangeShape === 'rectangle') {
            // 长方形半包围：开口方向为 rangeDirection，覆盖其余三边
            const n = row - g, s = row + g, w = col - g, e = col + g;
            if (rangeDirection === 'n') {
                for (let r = row; r <= s; r++) {
                    for (let c = w; c <= e; c++) {
                        if (this.isValidCell(c, r)) cells.push({ col: c, row: r });
                    }
                }
            } else if (rangeDirection === 's') {
                for (let r = n; r <= row; r++) {
                    for (let c = w; c <= e; c++) {
                        if (this.isValidCell(c, r)) cells.push({ col: c, row: r });
                    }
                }
            } else if (rangeDirection === 'e') {
                for (let c = w; c <= col; c++) {
                    for (let r = n; r <= s; r++) {
                        if (this.isValidCell(c, r)) cells.push({ col: c, row: r });
                    }
                }
            } else {
                for (let c = col; c <= e; c++) {
                    for (let r = n; r <= s; r++) {
                        if (this.isValidCell(c, r)) cells.push({ col: c, row: r });
                    }
                }
            }
            return cells;
        }
        // 方形（默认）：围一圈
        for (let r = row - g; r <= row + g; r++) {
            for (let c = col - g; c <= col + g; c++) {
                if (this.isValidCell(c, r)) cells.push({ col: c, row: r });
            }
        }
        return cells;
    }
    
    /**
     * 在指定格子上绘制范围高亮（用于攻击范围显示）
     * @param {Array} cells - 格子数组 [{col, row}, ...]
     * @param {string} fillStyle - 填充色（如半透明）
     * @param {string} [strokeStyle] - 可选边框色
     */
    drawRangeHighlight(cells, fillStyle, strokeStyle) {
        if (!cells || cells.length === 0) return;
        this.ctx.fillStyle = fillStyle;
        if (strokeStyle) this.ctx.strokeStyle = strokeStyle;
        const lineW = this.ctx.lineWidth || 1;
        if (strokeStyle) this.ctx.lineWidth = 2;
        
        cells.forEach(({ col, row }) => {
            const x = this.mapOffsetX + col * this.cellWidth;
            const y = this.mapOffsetY + row * this.cellHeight;
            this.ctx.fillRect(x, y, this.cellWidth, this.cellHeight);
            if (strokeStyle) {
                this.ctx.strokeRect(x, y, this.cellWidth, this.cellHeight);
            }
        });
        
        this.ctx.lineWidth = lineW;
    }
    
    /**
     * 更新网格大小
     * @param {number} cols - 新的列数
     * @param {number} rows - 新的行数
     */
    resizeGrid(cols, rows) {
        this.gridCols = cols;
        this.gridRows = rows;
        
        // 重新初始化
        this.initGrid();
        this.initBaseArea();
        this.applySavedStones();
        this.applySavedSpawns();
        this.applySavedOreMiners();
        this.calculateCellSize();
        
        console.log(`网格大小已更新为 ${cols}x${rows}`);
    }
    
    /**
     * 历史接口：曾返回蛇形路径上的屏幕点序列；敌人已改为直线进攻基地，恒返回空数组
     * @returns {Array<{x:number,y:number}>}
     */
    getPathPoints() {
        return [];
    }
    
    /**
     * 历史接口：调试用路径起终点；无路径时返回 null
     * @returns {{start:{x:number,y:number},end:{x:number,y:number}}|null}
     */
    getPathStartEnd() {
        return null;
    }
}

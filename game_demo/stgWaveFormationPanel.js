/**
 * 波次阵型编辑器（唯一波次配置入口）：上/左/右 三块与 STG 同格数棋盘；
 * 种类与数量仅由格子决定；存档键 tower_defense_wave_config（历史键名保留）。
 * 支持多章节：存档为 { version:2, chapters:[{ waves, upgradeMomentsAfterWave }], ... }；旧档仅 waves 时视为单章。
 */
(function () {
    'use strict';

    const WAVE_STORAGE_KEY = 'tower_defense_wave_config';

    /** 与 stgMode normalizeWaveDataEnemyHpScale 数值范围一致：倍率 = base + k*linear + k²*accel */
    const DEFAULT_ENEMY_HP_SCALE = { baseMult: 1, linearPerWave: 0, accelPerWaveSq: 0 };

    /** 与 stgMode getStgEnemyHpMultiplierForWaveIndex 一致：默认 1，范围 0.05～500 */
    function normalizeWaveEnemyHpMult(raw) {
        if (raw == null || raw === '') return 1;
        const n = Number(raw);
        if (!Number.isFinite(n)) return 1;
        return Math.max(0.05, Math.min(500, n));
    }

    function normalizeEnemyHpScale(raw) {
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

    /** @type {{ baseMult: number, linearPerWave: number, accelPerWaveSq: number }} */
    let enemyHpScaleBuffer = { ...DEFAULT_ENEMY_HP_SCALE };
    /** @type {number|null} 停火行号（主棋盘从上往下 1..rows）；null=不启用 */
    let enemyFireStopRowBuffer = null;

    let panelEl = null;
    /** @type {HTMLElement|null} */
    let waveLegendEl = null;
    /** 内存中的完整文档（含多章），与 localStorage 结构一致 */
    let fullDoc = null;
    /** 当前编辑的章节下标（0 起） */
    let currentChapterIndex = 0;
    let chapterSelectEl = null;
    let waveSelectEl = null;
    let brushSelectEl = null;
    /** 摆放敌人：仅上/左/右（主棋盘不出怪）；摆放信标：上/左/右/主 四块均可 */
    let placementMode = 'enemy';
    let spawnIntervalInp = null;
    let spiritRewardInp = null;
    let nextDelayInp = null;
    let waveEnemyHpMultInp = null;
    let hpBaseMultInp = null;
    let hpLinearInp = null;
    let hpAccelInp = null;
    let enemyFireStopRowInp = null;
    /** 升级四选一结束后延迟多少秒再刷下一波（根级存档，与 stgMode getStgPostUpgradeSpawnDelaySec 对应） */
    let postUpgradeDelayInp = null;
    let upgradeMomentsInp = null;
    let grids = { top: null, left: null, right: null };
    /** @type {Array<{top:string[][],left:string[][],right:string[][]}>} */
    let formationBuffers = [];
    /** @type {Array<{ spawnInterval: number, spiritReward: number, nextWaveDelaySec: number, enemyHpMult: number }>} */
    let waveMetaBuffers = [];
    let currentWaveIndex = 0;
    let cols = 16;
    let rows = 21;

    /** 拖动笔刷：左键按住划过多格 */
    let dragPainting = false;
    let dragLastKey = '';
    let dragBrush = '';

    function getGridSize() {
        if (window.__STG_GRID__ && window.__STG_GRID__.cols && window.__STG_GRID__.rows) {
            return { cols: window.__STG_GRID__.cols, rows: window.__STG_GRID__.rows };
        }
        if (window.StgMode && typeof window.StgMode.getGridDimensions === 'function') {
            return window.StgMode.getGridDimensions();
        }
        return { cols: 16, rows: 21 };
    }

    /**
     * 将磁盘/旧档 JSON 归一化为多章节结构（含 version:2）。
     * @param {object|null} data
     */
    function normalizeFullWaveConfigFromRaw(data) {
        const empty = () => ({
            version: 2,
            chapters: [{ waves: [], upgradeMomentsAfterWave: undefined }],
            enemyHpScale: { ...DEFAULT_ENEMY_HP_SCALE },
            enemyFireStopRow: null
        });
        if (!data || typeof data !== 'object') return empty();
        const g = getGridSize();
        const maxR = g.rows || 21;
        const enemyHpScale = normalizeEnemyHpScale(data.enemyHpScale);
        const enemyFireStopRow = normalizeEnemyFireStopRow(data.enemyFireStopRow, maxR, data.enemyFireStopLineY);
        const pud =
            data.postUpgradeSpawnDelaySec != null && Number.isFinite(Number(data.postUpgradeSpawnDelaySec))
                ? Math.max(0, Math.min(60, Number(data.postUpgradeSpawnDelaySec)))
                : undefined;

        if (Array.isArray(data.chapters) && data.chapters.length > 0) {
            const chapters = data.chapters.map((ch) => {
                const wavesRaw = ch && Array.isArray(ch.waves) ? ch.waves : [];
                const waves = wavesRaw.map((w) => migrateEnemiesToFormation({ ...w }));
                return {
                    waves,
                    upgradeMomentsAfterWave: ch && ch.upgradeMomentsAfterWave !== undefined ? ch.upgradeMomentsAfterWave : undefined
                };
            });
            return { version: 2, chapters, enemyHpScale, enemyFireStopRow, postUpgradeSpawnDelaySec: pud };
        }
        const wavesLegacy = Array.isArray(data.waves) ? data.waves.map((w) => migrateEnemiesToFormation({ ...w })) : [];
        return {
            version: 2,
            chapters: [
                {
                    waves: wavesLegacy,
                    upgradeMomentsAfterWave: data.upgradeMomentsAfterWave !== undefined ? data.upgradeMomentsAfterWave : undefined
                }
            ],
            enemyHpScale,
            enemyFireStopRow,
            postUpgradeSpawnDelaySec: pud
        };
    }

    /** 读取完整配置（多章节 + 全局字段） */
    function loadWaveConfigFromStorage() {
        try {
            const raw = localStorage.getItem(WAVE_STORAGE_KEY);
            if (!raw) {
                return normalizeFullWaveConfigFromRaw(null);
            }
            const data = JSON.parse(raw);
            return normalizeFullWaveConfigFromRaw(data);
        } catch (e) {
            return normalizeFullWaveConfigFromRaw(null);
        }
    }

    /**
     * @param {number|null|undefined} rawRow
     * @param {number} maxRow
     * @param {number|null|undefined} legacyLineY 旧版像素线，仅当无行号时用于估算
     */
    function normalizeEnemyFireStopRow(rawRow, maxRow, legacyLineY) {
        const mr = Math.max(1, Math.min(64, maxRow | 0));
        if (rawRow !== '' && rawRow != null) {
            const n = parseInt(Number(rawRow), 10);
            if (Number.isFinite(n) && n >= 1 && n <= mr) return n;
        }
        if (legacyLineY != null && Number.isFinite(Number(legacyLineY))) {
            const csEst = 45;
            const r = Math.round(Number(legacyLineY) / csEst);
            return Math.max(1, Math.min(mr, r));
        }
        return null;
    }

    /**
     * 构建与 localStorage / waveConfig.json 一致的根对象（version:2），供保存与导出共用。
     * @param {object} full 归一化后的 fullDoc
     * @returns {object|null}
     */
    function buildWaveStoragePayload(full) {
        if (!full || !Array.isArray(full.chapters)) return null;
        const g = getGridSize();
        const mr = g.rows || 21;
        const payload = {
            version: 2,
            chapters: full.chapters.map((ch) => ({
                waves: ch && Array.isArray(ch.waves) ? ch.waves : [],
                upgradeMomentsAfterWave: Array.isArray(ch && ch.upgradeMomentsAfterWave) ? ch.upgradeMomentsAfterWave : []
            })),
            enemyHpScale: normalizeEnemyHpScale(full.enemyHpScale),
            enemyFireStopRow: normalizeEnemyFireStopRow(full.enemyFireStopRow, mr, null)
        };
        if (full.postUpgradeSpawnDelaySec != null && Number.isFinite(Number(full.postUpgradeSpawnDelaySec))) {
            payload.postUpgradeSpawnDelaySec = Math.max(0, Math.min(60, Number(full.postUpgradeSpawnDelaySec)));
        }
        return payload;
    }

    /**
     * 写入完整多章节存档（version:2）。
     * @param {object} full 归一化后的 fullDoc
     */
    function saveFullWaveConfigToStorage(full) {
        try {
            const payload = buildWaveStoragePayload(full);
            if (!payload) return;
            localStorage.setItem(WAVE_STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.warn('[阵型] 保存失败', e);
        }
    }

    /** 下载 waveConfig.json：覆盖到 game_demo 后打包，他人无你本机 localStorage 也能对齐波次 */
    function downloadWaveConfigJsonForSharing() {
        persistCurrentChapterToDoc();
        fullDoc = fullDoc || loadWaveConfigFromStorage();
        const payload = buildWaveStoragePayload(fullDoc);
        if (!payload) {
            alert('无有效波次数据');
            return;
        }
        try {
            const text = JSON.stringify(payload, null, 2);
            const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'waveConfig.json';
            a.click();
            URL.revokeObjectURL(a.href);
            console.log('[阵型] 已下载 waveConfig.json，请覆盖 game_demo/waveConfig.json 后再压缩分享');
        } catch (e) {
            console.warn('[阵型] 导出失败', e);
        }
    }

    /** 解析「第几波结束后」：逗号/分号/空白分隔，返回 ≥1 的整数列表 */
    function parseUpgradeMomentsFromInput(str) {
        const s = String(str || '').trim();
        if (s === '') return [];
        return s
            .split(/[,，;；\s]+/)
            .map((x) => parseInt(String(x).trim(), 10))
            .filter((n) => Number.isFinite(n) && n >= 1);
    }

    function createEmptyFormation() {
        const mk = () => {
            const g = [];
            for (let r = 0; r < rows; r++) {
                g[r] = [];
                for (let c = 0; c < cols; c++) g[r][c] = '';
            }
            return g;
        };
        return { top: mk(), left: mk(), right: mk(), main: mk() };
    }

    /** 主棋盘单格：仅允许单个信标 id 或空 */
    function normalizeMainCell(raw) {
        if (raw == null || String(raw).trim() === '') return '';
        const t = String(raw).trim();
        if (window.StgMode && typeof window.StgMode.isFormationBeaconToken === 'function') {
            if (window.StgMode.isFormationBeaconToken(t)) return t;
        } else if (t.startsWith('__beacon_')) {
            return t;
        }
        return '';
    }

    /** 扩展格混合格：拆成「非信标」与「信标」两段，供合并笔刷与清空按钮使用 */
    function splitExtensionCellParts(raw) {
        const parts = String(raw || '')
            .split('|')
            .map((x) => x.trim())
            .filter(Boolean);
        const beacons = parts.filter((p) => isFormationBeaconTokenPart(p));
        const enemies = parts.filter((p) => !isFormationBeaconTokenPart(p));
        return { enemies, beacons };
    }

    function isFormationBeaconTokenPart(s) {
        if (window.StgMode && typeof window.StgMode.isFormationBeaconToken === 'function') {
            return window.StgMode.isFormationBeaconToken(s);
        }
        return s != null && String(s).startsWith('__beacon_');
    }

    /** 新插入波次的默认节奏与血量倍率（空三棋盘，由用户再摆怪） */
    function defaultNewWaveMeta() {
        return { spawnInterval: 400, spiritReward: 10, nextWaveDelaySec: 15, enemyHpMult: 1 };
    }

    function normalizeFormation(f) {
        const out = createEmptyFormation();
        if (!f || typeof f !== 'object') return out;
        /** 扩展格：可与主棋盘一样放置信标；支持 type|type 或 type|__beacon_a1 等混合格（出兵仍只读非信标段） */
        ['top', 'left', 'right'].forEach((k) => {
            const src = f[k];
            if (!src || !Array.isArray(src)) return;
            for (let r = 0; r < rows; r++) {
                if (!src[r] || !Array.isArray(src[r])) continue;
                for (let c = 0; c < cols; c++) {
                    const v = src[r][c];
                    if (v != null && String(v).trim() !== '') {
                        out[k][r][c] = String(v).trim();
                    }
                }
            }
        });
        const srcM = f.main;
        if (srcM && Array.isArray(srcM)) {
            for (let r = 0; r < rows; r++) {
                if (!srcM[r] || !Array.isArray(srcM[r])) continue;
                for (let c = 0; c < cols; c++) {
                    const v = srcM[r][c];
                    out.main[r][c] = normalizeMainCell(v);
                }
            }
        }
        return out;
    }

    /** 与 stgMode.flattenFormationToSpawnList 遍历顺序一致 */
    function flattenFormationToSpawnList(f) {
        const list = [];
        if (!f || typeof f !== 'object') return list;

        function isBeaconToken(id) {
            if (window.StgMode && typeof window.StgMode.isFormationBeaconToken === 'function') {
                return window.StgMode.isFormationBeaconToken(id);
            }
            return id != null && String(id).startsWith('__beacon_');
        }

        function pushParts(cell, edge, c, r) {
            if (cell == null || String(cell).trim() === '') return;
            const parts = String(cell)
                .split('|')
                .map((s) => s.trim())
                .filter(Boolean);
            parts.forEach((typeId) => {
                if (isBeaconToken(typeId)) return;
                list.push({ typeId, edge, col: c, row: r });
            });
        }

        const topGrid = f.top;
        if (topGrid && Array.isArray(topGrid)) {
            for (let r = 0; r < rows; r++) {
                const row = topGrid[r];
                if (!row || !Array.isArray(row)) continue;
                for (let c = 0; c < cols; c++) {
                    pushParts(row[c], 'top', c, r);
                }
            }
        }
        const leftGrid = f.left;
        if (leftGrid && Array.isArray(leftGrid)) {
            for (let r = 0; r < rows; r++) {
                const row = leftGrid[r];
                if (!row || !Array.isArray(row)) continue;
                for (let c = 0; c < cols; c++) {
                    pushParts(row[c], 'left', c, r);
                }
            }
        }
        const rightGrid = f.right;
        if (rightGrid && Array.isArray(rightGrid)) {
            for (let r = 0; r < rows; r++) {
                const row = rightGrid[r];
                if (!row || !Array.isArray(row)) continue;
                for (let c = 0; c < cols; c++) {
                    pushParts(row[c], 'right', c, r);
                }
            }
        }
        return list;
    }

    /**
     * 按阵型遍历顺序合并连续同类型为 { type, count }[]（存档与 STG 读档共用）
     */
    function formationToEnemiesOrdered(f) {
        const flat = flattenFormationToSpawnList(f);
        const enemies = [];
        flat.forEach((item) => {
            const t = item.typeId || 'normal';
            const last = enemies[enemies.length - 1];
            if (last && last.type === t) {
                last.count++;
            } else {
                enemies.push({ type: t, count: 1 });
            }
        });
        return enemies;
    }

    function hasAnyFormationCell(f) {
        if (!f) return false;
        if (flattenFormationToSpawnList(f).length > 0) return true;
        if (f.main && Array.isArray(f.main)) {
            for (let r = 0; r < f.main.length; r++) {
                const row = f.main[r];
                if (!row) continue;
                for (let c = 0; c < row.length; c++) {
                    if (row[c] != null && String(row[c]).trim() !== '') return true;
                }
            }
        }
        return false;
    }

    /** 旧存档仅有 enemies 无阵型时：自上棋盘底行左起顺排，便于迁移 */
    function migrateEnemiesToFormation(wave) {
        if (hasAnyFormationCell(wave.stgFormation)) return wave;
        const enemies = wave.enemies || [];
        let total = 0;
        enemies.forEach((e) => {
            total += Math.max(0, e.count | 0);
        });
        if (total === 0) return wave;
        const f = createEmptyFormation();
        let c = 0;
        let r = rows - 1;
        enemies.forEach((e) => {
            const t = e.type || 'normal';
            const n = Math.max(0, e.count | 0);
            for (let i = 0; i < n; i++) {
                if (f.top[r][c]) f.top[r][c] += '|' + t;
                else f.top[r][c] = t;
                c++;
                if (c >= cols) {
                    c = 0;
                    r--;
                    if (r < 0) r = rows - 1;
                }
            }
        });
        wave.stgFormation = f;
        wave.enemies = formationToEnemiesOrdered(f);
        return wave;
    }

    /** STG 读档时：无格子则从旧 enemies 生成临时阵型（不写盘） */
    function migrateWaveForRuntime(wave) {
        try {
            const w = JSON.parse(JSON.stringify(wave));
            return migrateEnemiesToFormation(w);
        } catch (e) {
            return wave;
        }
    }

    /**
     * 与怪物编辑器 tower_defense_enemy_types 同步：显示名称 + 图示 emoji（格子内简称仍用 id 前 2 字）
     * @returns {Record<string, { name: string, icon: string }>}
     */
    function getEnemyTypeMetaMap() {
        const map = {
            normal: { name: '普通', icon: '👹' },
            fast: { name: '快速', icon: '⚡' },
            tank: { name: '坦克', icon: '🛡️' }
        };
        try {
            const raw = localStorage.getItem('tower_defense_enemy_types');
            if (raw) {
                const o = JSON.parse(raw);
                if (o && typeof o === 'object') {
                    Object.keys(o).forEach((id) => {
                        const d = o[id];
                        const name = d && d.name ? String(d.name) : id;
                        const icon = d && d.icon != null && String(d.icon).trim() !== '' ? String(d.icon).replace(/</g, '') : '👹';
                        map[id] = { name, icon };
                    });
                }
            }
        } catch (e) {
            /* ignore */
        }
        try {
            const br = localStorage.getItem('stg_boss_configs');
            if (br) {
                const doc = JSON.parse(br);
                if (doc && doc.bosses && typeof doc.bosses === 'object') {
                    Object.keys(doc.bosses).forEach((bid) => {
                        const b = doc.bosses[bid];
                        const nm = b && b.name ? String(b.name) : bid;
                        map['__boss_' + bid] = { name: 'BOSS · ' + nm, icon: '🐉' };
                    });
                }
            }
        } catch (e2) {
            /* ignore */
        }
        return map;
    }

    function getEnemyTypeOptions() {
        const map = getEnemyTypeMetaMap();
        const order = ['normal', 'fast', 'tank'];
        const keys = Object.keys(map);
        const rest = keys.filter((id) => order.indexOf(id) < 0 && String(id).indexOf('__boss_') !== 0).sort();
        const out = [];
        order.forEach((id) => {
            if (map[id] != null) out.push({ id, name: map[id].name });
        });
        rest.forEach((id) => out.push({ id, name: map[id].name }));
        return { regular: out };
    }

    /**
     * BOSS 编辑器存档中的条目，用于笔刷 optgroup（token：__boss_<id>）
     */
    function getBossBrushOptions() {
        const out = [];
        try {
            const raw = localStorage.getItem('stg_boss_configs');
            if (!raw) return out;
            const doc = JSON.parse(raw);
            if (!doc || !doc.bosses || typeof doc.bosses !== 'object') return out;
            Object.keys(doc.bosses)
                .sort()
                .forEach((bid) => {
                    const b = doc.bosses[bid];
                    const nm = b && b.name ? String(b.name) : bid;
                    const token = '__boss_' + bid;
                    out.push({ id: token, label: '🐉 ' + nm + ' (' + bid + ')' });
                });
        } catch (e) {
            /* ignore */
        }
        return out;
    }

    /**
     * 按 flatten 出怪顺序，首次出现的种类 id 去重（用于本波图例顺序）
     * @param {{ top: string[][], left: string[][], right: string[][] }} buf
     * @returns {string[]}
     */
    function collectUniqueTypeIdsInWaveOrder(buf) {
        const flat = flattenFormationToSpawnList(buf);
        const seen = new Set();
        const order = [];
        for (let i = 0; i < flat.length; i++) {
            const id = (flat[i].typeId && String(flat[i].typeId).trim()) || 'normal';
            if (window.StgMode && typeof window.StgMode.isFormationBeaconToken === 'function') {
                if (window.StgMode.isFormationBeaconToken(id)) continue;
            } else if (String(id).startsWith('__beacon_')) {
                continue;
            }
            if (!seen.has(id)) {
                seen.add(id);
                order.push(id);
            }
        }
        return order;
    }

    /** 刷新「本波种类图例」：全称 + 图标，随当前波与棋盘变化更新 */
    function refreshWaveLegend() {
        if (!waveLegendEl) return;
        const buf = formationBuffers[currentWaveIndex];
        waveLegendEl.innerHTML = '';
        if (!buf) {
            waveLegendEl.appendChild(document.createTextNode('（无当前波数据）'));
            return;
        }
        const ids = collectUniqueTypeIdsInWaveOrder(buf);
        const meta = getEnemyTypeMetaMap();
        if (ids.length === 0) {
            const p = document.createElement('p');
            p.className = 'stg-formation-wave-legend-empty';
            p.textContent = '本波三棋盘尚未放置任何敌人。';
            waveLegendEl.appendChild(p);
            return;
        }
        ids.forEach((typeId) => {
            const m = meta[typeId] || { name: typeId, icon: '👹' };
            const item = document.createElement('div');
            item.className = 'stg-formation-legend-item';
            item.title = '种类 id：' + typeId;
            const ic = document.createElement('span');
            ic.className = 'stg-formation-legend-icon';
            ic.setAttribute('aria-hidden', 'true');
            ic.textContent = m.icon || '👹';
            const text = document.createElement('span');
            text.className = 'stg-formation-legend-text';
            const nameEl = document.createElement('span');
            nameEl.className = 'stg-formation-legend-name';
            nameEl.textContent = m.name || typeId;
            const idEl = document.createElement('span');
            idEl.className = 'stg-formation-legend-id';
            idEl.textContent = typeId;
            text.appendChild(nameEl);
            text.appendChild(document.createTextNode(' '));
            text.appendChild(idEl);
            item.appendChild(ic);
            item.appendChild(text);
            waveLegendEl.appendChild(item);
        });
    }

    /** 与 stgMode STG_FORMATION_BEACON_PREFIX 一致：四块棋盘均可摆 */
    const BEACON_BRUSH_VALUES = [
        '__beacon_a1',
        '__beacon_a2',
        '__beacon_a3',
        '__beacon_a4',
        '__beacon_b1',
        '__beacon_b2',
        '__beacon_b3',
        '__beacon_b4'
    ];

    function buildBrushOptions() {
        if (!brushSelectEl) return;
        if (placementMode === 'beacon') {
            let html = '<option value="">（擦除）</option>';
            BEACON_BRUSH_VALUES.forEach((bid) => {
                const short = bid.replace('__beacon_', '');
                html += `<option value="${bid}">信标 ${short}</option>`;
            });
            brushSelectEl.innerHTML = html;
            return;
        }
        const pack = getEnemyTypeOptions();
        const opts = pack.regular || [];
        const bossOpts = getBossBrushOptions();
        let html = '<option value="">（擦除）</option>';
        opts.forEach((o) => {
            const safeId = String(o.id).replace(/"/g, '&quot;');
            html += `<option value="${safeId}">${o.name}</option>`;
        });
        if (bossOpts.length > 0) {
            html += '<optgroup label="BOSS（BOSS 编辑器）">';
            bossOpts.forEach((o) => {
                const safeId = String(o.id).replace(/"/g, '&quot;');
                const lab = String(o.label).replace(/</g, '');
                html += `<option value="${safeId}">${lab}</option>`;
            });
            html += '</optgroup>';
        }
        brushSelectEl.innerHTML = html;
    }

    function syncFormationBoardInactiveState() {
        document.querySelectorAll('[data-stg-formation-board]').forEach((el) => {
            const k = el.getAttribute('data-stg-formation-board');
            /** 仅「摆放敌人」时主棋盘不可点（主棋盘不出怪）；「摆放信标」时四块棋盘均可编辑 */
            const inactive = placementMode === 'enemy' && k === 'main';
            el.classList.toggle('stg-formation-board-block--inactive', inactive);
        });
    }

    /**
     * @param {{ fullErase?: boolean }} [opts] 右键擦除一格时为 true：扩展格整格清空（含怪与信标）
     */
    function paintCell(edge, col, row, typeId, opts) {
        const buf = formationBuffers[currentWaveIndex];
        if (!buf) return;
        const fullErase = opts && opts.fullErase;
        if (edge === 'main') {
            buf.main[row][col] = typeId || '';
            return;
        }
        const ext = buf[edge];
        if (!ext || !ext[row]) return;

        if (fullErase && !typeId) {
            ext[row][col] = '';
            return;
        }

        const cur = ext[row][col] || '';
        const { enemies, beacons } = splitExtensionCellParts(cur);

        if (placementMode === 'enemy') {
            if (!typeId) {
                ext[row][col] = '';
                return;
            }
            ext[row][col] = beacons.length ? typeId + '|' + beacons.join('|') : typeId;
            return;
        }
        if (placementMode === 'beacon') {
            if (!typeId) {
                ext[row][col] = enemies.join('|');
                return;
            }
            ext[row][col] = enemies.length ? enemies.join('|') + '|' + typeId : typeId;
            return;
        }
        ext[row][col] = typeId || '';
    }

    function cellKey(edge, col, row) {
        return edge + '|' + col + '|' + row;
    }

    function paintFromDataset(cell) {
        if (!cell || !cell.dataset) return;
        const edge = cell.dataset.edge;
        const c = parseInt(cell.dataset.col, 10);
        const r = parseInt(cell.dataset.row, 10);
        if (!edge || Number.isNaN(c) || Number.isNaN(r)) return;
        if (placementMode === 'enemy' && edge === 'main') return;
        paintCell(edge, c, r, dragBrush);
    }

    function onGridPointerDown(e) {
        const cell = e.target && e.target.closest ? e.target.closest('.stg-formation-cell') : null;
        if (!cell || e.button !== 0) return;
        e.preventDefault();
        dragPainting = true;
        dragBrush = brushSelectEl ? brushSelectEl.value : '';
        dragLastKey = '';
        paintFromDataset(cell);
        dragLastKey = cellKey(cell.dataset.edge, parseInt(cell.dataset.col, 10), parseInt(cell.dataset.row, 10));
        document.addEventListener('pointermove', onDocumentPointerMove);
        document.addEventListener('pointerup', onDocumentPointerUp);
        document.addEventListener('pointercancel', onDocumentPointerUp);
        refreshAllGrids();
    }

    function onDocumentPointerMove(e) {
        if (!dragPainting) return;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const cell = el && el.closest ? el.closest('.stg-formation-cell') : null;
        if (!cell) return;
        const k = cellKey(cell.dataset.edge, parseInt(cell.dataset.col, 10), parseInt(cell.dataset.row, 10));
        if (k === dragLastKey) return;
        dragLastKey = k;
        paintFromDataset(cell);
        refreshAllGrids();
    }

    function onDocumentPointerUp() {
        if (!dragPainting) return;
        dragPainting = false;
        dragLastKey = '';
        document.removeEventListener('pointermove', onDocumentPointerMove);
        document.removeEventListener('pointerup', onDocumentPointerUp);
        document.removeEventListener('pointercancel', onDocumentPointerUp);
    }

    function onCellContextMenu(e) {
        const cell = e.currentTarget;
        e.preventDefault();
        const edge = cell.dataset.edge;
        const c = parseInt(cell.dataset.col, 10);
        const r = parseInt(cell.dataset.row, 10);
        if (placementMode === 'enemy' && edge === 'main') return;
        paintCell(edge, c, r, '', { fullErase: true });
        refreshAllGrids();
    }

    function bindGridContainer(container) {
        if (!container) return;
        container.addEventListener('pointerdown', onGridPointerDown);
    }

    /** 格子悬停：列出种类全称（与图例同源），多只用分号分隔 */
    function formatFormationCellTitle(raw, col, row, meta) {
        const m0 = meta || getEnemyTypeMetaMap();
        if (raw == null || String(raw).trim() === '') return '空 (' + col + ',' + row + ')';
        const parts = String(raw)
            .split('|')
            .map((s) => s.trim())
            .filter(Boolean);
        if (parts.length === 0) return '空 (' + col + ',' + row + ')';
        const bits = parts.map((pid) => {
            if (window.StgMode && typeof window.StgMode.isFormationBeaconToken === 'function') {
                if (window.StgMode.isFormationBeaconToken(pid)) {
                    return '移动信标 ' + String(pid).replace('__beacon_', '') + '（局内不显示）';
                }
            } else if (String(pid).startsWith('__beacon_')) {
                return '移动信标 ' + String(pid).replace('__beacon_', '') + '（局内不显示）';
            }
            const m = m0[pid];
            return m ? m.name + '（' + pid + '）' : pid;
        });
        return bits.join('；') + ' @ (' + col + ',' + row + ')';
    }

    function renderGrid(container, edgeKey) {
        if (!container) return;
        const metaMap = getEnemyTypeMetaMap();
        container.innerHTML = '';
        container.style.gridTemplateColumns = `repeat(${cols}, var(--stg-form-cell, 14px))`;
        container.style.gridTemplateRows = `repeat(${rows}, var(--stg-form-cell, 14px))`;
        const buf = formationBuffers[currentWaveIndex];
        if (!buf) return;
        const grid = buf[edgeKey];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = document.createElement('button');
                cell.type = 'button';
                cell.className = 'stg-formation-cell';
                cell.dataset.edge = edgeKey;
                cell.dataset.col = String(c);
                cell.dataset.row = String(r);
                const v = grid[r][c];
                if (v) {
                    if (String(v).indexOf('|') >= 0) {
                        cell.textContent = v.length > 2 ? v.slice(0, 2) : v;
                    } else if (
                        window.StgMode &&
                        typeof window.StgMode.isFormationBeaconToken === 'function' &&
                        window.StgMode.isFormationBeaconToken(v)
                    ) {
                        cell.textContent = String(v).replace('__beacon_', '');
                    } else if (String(v).startsWith('__beacon_')) {
                        cell.textContent = String(v).replace('__beacon_', '');
                    } else if (String(v).startsWith('__boss_')) {
                        cell.textContent = '🐉';
                    } else {
                        cell.textContent = v.length > 2 ? v.slice(0, 2) : v;
                    }
                } else {
                    cell.textContent = '';
                }
                cell.title = formatFormationCellTitle(v, c, r, metaMap);
                if (v) cell.classList.add('has-type');
                if (edgeKey === 'main' && v) cell.classList.add('stg-formation-cell--beacon');
                cell.addEventListener('contextmenu', onCellContextMenu);
                container.appendChild(cell);
            }
        }
    }

    function refreshAllGrids() {
        if (grids.top) renderGrid(grids.top, 'top');
        if (grids.left) renderGrid(grids.left, 'left');
        if (grids.right) renderGrid(grids.right, 'right');
        if (grids.main) renderGrid(grids.main, 'main');
        syncFormationBoardInactiveState();
        refreshWaveLegend();
    }

    function syncMetaInputsFromBuffer() {
        const m = waveMetaBuffers[currentWaveIndex];
        if (!m) return;
        if (spawnIntervalInp) spawnIntervalInp.value = String(m.spawnInterval);
        if (spiritRewardInp) spiritRewardInp.value = String(m.spiritReward);
        if (nextDelayInp) nextDelayInp.value = String(m.nextWaveDelaySec);
        if (waveEnemyHpMultInp) {
            waveEnemyHpMultInp.value = String(
                m.enemyHpMult != null && Number.isFinite(Number(m.enemyHpMult))
                    ? normalizeWaveEnemyHpMult(m.enemyHpMult)
                    : 1
            );
        }
    }

    function syncHpInputsFromBuffer() {
        const s = enemyHpScaleBuffer || DEFAULT_ENEMY_HP_SCALE;
        if (hpBaseMultInp) hpBaseMultInp.value = String(s.baseMult);
        if (hpLinearInp) hpLinearInp.value = String(s.linearPerWave);
        if (hpAccelInp) hpAccelInp.value = String(s.accelPerWaveSq);
        if (enemyFireStopRowInp) {
            const g = getGridSize();
            const mr = g.rows || 21;
            enemyFireStopRowInp.max = String(mr);
            enemyFireStopRowInp.value =
                enemyFireStopRowBuffer != null && Number.isFinite(enemyFireStopRowBuffer)
                    ? String(enemyFireStopRowBuffer)
                    : '';
        }
        if (postUpgradeDelayInp && fullDoc) {
            const pud =
                fullDoc.postUpgradeSpawnDelaySec != null && Number.isFinite(Number(fullDoc.postUpgradeSpawnDelaySec))
                    ? Math.max(0, Math.min(60, Number(fullDoc.postUpgradeSpawnDelaySec)))
                    : 2;
            postUpgradeDelayInp.value = String(pud);
        }
    }

    function readPostUpgradeFromInputs() {
        if (!postUpgradeDelayInp || !fullDoc) return;
        const v = String(postUpgradeDelayInp.value).trim();
        const n = v === '' ? 2 : parseFloat(v.replace(',', '.'));
        fullDoc.postUpgradeSpawnDelaySec = Number.isFinite(n) ? Math.max(0, Math.min(60, n)) : 2;
    }

    function readHpFromInputs() {
        const gf = (el, def) => {
            if (!el) return def;
            const n = parseFloat(el.value);
            return Number.isFinite(n) ? n : def;
        };
        enemyHpScaleBuffer = normalizeEnemyHpScale({
            baseMult: gf(hpBaseMultInp, 1),
            linearPerWave: gf(hpLinearInp, 0),
            accelPerWaveSq: gf(hpAccelInp, 0)
        });
        if (enemyFireStopRowInp) {
            const v = String(enemyFireStopRowInp.value).trim();
            const g = getGridSize();
            const mr = g.rows || 21;
            enemyFireStopRowBuffer = v === '' ? null : normalizeEnemyFireStopRow(parseInt(v, 10), mr, null);
        }
    }

    function readMetaFromInputs() {
        const m = waveMetaBuffers[currentWaveIndex];
        if (!m) return;
        if (spawnIntervalInp) {
            m.spawnInterval = Math.max(0, parseInt(spawnIntervalInp.value, 10) || 400);
        }
        if (spiritRewardInp) {
            m.spiritReward = Math.max(0, parseInt(spiritRewardInp.value, 10) || 0);
        }
        if (nextDelayInp) {
            m.nextWaveDelaySec = Math.max(0, parseInt(nextDelayInp.value, 10) || 15);
        }
        if (waveEnemyHpMultInp) {
            const n = parseFloat(String(waveEnemyHpMultInp.value).replace(',', '.'));
            m.enemyHpMult = normalizeWaveEnemyHpMult(Number.isFinite(n) ? n : 1);
        }
    }

    /** 将当前 UI 缓冲写回 fullDoc 中当前章 */
    function persistCurrentChapterToDoc() {
        if (!fullDoc || !Array.isArray(fullDoc.chapters)) return;
        if (!fullDoc.chapters[currentChapterIndex]) return;
        fullDoc.chapters[currentChapterIndex] = {
            waves: buildWavesPayload(),
            upgradeMomentsAfterWave: parseUpgradeMomentsFromInput(upgradeMomentsInp && upgradeMomentsInp.value)
        };
        fullDoc.enemyHpScale = normalizeEnemyHpScale(enemyHpScaleBuffer);
        fullDoc.enemyFireStopRow = enemyFireStopRowBuffer;
        readPostUpgradeFromInputs();
    }

    /** 从 fullDoc 当前章加载三棋盘与 meta 缓冲 */
    function rebuildBuffersFromCurrentChapter() {
        fullDoc = fullDoc || loadWaveConfigFromStorage();
        if (!fullDoc.chapters || fullDoc.chapters.length === 0) {
            fullDoc = normalizeFullWaveConfigFromRaw(null);
        }
        currentChapterIndex = Math.max(0, Math.min(currentChapterIndex, fullDoc.chapters.length - 1));
        enemyHpScaleBuffer = normalizeEnemyHpScale(fullDoc.enemyHpScale);
        const g = getGridSize();
        const mr = g.rows || 21;
        enemyFireStopRowBuffer = normalizeEnemyFireStopRow(fullDoc.enemyFireStopRow, mr, null);
        const ch = fullDoc.chapters[currentChapterIndex];
        const waves = ch && Array.isArray(ch.waves) ? ch.waves : [];
        if (waves.length === 0) {
            formationBuffers = [createEmptyFormation()];
            waveMetaBuffers = [defaultNewWaveMeta()];
        } else {
            formationBuffers = [];
            waveMetaBuffers = [];
            const sHp = normalizeEnemyHpScale(fullDoc.enemyHpScale);
            waves.forEach((w, wi) => {
                const migrated = migrateEnemiesToFormation({ ...w });
                formationBuffers.push(normalizeFormation(migrated.stgFormation));
                let hpMult = 1;
                if (w.enemyHpMult != null && Number.isFinite(Number(w.enemyHpMult))) {
                    hpMult = normalizeWaveEnemyHpMult(w.enemyHpMult);
                } else {
                    const kk = Math.max(0, wi | 0);
                    let m = sHp.baseMult + sHp.linearPerWave * kk + sHp.accelPerWaveSq * kk * kk;
                    hpMult = Math.max(0.05, Math.min(500, m));
                }
                waveMetaBuffers.push({
                    spawnInterval: w.spawnInterval != null ? w.spawnInterval : 400,
                    spiritReward: w.spiritReward != null ? w.spiritReward : 10,
                    nextWaveDelaySec: w.nextWaveDelaySec != null ? Number(w.nextWaveDelaySec) : 15,
                    enemyHpMult: hpMult
                });
            });
        }
        if (currentWaveIndex >= formationBuffers.length) {
            currentWaveIndex = Math.max(0, formationBuffers.length - 1);
        }
    }

    function populateChapterSelect() {
        if (!chapterSelectEl) return;
        const n = fullDoc && fullDoc.chapters ? Math.max(1, fullDoc.chapters.length) : 1;
        let html = '';
        for (let i = 0; i < n; i++) {
            html += `<option value="${i}">第 ${i + 1} 章</option>`;
        }
        chapterSelectEl.innerHTML = html;
        chapterSelectEl.value = String(Math.min(currentChapterIndex, n - 1));
    }

    function syncUpgradeMomentsFromCurrentChapter() {
        if (!upgradeMomentsInp || !fullDoc || !fullDoc.chapters[currentChapterIndex]) return;
        const u = fullDoc.chapters[currentChapterIndex].upgradeMomentsAfterWave;
        if (u === undefined) {
            upgradeMomentsInp.value = '1';
        } else if (Array.isArray(u) && u.length === 0) {
            upgradeMomentsInp.value = '';
        } else {
            upgradeMomentsInp.value = Array.isArray(u) ? u.join(', ') : '';
        }
    }

    /**
     * 设置章节总数：多出的章为「空章」（0 波时读档会显示 1 个空波）；减少时删末尾章。
     * @param {number} n
     * @param {boolean} [skipConfirm] 已确认删章
     */
    function setChapterCount(n, skipConfirm) {
        const target = Math.max(1, Math.min(99, parseInt(n, 10) || 1));
        persistCurrentChapterToDoc();
        fullDoc = fullDoc || loadWaveConfigFromStorage();
        const prevLen = fullDoc.chapters.length;
        if (target < prevLen && !skipConfirm) {
            if (!confirm(`将删除第 ${target + 1}～${prevLen} 章的配置（不可恢复）。确定？`)) {
                return false;
            }
        }
        while (fullDoc.chapters.length < target) {
            fullDoc.chapters.push({ waves: [], upgradeMomentsAfterWave: undefined });
        }
        while (fullDoc.chapters.length > target) {
            fullDoc.chapters.pop();
        }
        if (currentChapterIndex >= fullDoc.chapters.length) {
            currentChapterIndex = fullDoc.chapters.length - 1;
        }
        rebuildBuffersFromCurrentChapter();
        populateChapterSelect();
        populateWaveSelect();
        syncMetaInputsFromBuffer();
        syncHpInputsFromBuffer();
        syncUpgradeMomentsFromCurrentChapter();
        refreshAllGrids();
        return true;
    }

    function populateWaveSelect() {
        if (!waveSelectEl) return;
        const n = Math.max(1, formationBuffers.length);
        let html = '';
        for (let i = 0; i < n; i++) {
            html += `<option value="${i}">第 ${i + 1} 波</option>`;
        }
        waveSelectEl.innerHTML = html;
        waveSelectEl.value = String(Math.min(currentWaveIndex, n - 1));
    }

    function open() {
        const g = getGridSize();
        cols = g.cols;
        rows = g.rows;
        fullDoc = loadWaveConfigFromStorage();
        currentChapterIndex = 0;
        rebuildBuffersFromCurrentChapter();
        populateChapterSelect();
        populateWaveSelect();
        placementMode = 'enemy';
        const prEnemy = document.getElementById('stgFormationPlacementEnemy');
        const prBeacon = document.getElementById('stgFormationPlacementBeacon');
        if (prEnemy) prEnemy.checked = true;
        if (prBeacon) prBeacon.checked = false;
        const brushHint = document.getElementById('stgFormationBrushHint');
        if (brushHint) brushHint.textContent = '（敌人种类）';
        buildBrushOptions();
        currentWaveIndex = parseInt(waveSelectEl.value, 10) || 0;
        syncMetaInputsFromBuffer();
        syncHpInputsFromBuffer();
        syncUpgradeMomentsFromCurrentChapter();
        refreshAllGrids();
        if (panelEl) panelEl.classList.remove('hidden');
    }

    function close() {
        if (panelEl) panelEl.classList.add('hidden');
    }

    function buildWavesPayload() {
        readMetaFromInputs();
        readHpFromInputs();
        const waves = [];
        for (let i = 0; i < formationBuffers.length; i++) {
            const f = normalizeFormation(formationBuffers[i]);
            const meta = waveMetaBuffers[i] || {
                spawnInterval: 400,
                spiritReward: 10,
                nextWaveDelaySec: 15,
                enemyHpMult: 1
            };
            const enemies = formationToEnemiesOrdered(f);
            waves.push({
                waveNumber: i + 1,
                spawnInterval: meta.spawnInterval,
                spiritReward: meta.spiritReward,
                nextWaveDelaySec: meta.nextWaveDelaySec,
                enemyHpMult: normalizeWaveEnemyHpMult(meta.enemyHpMult),
                stgFormation: {
                    top: f.top.map((row) => row.slice()),
                    left: f.left.map((row) => row.slice()),
                    right: f.right.map((row) => row.slice()),
                    main: f.main.map((row) => row.slice())
                },
                enemies
            });
        }
        return waves;
    }

    function applyAllToWaves() {
        persistCurrentChapterToDoc();
        const ch = fullDoc && fullDoc.chapters ? fullDoc.chapters[currentChapterIndex] : null;
        const waves = ch && ch.waves ? ch.waves : [];
        if (waves.length === 0) {
            alert('请至少保留一波');
            return;
        }
        saveFullWaveConfigToStorage(fullDoc);
        console.log('[阵型] 已保存：共', fullDoc.chapters.length, '章；当前第', currentChapterIndex + 1, '章', waves.length, '波');
        alert(
            '已保存到本地波次配置（含多章节）。\n' +
                '敌人仅摆在上/左/右扩展棋盘；移动信标可摆在上/左/右/主四块棋盘（局内不显示）。STG 出怪顺序与扩展格遍历一致。\n' +
                '每波「敌人血量倍率」已写入；全局随波次公式当前不参与计算（见面板说明）。'
        );
        close();
    }

    /**
     * 在指定下标插入空波（0=整关最前）；插入后选中该新波以便直接编辑。
     * @param {number} insertIndex 新波将占据的下标，允许 0..length（length 等价末尾追加）
     */
    function insertEmptyWaveAt(insertIndex) {
        readMetaFromInputs();
        readHpFromInputs();
        const len = formationBuffers.length;
        const idx = Math.max(0, Math.min(len, insertIndex | 0));
        formationBuffers.splice(idx, 0, createEmptyFormation());
        waveMetaBuffers.splice(idx, 0, defaultNewWaveMeta());
        currentWaveIndex = idx;
        populateWaveSelect();
        if (waveSelectEl) waveSelectEl.value = String(currentWaveIndex);
        syncMetaInputsFromBuffer();
        syncHpInputsFromBuffer();
        refreshAllGrids();
        console.log('[阵型] 已在第', idx + 1, '位插入空波（共', formationBuffers.length, '波）');
    }

    /** 在当前选中波与上一波之间插入 */
    function insertWaveBeforeCurrent() {
        insertEmptyWaveAt(currentWaveIndex);
    }

    /** 在当前选中波与下一波之间插入；若当前为最后一波则等同末尾追加 */
    function insertWaveAfterCurrent() {
        insertEmptyWaveAt(currentWaveIndex + 1);
    }

    function removeCurrentWave() {
        if (formationBuffers.length <= 1) {
            alert('至少保留一波');
            return;
        }
        readMetaFromInputs();
        readHpFromInputs();
        formationBuffers.splice(currentWaveIndex, 1);
        waveMetaBuffers.splice(currentWaveIndex, 1);
        if (currentWaveIndex >= formationBuffers.length) {
            currentWaveIndex = formationBuffers.length - 1;
        }
        populateWaveSelect();
        waveSelectEl.value = String(currentWaveIndex);
        syncMetaInputsFromBuffer();
        refreshAllGrids();
    }

    function init() {
        panelEl = document.getElementById('stgWaveFormationPanel');
        chapterSelectEl = document.getElementById('stgFormationChapterSelect');
        waveSelectEl = document.getElementById('stgFormationWaveSelect');
        brushSelectEl = document.getElementById('stgFormationBrushSelect');
        spawnIntervalInp = document.getElementById('stgFormationSpawnInterval');
        spiritRewardInp = document.getElementById('stgFormationSpiritReward');
        nextDelayInp = document.getElementById('stgFormationNextDelaySec');
        waveEnemyHpMultInp = document.getElementById('stgFormationWaveEnemyHpMult');
        hpBaseMultInp = document.getElementById('stgFormationHpBaseMult');
        hpLinearInp = document.getElementById('stgFormationHpLinear');
        hpAccelInp = document.getElementById('stgFormationHpAccel');
        enemyFireStopRowInp = document.getElementById('stgFormationEnemyFireStopRow');
        postUpgradeDelayInp = document.getElementById('stgFormationPostUpgradeSpawnDelaySec');
        upgradeMomentsInp = document.getElementById('stgFormationUpgradeMomentsInput');
        waveLegendEl = document.getElementById('stgFormationWaveLegend');
        grids.top = document.getElementById('stgFormationGridTop');
        grids.left = document.getElementById('stgFormationGridLeft');
        grids.right = document.getElementById('stgFormationGridRight');
        grids.main = document.getElementById('stgFormationGridMain');
        if (!panelEl) return;

        bindGridContainer(grids.top);
        bindGridContainer(grids.left);
        bindGridContainer(grids.right);
        bindGridContainer(grids.main);

        const prEnemy = document.getElementById('stgFormationPlacementEnemy');
        const prBeacon = document.getElementById('stgFormationPlacementBeacon');
        const brushHint = document.getElementById('stgFormationBrushHint');
        function applyPlacementModeFromUi() {
            placementMode = prBeacon && prBeacon.checked ? 'beacon' : 'enemy';
            if (brushHint) {
                brushHint.textContent = placementMode === 'beacon' ? '（移动信标）' : '（敌人种类）';
            }
            buildBrushOptions();
            syncFormationBoardInactiveState();
        }
        if (prEnemy) {
            prEnemy.addEventListener('change', () => {
                applyPlacementModeFromUi();
                refreshAllGrids();
            });
        }
        if (prBeacon) {
            prBeacon.addEventListener('change', () => {
                applyPlacementModeFromUi();
                refreshAllGrids();
            });
        }

        const openBtn = document.getElementById('stgOpenWaveFormationBtn');
        const openBtnLegacy = document.getElementById('stgOpenWaveConfigBtn');
        const openHandler = () => {
            open();
        };
        if (openBtn) openBtn.addEventListener('click', openHandler);
        if (openBtnLegacy) openBtnLegacy.addEventListener('click', openHandler);

        const closeBtn = document.getElementById('stgWaveFormationCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', close);
        panelEl.addEventListener('click', (e) => {
            if (e.target === panelEl) close();
        });
        const applyBtn = document.getElementById('stgFormationApplyBtn');
        if (applyBtn) applyBtn.addEventListener('click', applyAllToWaves);
        const exportWaveBtn = document.getElementById('stgFormationExportWaveConfigBtn');
        if (exportWaveBtn) exportWaveBtn.addEventListener('click', downloadWaveConfigJsonForSharing);
        const clearEnemyBtn = document.getElementById('stgFormationClearEnemyGridsBtn');
        if (clearEnemyBtn) {
            clearEnemyBtn.addEventListener('click', () => {
                if (!confirm('清空当前波在上/左/右扩展棋盘上的所有敌人？（各格内移动信标保留）')) return;
                const buf = formationBuffers[currentWaveIndex];
                if (!buf) return;
                ['top', 'left', 'right'].forEach((k) => {
                    const g = buf[k];
                    if (!g || !Array.isArray(g)) return;
                    for (let r = 0; r < rows; r++) {
                        if (!g[r] || !Array.isArray(g[r])) continue;
                        for (let c = 0; c < cols; c++) {
                            const raw = g[r][c];
                            const { beacons } = splitExtensionCellParts(raw);
                            g[r][c] = beacons.join('|');
                        }
                    }
                });
                refreshAllGrids();
            });
        }
        const clearMainBtn = document.getElementById('stgFormationClearMainBtn');
        if (clearMainBtn) {
            clearMainBtn.addEventListener('click', () => {
                if (!confirm('清空当前波四块棋盘上所有移动信标？（扩展格上的敌人种类保留）')) return;
                const buf = formationBuffers[currentWaveIndex];
                if (!buf) return;
                if (buf.main && Array.isArray(buf.main)) {
                    for (let r = 0; r < rows; r++) {
                        if (!buf.main[r] || !Array.isArray(buf.main[r])) continue;
                        for (let c = 0; c < cols; c++) buf.main[r][c] = '';
                    }
                }
                ['top', 'left', 'right'].forEach((k) => {
                    const g = buf[k];
                    if (!g || !Array.isArray(g)) return;
                    for (let r = 0; r < rows; r++) {
                        if (!g[r] || !Array.isArray(g[r])) continue;
                        for (let c = 0; c < cols; c++) {
                            const raw = g[r][c];
                            const { enemies } = splitExtensionCellParts(raw);
                            g[r][c] = enemies.join('|');
                        }
                    }
                });
                refreshAllGrids();
            });
        }
        const insBeforeBtn = document.getElementById('stgFormationInsertWaveBeforeBtn');
        if (insBeforeBtn) insBeforeBtn.addEventListener('click', insertWaveBeforeCurrent);
        const insAfterBtn = document.getElementById('stgFormationInsertWaveAfterBtn');
        if (insAfterBtn) insAfterBtn.addEventListener('click', insertWaveAfterCurrent);
        const removeWaveBtn = document.getElementById('stgFormationRemoveWaveBtn');
        if (removeWaveBtn) removeWaveBtn.addEventListener('click', removeCurrentWave);

        if (chapterSelectEl) {
            chapterSelectEl.addEventListener('change', () => {
                persistCurrentChapterToDoc();
                currentChapterIndex = parseInt(chapterSelectEl.value, 10) || 0;
                currentWaveIndex = 0;
                rebuildBuffersFromCurrentChapter();
                populateWaveSelect();
                if (waveSelectEl) waveSelectEl.value = String(currentWaveIndex);
                syncMetaInputsFromBuffer();
                syncHpInputsFromBuffer();
                syncUpgradeMomentsFromCurrentChapter();
                refreshAllGrids();
            });
        }
        if (waveSelectEl) {
            waveSelectEl.addEventListener('change', () => {
                readMetaFromInputs();
                readHpFromInputs();
                currentWaveIndex = parseInt(waveSelectEl.value, 10) || 0;
                syncMetaInputsFromBuffer();
                syncHpInputsFromBuffer();
                refreshAllGrids();
            });
        }
        [spawnIntervalInp, spiritRewardInp, nextDelayInp, waveEnemyHpMultInp].forEach((inp) => {
            if (inp) {
                inp.addEventListener('change', () => {
                    readMetaFromInputs();
                });
            }
        });
        [hpBaseMultInp, hpLinearInp, hpAccelInp, enemyFireStopRowInp].forEach((inp) => {
            if (inp) {
                inp.addEventListener('change', () => {
                    readHpFromInputs();
                });
            }
        });
        if (postUpgradeDelayInp) {
            postUpgradeDelayInp.addEventListener('change', () => {
                readPostUpgradeFromInputs();
            });
        }
    }

    window.StgWaveFormationPanel = {
        init,
        open,
        close,
        downloadWaveConfigJsonForSharing,
        flattenFormationToSpawnList,
        formationToEnemiesOrdered,
        migrateWaveForRuntime,
        setChapterCount,
        /** BOSS 编辑器保存后调用，刷新「摆放：敌人」笔刷下的 BOSS 列表 */
        refreshBrushSelect: function () {
            if (!brushSelectEl) return;
            buildBrushOptions();
        },
        getChapterCount: function () {
            return fullDoc && fullDoc.chapters ? fullDoc.chapters.length : 1;
        },
        syncChapterEditorInput: function (inputEl) {
            if (!inputEl) return;
            const n = fullDoc && fullDoc.chapters ? fullDoc.chapters.length : 1;
            inputEl.value = String(n);
        }
    };
})();

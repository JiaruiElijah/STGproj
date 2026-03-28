/**
 * 波次阵型编辑器（唯一波次配置入口）：上/左/右 三块与 STG 同格数棋盘；
 * 种类与数量仅由格子决定；存档键 tower_defense_wave_config（与旧塔防共用键名，塔防脚本已移除时仅本地读写）。
 */
(function () {
    'use strict';

    const WAVE_STORAGE_KEY = 'tower_defense_wave_config';

    let panelEl = null;
    let waveSelectEl = null;
    let brushSelectEl = null;
    let spawnIntervalInp = null;
    let spiritRewardInp = null;
    let nextDelayInp = null;
    let grids = { top: null, left: null, right: null };
    /** @type {Array<{top:string[][],left:string[][],right:string[][]}>} */
    let formationBuffers = [];
    /** @type {Array<{ spawnInterval: number, spiritReward: number, nextWaveDelaySec: number }>} */
    let waveMetaBuffers = [];
    let currentWaveIndex = 0;
    let cols = 12;
    let rows = 17;

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
        return { cols: 12, rows: 17 };
    }

    function loadWavesFromStorage() {
        try {
            const raw = localStorage.getItem(WAVE_STORAGE_KEY);
            if (!raw) return [];
            const data = JSON.parse(raw);
            return data && Array.isArray(data.waves) ? data.waves : [];
        } catch (e) {
            return [];
        }
    }

    function saveWavesToStorage(waves) {
        try {
            localStorage.setItem(WAVE_STORAGE_KEY, JSON.stringify({ waves }));
        } catch (e) {
            console.warn('[阵型] 保存失败', e);
        }
        if (window.towerDefenseGame && window.towerDefenseGame.enemyManager && window.towerDefenseGame.enemyManager.waveConfig) {
            try {
                window.towerDefenseGame.enemyManager.waveConfig.setWaves(waves);
            } catch (e) {
                /* ignore */
            }
        }
        if (
            typeof window.towerDefenseGame !== 'undefined' &&
            window.towerDefenseGame &&
            typeof window.towerDefenseGame.saveWaveConfigToStorage === 'function'
        ) {
            window.towerDefenseGame.saveWaveConfigToStorage(waves);
        }
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
        return { top: mk(), left: mk(), right: mk() };
    }

    function normalizeFormation(f) {
        const out = createEmptyFormation();
        if (!f || typeof f !== 'object') return out;
        ['top', 'left', 'right'].forEach((k) => {
            const src = f[k];
            if (!src || !Array.isArray(src)) return;
            for (let r = 0; r < rows; r++) {
                if (!src[r] || !Array.isArray(src[r])) continue;
                for (let c = 0; c < cols; c++) {
                    const v = src[r][c];
                    if (v != null && String(v).trim() !== '') out[k][r][c] = String(v).trim();
                }
            }
        });
        return out;
    }

    /** 与 stgMode.flattenFormationToSpawnList 遍历顺序一致 */
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
     * 塔防 spawnQueue 用：按阵型遍历顺序合并连续同类型为 { type, count }[]
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
        return flattenFormationToSpawnList(f).length > 0;
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

    function getEnemyTypeOptions() {
        const labels = { normal: '普通', fast: '快速', tank: '坦克' };
        try {
            const raw = localStorage.getItem('tower_defense_enemy_types');
            if (raw) {
                const o = JSON.parse(raw);
                if (o && typeof o === 'object') {
                    Object.keys(o).forEach((id) => {
                        labels[id] = o[id] && o[id].name ? o[id].name : id;
                    });
                }
            }
        } catch (e) {
            /* ignore */
        }
        if (window.towerDefenseGame && window.towerDefenseGame.enemyManager) {
            try {
                const gt = window.towerDefenseGame.enemyManager.getEnemyTypes();
                Object.keys(gt).forEach((id) => {
                    labels[id] = gt[id] && gt[id].name ? gt[id].name : id;
                });
            } catch (e) {
                /* ignore */
            }
        }
        const order = ['normal', 'fast', 'tank'];
        const keys = Object.keys(labels);
        const rest = keys.filter((id) => order.indexOf(id) < 0).sort();
        const out = [];
        order.forEach((id) => {
            if (labels[id] != null) out.push({ id, name: labels[id] });
        });
        rest.forEach((id) => out.push({ id, name: labels[id] }));
        return out;
    }

    function buildBrushOptions() {
        if (!brushSelectEl) return;
        const opts = getEnemyTypeOptions();
        let html = '<option value="">（擦除）</option>';
        opts.forEach((o) => {
            html += `<option value="${o.id.replace(/"/g, '')}">${o.name}</option>`;
        });
        brushSelectEl.innerHTML = html;
    }

    function paintCell(edge, col, row, typeId) {
        const buf = formationBuffers[currentWaveIndex];
        if (!buf) return;
        buf[edge][row][col] = typeId || '';
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
        paintCell(edge, c, r, '');
        refreshAllGrids();
    }

    function bindGridContainer(container) {
        if (!container) return;
        container.addEventListener('pointerdown', onGridPointerDown);
    }

    function renderGrid(container, edgeKey) {
        if (!container) return;
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
                cell.textContent = v ? (v.length > 2 ? v.slice(0, 2) : v) : '';
                cell.title = v ? `${v} @ (${c},${r})` : `空 (${c},${r})`;
                if (v) cell.classList.add('has-type');
                cell.addEventListener('contextmenu', onCellContextMenu);
                container.appendChild(cell);
            }
        }
    }

    function refreshAllGrids() {
        if (grids.top) renderGrid(grids.top, 'top');
        if (grids.left) renderGrid(grids.left, 'left');
        if (grids.right) renderGrid(grids.right, 'right');
    }

    function syncMetaInputsFromBuffer() {
        const m = waveMetaBuffers[currentWaveIndex];
        if (!m) return;
        if (spawnIntervalInp) spawnIntervalInp.value = String(m.spawnInterval);
        if (spiritRewardInp) spiritRewardInp.value = String(m.spiritReward);
        if (nextDelayInp) nextDelayInp.value = String(m.nextWaveDelaySec);
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
    }

    function rebuildBuffersFromWaves() {
        const waves = loadWavesFromStorage();
        if (waves.length === 0) {
            formationBuffers = [createEmptyFormation()];
            waveMetaBuffers = [{ spawnInterval: 400, spiritReward: 10, nextWaveDelaySec: 15 }];
        } else {
            formationBuffers = [];
            waveMetaBuffers = [];
            waves.forEach((w) => {
                const migrated = migrateEnemiesToFormation({ ...w });
                formationBuffers.push(normalizeFormation(migrated.stgFormation));
                waveMetaBuffers.push({
                    spawnInterval: w.spawnInterval != null ? w.spawnInterval : 400,
                    spiritReward: w.spiritReward != null ? w.spiritReward : 10,
                    nextWaveDelaySec: w.nextWaveDelaySec != null ? Number(w.nextWaveDelaySec) : 15
                });
            });
        }
        if (currentWaveIndex >= formationBuffers.length) {
            currentWaveIndex = Math.max(0, formationBuffers.length - 1);
        }
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
        rebuildBuffersFromWaves();
        populateWaveSelect();
        buildBrushOptions();
        currentWaveIndex = parseInt(waveSelectEl.value, 10) || 0;
        syncMetaInputsFromBuffer();
        refreshAllGrids();
        if (panelEl) panelEl.classList.remove('hidden');
    }

    function close() {
        if (panelEl) panelEl.classList.add('hidden');
    }

    function buildWavesPayload() {
        readMetaFromInputs();
        const waves = [];
        for (let i = 0; i < formationBuffers.length; i++) {
            const f = normalizeFormation(formationBuffers[i]);
            const meta = waveMetaBuffers[i] || { spawnInterval: 400, spiritReward: 10, nextWaveDelaySec: 15 };
            const enemies = formationToEnemiesOrdered(f);
            waves.push({
                waveNumber: i + 1,
                spawnInterval: meta.spawnInterval,
                spiritReward: meta.spiritReward,
                nextWaveDelaySec: meta.nextWaveDelaySec,
                stgFormation: {
                    top: f.top.map((row) => row.slice()),
                    left: f.left.map((row) => row.slice()),
                    right: f.right.map((row) => row.slice())
                },
                enemies
            });
        }
        return waves;
    }

    function applyAllToWaves() {
        const waves = buildWavesPayload();
        if (waves.length === 0) {
            alert('请至少保留一波');
            return;
        }
        saveWavesToStorage(waves);
        console.log('[阵型] 已保存波次（共', waves.length, '波），种类与数量仅由阵型格子决定');
        alert(
            '已保存到本地波次配置（STG / 塔防共用）。\n' +
                '种类与数量仅由「三棋盘」格子决定；塔防侧出怪顺序与阵型遍历顺序一致（同类型会合并为连续组）。'
        );
        close();
    }

    function addWave() {
        readMetaFromInputs();
        formationBuffers.push(createEmptyFormation());
        waveMetaBuffers.push({ spawnInterval: 400, spiritReward: 10, nextWaveDelaySec: 15 });
        currentWaveIndex = formationBuffers.length - 1;
        populateWaveSelect();
        waveSelectEl.value = String(currentWaveIndex);
        syncMetaInputsFromBuffer();
        refreshAllGrids();
    }

    function removeCurrentWave() {
        if (formationBuffers.length <= 1) {
            alert('至少保留一波');
            return;
        }
        readMetaFromInputs();
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
        waveSelectEl = document.getElementById('stgFormationWaveSelect');
        brushSelectEl = document.getElementById('stgFormationBrushSelect');
        spawnIntervalInp = document.getElementById('stgFormationSpawnInterval');
        spiritRewardInp = document.getElementById('stgFormationSpiritReward');
        nextDelayInp = document.getElementById('stgFormationNextDelaySec');
        grids.top = document.getElementById('stgFormationGridTop');
        grids.left = document.getElementById('stgFormationGridLeft');
        grids.right = document.getElementById('stgFormationGridRight');
        if (!panelEl) return;

        bindGridContainer(grids.top);
        bindGridContainer(grids.left);
        bindGridContainer(grids.right);

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
        const clearBtn = document.getElementById('stgFormationClearBoardBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (!confirm('清空当前波在三个棋盘上的所有放置？')) return;
                formationBuffers[currentWaveIndex] = createEmptyFormation();
                refreshAllGrids();
            });
        }
        const addWaveBtn = document.getElementById('stgFormationAddWaveBtn');
        if (addWaveBtn) addWaveBtn.addEventListener('click', addWave);
        const removeWaveBtn = document.getElementById('stgFormationRemoveWaveBtn');
        if (removeWaveBtn) removeWaveBtn.addEventListener('click', removeCurrentWave);

        if (waveSelectEl) {
            waveSelectEl.addEventListener('change', () => {
                readMetaFromInputs();
                currentWaveIndex = parseInt(waveSelectEl.value, 10) || 0;
                syncMetaInputsFromBuffer();
                refreshAllGrids();
            });
        }
        [spawnIntervalInp, spiritRewardInp, nextDelayInp].forEach((inp) => {
            if (inp) {
                inp.addEventListener('change', () => {
                    readMetaFromInputs();
                });
            }
        });
    }

    window.StgWaveFormationPanel = {
        init,
        open,
        close,
        flattenFormationToSpawnList,
        formationToEnemiesOrdered,
        migrateWaveForRuntime
    };
})();

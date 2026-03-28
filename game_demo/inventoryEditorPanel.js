/**
 * 物品栏编辑器组件
 * 为玩家物品栏指定各防御塔的数量；应用后保存到 localStorage，并立即刷新物品栏展示；刷新页面后仍按保存的配置恢复。
 */
(function () {
    const TOWER_CATEGORIES = ['防御塔', '箭塔', '法师塔', '炮塔', '兵营'];
    /** 与 game_demo/tower_upgrade_branches.json 一致：局内 Lv.4 分支五类基底塔（须置顶分组，避免误以为未加入） */
    const BRANCH_BASE_IDS = ['ranger_tower', 'boomerang_tower', 'marble_tower', 'frost_tower', 'knife_tower'];
    let panelEl = null;
    let listEl = null;
    /** 防止 init 被多次调用导致重复绑定点击 */
    let initDone = false;

    /**
     * 优先使用 game.js 写入的完整 ITEM_POOL，避免仅依赖 gameState 引用时漏项；
     * 与 gameState.itemPool 在正常运行时为同一数组引用。
     */
    function getItemPool() {
        if (typeof window !== 'undefined' && window.ITEM_POOL && window.ITEM_POOL.length) {
            return window.ITEM_POOL;
        }
        return (window.gameState && window.gameState.itemPool) || [];
    }

    /**
     * 物品栏可配置数量的防御塔：含箭塔/法师塔等同类，排除 buyable:false 的精英进化专用条目，避免清单过长漏看新塔。
     */
    function getTowerItems() {
        const pool = getItemPool();
        const list = pool.filter(item => {
            if (!item || !TOWER_CATEGORIES.includes(item.category)) return false;
            if (item.buyable === false) return false;
            return true;
        });
        list.sort((a, b) => (a.name || a.id || '').localeCompare(b.name || b.id || '', 'zh-CN'));
        return list;
    }

    /**
     * 拆成：分支五塔（固定顺序）+ 其余塔；并检测池中是否缺分支 id
     * @param {Array} towers getTowerItems 结果
     */
    function partitionForBranchSection(towers) {
        const byId = new Map();
        towers.forEach(t => {
            if (t && t.id) byId.set(t.id, t);
        });
        const branch = [];
        BRANCH_BASE_IDS.forEach(id => {
            const it = byId.get(id);
            if (it) branch.push(it);
        });
        const rest = towers.filter(t => t && !BRANCH_BASE_IDS.includes(t.id));
        const missingIds = BRANCH_BASE_IDS.filter(id => !byId.has(id));
        return { branch, rest, missingIds };
    }

    /** 当前展示用的数量来源：优先已保存的覆盖，否则当前 gameState.inventory */
    function getCountForTower(itemId) {
        const saved = typeof window.loadSavedInventoryOverride === 'function' ? window.loadSavedInventoryOverride() : null;
        if (saved && typeof saved[itemId] === 'number') return Math.max(0, saved[itemId]);
        const gs = window.gameState;
        if (gs && gs.inventory) return gs.inventory.get(itemId) || 0;
        return 0;
    }

    function open() {
        if (!panelEl) return;
        panelEl.classList.remove('hidden');
        render();
    }

    function close() {
        if (panelEl) panelEl.classList.add('hidden');
    }

    function buildOverrideFromDom() {
        const rows = listEl.querySelectorAll('.inventory-editor-row');
        const override = {};
        rows.forEach(row => {
            const id = row.dataset.towerId;
            if (!id) return;
            const input = row.querySelector('.inventory-editor-count');
            const v = input ? parseInt(input.value, 10) : 0;
            const count = typeof v === 'number' && !Number.isNaN(v) && v >= 0 ? v : 0;
            override[id] = count;
        });
        return override;
    }

    function applyAndSave() {
        const gameState = window.gameState;
        const itemPool = getItemPool();
        if (!gameState || !itemPool.length) {
            console.warn('物品池或游戏状态未就绪');
            alert('请先进入游戏并加载完成后再使用物品栏编辑器。');
            return;
        }
        const override = buildOverrideFromDom();
        if (typeof window.applyInventoryOverride === 'function') {
            window.applyInventoryOverride(gameState, override, itemPool);
        }
        try {
            const key = window.INVENTORY_OVERRIDE_STORAGE_KEY || 'tower_defense_inventory_override';
            localStorage.setItem(key, JSON.stringify(override));
            console.log('物品栏配置已应用并保存到本地');
        } catch (e) {
            console.warn('保存物品栏配置失败', e);
        }
        refreshTowerInventoryDisplay();
        close();
    }

    function refreshTowerInventoryDisplay() {
        if (window.towerDefenseGame && typeof window.towerDefenseGame.renderTowerInventory === 'function') {
            window.towerDefenseGame.renderTowerInventory();
            const shopList = document.getElementById('shopTowerInventoryList');
            if (shopList) window.towerDefenseGame.renderTowerInventory(shopList);
        }
        if (window.uiManager && typeof window.uiManager.renderInventory === 'function') {
            window.uiManager.renderInventory();
        }
    }

    function addRow(item, isBranchTower) {
        const count = getCountForTower(item.id);
        const name = (item.name || item.id || '').replace(/"/g, '&quot;');
        const icon = (item.icon || '🏰').replace(/"/g, '&quot;');
        const safeId = String(item.id || '').replace(/"/g, '&quot;');
        const row = document.createElement('div');
        row.className = 'inventory-editor-row' + (isBranchTower ? ' inventory-editor-row-branch' : '');
        row.dataset.towerId = item.id;
        row.title = '物品 id：' + (item.id || '') + '（与 JSON / 分支表一致）';
        row.innerHTML = `
            <span class="inventory-editor-icon">${icon}</span>
            <span class="inventory-editor-name">${name}<span class="inventory-editor-id">${safeId}</span></span>
            <label class="inventory-editor-label">数量</label>
            <input type="number" class="inventory-editor-count" min="0" value="${count}" title="该防御塔在物品栏中的数量">
        `;
        listEl.appendChild(row);
    }

    function render() {
        listEl.innerHTML = '';
        const towers = getTowerItems();
        if (typeof console !== 'undefined' && console.log) {
            const ids = towers.map(t => t && t.id).filter(Boolean);
            console.log('[防御塔][物品栏编辑器] 可配置塔', towers.length, '个，id:', ids.join(', '));
            console.log('[防御塔][物品栏编辑器] 局内五类分支基底 id 是否齐:', BRANCH_BASE_IDS.map(id => id + '=' + (ids.indexOf(id) !== -1 ? '有' : '无')).join(', '));
        }
        if (towers.length === 0) {
            listEl.innerHTML = '<p class="monster-editor-empty">暂无防御塔（需先加载游戏）</p>';
            return;
        }
        const { branch, rest, missingIds } = partitionForBranchSection(towers);

        if (missingIds.length > 0) {
            const p = document.createElement('p');
            p.className = 'inventory-editor-warn';
            p.textContent = '警告：物品池中缺少以下局内分支基底 id：' + missingIds.join(', ') + '。请检查 obj_list/arrow.json 是否已保存。';
            listEl.appendChild(p);
        }

        const h1 = document.createElement('h4');
        h1.className = 'inventory-editor-section-title';
        h1.textContent = '局内分支基底塔（Lv.4 三选一，见 tower_upgrade_branches.json）';
        listEl.appendChild(h1);
        const sub1 = document.createElement('p');
        sub1.className = 'inventory-editor-section-hint';
        sub1.textContent = '五座塔对应程序 id：游侠 ranger_tower、飞镖 boomerang_tower、弹珠塔 marble_tower、寒冰 frost_tower、飞刀塔 knife_tower（与旧 red_diamond / sniper_tower 已拆分，存档会自动迁移）。';
        listEl.appendChild(sub1);
        branch.forEach(item => addRow(item, true));

        const h2 = document.createElement('h4');
        h2.className = 'inventory-editor-section-title';
        h2.textContent = '其他可部署塔';
        listEl.appendChild(h2);
        rest.forEach(item => addRow(item, false));
    }

    function onApply() {
        applyAndSave();
    }

    function init() {
        if (initDone) return;
        panelEl = document.getElementById('inventoryEditorPanel');
        listEl = document.getElementById('inventoryEditorList');
        if (!panelEl || !listEl) return;
        initDone = true;

        const openBtn = document.getElementById('openInventoryEditorBtn');
        const closeBtn = document.getElementById('inventoryEditorCloseBtn');
        const applyBtn = document.getElementById('inventoryEditorApplyBtn');

        if (openBtn) openBtn.addEventListener('click', open);
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (panelEl) panelEl.addEventListener('click', (e) => { if (e.target === panelEl) close(); });
        if (applyBtn) applyBtn.addEventListener('click', onApply);
    }

    window.InventoryEditorPanel = { init, open, close, getTowerItems, applyAndSave, refreshTowerInventoryDisplay };
})();

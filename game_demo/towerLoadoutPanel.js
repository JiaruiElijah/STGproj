/**
 * 防御塔配装面板：当前仅「特斯拉」专属。
 * - 左侧：特斯拉 / 精英特斯拉（共用同一套配装存档键 tesla）
 * - 中间：1/2/3 级槽
 * - 右侧：被动配装随机三选一 + 金币刷新；大招三选一（效果待接入战斗）
 */
(function () {
    function isTeslaTowerItem(item) {
        return item && (item.id === 'tesla' || item.id === 'tesla_elite');
    }

    let panelEl = null;
    let towerListEl = null;
    let detailEl = null;
    let equipListEl = null;
    let selectedTowerId = null;
    /** @type {string|null} 右侧点击选中的配装 id，再点槽位填入 */
    let pendingEquipId = null;

    function getGameState() {
        return window.gameState;
    }

    function getItemPool() {
        const gs = getGameState();
        return (gs && gs.itemPool) || [];
    }

    function getTeslaTowerItems() {
        return getItemPool().filter(item => item && isTeslaTowerItem(item));
    }

    function escapeHtml(str) {
        return (str == null ? '' : String(str))
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;');
    }

    function getSelectedLoadoutKey() {
        const gs = getGameState();
        if (!gs || !selectedTowerId) return null;
        return gs.getLoadoutStorageKey(selectedTowerId);
    }

    function refreshDetail() {
        if (!detailEl) return;
        const gs = getGameState();
        if (!gs) {
            detailEl.innerHTML = '<p class="monster-editor-empty">游戏状态未就绪</p>';
            return;
        }
        if (!selectedTowerId) {
            detailEl.innerHTML = '<p class="tl-hint">请选择左侧「特斯拉」</p>';
            return;
        }
        const tower = gs.findItemById(selectedTowerId);
        if (!tower) {
            detailEl.innerHTML = '<p class="monster-editor-empty">找不到该塔数据</p>';
            return;
        }
        const loadoutKey = getSelectedLoadoutKey();
        const slots = loadoutKey ? gs.getTowerLoadoutSlots(loadoutKey) : [null, null, null];
        const slotLabels = ['1 级槽', '2 级槽', '3 级槽'];

        let slotsHtml = '';
        for (let i = 0; i < 3; i++) {
            const eqId = slots[i];
            const eq = eqId ? gs.findItemById(eqId) : null;
            const label = eq ? `${eq.icon || '⚙️'} ${escapeHtml(eq.name)}` : '空槽';
            slotsHtml += `
                <button type="button" class="tl-slot tl-slot-active" data-slot-index="${i}" title="先点右侧候选配装，再点槽填入；点已有槽可卸下">
                    <span class="tl-slot-idx">${slotLabels[i]}</span>
                    <span class="tl-slot-body">${label}</span>
                </button>`;
        }

        detailEl.innerHTML = `
            <div class="tl-detail-head">
                <span class="tl-detail-icon">${tower.icon || '🏰'}</span>
                <div>
                    <div class="tl-detail-name">${escapeHtml(tower.name || tower.id)}</div>
                    <div class="tl-detail-meta">特斯拉专属配装 · 与 <strong>精英特斯拉</strong>共用方案</div>
                </div>
            </div>
            <p class="tl-hint">局内 <strong>1 / 2 / 3 级</strong>槽累计生效（见战斗逻辑）。右侧每次<strong>随机 3 个被动</strong>候选，可花金币刷新。</p>
            <div class="tl-slots">${slotsHtml}</div>
            <p class="tl-hint">在右侧点选一个候选，再点<strong>空槽</strong>填入；点已有槽可清空。</p>
        `;

        detailEl.querySelectorAll('.tl-slot-active').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-slot-index'), 10);
                if (Number.isNaN(idx)) return;
                const key = getSelectedLoadoutKey();
                if (!key) return;
                const curSlots = gs.getTowerLoadoutSlots(key);
                const cur = curSlots[idx];
                if (pendingEquipId) {
                    gs.setTowerLoadoutSlot(key, idx, pendingEquipId);
                    pendingEquipId = null;
                    document.querySelectorAll('.tl-equip-item.selected').forEach(el => el.classList.remove('selected'));
                    saveAndRefresh();
                    return;
                }
                if (cur) {
                    gs.setTowerLoadoutSlot(key, idx, null);
                    saveAndRefresh();
                }
            });
        });
    }

    function saveAndRefresh() {
        const gs = getGameState();
        if (gs && typeof window.saveTowerLoadoutsToStorage === 'function') {
            window.saveTowerLoadoutsToStorage(gs);
        }
        if (gs && typeof window.saveTeslaLoadoutExtrasToStorage === 'function') {
            window.saveTeslaLoadoutExtrasToStorage(gs);
        }
        if (window.towerDefenseGame && typeof window.towerDefenseGame.refreshAllTowerLoadoutStats === 'function') {
            window.towerDefenseGame.refreshAllTowerLoadoutStats();
        }
        refreshDetail();
        renderEquipList();
    }

    function renderTowerList() {
        if (!towerListEl) return;
        const towers = getTeslaTowerItems();
        towerListEl.innerHTML = '';
        if (towers.length === 0) {
            towerListEl.innerHTML = '<p class="monster-editor-empty">物品池中暂无特斯拉塔（需 boom.json 含 tesla）</p>';
            return;
        }
        if (!selectedTowerId || !towers.some(t => t.id === selectedTowerId)) {
            selectedTowerId = towers[0].id;
        }
        towers.forEach(item => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tl-tower-btn' + (selectedTowerId === item.id ? ' selected' : '');
            btn.dataset.towerId = item.id;
            btn.innerHTML = `<span class="tl-tower-ico">${item.icon || '🏰'}</span><span class="tl-tower-na">${escapeHtml(item.name || item.id)}</span>`;
            btn.addEventListener('click', () => {
                selectedTowerId = item.id;
                pendingEquipId = null;
                renderTowerList();
                refreshDetail();
                renderEquipList();
            });
            towerListEl.appendChild(btn);
        });
    }

    function renderEquipList() {
        if (!equipListEl) return;
        const gs = getGameState();
        if (!gs) {
            equipListEl.innerHTML = '<p class="monster-editor-empty">游戏状态未就绪</p>';
            return;
        }
        if (!selectedTowerId || !isTeslaTowerItem(gs.findItemById(selectedTowerId))) {
            equipListEl.innerHTML = '<p class="monster-editor-empty">请选择左侧特斯拉</p>';
            return;
        }

        const offerIds = gs.teslaLoadoutOfferIds || [];
        const offerItems = offerIds.map(id => gs.findItemById(id)).filter(Boolean);
        const cost = typeof gs.getTeslaLoadoutRefreshCost === 'function' ? gs.getTeslaLoadoutRefreshCost() : 5;
        const canAfford = gs.coins >= cost;

        let offerHtml = '';
        offerItems.forEach(item => {
            const sel = pendingEquipId === item.id ? ' selected' : '';
            offerHtml += `
                <button type="button" class="tl-equip-item${sel}" data-equip-id="${String(item.id).replace(/"/g, '&quot;')}">
                    <span class="tl-equip-ico">${item.icon || '⚙️'}</span>
                    <span class="tl-equip-text">
                        <span class="tl-equip-name">${escapeHtml(item.name || item.id)}</span>
                        <span class="tl-equip-desc">${escapeHtml((item.description || '').slice(0, 80))}${(item.description && item.description.length > 80) ? '…' : ''}</span>
                    </span>
                </button>`;
        });
        if (offerItems.length === 0) {
            offerHtml = '<p class="monster-editor-empty">未加载特斯拉被动配装（检查 tesla_loadout_items.json）</p>';
        }

        const ultimates = typeof gs.getTeslaUltimateLoadoutPool === 'function' ? gs.getTeslaUltimateLoadoutPool() : [];
        const currentUlt = gs.teslaUltimateLoadoutId;
        let ultHtml = '';
        ultimates.forEach(u => {
            const sel = currentUlt === u.id ? ' tl-ultimate-selected' : '';
            ultHtml += `
                <button type="button" class="tl-ultimate-item${sel}" data-ultimate-id="${String(u.id).replace(/"/g, '&quot;')}">
                    <span class="tl-equip-ico">${u.icon || '✨'}</span>
                    <span class="tl-equip-text">
                        <span class="tl-equip-name">${escapeHtml(u.name || u.id)}</span>
                        <span class="tl-equip-desc">${escapeHtml((u.description || '').slice(0, 72))}${(u.description && u.description.length > 72) ? '…' : ''}</span>
                    </span>
                </button>`;
        });

        equipListEl.innerHTML = `
            <div class="tl-equip-block">
                <h4 class="tl-equip-title">随机候选（三选一）</h4>
                <p class="tl-hint">打开面板时免费重抽；下方按钮花费金币再次随机。</p>
                <div class="tl-equip-list-inner">${offerHtml}</div>
                <div class="tl-refresh-row">
                    <button type="button" class="tl-refresh-btn" id="tlTeslaRefreshBtn" ${canAfford ? '' : 'disabled'} title="刷新三个被动候选">
                        🔄 刷新（${cost} 金币）
                    </button>
                    <span class="tl-coin-hint">当前金币：${gs.coins ?? 0}</span>
                </div>
            </div>
            <div class="tl-equip-block tl-ultimate-block">
                <h4 class="tl-equip-title">大招选择（三选一）</h4>
                <p class="tl-hint">效果尚未接入战斗，仅作选择存档。</p>
                <div class="tl-ultimate-list">${ultHtml || '<p class="monster-editor-empty">未加载大招配装</p>'}</div>
            </div>
        `;

        equipListEl.querySelectorAll('.tl-equip-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-equip-id');
                pendingEquipId = pendingEquipId === id ? null : id;
                renderEquipList();
            });
        });

        equipListEl.querySelectorAll('.tl-ultimate-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-ultimate-id');
                gs.teslaUltimateLoadoutId = gs.teslaUltimateLoadoutId === id ? null : id;
                saveAndRefresh();
            });
        });

        const refreshBtn = document.getElementById('tlTeslaRefreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                if (typeof gs.tryRefreshTeslaLoadoutOffers !== 'function') return;
                const r = gs.tryRefreshTeslaLoadoutOffers();
                if (!r.ok) {
                    console.warn('[配装] 金币不足，刷新失败，需要', cost);
                    return;
                }
                if (window.uiManager && typeof window.uiManager.updateCoinsDisplay === 'function') {
                    window.uiManager.updateCoinsDisplay();
                }
                pendingEquipId = null;
                renderEquipList();
            });
        }
    }

    function render() {
        renderTowerList();
        refreshDetail();
        renderEquipList();
    }

    function open() {
        if (!panelEl) return;
        const gs = getGameState();
        if (gs && typeof gs.rollTeslaLoadoutOffers === 'function') {
            gs.rollTeslaLoadoutOffers();
        }
        panelEl.classList.remove('hidden');
        pendingEquipId = null;
        render();
    }

    function close() {
        if (panelEl) panelEl.classList.add('hidden');
        pendingEquipId = null;
    }

    function init() {
        panelEl = document.getElementById('towerLoadoutPanel');
        towerListEl = document.getElementById('towerLoadoutTowerList');
        detailEl = document.getElementById('towerLoadoutDetail');
        equipListEl = document.getElementById('towerLoadoutEquipList');
        if (!panelEl) return;

        const openBtn = document.getElementById('openTowerLoadoutBtn');
        const closeBtn = document.getElementById('towerLoadoutCloseBtn');
        if (openBtn) openBtn.addEventListener('click', open);
        if (closeBtn) closeBtn.addEventListener('click', close);
        panelEl.addEventListener('click', (e) => {
            if (e.target === panelEl) close();
        });
    }

    window.TowerLoadoutPanel = { init, open, close, render };
})();

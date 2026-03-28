/**
 * 强化物品编辑器：手动增删改 category=「强化」条目，存 localStorage，合并入 ITEM_POOL（同 id 覆盖 JSON）
 */
(function () {
    const CAT = '强化';
    let panelEl = null;
    let listEl = null;

    function getStorageKey() {
        return window.ENHANCE_ITEMS_CUSTOM_KEY || 'stg_enhance_items_custom';
    }

    function loadListFromStorage() {
        try {
            const raw = localStorage.getItem(getStorageKey());
            if (!raw) return [];
            const data = JSON.parse(raw);
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.warn('[强化编辑器] 读取失败', e);
            return [];
        }
    }

    function saveListToStorage(arr) {
        try {
            localStorage.setItem(getStorageKey(), JSON.stringify(arr));
            return true;
        } catch (e) {
            console.warn('[强化编辑器] 保存失败', e);
            alert('保存失败：存储空间可能已满。');
            return false;
        }
    }

    function getPoolEnhanceItems() {
        const pool = (typeof window !== 'undefined' && window.ITEM_POOL) || [];
        return pool.filter((i) => i && i.category === CAT);
    }

    function applyMergeAndRefreshUi() {
        if (typeof window.mergeEnhanceCustomIntoPool === 'function' && window.ITEM_POOL) {
            window.mergeEnhanceCustomIntoPool(window.ITEM_POOL);
        }
        if (window.gameState && typeof window.gameState.rollEnhanceOffers === 'function') {
            window.gameState.currentEnhanceItems = window.gameState.rollEnhanceOffers();
        }
        if (window.uiManager && typeof window.uiManager.renderEnhanceGrid === 'function') {
            window.uiManager.renderEnhanceGrid();
        }
    }

    function escapeHtml(s) {
        return (s == null ? '' : String(s))
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;');
    }

    function defaultRow() {
        return {
            id: 'custom_enh_' + Date.now(),
            category: CAT,
            name: '新强化',
            icon: '✨',
            rarity: '普通',
            description: '',
            effects: { attack_damage_bonus: 0.02 }
        };
    }

    function rowHtml(item, index) {
        const id = escapeHtml(item.id);
        const name = escapeHtml(item.name);
        const icon = escapeHtml(item.icon);
        const rarity = escapeHtml(item.rarity);
        const desc = escapeHtml(item.description);
        let effStr = '{}';
        try {
            effStr = JSON.stringify(item.effects && typeof item.effects === 'object' ? item.effects : {}, null, 2);
        } catch (e) {
            effStr = '{}';
        }
        return `
<div class="enhance-editor-row monster-editor-row" data-index="${index}">
  <div class="monster-editor-row-body">
    <label class="monster-editor-add-label">id <input type="text" class="enh-ed-id" value="${id}" maxlength="48" title="唯一 id，与 JSON 中条目对应；同 id 会覆盖默认文件" /></label>
    <label class="monster-editor-add-label">名称 <input type="text" class="enh-ed-name" value="${name}" maxlength="64" /></label>
    <label class="monster-editor-add-label">图标 <input type="text" class="enh-ed-icon" value="${icon}" maxlength="6" style="width:4em;" /></label>
    <label class="monster-editor-add-label">稀有度
      <select class="enh-ed-rarity">
        <option value="普通" ${rarity === '普通' ? 'selected' : ''}>普通</option>
        <option value="稀有" ${rarity === '稀有' ? 'selected' : ''}>稀有</option>
        <option value="史诗" ${rarity === '史诗' ? 'selected' : ''}>史诗</option>
        <option value="传说" ${rarity === '传说' ? 'selected' : ''}>传说</option>
      </select>
    </label>
    <label class="monster-editor-add-label" style="flex:1;min-width:200px;">说明 <input type="text" class="enh-ed-desc" value="${desc}" style="width:100%;max-width:420px;" /></label>
  </div>
  <div class="enhance-editor-effects-block">
    <div class="tower-editor-attack-modes-title">effects（JSON 对象，键名同 player_stats / game.js 中 getPlayerStatEffectLabel）</div>
    <textarea class="enh-ed-effects" rows="5" spellcheck="false" style="width:100%;max-width:720px;font-family:ui-monospace,monospace;font-size:12px;">${escapeHtml(effStr)}</textarea>
  </div>
  <div class="wave-config-actions" style="margin-top:8px;">
    <button type="button" class="open-shop-btn enhance-ed-remove" data-index="${index}">删除本条</button>
  </div>
</div>`;
    }

    function collectRowsFromDom() {
        if (!listEl) return [];
        const rows = listEl.querySelectorAll('.enhance-editor-row');
        const out = [];
        rows.forEach((row) => {
            const id = (row.querySelector('.enh-ed-id') && row.querySelector('.enh-ed-id').value || '').trim();
            if (!id) return;
            let effects = {};
            const tx = row.querySelector('.enh-ed-effects');
            if (tx && tx.value.trim()) {
                try {
                    const o = JSON.parse(tx.value.trim());
                    if (o && typeof o === 'object' && !Array.isArray(o)) effects = o;
                    else throw new Error('effects 须为 JSON 对象');
                } catch (e) {
                    throw new Error('条目 id=' + id + ' 的 effects JSON 无效：' + (e && e.message));
                }
            }
            out.push({
                id,
                category: CAT,
                name: (row.querySelector('.enh-ed-name') && row.querySelector('.enh-ed-name').value) || id,
                icon: (row.querySelector('.enh-ed-icon') && row.querySelector('.enh-ed-icon').value) || '✨',
                rarity: (row.querySelector('.enh-ed-rarity') && row.querySelector('.enh-ed-rarity').value) || '普通',
                description: (row.querySelector('.enh-ed-desc') && row.querySelector('.enh-ed-desc').value) || '',
                effects
            });
        });
        return out;
    }

    function render(data) {
        if (!listEl) return;
        const arr = Array.isArray(data) ? data : loadListFromStorage();
        if (arr.length === 0) {
            listEl.innerHTML =
                '<p class="wave-config-hint">暂无自定义条目。可点击「添加一条」或「从当前物品池导入强化项」。</p>';
            return;
        }
        listEl.innerHTML = arr.map((it, i) => rowHtml(it, i)).join('');
        listEl.querySelectorAll('.enhance-ed-remove').forEach((btn) => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-index'), 10);
                const next = arr.filter((_, j) => j !== idx);
                render(next);
            });
        });
    }

    function open() {
        if (!panelEl) return;
        panelEl.classList.remove('hidden');
        render(loadListFromStorage());
    }

    function close() {
        if (panelEl) panelEl.classList.add('hidden');
    }

    function onApply() {
        let list;
        try {
            list = collectRowsFromDom();
        } catch (e) {
            alert(e.message || String(e));
            return;
        }
        if (!saveListToStorage(list)) return;
        applyMergeAndRefreshUi();
        close();
        console.log('[强化编辑器] 已保存', list.length, '条并合并物品池');
    }

    function init() {
        panelEl = document.getElementById('enhanceItemsEditorPanel');
        listEl = document.getElementById('enhanceItemsEditorList');
        if (!panelEl || !listEl) return;

        const openBtn =
            document.getElementById('stgOpenEnhanceItemsEditorBtn') || document.getElementById('openEnhanceItemsEditorBtn');
        const closeBtn = document.getElementById('enhanceItemsEditorCloseBtn');
        const applyBtn = document.getElementById('enhanceItemsEditorApplyBtn');
        const addBtn = document.getElementById('enhanceItemsEditorAddBtn');
        const importBtn = document.getElementById('enhanceItemsEditorImportBtn');

        if (openBtn) openBtn.addEventListener('click', open);
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (panelEl) {
            panelEl.addEventListener('click', (e) => {
                if (e.target === panelEl) close();
            });
        }
        if (applyBtn) applyBtn.addEventListener('click', onApply);
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const cur = collectRowsFromDom();
                cur.push(defaultRow());
                render(cur);
            });
        }
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                const fromPool = getPoolEnhanceItems().map((i) => ({
                    id: i.id,
                    category: CAT,
                    name: i.name || i.id,
                    icon: i.icon || '✨',
                    rarity: i.rarity || '普通',
                    description: i.description || '',
                    effects: i.effects && typeof i.effects === 'object' ? { ...i.effects } : {}
                }));
                if (fromPool.length === 0) {
                    alert('当前物品池中没有「强化」类条目（请先加载 enhance_items.json）。');
                    return;
                }
                render(fromPool);
            });
        }
    }

    window.EnhanceItemsEditorPanel = { init, open, close };
})();

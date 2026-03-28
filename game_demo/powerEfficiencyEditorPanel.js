/**
 * 威能节能编辑器：集中编辑全局威能参数、防御塔威能获取与战场升级、英雄技能消耗与效果
 * 数据写入与防御塔/英雄编辑器相同的 localStorage，并刷新游戏内展示
 */
(function () {
    const TOWER_CATEGORIES = ['防御塔', '箭塔', '法师塔', '炮塔', '兵营'];
    const HERO_CATEGORY = '英雄';

    const RANGE_SHAPE_OPTIONS = [
        { value: 'square', label: '方形' },
        { value: 'line', label: 'I型线' },
        { value: 'rectangle', label: '长方形' }
    ];
    const LINE_DIR_OPTIONS = [
        { value: '', label: '-' },
        { value: 'horizontal', label: '水平' },
        { value: 'vertical', label: '垂直' }
    ];
    const RECT_DIR_OPTIONS = [
        { value: '', label: '-' },
        { value: 'n', label: '开口上' },
        { value: 's', label: '开口下' },
        { value: 'e', label: '开口右' },
        { value: 'w', label: '开口左' }
    ];

    let panelEl = null;
    let globalEl = null;
    let towerListEl = null;
    let heroListEl = null;

    function getPool() {
        return (window.gameState && window.gameState.itemPool) || [];
    }

    function escapeHtml(str) {
        return (str == null ? '' : String(str)).replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function getTowerItems() {
        return getPool().filter(item => item && TOWER_CATEGORIES.includes(item.category));
    }

    function getHeroItems() {
        return getPool().filter(item => item && item.category === HERO_CATEGORY);
    }

    function open() {
        if (!panelEl) return;
        panelEl.classList.remove('hidden');
        render();
    }

    function close() {
        if (panelEl) panelEl.classList.add('hidden');
    }

    function refreshDisplays() {
        if (window.towerDefenseGame && typeof window.towerDefenseGame.renderTowerInventory === 'function') {
            window.towerDefenseGame.renderTowerInventory();
            const shopList = document.getElementById('shopTowerInventoryList');
            if (shopList) window.towerDefenseGame.renderTowerInventory(shopList);
        }
        if (window.towerDefenseGame && typeof window.towerDefenseGame.updateHeroSkillBar === 'function') {
            window.towerDefenseGame.updateHeroSkillBar();
        }
        if (window.uiManager) {
            if (typeof window.uiManager.renderShop === 'function') window.uiManager.renderShop();
            if (typeof window.uiManager.renderInventory === 'function') window.uiManager.renderInventory();
        }
    }

    function renderGlobalSection() {
        const key = window.POWER_GLOBAL_STORAGE_KEY || 'tower_defense_power_global_settings';
        let g = { powerMax: 100, heroSkillPowerDefault: 100 };
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                const p = JSON.parse(raw);
                if (p && typeof p === 'object') g = { ...g, ...p };
            }
        } catch (e) { /* ignore */ }
        if (window.towerDefenseGame) {
            if (window.towerDefenseGame.defaultTowerPowerMax != null) g.powerMax = window.towerDefenseGame.defaultTowerPowerMax;
        }

        globalEl.innerHTML = `
            <div class="pe-global-title">威能条默认上限</div>
            <div class="pe-global-grid">
                <label title="每座塔威能条长度默认值；单塔可在物品 attributes.towerPowerMax 覆盖">单塔威能条上限（默认）</label>
                <input type="number" id="pe-global-power-max" min="1" step="1" value="${g.powerMax}">
            </div>
            <p class="pe-global-note">说明：每座塔独立攒威能；条满后可点塔在菜单里释放大招或进化。过载/防御消耗该塔威能。</p>
        `;
    }

    function shapeOptionsHtml(selected) {
        return RANGE_SHAPE_OPTIONS.map(o =>
            `<option value="${o.value}" ${o.value === selected ? 'selected' : ''}>${o.label}</option>`
        ).join('');
    }

    function lineDirHtml(selected, shape, currentDir) {
        const sel = shape === 'line' ? currentDir : '';
        return LINE_DIR_OPTIONS.map(o =>
            `<option value="${o.value}" ${o.value === sel ? 'selected' : ''}>${o.label}</option>`
        ).join('');
    }

    function rectDirHtml(selected, shape, currentDir) {
        const sel = shape === 'rectangle' ? currentDir : '';
        return RECT_DIR_OPTIONS.map(o =>
            `<option value="${o.value}" ${o.value === sel ? 'selected' : ''}>${o.label}</option>`
        ).join('');
    }

    function renderSkillFields(skillIdx, s) {
        const sk = s || {};
        const name = escapeHtml(sk.name != null ? String(sk.name) : '');
        const pc = sk.powerCost != null ? sk.powerCost : 100;
        const icon = escapeHtml(sk.icon || '✨');
        const dmg = sk.damageMultiplier != null ? sk.damageMultiplier : 1.5;
        const grid = sk.rangeGrid != null ? sk.rangeGrid : 1;
        const shape = sk.rangeShape || 'square';
        const dir = sk.rangeDirection || '';
        return `
            <div class="pe-skill-block" data-skill-sub="${skillIdx}">
                <div class="pe-skill-block-title">技能${skillIdx}</div>
                <div class="pe-skill-grid">
                    <label>名称</label>
                    <input type="text" class="pe-skill-${skillIdx}-name" value="${name}" placeholder="名称">
                    <label>威能消耗</label>
                    <input type="number" class="pe-skill-${skillIdx}-pc" min="0" step="1" value="${pc}">
                    <label>图标</label>
                    <input type="text" class="pe-skill-${skillIdx}-icon" value="${icon}" maxlength="4" style="width:3.5em;">
                    <label>伤害倍率</label>
                    <input type="number" class="pe-skill-${skillIdx}-dmg" min="0" step="0.1" value="${dmg}">
                    <label>射程格</label>
                    <input type="number" class="pe-skill-${skillIdx}-grid" min="0.5" step="0.5" value="${grid}">
                    <label>范围形状</label>
                    <select class="pe-skill-${skillIdx}-shape">${shapeOptionsHtml(shape)}</select>
                    <label>I型方向</label>
                    <select class="pe-skill-${skillIdx}-dir-line">${lineDirHtml('', shape, dir)}</select>
                    <label>长方形开口</label>
                    <select class="pe-skill-${skillIdx}-dir-rect" style="display:none;">${rectDirHtml('', shape, dir)}</select>
                </div>
            </div>
        `;
    }

    function attachSkillDirSync(card, skillIdx) {
        const shapeEl = card.querySelector(`.pe-skill-${skillIdx}-shape`);
        const dirLine = card.querySelector(`.pe-skill-${skillIdx}-dir-line`);
        const dirRect = card.querySelector(`.pe-skill-${skillIdx}-dir-rect`);
        if (!shapeEl || !dirLine || !dirRect) return;
        const sync = () => {
            const v = shapeEl.value;
            if (v === 'line') {
                dirLine.style.display = '';
                dirRect.style.display = 'none';
            } else if (v === 'rectangle') {
                dirLine.style.display = 'none';
                dirRect.style.display = '';
            } else {
                dirLine.style.display = '';
                dirRect.style.display = 'none';
            }
        };
        shapeEl.addEventListener('change', sync);
        sync();
    }

    function readSkillFromCard(card, skillIdx, prev) {
        const p = prev || {};
        const rangeShape = (card.querySelector(`.pe-skill-${skillIdx}-shape`) || {}).value || 'square';
        const dirLine = (card.querySelector(`.pe-skill-${skillIdx}-dir-line`) || {}).value || '';
        const dirRect = (card.querySelector(`.pe-skill-${skillIdx}-dir-rect`) || {}).value || '';
        let rangeDirection = null;
        if (rangeShape === 'line') rangeDirection = dirLine || null;
        else if (rangeShape === 'rectangle') rangeDirection = dirRect || null;
        else rangeDirection = null;

        const pcRaw = parseInt((card.querySelector(`.pe-skill-${skillIdx}-pc`) || {}).value, 10);
        const out = {
            ...p,
            powerCost: Number.isFinite(pcRaw) ? Math.max(0, pcRaw) : 100,
            icon: ((card.querySelector(`.pe-skill-${skillIdx}-icon`) || {}).value || p.icon || '✨').trim() || '✨',
            damageMultiplier: Math.max(0, parseFloat((card.querySelector(`.pe-skill-${skillIdx}-dmg`) || {}).value) || 1.5),
            rangeGrid: Math.max(0.5, parseFloat((card.querySelector(`.pe-skill-${skillIdx}-grid`) || {}).value) || 1),
            rangeShape,
            rangeDirection
        };
        const nameVal = (card.querySelector(`.pe-skill-${skillIdx}-name`) || {}).value;
        if (nameVal != null && String(nameVal).trim() !== '') {
            out.name = String(nameVal).trim();
        }
        return out;
    }

    function renderTowerCard(item) {
        const att = item.attributes || {};
        const uo = att.upgradeOverload || {};
        const ud = att.upgradeDefense || {};
        const pgh = att.powerGainPerHit != null ? att.powerGainPerHit : 1;
        const div = document.createElement('div');
        div.className = 'pe-tower-card';
        div.dataset.towerId = item.id;
        div.innerHTML = `
            <div class="pe-card-head"><span class="pe-card-icon">${escapeHtml(item.icon || '🏰')}</span> <strong>${escapeHtml(item.name || item.id)}</strong> <span class="pe-card-id">${escapeHtml(item.id)}</span></div>
            <div class="pe-card-sub">攻击命中获得威能</div>
            <div class="pe-inline"><input type="number" class="pe-tower-pgh" min="0" step="1" value="${pgh}" title="每次攻击命中敌人增加的威能"></div>
            <div class="pe-card-sub">战场升级 · 过载模式</div>
            <div class="pe-mini-grid">
                <label>攻击倍率</label><input type="number" class="pe-tower-ol-atk" min="1" step="0.05" value="${uo.attackMult != null ? uo.attackMult : 1.25}">
                <label>攻速倍率</label><input type="number" class="pe-tower-ol-spd" min="1" step="0.05" value="${uo.attackSpeedMult != null ? uo.attackSpeedMult : 1.25}">
                <label>威能消耗</label><input type="number" class="pe-tower-ol-pc" min="0" step="1" value="${uo.powerCost != null ? uo.powerCost : 25}">
            </div>
            <div class="pe-card-sub">战场升级 · 防御模式</div>
            <div class="pe-mini-grid">
                <label>护盾值</label><input type="number" class="pe-tower-def-sh" min="0" step="1" value="${ud.shield != null ? ud.shield : 20}">
                <label>威能消耗</label><input type="number" class="pe-tower-def-pc" min="0" step="1" value="${ud.powerCost != null ? ud.powerCost : 25}">
            </div>
        `;
        return div;
    }

    function renderHeroCard(item) {
        const att = item.attributes || {};
        const s1 = att.skill1 || {};
        const s2 = att.skill2 || {};
        const pgh = att.powerGainPerHit != null ? att.powerGainPerHit : 1;
        const div = document.createElement('div');
        div.className = 'pe-hero-card';
        div.dataset.heroId = item.id;
        div.innerHTML = `
            <div class="pe-card-head"><span class="pe-card-icon">${escapeHtml(item.icon || '🦸')}</span> <strong>${escapeHtml(item.name || item.id)}</strong> <span class="pe-card-id">${escapeHtml(item.id)}</span></div>
            <div class="pe-card-sub">普攻命中获得威能</div>
            <div class="pe-inline"><input type="number" class="pe-hero-pgh" min="0" step="1" value="${pgh}"></div>
            ${renderSkillFields(1, s1)}
            ${renderSkillFields(2, s2)}
        `;
        return div;
    }

    function render() {
        renderGlobalSection();

        towerListEl.innerHTML = '';
        const towers = getTowerItems();
        if (towers.length === 0) {
            towerListEl.innerHTML = '<p class="monster-editor-empty">暂无防御塔数据</p>';
        } else {
            towers.forEach(item => towerListEl.appendChild(renderTowerCard(item)));
        }

        heroListEl.innerHTML = '';
        const heroes = getHeroItems();
        if (heroes.length === 0) {
            heroListEl.innerHTML = '<p class="monster-editor-empty">暂无英雄数据</p>';
        } else {
            heroes.forEach(item => {
                const card = renderHeroCard(item);
                heroListEl.appendChild(card);
                attachSkillDirSync(card, 1);
                attachSkillDirSync(card, 2);
            });
        }
    }

    function saveGlobalSettings() {
        const key = window.POWER_GLOBAL_STORAGE_KEY || 'tower_defense_power_global_settings';
        const maxEl = document.getElementById('pe-global-power-max');
        const powerMax = Math.max(1, parseInt(maxEl && maxEl.value, 10) || 100);
        let heroSkillPowerDefault = 100;
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                const p = JSON.parse(raw);
                if (p && p.heroSkillPowerDefault != null) heroSkillPowerDefault = p.heroSkillPowerDefault;
            }
        } catch (e) { /* ignore */ }
        try {
            localStorage.setItem(key, JSON.stringify({ powerMax, heroSkillPowerDefault }));
        } catch (e) {
            console.warn('保存全局威能设置失败', e);
        }
        if (window.towerDefenseGame && typeof window.towerDefenseGame.applyPowerGlobalSettings === 'function') {
            window.towerDefenseGame.applyPowerGlobalSettings();
        }
    }

    function buildTowerOverrides() {
        const pool = getPool();
        const overrides = {};
        towerListEl.querySelectorAll('.pe-tower-card').forEach(card => {
            const id = card.dataset.towerId;
            if (!id) return;
            const item = pool.find(i => i.id === id);
            if (!item) return;
            const att = JSON.parse(JSON.stringify(item.attributes || {}));
            att.powerGainPerHit = Math.max(0, parseFloat(card.querySelector('.pe-tower-pgh') && card.querySelector('.pe-tower-pgh').value) || 0);
            att.upgradeOverload = {
                attackMult: Math.max(1, parseFloat(card.querySelector('.pe-tower-ol-atk') && card.querySelector('.pe-tower-ol-atk').value) || 1.25),
                attackSpeedMult: Math.max(1, parseFloat(card.querySelector('.pe-tower-ol-spd') && card.querySelector('.pe-tower-ol-spd').value) || 1.25),
                powerCost: Math.max(0, Math.floor(parseFloat(card.querySelector('.pe-tower-ol-pc') && card.querySelector('.pe-tower-ol-pc').value) || 0))
            };
            att.upgradeDefense = {
                shield: Math.max(0, Math.floor(parseFloat(card.querySelector('.pe-tower-def-sh') && card.querySelector('.pe-tower-def-sh').value) || 0)),
                powerCost: Math.max(0, Math.floor(parseFloat(card.querySelector('.pe-tower-def-pc') && card.querySelector('.pe-tower-def-pc').value) || 0))
            };
            overrides[id] = { attributes: att };
        });
        return overrides;
    }

    function buildHeroOverrides() {
        const pool = getPool();
        const overrides = {};
        heroListEl.querySelectorAll('.pe-hero-card').forEach(card => {
            const id = card.dataset.heroId;
            if (!id) return;
            const item = pool.find(i => i.id === id);
            if (!item) return;
            const att = JSON.parse(JSON.stringify(item.attributes || {}));
            att.powerGainPerHit = Math.max(0, parseFloat(card.querySelector('.pe-hero-pgh') && card.querySelector('.pe-hero-pgh').value) || 0);
            att.skill1 = readSkillFromCard(card, 1, att.skill1);
            att.skill2 = readSkillFromCard(card, 2, att.skill2);
            overrides[id] = { attributes: att };
        });
        return overrides;
    }

    function mergeTowerEditorStorage(newPartial) {
        const key = window.TOWER_OVERRIDES_STORAGE_KEY || 'tower_defense_tower_overrides';
        let base = {};
        try {
            const raw = localStorage.getItem(key);
            if (raw) base = JSON.parse(raw) || {};
        } catch (e) { base = {}; }
        Object.keys(newPartial).forEach(id => {
            const o = newPartial[id];
            const prev = base[id] || {};
            const prevAtt = prev.attributes || {};
            base[id] = {
                ...prev,
                ...o,
                attributes: { ...prevAtt, ...(o.attributes || {}) }
            };
        });
        try {
            localStorage.setItem(key, JSON.stringify(base));
        } catch (e) {
            console.warn('合并保存防御塔覆盖失败', e);
        }
        return base;
    }

    function mergeHeroEditorStorage(newPartial) {
        const key = window.HERO_OVERRIDES_STORAGE_KEY || 'tower_defense_hero_overrides';
        let base = {};
        try {
            const raw = localStorage.getItem(key);
            if (raw) base = JSON.parse(raw) || {};
        } catch (e) { base = {}; }
        Object.keys(newPartial).forEach(id => {
            const o = newPartial[id];
            const prev = base[id] || {};
            const prevAtt = prev.attributes || {};
            base[id] = {
                ...prev,
                ...o,
                attributes: { ...prevAtt, ...(o.attributes || {}) }
            };
        });
        try {
            localStorage.setItem(key, JSON.stringify(base));
        } catch (e) {
            console.warn('合并保存英雄覆盖失败', e);
        }
        return base;
    }

    function onApply() {
        const pool = getPool();
        if (!pool.length) {
            alert('物品池未就绪，请先加载游戏。');
            return;
        }

        saveGlobalSettings();

        const towerOv = buildTowerOverrides();
        const heroOv = buildHeroOverrides();

        const mergedTower = mergeTowerEditorStorage(towerOv);
        const mergedHero = mergeHeroEditorStorage(heroOv);

        if (typeof window.applyTowerOverrides === 'function') {
            window.applyTowerOverrides(pool, mergedTower);
        }
        if (typeof window.applyHeroOverrides === 'function') {
            window.applyHeroOverrides(pool, mergedHero);
        }

        console.log('[威能节能编辑器] 已应用防御塔字段', Object.keys(towerOv).length, '英雄字段', Object.keys(heroOv).length);
        close();
        refreshDisplays();
    }

    function init() {
        panelEl = document.getElementById('powerEfficiencyEditorPanel');
        globalEl = document.getElementById('powerEfficiencyGlobal');
        towerListEl = document.getElementById('powerEfficiencyTowerList');
        heroListEl = document.getElementById('powerEfficiencyHeroList');
        if (!panelEl || !globalEl || !towerListEl || !heroListEl) return;

        const openBtn = document.getElementById('openPowerEfficiencyEditorBtn');
        const closeBtn = document.getElementById('powerEfficiencyEditorCloseBtn');
        const applyBtn = document.getElementById('powerEfficiencyApplyBtn');

        if (openBtn) openBtn.addEventListener('click', open);
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (panelEl) panelEl.addEventListener('click', (e) => { if (e.target === panelEl) close(); });
        if (applyBtn) applyBtn.addEventListener('click', onApply);
    }

    window.PowerEfficiencyEditorPanel = { init, open, close, render };
})();

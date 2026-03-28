/**
 * 防御塔编辑器组件
 * 编辑防御塔的名称、图标、属性等；应用后保存到 localStorage，并立即更新物品栏、商店、悬浮窗及已放置塔的展示
 */
(function () {
    const TOWER_CATEGORIES = ['防御塔', '箭塔', '法师塔', '炮塔', '兵营'];
    const RARITY_OPTIONS = [
        { value: '普通', label: '普通' },
        { value: '稀有', label: '稀有' },
        { value: '史诗', label: '史诗' },
        { value: '传说', label: '传说' }
    ];
    const RANGE_SHAPE_OPTIONS = [
        { value: 'square', label: '方形(围一圈)' },
        { value: 'line', label: 'I型(一条线)' },
        { value: 'rectangle', label: '长方形(半包围)' }
    ];
    const RANGE_DIRECTION_LINE = [
        { value: '', label: '-' },
        { value: 'horizontal', label: '水平' },
        { value: 'vertical', label: '垂直' }
    ];
    const RANGE_DIRECTION_RECT = [
        { value: '', label: '-' },
        { value: 'n', label: '开口上' },
        { value: 's', label: '开口下' },
        { value: 'e', label: '开口右' },
        { value: 'w', label: '开口左' }
    ];
    let panelEl = null;
    let listEl = null;

    function getItemPool() {
        return (window.gameState && window.gameState.itemPool) || [];
    }

    function getTowerItems() {
        const pool = getItemPool();
        return pool.filter(item => item && TOWER_CATEGORIES.includes(item.category));
    }

    function open() {
        if (!panelEl) return;
        panelEl.classList.remove('hidden');
        render();
    }

    function close() {
        if (panelEl) panelEl.classList.add('hidden');
    }

    function applyOverrides(overrides) {
        const pool = getItemPool();
        if (!pool.length) {
            console.warn('物品池未就绪');
            return;
        }
        if (typeof window.applyTowerOverrides === 'function') {
            window.applyTowerOverrides(pool, overrides);
        }
        try {
            const key = window.TOWER_OVERRIDES_STORAGE_KEY || 'tower_defense_tower_overrides';
            localStorage.setItem(key, JSON.stringify(overrides));
            console.log('防御塔配置已应用并保存到本地');
        } catch (e) {
            console.warn('保存防御塔配置失败', e);
        }
        close();
        refreshAllTowerDisplays();
    }

    function refreshAllTowerDisplays() {
        if (window.towerDefenseGame && typeof window.towerDefenseGame.renderTowerInventory === 'function') {
            window.towerDefenseGame.renderTowerInventory();
            const shopList = document.getElementById('shopTowerInventoryList');
            if (shopList) window.towerDefenseGame.renderTowerInventory(shopList);
        }
        if (window.uiManager) {
            if (typeof window.uiManager.renderShop === 'function') window.uiManager.renderShop();
            if (typeof window.uiManager.renderInventory === 'function') window.uiManager.renderInventory();
        }
    }

    function buildDataFromDom() {
        const rows = listEl.querySelectorAll('.tower-editor-row');
        const overrides = {};
        rows.forEach(row => {
            const id = row.dataset.towerId;
            if (!id) return;
            const att = {};
            const getNum = (cls, def) => {
                const el = row.querySelector(cls);
                const v = el ? parseFloat(el.value) : def;
                return typeof v === 'number' && !Number.isNaN(v) ? v : def;
            };
            const getStr = (cls, def) => {
                const el = row.querySelector(cls);
                const v = el ? el.value.trim() : '';
                return v !== '' ? v : def;
            };
            att.baseAttack = getNum('.tower-base-attack', 10);
            att.attackSpeed = getNum('.tower-attack-speed', 1);
            att.rangeGrid = Math.max(0.5, getNum('.tower-range-grid', 1));
            att.health = getNum('.tower-health', 10);
            att.baseHealth = att.health;
            att.powerGainPerHit = Math.max(0, getNum('.tower-power-gain', 1));
            att.deploySpiritCost = Math.max(0, Math.floor(getNum('.tower-deploy-spirit', 5)));
            att.upgradeOverload = {
                attackMult: Math.max(1, getNum('.tower-upgrade-ol-atk', 1.25)),
                attackSpeedMult: Math.max(1, getNum('.tower-upgrade-ol-spd', 1.25)),
                powerCost: Math.max(0, Math.floor(getNum('.tower-upgrade-ol-power', 25)))
            };
            att.upgradeDefense = {
                shield: Math.max(0, Math.floor(getNum('.tower-upgrade-def-shield', 20))),
                powerCost: Math.max(0, Math.floor(getNum('.tower-upgrade-def-power', 25)))
            };
            // 攻击模式：普通位置 / 路径上，各自一套攻击、攻速、范围（形状+方向）
            const getMode = (prefix) => {
                const attack = getNum(`.tower-${prefix}-attack`, 10);
                const attackSpeed = getNum(`.tower-${prefix}-attack-speed`, 1);
                const rangeGrid = Math.max(0.5, getNum(`.tower-${prefix}-range-grid`, 1));
                const shapeEl = row.querySelector(`.tower-${prefix}-range-shape`);
                const rangeShape = (shapeEl && shapeEl.value) || 'square';
                const dirEl = row.querySelector(`.tower-${prefix}-range-direction`);
                const dirRectEl = row.querySelector(`.tower-${prefix}-range-direction-rect`);
                const rangeDirection = (rangeShape === 'rectangle' ? (dirRectEl && dirRectEl.value) : (dirEl && dirEl.value)) || '';
                return { attack, attackSpeed, rangeGrid, rangeShape, rangeDirection: rangeDirection || null };
            };
            att.attackModes = { normal: getMode('normal'), path: getMode('path') };
            overrides[id] = {
                name: getStr('.tower-name', id),
                icon: getStr('.tower-icon', '🏰'),
                description: getStr('.tower-description', ''),
                price: getNum('.tower-price', 100),
                rarity: getStr('.tower-rarity', '普通'),
                category: getStr('.tower-category', '防御塔'),
                attributes: att
            };
        });
        return overrides;
    }

    function modeDefaults(att, mode) {
        const m = att.attackModes && att.attackModes[mode];
        return {
            attack: m?.attack != null ? m.attack : (att.baseAttack != null ? att.baseAttack : 10),
            attackSpeed: m?.attackSpeed != null ? m.attackSpeed : (att.attackSpeed != null ? att.attackSpeed : 1),
            rangeGrid: m?.rangeGrid != null ? m.rangeGrid : (att.rangeGrid != null ? att.rangeGrid : 1),
            rangeShape: m?.rangeShape || 'square',
            rangeDirection: m?.rangeDirection ?? ''
        };
    }

    function modeBlock(prefix, label, att, mode) {
        const d = modeDefaults(att, mode);
        const shapeOpts = RANGE_SHAPE_OPTIONS.map(o => `<option value="${o.value}" ${o.value === d.rangeShape ? 'selected' : ''}>${o.label}</option>`).join('');
        const dirLine = RANGE_DIRECTION_LINE.map(o => `<option value="${o.value}" ${o.value === d.rangeDirection ? 'selected' : ''}>${o.label}</option>`).join('');
        const dirRect = RANGE_DIRECTION_RECT.map(o => `<option value="${o.value}" ${o.value === d.rangeDirection ? 'selected' : ''}>${o.label}</option>`).join('');
        return `
            <div class="tower-editor-mode-block">
                <div class="tower-editor-mode-title">${label}</div>
                <label>攻击</label><input type="number" class="tower-${prefix}-attack" min="0" value="${d.attack}">
                <label>攻速</label><input type="number" class="tower-${prefix}-attack-speed" min="0.1" step="0.1" value="${d.attackSpeed}">
                <label>射程格</label><input type="number" class="tower-${prefix}-range-grid" min="0.5" step="0.5" value="${d.rangeGrid}">
                <label>范围形状</label><select class="tower-${prefix}-range-shape">${shapeOpts}</select>
                <label>范围方向</label><select class="tower-${prefix}-range-direction" title="I型选水平/垂直，长方形选开口方向">${dirLine}</select>
                <select class="tower-${prefix}-range-direction-rect" style="display:none;" title="长方形开口">${dirRect}</select>
            </div>
        `;
    }

    function addTowerRow(item) {
        const att = item.attributes || {};
        const name = (item.name || item.id || '').replace(/"/g, '&quot;');
        const icon = (item.icon || '🏰').replace(/"/g, '&quot;');
        const desc = (item.description || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        const rarity = item.rarity || (item.quality ? RARITY_OPTIONS[Math.max(0, item.quality - 1)].value : '普通');
        const category = (item.category || '防御塔').replace(/"/g, '&quot;');
        const norm = modeDefaults(att, 'normal');
        const uo = att.upgradeOverload || {};
        const ud = att.upgradeDefense || {};
        const olAtk = uo.attackMult != null ? uo.attackMult : 1.25;
        const olSpd = uo.attackSpeedMult != null ? uo.attackSpeedMult : 1.25;
        const olPow = uo.powerCost != null ? uo.powerCost : 25;
        const defSh = ud.shield != null ? ud.shield : 20;
        const defPow = ud.powerCost != null ? ud.powerCost : 25;
        const row = document.createElement('div');
        row.className = 'tower-editor-row';
        row.dataset.towerId = item.id;
        row.innerHTML = `
            <div class="monster-editor-row-head">
                <span class="monster-editor-id">ID: ${(item.id || '').replace(/"/g, '&quot;')}</span>
            </div>
            <div class="monster-editor-row-body tower-editor-row-body">
                <label>名称</label>
                <input type="text" class="tower-name" value="${name}" placeholder="名称">
                <label>图标</label>
                <input type="text" class="tower-icon" value="${icon}" placeholder="emoji" maxlength="4" style="width:4em;">
                <label>分类</label>
                <input type="text" class="tower-category" value="${category}" list="tower-category-list" style="width:5em;">
                <label>稀有度</label>
                <select class="tower-rarity">
                    ${RARITY_OPTIONS.map(r => `<option value="${r.value}" ${r.value === rarity ? 'selected' : ''}>${r.label}</option>`).join('')}
                </select>
                <label>描述</label>
                <input type="text" class="tower-description" value="${desc}" placeholder="描述" style="min-width:120px;">
                <label>价格</label>
                <input type="number" class="tower-price" min="0" value="${item.price != null ? item.price : 100}">
                <label>攻击</label>
                <input type="number" class="tower-base-attack" min="0" value="${norm.attack}" title="与普通位置一致，兼容用">
                <label>攻速</label>
                <input type="number" class="tower-attack-speed" min="0.1" step="0.1" value="${norm.attackSpeed}">
                <label>射程格</label>
                <input type="number" class="tower-range-grid" min="0.5" step="0.5" value="${norm.rangeGrid}" title="与普通位置一致，兼容用">
                <label>生命</label>
                <input type="number" class="tower-health" min="1" value="${att.health != null ? att.health : (att.baseHealth != null ? att.baseHealth : 10)}">
                <label>能量获取</label>
                <input type="number" class="tower-power-gain" min="0" value="${att.powerGainPerHit != null ? att.powerGainPerHit : 1}" title="每次攻击获得的威能点数">
                <label title="在战场上放置该塔消耗的灵力">部署灵力</label>
                <input type="number" class="tower-deploy-spirit" min="0" step="1" value="${att.deploySpiritCost != null ? att.deploySpiritCost : 5}">
                <div class="tower-editor-upgrade-block">
                    <div class="tower-editor-attack-modes-title">战场升级（点击场上塔切换）</div>
                    <label title="过载模式：在基础攻击上乘以该倍率">过载·攻击倍率</label>
                    <input type="number" class="tower-upgrade-ol-atk" min="1" step="0.05" value="${olAtk}">
                    <label title="过载模式：在基础攻速上乘以该倍率">过载·攻速倍率</label>
                    <input type="number" class="tower-upgrade-ol-spd" min="1" step="0.05" value="${olSpd}">
                    <label title="防御模式：获得的护盾上限（优先吸收近战伤害）">防御·护盾值</label>
                    <input type="number" class="tower-upgrade-def-shield" min="0" step="1" value="${defSh}">
                    <label title="切换到过载模式时消耗的威能">过载·威能消耗</label>
                    <input type="number" class="tower-upgrade-ol-power" min="0" step="1" value="${olPow}">
                    <label title="切换到防御模式时消耗的威能">防御·威能消耗</label>
                    <input type="number" class="tower-upgrade-def-power" min="0" step="1" value="${defPow}">
                </div>
                <div class="tower-editor-attack-modes">
                    <div class="tower-editor-attack-modes-title">攻击模式（普通位置 / 路径上）</div>
                    ${modeBlock('normal', '普通位置', att, 'normal')}
                    ${modeBlock('path', '路径上', att, 'path')}
                </div>
            </div>
        `;
        listEl.appendChild(row);
        // 范围方向：根据形状切换 I型(水平/垂直) 与 长方形(开口)
        const normShape = row.querySelector('.tower-normal-range-shape');
        const normDir = row.querySelector('.tower-normal-range-direction');
        const normDirRect = row.querySelector('.tower-normal-range-direction-rect');
        const pathShape = row.querySelector('.tower-path-range-shape');
        const pathDir = row.querySelector('.tower-path-range-direction');
        const pathDirRect = row.querySelector('.tower-path-range-direction-rect');
        function syncDirection(shapeEl, dirEl, dirRectEl) {
            if (!shapeEl || !dirEl || !dirRectEl) return;
            const v = shapeEl.value;
            if (v === 'line') {
                dirEl.style.display = '';
                dirRectEl.style.display = 'none';
            } else if (v === 'rectangle') {
                dirEl.style.display = 'none';
                dirRectEl.style.display = '';
            } else {
                dirEl.style.display = '';
                dirRectEl.style.display = 'none';
            }
        }
        if (normShape) {
            normShape.addEventListener('change', () => syncDirection(normShape, normDir, normDirRect));
            syncDirection(normShape, normDir, normDirRect);
        }
        if (pathShape) {
            pathShape.addEventListener('change', () => syncDirection(pathShape, pathDir, pathDirRect));
            syncDirection(pathShape, pathDir, pathDirRect);
        }
    }

    function render() {
        listEl.innerHTML = '';
        const towers = getTowerItems();
        if (towers.length === 0) {
            listEl.innerHTML = '<p class="monster-editor-empty">暂无防御塔（需先加载游戏）</p>';
            return;
        }
        towers.forEach(item => addTowerRow(item));
    }

    function onApply() {
        const overrides = buildDataFromDom();
        if (Object.keys(overrides).length === 0) {
            alert('没有可保存的防御塔');
            return;
        }
        applyOverrides(overrides);
    }

    function init() {
        panelEl = document.getElementById('towerEditorPanel');
        listEl = document.getElementById('towerEditorList');
        if (!panelEl || !listEl) return;

        const openBtn = document.getElementById('openTowerEditorBtn');
        const closeBtn = document.getElementById('towerEditorCloseBtn');
        const applyBtn = document.getElementById('towerEditorApplyBtn');

        if (openBtn) openBtn.addEventListener('click', open);
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (panelEl) panelEl.addEventListener('click', (e) => { if (e.target === panelEl) close(); });
        if (applyBtn) applyBtn.addEventListener('click', onApply);
    }

    window.TowerEditorPanel = { init, open, close, getTowerItems, applyOverrides, refreshAllTowerDisplays };
})();

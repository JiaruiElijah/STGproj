/**
 * 英雄编辑器组件
 * 支持编辑英雄名称/图标/描述/基础属性，并可设置英雄加入物品栏的数量（可保存到本地）。
 */
(function () {
    const HERO_CATEGORY = '英雄';
    const RANGE_SHAPE_OPTIONS = [
        { value: 'square', label: '方形(围一圈)' },
        { value: 'line', label: 'I型(一条线)' },
        { value: 'rectangle', label: '长方形(半包围)' }
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
    let listEl = null;

    function getItemPool() {
        return (window.gameState && window.gameState.itemPool) || [];
    }

    function getHeroItems() {
        const pool = getItemPool();
        return pool.filter(item => item && item.category === HERO_CATEGORY);
    }

    function getSavedHeroInventoryOverride() {
        if (typeof window.loadSavedHeroInventoryOverride === 'function') {
            return window.loadSavedHeroInventoryOverride() || {};
        }
        try {
            const key = window.HERO_INVENTORY_OVERRIDE_STORAGE_KEY || 'tower_defense_hero_inventory_override';
            const raw = localStorage.getItem(key);
            if (!raw) return {};
            const data = JSON.parse(raw);
            return data && typeof data === 'object' ? data : {};
        } catch (e) {
            return {};
        }
    }

    function getSavedHeroOverridesKey() {
        return window.HERO_OVERRIDES_STORAGE_KEY || 'tower_defense_hero_overrides';
    }

    function escapeHtml(str) {
        return (str == null ? '' : String(str)).replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    const BASE_SPIRIT_CONFIG_KEY = 'tower_defense_base_spirit_config';

    /**
     * 从本地读取「基地产灵力」到面板输入框（与 TowerDefenseGame 使用同一 key）
     */
    function loadBaseSpiritInputs() {
        const ivEl = document.getElementById('baseSpiritIntervalMs');
        const amtEl = document.getElementById('baseSpiritPerCycle');
        if (!ivEl || !amtEl) return;
        try {
            const raw = localStorage.getItem(BASE_SPIRIT_CONFIG_KEY);
            const d = raw ? JSON.parse(raw) : {};
            ivEl.value = d.intervalMs != null ? d.intervalMs : 10000;
            amtEl.value = d.spiritPerCycle != null ? d.spiritPerCycle : 20;
        } catch (e) {
            ivEl.value = 10000;
            amtEl.value = 20;
        }
    }

    /**
     * 保存基地产灵力并立即应用到运行中的塔防实例
     */
    function saveBaseSpiritFromInputs() {
        const ivEl = document.getElementById('baseSpiritIntervalMs');
        const amtEl = document.getElementById('baseSpiritPerCycle');
        if (!ivEl || !amtEl) return;
        const intervalMs = Math.max(500, parseInt(ivEl.value, 10) || 10000);
        const spiritPerCycle = Math.max(1, parseInt(amtEl.value, 10) || 20);
        try {
            localStorage.setItem(BASE_SPIRIT_CONFIG_KEY, JSON.stringify({ intervalMs, spiritPerCycle }));
        } catch (e) {
            console.warn('保存基地产灵力配置失败', e);
        }
        if (window.towerDefenseGame && typeof window.towerDefenseGame.applyBaseSpiritConfig === 'function') {
            window.towerDefenseGame.applyBaseSpiritConfig({ intervalMs, spiritPerCycle });
        }
    }

    function open() {
        if (!panelEl) return;
        panelEl.classList.remove('hidden');
        loadBaseSpiritInputs();
        render();
    }

    function close() {
        if (panelEl) panelEl.classList.add('hidden');
    }

    function renderHeroRow(item, savedInvOverride) {
        const att = item.attributes || {};
        const icon = item.icon || '🛡️';
        const name = item.name || item.id || '';
        const desc = item.description || '';
        const rarity = item.rarity || (item.quality ? ['普通', '稀有', '史诗', '传说'][item.quality - 1] : '普通');
        const price = item.price != null ? item.price : (item.basePrice != null ? item.basePrice : 100);

        const count = (savedInvOverride && typeof savedInvOverride[item.id] === 'number')
            ? Math.max(0, savedInvOverride[item.id])
            : ((window.gameState && window.gameState.inventory && window.gameState.inventory.get(item.id)) || 0);

        const baseAttack = att.baseAttack != null ? att.baseAttack : 0;
        const attackSpeed = att.attackSpeed != null ? att.attackSpeed : 1;
        const rangeGrid = att.rangeGrid != null ? att.rangeGrid : (att.range != null ? att.range : 1);
        const health = att.health != null ? att.health : (att.baseHealth != null ? att.baseHealth : 10);
        const powerGainPerHit = att.powerGainPerHit != null ? att.powerGainPerHit : 1;
        const deploySpirit = att.deploySpiritCost != null ? att.deploySpiritCost : 5;

        // 技能字段：分开存放为 skill1 / skill2（每个技能包含 icon + damageMultiplier + range 配置）
        const skill1 = att.skill1 || {};
        const skill2 = att.skill2 || {};
        const skill1Icon = skill1.icon || '✨';
        const skill2Icon = skill2.icon || '✨';
        const skill1DamageMultiplier = skill1.damageMultiplier != null ? skill1.damageMultiplier : 1.5;
        const skill2DamageMultiplier = skill2.damageMultiplier != null ? skill2.damageMultiplier : 1.5;
        const skill1RangeGrid = skill1.rangeGrid != null ? skill1.rangeGrid : 1;
        const skill2RangeGrid = skill2.rangeGrid != null ? skill2.rangeGrid : 1;
        const skill1Shape = skill1.rangeShape || 'square';
        const skill2Shape = skill2.rangeShape || 'square';
        const skill1DirLine = skill1.rangeDirection || '';
        const skill2DirLine = skill2.rangeDirection || '';
        const skill1DirRect = skill1.rangeDirection || '';
        const skill2DirRect = skill2.rangeDirection || '';

        const aura = att.aura || {};
        const auraEnabled = aura.enabled === true;
        const auraRg = aura.rangeGrid != null ? aura.rangeGrid : 2;
        const auraShape = aura.rangeShape || 'square';
        const auraLine = aura.rangeDirectionLine != null ? aura.rangeDirectionLine : '';
        const auraRect = aura.rangeDirectionRect != null ? aura.rangeDirectionRect : '';
        const auraAtk = aura.attackBonusPercent != null ? aura.attackBonusPercent : 10;
        const auraSpd = aura.attackSpeedBonusPercent != null ? aura.attackSpeedBonusPercent : 0;
        const auraShapeOpts = RANGE_SHAPE_OPTIONS.map(o => `<option value="${o.value}" ${o.value === auraShape ? 'selected' : ''}>${o.label}</option>`).join('');
        const auraLineOpts = LINE_DIR_OPTIONS.map(o => `<option value="${o.value}" ${o.value === (auraShape === 'line' ? auraLine : '') ? 'selected' : ''}>${o.label}</option>`).join('');
        const auraRectOpts = RECT_DIR_OPTIONS.map(o => `<option value="${o.value}" ${o.value === (auraShape === 'rectangle' ? auraRect : '') ? 'selected' : ''}>${o.label}</option>`).join('');

        const renderSkillBlock = (skillIndex) => {
            const s = skillIndex === 1 ? skill1 : skill2;
            const sIcon = (s.icon || '✨').replace(/"/g, '&quot;');
            const sName = escapeHtml(s.name != null ? String(s.name) : '');
            const sPowerCost = s.powerCost != null ? s.powerCost : 100;
            const sSpirit = s.spiritCost != null ? s.spiritCost : 0;
            const sCd = s.cooldownSec != null ? s.cooldownSec : 8;
            const sDamage = s.damageMultiplier != null ? s.damageMultiplier : 1.5;
            const sGrid = s.rangeGrid != null ? s.rangeGrid : 1;
            const sShape = s.rangeShape || 'square';
            const sDir = s.rangeDirection || '';
            const shapeOpts = RANGE_SHAPE_OPTIONS.map(o => `<option value="${o.value}" ${o.value === sShape ? 'selected' : ''}>${o.label}</option>`).join('');
            const lineDirOpts = LINE_DIR_OPTIONS.map(o => `<option value="${o.value}" ${o.value === (sShape === 'line' ? sDir : '') ? 'selected' : ''}>${o.label}</option>`).join('');
            const rectDirOpts = RECT_DIR_OPTIONS.map(o => `<option value="${o.value}" ${o.value === (sShape === 'rectangle' ? sDir : '') ? 'selected' : ''}>${o.label}</option>`).join('');
            return `
                <div class="tower-editor-attack-modes" style="margin-top: 10px;">
                    <div class="tower-editor-attack-modes-title">技能${skillIndex}（大招）</div>
                    <div>
                        <label>名称</label>
                        <input type="text" class="tower-skill-${skillIndex}-name" value="${sName}" placeholder="技能名称" style="min-width:100px;">
                        <label title="施放消耗的灵力（局内下方显示）">灵力消耗</label>
                        <input type="number" class="tower-skill-${skillIndex}-spirit-cost" min="0" step="1" value="${sSpirit}">
                        <label title="施放该技能消耗的威能（需满条）">威能消耗</label>
                        <input type="number" class="tower-skill-${skillIndex}-power-cost" min="0" step="1" value="${sPowerCost}">
                        <label title="施放后冷却秒数">冷却(秒)</label>
                        <input type="number" class="tower-skill-${skillIndex}-cooldown-sec" min="0" step="0.5" value="${sCd}">
                        <label>图标</label>
                        <input type="text" class="tower-skill-${skillIndex}-icon" value="${sIcon}" placeholder="emoji" maxlength="4" style="width:4em;">
                        <label>伤害倍率</label>
                        <input type="number" class="tower-skill-${skillIndex}-damage-mult" min="0" step="0.1" value="${sDamage}">
                        <label>射程格</label>
                        <input type="number" class="tower-skill-${skillIndex}-range-grid" min="0.5" step="0.5" value="${sGrid}">
                        <label>范围形状</label>
                        <select class="tower-skill-${skillIndex}-range-shape">${shapeOpts}</select>
                        <label>I型方向</label>
                        <select class="tower-skill-${skillIndex}-range-direction-line">${lineDirOpts}</select>
                        <label>长方形开口</label>
                        <select class="tower-skill-${skillIndex}-range-direction-rect">${rectDirOpts}</select>
                    </div>
                </div>
            `;
        };

        const renderAuraBlock = () => `
            <div class="hero-aura-block tower-editor-attack-modes" style="margin-top: 10px;">
                <div class="tower-editor-attack-modes-title">英雄光环（增益范围内防御塔）</div>
                <div>
                    <label><input type="checkbox" class="hero-aura-enabled" ${auraEnabled ? 'checked' : ''}> 启用光环</label>
                    <label>范围格</label>
                    <input type="number" class="hero-aura-range-grid" min="0.5" step="0.5" value="${auraRg}" title="以英雄所在格为中心">
                    <label>范围形状</label>
                    <select class="hero-aura-range-shape">${auraShapeOpts}</select>
                    <label>I型方向</label>
                    <select class="hero-aura-range-direction-line">${auraLineOpts}</select>
                    <label>长方形开口</label>
                    <select class="hero-aura-range-direction-rect">${auraRectOpts}</select>
                    <label title="范围内友方塔攻击力加成百分比">攻击加成%</label>
                    <input type="number" class="hero-aura-atk-pct" min="0" step="1" value="${auraAtk}">
                    <label title="范围内友方塔攻速加成百分比">攻速加成%</label>
                    <input type="number" class="hero-aura-spd-pct" min="0" step="1" value="${auraSpd}">
                </div>
            </div>
        `;

        const row = document.createElement('div');
        row.className = 'tower-editor-row';
        row.dataset.heroId = item.id;
        row.innerHTML = `
            <div class="monster-editor-row-head">
                <span class="monster-editor-id">ID: ${escapeHtml(item.id)}</span>
            </div>
            <div class="monster-editor-row-body tower-editor-row-body">
                <label>名称</label>
                <input type="text" class="tower-name" value="${escapeHtml(name)}" placeholder="名称">
                <label>图标</label>
                <input type="text" class="tower-icon" value="${escapeHtml(icon)}" placeholder="emoji" maxlength="4" style="width:4em;">
                <label>描述</label>
                <input type="text" class="tower-description" value="${escapeHtml(desc)}" placeholder="描述" style="min-width:120px;">
                <label>价格</label>
                <input type="number" class="tower-price" min="0" value="${price}">
                <label>攻击</label>
                <input type="number" class="tower-base-attack" min="0" value="${baseAttack}" title="基础攻击">
                <label>攻速</label>
                <input type="number" class="tower-attack-speed" min="0.1" step="0.1" value="${attackSpeed}" title="攻击速度">
                <label>射程格</label>
                <input type="number" class="tower-range-grid" min="0.5" step="0.5" value="${rangeGrid}" title="半径格数（1=3×3）">
                <label>生命</label>
                <input type="number" class="tower-health" min="1" value="${health}">
                <label>能量获取</label>
                <input type="number" class="tower-power-gain" min="0" value="${powerGainPerHit}" title="每次攻击获得的威能点数">
                <label title="在战场上部署该英雄消耗的灵力">部署灵力</label>
                <input type="number" class="tower-deploy-spirit" min="0" step="1" value="${deploySpirit}">
                <label>物品栏x</label>
                <input type="number" class="hero-inventory-count" min="0" value="${count}" title="放到玩家物品栏的数量（0 表示移除）">
                ${renderAuraBlock()}
                ${renderSkillBlock(1)}
                ${renderSkillBlock(2)}
            </div>
        `;
        listEl.appendChild(row);
    }

    function buildHeroOverridesAndInventory() {
        const rows = listEl.querySelectorAll('.tower-editor-row');
        const heroOverrides = {};
        const heroInventory = {};

        rows.forEach(row => {
            const id = row.dataset.heroId;
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

            const baseAttack = getNum('.tower-base-attack', 10);
            const attackSpeed = getNum('.tower-attack-speed', 1);
            const rangeGrid = Math.max(0.5, getNum('.tower-range-grid', 1));
            const health = getNum('.tower-health', 10);
            const powerGainPerHit = Math.max(0, getNum('.tower-power-gain', 1));
            const price = getNum('.tower-price', 100);

            const count = Math.max(0, parseInt((row.querySelector('.hero-inventory-count')?.value || '0'), 10) || 0);
            const deploySpiritCost = Math.max(0, getNum('.tower-deploy-spirit', 5));

            const getSkill = (idx) => {
                const name = (row.querySelector(`.tower-skill-${idx}-name`)?.value || '').trim();
                const spiritCost = Math.max(0, getNum(`.tower-skill-${idx}-spirit-cost`, 0));
                const powerCost = Math.max(0, getNum(`.tower-skill-${idx}-power-cost`, 100));
                const cooldownSec = Math.max(0, getNum(`.tower-skill-${idx}-cooldown-sec`, 8));
                const icon = (row.querySelector(`.tower-skill-${idx}-icon`)?.value || '').trim();
                const damageMultiplier = getNum(`.tower-skill-${idx}-damage-mult`, 1.5);
                const rangeGrid = Math.max(0.5, getNum(`.tower-skill-${idx}-range-grid`, 1));
                const rangeShape = (row.querySelector(`.tower-skill-${idx}-range-shape`)?.value || 'square');
                const dirLine = (row.querySelector(`.tower-skill-${idx}-range-direction-line`)?.value || '');
                const dirRect = (row.querySelector(`.tower-skill-${idx}-range-direction-rect`)?.value || '');
                let rangeDirection = null;
                if (rangeShape === 'line') rangeDirection = dirLine || null;
                else if (rangeShape === 'rectangle') rangeDirection = dirRect || null;
                else rangeDirection = null;
                return {
                    name: name || undefined,
                    spiritCost,
                    powerCost,
                    cooldownSec,
                    icon: icon || '✨',
                    damageMultiplier,
                    rangeGrid,
                    rangeShape,
                    rangeDirection
                };
            };

            const auraShape = (row.querySelector('.hero-aura-range-shape')?.value || 'square');
            const dirAuraLine = (row.querySelector('.hero-aura-range-direction-line')?.value || '');
            const dirAuraRect = (row.querySelector('.hero-aura-range-direction-rect')?.value || '');
            let auraRangeDirection = null;
            if (auraShape === 'line') auraRangeDirection = dirAuraLine || null;
            else if (auraShape === 'rectangle') auraRangeDirection = dirAuraRect || null;

            att.aura = {
                enabled: !!(row.querySelector('.hero-aura-enabled')?.checked),
                rangeGrid: Math.max(0.5, getNum('.hero-aura-range-grid', 2)),
                rangeShape: auraShape,
                rangeDirection: auraRangeDirection,
                rangeDirectionLine: dirAuraLine,
                rangeDirectionRect: dirAuraRect,
                attackBonusPercent: Math.max(0, getNum('.hero-aura-atk-pct', 10)),
                attackSpeedBonusPercent: Math.max(0, getNum('.hero-aura-spd-pct', 0))
            };

            att.baseAttack = baseAttack;
            att.attackSpeed = attackSpeed;
            att.rangeGrid = rangeGrid;
            att.health = health;
            att.baseHealth = health;
            att.powerGainPerHit = powerGainPerHit;
            att.deploySpiritCost = deploySpiritCost;
            att.skill1 = getSkill(1);
            att.skill2 = getSkill(2);

            heroOverrides[id] = {
                name: getStr('.tower-name', id),
                icon: getStr('.tower-icon', '🛡️'),
                description: getStr('.tower-description', ''),
                price: price,
                category: HERO_CATEGORY,
                attributes: att
            };

            heroInventory[id] = count;
        });

        return { heroOverrides, heroInventory };
    }

    function render() {
        listEl.innerHTML = '';
        const heroes = getHeroItems();
        if (heroes.length === 0) {
            listEl.innerHTML = '<p class="monster-editor-empty">暂无英雄（请先加载游戏/物品数据）</p>';
            return;
        }
        const savedInvOverride = getSavedHeroInventoryOverride();
        heroes.forEach(item => renderHeroRow(item, savedInvOverride));
    }

    function refreshDisplays() {
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

    function onApply() {
        const { heroOverrides, heroInventory } = buildHeroOverridesAndInventory();
        const pool = getItemPool();
        if (!pool.length) {
            alert('物品池未就绪，请先加载游戏。');
            return;
        }

        if (typeof window.applyHeroOverrides === 'function') {
            window.applyHeroOverrides(pool, heroOverrides);
        }

        try {
            localStorage.setItem(getSavedHeroOverridesKey(), JSON.stringify(heroOverrides));
        } catch (e) {
            console.warn('保存英雄配置失败', e);
        }

        if (typeof window.applyHeroInventoryOverride === 'function' && window.gameState) {
            window.applyHeroInventoryOverride(window.gameState, heroInventory, pool);
        }

        try {
            const key = window.HERO_INVENTORY_OVERRIDE_STORAGE_KEY || 'tower_defense_hero_inventory_override';
            localStorage.setItem(key, JSON.stringify(heroInventory));
        } catch (e) {
            console.warn('保存英雄物品栏配置失败', e);
        }

        saveBaseSpiritFromInputs();

        close();
        refreshDisplays();
    }

    function init() {
        panelEl = document.getElementById('heroEditorPanel');
        listEl = document.getElementById('heroEditorList');
        if (!panelEl || !listEl) return;

        // STG 顶栏为 #stgOpenHeroEditorBtn；旧塔防页曾用 #openHeroEditorBtn
        const openBtn = document.getElementById('stgOpenHeroEditorBtn') || document.getElementById('openHeroEditorBtn');
        const closeBtn = document.getElementById('heroEditorCloseBtn');
        const applyBtn = document.getElementById('heroEditorApplyBtn');

        if (openBtn) openBtn.addEventListener('click', open);
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (panelEl) panelEl.addEventListener('click', (e) => { if (e.target === panelEl) close(); });
        if (applyBtn) applyBtn.addEventListener('click', onApply);
    }

    window.HeroEditorPanel = { init, open, close, render };
})();


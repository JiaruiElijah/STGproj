/**
 * 怪物编辑器组件
 * 编辑各怪物种类的默认属性：种类、生命、攻击力、移速、金币、图标、颜色等
 * 应用后会保存到 localStorage，刷新页面后会自动加载，保留编辑结果。
 */
(function () {
    const STORAGE_KEY = 'tower_defense_enemy_types'; // 本地存储 key，刷新后依此加载
    /** 内置三种不可在编辑器中删除 */
    const BUILTIN_TYPE_IDS = ['normal', 'fast', 'tank'];

    let game = null;
    let panelEl = null;
    let listEl = null;

    /**
     * 由存档中的 stgBulletPattern + stgEmitStyle 推导统一下拉值「弹幕发射样式」
     */
    function danmakuStyleFromData(d) {
        const pat = (d.stgBulletPattern === 'aim' || d.stgBulletPattern === 'straight' || d.stgBulletPattern === 'random' || d.stgBulletPattern === 'none')
            ? d.stgBulletPattern
            : 'random';
        const emit = (d.stgEmitStyle === 'fan' || d.stgEmitStyle === 'ring' || d.stgEmitStyle === 'laser' || d.stgEmitStyle === 'single')
            ? d.stgEmitStyle
            : 'single';
        if (pat === 'none') return 'none';
        if (emit === 'fan') return 'fan';
        if (emit === 'ring') return 'ring';
        if (emit === 'laser') return 'laser';
        if (emit === 'single') {
            if (pat === 'random') return 'single_random';
            if (pat === 'aim') return 'single_aim';
            if (pat === 'straight') return 'single_straight';
        }
        return 'single_random';
    }

    /** 扇形/激光的主方向（瞄准 vs 竖直向下） */
    function mainDirFromData(d) {
        return d.stgBulletPattern === 'aim' ? 'aim' : 'straight';
    }

    /** 未写入 stgBulletKind 的旧档：仅当分裂延迟>0 时视为分裂弹 */
    function bulletKindFromData(d) {
        if (d.stgBulletKind === 'split') return 'split';
        if (d.stgBulletKind === 'normal') return 'normal';
        if (d.stgSplitDelaySec > 0) return 'split';
        return 'normal';
    }

    function moveModeFromData(d) {
        const m = d.stgMoveMode;
        if (
            m === 'straight' ||
            m === 'homing' ||
            m === 'anchor' ||
            m === 'arc_edges' ||
            m === 'homing_legacy' ||
            m === 'horizontal_left' ||
            m === 'horizontal_right'
        ) {
            return m;
        }
        return 'homing_legacy';
    }

    function syncStgMovePanels(row) {
        if (!row) return;
        const sel = row.querySelector('.monster-stg-move-mode');
        const v = sel ? sel.value : 'homing_legacy';
        const rs = row.querySelector('.monster-stg-move-straight');
        const an = row.querySelector('.monster-stg-move-anchor');
        const ar = row.querySelector('.monster-stg-move-arc');
        if (rs) rs.classList.toggle('hidden', v !== 'straight');
        if (an) an.classList.toggle('hidden', v !== 'anchor');
        if (ar) ar.classList.toggle('hidden', v !== 'arc_edges');
    }

    function syncBulletKindRow(row) {
        if (!row) return;
        const kind = row.querySelector('.monster-stg-bullet-kind');
        const wrap = row.querySelector('.monster-stg-split-params');
        const show = kind && kind.value === 'split';
        if (wrap) wrap.classList.toggle('hidden', !show);
    }

    /**
     * 根据「弹幕发射样式」显示扇形/环形/激光块与主方向行，避免无关参数挤在一屏
     */
    /** 稳定排序：内置顺序在前，其余按字母序 */
    function sortMonsterTypeIds(ids) {
        const set = new Set(ids);
        const out = [];
        BUILTIN_TYPE_IDS.forEach((id) => {
            if (set.has(id)) {
                out.push(id);
                set.delete(id);
            }
        });
        Array.from(set).sort().forEach((id) => out.push(id));
        return out;
    }

    function syncStgSubPanels(row) {
        if (!row) return;
        const sel = row.querySelector('.monster-stg-danmaku-style');
        const v = sel ? sel.value : '';
        const none = v === 'none';
        const isLaser = v === 'laser';
        const fan = row.querySelector('.monster-stg-fan-params');
        const ring = row.querySelector('.monster-stg-ring-params');
        const laser = row.querySelector('.monster-stg-laser-params');
        const mainDir = row.querySelector('.monster-stg-main-dir-row');
        if (fan) fan.classList.toggle('hidden', none || v !== 'fan');
        if (ring) ring.classList.toggle('hidden', none || v !== 'ring');
        if (laser) laser.classList.toggle('hidden', none || v !== 'laser');
        /** 扇形/激光才需要「主方向」；无弹幕时整段弹幕相关折叠 */
        if (mainDir) mainDir.classList.toggle('hidden', none || (v !== 'fan' && v !== 'laser'));
        const emitRow = row.querySelector('.monster-stg-emit-when-row');
        const bulletSpeedRow = row.querySelector('.monster-stg-bullet-speed-row');
        const bulletProps = row.querySelector('.monster-stg-bullet-props-wrap');
        const homingRow = row.querySelector('.monster-stg-homing-row');
        if (emitRow) emitRow.classList.toggle('hidden', none);
        if (bulletSpeedRow) bulletSpeedRow.classList.toggle('hidden', none);
        if (bulletProps) bulletProps.classList.toggle('hidden', none);
        /** 激光为瞬时射线，跟踪强度对激光无效，折叠避免误解 */
        if (homingRow) homingRow.classList.toggle('hidden', none || isLaser);
        const cdRow = row.querySelector('.monster-stg-cooldown-row');
        const emitWhen = row.querySelector('.monster-stg-emit-when');
        if (cdRow && emitWhen) {
            /** 无弹幕 / 死后弹幕 均不展示冷却输入 */
            cdRow.classList.toggle('hidden', none || emitWhen.value === 'on_death');
        }
        /** 从「无弹幕」切回时，分裂区需按子弹类型重新显隐 */
        syncBulletKindRow(row);
    }

    function open() {
        if (!panelEl) return;
        panelEl.classList.remove('hidden');
        render();
    }

    function close() {
        if (panelEl) panelEl.classList.add('hidden');
    }

    function getTypesFromGame() {
        if (!game || !game.enemyManager) return {};
        return game.enemyManager.getEnemyTypes();
    }

    function applyTypes(types) {
        if (!types || typeof types !== 'object') return;
        // 先落盘：即使塔防尚未 lazy-init（无 enemyManager），STG 首页点「应用」也必须能保存
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(types));
            console.log('怪物编辑器已应用，并已保存到本地（刷新后仍会保留）');
        } catch (e) {
            console.warn('保存怪物配置到本地失败', e);
        }
        if (game && game.enemyManager) {
            game.enemyManager.setEnemyTypes(types);
        }
        close();
    }

    function buildDataFromDom() {
        const rows = listEl.querySelectorAll('.monster-editor-row');
        const types = {};
        rows.forEach(row => {
            const id = row.dataset.typeId;
            if (!id) return;
            const nameInp = row.querySelector('.monster-name');
            const healthInp = row.querySelector('.monster-health');
            const attackInp = row.querySelector('.monster-attack');
            const speedInp = row.querySelector('.monster-speed');
            const rewardInp = row.querySelector('.monster-reward');
            const attackIntervalInp = row.querySelector('.monster-attack-interval');
            const iconInp = row.querySelector('.monster-icon');
            const colorInp = row.querySelector('.monster-color');
            const detInp = row.querySelector('.monster-detection-range');
            const radiusInp = row.querySelector('.monster-radius');
            const stgStyleSel = row.querySelector('.monster-stg-danmaku-style');
            const stgMainDirSel = row.querySelector('.monster-stg-main-dir');
            const stgCdInp = row.querySelector('.monster-stg-shoot-cd');
            const stgBspInp = row.querySelector('.monster-stg-bullet-speed');
            const stgFanCnt = row.querySelector('.monster-stg-fan-count');
            const stgFanSpr = row.querySelector('.monster-stg-fan-spread');
            const stgRingCnt = row.querySelector('.monster-stg-ring-count');
            const stgLaserLen = row.querySelector('.monster-stg-laser-len');
            const stgLaserW = row.querySelector('.monster-stg-laser-width');
            const stgLaserDur = row.querySelector('.monster-stg-laser-dur');
            const stgBulletKindSel = row.querySelector('.monster-stg-bullet-kind');
            const stgSplitSec = row.querySelector('.monster-stg-split-sec');
            const stgSplitCnt = row.querySelector('.monster-stg-split-count');
            const stgSplitStyleSel = row.querySelector('.monster-stg-split-style');
            const stgSplitSpd = row.querySelector('.monster-stg-split-spd');
            const stgHomingInp = row.querySelector('.monster-stg-homing');
            const stgBulletRInp = row.querySelector('.monster-stg-bullet-r');
            const stgBulletShapeSel = row.querySelector('.monster-stg-bullet-shape');
            const stgEmitWhenSel = row.querySelector('.monster-stg-emit-when');
            const stgMoveModeSel = row.querySelector('.monster-stg-move-mode');
            const stgMoveAngle = row.querySelector('.monster-stg-move-angle');
            const stgAnchorX = row.querySelector('.monster-stg-anchor-x');
            const stgAnchorY = row.querySelector('.monster-stg-anchor-y');
            const stgArc1x = row.querySelector('.monster-stg-arc1-x');
            const stgArc1y = row.querySelector('.monster-stg-arc1-y');
            const stgArc2x = row.querySelector('.monster-stg-arc2-x');
            const stgArc2y = row.querySelector('.monster-stg-arc2-y');
            const stgArcB1 = row.querySelector('.monster-stg-arc-bulge1');
            const stgArcB2 = row.querySelector('.monster-stg-arc-bulge2');

            const style = stgStyleSel ? stgStyleSel.value : 'single_random';
            const md = stgMainDirSel && (stgMainDirSel.value === 'aim' || stgMainDirSel.value === 'straight')
                ? stgMainDirSel.value
                : 'straight';

            let stgBulletPattern = 'random';
            let stgEmitStyle = 'single';
            if (style === 'none') {
                stgBulletPattern = 'none';
                stgEmitStyle = 'single';
            } else if (style === 'fan') {
                stgBulletPattern = md;
                stgEmitStyle = 'fan';
            } else if (style === 'ring') {
                stgBulletPattern = 'random';
                stgEmitStyle = 'ring';
            } else if (style === 'laser') {
                stgBulletPattern = md;
                stgEmitStyle = 'laser';
            } else if (style === 'single_random') {
                stgBulletPattern = 'random';
                stgEmitStyle = 'single';
            } else if (style === 'single_aim') {
                stgBulletPattern = 'aim';
                stgEmitStyle = 'single';
            } else if (style === 'single_straight') {
                stgBulletPattern = 'straight';
                stgEmitStyle = 'single';
            }

            types[id] = {
                name: nameInp ? nameInp.value.trim() || '敌人' : '敌人',
                defaultHealth: Math.max(1, parseInt(healthInp && healthInp.value, 10) || 50),
                defaultAttack: Math.max(0, parseInt(attackInp && attackInp.value, 10) || 1),
                defaultAttackInterval: Math.max(0.1, parseFloat(attackIntervalInp && attackIntervalInp.value) || 1),
                defaultSpeed: Math.max(1, parseInt(speedInp && speedInp.value, 10) || 50),
                defaultReward: Math.max(0, parseInt(rewardInp && rewardInp.value, 10) || 2),
                defaultDetectionRange: Math.max(20, parseInt(detInp && detInp.value, 10) || 130),
                radius: Math.max(4, Math.min(48, parseInt(radiusInp && radiusInp.value, 10) || 15)),
                icon: iconInp ? iconInp.value.trim() || '👹' : '👹',
                color: colorInp ? colorInp.value.trim() || '#e74c3c' : '#e74c3c',
                stgBulletPattern,
                stgShootCooldownMs: Math.max(200, parseInt(stgCdInp && stgCdInp.value, 10) || 2200),
                stgEnemyBulletSpeed: Math.max(40, parseInt(stgBspInp && stgBspInp.value, 10) || 260),
                stgEmitStyle,
                stgFanCount: Math.max(2, Math.min(24, parseInt(stgFanCnt && stgFanCnt.value, 10) || 5)),
                stgFanSpreadDeg: Math.max(10, Math.min(180, parseInt(stgFanSpr && stgFanSpr.value, 10) || 60)),
                stgRingCount: Math.max(3, Math.min(36, parseInt(stgRingCnt && stgRingCnt.value, 10) || 12)),
                stgLaserLength: Math.max(80, Math.min(600, parseInt(stgLaserLen && stgLaserLen.value, 10) || 300)),
                stgLaserWidth: Math.max(4, Math.min(48, parseInt(stgLaserW && stgLaserW.value, 10) || 14)),
                stgLaserDurationMs: Math.max(100, Math.min(3000, parseInt(stgLaserDur && stgLaserDur.value, 10) || 450)),
                stgBulletKind: stgBulletKindSel && stgBulletKindSel.value === 'split' ? 'split' : 'normal',
                stgSplitDelaySec: Math.max(0, Math.min(10, parseFloat(stgSplitSec && stgSplitSec.value) || 0)),
                stgSplitCount: Math.max(2, Math.min(16, parseInt(stgSplitCnt && stgSplitCnt.value, 10) || 4)),
                stgSplitStyle:
                    stgSplitStyleSel && stgSplitStyleSel.value === 'cross' ? 'cross' : 'cross',
                stgSplitChildSpeed: Math.max(40, Math.min(520, parseInt(stgSplitSpd && stgSplitSpd.value, 10) || 220)),
                stgHomingStrength: Math.max(0, Math.min(100, parseInt(stgHomingInp && stgHomingInp.value, 10) || 0)),
                stgEnemyBulletRadius: Math.max(2, Math.min(28, parseInt(stgBulletRInp && stgBulletRInp.value, 10) || 5)),
                stgEnemyBulletShape:
                    stgBulletShapeSel && stgBulletShapeSel.value === 'triangle' ? 'triangle' : 'circle',
                stgEmitWhen: stgEmitWhenSel && stgEmitWhenSel.value === 'on_death' ? 'on_death' : 'cooldown',
                stgMoveMode:
                    stgMoveModeSel &&
                    [
                        'straight',
                        'homing',
                        'anchor',
                        'arc_edges',
                        'homing_legacy',
                        'horizontal_left',
                        'horizontal_right'
                    ].indexOf(stgMoveModeSel.value) >= 0
                        ? stgMoveModeSel.value
                        : 'homing_legacy',
                stgMoveStraightAngleDeg: Math.max(
                    -55,
                    Math.min(55, parseFloat(stgMoveAngle && stgMoveAngle.value) || 0)
                ),
                stgAnchorXNorm: Math.max(0.02, Math.min(0.98, parseFloat(stgAnchorX && stgAnchorX.value) || 0.5)),
                stgAnchorYNorm: Math.max(0.02, Math.min(0.98, parseFloat(stgAnchorY && stgAnchorY.value) || 0.45)),
                stgArcEdge1XNorm: Math.max(0.02, Math.min(0.98, parseFloat(stgArc1x && stgArc1x.value) || 0.12)),
                stgArcEdge1YNorm: Math.max(0.05, Math.min(0.98, parseFloat(stgArc1y && stgArc1y.value) || 0.42)),
                stgArcEdge2XNorm: Math.max(0.02, Math.min(0.98, parseFloat(stgArc2x && stgArc2x.value) || 0.88)),
                stgArcEdge2YNorm: Math.max(0.05, Math.min(0.98, parseFloat(stgArc2y && stgArc2y.value) || 0.58)),
                stgArcBulge1: Math.max(15, Math.min(220, parseInt(stgArcB1 && stgArcB1.value, 10) || 80)),
                stgArcBulge2: Math.max(15, Math.min(220, parseInt(stgArcB2 && stgArcB2.value, 10) || 80))
            };
        });
        return types;
    }

    function addTypeRow(typeId, data) {
        const d = data || {
            name: typeId, defaultHealth: 50, defaultAttack: 1, defaultAttackInterval: 1, defaultSpeed: 50, defaultReward: 2, defaultDetectionRange: 130,
            radius: 15, icon: '👹', color: '#e74c3c', stgBulletPattern: 'random', stgShootCooldownMs: 2200, stgEnemyBulletSpeed: 260,
            stgEmitStyle: 'single', stgFanCount: 5, stgFanSpreadDeg: 60, stgRingCount: 12, stgLaserLength: 300, stgLaserWidth: 14, stgLaserDurationMs: 450,
            stgBulletKind: 'normal', stgSplitDelaySec: 0, stgSplitCount: 4, stgSplitStyle: 'cross',
            stgSplitChildSpeed: 220, stgHomingStrength: 0, stgEmitWhen: 'cooldown',
            stgEnemyBulletRadius: 5, stgEnemyBulletShape: 'circle',
            stgMoveMode: 'homing_legacy', stgMoveStraightAngleDeg: 0,
            stgAnchorXNorm: 0.5, stgAnchorYNorm: 0.45,
            stgArcEdge1XNorm: 0.12, stgArcEdge1YNorm: 0.42, stgArcEdge2XNorm: 0.88, stgArcEdge2YNorm: 0.58,
            stgArcBulge1: 80, stgArcBulge2: 80
        };
        const dmStyle = danmakuStyleFromData(d);
        const mainDir = mainDirFromData(d);
        const homing = d.stgHomingStrength != null ? d.stgHomingStrength : 0;
        const emitWhen = d.stgEmitWhen === 'on_death' ? 'on_death' : 'cooldown';
        const bulletKind = bulletKindFromData(d);
        const splitCnt = d.stgSplitCount != null ? d.stgSplitCount : 4;
        const moveMode = moveModeFromData(d);
        const bulletShape = d.stgEnemyBulletShape === 'triangle' ? 'triangle' : 'circle';

        const row = document.createElement('div');
        row.className = 'monster-editor-row';
        row.dataset.typeId = typeId;
        const isBuiltin = BUILTIN_TYPE_IDS.indexOf(typeId) >= 0;
        row.innerHTML = `
            <div class="monster-editor-row-head">
                <span class="monster-editor-id">种类 ID: ${typeId}</span>
                <button type="button" class="monster-editor-remove-type open-shop-btn" ${isBuiltin ? 'disabled title="内置种类不可删除"' : 'title="从列表移除（点击「应用」后写入存档）"'}">删除</button>
            </div>
            <div class="monster-editor-row-body">
                <label>名称</label>
                <input type="text" class="monster-name" value="${(d.name || typeId).replace(/"/g, '&quot;')}" placeholder="显示名称">
                <label>生命</label>
                <input type="number" class="monster-health" min="1" value="${d.defaultHealth != null ? d.defaultHealth : 50}">
                <label>攻击力</label>
                <input type="number" class="monster-attack" min="0" value="${d.defaultAttack != null ? d.defaultAttack : 1}" title="单次伤害">
                <label>攻击间隔(秒)</label>
                <input type="number" class="monster-attack-interval" min="0.1" step="0.1" value="${d.defaultAttackInterval != null ? d.defaultAttackInterval : 1}" title="被阻挡时每隔多少秒对塔造成一次攻击力伤害">
                <label>移速</label>
                <input type="number" class="monster-speed" min="1" value="${d.defaultSpeed != null ? d.defaultSpeed : 50}" title="像素/秒">
                <label>检测范围(px)</label>
                <input type="number" class="monster-detection-range" min="20" value="${d.defaultDetectionRange != null ? d.defaultDetectionRange : 130}" title="此范围内有防御塔则优先进攻塔">
                <label>碰撞半径(px)</label>
                <input type="number" class="monster-radius" min="4" max="48" value="${d.radius != null ? d.radius : 15}" title="塔防与 STG 中敌人圆形碰撞半径">
                <label>金币</label>
                <input type="number" class="monster-reward" min="0" value="${d.defaultReward != null ? d.defaultReward : 2}">
                <label>图标</label>
                <input type="text" class="monster-icon" value="${(d.icon || '👹').replace(/"/g, '&quot;')}" placeholder="emoji" maxlength="4" style="width:4em;">
                <label>颜色</label>
                <input type="text" class="monster-color" value="${(d.color || '#e74c3c').replace(/"/g, '&quot;')}" placeholder="#e74c3c" style="width:6em;">
            </div>
            <div class="monster-editor-stg-block">
                <div class="monster-editor-stg-title">STG 纵版射击（弹幕）</div>

                <div class="monster-editor-stg-section">
                    <div class="monster-editor-stg-section-title">移动方式（STG）</div>
                    <div class="monster-stg-row">
                        <label>移动方式</label>
                        <select class="monster-stg-move-mode" title="决定敌人在战场上的位移逻辑">
                            <option value="homing_legacy" ${moveMode === 'homing_legacy' ? 'selected' : ''}>旧版（斜向+下落混合）</option>
                            <option value="straight" ${moveMode === 'straight' ? 'selected' : ''}>直线移动</option>
                            <option value="homing" ${moveMode === 'homing' ? 'selected' : ''}>朝向玩家</option>
                            <option value="anchor" ${moveMode === 'anchor' ? 'selected' : ''}>到点后静止</option>
                            <option value="arc_edges" ${moveMode === 'arc_edges' ? 'selected' : ''}>双边缘弧线后离场</option>
                            <option value="horizontal_left" ${moveMode === 'horizontal_left' ? 'selected' : ''}>水平向左</option>
                            <option value="horizontal_right" ${moveMode === 'horizontal_right' ? 'selected' : ''}>水平向右</option>
                        </select>
                    </div>
                    <div class="monster-stg-move-straight monster-editor-stg-section ${moveMode === 'straight' ? '' : 'hidden'}">
                        <div class="monster-editor-stg-section-title">直线参数</div>
                        <div class="monster-stg-row">
                            <label>偏角(°)，0=竖直向下，负=偏左、正=偏右</label>
                            <input type="number" class="monster-stg-move-angle" min="-55" max="55" step="1" value="${d.stgMoveStraightAngleDeg != null ? d.stgMoveStraightAngleDeg : 0}">
                        </div>
                    </div>
                    <div class="monster-stg-move-anchor monster-editor-stg-section ${moveMode === 'anchor' ? '' : 'hidden'}">
                        <div class="monster-editor-stg-section-title">悬停点（相对画布 0~1）</div>
                        <div class="monster-stg-row">
                            <label>目标 X（0 左 — 1 右）</label>
                            <input type="number" class="monster-stg-anchor-x" min="0.02" max="0.98" step="0.01" value="${d.stgAnchorXNorm != null ? d.stgAnchorXNorm : 0.5}">
                        </div>
                        <div class="monster-stg-row">
                            <label>目标 Y（0 上 — 1 下）</label>
                            <input type="number" class="monster-stg-anchor-y" min="0.02" max="0.98" step="0.01" value="${d.stgAnchorYNorm != null ? d.stgAnchorYNorm : 0.45}">
                        </div>
                    </div>
                    <div class="monster-stg-move-arc monster-editor-stg-section ${moveMode === 'arc_edges' ? '' : 'hidden'}">
                        <div class="monster-editor-stg-section-title">弧线：出生 → 边缘点1 → 边缘点2 → 离场</div>
                        <div class="monster-stg-row">
                            <label>边缘点1 X（0~1）</label>
                            <input type="number" class="monster-stg-arc1-x" min="0.02" max="0.98" step="0.01" value="${d.stgArcEdge1XNorm != null ? d.stgArcEdge1XNorm : 0.12}">
                        </div>
                        <div class="monster-stg-row">
                            <label>边缘点1 Y（0~1）</label>
                            <input type="number" class="monster-stg-arc1-y" min="0.05" max="0.98" step="0.01" value="${d.stgArcEdge1YNorm != null ? d.stgArcEdge1YNorm : 0.42}">
                        </div>
                        <div class="monster-stg-row">
                            <label>边缘点2 X（0~1）</label>
                            <input type="number" class="monster-stg-arc2-x" min="0.02" max="0.98" step="0.01" value="${d.stgArcEdge2XNorm != null ? d.stgArcEdge2XNorm : 0.88}">
                        </div>
                        <div class="monster-stg-row">
                            <label>边缘点2 Y（0~1）</label>
                            <input type="number" class="monster-stg-arc2-y" min="0.05" max="0.98" step="0.01" value="${d.stgArcEdge2YNorm != null ? d.stgArcEdge2YNorm : 0.58}">
                        </div>
                        <div class="monster-stg-row">
                            <label>弧高1（px，弦中点向上鼓包）</label>
                            <input type="number" class="monster-stg-arc-bulge1" min="15" max="220" step="5" value="${d.stgArcBulge1 != null ? d.stgArcBulge1 : 80}">
                        </div>
                        <div class="monster-stg-row">
                            <label>弧高2（px）</label>
                            <input type="number" class="monster-stg-arc-bulge2" min="15" max="220" step="5" value="${d.stgArcBulge2 != null ? d.stgArcBulge2 : 80}">
                        </div>
                    </div>
                </div>

                <div class="monster-editor-stg-section">
                    <div class="monster-editor-stg-section-title">弹幕发射样式</div>
                    <div class="monster-stg-row">
                        <label>样式</label>
                        <select class="monster-stg-danmaku-style" title="单发/扇形/环形/激光与方向统一在此选择">
                            <option value="none" ${dmStyle === 'none' ? 'selected' : ''}>无弹幕</option>
                            <option value="single_random" ${dmStyle === 'single_random' ? 'selected' : ''}>单发 · 随机（瞄准/直线）</option>
                            <option value="single_aim" ${dmStyle === 'single_aim' ? 'selected' : ''}>单发 · 瞄准玩家</option>
                            <option value="single_straight" ${dmStyle === 'single_straight' ? 'selected' : ''}>单发 · 直线向下</option>
                            <option value="fan" ${dmStyle === 'fan' ? 'selected' : ''}>扇形弹幕</option>
                            <option value="ring" ${dmStyle === 'ring' ? 'selected' : ''}>环形弹幕</option>
                            <option value="laser" ${dmStyle === 'laser' ? 'selected' : ''}>直线激光</option>
                        </select>
                    </div>
                    <div class="monster-stg-row monster-stg-main-dir-row hidden">
                        <label>主方向</label>
                        <select class="monster-stg-main-dir" title="扇形/激光的中心或射线朝向">
                            <option value="aim" ${mainDir === 'aim' ? 'selected' : ''}>瞄准玩家</option>
                            <option value="straight" ${mainDir === 'straight' ? 'selected' : ''}>直线向下</option>
                        </select>
                    </div>
                    <div class="monster-stg-row monster-stg-emit-when-row">
                        <label>发射时机</label>
                        <select class="monster-stg-emit-when" title="死后弹幕：存活时不发射，阵亡时按上方样式与下方子弹属性释放一次">
                            <option value="cooldown" ${emitWhen === 'cooldown' ? 'selected' : ''}>战斗中（按冷却）</option>
                            <option value="on_death" ${emitWhen === 'on_death' ? 'selected' : ''}>死后弹幕</option>
                        </select>
                    </div>
                    <div class="monster-stg-row monster-stg-cooldown-row">
                        <label>弹幕冷却(ms)</label>
                        <input type="number" class="monster-stg-shoot-cd" min="200" step="100" value="${d.stgShootCooldownMs != null ? d.stgShootCooldownMs : 2200}">
                    </div>
                    <div class="monster-stg-row monster-stg-bullet-speed-row">
                        <label>敌弹速度(px/s)</label>
                        <input type="number" class="monster-stg-bullet-speed" min="40" step="10" value="${d.stgEnemyBulletSpeed != null ? d.stgEnemyBulletSpeed : 260}">
                    </div>
                </div>

                <div class="monster-stg-fan-params monster-editor-stg-section hidden">
                    <div class="monster-editor-stg-section-title">扇形参数</div>
                    <div class="monster-stg-row">
                        <label>扇形发数</label>
                        <input type="number" class="monster-stg-fan-count" min="2" max="24" value="${d.stgFanCount != null ? d.stgFanCount : 5}">
                    </div>
                    <div class="monster-stg-row">
                        <label>扇形总张角(°)</label>
                        <input type="number" class="monster-stg-fan-spread" min="10" max="180" value="${d.stgFanSpreadDeg != null ? d.stgFanSpreadDeg : 60}">
                    </div>
                </div>

                <div class="monster-stg-ring-params monster-editor-stg-section hidden">
                    <div class="monster-editor-stg-section-title">环形参数</div>
                    <div class="monster-stg-row">
                        <label>环形发数</label>
                        <input type="number" class="monster-stg-ring-count" min="3" max="36" value="${d.stgRingCount != null ? d.stgRingCount : 12}">
                    </div>
                </div>

                <div class="monster-stg-laser-params monster-editor-stg-section hidden">
                    <div class="monster-editor-stg-section-title">激光参数</div>
                    <div class="monster-stg-row">
                        <label>激光长度(px)</label>
                        <input type="number" class="monster-stg-laser-len" min="80" max="600" value="${d.stgLaserLength != null ? d.stgLaserLength : 300}">
                    </div>
                    <div class="monster-stg-row">
                        <label>激光线宽(px)</label>
                        <input type="number" class="monster-stg-laser-width" min="4" max="48" value="${d.stgLaserWidth != null ? d.stgLaserWidth : 14}">
                    </div>
                    <div class="monster-stg-row">
                        <label>激光持续(ms)</label>
                        <input type="number" class="monster-stg-laser-dur" min="100" max="3000" step="50" value="${d.stgLaserDurationMs != null ? d.stgLaserDurationMs : 450}">
                    </div>
                </div>

                <div class="monster-editor-stg-section monster-stg-bullet-props-wrap">
                    <div class="monster-editor-stg-section-title">子弹属性</div>
                    <div class="monster-stg-row">
                        <label>子弹类型</label>
                        <select class="monster-stg-bullet-kind" title="普通弹不分裂；分裂弹在延迟后按样式拆成多向子弹">
                            <option value="normal" ${bulletKind === 'normal' ? 'selected' : ''}>普通（不分裂）</option>
                            <option value="split" ${bulletKind === 'split' ? 'selected' : ''}>分裂弹</option>
                        </select>
                    </div>
                    <div class="monster-stg-split-params ${bulletKind === 'split' ? '' : 'hidden'}">
                        <div class="monster-stg-row">
                            <label>分裂延迟(秒)</label>
                            <input type="number" class="monster-stg-split-sec" min="0" max="10" step="0.1" value="${d.stgSplitDelaySec != null ? d.stgSplitDelaySec : 0}" title="飞行该时间后沿整圈均匀拆成多向子弹；0 表示约 1ms 后立刻分裂">
                        </div>
                        <div class="monster-stg-row">
                            <label>分裂个数</label>
                            <input type="number" class="monster-stg-split-count" min="2" max="16" step="1" value="${splitCnt}" title="十字样式：整圈均匀放射，4 即经典十字">
                        </div>
                        <div class="monster-stg-row">
                            <label>分裂样式</label>
                            <select class="monster-stg-split-style" title="目前仅实现十字（均匀放射）">
                                <option value="cross" selected>十字（均匀放射）</option>
                            </select>
                        </div>
                        <div class="monster-stg-row">
                            <label>分裂后速度</label>
                            <input type="number" class="monster-stg-split-spd" min="40" max="520" value="${d.stgSplitChildSpeed != null ? d.stgSplitChildSpeed : 220}">
                        </div>
                    </div>
                    <div class="monster-stg-row monster-stg-homing-row">
                        <label>跟踪强度</label>
                        <input type="number" class="monster-stg-homing" min="0" max="100" value="${homing}" title="0=直线飞行；越大敌弹越倾向弯向玩家（对弹体生效，激光无效）">
                    </div>
                    <div class="monster-stg-row">
                        <label>敌弹半径(px)</label>
                        <input type="number" class="monster-stg-bullet-r" min="2" max="28" step="1" value="${d.stgEnemyBulletRadius != null ? d.stgEnemyBulletRadius : 5}" title="STG 敌弹受击判定与绘制尺寸（2–28）">
                    </div>
                    <div class="monster-stg-row">
                        <label>敌弹形状</label>
                        <select class="monster-stg-bullet-shape" title="仅弹体弹幕；直线激光仍为粗线段">
                            <option value="circle" ${bulletShape === 'triangle' ? '' : 'selected'}>圆形</option>
                            <option value="triangle" ${bulletShape === 'triangle' ? 'selected' : ''}>三角形</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
        listEl.appendChild(row);
        syncStgSubPanels(row);
        syncBulletKindRow(row);
        syncStgMovePanels(row);
    }

    function render() {
        listEl.innerHTML = '';
        const fromDisk = loadSavedTypes() || {};
        const fromGame = getTypesFromGame() || {};
        const types = { ...fromDisk, ...fromGame };
        let ids = Object.keys(types);
        if (ids.length === 0) {
            listEl.innerHTML = '<p class="monster-editor-empty">暂无种类。可在上方输入新种类 ID 并点击「添加种类」；首次使用时会从默认模板生成条目。</p>';
            return;
        }
        ids = sortMonsterTypeIds(ids);
        ids.forEach((id) => addTypeRow(id, types[id]));
    }

    /**
     * 在列表末尾追加一行；ID 需合法且不与现有行重复
     */
    function tryAddNewMonsterType() {
        const inp = document.getElementById('monsterEditorNewIdInput');
        if (!inp || !listEl) return;
        const raw = String(inp.value || '').trim();
        if (!/^([a-zA-Z_][a-zA-Z0-9_]*)$/.test(raw) || raw.length < 2) {
            alert('种类 ID 需为英文、数字、下划线，且以字母或下划线开头，至少 2 个字符。');
            return;
        }
        const rows = listEl.querySelectorAll('.monster-editor-row');
        for (let i = 0; i < rows.length; i++) {
            if (rows[i].dataset.typeId === raw) {
                alert('该种类 ID 已存在。');
                return;
            }
        }
        addTypeRow(raw, null);
        inp.value = '';
        const row = listEl.querySelector(`[data-type-id="${raw}"]`);
        if (row) syncStgSubPanels(row);
    }

    function onApply() {
        const types = buildDataFromDom();
        if (Object.keys(types).length === 0) {
            alert('没有可保存的怪物类型');
            return;
        }
        applyTypes(types);
    }

    function init(g) {
        game = g;
        panelEl = document.getElementById('monsterEditorPanel');
        listEl = document.getElementById('monsterEditorList');
        if (!panelEl || !listEl) return;

        const openBtn = document.getElementById('openMonsterEditorBtn');
        const closeBtn = document.getElementById('monsterEditorCloseBtn');
        const applyBtn = document.getElementById('monsterEditorApplyBtn');

        if (openBtn) openBtn.addEventListener('click', open);
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (panelEl) panelEl.addEventListener('click', (e) => { if (e.target === panelEl) close(); });
        if (applyBtn) applyBtn.addEventListener('click', onApply);

        const addBtn = document.getElementById('monsterEditorAddTypeBtn');
        const newIdInp = document.getElementById('monsterEditorNewIdInput');
        if (addBtn) addBtn.addEventListener('click', tryAddNewMonsterType);
        if (newIdInp) {
            newIdInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    tryAddNewMonsterType();
                }
            });
        }

        listEl.addEventListener('change', (e) => {
            const t = e.target;
            if (!t || !t.classList) return;
            const row = t.closest('.monster-editor-row');
            if (t.classList.contains('monster-stg-danmaku-style') || t.classList.contains('monster-stg-emit-when')) {
                syncStgSubPanels(row);
            }
            if (t.classList.contains('monster-stg-bullet-kind')) {
                syncBulletKindRow(row);
            }
            if (t.classList.contains('monster-stg-move-mode')) {
                syncStgMovePanels(row);
            }
        });
        listEl.addEventListener('click', (e) => {
            const btn = e.target.closest('.monster-editor-remove-type');
            if (!btn || btn.disabled) return;
            const row = btn.closest('.monster-editor-row');
            if (!row) return;
            if (!confirm('确定从列表中移除该种类？\n若波次配置仍引用该 ID，需在「波次配置」中改选其它种类。\n点击「应用」后才会写入存档。')) return;
            row.remove();
        });
    }

    /** 从 localStorage 读取已保存的怪物类型配置（供游戏初始化时调用） */
    function loadSavedTypes() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const types = JSON.parse(raw);
            return types && typeof types === 'object' ? types : null;
        } catch (e) {
            console.warn('读取已保存的怪物类型失败', e);
            return null;
        }
    }

    window.MonsterEditorPanel = { init, open, close, getTypesFromGame, applyTypes, loadSavedTypes };
})();

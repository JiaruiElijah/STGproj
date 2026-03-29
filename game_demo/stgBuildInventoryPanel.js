/**
 * STG 局内构筑道具：勾选本局开局自动持有的升级（与三选一池同源，存本地；下局 resetRun 时应用）
 * 支持按条目展开编辑数值；扩散 A–H、道具 I（水晶）、M（狂怒）有专用表单，其余显示占位说明。
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'stg_build_inventory_granted';

    const FOCUS_CRYSTAL_IDS = ['focus_crystal_base', 'focus_crystal_atk', 'focus_crystal_count', 'focus_crystal_pierce'];
    const FOCUS_RAGE_IDS = ['focus_rage_core', 'focus_rage_cap', 'focus_rage_dur', 'focus_rage_weak'];
    const ULT_SEAL_IDS = ['ult_seal_size', 'ult_seal_economy', 'ult_seal_heal'];
    const ULT_DREAM_IDS = ['ult_dream_base', 'ult_dream_count', 'ult_dream_stun'];

    function getCatalog() {
        if (window.StgMode && typeof window.StgMode.getBuildUpgradeCatalog === 'function') {
            return window.StgMode.getBuildUpgradeCatalog();
        }
        return [];
    }

    function loadSavedIds() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const o = JSON.parse(raw);
            return Array.isArray(o) ? o.filter((x) => typeof x === 'string') : [];
        } catch (e) {
            return [];
        }
    }

    function saveIds(ids) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    }

    function escapeHtml(s) {
        return (s == null ? '' : String(s))
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;');
    }

    function getOverrides() {
        if (window.StgMode && typeof window.StgMode.getBuildUpgradeOverrides === 'function') {
            return window.StgMode.getBuildUpgradeOverrides();
        }
        return {};
    }

    /** 与互斥组冲突时取消另一组的勾选 */
    function enforceMutex(checkbox, checked) {
        const id = checkbox.dataset.upgradeId;
        if (!id) return;
        const root = document.getElementById('stgBuildInventoryList');
        if (!root) return;

        function setGroupOff(ids, exceptId) {
            ids.forEach((uid) => {
                if (uid === exceptId) return;
                const cb = root.querySelector('input[data-upgrade-id="' + uid + '"]');
                if (cb) cb.checked = false;
            });
        }

        if (checked) {
            if (FOCUS_CRYSTAL_IDS.indexOf(id) >= 0) setGroupOff(FOCUS_RAGE_IDS, id);
            if (FOCUS_RAGE_IDS.indexOf(id) >= 0) setGroupOff(FOCUS_CRYSTAL_IDS, id);
            if (ULT_SEAL_IDS.indexOf(id) >= 0) setGroupOff(ULT_DREAM_IDS, id);
            if (ULT_DREAM_IDS.indexOf(id) >= 0) setGroupOff(ULT_SEAL_IDS, id);
        }
    }

    function buildDetailHtml(u, ov) {
        const id = u.id;
        if (id === 'focus_crystal_base') {
            const c = ov.focus_crystal_base || {};
            const shape = c.crystalShape === 'circle' || c.crystalShape === 'square' || c.crystalShape === 'diamond' ? c.crystalShape : 'diamond';
            const fill = typeof c.crystalFill === 'string' && c.crystalFill.trim() ? escapeHtml(c.crystalFill.trim()) : '#f1c40f';
            const rsVal =
                c.crystalRadiusScale != null && Number.isFinite(Number(c.crystalRadiusScale))
                    ? Number(c.crystalRadiusScale)
                    : 1;
            const dm = c.crystalDamageMult != null && Number.isFinite(Number(c.crystalDamageMult)) ? Number(c.crystalDamageMult) : 1;
            const sm = c.crystalBulletSpeedMult != null && Number.isFinite(Number(c.crystalBulletSpeedMult)) ? Number(c.crystalBulletSpeedMult) : 1;
            const cb = c.crystalCountBase != null && Number.isFinite(Number(c.crystalCountBase)) ? Number(c.crystalCountBase) : 6;
            const ck = c.crystalCountExtraWithK != null && Number.isFinite(Number(c.crystalCountExtraWithK)) ? Number(c.crystalCountExtraWithK) : 3;
            return (
                '<div class="stg-build-inv-detail-inner">' +
                '<div class="stg-build-inv-detail-title">道具 I · 水晶齐射</div>' +
                '<div class="stg-build-inv-detail-subtitle">数值（在道具 J 的 1.28 倍之后再乘伤害倍率）</div>' +
                '<label class="stg-build-inv-field">每颗伤害倍率（0.1～5）' +
                '<input type="number" step="0.05" min="0.1" max="5" data-ov-key="focus_crystal_base" data-ov-field="crystalDamageMult" value="' +
                dm +
                '" /></label>' +
                '<label class="stg-build-inv-field">弹速倍率（0.25～3）' +
                '<input type="number" step="0.05" min="0.25" max="3" data-ov-key="focus_crystal_base" data-ov-field="crystalBulletSpeedMult" value="' +
                sm +
                '" /></label>' +
                '<label class="stg-build-inv-field">基础枚数（2～28）' +
                '<input type="number" step="1" min="2" max="28" data-ov-key="focus_crystal_base" data-ov-field="crystalCountBase" value="' +
                cb +
                '" /></label>' +
                '<label class="stg-build-inv-field">有道具 K 时额外枚数（0～20）' +
                '<input type="number" step="1" min="0" max="20" data-ov-key="focus_crystal_base" data-ov-field="crystalCountExtraWithK" value="' +
                ck +
                '" /></label>' +
                '<div class="stg-build-inv-detail-subtitle">外观</div>' +
                '<label class="stg-build-inv-field">形状 ' +
                '<select data-ov-key="focus_crystal_base" data-ov-field="crystalShape">' +
                '<option value="diamond"' + (shape === 'diamond' ? ' selected' : '') + '>菱形</option>' +
                '<option value="circle"' + (shape === 'circle' ? ' selected' : '') + '>圆形</option>' +
                '<option value="square"' + (shape === 'square' ? ' selected' : '') + '>方形</option>' +
                '</select></label>' +
                '<label class="stg-build-inv-field">颜色 <input type="color" data-ov-key="focus_crystal_base" data-ov-field="crystalFill" value="' +
                fill +
                '" /></label>' +
                '<label class="stg-build-inv-field">半径倍率 ' +
                '<input type="number" step="0.05" min="0.35" max="3" data-ov-key="focus_crystal_base" data-ov-field="crystalRadiusScale" value="' +
                rsVal +
                '" /></label>' +
                '<p class="stg-build-inv-detail-hint">保存后列表与三选一卡牌的道具 I 描述会按「命中次数」与「枚数」自动更新；局内仍受 J/L 等影响。</p>' +
                '</div>'
            );
        }
        if (id === 'focus_rage_core') {
            const r = ov.focus_rage_core || {};
            const d0 = r.rageDurationBaseMs != null ? Number(r.rageDurationBaseMs) : 5000;
            const d1 = r.rageDurationExtraMs != null ? Number(r.rageDurationExtraMs) : 5000;
            const bs = r.rageBulletSpdPerStack != null ? Number(r.rageBulletSpdPerStack) : 0.065;
            const fm = r.rageFireIvMultPerStack != null ? Number(r.rageFireIvMultPerStack) : 0.9;
            return (
                '<div class="stg-build-inv-detail-inner">' +
                '<div class="stg-build-inv-detail-title">道具 M · 狂怒效果</div>' +
                '<label class="stg-build-inv-field">基础持续（毫秒）' +
                '<input type="number" step="100" min="500" max="120000" data-ov-key="focus_rage_core" data-ov-field="rageDurationBaseMs" value="' +
                (Number.isFinite(d0) ? d0 : 5000) +
                '" /></label>' +
                '<label class="stg-build-inv-field">道具 O 追加（毫秒）' +
                '<input type="number" step="100" min="0" max="120000" data-ov-key="focus_rage_core" data-ov-field="rageDurationExtraMs" value="' +
                (Number.isFinite(d1) ? d1 : 5000) +
                '" /></label>' +
                '<label class="stg-build-inv-field">每层弹速加成（0～0.25）' +
                '<input type="number" step="0.005" min="0" max="0.25" data-ov-key="focus_rage_core" data-ov-field="rageBulletSpdPerStack" value="' +
                (Number.isFinite(bs) ? bs : 0.065) +
                '" /></label>' +
                '<label class="stg-build-inv-field">每层射击间隔乘数（0.5～0.999）' +
                '<input type="number" step="0.01" min="0.5" max="0.999" data-ov-key="focus_rage_core" data-ov-field="rageFireIvMultPerStack" value="' +
                (Number.isFinite(fm) ? fm : 0.9) +
                '" /></label>' +
                '<p class="stg-build-inv-detail-hint">叠层上限、虚弱等仍由 N/O/P 卡决定；此处为每层对射速/弹速/持续的基础公式。</p>' +
                '</div>'
            );
        }
        if (id === 'spread_fan') {
            const x = ov.spread_fan || {};
            const add = x.fanAddCount != null && Number.isFinite(Number(x.fanAddCount)) ? Number(x.fanAddCount) : 2;
            const deg =
                x.fanSpreadDeg != null && Number.isFinite(Number(x.fanSpreadDeg)) ? Number(x.fanSpreadDeg) : '';
            const dm = x.fanDamageMult != null && Number.isFinite(Number(x.fanDamageMult)) ? Number(x.fanDamageMult) : 1;
            return (
                '<div class="stg-build-inv-detail-inner">' +
                '<div class="stg-build-inv-detail-title">道具 A · 扇形扩散</div>' +
                '<label class="stg-build-inv-field">相对基础扇条数加成（0～20，默认 +2）' +
                '<input type="number" step="1" min="0" max="20" data-ov-key="spread_fan" data-ov-field="fanAddCount" value="' +
                add +
                '" /></label>' +
                '<label class="stg-build-inv-field">扇面角覆盖（度，15～150；留空则沿用角色/默认逻辑）' +
                '<input type="number" step="1" min="15" max="150" data-ov-key="spread_fan" data-ov-field="fanSpreadDeg" value="' +
                escapeHtml(deg === '' ? '' : String(deg)) +
                '" placeholder="留空" /></label>' +
                '<label class="stg-build-inv-field">齐射伤害倍率（0.2～5）' +
                '<input type="number" step="0.05" min="0.2" max="5" data-ov-key="spread_fan" data-ov-field="fanDamageMult" value="' +
                dm +
                '" /></label>' +
                '<p class="stg-build-inv-detail-hint">与道具 D 的追踪减伤叠乘；列表文案可仍为默认。</p>' +
                '</div>'
            );
        }
        if (id === 'spread_extra') {
            const x = ov.spread_extra || {};
            const ch = x.extraChance != null && Number.isFinite(Number(x.extraChance)) ? Number(x.extraChance) : 0.28;
            const xr = x.extraXRange != null && Number.isFinite(Number(x.extraXRange)) ? Number(x.extraXRange) : 18;
            const vr = x.extraVxRange != null && Number.isFinite(Number(x.extraVxRange)) ? Number(x.extraVxRange) : 50;
            const dm = x.extraDamageMult != null && Number.isFinite(Number(x.extraDamageMult)) ? Number(x.extraDamageMult) : 1;
            const hs =
                x.extraHomingStr != null && Number.isFinite(Number(x.extraHomingStr)) ? Number(x.extraHomingStr) : 72;
            const ph =
                x.extraPierceHits != null && Number.isFinite(Number(x.extraPierceHits)) ? Number(x.extraPierceHits) : 3;
            return (
                '<div class="stg-build-inv-detail-inner">' +
                '<div class="stg-build-inv-detail-title">道具 B · 额外追踪弹</div>' +
                '<label class="stg-build-inv-field">触发概率（0～1）' +
                '<input type="number" step="0.02" min="0" max="1" data-ov-key="spread_extra" data-ov-field="extraChance" value="' +
                ch +
                '" /></label>' +
                '<label class="stg-build-inv-field">横向偏移随机范围（像素，全宽）' +
                '<input type="number" step="1" min="0" max="120" data-ov-key="spread_extra" data-ov-field="extraXRange" value="' +
                xr +
                '" /></label>' +
                '<label class="stg-build-inv-field">水平速度随机范围（全宽）' +
                '<input type="number" step="1" min="0" max="400" data-ov-key="spread_extra" data-ov-field="extraVxRange" value="' +
                vr +
                '" /></label>' +
                '<label class="stg-build-inv-field">相对主齐射单发伤害倍率（0.1～5）' +
                '<input type="number" step="0.05" min="0.1" max="5" data-ov-key="spread_extra" data-ov-field="extraDamageMult" value="' +
                dm +
                '" /></label>' +
                '<label class="stg-build-inv-field">额外弹追踪转向强度（10～200，与道具 D 独立）' +
                '<input type="number" step="1" min="10" max="200" data-ov-key="spread_extra" data-ov-field="extraHomingStr" value="' +
                hs +
                '" /></label>' +
                '<label class="stg-build-inv-field">可命中敌机段数（2～8；默认 3 = 穿透 2 次）' +
                '<input type="number" step="1" min="2" max="8" data-ov-key="spread_extra" data-ov-field="extraPierceHits" value="' +
                ph +
                '" /></label>' +
                '</div>'
            );
        }
        if (id === 'spread_turret') {
            const x = ov.spread_turret || {};
            const dm = x.turretDmgMult != null && Number.isFinite(Number(x.turretDmgMult)) ? Number(x.turretDmgMult) : 1.5;
            const iv = x.turretFireIntervalMs != null && Number.isFinite(Number(x.turretFireIntervalMs)) ? Number(x.turretFireIntervalMs) : 420;
            return (
                '<div class="stg-build-inv-detail-inner">' +
                '<div class="stg-build-inv-detail-title">道具 C · 伴身炮台</div>' +
                '<label class="stg-build-inv-field">相对主武器单发伤害倍率（0.5～5，默认 1.5）' +
                '<input type="number" step="0.05" min="0.5" max="5" data-ov-key="spread_turret" data-ov-field="turretDmgMult" value="' +
                dm +
                '" /></label>' +
                '<label class="stg-build-inv-field">开火间隔（毫秒，100～2000）' +
                '<input type="number" step="10" min="100" max="2000" data-ov-key="spread_turret" data-ov-field="turretFireIntervalMs" value="' +
                iv +
                '" /></label>' +
                '</div>'
            );
        }
        if (id === 'spread_homing') {
            const x = ov.spread_homing || {};
            const dm = x.homingDamageMult != null && Number.isFinite(Number(x.homingDamageMult)) ? Number(x.homingDamageMult) : 0.6;
            const hs = x.homingStr != null && Number.isFinite(Number(x.homingStr)) ? Number(x.homingStr) : 72;
            return (
                '<div class="stg-build-inv-detail-inner">' +
                '<div class="stg-build-inv-detail-title">道具 D · 追踪弹</div>' +
                '<label class="stg-build-inv-field">伤害乘区（0.05～1，默认 0.6）' +
                '<input type="number" step="0.02" min="0.05" max="1" data-ov-key="spread_homing" data-ov-field="homingDamageMult" value="' +
                dm +
                '" /></label>' +
                '<label class="stg-build-inv-field">转向强度 homingStr（10～200）' +
                '<input type="number" step="1" min="10" max="200" data-ov-key="spread_homing" data-ov-field="homingStr" value="' +
                hs +
                '" /></label>' +
                '</div>'
            );
        }
        if (id === 'spread_yinyang') {
            const x = ov.spread_yinyang || {};
            const si = x.yinyangSpawnIntervalMs != null && Number.isFinite(Number(x.yinyangSpawnIntervalMs)) ? Number(x.yinyangSpawnIntervalMs) : 10000;
            const du = x.yinyangOrbDurationMs != null && Number.isFinite(Number(x.yinyangOrbDurationMs)) ? Number(x.yinyangOrbDurationMs) : 3000;
            const mx = x.yinyangMaxOrbs != null && Number.isFinite(Number(x.yinyangMaxOrbs)) ? Number(x.yinyangMaxOrbs) : 8;
            const rr = x.yinyangOrbRadius != null && Number.isFinite(Number(x.yinyangOrbRadius)) ? Number(x.yinyangOrbRadius) : 48;
            const vr = x.yinyangVisR != null && Number.isFinite(Number(x.yinyangVisR)) ? Number(x.yinyangVisR) : 17;
            const dp = x.yinyangDpsFrac != null && Number.isFinite(Number(x.yinyangDpsFrac)) ? Number(x.yinyangDpsFrac) : 0.5;
            return (
                '<div class="stg-build-inv-detail-inner">' +
                '<div class="stg-build-inv-detail-title">道具 E · 阴阳玉</div>' +
                '<label class="stg-build-inv-field">产球间隔（毫秒）' +
                '<input type="number" step="100" min="500" max="120000" data-ov-key="spread_yinyang" data-ov-field="yinyangSpawnIntervalMs" value="' +
                si +
                '" /></label>' +
                '<label class="stg-build-inv-field">单球存在时间（毫秒）' +
                '<input type="number" step="100" min="500" max="120000" data-ov-key="spread_yinyang" data-ov-field="yinyangOrbDurationMs" value="' +
                du +
                '" /></label>' +
                '<label class="stg-build-inv-field">场上球数上限（1～30）' +
                '<input type="number" step="1" min="1" max="30" data-ov-key="spread_yinyang" data-ov-field="yinyangMaxOrbs" value="' +
                mx +
                '" /></label>' +
                '<label class="stg-build-inv-field">碰撞半径（像素）' +
                '<input type="number" step="1" min="16" max="120" data-ov-key="spread_yinyang" data-ov-field="yinyangOrbRadius" value="' +
                rr +
                '" /></label>' +
                '<label class="stg-build-inv-field">符号绘制半径 visR（像素）' +
                '<input type="number" step="1" min="6" max="72" data-ov-key="spread_yinyang" data-ov-field="yinyangVisR" value="' +
                vr +
                '" /></label>' +
                '<label class="stg-build-inv-field">持续伤占主武器单发比例（0.05～1.5，默认 0.5）' +
                '<input type="number" step="0.05" min="0.05" max="1.5" data-ov-key="spread_yinyang" data-ov-field="yinyangDpsFrac" value="' +
                dp +
                '" /></label>' +
                '</div>'
            );
        }
        if (id === 'spread_big_p') {
            const x = ov.spread_big_p || {};
            const ch = x.bigPChance != null && Number.isFinite(Number(x.bigPChance)) ? Number(x.bigPChance) : 0.22;
            const em = x.bigPExpMult != null && Number.isFinite(Number(x.bigPExpMult)) ? Number(x.bigPExpMult) : 2.5;
            return (
                '<div class="stg-build-inv-detail-inner">' +
                '<div class="stg-build-inv-detail-title">道具 F · 大 P 点</div>' +
                '<label class="stg-build-inv-field">击杀触发概率（0～1）' +
                '<input type="number" step="0.02" min="0" max="1" data-ov-key="spread_big_p" data-ov-field="bigPChance" value="' +
                ch +
                '" /></label>' +
                '<label class="stg-build-inv-field">经验相对小 P 倍率（1～10）' +
                '<input type="number" step="0.1" min="1" max="10" data-ov-key="spread_big_p" data-ov-field="bigPExpMult" value="' +
                em +
                '" /></label>' +
                '</div>'
            );
        }
        if (id === 'spread_crit') {
            const x = ov.spread_crit || {};
            const cb = x.critBonus != null && Number.isFinite(Number(x.critBonus)) ? Number(x.critBonus) : 0.12;
            return (
                '<div class="stg-build-inv-detail-inner">' +
                '<div class="stg-build-inv-detail-title">道具 G · 扩散暴击</div>' +
                '<label class="stg-build-inv-field">额外暴击概率（0～0.5）' +
                '<input type="number" step="0.01" min="0" max="0.5" data-ov-key="spread_crit" data-ov-field="critBonus" value="' +
                cb +
                '" /></label>' +
                '</div>'
            );
        }
        if (id === 'spread_big_energy') {
            const x = ov.spread_big_energy || {};
            const ch = x.bigEnergyChance != null && Number.isFinite(Number(x.bigEnergyChance)) ? Number(x.bigEnergyChance) : 0.18;
            const em = x.bigEnergyExpMult != null && Number.isFinite(Number(x.bigEnergyExpMult)) ? Number(x.bigEnergyExpMult) : 1.85;
            return (
                '<div class="stg-build-inv-detail-inner">' +
                '<div class="stg-build-inv-detail-title">道具 H · 大能量点</div>' +
                '<label class="stg-build-inv-field">击杀触发概率（0～1）' +
                '<input type="number" step="0.02" min="0" max="1" data-ov-key="spread_big_energy" data-ov-field="bigEnergyChance" value="' +
                ch +
                '" /></label>' +
                '<label class="stg-build-inv-field">经验相对小 P 倍率（1～10）' +
                '<input type="number" step="0.1" min="1" max="10" data-ov-key="spread_big_energy" data-ov-field="bigEnergyExpMult" value="' +
                em +
                '" /></label>' +
                '</div>'
            );
        }
        return (
            '<div class="stg-build-inv-detail-inner stg-build-inv-detail-inner--empty">' +
            '<p class="stg-build-inv-detail-placeholder">该道具暂无额外数值编辑；后续可扩展。</p>' +
            '</div>'
        );
    }

    function render() {
        const listEl = document.getElementById('stgBuildInventoryList');
        if (!listEl) return;
        const catalog = getCatalog();
        const saved = new Set(loadSavedIds());
        const ov = getOverrides();
        listEl.innerHTML = '';

        if (!catalog.length) {
            listEl.innerHTML =
                '<p class="wave-config-hint">无法读取构筑目录：请先加载 <code>stgMode.js</code> 并确保 <code>StgMode.getBuildUpgradeCatalog</code> 可用。</p>';
            return;
        }

        const groups = [
            { title: '扩散（A–H）', pred: (g) => g === 'spread' },
            { title: '伏魔针 · 水晶（I–L）', pred: (g) => g === 'focus_crystal' },
            { title: '伏魔针 · 狂怒（M–P）', pred: (g) => g === 'focus_rage' },
            { title: '大招 · 强化封魔阵（Q–S）', pred: (g) => g === 'ult_seal' },
            { title: '大招 · 梦想妙珠（T–V）', pred: (g) => g === 'ult_dream' },
            { title: '基础属性', pred: (g) => g === 'stat' }
        ];

        groups.forEach((section) => {
            const items = catalog.filter((u) => section.pred(u.group));
            if (!items.length) return;
            const sec = document.createElement('div');
            sec.className = 'stg-build-inv-section';
            const h = document.createElement('div');
            h.className = 'stg-build-inv-section-title';
            h.textContent = section.title;
            sec.appendChild(h);
            items.forEach((u) => {
                const wrap = document.createElement('div');
                wrap.className = 'stg-build-inv-item';
                wrap.dataset.upgradeId = u.id;

                const req = u.requires ? '前置：' + u.requires : '';
                const desc = u.desc != null && String(u.desc).trim() !== '' ? escapeHtml(u.desc) : '';
                const descBlock = desc ? '<div class="stg-build-inv-desc">' + desc + '</div>' : '';

                wrap.innerHTML =
                    '<div class="stg-build-inv-row">' +
                    '<input type="checkbox" data-upgrade-id="' +
                    escapeHtml(u.id) +
                    '" ' +
                    (saved.has(u.id) ? 'checked' : '') +
                    ' />' +
                    '<div class="stg-build-inv-row-content">' +
                    '<div class="stg-build-inv-line1">' +
                    '<span class="stg-build-inv-icon">' +
                    escapeHtml(u.icon || '') +
                    '</span>' +
                    '<span class="stg-build-inv-name">' +
                    escapeHtml(u.name || u.id) +
                    '</span>' +
                    '<code class="stg-build-inv-id">' +
                    escapeHtml(u.id) +
                    '</code>' +
                    '<span class="stg-build-inv-req">' +
                    escapeHtml(req) +
                    '</span>' +
                    '<button type="button" class="stg-build-inv-toggle" aria-expanded="false" title="展开/收起参数">▼</button>' +
                    '</div>' +
                    descBlock +
                    '</div>' +
                    '</div>' +
                    '<div class="stg-build-inv-detail hidden">' +
                    buildDetailHtml(u, ov) +
                    '</div>';

                const cb = wrap.querySelector('input[type="checkbox"]');
                if (cb) {
                    cb.addEventListener('change', () => enforceMutex(cb, cb.checked));
                    cb.addEventListener('click', (e) => e.stopPropagation());
                }
                const toggle = wrap.querySelector('.stg-build-inv-toggle');
                const detail = wrap.querySelector('.stg-build-inv-detail');
                if (toggle && detail) {
                    toggle.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const nowHidden = detail.classList.toggle('hidden');
                        toggle.setAttribute('aria-expanded', nowHidden ? 'false' : 'true');
                        toggle.textContent = nowHidden ? '▼' : '▲';
                    });
                }
                sec.appendChild(wrap);
            });
            listEl.appendChild(sec);
        });
    }

    function collectCheckedIds() {
        const root = document.getElementById('stgBuildInventoryList');
        if (!root) return [];
        const out = [];
        root.querySelectorAll('input[type="checkbox"][data-upgrade-id]').forEach((cb) => {
            if (cb.checked) out.push(cb.dataset.upgradeId);
        });
        return out;
    }

    /** 从面板控件收集 merge 对象 */
    function collectOverridePayload() {
        const root = document.getElementById('stgBuildInventoryList');
        if (!root) return {};
        const partial = {};
        root.querySelectorAll('[data-ov-key][data-ov-field]').forEach((el) => {
            const key = el.getAttribute('data-ov-key');
            const field = el.getAttribute('data-ov-field');
            if (!key || !field) return;
            if (!partial[key]) partial[key] = {};
            let v;
            if (el.tagName === 'SELECT') {
                v = el.value;
            } else if (el.type === 'number') {
                v = parseFloat(el.value);
                if (!Number.isFinite(v)) return;
            } else if (el.type === 'color') {
                v = el.value;
            } else {
                v = el.value;
            }
            partial[key][field] = v;
        });
        return partial;
    }

    function onApply() {
        const ids = collectCheckedIds();
        saveIds(ids);
        const payload = collectOverridePayload();
        if (window.StgMode && typeof window.StgMode.mergeBuildUpgradeOverrides === 'function') {
            window.StgMode.mergeBuildUpgradeOverrides(payload);
        }
        console.log('[STG局内道具] 已保存', ids.length, '条构筑；数值覆盖已写入本地');
        close();
    }

    function open() {
        const el = document.getElementById('stgBuildInventoryPanel');
        if (!el) return;
        if (window.StgMode && typeof window.StgMode.loadBuildUpgradeOverridesFromStorage === 'function') {
            window.StgMode.loadBuildUpgradeOverridesFromStorage();
        }
        render();
        el.classList.remove('hidden');
    }

    function close() {
        const el = document.getElementById('stgBuildInventoryPanel');
        if (el) el.classList.add('hidden');
    }

    function init() {
        const panel = document.getElementById('stgBuildInventoryPanel');
        if (!panel) return;
        const openBtn = document.getElementById('stgOpenStgBuildInventoryBtn');
        const closeBtn = document.getElementById('stgBuildInventoryCloseBtn');
        const applyBtn = document.getElementById('stgBuildInventoryApplyBtn');
        if (openBtn) openBtn.addEventListener('click', open);
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (applyBtn) applyBtn.addEventListener('click', onApply);
        panel.addEventListener('click', (e) => {
            if (e.target === panel) close();
        });
    }

    window.StgBuildInventoryPanel = { init, open, close, render, STORAGE_KEY };
})();

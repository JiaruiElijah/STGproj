/**
 * STG 玩家编辑器：移动与判定 + 武器编辑器（普通 / 慢速 / 大招）；存档键与 stgMode 中 STG_PLAYER_CONFIG_KEY 一致
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'stg_player_config';

    const DEFAULTS = {
        moveSpeed: 200,
        focusMoveMult: 0.34,
        hitRadius: 24,
        mainWeaponAttack: 10,
        bulletRadius: 4,
        bulletVisualShape: 'circle',
        fireIntervalMs: 160,
        bulletSpeed: 420,
        emitStyle: 'single',
        singleCount: 1,
        fanCount: 5,
        ringCount: 12,
        fanSpreadDeg: 60,
        focusWeaponAttack: 10,
        focusBulletRadius: 4,
        focusBulletVisualShape: 'circle',
        focusFireIntervalMs: 160,
        focusBulletSpeed: 420,
        focusEmitStyle: 'single',
        focusSingleCount: 1,
        focusFanCount: 5,
        focusRingCount: 12,
        focusFanSpreadDeg: 60,
        skillWeaponAttack: 10,
        skillBulletRadius: 4,
        skillBulletVisualShape: 'circle',
        skillFireIntervalMs: 120,
        skillCooldownMs: 0,
        skillBulletSpeed: 420,
        skillEmitStyle: 'single',
        skillSingleCount: 1,
        skillFanCount: 5,
        skillRingCount: 12,
        skillFanSpreadDeg: 60
    };

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    function save(obj) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    }

    function val(cfg, key, def) {
        const v = cfg && cfg[key];
        if (v == null || v === '') return def;
        const n = Number(v);
        return Number.isFinite(n) ? n : def;
    }

    function strVal(cfg, key, def) {
        const v = cfg && cfg[key];
        return v != null && v !== '' ? String(v) : def;
    }

    /** @param {string} def */
    function pickVisual(cfg, key, def) {
        const v = cfg && cfg[key];
        if (v === 'circle' || v === 'diamond' || v === 'square') return v;
        return def;
    }

    function syncMainStyleRows() {
        const sel = document.getElementById('stgPlayerEditEmitStyle');
        const v = sel ? sel.value : 'single';
        const rowSingle = document.getElementById('stgPlayerMainSingleRow');
        const rowFan = document.getElementById('stgPlayerMainFanRow');
        const rowRing = document.getElementById('stgPlayerMainRingRow');
        if (rowSingle) rowSingle.classList.toggle('hidden', v !== 'single');
        if (rowFan) rowFan.classList.toggle('hidden', v !== 'fan');
        if (rowRing) rowRing.classList.toggle('hidden', v !== 'ring');
    }

    function syncFocusStyleRows() {
        const sel = document.getElementById('stgPlayerEditFocusEmitStyle');
        const v = sel ? sel.value : 'single';
        const rowSingle = document.getElementById('stgPlayerFocusSingleRow');
        const rowFan = document.getElementById('stgPlayerFocusFanRow');
        const rowRing = document.getElementById('stgPlayerFocusRingRow');
        if (rowSingle) rowSingle.classList.toggle('hidden', v !== 'single');
        if (rowFan) rowFan.classList.toggle('hidden', v !== 'fan');
        if (rowRing) rowRing.classList.toggle('hidden', v !== 'ring');
    }

    function syncSkillStyleRows() {
        const sel = document.getElementById('stgPlayerEditSkillEmitStyle');
        const v = sel ? sel.value : 'single';
        const rowSingle = document.getElementById('stgPlayerSkillSingleRow');
        const rowFan = document.getElementById('stgPlayerSkillFanRow');
        const rowRing = document.getElementById('stgPlayerSkillRingRow');
        if (rowSingle) rowSingle.classList.toggle('hidden', v !== 'single');
        if (rowFan) rowFan.classList.toggle('hidden', v !== 'fan');
        if (rowRing) rowRing.classList.toggle('hidden', v !== 'ring');
    }

    function fillInputs() {
        const cfg = load();
        const setNum = (id, x) => {
            const el = document.getElementById(id);
            if (el) el.value = x;
        };
        setNum('stgPlayerEditMoveSpeed', Math.round(val(cfg, 'moveSpeed', DEFAULTS.moveSpeed)));
        setNum('stgPlayerEditFocusMult', val(cfg, 'focusMoveMult', DEFAULTS.focusMoveMult));
        setNum('stgPlayerEditHitRadius', Math.round(val(cfg, 'hitRadius', DEFAULTS.hitRadius)));

        let mainAtk = val(cfg, 'mainWeaponAttack', NaN);
        if (!Number.isFinite(mainAtk)) {
            const lm = cfg && cfg.bulletDamageMult != null ? val(cfg, 'bulletDamageMult', 1) : NaN;
            mainAtk = Number.isFinite(lm) ? Math.min(500, Math.max(0.5, 10 * lm)) : DEFAULTS.mainWeaponAttack;
        }
        setNum('stgPlayerEditMainAttack', mainAtk);
        setNum('stgPlayerEditBulletRadius', Math.round(val(cfg, 'bulletRadius', DEFAULTS.bulletRadius)));
        const bVis = document.getElementById('stgPlayerEditBulletVisual');
        if (bVis) bVis.value = pickVisual(cfg, 'bulletVisualShape', DEFAULTS.bulletVisualShape);

        const mainFi = val(cfg, 'fireIntervalMs', DEFAULTS.fireIntervalMs);
        const mainBs = val(cfg, 'bulletSpeed', DEFAULTS.bulletSpeed);
        setNum('stgPlayerEditFireInterval', Math.round(mainFi));
        setNum('stgPlayerEditBulletSpeed', Math.round(mainBs));

        const mainStyle = strVal(cfg, 'emitStyle', DEFAULTS.emitStyle);
        const ms = document.getElementById('stgPlayerEditEmitStyle');
        if (ms) ms.value = ['single', 'fan', 'ring'].indexOf(mainStyle) >= 0 ? mainStyle : 'single';
        setNum('stgPlayerEditSingleCount', Math.round(val(cfg, 'singleCount', DEFAULTS.singleCount)));
        setNum('stgPlayerEditFanCount', Math.round(val(cfg, 'fanCount', DEFAULTS.fanCount)));
        setNum('stgPlayerEditRingCount', Math.round(val(cfg, 'ringCount', DEFAULTS.ringCount)));
        setNum('stgPlayerEditFanSpread', Math.round(val(cfg, 'fanSpreadDeg', DEFAULTS.fanSpreadDeg)));

        let focusAtk = val(cfg, 'focusWeaponAttack', NaN);
        if (!Number.isFinite(focusAtk)) {
            if (cfg && cfg.focusBulletDamageMult != null) {
                const fm = val(cfg, 'focusBulletDamageMult', 1);
                focusAtk = Math.min(500, Math.max(0.5, mainAtk * fm));
            } else {
                focusAtk = mainAtk;
            }
        }
        setNum('stgPlayerEditFocusAttack', focusAtk);

        // 慢速武器：无存档时与普通模式对齐，避免误以为「未配置」
        setNum(
            'stgPlayerEditFocusFireInterval',
            Math.round(val(cfg, 'focusFireIntervalMs', val(cfg, 'fireIntervalMs', DEFAULTS.fireIntervalMs)))
        );
        setNum(
            'stgPlayerEditFocusBulletSpeed',
            Math.round(val(cfg, 'focusBulletSpeed', val(cfg, 'bulletSpeed', DEFAULTS.bulletSpeed)))
        );
        const fStyle = strVal(cfg, 'focusEmitStyle', strVal(cfg, 'emitStyle', DEFAULTS.focusEmitStyle));
        const fs = document.getElementById('stgPlayerEditFocusEmitStyle');
        if (fs) fs.value = ['single', 'fan', 'ring'].indexOf(fStyle) >= 0 ? fStyle : 'single';
        setNum(
            'stgPlayerEditFocusSingleCount',
            Math.round(val(cfg, 'focusSingleCount', val(cfg, 'singleCount', DEFAULTS.focusSingleCount)))
        );
        setNum(
            'stgPlayerEditFocusFanCount',
            Math.round(val(cfg, 'focusFanCount', val(cfg, 'fanCount', DEFAULTS.focusFanCount)))
        );
        setNum(
            'stgPlayerEditFocusRingCount',
            Math.round(val(cfg, 'focusRingCount', val(cfg, 'ringCount', DEFAULTS.focusRingCount)))
        );
        setNum(
            'stgPlayerEditFocusFanSpread',
            Math.round(val(cfg, 'focusFanSpreadDeg', val(cfg, 'fanSpreadDeg', DEFAULTS.focusFanSpreadDeg)))
        );

        setNum(
            'stgPlayerEditFocusBulletRadius',
            Math.round(val(cfg, 'focusBulletRadius', val(cfg, 'bulletRadius', DEFAULTS.bulletRadius)))
        );
        const fVis = document.getElementById('stgPlayerEditFocusBulletVisual');
        if (fVis) {
            fVis.value = pickVisual(
                cfg,
                'focusBulletVisualShape',
                pickVisual(cfg, 'bulletVisualShape', DEFAULTS.bulletVisualShape)
            );
        }

        let skillAtk = val(cfg, 'skillWeaponAttack', NaN);
        if (!Number.isFinite(skillAtk)) {
            const sm = cfg && cfg.skillBulletDamageMult != null ? val(cfg, 'skillBulletDamageMult', 1) : NaN;
            skillAtk = Number.isFinite(sm)
                ? Math.min(500, Math.max(0.5, 10 * sm))
                : DEFAULTS.skillWeaponAttack;
        }
        setNum('stgPlayerEditSkillAttack', skillAtk);
        setNum('stgPlayerEditSkillBulletRadius', Math.round(val(cfg, 'skillBulletRadius', DEFAULTS.skillBulletRadius)));
        const sVis = document.getElementById('stgPlayerEditSkillBulletVisual');
        if (sVis) sVis.value = pickVisual(cfg, 'skillBulletVisualShape', DEFAULTS.skillBulletVisualShape);

        setNum('stgPlayerEditSkillFireIv', Math.round(val(cfg, 'skillFireIntervalMs', DEFAULTS.skillFireIntervalMs)));
        setNum('stgPlayerEditSkillCooldown', Math.round(val(cfg, 'skillCooldownMs', DEFAULTS.skillCooldownMs)));
        setNum('stgPlayerEditSkillBulletSpeed', Math.round(val(cfg, 'skillBulletSpeed', DEFAULTS.skillBulletSpeed)));

        const sk = strVal(cfg, 'skillEmitStyle', DEFAULTS.skillEmitStyle);
        const ss = document.getElementById('stgPlayerEditSkillEmitStyle');
        if (ss) ss.value = ['single', 'fan', 'ring'].indexOf(sk) >= 0 ? sk : 'single';
        setNum('stgPlayerEditSkillSingleCount', Math.round(val(cfg, 'skillSingleCount', DEFAULTS.skillSingleCount)));
        setNum('stgPlayerEditSkillFanCount', Math.round(val(cfg, 'skillFanCount', DEFAULTS.skillFanCount)));
        setNum('stgPlayerEditSkillRingCount', Math.round(val(cfg, 'skillRingCount', DEFAULTS.skillRingCount)));
        setNum('stgPlayerEditSkillFanSpread', Math.round(val(cfg, 'skillFanSpreadDeg', DEFAULTS.skillFanSpreadDeg)));

        syncMainStyleRows();
        syncFocusStyleRows();
        syncSkillStyleRows();
    }

    function open() {
        const el = document.getElementById('stgPlayerEditorPanel');
        if (!el) return;
        fillInputs();
        el.classList.remove('hidden');
    }

    function close() {
        const el = document.getElementById('stgPlayerEditorPanel');
        if (el) el.classList.add('hidden');
    }

    function readApplyObject() {
        const g = (id) => {
            const el = document.getElementById(id);
            return el ? el.value : '';
        };
        const gi = (id, min, max, def) => {
            const n = parseInt(g(id), 10);
            if (!Number.isFinite(n)) return def;
            return Math.max(min, Math.min(max, n));
        };
        const gf = (id, min, max, def) => {
            const n = parseFloat(g(id));
            if (!Number.isFinite(n)) return def;
            return Math.max(min, Math.min(max, n));
        };
        const style = g('stgPlayerEditEmitStyle');
        const fStyle = g('stgPlayerEditFocusEmitStyle');
        const skStyle = g('stgPlayerEditSkillEmitStyle');
        const gShape = (id) => {
            const v = g(id);
            return v === 'diamond' || v === 'square' ? v : 'circle';
        };
        const gWeaponAtk = (id, def) => {
            const n = parseFloat(g(id));
            if (!Number.isFinite(n)) return def;
            return Math.max(0.5, Math.min(9999, n));
        };
        return {
            moveSpeed: gi('stgPlayerEditMoveSpeed', 60, 520, DEFAULTS.moveSpeed),
            focusMoveMult: gf('stgPlayerEditFocusMult', 0.05, 0.98, DEFAULTS.focusMoveMult),
            hitRadius: gi('stgPlayerEditHitRadius', 2, 48, DEFAULTS.hitRadius),
            mainWeaponAttack: gWeaponAtk('stgPlayerEditMainAttack', DEFAULTS.mainWeaponAttack),
            bulletRadius: gi('stgPlayerEditBulletRadius', 2, 24, DEFAULTS.bulletRadius),
            bulletVisualShape: gShape('stgPlayerEditBulletVisual'),
            fireIntervalMs: gi('stgPlayerEditFireInterval', 40, 400, DEFAULTS.fireIntervalMs),
            bulletSpeed: gi('stgPlayerEditBulletSpeed', 120, 900, DEFAULTS.bulletSpeed),
            emitStyle: style === 'fan' || style === 'ring' ? style : 'single',
            singleCount: gi('stgPlayerEditSingleCount', 1, 5, DEFAULTS.singleCount),
            fanCount: gi('stgPlayerEditFanCount', 2, 24, DEFAULTS.fanCount),
            ringCount: gi('stgPlayerEditRingCount', 3, 36, DEFAULTS.ringCount),
            fanSpreadDeg: gi('stgPlayerEditFanSpread', 10, 180, DEFAULTS.fanSpreadDeg),
            focusFireIntervalMs: gi('stgPlayerEditFocusFireInterval', 40, 400, DEFAULTS.focusFireIntervalMs),
            focusBulletSpeed: gi('stgPlayerEditFocusBulletSpeed', 120, 900, DEFAULTS.focusBulletSpeed),
            focusEmitStyle: fStyle === 'fan' || fStyle === 'ring' ? fStyle : 'single',
            focusSingleCount: gi('stgPlayerEditFocusSingleCount', 1, 5, DEFAULTS.focusSingleCount),
            focusFanCount: gi('stgPlayerEditFocusFanCount', 2, 24, DEFAULTS.focusFanCount),
            focusRingCount: gi('stgPlayerEditFocusRingCount', 3, 36, DEFAULTS.focusRingCount),
            focusFanSpreadDeg: gi('stgPlayerEditFocusFanSpread', 10, 180, DEFAULTS.focusFanSpreadDeg),
            focusWeaponAttack: gWeaponAtk('stgPlayerEditFocusAttack', DEFAULTS.focusWeaponAttack),
            focusBulletRadius: gi('stgPlayerEditFocusBulletRadius', 2, 24, DEFAULTS.focusBulletRadius),
            focusBulletVisualShape: gShape('stgPlayerEditFocusBulletVisual'),
            skillWeaponAttack: gWeaponAtk('stgPlayerEditSkillAttack', DEFAULTS.skillWeaponAttack),
            skillBulletRadius: gi('stgPlayerEditSkillBulletRadius', 2, 24, DEFAULTS.skillBulletRadius),
            skillBulletVisualShape: gShape('stgPlayerEditSkillBulletVisual'),
            skillFireIntervalMs: gi('stgPlayerEditSkillFireIv', 40, 400, DEFAULTS.skillFireIntervalMs),
            skillCooldownMs: gi('stgPlayerEditSkillCooldown', 0, 60000, DEFAULTS.skillCooldownMs),
            skillBulletSpeed: gi('stgPlayerEditSkillBulletSpeed', 120, 900, DEFAULTS.skillBulletSpeed),
            skillEmitStyle: skStyle === 'fan' || skStyle === 'ring' ? skStyle : 'single',
            skillSingleCount: gi('stgPlayerEditSkillSingleCount', 1, 5, DEFAULTS.skillSingleCount),
            skillFanCount: gi('stgPlayerEditSkillFanCount', 2, 24, DEFAULTS.skillFanCount),
            skillRingCount: gi('stgPlayerEditSkillRingCount', 3, 36, DEFAULTS.skillRingCount),
            skillFanSpreadDeg: gi('stgPlayerEditSkillFanSpread', 10, 180, DEFAULTS.skillFanSpreadDeg)
        };
    }

    function onApply() {
        const o = readApplyObject();
        save(o);
        if (window.StgMode && typeof window.StgMode.applyPlayerEditorConfig === 'function') {
            window.StgMode.applyPlayerEditorConfig();
        }
        console.log('[STG] 玩家编辑器已保存', o);
        close();
    }

    function onReset() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {}
        fillInputs();
        if (window.StgMode && typeof window.StgMode.applyPlayerEditorConfig === 'function') {
            window.StgMode.applyPlayerEditorConfig();
        }
        console.log('[STG] 玩家编辑器已恢复默认（本地存档已清除）');
    }

    function init() {
        const panel = document.getElementById('stgPlayerEditorPanel');
        const openBtn = document.getElementById('stgOpenPlayerEditorBtn');
        const closeBtn = document.getElementById('stgPlayerEditorCloseBtn');
        const applyBtn = document.getElementById('stgPlayerEditorApplyBtn');
        const resetBtn = document.getElementById('stgPlayerEditorResetBtn');
        if (openBtn) openBtn.addEventListener('click', open);
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (applyBtn) applyBtn.addEventListener('click', onApply);
        if (resetBtn) resetBtn.addEventListener('click', onReset);
        if (panel) {
            panel.addEventListener('click', function (e) {
                if (e.target === panel) close();
            });
        }
        const ms = document.getElementById('stgPlayerEditEmitStyle');
        const fs = document.getElementById('stgPlayerEditFocusEmitStyle');
        const ss = document.getElementById('stgPlayerEditSkillEmitStyle');
        if (ms) ms.addEventListener('change', syncMainStyleRows);
        if (fs) fs.addEventListener('change', syncFocusStyleRows);
        if (ss) ss.addEventListener('change', syncSkillStyleRows);
    }

    window.StgPlayerEditorPanel = { init, open, close, load, STORAGE_KEY };
})();

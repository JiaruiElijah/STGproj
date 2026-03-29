/**
 * STG 场景道具编辑器：P 点 / 充能点 各自的外观、轨迹与速率；存档键与 stgMode 中 STG_SCENE_PROPS_KEY 一致
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'stg_scene_props_config';

    const DEFAULTS = {
        pTrajectory: 'straight_down',
        pStraightVy: 80,
        pArcUpSpeed: 120,
        pArcPeakPx: 55,
        pArcDownSpeed: 85,
        pArcUpSpeedMode: 'uniform',
        pArcDownSpeedMode: 'uniform',
        pShape: 'circle',
        pSizePx: 20,
        cTrajectory: 'straight_down',
        cStraightVy: 80,
        cArcUpSpeed: 120,
        cArcPeakPx: 55,
        cArcDownSpeed: 85,
        cArcUpSpeedMode: 'uniform',
        cArcDownSpeedMode: 'uniform',
        cShape: 'square',
        cSizePx: 22,
        chargePointValue: 45,
        grazedBulletAlpha: 0.38
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

    function syncTrajectoryRowsP() {
        const sel = document.getElementById('stgScenePropsTrajectory');
        const v = sel ? sel.value : 'straight_down';
        const straight = document.getElementById('stgScenePropsStraightRow');
        const arc = document.getElementById('stgScenePropsArcRow');
        if (straight) straight.classList.toggle('hidden', v !== 'straight_down');
        if (arc) arc.classList.toggle('hidden', v !== 'arc_up_down');
    }

    function syncTrajectoryRowsC() {
        const sel = document.getElementById('stgScenePropsCTrajectory');
        const v = sel ? sel.value : 'straight_down';
        const straight = document.getElementById('stgScenePropsCStraightRow');
        const arc = document.getElementById('stgScenePropsCArcRow');
        if (straight) straight.classList.toggle('hidden', v !== 'straight_down');
        if (arc) arc.classList.toggle('hidden', v !== 'arc_up_down');
    }

    function syncTrajectoryRows() {
        syncTrajectoryRowsP();
        syncTrajectoryRowsC();
    }

    /** 与 stgMode normalizeArcUpSpeedMode 一致，用于读旧存档 curve */
    function normalizeUpModeFromCfg(cfg) {
        const m = cfg && cfg.pArcUpSpeedMode;
        if (m === 'ease_in' || m === 'ease_out' || m === 'ease_in_out') return m;
        if (m === 'curve') return 'ease_in_out';
        return 'uniform';
    }

    function normalizeDownModeFromCfg(cfg) {
        const m = cfg && cfg.pArcDownSpeedMode;
        if (m === 'ease_in' || m === 'ease_out') return m;
        if (m === 'curve') return 'ease_in';
        return 'uniform';
    }

    function normalizeCUpModeFromCfg(cfg) {
        const m = cfg && cfg.cArcUpSpeedMode != null ? cfg.cArcUpSpeedMode : cfg && cfg.pArcUpSpeedMode;
        if (m === 'ease_in' || m === 'ease_out' || m === 'ease_in_out') return m;
        if (m === 'curve') return 'ease_in_out';
        return 'uniform';
    }

    function normalizeCDownModeFromCfg(cfg) {
        const m = cfg && cfg.cArcDownSpeedMode != null ? cfg.cArcDownSpeedMode : cfg && cfg.pArcDownSpeedMode;
        if (m === 'ease_in' || m === 'ease_out') return m;
        if (m === 'curve') return 'ease_in';
        return 'uniform';
    }

    /** 与 stgMode.normalizeScenePropsConfig 一致：旧档无 c* 时充能点轨迹与 P 点一致 */
    function normalizeEditorCfg(raw) {
        const m = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
        const o = raw && typeof raw === 'object' ? raw : {};
        if (!('cTrajectory' in o)) {
            m.cTrajectory = m.pTrajectory;
            m.cStraightVy = m.pStraightVy;
            m.cArcUpSpeed = m.pArcUpSpeed;
            m.cArcPeakPx = m.pArcPeakPx;
            m.cArcDownSpeed = m.pArcDownSpeed;
            m.cArcUpSpeedMode = m.pArcUpSpeedMode;
            m.cArcDownSpeedMode = m.pArcDownSpeedMode;
        }
        return m;
    }

    function fillInputs() {
        const cfg = normalizeEditorCfg(load());
        const st = document.getElementById('stgScenePropsTrajectory');
        if (st) st.value = cfg.pTrajectory === 'arc_up_down' ? 'arc_up_down' : 'straight_down';
        const stc = document.getElementById('stgScenePropsCTrajectory');
        if (stc) {
            stc.value = cfg.cTrajectory === 'arc_up_down' ? 'arc_up_down' : 'straight_down';
        }
        const setNum = (id, key, def) => {
            const el = document.getElementById(id);
            const v = cfg[key] != null ? Number(cfg[key]) : def;
            if (el) el.value = v;
        };
        setNum('stgScenePropsStraightVy', 'pStraightVy', DEFAULTS.pStraightVy);
        setNum('stgScenePropsArcUpSpeed', 'pArcUpSpeed', DEFAULTS.pArcUpSpeed);
        setNum('stgScenePropsArcPeakPx', 'pArcPeakPx', DEFAULTS.pArcPeakPx);
        setNum('stgScenePropsArcDownSpeed', 'pArcDownSpeed', DEFAULTS.pArcDownSpeed);
        setNum('stgScenePropsPSizePx', 'pSizePx', DEFAULTS.pSizePx);
        setNum('stgScenePropsCStraightVy', 'cStraightVy', DEFAULTS.cStraightVy);
        setNum('stgScenePropsCArcUpSpeed', 'cArcUpSpeed', DEFAULTS.cArcUpSpeed);
        setNum('stgScenePropsCArcPeakPx', 'cArcPeakPx', DEFAULTS.cArcPeakPx);
        setNum('stgScenePropsCArcDownSpeed', 'cArcDownSpeed', DEFAULTS.cArcDownSpeed);
        setNum('stgScenePropsCSizePx', 'cSizePx', DEFAULTS.cSizePx);
        const upMode = document.getElementById('stgScenePropsArcUpSpeedMode');
        const downMode = document.getElementById('stgScenePropsArcDownSpeedMode');
        if (upMode) upMode.value = normalizeUpModeFromCfg(cfg);
        if (downMode) downMode.value = normalizeDownModeFromCfg(cfg);
        const cup = document.getElementById('stgScenePropsCArcUpSpeedMode');
        const cdown = document.getElementById('stgScenePropsCArcDownSpeedMode');
        if (cup) cup.value = normalizeCUpModeFromCfg(cfg);
        if (cdown) cdown.value = normalizeCDownModeFromCfg(cfg);
        const pShape = document.getElementById('stgScenePropsPShape');
        if (pShape) {
            const s = cfg.pShape;
            pShape.value = s === 'square' || s === 'diamond' ? s : 'circle';
        }
        const cShape = document.getElementById('stgScenePropsCShape');
        if (cShape) {
            const s = cfg.cShape;
            cShape.value = s === 'circle' || s === 'square' || s === 'diamond' ? s : 'square';
        }
        setNum('stgScenePropsChargeValue', 'chargePointValue', DEFAULTS.chargePointValue);
        const gba = document.getElementById('stgScenePropsGrazedBulletAlpha');
        if (gba) {
            const v = cfg.grazedBulletAlpha != null ? Number(cfg.grazedBulletAlpha) : DEFAULTS.grazedBulletAlpha;
            gba.value = Number.isFinite(v) ? v : DEFAULTS.grazedBulletAlpha;
        }
        syncTrajectoryRows();
    }

    function readObject() {
        const trajEl = document.getElementById('stgScenePropsTrajectory');
        const traj = trajEl && trajEl.value === 'arc_up_down' ? 'arc_up_down' : 'straight_down';
        const trajCEl = document.getElementById('stgScenePropsCTrajectory');
        const cTraj = trajCEl && trajCEl.value === 'arc_up_down' ? 'arc_up_down' : 'straight_down';
        const gi = (id, min, max, def) => {
            const el = document.getElementById(id);
            const n = parseInt(el && el.value, 10);
            if (!Number.isFinite(n)) return def;
            return Math.max(min, Math.min(max, n));
        };
        const gf = (id, min, max, def) => {
            const el = document.getElementById(id);
            const n = parseFloat(el && el.value);
            if (!Number.isFinite(n)) return def;
            return Math.max(min, Math.min(max, n));
        };
        const upSel = document.getElementById('stgScenePropsArcUpSpeedMode');
        const downSel = document.getElementById('stgScenePropsArcDownSpeedMode');
        const rawUp = upSel ? upSel.value : 'uniform';
        const rawDown = downSel ? downSel.value : 'uniform';
        const pArcUpSpeedMode =
            rawUp === 'ease_in' || rawUp === 'ease_out' || rawUp === 'ease_in_out' ? rawUp : 'uniform';
        const pArcDownSpeedMode = rawDown === 'ease_in' || rawDown === 'ease_out' ? rawDown : 'uniform';
        const cupSel = document.getElementById('stgScenePropsCArcUpSpeedMode');
        const cdownSel = document.getElementById('stgScenePropsCArcDownSpeedMode');
        const rawCUp = cupSel ? cupSel.value : 'uniform';
        const rawCDown = cdownSel ? cdownSel.value : 'uniform';
        const cArcUpSpeedMode =
            rawCUp === 'ease_in' || rawCUp === 'ease_out' || rawCUp === 'ease_in_out' ? rawCUp : 'uniform';
        const cArcDownSpeedMode = rawCDown === 'ease_in' || rawCDown === 'ease_out' ? rawCDown : 'uniform';
        const pShapeEl = document.getElementById('stgScenePropsPShape');
        const cShapeEl = document.getElementById('stgScenePropsCShape');
        let pShape = 'circle';
        if (pShapeEl) {
            if (pShapeEl.value === 'square') pShape = 'square';
            else if (pShapeEl.value === 'diamond') pShape = 'diamond';
        }
        let cShape = 'square';
        if (cShapeEl) {
            if (cShapeEl.value === 'circle') cShape = 'circle';
            else if (cShapeEl.value === 'diamond') cShape = 'diamond';
        }

        return {
            pTrajectory: traj,
            pStraightVy: gi('stgScenePropsStraightVy', 20, 400, DEFAULTS.pStraightVy),
            pArcUpSpeed: gi('stgScenePropsArcUpSpeed', 40, 400, DEFAULTS.pArcUpSpeed),
            pArcPeakPx: gi('stgScenePropsArcPeakPx', 10, 220, DEFAULTS.pArcPeakPx),
            pArcDownSpeed: gi('stgScenePropsArcDownSpeed', 40, 600, DEFAULTS.pArcDownSpeed),
            pArcUpSpeedMode,
            pArcDownSpeedMode,
            pShape,
            pSizePx: gi('stgScenePropsPSizePx', 10, 48, DEFAULTS.pSizePx),
            cTrajectory: cTraj,
            cStraightVy: gi('stgScenePropsCStraightVy', 20, 400, DEFAULTS.cStraightVy),
            cArcUpSpeed: gi('stgScenePropsCArcUpSpeed', 40, 400, DEFAULTS.cArcUpSpeed),
            cArcPeakPx: gi('stgScenePropsCArcPeakPx', 10, 220, DEFAULTS.cArcPeakPx),
            cArcDownSpeed: gi('stgScenePropsCArcDownSpeed', 40, 600, DEFAULTS.cArcDownSpeed),
            cArcUpSpeedMode,
            cArcDownSpeedMode,
            cShape,
            cSizePx: gi('stgScenePropsCSizePx', 10, 48, DEFAULTS.cSizePx),
            chargePointValue: gi('stgScenePropsChargeValue', 5, 500, DEFAULTS.chargePointValue),
            grazedBulletAlpha: gf('stgScenePropsGrazedBulletAlpha', 0.05, 0.98, DEFAULTS.grazedBulletAlpha)
        };
    }

    function open() {
        const el = document.getElementById('stgScenePropsEditorPanel');
        if (!el) return;
        fillInputs();
        el.classList.remove('hidden');
    }

    function close() {
        const el = document.getElementById('stgScenePropsEditorPanel');
        if (el) el.classList.add('hidden');
    }

    function onApply() {
        const o = readObject();
        save(o);
        if (window.StgMode && typeof window.StgMode.applyScenePropsEditorConfig === 'function') {
            window.StgMode.applyScenePropsEditorConfig();
        }
        console.log('[STG] 场景道具已保存', o);
        close();
    }

    function onReset() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {}
        fillInputs();
        if (window.StgMode && typeof window.StgMode.applyScenePropsEditorConfig === 'function') {
            window.StgMode.applyScenePropsEditorConfig();
        }
        console.log('[STG] 场景道具已恢复默认');
    }

    function init() {
        const panel = document.getElementById('stgScenePropsEditorPanel');
        const openBtn = document.getElementById('stgOpenScenePropsEditorBtn');
        const closeBtn = document.getElementById('stgScenePropsEditorCloseBtn');
        const applyBtn = document.getElementById('stgScenePropsEditorApplyBtn');
        const resetBtn = document.getElementById('stgScenePropsEditorResetBtn');
        const traj = document.getElementById('stgScenePropsTrajectory');
        const trajC = document.getElementById('stgScenePropsCTrajectory');
        if (openBtn) openBtn.addEventListener('click', open);
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (applyBtn) applyBtn.addEventListener('click', onApply);
        if (resetBtn) resetBtn.addEventListener('click', onReset);
        if (traj) traj.addEventListener('change', syncTrajectoryRowsP);
        if (trajC) trajC.addEventListener('change', syncTrajectoryRowsC);
        if (panel) {
            panel.addEventListener('click', function (e) {
                if (e.target === panel) close();
            });
        }
    }

    window.StgScenePropsEditorPanel = { init, open, close, load, STORAGE_KEY };
})();

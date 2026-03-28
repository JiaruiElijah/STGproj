/**
 * STG 场景道具编辑器：P 点掉落轨迹等；存档键与 stgMode 中 STG_SCENE_PROPS_KEY 一致
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'stg_scene_props_config';

    const DEFAULTS = {
        pTrajectory: 'straight_down',
        pStraightVy: 80,
        pArcUpSpeed: 120,
        pArcPeakPx: 55,
        pArcDownSpeed: 85
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

    function syncTrajectoryRows() {
        const sel = document.getElementById('stgScenePropsTrajectory');
        const v = sel ? sel.value : 'straight_down';
        const straight = document.getElementById('stgScenePropsStraightRow');
        const arc = document.getElementById('stgScenePropsArcRow');
        if (straight) straight.classList.toggle('hidden', v !== 'straight_down');
        if (arc) arc.classList.toggle('hidden', v !== 'arc_up_down');
    }

    function fillInputs() {
        const cfg = load();
        const st = document.getElementById('stgScenePropsTrajectory');
        if (st) st.value = cfg && cfg.pTrajectory === 'arc_up_down' ? 'arc_up_down' : 'straight_down';
        const setNum = (id, key, def) => {
            const el = document.getElementById(id);
            const v = cfg && cfg[key] != null ? Number(cfg[key]) : def;
            if (el) el.value = v;
        };
        setNum('stgScenePropsStraightVy', 'pStraightVy', DEFAULTS.pStraightVy);
        setNum('stgScenePropsArcUpSpeed', 'pArcUpSpeed', DEFAULTS.pArcUpSpeed);
        setNum('stgScenePropsArcPeakPx', 'pArcPeakPx', DEFAULTS.pArcPeakPx);
        setNum('stgScenePropsArcDownSpeed', 'pArcDownSpeed', DEFAULTS.pArcDownSpeed);
        syncTrajectoryRows();
    }

    function readObject() {
        const trajEl = document.getElementById('stgScenePropsTrajectory');
        const traj = trajEl && trajEl.value === 'arc_up_down' ? 'arc_up_down' : 'straight_down';
        const gi = (id, min, max, def) => {
            const el = document.getElementById(id);
            const n = parseInt(el && el.value, 10);
            if (!Number.isFinite(n)) return def;
            return Math.max(min, Math.min(max, n));
        };
        return {
            pTrajectory: traj,
            pStraightVy: gi('stgScenePropsStraightVy', 20, 400, DEFAULTS.pStraightVy),
            pArcUpSpeed: gi('stgScenePropsArcUpSpeed', 40, 400, DEFAULTS.pArcUpSpeed),
            pArcPeakPx: gi('stgScenePropsArcPeakPx', 10, 220, DEFAULTS.pArcPeakPx),
            pArcDownSpeed: gi('stgScenePropsArcDownSpeed', 40, 600, DEFAULTS.pArcDownSpeed)
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
        if (openBtn) openBtn.addEventListener('click', open);
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (applyBtn) applyBtn.addEventListener('click', onApply);
        if (resetBtn) resetBtn.addEventListener('click', onReset);
        if (traj) traj.addEventListener('change', syncTrajectoryRows);
        if (panel) {
            panel.addEventListener('click', function (e) {
                if (e.target === panel) close();
            });
        }
    }

    window.StgScenePropsEditorPanel = { init, open, close, load, STORAGE_KEY };
})();

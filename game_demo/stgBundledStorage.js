/**
 * STG 本地存档「一键导出 / 随包自动导入」
 *
 * 浏览器安全限制：无法不经用户同意直接写入磁盘路径；故提供：
 * - 全部导出：优先「选择文件夹」写入（Chrome/Edge）；否则下载单个 JSON。
 * - 他人解压后：将 stgBundledLocalStorage.json 放在 game_demo 与 index.html 同目录，
 *   首次加载会 fetch 并写入 localStorage，与作者本机配置对齐。
 */
(function () {
    'use strict';

    /** 与各处编辑器、game.js、stgMode.js 使用的键名保持一致 */
    const STG_BUNDLE_KEYS = [
        'tower_defense_wave_config',
        'tower_defense_enemy_types',
        'stg_player_config',
        'stg_scene_props_config',
        'stg_build_inventory_granted',
        'stg_build_upgrade_overrides',
        'stg_enemy_bullet_texture_disabled',
        'tower_defense_hero_overrides',
        'tower_defense_hero_inventory_override',
        'stg_player_enhance_inventory',
        'stg_enhance_items_custom',
        'tower_defense_base_spirit_config',
        'stg_ui_lang',
        'stg_boss_configs',
        'stg_boss_bullet_texture_pool'
    ];

    function collectKeysFromLocalStorage() {
        const keys = {};
        for (let i = 0; i < STG_BUNDLE_KEYS.length; i++) {
            const k = STG_BUNDLE_KEYS[i];
            try {
                const v = localStorage.getItem(k);
                if (v != null && v !== '') keys[k] = v;
            } catch (e) {
                /* 私密模式等可能抛错 */
            }
        }
        return keys;
    }

    function buildExportObject() {
        return {
            version: 1,
            exportedAt: new Date().toISOString(),
            keys: collectKeysFromLocalStorage()
        };
    }

    /**
     * 是否已有任一键对应的本地存档（用于避免「每次刷新都从 stgBundledLocalStorage.json 覆盖」导致编辑器保存失效）。
     * @returns {boolean}
     */
    function hasAnyBundledLocalStorageData() {
        for (let i = 0; i < STG_BUNDLE_KEYS.length; i++) {
            try {
                const v = localStorage.getItem(STG_BUNDLE_KEYS[i]);
                if (v != null && v !== '') return true;
            } catch (e) {
                /* 忽略 */
            }
        }
        return false;
    }

    /**
     * @param {object} obj
     * @returns {boolean} 是否写入了至少一项
     */
    function applyImportObject(obj) {
        if (!obj || obj.version !== 1 || !obj.keys || typeof obj.keys !== 'object') {
            console.warn('[STG Bundle] 无效的 bundle 格式');
            return false;
        }
        let n = 0;
        const ks = Object.keys(obj.keys);
        for (let i = 0; i < ks.length; i++) {
            const k = ks[i];
            try {
                const v = obj.keys[k];
                if (typeof v === 'string') {
                    localStorage.setItem(k, v);
                    n++;
                }
            } catch (e) {
                console.warn('[STG Bundle] 写入失败', k, e);
            }
        }
        if (n > 0) console.log('[STG Bundle] 已从文件恢复 localStorage，共', n, '项');
        return n > 0;
    }

    /**
     * 页面尽早调用：若 game_demo 下存在 stgBundledLocalStorage.json，则写入 localStorage。
     * 若本地**已有**任一键的存档，则**不再**自动导入，避免刷新页面时旧包反复覆盖你在编辑器里的保存。
     * 需要强制用包覆盖时：地址栏加参数 `?forceBundle=1` 后刷新。
     * @returns {Promise<void>}
     */
    async function applyBundledLocalStorageFromFetch() {
        try {
            let force = false;
            try {
                const sp = new URLSearchParams(window.location.search || '');
                force = sp.get('forceBundle') === '1';
            } catch (e2) {
                /* 忽略 */
            }
            if (!force && hasAnyBundledLocalStorageData()) {
                console.log(
                    '[STG Bundle] 本地已有存档，已跳过自动导入 stgBundledLocalStorage.json（防止覆盖你的修改）。' +
                        ' 若需强制用包文件覆盖，请在 URL 后加 ?forceBundle=1 再刷新。'
                );
                return;
            }
            const r = await fetch('stgBundledLocalStorage.json?' + Date.now(), { cache: 'no-store' });
            if (!r.ok) return;
            const text = await r.text();
            const obj = JSON.parse(text);
            applyImportObject(obj);
        } catch (e) {
            /* 无文件或 JSON 无效：静默，走默认 waveConfig / 内置怪 */
        }
    }

    function downloadJson(filename, text) {
        const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    /**
     * 尝试写入「与 game_demo 同级的」兼容文件，便于仍依赖 fetch waveConfig / enemyTypesBundled 的旧逻辑。
     * @param {FileSystemDirectoryHandle} dir
     */
    async function writeMirrorCompatibilityFiles(dir) {
        const wave = localStorage.getItem('tower_defense_wave_config');
        if (wave) {
            try {
                const pretty = JSON.stringify(JSON.parse(wave), null, 2);
                const fh = await dir.getFileHandle('waveConfig.json', { create: true });
                const w = await fh.createWritable();
                await w.write(pretty);
                await w.close();
            } catch (e) {
                console.warn('[STG Bundle] 写入 waveConfig.json 失败', e);
            }
        }
        const enemy = localStorage.getItem('tower_defense_enemy_types');
        if (enemy) {
            try {
                const pretty = JSON.stringify(JSON.parse(enemy), null, 2);
                const fh = await dir.getFileHandle('enemyTypesBundled.json', { create: true });
                const w = await fh.createWritable();
                await w.write(pretty);
                await w.close();
            } catch (e) {
                console.warn('[STG Bundle] 写入 enemyTypesBundled.json 失败', e);
            }
        }
    }

    /**
     * 全部导出：优先弹出系统文件夹选择器并写入；不支持或用户取消则下载 JSON。
     */
    async function exportStgBundledLocalStorageAll() {
        const obj = buildExportObject();
        const text = JSON.stringify(obj, null, 2);
        const keyCount = Object.keys(obj.keys).length;
        if (keyCount === 0) {
            alert('当前没有可导出的本地存档（请先在各编辑器中保存过）。');
            return;
        }

        if (typeof window.showDirectoryPicker === 'function') {
            try {
                const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
                const fh = await dir.getFileHandle('stgBundledLocalStorage.json', { create: true });
                const w = await fh.createWritable();
                await w.write(text);
                await w.close();
                await writeMirrorCompatibilityFiles(dir);
                alert(
                    '已写入所选文件夹：\n' +
                        '· stgBundledLocalStorage.json（主包，他人解压到 game_demo 即可自动导入）\n' +
                        '· 若存在波次/怪物数据，另含 waveConfig.json、enemyTypesBundled.json（兼容旧加载）\n\n' +
                        '将整个项目文件夹打包发给对方即可。'
                );
                return;
            } catch (e) {
                if (e && e.name === 'AbortError') return;
                console.warn('[STG Bundle] 文件夹写入失败，改为下载', e);
            }
        }
        downloadJson('stgBundledLocalStorage.json', text);
        alert(
            '已下载 stgBundledLocalStorage.json。\n请将该文件放入本页的 game_demo 目录（与 index.html 同级），再打包整个项目发送。\n对方解压后用 HTTP 打开即可自动读取。'
        );
    }

    window.applyStgBundledLocalStorageFromFetch = applyBundledLocalStorageFromFetch;
    window.exportStgBundledLocalStorageAll = exportStgBundledLocalStorageAll;
    window.STG_BUNDLE_KEYS = STG_BUNDLE_KEYS;
    /** 供调试：强制从包导入时可先清空再刷新，或调此函数 */
    window.applyStgBundledLocalStorageFromFetchForce = async function () {
        const r = await fetch('stgBundledLocalStorage.json?' + Date.now(), { cache: 'no-store' });
        if (!r.ok) return false;
        const obj = JSON.parse(await r.text());
        return applyImportObject(obj);
    };

    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('stgExportAllBundledBtn');
        if (btn) {
            btn.addEventListener('click', () => {
                exportStgBundledLocalStorageAll();
            });
        }
    });
})();

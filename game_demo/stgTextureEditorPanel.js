/**
 * 敌弹贴图编辑器：与怪物编辑器共用 tower_defense_enemy_types，仅编辑 stgEnemyBulletSprite；
 * 支持选择本地文件写入文件名（需手动将同名文件放到 art_assets/bullets）、按种类清除贴图、全局暂不用位图。
 */
(function () {
    const STORAGE_KEY = 'tower_defense_enemy_types';
    const BUILTIN_TYPE_IDS = ['normal', 'fast', 'tank'];

    let panelEl = null;
    let listEl = null;
    let globalCb = null;

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

    function sanitizeFilename(name) {
        const base = String(name).replace(/^.*[/\\]/, '');
        return /^[\w.-]+$/i.test(base) ? base : '';
    }

    function loadSavedTypes() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return {};
            const o = JSON.parse(raw);
            return o && typeof o === 'object' ? o : {};
        } catch (e) {
            return {};
        }
    }

    function setPreviewImg(imgEl, filename) {
        if (!imgEl) return;
        const fn = sanitizeFilename(filename);
        if (!fn) {
            imgEl.removeAttribute('src');
            imgEl.classList.add('stg-tex-preview--empty');
            return;
        }
        imgEl.classList.remove('stg-tex-preview--empty');
        const u1 = new URL('art_assets/bullets/' + encodeURIComponent(fn), window.location.href).href;
        const u2 = new URL('../art_assets/bullets/' + encodeURIComponent(fn), window.location.href).href;
        imgEl.onerror = function tryFallback() {
            imgEl.onerror = function onBothFail() {
                imgEl.classList.add('stg-tex-preview--empty');
                imgEl.removeAttribute('src');
            };
            imgEl.src = u2;
        };
        imgEl.src = u1;
    }

    function render() {
        if (!listEl) return;
        const types = loadSavedTypes();
        let ids = Object.keys(types);
        if (ids.length === 0) {
            ids = BUILTIN_TYPE_IDS.slice();
        }
        ids = sortMonsterTypeIds(ids);
        listEl.innerHTML = '';

        ids.forEach((id) => {
            const d = types[id] || {};
            const name = d.name != null ? String(d.name) : id;
            const cur = d.stgEnemyBulletSprite != null ? String(d.stgEnemyBulletSprite) : '';

            const row = document.createElement('div');
            row.className = 'stg-texture-editor-row';
            row.dataset.typeId = id;

            const title = document.createElement('div');
            title.className = 'stg-texture-editor-title';
            title.textContent = id + ' · ' + name;

            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'stg-texture-filename-input';
            inp.value = cur;
            inp.placeholder = '文件名，如 enemy_round_red.jpg；留空并应用=仅矢量';
            inp.autocomplete = 'off';

            const fileInp = document.createElement('input');
            fileInp.type = 'file';
            fileInp.accept = 'image/*';
            fileInp.className = 'stg-texture-file-input hidden';
            fileInp.setAttribute('aria-hidden', 'true');

            const btnPick = document.createElement('button');
            btnPick.type = 'button';
            btnPick.className = 'open-shop-btn';
            btnPick.textContent = '选择文件';

            const btnClear = document.createElement('button');
            btnClear.type = 'button';
            btnClear.className = 'open-shop-btn';
            btnClear.textContent = '清除贴图';

            const preview = document.createElement('img');
            preview.className = 'stg-tex-preview';
            preview.alt = '';
            setPreviewImg(preview, cur);

            btnPick.addEventListener('click', () => fileInp.click());

            fileInp.addEventListener('change', () => {
                const f = fileInp.files && fileInp.files[0];
                if (!f) return;
                const sn = sanitizeFilename(f.name);
                if (!sn) {
                    window.alert('文件名仅支持英文、数字、下划线、点与横线；请重命名后再选。');
                    fileInp.value = '';
                    return;
                }
                inp.value = sn;
                preview.classList.remove('stg-tex-preview--empty');
                try {
                    preview.src = URL.createObjectURL(f);
                } catch (e) {
                    setPreviewImg(preview, sn);
                }
                fileInp.value = '';
            });

            inp.addEventListener('input', () => {
                setPreviewImg(preview, inp.value.trim());
            });

            btnClear.addEventListener('click', () => {
                inp.value = '';
                setPreviewImg(preview, '');
            });

            const actions = document.createElement('div');
            actions.className = 'stg-texture-editor-actions';
            actions.appendChild(inp);
            actions.appendChild(fileInp);
            actions.appendChild(btnPick);
            actions.appendChild(btnClear);

            row.appendChild(title);
            row.appendChild(actions);
            row.appendChild(preview);
            listEl.appendChild(row);
        });

        if (globalCb) {
            const g =
                window.StgMode && typeof window.StgMode.getEnemyBulletTextureGloballyDisabled === 'function'
                    ? window.StgMode.getEnemyBulletTextureGloballyDisabled()
                    : false;
            globalCb.checked = !!g;
        }
    }

    function applyFromDom() {
        const types = loadSavedTypes();
        const rows = listEl ? listEl.querySelectorAll('.stg-texture-editor-row') : [];
        rows.forEach((row) => {
            const id = row.dataset.typeId;
            if (!id) return;
            const inp = row.querySelector('.stg-texture-filename-input');
            const raw = inp ? String(inp.value).trim() : '';
            if (!types[id]) {
                types[id] = { name: id };
            }
            /** 显式写空串：绘制时不套默认 jpg（见 stgMode drawStgEnemyBulletFill） */
            types[id].stgEnemyBulletSprite = raw;
        });
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(types));
        } catch (e) {
            window.alert('保存失败：' + (e && e.message ? e.message : String(e)));
            return;
        }
        if (globalCb) {
            const on = !!globalCb.checked;
            if (window.StgMode && typeof window.StgMode.setEnemyBulletTextureGloballyDisabled === 'function') {
                window.StgMode.setEnemyBulletTextureGloballyDisabled(on);
            }
        }
        if (window.StgMode && typeof window.StgMode.reloadEnemyBulletSpritesFromStorage === 'function') {
            window.StgMode.reloadEnemyBulletSpritesFromStorage();
        }
        console.log(
            '[STG] 敌弹贴图编辑器已应用并保存；已刷新贴图缓存（带版本参数防浏览器旧缓存）。请确认同名文件已放入 art_assets/bullets/'
        );
        close();
    }

    function open() {
        if (!panelEl) return;
        panelEl.classList.remove('hidden');
        render();
    }

    function close() {
        if (panelEl) panelEl.classList.add('hidden');
    }

    function init() {
        panelEl = document.getElementById('stgTextureEditorPanel');
        listEl = document.getElementById('stgTextureEditorList');
        globalCb = document.getElementById('stgTextureGlobalDisableCb');
        const closeBtn = document.getElementById('stgTextureEditorCloseBtn');
        const applyBtn = document.getElementById('stgTextureEditorApplyBtn');
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (applyBtn) applyBtn.addEventListener('click', applyFromDom);
        if (panelEl) {
            panelEl.addEventListener('click', (e) => {
                if (e.target === panelEl) close();
            });
        }
    }

    window.StgTextureEditorPanel = { init, open, close };
})();

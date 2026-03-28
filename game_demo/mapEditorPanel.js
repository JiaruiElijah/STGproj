/**
 * 地图编辑器：石块、出怪口、基地、矿石、矿机（与 GameMap 持久化对接）
 */
(function () {
    let game = null;
    let panelEl = null;
    let openState = false;
    /** @type {'stone'|'erase'|'base'|'spawn'|'ore'|'miner'|null} */
    let currentTool = null;

    function updateToolButtons() {
        if (!panelEl) return;
        panelEl.querySelectorAll('[data-map-tool]').forEach(btn => {
            const t = btn.getAttribute('data-map-tool');
            const active = currentTool === t;
            btn.classList.toggle('active', active);
        });
    }

    /**
     * 从面板输入读取矿石/矿机数值（矿石放置与矿机放置共用「矿机周期」两项）
     */
    function getOreMinerOptionsFromInputs() {
        const livesEl = document.getElementById('mapEditorOreLives');
        const hpEl = document.getElementById('mapEditorOreHpPerLife');
        const splEl = document.getElementById('mapEditorOreSpiritPerLife');
        const mIntEl = document.getElementById('mapEditorMinerIntervalSec');
        const mTickEl = document.getElementById('mapEditorMinerSpiritPerTick');
        const lives = livesEl ? Math.max(1, parseInt(livesEl.value, 10) || 3) : 3;
        const DEFAULT_HP = 100;
        const hpPerLife = hpEl ? Math.max(1, parseInt(hpEl.value, 10) || DEFAULT_HP) : DEFAULT_HP;
        const spiritPerLife = splEl ? Math.max(0, parseFloat(splEl.value) || 0) : 0;
        const minerIntervalSec = mIntEl ? Math.max(0.1, parseFloat(mIntEl.value) || 3) : 3;
        const minerSpiritPerTick = mTickEl ? Math.max(0, parseFloat(mTickEl.value) || 0) : 1;
        return {
            lives,
            hpPerLife,
            spiritPerLife,
            minerIntervalSec,
            minerSpiritPerTick
        };
    }

    function init(tdGame) {
        game = tdGame;
        panelEl = document.getElementById('mapEditorPanel');
        const openBtn = document.getElementById('openMapEditorBtn');
        const closeBtn = document.getElementById('closeMapEditorBtn');

        if (openBtn) {
            openBtn.addEventListener('click', () => {
                if (openState) {
                    close();
                } else {
                    open();
                }
            });
        }
        if (closeBtn) {
            closeBtn.addEventListener('click', () => close());
        }
        if (panelEl) {
            panelEl.querySelectorAll('[data-map-tool]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const t = btn.getAttribute('data-map-tool');
                    currentTool = t === 'none' || !t ? null : t;
                    updateToolButtons();
                    console.log('[地图编辑] 当前工具:', currentTool || '未选择');
                });
            });
        }
        const hpInput = document.getElementById('mapEditorOreHpPerLife');
        if (hpInput) {
            const syncHpToAllOres = () => {
                if (!game || !game.map || typeof game.map.applyHpPerLifeToAllOres !== 'function') return;
                const v = Math.max(1, parseInt(hpInput.value, 10) || 100);
                game.map.applyHpPerLifeToAllOres(v);
            };
            hpInput.addEventListener('input', syncHpToAllOres);
            hpInput.addEventListener('change', syncHpToAllOres);
        }
    }

    function open() {
        openState = true;
        if (panelEl) panelEl.classList.remove('hidden');
        const openBtn = document.getElementById('openMapEditorBtn');
        if (openBtn) openBtn.classList.add('active');
        if (game && typeof game.clearTowerSelection === 'function') {
            game.clearTowerSelection();
        }
        const hint = document.getElementById('mapEditorHint');
        if (hint) hint.classList.remove('hidden');
        // 打开面板时把「每命 HP」同步到全图矿石（修正旧蓝图缺字段导致的 1/1）
        const hpInput = document.getElementById('mapEditorOreHpPerLife');
        if (hpInput && game && game.map && typeof game.map.applyHpPerLifeToAllOres === 'function') {
            const v = Math.max(1, parseInt(hpInput.value, 10) || 100);
            game.map.applyHpPerLifeToAllOres(v);
        }
    }

    function close() {
        openState = false;
        currentTool = null;
        if (panelEl) panelEl.classList.add('hidden');
        const openBtn = document.getElementById('openMapEditorBtn');
        if (openBtn) openBtn.classList.remove('active');
        updateToolButtons();
        const hint = document.getElementById('mapEditorHint');
        if (hint) hint.classList.add('hidden');
        if (game) {
            game.previewBaseAnchor = null;
            game.previewMapEditCell = null;
        }
    }

    function isOpen() {
        return openState;
    }

    function getTool() {
        return currentTool;
    }

    /**
     * @param {{ col: number, row: number }} gridPos
     * @returns {boolean} 是否已消费本次点击（阻止塔防其它逻辑）
     */
    function handleGridClick(gridPos) {
        if (!openState || !currentTool || !game || !game.map) return false;
        const map = game.map;
        if (currentTool === 'stone') {
            const ok = map.setStoneAt(gridPos.col, gridPos.row);
            if (ok) map.saveStonesToStorage();
            else console.warn('[地图编辑] 无法在此放置石块（基地或已有塔）');
            return true;
        }
        if (currentTool === 'erase') {
            if (map.removeStoneAt(gridPos.col, gridPos.row)) {
                map.saveStonesToStorage();
            } else if (map.removeSpawnAt(gridPos.col, gridPos.row)) {
                map.saveSpawnsToStorage();
            } else if (map.removeOreOrMinerAt(gridPos.col, gridPos.row)) {
                if (map.removeOreMinerBlueprintEntry) {
                    map.removeOreMinerBlueprintEntry(gridPos.col, gridPos.row);
                }
            }
            return true;
        }
        if (currentTool === 'spawn') {
            if (map.setSpawnAt(gridPos.col, gridPos.row)) {
                map.saveSpawnsToStorage();
                console.log('[地图编辑] 出怪口已保存，当前共', map.getSpawnPointsOrdered().length, '个');
            } else {
                console.warn('[地图编辑] 无法在此放置出怪口（基地/石块/已有塔）');
            }
            return true;
        }
        if (currentTool === 'ore') {
            const o = getOreMinerOptionsFromInputs();
            if (map.setOreAt(gridPos.col, gridPos.row, o)) {
                if (map.saveOreMinerBlueprintOre) {
                    map.saveOreMinerBlueprintOre(gridPos.col, gridPos.row, o);
                }
                console.log('[地图编辑] 矿石蓝图已保存', o);
            } else {
                console.warn('[地图编辑] 无法在此放置矿石');
            }
            return true;
        }
        if (currentTool === 'miner') {
            const o = getOreMinerOptionsFromInputs();
            if (map.setMinerAt(gridPos.col, gridPos.row, {
                minerIntervalSec: o.minerIntervalSec,
                minerSpiritPerTick: o.minerSpiritPerTick
            })) {
                if (map.saveOreMinerBlueprintMiner) {
                    map.saveOreMinerBlueprintMiner(gridPos.col, gridPos.row, {
                        minerIntervalSec: o.minerIntervalSec,
                        minerSpiritPerTick: o.minerSpiritPerTick
                    });
                }
                console.log('[地图编辑] 矿机蓝图已保存', o.minerIntervalSec, o.minerSpiritPerTick);
            } else {
                console.warn('[地图编辑] 无法在此放置矿机');
            }
            return true;
        }
        if (currentTool === 'base') {
            if (map.setBaseAnchor(gridPos.col, gridPos.row, true)) {
                console.log('[地图编辑] 基地已保存');
            } else {
                console.warn('[地图编辑] 无法在此放置基地');
            }
            return true;
        }
        return false;
    }

    window.MapEditorPanel = {
        init,
        open,
        close,
        isOpen,
        getTool,
        handleGridClick
    };
})();

/**
 * BOSS 编辑器：血量 + 按顺序执行的模块栈（待机 / 移动 / 攻击可重复、每项独立配置）。
 * 存档键 stg_boss_configs；schemaVersion 2 使用 modules[]，旧版三态 states 读档时自动迁移。
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'stg_boss_configs';
    /** 与 stgTextureEditorPanel 一致：BOSS 弹幕可选位图文件名列表 */
    const STG_BOSS_BULLET_TEXTURE_POOL_KEY = 'stg_boss_bullet_texture_pool';
    const MODULE_LABEL = { idle: '待机', move: '移动', attack: '攻击' };

    function loadBossBulletTexturePool() {
        try {
            const raw = localStorage.getItem(STG_BOSS_BULLET_TEXTURE_POOL_KEY);
            if (!raw) return [];
            const o = JSON.parse(raw);
            if (Array.isArray(o)) {
                return o.map((s) => String(s).trim()).filter((s) => /^[\w.-]+$/i.test(s));
            }
        } catch (e) {
            /* ignore */
        }
        return [];
    }

    function bossBulletSpriteOptionsHtml(selected) {
        const pool = loadBossBulletTexturePool();
        const cur = selected != null ? String(selected).trim() : '';
        let html = '<option value="">矢量绘制（无位图）</option>';
        const seen = new Set();
        pool.forEach((fn) => {
            if (seen.has(fn)) return;
            seen.add(fn);
            const esc = fn.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
            const sel = cur === fn ? ' selected' : '';
            html += `<option value="${esc}"${sel}>${esc}</option>`;
        });
        if (cur && !seen.has(cur) && /^[\w.-]+$/i.test(cur)) {
            const esc = cur.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
            html += `<option value="${esc}" selected>（未在贴图列表）${esc}</option>`;
        }
        return html;
    }

    function escapeBossHtmlText(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** 模块 DOM：summary 内按钮用；展开区为 .boss-module-card */
    function getBossModuleCardEl(el) {
        if (!el) return null;
        const d = el.closest('.boss-module-details');
        if (d) return d.querySelector('.boss-module-card');
        return el.closest('.boss-module-card');
    }

    function syncBossModuleSummary(detailsEl) {
        if (!detailsEl || !detailsEl.classList || !detailsEl.classList.contains('boss-module-details')) return;
        const card = detailsEl.querySelector('.boss-module-card');
        const line = detailsEl.querySelector('.boss-mod-summary-line');
        if (!card || !line) return;
        const t = card.dataset.moduleType === 'move' ? 'move' : card.dataset.moduleType === 'attack' ? 'attack' : 'idle';
        const defLab = MODULE_LABEL[t];
        const labInp = card.querySelector('.boss-mod-label');
        const durInp = card.querySelector('.boss-mod-dur');
        const txt = labInp && labInp.value.trim() ? labInp.value.trim() : defLab;
        const dur = Math.max(0, parseInt(durInp && durInp.value, 10) || 0);
        line.textContent = txt + ' · ' + dur + 'ms';
    }

    function genModuleId() {
        return 'mod_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function danmakuStyleFromData(d) {
        const pat =
            d.stgBulletPattern === 'aim' ||
            d.stgBulletPattern === 'straight' ||
            d.stgBulletPattern === 'random' ||
            d.stgBulletPattern === 'none'
                ? d.stgBulletPattern
                : 'random';
        const emit =
            d.stgEmitStyle === 'fan' || d.stgEmitStyle === 'ring' || d.stgEmitStyle === 'laser' || d.stgEmitStyle === 'single'
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

    function mainDirFromData(d) {
        return d.stgBulletPattern === 'aim' ? 'aim' : 'straight';
    }

    function bulletKindFromData(d) {
        if (d.stgBulletKind === 'split') return 'split';
        if (d.stgBulletKind === 'normal') return 'normal';
        if (d.stgSplitDelaySec > 0) return 'split';
        return 'normal';
    }

    function defaultShootingPreset() {
        return {
            patternId: 'pattern_' + Date.now().toString(36),
            label: '弹幕方案',
            stgBulletPattern: 'random',
            stgShootCooldownMs: 2200,
            stgEnemyBulletSpeed: 260,
            stgEmitStyle: 'single',
            stgFanCount: 5,
            stgFanSpreadDeg: 60,
            stgRingCount: 12,
            stgLaserLength: 300,
            stgLaserWidth: 14,
            stgLaserDurationMs: 450,
            stgBulletKind: 'normal',
            stgSplitDelaySec: 0,
            stgSplitCount: 4,
            stgSplitStyle: 'cross',
            stgSplitChildSpeed: 220,
            stgHomingStrength: 0,
            stgEmitWhen: 'cooldown',
            stgEnemyBulletRadius: 5,
            stgEnemyBulletShape: 'circle',
            stgEnemyBulletSprite: '',
            stgBurstCount: 1,
            stgBurstIntervalMs: 100,
            stgBurstSpeedMode: 'average'
        };
    }

    function defaultModule(type) {
        const id = genModuleId();
        if (type === 'idle') {
            return { type: 'idle', moduleId: id, label: '待机', durationMs: 2000 };
        }
        if (type === 'move') {
            return {
                type: 'move',
                moduleId: id,
                label: '移动',
                durationMs: 3000,
                speedPx: 90,
                moveTargetKind: 'norm',
                moveBeaconId: 'a1',
                targetXNorm: 0.5,
                targetYNorm: 0.38
            };
        }
        return {
            type: 'attack',
            moduleId: id,
            label: '攻击',
            durationMs: 6000,
            patternPick: 'sequence',
            patterns: [defaultShootingPreset()]
        };
    }

    function defaultBoss(bossId) {
        return {
            id: bossId,
            name: '未命名 BOSS',
            hp: 8000,
            schemaVersion: 2,
            modules: [defaultModule('idle'), defaultModule('move'), defaultModule('attack')]
        };
    }

    /**
     * 旧版三态 → modules[]
     */
    function migrateBossV1ToV2(boss) {
        if (!boss || typeof boss !== 'object') return defaultBoss('boss');
        if (Array.isArray(boss.modules) && boss.modules.length > 0) return boss;
        const st = boss.states;
        if (!st || typeof st !== 'object') {
            return { ...boss, schemaVersion: 2, modules: [defaultModule('idle'), defaultModule('move'), defaultModule('attack')] };
        }
        const modules = [];
        if (st.idle && typeof st.idle === 'object') {
            modules.push({
                type: 'idle',
                moduleId: genModuleId(),
                label: '待机（迁移）',
                durationMs: Math.max(0, parseInt(st.idle.durationMs, 10) || 0)
            });
        }
        if (st.move && typeof st.move === 'object') {
            const m = st.move;
            modules.push({
                type: 'move',
                moduleId: genModuleId(),
                label: '移动（迁移）',
                durationMs: Math.max(0, parseInt(m.durationMs, 10) || 0),
                speedPx: m.speedPx != null ? Number(m.speedPx) : 90,
                moveTargetKind: 'norm',
                moveBeaconId: 'a1',
                targetXNorm: m.targetXNorm != null ? Number(m.targetXNorm) : 0.5,
                targetYNorm: m.targetYNorm != null ? Number(m.targetYNorm) : 0.38
            });
        }
        if (st.fire && typeof st.fire === 'object') {
            const f = st.fire;
            const patterns = Array.isArray(f.patterns) && f.patterns.length > 0 ? f.patterns : [defaultShootingPreset()];
            modules.push({
                type: 'attack',
                moduleId: genModuleId(),
                label: '攻击（迁移）',
                durationMs: Math.max(0, parseInt(f.durationMs, 10) || 0),
                patternPick: f.patternPick === 'random' ? 'random' : 'sequence',
                patterns
            });
        }
        if (modules.length === 0) {
            return { ...boss, schemaVersion: 2, modules: [defaultModule('idle'), defaultModule('move'), defaultModule('attack')] };
        }
        return { ...boss, schemaVersion: 2, modules };
    }

    function normalizeBossForEditor(boss) {
        return migrateBossV1ToV2(boss);
    }

    function shootingDataFromPatternCard(card) {
        if (!card) return null;
        const stgStyleSel = card.querySelector('.boss-stg-danmaku-style');
        const stgMainDirSel = card.querySelector('.boss-stg-main-dir');
        const stgCdInp = card.querySelector('.boss-stg-shoot-cd');
        const stgBspInp = card.querySelector('.boss-stg-bullet-speed');
        const stgFanCnt = card.querySelector('.boss-stg-fan-count');
        const stgFanSpr = card.querySelector('.boss-stg-fan-spread');
        const stgRingCnt = card.querySelector('.boss-stg-ring-count');
        const stgLaserLen = card.querySelector('.boss-stg-laser-len');
        const stgLaserW = card.querySelector('.boss-stg-laser-width');
        const stgLaserDur = card.querySelector('.boss-stg-laser-dur');
        const stgBulletKindSel = card.querySelector('.boss-stg-bullet-kind');
        const stgSplitSec = card.querySelector('.boss-stg-split-sec');
        const stgSplitCnt = card.querySelector('.boss-stg-split-count');
        const stgSplitStyleSel = card.querySelector('.boss-stg-split-style');
        const stgSplitSpd = card.querySelector('.boss-stg-split-spd');
        const stgHomingInp = card.querySelector('.boss-stg-homing');
        const stgBulletRInp = card.querySelector('.boss-stg-bullet-r');
        const stgBulletShapeSel = card.querySelector('.boss-stg-bullet-shape');
        const stgBulletSpriteInp = card.querySelector('.boss-stg-bullet-sprite');
        const stgEmitWhenSel = card.querySelector('.boss-stg-emit-when');
        const stgBurstCnt = card.querySelector('.boss-stg-burst-count');
        const stgBurstIv = card.querySelector('.boss-stg-burst-interval');
        const stgBurstSpd = card.querySelector('.boss-stg-burst-speed-mode');

        const style = stgStyleSel ? stgStyleSel.value : 'single_random';
        const md =
            stgMainDirSel && (stgMainDirSel.value === 'aim' || stgMainDirSel.value === 'straight') ? stgMainDirSel.value : 'straight';

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

        const pid = card.dataset.patternId || 'pattern_' + Date.now().toString(36);
        const labInp = card.querySelector('.boss-pattern-label');
        const label = labInp && labInp.value.trim() ? labInp.value.trim() : '弹幕方案';

        return {
            patternId: pid,
            label,
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
            stgSplitStyle: stgSplitStyleSel && stgSplitStyleSel.value === 'cross' ? 'cross' : 'cross',
            stgSplitChildSpeed: Math.max(40, Math.min(520, parseInt(stgSplitSpd && stgSplitSpd.value, 10) || 220)),
            stgHomingStrength: Math.max(0, Math.min(100, parseInt(stgHomingInp && stgHomingInp.value, 10) || 0)),
            stgEnemyBulletRadius: Math.max(2, Math.min(28, parseInt(stgBulletRInp && stgBulletRInp.value, 10) || 5)),
            stgEnemyBulletShape: stgBulletShapeSel && stgBulletShapeSel.value === 'triangle' ? 'triangle' : 'circle',
            stgEnemyBulletSprite: (() => {
                if (!stgBulletSpriteInp) return '';
                const raw = stgBulletSpriteInp.value != null ? String(stgBulletSpriteInp.value).trim() : '';
                if (!raw) return '';
                const base = raw.replace(/^.*[/\\]/, '');
                return /^[\w.-]+$/i.test(base) ? base : '';
            })(),
            stgEmitWhen: stgEmitWhenSel && stgEmitWhenSel.value === 'on_death' ? 'on_death' : 'cooldown',
            stgBurstCount: Math.max(1, Math.min(16, parseInt(stgBurstCnt && stgBurstCnt.value, 10) || 1)),
            stgBurstIntervalMs: Math.max(40, Math.min(500, parseInt(stgBurstIv && stgBurstIv.value, 10) || 100)),
            stgBurstSpeedMode: stgBurstSpd && stgBurstSpd.value === 'spread_wave' ? 'spread_wave' : 'average'
        };
    }

    function syncBossPatternPanels(card) {
        if (!card) return;
        const sel = card.querySelector('.boss-stg-danmaku-style');
        const v = sel ? sel.value : '';
        const none = v === 'none';
        const isLaser = v === 'laser';
        const fan = card.querySelector('.boss-stg-fan-params');
        const ring = card.querySelector('.boss-stg-ring-params');
        const laser = card.querySelector('.boss-stg-laser-params');
        const mainWrap = card.querySelector('.boss-stg-main-dir-wrap');
        if (fan) fan.classList.toggle('hidden', none || v !== 'fan');
        if (ring) ring.classList.toggle('hidden', none || v !== 'ring');
        if (laser) laser.classList.toggle('hidden', none || v !== 'laser');
        if (mainWrap) mainWrap.classList.toggle('hidden', none || (v !== 'fan' && v !== 'laser'));
        const emitRow = card.querySelector('.boss-stg-emit-when-row');
        const bulletSpeedRow = card.querySelector('.boss-stg-bullet-speed-row');
        const bulletProps = card.querySelector('.boss-stg-bullet-props-wrap');
        const homingWrap = card.querySelector('.boss-stg-homing-details');
        const burstSec = card.querySelector('.boss-stg-burst-section');
        if (emitRow) emitRow.classList.toggle('hidden', none);
        if (bulletSpeedRow) bulletSpeedRow.classList.toggle('hidden', none);
        if (bulletProps) bulletProps.classList.toggle('hidden', none);
        if (burstSec) burstSec.classList.toggle('hidden', none);
        if (homingWrap) homingWrap.classList.toggle('hidden', none || isLaser);
        const cdWrap = card.querySelector('.boss-stg-cooldown-details');
        const emitWhen = card.querySelector('.boss-stg-emit-when');
        if (cdWrap && emitWhen) {
            cdWrap.classList.toggle('hidden', none || emitWhen.value === 'on_death');
        }
        const kind = card.querySelector('.boss-stg-bullet-kind');
        const wrap = card.querySelector('.boss-stg-split-params');
        const show = kind && kind.value === 'split';
        if (wrap) wrap.classList.toggle('hidden', !show);
    }

    function patternCardHtml(d) {
        const dmStyle = danmakuStyleFromData(d);
        const mainDir = mainDirFromData(d);
        const homing = d.stgHomingStrength != null ? d.stgHomingStrength : 0;
        const emitWhen = d.stgEmitWhen === 'on_death' ? 'on_death' : 'cooldown';
        const bulletKind = bulletKindFromData(d);
        const splitCnt = d.stgSplitCount != null ? d.stgSplitCount : 4;
        const bulletShape = d.stgEnemyBulletShape === 'triangle' ? 'triangle' : 'circle';
        const spriteOpts = bossBulletSpriteOptionsHtml(d.stgEnemyBulletSprite);
        const burstCnt = d.stgBurstCount != null ? d.stgBurstCount : 1;
        const burstIv = d.stgBurstIntervalMs != null ? d.stgBurstIntervalMs : 100;
        const burstSpd = d.stgBurstSpeedMode === 'spread_wave' ? 'spread_wave' : 'average';
        const pid = d.patternId || 'pattern_' + Date.now().toString(36);
        const plab = (d.label || '弹幕方案').replace(/"/g, '&quot;');

        return `
            <div class="boss-fire-pattern-card" data-pattern-id="${String(pid).replace(/"/g, '')}">
                <div class="boss-pattern-card-head">
                    <label>方案名称 <input type="text" class="boss-pattern-label" value="${plab}" maxlength="40" /></label>
                    <button type="button" class="open-shop-btn boss-pattern-remove-btn" title="移除此方案">删除方案</button>
                </div>
                <div class="monster-editor-stg-section">
                    <div class="monster-editor-stg-section-title">弹幕发射样式（与怪物编辑器字段一致）</div>
                    <div class="monster-stg-row">
                        <label>样式</label>
                        <select class="boss-stg-danmaku-style" title="单发/扇形/环形/激光">
                            <option value="none" ${dmStyle === 'none' ? 'selected' : ''}>无弹幕</option>
                            <option value="single_random" ${dmStyle === 'single_random' ? 'selected' : ''}>单发 · 随机</option>
                            <option value="single_aim" ${dmStyle === 'single_aim' ? 'selected' : ''}>单发 · 瞄准玩家</option>
                            <option value="single_straight" ${dmStyle === 'single_straight' ? 'selected' : ''}>单发 · 直线向下</option>
                            <option value="fan" ${dmStyle === 'fan' ? 'selected' : ''}>扇形弹幕</option>
                            <option value="ring" ${dmStyle === 'ring' ? 'selected' : ''}>环形弹幕</option>
                            <option value="laser" ${dmStyle === 'laser' ? 'selected' : ''}>直线激光</option>
                        </select>
                    </div>
                    <details class="boss-stg-cond-details boss-stg-main-dir-wrap hidden" open>
                        <summary class="boss-stg-cond-summary">主方向 <span class="boss-stg-cond-hint">（扇形 / 直线激光）</span></summary>
                        <div class="boss-stg-cond-body">
                            <div class="monster-stg-row boss-stg-main-dir-row">
                                <label>主方向</label>
                                <select class="boss-stg-main-dir">
                                    <option value="aim" ${mainDir === 'aim' ? 'selected' : ''}>瞄准玩家</option>
                                    <option value="straight" ${mainDir === 'straight' ? 'selected' : ''}>直线向下</option>
                                </select>
                            </div>
                        </div>
                    </details>
                    <div class="monster-stg-row boss-stg-emit-when-row">
                        <label>发射时机</label>
                        <select class="boss-stg-emit-when">
                            <option value="cooldown" ${emitWhen === 'cooldown' ? 'selected' : ''}>战斗中（按冷却）</option>
                            <option value="on_death" ${emitWhen === 'on_death' ? 'selected' : ''}>死后弹幕</option>
                        </select>
                    </div>
                    <details class="boss-stg-cond-details boss-stg-cooldown-details" open>
                        <summary class="boss-stg-cond-summary">战斗中冷却 <span class="boss-stg-cond-hint">（仅「按冷却」时生效）</span></summary>
                        <div class="boss-stg-cond-body">
                            <div class="monster-stg-row boss-stg-cooldown-row">
                                <label>弹幕冷却(ms)</label>
                                <input type="number" class="boss-stg-shoot-cd" min="200" step="100" value="${d.stgShootCooldownMs != null ? d.stgShootCooldownMs : 2200}">
                            </div>
                        </div>
                    </details>
                    <div class="monster-stg-row boss-stg-bullet-speed-row">
                        <label>敌弹速度(px/s)</label>
                        <input type="number" class="boss-stg-bullet-speed" min="40" step="10" value="${d.stgEnemyBulletSpeed != null ? d.stgEnemyBulletSpeed : 260}">
                    </div>
                </div>
                <details class="boss-stg-cond-details boss-stg-fan-params monster-editor-stg-section hidden">
                    <summary class="monster-editor-stg-section-title boss-stg-cond-summary">扇形参数 <span class="boss-stg-cond-hint">（仅扇形样式）</span></summary>
                    <div class="boss-stg-cond-body">
                        <div class="monster-stg-row">
                            <label>扇形发数</label>
                            <input type="number" class="boss-stg-fan-count" min="2" max="24" value="${d.stgFanCount != null ? d.stgFanCount : 5}">
                        </div>
                        <div class="monster-stg-row">
                            <label>扇形总张角(°)</label>
                            <input type="number" class="boss-stg-fan-spread" min="10" max="180" value="${d.stgFanSpreadDeg != null ? d.stgFanSpreadDeg : 60}">
                        </div>
                    </div>
                </details>
                <details class="boss-stg-cond-details boss-stg-ring-params monster-editor-stg-section hidden">
                    <summary class="monster-editor-stg-section-title boss-stg-cond-summary">环形参数 <span class="boss-stg-cond-hint">（仅环形样式）</span></summary>
                    <div class="boss-stg-cond-body">
                        <div class="monster-stg-row">
                            <label>环形发数</label>
                            <input type="number" class="boss-stg-ring-count" min="3" max="36" value="${d.stgRingCount != null ? d.stgRingCount : 12}">
                        </div>
                    </div>
                </details>
                <details class="boss-stg-cond-details boss-stg-laser-params monster-editor-stg-section hidden">
                    <summary class="monster-editor-stg-section-title boss-stg-cond-summary">激光参数 <span class="boss-stg-cond-hint">（仅直线激光）</span></summary>
                    <div class="boss-stg-cond-body">
                        <div class="monster-stg-row">
                            <label>激光长度(px)</label>
                            <input type="number" class="boss-stg-laser-len" min="80" max="600" value="${d.stgLaserLength != null ? d.stgLaserLength : 300}">
                        </div>
                        <div class="monster-stg-row">
                            <label>激光线宽(px)</label>
                            <input type="number" class="boss-stg-laser-width" min="4" max="48" value="${d.stgLaserWidth != null ? d.stgLaserWidth : 14}">
                        </div>
                        <div class="monster-stg-row">
                            <label>激光持续(ms)</label>
                            <input type="number" class="boss-stg-laser-dur" min="100" max="3000" step="50" value="${d.stgLaserDurationMs != null ? d.stgLaserDurationMs : 450}">
                        </div>
                    </div>
                </details>
                <details class="boss-stg-cond-details boss-stg-burst-section monster-editor-stg-section hidden">
                    <summary class="monster-editor-stg-section-title boss-stg-cond-summary">连射 <span class="boss-stg-cond-hint">（次数&gt;1 时才有连射效果）</span></summary>
                    <div class="boss-stg-cond-body">
                        <div class="monster-stg-row">
                            <label>连射次数（1=不连射）</label>
                            <input type="number" class="boss-stg-burst-count" min="1" max="16" step="1" value="${burstCnt}">
                        </div>
                        <div class="monster-stg-row">
                            <label>连射间隔(ms)</label>
                            <input type="number" class="boss-stg-burst-interval" min="40" max="500" step="10" value="${burstIv}">
                        </div>
                        <div class="monster-stg-row">
                            <label>连射速率</label>
                            <select class="boss-stg-burst-speed-mode">
                                <option value="average" ${burstSpd === 'spread_wave' ? '' : 'selected'}>平均</option>
                                <option value="spread_wave" ${burstSpd === 'spread_wave' ? 'selected' : ''}>扩散波</option>
                            </select>
                        </div>
                    </div>
                </details>
                <div class="monster-editor-stg-section boss-stg-bullet-props-wrap">
                    <div class="monster-editor-stg-section-title">子弹属性</div>
                    <div class="monster-stg-row">
                        <label>子弹类型</label>
                        <select class="boss-stg-bullet-kind">
                            <option value="normal" ${bulletKind === 'normal' ? 'selected' : ''}>普通（不分裂）</option>
                            <option value="split" ${bulletKind === 'split' ? 'selected' : ''}>分裂弹</option>
                        </select>
                    </div>
                    <details class="boss-stg-cond-details boss-stg-split-params ${bulletKind === 'split' ? '' : 'hidden'}">
                        <summary class="boss-stg-cond-summary">分裂参数 <span class="boss-stg-cond-hint">（仅「分裂弹」时生效）</span></summary>
                        <div class="boss-stg-cond-body">
                            <div class="monster-stg-row">
                                <label>分裂延迟(秒)</label>
                                <input type="number" class="boss-stg-split-sec" min="0" max="10" step="0.1" value="${d.stgSplitDelaySec != null ? d.stgSplitDelaySec : 0}">
                            </div>
                            <div class="monster-stg-row">
                                <label>分裂个数</label>
                                <input type="number" class="boss-stg-split-count" min="2" max="16" step="1" value="${splitCnt}">
                            </div>
                            <div class="monster-stg-row">
                                <label>分裂样式</label>
                                <select class="boss-stg-split-style">
                                    <option value="cross" selected>十字（均匀放射）</option>
                                </select>
                            </div>
                            <div class="monster-stg-row">
                                <label>分裂后速度</label>
                                <input type="number" class="boss-stg-split-spd" min="40" max="520" value="${d.stgSplitChildSpeed != null ? d.stgSplitChildSpeed : 220}">
                            </div>
                        </div>
                    </details>
                    <details class="boss-stg-cond-details boss-stg-homing-details">
                        <summary class="boss-stg-cond-summary">跟踪强度 <span class="boss-stg-cond-hint">（直线激光下无效）</span></summary>
                        <div class="boss-stg-cond-body">
                            <div class="monster-stg-row boss-stg-homing-row">
                                <label>跟踪强度</label>
                                <input type="number" class="boss-stg-homing" min="0" max="100" value="${homing}">
                            </div>
                        </div>
                    </details>
                    <div class="monster-stg-row">
                        <label>敌弹半径(px)</label>
                        <input type="number" class="boss-stg-bullet-r" min="2" max="28" step="1" value="${d.stgEnemyBulletRadius != null ? d.stgEnemyBulletRadius : 5}">
                    </div>
                    <div class="monster-stg-row">
                        <label>敌弹形状</label>
                        <select class="boss-stg-bullet-shape">
                            <option value="circle" ${bulletShape === 'triangle' ? '' : 'selected'}>圆形</option>
                            <option value="triangle" ${bulletShape === 'triangle' ? 'selected' : ''}>三角形</option>
                        </select>
                    </div>
                    <div class="monster-stg-row">
                        <label>敌弹贴图</label>
                        <select class="boss-stg-bullet-sprite" title="在敌弹贴图编辑器中维护 BOSS 可用列表；不选则矢量绘制">
                            ${spriteOpts}
                        </select>
                    </div>
                    <p class="boss-module-hint boss-stg-sprite-pool-hint">在 <strong>敌弹贴图</strong> 面板下方维护「BOSS 弹幕可用贴图」后，此处下拉会出现对应文件名；不选则 BOSS 敌弹为<strong>矢量</strong>，不会套小怪默认图。</p>
                </div>
            </div>
        `;
    }

    function renderModuleCard(mod) {
        const t = mod.type === 'move' ? 'move' : mod.type === 'attack' ? 'attack' : 'idle';
        const label = String(mod.label || MODULE_LABEL[t]).replace(/"/g, '&quot;');
        const mid = String(mod.moduleId || genModuleId()).replace(/"/g, '');
        const dur = Math.max(0, parseInt(mod.durationMs, 10) || 0);
        const labelPlain = mod.label != null && String(mod.label).trim() !== '' ? String(mod.label).trim() : MODULE_LABEL[t];
        const sumLineHtml = escapeBossHtmlText(labelPlain) + ' · ' + dur + 'ms';
        let body = '';
        if (t === 'idle') {
            body = `
                <p class="boss-module-hint">本段内不移动、不发射战斗弹幕。</p>
            `;
        } else if (t === 'move') {
            const sp = mod.speedPx != null ? Number(mod.speedPx) : 90;
            const tx = mod.targetXNorm != null ? mod.targetXNorm : 0.5;
            const ty = mod.targetYNorm != null ? mod.targetYNorm : 0.38;
            const mtk = mod.moveTargetKind === 'beacon' ? 'beacon' : 'norm';
            const rawBid = mod.moveBeaconId != null ? String(mod.moveBeaconId).replace(/^__beacon_/, '') : 'a1';
            const beaconOpts = ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4']
                .map(
                    (id) =>
                        `<option value="${id}" ${rawBid === id ? 'selected' : ''}>信标 ${id}（与波次中摆放一致）</option>`
                )
                .join('');
            body = `
                <label>移动速度 (px/s) <input type="number" class="boss-mod-move-speed" min="0" max="2000" step="5" value="${Math.max(0, sp)}" /></label>
                <label>移动目标
                    <select class="boss-mod-move-target-kind">
                        <option value="norm" ${mtk === 'norm' ? 'selected' : ''}>自定义坐标（0～1）</option>
                        <option value="beacon" ${mtk === 'beacon' ? 'selected' : ''}>本波阵型信标格心</option>
                    </select>
                </label>
                <div class="boss-mod-move-beacon-wrap ${mtk === 'beacon' ? '' : 'hidden'}">
                    <label>信标
                        <select class="boss-mod-move-beacon-id">${beaconOpts}</select>
                    </label>
                    <p class="boss-module-hint">在波次编辑器中切换「摆放：信标」并放置 a1～a4 / b1～b4；与多段移动敌机共用同一套信标。若本波未放置所选信标，则回退为下方自定义坐标。</p>
                </div>
                <div class="boss-mod-move-norm-wrap ${mtk === 'beacon' ? 'hidden' : ''}">
                    <label>目标 X（0 左 — 1 右）<input type="number" class="boss-mod-move-tx" min="0.02" max="0.98" step="0.01" value="${tx}" /></label>
                    <label>目标 Y（0 上 — 1 下）<input type="number" class="boss-mod-move-ty" min="0.02" max="0.98" step="0.01" value="${ty}" /></label>
                </div>
            `;
        } else {
            const pick = mod.patternPick === 'random' ? 'random' : 'sequence';
            const plist = Array.isArray(mod.patterns) && mod.patterns.length > 0 ? mod.patterns : [defaultShootingPreset()];
            body = `
                <label>多方案切换
                    <select class="boss-mod-attack-pick">
                        <option value="sequence" ${pick === 'sequence' ? 'selected' : ''}>按顺序轮换</option>
                        <option value="random" ${pick === 'random' ? 'selected' : ''}>每次随机一条</option>
                    </select>
                </label>
                <div class="boss-fire-patterns-toolbar">
                    <button type="button" class="open-shop-btn boss-add-pattern-btn">＋ 添加弹幕方案</button>
                </div>
                <div class="boss-fire-patterns-list boss-mod-attack-patterns"></div>
            `;
        }
        return `
            <details class="boss-module-details">
                <summary class="boss-module-summary">
                    <span class="monster-editor-chevron boss-module-chevron" aria-hidden="true">▸</span>
                    <span class="boss-module-type-badge">${MODULE_LABEL[t]}</span>
                    <span class="boss-mod-summary-line">${sumLineHtml}</span>
                    <div class="boss-module-card-actions">
                        <button type="button" class="open-shop-btn boss-module-up" title="上移">↑</button>
                        <button type="button" class="open-shop-btn boss-module-down" title="下移">↓</button>
                        <button type="button" class="open-shop-btn boss-module-remove" title="删除此模块">删除</button>
                    </div>
                </summary>
                <div class="boss-module-card" data-module-type="${t}" data-module-id="${mid}">
                    <div class="boss-module-card-head">
                        <label class="boss-module-label-wrap">模块备注 <input type="text" class="boss-mod-label" value="${label}" maxlength="32" placeholder="${MODULE_LABEL[t]}" /></label>
                        <label class="boss-module-dur-wrap">持续 (ms) <input type="number" class="boss-mod-dur" min="0" max="600000" step="100" value="${dur}" title="结束后按顺序进入下一模块；末条结束后回到第一条" /></label>
                    </div>
                    <div class="boss-module-card-body">${body}</div>
                </div>
            </details>
        `;
    }

    function fillAttackPatternsInCard(cardEl, patterns) {
        const list = cardEl.querySelector('.boss-mod-attack-patterns');
        if (!list) return;
        list.innerHTML = '';
        (patterns || [defaultShootingPreset()]).forEach((p) => {
            list.insertAdjacentHTML('beforeend', patternCardHtml(p));
        });
        list.querySelectorAll('.boss-fire-pattern-card').forEach((c) => syncBossPatternPanels(c));
    }

    function renderBossRow(bossId, b) {
        const d = normalizeBossForEditor(b && typeof b === 'object' ? b : defaultBoss(bossId));
        const name = String(d.name || bossId).replace(/"/g, '&quot;');
        const hp = Math.max(1, parseInt(d.hp, 10) || 8000);
        const mods = Array.isArray(d.modules) ? d.modules : defaultBoss(bossId).modules;
        const nMod = mods.length;

        const wrap = document.createElement('div');
        wrap.className = 'boss-editor-row';
        wrap.dataset.bossId = bossId;
        wrap.innerHTML = `
            <details class="monster-editor-details" open>
                <summary class="monster-editor-summary">
                    <span class="monster-editor-chevron" aria-hidden="true">▸</span>
                    <code class="monster-editor-id">${bossId}</code>
                    <span class="monster-editor-preview">${name} · ${hp} HP · ${nMod} 个模块</span>
                    <button type="button" class="boss-remove-btn open-shop-btn" title="删除此 BOSS">删除</button>
                </summary>
                <div class="monster-editor-details-inner">
                    <div class="boss-editor-base">
                        <label>显示名称 <input type="text" class="boss-name" value="${name}" maxlength="48" /></label>
                        <label>血量 <input type="number" class="boss-hp" min="1" max="99999999" step="1" value="${hp}" /></label>
                    </div>
                    <p class="boss-fsm-hint">下方为<strong>按顺序执行的模块栈</strong>：从第一条开始执行，每条持续「持续(ms)」后进入下一条；执行完最后一条后<strong>回到第一条</strong>循环。可添加多个「移动」到不同坐标，或多个「攻击」配不同弹幕。</p>
                    <div class="boss-module-toolbar">
                        <span class="boss-module-toolbar-label">添加模块：</span>
                        <button type="button" class="open-shop-btn boss-add-mod" data-add-type="idle">＋ 待机</button>
                        <button type="button" class="open-shop-btn boss-add-mod" data-add-type="move">＋ 移动</button>
                        <button type="button" class="open-shop-btn boss-add-mod" data-add-type="attack">＋ 攻击</button>
                    </div>
                    <div class="boss-modules-stack"></div>
                </div>
            </details>
        `;
        const stack = wrap.querySelector('.boss-modules-stack');
        mods.forEach((m) => {
            stack.insertAdjacentHTML('beforeend', renderModuleCard(m));
            const details = stack.lastElementChild;
            const inner = details && details.querySelector && details.querySelector('.boss-module-card');
            if (m.type === 'attack' && inner) {
                const pats = Array.isArray(m.patterns) && m.patterns.length > 0 ? m.patterns : [defaultShootingPreset()];
                fillAttackPatternsInCard(inner, pats);
            }
            if (details && details.classList && details.classList.contains('boss-module-details')) {
                syncBossModuleSummary(details);
                if (m.type === 'move' && inner) syncBossMoveModuleUI(inner);
            }
        });
        return wrap;
    }

    function collectModuleFromCard(card) {
        if (!card) return null;
        const t = card.dataset.moduleType === 'move' ? 'move' : card.dataset.moduleType === 'attack' ? 'attack' : 'idle';
        const moduleId = card.dataset.moduleId || genModuleId();
        const labInp = card.querySelector('.boss-mod-label');
        const durInp = card.querySelector('.boss-mod-dur');
        const label = labInp && labInp.value.trim() ? labInp.value.trim() : MODULE_LABEL[t];
        const durationMs = Math.max(0, parseInt(durInp && durInp.value, 10) || 0);
        const base = { type: t, moduleId, label, durationMs };
        if (t === 'move') {
            const spdEl = card.querySelector('.boss-mod-move-speed');
            const kindEl = card.querySelector('.boss-mod-move-target-kind');
            const bidEl = card.querySelector('.boss-mod-move-beacon-id');
            const txEl = card.querySelector('.boss-mod-move-tx');
            const tyEl = card.querySelector('.boss-mod-move-ty');
            const mtk = kindEl && kindEl.value === 'beacon' ? 'beacon' : 'norm';
            let beaconId = 'a1';
            if (bidEl && bidEl.value && /^[ab][1-4]$/.test(bidEl.value)) beaconId = bidEl.value;
            return {
                ...base,
                speedPx: Math.max(0, parseFloat(spdEl && spdEl.value) || 0),
                moveTargetKind: mtk,
                moveBeaconId: mtk === 'beacon' ? beaconId : 'a1',
                targetXNorm: Math.max(0.02, Math.min(0.98, parseFloat(txEl && txEl.value) || 0.5)),
                targetYNorm: Math.max(0.02, Math.min(0.98, parseFloat(tyEl && tyEl.value) || 0.5))
            };
        }
        if (t === 'attack') {
            const pickEl = card.querySelector('.boss-mod-attack-pick');
            const patternCards = card.querySelectorAll('.boss-mod-attack-patterns .boss-fire-pattern-card');
            const patterns = [];
            patternCards.forEach((c) => patterns.push(shootingDataFromPatternCard(c)));
            return {
                ...base,
                patternPick: pickEl && pickEl.value === 'random' ? 'random' : 'sequence',
                patterns: patterns.length > 0 ? patterns : [defaultShootingPreset()]
            };
        }
        return base;
    }

    function collectBossFromRow(row) {
        if (!row) return null;
        const id = row.dataset.bossId;
        if (!id) return null;
        const nameInp = row.querySelector('.boss-name');
        const hpInp = row.querySelector('.boss-hp');
        const cards = row.querySelectorAll('.boss-modules-stack .boss-module-card');
        const modules = [];
        cards.forEach((c) => {
            const m = collectModuleFromCard(c);
            if (m) modules.push(m);
        });
        if (modules.length === 0) {
            modules.push(defaultModule('idle'));
        }
        return {
            id,
            name: nameInp ? nameInp.value.trim() || id : id,
            hp: Math.max(1, parseInt(hpInp && hpInp.value, 10) || 8000),
            schemaVersion: 2,
            modules
        };
    }

    let panelEl = null;
    let listEl = null;

    function syncBossMoveModuleUI(modCard) {
        if (!modCard || modCard.dataset.moduleType !== 'move') return;
        const kind = modCard.querySelector('.boss-mod-move-target-kind');
        const isBeacon = kind && kind.value === 'beacon';
        const bw = modCard.querySelector('.boss-mod-move-beacon-wrap');
        const nw = modCard.querySelector('.boss-mod-move-norm-wrap');
        if (bw) bw.classList.toggle('hidden', !isBeacon);
        if (nw) nw.classList.toggle('hidden', !!isBeacon);
    }

    function loadDoc() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return { version: 2, bosses: {} };
            const o = JSON.parse(raw);
            if (!o || typeof o !== 'object') return { version: 2, bosses: {} };
            if (!o.bosses || typeof o.bosses !== 'object') return { version: 2, bosses: {} };
            return { version: 2, bosses: o.bosses };
        } catch (e) {
            console.warn('[BOSS 编辑器] 读取失败', e);
            return { version: 2, bosses: {} };
        }
    }

    function saveDoc(doc) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
            console.log('[BOSS 编辑器] 已保存到本地', STORAGE_KEY);
        } catch (e) {
            console.warn('[BOSS 编辑器] 保存失败', e);
            alert('保存失败：' + (e && e.message ? e.message : String(e)));
        }
    }

    function buildDocFromDom() {
        const rows = listEl.querySelectorAll('.boss-editor-row');
        const bosses = {};
        rows.forEach((row) => {
            const b = collectBossFromRow(row);
            if (b && b.id) bosses[b.id] = b;
        });
        return { version: 2, bosses };
    }

    function render() {
        const doc = loadDoc();
        listEl.innerHTML = '';
        const ids = Object.keys(doc.bosses);
        if (ids.length === 0) {
            listEl.innerHTML =
                '<p class="monster-editor-empty">暂无 BOSS。输入英文 ID 并点击「添加 BOSS」；配置会写入 <code>stg_boss_configs</code>。</p>';
            return;
        }
        ids.sort();
        ids.forEach((id) => {
            listEl.appendChild(renderBossRow(id, doc.bosses[id]));
        });
    }

    function open() {
        if (!panelEl) return;
        panelEl.classList.remove('hidden');
        render();
    }

    function close() {
        if (panelEl) panelEl.classList.add('hidden');
    }

    function onApply() {
        const doc = buildDocFromDom();
        if (Object.keys(doc.bosses).length === 0) {
            alert('没有可保存的 BOSS（列表为空则不会写入）。');
            return;
        }
        saveDoc(doc);
        if (window.StgWaveFormationPanel && typeof window.StgWaveFormationPanel.refreshBrushSelect === 'function') {
            window.StgWaveFormationPanel.refreshBrushSelect();
        }
        close();
    }

    function onExportJson() {
        const doc = buildDocFromDom();
        if (Object.keys(doc.bosses).length === 0) {
            alert('暂无 BOSS 数据。请先添加并填写后点「应用并保存」。');
            return;
        }
        try {
            const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'stgBossConfigs.json';
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (e) {
            console.warn('[BOSS 编辑器] 导出失败', e);
        }
    }

    function tryAddBoss() {
        const inp = document.getElementById('bossEditorNewIdInput');
        if (!inp || !listEl) return;
        const raw = String(inp.value || '').trim();
        if (!/^([a-zA-Z_][a-zA-Z0-9_]*)$/.test(raw) || raw.length < 2) {
            alert('BOSS ID 需为英文、数字、下划线，且以字母或下划线开头，至少 2 个字符。');
            return;
        }
        const doc = loadDoc();
        if (doc.bosses[raw]) {
            alert('该 BOSS ID 已存在。');
            return;
        }
        doc.bosses[raw] = defaultBoss(raw);
        saveDoc(doc);
        if (window.StgWaveFormationPanel && typeof window.StgWaveFormationPanel.refreshBrushSelect === 'function') {
            window.StgWaveFormationPanel.refreshBrushSelect();
        }
        inp.value = '';
        render();
    }

    function init() {
        panelEl = document.getElementById('bossEditorPanel');
        listEl = document.getElementById('bossEditorList');
        if (!panelEl || !listEl) return;

        const openBtn = document.getElementById('stgOpenBossEditorBtn');
        const closeBtn = document.getElementById('bossEditorCloseBtn');
        const applyBtn = document.getElementById('bossEditorApplyBtn');
        const exportBtn = document.getElementById('bossEditorExportJsonBtn');
        const addBtn = document.getElementById('bossEditorAddBtn');
        const newIdInp = document.getElementById('bossEditorNewIdInput');

        if (openBtn) openBtn.addEventListener('click', open);
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (panelEl) panelEl.addEventListener('click', (e) => { if (e.target === panelEl) close(); });
        if (applyBtn) applyBtn.addEventListener('click', onApply);
        if (exportBtn) exportBtn.addEventListener('click', onExportJson);
        if (addBtn) addBtn.addEventListener('click', tryAddBoss);
        if (newIdInp) {
            newIdInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    tryAddBoss();
                }
            });
        }

        listEl.addEventListener('change', (e) => {
            const t = e.target;
            if (!t || !t.classList) return;
            const modMove = getBossModuleCardEl(t);
            if (modMove && modMove.dataset.moduleType === 'move' && t.classList.contains('boss-mod-move-target-kind')) {
                syncBossMoveModuleUI(modMove);
            }
            const card = t.closest('.boss-fire-pattern-card');
            if (card && (t.classList.contains('boss-stg-danmaku-style') || t.classList.contains('boss-stg-emit-when'))) {
                syncBossPatternPanels(card);
            }
            if (card && t.classList.contains('boss-stg-bullet-kind')) {
                const wrap = card.querySelector('.boss-stg-split-params');
                const show = t.value === 'split';
                if (wrap) wrap.classList.toggle('hidden', !show);
            }
        });

        listEl.addEventListener('input', (e) => {
            const t = e.target;
            if (!t || !t.classList) return;
            if (t.classList.contains('boss-mod-label') || t.classList.contains('boss-mod-dur')) {
                const det = t.closest('.boss-module-details');
                if (det) syncBossModuleSummary(det);
            }
        });

        listEl.addEventListener('click', (e) => {
            const rm = e.target.closest('.boss-remove-btn');
            if (rm) {
                e.preventDefault();
                e.stopPropagation();
                const row = rm.closest('.boss-editor-row');
                if (!row || !confirm('确定删除该 BOSS？（应用后写入存档）')) return;
                row.remove();
                return;
            }

            const addMod = e.target.closest('.boss-add-mod');
            if (addMod) {
                e.preventDefault();
                e.stopPropagation();
                const row = addMod.closest('.boss-editor-row');
                const stack = row && row.querySelector('.boss-modules-stack');
                const typ = addMod.getAttribute('data-add-type');
                if (!stack || !typ) return;
                const m = defaultModule(typ === 'move' ? 'move' : typ === 'attack' ? 'attack' : 'idle');
                stack.insertAdjacentHTML('beforeend', renderModuleCard(m));
                const last = stack.lastElementChild;
                const inner = last && last.querySelector && last.querySelector('.boss-module-card');
                if (last && last.classList.contains('boss-module-details')) {
                    syncBossModuleSummary(last);
                }
                if (typ === 'move' && inner) {
                    syncBossMoveModuleUI(inner);
                }
                if (typ === 'attack' && inner) {
                    fillAttackPatternsInCard(inner, [defaultShootingPreset()]);
                }
                return;
            }

            const up = e.target.closest('.boss-module-up');
            if (up) {
                e.preventDefault();
                e.stopPropagation();
                const wrap = up.closest('.boss-module-details');
                const stack = wrap && wrap.parentElement;
                if (!wrap || !stack || wrap.previousElementSibling == null) return;
                stack.insertBefore(wrap, wrap.previousElementSibling);
                return;
            }
            const down = e.target.closest('.boss-module-down');
            if (down) {
                e.preventDefault();
                e.stopPropagation();
                const wrap = down.closest('.boss-module-details');
                const stack = wrap && wrap.parentElement;
                if (!wrap || !stack || wrap.nextElementSibling == null) return;
                stack.insertBefore(wrap.nextElementSibling, wrap);
                return;
            }
            const rmm = e.target.closest('.boss-module-remove');
            if (rmm) {
                e.preventDefault();
                e.stopPropagation();
                const wrap = rmm.closest('.boss-module-details');
                const stack = wrap && wrap.parentElement;
                if (!wrap || !stack) return;
                const n = stack.querySelectorAll('.boss-module-details').length;
                if (n <= 1) {
                    alert('至少保留一个模块。');
                    return;
                }
                wrap.remove();
                return;
            }

            const prm = e.target.closest('.boss-pattern-remove-btn');
            if (prm) {
                e.preventDefault();
                e.stopPropagation();
                const card = prm.closest('.boss-fire-pattern-card');
                const list = prm.closest('.boss-fire-patterns-list');
                if (!card || !list) return;
                const n = list.querySelectorAll('.boss-fire-pattern-card').length;
                if (n <= 1) {
                    alert('至少保留一条弹幕方案。');
                    return;
                }
                card.remove();
                return;
            }
            const addP = e.target.closest('.boss-add-pattern-btn');
            if (addP) {
                e.preventDefault();
                e.stopPropagation();
                const modCard = addP.closest('.boss-module-card');
                const list = modCard && modCard.querySelector('.boss-mod-attack-patterns');
                if (!list) return;
                const div = document.createElement('div');
                div.innerHTML = patternCardHtml(defaultShootingPreset()).trim();
                const newCard = div.firstElementChild;
                list.appendChild(newCard);
                syncBossPatternPanels(newCard);
            }
        });
    }

    function loadBossConfigs() {
        return loadDoc();
    }

    window.BossEditorPanel = {
        init,
        open,
        close,
        loadBossConfigs,
        saveDoc,
        defaultBoss,
        normalizeBossForEditor
    };
})();

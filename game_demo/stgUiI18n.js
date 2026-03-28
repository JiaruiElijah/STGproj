/**
 * STG 界面语言（非编辑器）：中文默认，可切换英文；偏好存 localStorage。
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'stg_ui_lang';

    /** @type {Record<string, string>} */
    const ZH = {
        'toolbar.start': '▶ 开始游戏',
        'toolbar.restart': '🔄 重新开始',
        'toolbar.towerDefense': '🗼 塔防模式（旧玩法）',
        'toolbar.langToEn': 'English',
        'toolbar.langToZh': '中文',

        'hint.controls':
            '方向键移动 · <strong>Z</strong> 主武器连射 · <strong>X</strong> 技能弹幕 · <strong>Shift</strong> 慢速并显示判定点 · 击杀掉落 <strong>P</strong> 点 · 升级三选一',

        'aside.title': '博丽灵梦 · 新属性（加成）',

        'upgrade.title': '升级 — 三选一（博丽灵梦 · 构筑）',

        'result.titleWin': '🎉 通关！',
        'result.titleLose': '💀 本局结束',
        'result.msgWin': '你清空了全部波次。可重新开始挑战更高难度（调波次与怪物编辑器）。',
        'result.msgLose': '英雄被击坠。点击重新开始再试。',
        'result.restart': '🔄 重新开始',
        'result.hint': '也可点击顶栏「重新开始」',

        'hud.exp': 'Lv.{lv}  经验 {cur} / {next}',
        'hud.wave': '波次 {cur} / {w}  剩余敌 {en}  待出 {pending}',
        'hud.nextWaveNone': '下一波 —',
        'hud.nextWaveSoon': '下一波 即将',
        'hud.nextWaveSec': '下一波 {sec}s',
        'hud.time': '时间 {sec}s',

        'upgrade.pool_empty.name': '（无更多强化）',
        'upgrade.pool_empty.desc': '本局可抽取的构筑已全部获得。',

        'title.canvasMain': 'STG 纵版射击',
        'title.canvasSub': '点击「开始游戏」',

        'attackBuild.title': '攻击构筑',
        'attackBuild.spreadHeading': '扩散攻击（Z）',
        'attackBuild.focusHeading': '集中攻击（慢速）',
        'attackBuild.ultHeading': '大招（X）',
        'attackBuild.upgradesLabel': '已选构筑',
        'attackBuild.placeholder': '开始游戏后显示',
        'attackBuild.simple.atk': '攻击力：{v}',
        'attackBuild.simple.aps': '攻速：{v} 发/s',
        'attackBuild.simple.bulletSpd': '弹速：{v}',
        'attackBuild.simple.crit': '暴击率：{v}%',
        'attackBuild.emptyList': '（暂无）'
    };

    /** @type {Record<string, string>} */
    const EN = {
        'toolbar.start': '▶ Start',
        'toolbar.restart': '🔄 Restart',
        'toolbar.towerDefense': '🗼 Tower Defense',
        'toolbar.langToEn': 'English',
        'toolbar.langToZh': '中文',

        'hint.controls':
            'Move: Arrow keys · <strong>Z</strong> Main fire · <strong>X</strong> Skill volley · <strong>Shift</strong> Focus / hitbox · <strong>P</strong> pickups · Level-up pick 1 of 3',

        'aside.title': 'Reimu Hakurei · Bonus Stats',

        'upgrade.title': 'Level Up — Pick 1 of 3 (Reimu · Build)',

        'result.titleWin': '🎉 Cleared!',
        'result.titleLose': '💀 Run Over',
        'result.msgWin': 'All waves cleared. Adjust waves or enemies in editors and try again.',
        'result.msgLose': 'Shot down. Tap Restart to retry.',
        'result.restart': '🔄 Restart',
        'result.hint': 'You can also use Restart in the top bar.',

        'hud.exp': 'Lv.{lv}  EXP {cur} / {next}',
        'hud.wave': 'Wave {cur} / {w}  Enemies {en}  Pending {pending}',
        'hud.nextWaveNone': 'Next —',
        'hud.nextWaveSoon': 'Next wave soon',
        'hud.nextWaveSec': 'Next in {sec}s',
        'hud.time': 'Time {sec}s',

        'upgrade.pool_empty.name': '(No upgrades left)',
        'upgrade.pool_empty.desc': 'All available build picks for this run are taken.',

        'title.canvasMain': 'STG Vertical Shooter',
        'title.canvasSub': 'Click 「Start」',

        'attackBuild.title': 'Attack build',
        'attackBuild.spreadHeading': 'Spread (Z)',
        'attackBuild.focusHeading': 'Focus (slow)',
        'attackBuild.ultHeading': 'Skill (X)',
        'attackBuild.upgradesLabel': 'Picked',
        'attackBuild.placeholder': 'Shown after Start',
        'attackBuild.simple.atk': 'ATK: {v}',
        'attackBuild.simple.aps': 'Fire rate: {v} /s',
        'attackBuild.simple.bulletSpd': 'Bullet spd: {v}',
        'attackBuild.simple.crit': 'Crit: {v}%',
        'attackBuild.emptyList': '(none)'
    };

    /**
     * 构筑三选一：英文 name/desc（与 stgMode STG_UPGRADE_POOL id 一致）
     * @type {Record<string, { name: string, desc: string }>}
     */
    const UPGRADE_EN = {
        spread_fan: {
            name: 'Spread: Fan',
            desc: 'Main attack becomes a fan; +2 spread bullets.'
        },
        spread_extra: {
            name: 'Spread: Extra shots',
            desc: 'Chance to fire extra bullets per attack.'
        },
        spread_turret: {
            name: 'Spread: Turret',
            desc: 'Side turret for 150% player ATK damage; follows you.'
        },
        spread_homing: {
            name: 'Spread: Homing',
            desc: 'Bullets can home; damage −40%.'
        },
        spread_yinyang: {
            name: 'Spread: Yin-Yang orbs',
            desc: 'Chance to spawn an orb for AoE damage.'
        },
        spread_big_p: {
            name: 'Spread: Large P',
            desc: 'Kills with this mode may drop large P items.'
        },
        spread_crit: {
            name: 'Spread: Crit',
            desc: 'Higher crit chance for this attack mode.'
        },
        spread_big_energy: {
            name: 'Spread: Large energy',
            desc: 'Kills may drop large energy pickups.'
        },
        focus_crystal_base: {
            name: 'Crystal: Crystal Arrow',
            desc: 'Fire 6 crystals forward.'
        },
        focus_crystal_atk: {
            name: 'Crystal: ATK',
            desc: 'Crystal damage up.'
        },
        focus_crystal_count: {
            name: 'Crystal: Count',
            desc: 'More crystals.'
        },
        focus_crystal_pierce: {
            name: 'Crystal: Pierce',
            desc: 'Crystals pierce enemies.'
        },
        focus_rage_core: {
            name: 'Rage: Stacks',
            desc: 'In focus: every 5 kills adds Rage (ATK speed & bullet speed); 5s, max 3 stacks.'
        },
        focus_rage_cap: {
            name: 'Rage: Cap',
            desc: 'Rage max stacks +3.'
        },
        focus_rage_dur: {
            name: 'Rage: Duration',
            desc: 'Rage duration +5s.'
        },
        focus_rage_weak: {
            name: 'Rage: Weakness',
            desc: 'At 5 stacks, enemies become weak (+20% damage taken).'
        },
        ult_seal_base: {
            name: 'Seal: Barrier',
            desc: 'Circular barrier around you: erases bullets and damages enemies.'
        },
        ult_seal_size: {
            name: 'Seal: Size & duration',
            desc: 'Larger barrier, longer duration.'
        },
        ult_seal_heal: {
            name: 'Seal: Heal',
            desc: 'Barrier heals and briefly boosts attack.'
        },
        ult_dream_base: {
            name: 'Dream: Orbs',
            desc: 'Fire 3 dream orbs: erase bullets, AoE damage.'
        },
        ult_dream_count: {
            name: 'Dream: Count',
            desc: 'More orbs.'
        },
        ult_dream_stun: {
            name: 'Dream: Stun',
            desc: 'Orbs can briefly stun enemies.'
        },
        stat_hp: { name: 'Stat: HP', desc: 'Max HP up.' },
        stat_regen: { name: 'Stat: Regen', desc: 'HP regen up.' },
        stat_atk_all: { name: 'Stat: All ATK', desc: 'All attack damage up.' },
        stat_fire: { name: 'Stat: Fire rate', desc: 'Fire rate up.' },
        stat_bullet_spd: { name: 'Stat: Bullet speed', desc: 'Bullet speed up.' },
        stat_move_spread: { name: 'Stat: Move (spread)', desc: 'Move speed in spread mode up.' },
        stat_exp: { name: 'Stat: EXP', desc: 'EXP gain up.' },
        stat_ult_charge: { name: 'Stat: Ult charge', desc: 'Ultimate charge rate up.' }
    };

    function getLang() {
        try {
            return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'zh';
        } catch (e) {
            return 'zh';
        }
    }

    function setLang(lang) {
        try {
            localStorage.setItem(STORAGE_KEY, lang === 'en' ? 'en' : 'zh');
        } catch (e) {
            /* ignore */
        }
        applyAll();
    }

    function isEn() {
        return getLang() === 'en';
    }

    function t(key, vars) {
        const table = isEn() ? EN : ZH;
        let s = table[key] != null ? table[key] : ZH[key] != null ? ZH[key] : key;
        if (vars && typeof vars === 'object') {
            Object.keys(vars).forEach((k) => {
                s = s.split('{' + k + '}').join(String(vars[k]));
            });
        }
        return s;
    }

    /**
     * @param {{ id: string, name: string, desc: string }} u
     * @returns {{ name: string, desc: string }}
     */
    function getUpgradeDisplay(u) {
        if (!u) return { name: '', desc: '' };
        if (!isEn()) return { name: u.name, desc: u.desc };
        if (u.id === 'pool_empty') {
            return { name: t('upgrade.pool_empty.name'), desc: t('upgrade.pool_empty.desc') };
        }
        const en = UPGRADE_EN[u.id];
        if (en) return { name: en.name, desc: en.desc };
        return { name: u.name, desc: u.desc };
    }

    function applyToolbar() {
        const start = document.getElementById('stgStartBtn');
        const restart = document.getElementById('stgRestartBtn');
        const td = document.getElementById('enterTowerDefenseModeBtn');
        const langBtn = document.getElementById('stgLangToggleBtn');
        if (start) start.textContent = t('toolbar.start');
        if (restart) restart.textContent = t('toolbar.restart');
        if (td) td.textContent = t('toolbar.towerDefense');
        if (langBtn) langBtn.textContent = isEn() ? t('toolbar.langToZh') : t('toolbar.langToEn');
    }

    function applyStaticStgPanels() {
        const hint = document.getElementById('stgHintBar');
        if (hint) hint.innerHTML = t('hint.controls');
        const asideTitle = document.querySelector('.stg-aside-title');
        if (asideTitle) asideTitle.textContent = t('aside.title');
        const upTitle = document.querySelector('#stgUpgradeOverlay .stg-overlay-title');
        if (upTitle) upTitle.textContent = t('upgrade.title');
        const resBtn = document.getElementById('stgResultRestartBtn');
        if (resBtn) resBtn.textContent = t('result.restart');
        const resHint = document.querySelector('.stg-result-hint');
        if (resHint) resHint.textContent = t('result.hint');
    }

    function toggleLang() {
        setLang(isEn() ? 'zh' : 'en');
    }

    function applyAll() {
        applyToolbar();
        applyStaticStgPanels();
        if (typeof window.refreshStgPlayerStatsPanel === 'function') {
            window.refreshStgPlayerStatsPanel();
        }
        if (window.StgMode && typeof window.StgMode.refreshUiLanguage === 'function') {
            window.StgMode.refreshUiLanguage();
        }
    }

    function init() {
        applyToolbar();
        applyStaticStgPanels();
        const btn = document.getElementById('stgLangToggleBtn');
        if (btn) {
            btn.addEventListener('click', () => toggleLang());
        }
    }

    window.StgUiI18n = {
        STORAGE_KEY,
        getLang,
        setLang,
        isEn,
        t,
        getUpgradeDisplay,
        applyAll,
        applyToolbar,
        applyStaticStgPanels,
        init,
        toggleLang
    };
})();

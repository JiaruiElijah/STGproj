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
            '方向键移动 · <strong>Z</strong> 主武器连射 · <strong>X</strong> 大招（五格充能，<strong>充能点</strong>与<strong>擦弹</strong>小白球蓄能）默认「试做型封魔阵」；升级可抽 Q–V 分支强化（选 T 后改为梦想妙珠） · <strong>Shift</strong> 慢速并显示判定点 · 击杀掉落 <strong>P</strong> 点 · <strong>波次阵型</strong>可配置「升级时刻」：指定波次结束后四选一（<strong>1～4</strong>，暂停）',

        'aside.title': '博丽灵梦 · 属性加成',
        'aside.hideStats': '隐藏',
        'aside.hideStatsTitle': '隐藏右侧属性加成面板',
        'aside.showStats': '显示属性',
        'aside.showStatsTitle': '展开右侧属性加成面板',

        'upgrade.title': '升级时刻 — 四选一（博丽灵梦 · 构筑）',
        'upgrade.subhint': '游戏已暂停 · 按键盘 <strong>1</strong> / <strong>2</strong> / <strong>3</strong> / <strong>4</strong> 选择',
        'upgrade.subhintRound':
            '游戏已暂停 · 第 <strong>{cur}</strong> / <strong>{total}</strong> 轮 · 按 <strong>1</strong>～<strong>4</strong> 选择',

        'levelUp.badge': '升级',
        'levelUp.key': 'E',
        'levelUp.hintTitle': '（波次衔接时自动打开升级时刻）',
        'levelUp.ariaOpen': '升级时刻（通常自动打开）',

        'result.titleWin': '🎉 通关！',
        'result.titleLose': '💀 本局结束',
        'result.msgWin': '你清空了全部波次。可重新开始挑战更高难度（调波次与怪物编辑器）。',
        'result.msgLose': '英雄被击坠。点击重新开始再试。',
        'result.restart': '🔄 重新开始',
        'result.hint': '也可点击顶栏「重新开始」',

        'hud.hpLabel': '生命',
        /** 离散生命格：当前为半格精度（如 3.5），max 为整格上限 */
        'hud.hpDetail': '{cur} / {max} 格',
        'hud.hpAria': '生命值 {cur} / {max} 格',
        'hud.hpAriaIdle': '未开局',
        'hud.expLabel': '经验',
        'hud.exp': 'Lv.{lv}  经验 {cur} / {next}',
        'hud.wave': '波次 {cur} / {w}  剩余敌 {en}  待出 {pending}',
        'hud.waveChapter': '第 {ch}/{chTotal} 章 · 波次 {cur}/{w} · 剩余敌 {en} · 待出 {pending}',
        'chapter.passTitle': '通过章节 {passed}',
        'chapter.passMsg': '即将进入第 {next} 章',
        'hud.nextWaveNone': '下一波 —',
        'hud.nextWaveSoon': '下一波 即将',
        'hud.nextWaveSec': '下一波 {sec}s',
        'hud.time': '时间 {sec}s',
        'hud.ultLabel': '大招（X）',
        'hud.ultAria': '大招充能，共五格，按 X 消耗一格',

        'upgrade.pool_empty.name': '（无更多强化）',
        'upgrade.pool_empty.desc': '本局可抽取的构筑已全部获得。',

        'title.canvasMain': 'STG 纵版射击',
        'title.canvasSub': '点击「开始游戏」',

        'attackBuild.title': '攻击构筑',
        'attackBuild.spreadHeading': '博丽御符（Z）',
        'attackBuild.focusHeading': '伏魔针（慢速 · Shift）',
        /** 未选大招分支时侧栏仅显示试做型封魔阵（不显示梦想妙珠） */
        'attackBuild.ultHeadingNeutral': '试做型封魔阵（X）',
        'attackBuild.ultHeading': '大招 · 试做型封魔阵 / 梦想妙珠（X）',
        /** 侧栏：已选 Q 后显示（与 Q–S 分支强化名称一致） */
        'attackBuild.ultNameSealUpgraded': '强化封魔阵（X）',
        'attackBuild.ultNameDream': '梦想妙珠（X）',
        'attackBuild.upgradesLabel': '已选构筑',

        /** 三选一卡牌顶栏：所属武器/体系（与《新玩法--STG模式》命名一致） */
        'upgrade.weapon.spread': '博丽御符（Z）',
        'upgrade.weapon.focusCrystal': '伏魔针 · 水晶',
        'upgrade.weapon.focusRage': '伏魔针 · 狂怒',
        /** Q–S 卡顶栏：强化封魔阵线（非默认试做型） */
        'upgrade.weapon.ultSeal': '强化封魔阵',
        'upgrade.weapon.ultDream': '梦想妙珠',
        'upgrade.weapon.stat': '基础属性',
        'attackBuild.placeholder': '开始游戏后显示',
        /** 左侧构筑统计图标悬停 / 读屏（名词不占用横向版面） */
        'attackBuild.statGridAria': '武器数值',
        'attackBuild.statTip.atk': '攻击力',
        'attackBuild.statTip.aps': '攻速（发/秒）',
        'attackBuild.statTip.spd': '弹速',
        'attackBuild.statTip.crit': '暴击率',
        /** 左侧四格内可见短标签（与 emoji 同列，非仅悬停 title） */
        'attackBuild.statLabel.atk': '攻击',
        'attackBuild.statLabel.aps': '攻速',
        'attackBuild.statLabel.spd': '弹速',
        'attackBuild.statLabel.crit': '暴击',
        'attackBuild.simple.atk': '攻击力：{v}',
        'attackBuild.simple.aps': '攻速：{v} 发/s',
        'attackBuild.simple.bulletSpd': '弹速：{v}',
        'attackBuild.simple.crit': '暴击率：{v}%',
        'attackBuild.emptyList': '（暂无）',
        /** 发射模式简述（侧栏等，与 stgStyleLine 一致） */
        'attackBuild.stat.styleDoubleCol': '双列 ×{n}，列距 {sep}px'
    };

    /** @type {Record<string, string>} */
    const EN = {
        'toolbar.start': '▶ Start',
        'toolbar.restart': '🔄 Restart',
        'toolbar.towerDefense': '🗼 Tower Defense',
        'toolbar.langToEn': 'English',
        'toolbar.langToZh': '中文',

        'hint.controls':
            'Move: Arrow keys · <strong>Z</strong> Main fire · <strong>X</strong> Ultimate (5 slots; <strong>charge pickups</strong> / <strong>graze</strong> orbs fill ult meter); Seal Prototype by default; upgrades Q–V (pick T for Dream Orb) · <strong>Shift</strong> Focus / hitbox · <strong>P</strong> pickups · Wave editor: <strong>upgrade moments</strong> after listed waves — pick 1 of 4 (<strong>1–4</strong>, pauses)',

        'aside.title': 'Reimu · Stat bonuses',

        'upgrade.title': 'Upgrade Moment — Pick 1 of 4 (Reimu · Build)',
        'upgrade.subhint': 'Paused · Press <strong>1</strong> / <strong>2</strong> / <strong>3</strong> / <strong>4</strong> to choose',
        'upgrade.subhintRound':
            'Paused · Round <strong>{cur}</strong> / <strong>{total}</strong> · Press <strong>1</strong>–<strong>4</strong>',

        'levelUp.badge': 'Lv up',
        'levelUp.key': 'E',
        'levelUp.hintTitle': '(Upgrade moment opens at wave breaks)',
        'levelUp.ariaOpen': 'Upgrade moment (usually auto-opens)',

        'result.titleWin': '🎉 Cleared!',
        'result.titleLose': '💀 Run Over',
        'result.msgWin': 'All waves cleared. Adjust waves or enemies in editors and try again.',
        'result.msgLose': 'Shot down. Tap Restart to retry.',
        'result.restart': '🔄 Restart',
        'result.hint': 'You can also use Restart in the top bar.',

        'hud.hpLabel': 'HP',
        'hud.hpDetail': '{cur} / {max} cells',
        'hud.hpAria': 'Life {cur} of {max} cells',
        'hud.hpAriaIdle': 'Not started',
        'hud.expLabel': 'EXP',
        'hud.exp': 'Lv.{lv}  EXP {cur} / {next}',
        'hud.wave': 'Wave {cur} / {w}  Enemies {en}  Pending {pending}',
        'hud.waveChapter': 'Ch.{ch}/{chTotal} · Wave {cur}/{w} · Enemies {en} · Pending {pending}',
        'chapter.passTitle': 'Chapter {passed} cleared',
        'chapter.passMsg': 'Entering chapter {next}…',
        'hud.nextWaveNone': 'Next —',
        'hud.nextWaveSoon': 'Next wave soon',
        'hud.nextWaveSec': 'Next in {sec}s',
        'hud.time': 'Time {sec}s',
        'hud.ultLabel': 'Ult (X)',
        'hud.ultAria': 'Ultimate charges, five slots, press X to spend one',

        'upgrade.pool_empty.name': '(No upgrades left)',
        'upgrade.pool_empty.desc': 'All available build picks for this run are taken.',

        'title.canvasMain': 'STG Vertical Shooter',
        'title.canvasSub': 'Click 「Start」',

        'attackBuild.title': 'Attack build',
        'attackBuild.spreadHeading': 'Hakurei Ofuda (Z)',
        'attackBuild.focusHeading': 'Fumashin (Focus · Shift)',
        'attackBuild.ultHeadingNeutral': 'Seal Prototype (X)',
        'attackBuild.ultHeading': 'Ultimate: Seal Prototype / Dream Orb (X)',
        'attackBuild.ultNameSealUpgraded': 'Fortified Seal (X)',
        'attackBuild.ultNameDream': 'Dream Orb (X)',
        'attackBuild.upgradesLabel': 'Picked',

        'upgrade.weapon.spread': 'Hakurei Ofuda (Z)',
        'upgrade.weapon.focusCrystal': 'Fumashin · Crystal',
        'upgrade.weapon.focusRage': 'Fumashin · Rage',
        'upgrade.weapon.ultSeal': 'Fortified Seal',
        'upgrade.weapon.ultDream': 'Dream Orb',
        'upgrade.weapon.stat': 'Base stats',
        'attackBuild.placeholder': 'Shown after Start',
        'attackBuild.statGridAria': 'Weapon stats',
        'attackBuild.statTip.atk': 'Attack',
        'attackBuild.statTip.aps': 'Fire rate (/s)',
        'attackBuild.statTip.spd': 'Bullet speed',
        'attackBuild.statTip.crit': 'Crit chance',
        'attackBuild.statLabel.atk': 'ATK',
        'attackBuild.statLabel.aps': 'Fire/s',
        'attackBuild.statLabel.spd': 'Spd',
        'attackBuild.statLabel.crit': 'Crit',
        'attackBuild.simple.atk': 'ATK: {v}',
        'attackBuild.simple.aps': 'Fire rate: {v} /s',
        'attackBuild.simple.bulletSpd': 'Bullet spd: {v}',
        'attackBuild.simple.crit': 'Crit: {v}%',
        'attackBuild.emptyList': '(none)',
        'attackBuild.stat.styleDoubleCol': 'Double column ×{n}, gap {sep}px'
    };

    /**
     * 构筑三选一：英文 name/desc（与 stgMode STG_UPGRADE_POOL id 一致）
     * @type {Record<string, { name: string, desc: string }>}
     */
    const UPGRADE_EN = {
        spread_fan: {
            name: 'Item A',
            desc: 'Fan pattern; +2 spread bullets.'
        },
        spread_extra: {
            name: 'Item B',
            desc: 'Chance to fire extra homing bullets; those can pierce twice (3 enemies).'
        },
        spread_turret: {
            name: 'Item C',
            desc: 'Side turret: 150% player ATK, follows you.'
        },
        spread_homing: {
            name: 'Item D',
            desc: 'Homing bullets; −40% damage.'
        },
        spread_yinyang: {
            name: 'Item E',
            desc: 'Every 10s: orb lasts 3s, orbits you, blocks enemy shots, and deals DoT (50% spread main hit/s) to touching enemies.'
        },
        spread_big_p: {
            name: 'Item F',
            desc: 'Kills may drop large P pickups.'
        },
        spread_crit: {
            name: 'Item G',
            desc: 'Higher crit chance for this attack.'
        },
        spread_big_energy: {
            name: 'Item H',
            desc: 'Kills may drop large energy pickups.'
        },
        focus_crystal_base: {
            name: 'Item I',
            desc: 'Every 30 hits in focus: fire 6 crystals forward.'
        },
        focus_crystal_atk: {
            name: 'Item J',
            desc: 'Crystal damage up.'
        },
        focus_crystal_count: {
            name: 'Item K',
            desc: 'More crystals.'
        },
        focus_crystal_pierce: {
            name: 'Item L',
            desc: 'Crystals pierce enemies.'
        },
        focus_rage_core: {
            name: 'Item M',
            desc: 'Focus: every 5 kills adds Rage (fire & bullet spd); 5s, max 3 stacks.'
        },
        focus_rage_cap: {
            name: 'Item N',
            desc: 'Rage max stacks +3.'
        },
        focus_rage_dur: {
            name: 'Item O',
            desc: 'Rage duration +5s.'
        },
        focus_rage_weak: {
            name: 'Item P',
            desc: 'At 5 stacks on an enemy: weak (+20% damage taken).'
        },
        ult_seal_size: {
            name: 'Item Q',
            desc: 'Larger barrier, longer duration.'
        },
        ult_seal_economy: {
            name: 'Item R',
            desc: 'Higher P value from converted bullets; move speed up while the seal lasts.'
        },
        ult_seal_heal: {
            name: 'Item S',
            desc: 'Barrier heals and briefly boosts attack.'
        },
        ult_dream_base: {
            name: 'Item T',
            desc: 'Switch to Dream Orbs: 3 orbs forward, heavy AoE damage.'
        },
        ult_dream_count: {
            name: 'Item U',
            desc: 'More orbs.'
        },
        ult_dream_stun: {
            name: 'Item V',
            desc: 'Orbs can briefly stun enemies.'
        },
        stat_hp: { name: 'Bonus 1', desc: '+1 life cell to max and current HP.' },
        stat_regen: { name: 'Bonus 2', desc: 'HP regen up.' },
        stat_atk_all: { name: 'Bonus 3', desc: 'All attack damage up.' },
        stat_graze: { name: 'Bonus 10', desc: 'Graze orb ult meter gain up.' },
        stat_fire: { name: 'Bonus 4', desc: 'Fire rate up.' },
        stat_bullet_spd: { name: 'Bonus 5', desc: 'Bullet speed up.' },
        stat_move_spread: { name: 'Bonus 6', desc: 'Move speed (spread mode) up.' },
        stat_exp: { name: 'Bonus 7', desc: 'P pickup value up.' },
        stat_ult_charge: { name: 'Bonus 9', desc: 'Energy pickup / ult cooldown value up.' }
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
        if (u.id === 'pool_empty') {
            return { name: t('upgrade.pool_empty.name'), desc: t('upgrade.pool_empty.desc') };
        }
        if (u.id === 'focus_crystal_base' && window.StgMode) {
            if (typeof window.StgMode.getFocusCrystalBaseDesc === 'function' && !isEn()) {
                return { name: u.name, desc: window.StgMode.getFocusCrystalBaseDesc() };
            }
            if (typeof window.StgMode.getFocusCrystalBaseDescEn === 'function' && isEn()) {
                const en = UPGRADE_EN[u.id];
                return {
                    name: en ? en.name : u.name,
                    desc: window.StgMode.getFocusCrystalBaseDescEn()
                };
            }
        }
        if (!isEn()) return { name: u.name, desc: u.desc };
        const en = UPGRADE_EN[u.id];
        if (en) return { name: en.name, desc: en.desc };
        return { name: u.name, desc: u.desc };
    }

    /**
     * 三选一卡牌顶栏：所属武器体系（与 STG_UPGRADE_POOL.group 对应）
     * @param {{ id?: string, group?: string }} u
     * @returns {{ text: string, cssClass: string }}
     */
    function getUpgradeWeaponBadge(u) {
        if (!u || u.id === 'pool_empty') {
            return { text: '', cssClass: 'empty' };
        }
        const g = u.group || 'stat';
        const map = {
            spread: { key: 'upgrade.weapon.spread', cssClass: 'spread' },
            focus_crystal: { key: 'upgrade.weapon.focusCrystal', cssClass: 'focus-crystal' },
            focus_rage: { key: 'upgrade.weapon.focusRage', cssClass: 'focus-rage' },
            ult_seal: { key: 'upgrade.weapon.ultSeal', cssClass: 'ult-seal' },
            ult_dream: { key: 'upgrade.weapon.ultDream', cssClass: 'ult-dream' },
            stat: { key: 'upgrade.weapon.stat', cssClass: 'stat' }
        };
        const m = map[g] || map.stat;
        return { text: t(m.key), cssClass: m.cssClass };
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

    function applyStgLevelUpHintLabels() {
        const btn = document.getElementById('stgLevelUpHint');
        if (!btn) return;
        const textEl = btn.querySelector('.stg-level-up-hint-text');
        const keyEl = btn.querySelector('.stg-level-up-hint-key');
        if (textEl) textEl.textContent = t('levelUp.badge');
        if (keyEl) keyEl.textContent = t('levelUp.key');
        btn.setAttribute('title', t('levelUp.hintTitle'));
        btn.setAttribute('aria-label', t('levelUp.ariaOpen'));
    }

    function applyStaticStgPanels() {
        const hint = document.getElementById('stgHintBar');
        if (hint) hint.innerHTML = t('hint.controls');
        const asideTitle = document.getElementById('stgAsideTitle') || document.querySelector('.stg-aside-title');
        if (asideTitle) asideTitle.textContent = t('aside.title');
        if (typeof window.applyStgAsideToggleLabels === 'function') {
            window.applyStgAsideToggleLabels();
        }
        const upTitle = document.getElementById('stgUpgradeTitle');
        if (upTitle) upTitle.textContent = t('upgrade.title');
        const upSub = document.getElementById('stgUpgradeSubHint');
        const modalRoot = document.getElementById('stgUpgradeModalRoot');
        if (upSub && modalRoot && !modalRoot.classList.contains('hidden')) {
            if (window.StgMode && typeof window.StgMode.refreshUpgradeModalSubhintForI18n === 'function') {
                window.StgMode.refreshUpgradeModalSubhintForI18n();
            } else {
                upSub.innerHTML = t('upgrade.subhint');
            }
        }
        applyStgLevelUpHintLabels();
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
        if (typeof window.refreshStgReimuBonusAside === 'function') {
            window.refreshStgReimuBonusAside();
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
        getUpgradeWeaponBadge,
        applyAll,
        applyToolbar,
        applyStaticStgPanels,
        applyStgLevelUpHintLabels,
        init,
        toggleLang
    };
})();

/**
 * 塔防游戏 - 构筑系统
 * 管理物品商店和玩家库存
 */

/** 缓存破坏参数：每次 fetch 时在 URL 后加 ?v=时间戳，避免浏览器缓存旧的 JSON */

/**
 * 为 URL 添加缓存破坏参数（避免 JSON 被缓存导致修改不生效）
 */
function withCacheBust(path) {
    return path + (path.includes('?') ? '&' : '?') + 'v=' + Date.now();
}

/**
 * 从备用相对路径再拉取 arrow.json，仅合并池中尚不存在的 id（不覆盖已有）
 * @param {Array} allItems
 */
async function mergeArrowJsonSupplement(allItems) {
    if (!Array.isArray(allItems)) return;
    const known = new Set(allItems.map(i => i && i.id).filter(Boolean));
    // 已有弹珠/寒冰则不必再请求（首包 arrow 通常已齐）
    if (known.has('marble_tower') && known.has('frost_tower')) {
        console.log('[防御塔][物品池] arrow 双路径补全已跳过：池中已有 marble_tower、frost_tower');
        return;
    }
    const paths = ['obj_list/arrow.json', './obj_list/arrow.json', '../obj_list/arrow.json'];
    for (let p = 0; p < paths.length; p++) {
        const path = paths[p];
        try {
            const response = await fetch(withCacheBust(path));
            if (!response.ok) continue;
            const data = await response.json();
            if (!Array.isArray(data)) continue;
            let n = 0;
            for (let i = 0; i < data.length; i++) {
                const it = data[i];
                if (it && it.id && !known.has(it.id)) {
                    allItems.push(it);
                    known.add(it.id);
                    n++;
                }
            }
            if (n > 0) {
                console.log(`[物品池] 从补全路径 ${path} 合并 ${n} 条（含 arrow 新塔等）`);
            }
        } catch (e) {
            /* 下一路径 */
        }
    }
}

/**
 * 嵌入式兜底：确保弹珠塔/寒冰塔至少存在于池中（JSON 未加载成功时物品栏仍可选）
 * @param {Array} allItems
 */
function mergeEmbeddedDefenseTowersIfMissing(allItems) {
    if (!Array.isArray(allItems)) return;
    const known = new Set(allItems.map(i => i && i.id).filter(Boolean));
    const stubs = [
        {
            id: 'marble_tower',
            name: '弹珠塔',
            icon: '🔴',
            category: '防御塔',
            attributes: {
                baseAttack: 12,
                attackSpeed: 9,
                range: 5,
                evolveTo: 'marble_tower_elite'
            },
            scaling: { physical_damage: 0.45 },
            specialEffects: [{ type: 'bounce', value: 2, description: '弹射' }],
            quality: 2,
            price: 120,
            description: '弹珠塔（数据兜底：请确认 obj_list/arrow.json 已加载）'
        },
        {
            id: 'frost_tower',
            name: '寒冰塔',
            icon: '❄️',
            category: '防御塔',
            attributes: {
                baseAttack: 14,
                attackSpeed: 8,
                range: 5,
                evolveTo: 'frost_tower_elite'
            },
            scaling: { physical_damage: 0.4, magic_damage: 0.15 },
            quality: 2,
            price: 130,
            description: '寒冰塔（数据兜底：请确认 obj_list/arrow.json 已加载）'
        }
    ];
    stubs.forEach(t => {
        if (!known.has(t.id)) {
            allItems.push(t);
            known.add(t.id);
            console.warn('[物品池] 已嵌入兜底防御塔:', t.id);
        }
    });
}

/**
 * 按 id 去重，后者覆盖前者（避免多路径重复合并 arrow 等同 id 条目）
 * @param {Array} items
 * @returns {Array}
 */
function dedupePoolById(items) {
    if (!Array.isArray(items)) return items;
    const m = new Map();
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it && it.id != null) m.set(String(it.id), it);
    }
    return Array.from(m.values());
}

/** 局内 3→4 升级分支表使用的五类基底塔 id（便于控制台检索「防御塔」报告） */
const UPGRADE_BRANCH_BASE_TOWER_IDS = ['ranger_tower', 'boomerang_tower', 'marble_tower', 'frost_tower', 'knife_tower'];

const TOWER_CATEGORIES_FOR_REPORT = ['防御塔', '箭塔', '法师塔', '炮塔', '兵营'];

/**
 * 输出防御塔相关清单到控制台（含「防御塔」关键字，便于过滤）
 * @param {Array} items
 * @param {string} phase - 阶段说明
 */
function logDefenseTowerLoadReport(items, phase) {
    if (!Array.isArray(items) || typeof console === 'undefined' || !console.log) return;
    const towers = items.filter(i => i && TOWER_CATEGORIES_FOR_REPORT.includes(i.category));
    const rows = towers.map(i => `${i.id}(${i.name || '?'})`).join(' | ');
    console.log(`[防御塔清单][${phase}] 塔类条目 ${towers.length} 条。id→名称: ${rows || '无'}`);
    const idSet = new Set(towers.map(i => i.id));
    const missBranch = UPGRADE_BRANCH_BASE_TOWER_IDS.filter(id => !idSet.has(id));
    if (missBranch.length) {
        console.warn(`[防御塔清单][${phase}] 局内分支五类塔 缺失 id: ${missBranch.join(', ')}`);
    } else {
        console.log(`[防御塔清单][${phase}] 局内分支五类塔 id 已齐：ranger / boomerang / marble / frost / knife`);
    }
}

/**
 * 根据稀有度获取图标
 * @param {string} rarity - 稀有度
 * @returns {string} - 图标emoji
 */
function getIconByRarity(rarity) {
    const iconMap = {
        '普通': '🏰',
        '稀有': '🏯',
        '史诗': '🏛️',
        '传说': '👑'
    };
    return iconMap[rarity] || '🏰';
}

/**
 * 获取scaling字段的中文名称
 * @param {string} key - scaling的键名
 * @returns {string} - 中文名称
 */
function getScalingName(key) {
    const nameMap = {
        // 旧格式
        'remoteDamageRatio': '远程伤害',
        'rangeRatio': '射程',
        'skillMagicDamageRatio': '技能魔法伤害',
        'skillBaseDamage': '技能基础伤害',
        // 新格式
        'physical_damage': '物理伤害',
        'magic_damage': '法术伤害',
        'explosion_damage': '爆炸伤害',
        'armor_pierce_percent': '破甲力',
        'attack_speed_percent': '攻击速度',
        'soldier_health': '士兵生命',
        'total_damage_percent': '全伤害',
        'crit_rate': '暴击率',
        'burn_damage': '持续伤害',
        'skill_cooldown': '技能冷却',
        'skill_duration': '技能持续时间'
    };
    return nameMap[key] || key;
}

/**
 * 玩家属性 / 强化&遗物 effects 键名 → 中文显示名（与 player_stats 前台一致）
 * @param {string} key
 * @returns {string}
 */
function getPlayerStatEffectLabel(key) {
    const map = {
        attack_damage_bonus: '攻击力加成',
        attack_speed_bonus: '射速加成',
        crit_chance_bonus: '暴击率加成',
        elemental_effect_bonus: '元素效果加成',
        elemental_damage_bonus: '元素伤害加成',
        max_health_bonus: '生命值加成',
        health_regen_bonus: '生命值恢复加成',
        gold_income_bonus: '金币收益加成',
        base_spirit_output_bonus: '基地产出加成',
        hero_aura_range_bonus: '英雄光环范围加成',
        hero_xp_gain_bonus: '英雄经验获取加成',
        hero_ult_cost_reduction: '英雄大招灵力消耗减免',
        harvest_power: '收获力',
        harvest_power_growth_percent: '收获力增长',
        base_health: '基地血量'
    };
    return map[key] || getScalingName(key);
}

/**
 * 是否为「小数即百分比」类 effect（0.05 → 5%）
 * @param {string} key
 * @returns {boolean}
 */
function isPercentLikeEffectKey(key) {
    return [
        'attack_damage_bonus', 'attack_speed_bonus', 'crit_chance_bonus',
        'elemental_effect_bonus', 'elemental_damage_bonus', 'max_health_bonus',
        'health_regen_bonus', 'gold_income_bonus', 'base_spirit_output_bonus',
        'hero_aura_range_bonus', 'hero_xp_gain_bonus', 'hero_ult_cost_reduction',
        'attack_speed_percent', 'armor_pierce_percent', 'total_damage_percent',
        'crit_rate', 'harvest_power_growth_percent', 'skill_cooldown'
    ].includes(key);
}

/**
 * 将单个 effect 数值格式化为可读文本（如 +5%、+3）
 * @param {string} key
 * @param {number} value
 * @returns {string}
 */
function formatEffectValueReadable(key, value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return String(value);
    }
    if (isPercentLikeEffectKey(key)) {
        const pct = value * 100;
        const decimals = Math.abs(pct % 1) < 1e-6 ? 0 : 1;
        const s = (pct > 0 ? '+' : '') + pct.toFixed(decimals) + '%';
        return s;
    }
    const s = (value > 0 ? '+' : '') + String(value);
    return s;
}

/**
 * HTML 转义（卡片内文本）
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
}

/**
 * 将 item.effects 转为多行可读说明（纯文本行，供转义后插入 DOM）
 * @param {Object} effects
 * @returns {string[]}
 */
function formatEffectsAsReadableLines(effects) {
    if (!effects || typeof effects !== 'object') return [];
    return Object.keys(effects).map((k) => {
        const label = getPlayerStatEffectLabel(k);
        const val = formatEffectValueReadable(k, effects[k]);
        return `${label} ${val}`;
    });
}

/**
 * 计算最终伤害
 * @param {Object} item - 物品数据
 * @returns {Object} - 包含基础伤害、最终伤害、加成信息的对象
 */
function calculateDamage(item) {
    if (!item.attributes || item.attributes.baseAttack === undefined) {
        return null;
    }

    const baseAttack = item.attributes.baseAttack;
    let finalDamage = baseAttack;
    const scalingInfo = [];

    // 计算所有加成
    if (item.scaling) {
        Object.keys(item.scaling).forEach(key => {
            const ratio = item.scaling[key];
            const scalingName = getScalingName(key);
            const percentage = (ratio * 100).toFixed(0);
            
            // 判断是否是伤害相关的加成
            const isDamageScaling = key.includes('Damage') || 
                                   key.includes('Attack') || 
                                   key === 'physical_damage' || 
                                   key === 'magic_damage' || 
                                   key === 'explosion_damage' ||
                                   key === 'total_damage_percent' ||
                                   key === 'burn_damage';
            
            if (isDamageScaling) {
                // 伤害相关的加成，累加到最终伤害
                finalDamage += baseAttack * ratio;
                scalingInfo.push({
                    name: scalingName,
                    ratio: ratio,
                    percentage: percentage,
                    type: 'damage'
                });
            } else {
                // 其他类型的加成（如破甲力、攻速等）只显示信息，不计算伤害
                scalingInfo.push({
                    name: scalingName,
                    ratio: ratio,
                    percentage: percentage,
                    type: 'other'
                });
            }
        });
    }

    return {
        baseDamage: baseAttack,
        finalDamage: Math.round(finalDamage * 100) / 100, // 保留2位小数
        scalingInfo: scalingInfo
    };
}

/**
 * 格式化特殊效果显示文本
 * 提取并高亮显示数字、概率等关键信息
 * @param {Object} effect - 特殊效果对象
 * @returns {string} - 格式化后的HTML文本
 */
function formatSpecialEffect(effect) {
    console.log('formatSpecialEffect 被调用，effect:', effect);
    if (!effect || !effect.description) {
        console.log('effect 或 description 为空');
        return '';
    }

    let text = effect.description;
    console.log('原始描述文本:', text);
    
    // 使用临时标记来避免重复匹配
    // 按优先级：分数 > 百分比 > 小数 > 整数
    
    // 1. 先匹配分数（如 2/3），使用临时标记
    const fractionPlaceholders = [];
    text = text.replace(/(\d+\/\d+)/g, (match) => {
        const placeholder = `__FRACTION_${fractionPlaceholders.length}__`;
        fractionPlaceholders.push(match);
        return placeholder;
    });
    
    // 2. 匹配百分比（如 50%），使用临时标记
    const percentPlaceholders = [];
    text = text.replace(/([\d.]+%)/g, (match) => {
        const placeholder = `__PERCENT_${percentPlaceholders.length}__`;
        percentPlaceholders.push(match);
        return placeholder;
    });
    
    // 3. 匹配小数（如 1.5），使用临时标记
    const decimalPlaceholders = [];
    text = text.replace(/(\d+\.\d+)/g, (match) => {
        const placeholder = `__DECIMAL_${decimalPlaceholders.length}__`;
        decimalPlaceholders.push(match);
        return placeholder;
    });
    
    // 4. 匹配整数（但排除分数中的数字，因为已经被替换为占位符）
    const integerPlaceholders = [];
    text = text.replace(/\b(\d+)\b/g, (match) => {
        const placeholder = `__INTEGER_${integerPlaceholders.length}__`;
        integerPlaceholders.push(match);
        return placeholder;
    });
    
    // 5. 恢复所有占位符并添加高亮（从后往前恢复，避免索引冲突）
    // 恢复整数（最后处理，因为数量可能最多）
    for (let i = integerPlaceholders.length - 1; i >= 0; i--) {
        text = text.replace(`__INTEGER_${i}__`, `<span class="effect-value">${integerPlaceholders[i]}</span>`);
    }
    
    // 恢复小数
    for (let i = decimalPlaceholders.length - 1; i >= 0; i--) {
        text = text.replace(`__DECIMAL_${i}__`, `<span class="effect-value">${decimalPlaceholders[i]}</span>`);
    }
    
    // 恢复百分比
    for (let i = percentPlaceholders.length - 1; i >= 0; i--) {
        text = text.replace(`__PERCENT_${i}__`, `<span class="effect-value">${percentPlaceholders[i]}</span>`);
    }
    
    // 恢复分数（最先处理，因为包含其他数字）
    for (let i = fractionPlaceholders.length - 1; i >= 0; i--) {
        text = text.replace(`__FRACTION_${i}__`, `<span class="effect-value">${fractionPlaceholders[i]}</span>`);
    }
    
    // 提取并高亮概率相关关键词（但要排除已经在span中的）
    const probabilityKeywords = ['概率', '几率', '概率秒杀'];
    probabilityKeywords.forEach(keyword => {
        // 使用临时标记避免匹配span内的文本
        const probPlaceholders = [];
        text = text.replace(new RegExp(keyword, 'gi'), (match) => {
            const placeholder = `__PROB_${probPlaceholders.length}__`;
            probPlaceholders.push(match);
            return placeholder;
        });
        
        // 恢复并添加高亮
        probPlaceholders.forEach((value, index) => {
            text = text.replace(`__PROB_${index}__`, `<span class="effect-probability">${value}</span>`);
        });
    });
    
    // 如果effect中有value、chance或duration字段，也特别标注
    // 判断value是否为概率值（0-1之间的小数）还是其他数值
    if (effect.value !== undefined && effect.value !== null) {
        let valueStr;
        if (typeof effect.value === 'number') {
            // 如果value在0-1之间且小于1，可能是概率，转换为百分比
            if (effect.value > 0 && effect.value < 1) {
                valueStr = (effect.value * 100).toFixed(0) + '%';
            } else if (effect.value === 1.0) {
                valueStr = '100%';
            } else {
                // 其他数值直接显示
                valueStr = String(effect.value);
            }
        } else {
            valueStr = String(effect.value);
        }
        // 在描述前添加数值信息
        text = `<span class="effect-value">[${valueStr}]</span> ${text}`;
    } else if (effect.chance !== undefined && effect.chance !== null) {
        const chanceStr = effect.chance === 'variable' ? '可变' : String(effect.chance);
        text = `<span class="effect-probability">[概率: ${chanceStr}]</span> ${text}`;
    } else if (effect.duration !== undefined && effect.duration !== null) {
        const durationStr = effect.duration === 'variable' ? '可变' : String(effect.duration);
        text = `<span class="effect-duration">[持续: ${durationStr}]</span> ${text}`;
    }
    
    return text;
}

/**
 * 构建特殊效果显示HTML
 * @param {Array} specialEffects - 特殊效果数组
 * @returns {string} - 特殊效果的HTML文本
 */
function buildSpecialEffectsHTML(specialEffects) {
    console.log('buildSpecialEffectsHTML 被调用，specialEffects:', specialEffects);
    if (!specialEffects || !Array.isArray(specialEffects) || specialEffects.length === 0) {
        console.log('特殊效果为空或不存在');
        return '';
    }
    
    console.log('特殊效果数量:', specialEffects.length);
    const effectsHTML = specialEffects.map((effect, index) => {
        console.log(`处理特殊效果 ${index}:`, effect);
        try {
            const formattedText = formatSpecialEffect(effect);
            console.log('格式化后的文本:', formattedText);
            if (!formattedText || formattedText.trim() === '') {
                console.warn('格式化后的文本为空，使用原始描述');
                return `<div class="special-effect-item">✨ ${effect.description || '未知效果'}</div>`;
            }
            return `<div class="special-effect-item">✨ ${formattedText}</div>`;
        } catch (error) {
            console.error('格式化特殊效果时出错:', error, effect);
            return `<div class="special-effect-item">✨ ${effect.description || '未知效果'}</div>`;
        }
    }).join('');
    
    const result = `<div class="item-special-effects">${effectsHTML}</div>`;
    console.log('最终的特殊效果HTML:', result);
    return result;
}

// 全局物品池（从JSON文件加载）
let ITEM_POOL = [];

/** 防御塔编辑器本地存储 key，刷新后依此加载覆盖 */
const TOWER_OVERRIDES_STORAGE_KEY = 'tower_defense_tower_overrides';

/**
 * 将覆盖数据合并到物品池（按 id 覆盖，影响所有引用该物品的展示与逻辑）
 * @param {Array} itemPool - 物品池（会被原地修改）
 * @param {Object} overrides - id -> 覆盖字段对象
 */
function applyTowerOverrides(itemPool, overrides) {
    if (!itemPool || !overrides || typeof overrides !== 'object') return;
    itemPool.forEach(item => {
        const o = overrides[item.id];
        if (!o) return;
        if (o.name != null) item.name = o.name;
        if (o.icon != null) item.icon = o.icon;
        if (o.description != null) item.description = o.description;
        if (o.price != null) item.price = o.price;
        if (o.rarity != null) item.rarity = o.rarity;
        if (o.quality != null) item.quality = o.quality;
        if (o.category != null) item.category = o.category;
        if (o.attributes && typeof o.attributes === 'object') {
            item.attributes = item.attributes || {};
            Object.assign(item.attributes, o.attributes);
        }
        if (o.scaling && typeof o.scaling === 'object') {
            item.scaling = item.scaling || {};
            Object.assign(item.scaling, o.scaling);
        }
        if (o.specialEffects && Array.isArray(o.specialEffects)) item.specialEffects = o.specialEffects;
    });
}

/**
 * 从 localStorage 读取已保存的防御塔覆盖
 * @returns {Object|null}
 */
function loadSavedTowerOverrides() {
    try {
        const raw = localStorage.getItem(TOWER_OVERRIDES_STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return data && typeof data === 'object' ? data : null;
    } catch (e) {
        console.warn('读取已保存的防御塔覆盖失败', e);
        return null;
    }
}

/** 加载并应用已保存的防御塔覆盖到当前 ITEM_POOL（游戏初始化时调用） */
function applyTowerOverridesFromStorage() {
    const saved = loadSavedTowerOverrides();
    if (saved && Object.keys(saved).length > 0) {
        applyTowerOverrides(ITEM_POOL, saved);
        console.log('已加载已保存的防御塔配置');
    }
}

/** 英雄编辑器本地存储 key：英雄 id -> 覆盖字段对象 */
const HERO_OVERRIDES_STORAGE_KEY = 'tower_defense_hero_overrides';

/**
 * 将覆盖数据合并到物品池（按 id 覆盖，影响所有引用该物品的展示与逻辑）
 * 这里复用 applyTowerOverrides 的合并逻辑
 * @param {Array} itemPool
 * @param {Object} overrides
 */
function applyHeroOverrides(itemPool, overrides) {
    // 与防御塔覆盖逻辑一致：按 id 合并 name/icon/attributes 等
    applyTowerOverrides(itemPool, overrides);
}

/**
 * 从 localStorage 读取已保存的英雄覆盖
 * @returns {Object|null}
 */
function loadSavedHeroOverrides() {
    try {
        const raw = localStorage.getItem(HERO_OVERRIDES_STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return data && typeof data === 'object' ? data : null;
    } catch (e) {
        console.warn('读取已保存的英雄覆盖失败', e);
        return null;
    }
}

/** 加载并应用已保存的英雄覆盖到当前 ITEM_POOL（游戏初始化时调用） */
function applyHeroOverridesFromStorage() {
    const saved = loadSavedHeroOverrides();
    if (saved && Object.keys(saved).length > 0) {
        applyHeroOverrides(ITEM_POOL, saved);
        console.log('已加载已保存的英雄配置');
    }
}

/** 威能节能编辑器：全局威能上限、英雄技能默认威能消耗 */
const POWER_GLOBAL_STORAGE_KEY = 'tower_defense_power_global_settings';

/**
 * @returns {{ powerMax?: number, heroSkillPowerDefault?: number }|null}
 * powerMax 表示「单塔威能条默认上限」；英雄技能大招局内以满条为准，heroSkillPowerDefault 为兼容旧存档保留。
 */
function loadPowerGlobalSettings() {
    try {
        const raw = localStorage.getItem(POWER_GLOBAL_STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return data && typeof data === 'object' ? data : null;
    } catch (e) {
        console.warn('读取威能全局设置失败', e);
        return null;
    }
}

/** 物品栏编辑器本地存储 key：防御塔 id -> 数量，刷新后依此设置玩家物品栏中的防御塔 */
const INVENTORY_OVERRIDE_STORAGE_KEY = 'tower_defense_inventory_override';

/** 防御塔分类，用于识别哪些物品属于“防御塔”以应用物品栏覆盖 */
const TOWER_CATEGORIES_FOR_INVENTORY = ['防御塔', '箭塔', '法师塔', '炮塔', '兵营'];

/**
 * 将物品栏覆盖应用到 gameState.inventory（仅影响防御塔；数量 0 的会从 inventory 移除）
 * @param {Object} gameState - 游戏状态
 * @param {Object} override - towerId -> count
 * @param {Array} itemPool - 物品池，用于取防御塔 id 列表
 */
function applyInventoryOverride(gameState, override, itemPool) {
    if (!gameState || !gameState.inventory || !itemPool) return;
    const towerIds = itemPool.filter(i => i && TOWER_CATEGORIES_FOR_INVENTORY.includes(i.category)).map(i => i.id);
    towerIds.forEach(id => {
        const count = (override && typeof override[id] === 'number' && override[id] >= 0) ? override[id] : 0;
        if (count <= 0) gameState.inventory.delete(id);
        else gameState.inventory.set(id, count);
    });
}

/**
 * 从 localStorage 读取已保存的物品栏覆盖
 * @returns {Object|null} towerId -> count
 */
function loadSavedInventoryOverride() {
    try {
        const raw = localStorage.getItem(INVENTORY_OVERRIDE_STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return data && typeof data === 'object' ? data : null;
    } catch (e) {
        console.warn('读取已保存的物品栏覆盖失败', e);
        return null;
    }
}

/**
 * 旧存档 id 迁移：red_diamond→marble_tower、sniper_tower→knife_tower（与箭塔弹珠/飞刀拆分）
 */
function migrateLegacyTowerInventoryIdsInStorage() {
    try {
        const raw = localStorage.getItem(INVENTORY_OVERRIDE_STORAGE_KEY);
        if (!raw) return;
        const o = JSON.parse(raw);
        if (!o || typeof o !== 'object') return;
        let ch = false;
        if (typeof o.red_diamond === 'number') {
            const add = o.red_diamond;
            o.marble_tower = (typeof o.marble_tower === 'number' ? o.marble_tower : 0) + add;
            delete o.red_diamond;
            ch = true;
        }
        if (typeof o.sniper_tower === 'number') {
            const add = o.sniper_tower;
            o.knife_tower = (typeof o.knife_tower === 'number' ? o.knife_tower : 0) + add;
            delete o.sniper_tower;
            ch = true;
        }
        if (ch) {
            localStorage.setItem(INVENTORY_OVERRIDE_STORAGE_KEY, JSON.stringify(o));
            console.log('[防御塔] 物品栏存档已迁移：red_diamond→marble_tower、sniper_tower→knife_tower');
        }
    } catch (e) {
        console.warn('迁移物品栏 id 失败', e);
    }
}

/** 游戏初始化时：应用已保存的物品栏覆盖到当前 gameState */
function applyInventoryOverridesFromStorage(gameState) {
    migrateLegacyTowerInventoryIdsInStorage();
    const saved = loadSavedInventoryOverride();
    if (saved && Object.keys(saved).length > 0 && ITEM_POOL && ITEM_POOL.length > 0) {
        applyInventoryOverride(gameState, saved, ITEM_POOL);
        console.log('已加载已保存的物品栏配置');
    }
}

/** 英雄物品栏编辑器本地存储 key：英雄 id -> 数量 */
const HERO_INVENTORY_OVERRIDE_STORAGE_KEY = 'tower_defense_hero_inventory_override';

/**
 * 将英雄物品栏覆盖应用到 gameState.inventory（仅影响 category === '英雄'）
 * @param {Object} gameState
 * @param {Object} override
 * @param {Array} itemPool
 */
function applyHeroInventoryOverride(gameState, override, itemPool) {
    if (!gameState || !gameState.inventory || !itemPool) return;
    const heroIds = itemPool.filter(i => i && i.category === '英雄').map(i => i.id);
    heroIds.forEach(id => {
        const count = (override && typeof override[id] === 'number' && override[id] >= 0) ? override[id] : 0;
        if (count <= 0) gameState.inventory.delete(id);
        else gameState.inventory.set(id, count);
    });
}

/**
 * 从 localStorage 读取已保存的英雄物品栏覆盖
 * @returns {Object|null}
 */
function loadSavedHeroInventoryOverride() {
    try {
        const raw = localStorage.getItem(HERO_INVENTORY_OVERRIDE_STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return data && typeof data === 'object' ? data : null;
    } catch (e) {
        console.warn('读取已保存的英雄物品栏覆盖失败', e);
        return null;
    }
}

/** 游戏初始化时：应用已保存的英雄物品栏覆盖到当前 gameState */
function applyHeroInventoryOverridesFromStorage(gameState) {
    const saved = loadSavedHeroInventoryOverride();
    if (saved && Object.keys(saved).length > 0 && ITEM_POOL && ITEM_POOL.length > 0) {
        applyHeroInventoryOverride(gameState, saved, ITEM_POOL);
        console.log('已加载已保存的英雄物品栏配置');
    }
}

/** 防御塔配装存档键（须早于下方 window 导出，避免暂时性死区） */
const TOWER_LOADOUT_STORAGE_KEY = 'tower_defense_tower_loadouts';
/** 特斯拉配装扩展：大招选择、刷新次数等 */
const TESLA_LOADOUT_EXTRAS_KEY = 'tower_defense_tesla_loadout_extras';

/**
 * 从 localStorage 恢复各塔配装到 gameState
 * @param {GameState} gameState
 */
function applyTowerLoadoutsFromStorage(gameState) {
    if (!gameState || !gameState.towerLoadouts) return;
    try {
        const raw = localStorage.getItem(TOWER_LOADOUT_STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return;
        let loadoutMigrated = false;
        if (data.red_diamond) {
            if (!data.marble_tower) data.marble_tower = data.red_diamond;
            delete data.red_diamond;
            loadoutMigrated = true;
        }
        if (data.sniper_tower) {
            if (!data.knife_tower) data.knife_tower = data.sniper_tower;
            delete data.sniper_tower;
            loadoutMigrated = true;
        }
        if (loadoutMigrated) {
            try {
                localStorage.setItem(TOWER_LOADOUT_STORAGE_KEY, JSON.stringify(data));
                console.log('[防御塔] 配装存档已迁移键：red_diamond→marble_tower、sniper_tower→knife_tower');
            } catch (e2) {
                console.warn('写回配装迁移失败', e2);
            }
        }
        Object.keys(data).forEach(storedKey => {
            const slots = data[storedKey];
            if (!Array.isArray(slots)) return;
            const normKey = gameState.getLoadoutStorageKey(storedKey);
            const arr = gameState.getTowerLoadoutSlots(normKey);
            for (let i = 0; i < 3; i++) {
                const v = (slots[i] != null && slots[i] !== '') ? String(slots[i]) : null;
                if (v != null) arr[i] = v;
            }
        });
        console.log('已加载防御塔配装存档');
    } catch (e) {
        console.warn('读取防御塔配装失败', e);
    }
}

/**
 * 从 localStorage 恢复特斯拉大招选择、刷新计费等
 * @param {GameState} gameState
 */
function applyTeslaLoadoutExtrasFromStorage(gameState) {
    if (!gameState) return;
    try {
        const raw = localStorage.getItem(TESLA_LOADOUT_EXTRAS_KEY);
        if (!raw) return;
        const o = JSON.parse(raw);
        if (!o || typeof o !== 'object') return;
        if (o.teslaUltimateLoadoutId != null && o.teslaUltimateLoadoutId !== '') {
            gameState.teslaUltimateLoadoutId = String(o.teslaUltimateLoadoutId);
        }
        if (o.teslaLoadoutRefreshCount != null) {
            const n = Number(o.teslaLoadoutRefreshCount);
            if (Number.isFinite(n) && n >= 0) gameState.teslaLoadoutRefreshCount = Math.floor(n);
        }
        console.log('已加载特斯拉配装扩展存档');
    } catch (e) {
        console.warn('读取特斯拉配装扩展失败', e);
    }
}

/**
 * 写入特斯拉配装扩展
 * @param {GameState} gameState
 */
function saveTeslaLoadoutExtrasToStorage(gameState) {
    if (!gameState) return;
    try {
        localStorage.setItem(TESLA_LOADOUT_EXTRAS_KEY, JSON.stringify({
            teslaUltimateLoadoutId: gameState.teslaUltimateLoadoutId,
            teslaLoadoutRefreshCount: gameState.teslaLoadoutRefreshCount || 0
        }));
    } catch (e) {
        console.warn('保存特斯拉配装扩展失败', e);
    }
}

/**
 * 将当前配装写入 localStorage
 * @param {GameState} gameState
 */
function saveTowerLoadoutsToStorage(gameState) {
    if (!gameState || !gameState.towerLoadouts) return;
    try {
        const raw = {};
        gameState.towerLoadouts.forEach((slots, towerId) => {
            raw[towerId] = slots.slice();
        });
        localStorage.setItem(TOWER_LOADOUT_STORAGE_KEY, JSON.stringify(raw));
    } catch (e) {
        console.warn('保存防御塔配装失败', e);
    }
}

// 供防御塔编辑器、物品栏编辑器调用
if (typeof window !== 'undefined') {
    window.applyTowerOverrides = applyTowerOverrides;
    window.loadSavedTowerOverrides = loadSavedTowerOverrides;
    window.TOWER_OVERRIDES_STORAGE_KEY = TOWER_OVERRIDES_STORAGE_KEY;
    window.applyInventoryOverride = applyInventoryOverride;
    window.loadSavedInventoryOverride = loadSavedInventoryOverride;
    window.INVENTORY_OVERRIDE_STORAGE_KEY = INVENTORY_OVERRIDE_STORAGE_KEY;
    window.TOWER_CATEGORIES_FOR_INVENTORY = TOWER_CATEGORIES_FOR_INVENTORY;

    // 供英雄编辑器调用
    window.applyHeroOverrides = applyHeroOverrides;
    window.loadSavedHeroOverrides = loadSavedHeroOverrides;
    window.HERO_OVERRIDES_STORAGE_KEY = HERO_OVERRIDES_STORAGE_KEY;
    window.loadPowerGlobalSettings = loadPowerGlobalSettings;
    window.TOWER_LOADOUT_STORAGE_KEY = TOWER_LOADOUT_STORAGE_KEY;
    window.applyTowerLoadoutsFromStorage = applyTowerLoadoutsFromStorage;
    window.saveTowerLoadoutsToStorage = saveTowerLoadoutsToStorage;
    window.TESLA_LOADOUT_EXTRAS_KEY = TESLA_LOADOUT_EXTRAS_KEY;
    window.applyTeslaLoadoutExtrasFromStorage = applyTeslaLoadoutExtrasFromStorage;
    window.saveTeslaLoadoutExtrasToStorage = saveTeslaLoadoutExtrasToStorage;
    window.POWER_GLOBAL_STORAGE_KEY = POWER_GLOBAL_STORAGE_KEY;
    window.applyHeroInventoryOverride = applyHeroInventoryOverride;
    window.loadSavedHeroInventoryOverride = loadSavedHeroInventoryOverride;
    window.HERO_INVENTORY_OVERRIDE_STORAGE_KEY = HERO_INVENTORY_OVERRIDE_STORAGE_KEY;
}

/**
 * 加载物品数据
 * @returns {Promise<Array>} - 物品数组
 */
async function loadItemsData() {
    // 防御塔文件列表（需要合并）
    const towerFiles = [
        '../obj_list/arrow.json',
        '../obj_list/boom.json',
        '../obj_list/guard.json',
        '../obj_list/wizard.json'
    ];
    
    // 道具文件
    const itemFile = '../obj_list/item.json';
    
    let allItems = [];
    
    // 加载所有防御塔文件
    for (const filePath of towerFiles) {
        try {
            console.log(`尝试加载防御塔文件: ${filePath}`);
            const response = await fetch(withCacheBust(filePath));
            if (!response.ok) {
                console.warn(`路径 ${filePath} 返回状态码: ${response.status}`);
                continue;
            }
            const data = await response.json();
            if (Array.isArray(data)) {
                allItems = allItems.concat(data);
                console.log(`成功从 ${filePath} 加载 ${data.length} 个防御塔`);
                if (filePath.indexOf('arrow') !== -1) {
                    const ids = data.map(x => x && x.id).filter(Boolean);
                    console.log(`[防御塔][arrow.json] 本文件 id 列表 (${ids.length}):`, ids.join(', '));
                    const miss = UPGRADE_BRANCH_BASE_TOWER_IDS.filter(id => ids.indexOf(id) === -1);
                    if (miss.length) {
                        console.warn('[防御塔][arrow.json] 与局内分支表对照：缺少 id →', miss.join(', '));
                    } else {
                        console.log('[防御塔][arrow.json] 与局内分支表对照：五类基底塔 id 已全部包含');
                    }
                }
            } else {
                // 如果不是数组，尝试作为单个对象处理
                allItems.push(data);
                console.log(`成功从 ${filePath} 加载 1 个防御塔`);
            }
        } catch (error) {
            console.warn(`路径 ${filePath} 加载失败:`, error.message);
        }
    }

    // 双路径补全 arrow.json：game_demo 为站点根时 `../obj_list` 可能 404，而 `obj_list/arrow.json` 可用（或反之）
    await mergeArrowJsonSupplement(allItems);

    // 仍缺弹珠/寒冰时写入嵌入式条目，保证物品栏编辑器与局内塔 id 一致
    mergeEmbeddedDefenseTowersIfMissing(allItems);
    
    // 配装道具（独立 JSON，便于扩展）
    const loadoutFile = '../obj_list/loadout_items.json';
    try {
        const response = await fetch(withCacheBust(loadoutFile));
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
                allItems = allItems.concat(data);
                console.log(`成功从 ${loadoutFile} 加载 ${data.length} 个配装道具`);
            }
        }
    } catch (error) {
        console.warn(`路径 ${loadoutFile} 加载失败:`, error.message);
    }
    try {
        const altLoadout = 'obj_list/loadout_items.json';
        if (allItems.filter(i => i && i.category === '配装').length === 0) {
            const response = await fetch(withCacheBust(altLoadout));
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data)) {
                    allItems = allItems.concat(data);
                    console.log(`成功从 ${altLoadout} 加载 ${data.length} 个配装道具`);
                }
            }
        }
    } catch (error) {
        console.warn('备用配装列表加载失败:', error.message);
    }

    // 特斯拉专属配装（被动 + 大招选项，与 loadout_items 并存）
    const teslaLoadoutFile = '../obj_list/tesla_loadout_items.json';
    try {
        const response = await fetch(withCacheBust(teslaLoadoutFile));
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
                allItems = allItems.concat(data);
                console.log(`成功从 ${teslaLoadoutFile} 加载 ${data.length} 个特斯拉配装`);
            }
        }
    } catch (error) {
        console.warn(`路径 ${teslaLoadoutFile} 加载失败:`, error.message);
    }
    try {
        const altTesla = 'obj_list/tesla_loadout_items.json';
        const hasTesla = allItems.some(i => i && i.loadoutFamily === 'tesla');
        if (!hasTesla) {
            const response = await fetch(withCacheBust(altTesla));
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data)) {
                    allItems = allItems.concat(data);
                    console.log(`成功从 ${altTesla} 加载 ${data.length} 个特斯拉配装`);
                }
            }
        }
    } catch (error) {
        console.warn('备用特斯拉配装列表加载失败:', error.message);
    }

    // 加载道具文件
    try {
        console.log(`尝试加载道具文件: ${itemFile}`);
        const response = await fetch(withCacheBust(itemFile));
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
                allItems = allItems.concat(data);
                console.log(`成功从 ${itemFile} 加载 ${data.length} 个道具`);
            } else {
                allItems.push(data);
                console.log(`成功从 ${itemFile} 加载 1 个道具`);
            }
        } else {
            console.warn(`路径 ${itemFile} 返回状态码: ${response.status}`);
        }
    } catch (error) {
        console.warn(`路径 ${itemFile} 加载失败:`, error.message);
    }

    // 强化系统道具池（与遗物不同池；商店不出售，仅强化界面四选一）
    const enhanceFiles = ['../obj_list/enhance_items.json', 'obj_list/enhance_items.json'];
    for (const ef of enhanceFiles) {
        try {
            const response = await fetch(withCacheBust(ef));
            if (!response.ok) continue;
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                allItems = allItems.concat(data);
                console.log(`成功从 ${ef} 加载 ${data.length} 个强化选项`);
                break;
            }
        } catch (e) {
            console.warn(`强化列表 ${ef} 加载失败:`, e.message);
        }
    }

    // 遗物商店池（与旧道具并存：旧道具仍进 itemPool 供库存/效果，商店仅展示遗物）
    const relicFiles = ['../obj_list/relics.json', 'obj_list/relics.json'];
    for (const rf of relicFiles) {
        try {
            const response = await fetch(withCacheBust(rf));
            if (!response.ok) continue;
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                allItems = allItems.concat(data);
                console.log(`成功从 ${rf} 加载 ${data.length} 个遗物`);
                break;
            }
        } catch (e) {
            console.warn(`遗物列表 ${rf} 加载失败:`, e.message);
        }
    }
    
    // 如果所有文件都加载失败，尝试备用路径
    if (allItems.length === 0) {
        console.log('尝试备用路径...');
        const alternativePaths = [
            'obj_list/arrow.json',
            'obj_list/boom.json',
            'obj_list/guard.json',
            'obj_list/wizard.json',
            'obj_list/item.json'
        ];
        
        for (const filePath of alternativePaths) {
            try {
                console.log(`尝试备用路径: ${filePath}`);
                const response = await fetch(withCacheBust(filePath));
                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data)) {
                        allItems = allItems.concat(data);
                        console.log(`成功从备用路径 ${filePath} 加载 ${data.length} 个物品`);
                    } else {
                        allItems.push(data);
                        console.log(`成功从备用路径 ${filePath} 加载 1 个物品`);
                    }
                }
            } catch (error) {
                console.warn(`备用路径 ${filePath} 加载失败:`, error.message);
            }
        }
    }
    
    // 如果仍然没有加载到数据，显示错误
    if (allItems.length === 0) {
        console.error('所有路径都加载失败');
        const errorMsg = '加载物品数据失败！\n\n请确保：\n1. 使用HTTP服务器运行（不能直接打开HTML文件）\n2. 运行 server.py 或 server.js 启动本地服务器\n3. 访问 http://localhost:8765/game_demo/index.html';
        alert(errorMsg);
        return [];
    }
    
    allItems = dedupePoolById(allItems);
    console.log(`总共加载 ${allItems.length} 个物品`);
    logDefenseTowerLoadReport(allItems, '去重后最终池');
    
    // 统一处理价格字段：将 basePrice 映射为 price，如果没有 price 则使用 basePrice
    allItems.forEach(item => {
        if (item.basePrice !== undefined && item.price === undefined) {
            item.price = item.basePrice;
        }
        // 如果没有 price 也没有 basePrice，默认为 null（免费）
        if (item.price === undefined && item.basePrice === undefined) {
            item.price = null;
        }
    });
    
    return allItems;
}

/**
 * 加载玩家属性配置
 * @returns {Promise<Array>} - 玩家属性配置数组
 */
async function loadPlayerStats() {
    const possiblePaths = [
        '../player_stat/player_stats.json',  // 从 game_demo 目录访问上级目录的 player_stat
        'player_stat/player_stats.json',     // 从项目根目录访问
        './player_stat/player_stats.json'     // 当前目录下的 player_stat
    ];
    
    for (const path of possiblePaths) {
        try {
            console.log(`尝试加载玩家属性路径: ${path}`);
            const response = await fetch(withCacheBust(path));
            if (!response.ok) {
                console.warn(`路径 ${path} 返回状态码: ${response.status}`);
                continue;
            }
            const data = await response.json();
            console.log(`成功从 ${path} 加载玩家属性配置`);
            return data;
        } catch (error) {
            console.warn(`从 ${path} 加载玩家属性配置失败:`, error);
        }
    }
    
    console.error('所有路径尝试失败，无法加载玩家属性配置');
    console.warn('将使用默认玩家属性配置');
    // 返回默认配置，避免游戏无法运行（与 player_stat/player_stats.json 前台列表一致）
    return [
        { id: 'attack_damage_bonus', displayName: '攻击力加成', icon: '⚔️', baseValue: 0, currentValue: 0, type: 'percent', description: '攻击力乘区' },
        { id: 'attack_speed_bonus', displayName: '射速加成', icon: '🏹', baseValue: 0, currentValue: 0, type: 'percent', description: '射速乘区' },
        { id: 'crit_chance_bonus', displayName: '暴击率加成', icon: '💥', baseValue: 0, currentValue: 0, type: 'percent', description: '暴击率' },
        { id: 'elemental_effect_bonus', displayName: '元素效果加成', icon: '🔮', baseValue: 0, currentValue: 0, type: 'percent', description: '预留' },
        { id: 'elemental_damage_bonus', displayName: '元素伤害加成', icon: '✨', baseValue: 0, currentValue: 0, type: 'percent', description: '元素伤害' },
        { id: 'max_health_bonus', displayName: '生命值加成', icon: '❤️', baseValue: 0, currentValue: 0, type: 'percent', description: '塔血量' },
        { id: 'health_regen_bonus', displayName: '生命值恢复加成', icon: '💚', baseValue: 0, currentValue: 0, type: 'percent', description: '塔回复' },
        { id: 'gold_income_bonus', displayName: '金币收益加成', icon: '🪙', baseValue: 0, currentValue: 0, type: 'percent', description: '金币' },
        { id: 'base_spirit_output_bonus', displayName: '基地产出加成', icon: '🏠', baseValue: 0, currentValue: 0, type: 'percent', description: '产灵' },
        { id: 'hero_aura_range_bonus', displayName: '英雄光环范围加成', icon: '🌟', baseValue: 0, currentValue: 0, type: 'percent', description: '光环范围' },
        { id: 'hero_xp_gain_bonus', displayName: '英雄经验获取加成', icon: '📈', baseValue: 0, currentValue: 0, type: 'percent', description: '英雄经验' }
    ];
}

/**
 * 玩家属性管理类
 */
class PlayerStats {
    constructor(statsConfig) {
        this.stats = new Map();
        this.statsArray = []; // 保存原始顺序
        
        // 支持两种格式：
        // 1. 数组格式：直接是属性数组 [{id: "...", ...}, ...]
        // 2. 对象格式：包含 stats 字段的对象 {stats: [{id: "...", ...}, ...]}
        let statsArray = null;
        
        if (Array.isArray(statsConfig)) {
            // 如果直接是数组
            statsArray = statsConfig;
        } else if (statsConfig && statsConfig.stats && Array.isArray(statsConfig.stats)) {
            // 如果是包含 stats 字段的对象
            statsArray = statsConfig.stats;
        }
        
        if (statsArray) {
            // 保存原始顺序
            this.statsArray = statsArray.map(stat => stat.id);
            
            statsArray.forEach(stat => {
                this.stats.set(stat.id, {
                    ...stat,
                    currentValue: stat.baseValue
                });
            });
            console.log(`玩家属性初始化完成，共加载 ${this.stats.size} 个属性`);
        } else {
            console.warn('玩家属性配置格式不正确或为空');
        }
    }
    
    /**
     * 获取属性值
     * @param {string} statId - 属性ID
     * @returns {number} - 属性当前值
     */
    getStat(statId) {
        const stat = this.stats.get(statId);
        return stat ? stat.currentValue : 0;
    }
    
    /**
     * 设置属性值
     * @param {string} statId - 属性ID
     * @param {number} value - 新值
     */
    setStat(statId, value) {
        const stat = this.stats.get(statId);
        if (stat) {
            stat.currentValue = value;
        }
    }
    
    /**
     * 应用道具效果到属性
     * @param {Object} item - 道具对象
     * @param {number} count - 道具数量（默认为1）
     */
    applyItemEffects(item, count = 1) {
        if (!item.effects) {
            console.log('物品没有 effects 字段:', item.name);
            return;
        }
        
        console.log(`开始应用物品效果: ${item.name}, effects:`, item.effects);
        Object.keys(item.effects).forEach(effectKey => {
            const effectValue = item.effects[effectKey];
            
            // 处理特殊效果类型
            if (effectKey === 'conversion') {
                console.log(`转换效果: ${effectValue} (需要特殊处理)`);
                return;
            }
            
            if (effectKey === 'per_10_gold') {
                console.log(`每10金币加成效果: ${JSON.stringify(effectValue)} (需要特殊处理)`);
                return;
            }
            
            // 处理对象类型的值（如 per_10_gold 的子属性）
            if (typeof effectValue === 'object' && effectValue !== null) {
                console.log(`特殊效果对象: ${effectKey} = ${JSON.stringify(effectValue)} (需要特殊处理)`);
                return;
            }
            
            // 普通数值效果：直接累加
            if (typeof effectValue === 'number') {
                const currentValue = this.getStat(effectKey);
                const stat = this.stats.get(effectKey);
                if (stat) {
                    const newValue = currentValue + (effectValue * count);
                    this.setStat(effectKey, newValue);
                    console.log(`✓ 应用效果: ${effectKey} = ${currentValue} + (${effectValue} * ${count}) = ${newValue}`);
                } else {
                    console.log(`✗ 效果 ${effectKey} 不在玩家属性系统中，需要在游戏逻辑中处理`);
                }
            }
        });
    }
    
    /**
     * 获取所有属性（按JSON原始顺序，含 legacy 后台项）
     * @returns {Array} - 属性数组
     */
    getAllStats() {
        // 按照 JSON 文件的原始顺序返回
        return this.statsArray.map(statId => this.stats.get(statId)).filter(stat => stat !== undefined);
    }

    /**
     * 商店/界面展示用：仅前台属性（不含 legacy:true 的后台兼容项）
     * @returns {Array}
     */
    getStatsForShopDisplay() {
        return this.getAllStats().filter(stat => stat && !stat.legacy);
    }
    
    /**
     * 格式化属性值显示
     * @param {Object} stat - 属性对象
     * @returns {string} - 格式化后的值
     */
    formatStatValue(stat) {
        // 根据属性类型决定显示格式
        if (stat.type === 'percent') {
            // 百分比类型：显示为百分比（如 0.05 → 5.0%）
            return (stat.currentValue * 100).toFixed(1) + '%';
        } else if (stat.type === 'multiplier') {
            // 倍数类型：显示为百分比（如 1.0 → 100.0%, 1.25 → 125.0%）
            return (stat.currentValue * 100).toFixed(1) + '%';
        } else {
            // number 类型：显示为数字
            if (stat.currentValue % 1 === 0) {
                return stat.currentValue.toFixed(0);
            } else {
                // 对于小数，保留2位小数
                return stat.currentValue.toFixed(2);
            }
        }
    }
}

// 注意：以下数据仅作为备用，实际开发中应从JSON文件加载
const FALLBACK_ITEM_POOL = [
    {
      "id": "arrow_tower",
      "name": "箭塔",
      "category": "防御塔",
      "rarity": "普通",
      "attributes": {
        "baseAttack": 15,
        "attackSpeed": 1.0,
        "rangeGrid": 1,
        "health": 100
      },
      "scaling": {
        "remoteDamageRatio": 0.50
      },
      "price": 50,
      "description": "最基础的箭塔"
    },
    {
      "id": "machine_gun_tower",
      "name": "机枪塔",
      "category": "防御塔",
      "rarity": "稀有",
      "attributes": {
        "baseAttack": 5,
        "attackSpeed": 20.0,
        "rangeGrid": 1,
        "health": 120
      },
      "scaling": {
        "remoteDamageRatio": 0.50
      },
      "price": 100,
      "description": "射程近，高攻速，容易触发攻击特效的箭塔"
    },
    {
      "id": "boomerang_tower",
      "name": "飞镖塔",
      "category": "防御塔",
      "rarity": "稀有",
      "attributes": {
        "baseAttack": 10,
        "attackSpeed": 10.0,
        "rangeGrid": 1,
        "health": 100
      },
      "scaling": {
        "remoteDamageRatio": 0.50
      },
      "specialEffects": [
        { "type": "bounce", "value": 3, "description": "在敌人之间弹射2/3次" }
      ],
      "price": 100,
      "description": "属性偏低，但能够同时攻击多个目标的箭塔"
    },
    {
      "id": "crossbow_tower",
      "name": "弩塔",
      "category": "防御塔",
      "rarity": "稀有",
      "attributes": {
        "baseAttack": 15,
        "attackSpeed": 10.0,
        "rangeGrid": 1,
        "health": 100
      },
      "scaling": {
        "remoteDamageRatio": 0.40,
        "rangeRatio": 0.10
      },
      "price": 100,
      "description": "属性中等，范围较大的箭塔"
    },
    {
      "id": "shotgun_tower",
      "name": "霰弹枪",
      "category": "防御塔",
      "rarity": "史诗",
      "attributes": {
        "baseAttack": 10,
        "attackSpeed": 5.0,
        "rangeGrid": 1,
        "health": 150
      },
      "scaling": {
        "remoteDamageRatio": 0.50
      },
      "specialEffects": [
        { "type": "armor_pierce", "value": 1.0, "description": "伤害直接无视护甲" }
      ],
      "price": 150,
      "description": "范围短，单向，同时射击范围内大量目标"
    },
    {
      "id": "musket_tower",
      "name": "火枪塔",
      "category": "防御塔",
      "rarity": "史诗",
      "attributes": {
        "baseAttack": 15,
        "attackSpeed": 0.8,
        "rangeGrid": 1,
        "health": 80
      },
      "scaling": {
        "remoteDamageRatio": 0.40,
        "rangeRatio": 0.10
      },
      "specialEffects": [
        { "type": "instant_kill", "chance": "variable", "description": "概率秒杀" }
      ],
      "price": 200,
      "description": "范围中，攻速低，但是概率秒杀"
    },
    {
      "id": "tactical_arrow_tower",
      "name": "战术箭塔",
      "category": "防御塔",
      "rarity": "传说",
      "attributes": {
        "baseAttack": 10,
        "skillBaseDamage": 5,
        "attackSpeed": 1.2,
        "rangeGrid": 1,
        "health": 120
      },
      "scaling": {
        "remoteDamageRatio": 0.50,
        "skillMagicDamageRatio": 0.80
      },
      "specialEffects": [
        { "type": "stun", "duration": "variable", "description": "射出昏睡箭并造成眩晕" }
      ],
      "price": 250,
      "description": "附带法术伤害和控制能力的箭塔"
    }
];

// 游戏状态管理
class GameState {
    constructor(itemPool, playerStats) {
        // 玩家金币（初始值）
        this.coins = 100;
        // 玩家持有的物品（使用Map存储，key为物品id，value为数量）
        this.inventory = new Map();
        // 初始持有：2 个箭塔（从物品池中取第一个防御塔类型，兼容 arrow_tower / ranger_tower 等不同数据源）
        const towerCategories = ['防御塔', '箭塔', '法师塔', '炮塔', '兵营', '英雄'];
        const firstTower = itemPool && itemPool.find(i => towerCategories.includes(i.category));
        if (firstTower) {
            this.inventory.set(firstTower.id, 2);
        }
        // 物品池引用
        this.itemPool = itemPool;
        // 商店刷新次数（用于递增刷新费用：首次5，之后每次+5）
        this.shopRefreshCount = 0;
        // 当前商店中的物品列表（从物品池中随机选择）
        this.currentShopItems = this.generateShopItems();
        /** 强化界面：当前 4 个选项（category===强化，免费四选一） */
        this.currentEnhanceItems = this.rollEnhanceOffers();
        /** 强化界面刷新次数（仅统计，免费） */
        this.enhanceRefreshCount = 0;
        // 玩家属性
        this.playerStats = playerStats;
        // 收获力：每波结束固定获得的金币数，波次结束后按百分比增长
        this.harvestPower = Math.max(0, (playerStats && playerStats.getStat('harvest_power')) ?? 50);
        this.harvestPowerGrowthPercent = Math.max(0, (playerStats && playerStats.getStat('harvest_power_growth_percent')) ?? 0.01);
        /** 灵力：部署防御塔/英雄时消耗（见物品 attributes.deploySpiritCost，默认 5） */
        this.spirit = 40;
        /** 防御塔配装：塔物品 id → 长度 3 的数组；槽 0/1/2 对应局内塔 1/2/3 级时生效（见 towerDefense 累计应用） */
        this.towerLoadouts = new Map();
        /** 特斯拉：当前随机到的 3 个被动配装 id（打开面板时重抽，可金币刷新） */
        this.teslaLoadoutOfferIds = [];
        /** 特斯拉：被动候选刷新次数（费用 5 + count*5，与商店刷新类似） */
        this.teslaLoadoutRefreshCount = 0;
        /** 特斯拉：大招三选一（配装 id，效果待实现） */
        this.teslaUltimateLoadoutId = null;
    }

    /**
     * 配装存档与局内加成统一使用的键（特斯拉/精英特斯拉共用「tesla」）
     * @param {string} towerId
     * @returns {string|undefined}
     */
    getLoadoutStorageKey(towerId) {
        if (!towerId) return towerId;
        if (towerId === 'tesla' || towerId === 'tesla_elite') return 'tesla';
        return towerId;
    }

    /**
     * 获取某座塔类型的配装槽数组（共 3 槽：对应 1/2/3 级）
     * @param {string} towerId
     * @returns {(string|null)[]}
     */
    getTowerLoadoutSlots(towerId) {
        const key = this.getLoadoutStorageKey(towerId);
        if (!key) return [null, null, null];
        if (!this.towerLoadouts.has(key)) {
            this.towerLoadouts.set(key, [null, null, null]);
        }
        const arr = this.towerLoadouts.get(key);
        // 兼容旧版 5 槽：截断为 3
        if (Array.isArray(arr) && arr.length !== 3) {
            const n = [arr[0] ?? null, arr[1] ?? null, arr[2] ?? null];
            this.towerLoadouts.set(key, n);
            return n;
        }
        return arr;
    }

    /**
     * 写入单个配装槽
     * @param {string} towerId
     * @param {number} slotIndex 0–2（分别对应 1/2/3 级）
     * @param {string|null} equipId
     * @returns {boolean}
     */
    setTowerLoadoutSlot(towerId, slotIndex, equipId) {
        const arr = this.getTowerLoadoutSlots(towerId);
        if (slotIndex < 0 || slotIndex >= 3) return false;
        arr[slotIndex] = equipId || null;
        return true;
    }

    /**
     * 特斯拉被动配装池（用于随机三选一）
     * @returns {Array<Object>}
     */
    getTeslaPassiveLoadoutPool() {
        return (this.itemPool || []).filter(i =>
            i && i.category === '配装' && i.loadoutFamily === 'tesla' && i.loadoutKind === 'passive'
        );
    }

    /**
     * 特斯拉大招配装池（三选一展示）
     * @returns {Array<Object>}
     */
    getTeslaUltimateLoadoutPool() {
        return (this.itemPool || []).filter(i =>
            i && i.category === '配装' && i.loadoutFamily === 'tesla' && i.loadoutKind === 'ultimate'
        );
    }

    /**
     * 随机抽取 3 个不同的被动配装 id 写入 teslaLoadoutOfferIds
     */
    rollTeslaLoadoutOffers() {
        const pool = this.getTeslaPassiveLoadoutPool();
        if (!pool.length) {
            this.teslaLoadoutOfferIds = [];
            return;
        }
        const copy = [...pool];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = copy[i];
            copy[i] = copy[j];
            copy[j] = t;
        }
        const ids = [];
        const seen = new Set();
        for (let k = 0; k < copy.length && ids.length < 3; k++) {
            const id = copy[k].id;
            if (seen.has(id)) continue;
            seen.add(id);
            ids.push(id);
        }
        this.teslaLoadoutOfferIds = ids.slice(0, 3);
    }

    /**
     * 刷新特斯拉被动候选的费用（金币）：首次 5，之后每次 +5
     * @returns {number}
     */
    getTeslaLoadoutRefreshCost() {
        return 5 + (this.teslaLoadoutRefreshCount || 0) * 5;
    }

    /**
     * 花费金币重新随机三个被动候选
     * @returns {{ ok: boolean, cost?: number, reason?: string }}
     */
    tryRefreshTeslaLoadoutOffers() {
        const cost = this.getTeslaLoadoutRefreshCost();
        if (this.coins < cost) return { ok: false, reason: 'coins', cost };
        this.coins -= cost;
        this.teslaLoadoutRefreshCount = (this.teslaLoadoutRefreshCount || 0) + 1;
        this.rollTeslaLoadoutOffers();
        return { ok: true, cost };
    }

    /**
     * 从物品池中随机生成4个不同的物品作为商店商品
     * @returns {Array} - 商店物品数组
     */
    generateShopItems() {
        if (!this.itemPool || this.itemPool.length === 0) {
            console.warn('物品池为空，无法生成商店物品');
            return [];
        }
        
        // 创建物品池的副本，避免修改原数组，并过滤不可在商店购买的物品
        const availableItems = [...this.itemPool].filter(item => {
            if (!item) return false;
            // 进化塔等不可购买物品：通过 buyable/shopVisible 标记
            if (item.buyable === false) return false;
            if (item.shopVisible === false) return false;
            // 商店仅出售「遗物」；其余道具/塔/配装仍保留在 itemPool 后台供已有存档与逻辑引用
            if (item.category !== '遗物') return false;
            return true;
        });
        const shopItems = [];
        
        // 随机选择4个不同的物品（如果物品池少于4个，则选择所有物品）
        const maxItems = Math.min(4, availableItems.length);
        for (let i = 0; i < maxItems && availableItems.length > 0; i++) {
            const randomIndex = Math.floor(Math.random() * availableItems.length);
            shopItems.push(availableItems[randomIndex]);
            // 从可用列表中移除已选择的物品，确保不重复
            availableItems.splice(randomIndex, 1);
        }
        
        return shopItems;
    }

    /**
     * 强化池：仅 category 为「强化」的条目
     * @returns {Array<Object>}
     */
    getEnhanceItemPool() {
        return (this.itemPool || []).filter(i => i && i.category === '强化');
    }

    /**
     * 随机抽取最多 4 个不同的强化项
     * @returns {Array<Object>}
     */
    rollEnhanceOffers() {
        const pool = this.getEnhanceItemPool();
        if (!pool.length) {
            console.warn('[强化] 物品池中无 category=强化 的条目');
            return [];
        }
        const copy = [...pool];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = copy[i];
            copy[i] = copy[j];
            copy[j] = t;
        }
        const n = Math.min(4, copy.length);
        return copy.slice(0, n);
    }

    /**
     * 免费刷新强化四选项
     */
    refreshEnhanceOffers() {
        this.enhanceRefreshCount = (this.enhanceRefreshCount || 0) + 1;
        this.currentEnhanceItems = this.rollEnhanceOffers();
        console.log('[强化] 已刷新选项', this.currentEnhanceItems.map(i => i.name));
    }

    /**
     * 玩家选择一项强化：应用 effects，并重新抽取下一组四选一
     * @param {number} index 0–3
     * @returns {boolean}
     */
    pickEnhanceOffer(index) {
        const list = this.currentEnhanceItems || [];
        const item = list[index];
        if (!item || !this.playerStats) {
            console.warn('[强化] 无效选项', index);
            return false;
        }
        if (item.effects) {
            this.playerStats.applyItemEffects(item, 1);
            console.log('[强化] 已选择', item.name, item.effects);
        }
        this.currentEnhanceItems = this.rollEnhanceOffers();
        return true;
    }

    /**
     * 获取当前商店刷新所需金币（首次5，之后每次+5）
     * @returns {number}
     */
    getRefreshCost() {
        return 5 + this.shopRefreshCount * 5;
    }

    /**
     * 刷新商店物品（消耗金币：首次5，每刷新一次+5）
     * @returns {boolean} - 是否刷新成功（金币不足则失败）
     */
    refreshShop() {
        const cost = this.getRefreshCost();
        if (this.coins < cost) {
            console.log(`金币不足，刷新需要 ${cost} 金币`);
            return false;
        }
        this.coins -= cost;
        this.shopRefreshCount += 1;
        this.currentShopItems = this.generateShopItems();
        console.log(`商店已刷新（消耗 ${cost} 金币），新物品:`, this.currentShopItems.map(item => item.name));
        return true;
    }

    /**
     * 免费刷新商店（不扣金币、不增加刷新次数）- 仅 Debug 用
     */
    refreshShopFree() {
        this.currentShopItems = this.generateShopItems();
        console.log('[Debug] 商店已免费刷新，新物品:', this.currentShopItems.map(item => item.name));
    }

    /**
     * 根据ID查找物品
     * @param {string} itemId - 物品ID
     * @returns {Object|null} - 物品对象
     */
    findItemById(itemId) {
        return this.itemPool.find(item => item.id === itemId) || null;
    }
    
    /**
     * 从库存中移除一个物品
     * @param {string} itemId - 物品ID
     * @returns {boolean} - 是否成功移除
     */
    removeItemFromInventory(itemId) {
        if (!this.inventory.has(itemId)) {
            return false;
        }
        
        const currentCount = this.inventory.get(itemId);
        if (currentCount <= 1) {
            this.inventory.delete(itemId);
        } else {
            this.inventory.set(itemId, currentCount - 1);
        }
        
        return true;
    }

    /**
     * 购买物品
     * @param {string} itemId - 物品ID
     * @returns {boolean} - 是否购买成功
     */
    purchaseItem(itemId) {
        // 从当前商店物品中查找
        const itemIndex = this.currentShopItems.findIndex(i => i.id === itemId);
        if (itemIndex === -1) {
            console.error('物品不存在或不在当前商店中:', itemId);
            return false;
        }

        const item = this.currentShopItems[itemIndex];

        // 二次校验：不可购买的物品不允许购买
        if (item.buyable === false || item.shopVisible === false) {
            console.warn('该物品不可购买：', item.id);
            return false;
        }

        // 检查金币是否足够
        if (this.coins < item.price) {
            console.log('金币不足，无法购买');
            return false;
        }

        // 扣除金币
        this.coins -= item.price;

        // 添加到库存
        const currentCount = this.inventory.get(itemId) || 0;
        this.inventory.set(itemId, currentCount + 1);

        // 应用道具效果到玩家属性（检查是否有 effects 字段）
        if (this.playerStats && item.effects) {
            this.playerStats.applyItemEffects(item, 1);
            console.log(`应用道具效果: ${item.name}`, item.effects);
        }

        // 从当前商店中移除该物品（购买后物品从商店消失）
        this.currentShopItems.splice(itemIndex, 1);

        console.log(`成功购买 ${item.name}，剩余金币: ${this.coins}`);
        console.log(`商店剩余物品数量: ${this.currentShopItems.length}`);
        return true;
    }

    /**
     * 获取物品持有数量
     * @param {string} itemId - 物品ID
     * @returns {number} - 持有数量
     */
    getItemCount(itemId) {
        return this.inventory.get(itemId) || 0;
    }

    /**
     * 获取总物品数量
     * @returns {number} - 总数量
     */
    getTotalItemCount() {
        let total = 0;
        this.inventory.forEach(count => {
            total += count;
        });
        return total;
    }
}

// UI管理器
class UIManager {
    constructor(gameState) {
        this.gameState = gameState;
        this.shopGrid = document.getElementById('shopGrid');
        this.inventoryList = document.getElementById('inventoryList');
        this.refreshBtn = document.getElementById('refreshBtn');
        this.coinsAmountElement = document.getElementById('coinsAmount');
        // 商店页面的玩家属性列表（游戏页面不显示玩家属性）
        this.playerStatsListShop = document.getElementById('playerStatsListShop'); // 商店页面的玩家属性列表
        this.enhanceGrid = document.getElementById('enhanceGrid');
        this.enhanceRefreshBtn = document.getElementById('enhanceRefreshBtn');
        this.enhancePlayerStatsList = document.getElementById('enhancePlayerStatsList');
    }

    /**
     * 初始化UI
     */
    init() {
        this.updateCoinsDisplay();
        this.updateRefreshButtonText();
        this.renderShop();
        this.renderInventory();
        this.renderPlayerStats();
        
        // 绑定刷新按钮事件
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => {
                this.refreshShop();
            });
        }
        if (this.enhanceRefreshBtn) {
            this.enhanceRefreshBtn.addEventListener('click', () => {
                this.gameState.refreshEnhanceOffers();
                this.renderEnhanceGrid();
                this.renderEnhancePlayerStats();
            });
        }
    }

    /**
     * 更新刷新按钮文字（显示当前刷新费用）
     */
    updateRefreshButtonText() {
        if (!this.refreshBtn) return;
        const cost = this.gameState.getRefreshCost();
        this.refreshBtn.textContent = `🔄 刷新 (${cost} 金币)`;
        this.refreshBtn.disabled = this.gameState.coins < cost;
        this.refreshBtn.title = `刷新商店物品（消耗 ${cost} 金币）`;
    }

    /**
     * 更新金币显示
     */
    updateCoinsDisplay() {
        const coins = this.gameState.coins;
        if (this.coinsAmountElement) {
            this.coinsAmountElement.textContent = coins;
        }
        this.updateRefreshButtonText();
    }

    /**
     * 渲染商店物品
     */
    renderShop() {
        if (!this.shopGrid) {
            console.error('shopGrid 元素不存在');
            return;
        }
        
        const shopItems = this.gameState.currentShopItems;
        console.log('开始渲染商店，物品数量:', shopItems.length);
        this.shopGrid.innerHTML = '';

        // 如果商店为空，显示提示
        if (shopItems.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-shop';
            emptyMessage.textContent = '商店暂无物品，点击刷新按钮获取新物品';
            this.shopGrid.appendChild(emptyMessage);
            console.log('商店为空，显示提示信息');
            return;
        }

        shopItems.forEach((item, index) => {
            console.log(`创建物品卡片 ${index + 1}:`, item.name);
            const card = this.createItemCard(item);
            if (card) {
            this.shopGrid.appendChild(card);
                console.log(`物品卡片 ${item.name} 已添加到DOM`);
            } else {
                console.error(`创建物品卡片失败: ${item.name}`);
            }
        });
        
        console.log('商店渲染完成，当前子元素数量:', this.shopGrid.children.length);
    }

    /**
     * 创建物品卡片
     * @param {Object} item - 物品数据
     * @returns {HTMLElement} - 物品卡片元素
     */
    createItemCard(item) {
        if (!item) {
            console.error('createItemCard: item 参数为空');
            return null;
        }
        
        const card = document.createElement('div');
        card.className = 'item-card';
        card.dataset.itemId = item.id;

        // 检查金币是否足够
        const hasEnoughCoins = this.gameState.coins >= item.price;
        const canPurchase = hasEnoughCoins;

        if (!canPurchase) {
            card.classList.add('disabled');
        }

        // 如果金币不足，显示提示
        let statusText = '';
        if (!hasEnoughCoins) {
            statusText = '<div class="item-status">金币不足</div>';
        }

        // 获取图标（如果JSON中没有icon字段，根据稀有度生成）
        const icon = item.icon || getIconByRarity(item.rarity);
        
        // 计算伤害信息
        const damageInfo = calculateDamage(item);
        
        // 构建伤害显示
        let damageText = '';
        if (damageInfo) {
            const damageParts = [];
            
            // 显示最终伤害（计算后的伤害）
            damageParts.push(`<span class="damage-final">伤害: ${damageInfo.finalDamage}</span>`);
            
            // 显示基础伤害
            damageParts.push(`<span class="damage-base">基础: ${damageInfo.baseDamage}</span>`);
            
            // 显示倍数加成
            const damageScalings = damageInfo.scalingInfo.filter(s => s.type === 'damage');
            if (damageScalings.length > 0) {
                const scalingTexts = damageScalings.map(s => 
                    `<span class="damage-scaling">${s.name}+${s.percentage}%</span>`
                );
                damageParts.push(`<span class="damage-bonus">加成: ${scalingTexts.join(' ')}</span>`);
            }
            
            damageText = `<div class="item-damage">${damageParts.join(' | ')}</div>`;
        }
        
        // 构建其他属性信息显示
        let attributesText = '';
        if (item.attributes) {
            const attrs = [];
            const rangeGrid = item.attributes?.rangeGrid ?? 1;
            const rangeSide = 2 * Math.max(1, Math.floor(rangeGrid)) + 1;
            attrs.push(`射程: ${rangeSide}×${rangeSide} 格`);
            if (item.attributes.attackSpeed !== undefined) {
                attrs.push(`攻速: ${item.attributes.attackSpeed}`);
            }
            if (item.attributes.health !== undefined) {
                attrs.push(`生命: ${item.attributes.health}`);
            }
            if (attrs.length > 0) {
                attributesText = `<div class="item-attributes">${attrs.join(' | ')}</div>`;
            }
        }
        
        // 构建scaling信息显示（非伤害类型的scaling，如射程、攻速等）
        let scalingText = '';
        if (damageInfo && damageInfo.scalingInfo) {
            const otherScalings = damageInfo.scalingInfo.filter(s => s.type === 'other');
            if (otherScalings.length > 0) {
                const scalingParts = otherScalings.map(s => 
                    `<span class="damage-scaling">${s.name}+${s.percentage}%</span>`
                );
                scalingText = `<div class="item-attributes">加成: ${scalingParts.join(' ')}</div>`;
            }
        }

        // 构建稀有度标签
        const rarityBadge = item.rarity ? `<div class="item-rarity rarity-${item.rarity}">${item.rarity}</div>` : '';
        
        // 构建特殊效果显示
        console.log(`物品 ${item.name} 的完整数据:`, JSON.stringify(item, null, 2));
        console.log(`物品 ${item.name} 的特殊效果:`, item.specialEffects);
        const specialEffectsText = buildSpecialEffectsHTML(item.specialEffects);
        console.log(`物品 ${item.name} 的特殊效果HTML:`, specialEffectsText);

        card.innerHTML = `
            <div class="item-icon">${icon}</div>
            ${rarityBadge}
            <div class="item-name">${item.name}</div>
            <div class="item-description">${item.description}</div>
            ${damageText}
            ${attributesText}
            ${scalingText}
            ${specialEffectsText}
            <div class="item-price">💰 ${item.price} 金币</div>
            ${statusText}
        `;

        // 添加点击事件
        card.addEventListener('click', () => {
            if (canPurchase) {
                this.handlePurchase(item.id);
            } else {
                alert('金币不足！');
            }
        });

        return card;
    }

    /**
     * 处理购买逻辑
     * @param {string} itemId - 物品ID
     */
    handlePurchase(itemId) {
        const success = this.gameState.purchaseItem(itemId);
        
        if (success) {
            // 更新金币显示
            this.updateCoinsDisplay();
            // 重新渲染商店（更新可购买状态）
            this.renderShop();
            // 更新库存显示
            this.renderInventory();
            // 更新玩家属性显示
            this.renderPlayerStats();
            
            // 如果购买的是防御塔，更新防御塔物品栏
            // 防御塔的子分类包括：箭塔、法师塔、炮塔、兵营
            const item = this.gameState.findItemById(itemId);
            const towerSubCategories = ['防御塔', '箭塔', '法师塔', '炮塔', '兵营', '英雄'];
            if (item && towerSubCategories.includes(item.category)) {
                this.updateTowerInventory();
            }
        } else {
            // 可以在这里添加购买失败的提示
            alert('购买失败！金币不足。');
        }
    }
    
    /**
     * 渲染玩家属性（仅在商店页面显示）
     */
    renderPlayerStats() {
        if (!this.gameState.playerStats) {
            console.warn('玩家属性未初始化');
            return;
        }
        
        const allStats = this.gameState.playerStats.getStatsForShopDisplay
            ? this.gameState.playerStats.getStatsForShopDisplay()
            : this.gameState.playerStats.getAllStats();
        
        // 只渲染商店页面的玩家属性
        if (this.playerStatsListShop) {
            this.renderPlayerStatsToElement(this.playerStatsListShop, allStats);
        }
    }
    
    /**
     * 将玩家属性渲染到指定元素
     * @param {HTMLElement} element - 目标元素
     * @param {Array} allStats - 所有属性数组
     */
    renderPlayerStatsToElement(element, allStats) {
        if (!element) {
            return;
        }
        
        element.innerHTML = '';
        
        if (allStats.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-stats';
            emptyMessage.textContent = '暂无属性';
            emptyMessage.style.textAlign = 'center';
            emptyMessage.style.color = '#999';
            emptyMessage.style.padding = '20px';
            element.appendChild(emptyMessage);
            return;
        }
        
        // 按照 JSON 文件的原始顺序显示（不进行任何排序）
        allStats.forEach(stat => {
            const statItem = this.createStatItem(stat);
            element.appendChild(statItem);
        });
    }
    
    /**
     * 创建属性项元素
     * @param {Object} stat - 属性对象
     * @returns {HTMLElement} - 属性项元素
     */
    createStatItem(stat) {
        const div = document.createElement('div');
        div.className = 'player-stat-item';
        
        const formattedValue = this.gameState.playerStats.formatStatValue(stat);
        let valueClass = 'player-stat-value';
        
        // 根据属性值设置样式
        if (stat.currentValue > stat.baseValue) {
            valueClass += ' positive';
        } else if (stat.currentValue < stat.baseValue) {
            valueClass += ' negative';
        } else if (stat.currentValue === 0 && stat.baseValue === 0) {
            valueClass += ' zero';
        }
        
        div.innerHTML = `
            <div class="player-stat-info">
                <div class="player-stat-icon">${stat.icon || '📊'}</div>
                <div class="player-stat-label">${stat.displayName}</div>
            </div>
            <div class="${valueClass}">${formattedValue}</div>
        `;
        
        return div;
    }

    /**
     * 渲染库存列表（仅非防御塔道具，防御塔在左侧「防御塔物品栏」显示）
     */
    renderInventory() {
        // 清空当前列表
        this.inventoryList.innerHTML = '';

        const towerCategories = ['防御塔', '箭塔', '法师塔', '炮塔', '兵营', '英雄'];
        let hasNonTower = false;

        this.gameState.inventory.forEach((count, itemId) => {
            const item = this.gameState.findItemById(itemId);
            if (item && !towerCategories.includes(item.category)) {
                hasNonTower = true;
                for (let i = 0; i < count; i++) {
                    const inventoryItem = this.createInventoryItem(item);
                    this.inventoryList.appendChild(inventoryItem);
                }
            }
        });

        if (!hasNonTower) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-inventory';
            emptyDiv.textContent = '暂无道具';
            this.inventoryList.appendChild(emptyDiv);
        }
    }

    /**
     * 刷新商店
     */
    refreshShop() {
        if (!this.gameState.refreshShop()) {
            alert(`金币不足！刷新需要 ${this.gameState.getRefreshCost()} 金币。`);
            return;
        }
        this.updateCoinsDisplay();
        this.renderShop();
        console.log('商店已刷新');
    }
    
    /**
     * 更新防御塔物品栏（游戏页 + 商店页左侧栏）
     */
    updateTowerInventory() {
        if (window.towerDefenseGame && typeof window.towerDefenseGame.renderTowerInventory === 'function') {
            window.towerDefenseGame.renderTowerInventory();
            const shopList = document.getElementById('shopTowerInventoryList');
            if (shopList) {
                window.towerDefenseGame.renderTowerInventory(shopList);
            }
            const enhList = document.getElementById('enhanceTowerInventoryList');
            if (enhList) {
                window.towerDefenseGame.renderTowerInventory(enhList);
            }
        }
    }

    /**
     * 渲染强化界面四选一（免费）
     */
    renderEnhanceGrid() {
        if (!this.enhanceGrid) return;
        const items = this.gameState.currentEnhanceItems || [];
        this.enhanceGrid.innerHTML = '';
        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-shop';
            empty.textContent = '暂无强化数据：请确认已加载 obj_list/enhance_items.json';
            this.enhanceGrid.appendChild(empty);
            return;
        }
        items.forEach((item, index) => {
            const card = this.createEnhanceCard(item, index);
            if (card) this.enhanceGrid.appendChild(card);
        });
    }

    /**
     * 强化卡片：仅「选择」按钮，不扣金币
     * @param {Object} item
     * @param {number} index
     * @returns {HTMLElement|null}
     */
    createEnhanceCard(item, index) {
        if (!item) return null;
        const card = document.createElement('div');
        card.className = 'item-card enhance-card';
        const icon = item.icon || getIconByRarity(item.rarity);
        const rarityBadge = item.rarity ? `<div class="item-rarity rarity-${item.rarity}">${item.rarity}</div>` : '';
        let effectsHtml = '';
        if (item.effects && typeof item.effects === 'object') {
            const lines = formatEffectsAsReadableLines(item.effects);
            if (lines.length > 0) {
                effectsHtml = `<div class="item-attributes enhance-effects enhance-effects-readable">${lines.map(line => `<div class="enhance-effect-line">${escapeHtml(line)}</div>`).join('')}</div>`;
            }
        }
        card.innerHTML = `
            <div class="item-icon">${icon}</div>
            ${rarityBadge}
            <div class="item-name">${item.name}</div>
            <div class="item-description">${item.description || ''}</div>
            ${effectsHtml}
            <div class="enhance-price-tag">免费</div>
            <button type="button" class="enhance-pick-btn tu-btn-primary">选择此项</button>
        `;
        const btn = card.querySelector('.enhance-pick-btn');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.gameState.pickEnhanceOffer(index)) {
                    this.renderEnhanceGrid();
                    this.renderEnhancePlayerStats();
                    this.updateTowerInventory();
                    console.log('[强化] 已应用并刷新选项');
                }
            });
        }
        return card;
    }

    /**
     * 强化页右侧玩家属性（与商店同源数据）
     */
    renderEnhancePlayerStats() {
        if (!this.enhancePlayerStatsList || !this.gameState.playerStats) return;
        const allStats = this.gameState.playerStats.getStatsForShopDisplay
            ? this.gameState.playerStats.getStatsForShopDisplay()
            : this.gameState.playerStats.getAllStats();
        this.renderPlayerStatsToElement(this.enhancePlayerStatsList, allStats);
    }

    /**
     * 打开强化页时同步刷新面板
     */
    refreshEnhancePanel() {
        this.renderEnhanceGrid();
        this.renderEnhancePlayerStats();
    }

    /**
     * 创建库存物品项
     * @param {Object} item - 物品数据
     * @param {number} count - 持有数量
     * @returns {HTMLElement} - 库存项元素
     */
    createInventoryItem(item) {
        const div = document.createElement('div');
        div.className = 'inventory-item';
        // 获取图标（如果JSON中没有icon字段，根据稀有度生成）
        const icon = item.icon || getIconByRarity(item.rarity);
        div.innerHTML = `
            <div class="inventory-item-icon">${icon}</div>
            <div class="inventory-item-info">
                <div class="inventory-item-name">${item.name}</div>
            </div>
        `;
        return div;
    }
}

// 初始化游戏
document.addEventListener('DOMContentLoaded', async () => {
    console.log('游戏初始化开始...');
    
    // 初始化页面管理器（PageManager会在构造函数中自动初始化）
    window.pageManager = new PageManager();
    console.log('页面管理器实例已创建');
    
    // 检查DOM元素是否存在
    const shopGrid = document.getElementById('shopGrid');
    const inventoryList = document.getElementById('inventoryList');
    const refreshBtn = document.getElementById('refreshBtn');
    
    if (!shopGrid) {
        console.error('错误：找不到 shopGrid 元素');
        return;
    }
    if (!inventoryList) {
        console.error('错误：找不到 inventoryList 元素');
        return;
    }
    if (!refreshBtn) {
        console.error('错误：找不到 refreshBtn 元素');
        return;
    }
    
    console.log('DOM元素检查通过');
    
    // 加载物品数据
    console.log('正在加载物品数据...');
    ITEM_POOL = await loadItemsData();
    
    // 如果加载失败，使用备用数据
    if (!ITEM_POOL || ITEM_POOL.length === 0) {
        console.warn('JSON加载失败，使用备用数据');
        ITEM_POOL = FALLBACK_ITEM_POOL;
        if (typeof window !== 'undefined') window.ITEM_POOL = ITEM_POOL;
    }
    
    if (ITEM_POOL.length === 0) {
        console.error('物品数据为空');
        shopGrid.innerHTML = '<div class="empty-shop">无法加载物品数据</div>';
        return;
    }
    
    console.log('物品池数量:', ITEM_POOL.length);
    // 供物品栏编辑器等直接使用完整池（与 gameState.itemPool 同一引用，便于新塔必现）
    if (typeof window !== 'undefined') window.ITEM_POOL = ITEM_POOL;
    
    // 应用已保存的防御塔编辑器覆盖（刷新后保留）
    applyTowerOverridesFromStorage();

    // 应用已保存的英雄编辑器覆盖（刷新后保留）
    applyHeroOverridesFromStorage();
    
    // 加载玩家属性配置
    console.log('正在加载玩家属性配置...');
    const playerStatsConfig = await loadPlayerStats();
    console.log('加载的玩家属性配置:', playerStatsConfig);
    console.log('配置类型:', Array.isArray(playerStatsConfig) ? '数组' : '对象');
    
    // 创建玩家属性管理器
    const playerStats = new PlayerStats(playerStatsConfig);
    const allStats = playerStats.getAllStats();
    console.log('玩家属性初始化完成，属性数量:', allStats.length);
    if (allStats.length > 0) {
        console.log('前3个属性:', allStats.slice(0, 3).map(s => ({id: s.id, name: s.displayName})));
    }
    
    // 创建游戏状态（传入物品池和玩家属性）
    const gameState = new GameState(ITEM_POOL, playerStats);
    // 应用已保存的物品栏覆盖（防御塔数量由物品栏编辑器保存的配置决定）
    applyInventoryOverridesFromStorage(gameState);

    // 应用已保存的英雄物品栏覆盖（英雄数量由英雄编辑器保存的配置决定）
    applyHeroInventoryOverridesFromStorage(gameState);
    applyTowerLoadoutsFromStorage(gameState);
    applyTeslaLoadoutExtrasFromStorage(gameState);
    
    // 创建UI管理器
    const uiManager = new UIManager(gameState);
    
    // 初始化UI
    uiManager.init();
    
    // 暴露给 Debug 工具栏使用（加金币后需更新商店金币显示）
    window.gameState = gameState;
    window.uiManager = uiManager;

    // 不依赖塔防 Canvas 的编辑器：在 TowerDefenseGame 构造前初始化，避免 runTowerDefense 抛错时面板无法打开
    if (window.TowerEditorPanel && typeof window.TowerEditorPanel.init === 'function') window.TowerEditorPanel.init();
    if (window.InventoryEditorPanel && typeof window.InventoryEditorPanel.init === 'function') window.InventoryEditorPanel.init();
    if (window.HeroEditorPanel && typeof window.HeroEditorPanel.init === 'function') window.HeroEditorPanel.init();
    if (window.PowerEfficiencyEditorPanel && typeof window.PowerEfficiencyEditorPanel.init === 'function') {
        window.PowerEfficiencyEditorPanel.init();
    }
    if (window.TowerLoadoutPanel && typeof window.TowerLoadoutPanel.init === 'function') window.TowerLoadoutPanel.init();
    
    // 绑定 Debug 工具栏：增加指定数量金币
    const debugCoinsInput = document.getElementById('debugCoinsInput');
    const debugAddCoinsBtn = document.getElementById('debugAddCoinsBtn');
    if (debugAddCoinsBtn && debugCoinsInput) {
        debugAddCoinsBtn.addEventListener('click', () => {
            const amount = parseInt(debugCoinsInput.value, 10) || 0;
            if (amount <= 0) return;
            gameState.coins += amount;
            uiManager.updateCoinsDisplay();
            console.log(`[Debug] 增加 ${amount} 金币，当前: ${gameState.coins}`);
        });
    }
    const debugSpiritInput = document.getElementById('debugSpiritInput');
    const debugAddSpiritBtn = document.getElementById('debugAddSpiritBtn');
    if (debugAddSpiritBtn && debugSpiritInput) {
        debugAddSpiritBtn.addEventListener('click', () => {
            const amount = parseInt(debugSpiritInput.value, 10) || 0;
            if (amount <= 0) return;
            gameState.spirit = Math.max(0, (gameState.spirit || 0) + amount);
            if (window.towerDefenseGame && typeof window.towerDefenseGame.updateSpiritUI === 'function') {
                window.towerDefenseGame.updateSpiritUI();
            } else {
                const el = document.getElementById('spiritBarValue');
                if (el) el.textContent = String(Math.floor(gameState.spirit));
            }
            console.log(`[Debug] 增加 ${amount} 灵力，当前: ${gameState.spirit}`);
        });
    }
    // 绑定 Debug：免费刷新商店
    const debugRefreshShopFreeBtn = document.getElementById('debugRefreshShopFreeBtn');
    if (debugRefreshShopFreeBtn) {
        debugRefreshShopFreeBtn.addEventListener('click', () => {
            gameState.refreshShopFree();
            uiManager.renderShop();
            uiManager.updateCoinsDisplay();
        });
    }
    // 绑定 Debug：重置商店刷新费用
    const debugResetRefreshCostBtn = document.getElementById('debugResetRefreshCostBtn');
    if (debugResetRefreshCostBtn) {
        debugResetRefreshCostBtn.addEventListener('click', () => {
            gameState.shopRefreshCount = 0;
            uiManager.updateRefreshButtonText();
            console.log('[Debug] 商店刷新费用已重置，下次刷新为 5 金币');
        });
    }
    
    /**
     * STG 右侧栏：仅展示「新属性（加成）」面板用数值（与文档「新属性」段一致）。
     * 「属性强化（道具）」属于三选一强化池，不在此列表展示。
     */
    const STG_REIMU_ASIDE_PANEL = [
        {
            title: '新属性（加成）',
            titleEn: 'Bonus Stats',
            rows: [
                { key: 'pct_hp', label: '生命值加成', labelEn: 'HP Bonus', placeholder: '0%' },
                { key: 'pct_regen', label: '生命恢复加成', labelEn: 'Regen Bonus', placeholder: '0%' },
                { key: 'pct_atk_all', label: '全攻击力加成', labelEn: 'All ATK Bonus', placeholder: '0%' },
                { key: 'pct_fire', label: '射速加成', labelEn: 'Fire Rate Bonus', placeholder: '0%' },
                { key: 'pct_bullet_spd', label: '弹速加成', labelEn: 'Bullet Speed Bonus', placeholder: '0%' },
                { key: 'pct_move_base', label: '基础移速加成', labelEn: 'Base Move Speed Bonus', placeholder: '0%' },
                { key: 'pct_ult_charge', label: '大招充能效率加成', labelEn: 'Ult Charge Bonus', placeholder: '0%' }
            ]
        }
    ];

    function renderStgReimuStatsPanelToElement(el) {
        if (!el) return;
        const useEn = window.StgUiI18n && typeof window.StgUiI18n.isEn === 'function' && window.StgUiI18n.isEn();
        el.innerHTML = '';
        STG_REIMU_ASIDE_PANEL.forEach((sec) => {
            const secEl = document.createElement('div');
            secEl.className = 'stg-stat-section';
            const h = document.createElement('div');
            h.className = 'stg-stat-section-title';
            h.textContent = useEn && sec.titleEn ? sec.titleEn : sec.title;
            secEl.appendChild(h);
            sec.rows.forEach((row) => {
                const item = document.createElement('div');
                item.className = 'player-stat-item stg-reimu-stat-row';
                item.dataset.stgStat = row.key;
                const lab = useEn && row.labelEn ? row.labelEn : row.label;
                item.innerHTML = `
            <div class="player-stat-info">
                <div class="player-stat-icon">◇</div>
                <div class="player-stat-label">${lab}</div>
            </div>
            <div class="player-stat-value stg-reimu-stat-value">${row.placeholder}</div>
        `;
                secEl.appendChild(item);
            });
            el.appendChild(secEl);
        });
    }

    function refreshStgPlayerStatsPanel() {
        const el = document.getElementById('stgPlayerStatsList');
        renderStgReimuStatsPanelToElement(el);
    }
    window.refreshStgPlayerStatsPanel = refreshStgPlayerStatsPanel;
    window.renderStgReimuStatsPanelToElement = renderStgReimuStatsPanelToElement;

    // STG 纵版射击：默认首页，使用独立画布与循环
    if (window.StgMode && typeof window.StgMode.init === 'function') {
        window.StgMode.init({ gameState, playerStats });
    }
    if (window.StgPlayerEditorPanel && typeof window.StgPlayerEditorPanel.init === 'function') {
        window.StgPlayerEditorPanel.init();
    }
    if (window.StgScenePropsEditorPanel && typeof window.StgScenePropsEditorPanel.init === 'function') {
        window.StgScenePropsEditorPanel.init();
    }
    if (window.StgWaveFormationPanel && typeof window.StgWaveFormationPanel.init === 'function') {
        window.StgWaveFormationPanel.init();
    }
    refreshStgPlayerStatsPanel();

    if (window.StgUiI18n && typeof window.StgUiI18n.init === 'function') {
        window.StgUiI18n.init();
    }

    /**
     * 塔防模式延迟初始化：仅在用户进入「塔防模式」时构造，避免与 STG 抢首屏性能
     */
    window.ensureTowerDefenseStart = function ensureTowerDefenseStart() {
        if (window._towerDefenseInitialized) return;
        const gameCanvas = document.getElementById('gameCanvas');
        if (!gameCanvas) {
            console.warn('[塔防] 未找到 #gameCanvas');
            return;
        }
        if (typeof window.TowerDefenseGame === 'undefined') {
            console.error('[塔防] TowerDefenseGame 未定义，请检查 towerDefense.js 是否已加载');
            return;
        }
        window._towerDefenseInitialized = true;
        window.towerDefenseGame = new window.TowerDefenseGame(gameCanvas, gameState, playerStats, 20, 15);
        window.towerDefenseGame.start();
        if (window.MonsterEditorPanel) window.MonsterEditorPanel.init(window.towerDefenseGame);
        if (window.MapEditorPanel) window.MapEditorPanel.init(window.towerDefenseGame);
        console.log('[塔防] 已初始化 TowerDefenseGame（延迟加载）');
        // 若当前仍在 STG 首页（例如仅从 STG 打开波次/怪物面板），暂停塔防循环避免后台空跑
        if (window.pageManager && typeof window.pageManager.getCurrentPage === 'function' &&
            window.pageManager.getCurrentPage() === 'stg') {
            window.towerDefenseGame.pause();
        }
    };

    const gameCanvas = document.getElementById('gameCanvas');
    if (!gameCanvas) {
        console.warn('未找到游戏 Canvas #gameCanvas（塔防模式需从此进入后才会运行主循环）');
    }

    // 塔防顶栏：波次阵型编辑器（与 STG 共用同一入口逻辑）
    const openWaveFormationFromTd = document.getElementById('openWaveConfigBtn');
    if (openWaveFormationFromTd) {
        openWaveFormationFromTd.addEventListener('click', () => {
            window.ensureTowerDefenseStart();
            if (window.StgWaveFormationPanel && typeof window.StgWaveFormationPanel.open === 'function') {
                window.StgWaveFormationPanel.open();
            }
        });
    }
    const stgMonBtn = document.getElementById('stgOpenMonsterEditorBtn');
    if (stgMonBtn) {
        stgMonBtn.addEventListener('click', () => {
            window.ensureTowerDefenseStart();
            if (window.MonsterEditorPanel && typeof window.MonsterEditorPanel.open === 'function') {
                window.MonsterEditorPanel.open();
            }
        });
    }
    
    console.log('游戏初始化完成！');
    console.log('初始金币:', gameState.coins);
    console.log('当前商店物品:', gameState.currentShopItems.map(item => item.name));
    console.log('商店网格子元素数量:', shopGrid.children.length);
});

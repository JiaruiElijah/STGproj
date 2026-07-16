/**
 * STG 共用：物品池、GameState、UIManager（遗物商店 / 强化四选一调试）
 * 塔防玩法与防御塔数据已移除，仅保留 STG 与英雄编辑器所需链路与 JSON。
 */

/** 缓存破坏参数：每次 fetch 时在 URL 后加 ?v=时间戳，避免浏览器缓存旧的 JSON */

/**
 * 为 URL 添加缓存破坏参数（避免 JSON 被缓存导致修改不生效）
 */
function withCacheBust(path) {
    return path + (path.includes('?') ? '&' : '?') + 'v=' + Date.now();
}

/**
 * 按 id 去重，后者覆盖前者（避免多路径重复合并等同 id 条目）
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
        hero_xp_gain_bonus: '局内经验获取加成',
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

/**
 * 将覆盖数据合并到物品池（按 id 覆盖；英雄编辑器等同用此合并逻辑）
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

/** 玩家强化物品栏本地存储：强化 id -> 数量（仅影响 category===「强化」的库存，与英雄栏独立） */
const PLAYER_ENHANCE_INVENTORY_STORAGE_KEY = 'stg_player_enhance_inventory';

/**
 * 将玩家强化物品栏覆盖应用到 gameState.inventory（仅处理物品池中的强化 id）
 * @param {Object} gameState
 * @param {Object} override id -> 非负整数
 * @param {Array} itemPool
 */
function applyEnhanceInventoryOverride(gameState, override, itemPool) {
    if (!gameState || !gameState.inventory || !itemPool) return;
    const ids = itemPool.filter((i) => i && i.category === '强化').map((i) => i.id);
    ids.forEach((id) => {
        const count =
            override && typeof override[id] === 'number' && override[id] >= 0 ? Math.floor(override[id]) : 0;
        if (count <= 0) gameState.inventory.delete(id);
        else gameState.inventory.set(id, count);
    });
}

function loadSavedEnhanceInventoryOverride() {
    try {
        const raw = localStorage.getItem(PLAYER_ENHANCE_INVENTORY_STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return data && typeof data === 'object' ? data : null;
    } catch (e) {
        console.warn('读取玩家强化物品栏失败', e);
        return null;
    }
}

function applyEnhanceInventoryOverridesFromStorage(gameState) {
    const saved = loadSavedEnhanceInventoryOverride();
    if (saved && Object.keys(saved).length > 0 && ITEM_POOL && ITEM_POOL.length > 0) {
        applyEnhanceInventoryOverride(gameState, saved, ITEM_POOL);
        console.log('已加载已保存的玩家强化物品栏');
    }
}

/** 本地自定义强化道具（合并入物品池，同 id 覆盖 JSON 默认） */
const ENHANCE_ITEMS_CUSTOM_KEY = 'stg_enhance_items_custom';

function loadEnhanceItemsCustom() {
    try {
        const raw = localStorage.getItem(ENHANCE_ITEMS_CUSTOM_KEY);
        if (!raw) return [];
        const data = JSON.parse(raw);
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.warn('读取自定义强化列表失败', e);
        return [];
    }
}

/**
 * 将本地保存的强化条目合并进物品池（category 强制为「强化」）
 * @param {Array} itemPool
 */
function mergeEnhanceCustomIntoPool(itemPool) {
    if (!itemPool || !Array.isArray(itemPool)) return;
    const custom = loadEnhanceItemsCustom();
    if (!custom.length) return;
    const indexById = new Map();
    for (let i = 0; i < itemPool.length; i++) {
        const it = itemPool[i];
        if (it && it.id != null) indexById.set(String(it.id), i);
    }
    let nAdd = 0;
    let nUp = 0;
    custom.forEach((raw) => {
        if (!raw || raw.id == null || String(raw.id).trim() === '') return;
        const it = { ...raw };
        it.id = String(it.id).trim();
        it.category = '强化';
        if (!it.effects || typeof it.effects !== 'object') it.effects = {};
        if (it.name == null) it.name = it.id;
        if (indexById.has(it.id)) {
            const idx = indexById.get(it.id);
            itemPool[idx] = { ...itemPool[idx], ...it };
            nUp++;
        } else {
            itemPool.push(it);
            indexById.set(it.id, itemPool.length - 1);
            nAdd++;
        }
    });
    console.log('[强化] 已合并本地自定义：新增', nAdd, '条，覆盖', nUp, '条');
}

// 供英雄编辑器等调用
if (typeof window !== 'undefined') {
    window.applyTowerOverrides = applyTowerOverrides;
    window.applyHeroOverrides = applyHeroOverrides;
    window.loadSavedHeroOverrides = loadSavedHeroOverrides;
    window.HERO_OVERRIDES_STORAGE_KEY = HERO_OVERRIDES_STORAGE_KEY;
    window.applyHeroInventoryOverride = applyHeroInventoryOverride;
    window.loadSavedHeroInventoryOverride = loadSavedHeroInventoryOverride;
    window.HERO_INVENTORY_OVERRIDE_STORAGE_KEY = HERO_INVENTORY_OVERRIDE_STORAGE_KEY;
    window.ENHANCE_ITEMS_CUSTOM_KEY = ENHANCE_ITEMS_CUSTOM_KEY;
    window.loadEnhanceItemsCustom = loadEnhanceItemsCustom;
    window.mergeEnhanceCustomIntoPool = mergeEnhanceCustomIntoPool;
    window.PLAYER_ENHANCE_INVENTORY_STORAGE_KEY = PLAYER_ENHANCE_INVENTORY_STORAGE_KEY;
    window.applyEnhanceInventoryOverride = applyEnhanceInventoryOverride;
    window.loadSavedEnhanceInventoryOverride = loadSavedEnhanceInventoryOverride;
    /** 供玩家强化物品栏等展示与前台一致的 effects 文案 */
    window.formatEffectsAsReadableLines = formatEffectsAsReadableLines;
}

/**
 * 加载物品数据
 * @returns {Promise<Array>} - 物品数组
 */
async function loadItemsData() {
    /** STG 主数据：道具 + 英雄等同在 item.json，不再加载各防御塔分表 */
    const itemPaths = ['../obj_list/item.json', 'obj_list/item.json'];
    let allItems = [];
    for (let p = 0; p < itemPaths.length; p++) {
        const itemFile = itemPaths[p];
        try {
            const response = await fetch(withCacheBust(itemFile));
            if (!response.ok) {
                console.warn(`路径 ${itemFile} 返回状态码: ${response.status}`);
                continue;
            }
            const data = await response.json();
            if (Array.isArray(data)) {
                allItems = allItems.concat(data);
                console.log(`成功从 ${itemFile} 加载 ${data.length} 条（道具/英雄等）`);
            } else {
                allItems.push(data);
            }
            break;
        } catch (error) {
            console.warn(`路径 ${itemFile} 加载失败:`, error.message);
        }
    }

    // 局外 meta：category=「强化」的道具（playerStats 叠加；玩家强化物品栏等）。与 STG 局内三选一（stgMode.js STG_UPGRADE_POOL）不是同一数据源。
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
    
    if (allItems.length === 0) {
        console.log('尝试备用路径（仅 item / 强化 / 遗物）...');
        const alternativePaths = [
            'obj_list/item.json',
            'obj_list/enhance_items.json',
            'obj_list/relics.json'
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
    console.log(`[物品池] 去重后共 ${allItems.length} 条`);
    
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

/** HTTP 全失败时的兜底：至少含一条「英雄」供 STG / 英雄编辑器使用 */
const FALLBACK_ITEM_POOL = [
    {
        id: 'hero_soldier',
        name: '英雄战士',
        icon: '🛡️',
        category: '英雄',
        rarity: '普通',
        attributes: {
            baseAttack: 12,
            attackSpeed: 6,
            rangeGrid: 1,
            health: 80,
            powerGainPerHit: 1
        },
        scaling: { physical_damage: 0.3 },
        price: 120,
        description: '兜底英雄（请改用 obj_list/item.json）'
    }
];

// 游戏状态管理
class GameState {
    constructor(itemPool, playerStats) {
        // 玩家金币（初始值）
        this.coins = 100;
        // 玩家持有的物品（使用Map存储，key为物品id，value为数量）
        this.inventory = new Map();
        // 初始库存：至少解锁池中第一个英雄（数量由英雄编辑器覆盖可改）
        const firstHero = itemPool && itemPool.find(i => i && i.category === '英雄');
        if (firstHero) {
            this.inventory.set(firstHero.id, 1);
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
        /** 灵力：与波次奖励、Debug 等共用 */
        this.spirit = 40;
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
            // 商店仅出售「遗物」；其余条目仍保留在 itemPool 供逻辑引用
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
     * 渲染隐藏桩库存列表（排除英雄/塔类分类，英雄由英雄编辑器管理）
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
    
    /** 塔防已移除，保留空方法避免旧调用处报错 */
    updateTowerInventory() {}

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

    /** 若 game_demo 下存在 stgBundledLocalStorage.json，先于物品池/英雄覆盖写入 localStorage */
    if (typeof window.applyStgBundledLocalStorageFromFetch === 'function') {
        await window.applyStgBundledLocalStorageFromFetch();
    }

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
    mergeEnhanceCustomIntoPool(ITEM_POOL);
    // 全局供英雄/怪物编辑器等使用（与 gameState.itemPool 同一引用）
    if (typeof window !== 'undefined') window.ITEM_POOL = ITEM_POOL;
    
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
    // 英雄物品栏数量（英雄编辑器存档）
    applyHeroInventoryOverridesFromStorage(gameState);
    // 玩家持有的强化道具（与道具池定义无关，仅改 inventory 中强化 id 数量）
    applyEnhanceInventoryOverridesFromStorage(gameState);

    // 创建UI管理器
    const uiManager = new UIManager(gameState);
    
    // 初始化UI
    uiManager.init();
    
    // 暴露给 Debug 工具栏使用（加金币后需更新商店金币显示）
    window.gameState = gameState;
    window.uiManager = uiManager;

    // 英雄 / 怪物编辑器不依赖塔防 Canvas（塔防脚本已移除）
    if (window.HeroEditorPanel && typeof window.HeroEditorPanel.init === 'function') window.HeroEditorPanel.init();
    if (window.StgBuildInventoryPanel && typeof window.StgBuildInventoryPanel.init === 'function') {
        window.StgBuildInventoryPanel.init();
    }
    if (window.MonsterEditorPanel && typeof window.MonsterEditorPanel.init === 'function') {
        window.MonsterEditorPanel.init(null);
    }
    if (window.BossEditorPanel && typeof window.BossEditorPanel.init === 'function') {
        window.BossEditorPanel.init();
    }

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
            const el = document.getElementById('spiritBarValue');
            if (el) el.textContent = String(Math.floor(gameState.spirit));
            console.log(`[Debug] 增加 ${amount} 灵力，当前: ${gameState.spirit}`);
        });
    }
    
    /**
     * STG 右侧「属性加成」列表：与《新玩法--STG模式》基础道具展示一致（7 行）。
     * 基础道具1 为「整格」累加；基础道具7/9 仍由 stgMode 叠乘局内数值，但不在此列表展示。
     */
    const STG_REIMU_ASIDE_PANEL = [
        {
            title: '属性加成',
            titleEn: 'Stat bonuses',
            rows: [
                {
                    key: 'hp_cells_stat',
                    label: '额外生命格（基础道具1）',
                    labelEn: 'Extra life cells (stat 1)',
                    placeholder: '—'
                },
                { key: 'pct_regen', label: '生命恢复加成', labelEn: 'Regen bonus', placeholder: '0%' },
                { key: 'pct_atk_all', label: '全攻击力加成', labelEn: 'All ATK bonus', placeholder: '0%' },
                { key: 'pct_graze', label: '擦弹收益加成', labelEn: 'Graze bonus', placeholder: '0%' },
                { key: 'pct_fire', label: '射速加成', labelEn: 'Fire rate bonus', placeholder: '0%' },
                { key: 'pct_bullet_spd', label: '弹速加成', labelEn: 'Bullet speed bonus', placeholder: '0%' },
                { key: 'pct_move_base', label: '移速（普通）加成', labelEn: 'Move speed (spread) bonus', placeholder: '0%' }
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

    /** 右侧「博丽灵梦 · 属性加成」折叠状态，写入 localStorage 以便刷新后保持 */
    const STG_ASIDE_COLLAPSED_KEY = 'stg_reimu_aside_collapsed';

    function readStgPlayerAsideCollapsed() {
        try {
            return localStorage.getItem(STG_ASIDE_COLLAPSED_KEY) === '1';
        } catch (e) {
            return false;
        }
    }

    /**
     * @param {boolean} collapsed true 时仅显示竖排「显示属性」按钮，主面板隐藏
     */
    function applyStgPlayerAsideCollapsed(collapsed) {
        const aside = document.getElementById('stgPlayerAside');
        if (!aside) return;
        aside.classList.toggle('stg-player-aside--collapsed', collapsed);
        try {
            localStorage.setItem(STG_ASIDE_COLLAPSED_KEY, collapsed ? '1' : '0');
        } catch (e) {
            /* ignore */
        }
        aside.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        /** 侧栏宽度变化后触发 STG 内 resize 监听，让棋盘吃满新横向空间 */
        requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
        });
    }

    function applyStgAsideToggleLabels() {
        if (!window.StgUiI18n || typeof window.StgUiI18n.t !== 'function') return;
        const t = window.StgUiI18n.t.bind(window.StgUiI18n);
        const hideBtn = document.getElementById('stgAsideHideBtn');
        const showBtn = document.getElementById('stgAsideShowBtn');
        if (hideBtn) {
            hideBtn.textContent = t('aside.hideStats');
            hideBtn.setAttribute('title', t('aside.hideStatsTitle'));
        }
        if (showBtn) {
            showBtn.textContent = t('aside.showStats');
            showBtn.setAttribute('title', t('aside.showStatsTitle'));
        }
    }
    window.applyStgAsideToggleLabels = applyStgAsideToggleLabels;
    window.applyStgPlayerAsideCollapsed = applyStgPlayerAsideCollapsed;

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
    (function initStgChapterEditorPanel() {
        const panel = document.getElementById('stgChapterEditorPanel');
        const inp = document.getElementById('stgChapterEditorCountInput');
        const closeBtn = document.getElementById('stgChapterEditorCloseBtn');
        const applyBtn = document.getElementById('stgChapterEditorApplyBtn');
        const openBtn = document.getElementById('stgOpenChapterEditorBtn');
        function open() {
            if (inp && window.StgWaveFormationPanel && typeof window.StgWaveFormationPanel.syncChapterEditorInput === 'function') {
                window.StgWaveFormationPanel.syncChapterEditorInput(inp);
            }
            if (panel) panel.classList.remove('hidden');
        }
        function close() {
            if (panel) panel.classList.add('hidden');
        }
        if (openBtn) openBtn.addEventListener('click', open);
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (panel) {
            panel.addEventListener('click', (e) => {
                if (e.target === panel) close();
            });
        }
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                const n = inp ? parseInt(String(inp.value), 10) : 1;
                if (window.StgWaveFormationPanel && typeof window.StgWaveFormationPanel.setChapterCount === 'function') {
                    const ok = window.StgWaveFormationPanel.setChapterCount(n, false);
                    if (ok !== false) close();
                }
            });
        }
    })();
    if (window.StgTextureEditorPanel && typeof window.StgTextureEditorPanel.init === 'function') {
        window.StgTextureEditorPanel.init();
    }
    applyStgPlayerAsideCollapsed(readStgPlayerAsideCollapsed());
    refreshStgPlayerStatsPanel();

    if (window.StgUiI18n && typeof window.StgUiI18n.init === 'function') {
        window.StgUiI18n.init();
    }

    (function initStgAsideToggle() {
        const hideBtn = document.getElementById('stgAsideHideBtn');
        const showBtn = document.getElementById('stgAsideShowBtn');
        if (hideBtn) {
            hideBtn.addEventListener('click', () => applyStgPlayerAsideCollapsed(true));
        }
        if (showBtn) {
            showBtn.addEventListener('click', () => applyStgPlayerAsideCollapsed(false));
        }
    })();

    const stgMonBtn = document.getElementById('stgOpenMonsterEditorBtn');
    if (stgMonBtn) {
        stgMonBtn.addEventListener('click', () => {
            if (window.MonsterEditorPanel && typeof window.MonsterEditorPanel.open === 'function') {
                window.MonsterEditorPanel.open();
            }
        });
    }
    const stgBossBtn = document.getElementById('stgOpenBossEditorBtn');
    if (stgBossBtn) {
        stgBossBtn.addEventListener('click', () => {
            if (window.BossEditorPanel && typeof window.BossEditorPanel.open === 'function') {
                window.BossEditorPanel.open();
            }
        });
    }
    const stgTexBtn = document.getElementById('stgOpenTextureEditorBtn');
    if (stgTexBtn) {
        stgTexBtn.addEventListener('click', () => {
            if (window.StgTextureEditorPanel && typeof window.StgTextureEditorPanel.open === 'function') {
                window.StgTextureEditorPanel.open();
            }
        });
    }
    
    console.log('游戏初始化完成！');
    console.log('初始金币:', gameState.coins);
    console.log('当前商店物品:', gameState.currentShopItems.map(item => item.name));
    console.log('商店网格子元素数量:', shopGrid.children.length);
});

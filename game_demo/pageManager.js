/**
 * 页面管理器
 * 负责 STG 首页、塔防主页面、商店与强化页之间的切换
 */
class PageManager {
    constructor() {
        // 页面元素
        this.stgPage = null;
        this.shopPage = null;
        this.gamePage = null;
        
        // 按钮元素
        this.openShopBtn = null;
        this.closeShopBtn = null;
        
        // 当前页面状态：'stg' | 'game' | 'shop' | 'enhance'
        this.currentPage = 'stg';
        
        // 等待DOM加载完成后再初始化
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => this.init(), 100);
            });
        } else {
            // DOM已经加载完成，延迟一点确保所有元素都已渲染
            setTimeout(() => this.init(), 100);
        }
    }
    
    /**
     * 初始化DOM元素引用
     */
    initElements() {
        this.stgPage = document.getElementById('stgPage');
        this.shopPage = document.getElementById('shopPage');
        this.gamePage = document.getElementById('gamePage');
        this.enhancePage = document.getElementById('enhancePage');
        this.openShopBtn = document.getElementById('openShopBtn');
        this.closeShopBtn = document.getElementById('closeShopBtn');
        this.openEnhanceBtn = document.getElementById('openEnhanceBtn');
        this.closeEnhanceBtn = document.getElementById('closeEnhanceBtn');
        
        console.log('元素查找结果:', {
            stgPage: !!this.stgPage,
            shopPage: !!this.shopPage,
            gamePage: !!this.gamePage,
            enhancePage: !!this.enhancePage,
            openShopBtn: !!this.openShopBtn,
            closeShopBtn: !!this.closeShopBtn
        });
    }
    
    /**
     * 初始化页面管理器
     */
    init() {
        // 先获取元素
        this.initElements();
        
        if (!this.stgPage && !this.gamePage) {
            console.error('页面元素未找到：需要 #stgPage 或 #gamePage');
            return;
        }
        
        // 绑定按钮事件 - 使用更直接的方式
        if (this.openShopBtn) {
            // 移除可能存在的旧事件监听器
            const newOpenBtn = this.openShopBtn.cloneNode(true);
            this.openShopBtn.parentNode.replaceChild(newOpenBtn, this.openShopBtn);
            this.openShopBtn = newOpenBtn;
            
            this.openShopBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('打开商店按钮被点击');
                this.openShop();
                return false;
            };
        } else {
            console.error('openShopBtn 元素未找到');
        }
        
        if (this.closeShopBtn) {
            // 移除可能存在的旧事件监听器
            const newCloseBtn = this.closeShopBtn.cloneNode(true);
            this.closeShopBtn.parentNode.replaceChild(newCloseBtn, this.closeShopBtn);
            this.closeShopBtn = newCloseBtn;
            
            this.closeShopBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('关闭商店按钮被点击');
                this.closeShop();
                return false;
            };
        } else {
            console.error('closeShopBtn 元素未找到');
        }

        if (this.openEnhanceBtn) {
            const btn = this.openEnhanceBtn.cloneNode(true);
            this.openEnhanceBtn.parentNode.replaceChild(btn, this.openEnhanceBtn);
            this.openEnhanceBtn = btn;
            this.openEnhanceBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openEnhance();
                return false;
            };
        }
        if (this.closeEnhanceBtn) {
            const btn = this.closeEnhanceBtn.cloneNode(true);
            this.closeEnhanceBtn.parentNode.replaceChild(btn, this.closeEnhanceBtn);
            this.closeEnhanceBtn = btn;
            this.closeEnhanceBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.closeEnhance();
                return false;
            };
        }

        const enterTd = document.getElementById('enterTowerDefenseModeBtn');
        if (enterTd) {
            enterTd.onclick = (e) => {
                e.preventDefault();
                if (typeof window.ensureTowerDefenseStart === 'function') {
                    window.ensureTowerDefenseStart();
                }
                this.showTowerDefensePage();
                return false;
            };
        }
        const backStg = document.getElementById('backToStgBtn');
        if (backStg) {
            backStg.onclick = (e) => {
                e.preventDefault();
                this.showStgPage();
                return false;
            };
        }
        
        // 默认：STG 首页；塔防在 #gamePage 内，初始隐藏
        this.showStgPage();
        
        console.log('页面管理器初始化完成');
        console.log('当前页面:', this.currentPage);
    }
    
    /**
     * 打开商店页面
     */
    openShop() {
        if (this.currentPage === 'shop') {
            console.log('已经在商店页面');
            return; // 已经在商店页面
        }
        
        console.log('正在切换到商店页面...');
        
        if (this.stgPage) {
            this.stgPage.classList.remove('active');
            this.stgPage.classList.add('hidden');
        }
        if (this.gamePage) {
            this.gamePage.classList.remove('active');
            this.gamePage.classList.add('hidden');
        }
        if (this.enhancePage) {
            this.enhancePage.classList.add('hidden');
            this.enhancePage.classList.remove('active');
        }
        
        // 显示商店页面
        if (this.shopPage) {
            this.shopPage.classList.remove('hidden');
            this.shopPage.classList.add('active');
        }
        
        // 刷新商店页左侧防御塔栏，与当前持有一致
        const shopTowerList = document.getElementById('shopTowerInventoryList');
        if (window.towerDefenseGame && typeof window.towerDefenseGame.renderTowerInventory === 'function' && shopTowerList) {
            window.towerDefenseGame.renderTowerInventory(shopTowerList);
        }
        
        this.currentPage = 'shop';
        console.log('已切换到商店页面，当前状态:', {
            gamePage: this.gamePage?.classList.toString(),
            shopPage: this.shopPage?.classList.toString()
        });
    }
    
    /**
     * 关闭商店页面，返回游戏页面
     */
    closeShop() {
        if (this.currentPage === 'game') {
            console.log('已经在游戏页面');
            return; // 已经在游戏页面
        }
        
        console.log('正在切换到游戏页面...');
        
        // 隐藏商店页面
        if (this.shopPage) {
            this.shopPage.classList.remove('active');
            this.shopPage.classList.add('hidden');
        }
        if (this.enhancePage) {
            this.enhancePage.classList.add('hidden');
            this.enhancePage.classList.remove('active');
        }
        
        this.showTowerDefensePage();
        
        console.log('已切换到游戏页面（塔防），当前状态:', {
            gamePage: this.gamePage?.classList.toString(),
            shopPage: this.shopPage?.classList.toString()
        });
    }

    /**
     * 打开强化页面（布局类似商店，免费四选一）
     */
    openEnhance() {
        if (this.currentPage === 'enhance') return;
        console.log('正在切换到强化页面...');
        if (this.stgPage) {
            this.stgPage.classList.remove('active');
            this.stgPage.classList.add('hidden');
        }
        if (this.gamePage) {
            this.gamePage.classList.remove('active');
            this.gamePage.classList.add('hidden');
        }
        if (this.shopPage) {
            this.shopPage.classList.remove('active');
            this.shopPage.classList.add('hidden');
        }
        if (this.enhancePage) {
            this.enhancePage.classList.remove('hidden');
            this.enhancePage.classList.add('active');
        }
        if (window.uiManager && typeof window.uiManager.refreshEnhancePanel === 'function') {
            window.uiManager.refreshEnhancePanel();
        }
        const enhList = document.getElementById('enhanceTowerInventoryList');
        if (window.towerDefenseGame && typeof window.towerDefenseGame.renderTowerInventory === 'function' && enhList) {
            window.towerDefenseGame.renderTowerInventory(enhList);
        }
        this.currentPage = 'enhance';
    }

    /**
     * 关闭强化页面，返回游戏
     */
    closeEnhance() {
        if (this.currentPage !== 'enhance') return;
        if (this.enhancePage) {
            this.enhancePage.classList.remove('active');
            this.enhancePage.classList.add('hidden');
        }
        this.showTowerDefensePage();
        console.log('已关闭强化页面');
    }
    
    /**
     * 显示 STG 纵版射击首页
     */
    showStgPage() {
        if (this.stgPage) {
            this.stgPage.classList.add('active');
            this.stgPage.classList.remove('hidden');
        }
        if (this.gamePage) {
            this.gamePage.classList.remove('active');
            this.gamePage.classList.add('hidden');
        }
        if (this.shopPage) {
            this.shopPage.classList.add('hidden');
            this.shopPage.classList.remove('active');
        }
        if (this.enhancePage) {
            this.enhancePage.classList.add('hidden');
            this.enhancePage.classList.remove('active');
        }
        if (window.towerDefenseGame && typeof window.towerDefenseGame.pause === 'function') {
            window.towerDefenseGame.pause();
        }
        if (window.StgMode && typeof window.StgMode.resume === 'function') {
            window.StgMode.resume();
        }
        this.currentPage = 'stg';
        console.log('[页面] 已切换到 STG 纵版射击');
    }

    /**
     * 显示塔防主玩法页面（旧版主界面）
     */
    showTowerDefensePage() {
        if (this.stgPage) {
            this.stgPage.classList.remove('active');
            this.stgPage.classList.add('hidden');
        }
        if (this.gamePage) {
            this.gamePage.classList.add('active');
            this.gamePage.classList.remove('hidden');
        }
        if (this.shopPage) {
            this.shopPage.classList.add('hidden');
            this.shopPage.classList.remove('active');
        }
        if (this.enhancePage) {
            this.enhancePage.classList.add('hidden');
            this.enhancePage.classList.remove('active');
        }
        if (window.StgMode && typeof window.StgMode.pause === 'function') {
            window.StgMode.pause();
        }
        if (window.towerDefenseGame && typeof window.towerDefenseGame.resume === 'function') {
            window.towerDefenseGame.resume();
        }
        this.currentPage = 'game';
        console.log('[页面] 已切换到塔防模式');
    }

    /** @deprecated 使用 showTowerDefensePage */
    showGamePage() {
        this.showTowerDefensePage();
    }
    
    /**
     * 获取当前页面
     * @returns {string} - 'stg' | 'game' | 'shop' | 'enhance'
     */
    getCurrentPage() {
        return this.currentPage;
    }
}

// 导出供其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PageManager;
}

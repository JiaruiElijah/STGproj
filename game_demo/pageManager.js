/**
 * 页面管理器（STG 专用）
 * 旧塔防/商店/强化整页已移除，仅保留 STG 首页状态与 StgMode 协同。
 */
class PageManager {
    constructor() {
        this.stgPage = null;
        /** @type {'stg'} */
        this.currentPage = 'stg';

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => this.init(), 100);
            });
        } else {
            setTimeout(() => this.init(), 100);
        }
    }

    initElements() {
        this.stgPage = document.getElementById('stgPage');
    }

    init() {
        this.initElements();
        if (!this.stgPage) {
            console.error('[PageManager] 未找到 #stgPage');
            return;
        }
        this.showStgPage();
        console.log('[PageManager] 初始化完成（仅 STG）');
    }

    /**
     * 显示 STG 纵版射击首页（唯一主界面）
     */
    showStgPage() {
        if (this.stgPage) {
            this.stgPage.classList.add('active');
            this.stgPage.classList.remove('hidden');
        }
        if (window.StgMode && typeof window.StgMode.resume === 'function') {
            window.StgMode.resume();
        }
        this.currentPage = 'stg';
        console.log('[页面] 当前：STG');
    }

    /**
     * @returns {'stg'}
     */
    getCurrentPage() {
        return this.currentPage;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PageManager;
}

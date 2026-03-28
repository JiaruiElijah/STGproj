# -*- coding: utf-8 -*-
"""Remove tower defense HTML block from index.html; insert economy DOM stub for game.js."""
from pathlib import Path

p = Path(__file__).with_name("index.html")
t = p.read_text(encoding="utf-8")
start = t.find("    <!-- 游戏主页面（塔防，由按钮呼出） -->")
end = t.find("    <!-- 怪物编辑器弹窗 -->")
if start < 0 or end < 0 or end <= start:
    raise SystemExit(f"markers not found: start={start} end={end}")

stub = """    <!-- 隐藏桩：供 game.js 初始化物品池 / GameState / UIManager（已移除塔防与商店页） -->
    <div id="gameEconomyDomStub" class="hidden" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;" aria-hidden="true">
        <div class="shop-grid" id="shopGrid"></div>
        <div class="inventory-list" id="inventoryList"></div>
        <button type="button" id="refreshBtn"></button>
        <span id="coinsAmount">0</span>
        <div id="playerStatsListShop"></div>
        <div id="enhanceGrid"></div>
        <button type="button" id="enhanceRefreshBtn"></button>
        <div id="enhancePlayerStatsList"></div>
    </div>

"""

out = t[:start] + stub + t[end:]
p.write_text(out, encoding="utf-8")
print("written", len(out), "bytes")

// PromptGlass - Stats Module
// Injects script into page context and listens for stats updates

// Inject the interceptor into the page context
function injectScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('src/injected.js');
    script.onload = function () {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
}

// Run injection immediately
injectScript();

// Stats storage
let stats = {
    inputTokens: 0,
    outputTokens: 0,
    totalCost: 0,
    powDifficulty: 'N/A',
    persona: 'N/A',
    status: 'unknown'
};

// Listen for stats updates from injected script
window.addEventListener('promptglass-stats-update', function (e) {
    stats.powDifficulty = e.detail.powDifficulty;
    stats.persona = e.detail.persona;
    stats.status = e.detail.status;
    updateStatsDisplay();
});

// Update the stats display
function updateStatsDisplay() {
    const statsEl = document.getElementById('aph-stats');
    if (!statsEl) return;

    const statusColors = {
        'good': '#30d158',
        'warning': '#ff9f0a',
        'degraded': '#ff453a',
        'unknown': '#8e8e93'
    };
    const color = statusColors[stats.status] || statusColors.unknown;

    // Format PoW display
    let powDisplay = 'N/A';
    if (stats.powDifficulty !== 'N/A') {
        powDisplay = stats.powDifficulty.replace('0x', '').substring(0, 6);
    }

    // Format persona
    let personaDisplay = '?';
    if (stats.persona !== 'N/A') {
        personaDisplay = stats.persona.toLowerCase().includes('chatgpt-paid') ? '⭐' :
            stats.persona.toLowerCase().includes('free') ? '○' :
                stats.persona.substring(0, 4);
    }

    statsEl.innerHTML = `
        <span class="aph-status-dot" style="background:${color}" title="Status: ${stats.status}"></span>
        <span title="Account: ${stats.persona}">${personaDisplay}</span>
        <span title="PoW: ${stats.powDifficulty}">${powDisplay}</span>
        <span title="Input tokens">↑${stats.inputTokens}</span>
        <span title="Output tokens">↓${stats.outputTokens}</span>
        <span title="Cost">$${stats.totalCost.toFixed(4)}</span>
    `;
}

// Export
window.PromptGlassStats = {
    init: function () { },
    getStats: () => stats,
    updateDisplay: updateStatsDisplay
};

console.log('%c🚀 PromptGlass stats.js loaded', 'color: #00d4ff;');

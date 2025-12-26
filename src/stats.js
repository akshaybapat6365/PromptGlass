// PromptGlass - Service Quality Monitor
// Based on working implementation from chatgpt-degrade-checker

// Stats tracking
let stats = {
    inputTokens: 0,
    outputTokens: 0,
    totalCost: 0,
    responseTime: 0,
    promptCount: 0,
    currentModel: 'unknown',
    // Service quality (from /sentinel/chat-requirements)
    powDifficulty: 'N/A',
    persona: 'N/A',        // Account type: plus, free, etc.
    serviceStatus: 'unknown'
};

// Model pricing (per 1M tokens)
const MODEL_PRICING = {
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'gpt-4': { input: 30.00, output: 60.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
    'o1': { input: 15.00, output: 60.00 },
    'o1-mini': { input: 3.00, output: 12.00 },
    'default': { input: 2.50, output: 10.00 }
};

function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

function calculateCost(inputTokens, outputTokens, model) {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];
    const inputCost = (inputTokens / 1000000) * pricing.input;
    const outputCost = (outputTokens / 1000000) * pricing.output;
    return inputCost + outputCost;
}

// Determine service status from PoW difficulty
function evaluatePowDifficulty(difficulty) {
    if (difficulty === 'N/A') return { status: 'unknown', color: '#888' };

    const cleanDiff = difficulty.replace('0x', '').replace(/^0+/, '');
    const hexLength = cleanDiff.length;

    if (hexLength <= 2) {
        return { status: 'degraded', color: '#ff453a', label: 'High Risk' };
    } else if (hexLength === 3) {
        return { status: 'warning', color: '#ff9f0a', label: 'Medium' };
    } else if (hexLength === 4) {
        return { status: 'good', color: '#30d158', label: 'Good' };
    } else {
        return { status: 'excellent', color: '#30d158', label: 'Excellent' };
    }
}

// Main fetch interceptor
function setupFetchInterceptor() {
    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
        const [resource, options] = args;
        const urlStr = typeof resource === 'string' ? resource : resource.toString();

        // CRITICAL: Intercept /sentinel/chat-requirements for PoW and persona
        if ((urlStr.includes('/backend-api/sentinel/chat-requirements') ||
            urlStr.includes('backend-anon/sentinel/chat-requirements')) &&
            options?.method === 'POST') {

            const response = await originalFetch.apply(this, args);

            try {
                const cloned = response.clone();
                const data = await cloned.json();

                // Extract PoW difficulty
                stats.powDifficulty = data.proofofwork?.difficulty || 'N/A';

                // Extract persona (account type)
                stats.persona = data.persona || 'N/A';

                // Evaluate service status
                const evaluation = evaluatePowDifficulty(stats.powDifficulty);
                stats.serviceStatus = evaluation.status;

                console.log(`PromptGlass: PoW=${stats.powDifficulty}, Persona=${stats.persona}, Status=${stats.serviceStatus}`);

                // Update UI
                updateStatsDisplay();
            } catch (e) {
                console.error('PromptGlass: Error parsing sentinel response', e);
            }

            return response;
        }

        // Intercept conversation for token counting
        if (urlStr.includes('backend-api/conversation')) {
            const startTime = Date.now();

            try {
                if (options?.body) {
                    const payload = JSON.parse(options.body);
                    let promptText = '';
                    if (payload.messages) {
                        promptText = payload.messages.map(m => m.content?.parts?.[0] || m.content || '').join(' ');
                    }
                    stats.inputTokens += estimateTokens(promptText);
                    stats.promptCount++;
                    if (payload.model) stats.currentModel = payload.model;
                }
            } catch (e) { }

            const response = await originalFetch.apply(this, args);
            stats.responseTime = Date.now() - startTime;

            try {
                const cloned = response.clone();
                const text = await cloned.text();
                stats.outputTokens += estimateTokens(text);
                stats.totalCost = calculateCost(stats.inputTokens, stats.outputTokens, stats.currentModel);
                updateStatsDisplay();
            } catch (e) { }

            return response;
        }

        return originalFetch.apply(this, args);
    };

    console.log('PromptGlass: Fetch interceptor active (monitoring /sentinel/chat-requirements)');
}

// Update the stats display
function updateStatsDisplay() {
    const statsEl = document.getElementById('aph-stats');
    if (!statsEl) return;

    const evaluation = evaluatePowDifficulty(stats.powDifficulty);

    // Format persona display
    let personaDisplay = '?';
    if (stats.persona !== 'N/A') {
        personaDisplay = stats.persona.toLowerCase().includes('plus') ? '⭐' :
            stats.persona.toLowerCase().includes('free') ? '○' :
                stats.persona.substring(0, 4);
    }

    // Format PoW display
    let powDisplay = 'N/A';
    if (stats.powDifficulty !== 'N/A') {
        const cleanDiff = stats.powDifficulty.replace('0x', '');
        powDisplay = cleanDiff.substring(0, 4);
    }

    statsEl.innerHTML = `
    <span class="aph-status-dot" style="background:${evaluation.color}" title="Service: ${evaluation.label || stats.serviceStatus}"></span>
    <span title="Account: ${stats.persona}">${personaDisplay}</span>
    <span title="PoW: ${stats.powDifficulty}">${powDisplay}</span>
    <span title="Input tokens">↑${formatNumber(stats.inputTokens)}</span>
    <span title="Output tokens">↓${formatNumber(stats.outputTokens)}</span>
    <span title="Estimated cost">$${stats.totalCost.toFixed(4)}</span>
  `;
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// Collapsible code blocks
function setupCollapsibleCodeBlocks() {
    const codeBlocks = document.querySelectorAll('pre:not(.aph-processed)');

    codeBlocks.forEach(pre => {
        pre.classList.add('aph-processed');

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'aph-code-toggle';
        toggleBtn.textContent = '▼';
        toggleBtn.title = 'Collapse code';

        pre.style.position = 'relative';
        pre.insertBefore(toggleBtn, pre.firstChild);

        let collapsed = false;
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            collapsed = !collapsed;

            if (collapsed) {
                pre.style.maxHeight = '40px';
                pre.style.overflow = 'hidden';
                toggleBtn.textContent = '▶';
                toggleBtn.title = 'Expand code';
            } else {
                pre.style.maxHeight = 'none';
                pre.style.overflow = 'visible';
                toggleBtn.textContent = '▼';
                toggleBtn.title = 'Collapse code';
            }
        });
    });
}

function initStatsModule() {
    setupFetchInterceptor();
    setInterval(setupCollapsibleCodeBlocks, 2000);
}

window.PromptGlassStats = {
    init: initStatsModule,
    getStats: () => stats,
    updateDisplay: updateStatsDisplay
};

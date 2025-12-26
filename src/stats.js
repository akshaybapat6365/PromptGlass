// PromptGlass - Token Counter & Stats Module

// Stats tracking
let stats = {
    inputTokens: 0,
    outputTokens: 0,
    totalCost: 0,
    responseTime: 0,
    promptCount: 0,
    currentModel: 'unknown'
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
    'default': { input: 2.50, output: 10.00 } // Fallback to gpt-4o pricing
};

// Simple token estimation (approx 4 chars per token for English)
// More accurate would be tiktoken, but this is a reasonable estimate
function estimateTokens(text) {
    if (!text) return 0;
    // GPT tokenizer approximation: ~4 chars per token for English
    // Adjust for whitespace and punctuation
    return Math.ceil(text.length / 4);
}

// Detect model from request payload
function detectModel(payload) {
    try {
        if (payload.model) return payload.model;
        // ChatGPT web uses different field names
        if (payload.action === 'next') {
            // Default ChatGPT web model
            return 'gpt-4o';
        }
    } catch (e) { }
    return 'default';
}

// Calculate cost
function calculateCost(inputTokens, outputTokens, model) {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];
    const inputCost = (inputTokens / 1000000) * pricing.input;
    const outputCost = (outputTokens / 1000000) * pricing.output;
    return inputCost + outputCost;
}

// Intercept fetch to capture requests/responses
function setupFetchInterceptor() {
    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
        const [url, options] = args;
        const urlStr = typeof url === 'string' ? url : url.toString();

        // Only intercept ChatGPT/Gemini API calls
        const isRelevant = urlStr.includes('backend-api/conversation') ||
            urlStr.includes('generativelanguage.googleapis.com');

        if (!isRelevant) {
            return originalFetch.apply(this, args);
        }

        const startTime = Date.now();

        // Parse request body for input tokens
        try {
            if (options && options.body) {
                const payload = JSON.parse(options.body);

                // Extract prompt text
                let promptText = '';
                if (payload.messages) {
                    promptText = payload.messages.map(m => m.content?.parts?.[0] || m.content || '').join(' ');
                } else if (payload.prompt) {
                    promptText = payload.prompt;
                }

                const inputTokens = estimateTokens(promptText);
                stats.inputTokens += inputTokens;
                stats.currentModel = detectModel(payload);
                stats.promptCount++;

                console.log(`PromptGlass: Input ~${inputTokens} tokens`);
            }
        } catch (e) {
            // Ignore parsing errors
        }

        // Execute original fetch
        const response = await originalFetch.apply(this, args);

        // Clone response to read body
        const clonedResponse = response.clone();

        // Track response time
        stats.responseTime = Date.now() - startTime;

        // Try to count output tokens (streaming makes this tricky)
        try {
            const text = await clonedResponse.text();
            const outputTokens = estimateTokens(text);
            stats.outputTokens += outputTokens;

            // Calculate total cost
            stats.totalCost = calculateCost(stats.inputTokens, stats.outputTokens, stats.currentModel);

            console.log(`PromptGlass: Output ~${outputTokens} tokens, Response time: ${stats.responseTime}ms`);

            // Update UI
            updateStatsDisplay();
        } catch (e) {
            // Streaming response - harder to count
        }

        return response;
    };

    console.log('PromptGlass: Fetch interceptor active');
}

// Update the stats display in UI
function updateStatsDisplay() {
    const statsEl = document.getElementById('aph-stats');
    if (statsEl) {
        statsEl.innerHTML = `
      <span title="Input tokens">↑${formatNumber(stats.inputTokens)}</span>
      <span title="Output tokens">↓${formatNumber(stats.outputTokens)}</span>
      <span title="Estimated cost">$${stats.totalCost.toFixed(4)}</span>
    `;
    }
}

// Format large numbers
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// Collapsible code blocks
function setupCollapsibleCodeBlocks() {
    // Find all code blocks
    const codeBlocks = document.querySelectorAll('pre:not(.aph-processed)');

    codeBlocks.forEach(pre => {
        pre.classList.add('aph-processed');

        // Create collapse button
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'aph-code-toggle';
        toggleBtn.textContent = '▼';
        toggleBtn.title = 'Collapse code';

        // Insert before pre
        pre.style.position = 'relative';
        pre.insertBefore(toggleBtn, pre.firstChild);

        // Toggle functionality
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

// Initialize stats module
function initStatsModule() {
    setupFetchInterceptor();

    // Run collapsible code setup periodically (for dynamically loaded content)
    setInterval(setupCollapsibleCodeBlocks, 2000);
}

// Export for use in main content script
window.PromptGlassStats = {
    init: initStatsModule,
    getStats: () => stats,
    updateDisplay: updateStatsDisplay
};
